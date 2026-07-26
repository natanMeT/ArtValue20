import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createGalleryCommitGate, disposeGalleryItems,
  gatewayImagePromptOverflow, imagePromptTooLongMessage,
} from '../ImageStudio.jsx';
import { AI_GATEWAY_INPUT_LIMITS, validateAiGatewayInput } from '../../lib/aiGatewayInput.js';
import { withBrandPalette, brandPaletteInstruction } from '../../lib/brandPalette.js';

// ===================================================================
// S0F.1 review corrections — behavioral proof (real deferred, out-of-order
// promises; no source pinning for the logic itself).
//
// P1: a gallery read started for account A must never commit after the active
//     namespace moves to B, and a discarded batch must release its object URLs.
// P2: the palette block is appended to the prompt the Gateway will validate, so
//     the FINAL composed prompt is checked locally against the SAME limit the
//     server enforces — reject truthfully, never truncate, never alter a HEX.
// ===================================================================

const imageStudio = readFileSync(new URL('../ImageStudio.jsx', import.meta.url), 'utf8');

// A gallery store whose list() resolves only when the test says so.
function deferredStore(name) {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return {
    name,
    list: () => promise,
    settle: (items) => { resolve(items); return promise; },
  };
}
const itemsFor = (name, n = 2) =>
  Array.from({ length: n }, (_, i) => ({ id: `${name}_${i}`, url: `blob:${name}/${i}`, kind: 'image', meta: {} }));

// Minimal stand-in for the component's commit path (identical gate usage).
function makeReader(gate, onCommit, revoked) {
  return async (store) => {
    const mayCommit = gate.start(store);
    let items;
    try { items = await store.list(); } catch { return 'error'; }
    if (!mayCommit()) { disposeGalleryItems(items, (u) => revoked.push(u)); return 'discarded'; }
    onCommit(items);
    return 'committed';
  };
}

describe('P1 · account-switch gallery race', () => {
  it('a stale INITIAL load resolving after the switch is discarded, never rendered', async () => {
    const gate = createGalleryCommitGate();
    const committed = [];
    const revoked = [];
    const read = makeReader(gate, (i) => committed.push(i), revoked);

    const A = deferredStore('A');
    const B = deferredStore('B');

    gate.setActiveStore(A);
    const aRead = read(A);          // 1) A's request starts

    gate.setActiveStore(B);         // 2) account switches to B
    const bRead = read(B);
    await B.settle(itemsFor('B'));
    expect(await bRead).toBe('committed'); // 3) B's result commits

    await A.settle(itemsFor('A'));  // 4) A resolves AFTERWARDS
    expect(await aRead).toBe('discarded'); // 5) discarded, never rendered

    expect(committed.length).toBe(1);
    expect(committed[0].every((it) => it.id.startsWith('B_'))).toBe(true);
    expect(JSON.stringify(committed)).not.toContain('A_');
    expect(JSON.stringify(committed)).not.toContain('blob:A/');
  });

  it('a stale POST-GENERATION refresh is discarded too', async () => {
    const gate = createGalleryCommitGate();
    const committed = [];
    const revoked = [];
    const read = makeReader(gate, (i) => committed.push(i), revoked);

    const A = deferredStore('A');
    gate.setActiveStore(A);
    const refresh = read(A);        // post-generation refresh for A

    const B = deferredStore('B');
    gate.setActiveStore(B);         // switch mid-flight
    await A.settle(itemsFor('A'));
    expect(await refresh).toBe('discarded');
    expect(committed.length).toBe(0);
  });

  it('discarded batches release their object URLs (no leak), active ones are untouched', async () => {
    const gate = createGalleryCommitGate();
    const committed = [];
    const revoked = [];
    const read = makeReader(gate, (i) => committed.push(i), revoked);

    const A = deferredStore('A');
    gate.setActiveStore(A);
    const aRead = read(A);
    const B = deferredStore('B');
    gate.setActiveStore(B);
    const bRead = read(B);
    await B.settle(itemsFor('B'));
    await bRead;
    await A.settle(itemsFor('A'));
    await aRead;

    expect(revoked).toEqual(['blob:A/0', 'blob:A/1']); // only the discarded batch
    for (const u of revoked) expect(u.startsWith('blob:B/')).toBe(false);
    expect(committed[0].map((i) => i.url)).toEqual(['blob:B/0', 'blob:B/1']);
  });

  it('the CURRENT account\'s request still commits normally', async () => {
    const gate = createGalleryCommitGate();
    const committed = [];
    const read = makeReader(gate, (i) => committed.push(i), []);
    const A = deferredStore('A');
    gate.setActiveStore(A);
    const r = read(A);
    await A.settle(itemsFor('A', 3));
    expect(await r).toBe('committed');
    expect(committed[0].length).toBe(3);
  });

  it('A → B → A restores the correct scoped gallery each time', async () => {
    const gate = createGalleryCommitGate();
    const committed = [];
    const read = makeReader(gate, (i) => committed.push(i), []);

    const A1 = deferredStore('A'); gate.setActiveStore(A1);
    const r1 = read(A1); await A1.settle(itemsFor('A')); await r1;

    const B1 = deferredStore('B'); gate.setActiveStore(B1);
    const r2 = read(B1); await B1.settle(itemsFor('B')); await r2;

    const A2 = deferredStore('A'); gate.setActiveStore(A2);
    const r3 = read(A2); await A2.settle(itemsFor('A')); await r3;

    expect(committed.map((c) => c[0].id)).toEqual(['A_0', 'B_0', 'A_0']);
  });

  it('the gate never relies on promise ordering (generation AND store identity)', () => {
    const gate = createGalleryCommitGate();
    const A = deferredStore('A');
    gate.setActiveStore(A);
    const may = gate.start(A);
    expect(may()).toBe(true);
    gate.setActiveStore(A);          // same store, new generation → stale
    expect(may()).toBe(false);
  });

  it('disposeGalleryItems is safe on empty / malformed input', () => {
    expect(disposeGalleryItems(null, () => {})).toBe(0);
    expect(disposeGalleryItems([], () => {})).toBe(0);
    expect(disposeGalleryItems([{}, { url: '' }, null], () => {})).toBe(0);
  });
});

describe('P2 · palette-aware Gateway prompt limit', () => {
  const LIMIT = AI_GATEWAY_INPUT_LIMITS.MAX_IMAGE_PROMPT_CHARS;
  const PALETTE = { businessName: 'ב', brandPalette: { primary: '#112233', secondary: '#AABBCC' } };
  const block = brandPaletteInstruction(PALETTE);
  const fill = (n) => 'x'.repeat(n);

  it('uses the SAME canonical limit the server enforces (no forked constant)', () => {
    expect(typeof LIMIT).toBe('number');
    expect(LIMIT).toBe(2000);
    expect(imageStudio).toContain("import { AI_GATEWAY_INPUT_LIMITS } from '../lib/aiGatewayInput.js'");
    // …and that limit really is what studio.generate_image validates against
    expect(validateAiGatewayInput('studio.generate_image', { prompt: fill(LIMIT), aspectRatio: '1:1' }).ok).toBe(true);
    expect(validateAiGatewayInput('studio.generate_image', { prompt: fill(LIMIT + 1), aspectRatio: '1:1' }).ok).toBe(false);
  });

  it('a prompt EXACTLY at the limit with palette ON is accepted', () => {
    const userPrompt = fill(LIMIT - block.length - 2); // -2 = the "\n\n" joiner
    const composed = withBrandPalette(userPrompt, PALETTE, true);
    expect(composed.trim().length).toBe(LIMIT);
    expect(gatewayImagePromptOverflow(composed, { gatewayLane: true })).toBeNull();
    expect(validateAiGatewayInput('studio.generate_image', { prompt: composed, aspectRatio: '1:1' }).ok).toBe(true);
  });

  it('ONE character over the limit with palette ON is blocked truthfully', () => {
    const userPrompt = fill(LIMIT - block.length - 2 + 1);
    const composed = withBrandPalette(userPrompt, PALETTE, true);
    expect(composed.trim().length).toBe(LIMIT + 1);
    const over = gatewayImagePromptOverflow(composed, { gatewayLane: true });
    expect(over).toEqual({ length: LIMIT + 1, limit: LIMIT });
    // the server would indeed have rejected it → the local block is not over-eager
    expect(validateAiGatewayInput('studio.generate_image', { prompt: composed, aspectRatio: '1:1' }).ok).toBe(false);
  });

  it('the same prompt with palette OFF keeps the normal capacity', () => {
    const userPrompt = fill(LIMIT);
    expect(withBrandPalette(userPrompt, PALETTE, false)).toBe(userPrompt);
    expect(gatewayImagePromptOverflow(userPrompt, { gatewayLane: true })).toBeNull();
    expect(validateAiGatewayInput('studio.generate_image', { prompt: userPrompt, aspectRatio: '1:1' }).ok).toBe(true);
  });

  it('an absent / malformed palette keeps existing behavior', () => {
    const userPrompt = fill(LIMIT);
    expect(withBrandPalette(userPrompt, null, true)).toBe(userPrompt);
    expect(withBrandPalette(userPrompt, { brandPalette: { primary: '#aabbcc' } }, true)).toBe(userPrompt);
    expect(gatewayImagePromptOverflow(userPrompt, { gatewayLane: true })).toBeNull();
  });

  it('measures the TRIMMED length, exactly like the server field spec', () => {
    const composed = `   ${fill(LIMIT)}   `;
    expect(gatewayImagePromptOverflow(composed, { gatewayLane: true })).toBeNull();
  });

  it('local-only lanes are NOT subject to the Gateway limit', () => {
    expect(gatewayImagePromptOverflow(fill(LIMIT * 3), { gatewayLane: false })).toBeNull();
    expect(gatewayImagePromptOverflow(fill(LIMIT * 3), {})).toBeNull();
  });

  it('the error is specific, truthful and offers both levers — no silent truncation', () => {
    const msg = imagePromptTooLongMessage({ length: LIMIT + 50, limit: LIMIT }, true);
    expect(msg).toContain(String(LIMIT + 50));
    expect(msg).toContain(String(LIMIT));
    expect(msg).toContain('פלט'); // names the palette as a lever
    expect(msg).toContain('לא נשלחה בקשה ליצירה.');
    const noPalette = imagePromptTooLongMessage({ length: LIMIT + 1, limit: LIMIT }, false);
    expect(noPalette).not.toContain('פלטת המותג');
  });

  it('rejection happens BEFORE any request: zero Gateway calls, input preserved', () => {
    const run = imageStudio.slice(imageStudio.indexOf('const run = async () => {'), imageStudio.indexOf('// Consistent-character pack'));
    const guard = run.indexOf('if (overflow) { setError(');
    expect(guard).toBeGreaterThan(-1);
    // nothing that could reach an engine/Gateway may precede the guard
    for (const marker of ['setLoading(true)', 'markNextComfyJob', 'generateImage(p,', 'await ']) {
      expect(run.indexOf(marker), marker).toBeGreaterThan(guard);
    }
    expect(run).toContain('const overflow = gatewayImagePromptOverflow(p, { gatewayLane: usesGatewayImageLane });');
    // the guard returns without touching the prompt state (input preserved)
    expect(run).not.toMatch(/if \(overflow\)[\s\S]{0,120}setPrompt\(/);
    expect(imageStudio).not.toMatch(/\.slice\(0,\s*AI_GATEWAY_INPUT_LIMITS/); // no truncation anywhere
  });

  it('the approved HEX values are never altered by the limit check', () => {
    const composed = withBrandPalette('x', PALETTE, true);
    expect(composed).toContain('#112233');
    expect(composed).toContain('#AABBCC');
    gatewayImagePromptOverflow(composed, { gatewayLane: true });
    expect(composed).toContain('#112233'); // pure check, no mutation
    expect(composed).toContain('#AABBCC');
  });

  it('the studio.generate_image payload shape is unchanged', () => {
    expect(imageStudio).toContain('r = await generateImage(p, { model: selModel?.file, arch, width: asp.w, height: asp.h, hd: !isFluxModel && hd, aspect });');
    const r = validateAiGatewayInput('studio.generate_image', { prompt: 'ok', aspectRatio: '1:1' });
    expect(r.ok).toBe(true);
    expect(Object.keys(r.payload).sort()).toEqual(['aspectRatio', 'prompt']);
  });
});

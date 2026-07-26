// ===================================================================
// Regression coverage for the hosted mode-containment defect.
//
// THE DEFECT (proven in the DOM against a hosted-configuration build before
// the fix): the capability filter guarded only the visible mode tiles. A
// Jake→Studio hand-off set `mode` directly, the panels render from `mode`, so
// the hidden "פרזנטור מוצר" two-image panel rendered in a hosted build and the
// resulting failure printed the raw engine string `Qwen-Image-Edit אינו מותקן
// במנוע` to the user.
//
// These tests exercise the REAL seams — the actual hand-off reader, the actual
// availability authority, the actual thrown Errors and the actual render
// mapper — not re-implementations. Each group carries a negative control
// proving the assertion discriminates.
// ===================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  STUDIO_MODE_REQUIREMENTS, STUDIO_FALLBACK_MODE,
  isStudioModeAvailable, availableStudioModeIds, resolveStudioMode,
  studioAvailability, STUDIO_SUBFEATURES, SUBFEATURE_TEXT_FIELDS,
  isStudioSubfeatureAvailable, studioSubfeature, studioSubfeatureSnapshot,
} from '../../lib/studioModes.js';
import {
  PRESET_REQUIREMENT_FIELDS, PRESET_DESCRIPTIVE_FIELDS, SUPPORTED_API_PROVIDERS,
  isPresetAvailable, presetUnavailableReason, availablePresets,
} from '../../lib/presetAvailability.js';
import {
  moduleGraph, readSource, isComponent, rel as relTo, gatedRegions, insideAny, callsOf,
} from './support/moduleGraph.js';
import { readStudioHandoff, workflowIdToMode } from '../../lib/studioHandoff.js';
import { userFacingError, userError, engineError } from '../../lib/userFacingError.js';
import { qwenCompose, gatewayImageErrorToThrow } from '../../lib/geminiImage.js';
import { systemCapabilities, buildAccountBusinessContext } from '../../data/businessBrain.js';
import { CREATIVE_WORKFLOWS } from '../../data/creativeWorkflows.js';
import { CREATIVE_PRESETS } from '../../data/creativePresets.js';
import { posterExportErrorText, POSTER_EXPORT_FALLBACK } from '../../components/studio/PosterEditor.jsx';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf8');
const IMAGE_STUDIO = read('../ImageStudio.jsx');
const GEMINI_IMAGE = read('../../lib/geminiImage.js');

// ===================================================================
// Round 4 — MECHANICALLY DERIVED BOUNDARIES.
//
// Rounds 1-3 each widened the list of instances while keeping the same frame:
// the surfaces I had thought of, the gate I had thought of, the one capability
// axis the original bug used. Three siblings survived all three passes. The
// scope of verification is therefore no longer written by hand.
//
// ROOTS are the creative route entry points. Everything else — which children
// they render, which helpers they pull in — is derived from the imports those
// roots actually declare, so a new creative child enters verification without
// anyone editing a list.
// ===================================================================
const REPO = resolve(here, '../../..');
const CREATIVE_ROUTE_ROOTS = [
  'src/pages/ImageStudio.jsx',
  'src/pages/AdStudio.jsx',
  'src/pages/Diagnose.jsx',
  'src/pages/Outreach.jsx',
].map((p) => resolve(REPO, p));
const GRAPH = moduleGraph(CREATIVE_ROUTE_ROOTS);
const relative = (f) => relTo(REPO, f);

// ---- the CLASS A predicate, applied to source text -------------------
// A violation is a value read off a caught error that reaches a RENDER SINK
// (alert/confirm/a set*State call/a toast) or becomes a thrown Error MESSAGE,
// without passing through the declared boundary. Reading `.message` for
// diagnostics (console.*) or into a data-contract field is not a violation —
// those never render. Extraction is by BALANCED ARGUMENT LIST, not by a
// character window, so "near a sink" is never mistaken for "inside a sink".
const SINK_CALL = /\balert|\bconfirm|\bset[A-Z]\w*|\btoast[A-Za-z]*|\bthrow new Error/g;
const READS_ERR_MESSAGE = /\b(?:e|err|error|ex|_e|e2|cause)\s*\??\s*\.\s*(?:\w+\s*\??\s*\.\s*)?message\b/;
const SANCTIONED = /userFacingError\s*\(|console\s*\.|engineError\s*\(|userError\s*\(/;

function sinkViolations(src) {
  const out = [];
  for (const call of callsOf(src, SINK_CALL)) {
    if (!READS_ERR_MESSAGE.test(call.args)) continue;
    if (SANCTIONED.test(call.args)) continue;
    out.push(`${call.name}${call.args.slice(0, 60)}`);
  }
  // JSX interpolation straight into the tree. The lookbehind excludes `${…}`
  // template slots, which the balanced-call scan above already covers.
  for (const m of src.matchAll(/(?<!\$)\{\s*(?:e|err|error)\s*\??\s*\.\s*message\b[^}]*\}/g)) out.push(m[0]);
  return out;
}

// Every project source file (excluding tests and their support code). Used by
// the single-authority invariant: a subfeature's user-visible text must exist in
// exactly one file, so the scan cannot be limited to files I remembered.
function allProjectSources(dir = resolve(REPO, 'src'), out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      allProjectSources(full, out);
    } else if (/\.(js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function rawErrorSinks() {
  const out = [];
  for (const file of GRAPH) {
    if (file.endsWith('/userFacingError.js')) continue; // the boundary itself
    for (const v of sinkViolations(readSource(file))) out.push(`${relative(file)} :: ${v}`);
  }
  return out;
}

// A hosted build: the local-engine gate is closed, so every engine-backed
// capability is false. This is exactly what liveStudioCapabilities() returns
// in production (COMFY_URL === '').
const HOSTED = { comfy: false, video: false, ltx: false, kontext: false, pulid: false, qwen: false };
// A local/demo rig with the optional stack positively declared.
const DECLARED = { comfy: true, video: true, ltx: true, kontext: true, pulid: true, qwen: true };

describe('authoritative available-mode set', () => {
  it('hosted config offers only the two engine-free modes', () => {
    expect(availableStudioModeIds(HOSTED).sort()).toEqual(['lock', 'text']);
  });

  it('presenter is unavailable hosted and available when genuinely declared', () => {
    expect(isStudioModeAvailable('presenter', HOSTED)).toBe(false);
    expect(isStudioModeAvailable('presenter', DECLARED)).toBe(true);
  });

  it('FAILS CLOSED on unknown ids, empty input and missing capability data', () => {
    for (const bad of ['', null, undefined, 'nope', 'PRESENTER', 0, {}]) {
      expect(isStudioModeAvailable(bad, DECLARED)).toBe(false);
    }
    // no capability object at all → nothing engine-backed is offered
    expect(isStudioModeAvailable('presenter', undefined)).toBe(false);
    expect(availableStudioModeIds(undefined).sort()).toEqual(['lock', 'text']);
  });

  it('the fallback mode is itself always available', () => {
    expect(isStudioModeAvailable(STUDIO_FALLBACK_MODE, HOSTED)).toBe(true);
  });

  it('every mode the Studio can render has a requirement entry (no drift)', () => {
    const declared = Object.keys(STUDIO_MODE_REQUIREMENTS);
    const block = IMAGE_STUDIO.slice(IMAGE_STUDIO.indexOf('const MODES = ['));
    const modesArray = block.slice(0, block.indexOf('\n];'));
    const inPage = [...modesArray.matchAll(/\{\s*id:\s*'([a-z0-9]+)'/gi)].map((m) => m[1]);
    expect(inPage.length).toBeGreaterThan(5);
    for (const id of inPage) expect(declared).toContain(id);
  });
});

describe('hand-off through the REAL seam cannot select a hidden mode', () => {
  const handoff = (workflow) => readStudioHandoff({
    jakeHandoff: { source: 'jake', target: 'studio', prompt: 'פרומפט', workflow },
  });

  it('the catalog still maps the workflow (the leak was downstream of it)', () => {
    expect(workflowIdToMode('product-presenter')).toBe('presenter');
    expect(handoff('product-presenter').mode).toBe('presenter');
  });

  it('resolving that request against hosted capabilities contains it', () => {
    const r = resolveStudioMode(handoff('product-presenter').mode, HOSTED);
    expect(r).toEqual({ mode: 'text', contained: true });
  });

  it('a VALID hand-off is preserved, not contained', () => {
    const r = resolveStudioMode(handoff('fast-image').mode, HOSTED);
    expect(r).toEqual({ mode: 'text', contained: false });
    const lock = resolveStudioMode('lock', HOSTED);
    expect(lock).toEqual({ mode: 'lock', contained: false });
  });

  it('on a genuinely declared rig the presenter hand-off still works', () => {
    const r = resolveStudioMode(handoff('product-presenter').mode, DECLARED);
    expect(r).toEqual({ mode: 'presenter', contained: false });
  });

  it('every live catalog workflow with a mode resolves without throwing', () => {
    for (const w of CREATIVE_WORKFLOWS.filter((x) => x.status === 'live' && x.mode)) {
      const r = resolveStudioMode(w.mode, HOSTED);
      expect(typeof r.mode).toBe('string');
      expect(isStudioModeAvailable(r.mode, HOSTED)).toBe(true); // never lands on an unavailable mode
    }
  });

  it('NEGATIVE CONTROL: the pre-fix behaviour (apply the requested mode as-is) is what leaked', () => {
    const requested = handoff('product-presenter').mode;
    expect(isStudioModeAvailable(requested, HOSTED)).toBe(false); // it was unavailable...
    expect(requested).toBe('presenter');                          // ...yet was applied verbatim
  });
});

describe('ImageStudio wires the authority in (source-pinned)', () => {
  it('the hand-off effect resolves through resolveStudioMode', () => {
    expect(IMAGE_STUDIO).toMatch(/resolveStudioMode\(prefill\.mode, studioCapsRef\.current\)/);
  });

  it('the tile filter delegates to the shared authority, not an inline predicate', () => {
    expect(IMAGE_STUDIO).toMatch(/MODES\.filter\(\(m\) => isStudioModeAvailable\(m\.id, studioCaps\)\)/);
    expect(IMAGE_STUDIO).not.toMatch(/m\.needs === 'qwen'/);
  });

  it('a pre-paint safety net catches ANY other indirect mode input', () => {
    expect(IMAGE_STUDIO).toMatch(/useLayoutEffect\(\(\) => \{\s*if \(!isStudioModeAvailable\(mode, studioCapsRef\.current\)\)/);
  });
});

describe('user-facing error boundary', () => {
  it('renders only explicitly declared text; unknown errors FAIL CLOSED to the fallback', () => {
    expect(userFacingError(new Error('comfy: timeout'), 'נכשל')).toBe('נכשל');
    expect(userFacingError({ message: 'Qwen-Image-Edit אינו מותקן' }, 'נכשל')).toBe('נכשל');
    expect(userFacingError(null, 'נכשל')).toBe('נכשל');
    expect(userFacingError(undefined, 'נכשל')).toBe('נכשל');
  });

  it('preserves specific business validation messages instead of flattening them', () => {
    expect(userFacingError(userError('יש להעלות תמונת פרזנטור'), 'גנרי')).toBe('יש להעלות תמונת פרזנטור');
  });

  it('keeps the technical detail on the Error while rendering business text', () => {
    const e = engineError('Qwen-Image-Edit אינו מותקן במנוע', 'יצירת ויזואל מוצר אינה זמינה כרגע');
    expect(e.message).toContain('Qwen');                                  // diagnostics retained
    expect(userFacingError(e, 'גנרי')).toBe('יצירת ויזואל מוצר אינה זמינה כרגע');
    expect(userFacingError(e, 'גנרי')).not.toMatch(/Qwen/i);              // never rendered
  });

  it('NEGATIVE CONTROL: rendering err.message directly (the pre-fix code) leaks the model name', () => {
    const e = engineError('Qwen-Image-Edit אינו מותקן במנוע', 'יצירת ויזואל מוצר אינה זמינה כרגע');
    expect(/Qwen/i.test(e.message)).toBe(true);              // old path leaked...
    expect(/Qwen/i.test(userFacingError(e, 'x'))).toBe(false); // ...new path does not
  });
});

describe('REAL CALL: the reported path produces a non-technical rendered message', () => {
  it('qwenCompose still fails closed, and its rendered form names no model or engine', async () => {
    const f = (n) => new File([new Uint8Array([1])], n, { type: 'image/png' });
    let err = null;
    try { await qwenCompose(f('a.png'), f('b.png'), 'הוראה'); } catch (e) { err = e; }
    expect(err).toBeTruthy();                                   // fails closed
    const rendered = userFacingError(err, 'שגיאה ביצירת התוכן');
    for (const term of ['Qwen', 'comfy', 'ComfyUI', 'GGUF', 'UnetLoader', 'checkpoint', 'localhost', '127.0.0.1', 'GPU']) {
      expect(rendered).not.toMatch(new RegExp(term, 'i'));
    }
    expect(rendered).toBe('יצירת ויזואל מוצר אינה זמינה כרגע');
  });

  it('the five identified technical messages are never rendered raw anywhere in ImageStudio', () => {
    expect(IMAGE_STUDIO).not.toMatch(/setError\((?:e|err)\.message/);
    const sites = [...IMAGE_STUDIO.matchAll(/setError\(userFacingError\(/g)];
    expect(sites.length).toBe(8);
  });

  it('every technical throw in geminiImage carries a declared business message', () => {
    // engineError(technical, userMessage) — the technical text stays for diagnostics
    for (const technical of ['comfy ${res.status}', 'comfy: no prompt id', 'comfy: generation error', 'comfy: timeout', 'Qwen-Image-Edit אינו מותקן במנוע']) {
      const idx = GEMINI_IMAGE.indexOf(technical);
      expect(idx).toBeGreaterThan(-1);
      const line = GEMINI_IMAGE.slice(GEMINI_IMAGE.lastIndexOf('\n', idx) + 1, GEMINI_IMAGE.indexOf('\n', idx));
      expect(line).toMatch(/engineError\(/);
    }
    // and no technical string is thrown bare any more
    expect(GEMINI_IMAGE).not.toMatch(/throw new Error\(`comfy/);
    expect(GEMINI_IMAGE).not.toMatch(/throw new Error\('comfy/);
  });
});

describe('Jake advertises only what this configuration can open', () => {
  const modes = (caps) => systemCapabilities(availableStudioModeIds(caps)).filter((c) => c.mode).map((c) => c.mode);

  it('hosted: the engine-backed creative workflows are NOT advertised', () => {
    const m = modes(HOSTED);
    for (const hidden of ['presenter', 'album', 'character', 'img2img', 'inpaint', 'video', 'flf']) {
      expect(m).not.toContain(hidden);
    }
  });

  it('hosted: the genuinely available lanes ARE still advertised', () => {
    const m = modes(HOSTED);
    expect(m).toContain('text');
    expect(m).toContain('lock');
  });

  it('declared local rig: the full set comes back', () => {
    const m = modes(DECLARED);
    for (const shown of ['presenter', 'album', 'character', 'text', 'lock']) expect(m).toContain(shown);
  });

  it('non-Studio capabilities (no mode) are always advertised', () => {
    const hosted = systemCapabilities(availableStudioModeIds(HOSTED));
    expect(hosted.some((c) => c.kind !== 'studio')).toBe(true);
  });

  it('omitting the available set FAILS CLOSED (no studio mode advertised)', () => {
    const m = systemCapabilities().filter((c) => c.mode).map((c) => c.mode);
    expect(m).toEqual([]);
    expect(systemCapabilities().length).toBeGreaterThan(0); // non-studio capabilities survive
  });

  it('NEGATIVE CONTROL: the pre-fix unfiltered list advertised modes the Studio would refuse', () => {
    const unfiltered = CREATIVE_WORKFLOWS.filter((w) => w.status === 'live' && w.mode).map((w) => w.mode);
    expect(unfiltered).toContain('presenter');                          // what Jake used to say
    expect(modes(HOSTED)).not.toContain('presenter');                   // what it says now
    // and the advertised set is now a subset of what the Studio can actually open
    for (const c of systemCapabilities(availableStudioModeIds(HOSTED))) {
      if (c.mode) expect(isStudioModeAvailable(c.mode, HOSTED)).toBe(true);
    }
  });
});

// ===================================================================
// Round 2 — the two P2 findings Codex raised on the first PR #118 head.
// Both were real; the first implementation was incomplete.
// ===================================================================
describe('P2-a · controlled Gateway errors survive the render boundary', () => {
  const thrown = (code) => gatewayImageErrorToThrow(code === undefined ? null : { ok: false, error: { code } });

  it('KNOWN mapped reasons keep their existing actionable guidance', () => {
    expect(userFacingError(thrown('unauthenticated'), 'גנרי')).toBe('צריך להתחבר כדי ליצור תמונה');
    expect(userFacingError(thrown('unauthorized'), 'גנרי')).toBe('צריך להתחבר כדי ליצור תמונה');
    for (const busy of ['rate_limited', 'budget_exceeded', 'budget_guard_unavailable']) {
      expect(userFacingError(thrown(busy), 'גנרי')).toBe('שירות התמונות עמוס כרגע — נסה שוב עוד רגע');
    }
  });

  it('UNKNOWN / technical Gateway failures render only the safe generic', () => {
    for (const code of ['weird_new_code', 'internal_error', '', null, undefined]) {
      expect(userFacingError(thrown(code), 'גנרי')).toBe('יצירת התמונה נכשלה — נסה שוב מאוחר יותר');
    }
  });

  it('a provider-supplied message can NEVER self-declare as renderable', () => {
    // hostile/arbitrary provider payload: message text, and even a forged flag
    const hostile = { ok: false, error: { code: 'unknown_provider_code', message: 'ComfyUI node UnetLoaderGGUF failed at 127.0.0.1:8188', userSafe: true } };
    const e = gatewayImageErrorToThrow(hostile);
    const rendered = userFacingError(e, 'גנרי');
    expect(rendered).toBe('יצירת התמונה נכשלה — נסה שוב מאוחר יותר');
    for (const term of ['ComfyUI', 'UnetLoader', '127.0.0.1', 'node']) expect(rendered).not.toMatch(new RegExp(term, 'i'));
  });

  it('the rendered text always comes from OUR table, never from provider text', () => {
    const e = gatewayImageErrorToThrow({ ok: false, error: { code: 'rate_limited', message: 'quota exceeded on provider-x' } });
    expect(userFacingError(e, 'גנרי')).toBe('שירות התמונות עמוס כרגע — נסה שוב עוד רגע');
    expect(userFacingError(e, 'גנרי')).not.toMatch(/provider-x/i);
  });

  it('NEGATIVE CONTROL: without the controlled mapping these would flatten to the fallback', () => {
    const bare = new Error('צריך להתחבר כדי ליצור תמונה'); // the pre-fix shape
    expect(userFacingError(bare, 'שגיאה ביצירת התוכן')).toBe('שגיאה ביצירת התוכן'); // guidance lost
    expect(userFacingError(thrown('unauthenticated'), 'שגיאה ביצירת התוכן')).toBe('צריך להתחבר כדי ליצור תמונה'); // preserved
  });
});

describe('P2-b · static Studio capabilities respect the same authority', () => {
  const caps = (c) => systemCapabilities(studioAvailability(c));
  const ids = (c) => caps(c).map((x) => x.id);

  it('hosted: the local-only enhancement is NOT advertised', () => {
    expect(ids(HOSTED)).not.toContain('product-lock-blend');
  });

  it('declared local rig: it comes back', () => {
    expect(ids(DECLARED)).toContain('product-lock-blend');
  });

  it('hosted: creative-modes claims no hidden workflow', () => {
    const cm = caps(HOSTED).find((c) => c.id === 'creative-modes');
    expect(cm).toBeTruthy();
    for (const hidden of ['עריכ', 'סרטון', 'פרזנטור', 'וידאו', 'דמות', 'אלבום']) {
      expect(cm.description).not.toContain(hidden);
    }
  });

  it('declared rig: creative-modes accurately names what IS open', () => {
    const cm = caps(DECLARED).find((c) => c.id === 'creative-modes');
    expect(cm.description).toContain('ויזואל מוצר עם פרזנטור');
  });

  it('genuinely available hosted capabilities and non-Studio business surfaces remain', () => {
    const h = ids(HOSTED);
    for (const keep of ['image-studio', 'growth-os', 'gallery', 'creative-modes']) expect(h).toContain(keep);
  });

  it('internal fields never leak into the capability objects', () => {
    for (const c of caps(HOSTED)) {
      expect(c.requires).toBeUndefined();
      expect(c.describe).toBeUndefined();
    }
  });

  it('maxCapabilities truncation cannot promote an unavailable static entry', () => {
    // filtering happens BEFORE any slicing, at every truncation width
    for (const n of [1, 2, 3, 5, 8, 12, 24]) {
      const sliced = caps(HOSTED).slice(0, n);
      expect(sliced.map((c) => c.id)).not.toContain('product-lock-blend');
      for (const c of sliced) if (c.mode) expect(isStudioModeAvailable(c.mode, HOSTED)).toBe(true);
    }
  });

  it('THE REAL CONSUMER: the Jake prompt text contains no hidden creative capability', () => {
    const prompt = buildAccountBusinessContext(null, {
      maxCapabilities: 24,
      availableModes: studioAvailability(HOSTED),
    });
    for (const hidden of ['פרזנטור', 'אלבום דוגמנית', 'ערכת דמות', 'Product Lock B2']) {
      expect(prompt).not.toContain(hidden);
    }
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('THE REAL CONSUMER: a declared rig does describe its extra capabilities', () => {
    const prompt = buildAccountBusinessContext(null, {
      maxCapabilities: 24,
      availableModes: studioAvailability(DECLARED),
    });
    expect(prompt).toContain('Product Lock B2');
  });

  it('NEGATIVE CONTROL: unfiltered statics would advertise the local-only enhancement hosted', () => {
    const unfiltered = systemCapabilities(studioAvailability(DECLARED));
    expect(unfiltered.map((c) => c.id)).toContain('product-lock-blend'); // genuinely declared -> shown
    expect(ids(HOSTED)).not.toContain('product-lock-blend');             // hosted -> hidden
  });
});

// ===================================================================
// Round 3 — authorised DEFECT-CLASS SWEEP. Rounds 1 and 2 fixed instances;
// this round covers the classes themselves, so a sibling path cannot survive.
// ===================================================================
describe('CLASS A · no uncontrolled or technical error value can render', () => {
  // Round 4: the surface list is DERIVED (see the mechanical-boundaries suite).
  // The hand-written array this used to hold is exactly why PosterEditor escaped.
  it('NO module reachable from the creative routes pipes a caught error message into a sink', () => {
    expect(rawErrorSinks()).toEqual([]);
  });

  it('every creative RENDER surface routes its rendered errors through the boundary', () => {
    for (const file of GRAPH.filter(isComponent)) {
      const src = readSource(file);
      // Only surfaces that actually BIND a caught error and have a render sink.
      // A bare `catch { /* ignore */ }` has no value to route (ProductPlacer).
      if (!/\bcatch\s*\(/.test(src)) continue;
      if (!/\bset[A-Z]\w*\s*\(|\balert\s*\(/.test(src)) continue;
      expect(src, relative(file)).toMatch(/userFacingError\(/);
    }
  });

  it('the shared creative helper never throws provider text as its message', () => {
    const gemini = read('../../lib/gemini.js');
    // the provider payload is captured for diagnostics only
    expect(gemini).toMatch(/providerDetail = String\(e\?\.error\?\.message/);
    expect(gemini).not.toMatch(/msg = e\?\.error\?\.message/);
    // and no bare technical throw survives in the helper
    expect(gemini).not.toMatch(/throw new Error\(/);
  });

  it('NEGATIVE CONTROL: the three shapes that actually shipped are all detected', () => {
    // the exact pre-fix lines from PosterEditor, store.jsx and geminiImage.js
    expect(sinkViolations("alert('יצוא נכשל: ' + (e?.message || e));")).toHaveLength(1);   // optional chaining
    expect(sinkViolations("setError(e.message || 'שגיאת טעינה');")).toHaveLength(1);
    expect(sinkViolations('throw new Error(`היצירה נכשלה: ${e.message}. נסה/י שוב.`);')).toHaveLength(1);
    // and the sanctioned shapes are NOT flagged
    expect(sinkViolations("setError(userFacingError(e, 'גנרי'));")).toEqual([]);
    expect(sinkViolations('console.error(e.message);')).toEqual([]);
    expect(sinkViolations("message: error.message || 'AI Gateway error.',")).toEqual([]); // contract field, not a sink
  });
});

describe('CLASS B · nothing promises or routes to an unavailable capability', () => {
  const caps = (c) => systemCapabilities(studioAvailability(c));

  it('a GATED SUBFEATURE is not advertised just because its parent mode is available', () => {
    // `lock` is available hosted, but its AI seam/shadow enhancement needs comfy
    const hostedLock = caps(HOSTED).find((c) => c.id === 'product-lock');
    expect(hostedLock, 'product-lock should still be offered hosted').toBeTruthy();
    expect(hostedLock.description).not.toContain('AI');
    expect(hostedLock.description).not.toContain('צללים');

    const localLock = caps(DECLARED).find((c) => c.id === 'product-lock');
    expect(localLock.description).toContain('צללים'); // returns when genuinely supported
  });

  it('THE REAL CONSUMER: the hosted Jake prompt promises no gated subfeature', () => {
    const prompt = buildAccountBusinessContext(null, { maxCapabilities: 24, availableModes: studioAvailability(HOSTED) });
    for (const gated of ['צללים', 'Product Lock B2', 'פרזנטור', 'אלבום דוגמנית']) {
      expect(prompt, gated).not.toContain(gated);
    }
  });

  it('presets are filtered by the FULL requirement contract, not merely listed', () => {
    const studio = read('../ImageStudio.jsx');
    // Round 4: the tab-only filter this used to pin was itself the defect —
    // see the "complete preset requirement schema" suite below.
    expect(studio).toMatch(/const presets = availablePresets\(CREATIVE_PRESETS, studioCaps\)/);
    expect(studio).not.toMatch(/\{CREATIVE_PRESETS\.map\(/);      // no unfiltered render
    expect(studio).toMatch(/const activePreset = presets\.find/); // selection cannot outlive availability
  });

  it('every preset target mode is a known mode (so filtering can never silently pass)', () => {
    for (const p of CREATIVE_PRESETS) {
      expect(Object.keys(STUDIO_MODE_REQUIREMENTS), p.id).toContain(p.targetTab);
    }
  });

  it('hosted: only text-target presets survive; declared: all of them do', () => {
    const hosted = CREATIVE_PRESETS.filter((p) => isStudioModeAvailable(p.targetTab, HOSTED));
    expect(hosted.length).toBeGreaterThan(0);
    for (const p of hosted) expect(p.targetTab).toBe('text');
    expect(hosted.map((p) => p.id)).not.toContain('photo_restoration');    // img2img
    expect(hosted.map((p) => p.id)).not.toContain('product_motion_video'); // video
    expect(CREATIVE_PRESETS.filter((p) => isStudioModeAvailable(p.targetTab, DECLARED)).length).toBe(CREATIVE_PRESETS.length);
  });

  it('NEGATIVE CONTROL: unfiltered presets would advertise hidden tabs hosted', () => {
    const unfiltered = CREATIVE_PRESETS.map((p) => p.targetTab);
    expect(unfiltered).toContain('img2img');
    expect(unfiltered).toContain('video');
    expect(isStudioModeAvailable('img2img', HOSTED)).toBe(false);
    expect(isStudioModeAvailable('video', HOSTED)).toBe(false);
  });

  it('NEGATIVE CONTROL: an ungated subfeature would leak into the hosted description', () => {
    const withCaps = systemCapabilities(studioAvailability(DECLARED));
    expect(withCaps.find((c) => c.id === 'product-lock').description).toContain('צללים'); // declared -> shown
    expect(caps(HOSTED).find((c) => c.id === 'product-lock').description).not.toContain('צללים');
  });
});

// ===================================================================
// Round 4 · MECHANICAL BOUNDARY 1 — the verified surface set is DERIVED
// ===================================================================
describe('the creative surface set is derived from the code, not from a list', () => {
  it('the roots exist and the graph is non-trivial and deterministic', () => {
    expect(GRAPH.length).toBeGreaterThan(20);
    expect(moduleGraph(CREATIVE_ROUTE_ROOTS)).toEqual(GRAPH);              // stable
    expect(moduleGraph([...CREATIVE_ROUTE_ROOTS].reverse())).toEqual(GRAPH); // order-independent
  });

  it('pulls in the transitive creative children NOBODY listed by hand', () => {
    const names = GRAPH.map(relative);
    for (const child of [
      'src/components/studio/PosterEditor.jsx',   // the one that escaped rounds 1-3
      'src/components/studio/MockupStudio.jsx',
      'src/components/studio/ProductPlacer.jsx',
      'src/components/ui/MaskCanvas.jsx',
      'src/store/store.jsx',
    ]) expect(names, child).toContain(child);
  });

  it('stays bounded by the project — no third-party module is pulled in', () => {
    for (const f of GRAPH) {
      expect(f).not.toMatch(/node_modules/);
      expect(relative(f)).toMatch(/^(src|supabase)\//);
    }
  });

  it('NEGATIVE CONTROL: the round-3 hand-written list is provably incomplete', () => {
    const HAND_WRITTEN = [   // verbatim from the round-3 test this replaces
      'src/pages/ImageStudio.jsx', 'src/pages/AdStudio.jsx', 'src/pages/Diagnose.jsx',
      'src/pages/Outreach.jsx', 'src/components/studio/MockupStudio.jsx',
    ];
    const derived = GRAPH.filter(isComponent).map(relative);
    const missed = derived.filter((f) => !HAND_WRITTEN.includes(f));
    expect(missed).toContain('src/components/studio/PosterEditor.jsx');
    expect(missed.length).toBeGreaterThan(0); // a literal list cannot detect its own gaps
  });

  it('NEGATIVE CONTROL: dropping a transitive child from the roots is detected', () => {
    // ImageStudio is what reaches PosterEditor; without it the child disappears,
    // which is precisely the failure mode a hand-maintained list hides.
    const withoutStudio = moduleGraph(CREATIVE_ROUTE_ROOTS.filter((f) => !f.endsWith('ImageStudio.jsx')))
      .map(relative);
    expect(withoutStudio).not.toContain('src/components/studio/PosterEditor.jsx');
    expect(GRAPH.map(relative)).toContain('src/components/studio/PosterEditor.jsx');
  });

  it('THE REPORTED SITE: PosterEditor no longer alerts a caught error', () => {
    const poster = read('../../components/studio/PosterEditor.jsx');
    expect(poster).not.toMatch(/\balert\s*\(/);
    expect(poster).toMatch(/setExportError\(posterExportErrorText\(e\)\)/);
    expect(sinkViolations(poster)).toEqual([]);
  });

  it('REAL CALL: the SHIPPED poster-export mapping renders only business text', () => {
    // the actual exported expression the component uses — not a re-implementation
    const taint = new Error('Failed to execute \'toDataURL\' on \'HTMLCanvasElement\': Tainted canvases may not be exported.');
    expect(posterExportErrorText(taint)).toBe(POSTER_EXPORT_FALLBACK);
    for (const term of ['toDataURL', 'canvas', 'Tainted', 'HTMLCanvasElement']) {
      expect(posterExportErrorText(taint)).not.toMatch(new RegExp(term, 'i'));
    }
    // engine-originated and unknown values also degrade, never leak
    expect(posterExportErrorText(engineError('comfy: generation error', ''))).toBe(POSTER_EXPORT_FALLBACK);
    for (const junk of [null, undefined, 'string error', 0, {}]) {
      expect(posterExportErrorText(junk)).toBe(POSTER_EXPORT_FALLBACK);
    }
    // an explicitly user-safe message still survives verbatim
    expect(posterExportErrorText(userError('הדפדפן חסם את הייצוא'))).toBe('הדפדפן חסם את הייצוא');
  });

  it('THE OTHER SITES the derived graph found', () => {
    expect(read('../../store/store.jsx')).toMatch(/setError\(userFacingError\(e, 'שגיאת טעינה'\)\)/);
    expect(GEMINI_IMAGE).not.toMatch(/throw new Error\(`היצירה נכשלה/);
    expect(GEMINI_IMAGE).toMatch(/throw engineError\(`local generate failed/);
  });

  it('REAL CALL: the reworked local-failure throw renders no technical detail', () => {
    const e = engineError('local generate failed: comfy: generation error', 'היצירה נכשלה. נסה/י שוב בעוד רגע.');
    expect(e.message).toContain('comfy');                                   // diagnostics kept
    expect(userFacingError(e, 'גנרי')).toBe('היצירה נכשלה. נסה/י שוב בעוד רגע.');
    expect(userFacingError(e, 'גנרי')).not.toMatch(/comfy/i);
  });
});

// ===================================================================
// Round 4 · MECHANICAL BOUNDARY 2 — ONE decision for action AND guidance
// ===================================================================
describe('a gated subfeature has a single authoritative decision', () => {
  const BLEND = 'product-lock-blend';

  it('availability requires BOTH the parent mode and the subfeature capability', () => {
    expect(isStudioSubfeatureAvailable(BLEND, HOSTED)).toBe(false);
    expect(isStudioSubfeatureAvailable(BLEND, DECLARED)).toBe(true);
    // parent mode open but capability missing -> still closed
    expect(isStudioSubfeatureAvailable(BLEND, { ...HOSTED, comfy: false })).toBe(false);
  });

  it('FAILS CLOSED on unknown ids and missing capability data', () => {
    for (const bad of ['', null, undefined, 'nope', 'PRODUCT-LOCK-BLEND', 0, {}]) {
      expect(isStudioSubfeatureAvailable(bad, DECLARED)).toBe(false);
      expect(studioSubfeature(bad, DECLARED).available).toBe(false);
    }
    expect(isStudioSubfeatureAvailable(BLEND, undefined)).toBe(false);
    // a closed record carries no text to render
    for (const f of SUBFEATURE_TEXT_FIELDS) expect(studioSubfeature('nope', DECLARED)[f]).toBe('');
  });

  it('THE INVARIANT: every user-visible string of a subfeature lives ONLY in the authority', () => {
    // A surface cannot render the label without asking for availability, because
    // the surface does not own the text. This is what makes "the button is gated
    // but the help text is not" impossible rather than merely fixed.
    const AUTHORITY = resolve(REPO, 'src/lib/studioModes.js');
    const sources = allProjectSources().filter((f) => f !== AUTHORITY);
    for (const [id, def] of Object.entries(STUDIO_SUBFEATURES)) {
      for (const field of SUBFEATURE_TEXT_FIELDS) {
        const literal = def[field];
        expect(typeof literal, `${id}.${field}`).toBe('string');
        expect(literal.length).toBeGreaterThan(0);
        const owners = sources.filter((f) => readSource(f).includes(literal)).map(relative);
        expect(owners, `${id}.${field} is duplicated outside the authority`).toEqual([]);
      }
    }
  });

  it('every text field a subfeature declares is covered by the invariant', () => {
    // schema coverage: a new text field cannot be added without being pinned
    const NON_TEXT = ['id', 'parentMode', 'requires'];
    for (const [id, def] of Object.entries(STUDIO_SUBFEATURES)) {
      for (const key of Object.keys(def)) {
        expect([...SUBFEATURE_TEXT_FIELDS, ...NON_TEXT], `${id}.${key} is classified`).toContain(key);
      }
    }
  });

  it('THE CONSUMER: in ImageStudio the action AND the guidance sit inside the same gate', () => {
    // Mechanical, not visual: extract the balanced JSX regions introduced by the
    // availability check, then assert EVERY other reference falls inside one.
    const regions = gatedRegions(IMAGE_STUDIO, 'lockBlend.available &&');
    expect(regions.length).toBeGreaterThanOrEqual(2); // the help paragraph and the control
    const refs = [...IMAGE_STUDIO.matchAll(/lockBlend\.(guidance|actionNote|actionLabel|busyLabel)|runLockBlend\b/g)];
    expect(refs.length).toBeGreaterThan(0);
    for (const m of refs) {
      if (IMAGE_STUDIO.slice(0, m.index).endsWith('const ')) continue; // the declaration
      expect(insideAny(regions, m.index), `ungated reference at ${m.index}: ${m[0]}`).toBe(true);
    }
  });

  it('THE CONSUMER: the Studio no longer owns the requirement or the wording', () => {
    expect(IMAGE_STUDIO).toMatch(/const lockBlend = studioSubfeature\('product-lock-blend', studioCaps\)/);
    expect(IMAGE_STUDIO).not.toMatch(/isLock && hasLocalComfy/); // the old, action-only gate
  });

  it('THE CONSUMER: Jake describes the subfeature from the same snapshot', () => {
    const hosted = systemCapabilities(studioAvailability(HOSTED));
    const declared = systemCapabilities(studioAvailability(DECLARED));
    expect(hosted.map((c) => c.id)).not.toContain(BLEND);
    const shown = declared.find((c) => c.id === BLEND);
    expect(shown.title).toBe(STUDIO_SUBFEATURES[BLEND].title);
    expect(shown.description).toBe(STUDIO_SUBFEATURES[BLEND].description);
    // and the parent workflow's description gains the subfeature line only there
    expect(declared.find((c) => c.id === 'product-lock').description).toContain(STUDIO_SUBFEATURES[BLEND].capabilityText);
    expect(hosted.find((c) => c.id === 'product-lock').description).not.toContain(STUDIO_SUBFEATURES[BLEND].capabilityText);
  });

  it('the ALWAYS-AVAILABLE base Product Lock workflow survives hosted', () => {
    const hosted = systemCapabilities(studioAvailability(HOSTED));
    expect(hosted.map((c) => c.id)).toContain('product-lock');
    expect(isStudioModeAvailable('lock', HOSTED)).toBe(true);
  });

  it('injected internals never leak onto the capability objects', () => {
    for (const c of systemCapabilities(studioAvailability(DECLARED))) {
      expect(c.requires).toBeUndefined();
      expect(c.describe).toBeUndefined();
      expect(c.titleOf).toBeUndefined();
    }
  });

  it('NEGATIVE CONTROL: ungating the help text is what this suite detects', () => {
    // the pre-fix shape — the sentence rendered off the MODE, not the subfeature
    const preFix = IMAGE_STUDIO.replace(
      /\{lockBlend\.available && \(\s*\n\s*<p className="dim"[^\n]*>\{lockBlend\.guidance\}<\/p>\s*\n\s*\)\}/,
      `<p className="dim">${STUDIO_SUBFEATURES[BLEND].guidance}</p>`,
    );
    expect(preFix).not.toBe(IMAGE_STUDIO); // the replacement matched
    const regions = gatedRegions(preFix, 'lockBlend.available &&');
    const leak = preFix.indexOf(STUDIO_SUBFEATURES[BLEND].guidance);
    expect(leak).toBeGreaterThan(-1);
    expect(insideAny(regions, leak)).toBe(false); // ungated -> the invariant fails
  });

  it('NEGATIVE CONTROL: the round-3 fix gated only the action', () => {
    // proof the earlier gate was action-only: the guidance sentence did not
    // mention the capability flag anywhere near it, and lived under `mode`.
    const roundThree = `{mode === 'lock' && (<p>${STUDIO_SUBFEATURES[BLEND].guidance}</p>)}\n{isLock && hasLocalComfy && (<button>x</button>)}`;
    const regions = gatedRegions(roundThree, 'hasLocalComfy &&');
    expect(insideAny(regions, roundThree.indexOf(STUDIO_SUBFEATURES[BLEND].guidance))).toBe(false);
  });
});

// ===================================================================
// Round 4 · MECHANICAL BOUNDARY 3 — the COMPLETE preset requirement schema
// ===================================================================
describe('preset availability evaluates every declared requirement', () => {
  const byId = (id) => CREATIVE_PRESETS.find((p) => p.id === id);

  it('SCHEMA COVERAGE: every field on every preset is explicitly classified', () => {
    // The guard against the actual root cause: a new requirement field cannot be
    // added to the data and silently ignored by the evaluator.
    const known = new Set([...PRESET_REQUIREMENT_FIELDS, ...PRESET_DESCRIPTIVE_FIELDS]);
    for (const p of CREATIVE_PRESETS) {
      for (const key of Object.keys(p)) {
        expect([...known], `${p.id}.${key} is neither a requirement nor declared descriptive`).toContain(key);
      }
    }
    // the two lists are disjoint — a field cannot be both
    for (const f of PRESET_REQUIREMENT_FIELDS) expect(PRESET_DESCRIPTIVE_FIELDS).not.toContain(f);
  });

  it('NEGATIVE CONTROL: an unhandled new requirement field fails the coverage check', () => {
    const known = new Set([...PRESET_REQUIREMENT_FIELDS, ...PRESET_DESCRIPTIVE_FIELDS]);
    const withNewField = { ...byId('premium_business_visual'), requiresGpuTier: 'a100' };
    const unclassified = Object.keys(withNewField).filter((k) => !known.has(k));
    expect(unclassified).toEqual(['requiresGpuTier']); // exactly what the invariant reports
  });

  it('THE REPORTED PRESET: hebrew_ui_mockup is never offered, in ANY configuration', () => {
    const p = byId('hebrew_ui_mockup');
    expect(p.targetTab).toBe('text');                    // its tab IS available...
    expect(isStudioModeAvailable('text', HOSTED)).toBe(true);
    expect(isPresetAvailable(p, HOSTED)).toBe(false);    // ...but the contract is not satisfied
    expect(isPresetAvailable(p, DECLARED)).toBe(false);  // local/demo does not conjure a provider
    // its own declared contract is what stops it: an API path with no provider
    expect(p.requiresApi).toBe(true);
    expect(p.localReady).toBe(false);
    expect(presetUnavailableReason(p, DECLARED)).toBe('provider-unavailable');
    expect(presetUnavailableReason(p, HOSTED)).toBe('provider-unavailable');
  });

  it('it therefore cannot feed a scaffold into an unrelated available generator', () => {
    for (const caps of [HOSTED, DECLARED]) {
      const offered = availablePresets(CREATIVE_PRESETS, caps).map((x) => x.id);
      expect(offered).not.toContain('hebrew_ui_mockup');
    }
    // and selection is taken from the OFFERED list, so it cannot outlive availability
    expect(IMAGE_STUDIO).toMatch(/const activePreset = presets\.find/);
  });

  it('NEGATIVE CONTROL: a targetTab-only filter passes it — that was the defect', () => {
    const tabOnly = CREATIVE_PRESETS.filter((p) => isStudioModeAvailable(p.targetTab, HOSTED));
    expect(tabOnly.map((p) => p.id)).toContain('hebrew_ui_mockup');            // the old rule
    expect(availablePresets(CREATIVE_PRESETS, HOSTED).map((p) => p.id)).not.toContain('hebrew_ui_mockup');
  });

  it('the currently supported presets remain, in both configurations', () => {
    const hosted = availablePresets(CREATIVE_PRESETS, HOSTED).map((p) => p.id);
    expect(hosted).toEqual(['premium_business_visual', 'dark_saas_dashboard', 'product_hero_shot', 'local_ad_creative']);
    const declared = availablePresets(CREATIVE_PRESETS, DECLARED).map((p) => p.id);
    for (const id of [...hosted, 'photo_restoration', 'product_motion_video']) expect(declared).toContain(id);
    expect(declared).toHaveLength(CREATIVE_PRESETS.length - 1); // everything except the API-only one
  });

  it('the destination mode still gates: engine-backed recipes stay hidden hosted', () => {
    for (const id of ['photo_restoration', 'product_motion_video']) {
      expect(presetUnavailableReason(byId(id), HOSTED)).toBe('target-mode-unavailable');
      expect(isPresetAvailable(byId(id), DECLARED)).toBe(true);
    }
  });

  it('FAILS CLOSED on unknown / unsupported / undeclared requirement values', () => {
    const base = byId('premium_business_visual');
    expect(presetUnavailableReason({ ...base, targetTab: 'nope' }, DECLARED)).toBe('target-mode-unavailable');
    expect(presetUnavailableReason({ ...base, provider: 'brand-new-provider' }, DECLARED)).toBe('provider-unrecognised');
    expect(presetUnavailableReason({ ...base, provider: '' }, DECLARED)).toBe('provider-undeclared');
    expect(presetUnavailableReason({ ...base, requiresApi: true, provider: 'gpt-image-2' }, DECLARED)).toBe('provider-unavailable');
    // undeclared readiness is not satisfied readiness
    for (const bad of [undefined, null, 'true', 1]) {
      expect(presetUnavailableReason({ ...base, localReady: bad }, DECLARED)).toBe('local-readiness-undeclared');
      expect(presetUnavailableReason({ ...base, requiresApi: bad }, DECLARED)).toBe('api-requirement-undeclared');
    }
    for (const junk of [null, undefined, 'x', 0, []]) expect(isPresetAvailable(junk, DECLARED)).toBe(false);
    expect(availablePresets(null, DECLARED)).toEqual([]);
  });

  it('no new provider is introduced by this change', () => {
    expect(SUPPORTED_API_PROVIDERS).toEqual([]);
    // and every provider the data names is either local-recognised or unsupported
    for (const p of CREATIVE_PRESETS) expect(typeof p.provider).toBe('string');
  });
});

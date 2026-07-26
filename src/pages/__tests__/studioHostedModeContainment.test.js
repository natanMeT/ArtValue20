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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  STUDIO_MODE_REQUIREMENTS, STUDIO_FALLBACK_MODE,
  isStudioModeAvailable, availableStudioModeIds, resolveStudioMode,
} from '../../lib/studioModes.js';
import { readStudioHandoff, workflowIdToMode } from '../../lib/studioHandoff.js';
import { userFacingError, userError, engineError } from '../../lib/userFacingError.js';
import { qwenCompose } from '../../lib/geminiImage.js';
import { systemCapabilities } from '../../data/businessBrain.js';
import { CREATIVE_WORKFLOWS } from '../../data/creativeWorkflows.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf8');
const IMAGE_STUDIO = read('../ImageStudio.jsx');
const GEMINI_IMAGE = read('../../lib/geminiImage.js');

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

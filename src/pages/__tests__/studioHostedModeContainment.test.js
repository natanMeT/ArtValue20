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
  studioAvailability, STUDIO_SUBFEATURE_IDS, SUBFEATURE_TEXT_FIELDS, SUBFEATURE_META_FIELDS,
  isStudioSubfeatureAvailable, studioSubfeature, studioSubfeatureSnapshot,
  satisfiesCapability,
} from '../../lib/studioModes.js';
import {
  PRESET_REQUIREMENT_FIELDS, PRESET_DESCRIPTIVE_FIELDS, SUPPORTED_API_PROVIDERS,
  LOCAL_PRESET_PROVIDERS, PRESET_PROVIDERS, PROVIDER_EXECUTED_MODES,
  PROVIDER_RECOMMENDATION_ONLY_MODES, providerRecord, isProviderExecutable,
  isPresetAvailable, presetUnavailableReason, availablePresets,
  providerExecutorFor, resolveStudioExecution, STUDIO_EXECUTOR_IDS, MODE_EXECUTOR_CHAIN,
} from '../../lib/presetAvailability.js';
import {
  STUDIO_EXECUTOR_FN, EXECUTION_REFUSED, canAnimateResult, resolveResultAnimation,
} from '../ImageStudio.jsx';
import { qwenCompose, editImage, generateImg2Img, ltxVideo, animateImage } from '../../lib/geminiImage.js';
import { moduleGraph, readSource, isComponent, rel as relTo } from './support/moduleGraph.js';
import {
  unsafeErrorFlows, BOUNDARY_CALLS, BOUNDARY_SEMANTICS, catchBindingNames, parseModule,
  isSideEffectFree,
} from './support/errorFlow.js';
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

// ---- STAGE 4: the SCOPE decision, recorded rather than implied -----------
// Running the AST rule app-wide found user-facing leaks of this very class
// OUTSIDE the creative routes. Owner decision (2026-07-27): PR #118 stays
// scoped to the Studio, and the rest is recorded as KNOWN DEBT with exact
// sites rather than silently excluded — the failure mode of rounds 1-3 was a
// boundary that looked closed because nobody had looked past its edge.
//
// This list is asserted below: each entry must STILL be outside the graph and
// must STILL be a real violation. If someone fixes one, or pulls one of these
// files into the creative graph, the test fails and the debt record must be
// updated. Debt that cannot go stale silently.
const KNOWN_OUT_OF_SCOPE_DEBT = Object.freeze([
  { file: 'src/pages/ProjectDetail.jsx', flows: 3, note: 'toast(err.message) ×3 — IndexedDB/File API text; reachable directly at /projects/:id, which (unlike Projects) has no BetaUnavailable gate' },
  { file: 'src/lib/jakeAgent.js', flows: 1, note: 'logs.push(`… ${err.message}`) — action-handler failure text reaches Jake\'s visible log' },
]);
// Latent, NOT a leak: Settings.jsx:74 renders err.message only when it is
// EQUAL to a known Hebrew business string — a hand-rolled boundary that should
// move to userError(), but cannot emit technical text today.
// Non-rendering: Assistant.jsx window.__creativeLastError (debug hook) and the
// creative/v2 engine's structured `reason`/`details`/`log` positions.

// ---- the CLASS A predicate — now derived from the PARSE TREE ----------
// STAGE 3 replaced a regex predicate here. That predicate recognised only a
// hard-coded set of catch-variable names, so `catch (failure) { … }` was
// invisible to it, and it tried to enumerate SINKS — an open-ended set.
// `errorFlow.js` instead finds every catch clause structurally, takes whatever
// the author named the binding, and DEFAULT-DENIES every use that is not one of
// a small closed set of safe handlings. See that module for the stated limits.
const sinkViolations = (src, label = '') => unsafeErrorFlows(src, label)
  .map((v) => `${v.binding}@${v.line}: ${v.snippet}`);

function rawErrorSinks() {
  const out = [];
  for (const file of GRAPH) {
    if (file.endsWith('/userFacingError.js')) continue; // the boundary itself
    for (const v of sinkViolations(readSource(file), relative(file))) out.push(`${relative(file)} :: ${v}`);
  }
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

  // ---- fixtures: real modules, parsed by the real rule --------------------
  // These are complete `try { … } catch (…) { … }` sources, not string samples
  // fed to a pattern. Each is parsed exactly as a project file would be.
  const FLAGGED = {
    'the shipped PosterEditor shape (optional chaining)': "try { x(); } catch (e) { alert('יצוא נכשל: ' + (e?.message || e)); }",
    'the shipped store.jsx shape': "try { x(); } catch (e) { setError(e.message || 'שגיאת טעינה'); }",
    'the shipped geminiImage shape (interpolated throw)': 'try { x(); } catch (e) { throw new Error(`היצירה נכשלה: ${e.message}. נסה/י שוב.`); }',
    'A DIFFERENTLY NAMED BINDING — invisible to the old regex': 'try { x(); } catch (failure) { setError(failure.message); }',
    'another name, another sink': 'try { x(); } catch (reason) { alert(reason.message); }',
    'a name nobody would have listed': 'try { x(); } catch (kaboom) { toast(kaboom.message, "error"); }',
    'JSX interpolation with a novel name': 'function C() { try { x(); } catch (oops) { return <div>{oops.message}</div>; } }',
    'the whole error object into rendered state': 'try { x(); } catch (zz) { setError(zz); }',
    'an alias that escapes': 'try { x(); } catch (problem) { const m = problem.message; setState(m); }',
  };
  const CLEAN = {
    'routed through the boundary': "try { x(); } catch (e) { setError(userFacingError(e, 'גנרי')); }",
    'boundary with an unusual name': "try { x(); } catch (whatever) { setError(userFacingError(whatever, 'גנרי')); }",
    'diagnostics only': 'try { x(); } catch (e) { console.error(e); console.log(e.message); }',
    'bare rethrow': 'try { x(); } catch (e) { throw e; }',
    'inspected, not surfaced': "try { x(); } catch (e) { if (e.status === 500) { retry(); } if (!e.status) { throw userError('x'); } throw e; }",
    'technical detail kept on the Error, business text declared': 'try { x(); } catch (e) { throw engineError(`local: ${e.message}`, "biz"); }',
    'parameterless catch holds nothing': 'try { x(); } catch { ignore(); }',
    'detail extracted for diagnostics, then declared': 'try { x(); } catch (e) { const d = String(e?.error?.message || ""); throw engineError(d, "biz"); }',
  };

  it('POSITIVE CONTROLS: every unsafe shape is detected, whatever the binding is called', () => {
    for (const [label, src] of Object.entries(FLAGGED)) {
      expect(unsafeErrorFlows(src, label).length, label).toBeGreaterThan(0);
    }
  });

  it('NEGATIVE CONTROLS: correct handling is never flagged', () => {
    for (const [label, src] of Object.entries(CLEAN)) {
      expect(unsafeErrorFlows(src, label), label).toEqual([]);
    }
  });

  it('THE ESCAPE STAGE 3 CLOSES: the old regex was blind to the binding name', () => {
    const oldPredicate = (src) => /\b(?:e|err|error|ex|_e|e2|cause)\s*\??\s*\.\s*message\b/.test(src);
    const renamed = FLAGGED['A DIFFERENTLY NAMED BINDING — invisible to the old regex'];
    expect(oldPredicate(renamed)).toBe(false);              // what shipped saw nothing
    expect(unsafeErrorFlows(renamed).length).toBeGreaterThan(0); // the AST rule sees it
  });

  it('the safe-handling allowlist is small, closed and declared', () => {
    expect(BOUNDARY_CALLS).toContain('userFacingError');
    expect(BOUNDARY_CALLS).toContain('engineError');
    expect(BOUNDARY_CALLS.length).toBeLessThanOrEqual(6); // enumerating SAFETY stays reviewable
  });

  // ---- ARGUMENT SEMANTICS -------------------------------------------------
  // Being "inside a boundary call" proves nothing on its own: `userError(x)`
  // marks x renderable, and `engineError(tech, userMessage)` renders its SECOND
  // argument. A name-only allowlist launders the leak through the boundary.
  const ARG_MISUSE = {
    'userError() makes the caught text renderable VERBATIM': 'try { x(); } catch (e) { throw userError(e.message); }',
    'userError() with the whole error': 'try { x(); } catch (e) { throw userError(e); }',
    'engineError() arg1 becomes userMessage': "try { x(); } catch (e) { throw engineError('technical', e.message); }",
    'userFacingError() arg1 is the rendered fallback': 'try { x(); } catch (e) { setError(userFacingError(null, e.message)); }',
    'laundered through a boundary into a boundary': "try { x(); } catch (e) { setError(userFacingError(userError(e.message), 'x')); }",
  };
  const ARG_CORRECT = {
    'engineError() arg0 stays diagnostic': "try { x(); } catch (e) { throw engineError('local: ' + e.message, 'biz'); }",
    'userFacingError() arg0 is classified': "try { x(); } catch (e) { setError(userFacingError(e, 'biz')); }",
    'console.* is diagnostics in every position': 'try { x(); } catch (e) { console.error(e, e.message); }',
  };

  it('ARGUMENT SEMANTICS: a caught value in a user-safe message position is rejected', () => {
    for (const [label, src] of Object.entries(ARG_MISUSE)) {
      expect(unsafeErrorFlows(src, label).length, label).toBeGreaterThan(0);
    }
  });

  it('ARGUMENT SEMANTICS: diagnostic positions and genuine sanitizers stay accepted', () => {
    for (const [label, src] of Object.entries(ARG_CORRECT)) {
      expect(unsafeErrorFlows(src, label), label).toEqual([]);
    }
  });

  it('ARGUMENT SEMANTICS: every boundary declares its safe positions explicitly', () => {
    for (const [name, sem] of Object.entries(BOUNDARY_SEMANTICS)) {
      expect(sem.safe === 'all' || Array.isArray(sem.safe), name).toBe(true);
    }
    expect(BOUNDARY_SEMANTICS.userError.safe).toEqual([]);        // renders whatever it is given
    expect(BOUNDARY_SEMANTICS.engineError.safe).toEqual([0]);     // arg1 is the user message
    expect(BOUNDARY_SEMANTICS.userFacingError.safe).toEqual([0]); // arg1 is the fallback text
  });

  it('NEGATIVE CONTROL: a name-only allowlist accepts all of the misuse above', () => {
    const nameOnly = (src) => BOUNDARY_CALLS.some((b) => src.includes(`${b}(`));
    for (const [label, src] of Object.entries(ARG_MISUSE)) {
      expect(nameOnly(src), `${label} — the previous rule saw a boundary and stopped`).toBe(true);
      expect(unsafeErrorFlows(src).length, label).toBeGreaterThan(0);
    }
  });

  // ---- CATCH BINDING PATTERNS --------------------------------------------
  const PATTERNS = {
    'destructured shorthand': ['try { x(); } catch ({ message }) { setError(message); }', true],
    'destructured + renamed': ['try { x(); } catch ({ message: msg }) { alert(msg); }', true],
    'destructured + default': ['try { x(); } catch ({ message = "" }) { setError(message); }', true],
    'array pattern': ['try { x(); } catch ([first]) { setError(first); }', true],
    'destructured, diagnostics only': ['try { x(); } catch ({ message }) { console.error(message); }', false],
    'parameterless binds nothing': ['try { x(); } catch { ignore(); }', false],
  };

  it('CATCH PATTERNS: destructured bindings are analysed, not skipped', () => {
    for (const [label, [src, shouldFlag]] of Object.entries(PATTERNS)) {
      expect(unsafeErrorFlows(src, label).length > 0, label).toBe(shouldFlag);
    }
  });

  it('CATCH PATTERNS: binding names are extracted from every supported pattern', () => {
    const namesFor = (code) => {
      const clause = [];
      const ast = parseModule(code);
      const find = (n) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(find); return; }
        if (n.type === 'CatchClause' && n.param) clause.push(catchBindingNames(n.param));
        Object.values(n).forEach((v) => (v && typeof v === 'object' ? find(v) : null));
      };
      find(ast);
      return clause[0];
    };
    expect(namesFor('try{}catch(e){}').names).toEqual(['e']);
    expect(namesFor('try{}catch({ message }){}').names).toEqual(['message']);
    expect(namesFor('try{}catch({ message: msg, code }){}').names).toEqual(['msg', 'code']);
    expect(namesFor('try{}catch({ a, ...rest }){}').names).toEqual(['a', 'rest']);
    expect(namesFor('try{}catch([a, , b]){}').names).toEqual(['a', 'b']); // holes bind nothing
    for (const c of ['try{}catch(e){}', 'try{}catch({ m }){}']) expect(namesFor(c).unsupported).toBe('');
  });

  it('CATCH PATTERNS: an unsupported pattern FAILS CLOSED — reported, never skipped', () => {
    // No catch clause may be silently ignored. Simulated directly against the
    // extractor, since every pattern JS actually permits today is supported.
    const exotic = catchBindingNames({ type: 'SomeFuturePattern' });
    expect(exotic.unsupported).toBe('SomeFuturePattern');
    expect(exotic.names).toEqual([]);
    const nested = catchBindingNames({ type: 'ObjectPattern', properties: [{ type: 'WeirdProperty' }] });
    expect(nested.unsupported).toBe('WeirdProperty');
  });

  // ---- CONDITION BYPASS ---------------------------------------------------
  // The condition/comparison exemptions were POSITIONAL only: reaching an
  // `IfStatement` whose `test` was the whole call classified the caught value as
  // safe, although `setError` had already rendered it. Inspection now also
  // requires the sub-expression carrying the value to be SIDE-EFFECT FREE.
  const CONDITION_BYPASS = {
    'render sink used as an if-condition': 'try { x(); } catch (e) { if (setError(e.message)) retry(); }',
    'render sink as a while-condition': 'try { x(); } catch (e) { while (setError(e.message)) {} }',
    'render sink as a do-while condition': 'try { x(); } catch (e) { do { x(); } while (toast(e.message)); }',
    'render sink in a ternary TEST': 'try { x(); } catch (e) { const y = setError(e.message) ? 1 : 2; }',
    'render sink inside a logical condition': 'try { x(); } catch (e) { if (ok || setError(e.message)) {} }',
    'comparison wrapping the call': 'try { x(); } catch (e) { if (setError(e.message) === 1) {} }',
    'unary negation wrapping the call': 'try { x(); } catch (e) { if (!setError(e.message)) {} }',
    'for-loop test': 'try { x(); } catch (e) { for (;setError(e.message);) {} }',
    'deeply nested condition expression': 'try { x(); } catch (e) { if (a && (b || (setError(e.message) !== 0))) {} }',
  };
  const LEGITIMATE_INSPECTION = {
    'property comparison': "try { x(); } catch (e) { if (e.status === 500) { retry(); } throw e; }",
    'negated property': "try { x(); } catch (e) { if (!e.status) { throw userError('x'); } throw e; }",
    typeof: "try { x(); } catch (e) { if (typeof e === 'object') { throw e; } throw e; }",
    instanceof: 'try { x(); } catch (e) { if (e instanceof TypeError) { throw e; } throw e; }',
    'bare property condition': 'try { x(); } catch (e) { if (e.code) { throw e; } throw e; }',
    'property in a while condition': 'try { x(); } catch (e) { while (e.retryable) { pause(); } throw e; }',
    'property inspection in a ternary test': "try { x(); } catch (e) { const m = e.code === 'X' ? 'a' : 'b'; setError(m); }",
    'logical property inspection': 'try { x(); } catch (e) { if (e && e.code) { throw e; } throw e; }',
  };

  it('CONDITION BYPASS: a side-effecting call receiving caught data stays unsafe in every condition position', () => {
    for (const [label, src] of Object.entries(CONDITION_BYPASS)) {
      expect(unsafeErrorFlows(src, label).length, label).toBeGreaterThan(0);
    }
  });

  it('CONDITION BYPASS: direct, side-effect-free inspection remains accepted', () => {
    for (const [label, src] of Object.entries(LEGITIMATE_INSPECTION)) {
      expect(unsafeErrorFlows(src, label), label).toEqual([]);
    }
  });

  it('CONDITION BYPASS: the side-effect predicate is what discriminates', () => {
    const call = parseModule('const a = f(x);').program.body[0].declarations[0].init;
    const member = parseModule('const a = e.status;').program.body[0].declarations[0].init;
    const compare = parseModule('const a = e.status === 500;').program.body[0].declarations[0].init;
    const nested = parseModule('const a = b || (f(e) !== 0);').program.body[0].declarations[0].init;
    expect(isSideEffectFree(call)).toBe(false);
    expect(isSideEffectFree(nested)).toBe(false);   // a call ANYWHERE inside disqualifies
    expect(isSideEffectFree(member)).toBe(true);
    expect(isSideEffectFree(compare)).toBe(true);
  });

  it('NEGATIVE CONTROL: the positional-only exemption accepted every bypass above', () => {
    // the previous rule: being in a test/comparison position was sufficient
    const positionalOnly = (src) => {
      const ast = parseModule(src);
      let exempt = false;
      const visit = (n, parent) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach((c) => visit(c, parent)); return; }
        if (typeof n.type !== 'string') return;
        if ((n.type === 'IfStatement' || n.type === 'ConditionalExpression' || n.type === 'WhileStatement') && n.test) exempt = true;
        if (n.type === 'BinaryExpression' || n.type === 'UnaryExpression') exempt = true;
        Object.keys(n).forEach((k) => (k === 'loc' ? null : visit(n[k], n)));
      };
      visit(ast, null);
      return exempt;
    };
    // The reported bypasses — every one sat in a position the old rule exempted.
    const REPORTED = [
      'render sink used as an if-condition', 'render sink as a while-condition',
      'render sink in a ternary TEST', 'render sink inside a logical condition',
      'comparison wrapping the call', 'unary negation wrapping the call',
      'deeply nested condition expression',
    ];
    for (const label of REPORTED) {
      expect(positionalOnly(CONDITION_BYPASS[label]), `${label} sat in an exempt position`).toBe(true);
      expect(unsafeErrorFlows(CONDITION_BYPASS[label]).length, `${label} is now flagged`).toBeGreaterThan(0);
    }
    // `do…while` and `for(;;)` were never exempt under the old rule (it listed
    // only If / Conditional / While), so they were already flagged. They are
    // covered here as CONDITION CARRIERS so the new exemption cannot be widened
    // to them by accident — not as previously-accepted bypasses.
    for (const label of ['render sink as a do-while condition', 'for-loop test']) {
      expect(positionalOnly(CONDITION_BYPASS[label]), `${label} was never exempt`).toBe(false);
      expect(unsafeErrorFlows(CONDITION_BYPASS[label]).length, label).toBeGreaterThan(0);
    }
  });

  it('NEGATIVE CONTROL: the previous rule skipped destructured handlers entirely', () => {
    const src = PATTERNS['destructured shorthand'][0];
    const ast = parseModule(src);
    const clause = JSON.stringify(ast).includes('"ObjectPattern"');
    expect(clause).toBe(true);                       // the param is not an Identifier...
    expect(unsafeErrorFlows(src).length).toBeGreaterThan(0); // ...and is now analysed anyway
  });

  it('a module that cannot be parsed is reported, never silently skipped', () => {
    const broken = unsafeErrorFlows('function ( { syntax error', 'broken.js');
    expect(broken.length).toBe(1);
    expect(broken[0].snippet).toMatch(/PARSE FAILED/);
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

  it('STAGE 4 SCOPE: the recorded out-of-scope debt is real, and still out of scope', () => {
    // Two ways this fails: the debt was fixed (update the record), or the file
    // entered the creative graph (then it is no longer debt — it is covered).
    const inGraph = new Set(GRAPH.map(relative));
    for (const d of KNOWN_OUT_OF_SCOPE_DEBT) {
      expect(inGraph.has(d.file), `${d.file} is now IN the graph — remove it from the debt record`).toBe(false);
      const flows = unsafeErrorFlows(readSource(resolve(REPO, d.file)), d.file);
      expect(flows.length, `${d.file}: recorded ${d.flows} unsafe flows, found ${flows.length} — update the record`).toBe(d.flows);
    }
  });

  it('STAGE 4 SCOPE: the enforced scope itself is clean', () => {
    expect(rawErrorSinks()).toEqual([]);
    expect(GRAPH.length).toBeGreaterThan(40);
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
  // The protected text is obtained the ONLY way any consumer can obtain it —
  // through the capability-aware accessor, with capabilities that genuinely
  // satisfy it. The raw registry is not importable (asserted below).
  const OPEN_BLEND = studioSubfeature(BLEND, DECLARED);

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
    for (const [id, def] of STUDIO_SUBFEATURE_IDS.map((i) => [i, studioSubfeature(i, DECLARED)])) {
      for (const field of SUBFEATURE_TEXT_FIELDS) {
        const literal = def[field];
        expect(typeof literal, `${id}.${field}`).toBe('string');
        expect(literal.length).toBeGreaterThan(0);
        const owners = sources.filter((f) => readSource(f).includes(literal)).map(relative);
        expect(owners, `${id}.${field} is duplicated outside the authority`).toEqual([]);
      }
    }
  });

  it('every field a subfeature declares is classified as text or metadata', () => {
    // schema coverage: a new text field cannot be added without being pinned
    for (const id of STUDIO_SUBFEATURE_IDS) {
      const def = studioSubfeature(id, DECLARED);
      for (const key of Object.keys(def)) {
        if (key === 'available') continue; // added by the accessor, not a declared field
        expect([...SUBFEATURE_TEXT_FIELDS, ...SUBFEATURE_META_FIELDS], `${id}.${key} is classified`).toContain(key);
      }
    }
    for (const f of SUBFEATURE_TEXT_FIELDS) expect(SUBFEATURE_META_FIELDS).not.toContain(f);
  });

  it('THE RAW REGISTRY IS NOT IMPORTABLE — the accessor is the only public route', async () => {
    // Exporting the definitions left every unavailable string obtainable
    // directly, and the uniqueness invariant could not see the bypass because
    // the literal was still defined only in the authority file.
    const mod = await import('../../lib/studioModes.js');
    for (const name of ['STUDIO_SUBFEATURES', 'SUBFEATURE_REGISTRY', 'SUBFEATURES']) {
      expect(mod[name], `${name} must not be exported`).toBeUndefined();
    }
    // nothing exported may carry a user-visible string
    const texts = STUDIO_SUBFEATURE_IDS.flatMap((id) => {
      const open = studioSubfeature(id, DECLARED);
      return SUBFEATURE_TEXT_FIELDS.map((f) => open[f]);
    });
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value === 'function') continue;               // the accessors themselves
      const dump = JSON.stringify(value ?? null);
      for (const t of texts) expect(dump, `${name} exposes protected text`).not.toContain(t);
    }
    // only non-sensitive metadata comes out
    expect(STUDIO_SUBFEATURE_IDS).toEqual(['product-lock-blend']);
    expect(SUBFEATURE_META_FIELDS).toEqual(['id', 'parentMode', 'requires']);
  });

  it('NEGATIVE CONTROL: with the registry exported, a consumer bypasses the accessor entirely', () => {
    // the previous shape, reconstructed: import the registry, render the field
    const exportedRegistry = { [BLEND]: { guidance: OPEN_BLEND.guidance } };
    expect(exportedRegistry[BLEND].guidance).not.toBe('');     // obtainable with no capability check
    expect(studioSubfeature(BLEND, HOSTED).guidance).toBe(''); // the closed route gives nothing
  });

  it('THE RUNTIME BOUNDARY: an unavailable subfeature yields NO text to render', () => {
    // This replaces the round-4 source-region scan, which could only prove that
    // the consumers I knew about were gated. A consumer cannot render what it
    // cannot obtain: unavailable => every user-visible field is empty, so a new
    // or careless consumer has nothing to leak, gated or not.
    const closed = studioSubfeature(BLEND, HOSTED);
    expect(closed.available).toBe(false);
    for (const f of SUBFEATURE_TEXT_FIELDS) {
      expect(closed[f], `${f} must be empty when unavailable`).toBe('');
    }
    // the id survives so a consumer can still identify what it asked for
    expect(closed.id).toBe(BLEND);

    const open = studioSubfeature(BLEND, DECLARED);
    expect(open.available).toBe(true);
    for (const f of SUBFEATURE_TEXT_FIELDS) {
      expect(open[f], `${f} must be present when available`).toBe(OPEN_BLEND[f]);
    }
  });

  it('THE RUNTIME BOUNDARY: it holds for every declared subfeature and every snapshot', () => {
    for (const id of STUDIO_SUBFEATURE_IDS) {
      for (const caps of [HOSTED, DECLARED, undefined, {}, { comfy: true }]) {
        const rec = studioSubfeature(id, caps);
        if (rec.available) continue;
        for (const f of SUBFEATURE_TEXT_FIELDS) expect(rec[f], `${id}.${f}`).toBe('');
      }
      // the injected snapshot carries the same closed records, not the raw defs
      const snap = studioSubfeatureSnapshot(HOSTED)[id];
      for (const f of SUBFEATURE_TEXT_FIELDS) expect(snap[f]).toBe('');
    }
  });

  it('THE ACTION SEAM refuses independently of what is rendered', () => {
    // the handler checks availability itself — it does not trust the render gate
    expect(IMAGE_STUDIO).toMatch(/const runLockBlend = async \(\) => \{\s*\n(?:\s*\/\/[^\n]*\n)*\s*if \(!lockBlend\.available\)/);
  });

  it('NEGATIVE CONTROL: the previous open-record API is what allowed a new consumer to leak', () => {
    // reproduce the round-4 shape: full text + a flag the consumer must honour
    const openRecord = { ...OPEN_BLEND, available: isStudioSubfeatureAvailable(BLEND, HOSTED) };
    expect(openRecord.available).toBe(false);
    expect(openRecord.guidance).not.toBe('');          // ...yet the text was there for the taking
    expect(studioSubfeature(BLEND, HOSTED).guidance).toBe(''); // the closed API gives nothing
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
    expect(shown.title).toBe(OPEN_BLEND.title);
    expect(shown.description).toBe(OPEN_BLEND.description);
    // and the parent workflow's description gains the subfeature line only there
    expect(declared.find((c) => c.id === 'product-lock').description).toContain(OPEN_BLEND.capabilityText);
    expect(hosted.find((c) => c.id === 'product-lock').description).not.toContain(OPEN_BLEND.capabilityText);
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

  it('NEGATIVE CONTROL: a consumer that ignores the flag entirely still renders nothing', () => {
    // the exact escape Codex described: a NEW child asks the authority and
    // renders the text without ever checking `available`.
    const carelessConsumer = (caps) => {
      const rec = studioSubfeature(BLEND, caps);
      return `${rec.guidance} ${rec.actionLabel} ${rec.actionNote}`.trim(); // no gate at all
    };
    expect(carelessConsumer(HOSTED)).toBe('');                  // nothing to leak
    expect(carelessConsumer(DECLARED)).toContain('צל מגע');      // genuinely available -> works
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
    for (const id of [...hosted, 'product_motion_video']) expect(declared).toContain(id);
    // `photo_restoration` is NOT here — see the execution-authority suite: it
    // declares Qwen-Edit, which has no single-image edit path, so offering it
    // would promise an engine that never executes. Availability alone used to
    // let it through.
    expect(declared).not.toContain('photo_restoration');
    expect(declared).toHaveLength(CREATIVE_PRESETS.length - 2);
  });

  it('the destination mode still gates: engine-backed recipes stay hidden hosted', () => {
    for (const id of ['photo_restoration', 'product_motion_video']) {
      expect(presetUnavailableReason(byId(id), HOSTED)).toBe('target-mode-unavailable');
    }
    expect(isPresetAvailable(byId('product_motion_video'), DECLARED)).toBe(true);
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

// ===================================================================
// Stage 2 · PROVIDER REGISTRY — a provider declares what it needs to execute,
// and the same capability predicate answers for modes, subfeatures and providers.
//
// The escape this closes: a provider was previously accepted for being
// RECOGNISED, never for being CAPABLE. Two live presets name an engine their
// target mode does not imply.
// ===================================================================
describe('provider requirements are declared and enforced where the provider executes', () => {
  const byId = (id) => CREATIVE_PRESETS.find((p) => p.id === id);
  // partial local rigs — the exact configurations that slipped through
  const COMFY_NO_QWEN = { comfy: true, qwen: false, video: false, ltx: false, kontext: true, pulid: false };
  const SVD_NO_LTX = { comfy: true, qwen: true, video: true, ltx: false, kontext: true, pulid: false };

  it('every provider declares its needs, and unknown ids/needs fail closed', () => {
    for (const [id, p] of Object.entries(PRESET_PROVIDERS)) {
      expect(p.id, id).toBe(id);
      expect(['local', 'api']).toContain(p.kind);
      expect(typeof p.supported).toBe('boolean');
      expect(Array.isArray(p.needs), `${id}.needs`).toBe(true);
    }
    expect(providerRecord('no-such-provider')).toBeNull();
    for (const bad of [null, undefined, 0, {}, '']) expect(providerRecord(bad)).toBeNull();
    for (const bad of [null, undefined, 'no-such-provider']) expect(isProviderExecutable(bad, DECLARED)).toBe(false);
    expect(isProviderExecutable('gpt-image-2', DECLARED)).toBe(false); // declared but unsupported
  });

  it('every provider a preset names is registered (no implicit pass)', () => {
    for (const p of CREATIVE_PRESETS) expect(Object.keys(PRESET_PROVIDERS), p.id).toContain(p.provider);
  });

  it('THE REPORTED CASE 1: a Qwen recipe is not offered on a ComfyUI rig without Qwen', () => {
    const p = byId('photo_restoration');
    expect(p.provider).toBe('local-qwen-edit');
    expect(isStudioModeAvailable('img2img', COMFY_NO_QWEN)).toBe(true);      // the tab IS open...
    expect(presetUnavailableReason(p, COMFY_NO_QWEN)).toBe('provider-capability-missing'); // ...the engine is not
    // and even on a FULLY declared rig it stays unavailable, because Qwen-Edit
    // has no single-image execution path — see the execution-authority suite.
    expect(presetUnavailableReason(p, DECLARED)).toBe('provider-cannot-execute-mode');
  });

  it('THE REPORTED CASE 2: an LTX recipe is not re-routed onto SVD', () => {
    const p = byId('product_motion_video');
    expect(p.provider).toBe('local-ltx-video');
    expect(isStudioModeAvailable('video', SVD_NO_LTX)).toBe(true);           // `video` is satisfied by video||ltx
    expect(presetUnavailableReason(p, SVD_NO_LTX)).toBe('provider-capability-missing');
    expect(isPresetAvailable(p, DECLARED)).toBe(true);
  });

  it('NEGATIVE CONTROL: membership-only checking (the previous rule) passes both', () => {
    const membershipOnly = (p, caps) =>
      isStudioModeAvailable(p.targetTab, caps) && p.localReady === true && LOCAL_PRESET_PROVIDERS.includes(p.provider);
    expect(membershipOnly(byId('photo_restoration'), COMFY_NO_QWEN)).toBe(true);   // what shipped
    expect(isPresetAvailable(byId('photo_restoration'), COMFY_NO_QWEN)).toBe(false); // what happens now
    expect(membershipOnly(byId('product_motion_video'), SVD_NO_LTX)).toBe(true);
    expect(isPresetAvailable(byId('product_motion_video'), SVD_NO_LTX)).toBe(false);
  });

  it('the hosted text lane is NOT gated on the recommendation (owner decision)', () => {
    // `text` is served by whichever lane owns text-to-image; the preset's
    // provider is authoring metadata there, so hosted keeps its business recipes.
    expect(PROVIDER_RECOMMENDATION_ONLY_MODES).toEqual(['text']);
    const hosted = availablePresets(CREATIVE_PRESETS, HOSTED).map((p) => p.id);
    expect(hosted).toEqual(['premium_business_visual', 'dark_saas_dashboard', 'product_hero_shot', 'local_ad_creative']);
    for (const id of hosted) expect(byId(id).targetTab).toBe('text');
  });

  it('the exemption is a LIST, so any future mode is enforced by default', () => {
    for (const mode of Object.keys(STUDIO_MODE_REQUIREMENTS)) {
      const exempt = PROVIDER_RECOMMENDATION_ONLY_MODES.includes(mode);
      expect(PROVIDER_EXECUTED_MODES.includes(mode), mode).toBe(!exempt);
    }
    expect(PROVIDER_EXECUTED_MODES).not.toContain('text');
    expect(PROVIDER_EXECUTED_MODES.length).toBe(Object.keys(STUDIO_MODE_REQUIREMENTS).length - 1);
  });

  it('CLOSED: every optional stack is now positively declared, so no capability is inferred', () => {
    // The round-5 limit was that `ltx`/`video`/`kontext` were derived as
    // `COMFY_URL && <model constant>` — and every constant carries a non-empty
    // default, so they reported TRUE on any rig with an engine URL. Strict
    // provider enforcement cannot be stronger than its inputs, so the inputs
    // were fixed: ALL FIVE optional stacks now share one positive declaration.
    const GEMINI = read('../../lib/geminiImage.js');
    expect(GEMINI).toContain('const optionalStack = (raw) => Boolean(COMFY_URL && optionalCapabilityDeclared(raw));');
    for (const flag of ['hasVideoModel', 'hasLtxVideo', 'hasKontextModel', 'hasPulidModel', 'hasQwenEdit']) {
      expect(GEMINI, flag).toContain(`export const ${flag} = optionalStack(`);
    }
    // No STUDIO CAPABILITY may be inferred from a model-name constant any more.
    // (`hasFluxModel` is deliberately still a constant check: it is not a
    // capability in `liveStudioCapabilities()` — it selects a checkpoint on the
    // baseline `comfy` lane and gates nothing that is offered to the user.)
    const CAPABILITY_FLAGS = ['hasVideoModel', 'hasLtxVideo', 'hasKontextModel', 'hasPulidModel', 'hasQwenEdit'];
    for (const flag of CAPABILITY_FLAGS) {
      expect(GEMINI, flag).not.toMatch(new RegExp(`${flag} = Boolean\\(COMFY_URL && [A-Z_]+`));
    }
    const snapshot = GEMINI.slice(GEMINI.indexOf('export function liveStudioCapabilities'));
    for (const flag of CAPABILITY_FLAGS) expect(snapshot, flag).toContain(flag);
  });

  it('ONE capability vocabulary: modes, subfeatures and providers ask the same predicate', () => {
    expect(satisfiesCapability('qwen', DECLARED)).toBe(true);
    expect(satisfiesCapability('qwen', COMFY_NO_QWEN)).toBe(false);
    expect(satisfiesCapability('unknown-capability', DECLARED)).toBe(false); // fail closed
    // the provider check is that predicate, applied to every declared need
    expect(isProviderExecutable('local-qwen-edit', COMFY_NO_QWEN)).toBe(false);
    expect(isProviderExecutable('local-qwen-edit', DECLARED)).toBe(true);
    expect(isProviderExecutable('local-ltx-video', SVD_NO_LTX)).toBe(false);
  });

  // ===================================================================
  // EXECUTION AUTHORITY — availability said a recipe COULD be offered; it never
  // said the recipe would RUN on the engine it names. The Studio picked its path
  // from raw flags (`hasKontextModel ? editImage : generateImg2Img`,
  // `hasLtxVideo ? ltxVideo : animateImage`) and never consulted the preset.
  // ===================================================================
  it('EXECUTION: a Qwen-declared recipe reaches the Qwen function ITSELF (identity, not source)', () => {
    const qwenRecipe = { ...byId('photo_restoration'), id: 'synthetic_qwen_presenter', targetTab: 'presenter' };
    const r = resolveStudioExecution('presenter', qwenRecipe, DECLARED);
    expect(r).toMatchObject({ ok: true, executor: 'qwen-compose', provider: 'local-qwen-edit', viaPreset: true });
    expect(STUDIO_EXECUTOR_FN[r.executor]).toBe(qwenCompose);   // the real function
    expect(STUDIO_EXECUTOR_FN[r.executor]).not.toBe(editImage);
    expect(STUDIO_EXECUTOR_FN[r.executor]).not.toBe(generateImg2Img);
  });

  it('EXECUTION: an LTX-declared recipe reaches ltxVideo and is NEVER substituted by SVD', () => {
    const p = byId('product_motion_video');
    const ok = resolveStudioExecution('video', p, DECLARED);
    expect(ok).toMatchObject({ ok: true, executor: 'ltx-video', provider: 'local-ltx-video', viaPreset: true });
    expect(STUDIO_EXECUTOR_FN[ok.executor]).toBe(ltxVideo);
    // SVD present, LTX absent: the run is REFUSED, not handed to animateImage
    const refused = resolveStudioExecution('video', p, SVD_NO_LTX);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe('provider-capability-missing');
    expect(refused.executor).toBe('');
    expect(STUDIO_EXECUTOR_FN[refused.executor]).toBeUndefined(); // nothing to call
  });

  it('EXECUTION: the reported img2img substitution can no longer happen', () => {
    // Codex: on {qwen:true, kontext:false} the lane ran the identity recipe
    // through SDXL; on a Kontext rig, through Kontext — never through Qwen.
    const p = byId('photo_restoration');
    const QWEN_NO_KONTEXT = { comfy: true, qwen: true, kontext: false, video: false, ltx: false, pulid: false };
    const r = resolveStudioExecution('img2img', p, QWEN_NO_KONTEXT);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('provider-cannot-execute-mode');   // Qwen has no img2img path
    expect(r.executor).toBe('');                             // and no fallback was chosen
    // the old behaviour, reconstructed from the flags the seam used to read
    const preFix = QWEN_NO_KONTEXT.kontext ? 'kontext-edit' : 'sdxl-img2img';
    expect(preFix).toBe('sdxl-img2img');                     // what shipped
    expect(r.executor).not.toBe('sdxl-img2img');             // what happens now
  });

  it('EXECUTION: with NOTHING promised, the ordinary capability chain still applies', () => {
    // No active preset => no promise => the mode's chain decides, as before.
    expect(resolveStudioExecution('img2img', null, DECLARED)).toMatchObject({ ok: true, executor: 'kontext-edit', viaPreset: false });
    expect(resolveStudioExecution('img2img', null, { comfy: true })).toMatchObject({ ok: true, executor: 'sdxl-img2img' });
    expect(resolveStudioExecution('video', null, DECLARED)).toMatchObject({ ok: true, executor: 'ltx-video' });
    expect(resolveStudioExecution('video', null, SVD_NO_LTX)).toMatchObject({ ok: true, executor: 'svd-animate' });
    expect(resolveStudioExecution('text', null, HOSTED)).toMatchObject({ ok: true, executor: 'text-image' });
  });

  it('EXECUTION: a preset for a DIFFERENT mode makes no promise about this one', () => {
    const textPreset = byId('premium_business_visual');
    expect(resolveStudioExecution('img2img', textPreset, DECLARED)).toMatchObject({ ok: true, executor: 'kontext-edit', viaPreset: false });
  });

  it('EXECUTION FAILS CLOSED on unknown modes, unknown providers and exhausted chains', () => {
    for (const bad of ['', null, undefined, 'nope', 0, {}]) {
      expect(resolveStudioExecution(bad, null, DECLARED)).toMatchObject({ ok: false, reason: 'unknown-mode', executor: '' });
    }
    const bogus = { ...byId('product_motion_video'), provider: 'brand-new-provider' };
    expect(resolveStudioExecution('video', bogus, DECLARED)).toMatchObject({ ok: false, reason: 'provider-unrecognised', executor: '' });
    // chain exhausted: video needs ltx or svd, neither declared
    expect(resolveStudioExecution('video', null, { comfy: true })).toMatchObject({ ok: false, reason: 'no-executor-available', executor: '' });
    expect(resolveStudioExecution('presenter', null, { comfy: true })).toMatchObject({ ok: false, reason: 'no-executor-available' });
  });

  // ---- the result-card animation action, across ALL FOUR video configurations
  // It was gated on `hasVideoModel` (the SVD flag) alone, so an LTX-only rig had
  // a working video executor and an open video mode but no way to animate a
  // generated result. Visibility and execution now share one resolution.
  const VIDEO_CONFIGS = {
    'LTX only': [{ comfy: true, ltx: true, video: false }, true, 'ltx-video', ltxVideo],
    'SVD only': [{ comfy: true, ltx: false, video: true }, true, 'svd-animate', animateImage],
    both: [{ comfy: true, ltx: true, video: true }, true, 'ltx-video', ltxVideo],
    neither: [{ comfy: true, ltx: false, video: false }, false, '', undefined],
  };

  it('RESULT ACTION: offered exactly when the video chain resolves, in all four configurations', () => {
    for (const [label, [caps, visible, executor]] of Object.entries(VIDEO_CONFIGS)) {
      expect(canAnimateResult(caps), `${label}: visibility`).toBe(visible);
      expect(resolveResultAnimation(caps).executor, `${label}: executor`).toBe(executor);
    }
  });

  it('RESULT ACTION: each configuration routes to its OWN engine, never substituted', () => {
    for (const [label, [caps, , executor, fn]] of Object.entries(VIDEO_CONFIGS)) {
      expect(STUDIO_EXECUTOR_FN[resolveResultAnimation(caps).executor], `${label}: function`).toBe(fn);
    }
    // explicitly: LTX-only never lands on SVD, SVD-only never lands on LTX
    expect(STUDIO_EXECUTOR_FN[resolveResultAnimation(VIDEO_CONFIGS['LTX only'][0]).executor]).not.toBe(animateImage);
    expect(STUDIO_EXECUTOR_FN[resolveResultAnimation(VIDEO_CONFIGS['SVD only'][0]).executor]).not.toBe(ltxVideo);
  });

  it('RESULT ACTION: with both capabilities the DECLARED order decides, deterministically', () => {
    const both = VIDEO_CONFIGS.both[0];
    expect(MODE_EXECUTOR_CHAIN.video.map((s) => s.id)).toEqual(['ltx-video', 'svd-animate']);
    for (let i = 0; i < 5; i += 1) expect(resolveResultAnimation(both).executor).toBe('ltx-video');
  });

  it('RESULT ACTION: neither capability hides it AND refuses execution', () => {
    const none = VIDEO_CONFIGS.neither[0];
    expect(canAnimateResult(none)).toBe(false);
    expect(resolveResultAnimation(none)).toMatchObject({ ok: false, reason: 'no-executor-available', executor: '' });
    expect(canAnimateResult(HOSTED)).toBe(false);
    expect(canAnimateResult(undefined)).toBe(false);       // fail closed
  });

  it('RESULT ACTION: visibility and execution read the SAME resolution', () => {
    expect(IMAGE_STUDIO).toMatch(/const resultAnimation = resolveResultAnimation\(studioCaps\)/);
    expect(IMAGE_STUDIO).toMatch(/\{!result\.isVideo && resultAnimation\.ok &&/);   // the gate
    expect(IMAGE_STUDIO).toMatch(/const vx = resultAnimation;/);                    // the run
    expect(IMAGE_STUDIO).not.toMatch(/!result\.isVideo && hasVideoModel/);          // the SVD-only gate is gone
  });

  it('NEGATIVE CONTROL: the SVD-only flag hid the action on an LTX-only rig', () => {
    const ltxOnly = VIDEO_CONFIGS['LTX only'][0];
    const preFix = Boolean(ltxOnly.video);          // what `hasVideoModel` evaluated to
    expect(preFix).toBe(false);                     // -> button hidden...
    expect(isStudioModeAvailable('video', ltxOnly)).toBe(true);  // ...while the mode was open
    expect(canAnimateResult(ltxOnly)).toBe(true);   // and the executor existed all along
  });

  it('EXECUTION: every resolvable path id has a real function behind it', () => {
    for (const id of STUDIO_EXECUTOR_IDS) {
      expect(typeof STUDIO_EXECUTOR_FN[id], `${id} has no function`).toBe('function');
    }
    expect(STUDIO_EXECUTOR_IDS.length).toBeGreaterThan(8);
  });

  it('EXECUTION: the Studio seam consumes the resolution, not raw capability flags', () => {
    expect(IMAGE_STUDIO).toMatch(/const exec = resolveStudioExecution\(mode, activePreset, studioCaps\)/);
    expect(IMAGE_STUDIO).toMatch(/if \(!exec\.ok\) \{ setError\(EXECUTION_REFUSED\); return; \}/);
    // the two substituting ternaries are gone
    expect(IMAGE_STUDIO).not.toMatch(/hasKontextModel \? await editImage/);
    expect(IMAGE_STUDIO).not.toMatch(/hasLtxVideo \? await ltxVideo/);
  });

  it('the full matrix stays coherent across every configuration', () => {
    for (const caps of [HOSTED, DECLARED, COMFY_NO_QWEN, SVD_NO_LTX, undefined, {}]) {
      for (const p of availablePresets(CREATIVE_PRESETS, caps)) {
        expect(isStudioModeAvailable(p.targetTab, caps), `${p.id} mode`).toBe(true);
        if (PROVIDER_EXECUTED_MODES.includes(p.targetTab)) {
          expect(isProviderExecutable(p.provider, caps), `${p.id} provider`).toBe(true);
        }
        expect(p.localReady === true || p.requiresApi === true).toBe(true);
      }
    }
    expect(availablePresets(CREATIVE_PRESETS, undefined).every((p) => p.targetTab === 'text')).toBe(true);
  });
});

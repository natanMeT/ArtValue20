// ===================================================================
// Studio containment — the PRODUCT BOUNDARY suite.
//
// PRODUCT BOUNDARY (2026-07-27, owner decision): the Studio is CLOUD/GATEWAY
// ONLY. Every local-engine mode, preset, provider registry, executor path and
// capability flag was REMOVED from the product. This suite therefore no longer
// verifies "the hidden local mode stays hidden" — there is no local mode left
// to hide. What it verifies is that the removal is COMPLETE, and that the seams
// which used to leak still cannot:
//
//   1. no module the Studio can reach touches a local engine or address;
//   2. a RETIRED mode arriving from a hand-off, restored state or deep link
//      resolves to a mode that exists, instead of rendering a dead panel;
//   3. Jake advertises only what the hosted product has;
//   4. no caught technical value can reach the UI — verified from the PARSE
//      TREE, not by pattern-matching source text.
//
// The local provider matrix, the executor-routing tests and the capability
// declaration tests were DELETED with the features they described, rather than
// left behind as dormant validation of an architecture that no longer exists.
// ===================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  STUDIO_MODE_REQUIREMENTS, STUDIO_FALLBACK_MODE, RETIRED_STUDIO_MODES,
  isStudioModeAvailable, isRetiredStudioMode, availableStudioModeIds,
  resolveStudioMode, studioAvailability, availableStudioModeLabels,
} from '../../lib/studioModes.js';
import {
  PRESET_REQUIREMENT_FIELDS, PRESET_DESCRIPTIVE_FIELDS,
  isPresetAvailable, presetUnavailableReason, availablePresets,
} from '../../lib/presetAvailability.js';
import { readStudioHandoff, workflowIdToMode } from '../../lib/studioHandoff.js';
import { userFacingError, userError, engineError } from '../../lib/userFacingError.js';
import { gatewayImageErrorToThrow } from '../../lib/hostedImage.js';
import { systemCapabilities, buildAccountBusinessContext } from '../../data/businessBrain.js';
import { CREATIVE_WORKFLOWS } from '../../data/creativeWorkflows.js';
import { CREATIVE_PRESETS } from '../../data/creativePresets.js';
import { moduleGraph, readSource, isComponent, rel as relTo } from './support/moduleGraph.js';
import {
  unsafeErrorFlows, BOUNDARY_CALLS, BOUNDARY_SEMANTICS, catchBindingNames, parseModule,
  isSideEffectFree,
} from './support/errorFlow.js';
import { posterExportErrorText, POSTER_EXPORT_FALLBACK } from '../../components/studio/PosterEditor.jsx';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf8');
const IMAGE_STUDIO = read('../ImageStudio.jsx');

const REPO = resolve(here, '../../..');
const CREATIVE_ROUTE_ROOTS = [
  'src/pages/ImageStudio.jsx',
  'src/pages/AdStudio.jsx',
  'src/pages/Diagnose.jsx',
  'src/pages/Outreach.jsx',
].map((p) => resolve(REPO, p));
const GRAPH = moduleGraph(CREATIVE_ROUTE_ROOTS);
const relative = (f) => relTo(REPO, f);

// The Studio's OWN module closure — precisely what a Studio page load can reach.
const STUDIO_GRAPH = moduleGraph([resolve(REPO, 'src/pages/ImageStudio.jsx')]);

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

// Scope decision (round 5), still recorded: leaks of this class exist OUTSIDE
// the creative routes. Each entry must STILL be out of scope and STILL be real,
// so the debt cannot go stale silently.
const KNOWN_OUT_OF_SCOPE_DEBT = Object.freeze([
  { file: 'src/pages/ProjectDetail.jsx', flows: 3 },
  { file: 'src/lib/jakeAgent.js', flows: 1 },
]);

// ===================================================================
// 1 · THE PRODUCT BOUNDARY — the Studio cannot reach a local engine
// ===================================================================
describe('the Studio is cloud/Gateway only', () => {
  const LOCAL_TERMS = ['comfy', 'ComfyUI', 'fooocus', 'Fooocus', 'LTX', 'Qwen', 'PuLID',
    'Kontext', 'SVD', 'safetensors', '127.0.0.1', 'localhost', '8188', '7860', '7865'];

  it('no module the Studio can reach imports the local engine or its gate', () => {
    const names = STUDIO_GRAPH.map(relative);
    for (const forbidden of ['src/lib/localComfyEngine.js', 'src/lib/localEngines.js', 'src/lib/comfyProgress.js', 'src/lib/geminiImage.js']) {
      expect(names, forbidden).not.toContain(forbidden);
    }
    expect(names).toContain('src/lib/hostedImage.js');
    expect(names.length).toBeGreaterThan(10); // the closure is real, not empty
  });

  it('no CODE the Studio can reach names a local engine, address or checkpoint', () => {
    // Comments are stripped first: several modules explain in prose WHY the local
    // engine is gone, and that documentation is the opposite of a leak. The
    // invariant is about executable references.
    const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const offenders = [];
    for (const f of STUDIO_GRAPH) {
      // The SERVER-side Gateway contract is explicitly preserved by this slice.
      // It registers local provider NAMES for the server's own routing table;
      // the browser never selects a provider (asserted separately below).
      if (relative(f).startsWith('supabase/functions/')) continue;
      const hits = LOCAL_TERMS.filter((t) => stripComments(readSource(f)).includes(t));
      if (hits.length) offenders.push(`${relative(f)} :: ${hits.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('the browser never names a provider — the server owns routing', () => {
    // The one preserved local reference in the graph is the server contract's
    // provider registry. What matters is that nothing the Studio SENDS can
    // select one.
    const payload = IMAGE_STUDIO.slice(IMAGE_STUDIO.indexOf('const r = await generateImage'), IMAGE_STUDIO.indexOf('const r = await generateImage') + 200);
    for (const forbidden of ['provider', 'engine', 'model', 'comfyui', 'fooocus']) {
      expect(payload.includes(forbidden), forbidden).toBe(false);
    }
    const hosted = read('../../lib/hostedImage.js');
    expect(hosted).toContain('aspectRatio: toGatewayAspectRatio(opts.aspect)');
    expect(hosted.includes('provider:')).toBe(false);
  });

  it('the hosted lane holds no engine URL, model constant or capability flag', () => {
    const hosted = read('../../lib/hostedImage.js');
    for (const forbidden of ['COMFY_URL', 'LOCAL_URL', 'VITE_COMFYUI', 'VITE_LOCAL_IMAGE_URL',
      'resolveLocalEngineUrl', 'hasLocalComfy', 'optionalCapabilityDeclared']) {
      expect(hosted.includes(forbidden), forbidden).toBe(false);
    }
    expect(hosted).toContain("callAiGateway('studio.generate_image'");
  });

  it('opening the Studio performs NO request: no probe, no discovery, no job stream', () => {
    for (const forbidden of ['checkLocalEngine', 'listImageModels', 'hasPulidNode', 'hasQwenEditNode',
      'onComfyJob', 'markNextComfyJob', 'watchJob', 'cancelJob', 'object_info', 'system_stats']) {
      expect(IMAGE_STUDIO.includes(forbidden), forbidden).toBe(false);
    }
  });

  it('the ONE generation call sends no provider, model, size or engine choice', () => {
    expect(IMAGE_STUDIO).toContain('const r = await generateImage(p, { aspect });');
    for (const forbidden of ['arch:', 'width: asp', 'height: asp', 'hd,', 'model:']) {
      expect(IMAGE_STUDIO.includes(forbidden), forbidden).toBe(false);
    }
  });

  it('PRODUCT LOCK IS GONE — no mode, control, wording or implementation survives', () => {
    for (const gone of ['ProductPlacer', 'placerRef', 'buildLockComposite', 'isLock', 'lockBusy',
      'Product Lock', 'מוצר מדויק', 'קומפוזיט']) {
      expect(IMAGE_STUDIO.includes(gone), gone).toBe(false);
    }
    // the orphaned implementation went with it
    const names = GRAPH.map(relative);
    for (const deleted of ['src/components/studio/ProductPlacer.jsx', 'src/lib/productLock.js']) {
      expect(names, deleted).not.toContain(deleted);
    }
  });
});

// ===================================================================
// 2 · RETIRED MODES cannot be selected — by any indirect path
// ===================================================================
describe('retired local modes cannot be reached', () => {
  it('the product offers exactly the two hosted modes', () => {
    expect(availableStudioModeIds()).toEqual(['text']);
    expect(Object.keys(STUDIO_MODE_REQUIREMENTS)).toEqual(['text']);
    expect(availableStudioModeLabels().length).toBe(1);
  });

  it('every retired mode id is unavailable and recognised as retired', () => {
    for (const m of RETIRED_STUDIO_MODES) {
      expect(isStudioModeAvailable(m), m).toBe(false);
      expect(isRetiredStudioMode(m), m).toBe(true);
    }
    expect([...RETIRED_STUDIO_MODES]).toEqual(['img2img', 'inpaint', 'video', 'flf', 'presenter', 'character', 'album', 'lock']);
  });

  it('FAILS CLOSED on unknown, empty and hostile ids', () => {
    for (const bad of ['', null, undefined, 'nope', 'TEXT', 0, {}, []]) {
      expect(isStudioModeAvailable(bad)).toBe(false);
    }
    expect(isStudioModeAvailable(STUDIO_FALLBACK_MODE)).toBe(true);
  });

  it('a hand-off / deep link / restored state naming a retired mode is CONTAINED', () => {
    for (const m of RETIRED_STUDIO_MODES) {
      const r = resolveStudioMode(m);
      expect(r.mode, m).toBe('text');
      expect(r.contained).toBe(true);
      expect(r.retired).toBe(true);
      expect(isStudioModeAvailable(r.mode)).toBe(true);
    }
  });

  it('a VALID request is preserved, not contained', () => {
    expect(resolveStudioMode('text')).toEqual({ mode: 'text', contained: false, retired: false });
  });

  it('THE REAL SEAM: a retired workflow hand-off carries no mode, and keeps the prompt', () => {
    const handoff = (workflow) => readStudioHandoff({
      jakeHandoff: { source: 'jake', target: 'studio', prompt: 'פרומפט', workflow },
    });
    for (const retired of ['product-presenter', 'smart-edit', 'area-edit', 'image-to-video',
      'before-after', 'character-series', 'model-album', 'product-lock']) {
      expect(workflowIdToMode(retired), retired).toBeNull();
      expect(handoff(retired).mode, retired).toBeNull();
      expect(handoff(retired).prompt).toBe('פרומפט');
    }
    expect(handoff('fast-image').mode).toBe('text');
    expect(handoff('product-lock').mode).toBeNull();   // retired in the same decision
  });

  it('EVERY accepted hand-off resolves — including one carrying no mode', () => {
    // Codex finding on 7f9daf8: a retired workflow yields `mode: null`, and the
    // effect skipped resolution entirely, so an ALREADY MOUNTED Studio kept
    // whatever mode it was in while the new prompt sat hidden behind it.
    expect(IMAGE_STUDIO).toMatch(/const resolved = resolveStudioMode\(prefill\.mode\);/);
    expect(IMAGE_STUDIO).not.toMatch(/if \(prefill\.mode\) \{/);
    // and the authority resolves a null/absent mode to the fallback, not to nothing
    for (const none of [null, undefined, '']) {
      expect(resolveStudioMode(none).mode).toBe(STUDIO_FALLBACK_MODE);
    }
  });

  it('the gallery delete path does not touch removed state', () => {
    // Codex finding on 7f9daf8: `setSelectedIds` survived the selection removal
    // and threw a ReferenceError that aborted refreshGallery().
    expect(IMAGE_STUDIO.includes('setSelectedIds')).toBe(false);
    expect(IMAGE_STUDIO.includes('selectedIds')).toBe(false);
  });

  it('every live catalog workflow resolves to a mode that exists', () => {
    for (const w of CREATIVE_WORKFLOWS.filter((x) => x.status === 'live' && x.mode)) {
      expect(isStudioModeAvailable(w.mode), w.id).toBe(true);
    }
  });

  it('THE CONSUMER: the Studio renders the same two modes and resolves every entry path', () => {
    const block = IMAGE_STUDIO.slice(IMAGE_STUDIO.indexOf('const MODES = ['));
    const ids = [...block.slice(0, block.indexOf('\n];')).matchAll(/\{\s*id:\s*'([a-z0-9]+)'/gi)].map((m) => m[1]);
    expect(ids).toEqual(['text']);
    expect(IMAGE_STUDIO).toMatch(/MODES\.filter\(\(m\) => isStudioModeAvailable\(m\.id\)\)/);
    expect(IMAGE_STUDIO).toMatch(/resolveStudioMode\(prefill\.mode\)/);
    expect(IMAGE_STUDIO).toMatch(/if \(!isStudioModeAvailable\(mode\)\)/);
  });
});

// ===================================================================
// 3 · JAKE advertises only the hosted product
// ===================================================================
describe('Jake advertises only what the hosted product has', () => {
  const caps = () => systemCapabilities(studioAvailability());

  it('no retired creative workflow or gated subfeature is advertised', () => {
    const ids = caps().map((c) => c.id);
    for (const retired of ['product-presenter', 'smart-edit', 'area-edit', 'image-to-video',
      'before-after', 'character-series', 'model-album', 'product-lock-blend', 'product-lock']) {
      expect(ids, retired).not.toContain(retired);
    }
  });

  it('the genuinely available lanes ARE advertised', () => {
    const ids = caps().map((c) => c.id);
    for (const kept of ['fast-image', 'image-studio', 'growth-os', 'gallery', 'creative-modes']) {
      expect(ids, kept).toContain(kept);
    }
    for (const c of caps()) if (c.mode) expect(isStudioModeAvailable(c.mode), c.id).toBe(true);
  });

  it('no capability object names a local engine', () => {
    for (const c of caps()) {
      const dump = JSON.stringify(c);
      for (const term of ['comfyui', 'ComfyUI', 'fooocus', 'Fooocus', 'mixed', 'PuLID', 'Qwen', 'LTX', 'SVD', 'Kontext']) {
        expect(dump, `${c.id} :: ${term}`).not.toContain(term);
      }
    }
  });

  it('omitting the availability snapshot FAILS CLOSED', () => {
    expect(systemCapabilities().filter((c) => c.mode)).toEqual([]);
    expect(systemCapabilities().length).toBeGreaterThan(0); // non-Studio surfaces survive
  });

  it('THE REAL CONSUMER: the Jake prompt promises no retired capability', () => {
    const prompt = buildAccountBusinessContext(null, { maxCapabilities: 24, availableModes: studioAvailability() });
    for (const gone of ['פרזנטור', 'אלבום דוגמנית', 'ערכת דמות', 'Product Lock', 'צללים', 'ComfyUI', 'Fooocus', 'מוצר מדויק']) {
      expect(prompt, gone).not.toContain(gone);
    }
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('internal fields never leak into the capability objects', () => {
    for (const c of caps()) {
      expect(c.requires).toBeUndefined();
      expect(c.describe).toBeUndefined();
      expect(c.titleOf).toBeUndefined();
    }
  });
});

// ===================================================================
// 4 · PRESETS — only what the product can actually run
// ===================================================================
describe('preset availability', () => {
  it('every preset targets a mode the product has', () => {
    for (const p of CREATIVE_PRESETS) {
      expect(Object.keys(STUDIO_MODE_REQUIREMENTS), p.id).toContain(p.targetTab);
    }
  });

  it('the retired and external-provider recipes were REMOVED, not hidden', () => {
    const ids = CREATIVE_PRESETS.map((p) => p.id);
    for (const gone of ['photo_restoration', 'product_motion_video', 'hebrew_ui_mockup']) {
      expect(ids, gone).not.toContain(gone);
    }
  });

  it('no preset names a local model, checkpoint or provider any more', () => {
    for (const p of CREATIVE_PRESETS) {
      expect(p.provider, p.id).toBeUndefined();
      expect(p.recommendedModel, p.id).toBeUndefined();
      expect(p.modelFamily, p.id).toBeUndefined();
    }
    const code = read('../../data/creativePresets.js').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    for (const term of ['FLUX', 'SDXL', 'Qwen', 'LTX', 'safetensors', 'RealVisXL', 'Juggernaut']) {
      expect(code, term).not.toContain(term);
    }
  });

  it('the supported recipes are offered', () => {
    expect(availablePresets(CREATIVE_PRESETS).map((p) => p.id))
      .toEqual(['premium_business_visual', 'dark_saas_dashboard', 'product_hero_shot', 'local_ad_creative']);
  });

  it('FAILS CLOSED on a retired target, undeclared readiness, an external provider and junk', () => {
    const base = CREATIVE_PRESETS[0];
    expect(presetUnavailableReason({ ...base, targetTab: 'nope' })).toBe('target-mode-unavailable');
    expect(presetUnavailableReason({ ...base, targetTab: 'presenter' })).toBe('target-mode-unavailable');
    expect(presetUnavailableReason({ ...base, requiresApi: true })).toBe('external-provider-unavailable');
    expect(presetUnavailableReason({ ...base, recipeReady: false })).toBe('not-ready');
    for (const bad of [undefined, null, 'true', 1]) {
      expect(presetUnavailableReason({ ...base, recipeReady: bad })).toBe('readiness-undeclared');
      expect(presetUnavailableReason({ ...base, requiresApi: bad })).toBe('api-requirement-undeclared');
    }
    for (const junk of [null, undefined, 'x', 0, []]) expect(isPresetAvailable(junk)).toBe(false);
    expect(availablePresets(null)).toEqual([]);
  });

  it('SCHEMA COVERAGE: every field on every preset is explicitly classified', () => {
    const known = new Set([...PRESET_REQUIREMENT_FIELDS, ...PRESET_DESCRIPTIVE_FIELDS]);
    for (const p of CREATIVE_PRESETS) {
      for (const key of Object.keys(p)) expect([...known], `${p.id}.${key}`).toContain(key);
    }
    for (const f of PRESET_REQUIREMENT_FIELDS) expect(PRESET_DESCRIPTIVE_FIELDS).not.toContain(f);
  });

  it('THE CONSUMER: the Studio filters through the authority; selection cannot outlive it', () => {
    expect(IMAGE_STUDIO).toMatch(/const presets = availablePresets\(CREATIVE_PRESETS\)/);
    expect(IMAGE_STUDIO).not.toMatch(/\{CREATIVE_PRESETS\.map\(/);
    expect(IMAGE_STUDIO).toMatch(/const activePreset = presets\.find/);
  });
});

// ===================================================================
// 5 · THE ERROR BOUNDARY — no caught technical value can render
// ===================================================================
describe('user-facing error boundary', () => {
  it('renders only explicitly declared text; unknown errors FAIL CLOSED to the fallback', () => {
    expect(userFacingError(new Error('comfy: timeout'), 'נכשל')).toBe('נכשל');
    expect(userFacingError({ message: 'Qwen-Image-Edit אינו מותקן' }, 'נכשל')).toBe('נכשל');
    expect(userFacingError(null, 'נכשל')).toBe('נכשל');
    expect(userFacingError(undefined, 'נכשל')).toBe('נכשל');
  });

  it('preserves specific business validation messages instead of flattening them', () => {
    expect(userFacingError(userError('יש להזין תיאור לתמונה'), 'גנרי')).toBe('יש להזין תיאור לתמונה');
  });

  it('keeps the technical detail on the Error while rendering business text', () => {
    const e = engineError('provider exploded at node 7', 'היצירה נכשלה כרגע');
    expect(e.message).toContain('node 7');
    expect(userFacingError(e, 'גנרי')).toBe('היצירה נכשלה כרגע');
    expect(userFacingError(e, 'גנרי')).not.toMatch(/node/i);
  });

  it('THE SHIPPED poster-export mapping renders only business text', () => {
    const taint = new Error("Failed to execute 'toDataURL' on 'HTMLCanvasElement': Tainted canvases may not be exported.");
    expect(posterExportErrorText(taint)).toBe(POSTER_EXPORT_FALLBACK);
    for (const term of ['toDataURL', 'canvas', 'Tainted']) {
      expect(posterExportErrorText(taint)).not.toMatch(new RegExp(term, 'i'));
    }
    for (const junk of [null, undefined, 'string error', 0, {}]) {
      expect(posterExportErrorText(junk)).toBe(POSTER_EXPORT_FALLBACK);
    }
    expect(posterExportErrorText(userError('הדפדפן חסם את הייצוא'))).toBe('הדפדפן חסם את הייצוא');
  });
});

describe('controlled Gateway errors survive the render boundary', () => {
  const thrown = (code) => gatewayImageErrorToThrow(code === undefined ? null : { ok: false, error: { code } });

  it('KNOWN mapped reasons keep their actionable guidance', () => {
    expect(userFacingError(thrown('unauthenticated'), 'גנרי')).toBe('צריך להתחבר כדי ליצור תמונה');
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
    const hostile = { ok: false, error: { code: 'unknown_provider_code', message: 'node UnetLoaderGGUF failed at 127.0.0.1:8188', userSafe: true } };
    const rendered = userFacingError(gatewayImageErrorToThrow(hostile), 'גנרי');
    expect(rendered).toBe('יצירת התמונה נכשלה — נסה שוב מאוחר יותר');
    for (const term of ['UnetLoader', '127.0.0.1', 'node']) expect(rendered).not.toMatch(new RegExp(term, 'i'));
  });
});

describe('CLASS A · no caught technical value can render (derived from the parse tree)', () => {
  it('NO module reachable from the creative routes pipes a caught error into a sink', () => {
    expect(rawErrorSinks()).toEqual([]);
  });

  it('every creative RENDER surface routes its rendered errors through the boundary', () => {
    for (const file of GRAPH.filter(isComponent)) {
      const src = readSource(file);
      if (!/\bcatch\s*\(/.test(src)) continue;                      // nothing bound to route
      if (!/\bset[A-Z]\w*\s*\(|\balert\s*\(/.test(src)) continue;   // no sink at all
      expect(src, relative(file)).toMatch(/userFacingError\(/);
    }
  });

  it('the surface set is DERIVED from the code, not from a hand-written list', () => {
    expect(GRAPH.length).toBeGreaterThan(20);
    expect(moduleGraph(CREATIVE_ROUTE_ROOTS)).toEqual(GRAPH);                 // stable
    expect(moduleGraph([...CREATIVE_ROUTE_ROOTS].reverse())).toEqual(GRAPH);  // order-independent
    const names = GRAPH.map(relative);
    for (const child of ['src/components/studio/PosterEditor.jsx', 'src/components/studio/MockupStudio.jsx',
      'src/store/store.jsx']) {
      expect(names, child).toContain(child);
    }
    for (const f of GRAPH) expect(relative(f)).toMatch(/^(src|supabase)\//);  // bounded by the project
  });

  it('NEGATIVE CONTROL: dropping a root removes its transitive child', () => {
    const without = moduleGraph(CREATIVE_ROUTE_ROOTS.filter((f) => !f.endsWith('ImageStudio.jsx'))).map(relative);
    expect(without).not.toContain('src/components/studio/PosterEditor.jsx');
    expect(GRAPH.map(relative)).toContain('src/components/studio/PosterEditor.jsx');
  });

  // ---- boundary ARGUMENT semantics --------------------------------------
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
    expect(BOUNDARY_SEMANTICS.userError.safe).toEqual([]);
    expect(BOUNDARY_SEMANTICS.engineError.safe).toEqual([0]);
    expect(BOUNDARY_SEMANTICS.userFacingError.safe).toEqual([0]);
    expect(BOUNDARY_CALLS.length).toBeLessThanOrEqual(6); // enumerating SAFETY stays reviewable
  });

  it('NEGATIVE CONTROL: a name-only allowlist accepts every one of those', () => {
    const nameOnly = (src) => BOUNDARY_CALLS.some((b) => src.includes(`${b}(`));
    for (const [label, src] of Object.entries(ARG_MISUSE)) {
      expect(nameOnly(src), label).toBe(true);
      expect(unsafeErrorFlows(src).length, label).toBeGreaterThan(0);
    }
  });

  // ---- catch BINDING patterns -------------------------------------------
  const PATTERNS = {
    'destructured shorthand': ['try { x(); } catch ({ message }) { setError(message); }', true],
    'destructured + renamed': ['try { x(); } catch ({ message: msg }) { alert(msg); }', true],
    'destructured + default': ['try { x(); } catch ({ message = "" }) { setError(message); }', true],
    'array pattern': ['try { x(); } catch ([first]) { setError(first); }', true],
    'a name nobody would have listed': ['try { x(); } catch (kaboom) { toast(kaboom.message, "error"); }', true],
    'destructured, diagnostics only': ['try { x(); } catch ({ message }) { console.error(message); }', false],
    'parameterless binds nothing': ['try { x(); } catch { ignore(); }', false],
  };

  it('CATCH PATTERNS: every binding shape is analysed, none skipped', () => {
    for (const [label, [src, shouldFlag]] of Object.entries(PATTERNS)) {
      expect(unsafeErrorFlows(src, label).length > 0, label).toBe(shouldFlag);
    }
    expect(catchBindingNames({ type: 'ObjectPattern', properties: [{ type: 'WeirdProperty' }] }).unsupported).toBe('WeirdProperty');
    expect(catchBindingNames({ type: 'SomeFuturePattern' }).unsupported).toBe('SomeFuturePattern');
  });

  it('NEGATIVE CONTROL: the old regex was blind to the binding name', () => {
    const renamed = PATTERNS['a name nobody would have listed'][0];
    expect(/\b(?:e|err|error|ex)\s*\??\s*\.\s*message\b/.test(renamed)).toBe(false);
    expect(unsafeErrorFlows(renamed).length).toBeGreaterThan(0);
  });

  // ---- CONDITION bypass ---------------------------------------------------
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
    'property comparison': 'try { x(); } catch (e) { if (e.status === 500) { retry(); } throw e; }',
    'negated property': "try { x(); } catch (e) { if (!e.status) { throw userError('x'); } throw e; }",
    typeof: "try { x(); } catch (e) { if (typeof e === 'object') { throw e; } throw e; }",
    instanceof: 'try { x(); } catch (e) { if (e instanceof TypeError) { throw e; } throw e; }',
    'bare property condition': 'try { x(); } catch (e) { if (e.code) { throw e; } throw e; }',
    'property in a while condition': 'try { x(); } catch (e) { while (e.retryable) { pause(); } throw e; }',
    'property inspection in a ternary test': "try { x(); } catch (e) { const m = e.code === 'X' ? 'a' : 'b'; setError(m); }",
    'logical property inspection': 'try { x(); } catch (e) { if (e && e.code) { throw e; } throw e; }',
  };

  it('CONDITION BYPASS: a side-effecting call receiving caught data stays unsafe everywhere', () => {
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
    const expr = (code) => parseModule(code).program.body[0].declarations[0].init;
    expect(isSideEffectFree(expr('const a = f(x);'))).toBe(false);
    expect(isSideEffectFree(expr('const a = b || (f(e) !== 0);'))).toBe(false); // a call ANYWHERE disqualifies
    expect(isSideEffectFree(expr('const a = e.status;'))).toBe(true);
    expect(isSideEffectFree(expr('const a = e.status === 500;'))).toBe(true);
  });

  it('NEGATIVE CONTROL: the positional-only exemption accepted the reported bypasses', () => {
    const positionalOnly = (src) => {
      const ast = parseModule(src);
      let exempt = false;
      const visit = (n) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(visit); return; }
        if (typeof n.type !== 'string') return;
        if ((n.type === 'IfStatement' || n.type === 'ConditionalExpression' || n.type === 'WhileStatement') && n.test) exempt = true;
        if (n.type === 'BinaryExpression' || n.type === 'UnaryExpression') exempt = true;
        Object.keys(n).forEach((k) => (k === 'loc' ? null : visit(n[k])));
      };
      visit(ast);
      return exempt;
    };
    for (const label of ['render sink used as an if-condition', 'render sink as a while-condition',
      'render sink in a ternary TEST', 'render sink inside a logical condition',
      'comparison wrapping the call', 'unary negation wrapping the call', 'deeply nested condition expression']) {
      expect(positionalOnly(CONDITION_BYPASS[label]), label).toBe(true);
      expect(unsafeErrorFlows(CONDITION_BYPASS[label]).length, label).toBeGreaterThan(0);
    }
  });

  it('a module that cannot be parsed is reported, never silently skipped', () => {
    const broken = unsafeErrorFlows('function ( { syntax error', 'broken.js');
    expect(broken.length).toBe(1);
    expect(broken[0].snippet).toMatch(/PARSE FAILED/);
  });

  it('SCOPE: the recorded out-of-scope debt is real, and still out of scope', () => {
    const inGraph = new Set(GRAPH.map(relative));
    for (const d of KNOWN_OUT_OF_SCOPE_DEBT) {
      expect(inGraph.has(d.file), `${d.file} is now IN the graph — update the debt record`).toBe(false);
      const flows = unsafeErrorFlows(readSource(resolve(REPO, d.file)), d.file);
      expect(flows.length, `${d.file}: recorded ${d.flows}, found ${flows.length}`).toBe(d.flows);
    }
  });
});

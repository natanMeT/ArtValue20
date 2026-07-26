// ===================================================================
// presetAvailability — THE authoritative decision on whether a creative
// preset can be offered under the active configuration.
//
// WHY THIS EXISTS
// The preset filter was written against ONE axis — `targetTab` — because that
// was the axis of the mode-containment defect being fixed at the time. But a
// preset declares a whole contract, and `hebrew_ui_mockup` declares
// `targetTab: 'text'` (available everywhere) together with `localReady: false`,
// `requiresApi: true` and `provider: 'gpt-image-2'` (a provider this product
// does not have). A tab-only filter passed it: the Studio offered a recipe
// nothing could run, and applying it fed its scaffold into the ordinary
// text-to-image generator — an unrelated engine producing something the
// preset never promised.
//
// CONTRACT
//   - EVERY declared requirement field is evaluated. `PRESET_REQUIREMENT_FIELDS`
//     and `PRESET_DESCRIPTIVE_FIELDS` together must cover every key present on
//     every preset; a schema-coverage test fails when a new field appears in
//     neither, so a requirement can never be added and silently ignored.
//   - FAIL CLOSED. Unknown target mode, unknown provider, a non-boolean
//     readiness flag, or a preset that is neither locally runnable nor served
//     by an available API provider → unavailable.
//   - PURE. No imports beyond the mode authority; no runtime probing.
//   - No provider is introduced here. `SUPPORTED_API_PROVIDERS` is empty
//     because the product ships none; adding one is a deliberate, reviewed act.
// ===================================================================
import { isStudioModeAvailable, satisfiesCapability, STUDIO_MODE_REQUIREMENTS } from './studioModes.js';

// Fields that PARTICIPATE in the availability decision.
export const PRESET_REQUIREMENT_FIELDS = Object.freeze([
  'targetTab',    // destination mode — must be openable
  'localReady',   // is the local path actually able to run this recipe today
  'requiresApi',  // does it need an external provider instead
  'provider',     // which provider serves it
]);

// Fields that are presentational/recipe metadata and cannot gate availability.
// Listed EXPLICITLY so nothing is ignored by omission.
//   `futureProvider` is deliberately here: it states which provider would serve
//   the recipe BETTER later, not whether it is servable now. `dark_saas_dashboard`
//   declares one while being fully local-ready today. Present-tense servability
//   is decided by localReady / requiresApi / provider, so making futureProvider
//   gate anything would be a rule that never fires — worse than an explicit
//   classification, because it would look like coverage without being it.
export const PRESET_DESCRIPTIVE_FIELDS = Object.freeze([
  'futureProvider',
  'id', 'title', 'titleHe', 'category', 'useCase', 'recommendedModel', 'modelFamily',
  'aspectRatios', 'promptScaffold', 'negativePrompt', 'recommendedParams',
  'qualityNotes', 'pitfalls',
]);

// ===================================================================
// PROVIDER REGISTRY — every provider DECLARES what it needs to execute.
//
// WHY THIS SHAPE
// The first version listed local providers as merely "recognised" and did not
// check them, on the assumption that "the target mode already encodes the engine
// requirement". THAT ASSUMPTION IS FALSE whenever the mode and the provider need
// DIFFERENT capabilities, and two live presets are exactly that case:
//   * photo_restoration    → mode `img2img` needs `comfy`, provider needs `qwen`
//   * product_motion_video → mode `video` is satisfied by `video || ltx`,
//                            provider needs `ltx` specifically
// so a rig with ComfyUI but no Qwen-Edit, or with SVD but no LTX, was offered a
// recipe its declared engine cannot run — the wrong-engine behaviour this module
// exists to prevent.
//
// `needs` is resolved through `satisfiesCapability` — the SAME predicate the
// modes and subfeatures use, so there is exactly one capability vocabulary.
// `supported: false` means the product cannot call it at all today.
//
// POLICY (fail closed): a preset is offered only when EVERY capability its
// declared provider needs is satisfied. A preset is never silently re-routed to
// a different engine than the one it names — if the declared path is missing,
// the recipe is simply not offered.
// `executors` maps a Studio mode to the EXECUTION PATH id this provider really
// has in that mode. It is the difference between "the capability is declared"
// and "this recipe will actually run on the engine it names" — availability was
// only ever the first of those. An absent entry means the provider CANNOT serve
// that mode, and the recipe is neither offered nor executed there; it is never
// quietly handed to whatever else the lane happens to support.
export const PRESET_PROVIDERS = Object.freeze({
  'local-flux': Object.freeze({ id: 'local-flux', kind: 'local', supported: true, needs: Object.freeze(['comfy']), executors: Object.freeze({ text: 'text-image' }) }),
  'local-sdxl': Object.freeze({ id: 'local-sdxl', kind: 'local', supported: true, needs: Object.freeze(['comfy']), executors: Object.freeze({ text: 'text-image', img2img: 'sdxl-img2img' }) }),
  // Qwen-Image-Edit is a MULTI-IMAGE compose stack: its only execution path in
  // this product is `qwenCompose`, which the `presenter` mode drives. There is
  // no single-image Qwen edit path, so it declares NO `img2img` executor.
  'local-qwen-edit': Object.freeze({ id: 'local-qwen-edit', kind: 'local', supported: true, needs: Object.freeze(['comfy', 'qwen']), executors: Object.freeze({ presenter: 'qwen-compose' }) }),
  'local-ltx-video': Object.freeze({ id: 'local-ltx-video', kind: 'local', supported: true, needs: Object.freeze(['ltx']), executors: Object.freeze({ video: 'ltx-video', flf: 'flf-video' }) }),
  // External providers this build can actually call: NONE. The hosted image lane
  // is the account's own Gateway text-to-image path, not a preset-selected third
  // party. Declaring one here is a deliberate, reviewed act.
  'gpt-image-2': Object.freeze({ id: 'gpt-image-2', kind: 'api', supported: false, needs: Object.freeze([]), executors: Object.freeze({}) }),
});

// The execution path a provider offers for a mode, or '' when it offers none.
export function providerExecutorFor(providerId, mode) {
  const p = providerRecord(providerId);
  if (!p || !p.executors || typeof mode !== 'string') return '';
  return Object.prototype.hasOwnProperty.call(p.executors, mode) ? p.executors[mode] : '';
}

// Kept as derived views so existing consumers/tests keep a stable vocabulary.
export const SUPPORTED_API_PROVIDERS = Object.freeze(
  Object.values(PRESET_PROVIDERS).filter((p) => p.kind === 'api' && p.supported).map((p) => p.id),
);
export const LOCAL_PRESET_PROVIDERS = Object.freeze(
  Object.values(PRESET_PROVIDERS).filter((p) => p.kind === 'local').map((p) => p.id),
);

// Resolve a provider id to its record. Unknown → null (caller fails closed).
export const providerRecord = (id) =>
  (typeof id === 'string' && Object.prototype.hasOwnProperty.call(PRESET_PROVIDERS, id) ? PRESET_PROVIDERS[id] : null);

// Can this provider actually execute under `caps`? Every declared need must be
// satisfied; an unknown need resolves to false inside satisfiesCapability.
export function isProviderExecutable(id, caps) {
  const p = providerRecord(id);
  if (!p || p.supported !== true) return false;
  if (!Array.isArray(p.needs)) return false;
  return p.needs.every((need) => satisfiesCapability(need, caps));
}

// Target modes whose execution IS the preset's declared provider. For these the
// provider is a promise to the user and is enforced; everywhere else the mode's
// own lane executes the recipe and the provider is authoring metadata.
// FAIL CLOSED BY LISTING THE EXEMPTION, NOT THE RULE: `text` is the single lane
// that is served independently of the preset's provider, so it is named here and
// every other mode — including any mode added later — is enforced by default.
export const PROVIDER_RECOMMENDATION_ONLY_MODES = Object.freeze(['text']);
export const PROVIDER_EXECUTED_MODES = Object.freeze(
  Object.keys(STUDIO_MODE_REQUIREMENTS).filter((m) => !PROVIDER_RECOMMENDATION_ONLY_MODES.includes(m)),
);

const isBool = (v) => v === true || v === false;

// Why a preset is unavailable — '' when it IS available. Exported so the
// reason can be asserted directly instead of inferred from a boolean.
export function presetUnavailableReason(preset, caps) {
  if (!preset || typeof preset !== 'object') return 'not-a-preset';

  // 1. destination mode
  if (!isStudioModeAvailable(preset.targetTab, caps)) return 'target-mode-unavailable';

  // 2. readiness flags must be explicitly declared booleans (fail closed on
  //    undefined / 'true' / null — an undeclared requirement is not a satisfied one)
  if (!isBool(preset.localReady)) return 'local-readiness-undeclared';
  if (!isBool(preset.requiresApi)) return 'api-requirement-undeclared';

  // 3. the provider must be DECLARED and RECOGNISED in every case — an
  //    unregistered provider id is a hard stop, never an implicit pass.
  if (typeof preset.provider !== 'string' || !preset.provider) return 'provider-undeclared';
  const provider = providerRecord(preset.provider);
  if (!provider) return 'provider-unrecognised';

  // 4. an API-only recipe is served by the provider itself, so the provider must
  //    be one this build can actually call.
  if (preset.requiresApi === true) {
    if (provider.kind !== 'api' || provider.supported !== true) return 'provider-unavailable';
    return isProviderExecutable(preset.provider, caps) ? '' : 'provider-unavailable';
  }

  // 5. otherwise the recipe runs on the creative path and must be declared ready
  if (preset.localReady !== true) return 'not-ready';
  if (provider.kind !== 'local') return 'provider-unavailable';

  // 6. THE PROVIDER'S OWN CAPABILITIES — but only where the declared provider is
  //    what ACTUALLY executes the recipe.
  //
  //    `text` is served by whichever lane owns text-to-image in this
  //    configuration (the account's Gateway when hosted, the local engine when
  //    present). For those presets `provider`/`recommendedModel` are the
  //    AUTHORING RECOMMENDATION, not the execution path, so gating on them would
  //    hide every business recipe in a hosted build without making any promise
  //    truer. The engine-specific lanes are different: `photo_restoration` really
  //    is executed by Qwen-Edit and `product_motion_video` really is executed by
  //    LTX, and their guidance names those engines to the user. There the
  //    declared provider is a PROMISE, and it must hold or the recipe is not
  //    offered — a preset is never silently re-routed to a different engine.
  //
  //    (Owner decision, 2026-07-27: enforce exactly where the provider executes.
  //    The remaining gap — model-specific wording inside `qualityNotes` for the
  //    hosted text lane — is recorded as a separate follow-up, not silently
  //    closed here.)
  if (PROVIDER_EXECUTED_MODES.includes(preset.targetTab)) {
    if (!isProviderExecutable(preset.provider, caps)) return 'provider-capability-missing';
    // ...and the provider must have a real execution path in THAT mode. A
    // declared capability is not an execution route: `photo_restoration` names
    // Qwen-Edit and targets `img2img`, but Qwen has no single-image edit path
    // here, so the lane would have run Kontext or SDXL instead. Offering it
    // would promise an engine that never executes.
    if (!providerExecutorFor(preset.provider, preset.targetTab)) return 'provider-cannot-execute-mode';
  }
  return '';
}

export const isPresetAvailable = (preset, caps) => presetUnavailableReason(preset, caps) === '';

export const availablePresets = (presets, caps) =>
  (Array.isArray(presets) ? presets : []).filter((p) => isPresetAvailable(p, caps));

// ===================================================================
// EXECUTION AUTHORITY — which execution path a run actually takes.
//
// WHY THIS EXISTS
// Availability said a recipe COULD be offered. It never said the recipe would
// run on the engine it names. The Studio picked its execution path straight
// from capability flags (`hasKontextModel ? editImage : generateImg2Img`,
// `hasLtxVideo ? ltxVideo : animateImage`) and never consulted the active
// preset, so a recipe declaring Qwen-Edit could be executed by Kontext or SDXL,
// and one declaring LTX could be executed by SVD — silently, with the user
// still reading guidance that named the promised engine.
//
// CONTRACT
//   - A preset's DECLARED PROVIDER decides the path in its own target mode, and
//     that decision NEVER falls back. If the declared provider cannot execute,
//     the run is refused; it is not handed to another engine.
//   - With no active preset for this mode, nothing has been promised, so the
//     ordinary capability chain applies — first satisfied step wins.
//   - FAIL CLOSED on an unknown mode, an unknown provider, or an exhausted
//     chain. `ok:false` carries a machine reason; the caller renders business text.
//   - PURE: ids only. The id→function mapping lives at the call site, so this
//     module stays free of engine imports and is directly testable.
// ===================================================================

// The ordered capability chain for a mode when NO preset has declared anything.
// `needs: null` = always available (served by whichever lane owns the mode).
export const MODE_EXECUTOR_CHAIN = Object.freeze({
  text: Object.freeze([Object.freeze({ id: 'text-image', needs: null })]),
  lock: Object.freeze([Object.freeze({ id: 'lock-composite', needs: null })]),
  img2img: Object.freeze([Object.freeze({ id: 'kontext-edit', needs: 'kontext' }), Object.freeze({ id: 'sdxl-img2img', needs: 'comfy' })]),
  inpaint: Object.freeze([Object.freeze({ id: 'inpaint', needs: 'comfy' })]),
  presenter: Object.freeze([Object.freeze({ id: 'qwen-compose', needs: 'qwen' })]),
  video: Object.freeze([Object.freeze({ id: 'ltx-video', needs: 'ltx' }), Object.freeze({ id: 'svd-animate', needs: 'video' })]),
  flf: Object.freeze([Object.freeze({ id: 'flf-video', needs: 'ltx' })]),
  character: Object.freeze([Object.freeze({ id: 'character-pulid', needs: 'pulid' }), Object.freeze({ id: 'character-kontext', needs: 'kontext' })]),
  album: Object.freeze([Object.freeze({ id: 'model-album', needs: 'pulid' })]),
});

// Every execution-path id this module can return. A call site must map ALL of
// them, and a test pins that — so adding a path cannot leave a hole.
export const STUDIO_EXECUTOR_IDS = Object.freeze([...new Set([
  ...Object.values(MODE_EXECUTOR_CHAIN).flatMap((chain) => chain.map((s) => s.id)),
  ...Object.values(PRESET_PROVIDERS).flatMap((p) => Object.values(p.executors || {})),
])].sort());

export function resolveStudioExecution(mode, preset, caps) {
  const chain = Object.prototype.hasOwnProperty.call(MODE_EXECUTOR_CHAIN, mode) ? MODE_EXECUTOR_CHAIN[mode] : null;
  if (!chain) return { ok: false, executor: '', provider: '', viaPreset: false, reason: 'unknown-mode' };

  // A preset targeting THIS mode has made a promise about the engine.
  const declaresThisMode = preset && typeof preset === 'object'
    && preset.targetTab === mode && PROVIDER_EXECUTED_MODES.includes(mode);
  if (declaresThisMode) {
    const providerId = preset.provider;
    if (!providerRecord(providerId)) return { ok: false, executor: '', provider: String(providerId || ''), viaPreset: true, reason: 'provider-unrecognised' };
    const executor = providerExecutorFor(providerId, mode);
    // NO FALLBACK on either branch — that is the whole point.
    if (!executor) return { ok: false, executor: '', provider: providerId, viaPreset: true, reason: 'provider-cannot-execute-mode' };
    if (!isProviderExecutable(providerId, caps)) return { ok: false, executor: '', provider: providerId, viaPreset: true, reason: 'provider-capability-missing' };
    return { ok: true, executor, provider: providerId, viaPreset: true, reason: '' };
  }

  for (const step of chain) {
    if (step.needs === null || satisfiesCapability(step.needs, caps)) {
      return { ok: true, executor: step.id, provider: '', viaPreset: false, reason: '' };
    }
  }
  return { ok: false, executor: '', provider: '', viaPreset: false, reason: 'no-executor-available' };
}

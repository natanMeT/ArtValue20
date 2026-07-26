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
import { isStudioModeAvailable } from './studioModes.js';

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

// External providers this build can actually call. Empty by design: the hosted
// image lane is the account's own Gateway text-to-image path, not a preset-
// selected third-party provider. A preset that names a provider NOT listed here
// is unavailable — including on a local/demo rig.
export const SUPPORTED_API_PROVIDERS = Object.freeze([]);

// Providers served by the LOCAL creative stack. A preset on the local path is
// governed by its target mode (which already encodes the engine requirement),
// so these are recognised-but-not-additionally-gated; an UNRECOGNISED provider
// is a hard stop.
export const LOCAL_PRESET_PROVIDERS = Object.freeze([
  'local-flux', 'local-sdxl', 'local-qwen-edit', 'local-ltx-video',
]);

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

  // 3. an API-only recipe needs a provider this build supports
  if (preset.requiresApi === true) {
    if (typeof preset.provider !== 'string' || !preset.provider) return 'provider-undeclared';
    if (!SUPPORTED_API_PROVIDERS.includes(preset.provider)) return 'provider-unavailable';
    return '';
  }

  // 4. otherwise it runs on the local/hosted creative path, which requires the
  //    recipe to be declared ready and its provider to be a recognised one
  if (preset.localReady !== true) return 'not-ready';
  if (typeof preset.provider !== 'string' || !preset.provider) return 'provider-undeclared';
  if (!LOCAL_PRESET_PROVIDERS.includes(preset.provider)) return 'provider-unrecognised';
  return '';
}

export const isPresetAvailable = (preset, caps) => presetUnavailableReason(preset, caps) === '';

export const availablePresets = (presets, caps) =>
  (Array.isArray(presets) ? presets : []).filter((p) => isPresetAvailable(p, caps));

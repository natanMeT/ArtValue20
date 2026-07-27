// ===================================================================
// presetAvailability — THE authoritative decision on whether a creative
// preset can be offered.
//
// PRODUCT BOUNDARY (2026-07-27, owner decision): the Studio is CLOUD/GATEWAY
// ONLY. The local provider registry, the per-provider capability requirements
// and the provider→executor routing that this module used to own are GONE with
// the engines they described — not disabled, removed. A preset is a prompt
// recipe for a mode the product actually has; there is no provider to select,
// no execution path to choose between, and no local model to name.
//
// WHY IT STILL EXISTS
// A preset ROUTES to a mode (`targetTab`) and advertises itself as runnable. If
// its destination mode is not part of the product, or if it can only be served
// by an external provider this build cannot call, offering it promises
// something that will never happen. That was the defect; the check survives the
// engines.
//
// CONTRACT
//   - Every declared field is classified: `PRESET_REQUIREMENT_FIELDS` and
//     `PRESET_DESCRIPTIVE_FIELDS` together must cover every key on every preset.
//     A schema-coverage test fails when a new field appears in neither, so a
//     requirement cannot be added and silently ignored.
//   - FAIL CLOSED. Unknown target mode, a readiness flag that is not an explicit
//     boolean, or a recipe that needs an external provider → unavailable.
//   - No provider is introduced here. This build calls exactly one image lane:
//     the account's own protected AI Gateway, chosen by the product, never by a
//     preset.
//   - PURE. No imports beyond the mode authority; no runtime probing.
// ===================================================================
import { isStudioModeAvailable } from './studioModes.js';

// Fields that PARTICIPATE in the availability decision.
export const PRESET_REQUIREMENT_FIELDS = Object.freeze([
  'targetTab',    // destination mode — must be part of the product
  'localReady',   // is the recipe actually usable today
  'requiresApi',  // does it need an external provider this build cannot call
]);

// Fields that are presentational/recipe metadata and cannot gate availability.
// Listed EXPLICITLY so nothing is ignored by omission.
//   `futureProvider` states which provider would serve the recipe better later;
//   it is not a statement about today and must never gate anything.
export const PRESET_DESCRIPTIVE_FIELDS = Object.freeze([
  'futureProvider',
  'id', 'title', 'titleHe', 'category', 'useCase',
  'aspectRatios', 'promptScaffold', 'negativePrompt', 'recommendedParams',
  'qualityNotes', 'pitfalls',
]);

const isBool = (v) => v === true || v === false;

// Why a preset is unavailable — '' when it IS available. Exported so the
// reason can be asserted directly instead of inferred from a boolean.
export function presetUnavailableReason(preset) {
  if (!preset || typeof preset !== 'object') return 'not-a-preset';

  // 1. destination mode must be part of the product
  if (!isStudioModeAvailable(preset.targetTab)) return 'target-mode-unavailable';

  // 2. readiness flags must be explicitly declared booleans (fail closed on
  //    undefined / 'true' / null — an undeclared requirement is not a satisfied one)
  if (!isBool(preset.localReady)) return 'readiness-undeclared';
  if (!isBool(preset.requiresApi)) return 'api-requirement-undeclared';

  // 3. this build calls no external image provider, so a recipe that needs one
  //    can never run. It is not offered, and no substitute is chosen for it.
  if (preset.requiresApi === true) return 'external-provider-unavailable';

  // 4. and the recipe itself must be declared usable
  if (preset.localReady !== true) return 'not-ready';
  return '';
}

export const isPresetAvailable = (preset) => presetUnavailableReason(preset) === '';

export const availablePresets = (presets) =>
  (Array.isArray(presets) ? presets : []).filter((p) => isPresetAvailable(p));

// ===================================================================
// studioModes — THE authoritative source for which Studio creative modes
// the product can offer.
//
// PRODUCT BOUNDARY (2026-07-27, owner decision): the Studio is CLOUD/GATEWAY
// ONLY. Every local-engine mode — smart edit, area edit, image→video,
// before/after, product presenter, character pack, model album — has been
// REMOVED from the product, together with the capability vocabulary that used
// to describe them. There is no LTX, SVD, Qwen, PuLID, Kontext, ComfyUI or
// Fooocus path in the Studio any more, and none is kept dormant "for later".
//
// PRODUCT DECISION (2026-07-27, second override): Product Lock is removed too.
// It was the last non-text mode, so the Studio now has exactly ONE creative
// mode:
//   text — description → image, served by the account's protected AI Gateway
//
// WHY THIS MODULE STILL EXISTS
// Availability is not the same as what is rendered. The original defect was a
// Jake→Studio hand-off selecting a mode the tile list had hidden, and the panels
// render from `mode`, not from the tile list. With the local modes retired, the
// same seam now has a second job: a RETIRED mode id arriving from a hand-off,
// restored router state or a deep link must resolve to a real mode instead of
// rendering a panel that no longer exists.
//
// CONTRACT
//   - The offerable set is FIXED and complete. It is not derived from any
//     runtime flag, engine URL, model constant or environment declaration, so
//     there is nothing left to infer optimistically.
//   - FAIL CLOSED. An unknown id, a retired id, or a non-string all resolve to
//     "unavailable".
//   - PURE. No imports, no probing, no window/storage/clock.
// ===================================================================

// Every mode the Studio can open. `null` = no requirement: the one remaining
// mode needs nothing but the account's own Gateway.
export const STUDIO_MODE_REQUIREMENTS = Object.freeze({
  text: null,
});

// Mode ids that EXISTED and were retired with the local engine. Kept ONLY so an
// indirect entry path can be recognised and contained explicitly rather than
// falling through an `undefined` lookup — never to describe, offer or restore
// them. Nothing renders from this list.
export const RETIRED_STUDIO_MODES = Object.freeze([
  'img2img', 'inpaint', 'video', 'flf', 'presenter', 'character', 'album', 'lock',
]);

// The mode every unavailable request falls back into. Always available.
export const STUDIO_FALLBACK_MODE = 'text';

// Is this mode offerable? There is no capability argument by design: a mode is
// either part of the product or it is not.
export function isStudioModeAvailable(modeId) {
  if (typeof modeId !== 'string' || !modeId) return false;
  return Object.prototype.hasOwnProperty.call(STUDIO_MODE_REQUIREMENTS, modeId);
}

export const isRetiredStudioMode = (modeId) => RETIRED_STUDIO_MODES.includes(modeId);

// Every mode id the Studio can open.
export function availableStudioModeIds() {
  return Object.keys(STUDIO_MODE_REQUIREMENTS);
}

// Resolve a REQUESTED mode (hand-off, restored state, deep link, internal
// transition) against the authoritative set.
//   available   → { mode: requested, contained: false }
//   unavailable → { mode: fallback,  contained: true, retired: <bool> }
// `contained: true` is what the UI uses to tell the user truthfully that the
// requested option is not available here, instead of silently doing something
// else — and it guarantees a retired panel is never the rendered state.
export function resolveStudioMode(requested, fallback = STUDIO_FALLBACK_MODE) {
  if (isStudioModeAvailable(requested)) return { mode: requested, contained: false, retired: false };
  const safe = isStudioModeAvailable(fallback) ? fallback : STUDIO_FALLBACK_MODE;
  return { mode: safe, contained: true, retired: isRetiredStudioMode(requested) };
}

// Business-facing label per mode, used when a capability description has to
// ENUMERATE what the product can actually do (Jake's prompt). Kept here, next to
// the requirements, so an added mode cannot be described without one.
export const STUDIO_MODE_LABELS = Object.freeze({
  text: 'יצירת תמונה מתיאור',
});

// Labels of exactly the modes the Studio can open.
export function availableStudioModeLabels() {
  return availableStudioModeIds().map((id) => STUDIO_MODE_LABELS[id]).filter(Boolean);
}

// The availability snapshot consumers inject into the pure data layer. It no
// longer carries a `capabilities` map or a subfeature registry: with the local
// engine gone there is no gated subfeature and no capability to report.
export function studioAvailability() {
  return {
    modes: availableStudioModeIds(),
    modeLabels: availableStudioModeLabels(),
  };
}

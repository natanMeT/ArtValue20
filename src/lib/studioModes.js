// ===================================================================
// studioModes — THE authoritative source for which Studio creative modes
// the active configuration can actually offer.
//
// WHY THIS EXISTS
// Before this module the capability filter lived inline in ImageStudio and
// guarded only the *visible mode tiles*. Every other entry path — a Jake→Studio
// hand-off, restored router state, a deep link — set `mode` directly, and the
// panels render from `mode`, not from the tile list. A hosted build therefore
// hid the "פרזנטור מוצר" tile while still rendering its two-image panel when a
// hand-off asked for it, and the resulting failure surfaced a raw engine error.
// (Proven in the DOM against a hosted-configuration build before this fix.)
//
// CONTRACT
//   - Requirements live HERE and nowhere else. A mode's availability is a
//     function of capabilities only — never of what happens to be rendered.
//   - FAIL CLOSED. An unknown mode id, an unknown requirement, or missing
//     capability data all resolve to "unavailable". A mode is offered only when
//     its requirement is positively satisfied.
//   - PURE. No imports, no runtime probing, no window/storage/clock. The live
//     capability snapshot is supplied by the caller (see
//     `liveStudioCapabilities()` in geminiImage.js), which keeps this module
//     trivially testable and keeps Jake's data layer free of engine imports.
// ===================================================================

// Capability key required by each mode. `null` = always available (the hosted
// cloud lanes). Every mode id the Studio can hold MUST appear here — a missing
// entry is treated as unavailable, and a test pins the two lists together.
export const STUDIO_MODE_REQUIREMENTS = Object.freeze({
  text: null,
  lock: null,
  img2img: 'comfy',
  inpaint: 'comfy',
  video: 'video',
  flf: 'ltx',
  presenter: 'qwen',
  character: 'character',
  album: 'pulid',
});

// The mode every unavailable request falls back into. Always available.
export const STUDIO_FALLBACK_MODE = 'text';

// Does `caps` satisfy a single requirement key? Unknown key → false (closed).
function satisfies(need, caps) {
  const c = caps || {};
  switch (need) {
    case 'comfy': return Boolean(c.comfy);
    case 'video': return Boolean(c.video || c.ltx);
    case 'ltx': return Boolean(c.ltx);
    case 'kontext': return Boolean(c.kontext);
    case 'character': return Boolean(c.kontext || c.pulid);
    case 'pulid': return Boolean(c.pulid);
    case 'qwen': return Boolean(c.qwen);
    default: return false;
  }
}

// Is this mode offerable under these capabilities? Fail closed on anything
// unrecognised — an unknown id must never render a panel.
export function isStudioModeAvailable(modeId, caps) {
  if (typeof modeId !== 'string' || !modeId) return false;
  if (!Object.prototype.hasOwnProperty.call(STUDIO_MODE_REQUIREMENTS, modeId)) return false;
  const need = STUDIO_MODE_REQUIREMENTS[modeId];
  if (need === null) return true;
  return satisfies(need, caps);
}

// Every mode id offerable under these capabilities.
export function availableStudioModeIds(caps) {
  return Object.keys(STUDIO_MODE_REQUIREMENTS).filter((id) => isStudioModeAvailable(id, caps));
}

// Resolve a REQUESTED mode (hand-off, restored state, deep link, internal
// transition) against the authoritative set.
//   available   → { mode: requested, contained: false }
//   unavailable → { mode: fallback,  contained: true  }
// `contained: true` is what the UI uses to tell the user truthfully that the
// requested option is not available here, instead of silently doing something
// else — and it guarantees the hidden panel is never the rendered state.
export function resolveStudioMode(requested, caps, fallback = STUDIO_FALLBACK_MODE) {
  if (isStudioModeAvailable(requested, caps)) return { mode: requested, contained: false };
  const safe = isStudioModeAvailable(fallback, caps) ? fallback : STUDIO_FALLBACK_MODE;
  return { mode: safe, contained: true };
}

// Business-facing label per mode, used when a capability description has to
// ENUMERATE what this configuration can actually do (Jake's prompt). Kept here,
// next to the requirements, so an added mode cannot be described without one.
export const STUDIO_MODE_LABELS = Object.freeze({
  text: 'יצירת תמונה מתיאור',
  lock: 'מוצר מדויק (שימור פרטי המוצר)',
  img2img: 'עריכת תמונה קיימת',
  inpaint: 'עריכת אזור מסומן',
  video: 'הנפשת תמונה לסרטון',
  flf: 'סרטון מעבר לפני/אחרי',
  presenter: 'ויזואל מוצר עם פרזנטור',
  character: 'ערכת דמות עקבית',
  album: 'אלבום דוגמנית',
});

// Labels of exactly the modes this configuration can open, in requirement order.
export function availableStudioModeLabels(caps) {
  return availableStudioModeIds(caps).map((id) => STUDIO_MODE_LABELS[id]).filter(Boolean);
}

// The full availability snapshot consumers inject into the pure data layer.
export function studioAvailability(caps) {
  return {
    modes: availableStudioModeIds(caps),
    modeLabels: availableStudioModeLabels(caps),
    capabilities: {
      comfy: Boolean(caps && caps.comfy),
      video: Boolean(caps && caps.video),
      ltx: Boolean(caps && caps.ltx),
      kontext: Boolean(caps && caps.kontext),
      pulid: Boolean(caps && caps.pulid),
      qwen: Boolean(caps && caps.qwen),
    },
  };
}

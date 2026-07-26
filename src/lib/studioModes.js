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

// ===================================================================
// GATED SUBFEATURES — a capability that lives INSIDE an available mode.
//
// WHY THIS EXISTS
// "Product Lock" (`lock`) is available everywhere, but its AI seam/shadow
// enhancement (B2) needs the local engine. Round 3 gated the BUTTON and the
// Jake capability description, and considered the class closed. It was not:
// the mode's own help paragraph still told hosted users to click «שפר חיבור
// וצללים», a control they could not see. The gate had been applied to the
// ACTION, not to every reference to the thing being gated.
//
// So the subfeature is now ONE record: its requirement AND every string that
// names it. A surface cannot render the label without asking this module
// whether it is available, because the surface does not own the text.
// A test asserts these literals appear in no other source file.
// ===================================================================
export const STUDIO_SUBFEATURES = Object.freeze({
  'product-lock-blend': Object.freeze({
    id: 'product-lock-blend',
    parentMode: 'lock',
    requires: 'comfy',
    // the control
    actionLabel: 'שפר חיבור וצללים',
    busyLabel: 'משפר חיבור…',
    // the help text that TELLS the user to use the control
    guidance: 'אחרי יצירת הקומפוזיט המדויק אפשר ללחוץ «שפר חיבור וצללים» — AI יוסיף צל מגע וחיבור טבעי סביב הקצוות בלבד.',
    actionNote: 'שיפור החיבור משתמש ב־AI רק באזור הקצוות והצללים. המוצר עצמו נשמר מוגן, כדי שלוגו, טקסט ופרטי מוצר לא ייווצרו מחדש.',
    // how Jake is allowed to describe it
    title: 'שיפור חיבור וצללים (Product Lock B2)',
    description: 'בתוך "מוצר מדויק": AI מוסיף צל מגע וחיבור טבעי סביב הקצוות בלבד — פיקסלי המוצר נשמרים 1:1.',
    capabilityText: 'ניתן גם לשפר את החיבור והצללים סביב קצוות המוצר באמצעות AI, בלי לגעת במוצר עצמו.',
  }),
});

// The keys of a subfeature record that are USER-VISIBLE TEXT. The uniqueness
// invariant is stated here so adding a new text field extends it automatically.
export const SUBFEATURE_TEXT_FIELDS = Object.freeze([
  'actionLabel', 'busyLabel', 'guidance', 'actionNote', 'title', 'description', 'capabilityText',
]);

// Available only when the PARENT MODE is open AND the subfeature's own
// requirement is satisfied. Unknown id → false (closed).
export function isStudioSubfeatureAvailable(id, caps) {
  const def = Object.prototype.hasOwnProperty.call(STUDIO_SUBFEATURES, id) ? STUDIO_SUBFEATURES[id] : null;
  if (!def) return false;
  if (!isStudioModeAvailable(def.parentMode, caps)) return false;
  return satisfies(def.requires, caps);
}

// THE accessor every surface uses. Returns the record plus `available`, so the
// decision and the text it unlocks arrive together and cannot drift apart.
// Unknown id → a closed record with empty text (fail closed, never throws).
const CLOSED_SUBFEATURE = Object.freeze({ id: '', available: false, actionLabel: '', busyLabel: '', guidance: '', actionNote: '', title: '', description: '', capabilityText: '' });
export function studioSubfeature(id, caps) {
  const def = Object.prototype.hasOwnProperty.call(STUDIO_SUBFEATURES, id) ? STUDIO_SUBFEATURES[id] : null;
  if (!def) return CLOSED_SUBFEATURE;
  return { ...def, available: isStudioSubfeatureAvailable(id, caps) };
}

// Every subfeature, keyed by id, for injection into the pure data layer.
export function studioSubfeatureSnapshot(caps) {
  const out = {};
  for (const id of Object.keys(STUDIO_SUBFEATURES)) out[id] = studioSubfeature(id, caps);
  return out;
}

// The full availability snapshot consumers inject into the pure data layer.
export function studioAvailability(caps) {
  return {
    modes: availableStudioModeIds(caps),
    modeLabels: availableStudioModeLabels(caps),
    subfeatures: studioSubfeatureSnapshot(caps),
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

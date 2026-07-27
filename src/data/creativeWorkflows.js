// ===================================================================
// Creative Workflow Map — PURE DATA. A presentational catalog that maps
// the existing ArtValue creative tools into clear, business-focused
// workflows. No functions with side effects, no network, no engine
// imports, no browser APIs. Each card either points at an existing Image
// Studio mode (`mode`) or an existing hash route (`route`), or is marked
// `soon` (no runtime target). This file NEVER triggers generation.
//
// PRODUCT BOUNDARY (2026-07-27): the Studio is cloud/Gateway only. Every card
// that targeted a local-engine mode (smart edit, area edit, image→video,
// before/after, product presenter, character series, model album) was REMOVED
// with that mode, and the `comfyui` / `fooocus` engine labels went with them —
// `engine` now names only lanes the product actually has. Jake reads this field,
// so a retired engine name here would advertise a retired capability.
//
// engine: 'gateway' (the account's protected AI Gateway) | 'browser' (canvas only)
// status: 'live' | 'soon'
// `mode` values match ImageStudio MODES ids (text / lock). `route` values are
// existing hash routes only.
// ===================================================================

// Consent-safe note surfaced on reference-image workflows.
export const CONSENT_NOTE = 'לשימוש בתמונות שיש לך הרשאה להשתמש בהן בלבד.';

export const WORKFLOW_ENGINES = ['gateway', 'browser'];
export const WORKFLOW_STATUSES = ['live', 'soon'];

// Human-friendly engine labels for badges (presentational).
export const ENGINE_LABEL = {
  gateway: 'ענן',
  browser: 'דפדפן',
};

export const CREATIVE_WORKFLOWS = [
  // ---- Live: existing Image Studio modes ----
  {
    id: 'fast-image',
    title: 'תמונה מהירה',
    subtitle: 'טקסט → תמונה',
    description: 'ויזואל עסקי מהיר מתיאור: לוגו, מוצר, באנר או תמונת נושא.',
    engine: 'gateway',
    status: 'live',
    category: 'create',
    mode: 'text',
    route: null,
    cta: 'פתח',
    tags: ['טקסט לתמונה', 'קונספט', 'מהיר'],
  },
  {
    id: 'product-lock',
    title: 'מוצר מדויק',
    subtitle: 'Product Lock · קומפוזיט',
    description: 'הרכבת תמונת מוצר על רקע או סצנה חדשה, כשפיקסלי המוצר נשמרים 1:1 — לוגו, טקסט ופרטי מוצר אינם נוצרים מחדש.',
    engine: 'browser',
    status: 'live',
    category: 'commerce',
    mode: 'lock',
    route: null,
    cta: 'פתח',
    tags: ['מוצר', 'דיוק', 'קומפוזיט'],
    consent: true,
  },
  // ---- Coming soon (no runtime target) ----
  {
    id: 'jewelry-composer',
    title: 'שילוב תכשיט',
    subtitle: 'פרזנטור + תכשיט',
    description: 'הצבת תכשיט או אקססורי באופן טבעי על הדמות תוך שמירת זהות. יכולת עתידית.',
    engine: 'gateway',
    status: 'soon',
    category: 'commerce',
    mode: null,
    route: null,
    cta: 'בקרוב',
    tags: ['תכשיט', 'אקססורי', 'עתידי'],
    consent: true,
  },
  {
    id: 'outfit-change',
    title: 'החלפת לבוש',
    subtitle: 'פרזנטור + בגד',
    description: 'החלפת או שילוב לבוש על הדמות. משוער כיום; התאמה מדויקת תדרוש מודלים נוספים בהמשך.',
    engine: 'gateway',
    status: 'soon',
    category: 'commerce',
    mode: null,
    route: null,
    cta: 'בקרוב',
    tags: ['אופנה', 'לבוש', 'עתידי'],
    consent: true,
  },
  {
    id: 'identity-pack',
    title: 'זהות קבועה לשימוש חוזר',
    subtitle: 'פרופיל דמות לשימוש חוזר',
    description: 'פרופיל דמות יציב לשימוש חוזר. נדחה — נעילת הזהות הקיימת מכסה כבר את רוב השימוש.',
    engine: 'gateway',
    status: 'soon',
    category: 'identity',
    mode: null,
    route: null,
    cta: 'בקרוב',
    tags: ['זהות', 'פרופיל', 'עתידי'],
    consent: true,
  },
];

// --- Pure selectors (presentational helpers) ---
export const liveWorkflows = () => CREATIVE_WORKFLOWS.filter((w) => w.status === 'live');
export const soonWorkflows = () => CREATIVE_WORKFLOWS.filter((w) => w.status === 'soon');

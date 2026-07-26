// ===================================================================
// Creative Workflow Map — PURE DATA. A presentational catalog that maps
// the existing ArtValue creative tools into clear, business-focused
// workflows. No functions with side effects, no network, no engine
// imports, no browser APIs. Each card either points at an existing Image
// Studio mode (`mode`) or an existing hash route (`route`), or is marked
// `soon` (no runtime target). This file NEVER triggers generation.
//
// engine: 'comfyui' | 'fooocus' | 'mixed'
// status: 'live' | 'soon'
// `mode` values match ImageStudio MODES ids (text/img2img/inpaint/video/
// flf/character/album). `route` values are existing hash routes only.
// (R4.1: the Workflow Studio + Fooocus route cards were retired with their
// pages; every live card now targets an ImageStudio mode, and `route` stays
// in the schema for future non-retired destinations.)
// ===================================================================

// Consent-safe note surfaced on presenter/reference workflows.
export const CONSENT_NOTE = 'לשימוש בתמונות שיש לך הרשאה להשתמש בהן בלבד.';

export const WORKFLOW_ENGINES = ['comfyui', 'fooocus', 'mixed', 'browser'];
export const WORKFLOW_STATUSES = ['live', 'soon'];

// Human-friendly engine labels for badges (presentational).
export const ENGINE_LABEL = {
  comfyui: 'ComfyUI',
  fooocus: 'Fooocus',
  mixed: 'Mixed',
  browser: 'דפדפן',
};

export const CREATIVE_WORKFLOWS = [
  // ---- Live: existing Image Studio modes ----
  {
    id: 'fast-image',
    title: 'תמונה מהירה',
    subtitle: 'טקסט → תמונה',
    description: 'ויזואל עסקי מהיר מתיאור: לוגו, מוצר, באנר או תמונת נושא.',
    engine: 'comfyui',
    status: 'live',
    category: 'create',
    mode: 'text',
    route: null,
    cta: 'פתח',
    tags: ['טקסט לתמונה', 'קונספט', 'מהיר'],
  },
  {
    id: 'smart-edit',
    title: 'עריכה חכמה',
    subtitle: 'עריכה לפי הוראה',
    description: 'שינוי לפי הוראה בעברית תוך שמירה על הדמות והקומפוזיציה המקוריות.',
    engine: 'comfyui',
    status: 'live',
    category: 'edit',
    mode: 'img2img',
    route: null,
    cta: 'פתח',
    tags: ['עריכה', 'שמירת זהות'],
  },
  {
    id: 'area-edit',
    title: 'עריכת אזור',
    subtitle: 'החלפת אזור מסומן',
    description: 'סימון אזור עם מברשת ומילוי מחדש ממנו בלבד — השאר נשאר מדויק.',
    engine: 'comfyui',
    status: 'live',
    category: 'edit',
    mode: 'inpaint',
    route: null,
    cta: 'פתח',
    tags: ['אזור', 'מסכה', 'רקע'],
  },
  {
    id: 'image-to-video',
    title: 'תמונה לווידאו',
    subtitle: 'הנפשה מתמונה',
    description: 'הפיכת תמונה לסרטון קצר עם תנועה לפי תיאור. הפלט הנוכחי הוא WebP מונפש.',
    engine: 'comfyui',
    status: 'live',
    category: 'video',
    mode: 'video',
    route: null,
    cta: 'פתח',
    tags: ['וידאו', 'הנפשה', 'WebP'],
  },
  {
    id: 'before-after',
    title: 'לפני / אחרי',
    subtitle: 'מעבר בין שני פריימים',
    description: 'סרטון שמתחיל בתמונה אחת ומסתיים בשנייה, עם מעבר חלק — מושלם לסרטוני שינוי.',
    engine: 'comfyui',
    status: 'live',
    category: 'video',
    mode: 'flf',
    route: null,
    cta: 'פתח',
    tags: ['וידאו', 'טרנספורמציה'],
  },
  {
    id: 'character-series',
    title: 'סדרת דמות',
    subtitle: 'דמות עקבית · וריאציות',
    description: 'מתמונת ייחוס אחת — סט פרזנטור עקבי: אותה דמות בזוויות, תנוחות ורקעים שונים. כל תמונה מהסט ניתנת לשימוש כפרזנטור מוצר.',
    engine: 'comfyui',
    status: 'live',
    category: 'identity',
    mode: 'character',
    route: null,
    cta: 'פתח',
    tags: ['זהות', 'סדרה', 'עקביות'],
    consent: true,
  },
  {
    id: 'model-album',
    title: 'אלבום דוגמנית',
    subtitle: '8 זוויות מתמונה + בגד',
    description: 'תמונת פנים + תיאור בגד → 8 זוויות עם אותה דמות בדיוק ועור טבעי, נשמר כאלבום.',
    engine: 'comfyui',
    status: 'live',
    category: 'identity',
    mode: 'album',
    route: null,
    cta: 'פתח',
    tags: ['אלבום', 'זהות', 'אופנה'],
    consent: true,
  },
  {
    id: 'product-presenter',
    title: 'פרזנטור מוצר',
    subtitle: 'פרזנטור + מוצר',
    description: 'שילוב תמונת מוצר עם פרזנטור ליצירת ויזואל שיווקי. אפשר לבחור פרזנטור ישירות מהגלריה. הקומפוזיציה מבוססת AI ועשויה להיות מקורבת.',
    engine: 'comfyui',
    status: 'live',
    category: 'commerce',
    mode: 'presenter',
    route: null,
    cta: 'פתח',
    tags: ['מוצר', 'שיווק', 'קמפיין'],
    consent: true,
  },
  {
    id: 'product-lock',
    title: 'מוצר מדויק',
    subtitle: 'Product Lock · קומפוזיט',
    description: 'הרכבת תמונת מוצר על רקע או סצנה חדשה, כשפיקסלי המוצר נשמרים 1:1 — לוגו, טקסט ופרטי מוצר אינם נוצרים מחדש.',
    // The AI seam/shadow enhancement (Product Lock B2) needs the local engine.
    // It is a GATED SUBFEATURE of an otherwise-available mode, so it is declared
    // here instead of being asserted inside the always-visible description.
    subfeatures: [
      { id: 'lock-blend', requires: 'comfy', text: 'ניתן גם לשפר את החיבור והצללים סביב קצוות המוצר באמצעות AI, בלי לגעת במוצר עצמו.' },
    ],
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
    engine: 'comfyui',
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
    engine: 'comfyui',
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
    engine: 'comfyui',
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

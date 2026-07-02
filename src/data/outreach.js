// ===================================================================
// Outreach ("מחקר לידים") — cold-prospect categories + opening messages.
// Positioning: ArtValue is a business-systems studio (CRM, דשבורדים,
// אוטומציות, מעקב פניות) — the website/landing page is one component of
// the system, not the whole offer. Messages lead with business order and
// saved manual work; {name} is filled by buildMessage(). IDs are STABLE —
// persisted leads reference them (see store.jsx).
// ===================================================================

export const CATS = [
  {
    id: 'winery',
    label: 'יקבים ומבשלות',
    icon: '🍷',
    msg: `היי {name} 👋\nשמי נתן מ-Art Value, אני בונה לעסקים מערכות דיגיטליות — CRM, דשבורדים ומעקב פניות — לצד אתרים ודפי נחיתה.\nיקב כמו שלכם מנהל הרבה במקביל: מועדון לקוחות, הזמנות, סיורים וטעימות. כשהכול מפוזר בין וואטסאפ, אקסל ופתקים — פניות נופלות בין הכיסאות.\nאני בונה מערכת אחת שמרכזת את זה: לקוח, הזמנה, פולואפ ותזכורת — במקום אחד.\nיש לכם 15 דקות לשיחה קצרה השבוע? אשמח להראות דוגמה חיה.`,
  },
  {
    id: 'food',
    label: 'מסעדות ובתי קפה בוטיק',
    icon: '☕',
    msg: `היי {name} 👋\nכאן נתן מ-Art Value, אני בונה לעסקים מערכות שמסדרות את היום-יום — ניהול לקוחות, אירועים ופולואפים — לצד אתר ותפריט דיגיטלי.\nמקום כמו שלכם מקבל פניות מכל כיוון: טלפון, אינסטגרם, וואטסאפ. מערכת קטנה שמרכזת את הפניות, האירועים והלקוחות החוזרים חוסכת הרבה עבודה ידנית.\nנוכל לדבר 15 דקות השבוע? אראה לכם איך זה נראה בפועל.`,
  },
  {
    id: 'art',
    label: 'גלריות ואמנים',
    icon: '🎨',
    msg: `היי {name} 👋\nשמי נתן מ-Art Value, אני בונה לאמנים וגלריות מערכות עבודה — ניהול אספנים, מכירות ופניות — לצד תיק עבודות אונליין.\nהעבודות שלכם מרשימות, ודווקא בגלל זה שווה שגם הצד העסקי יהיה מסודר: מי התעניין, במה, ומתי לחזור אליו.\nמערכת אחת שמרכזת אספנים, עבודות ופולואפים — ותיק העבודות הוא חלון הראווה שלה.\nיש לכם 15 דקות לשיחה השבוע?`,
  },
  {
    id: 'beauty',
    label: 'יופי וקוסמטיקה',
    icon: '💅',
    msg: `היי {name} 👋\nכאן נתן מ-Art Value, אני בונה לעסקי יופי מערכות לניהול תורים, לקוחות חוזרים ותזכורות — לצד דף תדמית שנראה ברמה של העבודה שלכם.\nראיתי את העמוד שלכם — עסק עם קהל חוזר כמו שלכם מרוויח הכי הרבה ממערכת שזוכרת בשבילכם: מי היה אצלכם, באיזה טיפול, ומתי הזמן לפולואפ.\nנוכל לדבר 15 דקות השבוע?`,
  },
  {
    id: 'hospitality',
    label: 'אירוח בוטיק וצימרים',
    icon: '🏡',
    msg: `היי {name} 👋\nמדבר נתן מ-Art Value, אני בונה לעסקי אירוח מערכות לניהול הזמנות, אורחים ומעקב פניות — לצד אתר שמביא הזמנות ישירות.\nהמקום שלכם נראה קסום — והחלק שהכי שווה לסדר הוא מה שקורה מסביב: פניות שמגיעות מכמה ערוצים, זמינות, מקדמות ואורחים חוזרים, הכול במקום אחד.\nיש לכם 15 דקות לשיחה קצרה השבוע?`,
  },
  {
    id: 'judaica',
    label: 'תכשיטים ויודאיקה',
    icon: '✡️',
    msg: `היי {name} 👋\nשמי נתן מ-Art Value, אני בונה לעסקי אומנות ובוטיק מערכות עבודה — ניהול הזמנות מיוחדות, מלאי ולקוחות — לצד חנות אונליין כשצריך.\nהעבודה שלכם ייחודית, ובעסק של הזמנות בהתאמה אישית כל פנייה שווה הרבה — מערכת שמרכזת את הפניות והפולואפים דואגת שאף אחת לא תלך לאיבוד.\nנוכל לדבר 15 דקות השבוע? אשמח להראות דוגמאות.`,
  },
  {
    id: 'clinic',
    label: 'קליניקות ומטפלים',
    icon: '🩺',
    msg: `היי {name} 👋\nכאן נתן מ-Art Value, אני בונה לקליניקות ומטפלים מערכות לניהול מטופלים, תורים ומעקב פניות — לצד אתר שמשדר אמון עוד לפני הפגישה.\nראיתי את הדף שלכם — בקליניקה עמוסה, מערכת שמרכזת פניות חדשות, תורים ופולואפים חוסכת המון ניהול ידני ומונעת פספוסים.\nיש לכם 15 דקות השבוע?`,
  },
  {
    id: 'services',
    label: 'נותני שירות ועסקים קטנים',
    icon: '🧰',
    msg: `היי {name} 👋\nשמי נתן מ-Art Value, אני בונה לעסקים מערכות CRM ודשבורדים שעוזרים לרכז לידים, לקוחות, משימות ופולואפים במקום אחד.\nעסק שירות כמו שלכם מקבל פניות מכל כיוון — טלפון, וואטסאפ, פייסבוק — ומערכת קטנה שמסדרת את הלידים והמעקב אחרי פניות חוסכת הרבה עבודה ידנית.\nואם צריך — גם אתר או דף נחיתה נבנים כחלק מאותה מערכת.\nנוכל לדבר 15 דקות השבוע?`,
  },
];

// Per-category fallback "need" — used when a lead has no specific need
// (e.g. older leads created before this field, or manually-added leads).
export const OUTREACH_NEEDS_DEFAULT = {
  winery: 'מערכת לניהול מועדון לקוחות, הזמנות וטעימות — עם אתר מותג כחלק מהמערכת',
  food: 'מערכת שמרכזת פניות, אירועים ולקוחות חוזרים + תפריט דיגיטלי והזמנת שולחן',
  art: 'CRM לאספנים, מכירות ופניות + תיק עבודות אונליין כחלון הראווה',
  beauty: 'מערכת תורים, לקוחות חוזרים ותזכורות פולואפ + דף תדמית ברמת העבודה',
  hospitality: 'מערכת הזמנות ואורחים עם מעקב פניות, יומן זמינות ותשלום מקדמה',
  judaica: 'מערכת לניהול הזמנות מיוחדות, מלאי ולקוחות + חנות אונליין כשצריך',
  clinic: 'מערכת מטופלים ותורים עם מעקב פניות + אתר שמשדר אמון',
  services: 'מערכת CRM שמרכזת לידים, לקוחות, משימות ופולואפים במקום אחד',
};

// Original starter leads (fresh installs only — existing local lists are
// untouched). Names editable; "need" blends system + digital presence.
const OUTREACH_ORIGINAL = [
  { category: 'winery', name: 'יקב — ערוך שם', need: 'מערכת מועדון לקוחות והזמנת טעימות + אתר עם סיפור מותג' },
  { category: 'winery', name: 'מבשלת בירה — ערוך שם', need: 'מערכת הזמנות לבארים ואירועים + חנות אונליין ומבצעים מתחלפים' },
  { category: 'food', name: 'מסעדת שף — ערוך שם', need: 'ריכוז פניות והזמנות אירועים במערכת אחת + תפריט דיגיטלי' },
  { category: 'food', name: 'בית קפה בוטיק — ערוך שם', need: 'מערכת לניהול קייטרינג/אירועים + אתר עם תפריט ושעות פתיחה' },
  { category: 'art', name: 'גלריה — ערוך שם', need: 'CRM אספנים ומעקב מכירות + תיק עבודות אונליין' },
  { category: 'beauty', name: 'מכון יופי — ערוך שם', need: 'מערכת תורים ולקוחות חוזרים עם תזכורות + גלריית לפני/אחרי' },
  { category: 'beauty', name: 'קליניקת קוסמטיקה — ערוך שם', need: 'מערכת טיפולים ומעקב לקוחות + דף יוקרתי עם מחירון ועדויות' },
  { category: 'hospitality', name: 'צימר — ערוך שם', need: 'מערכת זמינות והזמנות עם מעקב פניות ותשלום מקדמה' },
  { category: 'hospitality', name: 'מלונית בוטיק — ערוך שם', need: 'ריכוז פניות מכל הערוצים ואורחים חוזרים + אתר חוויתי' },
  { category: 'judaica', name: 'חנות תכשיטים — ערוך שם', need: 'מערכת הזמנות בהתאמה אישית ומלאי + חנות e-commerce' },
  { category: 'clinic', name: 'קליניקה פרטית — ערוך שם', need: 'מערכת מטופלים ותורים עם מעקב פניות + אתר שמשדר אמון' },
  { category: 'services', name: 'עסק שירות מקומי — ערוך שם', need: 'מערכת CRM שמרכזת לידים, לקוחות ופולואפים במקום אחד' },
];

// Extra conceptual leads — appended ONCE to existing lists (stable ids).
// Each has a tailored "need" = a concrete direction for what to pitch.
export const OUTREACH_EXTRA = [
  // יקבים ומבשלות
  { id: 'ext_w1', category: 'winery', name: 'יקב בוטיק בגליל', need: 'דף חבר מועדון יין (מנוי חודשי) עם תשלום מאובטח' },
  { id: 'ext_w2', category: 'winery', name: 'מבשלת בירה קראפט', need: 'קטלוג סדרות עונתיות + טופס הזמנה לאירועים ובארים' },
  { id: 'ext_w3', category: 'winery', name: 'יקב משפחתי', need: 'סיפור מסורת ומשפחה באתר + הזמנת סיורים וטעימות' },
  { id: 'ext_w4', category: 'winery', name: 'מזקקת ג׳ין בוטיק', need: 'מיתוג פרימיום ועיצוב אריזה + אתר תדמית יוקרתי' },
  { id: 'ext_w5', category: 'winery', name: 'חנות יין מקוונת', need: 'חנות e-commerce עם סינון לפי טעם ומשלוח עד הבית' },
  // מסעדות ובתי קפה
  { id: 'ext_f1', category: 'food', name: 'מסעדה ים-תיכונית', need: 'הזמנת מקום אונליין + חיבור לגוגל/וויז וצילומי מנות' },
  { id: 'ext_f2', category: 'food', name: 'פיצרייה נאפוליטנה', need: 'הזמנות אונליין למשלוח/איסוף עם תשלום ותפריט מתעדכן' },
  { id: 'ext_f3', category: 'food', name: 'בר קוקטיילים', need: 'אתר אווירה לילי + הזמנת שולחן ואירועים פרטיים' },
  { id: 'ext_f4', category: 'food', name: 'קונדיטוריה בוטיק', need: 'חנות לעוגות בהזמנה מראש עם בורר תאריך אירוע' },
  { id: 'ext_f5', category: 'food', name: 'פוד-טראק', need: 'דף עם מפת מיקום יומי בזמן אמת + תפריט וקייטרינג' },
  { id: 'ext_f6', category: 'food', name: 'מסעדת בשרים', need: 'גלריית מנות + תפריט אירועים/קבוצות והזמנת שולחן' },
  { id: 'ext_f7', category: 'food', name: 'בית קפה עם אפייה', need: 'תפריט QR + תוכנית נאמנות דיגיטלית ללקוחות' },
  // גלריות ואמנים
  { id: 'ext_a1', category: 'art', name: 'אמן/צייר עצמאי', need: 'פורטפוליו נקי + טופס הזמנת עבודות בהתאמה אישית' },
  { id: 'ext_a2', category: 'art', name: 'סטודיו קרמיקה', need: 'חנות אונליין לכלים + הרשמה לסדנאות' },
  { id: 'ext_a3', category: 'art', name: 'צלם אמן', need: 'תיק עבודות מרשים + הזמנת צילומים והדפסות' },
  { id: 'ext_a4', category: 'art', name: 'גלריית אמנות עכשווית', need: 'קטלוג תערוכות מתחלף + ניוזלטר והזמנות לפתיחות' },
  { id: 'ext_a5', category: 'art', name: 'אמן פיסול/מיצב', need: 'אתר תדמית עם חוויית גלילה וסיפור אמן' },
  // יופי וקוסמטיקה
  { id: 'ext_b1', category: 'beauty', name: 'מספרה/סלון שיער', need: 'הזמנת תורים אונליין + תזכורות וגלריית עבודות' },
  { id: 'ext_b2', category: 'beauty', name: 'אקדמיה לציפורניים', need: 'דף קורסים עם הרשמה ותשלום + פורטפוליו בוגרות' },
  { id: 'ext_b3', category: 'beauty', name: 'סטודיו איפור כלות', need: 'חבילות לכלות/אירועים + הזמנת תאריך אונליין' },
  { id: 'ext_b4', category: 'beauty', name: 'ספא ומרכז בריאות', need: 'הזמנת חבילות ספא + שוברי מתנה דיגיטליים' },
  { id: 'ext_b5', category: 'beauty', name: 'קוסמטיקה רפואית', need: 'מחירון שקוף, הזמנת תור ובלוג שמדגיש מומחיות' },
  { id: 'ext_b6', category: 'beauty', name: 'סלון גבות וריסים', need: 'הזמנת תור מהירה + תוכנית נאמנות ותמונות תוצאה' },
  // אירוח בוטיק
  { id: 'ext_h1', category: 'hospitality', name: 'סוויטות נופש', need: 'הזמנה ישירה (חיסכון בעמלות בוקינג) + גלריה מפתה' },
  { id: 'ext_h2', category: 'hospitality', name: 'בקתות בטבע', need: 'דף חוויית טבע + יומן זמינות והזמנה מהירה' },
  { id: 'ext_h3', category: 'hospitality', name: 'אירוח כפרי/חווה', need: 'פעילויות, חבילות זוגיות והזמנה אונליין' },
  { id: 'ext_h4', category: 'hospitality', name: 'גלמפינג יוקרתי', need: 'מיתוג חוויתי + אתר עם וידאו אווירה והזמנה מאובטחת' },
  { id: 'ext_h5', category: 'hospitality', name: 'וילה לאירועים', need: 'גלריית אירועים, טופס הצעת מחיר ולוח זמינות' },
  // תכשיטים ויודאיקה
  { id: 'ext_j1', category: 'judaica', name: 'אמן יודאיקה', need: 'חנות אונליין לפריטי יודאיקה + הזמנות מותאמות אישית' },
  { id: 'ext_j2', category: 'judaica', name: 'צורף עצמאי', need: 'פורטפוליו תכשיטים + הזמנת עיצוב בהתאמה אישית' },
  { id: 'ext_j3', category: 'judaica', name: 'חנות מתנות יודאיקה', need: 'קטלוג עם מכירה אונליין ומשלוחים לחו״ל' },
  { id: 'ext_j4', category: 'judaica', name: 'סטודיו לתשמישי קדושה', need: 'אתר תדמית עם סיפור אומנות + קטלוג והזמנה' },
  // קליניקות ומטפלים
  { id: 'ext_c1', category: 'clinic', name: 'פיזיותרפיה/אוסטאופתיה', need: 'דף שירותים ממוקד + הזמנת תור ומאמרי מומחיות (SEO)' },
  { id: 'ext_c2', category: 'clinic', name: 'מרפאת שיניים', need: 'אתר מקצועי עם הזמנת תור, מחירון שקוף ועדויות' },
  { id: 'ext_c3', category: 'clinic', name: 'פסיכולוג/מטפל', need: 'אתר רגוע ואמין + טופס יצירת קשר דיסקרטי וזמינות' },
  { id: 'ext_c4', category: 'clinic', name: 'רפואה משלימה/נטורופת', need: 'הסבר שיטה, הזמנת ייעוץ ובלוג שמושך לקוחות' },
  { id: 'ext_c5', category: 'clinic', name: 'מרפאת אסתטיקה', need: 'גלריית לפני/אחרי, מחירון והזמנת התייעצות' },
];

// Full catalog for a fresh install (original + extra).
export const OUTREACH_SEED = [...OUTREACH_ORIGINAL, ...OUTREACH_EXTRA];

// Bump when the starter catalog changes — drives a one-time append for
// existing local lists (see store.jsx).
export const OUTREACH_SEED_VERSION = 2;

export const catById = (id) => CATS.find((c) => c.id === id) || CATS[0];

// Bridge into Growth OS Lead Mapping: outreach category id → growthLeads
// LEAD_CATEGORIES id, ONLY where the mapping is unambiguous. Unmapped
// categories resolve to undefined and leadsRouteForCategory() falls back
// to the plain /growth/leads list — never a broken link.
export const OUTREACH_TO_GROWTH_CATEGORY = {
  food: 'food',
  clinic: 'clinics',
  hospitality: 'hospitality',
  art: 'artists',
  services: 'service_pros',
};

// Resolve a lead's "need" with category fallback.
export const needFor = (lead) =>
  (lead && lead.need) || OUTREACH_NEEDS_DEFAULT[lead?.category] || '';

// fill {name} into a category's opening message
export function buildMessage(category, name) {
  return catById(category).msg.replaceAll('{name}', name || '');
}

export const OUTREACH_STATUS = ['pending', 'contacted', 'irrelevant'];

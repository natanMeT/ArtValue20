// ===================================================================
// Growth OS — Lead Mapping + Offer Strategy (Slice 2)
// Static, deterministic, presentational data. NO persistence, NO store,
// NO AI, NO network. Self-contained: the ArtValue service catalog here is
// MIRRORED locally on purpose — it must NOT import from src/creative/v2/offer/**
// (that engine is isolation-tested and sealed). Service names/concepts mirror
// the canonical catalog; this copy is free to evolve for Growth OS.
//
// Prices are DRAFT / ESTIMATED display ranges only — never fixed final pricing.
// ===================================================================

// Shown wherever a price appears, so a range is never read as a fixed quote.
export const PRICE_DISCLAIMER = 'טווח מומלץ · משוער · ניתן להתאמה לפי הלקוח והיקף העבודה';

// Deterministic thousands separator (locale-independent → stable output).
const sep = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// ---- mirrored ArtValue service catalog (with draft price bands in ₪) ----
export const SERVICES = {
  landing_basic:    { id: 'landing_basic',    name: 'דף נחיתה בסיסי',                 from: 1500, to: 3500 },
  website_premium:  { id: 'website_premium',  name: 'אתר תדמית פרימיום',              from: 3500, to: 8000 },
  crm_smart:        { id: 'crm_smart',        name: 'מערכת CRM חכמה',                 from: 4000, to: 12000 },
  crm_ai_full:      { id: 'crm_ai_full',      name: 'מערכת CRM מלאה עם עוזר AI',      from: 6000, to: 18000 },
  ai_assistant:     { id: 'ai_assistant',     name: 'עוזר AI בתוך מערכת קיימת',       from: 3000, to: 9000 },
  automation:       { id: 'automation',       name: 'אוטומציות / תהליכי מעקב',        from: 1500, to: 6000 },
  sales_funnel:     { id: 'sales_funnel',     name: 'משפך מכירה / מערכת לידים',       from: 3000, to: 8000 },
  graphics_ads:     { id: 'graphics_ads',     name: 'חבילת גרפיקה / מודעות / פוסטרים', from: 500,  to: 3000 },
  digital_presence: { id: 'digital_presence', name: 'חבילת נראות דיגיטלית',           from: 2500, to: 7500 },
  content_monthly:  { id: 'content_monthly',  name: 'חבילת תוכן חודשית',              from: 1200, to: 3500, period: 'month' },
  custom_demo:      { id: 'custom_demo',      name: 'דמו מותאם אישית',                from: 0,    to: 1500, note: 'לרוב ככלי סגירה — חינמי או בעלות נמוכה' },
  business_full:    { id: 'business_full',    name: 'מערכת ניהול עסק מלאה',           from: 6000, to: 20000 },
};

export const serviceById = (id) => SERVICES[id] || null;

// Formats a service price band, e.g. "₪1,500–3,500" or "₪1,200–3,500 לחודש".
export const formatBand = (svc) => {
  if (!svc) return '';
  const suffix = svc.period === 'month' ? ' לחודש' : '';
  return `₪${sep(svc.from)}–${sep(svc.to)}${suffix}`;
};

// ---- recommended next-action model (display-only; no dialer/WhatsApp wiring) ----
export const ACTIONS = {
  call:       { id: 'call',       label: 'שיחת טלפון',    icon: 'phone' },
  whatsapp:   { id: 'whatsapp',   label: 'הודעת וואטסאפ', icon: 'whatsapp' },
  voice_note: { id: 'voice_note', label: 'הודעה קולית',   icon: 'mic' },
  demo:       { id: 'demo',       label: 'דמו מותאם',     icon: 'wand' },
  follow_up:  { id: 'follow_up',  label: 'פולואפ',        icon: 'refresh' },
  meeting:    { id: 'meeting',    label: 'פגישה',         icon: 'calendar' },
};

export const actionById = (id) => ACTIONS[id] || null;

// ---- qualitative level scale (sales potential / urgency / close probability) ----
// Reuses existing badge classes for tone (green / amber / neutral).
const LEVEL_CLS = { high: 'badge-completed', medium: 'badge-payment', low: 'badge-neutral' };
const LEVEL_LABELS = {
  salesPotential: { high: 'פוטנציאל גבוה', medium: 'פוטנציאל בינוני', low: 'פוטנציאל נמוך' },
  urgency:        { high: 'דחיפות גבוהה',  medium: 'דחיפות בינונית', low: 'דחיפות נמוכה' },
  closeProbability: { high: 'סבירות סגירה גבוהה', medium: 'סבירות סגירה בינונית', low: 'סבירות סגירה נמוכה' },
};
export const levelMeta = (axis, level) => ({
  label: (LEVEL_LABELS[axis] && LEVEL_LABELS[axis][level]) || level,
  cls: LEVEL_CLS[level] || 'badge-neutral',
});

// ---- filter tabs (UI segmentation) ----
export const FILTERS = [
  { id: 'all',      label: 'הכל' },
  { id: 'high',     label: 'פוטנציאל גבוה' },
  { id: 'crm',      label: 'CRM / מערכות' },
  { id: 'web',      label: 'אתרים / נראות' },
  { id: 'graphics', label: 'גרפיקה / פרסום' },
  { id: 'followup', label: 'פולואפ / אוטומציות' },
];

// Pure predicate: does a category belong under a filter tab?
export const matchesFilter = (cat, filterId) => {
  if (filterId === 'all') return true;
  if (filterId === 'high') return cat.salesPotential === 'high';
  return Array.isArray(cat.tags) && cat.tags.includes(filterId);
};

// ---- lead category strategy catalog (the 12 approved categories) ----
export const LEAD_CATEGORIES = [
  {
    id: 'car_agencies',
    label: 'סוכנויות רכב',
    icon: 'briefcase',
    who: 'סוכנויות וסחר רכב שמקבלות הרבה פניות אבל מאבדות לידים בדרך.',
    pains: ['פניות מגיעות מכמה ערוצים ומתפזרות', 'מעקב איטי אחרי מתעניינים', 'אין תמונת מצב על מי בתהליך'],
    offerId: 'crm_smart',
    entryOfferId: 'landing_basic',
    whyFit: 'CRM מרכז כל פנייה ומבטיח מעקב מהיר — שם נסגרות העסקאות.',
    expectedValue: 'סגירת יותר עסקאות מאותו זרם לידים קיים, בלי להוסיף פרסום.',
    salesPotential: 'high',
    urgency: 'medium',
    closeProbability: 'medium',
    action: 'meeting',
    proof: ['דמו CRM חי על תהליך ליד אמיתי', 'דוגמת דשבורד מעקב פניות'],
    objection: 'יש לנו כבר אקסל/מערכת שעובדת.',
    response: 'נשווה 10 דקות: כמה לידים נופלים היום מול מעקב אוטומטי — ההפרש משלם על המערכת.',
    upsell: ['ai_assistant', 'automation', 'sales_funnel'],
    tags: ['crm', 'followup'],
  },
  {
    id: 'academies',
    label: 'אקדמיות / קורסים',
    icon: 'doc',
    who: 'מנהלי קורסים, אקדמיות והכשרות שצריכים נרשמים.',
    pains: ['נרשמים נוטשים באמצע ההרשמה', 'אין דף ממוקד לכל קורס', 'תזכורות נשלחות ידנית'],
    offerId: 'sales_funnel',
    entryOfferId: 'landing_basic',
    whyFit: 'דף נחיתה + משפך ממוקדים מובילים את הגולש לפעולה אחת: הרשמה.',
    expectedValue: 'יותר נרשמים לכל מחזור מאותה תנועה, עם תהליך מסודר.',
    salesPotential: 'high',
    urgency: 'medium',
    closeProbability: 'medium',
    action: 'demo',
    proof: ['דוגמת דף נחיתה לקורס', 'תרשים משפך הרשמה'],
    objection: 'יש לנו עמוד פייסבוק וזה מספיק.',
    response: 'עמוד טוב לחשיפה, אבל דף נחיתה ממיר — נראה דוגמה ונחשב יחד יחס המרה.',
    upsell: ['automation', 'content_monthly'],
    tags: ['web', 'followup'],
  },
  {
    id: 'local_stores',
    label: 'חנויות מקומיות',
    icon: 'wallet',
    who: 'חנויות שכונתיות ועסקי קמעונאות עם נוכחות דיגיטלית חלשה.',
    pains: ['לא מופיעים טוב בחיפוש מקומי', 'אין גלריה/תדמית מסודרת', 'תלות מלאה בכניסה מהרחוב'],
    offerId: 'digital_presence',
    entryOfferId: 'graphics_ads',
    whyFit: 'חבילת נראות נותנת נוכחות מקצועית שמושכת לקוחות חדשים מהאזור.',
    expectedValue: 'יותר כניסות והזמנות מלקוחות שמחפשים אונליין לפני שמגיעים.',
    salesPotential: 'medium',
    urgency: 'low',
    closeProbability: 'medium',
    action: 'whatsapp',
    proof: ['דוגמת נראות לפני/אחרי', 'פוסט/מודעה לדוגמה'],
    objection: 'אין לי זמן להתעסק עם זה.',
    response: 'בדיוק בשביל זה — אני מקים את הכול, אתם רק מאשרים. מתחילים בחבילת גרפיקה קטנה.',
    upsell: ['website_premium', 'automation'],
    tags: ['web', 'graphics'],
  },
  {
    id: 'nonprofits',
    label: 'עמותות / קופות / ארגונים',
    icon: 'users',
    who: 'עמותות, קופות וארגונים שצריכים אמון, תרומות והרשמות.',
    pains: ['אין דף תרומה/הצטרפות ברור', 'תקציב רגיש', 'קושי לתקשר את הפעילות'],
    offerId: 'landing_basic',
    entryOfferId: 'landing_basic',
    whyFit: 'דף נחיתה אמין מתרגם את הפעילות לפעולה: לתרום או להצטרף.',
    expectedValue: 'יותר תרומות/נרשמים ותדמית שמייצרת אמון מול תורמים.',
    salesPotential: 'medium',
    urgency: 'medium',
    closeProbability: 'medium',
    action: 'meeting',
    proof: ['דוגמת דף תרומה/הצטרפות', 'דוגמת תדמית ארגונית'],
    objection: 'אין לנו תקציב לזה.',
    response: 'נתחיל קטן ובמחיר מותאם לעמותות — דף ממוקד אחד שכבר מחזיר את עצמו בתרומות.',
    upsell: ['content_monthly', 'automation'],
    tags: ['web', 'followup'],
  },
  {
    id: 'real_estate',
    label: 'מתווכי נדל״ן',
    icon: 'target',
    who: 'מתווכים וסוכני נדל״ן שחיים על מהירות תגובה ללידים.',
    pains: ['לידים חמים מתקררים מהר', 'אין מעקב מסודר אחרי נכסים ומתעניינים', 'תדמית לא אחידה'],
    offerId: 'crm_smart',
    entryOfferId: 'landing_basic',
    whyFit: 'CRM + דף נחיתה לוכדים ליד ומבטיחים תגובה מיידית — קריטי בנדל״ן.',
    expectedValue: 'פחות לידים אבודים ויותר עסקאות נסגרות בזכות מהירות.',
    salesPotential: 'high',
    urgency: 'high',
    closeProbability: 'medium',
    action: 'call',
    proof: ['דמו CRM עם ליד נכס', 'דף נחיתה לנכס לדוגמה'],
    objection: 'אני מסתדר עם הטלפון והפתקים.',
    response: 'ליד שמחכה 10 דקות הולך למתחרה — נראה איך מענה אוטומטי משאיר אותך ראשון.',
    upsell: ['ai_assistant', 'automation'],
    tags: ['crm', 'followup'],
  },
  {
    id: 'hospitality',
    label: 'צימרים / אירוח',
    icon: 'sun',
    who: 'צימרים ועסקי אירוח בוטיק שהאתר הוא חלון הראווה שלהם.',
    pains: ['אורח מחליט לפי האתר — והאתר חלש', 'הזמנות מתנהלות ידנית', 'אין מעקב פניות'],
    offerId: 'website_premium',
    entryOfferId: 'landing_basic',
    whyFit: 'אתר תדמית מתורגם ישירות להזמנות — באירוח החוויה מתחילה אונליין.',
    expectedValue: 'יותר הזמנות ישירות ופחות תלות בפלטפורמות שגוזרות עמלה.',
    salesPotential: 'high',
    urgency: 'medium',
    closeProbability: 'high',
    action: 'whatsapp',
    proof: ['דוגמת אתר אירוח', 'גלריה + יומן זמינות לדוגמה'],
    objection: 'יש לי עמוד ב-Booking וזה מביא אורחים.',
    response: 'מצוין להתחלה, אבל כל הזמנה ישירה חוסכת עמלה — האתר משלם על עצמו תוך עונה.',
    upsell: ['automation', 'content_monthly'],
    tags: ['web'],
  },
  {
    id: 'clinics',
    label: 'קליניקות / מטפלים',
    icon: 'spark',
    who: 'קליניקות, מטפלים ונותני בריאות שצריכים אמון לפני הפגישה.',
    pains: ['מטופל בודק אונליין לפני שמתקשר', 'תיאום תורים גוזל זמן', 'אין מעקב חוזר אחרי מטופלים'],
    offerId: 'website_premium',
    entryOfferId: 'landing_basic',
    whyFit: 'אתר מקצועי משדר אמון, והוספת תיאום/תזכורות חוסכת זמן יקר.',
    expectedValue: 'יותר פניות איכותיות ופחות זמן ניהול תורים.',
    salesPotential: 'medium',
    urgency: 'medium',
    closeProbability: 'medium',
    action: 'whatsapp',
    proof: ['דוגמת אתר קליניקה', 'תהליך תיאום תור + תזכורת'],
    objection: 'הלקוחות מגיעים מפה לאוזן.',
    response: 'מצוין — ואתר שמשדר אמון מחזק בדיוק את ההמלצות האלה ומקצר את הדרך לפגישה.',
    upsell: ['crm_smart', 'automation'],
    tags: ['web', 'crm', 'followup'],
  },
  {
    id: 'schools',
    label: 'בתי ספר / מכללות',
    icon: 'calendar',
    who: 'מוסדות חינוך ומכללות עם תהליכי הרשמה וריבוי פניות.',
    pains: ['הרשמה ידנית ומסורבלת', 'מידע מפוזר בין ערוצים', 'קשה לתקשר עם הורים/תלמידים'],
    offerId: 'business_full',
    entryOfferId: 'landing_basic',
    whyFit: 'מערכת מותאמת מסדרת הרשמות, פניות ותקשורת במקום אחד.',
    expectedValue: 'תהליך הרשמה חלק, פחות עומס מנהלתי ותקשורת מסודרת.',
    salesPotential: 'medium',
    urgency: 'low',
    closeProbability: 'low',
    action: 'meeting',
    proof: ['דמו מודול הרשמה', 'דוגמת דשבורד ניהול פניות'],
    objection: 'יש לנו מערכת מהמשרד/רשת.',
    response: 'לא מחליפים — משלימים. נמפה היכן הצוות מבזבז זמן ונאוטמט רק את זה.',
    upsell: ['automation', 'content_monthly'],
    tags: ['crm', 'web'],
  },
  {
    id: 'service_pros',
    label: 'בעלי מקצוע / נותני שירות',
    icon: 'wand',
    who: 'בעלי מקצוע ונותני שירות (שיפוצים, חשמל, ייעוץ) שעובדים מהשטח.',
    pains: ['פספוס שיחות/פניות בזמן עבודה', 'אין דף שמסביר מה הם עושים', 'תיאום מול לקוחות מבולגן'],
    offerId: 'landing_basic',
    entryOfferId: 'landing_basic',
    whyFit: 'דף ממוקד + פולואפ אוטומטי לוכדים פניות גם כשהם על הסולם.',
    expectedValue: 'פחות פניות אבודות ויותר עבודות נסגרות מאותו פרסום.',
    salesPotential: 'high',
    urgency: 'medium',
    closeProbability: 'high',
    action: 'whatsapp',
    proof: ['דוגמת דף שירות', 'הודעת פולואפ אוטומטית לדוגמה'],
    objection: 'אני עסוק מדי בשביל אתר.',
    response: 'בדיוק הסיבה — דף שעובד בשבילך כשאתה בעבודה, מוקם תוך ימים בלי מאמץ ממך.',
    upsell: ['automation', 'crm_smart'],
    tags: ['web', 'followup'],
  },
  {
    id: 'food',
    label: 'עסקי מזון',
    icon: 'image',
    who: 'מסעדות, בתי קפה וקייטרינג שצריכים תיאבון ויזואלי אונליין.',
    pains: ['אין תפריט/גלריה דיגיטלית מושכת', 'הזמנות/אירועים מתנהלים ידנית', 'נראות חלשה בחיפוש'],
    offerId: 'digital_presence',
    entryOfferId: 'graphics_ads',
    whyFit: 'נראות + גלריה איכותית מתרגמות תיאבון לפניות ולהזמנות.',
    expectedValue: 'יותר הזמנות שולחן/אירועים ולקוחות חדשים מהאזור.',
    salesPotential: 'medium',
    urgency: 'medium',
    closeProbability: 'medium',
    action: 'whatsapp',
    proof: ['דוגמת תפריט/גלריה דיגיטלית', 'פוסט מנה לדוגמה'],
    objection: 'אנחנו פעילים רק באינסטגרם.',
    response: 'אינסטגרם מעולה לחשיפה — נחבר אותו לדף שמקבל הזמנות, ולא מאבד אף פנייה.',
    upsell: ['content_monthly', 'website_premium'],
    tags: ['web', 'graphics'],
  },
  {
    id: 'artists',
    label: 'אמנים / יוצרים / גלריות',
    icon: 'image',
    who: 'אמנים, יוצרים וגלריות בוטיק שהאתר הוא חלון הראווה לעבודות.',
    pains: ['אין תיק עבודות מרשים אונליין', 'קושי למכור/להזמין ישירות', 'תקציב מוגבל'],
    offerId: 'website_premium',
    entryOfferId: 'landing_basic',
    whyFit: 'אתר תדמית/פורטפוליו מציג את העבודות ברמתן ופותח ערוץ מכירה ישיר.',
    expectedValue: 'יותר חשיפה, הזמנות ומכירות ישירות בלי מתווך.',
    salesPotential: 'medium',
    urgency: 'low',
    closeProbability: 'medium',
    action: 'whatsapp',
    proof: ['דוגמת פורטפוליו אמן', 'גלריה עם הזמנה ישירה'],
    objection: 'יש לי פרופיל אינסטגרם עם הכול.',
    response: 'הוא נהדר, אבל אתר הוא הבית שלך שאף אלגוריתם לא מסתיר — נראה דוגמה.',
    upsell: ['content_monthly', 'graphics_ads'],
    tags: ['web', 'graphics'],
  },
  {
    id: 'messy_smb',
    label: 'עסקים קטנים עם ניהול מבולגן',
    icon: 'dashboard',
    who: 'עסקים קטנים שהכול אצלם בראש, בוואטסאפ ובפתקים.',
    pains: ['מידע מפוזר ואין תמונת מצב', 'משימות ופניות נופלות', 'בזבוז זמן על עבודה ידנית חוזרת'],
    offerId: 'crm_ai_full',
    entryOfferId: 'custom_demo',
    whyFit: 'CRM עם עוזר AI מרכז את העסק וחוסך את העבודה הידנית החוזרת.',
    expectedValue: 'שליטה, פחות בלגן וזמן שמתפנה לעבודה שמכניסה כסף.',
    salesPotential: 'high',
    urgency: 'high',
    closeProbability: 'medium',
    action: 'demo',
    proof: ['דמו מותאם על תהליך אמיתי שלהם', 'דשבורד "לפני/אחרי"'],
    objection: 'זה נשמע מסובך מדי בשבילי.',
    response: 'נתחיל מדמו קטן על תהליך אחד שלך — תראה כמה זה פשוט לפני שמחליטים.',
    upsell: ['automation', 'ai_assistant', 'business_full'],
    tags: ['crm', 'followup'],
  },
];

export const categoryById = (id) => LEAD_CATEGORIES.find((c) => c.id === id) || null;

// ---- summary stats for the KPI strip (derived, deterministic) ----
export const STATS = {
  categories: LEAD_CATEGORIES.length,
  offerTypes: Object.keys(SERVICES).length,
  actionTypes: Object.keys(ACTIONS).length,
};

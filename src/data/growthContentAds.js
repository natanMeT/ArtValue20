// ===================================================================
// Growth OS — Content & Ads Library (ספריית פרסום ותוכן)
// Static, deterministic, presentational library of reusable ad/content
// templates for ArtValue marketing consistency. NO persistence, NO store,
// NO AI/provider, NO network, NO publishing, NO messaging. This is a
// planning/reference library only — it does NOT generate or send anything.
//
// Self-contained on purpose: it must NOT import from src/creative/v2/offer/**.
// `relatedOffers` are plain service-id strings (mirrored from the Growth OS
// lead-mapping catalog); the page resolves display names via growthLeads.
//
// Image prompts are written for GPT Image 2: English direction language with
// the EXACT Hebrew overlay text quoted inline, plus concrete composition,
// style, color/lighting and "avoid" constraints. Copy follows ArtValue's
// premium/business tone — no guarantees, no hype, no fake outcomes.
// ===================================================================

// ---- ArtValue core positioning (used for header context) ----
export const POSITIONING = {
  core: `לא עוד אתר. מערכת דיגיטלית שמעלה את הערך של העסק שלך.`,
  coreAlt: `מערכת דיגיטלית שבונה לעסק שלך ערך אמיתי.`,
  services: `אתרים • דפי נחיתה • אוטומציות • נראות דיגיטלית • משפכים חכמים • מערכות CRM`,
};

// ---- content formats (id → display) ----
export const CONTENT_FORMATS = {
  post_image:   { id: 'post_image',   name: 'מודעת תמונה',   icon: 'image' },
  video_reel:   { id: 'video_reel',   name: 'וידאו / ריל',   icon: 'volume' },
  story:        { id: 'story',        name: 'סטורי',          icon: 'spark' },
  carousel:     { id: 'carousel',     name: 'קרוסלה',         icon: 'dashboard' },
  whatsapp_msg: { id: 'whatsapp_msg', name: 'הודעת וואטסאפ',  icon: 'whatsapp' },
  long_copy:    { id: 'long_copy',    name: 'פוסט ארוך',      icon: 'doc' },
  ad_direct:    { id: 'ad_direct',    name: 'מודעת מכירה',    icon: 'target' },
  before_after: { id: 'before_after', name: 'לפני / אחרי',    icon: 'refresh' },
};

export const formatById = (id) => CONTENT_FORMATS[id] || null;

// ---- content categories (the 14 approved categories) ----
// tags map 1:1 to the FILTERS below; relatedOffers reference the lead-mapping
// service catalog (validated in the data-integrity test against SERVICES).
export const CONTENT_CATEGORIES = [
  { id: 'general_ads', label: 'מודעות כלליות', icon: 'image',
    description: `מודעות מותג שמסבירות את ההצעה המרכזית של ArtValue.`,
    goal: `לבסס את המסר "לא עוד אתר — מערכת שמעלה ערך".`,
    tags: ['ads', 'branding'], relatedOffers: ['website_premium', 'crm_smart'] },
  { id: 'chaos_order', label: 'כאוס מול סדר', icon: 'dashboard',
    description: `מודעות שמנגידות עסק מבולגן מול עסק עם מערכת אחת.`,
    goal: `לעורר את הכאב של לידים שנופלים ולמצב מערכת אחת מסודרת.`,
    tags: ['ads', 'crm'], relatedOffers: ['crm_ai_full', 'automation'] },
  { id: 'crm_business', label: 'CRM לעסקים', icon: 'users',
    description: `תוכן שמסביר למה עסק צריך מערכת CRM.`,
    goal: `למצב CRM כמרכז שליטה שלא נותן לפניות ליפול.`,
    tags: ['ads', 'crm'], relatedOffers: ['crm_smart', 'ai_assistant'] },
  { id: 'ai_assistant', label: 'עוזר AI לעסק', icon: 'robot',
    description: `מודעות לעוזר AI שיושב בתוך המערכת של העסק.`,
    goal: `למצב עוזר AI ככוח עבודה שמפנה זמן ומגדיל ערך.`,
    tags: ['ads', 'automation'], relatedOffers: ['ai_assistant', 'crm_ai_full'] },
  { id: 'sites_landing', label: 'אתרים ודפי נחיתה', icon: 'link',
    description: `מודעות לאתרים ודפי נחיתה שממירים מבקר ללקוח.`,
    goal: `למצב אתר/דף נחיתה כנכס שמייצר לידים, לא כרטיס ביקור.`,
    tags: ['ads', 'web'], relatedOffers: ['website_premium', 'landing_basic'] },
  { id: 'automations', label: 'אוטומציות', icon: 'refresh',
    description: `מודעות לאוטומציות של פולואפ ותהליכים.`,
    goal: `למכור אוטומציה כמערכת שעובדת 24/7 ומחזירה זמן.`,
    tags: ['ads', 'automation'], relatedOffers: ['automation', 'sales_funnel'] },
  { id: 'direct_sales', label: 'מודעות מכירתיות ישירות', icon: 'target',
    description: `מודעות תגובה ישירה עם הצעה ברורה ו-CTA חד.`,
    goal: `לייצר פניות חמות עם הצעה ברורה וקריאה לפעולה מיידית.`,
    tags: ['ads'], relatedOffers: ['landing_basic', 'digital_presence'] },
  { id: 'stories_reels', label: 'סטוריז ורילס', icon: 'volume',
    description: `תסריטי סטורי וריל קצרים (הוק ב-3 שניות).`,
    goal: `לעצור גלילה עם הוק מהיר ומבנה בעיה→פתרון.`,
    tags: ['ads', 'video'], relatedOffers: ['digital_presence', 'content_monthly'] },
  { id: 'by_business_type', label: 'מודעות לפי סוג עסק', icon: 'briefcase',
    description: `מודעות מותאמות לוורטיקל עסקי ספציפי.`,
    goal: `לדבר בשפת סוג העסק עם כאב ופתרון ממוקדים.`,
    tags: ['ads', 'branding'], relatedOffers: ['crm_smart', 'website_premium'] },
  { id: 'premium_branding', label: 'מודעות תדמית פרימיום', icon: 'spark',
    description: `מודעות תדמית יוקרתיות ונקיות.`,
    goal: `למצב את ArtValue כפרימיום ולהצדיק תג מחיר גבוה יותר.`,
    tags: ['ads', 'branding'], relatedOffers: ['website_premium', 'digital_presence'] },
  { id: 'before_after', label: 'לפני / אחרי עסקי', icon: 'trendUp',
    description: `תבניות לפני/אחרי של שינוי עסקי.`,
    goal: `להמחיש את המעבר מכאוס לשליטה בעזרת המערכת.`,
    tags: ['ads', 'crm'], relatedOffers: ['crm_ai_full', 'business_full'] },
  { id: 'objections', label: 'התנגדויות לקוחות', icon: 'dots',
    description: `תוכן שמפרק בעדינות התנגדויות נפוצות.`,
    goal: `לנטרל תירוצים ("יש לי אקסל", "אין לי זמן") בביטחון.`,
    tags: ['ads'], relatedOffers: ['custom_demo', 'crm_smart'] },
  { id: 'followups_whatsapp', label: 'פולואפים והודעות וואטסאפ', icon: 'whatsapp',
    description: `תבניות פולואפ והודעות וואטסאפ — ספריית תבניות בלבד.`,
    goal: `להחזיר לידים לשיחה בצורה מנומסת (לא שליחה אוטומטית).`,
    tags: ['whatsapp', 'automation'], relatedOffers: ['automation', 'crm_smart'] },
  { id: 'monthly_campaigns', label: 'קמפיינים חודשיים', icon: 'calendar',
    description: `תמות קמפיין חודשיות לשמירה על נוכחות עקבית.`,
    goal: `לשמור מסר מרכזי אחד וברור לאורך כל החודש.`,
    tags: ['ads', 'branding'], relatedOffers: ['content_monthly', 'digital_presence'] },
];

export const categoryById = (id) => CONTENT_CATEGORIES.find((c) => c.id === id) || null;

// ---- filter tabs (UI segmentation; ids map to category/item tags) ----
export const FILTERS = [
  { id: 'all',        label: 'הכל' },
  { id: 'ads',        label: 'מודעות' },
  { id: 'video',      label: 'וידאו / רילס' },
  { id: 'whatsapp',   label: 'וואטסאפ' },
  { id: 'crm',        label: 'CRM' },
  { id: 'web',        label: 'אתרים' },
  { id: 'automation', label: 'אוטומציות' },
  { id: 'branding',   label: 'תדמית' },
];

// Pure predicate: does an item belong under a filter tab?
export const matchesFilter = (item, filterId) => {
  if (filterId === 'all') return true;
  return Array.isArray(item.tags) && item.tags.includes(filterId);
};

// ---- reusable content/ad templates (2 per category) ----
// Each item inherits tags + relatedOffers from its category (kept explicit
// per-item so the exported records are self-describing for the UI & tests).
export const CONTENT_LIBRARY_ITEMS = [
  // --- מודעות כלליות ---
  {
    id: 'general_ads-1', categoryId: 'general_ads',
    title: `לא עוד אתר`,
    description: `מודעת מותג שממצבת את ArtValue מול קטגוריית "עוד אתר" ומגדירה מחדש למה משלמים: מערכת מחוברת שעובדת, לא עיצוב בודד.`,
    goal: `לקבע במחשבת הלקוח ש-ArtValue מוכרת מערכת דיגיטלית שמעלה ערך — לא אתר בודד.`,
    bestFor: `בעלי עסק שכבר יש להם אתר או עמוד ומרגישים שהוא "לא עושה כלום" — קהל קר עד פושר בפייסבוק/אינסטגרם.`,
    tone: `ישיר ובוטח`,
    hook: `יש לך אתר. יש לך מערכת?`,
    message: `רוב העסקים מזמינים אתר ומקבלים חלון ראווה יפה שיושב בצד. ב-ArtValue בונים מערכת אחת — אתר, דפי נחיתה, אוטומציות ו-CRM שעובדים יחד: מביאים פניות, מנהלים אותן, ולא נותנים לאף אחת ליפול. זה ההבדל בין נוכחות ברשת לבין נכס שמעלה את ערך העסק.`,
    cta: `בוא נבנה לך מערכת, לא עוד אתר.`,
    prompt: `Create a premium Hebrew ad image for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
The difference between owning a single website and owning one connected business system.

Composition:
Square 1:1. Split layout. Right side: one small static website window in muted grey, standing alone and dim. Left side: the same business shown as a connected system — website, landing page, an automation node and a CRM board, linked by thin glowing lines into a single unit.

Main object / metaphor:
An isolated single page versus one connected, living system.

Business context:
ArtValue sells a full digital system (website, landing pages, automations, CRM), not a standalone website.

Style direction:
Premium dark SaaS aesthetic, minimal, high contrast, realistic but polished product UI, subtle glassmorphism on the cards.

Color & lighting:
Deep near-black background, electric lime and cool blue accents on the connected side with a soft glow; desaturated grey on the isolated side.

Exact Hebrew text overlay (render legibly, right-to-left):
"לא עוד אתר."
"מערכת דיגיטלית שמעלה את הערך של העסק שלך."

CTA text:
"בוא נבנה לך מערכת"

Avoid:
generic stock people, humanoid robots, unreadable Hebrew, childish icons, cluttered typography, glossy clichés, any promise of results.`,
    usageNote: `מודעת פתיחה למותג — הרץ ראשונה בפאנל ורמרקט אחריה עם מודעת CRM/אתרים ממוקדת. בקרוסלה: שקף 1 ההוק, שקף 2 המערכת המחוברת, שקף 3 ה-CTA.`,
    formats: ['post_image', 'carousel'], tags: ['ads', 'branding'], relatedOffers: ['website_premium', 'crm_smart'],
  },
  {
    id: 'general_ads-2', categoryId: 'general_ads',
    title: `העסק ששווה יותר`,
    description: `מודעת מותג בזווית ערך-נכסי: ממקמת את הנוכחות הדיגיטלית כנכס שמצטבר ומעלה את שווי העסק לאורך זמן.`,
    goal: `להעביר את השיחה ממחיר של פרויקט חד-פעמי לחשיבה על נכס דיגיטלי שצובר ערך.`,
    bestFor: `בעלי עסק מבוססים שחושבים על צמיחה ומיתוג לטווח ארוך — קהל פושר עד חם, מצוין לרמרקטינג.`,
    tone: `בוגר ושקול`,
    hook: `כל דבר דיגיטלי שאתה בונה — או מוסיף ערך, או סתם קיים.`,
    message: `אתר יפה מתיישן. מערכת דיגיטלית נכונה רק צוברת ערך: משפכים שממירים טוב יותר, אוטומציות שחוסכות זמן, ונראות שמביאה את האנשים הנכונים. ב-ArtValue בונים לעסק תשתית שמתפקדת כנכס — כזו שעובדת בשבילך גם כשאתה לא מול המסך.`,
    cta: `בוא נבנה לעסק שלך ערך אמיתי.`,
    prompt: `Create a premium Hebrew brand ad for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
Digital assets that compound into business value over time.

Composition:
Vertical 9:16 for story/reel. A single elegant rising line curve travels from bottom-right to top-left; along it sit small labelled node icons (website, landing page, automation, CRM, visibility). Generous negative space around the curve.

Main object / metaphor:
A value curve where each node is a digital building block stacking upward.

Business context:
ArtValue's connected system (sites, funnels, automations, CRM) behaves like an appreciating asset, not a one-off expense.

Style direction:
Premium and calm, minimal editorial layout, thin precise lines, refined type hierarchy.

Color & lighting:
Elegant dark charcoal background, muted gold and cool blue accents, soft even light, lots of breathing room.

Exact Hebrew text overlay (render legibly, right-to-left):
"מערכת דיגיטלית שבונה לעסק שלך ערך אמיתי."
"אתרים • דפי נחיתה • אוטומציות • נראות • משפכים • CRM"

CTA text:
"דברו איתנו"

Avoid:
loud sales language, stock handshakes, humanoid robots, cluttered charts, exaggerated claims, neon overload.`,
    usageNote: `מכוונת לקהל בוגר ולרמרקטינג. אל תריץ אותה כמודעת פתיחה קרה — היא עובדת הכי טוב אחרי חשיפה ראשונית למותג.`,
    formats: ['story', 'video_reel'], tags: ['ads', 'branding'], relatedOffers: ['website_premium', 'crm_smart'],
  },

  // --- כאוס מול סדר ---
  {
    id: 'chaos_order-1', categoryId: 'chaos_order',
    title: `וואטסאפ אחד לא מנהל עסק`,
    description: `ניגוד ישיר בין ניהול לידים דרך וואטסאפ, פתקים ואקסל לבין מערכת אחת מרוכזת שרואה הכול.`,
    goal: `לעורר את הכאב של לידים מפוזרים שנופלים, ולמצב מערכת אחת מסודרת כפתרון.`,
    bestFor: `בעלי עסק קטן-בינוני שמנהלים לקוחות בוואטסאפ, פתקים ואקסל ומרגישים שדברים נופלים בין הכיסאות.`,
    tone: `ישיר ומפוקח`,
    hook: `כמה לידים נפלו לך השבוע בין ההודעות?`,
    message: `וואטסאפ, פתקים על השולחן ואקסל ישן זה לא ניהול — זו תקווה שכלום לא ייפול. ב-ArtValue בונים מערכת אחת שבה כל ליד, כל פנייה וכל מעקב יושבים במקום ברור אחד. פחות בלגן, יותר שליטה — מערכת שמעלה את הערך של העסק שלך.`,
    cta: `בוא נבנה לך מערכת אחת שעושה סדר.`,
    prompt: `Create a premium Hebrew comparison ad for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
The messy way most owners manage leads today versus one clean system.

Composition:
Square 1:1, hard split-screen. Right side: a cluttered desk — scattered yellow sticky notes, a phone stacked with WhatsApp notifications, paper invoices, a missed-call badge, tired grey tones. Left side: one clean CRM dashboard with ordered lead cards in status columns (new / in progress / closed), calm and organized.

Main object / metaphor:
Chaos of scattered tools collapsing into a single ordered dashboard.

Business context:
Leads arrive from many channels and get lost; ArtValue's CRM centralizes them.

Style direction:
Modern clean product look, soft realistic lighting, clear contrast between clutter and order.

Color & lighting:
Muted desaturated palette on the messy side, deep navy background with lime/teal accents on the system side.

Exact Hebrew text overlay (render legibly, right-to-left):
"ככה מנהלים היום: וואטסאפ, פתקים, אקסל"
"ככה זה נראה עם מערכת אחת"

CTA text:
"בוא נעשה סדר"

Avoid:
childish clip-art, humanoid robots, unreadable Hebrew, over-the-top mess, fake promises.`,
    usageNote: `מצוין כקרוסלה או מודעת פייסבוק/אינסטגרם. הצג את הצד המבולגן ראשון ואת המסודר שני כדי לייצר את רגע ה"אני רוצה את זה".`,
    formats: ['post_image', 'carousel'], tags: ['ads', 'crm'], relatedOffers: ['crm_ai_full', 'automation'],
  },
  {
    id: 'chaos_order-2', categoryId: 'chaos_order',
    title: `מהבלגן לתמונה אחת`,
    description: `תוכן על תחושת השליטה שנוצרת כשכל חלקי העסק מתחברים למערכת אחת, במקום להתרוצץ בין כלים.`,
    goal: `למצב את ArtValue כמי שהופך פעולות מפוזרות למערכת אחת שמשרתת את בעל העסק.`,
    bestFor: `בעלי עסק בצמיחה שכבר יש להם כמה כלים נפרדים שלא מדברים ביניהם, ומבזבזים זמן על תפעול ידני.`,
    tone: `חם ובוטח`,
    hook: `העסק שלך עובד קשה. המערכת שלו לא.`,
    message: `כשהאתר במקום אחד, הלידים במקום שני והמעקב בראש שלך — אתה זה שמחזיק את הכול ביד. ב-ArtValue מחברים את הכול למערכת אחת: אתר שמביא פניות, משפך שמנתב אותן ואוטומציות שדואגות שכלום לא יישכח. במקום להתרוצץ בין כלים, יש לך תמונה אחת ברורה של העסק.`,
    cta: `בוא נחבר את הכול למקום אחד.`,
    prompt: `Create a premium Hebrew story/reel frame for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
Scattered tools converging into one central system.

Composition:
Vertical 9:16, two-state design. Opening state: tangled arrows connecting scattered icons (WhatsApp, email, spreadsheet, sticky note, phone) on a heavy, overloaded background. Resolved state: the same icons realign neatly around one central system screen, connected by clean straight lines.

Main object / metaphor:
Tangled wiring resolving into one organized hub.

Business context:
ArtValue connects site, funnel and automations into a single source of truth.

Style direction:
Minimal, calm motion feel, soft converging transition, professional and reassuring.

Color & lighting:
Dark background, brand lime and cool blue accents on the resolved lines, gentle glow.

Exact Hebrew text overlay (render legibly, right-to-left):
"כשכל כלי מושך לכיוון שלו"
"מערכת אחת. תמונה אחת. שליטה מלאה."

CTA text:
"בוא נחבר את הכול"

Avoid:
busy neon, humanoid robots, cluttered typography, childish icons, exaggerated promises.`,
    usageNote: `אידיאלי לרילס/סטורי עם מעבר ויזואלי מבלגן לסדר. השתמש בטקסט הפתיחה כהוק בשנייה הראשונה ובטקסט הסיום כפאנץ' לפני ה-CTA.`,
    formats: ['story', 'video_reel'], tags: ['ads', 'crm'], relatedOffers: ['crm_ai_full', 'automation'],
  },

  // --- CRM לעסקים ---
  {
    id: 'crm_business-1', categoryId: 'crm_business',
    title: `כל פנייה במקום אחד`,
    description: `כאב הפניות המפוזרות (וואטסאפ, טלפון, טפסים, אינסטגרם) שנופלות בין הכיסאות, מול CRM כמרכז שליטה אחד.`,
    goal: `להמחיש שבלי מערכת מסודרת לידים הולכים לאיבוד, ולמצב CRM כפתרון שמרכז הכול ומחזיר שליטה.`,
    bestFor: `בעלי עסק שמקבלים פניות מכמה ערוצים (וואטסאפ, טלפון, טפסים, רשתות) ומרגישים שהם "רודפים" אחרי לקוחות.`,
    tone: `ישיר ומרגיע`,
    hook: `הלקוחות לא נעלמים. הם פשוט לא מנוהלים.`,
    message: `הפניות שלך מגיעות מוואטסאפ, מטלפון, מטפסים ומהרשתות — וכל אחת יושבת במקום אחר. עד שאתה חוזר, חלק כבר פנו למישהו אחר. CRM מרכז את כל הפניות למסך אחד, עם תיעוד ותזכורת למעקב, כדי שפחות לידים ייפלו בין הכיסאות. ב-ArtValue זו לא עוד תוכנה — זו תשתית שמעלה את ערך העסק.`,
    cta: `בוא נרכז לך את כל הפניות למקום אחד.`,
    prompt: `Create a premium Hebrew ad image for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
Every incoming lead flowing into one organized place.

Composition:
Square 1:1. Left side: scattered floating notification bubbles — WhatsApp, phone, email, Instagram icons — drifting in disorder and faded. Right side: a clean CRM screen where those notifications stream into one organized lead list with status tags.

Main object / metaphor:
Loose notifications funnelling into one ordered inbox/pipeline.

Business context:
ArtValue's CRM captures leads, follow-ups, tasks, clients and payment status in one view.

Style direction:
Modern premium product UI, clean, high-contrast, not a generic template look.

Color & lighting:
Deep navy background, teal and violet accents, soft light on the organized side.

Exact Hebrew text overlay (render legibly, right-to-left):
"כל פנייה במקום אחד"
"לרכז. לא לאבד. לענות בזמן."

CTA text:
"קבע שיחה קצרה"

Avoid:
stock people, humanoid robots, cluttered typography, unreadable Hebrew, fake result claims.`,
    usageNote: `מתאים כקרוסלה: שקף 1 ההוק והבלגן, שקף 2 מסך ה-CRM המסודר, שקף 3 ה-CTA. עובד גם כמודעה ממומנת לקהל בעלי עסק.`,
    formats: ['post_image', 'carousel'], tags: ['ads', 'crm'], relatedOffers: ['crm_smart', 'ai_assistant'],
  },
  {
    id: 'crm_business-2', categoryId: 'crm_business',
    title: `תמונת מצב בשנייה`,
    description: `שליטה ובהירות ניהולית — לדעת בכל רגע איפה כל לקוח עומד, כמה פניות פתוחות ומה דורש טיפול, בלי לנחש.`,
    goal: `למצב CRM ככלי שנותן לבעל העסק תמונת מצב בזמן אמת ומעביר מסר של עסק מנוהל.`,
    bestFor: `בעלי עסק עם זרם פניות שמנהלים אותן בראש, בפתקים או באקסל ומרגישים שאין להם שליטה מלאה.`,
    tone: `מקצועי ובוטח`,
    hook: `בלי מערכת אתה מנהל בראש. עם מערכת אתה מנהל בנתונים.`,
    message: `כשהמעקב יושב בראש, בפתקים או בעשרה צ'אטים פתוחים — תמיד משהו מתפספס. CRM נותן לך תמונת מצב אחת בזמן אמת: כמה פניות פתוחות, מי מחכה לתשובה, איפה כל עסקה עומדת ומה דורש טיפול היום. במקום לנחש — אתה מנהל.`,
    cta: `קבע שיחה ונראה לך את זה על העסק שלך.`,
    prompt: `Create a premium Hebrew ad image for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
A single glance that tells the owner exactly where the business stands.

Composition:
4:5 feed format. A clean CRM dashboard on screen: lead cards in status columns (new / in progress / closed), a clear count of open and waiting conversations, and a deal progress bar. Calm, controlled, uncluttered.

Main object / metaphor:
A control-room style dashboard giving instant situational clarity.

Business context:
Owners lose track when follow-up lives in their head; the CRM shows leads, tasks, clients and payments at a glance.

Style direction:
Premium product UI, refined and trustworthy, not a generic stock layout.

Color & lighting:
Deep navy palette with teal accents, soft even light, subtle depth.

Exact Hebrew text overlay (render legibly, right-to-left):
"תמונת מצב בשנייה"
"לדעת בדיוק איפה כל לקוח עומד"

CTA text:
"קבעו שיחת דמו"

Avoid:
fake dashboards with nonsense numbers, humanoid robots, stock handshake photos, cluttered charts, hype.`,
    usageNote: `מתאים למודעה ממוקדת המרה עם CTA לשיחת ייעוץ/דמו. אפשר להחליף את הדשבורד בצילום מסך אמיתי (מטושטש) של מערכת שבנית כדי להגביר אמינות.`,
    formats: ['post_image', 'ad_direct'], tags: ['ads', 'crm'], relatedOffers: ['crm_smart', 'ai_assistant'],
  },

  // --- עוזר AI לעסק ---
  {
    id: 'ai_assistant-1', categoryId: 'ai_assistant',
    title: `העובד שלא ישן`,
    description: `עוזר ה-AI כרכיב חכם בתוך המערכת של העסק — מנסח טיוטות, מסכם שיחות ומציע את הצעד הבא, כשאתה בוחר. לא רובוט, אלא פאנל בתוך דשבורד.`,
    goal: `למצב את עוזר ה-AI ככוח עבודה שמפנה זמן לבעל העסק, ולהוביל לשיחת ייעוץ.`,
    bestFor: `בעלי עסק קטן-בינוני שטובעים בעבודה ידנית חוזרת של מענה, סיכום ומעקב.`,
    tone: `ישיר ובוטח`,
    hook: `יש לך עוזר שמנסח, מסכם ומזכיר — גם כשאתה עסוק.`,
    message: `כל יום נשרף זמן על אותן משימות: לנסח תשובות לפניות, לסכם שיחות, לעדכן סטטוס ולהזכיר מעקב. עוזר ה-AI של ArtValue יושב בתוך המערכת של העסק, מנסח טיוטות, מסכם ומציע לך את הצעד הבא לכל פנייה — כרכיב חכם בדשבורד, לא רובוט חיצוני. זה זמן שחוזר אליך.`,
    cta: `בוא נחבר לך עוזר חכם בתוך המערכת.`,
    prompt: `Create a premium Hebrew ad image for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
A smart assistant living inside the business dashboard, not a physical robot.

Composition:
Square 1:1. A clean CRM/dashboard screen glowing softly in a quiet night office. Inside the UI, a highlighted assistant side-panel shows drafted replies, a short conversation summary and a "next step" suggestion. The assistant is clearly a software panel within the product, never a character.

Main object / metaphor:
An intelligent helper embedded inside the system UI.

Business context:
ArtValue's assistant concept drafts, summarizes and advances leads inside the existing business system.

Style direction:
Minimal premium product UI, calm and controlled, believable interface details.

Color & lighting:
Deep navy background, one soft accent glow (teal), quiet low light.

Exact Hebrew text overlay (render legibly, right-to-left):
"העובד שלא ישן"
"עוזר חכם שמנסח, מסכם ומזכיר — בתוך המערכת שלך"

CTA text:
"בוא נחבר לך עוזר"

Avoid:
humanoid robots, glowing android faces, sci-fi clichés, stock businesspeople, any claim of autonomous selling.`,
    usageNote: `מתאים לפוסט אורגני או מודעה ממומנת. אפשר לפצל את ה-message לקרוסלה: בעיה, פתרון, הזמנה לפעולה. שמור על הצגת ה-AI כרכיב בתוך המערכת, לא כישות עצמאית.`,
    formats: ['post_image', 'carousel'], tags: ['ads', 'automation'], relatedOffers: ['ai_assistant', 'crm_ai_full'],
  },
  {
    id: 'ai_assistant-2', categoryId: 'ai_assistant',
    title: `מהתוהו לסדר`,
    description: `זווית-כאב: איך העוזר הופך בלגן של פניות ומידע למערכת מסודרת שמזכירה את הצעד הבא בזמן.`,
    goal: `לחדד את הכאב של אובדן לידים ובלגן תפעולי, ולמצב את עוזר ה-AI כתשתית סדר.`,
    bestFor: `עסקים שכבר מקבלים לא מעט פניות אבל דברים נופלים בין הכיסאות ואין מעקב מסודר.`,
    tone: `אמפתי ומקצועי`,
    hook: `בלי מעקב, לידים נשכחים — ואיתם לקוחות.`,
    message: `פניות שנשכחות, שיחות בלי מעקב, מידע מפוזר בין וואטסאפ למחברת — ככה עסקים מאבדים לקוחות בלי לשים לב. עוזר ה-AI של ArtValue יכול לאסוף כל פנייה למקום אחד, לסכם את מה שחשוב ולהזכיר לך את הצעד הבא. במקום עוד אתר שרק יושב — מערכת שמחזיקה סדר ומעקב.`,
    cta: `קבע שיחת אבחון קצרה.`,
    prompt: `Create a premium Hebrew before/after ad for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
Operational chaos turning into a summarized, tracked workflow.

Composition:
Square 1:1, before/after split. Right (before): scattered notes, question marks, unanswered chat bubbles in grey. Left (after): an ordered dashboard where an assistant panel shows a short summary and a highlighted "next step" reminder on each lead card.

Main object / metaphor:
Loose fragments organized into tracked, summarized cards.

Business context:
The assistant concept captures, summarizes and reminds — inside ArtValue's system.

Style direction:
Clean modern product UI, clear contrast between clutter and order, believable interface.

Color & lighting:
Grey muted tones on the "before" side, deep navy with a warm accent on the "after" side.

Exact Hebrew text overlay (render legibly, right-to-left):
"מהתוהו לסדר"
"עוזר שמסדר, מסכם וזוכר בשבילך"

CTA text:
"לשיחת אבחון"

Avoid:
humanoid robots, childish graphics, cluttered charts, fake numbers, promises of sales results.`,
    usageNote: `עובד מצוין כמודעת "לפני/אחרי" או סטורי אינטראקטיבי. אפשר לפתוח פוסט עם שאלת ה-hook כדי לעורר תגובות.`,
    formats: ['before_after', 'post_image'], tags: ['ads', 'automation'], relatedOffers: ['ai_assistant', 'crm_ai_full'],
  },

  // --- אתרים ודפי נחיתה ---
  {
    id: 'sites_landing-1', categoryId: 'sites_landing',
    title: `האתר שעובד בזמן שאתה ישן`,
    description: `ממצבת אתר/דף נחיתה כנכס פעיל שמכניס פניות מסביב לשעון, לא כרטיס ביקור סטטי.`,
    goal: `להזיז בעל עסק עם אתר ישן או עמוד פייסבוק בלבד לפנייה על אתר שממיר.`,
    bestFor: `בעלי עסק עם אתר ישן/לא ממיר, או שמסתמכים רק על רשתות חברתיות. מתאים לפוסט פיד או מודעה ממומנת.`,
    tone: `ישיר ובוטח`,
    hook: `יש לך אתר. אבל הוא מביא לך לקוחות?`,
    message: `רוב האתרים הם כרטיס ביקור יפה שלא עושה כלום. אנחנו בונים דף שעובד בשבילך גם ב-2 בלילה: מבקר נכנס, מבין תוך שניות למה כדאי לו ומשאיר פרטים. לא עוד אתר — נכס שמעלה את ערך העסק ופועל מסביב לשעון.`,
    cta: `בוא נבנה לך אתר שמייצר לידים.`,
    prompt: `Create a premium Hebrew ad image for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
A landing page quietly capturing a lead in the middle of the night.

Composition:
Square 1:1. A glowing laptop/phone screen in a dark room shows a clean landing page with one bold action button; a small toast notification reads "ליד חדש התקבל". The rest of the scene is quiet and dim.

Main object / metaphor:
A single screen working alone after hours.

Business context:
ArtValue builds conversion-focused sites and landing pages that capture leads continuously.

Style direction:
Premium, dark, clean, subtle glassmorphism, trustworthy product feel.

Color & lighting:
Obsidian background, electric lime accent on the action button, soft blue screen glow.

Exact Hebrew text overlay (render legibly, right-to-left):
"האתר שעובד בזמן שאתה ישן"
"אתרים • דפי נחיתה • משפכים חכמים"

CTA text:
"בוא נבנה אתר שממיר"

Avoid:
stock people, humanoid robots, unreadable Hebrew, busy layouts, exaggerated promises, fake testimonials.`,
    usageNote: `מתאים כמודעה ממומנת יחידה או פוסט אורגני. אפשר להחליף את שורת ההוק לפי קהל (בעלי חנויות / נותני שירות).`,
    formats: ['post_image', 'ad_direct'], tags: ['ads', 'web'], relatedOffers: ['website_premium', 'landing_basic'],
  },
  {
    id: 'sites_landing-2', categoryId: 'sites_landing',
    title: `פעולה אחת. אפס בלבול.`,
    description: `מדגישה עיצוב ממוקד-המרה: דף נחיתה עם מסר אחד וקריאה אחת ברורה, בלי הסחות דעת.`,
    goal: `לחנך שדף נחיתה ממוקד מוכר טוב יותר מאתר עמוס, ולהוביל לפנייה על דף לקמפיין.`,
    bestFor: `עסקים שמריצים קמפיינים ממומנים ומאבדים תקציב על דף שלא ממיר, או משיקים מוצר/שירות חדש.`,
    tone: `חד וממוקד`,
    hook: `כשמבקר מתבלבל — הוא עוזב.`,
    message: `דף נחיתה שמנסה למכור עשרה דברים לא מוכר אף אחד. אנחנו בונים דף אחד עם מסר אחד וקריאה אחת ברורה — נראות מקצועית שמובילה את המבקר בדיוק לאן שצריך. פחות בחירות, יותר החלטות. מערכת שמייצרת ערך, לא עמוד עמוס.`,
    cta: `בוא נבנה דף נחיתה שממיר.`,
    prompt: `Create a premium Hebrew comparison ad for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
A cluttered page that loses visitors versus one focused converting page.

Composition:
Square 1:1, two screens side by side. Left: a busy page crowded with buttons and messy text, marked with a subtle red X. Right: a clean landing page with one message and a single prominent action button, marked with a small lime check.

Main object / metaphor:
Focus versus clutter, decision versus confusion.

Business context:
ArtValue designs conversion-first landing pages with one clear call to action.

Style direction:
Minimal premium layout, dark, sharp Hebrew typography, clear hierarchy.

Color & lighting:
Obsidian background, electric lime accent on the winning page, restrained contrast.

Exact Hebrew text overlay (render legibly, right-to-left):
"פעולה אחת. אפס בלבול."
"דף נחיתה שמוביל את המבקר להחלטה"

CTA text:
"בוא נבנה דף שממיר"

Avoid:
cluttered real logos, humanoid robots, childish icons, unreadable Hebrew, hype phrases.`,
    usageNote: `עובד מצוין כקרוסלה של 2 פריימים או פוסט השוואה. אידיאלי לקהל שכבר משקיע בפרסום ממומן.`,
    formats: ['carousel', 'post_image'], tags: ['ads', 'web'], relatedOffers: ['website_premium', 'landing_basic'],
  },

  // --- אוטומציות ---
  {
    id: 'automations-1', categoryId: 'automations',
    title: `העסק שעובד בזמן שאתה ישן`,
    description: `האוטומציה ממשיכה לעבוד גם בשעות שהעסק סגור — מענה ראשוני ומעקב שלא מחכים לבוקר.`,
    goal: `לעורר תודעה לפער בין ליד שנכנס בלילה למענה שמגיע רק למחרת, ולמצב אוטומציה כפתרון.`,
    bestFor: `בעלי עסק שמקבלים פניות מחוץ לשעות העבודה ומרגישים שלידים נופלים בין הכיסאות.`,
    tone: `ישיר ובוטח`,
    hook: `ליד נכנס ב-23:47. מי עונה לו?`,
    message: `רוב הפניות נכנסות דווקא כשאתה לא ליד המחשב — בערב, בסופ"ש, באמצע פגישה. אוטומציית פולואפ חכמה שולחת מענה ראשוני, אוספת פרטים ומזכירה ללקוח לחזור, בלי שתצטרך לזכור כלום. לא עוד תוספת לאתר — מערכת שממשיכה לעבוד גם כשהעסק סגור.`,
    cta: `בוא נבנה לך מערכת שעובדת מסביב לשעון.`,
    prompt: `Create a premium Hebrew ad image for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
An automated reply going out at night while the owner is away.

Composition:
Square 1:1. Close-up of a phone on a dark desk showing an auto-reply message timestamped 23:47; behind it a quiet, dimmed home/office. Focus on the screen.

Main object / metaphor:
A message sending itself after hours.

Business context:
ArtValue builds follow-up automations that respond and track leads around the clock.

Style direction:
Realistic and clean, calm night mood, minimal props.

Color & lighting:
Soft bluish night light, deep dark background, one bright screen highlight.

Exact Hebrew text overlay (render legibly, right-to-left):
"העסק שלך ענה. גם כשאתה ישן."
"אוטומציית פולואפ שלא מפספסת פנייה"

CTA text:
"בוא נבנה מערכת שעובדת 24/7"

Avoid:
stock people, humanoid robots, cluttered UI, unreadable Hebrew, promises of sales results or fixed timelines.`,
    usageNote: `מתאים במיוחד לפוסט/סטורי בערב או בלילה, או כמודעת רימרקטינג למי שהשאיר פרטים ולא קיבל מענה מהיר.`,
    formats: ['post_image', 'story'], tags: ['ads', 'automation'], relatedOffers: ['automation', 'sales_funnel'],
  },
  {
    id: 'automations-2', categoryId: 'automations',
    title: `פחות עבודה ידנית, יותר זמן`,
    description: `כאב המשימות החוזרות הידניות (הצעות, תזכורות, עדכונים) מול אוטומציה שמשחררת זמן.`,
    goal: `להמחיש כמה זמן נשרף על פעולות חוזרות ולמכור אוטומציה כהחזרת שליטה וזמן.`,
    bestFor: `עסקים עמוסים בלקוחות שמבזבזים שעות על תיאומים, תזכורות ומעקבים ידניים.`,
    tone: `חם ואמפתי`,
    hook: `כמה שעות בשבוע אתה מבזבז על אותן פעולות?`,
    message: `פולואפ ללקוח, תזכורת לפגישה, שליחת הצעת מחיר, עדכון סטטוס — כל אחד לחוד קטן, אבל ביחד הם אוכלים את היום. אוטומציה מחברת בין הכלים שלך ומריצה את התהליכים האלה לבד, מדויק ובזמן, כדי שתתפנה לעבודה שבאמת מזיזה את העסק.`,
    cta: `דבר איתנו ונמפה מה אפשר להפוך לאוטומטי.`,
    prompt: `Create a premium Hebrew ad image for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
Repetitive manual tasks becoming one clean automated flow.

Composition:
Square 1:1. A minimal flow diagram: several repeating task icons (envelope, clock, document, contact card) merge through smooth lines into a single pipeline that ends in a check mark. Balanced layout with generous space.

Main object / metaphor:
Many small chores collapsing into one automated pipeline.

Business context:
ArtValue automates follow-ups, reminders, quotes and status updates between the owner's tools.

Style direction:
Clean flat design, thin precise lines, two brand colors only, uncluttered.

Color & lighting:
Light neutral background, deep navy lines with a lime accent, soft even light.

Exact Hebrew text overlay (render legibly, right-to-left):
"המשימות החוזרות — עכשיו רצות לבד"
"אוטומציות ל-ArtValue"

CTA text:
"נמפה יחד מה להפוך לאוטומטי"

Avoid:
humanoid robots, cluttered diagrams, childish icons, unreadable Hebrew, exaggerated time or revenue claims.`,
    usageNote: `מתאים כקרוסלה או מודעה: שקף ראשון הכאב, שקף שני הפתרון. אפשר להתאים את רשימת המשימות לפי הנישה של הלקוח.`,
    formats: ['post_image', 'carousel'], tags: ['ads', 'automation'], relatedOffers: ['automation', 'sales_funnel'],
  },

  // --- מודעות מכירתיות ישירות ---
  {
    id: 'direct_sales-1', categoryId: 'direct_sales',
    title: `האתר שלך לא עובד בשבילך`,
    description: `מודעת תגובה ישירה על כאב מוכר — אתר יפה שלא מייצר כלום — עם הצעה לשיחת אבחון קצרה.`,
    goal: `לייצר פניות חמות מבעלי עסק שיש להם אתר קיים שלא מביא תוצאות, בלי הבטחות.`,
    bestFor: `בעלי עסק עם אתר קיים שמרגישים שהוא סטטי ולא מייצר לידים או מכירות.`,
    tone: `ישיר ובוטח`,
    hook: `יש לך אתר. אבל הוא לא מוכר בשבילך.`,
    message: `רוב האתרים הם כרטיס ביקור יפה שפשוט יושב שם. ב-ArtValue בונים מערכת שעובדת גם כשאתה לא: דף נחיתה שממיר, משפך שמוביל את הלקוח צעד-צעד, ואוטומציה שמנהלת מעקב ומזכירה את הצעד הבא. לא עוד אתר — נכס שמעלה את ערך העסק.`,
    cta: `קבע שיחת אבחון קצרה, בלי התחייבות.`,
    prompt: `Create a premium Hebrew direct-response ad for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
A static business website turned into a working funnel.

Composition:
Square 1:1. A modern business website on screen over a clean dark background, with a graphic flow line connecting "מבקר" to "לקוח" as a simple funnel. A clear CTA chip sits in the corner.

Main object / metaphor:
A page connected into a conversion funnel.

Business context:
ArtValue turns passive sites into landing-page-plus-funnel-plus-automation systems.

Style direction:
Minimal, sharp, premium, one bright accent color on dark.

Color & lighting:
Dark brand background, single bright accent, soft focused light on the screen.

Exact Hebrew text overlay (render legibly, right-to-left):
"יש לך אתר. אבל הוא לא מוכר בשבילך."
"מערכת דיגיטלית שמעלה את הערך של העסק שלך"

CTA text:
"לשיחת אבחון"

Avoid:
humanoid robots, stock handshakes, unreadable Hebrew, cluttered typography, promised-result language.`,
    usageNote: `מתאים לקמפיין רימרקטינג או קהל בעלי עסק עם אתר קיים. אפשר לשכפל את ה-hook ככותרת מודעה ואת ה-message כטקסט ראשי.`,
    formats: ['ad_direct', 'post_image'], tags: ['ads'], relatedOffers: ['landing_basic', 'digital_presence'],
  },
  {
    id: 'direct_sales-2', categoryId: 'direct_sales',
    title: `משיחה אחת למערכת חיה`,
    description: `הצעה ברורה וממוקדת: אבחון והצעה מותאמת בשיחה אחת, בלי טפסים ובלי סחבת.`,
    goal: `להוריד את מחסום הכניסה ולהניע לפנייה מיידית דרך הצעה קונקרטית וזמינה.`,
    bestFor: `בעלי עסק שרוצים להתחיל אבל נרתעים מתהליכים ארוכים ולא ברורים.`,
    tone: `תכליתי ומזמין`,
    hook: `רוצה להפוך את הדיגיטל שלך לנכס? מתחילים בשיחה.`,
    message: `בשיחה אחת נבין איפה העסק מאבד לקוחות ואיפה הפוטנציאל האמיתי. ב-ArtValue מרכיבים מערכת דיגיטלית מלאה — אתר או דף נחיתה, CRM, אוטומציות ומשפך — שמחברת נראות לפניות ומעקב לסגירה. לא פרויקט חד-פעמי, אלא תשתית שממשיכה לעבוד.`,
    cta: `דבר איתנו עכשיו וקבל הצעה מותאמת.`,
    prompt: `Create a premium Hebrew direct-sales ad for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
Separate digital parts assembling into one working machine.

Composition:
Square 1:1. Clean assembly of system components — website, CRM, automation and funnel icons — arranged like parts clicking together into one connected machine. Lots of negative space, one clear CTA chip.

Main object / metaphor:
Modular parts snapping into a single system.

Business context:
ArtValue assembles sites, CRM, automations and funnels into one growth system.

Style direction:
Modern, technical, clean, one bright accent on dark, plenty of room.

Color & lighting:
Dark brand background, single bright accent, crisp even light.

Exact Hebrew text overlay (render legibly, right-to-left):
"הדיגיטל שלך יכול להיות נכס שמייצר ערך"
"אתרים • דפי נחיתה • CRM • אוטומציות • משפכים חכמים"

CTA text:
"לפנייה והצעה מותאמת"

Avoid:
humanoid robots, stock people, cluttered composition, unreadable Hebrew, promised-outcome phrasing.`,
    usageNote: `מתאים לקהל קר-פושר או קמפיין הובלת לידים. התאם את ערוץ הפנייה (וואטסאפ/טופס/שיחה) לפי הפלטפורמה. ה-CTA מנוסח כפעולה מיידית — לא כהתחייבות.`,
    formats: ['ad_direct', 'post_image'], tags: ['ads'], relatedOffers: ['landing_basic', 'digital_presence'],
  },

  // --- סטוריז ורילס ---
  {
    id: 'stories_reels-1', categoryId: 'stories_reels',
    title: `לפני ואחרי ב-15 שניות`,
    description: `תסריט ריל "לפני מול אחרי" שמראה בוויזואל את המעבר מאתר סטטי למערכת דיגיטלית שעובדת.`,
    goal: `להמחיש מהר שההבדל בין אתר למערכת הוא ההבדל בין נוכחות פסיבית לנכס שמייצר לידים.`,
    bestFor: `בעלי עסק עם אתר שמביא ביקורים אך לא הופך אותם ללקוחות. מתאים לפידים באינסטגרם/פייסבוק.`,
    tone: `ישיר ומדגים`,
    hook: `יש לך אתר. אז למה אף אחד לא פונה?`,
    message: `רוב העסקים משלמים על אתר יפה שפשוט יושב שם. ב-ArtValue בונים מערכת שמחברת דף נחיתה, משפך חכם ואוטומציה שממשיכה לעבוד גם כשאתה ישן. הפנייה נכנסת ל-CRM, מקבלת מענה ולא נעלמת בתיבת מייל. זה ההבדל בין נוכחות לבין נכס.`,
    cta: `רוצה לראות איך זה נראה אצלך? כתוב לנו "מערכת".`,
    prompt: `Create a premium Hebrew vertical reel frame for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
A dead static website waking up into a working system.

Composition:
Vertical 9:16, split into two halves. Left (before): a grey static website with tiny cobwebs. Right (after): the same screen alive with incoming lead cards and a rising indicator. A short caption sits on each half (see overlay). Design for a hard cut at second 3.

Main object / metaphor:
A screen transforming from idle to active.

Business context:
ArtValue connects site, funnel, automation and CRM into one working system.

Style direction:
Clean brand palette, bold modern Hebrew type, short readable captions for mobile-without-sound.

Color & lighting:
Grey flat tones on the before side, dark background with lime accents on the after side.

Exact Hebrew text overlay (render legibly, right-to-left):
0s-3s, over the left half: "אתר שרק יושב"
3s-end, over the right half: "מערכת שעובדת"

CTA text:
"כתבו לנו: מערכת"

Avoid:
humanoid robots, tiny unreadable Hebrew, cluttered frames, hype claims, slow static shots.`,
    usageNote: `ריל של עד 15 שניות. שים את ההוק כטקסט-על כבר בפריים הראשון (רבים צופים בלי סאונד). ה-cut בשנייה 3 הוא הרגע הקריטי לעצירת גלילה.`,
    formats: ['video_reel', 'story'], tags: ['ads', 'video'], relatedOffers: ['digital_presence', 'content_monthly'],
  },
  {
    id: 'stories_reels-2', categoryId: 'stories_reels',
    title: `שלושה דברים שהאתר שלך לא עושה`,
    description: `תסריט סטורי בפורמט רשימה מהירה (3 סליידים) — כל סליד פונקציה שמערכת עושה ואתר רגיל לא.`,
    goal: `לחנך שאתר הוא רק שכבה אחת, ולמצב את ArtValue כמי שבונה את כל המערכת סביבו.`,
    bestFor: `קהל בסטוריז שמכיר את המותג אך עדיין חושב במונחים של "אתר". מצוין כרצף סטוריז אינטראקטיבי.`,
    tone: `חד ומחנך`,
    hook: `אתר טוב זה רק ההתחלה. הנה מה שחסר.`,
    message: `אתר יפה מביא מבקרים, אבל לבד הוא לא ממיר. מערכת מוסיפה את מה שחסר: משפך שמכניס את הפנייה למקום הנכון, אוטומציה ששולחת מענה מיידי ומעקב, ו-CRM שמרכז את הלידים כדי שאף הזדמנות לא תיפול. ב-ArtValue בונים את הנכס השלם, לא רק את חלון הראווה.`,
    cta: `רוצה לדעת מה חסר אצלך? שלח לנו הודעה.`,
    prompt: `Create a premium Hebrew vertical story series for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
Three things a website alone does not do.

Composition:
Vertical 9:16, consistent series of slides. Each slide has a large number (01, 02, 03) in the corner, a clean brand background and one minimal icon with a short caption entering from below. Slide 01: funnel icon. Slide 02: gear/message icon. Slide 03: cards/list icon. A closing slide carries the logo line.

Main object / metaphor:
A numbered checklist of missing system layers.

Business context:
ArtValue builds funnel, automation and CRM around the website.

Style direction:
Uniform minimal series, clean brand look, light entrance motion, clear hierarchy.

Color & lighting:
Clean brand background, one accent color, soft even light.

Exact Hebrew text overlay (render legibly, right-to-left):
Slide 01: "משפך חכם שממיר ביקורים לפניות"
Slide 02: "אוטומציה ששולחת מענה מיידי"
Slide 03: "CRM שמרכז את הלידים במקום אחד"

CTA text:
"מה חסר אצלך? שלחו הודעה"

Avoid:
humanoid robots, generic icons, unreadable Hebrew, cluttered slides, exaggerated promises.`,
    usageNote: `מתאים כרצף 4 סטוריז (3 נקודות + סיום). הוסף מדבקת סקר/שאלה בסליד האחרון כדי לפתוח שיחות בדם.`,
    formats: ['story', 'video_reel'], tags: ['ads', 'video'], relatedOffers: ['digital_presence', 'content_monthly'],
  },

  // --- מודעות לפי סוג עסק ---
  {
    id: 'by_business_type-1', categoryId: 'by_business_type',
    title: `נדל"ן: ליד שבא מוכן`,
    description: `מודעה לוורטיקל נדל"ן/תיווך — דף נחיתה ומשפך שמסננים לידים לפני שהמתווך מרים טלפון.`,
    goal: `לייצר לידים איכותיים למתווכים דרך משפך חכם, ולמצב את ArtValue כמערכת ולא כאתר.`,
    bestFor: `מתווכים, יזמי נדל"ן ופרויקטים למכירה שמבזבזים זמן על לידים לא רלוונטיים.`,
    tone: `ישיר ומקצועי`,
    hook: `כמה מהלידים שלך באמת רלוונטיים?`,
    message: `בנדל"ן הבעיה היא לא תנועה, אלא זמן שהולך על שיחות סרק. אנחנו בונים דף נחיתה ומשפך שמסננים כל פנייה — תקציב, אזור וכוונת קנייה — עוד לפני שהטלפון מצלצל. במקום עוד אתר תדמית, מערכת שמזרימה למתווכים רק את מי ששווה שיחה.`,
    cta: `בואו נבנה לך משפך לידים לנדל"ן.`,
    prompt: `Create a premium Hebrew vertical ad for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
Real-estate leads pre-qualified before the agent picks up the phone.

Composition:
Square 1:1. A clean top-down view of a modern apartment/office in natural light, with a minimal digital UI layer above it showing lead cards tagged "תקציב", "אזור", "מוכן לקנייה". Plenty of breathing room.

Main object / metaphor:
Property plus a filtering lead pipeline overlay.

Business context:
ArtValue builds landing-page-plus-funnel systems that qualify real-estate leads.

Style direction:
Premium, clean, natural light photography blended with a minimal UI overlay.

Color & lighting:
White and blue tones with a subtle warm accent, soft natural light.

Exact Hebrew text overlay (render legibly, right-to-left):
"כמה מהלידים שלך באמת רלוונטיים?"
"מערכת שמסננת לידים לפני שאתה מרים טלפון | ArtValue"

CTA text:
"למשפך לידים לנדל״ן"

Avoid:
humanoid robots, stock handshakes, unreadable Hebrew, cluttered UI, promises of a specific number of leads.`,
    usageNote: `לפרסום ממומן לקהל מתווכים ויזמים. אפשר להחליף את הוורטיקל בקלות — אקדמיה, אירוח, נותן שירות מקומי — תוך שמירה על אותו מבנה מסר.`,
    formats: ['post_image', 'ad_direct'], tags: ['ads', 'branding'], relatedOffers: ['crm_smart', 'website_premium'],
  },
  {
    id: 'by_business_type-2', categoryId: 'by_business_type',
    title: `קליניקה: יומן מלא בלי לרדוף`,
    description: `מודעה לוורטיקל קליניקות/מטפלים — קביעת תורים ואוטומציה שממלאות יומן ומצמצמות ביטולים.`,
    goal: `למכור מערכת (דף נחיתה + אוטומציות + CRM) לבעלי קליניקות במיצוב של נכס עסקי.`,
    bestFor: `רופאים, מטפלים וקליניקות אסתטיקה שמאבדים מטופלים בגלל תיאום ומעקב ידני.`,
    tone: `חם ובוטח`,
    hook: `המטופל פנה. אתה חזרת אליו אחרי יומיים?`,
    message: `בקליניקה כל פנייה שלא נענתה בזמן היא מטופל שהלך למישהו אחר. אנחנו מקימים דף נחיתה שמזמין לקבוע תור, אוטומציות שמאשרות ומזכירות לבד, ו-CRM שמחזיר מטופלים ותיקים. לא עוד נוכחות באינטרנט — מערכת שממלאת יומן בזמן שאתה מטפל.`,
    cta: `בואו נמלא לך את היומן.`,
    prompt: `Create a premium Hebrew vertical ad for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
A calm clinic whose calendar fills itself while the practitioner works.

Composition:
Vertical 9:16. A warm, tidy modern clinic space (treatment chair, soft light, a green plant) on one side; a digital calendar UI layer on the other showing booked slots and small toasts "תור אושר" and "תזכורת נשלחה".

Main object / metaphor:
A self-managing appointment calendar beside a serene clinic.

Business context:
ArtValue builds booking landing pages, reminder automations and CRM for clinics.

Style direction:
Calm, trustworthy, clean; gentle blend of real clinic photography and minimal UI.

Color & lighting:
White, soft green and sand tones, warm soft light.

Exact Hebrew text overlay (render legibly, right-to-left):
"המטופל פנה. אתה חזרת אחרי יומיים?"
"מערכת שממלאת יומן ומצמצמת ביטולים | ArtValue"

CTA text:
"בואו נמלא לך את היומן"

Avoid:
humanoid robots, sterile stock doctors, unreadable Hebrew, cluttered UI, medical-outcome or promised claims.`,
    usageNote: `מותאם לסטורי/רילס ולקהל בעלי קליניקות. אפשר להחליף את סביבת הצילום לפי סוג הטיפול (רפואי/אסתטי/פרא-רפואי).`,
    formats: ['story', 'post_image'], tags: ['ads', 'branding'], relatedOffers: ['crm_smart', 'website_premium'],
  },

  // --- מודעות תדמית פרימיום ---
  {
    id: 'premium_branding-1', categoryId: 'premium_branding',
    title: `לא עוד אתר`,
    description: `מודעת תדמית מינימליסטית שממקמת את ArtValue מעל קטגוריית ה"אתרים" — הפרדה חדה בין נכס דיגיטלי לדף סטטי.`,
    goal: `למצב את ArtValue כפרימיום ולהצדיק תג מחיר גבוה יותר על ידי שינוי הקטגוריה שבה הלקוח חושב.`,
    bestFor: `בעלי עסק בוגרים שכבר יש להם אתר שלא מביא תוצאות ומחפשים משהו רציני יותר.`,
    tone: `שקט, בוטח ומדויק`,
    hook: `מערכת שמייצרת ערך. לא עוד אתר שרק יושב.`,
    message: `רוב העסקים משלמים על אתר ומקבלים חלון ראווה יפה שלא עושה כלום. ב-ArtValue בונים מערכת שעובדת בשבילך — אתר, דפי נחיתה, אוטומציות ומשפכים שמדברים אחד עם השני. לא עיצוב שיושב באוויר, אלא נכס שמייצר ערך אמיתי לאורך זמן.`,
    cta: `בואו נבנה לך מערכת. דברו איתנו.`,
    prompt: `Create a premium minimalist Hebrew brand ad for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
Category redefinition — above "just a website".

Composition:
Square 1:1. A near-empty dark canvas with large margins and one refined geometric element at center — a thin gold line or an abstract modular structure hinting at a connected system. Right-aligned Hebrew type.

Main object / metaphor:
A single elegant structural mark standing for a whole system.

Business context:
ArtValue positions itself as a premium system studio, not a website vendor.

Style direction:
Luxurious yet restrained, editorial, airy, trustworthy; clean modern Hebrew serif/sans type.

Color & lighting:
Deep black/charcoal background, black-white-gold palette, soft directional light.

Exact Hebrew text overlay (render legibly, right-to-left):
"לא עוד אתר."
"מערכת דיגיטלית שמעלה את הערך של העסק שלך."

CTA text:
"דברו איתנו"

Avoid:
luxury clichés (gold coins, sports cars), humanoid robots, stock people, cluttered layouts, hype.`,
    usageNote: `מודעת פתיחה בקמפיין ממומן או פוסט תדמית מרכזי בפרופיל. שמור על רקע כהה ומינימום טקסט כדי לשמר תחושת פרימיום.`,
    formats: ['post_image', 'story'], tags: ['ads', 'branding'], relatedOffers: ['website_premium', 'digital_presence'],
  },
  {
    id: 'premium_branding-2', categoryId: 'premium_branding',
    title: `הערך שנשאר אחריך`,
    description: `מעבירה את השיחה מ"כמה זה עולה" ל"מה זה שווה" — ArtValue כבניית נכס צמיחה שנשאר לעסק.`,
    goal: `לבסס תפיסת ערך ארוכת-טווח ואמון, ולמשוך לקוחות שמחפשים שותף אסטרטגי ולא ספק זול.`,
    bestFor: `עסקים בצמיחה שחושבים על הדיגיטל כהשקעה ולא כהוצאה, ומעריכים איכות ואמינות לאורך זמן.`,
    tone: `חם, בוגר ואסטרטגי`,
    hook: `אתר זה הוצאה. מערכת זה נכס.`,
    message: `כשבונים נכון, הדיגיטל מפסיק להיות סעיף בהוצאות ומתחיל לעבוד כמו נכס. ב-ArtValue מחברים אתרים, CRM, אוטומציות ונראות למערכת אחת שגדלה יחד עם העסק. לא רק שתיראה טוב — תבנה לעצמך תשתית שממשיכה להחזיר לך גם מחר.`,
    cta: `רוצה לבנות ערך אמיתי? בוא נדבר.`,
    prompt: `Create a premium Hebrew brand ad for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
Digital work that accumulates into a lasting asset.

Composition:
Square 1:1. An abstract construction motif — thin stacked layers or blocks rising upward, suggesting value that compounds. Elegant right-aligned Hebrew type, a thin service line along the bottom.

Main object / metaphor:
Layers stacking into a stable, growing structure.

Business context:
ArtValue frames digital as an appreciating business asset, not a one-off cost.

Style direction:
Premium and warm, refined, editorial; can run in a light-warm or dark-warm variant.

Color & lighting:
Warm stone/cream or warm-dark background with a restrained accent, soft light.

Exact Hebrew text overlay (render legibly, right-to-left):
"אתר זה הוצאה. מערכת זה נכס."
"מערכת דיגיטלית שבונה לעסק שלך ערך אמיתי."

CTA text:
"בוא נדבר"

Avoid:
luxury clichés, humanoid robots, stock handshakes, cluttered charts, exaggerated promises.`,
    usageNote: `מתאים כמודעת ריטרגטינג או פוסט המשך למי שכבר נחשף למותג. אפשר להריץ בשתי גרסאות רקע (בהיר/כהה) ולבדוק איזו מביאה יותר מעורבות.`,
    formats: ['post_image', 'carousel'], tags: ['ads', 'branding'], relatedOffers: ['website_premium', 'digital_presence'],
  },

  // --- לפני / אחרי עסקי ---
  {
    id: 'before_after-1', categoryId: 'before_after',
    title: `התיקייה שאף אחד לא מוצא`,
    description: `לפני/אחרי שמתמקד בבלגן מידע יומיומי מול סדר תפעולי אחרי המערכת.`,
    goal: `להמחיש שהמערכת מחליפה כאוס תפעולי בשליטה, ולהניע לשיחת אבחון.`,
    bestFor: `בעלי עסק שמרגישים שהם רודפים אחרי לידים, קבצים והודעות ומאבדים סגירות בדרך.`,
    tone: `ישיר ואמפתי`,
    hook: `לפני: הכול בראש שלך. אחרי: הכול במערכת.`,
    message: `לפני ArtValue הלידים יושבים בוואטסאפ, ההצעות באקסל והמעקב תלוי בזיכרון שלך. אחרי — מערכת אחת שמרכזת פניות, אוטומציות ו-CRM ומראה בדיוק מה פתוח ומה נסגר. פחות דברים שנופלים בין הכיסאות, יותר סגירות בזמן.`,
    cta: `בוא נבנה לך את המערכת — לשיחת אבחון קצרה.`,
    prompt: `Create a premium Hebrew before/after ad for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
Everyday operational chaos replaced by one clear system.

Composition:
Vertical split before/after. Right (before): a desk buried in sticky notes, a screen with dozens of open tabs and WhatsApp alerts, greyish and slightly messy. Left (after): a clean CRM dashboard with ordered lead cards and a progress bar, crisp and bright.

Main object / metaphor:
From scattered notes to a single ordered board.

Business context:
ArtValue centralizes leads, follow-ups and status into one system.

Style direction:
Modern, technical, elegant-dark palette with one accent; clear before/after contrast.

Color & lighting:
Grey muted tones before, deep elegant dark with a bright accent after.

Exact Hebrew text overlay (render legibly, right-to-left):
"לפני"
"אחרי"
"לא עוד אתר. מערכת שמעלה את הערך של העסק שלך."

CTA text:
"לשיחת אבחון קצרה"

Avoid:
fake luxury lifestyle, humanoid robots, unreadable Hebrew, over-messy clutter, promised-result claims.`,
    usageNote: `לפוסט/מודעה אחת — הצמד את התמונה המפוצלת ל-hook ככותרת ולמסר כתיאור. עובד טוב גם כרילס עם מעבר חד מ"לפני" ל"אחרי".`,
    formats: ['before_after', 'post_image'], tags: ['ads', 'crm'], relatedOffers: ['crm_ai_full', 'business_full'],
  },
  {
    id: 'before_after-2', categoryId: 'before_after',
    title: `העסק שלך שווה יותר`,
    description: `לפני/אחרי מזווית ערך העסק — איך העסק נתפס ומתומחר כשיש לו נכס דיגיטלי אמיתי, בלי אורח-חיים מזויף.`,
    goal: `להעלות את התפיסה שמערכת דיגיטלית מגדילה את הערך הנתפס והמעשי של העסק, ולהניע לשיחת ייעוץ.`,
    bestFor: `עסקים מבוססים שרוצים להיראות רציניים יותר, לתמחר גבוה יותר ולסגור לקוחות איכותיים.`,
    tone: `בטוח ומקצועי`,
    hook: `אותו עסק. שני מחירים שונים לגמרי.`,
    message: `לפני, העסק נראה כמו עוד אחד בשוק — אתר סטטי, מעקב ידני, תלות בהמלצות. אחרי, יש לו נכס דיגיטלי שעובד: משפכים חכמים, נראות מסודרת ואוטומציות שרצות גם כשאתה לא מול המחשב. ההבדל הוא לא בעיצוב — הוא בערך שהלקוח מרגיש עוד לפני שדיבר איתך.`,
    cta: `רוצה לראות איך זה נראה אצלך? דבר איתנו.`,
    prompt: `Create a premium Hebrew before/after ad for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
The same business perceived and priced differently once it has a real digital system.

Composition:
Square 1:1. One central object (a storefront or a digital business card) with two price tags hanging on it: a faded small "לפני" tag and a bolder, higher "אחרי" tag. Clean, restrained scene.

Main object / metaphor:
Two price tags on the same business — perception shifted by the system.

Business context:
A structured digital system raises a business's perceived and practical value.

Style direction:
Minimal and premium, restrained, not flashy; focus on the object and the tags.

Color & lighting:
Dark palette with a subtle gold or soft neon accent, clean directional light.

Exact Hebrew text overlay (render legibly, right-to-left):
"אותו עסק. שני מחירים."
"מערכת דיגיטלית שבונה לעסק שלך ערך אמיתי."

CTA text:
"דבר איתנו"

Avoid:
cash stacks, luxury-lifestyle clichés, humanoid robots, unreadable Hebrew, income or revenue promises.`,
    usageNote: `מכוון לקהל שמבין ערך ולא רק מחיר. אפשר לפצל לקרוסלה: שקף 1 ה-hook, שקף 2-3 לפני/אחרי, שקף אחרון ה-CTA.`,
    formats: ['before_after', 'carousel'], tags: ['ads', 'crm'], relatedOffers: ['crm_ai_full', 'business_full'],
  },

  // --- התנגדויות לקוחות ---
  {
    id: 'objections-1', categoryId: 'objections',
    title: `"יש לי כבר אקסל"`,
    description: `מפרק בעדינות את התירוץ הנפוץ ביותר: הלקוח כבר מנהל הכול באקסל וקבצים מפוזרים.`,
    goal: `להעביר לקוחות מפתרון ידני מפוזר למערכת מסודרת שמייצרת ערך, בלי לזלזל בקיים.`,
    bestFor: `בעלי עסק קטן-בינוני שמנהלים לקוחות ומכירות באקסל, וורד ידני או מחברת, ומרגישים ש"מסתדרים".`,
    tone: `אמפתי ובוטח`,
    hook: `אקסל שומר נתונים. מערכת מנהלת עסק.`,
    message: `אקסל מצוין לרישום, אבל הוא לא מזכיר ללקוח לחזור, לא בונה משפך מכירה ולא מראה לך מה עובד. מערכת של ArtValue לא מוחקת לך את הסדר — היא מוסיפה עליו: אוטומציות, מעקב לידים ונראות שתורמים לערך העסק לאורך זמן. אתה לא מוותר על מה שבנית, אתה מעלה אותו רמה.`,
    cta: `בוא נראה איך זה נראה על העסק שלך.`,
    prompt: `Create a premium Hebrew objection-handling ad for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
A tired spreadsheet next to a living business system.

Composition:
Square 1:1, split screen. Right: a grey, dense, tiring spreadsheet. Left: a clean system screen with lead cards, a rising indicator and automation toggles. Clear contrast, no people.

Main object / metaphor:
A static grid versus an active managing system.

Business context:
ArtValue adds automation, lead tracking and visibility on top of what the owner already records.

Style direction:
Flat modern, minimal, professional, dark-premium with a gold/blue accent, no characters.

Color & lighting:
Grey on the spreadsheet side, dark elegant background with an accent on the system side.

Exact Hebrew text overlay (render legibly, right-to-left):
"אקסל שומר נתונים. מערכת מנהלת עסק."
"לא עוד אתר. מערכת שמעלה את הערך של העסק שלך."

CTA text:
"נראה לך את זה על העסק שלך"

Avoid:
humanoid robots, stock people, unreadable Hebrew, cluttered typography, mocking the customer, hype.`,
    usageNote: `פותחים בהוק, שוברים את ההתנגדות בגוף, וסוגרים ב-CTA רך שמזמין שיחה ולא מכירה. מתאים לפוסט קרוסלה או מודעה ממומנת.`,
    formats: ['post_image', 'long_copy'], tags: ['ads'], relatedOffers: ['custom_demo', 'crm_smart'],
  },
  {
    id: 'objections-2', categoryId: 'objections',
    title: `"אין לי זמן לזה עכשיו"`,
    description: `הופך את התנגדות הזמן על ראשה: דווקא בגלל שאין זמן, מערכת דיגיטלית היא מה שמחזיר אותו.`,
    goal: `לנטרל את "אין לי זמן" על ידי מיצוב המערכת ככלי שמשחרר זמן, לא כפרויקט שגוזל אותו.`,
    bestFor: `בעלי עסק עמוסים שרצים כל היום, מפספסים לידים ומתמודדים עם משימות ידניות חוזרות.`,
    tone: `ישיר וכן`,
    hook: `אין לך זמן? בדיוק בגלל זה.`,
    message: `רוב בעלי העסקים דוחים דיגיטל כי הם עסוקים — ואז נשארים עסוקים בדיוק במשימות שמערכת הייתה עושה בשבילם: מענה, מעקב, תיאום, תזכורות. אוטומציות ומשפכים חכמים של ArtValue עובדים בזמן שאתה עסוק ומחזירים לך שעות בשבוע. הזמן שנחסך היום הוא הערך שהמערכת מוסיפה מחר.`,
    cta: `שיחת אבחון קצרה, בלי התחייבות.`,
    prompt: `Create a premium Hebrew objection-handling ad for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
An overloaded owner whose repeated tasks fold into an automated system that keeps running.

Composition:
Square 1:1. One busy owner surrounded by floating task icons (phone, email, calendar, messages) that flow into a tidy automated gear/pipeline that keeps working on its own. A sense of relief replacing overload.

Main object / metaphor:
Scattered tasks absorbed into a self-running workflow.

Business context:
ArtValue automations run while the owner is busy, returning hours per week.

Style direction:
Clean modern illustration, uncluttered, calm resolution, premium palette.

Color & lighting:
Dark premium background with one bright accent, soft focused light.

Exact Hebrew text overlay (render legibly, right-to-left):
"אין לך זמן? בדיוק בגלל זה."
"אוטומציות שעובדות בזמן שאתה עסוק"

CTA text:
"לשיחת אבחון קצרה"

Avoid:
humanoid robots, chaotic clutter, unreadable Hebrew, childish icons, promises of specific time savings or fixed timelines.`,
    usageNote: `מתאים למודעת וידאו קצרה או ריל: 3-4 שניות הוק ואז המשימות שנעלמות לתוך המערכת. ה-CTA מכוון לשיחה קלה כדי להוריד חסם.`,
    formats: ['video_reel', 'post_image'], tags: ['ads'], relatedOffers: ['custom_demo', 'crm_smart'],
  },

  // --- פולואפים והודעות וואטסאפ ---
  {
    id: 'followups_whatsapp-1', categoryId: 'followups_whatsapp',
    title: `פולואפ אחרי הצעת מחיר`,
    description: `הודעת וואטסאפ אישית להזכיר ללקוח שקיבל הצעה ולפתוח שיחה מחדש בלי ללחוץ.`,
    goal: `להחזיר לשיחה ליד שקיבל הצעת מחיר ולא חזר, בלי להיתפס כנודניק.`,
    bestFor: `לידים חמים שקיבלו הצעה או שיחת אפיון ושתקו 2-4 ימים.`,
    tone: `מנומס ורגוע`,
    hook: `רק מוודא שההצעה הגיעה אליך בסדר`,
    message: `היי {שם}, כאן {נציג} מ-ArtValue. רק מוודא שההצעה שהעברתי הגיעה אליך בסדר ושהכול ברור. בנינו אותה כמערכת שמעלה ערך לעסק שלך, לא עוד אתר. אם יש שאלה או משהו שכדאי לחדד — אני כאן.`,
    cta: `רוצה שנקבע שיחה קצרה של 10 דקות?`,
    prompt: `Create a clean Hebrew WhatsApp-style visual card for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
A calm, personal follow-up message card (a visual accompaniment — the send text lives in the message field, not here).

Composition:
Vertical card. A single centered chat-bubble icon with a double check mark on a clean background, generous white space, one short caption line below.

Main object / metaphor:
A polite check-in bubble.

Business context:
ArtValue's follow-up template library — personal 1:1 messages, never broadcast.

Style direction:
Minimal, businesslike, modern sans-serif Hebrew, no people in frame.

Color & lighting:
Dark background with a subtle gold accent, soft even light, high legibility.

Exact Hebrew text overlay (render legibly, right-to-left):
"עדיין רלוונטי לך?"
"ArtValue — מערכת דיגיטלית שמעלה ערך לעסק"

CTA text:
"נקבע שיחה קצרה?"

Avoid:
spammy broadcast styling, humanoid robots, stock people, unreadable Hebrew, pushy or promise-heavy language.`,
    usageNote: `לשלוח 2-4 ימים אחרי ההצעה, בשעות היום. אישית — לא כרשימת תפוצה. השאר את {שם} ו-{נציג} להתאמה ידנית לפני שליחה.`,
    formats: ['whatsapp_msg'], tags: ['whatsapp', 'automation'], relatedOffers: ['automation', 'crm_smart'],
  },
  {
    id: 'followups_whatsapp-2', categoryId: 'followups_whatsapp',
    title: `החייאת ליד שקט`,
    description: `פולואפ אחרון ומכובד ללידים שהתקררו, שמשאיר דלת פתוחה בלי לחץ.`,
    goal: `לסגור מעגל עם ליד שהפסיק להגיב ולתת לו הזדמנות נוחה לחזור.`,
    bestFor: `לידים שלא הגיבו 2-3 שבועות אחרי כמה ניסיונות יצירת קשר.`,
    tone: `חם ולא לוחץ`,
    hook: `לא רוצה להעמיס — רק לוודא שלא פספסתי אותך`,
    message: `היי {שם}, לא רוצה להעמיס עליך בהודעות. חשוב לי פשוט לסגור מעגל: אם הנושא של מערכת דיגיטלית לעסק כבר לא רלוונטי כרגע — לגמרי בסדר, אשמח לדעת. ואם התזמון פשוט לא התאים, אני כאן כשתהיה מוכן להעלות את ערך העסק שלך.`,
    cta: `מתאים שאחזור בעוד חודש, או שנסגור לבינתיים?`,
    prompt: `Create a calm Hebrew WhatsApp-style visual card for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
A respectful "door stays open" closing message card (the send text lives in the message field, not here).

Composition:
Vertical card. A minimal graphic of a slightly open door or a thin forward arrow, lots of air, one short caption line.

Main object / metaphor:
An open door left intentionally ajar.

Business context:
ArtValue's follow-up library — a graceful last touch, not a push.

Style direction:
Elegant, restrained, plenty of negative space, modern Hebrew type, no people.

Color & lighting:
Muted light or soft dark palette with a gold accent, gentle light.

Exact Hebrew text overlay (render legibly, right-to-left):
"הדלת נשארת פתוחה"
"ArtValue — כשתהיה מוכן, נבנה לך ערך אמיתי"

CTA text:
"נסגור לבינתיים, או שאחזור בעוד חודש?"

Avoid:
superlatives, humanoid robots, stock people, unreadable Hebrew, pressure or promise-heavy language.`,
    usageNote: `לשלוח כהודעה אחרונה בסדרה, אחרי 2-3 ניסיונות. מנוסח כסגירת מעגל מכובדת, לא כדחיפה. השאר את {שם} להתאמה ידנית.`,
    formats: ['whatsapp_msg'], tags: ['whatsapp', 'automation'], relatedOffers: ['automation', 'crm_smart'],
  },

  // --- קמפיינים חודשיים ---
  {
    id: 'monthly_campaigns-1', categoryId: 'monthly_campaigns',
    title: `תמה חודשית — פוקוס אחד`,
    description: `מגדירה נושא/פוקוס עסקי אחד לכל החודש ומחברת אותו לנכס דיגיטלי ספציפי שArtValue בונה.`,
    goal: `לשמור נוכחות עקבית לאורך החודש עם מסר מרכזי אחד שקל לזכור.`,
    bestFor: `פרסום אורגני קבוע (פוסטים/סטורי) לאורך החודש, לבעלי עסק שרוצים מסר ברור במקום תוכן מפוזר.`,
    tone: `ממוקד ובוגר`,
    hook: `נושא אחד לחודש. פחות רעש, יותר מסר.`,
    message: `כל חודש בוחרים פוקוס אחד לעסק, ובונים סביבו את הנכס הדיגיטלי שבאמת מזיז את המחט — דף נחיתה, אוטומציה או משפך חכם. במקום עשרה מסרים מבולבלים, מסר אחד ברור שרץ לאורך כל החודש ובונה נוכחות עקבית. ככה בונים ערך, צעד אחרי צעד.`,
    cta: `בואו נבחר את הפוקוס של החודש שלכם.`,
    prompt: `Create a premium Hebrew campaign-theme ad for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
One monthly focus radiating into the relevant digital asset.

Composition:
Square 1:1. A dark subtle grid background with one glowing "focus" element at center (a lit circle or a soft target) from which thin lines reach out to a few service icons (landing page, automation, funnel). Ample breathing room.

Main object / metaphor:
A single focal point connected to one chosen asset.

Business context:
ArtValue runs one clear monthly message tied to one built asset.

Style direction:
Technical yet elegant, bold Hebrew type, brand palette, no clutter.

Color & lighting:
Dark background, one accent glow, soft even light.

Exact Hebrew text overlay (render legibly, right-to-left):
"נושא אחד. חודש שלם. ערך אמיתי."
"ArtValue — מערכת דיגיטלית שמעלה את הערך של העסק שלך"

CTA text:
"נבחר את הפוקוס שלך"

Avoid:
superlatives, humanoid robots, cluttered visuals, unreadable Hebrew, exaggerated promises.`,
    usageNote: `בתחילת כל חודש החלף את שם הנושא ואת הנכס הדיגיטלי המתאים, ושמור על אותה מסגרת ויזואלית לאורך החודש לזיהוי מיידי.`,
    formats: ['post_image', 'carousel'], tags: ['ads', 'branding'], relatedOffers: ['content_monthly', 'digital_presence'],
  },
  {
    id: 'monthly_campaigns-2', categoryId: 'monthly_campaigns',
    title: `מסלול חודשי בארבעה שלבים`,
    description: `מציגה את החודש כמסע בארבעה שלבים — מבנה, נראות, לכידה, אוטומציה — שכל שבוע מקדם שלב.`,
    goal: `להראות ש-ArtValue בונה מערכת שלמה ומחוברת, ולתת לעוקבים תחושת התקדמות שבועית.`,
    bestFor: `סדרת פוסטים שבועית לאורך החודש, לעסקים שמתלבטים אם הם צריכים "עוד אתר" וצריכים לראות את התמונה המלאה.`,
    tone: `מובנה וברור`,
    hook: `החודש בונים מערכת — שלב אחרי שלב.`,
    message: `מפצלים את החודש לארבעה שלבים: מבנה דיגיטלי שעובד, נראות שמביאה אנשים, לכידת לידים חכמה, ואוטומציה שממשיכה גם כשאתם לא מול המסך. כל שבוע מתקדמים שלב, וכל שלב מתחבר לקודם — כי זו לא רשימת רכיבים, זו מערכת אחת שבונה ערך. בסוף החודש יש לכם תשתית שממשיכה לעבוד.`,
    cta: `בואו נתחיל את השלב הראשון.`,
    prompt: `Create a premium Hebrew roadmap-style ad for ArtValue, a digital business-systems studio. Optimized for GPT Image 2.

Visual concept:
A four-step monthly path building one complete system.

Composition:
Square or vertical. A stepped roadmap of four numbered stations connected by one flowing line, each station with a minimal icon — structure, visibility, lead capture, automation. Right-to-left start. Clear hierarchy, active station highlighted.

Main object / metaphor:
A connected four-stop route assembling a whole system.

Business context:
ArtValue builds a connected system across the month, one weekly stage at a time.

Style direction:
Modern, organized, technical; clean Hebrew type; brand-colored connecting line.

Color & lighting:
Luxurious dark background, accent-colored path, soft even light.

Exact Hebrew text overlay (render legibly, right-to-left):
"ארבעה שלבים. חודש אחד. מערכת שלמה."
Station labels along the path (right-to-left): "מבנה דיגיטלי" then "נראות" then "לכידת לידים" then "אוטומציה"
"לא עוד אתר — מערכת שמעלה את הערך של העסק שלך."

CTA text:
"נתחיל את השלב הראשון"

Avoid:
generic overloaded icons, humanoid robots, unreadable Hebrew, flat hierarchy, hype claims.`,
    usageNote: `פרסמו פוסט אחד לכל שלב מדי שבוע לאורך החודש; בכל פוסט הדגישו את התחנה הפעילה בקו המחבר כדי לשמר תחושת רצף והתקדמות.`,
    formats: ['carousel', 'post_image'], tags: ['ads', 'branding'], relatedOffers: ['content_monthly', 'digital_presence'],
  },
];

export const itemById = (id) => CONTENT_LIBRARY_ITEMS.find((i) => i.id === id) || null;
export const itemsByCategory = (categoryId) => CONTENT_LIBRARY_ITEMS.filter((i) => i.categoryId === categoryId);

// Match content/ad templates to a PRIORITY-ORDERED list of service (offer) ids —
// e.g. a lead category's [offerId, entryOfferId, ...upsell]. Returns up to `limit`
// ORIGINAL content items (never mutated), ranked by the highest-priority offer each
// item matches via item.relatedOffers; original library order breaks ties.
// Empty / non-array / no-match input → []. Pure & deterministic (no side effects).
export function matchContentTemplates(offerIds, limit = 4) {
  if (!Array.isArray(offerIds)) return [];
  const priority = [];
  for (const id of offerIds) if (id && !priority.includes(id)) priority.push(id);
  if (priority.length === 0) return [];

  const matched = [];
  CONTENT_LIBRARY_ITEMS.forEach((item, idx) => {
    const offers = item.relatedOffers || [];
    let rank = -1;
    for (let i = 0; i < priority.length; i++) {
      if (offers.includes(priority[i])) { rank = i; break; }
    }
    if (rank >= 0) matched.push({ item, rank, idx });
  });
  matched.sort((a, b) => (a.rank - b.rank) || (a.idx - b.idx));
  // limit is "how many you want": a non-positive limit yields no results.
  const capped = limit > 0 ? matched.slice(0, limit) : [];
  return capped.map((m) => m.item);
}

// ---- summary stats for the KPI strip (derived, deterministic) ----
export const STATS = {
  categories: CONTENT_CATEGORIES.length,
  items: CONTENT_LIBRARY_ITEMS.length,
  formats: Object.keys(CONTENT_FORMATS).length,
  ctas: new Set(CONTENT_LIBRARY_ITEMS.map((i) => i.cta)).size,
};

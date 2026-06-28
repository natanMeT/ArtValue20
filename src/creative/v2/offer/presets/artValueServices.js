// ===================================================================
// ArtValue Services Preset — the FIRST concrete specialization of the generic
// Offer Campaign Bridge. It is PURE DATA + a small deterministic interface:
//
//   selectOffer(request)   → which service to pitch + pains/angle/proof/visual
//   defaultsFor(request)   → he-IL language + concrete (non-hype) tone + channel
//   objectionsFor(selection) → objection bank for the chosen service
//
// It holds NO control flow that is specific to the engine, calls NO model, imports
// NOTHING (runtime / poster / judge / diagnostics / providers), performs NO I/O,
// uses NO Date.now and NO randomness, and NEVER mutates its input. The generic
// engine stays preset-agnostic by talking only to this interface, so a second
// preset can be added later without touching the engine.
//
// Copy is intentionally concrete and not hype-heavy. It is a deterministic
// baseline a future AI Provider Router may polish in place (same shape).
// ===================================================================

export const ARTVALUE_PRESET_ID = 'artvalue_services';
export const ARTVALUE_DEFAULT_LANGUAGE = 'he-IL';
export const ARTVALUE_DEFAULT_TONE = Object.freeze(['ענייני', 'מקצועי', 'ישיר']);
export const ARTVALUE_DEFAULT_CHANNEL = 'whatsapp';
export const ARTVALUE_DEFAULT_OBJECTIVE = 'generate_leads';

// ---- services catalog: the offers ArtValue actually sells ----
export const ARTVALUE_SERVICES = Object.freeze({
  smart_crm: {
    id: 'smart_crm',
    name: 'מערכת CRM חכמה',
    valueProposition: 'כל הלידים, הלקוחות והמעקבים במקום אחד — בלי לאבד פניות בדרך.',
    whatsIncluded: ['ניהול לידים ולקוחות', 'מעקב משימות ותזכורות', 'דשבורד עם תמונת מצב', 'ייבוא הנתונים הקיימים'],
  },
  business_management: {
    id: 'business_management',
    name: 'מערכת ניהול עסקית מותאמת',
    valueProposition: 'מערכת אחת שמנהלת את הזרימה של העסק — לפי איך שאתם באמת עובדים.',
    whatsIncluded: ['אפיון תהליכי העבודה', 'מודולים מותאמים לעסק', 'הרשאות והפרדת תפקידים', 'דוחות תפעוליים'],
  },
  ai_assistant: {
    id: 'ai_assistant',
    name: 'עוזר AI בתוך מערכת העסק',
    valueProposition: 'עוזר חכם שמסכם, מנסח ועונה — מתוך הנתונים של העסק עצמו.',
    whatsIncluded: ['חיבור לנתוני העסק', 'מענה וניסוח אוטומטי', 'סיכומי שיחות ופניות', 'בקרת איכות על הפלט'],
  },
  website: {
    id: 'website',
    name: 'אתר תדמית',
    valueProposition: 'נוכחות מקצועית שמסבירה תוך שניות מה אתם עושים ולמי.',
    whatsIncluded: ['עיצוב מותאם למותג', 'מבנה ברור וטעינה מהירה', 'התאמה למובייל', 'חיבור ליצירת קשר'],
  },
  landing_page: {
    id: 'landing_page',
    name: 'דף נחיתה',
    valueProposition: 'דף ממוקד אחד שמוביל את הגולש לפעולה אחת ברורה.',
    whatsIncluded: ['מסר ממוקד והצעה ברורה', 'טופס המרה', 'חיבור למעקב', 'גרסה למובייל'],
  },
  automation: {
    id: 'automation',
    name: 'אוטומציות',
    valueProposition: 'התהליכים החוזרים רצים לבד — אתם משוחררים לעבודה שמכניסה כסף.',
    whatsIncluded: ['מיפוי תהליכים חוזרים', 'אוטומציות מעקב ותזכורות', 'חיבור בין הכלים הקיימים', 'התראות על מה שחשוב'],
  },
  sales_funnel: {
    id: 'sales_funnel',
    name: 'משפך מכירות',
    valueProposition: 'מסלול מסודר מהפנייה הראשונה ועד הסגירה — בלי לידים שנופלים.',
    whatsIncluded: ['שלבי משפך ברורים', 'מעקב המרות', 'הודעות מעקב אוטומטיות', 'נקודות שיפור מדידות'],
  },
  custom_demo: {
    id: 'custom_demo',
    name: 'דמו מותאם',
    valueProposition: 'הדגמה חיה על תהליך אמיתי שלכם — לראות לפני שמחליטים.',
    whatsIncluded: ['בחירת תהליך אמיתי', 'בניית דמו ממוקד', 'הצגה והסבר', 'מסקנות והמשך'],
  },
  digital_presence: {
    id: 'digital_presence',
    name: 'חבילת נוכחות דיגיטלית',
    valueProposition: 'הבסיס הדיגיטלי של העסק במקום אחד — אתר, דף נחיתה וערוצי פנייה.',
    whatsIncluded: ['אתר או דף נחיתה', 'נכסים בסיסיים למותג', 'ערוצי יצירת קשר', 'מעקב בסיסי'],
  },
  creative_campaign: {
    id: 'creative_campaign',
    name: 'נכסים קריאטיביים לקמפיין',
    valueProposition: 'ויזואל שמוכר את השירות — לא רק יפה, אלא ברור ומדויק.',
    whatsIncluded: ['קונספט ויזואלי', 'נכסים לפי ערוץ', 'מסר תואם לקהל', 'גרסאות לבדיקה'],
  },
});

// ---- businessType → recommended offer + pains + angle + proof + visual ----
// Matched by keyword (Hebrew + English) against businessType/notes/audience.
const RULES = [
  {
    id: 'real_estate',
    keywords: ['נדל', 'תיווך', 'מתווך', 'real estate', 'realtor', 'realty'],
    offerId: 'smart_crm',
    pains: ['לידים מתפזרים בין וואטסאפ, מייל וטלפון', 'אין מעקב מסודר אחרי כל פנייה', 'עסקאות נופלות כי לא חזרו בזמן'],
    proofPoints: ['ריכוז כל הפניות במקום אחד', 'תזכורת אוטומטית לכל ליד', 'תמונת מצב יומית על הצנרת'],
    angle: {
      angle: 'שום ליד לא הולך לאיבוד',
      keyMessage: 'כל פנייה מנוהלת ונענית בזמן — מהשיחה הראשונה ועד הסגירה.',
      hook: 'כמה עסקאות נפלו החודש כי לא חזרתם בזמן?',
    },
    visual: { mood: 'נקי ומקצועי', heroIdea: 'מסך CRM יחיד שמרכז את כל הפניות', palette: ['כחול עמוק', 'לבן', 'אפור'] },
  },
  {
    id: 'clinic',
    keywords: ['מרפאה', 'קליניק', 'clinic', 'רופא', 'שיניים', 'dentist', 'מטפל', 'therapist', 'אסתטיק', 'קוסמטיק'],
    offerId: 'automation',
    pains: ['זמן רב מתבזבז על תיאום תורים', 'מטופלים שוכחים תורים ולא מגיעים', 'מענה ידני לכל פנייה חוזרת'],
    proofPoints: ['תזכורות תורים אוטומטיות', 'פחות ביטולים ואי-הגעות', 'מענה מהיר לפניות שגרתיות'],
    angle: {
      angle: 'פחות תיאום ידני, יותר טיפול',
      keyMessage: 'התורים והתזכורות רצים לבד — אתם מתפנים למטופלים.',
      hook: 'כמה שעות בשבוע הולכות רק על תיאום תורים?',
    },
    visual: { mood: 'רגוע ונקי', heroIdea: 'יומן שמתעדכן לבד', palette: ['טורקיז', 'לבן', 'ירוק רך'] },
  },
  {
    id: 'restaurant',
    keywords: ['מסעד', 'restaurant', 'בית קפה', 'cafe', 'קייטרינג', 'food', 'אוכל', 'בר'],
    offerId: 'digital_presence',
    pains: ['אין נוכחות דיגיטלית מסודרת', 'לקוחות לא מוצאים תפריט או דרך להזמין', 'תלות מלאה בפלטפורמות חיצוניות'],
    proofPoints: ['נוכחות מותגית עצמאית', 'דרך פשוטה להזמין ולפנות', 'שליטה בערוצים שלכם'],
    angle: {
      angle: 'הבית הדיגיטלי שלכם',
      keyMessage: 'מקום אחד מסודר שמציג מי אתם ומקל על הלקוח לפעול.',
      hook: 'איפה לקוח חדש מוצא אתכם — ומה הוא רואה?',
    },
    visual: { mood: 'חם ומזמין', heroIdea: 'מסך נייד עם המותג והתפריט', palette: ['חום חם', 'שמנת', 'נחושת'] },
  },
  {
    id: 'ecommerce',
    keywords: ['חנות', 'אונליין', 'ecommerce', 'e-commerce', 'shop', 'store', 'מכירות אונליין', 'דרופ'],
    offerId: 'sales_funnel',
    pains: ['מבקרים נכנסים אבל לא קונים', 'אין מעקב אחרי נטישת עגלה', 'תקציב פרסום נשרף בלי המרות'],
    proofPoints: ['מסלול המרה מסודר', 'מעקב אחרי כל שלב', 'מענה אוטומטי למתעניינים'],
    angle: {
      angle: 'יותר המרות מאותה תנועה',
      keyMessage: 'אותם מבקרים, יותר רכישות — כי המסלול מסודר ולא דולף.',
      hook: 'כמה מהמבקרים שלכם באמת הופכים ללקוחות?',
    },
    visual: { mood: 'אנרגטי ומדויק', heroIdea: 'משפך שממיר תנועה לרכישות', palette: ['סגול', 'לבן', 'מגנטה'] },
  },
  {
    id: 'service_provider',
    keywords: ['שירות', 'יועץ', 'consult', 'coach', 'מאמן', 'עורך דין', 'רואה חשבון', 'freelance', 'פרילנס', 'סוכן'],
    offerId: 'ai_assistant',
    pains: ['יותר מדי זמן על ניסוח הודעות וסיכומים', 'קשה לעקוב אחרי כל לקוח לאורך זמן', 'ידע מפוזר ולא נגיש'],
    proofPoints: ['ניסוח וסיכום אוטומטי מתוך הנתונים', 'מעקב לקוחות מרוכז', 'מענה מהיר ועקבי'],
    angle: {
      angle: 'עוזר חכם שמכיר את העסק',
      keyMessage: 'הניסוח, הסיכומים והמעקב נעשים מתוך הנתונים שלכם — מהר ובאחידות.',
      hook: 'כמה מהיום שלכם הולך על כתיבה וסיכומים?',
    },
    visual: { mood: 'חכם ומאופק', heroIdea: 'עוזר שקורא מתוך נתוני העסק', palette: ['כחול כהה', 'לבן', 'תכלת'] },
  },
  {
    id: 'studio_creative',
    keywords: ['סטודיו', 'studio', 'עיצוב', 'design', 'אמן', 'art', 'צלם', 'photograph', 'קריאטיב'],
    offerId: 'website',
    pains: ['העבודות לא מוצגות בצורה שמוכרת', 'אין נקודת נחיתה מקצועית לפניות', 'המותג נראה פחות ממה שהוא'],
    proofPoints: ['הצגת עבודות שמייצרת אמון', 'נקודת פנייה ברורה', 'מותג שנראה מקצועי'],
    angle: {
      angle: 'תנו לעבודות למכור',
      keyMessage: 'אתר שמציג את הרמה האמיתית שלכם וממיר מתעניין לפנייה.',
      hook: 'האתר שלכם מייצג את הרמה של העבודה שלכם?',
    },
    visual: { mood: 'נקי ואלגנטי', heroIdea: 'גלריית עבודות נקייה', palette: ['שחור', 'לבן', 'זהב מעודן'] },
  },
];

const DEFAULT_RULE = {
  id: 'general',
  offerId: 'digital_presence',
  pains: ['נוכחות דיגיטלית חלקית או מפוזרת', 'תהליכים ידניים שגוזלים זמן', 'קשה למדוד מאיפה מגיעים לקוחות'],
  proofPoints: ['בסיס דיגיטלי מסודר', 'תהליך פנייה ברור', 'מעקב בסיסי על מקורות'],
  angle: {
    angle: 'בסיס דיגיטלי מסודר',
    keyMessage: 'מקום אחד מסודר שמציג את העסק ומקל על לקוח לפעול.',
    hook: 'מה לקוח חדש רואה כשהוא מחפש אתכם?',
  },
  visual: { mood: 'נקי ומקצועי', heroIdea: 'מסך יחיד שמרכז את הנוכחות הדיגיטלית', palette: ['כחול', 'לבן', 'אפור'] },
};

// ---- objection bank: general + per-service additions ----
const GENERAL_OBJECTIONS = [
  { objection: 'זה יקר לי', reply: 'אפשר להתחיל ממודול אחד שמחזיר את ההשקעה, ולהרחיב רק כשרואים ערך.' },
  { objection: 'כבר יש לנו מערכת', reply: 'נשתלב עם הקיים או נחליף רק את החלק שמעכב — בלי לזרוק מה שעובד.' },
  { objection: 'אין לי זמן להטמיע', reply: 'ההטמעה וייבוא הנתונים עלינו; אתם מקבלים מערכת שכבר עובדת.' },
  { objection: 'לא בטוח שזה יתאים לי', reply: 'נתחיל בדמו קצר על תהליך אמיתי שלכם, לפני כל התחייבות.' },
];

const OFFER_OBJECTIONS = {
  ai_assistant: [
    { objection: 'AI לא יבין את העסק שלי', reply: 'העוזר עובד מתוך הנתונים שלכם, עם בקרת איכות על כל פלט.' },
  ],
  smart_crm: [
    { objection: 'נראה לי מסובך', reply: 'מתחילים פשוט: לידים ותזכורות בלבד, ומרחיבים לפי קצב.' },
  ],
  sales_funnel: [
    { objection: 'יש לנו מספיק תנועה', reply: 'בדיוק — המשפך מוציא יותר מאותה תנועה בלי תקציב נוסף.' },
  ],
};

// ---- small deterministic helpers ----
const str = (v) => String(v == null ? '' : v).trim();
const norm = (v) => str(v).toLowerCase();
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

function findRule(prospect) {
  const hay = norm([prospect.businessType, prospect.notes, prospect.audience].filter(Boolean).join(' '));
  if (!hay) return null;
  return RULES.find((r) => r.keywords.some((k) => hay.includes(norm(k)))) || null;
}

function selectionFromRule(rule, matchType) {
  const svc = ARTVALUE_SERVICES[rule.offerId];
  return {
    service: svc.name,
    serviceId: svc.id,
    valueProposition: svc.valueProposition,
    whatsIncluded: [...svc.whatsIncluded],
    proofPoints: [...rule.proofPoints],
    pains: [...rule.pains],
    angle: { ...rule.angle },
    visual: { mood: rule.visual.mood, heroIdea: rule.visual.heroIdea, palette: [...rule.visual.palette] },
    matchType,
  };
}

function resolveServiceByName(serviceText) {
  const n = norm(serviceText);
  for (const id of Object.keys(ARTVALUE_SERVICES)) {
    const svc = ARTVALUE_SERVICES[id];
    if (n === norm(id) || n === norm(svc.name) || n.includes(norm(svc.name)) || norm(svc.name).includes(n)) {
      return svc;
    }
  }
  return null;
}

function selectionFromOverride(override) {
  const svc = resolveServiceByName(override.service);
  const valueProposition = str(override.valueProposition)
    || (svc ? svc.valueProposition : 'פתרון מותאם לצורך הספציפי של העסק.');
  return {
    service: svc ? svc.name : str(override.service),
    serviceId: svc ? svc.id : 'custom',
    valueProposition,
    whatsIncluded: svc ? [...svc.whatsIncluded] : ['אפיון קצר של הצורך', 'בנייה מותאמת', 'הטמעה ובדיקה'],
    proofPoints: [...DEFAULT_RULE.proofPoints],
    pains: [...DEFAULT_RULE.pains],
    angle: { ...DEFAULT_RULE.angle },
    visual: { mood: DEFAULT_RULE.visual.mood, heroIdea: DEFAULT_RULE.visual.heroIdea, palette: [...DEFAULT_RULE.visual.palette] },
    matchType: 'override',
  };
}

// ---- the preset interface (deterministic; never mutates the request) ----
function selectOffer(request) {
  const prospect = isObj(request) && isObj(request.prospect) ? request.prospect : {};
  const override = isObj(request) ? request.offerOverride : null;
  if (isObj(override) && str(override.service)) return selectionFromOverride(override);
  const rule = findRule(prospect);
  return rule ? selectionFromRule(rule, 'rule') : selectionFromRule(DEFAULT_RULE, 'default');
}

function defaultsFor(request) {
  const goal = isObj(request) && isObj(request.goal) ? request.goal : {};
  return {
    language: str(goal.language) || ARTVALUE_DEFAULT_LANGUAGE,
    tone: Array.isArray(goal.tone) && goal.tone.length ? [...goal.tone] : [...ARTVALUE_DEFAULT_TONE],
    channel: str(goal.channel) || ARTVALUE_DEFAULT_CHANNEL,
    objective: str(goal.objective) || ARTVALUE_DEFAULT_OBJECTIVE,
  };
}

function objectionsFor(selection) {
  const id = isObj(selection) ? selection.serviceId : '';
  const specific = OFFER_OBJECTIONS[id] || [];
  const seen = new Set();
  const out = [];
  for (const o of [...specific, ...GENERAL_OBJECTIONS]) {
    const key = norm(o.objection);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ objection: str(o.objection), reply: str(o.reply) });
  }
  return out;
}

export const artValueServicesPreset = Object.freeze({
  id: ARTVALUE_PRESET_ID,
  selectOffer,
  defaultsFor,
  objectionsFor,
});

export default artValueServicesPreset;

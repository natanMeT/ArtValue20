// ===================================================================
// Jake Business Brain — ArtValue Context Pack (Option B: data + builders).
// Pure, deterministic module. NO persistence, NO store, NO AI, NO network,
// NO events, NO window, NO Date.now, NO randomness — importable in Node.
//
// Gives Jake structured knowledge of WHO ArtValue is (positioning,
// differentiators, visual language), WHAT it sells (compact own-copy
// service catalog), and WHAT the system itself can do (capability
// registry derived from the live Creative Workflow Map). The builders
// return final Hebrew prompt-seed strings PREPARED for the existing
// `jake:ask` seam — nothing here dispatches events or touches the
// assistant engine. Follows the growthContext.js pattern.
//
// The service copy here is intentionally its own compact lane — it does
// NOT import from src/creative/v2/offer/** (frozen Creative V2 territory).
// ===================================================================

import { POSITIONING } from './growthContentAds.js';
import { liveWorkflows } from './creativeWorkflows.js';

// ---- safety / grounding block appended to every builder output ----
export const BUSINESS_BRAIN_SAFETY = [
  'אל תמציא נתונים שלא סופקו.',
  'אל תבטיח תוצאות עסקיות ודאיות.',
  'שמור על שפה מקצועית, מדויקת ולא מוגזמת.',
  'השתמש ביכולות המערכת רק כהצעה לביצוע ידני.',
  'אם חסר מידע, בקש השלמה קצרה.',
];

const safetyBlock = () => ['כללים:', ...BUSINESS_BRAIN_SAFETY.map((r) => `- ${r}`)].join('\n');

// Recursively freeze plain objects/arrays so the brain is truly read-only.
function deepFreeze(v) {
  if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) deepFreeze(v[k]);
    Object.freeze(v);
  }
  return v;
}

// ===================================================================
// The brain — ArtValue-first, pack-shaped: a second business copies this
// file and swaps the content, exactly like jakePack's philosophy.
// ===================================================================
export const BUSINESS_BRAIN = deepFreeze({
  id: 'artvalue',
  profile: {
    name: 'ArtValue',
    positioning: POSITIONING.core, // "לא עוד אתר. מערכת דיגיטלית שמעלה את הערך של העסק שלך."
    positioningAlt: 'לא עוד CRM גנרי — מערכת שנבנית מתוך ההקשר של העסק. מערכת שמתרגמת חזון לפעולות יומיות.',
    differentiators: [
      'מערכות נבנות מתוך ההקשר והתהליכים האמיתיים של העסק — לא תבנית גנרית',
      'עוזר AI (ג׳יק) מוטמע בתוך המערכת ועובד על נתוני העסק עצמו',
      'סטודיו קריאייטיב פנימי — פוסטרים, ויזואלים למוצר ווידאו נוצרים בתוך המערכת',
      'מסלול אחד מתכנון (Growth OS) ועד ביצוע (Studio) בלי לצאת מהמערכת',
    ],
    audiences: [
      'בעלי עסקים קטנים ובינוניים שמנהלים את העסק ידנית (וואטסאפ, אקסל, פתקים)',
      'עסקי בוטיק ופרימיום שרוצים נוכחות ברמה של המוצר שלהם',
      'יזמים ונותני שירות שרוצים מערכת אחת במקום עשרה כלים',
    ],
    tone: ['פרימיום', 'חד ומדויק', 'ענייני ולא מוגזם', 'אנושי ומקצועי'],
  },
  visual: {
    style: 'dark premium · Business OS dashboard',
    colors: ['#d4ff3f', '#c7bfff', '#0e0e0e'],
    rules: [
      'רקע כהה עמוק (שחור / נייבי / גרפיט) עם ליים חשמלי #d4ff3f כצבע הדגשה',
      'אסתטיקה של דשבורד Business OS — SaaS עסקי פרימיום, נקי ורציני',
      'מוקד ויזואלי יחיד לכל נכס',
      'טקסט עברי חד וקריא (RTL), ניגודיות גבוהה',
    ],
    forbidden: [
      'לא גיימינג ולא קריפטו',
      'לא ילדותי ולא צעקני',
      'לא תבנית גנרית ולא סטוק של לחיצות ידיים',
    ],
  },
  services: {
    crm: {
      id: 'crm',
      name: 'מערכת CRM חכמה',
      pitch: 'כל הלידים, הלקוחות והמעקבים במקום אחד — נבנית לפי איך שהעסק באמת עובד.',
      pains: ['לידים מתפזרים בין וואטסאפ, מייל וטלפון', 'אין מעקב מסודר אחרי פניות', 'עסקאות נופלות כי לא חזרו בזמן'],
      cta: 'לתיאום דמו קצר על תהליך אמיתי שלכם',
    },
    automations: {
      id: 'automations',
      name: 'אוטומציות',
      pitch: 'התהליכים החוזרים רצים לבד — תזכורות, מעקבים והתראות בלי עבודה ידנית.',
      pains: ['זמן מתבזבז על תיאומים ותזכורות ידניות', 'דברים נופלים בין הכיסאות', 'מענה איטי לפניות שגרתיות'],
      cta: 'למיפוי קצר של התהליכים החוזרים אצלכם',
    },
    websites: {
      id: 'websites',
      name: 'אתר תדמית',
      pitch: 'נוכחות מקצועית שמסבירה תוך שניות מה אתם עושים ולמי — ברמה של העסק.',
      pains: ['האתר לא מייצג את הרמה האמיתית', 'לקוחות לא מבינים מה מציעים', 'אין נקודת נחיתה מסודרת לפניות'],
      cta: 'לשיחת אפיון קצרה',
    },
    landingPages: {
      id: 'landing-pages',
      name: 'דף נחיתה',
      pitch: 'דף ממוקד אחד שמוביל את הגולש לפעולה אחת ברורה.',
      pains: ['תנועה מקמפיינים לא מומרת', 'המסר מפוזר מדי', 'אין טופס ומעקב מסודרים'],
      cta: 'לבדיקת התאמה לקמפיין הבא שלכם',
    },
    businessOs: {
      id: 'business-os',
      name: 'Business OS — מערכת ניהול מותאמת',
      pitch: 'מערכת הפעלה אחת לעסק: לקוחות, משימות, כספים ותובנות — לפי ההקשר שלכם.',
      pains: ['העסק מנוהל בעשרה כלים שלא מדברים', 'אין תמונת מצב אחת', 'תהליכים תלויים בזיכרון של אנשים'],
      cta: 'לפגישת היכרות עם דמו חי',
    },
    creativeStudio: {
      id: 'creative-studio',
      name: 'סטודיו קריאייטיב',
      pitch: 'פוסטרים, ויזואלים וסרטונים לעסק — נוצרים בתוך המערכת, בשפה הוויזואלית שלכם.',
      pains: ['תוכן שיווקי יקר ואיטי להפקה', 'חוסר עקביות ויזואלית', 'תלות במעצבים חיצוניים לכל פוסט'],
      cta: 'לצפייה בדוגמאות מהסטודיו',
    },
    productVisuals: {
      id: 'product-visuals',
      name: 'ויזואלים למוצר',
      pitch: 'תמונות מוצר ופרזנטורים ברמת קמפיין — כולל שימור מוצר מדויק (לוגו וטקסט נשמרים 1:1).',
      pains: ['צילומי מוצר יקרים', 'הלוגו והפרטים משתבשים בעריכות', 'אין ויזואל שיווקי עקבי למוצר'],
      cta: 'לשליחת תמונת מוצר אחת ולקבלת דוגמה',
    },
    growthOs: {
      id: 'growth-os',
      name: 'Growth OS — מרכז צמיחה',
      pitch: 'מיפוי לידים, תוכנית פעולה חודשית, הכנת שיחות וספריית תוכן — תכנון שמחובר לביצוע.',
      pains: ['אין תוכנית שיווק מסודרת', 'לא ברור על איזה קהל להתמקד', 'שיחות מכירה בלי הכנה'],
      cta: 'לבניית תוכנית חודש ראשונה',
    },
  },
  contentPillars: [
    { id: 'proof', label: 'הוכחה', idea: 'מקרי לקוח, לפני/אחרי של תהליך עבודה, מספרים אמיתיים ממערכת חיה' },
    { id: 'education', label: 'חינוך', idea: 'איך מזהים שהעסק צריך מערכת, טעויות נפוצות בניהול לידים, מדריכים קצרים' },
    { id: 'behind-scenes', label: 'הצצה', idea: 'איך נבנית מערכת בהתאמה אישית, הסטודיו בפעולה, ג׳יק עונה בזמן אמת' },
    { id: 'positioning', label: 'בידול', idea: 'למה לא עוד אתר / לא עוד CRM גנרי — מערכת מתוך ההקשר של העסק' },
    { id: 'offer', label: 'הצעה', idea: 'שירות אחד בפוקוס: מה מקבלים, למי מתאים, וקריאה לפעולה אחת' },
  ],
});

// ===================================================================
// Capability registry — what the SYSTEM itself can do. Studio entries are
// DERIVED from the live Creative Workflow Map (never soon/deferred cards);
// static entries cover surfaces that are not workflow cards. Bounded + safe
// fields only. Deterministic (same catalog → same list).
// ===================================================================
const STATIC_CAPABILITIES = deepFreeze([
  { id: 'image-studio', kind: 'system', title: 'Image Studio', description: 'סטודיו התמונות המרכזי — כל מצבי היצירה והעריכה במקום אחד, כולל גלריה.' },
  { id: 'growth-os', kind: 'system', title: 'Growth OS', description: 'מרכז הצמיחה: מיפוי קטגוריות לידים, לוח פעולה חודשי, הכנת שיחות וספריית תוכן.' },
  { id: 'gallery', kind: 'system', title: 'גלריה / היסטוריית רנדרים', description: 'כל התוצרים (תמונות ווידאו) נשמרים ומסומנים לפי מקור, לשימוש חוזר.' },
  { id: 'creative-workflow-map', kind: 'system', title: 'מפת Workflows קריאייטיביים', description: 'קטלוג מסודר של כל יכולות היצירה החיות במערכת.' },
  { id: 'product-lock-blend', kind: 'system', title: 'שיפור חיבור וצללים (Product Lock B2)', description: 'בתוך "מוצר מדויק": AI מוסיף צל מגע וחיבור טבעי סביב הקצוות בלבד — פיקסלי המוצר נשמרים 1:1.' },
]);

export function systemCapabilities() {
  const studio = liveWorkflows().map((w) => ({
    id: w.id,
    kind: 'studio',
    title: w.title,
    description: w.description,
    ...(w.mode ? { mode: w.mode } : {}),
    engine: w.engine,
    tags: [...w.tags],
  }));
  return [...studio, ...STATIC_CAPABILITIES.map((c) => ({ ...c }))];
}

// ---- small deterministic helpers ----
const str = (v) => String(v == null ? '' : v).trim();
const norm = (v) => str(v).toLowerCase();
const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const SERVICES = Object.values(BUSINESS_BRAIN.services);

// Resolve a service by key, id, or (partial) Hebrew name. Null when unmatched.
function findService(idOrName) {
  const n = norm(idOrName);
  if (!n) return null;
  for (const key of Object.keys(BUSINESS_BRAIN.services)) {
    const svc = BUSINESS_BRAIN.services[key];
    if (n === norm(key) || n === norm(svc.id) || n === norm(svc.name)) return svc;
  }
  return SERVICES.find((svc) => n.includes(norm(svc.name)) || norm(svc.name).includes(n)) || null;
}

const profileLines = () => [
  `העסק: ${BUSINESS_BRAIN.profile.name} — ${BUSINESS_BRAIN.profile.positioning}`,
  `בידול: ${BUSINESS_BRAIN.profile.positioningAlt}`,
  `קהלים: ${BUSINESS_BRAIN.profile.audiences.join(' · ')}`,
  `טון: ${BUSINESS_BRAIN.profile.tone.join(', ')}`,
];

const visualLines = () => [
  `סגנון ויזואלי: ${BUSINESS_BRAIN.visual.style} · צבעים: ${BUSINESS_BRAIN.visual.colors.join(' ')}`,
  ...BUSINESS_BRAIN.visual.rules.map((r) => `- ${r}`),
  `להימנע: ${BUSINESS_BRAIN.visual.forbidden.join(' · ')}`,
];

// ===================================================================
// Builder 1 — full Business Brain context (bounded Hebrew snapshot)
// ===================================================================
export function buildBusinessBrainContext(options = {}) {
  const includeCapabilities = options.includeCapabilities ?? true;
  const includeServices = options.includeServices ?? true;
  const maxServices = clampInt(options.maxServices, 1, SERVICES.length, 8);
  const maxCapabilities = clampInt(options.maxCapabilities, 1, 24, 12);

  const parts = [
    'הקשר עסקי — ArtValue Business Brain:',
    '',
    ...profileLines(),
    '',
    ...visualLines(),
  ];

  if (includeServices) {
    parts.push('', 'השירותים שאנחנו מוכרים:');
    for (const svc of SERVICES.slice(0, maxServices)) {
      parts.push(`- ${svc.name}: ${svc.pitch}`);
    }
  }

  parts.push('', 'עמודי תוכן (Content Pillars):');
  for (const p of BUSINESS_BRAIN.contentPillars) parts.push(`- ${p.label}: ${p.idea}`);

  if (includeCapabilities) {
    parts.push('', 'יכולות המערכת (לשימוש כהצעות ביצוע ידניות):');
    for (const c of systemCapabilities().slice(0, maxCapabilities)) {
      parts.push(`- ${c.title}${c.mode ? ` [מצב: ${c.mode}]` : ''}: ${c.description}`);
    }
  }

  parts.push('', safetyBlock());
  return parts.join('\n');
}

// ===================================================================
// Builder 2 — poster brief seed ("ג׳יק, תכין לי פוסטר על ...")
// ===================================================================
const POSTER_SECTIONS = [
  '1. קונספט מרכזי',
  '2. כותרת לפוסטר',
  '3. טקסט קצר לפוסטר',
  '4. קופי לפוסט',
  '5. CTA',
  '6. פרומפט באנגלית ל־Image Studio',
  '7. רעיון לפולואפ / המשך פרסום',
];

export function buildPosterBrief(topicOrServiceId, options = {}) {
  const svc = findService(topicOrServiceId);
  const topic = svc ? svc.name : (str(topicOrServiceId) || 'שירותי ArtValue');
  const audience = str(options.audience) || BUSINESS_BRAIN.profile.audiences[0];

  const serviceLines = svc
    ? [
      `השירות בפוקוס: ${svc.name} — ${svc.pitch}`,
      `כאבי הקהל: ${svc.pains.join(' · ')}`,
      `CTA מומלץ: ${svc.cta}`,
    ]
    : ['אין שירות קטלוגי תואם — התבסס על המיצוב הכללי של ArtValue והנושא שניתן.'];

  return [
    `ג׳יק, תכין לי פוסטר עבור ArtValue בנושא: ${topic}.`,
    '',
    'הקשר:',
    ...profileLines(),
    ...serviceLines,
    `קהל היעד לפוסטר: ${audience}`,
    ...visualLines(),
    'את הפוסטר עצמו ניצור ב-Image Studio של המערכת — לכן סעיף הפרומפט חייב להיות באנגלית, מפורט וויזואלי.',
    '',
    'החזר בדיוק את הסעיפים הבאים:',
    ...POSTER_SECTIONS,
    '',
    safetyBlock(),
  ].join('\n');
}

// ===================================================================
// Builder 3 — monthly content plan seed (day numbers, never real dates)
// ===================================================================
export function buildMonthlyContentPlanSeed(options = {}) {
  const days = clampInt(options.days, 7, 60, 30);
  const focus = findService(options.focusService);
  const audience = str(options.audience) || BUSINESS_BRAIN.profile.audiences[0];
  const cadence = str(options.cadence) || 'פוסט אחד ביום';

  return [
    `ג׳יק, בנה לי תוכנית תוכן ל-${days} ימים עבור ArtValue (${cadence}).`,
    '',
    'הקשר:',
    ...profileLines(),
    focus ? `שירות בפוקוס החודש: ${focus.name} — ${focus.pitch}` : 'ללא שירות יחיד בפוקוס — פזר בין השירותים לפי עמודי התוכן.',
    `קהל היעד: ${audience}`,
    `עמודי התוכן: ${BUSINESS_BRAIN.contentPillars.map((p) => p.label).join(' · ')}`,
    '',
    'לכל יום החזר שורה עם:',
    '- מספר יום (יום 1, יום 2... — בלי תאריכים אמיתיים)',
    '- נושא',
    '- עמוד תוכן',
    '- שירות מקודם',
    '- פורמט (פוסט תמונה / ריל / סטורי / קרוסלה)',
    '- הוק פתיחה',
    '- CTA',
    '- פעולת Studio/Workflow מוצעת (איזה ויזואל להכין במערכת)',
    '- רעיון לפולואפ',
    '',
    safetyBlock(),
  ].join('\n');
}

// ===================================================================
// Builder 4 — one-service campaign seed
// ===================================================================
export function buildServiceCampaignSeed(serviceId, options = {}) {
  const svc = findService(serviceId);
  const audience = str(options.audience) || BUSINESS_BRAIN.profile.audiences[0];

  const focusLines = svc
    ? [
      `השירות: ${svc.name} — ${svc.pitch}`,
      `כאבי הקהל: ${svc.pains.join(' · ')}`,
      `CTA: ${svc.cta}`,
    ]
    : [
      'לא נמצא שירות תואם בקטלוג — בנה קמפיין כללי ל-ArtValue סביב המיצוב המרכזי.',
      `שירותים זמינים: ${SERVICES.map((s) => s.name).join(' · ')}`,
    ];

  return [
    `ג׳יק, בנה לי קמפיין שיווקי עבור ArtValue${svc ? ` סביב השירות: ${svc.name}` : ''}.`,
    '',
    'הקשר:',
    ...profileLines(),
    ...focusLines,
    `קהל היעד: ${audience}`,
    ...visualLines(),
    '',
    'החזר:',
    '- כאב הקהל המרכזי שהקמפיין תוקף',
    '- מיצוב השירות במשפט אחד',
    '- זווית קמפיין (angle) אחת חדה',
    '- רצף של 5–7 פוסטים (לכל פוסט: נושא, הוק, פורמט)',
    '- הצעה / CTA אחיד לקמפיין',
    '- רעיון להודעת פולואפ בוואטסאפ למתעניינים',
    '- כיוון פרומפט ל-Studio לוויזואל המרכזי (באנגלית)',
    '',
    safetyBlock(),
  ].join('\n');
}

// ===================================================================
// Builder 5 — Studio-ready prompt brief, grounded in a REAL live workflow
// ===================================================================
export function buildStudioPromptSeed(workflowId, topic, options = {}) {
  const wf = liveWorkflows().find((w) => w.id === norm(workflowId)) || null;
  const subject = str(topic) || 'ויזואל שיווקי ל-ArtValue';
  const audience = str(options.audience) || BUSINESS_BRAIN.profile.audiences[0];

  const workflowLines = wf
    ? [
      `ה-Workflow: ${wf.title} (${wf.subtitle}) · מנוע: ${wf.engine}${wf.mode ? ` · מצב סטודיו: ${wf.mode}` : ''}`,
      `מה הוא עושה: ${wf.description}`,
      `תגיות: ${wf.tags.join(', ')}`,
    ]
    : ['ה-Workflow המבוקש לא נמצא בין היכולות החיות — הכן בריף כללי ל-Image Studio (טקסט → תמונה).'];

  const productNote = wf && (wf.mode === 'lock' || wf.mode === 'presenter')
    ? 'שים לב: זה workflow של מוצר — ציין שב"מוצר מדויק" (Product Lock) פיקסלי המוצר נשמרים 1:1, ובפרזנטור התוצאה מבוססת AI ועשויה להיות מקורבת.'
    : '';

  return [
    `ג׳יק, הכן לי בריף מוכן ל-Studio בנושא: ${subject}.`,
    '',
    'הקשר:',
    ...profileLines(),
    ...workflowLines,
    `קהל היעד: ${audience}`,
    ...visualLines(),
    productNote,
    '',
    'החזר:',
    '- קונספט קריאייטיבי במשפט-שניים',
    '- קומפוזיציה (מה רואים, מה במוקד)',
    '- סגנון ויזואלי (תואם לזהות של ArtValue)',
    '- פרומפט יצירה באנגלית, מפורט ומוכן להדבקה',
    '- קופי קצר בעברית לפוסט שילווה את התמונה',
    '- CTA',
    '',
    safetyBlock(),
  ].filter(Boolean).join('\n');
}

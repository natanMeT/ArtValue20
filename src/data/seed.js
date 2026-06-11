// ===================================================================
// Seed / demo data for Art Value internal system.
// Art Value = a branding & digital design studio.
// Dates are generated relative to "now" so charts always look fresh.
// ===================================================================

import { OUTREACH_SEED, OUTREACH_SEED_VERSION } from './outreach.js';

const DAY = 86400000;
const now = () => new Date();

function iso(d) {
  return d.toISOString().slice(0, 10);
}
function daysAgo(n) {
  return iso(new Date(now().getTime() - n * DAY));
}
function monthsAgo(n) {
  const d = now();
  d.setMonth(d.getMonth() - n);
  return iso(d);
}

let _id = 0;
const uid = (p) => `${p}_${Date.now().toString(36)}_${(_id++).toString(36)}`;

export const CLIENT_STATUS = ['lead', 'active', 'completed', 'lost'];
export const QUOTE_STATUS = ['draft', 'sent', 'viewed', 'accepted', 'rejected'];

export const PROJECT_TYPES = [
  'מיתוג מלא',
  'עיצוב אתר',
  'זהות חזותית',
  'עיצוב אריזה',
  'קמפיין דיגיטל',
  'עיצוב UI/UX',
];

export const LEAD_SOURCES = [
  'המלצה',
  'אינסטגרם',
  'גוגל',
  'לינקדאין',
  'תערוכה',
  'לקוח חוזר',
];

export const INCOME_CATEGORIES = ['פרויקט', 'ריטיינר', 'ייעוץ', 'מקדמה'];
export const EXPENSE_CATEGORIES = [
  'שכר',
  'פרילנסרים',
  'תוכנה',
  'שיווק',
  'משרד',
  'ציוד',
  'אחר',
];

function makeClients() {
  return [
    {
      id: 'cl_tzipori',
      name: 'האקדמיה של ציפורי',
      contact: 'ציפי לוגסי',
      phone: '0526001122',
      email: 'tzipi@tzipori-academy.co.il',
      status: 'await_approval',
      value: 6500,
      date: daysAgo(21),
      source: 'המלצה',
      projectType: 'עיצוב אתר',
      notes: 'אתר תדמית לאקדמיה לציפורניים. ממתינים לאישור תיקון מובייל.',
      nextAction: 'לשלוח תיקון מובייל',
      nextActionDate: daysAgo(-2),
      pipelineStage: 'in_progress',
    },
    {
      id: 'cl_michaelfish',
      name: 'מיכאל דג ים',
      contact: 'מיכאל אזולאי',
      phone: '0543334455',
      email: 'michael@dagyam.co.il',
      status: 'active',
      value: 12000,
      date: daysAgo(34),
      source: 'לקוח חוזר',
      projectType: 'עיצוב UI/UX',
      notes: 'מערכת CRM לניהול הזמנות וספקים. בעבודה.',
      nextAction: 'לסיים מסך הזמנות',
      nextActionDate: daysAgo(-1),
      pipelineStage: 'in_progress',
    },
    {
      id: 'cl_aurora',
      name: 'אורורה סטודיו',
      contact: 'מאיה לוי',
      phone: '0541234567',
      email: 'maya@aurora.co.il',
      status: 'active',
      value: 48000,
      date: daysAgo(64),
      source: 'המלצה',
      projectType: 'מיתוג מלא',
      notes: 'פרויקט מיתוג מחדש כולל לוגו, שפה חזותית ואתר תדמית.',
    },
    {
      id: 'cl_greenfork',
      name: 'גרין פורק',
      contact: 'יואב כהן',
      phone: '0529876543',
      email: 'yoav@greenfork.com',
      status: 'active',
      value: 32000,
      date: daysAgo(41),
      source: 'אינסטגרם',
      projectType: 'עיצוב אריזה',
      notes: 'רשת מסעדות טבעוניות — אריזות טייקאוויי וקו מוצרים חדש.',
    },
    {
      id: 'cl_nimbus',
      name: 'נימבוס טק',
      contact: 'דנה פרידמן',
      phone: '0507654321',
      email: 'dana@nimbus.io',
      status: 'lead',
      value: 60000,
      date: daysAgo(9),
      source: 'לינקדאין',
      projectType: 'עיצוב UI/UX',
      notes: 'סטארטאפ SaaS — מחפשים עיצוב מערכת ניהול מלאה. פגישה נקבעה.',
    },
    {
      id: 'cl_olive',
      name: 'אוליב & קו',
      contact: 'רון אבני',
      phone: '0543219876',
      email: 'ron@oliveco.co.il',
      status: 'completed',
      value: 27500,
      date: daysAgo(128),
      source: 'תערוכה',
      projectType: 'זהות חזותית',
      notes: 'מותג שמן זית פרימיום. הפרויקט הסתיים, לקוח מרוצה מאוד.',
    },
    {
      id: 'cl_lumen',
      name: 'לומן עיצוב פנים',
      contact: 'שירה גולן',
      phone: '0526543210',
      email: 'shira@lumen.design',
      status: 'completed',
      value: 19000,
      date: daysAgo(165),
      source: 'גוגל',
      projectType: 'עיצוב אתר',
      notes: 'אתר תיק עבודות לאדריכלית פנים. נמסר בזמן.',
    },
    {
      id: 'cl_velvet',
      name: 'וולווט קוסמטיקס',
      contact: 'נטע ברק',
      phone: '0548887766',
      email: 'neta@velvet.co.il',
      status: 'lead',
      value: 45000,
      date: daysAgo(3),
      source: 'לקוח חוזר',
      projectType: 'קמפיין דיגיטל',
      notes: 'השקת קו מוצרים — מעוניינים בקמפיין רשתות חברתיות מלא.',
    },
    {
      id: 'cl_basalt',
      name: 'בזלת אדריכלים',
      contact: 'איתי שמש',
      phone: '0501112233',
      email: 'itay@basalt.archi',
      status: 'lost',
      value: 38000,
      date: daysAgo(96),
      source: 'גוגל',
      projectType: 'עיצוב אתר',
      notes: 'בחרו בספק אחר בגלל תקציב. לשמור על קשר לעתיד.',
    },
  ];
}

function makeQuotes() {
  return [
    {
      id: 'qt_1042',
      number: 'AV-1042',
      clientId: 'cl_aurora',
      date: daysAgo(58),
      validDays: 30,
      vatRate: 18,
      status: 'accepted',
      notes: 'כולל שלוש סבבי תיקונים. תשלום 50% מקדמה.',
      items: [
        { id: uid('li'), desc: 'עיצוב לוגו וזהות מותג', qty: 1, price: 14000 },
        { id: uid('li'), desc: 'מדריך שפה חזותית (Brand Book)', qty: 1, price: 9000 },
        { id: uid('li'), desc: 'עיצוב אתר תדמית (5 עמודים)', qty: 1, price: 18000 },
      ],
    },
    {
      id: 'qt_1051',
      number: 'AV-1051',
      clientId: 'cl_nimbus',
      date: daysAgo(7),
      validDays: 21,
      vatRate: 18,
      status: 'sent',
      notes: 'הצעה ראשונית למערכת ניהול. ממתינים לאישור.',
      items: [
        { id: uid('li'), desc: 'מחקר UX ואפיון', qty: 1, price: 12000 },
        { id: uid('li'), desc: 'עיצוב מסכי מערכת (UI)', qty: 24, price: 1500 },
        { id: uid('li'), desc: 'Design System ורכיבים', qty: 1, price: 12000 },
      ],
    },
    {
      id: 'qt_1048',
      number: 'AV-1048',
      clientId: 'cl_greenfork',
      date: daysAgo(36),
      validDays: 30,
      vatRate: 18,
      status: 'viewed',
      notes: 'קו אריזות מלא לשבעה מוצרים.',
      items: [
        { id: uid('li'), desc: 'קונספט ואסטרטגיית אריזה', qty: 1, price: 8000 },
        { id: uid('li'), desc: 'עיצוב אריזה למוצר', qty: 7, price: 3200 },
      ],
    },
  ];
}

// Build ~12 months of income/expense transactions with a gentle upward trend.
function makeTransactions() {
  const tx = [];
  const incomeBase = [
    28000, 31000, 26000, 34000, 38000, 33000, 41000, 45000, 39000, 48000, 52000,
    47000,
  ];
  const expenseBase = [
    18000, 19500, 17000, 21000, 22000, 20000, 24000, 23500, 22000, 26000, 27500,
    25000,
  ];

  for (let m = 11; m >= 0; m--) {
    const idx = 11 - m;
    // income — split into 1-2 entries
    tx.push({
      id: uid('tx'),
      type: 'income',
      amount: Math.round(incomeBase[idx] * 0.6),
      category: 'פרויקט',
      date: monthsAgo(m),
      description: 'תשלום פרויקט',
      clientId: null,
    });
    tx.push({
      id: uid('tx'),
      type: 'income',
      amount: Math.round(incomeBase[idx] * 0.4),
      category: idx % 2 ? 'ריטיינר' : 'ייעוץ',
      date: monthsAgo(m),
      description: idx % 2 ? 'ריטיינר חודשי' : 'שעות ייעוץ',
      clientId: null,
    });
    // expenses — split into 2 entries
    tx.push({
      id: uid('tx'),
      type: 'expense',
      amount: Math.round(expenseBase[idx] * 0.65),
      category: 'שכר',
      date: monthsAgo(m),
      description: 'שכר צוות',
      clientId: null,
    });
    tx.push({
      id: uid('tx'),
      type: 'expense',
      amount: Math.round(expenseBase[idx] * 0.35),
      category: ['פרילנסרים', 'תוכנה', 'שיווק', 'משרד'][idx % 4],
      date: monthsAgo(m),
      description: 'הוצאות תפעול',
      clientId: null,
    });
  }
  return tx;
}

function makeOutreachLeads() {
  return OUTREACH_SEED.map((s) => ({
    id: s.id || uid('lead'),
    name: s.name,
    category: s.category,
    status: 'pending',
    clientId: null,
    need: s.need || '',
  }));
}

// ---- studio: ensure clients carry next-action + pipeline fields ----
const STAGE_FROM_STATUS = {
  lead: 'lead', active: 'in_progress', await_material: 'won', await_approval: 'won',
  await_payment: 'won', completed: 'delivered', maintenance: 'retainer', lost: 'lost',
};
function normalizeClients(clients) {
  return clients.map((c) => ({
    nextAction: '', nextActionDate: null,
    pipelineStage: STAGE_FROM_STATUS[c.status] || 'lead',
    ...c,
  }));
}

function makeProjects() {
  return [
    { id: 'pr_tzipori', name: 'אתר תדמית לציפי', clientId: 'cl_tzipori', clientName: 'האקדמיה של ציפורי', serviceType: 'website', value: 6500, status: 'await_approval', deadline: daysAgo(-8), nextAction: 'לשלוח תיקון מובייל', progress: 75, description: 'אתר תדמית לאקדמיה לציפורניים, כולל גלריה וטופס הרשמה לקורסים.', missing: 'תמונות נוספות מהסטודיו', deliverables: 'אתר מלא + התאמה למובייל', internal: false },
    { id: 'pr_michael', name: 'מערכת CRM למיכאל דג ים', clientId: 'cl_michaelfish', clientName: 'מיכאל דג ים', serviceType: 'crm', value: 12000, status: 'active', deadline: daysAgo(-16), nextAction: 'לסיים מסך הזמנות', progress: 55, description: 'מערכת ניהול הזמנות, ספקים ולקוחות לעסק דגים.', missing: 'רשימת ספקים מעודכנת', deliverables: 'מערכת CRM מלאה + הדרכה', internal: false },
    { id: 'pr_artads', name: 'מודעות ArtValue', clientId: null, clientName: 'ArtValue', serviceType: 'marketing', value: 0, status: 'active', deadline: null, nextAction: 'ליצור וריאציה חדשה', progress: 40, description: 'קמפיין מודעות פנימי לקידום הסטודיו.', missing: '', deliverables: 'סט מודעות לרשתות', internal: true },
    { id: 'pr_aurora', name: 'מיתוג אורורה סטודיו', clientId: 'cl_aurora', clientName: 'אורורה סטודיו', serviceType: 'branding', value: 48000, status: 'active', deadline: daysAgo(-25), nextAction: 'הצגת לוגו ללקוח', progress: 60, description: 'מיתוג מחדש מלא: לוגו, שפה חזותית ואתר.', missing: '', deliverables: 'Brand Book + אתר', internal: false },
    { id: 'pr_velvet', name: 'דף נחיתה וולווט קוסמטיקס', clientId: 'cl_velvet', clientName: 'וולווט קוסמטיקס', serviceType: 'landing', value: 9000, status: 'await_material', deadline: daysAgo(-12), nextAction: 'לבקש תמונות מוצר', progress: 20, description: 'דף נחיתה להשקת קו מוצרים חדש.', missing: 'תמונות מוצר וטקסטים', deliverables: 'דף נחיתה + חיבור לטופס', internal: false },
  ];
}

function T(projectId, clientId, title, status, priority, deadDays, notes) {
  return { id: uid('tk'), projectId, clientId, title, status, priority, deadline: deadDays == null ? null : daysAgo(-deadDays), assignee: 'נתן', linkRef: '', notes: notes || '' };
}
function makeTasks() {
  return [
    T('pr_tzipori', 'cl_tzipori', 'לשלוח סקיצת אתר לציפי', 'review', 'high', 2, 'גרסה ראשונה מוכנה'),
    T('pr_tzipori', 'cl_tzipori', 'תיקון תצוגת מובייל', 'in_progress', 'urgent', 1, ''),
    T('pr_tzipori', 'cl_tzipori', 'בדיקת עברית בכל העמודים', 'todo', 'normal', 4, ''),
    T('pr_michael', 'cl_michaelfish', 'לסיים מסך הזמנות', 'in_progress', 'high', 1, ''),
    T('pr_michael', 'cl_michaelfish', 'לבקש לוגו ממיכאל דג ים', 'await_client', 'normal', 3, ''),
    T('pr_michael', 'cl_michaelfish', 'בניית טבלת ספקים', 'todo', 'normal', 6, ''),
    T('pr_michael', 'cl_michaelfish', 'בדיקות מערכת', 'new', 'low', 9, ''),
    T('pr_artads', null, 'לתקן עברית במודעה של ArtValue', 'in_progress', 'high', 0, ''),
    T('pr_artads', null, 'ליצור וריאציה חדשה למודעה', 'todo', 'normal', 2, ''),
    T('pr_aurora', 'cl_aurora', 'הכנת מצגת לוגו', 'in_progress', 'normal', 3, ''),
    T('pr_velvet', 'cl_velvet', 'להעלות גרסה חדשה לאתר', 'todo', 'normal', 5, ''),
    T('pr_velvet', 'cl_velvet', 'להכין הצעת מחיר ללקוח חדש', 'new', 'normal', 7, ''),
  ];
}

function L(projectId, clientId, name, category, url, share, note) {
  return { id: uid('ln'), projectId, clientId, name, category, url, shareWithClient: share, updatedAt: daysAgo(Math.floor(Math.random ? 3 : 3)), note: note || '' };
}
function makeLinks() {
  return [
    { id: 'ln_1', projectId: 'pr_tzipori', clientId: 'cl_tzipori', name: 'סקיצת אתר (Figma)', category: 'design', url: 'https://figma.com/file/demo', shareWithClient: false, updatedAt: daysAgo(2), note: 'גרסה 2' },
    { id: 'ln_2', projectId: 'pr_tzipori', clientId: 'cl_tzipori', name: 'תיקיית Drive', category: 'media', url: 'https://drive.google.com/demo', shareWithClient: true, updatedAt: daysAgo(5), note: 'תמונות וחומרים' },
    { id: 'ln_3', projectId: 'pr_michael', clientId: 'cl_michaelfish', name: 'GitHub Repo', category: 'code', url: 'https://github.com/artvalue/dagyam', shareWithClient: false, updatedAt: daysAgo(1), note: '' },
    { id: 'ln_4', projectId: 'pr_michael', clientId: 'cl_michaelfish', name: 'Supabase', category: 'code', url: 'https://supabase.com/dashboard', shareWithClient: false, updatedAt: daysAgo(1), note: 'בסיס נתונים' },
    { id: 'ln_5', projectId: 'pr_aurora', clientId: 'cl_aurora', name: 'קובץ Canva', category: 'design', url: 'https://canva.com/demo', shareWithClient: true, updatedAt: daysAgo(4), note: '' },
    { id: 'ln_6', projectId: 'pr_velvet', clientId: 'cl_velvet', name: 'הצעת מחיר PDF', category: 'payment', url: 'https://drive.google.com/quote.pdf', shareWithClient: true, updatedAt: daysAgo(6), note: '' },
  ];
}
function makeFiles() {
  return [
    { id: 'fl_1', projectId: 'pr_tzipori', clientId: 'cl_tzipori', name: 'logo-tzipori.svg', fileType: 'logo', status: 'received', url: '', uploadedAt: daysAgo(18), note: 'לוגו מקורי' },
    { id: 'fl_2', projectId: 'pr_tzipori', clientId: 'cl_tzipori', name: 'home-mockup.png', fileType: 'image', status: 'sent', url: '', uploadedAt: daysAgo(3), note: 'סקיצת בית' },
    { id: 'fl_3', projectId: 'pr_michael', clientId: 'cl_michaelfish', name: 'spec.pdf', fileType: 'pdf', status: 'in_progress', url: '', uploadedAt: daysAgo(20), note: 'אפיון' },
    { id: 'fl_4', projectId: 'pr_aurora', clientId: 'cl_aurora', name: 'brandbook.pdf', fileType: 'pdf', status: 'in_progress', url: '', uploadedAt: daysAgo(7), note: '' },
    { id: 'fl_5', projectId: 'pr_velvet', clientId: 'cl_velvet', name: 'assets.zip', fileType: 'zip', status: 'received', url: '', uploadedAt: daysAgo(10), note: 'חומרי גלם' },
  ];
}
function makeComms() {
  return [
    { id: 'cm_1', projectId: 'pr_tzipori', date: daysAgo(2), type: 'whatsapp', summary: 'ציפי אישרה את גרסת הבית, ביקשה תיקון מובייל.', decisions: 'להקטין כפתורים במובייל', nextAction: 'לשלוח תיקון מובייל' },
    { id: 'cm_2', projectId: 'pr_tzipori', date: daysAgo(9), type: 'meeting', summary: 'פגישת אפיון ראשונה, הגדרת עמודים.', decisions: '5 עמודים + גלריה', nextAction: 'להתחיל סקיצה' },
    { id: 'cm_3', projectId: 'pr_michael', date: daysAgo(1), type: 'call', summary: 'מיכאל ביקש מסך הזמנות מהיר יותר.', decisions: 'להוסיף סינון לפי תאריך', nextAction: 'לסיים מסך הזמנות' },
  ];
}

// Production seed: real business data starts empty. The only pre-filled content
// is the Lead-Research ideas (a working tool, not demo customer data).
export function buildSeed() {
  return {
    clients: [],
    quotes: [],
    transactions: [],
    outreachLeads: makeOutreachLeads(),
    projects: [],
    tasks: [],
    plinks: [],
    pfiles: [],
    comms: [],
    meta: { seededAt: new Date().toISOString(), version: 1, outreachSeedV: OUTREACH_SEED_VERSION, studioV: 1, prodV: 1 },
  };
}

// Demo dataset (kept for reference / "load sample data" if ever needed).
export function buildDemoSeed() {
  return {
    clients: normalizeClients(makeClients()),
    quotes: makeQuotes(),
    transactions: makeTransactions(),
    outreachLeads: makeOutreachLeads(),
    projects: makeProjects(),
    tasks: makeTasks(),
    plinks: makeLinks(),
    pfiles: makeFiles(),
    comms: makeComms(),
    meta: { seededAt: new Date().toISOString(), version: 1, outreachSeedV: OUTREACH_SEED_VERSION, studioV: 1, prodV: 1 },
  };
}

export { uid };

// ===================================================================
// Studio domain: projects, tasks, links, files, communication, pipeline,
// templates. Labels + helpers in Hebrew. Pure config — no side effects.
// ===================================================================

// ---- Service types ----
export const SERVICE_TYPES = [
  { id: 'website', label: 'אתר' },
  { id: 'crm', label: 'מערכת CRM' },
  { id: 'marketing', label: 'מודעה / שיווק' },
  { id: 'branding', label: 'מיתוג' },
  { id: 'landing', label: 'דף נחיתה' },
  { id: 'maintenance', label: 'תחזוקה' },
  { id: 'other', label: 'אחר' },
];
export const serviceLabel = (id) => SERVICE_TYPES.find((s) => s.id === id)?.label || 'אחר';

// ---- Project status ----
export const PROJECT_STATUS = [
  { id: 'active', label: 'פעיל' },
  { id: 'await_material', label: 'ממתין לחומר' },
  { id: 'await_approval', label: 'ממתין לאישור' },
  { id: 'await_payment', label: 'ממתין לתשלום' },
  { id: 'completed', label: 'הושלם' },
  { id: 'frozen', label: 'מוקפא' },
];

// ---- Task status & priority ----
export const TASK_STATUS = [
  { id: 'new', label: 'חדש' },
  { id: 'todo', label: 'לביצוע' },
  { id: 'in_progress', label: 'בעבודה' },
  { id: 'await_client', label: 'ממתין ללקוח' },
  { id: 'await_material', label: 'ממתין לחומר' },
  { id: 'review', label: 'לבדיקה' },
  { id: 'done', label: 'הושלם' },
];
export const TASK_PRIORITY = [
  { id: 'low', label: 'נמוכה' },
  { id: 'normal', label: 'רגילה' },
  { id: 'high', label: 'גבוהה' },
  { id: 'urgent', label: 'דחופה' },
];

// ---- Links & files ----
export const LINK_CATEGORIES = [
  { id: 'website', label: 'אתר' },
  { id: 'design', label: 'עיצוב' },
  { id: 'code', label: 'קוד' },
  { id: 'media', label: 'מדיה' },
  { id: 'comm', label: 'תקשורת' },
  { id: 'payment', label: 'תשלום' },
  { id: 'other', label: 'אחר' },
];
export const FILE_TYPES = [
  { id: 'logo', label: 'לוגו' },
  { id: 'image', label: 'תמונה' },
  { id: 'pdf', label: 'PDF' },
  { id: 'zip', label: 'ZIP' },
  { id: 'video', label: 'וידאו' },
  { id: 'prompt', label: 'פרומט' },
  { id: 'text', label: 'טקסט' },
  { id: 'other', label: 'אחר' },
];
export const FILE_STATUS = [
  { id: 'received', label: 'התקבל מהלקוח' },
  { id: 'in_progress', label: 'בעבודה' },
  { id: 'sent', label: 'נשלח ללקוח' },
  { id: 'approved', label: 'אושר' },
  { id: 'archive', label: 'ארכיון' },
];

// ---- Communication ----
export const COMM_TYPES = [
  { id: 'whatsapp', label: 'וואטסאפ' },
  { id: 'call', label: 'שיחה' },
  { id: 'email', label: 'מייל' },
  { id: 'meeting', label: 'פגישה' },
];

// ---- Pipeline (kanban) ----
export const PIPELINE_STAGES = [
  { id: 'lead', label: 'ליד חדש' },
  { id: 'first_call', label: 'שיחה ראשונית' },
  { id: 'quote_sent', label: 'נשלחה הצעת מחיר' },
  { id: 'await_approval', label: 'ממתין לאישור' },
  { id: 'won', label: 'נסגר — התחלת עבודה' },
  { id: 'in_progress', label: 'בעבודה' },
  { id: 'delivered', label: 'נמסר' },
  { id: 'retainer', label: 'המשך שירות' },
  { id: 'lost', label: 'אבוד' },
];

// ---- Client status (extended) ----
export const CLIENT_STATUS_EXT = [
  { id: 'lead', label: 'ליד' },
  { id: 'active', label: 'פעיל' },
  { id: 'await_material', label: 'ממתין לחומר' },
  { id: 'await_approval', label: 'ממתין לאישור' },
  { id: 'await_payment', label: 'ממתין לתשלום' },
  { id: 'completed', label: 'הושלם' },
  { id: 'completed_paid', label: 'הושלם ועבר תשלום' },
  { id: 'maintenance', label: 'תחזוקה' },
  { id: 'lost', label: 'אבוד' },
];

// Statuses that represent a closed, paid deal (auto-create an income transaction).
export const PAID_STATUSES = ['completed_paid'];

// Generic label lookup
export function labelOf(list, id) {
  return list.find((x) => x.id === id)?.label || id;
}

// Map any studio status/priority to an existing badge class (theme colors).
export function studioBadgeClass(id) {
  switch (id) {
    case 'active':
    case 'in_progress':
    case 'won':
      return 'badge-active'; // yellow
    case 'completed':
    case 'done':
    case 'delivered':
    case 'approved':
      return 'badge-completed'; // blue
    case 'lost':
    case 'urgent':
      return 'badge-lost'; // red
    case 'await_payment':
    case 'high':
    case 'retainer':
      return 'badge-payment'; // gold/orange
    case 'await_approval':
    case 'review':
    case 'quote_sent':
    case 'first_call':
      return 'badge-lead'; // slate
    default:
      return 'badge-neutral'; // gray (waiting / new / todo / frozen)
  }
}

// ---- Project templates → auto-generated tasks ----
export const TEMPLATES = [
  {
    id: 'tpl_website',
    name: 'אתר תדמית',
    serviceType: 'website',
    desc: 'תהליך מלא לבניית אתר תדמית, מקבלת חומרים ועד מסירה.',
    tasks: [
      'קבלת לוגו', 'קבלת תמונות', 'קבלת טקסטים', 'בניית Hero',
      'בניית אזור שירותים', 'בניית אזור אודות', 'בניית אזור גלריה',
      'בניית טופס יצירת קשר', 'התאמה למובייל', 'בדיקת עברית',
      'שליחת סקיצה', 'ביצוע תיקונים', 'העלאה לאוויר', 'מסירה ללקוח',
    ],
  },
  {
    id: 'tpl_crm',
    name: 'מערכת CRM',
    serviceType: 'crm',
    desc: 'הקמת מערכת ניהול מלאה ללקוח.',
    tasks: [
      'אפיון תהליך עבודה', 'בניית טבלת לקוחות', 'בניית טבלת לידים',
      'בניית הצעות מחיר', 'בניית פיננסים', 'בניית משימות',
      'בניית קישורים וקבצים', 'בדיקות מערכת', 'תיקונים',
      'הדרכת לקוח', 'מסירה',
    ],
  },
  {
    id: 'tpl_ad',
    name: 'מודעה / קמפיין',
    serviceType: 'marketing',
    desc: 'תהליך יצירת מודעה/קמפיין שיווקי.',
    tasks: [
      'קבלת לוגו', 'קבלת צבעי מותג', 'כתיבת קופי', 'יצירת פרומט',
      'יצירת וריאציה ראשונה', 'תיקוני עברית', 'יצירת וריאציה שנייה',
      'שליחה ללקוח', 'אישור סופי',
    ],
  },
  {
    id: 'tpl_branding',
    name: 'מיתוג בסיסי',
    serviceType: 'branding',
    desc: 'חבילת מיתוג בסיסית.',
    tasks: [
      'תדריך מותג', 'מחקר והשראה', 'עיצוב לוגו', 'בחירת צבעים',
      'בחירת טיפוגרפיה', 'מדריך שפה חזותית', 'הצגה ללקוח', 'מסירת קבצים',
    ],
  },
  {
    id: 'tpl_maintenance',
    name: 'תחזוקה חודשית',
    serviceType: 'maintenance',
    desc: 'ריטיינר תחזוקה חודשי.',
    tasks: [
      'גיבוי חודשי', 'עדכוני תוכן', 'בדיקת תקינות', 'עדכוני אבטחה', 'דוח חודשי ללקוח',
    ],
  },
];
export const templateById = (id) => TEMPLATES.find((t) => t.id === id);

// Growth OS — navigation + module config (ArtValue business-growth center).
// Slice 1: scaffold only. Single source of truth for the sidebar group and the
// hub card grid so labels/copy stay in sync. No business logic here.

// Sidebar group items (each is a NavLink with active state).
// Icons are existing names from components/ui/Icon.jsx only.
export const GROWTH_NAV = [
  { to: '/growth', label: 'מרכז הצמיחה', icon: 'trendUp', end: true },
  { to: '/growth/leads', label: 'מיפוי לידים', icon: 'target' },
  { to: '/growth/calendar', label: 'לוח פעולה', icon: 'calendar' },
  { to: '/growth/content', label: 'ספריית פרסום', icon: 'image' },
  { to: '/calls', label: 'שיחות', icon: 'phone' },
];

// Hub modules — cards on the /growth page. All four modules are shipped and
// live; `desc` states what each one actually does today (no "coming soon").
export const GROWTH_MODULES = [
  {
    to: '/growth/leads',
    title: 'מיפוי לידים',
    desc: 'קטגוריות לידים, הצעה מתאימה לכל קטגוריה ותוכנית פעולה מפורטת.',
    icon: 'target',
  },
  {
    to: '/growth/calendar',
    title: 'לוח פעולה חודשי',
    desc: 'תרגום יעד הכנסה לפעולות יומיות, פירוק שבועי וקטגוריות מיקוד.',
    icon: 'calendar',
  },
  {
    to: '/growth/content',
    title: 'ספריית פרסום ותוכן',
    desc: 'מאגר תבניות, פרומטים ורעיונות פרסום — מותאמים לפי הצעה.',
    icon: 'image',
  },
  {
    to: '/calls',
    title: 'שיחות ופולואפים',
    desc: 'הכנה לשיחה לפי סוג לקוח: תסריט פתיחה, התנגדויות ותבניות המשך.',
    icon: 'phone',
  },
];

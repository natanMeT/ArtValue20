// Growth OS — navigation + module config (ArtValue business-growth center).
// Slice 1: scaffold only. Single source of truth for the sidebar group and the
// hub card grid so labels/copy stay in sync. No business logic here.

// Sidebar group items (each is a NavLink with active state).
// Icons are existing names from components/ui/Icon.jsx only.
// S0D containment: every Growth item is `betaHidden` — in authenticated cloud
// beta the whole Growth OS is temporarily unavailable (its datasets + Ask-Jake
// seeds are ArtValue-specific and not yet account-aware; see the "Account-aware
// Growth & Creative Context" follow-up). visibleNavSections() filters these in
// cloud beta; Outreach (not part of GROWTH_NAV) stays visible + LIVE. Local/demo
// shows everything unchanged.
export const GROWTH_NAV = [
  { to: '/growth', label: 'מרכז הצמיחה', icon: 'trendUp', end: true, betaHidden: true },
  { to: '/growth/leads', label: 'מיפוי לידים', icon: 'target', betaHidden: true },
  { to: '/growth/calendar', label: 'לוח פעולה', icon: 'calendar', betaHidden: true },
  { to: '/calls', label: 'שיחות', icon: 'phone', betaHidden: true },
  { to: '/growth/content', label: 'ספריית פרסום', icon: 'image', betaHidden: true },
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

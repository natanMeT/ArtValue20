// Growth OS — navigation + module config (ArtValue business-growth center).
// Slice 1: scaffold only. Single source of truth for the sidebar group and the
// hub card grid so labels/copy stay in sync. No business logic here.

// Sidebar group items (each is a NavLink with active state).
// Icons are existing names from components/ui/Icon.jsx only.
export const GROWTH_NAV = [
  { to: '/growth', label: 'מרכז הצמיחה', icon: 'trendUp', end: true },
  { to: '/growth/leads', label: 'מיפוי לידים', icon: 'target' },
  { to: '/growth/calendar', label: 'לוח פעולה', icon: 'calendar' },
  { to: '/calls', label: 'שיחות', icon: 'phone' },
];

// Hub modules — cards on the /growth page. Copy mirrors each placeholder page.
export const GROWTH_MODULES = [
  {
    to: '/growth/leads',
    title: 'מיפוי לידים',
    soon: 'בקרוב — מיפוי לידים ואסטרטגיית הצעות',
    icon: 'target',
  },
  {
    to: '/growth/calendar',
    title: 'לוח פעולה חודשי',
    soon: 'בקרוב — תכנון פעולות חודשי לפי יעד הכנסה',
    icon: 'calendar',
  },
  {
    to: '/calls',
    title: 'שיחות',
    soon: 'בקרוב — אימון שיחות ומכירות עם JaceOS',
    icon: 'phone',
  },
];

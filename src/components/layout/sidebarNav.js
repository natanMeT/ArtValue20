import { GROWTH_NAV } from '../../pages/growth/growthNav.js';

// Sidebar IA — grouped navigation sections. Presentational regrouping only:
// every route, label and icon is unchanged from the previous flat NAV list;
// items are just ordered into scannable sections. (R4.1: the retired local-
// engine studios /workflow + /fooocus were removed from the sections; their
// legacy routes redirect to /studio in App.jsx.) Growth OS items stay
// sourced from GROWTH_NAV (single source of truth) and are composed into
// the צמיחה ולידים section together with the Outreach page, so the daily
// lead funnel (מחקר → מיפוי → לוח → שיחות) reads in workflow order.
// /settings is NOT here — it stays in the sidebar footer.
export const NAV_SECTIONS = [
  {
    label: 'ניהול העסק',
    items: [
      { to: '/', label: 'דאשבורד', icon: 'dashboard', end: true },
      { to: '/clients', label: 'לקוחות', icon: 'users' },
      { to: '/projects', label: 'פרויקטים', icon: 'briefcase' },
      { to: '/tasks', label: 'משימות', icon: 'check' },
      { to: '/pipeline', label: 'פייפליין', icon: 'filter' },
      { to: '/quotes', label: 'הצעות מחיר', icon: 'doc' },
      { to: '/finance', label: 'פיננסים', icon: 'wallet' },
      { to: '/inventory', label: 'מלאי', icon: 'dashboard' },
      { to: '/activity', label: 'יומן פעילות', icon: 'clock' },
    ],
  },
  {
    label: 'צמיחה ולידים',
    items: [
      { to: '/outreach', label: 'מחקר לידים', icon: 'send' },
      ...GROWTH_NAV,
    ],
  },
  {
    label: 'סטודיו וכלים',
    items: [
      { to: '/diagnose', label: 'אבחון AI', icon: 'spark' },
      { to: '/adstudio', label: 'סטודיו פרסום', icon: 'spark' },
      { to: '/studio', label: 'מחולל תמונות', icon: 'image' },
      { to: '/templates', label: 'תבניות', icon: 'copy' },
      { to: '/assets', label: 'קבצים וקישורים', icon: 'link' },
    ],
  },
];

// Flat list of every sectioned nav item (test + tooling convenience).
export const SIDEBAR_ROUTE_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

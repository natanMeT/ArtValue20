import { GROWTH_NAV } from '../../pages/growth/growthNav.js';

// Sidebar IA — grouped navigation sections. Presentational regrouping only:
// every route, label and icon is unchanged from the previous flat NAV list;
// items are just ordered into scannable sections. (Local-engine retirement,
// 2026-07-27: every workstation-engine studio — /workflow, /fooocus and
// /adstudio — is gone from the product; their routes no longer exist and any
// unknown path falls back to the dashboard in App.jsx.) Growth OS items stay
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
      { to: '/projects', label: 'פרויקטים', icon: 'briefcase', betaHidden: true },
      { to: '/tasks', label: 'משימות', icon: 'check' },
      { to: '/pipeline', label: 'פייפליין', icon: 'filter' },
      { to: '/quotes', label: 'הצעות מחיר', icon: 'doc' },
      { to: '/finance', label: 'פיננסים', icon: 'wallet' },
      { to: '/inventory', label: 'מלאי', icon: 'dashboard', betaHidden: true },
      { to: '/activity', label: 'יומן פעילות', icon: 'clock', betaHidden: true },
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
      { to: '/studio', label: 'מחולל תמונות', icon: 'image' },
      { to: '/templates', label: 'תבניות', icon: 'copy', betaHidden: true },
      { to: '/assets', label: 'קבצים וקישורים', icon: 'link' },
    ],
  },
];

// Flat list of every sectioned nav item (test + tooling convenience).
export const SIDEBAR_ROUTE_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

// Beta false-success containment (S0A): items flagged `betaHidden` point at
// Memory-Only modules (Projects, Inventory, Templates) that can't durably persist
// in authenticated cloud mode. Hide them from the nav there so they aren't
// presented as usable capabilities. In local/demo mode everything is shown.
// The routes stay registered (App.jsx) and render a restrained unavailable state.
export function visibleNavSections(isCloudBeta) {
  if (!isCloudBeta) return NAV_SECTIONS;
  return NAV_SECTIONS
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.betaHidden) }))
    .filter((s) => s.items.length > 0);
}

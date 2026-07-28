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
      // Campaigns slice 1 — durable cloud module, so it is the INVERSE of
      // `betaHidden`: shown in cloud mode, hidden in the local demo where it has
      // no durable storage. The route stays registered either way and renders a
      // truthful unavailable state locally.
      { to: '/campaigns', label: 'קמפיינים', icon: 'target', cloudOnly: true },
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

// Two opposite containment flags, both about NOT presenting a capability the
// current mode cannot deliver:
//
//   betaHidden (S0A) — Memory-Only modules (Projects, Inventory, Templates,
//     Activity) that cannot durably persist in authenticated cloud mode.
//     Hidden in CLOUD, shown locally.
//   cloudOnly (Campaigns slice 1) — durable cloud modules with no local
//     storage at all. Hidden in the LOCAL demo, shown in cloud.
//
// In both cases the route stays registered (App.jsx) and the page renders its
// own truthful unavailable state, so a direct link or old shortcut never
// reaches a form that would persist nothing.
export function visibleNavSections(isCloudBeta) {
  const drop = isCloudBeta ? (i) => i.betaHidden : (i) => i.cloudOnly;
  return NAV_SECTIONS
    .map((s) => ({ ...s, items: s.items.filter((i) => !drop(i)) }))
    .filter((s) => s.items.length > 0);
}

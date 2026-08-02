import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { NAV_SECTIONS, SIDEBAR_ROUTE_ITEMS, visibleNavSections } from '../sidebarNav.js';
import { GROWTH_NAV } from '../../../pages/growth/growthNav.js';

// ===================================================================
// Sidebar IA — grouped nav integrity. (Slice: sidebar IA regrouping)
// Assert against the REAL route table (src/App.jsx source), same
// pattern as growthNav.test.js: renaming/removing a route there breaks
// this test instead of shipping a dead sidebar link.
// ===================================================================

const appSrc = readFileSync(new URL('../../../App.jsx', import.meta.url), 'utf8');
const isRegisteredRoute = (to) => appSrc.includes(`path="${to}"`);

// The full pre-regrouping sidebar surface: every one of these routes must
// still appear EXACTLY ONCE across the sections (nothing dropped, nothing
// duplicated by the regrouping). /settings is footer-only by design.
// Campaigns slice 1 added '/campaigns' — a durable CLOUD-ONLY module, so it is
// the first item carrying `cloudOnly` (hidden in the local demo) rather than
// `betaHidden` (hidden in cloud).
// Schedule Core slice 1 added '/schedule' (יומן) — the second `cloudOnly` item,
// for the same reason. It is NOT '/growth/calendar', which is a Growth planning
// board that persists nothing and stays in EXPECTED_GROWTH_ROUTES below.
// Monthly Plan added '/plan' — a READ-ONLY planner. It is the first nav item
// carrying NEITHER flag: it persists nothing (so nothing to contain in cloud)
// and needs no cloud storage (so nothing to hide locally). It sits in
// צמיחה ולידים but is NOT a Growth OS route — it is outside GrowthBetaGate and
// links nowhere into Growth, so it belongs here, not in EXPECTED_GROWTH_ROUTES.
const EXPECTED_MAIN_ROUTES = [
  '/', '/clients', '/outreach', '/projects', '/tasks', '/schedule', '/plan', '/pipeline',
  '/quotes', '/diagnose', '/studio', '/campaigns',
  '/finance', '/activity', '/inventory', '/assets', '/templates',
];

// Local-engine retirement (2026-07-27): every workstation-engine studio is gone
// from the nav AND from the route table. There is no redirect left to inherit,
// so a retired URL must fail SAFE through the catch-all instead.
const RETIRED_ROUTES = ['/workflow', '/fooocus', '/adstudio'];
const EXPECTED_GROWTH_ROUTES = ['/growth', '/growth/leads', '/growth/calendar', '/growth/content', '/calls'];

const EXPECTED_SECTION_LABELS = ['ניהול העסק', 'צמיחה ולידים', 'סטודיו וכלים'];

describe('sidebarNav — sections shape', () => {
  it('has exactly the expected sections, in order', () => {
    expect(NAV_SECTIONS.map((s) => s.label)).toEqual(EXPECTED_SECTION_LABELS);
  });

  it('every section has a non-empty label and at least 2 items', () => {
    for (const s of NAV_SECTIONS) {
      expect(typeof s.label).toBe('string');
      expect(s.label.length).toBeGreaterThan(2);
      expect(s.items.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('every item has to, label and icon', () => {
    for (const item of SIDEBAR_ROUTE_ITEMS) {
      expect(typeof item.to).toBe('string');
      expect(item.to.startsWith('/')).toBe(true);
      expect(item.label.length).toBeGreaterThan(1);
      expect(typeof item.icon).toBe('string');
    }
  });
});

describe('sidebarNav — routes exist in App.jsx', () => {
  it('every sectioned nav item points at a registered route', () => {
    for (const item of SIDEBAR_ROUTE_ITEMS) {
      expect(isRegisteredRoute(item.to), `nav route not in App.jsx: ${item.to}`).toBe(true);
    }
  });
});

describe('sidebarNav — nothing dropped, nothing duplicated', () => {
  it('no duplicate route across all sections', () => {
    const tos = SIDEBAR_ROUTE_ITEMS.map((i) => i.to);
    expect(new Set(tos).size).toBe(tos.length);
  });

  it('every pre-regrouping main route appears exactly once', () => {
    const tos = SIDEBAR_ROUTE_ITEMS.map((i) => i.to);
    for (const route of EXPECTED_MAIN_ROUTES) {
      expect(tos.filter((t) => t === route).length, `route missing or duplicated: ${route}`).toBe(1);
    }
  });

  it('every Growth OS route appears exactly once, inside צמיחה ולידים', () => {
    const growthSection = NAV_SECTIONS.find((s) => s.label === 'צמיחה ולידים');
    const tos = growthSection.items.map((i) => i.to);
    for (const route of EXPECTED_GROWTH_ROUTES) {
      expect(tos.filter((t) => t === route).length, `growth route not in section: ${route}`).toBe(1);
    }
    // and nowhere else
    const elsewhere = NAV_SECTIONS.filter((s) => s !== growthSection)
      .flatMap((s) => s.items.map((i) => i.to))
      .filter((t) => EXPECTED_GROWTH_ROUTES.includes(t));
    expect(elsewhere).toEqual([]);
  });

  it('/settings stays out of the sections (footer-only)', () => {
    expect(SIDEBAR_ROUTE_ITEMS.some((i) => i.to === '/settings')).toBe(false);
  });

  it('total item count = main routes + growth routes (nothing extra crept in)', () => {
    expect(SIDEBAR_ROUTE_ITEMS.length).toBe(EXPECTED_MAIN_ROUTES.length + EXPECTED_GROWTH_ROUTES.length);
  });
});

describe('sidebarNav — retired studios (R4.1)', () => {
  it('retired routes are absent from every nav section', () => {
    for (const route of RETIRED_ROUTES) {
      expect(SIDEBAR_ROUTE_ITEMS.some((i) => i.to === route), `retired route still in nav: ${route}`).toBe(false);
    }
  });

  it('no retired studio route is registered at all', () => {
    for (const route of RETIRED_ROUTES) {
      expect(isRegisteredRoute(route), `retired route still registered: ${route}`).toBe(false);
    }
  });

  it('a catch-all makes every retired deep link fail safe instead of rendering nothing', () => {
    expect(appSrc.includes('path="*" element={<Navigate to="/" replace />}')).toBe(true);
  });

  it('retired page modules are no longer imported anywhere in App.jsx', () => {
    for (const gone of ['WorkflowStudio', 'AdStudio', "from './pages/Fooocus.jsx'"]) {
      expect(appSrc.includes(gone), gone).toBe(false);
    }
  });
});

describe('sidebarNav — beta false-success containment (S0A)', () => {
  const BETA_HIDDEN = ['/projects', '/inventory', '/templates', '/activity'];

  it('the Memory-Only modules carry a betaHidden flag in the data', () => {
    for (const to of BETA_HIDDEN) {
      const item = SIDEBAR_ROUTE_ITEMS.find((i) => i.to === to);
      expect(item, `missing nav item: ${to}`).toBeTruthy();
      expect(item.betaHidden, `expected betaHidden on ${to}`).toBe(true);
    }
  });

  it('only the S0A Memory-Only modules and the S0D-contained Growth routes are flagged betaHidden', () => {
    const flagged = SIDEBAR_ROUTE_ITEMS.filter((i) => i.betaHidden).map((i) => i.to).sort();
    // S0D: the entire Growth OS is beta-contained (GROWTH_NAV items betaHidden).
    // /adstudio is NOT here any more — it was DELETED, not contained.
    const expected = [...BETA_HIDDEN, ...GROWTH_NAV.map((g) => g.to)].sort();
    expect(flagged).toEqual(expected);
  });

  // Was `toBe(NAV_SECTIONS)` — an identity check that encoded "local mode
  // filters nothing at all". Campaigns slice 1 made that literally false: a
  // cloudOnly item has no local storage, so local mode now drops it. The
  // intent this test protects — local mode never hides a betaHidden module —
  // is asserted directly instead of through object identity, which makes it
  // stronger, not weaker.
  it('local/demo mode hides only cloudOnly items — every betaHidden module stays visible', () => {
    const local = visibleNavSections(false).flatMap((s) => s.items.map((i) => i.to));
    const expected = SIDEBAR_ROUTE_ITEMS.filter((i) => !i.cloudOnly).map((i) => i.to);
    expect(local).toEqual(expected);
    for (const to of BETA_HIDDEN) expect(local, `${to} must stay visible locally`).toContain(to);
    expect(visibleNavSections(false).map((s) => s.label)).toEqual(EXPECTED_SECTION_LABELS);
  });

  it('cloud beta mode hides Projects, Inventory and Templates from the nav', () => {
    const tos = visibleNavSections(true).flatMap((s) => s.items.map((i) => i.to));
    for (const to of BETA_HIDDEN) expect(tos.includes(to), `${to} should be hidden in cloud beta`).toBe(false);
  });

  it('cloud beta mode keeps every durable module visible (clients, tasks, quotes, finance, outreach)', () => {
    const tos = visibleNavSections(true).flatMap((s) => s.items.map((i) => i.to));
    ['/', '/clients', '/tasks', '/pipeline', '/quotes', '/finance', '/outreach', '/diagnose', '/studio', '/assets']
      .forEach((to) => expect(tos.includes(to), `${to} should stay visible`).toBe(true));
  });

  it('no section becomes empty after hiding', () => {
    for (const s of visibleNavSections(true)) expect(s.items.length).toBeGreaterThan(0);
  });
});

describe('sidebarNav — Growth OS single source of truth', () => {
  it('growth items in the section ARE the GROWTH_NAV entries (same refs, same order)', () => {
    const growthSection = NAV_SECTIONS.find((s) => s.label === 'צמיחה ולידים');
    const sectionGrowthItems = growthSection.items.filter((i) => GROWTH_NAV.some((g) => g.to === i.to));
    expect(sectionGrowthItems.length).toBe(GROWTH_NAV.length);
    sectionGrowthItems.forEach((item, idx) => {
      expect(item, `growth item ${item.to} is duplicated data, not the GROWTH_NAV ref`).toBe(GROWTH_NAV[idx]);
    });
  });

  it('the growth section leads with מחקר לידים (workflow order)', () => {
    const growthSection = NAV_SECTIONS.find((s) => s.label === 'צמיחה ולידים');
    expect(growthSection.items[0].to).toBe('/outreach');
  });
});

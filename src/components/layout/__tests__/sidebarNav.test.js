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
const EXPECTED_MAIN_ROUTES = [
  '/', '/clients', '/outreach', '/projects', '/tasks', '/pipeline',
  '/quotes', '/diagnose', '/adstudio', '/studio',
  '/finance', '/activity', '/inventory', '/assets', '/templates',
];

// R4.1 — retired local-engine studios: gone from the nav, legacy URLs
// redirect to /studio, and the page modules are no longer imported.
const RETIRED_ROUTES = ['/workflow', '/fooocus'];
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

  it('legacy /workflow and /fooocus URLs redirect calmly to /studio', () => {
    for (const route of RETIRED_ROUTES) {
      const re = new RegExp(`path="${route}"\\s+element=\\{<Navigate to="/studio" replace />\\}`);
      expect(re.test(appSrc), `missing redirect for ${route}`).toBe(true);
    }
  });

  it('retired page modules are no longer imported anywhere in App.jsx', () => {
    expect(appSrc.includes('WorkflowStudio')).toBe(false);
    expect(appSrc.includes("from './pages/Fooocus.jsx'")).toBe(false);
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

  it('no OTHER nav item is flagged betaHidden', () => {
    const flagged = SIDEBAR_ROUTE_ITEMS.filter((i) => i.betaHidden).map((i) => i.to).sort();
    expect(flagged).toEqual([...BETA_HIDDEN].sort());
  });

  it('local/demo mode shows every section unchanged', () => {
    expect(visibleNavSections(false)).toBe(NAV_SECTIONS);
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

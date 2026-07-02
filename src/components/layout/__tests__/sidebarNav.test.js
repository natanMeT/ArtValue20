import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { NAV_SECTIONS, SIDEBAR_ROUTE_ITEMS } from '../sidebarNav.js';
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
  '/quotes', '/diagnose', '/adstudio', '/studio', '/workflow', '/fooocus',
  '/finance', '/activity', '/inventory', '/assets', '/templates',
];
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

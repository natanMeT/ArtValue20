import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { GROWTH_NAV, GROWTH_MODULES } from '../growthNav.js';
import { GROWTH_ROUTES } from '../../../data/growthCalendar.js';

// ===================================================================
// Growth OS hub/nav integrity — truthful copy + routes that exist.
// (Slice: calendar → calls/leads/content connection + hub truth fix)
// ===================================================================

// Assert against the REAL route table: a route string must appear as a
// <Route path="..."> in src/App.jsx, so renaming/removing a route there
// breaks this test instead of shipping a dead sidebar/hub/calendar link.
const appSrc = readFileSync(new URL('../../../App.jsx', import.meta.url), 'utf8');
const isRegisteredRoute = (to) => appSrc.includes(`path="${to}"`);

describe('growthNav — routes', () => {
  it('every sidebar nav item points at a route registered in App.jsx', () => {
    for (const item of GROWTH_NAV) {
      expect(isRegisteredRoute(item.to), `nav route not in App.jsx: ${item.to}`).toBe(true);
    }
  });

  it('every hub module points at a route registered in App.jsx', () => {
    for (const m of GROWTH_MODULES) {
      expect(isRegisteredRoute(m.to), `module route not in App.jsx: ${m.to}`).toBe(true);
    }
  });

  it('every calendar operating-link route (GROWTH_ROUTES) is registered in App.jsx', () => {
    for (const to of Object.values(GROWTH_ROUTES)) {
      expect(isRegisteredRoute(to), `calendar link route not in App.jsx: ${to}`).toBe(true);
    }
  });
});

describe('growthNav — truthful hub copy (no stale "coming soon")', () => {
  it('shipped modules are not labeled בקרוב anywhere', () => {
    for (const m of GROWTH_MODULES) {
      for (const value of Object.values(m)) {
        if (typeof value === 'string') expect(value).not.toContain('בקרוב');
      }
    }
  });

  it('every module has a non-empty description of what it does today', () => {
    for (const m of GROWTH_MODULES) {
      expect(typeof m.desc).toBe('string');
      expect(m.desc.length).toBeGreaterThan(10);
    }
  });
});

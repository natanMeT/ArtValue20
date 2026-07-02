import { describe, it, expect } from 'vitest';
import {
  CALENDAR_DEFAULTS,
  CALENDAR_DISCLAIMER,
  CALENDAR_ACTIONS,
  GROWTH_ROUTES,
  planFromTargets,
  weeklyBreakdown,
  rankCategoryFocus,
  actionDestination,
  callsRouteForCategory,
  leadsRouteForCategory,
} from '../growthCalendar.js';
import { LEAD_CATEGORIES } from '../growthLeads.js';

const finite = (n) => Number.isFinite(n) && !Number.isNaN(n);

describe('growthCalendar — planFromTargets baseline', () => {
  it('computes the approved baseline (20000 / 5000 / 25% / 30% / 18d)', () => {
    const p = planFromTargets(CALENDAR_DEFAULTS);
    expect(p.dealsNeeded).toBe(4);             // ceil(20000/5000)
    expect(p.qualifiedLeadsNeeded).toBe(16);   // ceil(4 / 0.25)
    expect(p.leadsToApproach).toBe(54);        // ceil(16 / 0.30)
    // activity volumes follow the agreed ratios
    expect(p.actions.whatsapp).toBe(54);
    expect(p.actions.calls).toBe(16);
    expect(p.actions.followUps).toBe(32);
    expect(p.actions.demos).toBe(16);
    expect(p.actions.meetings).toBe(16);
    expect(p.actions.proposals).toBe(16);
    expect(p.actions.content).toBe(6);
    expect(['feasible', 'tight', 'unrealistic']).toContain(p.feasibility);
  });

  it('is deterministic (same input → identical output)', () => {
    expect(planFromTargets(CALENDAR_DEFAULTS)).toEqual(planFromTargets(CALENDAR_DEFAULTS));
  });
});

describe('growthCalendar — planFromTargets guards (no NaN / no Infinity)', () => {
  const cases = [
    { name: '0 avgDeal', input: { ...CALENDAR_DEFAULTS, avgDeal: 0 } },
    { name: '0 closeRate', input: { ...CALENDAR_DEFAULTS, closeRate: 0 } },
    { name: '0 qualifyRate', input: { ...CALENDAR_DEFAULTS, qualifyRate: 0 } },
    { name: '0 workDays', input: { ...CALENDAR_DEFAULTS, workDays: 0 } },
    { name: 'all zero', input: { target: 0, avgDeal: 0, closeRate: 0, qualifyRate: 0, workDays: 0 } },
    { name: 'garbage', input: { target: 'x', avgDeal: null, closeRate: undefined, qualifyRate: NaN, workDays: -5 } },
    { name: 'empty', input: {} },
  ];
  for (const c of cases) {
    it(`${c.name} → finite, non-negative numbers`, () => {
      const p = planFromTargets(c.input);
      const nums = [p.dealsNeeded, p.qualifiedLeadsNeeded, p.leadsToApproach, p.totalTouches, p.perDay, ...Object.values(p.actions)];
      for (const n of nums) {
        expect(finite(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
      }
    });
  }
});

describe('growthCalendar — weeklyBreakdown', () => {
  it('returns exactly 4 weeks with non-negative integer counts', () => {
    const plan = planFromTargets(CALENDAR_DEFAULTS);
    const weeks = weeklyBreakdown(plan);
    expect(weeks).toHaveLength(4);
    for (const w of weeks) {
      expect(typeof w.title).toBe('string');
      for (const v of Object.values(w.actions)) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('weekly allocations sum exactly to the monthly totals', () => {
    const plan = planFromTargets(CALENDAR_DEFAULTS);
    const weeks = weeklyBreakdown(plan);
    for (const key of Object.keys(plan.actions)) {
      const summed = weeks.reduce((s, w) => s + w.actions[key], 0);
      expect(summed).toBe(plan.actions[key]);
    }
  });
});

describe('growthCalendar — rankCategoryFocus', () => {
  it('returns top 5 with offer/service data, deterministically', () => {
    const a = rankCategoryFocus();
    const b = rankCategoryFocus();
    expect(a).toHaveLength(5);
    expect(a).toEqual(b); // deterministic
    for (const f of a) {
      expect(typeof f.label).toBe('string');
      expect(typeof f.offerName).toBe('string');
      expect(f.offerName.length).toBeGreaterThan(0);
      expect(typeof f.priceBand).toBe('string');
      expect(f.priceBand).toContain('₪');
      expect(f.potential).toHaveProperty('label');
      expect(f.urgency).toHaveProperty('label');
    }
  });
});

describe('growthCalendar — disclaimer', () => {
  it('exposes the planning disclaimer string', () => {
    expect(CALENDAR_DISCLAIMER).toContain('הערכה תכנונית');
  });
});

// ===================================================================
// Operating links (Slice: calendar → calls/leads/content connection)
// Pure route mapping — navigation only, never automation.
// ===================================================================

const KNOWN_ROUTES = ['/calls', '/growth/leads', '/growth/content', '/growth/calendar'];

describe('growthCalendar — actionDestination', () => {
  it('every calendar action has a destination inside Growth OS', () => {
    for (const a of CALENDAR_ACTIONS) {
      const dest = actionDestination(a.key);
      expect(dest).toBeTruthy();
      expect(KNOWN_ROUTES).toContain(dest.to);
      expect(typeof dest.label).toBe('string');
      expect(dest.label.length).toBeGreaterThan(0);
    }
  });

  it('exposes exactly the known Growth OS routes', () => {
    expect(Object.values(GROWTH_ROUTES).sort()).toEqual([...KNOWN_ROUTES].sort());
  });

  it('outreach actions (whatsapp/calls/followUps/meetings) go to /calls', () => {
    for (const key of ['whatsapp', 'calls', 'followUps', 'meetings']) {
      expect(actionDestination(key).to).toBe('/calls');
    }
  });

  it('content goes to /growth/content', () => {
    expect(actionDestination('content').to).toBe('/growth/content');
  });

  it('demos/proposals go to /growth/leads', () => {
    for (const key of ['demos', 'proposals']) {
      expect(actionDestination(key).to).toBe('/growth/leads');
    }
  });

  it('unknown / missing action key falls back safely to the calendar', () => {
    for (const bad of ['nope', '', null, undefined, 42]) {
      const dest = actionDestination(bad);
      expect(dest.to).toBe('/growth/calendar');
      expect(typeof dest.label).toBe('string');
    }
  });
});

describe('growthCalendar — category route helpers', () => {
  it('known lead category → /calls?category=<id>', () => {
    for (const cat of LEAD_CATEGORIES) {
      expect(callsRouteForCategory(cat.id)).toBe(`/calls?category=${encodeURIComponent(cat.id)}`);
    }
  });

  it('known lead category → /growth/leads?category=<id>', () => {
    for (const cat of LEAD_CATEGORIES) {
      expect(leadsRouteForCategory(cat.id)).toBe(`/growth/leads?category=${encodeURIComponent(cat.id)}`);
    }
  });

  it('unknown / missing category id → plain module route (never crashes)', () => {
    for (const bad of ['nope', '', null, undefined, 42]) {
      expect(callsRouteForCategory(bad)).toBe('/calls');
      expect(leadsRouteForCategory(bad)).toBe('/growth/leads');
    }
  });
});

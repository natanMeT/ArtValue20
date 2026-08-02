import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CALENDAR_ACTIONS, CALENDAR_DISCLAIMER, planFromTargets, weeklyBreakdown,
} from '../../data/growthCalendar.js';
import { derivePlanDefaults } from '../../lib/planDefaults.js';

// ===================================================================
// Monthly Plan (/plan) — the screen.
//
// House pattern (no jsdom in this repo): the page pulls in store/router and is
// not cleanly renderable under Vitest, so the logic that CAN be executed is
// executed with injected deps, and the wiring that cannot is source-pinned
// against the SHIPPED file.
//
// The five claims this file exists to defend:
//   1. the page is NOT behind GrowthBetaGate and renders in cloud mode;
//   2. it links NOWHERE — especially not into beta-contained Growth OS;
//   3. it is READ-ONLY — no dispatch, no api call, no persistence of any kind;
//   4. the planning disclaimer is VISIBLE text at the top, not a tooltip;
//   5. every field states where its number came from.
// ===================================================================

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const page = read('../MonthlyPlan.jsx');
const app = read('../../App.jsx');
const nav = read('../../components/layout/sidebarNav.js');
const helper = read('../../lib/planDefaults.js');

/** Source with block comments and line comments stripped — so a claim can
 *  never be satisfied by a comment that merely mentions the right words. */
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((l) => l.replace(/\/\/.*$/, ''))
  .join('\n');

const code = strip(page);
const appCode = strip(app);

describe('MonthlyPlan — positive controls (the pins are looking at real code)', () => {
  it('the stripped page still contains its component and its render tree', () => {
    expect(code).toContain('export default function MonthlyPlan');
    expect(code).toContain('planFromTargets');
    expect(code).toContain('weeklyBreakdown');
  });

  it('the stripped App still contains the route table', () => {
    expect(appCode).toContain('<Routes>');
    expect(appCode).toContain('GrowthBetaGate');
  });
});

describe('MonthlyPlan — claim 1: NOT beta-gated', () => {
  it('App registers /plan without GrowthBetaGate', () => {
    const route = appCode.match(/<Route path="\/plan"[^>]*\/>/);
    expect(route, '/plan route not found in App.jsx').toBeTruthy();
    expect(route[0]).toContain('<MonthlyPlan />');
    expect(route[0]).not.toContain('GrowthBetaGate');
  });

  it('the page itself never renders BetaUnavailable and never reads the mode', () => {
    expect(code).not.toContain('BetaUnavailable');
    expect(code).not.toContain('isSupabaseConfigured');
    expect(code).not.toContain('BETA_HIDDEN_MODULES');
  });

  it('the sidebar item carries neither betaHidden nor cloudOnly', () => {
    const item = strip(nav).match(/\{[^{}]*to: '\/plan'[^{}]*\}/);
    expect(item, '/plan nav item not found').toBeTruthy();
    expect(item[0]).not.toContain('betaHidden');
    expect(item[0]).not.toContain('cloudOnly');
  });

  it('the five Growth routes are still gated — this slice did not open Growth', () => {
    for (const path of ['/growth', '/growth/leads', '/growth/calendar', '/growth/content', '/calls']) {
      const route = appCode.match(new RegExp(`<Route path="${path.replace(/\//g, '\\/')}"[\\s\\S]*?<\\/Route>`));
      expect(route, `route ${path} not found`).toBeTruthy();
      expect(route[0], `${path} lost its gate`).toContain('GrowthBetaGate');
    }
  });
});

describe('MonthlyPlan — claim 2: no dead links, no Growth navigation', () => {
  it('the page contains NO /growth or /calls ROUTE literal', () => {
    // A quoted path, i.e. what a link or a navigate() would actually use.
    // (The growthCalendar.js *import specifier* legitimately contains the
    // characters "/growth" — matching a bare substring would fail on it and
    // prove nothing, so the guard matches a route literal specifically.)
    const routeLiteral = /(['"`])\/(growth|calls)\b/;
    expect(routeLiteral.test(code), 'page contains a Growth route literal').toBe(false);
    expect(routeLiteral.test("to='/growth/leads'"), 'positive control').toBe(true);
    expect(routeLiteral.test("from '../data/growthCalendar.js'"), 'import must not match').toBe(false);
  });

  it('the page renders no router link of any kind', () => {
    expect(code).not.toContain('<Link');
    expect(code).not.toContain('NavLink');
    expect(code).not.toContain('react-router');
    expect(code).not.toContain('<a ');
  });

  it('it does not import the link-bearing or demo-data helpers', () => {
    // actionDestination renders a Growth link; rankCategoryFocus / growthLeads
    // are ArtValue-specific demo data that is not account-aware.
    for (const forbidden of [
      'actionDestination', 'rankCategoryFocus', 'callsRouteForCategory',
      'leadsRouteForCategory', 'GROWTH_ROUTES', 'growthLeads', 'growthContext', 'askJake',
    ]) {
      expect(code, `page must not use ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe('MonthlyPlan — claim 3: read-only', () => {
  it('never dispatches and never touches the data layer', () => {
    for (const forbidden of ['dispatch', "from '../lib/api", 'supabase', 'localStorage', 'refetch']) {
      expect(code, `page must not use ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('creates no task, campaign, appointment or asset', () => {
    for (const forbidden of ['createTask', 'ADD_TASK', 'createCampaign', 'createAppointment', 'saveAsset']) {
      expect(code).not.toContain(forbidden);
    }
  });

  it('reads the store but only for the three snapshot lists it derives from', () => {
    expect(code).toContain('const { data } = useStore()');
    expect(code).toContain('quotes: data.quotes');
    expect(code).toContain('payments: data.payments');
    expect(code).toContain('transactions: data.transactions');
  });

  it('offers no save affordance at all', () => {
    // No form to submit, no success toast, no imperative "save" control.
    // (The page DOES contain the word "נשמרת" — in the sentence that says it is
    // NOT saved — so the guard looks for the affordance, not the substring.)
    for (const forbidden of ['toast(', '<form', 'onSubmit', 'type="submit"', 'שמירה', '>שמור<']) {
      expect(code, `page must not contain ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('the only button on the page is the reset control', () => {
    const buttons = code.match(/<button[\s\S]*?>/g) || [];
    expect(buttons).toHaveLength(1);
    expect(code).toContain('onClick={onReset}');
    // and it is the ONLY onClick in the file
    expect((code.match(/onClick=/g) || [])).toHaveLength(1);
  });

  it('the deriving helper is itself free of the data layer', () => {
    const h = strip(helper);
    expect(h).not.toContain('./api');
    expect(h).not.toContain('./supabase');
  });
});

describe('MonthlyPlan — claim 4: the disclaimer is visible text at the top', () => {
  it('renders CALENDAR_DISCLAIMER from the shared module, not a re-typed string', () => {
    expect(code).toContain('CALENDAR_DISCLAIMER');
    expect(code).toContain('{CALENDAR_DISCLAIMER}');
    expect(CALENDAR_DISCLAIMER).toContain('לא תחזית מובטחת');
  });

  it('it is rendered as text, never as a title/tooltip attribute', () => {
    expect(code).not.toMatch(/title=\{CALENDAR_DISCLAIMER\}/);
    expect(code).not.toMatch(/aria-label=\{CALENDAR_DISCLAIMER\}/);
  });

  it('it appears BEFORE the numbers it qualifies', () => {
    const disclaimerAt = code.indexOf('{CALENDAR_DISCLAIMER}');
    const controlsAt = code.indexOf('gc-controls');
    const summaryAt = code.indexOf('gc-summary');
    expect(disclaimerAt).toBeGreaterThan(-1);
    expect(disclaimerAt).toBeLessThan(controlsAt);
    expect(disclaimerAt).toBeLessThan(summaryAt);
  });

  it('states plainly that nothing is saved and nothing is created', () => {
    expect(code).toContain('ואינה נשמרת');
    expect(code).toContain('אינה יוצרת משימות');
  });
});

describe('MonthlyPlan — claim 5: per-field provenance + the empty-account sentence', () => {
  it('renders a source label for every one of the five fields', () => {
    expect(code).toContain('PLAN_SOURCE_LABELS[source]');
    expect(code).toContain('data-testid={`plan-source-${f.key}`}');
    const fields = code.match(/const FIELDS = \[[\s\S]*?\n\];/)[0];
    for (const key of ['target', 'avgDeal', 'closeRate', 'qualifyRate', 'workDays']) {
      expect(fields).toContain(`key: '${key}'`);
    }
  });

  it('shows the no-data sentence only when nothing was derived', () => {
    expect(code).toContain('{!anyDerived && (');
    expect(code).toContain('{NO_DATA_NOTE}');
  });

  it('shows the double-count caveat only when the target really was derived', () => {
    expect(code).toContain("derived.sources.target === 'recordedLastMonth'");
    expect(code).toContain('{TARGET_SOURCE_NOTE}');
  });

  it('every field is editable — none is disabled or readOnly', () => {
    expect(code).not.toContain('disabled');
    expect(code).not.toContain('readOnly');
    expect(code).toContain('onChange={(e) => onChange(f.key, e.target.value)}');
  });

  it('every input has an id and a matching label (the a11y pairing)', () => {
    expect(code).toContain('htmlFor={`plan-${f.key}`}');
    expect(code).toContain('id={`plan-${f.key}`}');
  });

  it('reset returns to the DERIVED baseline, not to the hard-coded defaults', () => {
    expect(code).toContain('const onReset = () => setValues(derived.values);');
    expect(code).not.toContain('setValues(CALENDAR_DEFAULTS)');
  });
});

// ---- behavioural: run the shipped handler over injected state ----------------
describe('MonthlyPlan — the real onChange handler, executed', () => {
  const SRC = code.match(/const onChange = \(key, raw\) => \{[\s\S]*?\n  \};/);

  function harness(initial) {
    let values = { ...initial };
    const setValues = (fn) => { values = fn(values); };
    // eslint-disable-next-line no-new-func
    const onChange = new Function('setValues', `${SRC[0]}\n return onChange;`)(setValues);
    return { onChange, get: () => values };
  }

  it('the handler was found in the shipped source', () => {
    expect(SRC, 'onChange handler not found').toBeTruthy();
  });

  it('an emptied field becomes 0 so it can be cleared while typing', () => {
    const h = harness({ target: 20000 });
    h.onChange('target', '');
    expect(h.get().target).toBe(0);
  });

  it('a numeric string is stored as a number', () => {
    const h = harness({ target: 20000 });
    h.onChange('target', '31500');
    expect(h.get().target).toBe(31500);
  });

  it('garbage keeps the previous value instead of writing NaN', () => {
    const h = harness({ target: 20000 });
    h.onChange('target', 'abc');
    expect(h.get().target).toBe(20000);
    expect(Number.isNaN(h.get().target)).toBe(false);
  });
});

// ---- behavioural: the arithmetic the screen shows ---------------------------
describe('MonthlyPlan — the weekly breakdown sums to the monthly totals', () => {
  const CASES = [
    { target: 20000, avgDeal: 5000, closeRate: 25, qualifyRate: 30, workDays: 18 },
    { target: 0, avgDeal: 5000, closeRate: 25, qualifyRate: 30, workDays: 18 },
    { target: 137, avgDeal: 999, closeRate: 7, qualifyRate: 3, workDays: 1 },
  ];

  for (const input of CASES) {
    it(`sums exactly for target=${input.target}`, () => {
      const plan = planFromTargets(input);
      const weeks = weeklyBreakdown(plan);
      for (const a of CALENDAR_ACTIONS) {
        const summed = weeks.reduce((s, w) => s + w.actions[a.key], 0);
        expect(summed, `${a.key} does not sum to its monthly total`).toBe(plan.actions[a.key]);
      }
    });
  }

  it('every rendered action key exists in the plan (no blank card)', () => {
    const plan = planFromTargets(CASES[0]);
    for (const a of CALENDAR_ACTIONS) {
      expect(Number.isFinite(plan.actions[a.key]), `${a.key} missing`).toBe(true);
    }
  });
});

// ---- the end-to-end shape the screen actually renders on an empty account ---
describe('MonthlyPlan — an empty account still produces a finite, non-zero plan', () => {
  it('derived defaults feed planFromTargets without NaN or Infinity', () => {
    const { values } = derivePlanDefaults({}, new Date(2026, 6, 15));
    const plan = planFromTargets(values);
    for (const a of CALENDAR_ACTIONS) {
      expect(Number.isFinite(plan.actions[a.key])).toBe(true);
      expect(plan.actions[a.key]).toBeGreaterThanOrEqual(0);
    }
    expect(Number.isFinite(plan.perDay)).toBe(true);
    expect(['feasible', 'tight', 'unrealistic']).toContain(plan.feasibility);
  });
});

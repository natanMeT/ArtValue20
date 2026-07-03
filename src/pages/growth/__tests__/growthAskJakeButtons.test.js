import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildGrowthPromptSeed } from '../../../data/growthContext.js';
import { CALENDAR_DEFAULTS, planFromTargets } from '../../../data/growthCalendar.js';
import { categoryById, LEAD_CATEGORIES } from '../../../data/growthLeads.js';

// ===================================================================
// Ask Jake buttons — source-level wiring + prompt-shape guarantees.
// (Slice: growth ask-jake buttons Phase 1)
// Source checks follow the repo's readFileSync pattern (growthNav.test.js):
// they pin the seam usage — imports, seed types, labels, and click-only
// dispatch — without brittle full-render tests (no DOM deps in this repo).
// ===================================================================

const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const PAGES = [
  {
    name: 'GrowthCalendar',
    file: '../GrowthCalendar.jsx',
    seed: 'daily_focus',
    label: 'שאל את ג׳יק מה לעשות היום',
  },
  {
    name: 'Calls',
    file: '../Calls.jsx',
    seed: 'call_prep',
    label: 'הכן לי שיחה עם ג׳יק',
  },
  {
    name: 'LeadCategoryDetail',
    file: '../leads/LeadCategoryDetail.jsx',
    seed: 'category_strategy',
    label: 'שאל את ג׳יק על אסטרטגיה',
  },
];

describe('ask-jake buttons — page wiring (source-level)', () => {
  for (const page of PAGES) {
    describe(page.name, () => {
      const code = src(page.file);

      it('imports askJake and buildGrowthPromptSeed', () => {
        expect(code).toMatch(/import\s*\{\s*askJake\s*\}\s*from\s*'[^']*lib\/askJake\.js'/);
        expect(code).toMatch(/import\s*\{\s*buildGrowthPromptSeed\s*\}\s*from\s*'[^']*data\/growthContext\.js'/);
      });

      it(`uses the ${page.seed} seed and the expected label`, () => {
        expect(code).toContain(`buildGrowthPromptSeed('${page.seed}'`);
        expect(code).toContain(page.label);
      });

      it('dispatches ONLY from click handlers — no render/effect auto-dispatch', () => {
        // Invariant: EVERY askJake( call in the page is click-bound — either
        // an inline `onClick={() => askJake(...)}` or inside a named handler
        // referenced via `onClick={name}`. total === bound blocks render-time
        // and top-level dispatches; the effect scan below blocks the effect
        // paths this token count alone cannot see (handler indirection).
        // Only strip real import statements — a substring filter would hide
        // lines like `/* important */ askJake(p)` from the count.
        const body = code.split('\n').filter((l) => !/^\s*import\b/.test(l)).join('\n');
        const total = (body.match(/askJake\(/g) || []).length;
        expect(total, `${page.name}: expected at least one askJake call`).toBeGreaterThanOrEqual(1);

        const inline = (body.match(/onClick=\{\(\)\s*=>\s*askJake\(/g) || []).length;

        // Named handlers referenced by onClick: count the askJake calls inside
        // each `const <name> = () => { ... };` block (lazy up to its `};`).
        let viaHandler = 0;
        const handlerNames = [...body.matchAll(/onClick=\{(\w+)\}/g)].map((m) => m[1]);
        for (const name of new Set(handlerNames)) {
          const def = body.match(new RegExp(`const\\s+${name}\\s*=\\s*\\(\\)\\s*=>\\s*\\{[^]*?\\n\\s*\\};`));
          if (def) viaHandler += (def[0].match(/askJake\(/g) || []).length;
        }

        expect(inline + viaHandler, `${page.name}: ${total} askJake call(s) but only ${inline + viaHandler} click-bound`)
          .toBe(total);

        // Effect scan: no useEffect/useLayoutEffect body may dispatch —
        // neither directly (askJake) nor by calling an onClick handler.
        // Catches the handler-indirection and swallowed-effect bypasses the
        // token count can miss. (Calls.jsx keeps its legit param-sync effect —
        // this only forbids dispatch-related tokens inside effect bodies.)
        const effectBodies = [...body.matchAll(/use(?:Layout)?Effect\(\s*\(\)\s*=>\s*\{([^]*?)\}\s*,/g)]
          .map((m) => m[1]);
        for (const eff of effectBodies) {
          expect(eff, `${page.name}: askJake dispatched from an effect`).not.toContain('askJake');
          for (const name of new Set(handlerNames)) {
            expect(eff, `${page.name}: effect calls click handler ${name}()`)
              .not.toContain(`${name}(`);
          }
        }
      });
    });
  }

  it('the seam itself lives ONLY in the helper — pages never touch dispatchEvent/CustomEvent', () => {
    for (const page of PAGES) {
      const code = src(page.file);
      expect(code).not.toContain('dispatchEvent');
      expect(code).not.toContain('CustomEvent');
      expect(code).not.toContain("jake:ask'");
    }
  });
});

describe('ask-jake buttons — dispatched prompt shapes', () => {
  it('daily_focus prompt reflects the custom on-screen target/avgDeal', () => {
    const p = buildGrowthPromptSeed('daily_focus', { target: 30000, avgDeal: 6000 });
    expect(p).toContain('שאלה: ');
    expect(p).toContain('מוקד פעולה יומי');
    expect(p).toContain('פעולות ביום');
    expect(p).toContain('כללי בטיחות');
  });

  it('daily_focus prompt honors ALL edited plan assumptions, matching the plan card', () => {
    // The calendar button forwards {...values} — closeRate/qualifyRate/workDays
    // must change the prompt's numbers exactly like they change the on-screen
    // plan (this pins the fix for the screen-vs-prompt contradiction).
    const defaults = buildGrowthPromptSeed('daily_focus', {});
    const edited = buildGrowthPromptSeed('daily_focus', { closeRate: 50, qualifyRate: 60, workDays: 10 });
    expect(edited).not.toBe(defaults);
    const expected = planFromTargets({
      target: CALENDAR_DEFAULTS.target, avgDeal: CALENDAR_DEFAULTS.avgDeal,
      closeRate: 50, qualifyRate: 60, workDays: 10,
    });
    expect(edited).toContain(`~${expected.perDay} פעולות ביום`);
    expect(edited).toContain(`וואטסאפ ${expected.actions.whatsapp}`);
  });

  it('call_prep prompt carries real category context for every category id', () => {
    for (const cat of LEAD_CATEGORIES) {
      const p = buildGrowthPromptSeed('call_prep', { categoryId: cat.id });
      expect(p).toContain(cat.label);
      expect(p).toContain('התנגדות נפוצה');
      expect(p).toContain('כללי בטיחות');
      expect(p.length).toBeLessThan(4000);
    }
  });

  it('category_strategy prompt carries the category and manual-only safety', () => {
    const cat = categoryById('car_agencies');
    const p = buildGrowthPromptSeed('category_strategy', { categoryId: cat.id });
    expect(p).toContain(cat.label);
    expect(p).toContain('צעדים ידניים');
    expect(p).toContain('סגנון תשובה נדרש');
    expect(p.length).toBeLessThan(4000);
  });
});

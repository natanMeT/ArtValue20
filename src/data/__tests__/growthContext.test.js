import { describe, it, expect } from 'vitest';
import {
  buildGrowthContext,
  buildGrowthDailyFocusContext,
  buildGrowthCategoryContext,
  buildGrowthAskPrompt,
  buildGrowthPromptSeed,
  GROWTH_PROMPT_SEED_TYPES,
  GROWTH_CONTEXT_SAFETY,
} from '../growthContext.js';
import { LEAD_CATEGORIES, categoryById } from '../growthLeads.js';
import { CALENDAR_DEFAULTS } from '../growthCalendar.js';

// ===================================================================
// Growth OS deterministic context pack — quality, safety, fallbacks.
// (Slice: growth context pack — no Jake wiring, pure text builders)
// ===================================================================

const HEBREW = /[א-ת]/;

// Grounded copy — the builders must never emit guarantee/hype phrasing.
const FORBIDDEN = ['מובטח', 'הכפלה', 'להכפיל', 'תוך 7 ימים', 'תוך 14 יום', 'תוך 30 יום', 'guarantee', '100%'];
// Automatic-send language must never appear as an instruction to act.
const AUTO_SEND = ['אשלח עבורך', 'שולח עכשיו', 'נשלח אוטומטית', 'שליחה אוטומטית מופעלת'];

const ALL_BUILDERS = () => [
  buildGrowthContext(),
  buildGrowthDailyFocusContext(),
  buildGrowthCategoryContext(LEAD_CATEGORIES[0].id),
  buildGrowthAskPrompt('מה כדאי לי לעשות היום?'),
  ...GROWTH_PROMPT_SEED_TYPES.map((t) => buildGrowthPromptSeed(t, { categoryId: LEAD_CATEGORIES[0].id })),
];

describe('growthContext — full context', () => {
  const ctx = buildGrowthContext();

  it('returns a non-empty Hebrew string', () => {
    expect(typeof ctx).toBe('string');
    expect(ctx.length).toBeGreaterThan(200);
    expect(HEBREW.test(ctx)).toBe(true);
  });

  it('states the Growth OS purpose WITHOUT sending the hardcoded ArtValue brand (S0D containment)', () => {
    expect(ctx).toContain('Growth OS');
    expect(ctx).toContain('מטרת המערכת');
    // S0D: the hardcoded "ArtValue" business name/positioning is neutralized at
    // the seed source so this mapped Growth seed sends no ArtValue business facts.
    expect(ctx).not.toContain('ArtValue');
  });

  it('includes calendar/action-plan volumes from the default plan', () => {
    expect(ctx).toContain('תוכנית חודשית');
    expect(ctx).toContain(`₪${CALENDAR_DEFAULTS.target.toLocaleString('en-US')}`);
    expect(ctx).toContain('הודעות וואטסאפ');
    expect(ctx).toContain('פולואפים');
    expect(ctx).toContain('פעולות ביום');
  });

  it('includes ranked lead-category focus with offers', () => {
    expect(ctx).toContain('קטגוריות מיקוד');
    expect(ctx).toContain('הצעה מומלצת');
    // at least the top-ranked category label appears
    const labels = LEAD_CATEGORIES.map((c) => c.label);
    expect(labels.some((l) => ctx.includes(l))).toBe(true);
  });

  it('includes the planning disclaimer (not a forecast)', () => {
    expect(ctx).toContain('הערכה תכנונית בלבד');
  });

  it('respects categoryLimit and custom targets', () => {
    const small = buildGrowthContext({ categoryLimit: 1, target: 10000, avgDeal: 2000 });
    expect(small).toContain('₪10,000');
    expect(small).toContain('₪2,000');
    expect(small.length).toBeLessThan(ctx.length);
  });
});

describe('growthContext — daily focus context', () => {
  const daily = buildGrowthDailyFocusContext();

  it('is short, Hebrew, and action-oriented', () => {
    expect(HEBREW.test(daily)).toBe(true);
    expect(daily).toContain('מוקד פעולה יומי');
    expect(daily).toContain('פעולות ביום');
    expect(daily.length).toBeLessThan(buildGrowthContext().length);
  });

  it('names the top focus category', () => {
    const labels = LEAD_CATEGORIES.map((c) => c.label);
    expect(labels.some((l) => daily.includes(l))).toBe(true);
  });
});

describe('growthContext — category context', () => {
  it('builds without throwing for EVERY growth lead category', () => {
    for (const cat of LEAD_CATEGORIES) {
      const ctx = buildGrowthCategoryContext(cat.id);
      expect(ctx).toContain(cat.label);
      expect(ctx).toContain('מי הלקוח');
      expect(ctx).toContain('הצעה מומלצת');
      expect(ctx).toContain('התנגדות נפוצה');
      expect(ctx).toContain('תבניות תוכן מתאימות');
    }
  });

  it('includes real category data (pains, offer, objection response)', () => {
    const cat = categoryById('car_agencies');
    const ctx = buildGrowthCategoryContext('car_agencies');
    expect(ctx).toContain(cat.pains[0]);
    expect(ctx).toContain(cat.objection);
    expect(ctx).toContain(cat.response);
  });

  it('falls back safely for unknown / missing category ids', () => {
    for (const bad of ['no-such-category', '', null, undefined, 42]) {
      const ctx = buildGrowthCategoryContext(bad);
      expect(typeof ctx).toBe('string');
      expect(ctx).toContain('לא נמצאה');
      expect(ctx).toContain('כללי בטיחות');
    }
  });

  it('bounds the number of surfaced templates', () => {
    const ctx = buildGrowthCategoryContext(LEAD_CATEGORIES[0].id, { templateLimit: 1 });
    const bullets = ctx.split('תבניות תוכן מתאימות:')[1].split('כללי בטיחות')[0]
      .split('\n').filter((l) => l.trim().startsWith('- '));
    expect(bullets.length).toBeLessThanOrEqual(1 + 0); // one template bullet max
  });
});

describe('growthContext — prompt builders', () => {
  it('includes the user question verbatim', () => {
    const p = buildGrowthAskPrompt('איך לענות להתנגדות של יקבים?');
    expect(p).toContain('שאלה: איך לענות להתנגדות של יקבים?');
  });

  it('embeds Growth context (general or per-category), brand-neutral (S0D)', () => {
    const general = buildGrowthAskPrompt('מה היום?');
    expect(general).toContain('הקשר Growth OS');
    expect(general).not.toContain('ArtValue');
    const withCat = buildGrowthAskPrompt('מה היום?', { categoryId: 'car_agencies' });
    expect(withCat).toContain('הקשר קטגוריה');
    expect(withCat).toContain(categoryById('car_agencies').label);
    expect(withCat).not.toContain('ArtValue');
  });

  it('instructs Hebrew, practical, manual-only answers', () => {
    const p = buildGrowthAskPrompt('מה היום?');
    expect(p).toContain('לענות בעברית');
    expect(p).toContain('צעדים ידניים בלבד');
    expect(p).toContain('בלי הבטחות תוצאה');
    expect(p).toContain('לא להמציא נתונים');
  });

  it('falls back to a default question for empty input', () => {
    const p = buildGrowthAskPrompt('');
    expect(p).toContain('שאלה: ');
    expect(p.split('שאלה: ')[1].split('\n')[0].length).toBeGreaterThan(5);
  });

  it('is bounded — no prompt explodes in size', () => {
    for (const p of ALL_BUILDERS()) {
      expect(p.length).toBeLessThan(4000);
    }
  });

  it('every seed type produces a prompt with question + context + style', () => {
    expect(GROWTH_PROMPT_SEED_TYPES.length).toBeGreaterThanOrEqual(5);
    for (const type of GROWTH_PROMPT_SEED_TYPES) {
      const p = buildGrowthPromptSeed(type, { categoryId: 'car_agencies' });
      expect(p).toContain('שאלה: ');
      expect(p).toContain('כללי בטיחות');
      expect(p).toContain('סגנון תשובה נדרש');
    }
  });

  it('unknown seed type falls back to daily focus (never throws)', () => {
    const p = buildGrowthPromptSeed('no-such-seed');
    expect(p).toContain('שאלה: ');
    expect(p).toContain('מוקד פעולה יומי');
  });

  it('category-flavored seeds stay coherent WITHOUT a categoryId', () => {
    // Over a general context, the question must not dangle on "הקטגוריה הזו".
    for (const type of GROWTH_PROMPT_SEED_TYPES) {
      const p = buildGrowthPromptSeed(type);
      expect(p, `seed ${type} references a category over a general context`)
        .not.toContain('הקטגוריה הזו');
    }
  });
});

describe('growthContext — safety and grounded copy', () => {
  it('every builder output carries the safety rules', () => {
    for (const out of ALL_BUILDERS()) {
      expect(out).toContain('כללי בטיחות');
      expect(out).toContain('צעדים ידניים');
    }
    expect(GROWTH_CONTEXT_SAFETY.length).toBeGreaterThanOrEqual(3);
  });

  it('no builder output contains guarantee/hype phrases', () => {
    // The calendar disclaimer 'לא תחזית מובטחת' NEGATES a guarantee — that
    // phrasing is desired, so strip it before scanning for hype language.
    const withoutDisclaimer = (s) => s.replaceAll('לא תחזית מובטחת', '');
    for (const out of ALL_BUILDERS()) {
      const scanned = withoutDisclaimer(out);
      for (const bad of FORBIDDEN) {
        expect(scanned, `forbidden phrase "${bad}"`).not.toContain(bad);
      }
    }
  });

  it('no builder output contains automatic-send language', () => {
    for (const out of ALL_BUILDERS()) {
      for (const bad of AUTO_SEND) {
        expect(out, `auto-send phrase "${bad}"`).not.toContain(bad);
      }
    }
  });

  it('is deterministic — same inputs, same output', () => {
    expect(buildGrowthContext()).toBe(buildGrowthContext());
    expect(buildGrowthPromptSeed('call_prep', { categoryId: 'clinics' }))
      .toBe(buildGrowthPromptSeed('call_prep', { categoryId: 'clinics' }));
  });
});

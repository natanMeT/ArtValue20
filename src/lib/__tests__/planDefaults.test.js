import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  derivePlanDefaults, hasDerivedValue, monthKey, previousMonthKey,
  PLAN_SOURCE_LABELS, PLAN_SOURCES, TARGET_SOURCE_NOTE, NO_DATA_NOTE,
} from '../planDefaults.js';
import { CALENDAR_DEFAULTS } from '../../data/growthCalendar.js';

// A fixed clock. Nothing in these tests reads the real one, so a run in July
// and a run in December are identical.
const NOW = new Date(2026, 6, 15); // 2026-07-15 -> previous month is 2026-06

const quote = (status, price, qty = 1, vatRate = 0) => ({
  id: `q-${status}-${price}`, status, vatRate, items: [{ qty, price }],
});
const payment = (amount, paidAt) => ({ id: `p-${paidAt}-${amount}`, amount, paidAt });
const income = (amount, date) => ({ id: `t-${date}-${amount}`, type: 'income', amount, date });

describe('planDefaults — month helpers', () => {
  it('monthKey reads the YYYY-MM prefix of a date string', () => {
    expect(monthKey('2026-06-30')).toBe('2026-06');
    expect(monthKey('2026-06-30T22:00:00Z')).toBe('2026-06');
  });

  it('monthKey rejects anything that is not a dated string', () => {
    for (const bad of [null, undefined, '', 'nope', 123, {}, '20260630', '2026-6-30']) {
      expect(monthKey(bad)).toBeNull();
    }
  });

  it('previousMonthKey crosses the year boundary', () => {
    expect(previousMonthKey(new Date(2026, 0, 5))).toBe('2025-12');
    expect(previousMonthKey(new Date(2026, 6, 15))).toBe('2026-06');
    expect(previousMonthKey(new Date(2026, 11, 31))).toBe('2026-11');
  });

  it('previousMonthKey survives a missing or invalid clock without throwing', () => {
    expect(() => previousMonthKey(undefined)).not.toThrow();
    expect(previousMonthKey(new Date('nonsense'))).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('planDefaults — empty account', () => {
  it('returns exactly CALENDAR_DEFAULTS with every source marked default', () => {
    const { values, sources } = derivePlanDefaults({}, NOW);
    expect(values).toEqual(CALENDAR_DEFAULTS);
    expect(sources).toEqual({
      target: 'default', avgDeal: 'default', closeRate: 'default',
      qualifyRate: 'default', workDays: 'default',
    });
    expect(hasDerivedValue(sources)).toBe(false);
  });

  it('tolerates a missing snapshot, a null snapshot and non-array fields', () => {
    for (const snap of [undefined, null, 'nope', { quotes: null, payments: 7, transactions: {} }]) {
      const { values } = derivePlanDefaults(snap, NOW);
      expect(values).toEqual(CALENDAR_DEFAULTS);
    }
  });
});

describe('planDefaults — avgDeal', () => {
  it('averages ACCEPTED quotes and labels the source', () => {
    const { values, sources } = derivePlanDefaults({
      quotes: [quote('accepted', 4000), quote('accepted', 6000), quote('draft', 100000)],
    }, NOW);
    expect(values.avgDeal).toBe(5000);
    expect(sources.avgDeal).toBe('acceptedQuotes');
  });

  it('includes VAT, because quoteTotal does', () => {
    const { values } = derivePlanDefaults({ quotes: [quote('accepted', 1000, 1, 100)] }, NOW);
    expect(values.avgDeal).toBe(2000);
  });

  it('falls back to ALL quotes when none were accepted', () => {
    const { values, sources } = derivePlanDefaults({
      quotes: [quote('sent', 3000), quote('draft', 5000)],
    }, NOW);
    expect(values.avgDeal).toBe(4000);
    expect(sources.avgDeal).toBe('allQuotes');
  });

  it('falls back to the default when every quote totals zero', () => {
    const { values, sources } = derivePlanDefaults({
      quotes: [quote('accepted', 0), { id: 'x', status: 'sent' }],
    }, NOW);
    expect(values.avgDeal).toBe(CALENDAR_DEFAULTS.avgDeal);
    expect(sources.avgDeal).toBe('default');
  });

  it('never returns 0, NaN or a negative average', () => {
    const { values } = derivePlanDefaults({
      quotes: [quote('accepted', -500), quote('accepted', 1)],
    }, NOW);
    expect(Number.isFinite(values.avgDeal)).toBe(true);
    expect(values.avgDeal).toBeGreaterThanOrEqual(1);
  });
});

describe('planDefaults — closeRate', () => {
  it('divides accepted by DECIDED quotes only, ignoring drafts and sent', () => {
    const { values, sources } = derivePlanDefaults({
      quotes: [
        quote('accepted', 1000), quote('rejected', 1000),
        quote('draft', 1000), quote('sent', 1000), quote('viewed', 1000),
      ],
    }, NOW);
    // 1 accepted of 2 DECIDED = 50%. Counting all five would report 20%.
    expect(values.closeRate).toBe(50);
    expect(sources.closeRate).toBe('decidedQuotes');
  });

  it('falls back to the default when NO quote was ever decided (no divide by zero)', () => {
    const { values, sources } = derivePlanDefaults({
      quotes: [quote('draft', 1000), quote('sent', 2000)],
    }, NOW);
    expect(values.closeRate).toBe(CALENDAR_DEFAULTS.closeRate);
    expect(sources.closeRate).toBe('default');
    expect(Number.isNaN(values.closeRate)).toBe(false);
  });

  it('clamps an all-rejected history to the minimum instead of 0%', () => {
    const { values } = derivePlanDefaults({
      quotes: [quote('rejected', 1000), quote('rejected', 2000)],
    }, NOW);
    expect(values.closeRate).toBe(1);
    expect(values.closeRate).toBeGreaterThan(0);
  });

  it('never exceeds 100%', () => {
    const { values } = derivePlanDefaults({
      quotes: [quote('accepted', 1000), quote('accepted', 2000)],
    }, NOW);
    expect(values.closeRate).toBe(100);
  });
});

describe('planDefaults — target (income recorded last month)', () => {
  it('sums payments and income transactions from the PREVIOUS calendar month', () => {
    const { values, sources } = derivePlanDefaults({
      payments: [payment(4000, '2026-06-10')],
      transactions: [income(1500, '2026-06-28')],
    }, NOW);
    expect(values.target).toBe(5500);
    expect(sources.target).toBe('recordedLastMonth');
  });

  it('ignores the CURRENT month — the window is last month only', () => {
    const { values, sources } = derivePlanDefaults({
      payments: [payment(9000, '2026-07-02')],
      transactions: [income(9000, '2026-07-14')],
    }, NOW);
    expect(values.target).toBe(CALENDAR_DEFAULTS.target);
    expect(sources.target).toBe('default');
  });

  it('handles the December -> January boundary', () => {
    const { values, sources } = derivePlanDefaults(
      { payments: [payment(7000, '2025-12-31')] },
      new Date(2026, 0, 9),
    );
    expect(values.target).toBe(7000);
    expect(sources.target).toBe('recordedLastMonth');
  });

  it('ignores expenses, null dates and unparseable amounts without throwing', () => {
    const { values, sources } = derivePlanDefaults({
      payments: [payment(1000, '2026-06-01'), payment(500, null), payment('abc', '2026-06-02')],
      transactions: [
        { id: 'e', type: 'expense', amount: 99999, date: '2026-06-03' },
        income(0, '2026-06-04'),
      ],
    }, NOW);
    expect(values.target).toBe(1000);
    expect(sources.target).toBe('recordedLastMonth');
  });

  it('is a positive finite integer whenever it is derived', () => {
    const { values } = derivePlanDefaults({ payments: [payment(1234.56, '2026-06-05')] }, NOW);
    expect(Number.isInteger(values.target)).toBe(true);
    expect(values.target).toBeGreaterThan(0);
  });
});

describe('planDefaults — fields with NO derivable source', () => {
  it('always leaves qualifyRate and workDays as defaults, even on a rich account', () => {
    const { values, sources } = derivePlanDefaults({
      quotes: [quote('accepted', 5000), quote('rejected', 5000)],
      payments: [payment(9000, '2026-06-10')],
      transactions: [income(1000, '2026-06-11')],
    }, NOW);
    expect(values.qualifyRate).toBe(CALENDAR_DEFAULTS.qualifyRate);
    expect(values.workDays).toBe(CALENDAR_DEFAULTS.workDays);
    expect(sources.qualifyRate).toBe('default');
    expect(sources.workDays).toBe('default');
    // ...while the three that CAN be derived, were.
    expect(hasDerivedValue(sources)).toBe(true);
  });
});

describe('planDefaults — provenance vocabulary', () => {
  it('every source a derivation can emit has a Hebrew label', () => {
    for (const s of PLAN_SOURCES) {
      expect(typeof PLAN_SOURCE_LABELS[s]).toBe('string');
      expect(PLAN_SOURCE_LABELS[s].length).toBeGreaterThan(0);
    }
  });

  it('the target label and note say "recorded", never "revenue report"', () => {
    expect(PLAN_SOURCE_LABELS.recordedLastMonth).toContain('נרשמו');
    // the double-count caveat the owner required must be present
    expect(TARGET_SOURCE_NOTE).toContain('בשני המסלולים');
    expect(TARGET_SOURCE_NOTE).toContain('לא דוח כספי סופי');
  });

  it('the no-data sentence states the consequence plainly', () => {
    expect(NO_DATA_NOTE).toContain('ברירת מחדל');
  });

  it('hasDerivedValue is false only when every source is default', () => {
    expect(hasDerivedValue({ a: 'default', b: 'default' })).toBe(false);
    expect(hasDerivedValue({ a: 'default', b: 'acceptedQuotes' })).toBe(true);
    expect(hasDerivedValue(null)).toBe(false);
  });
});

// ---- isolation guard --------------------------------------------------------
// The helper must stay pure: no data layer, no ambient clock. This reads the
// SHIPPED source rather than trusting the comment at the top of it.
describe('planDefaults — isolation (read-only, deterministic)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(resolve(here, '../planDefaults.js'), 'utf8');
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');

  it('positive control: the stripped source still contains the deriver', () => {
    expect(code).toContain('export function derivePlanDefaults');
  });

  it('imports no data layer', () => {
    for (const forbidden of ['./api', './supabase', 'store.jsx', 'react']) {
      expect(code).not.toContain(forbidden);
    }
  });

  it('reads no ambient clock and no randomness', () => {
    expect(code).not.toContain('Date.now(');
    expect(code).not.toContain('Math.random(');
  });

  it('is a read-only module — it contains no mutation verb', () => {
    for (const forbidden of ['insert(', 'update(', 'upsert(', 'delete(', 'dispatch(', 'fetch(']) {
      expect(code).not.toContain(forbidden);
    }
  });
});

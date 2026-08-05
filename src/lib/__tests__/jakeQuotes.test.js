// ===================================================================
// Jake sees the quotes — `quotes` (already hydrated by api.fetchAll, rows AND
// their line items) reach Jake's CONTEXT, read-only, capped, with every absence
// and every malformed field staying truthful.
//
// THE GAP THIS FILE PINS. The only quote fact Jake ever received was the scalar
// `k.pendingQuotes` — a `.filter().length` from dashboardKpis. He could restate
// the number and answer nothing else: not whose quote, not how much, not which.
// Everything needed was already in memory; nothing passed it to him.
//
// These tests EXECUTE the shipped builder (artValuePack.buildContext) rather
// than pinning source text, matching the jakeCalendar / jakeCampaigns /
// jakeAssets precedent.
//
// NO network, NO model, NO Gateway, NO store, NO api.js.
// ===================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { artValuePack } from '../jakePack.js';
import { withBusinessBrain } from '../jakeBusinessContext.js';
import { AI_GATEWAY_INPUT_LIMITS } from '../aiGatewayInput.js';
import { dashboardKpis } from '../calc.js';

const ctx = (d) => artValuePack.buildContext(d);
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// Only the quote lines. The surrounding context legitimately contains "סה״כ —"
// (leads, assets, campaigns) and the word "הצעות מחיר" (the pre-existing tasks
// line), so scanning the whole context would pass or fail for the wrong reason.
const quoteSection = (text) => text.split('\n').filter((l) => l.startsWith('- הצעות מחיר')).join('\n');
// The DETAIL line alone — the roll-up header starts with the same prefix.
const detailLine = (text) => text.split('\n').find((l) => l.startsWith('- הצעות מחיר אחרונות')) || '';

// he-IL padding differs between ICU builds; derive the expectation the same way
// the builder does so the FIELD is pinned without pinning one runtime's zeros.
const HE_DATE = (v) => new Date(v).toLocaleDateString('he-IL');

// EXACTLY the shape api.fetchAll() returns.
function cloudData(extra = {}) {
  return {
    clients: [], quotes: [], transactions: [], outreachLeads: [], tasks: [],
    businessProfile: null, charges: [], payments: [],
    meta: { source: 'supabase' },
    ...extra,
  };
}

const client = (over = {}) => ({ id: 'c1', name: 'דנה כהן', status: 'active', value: 0, ...over });

// A rowToQuote()-shaped row with its client-side joined items.
const quote = (over = {}) => ({
  id: 'q1',
  number: 'Q-2026-014',
  clientId: 'c1',
  date: '2026-08-01',
  validDays: 30,
  vatRate: 18,
  status: 'sent',
  notes: 'הערה פנימית שאסור שתגיע לג׳ייק',
  items: [{ id: 'i1', desc: 'עיצוב לוגו', qty: 2, price: 1000 }],
  ...over,
});

const manyQuotes = (n, over = () => ({})) =>
  Array.from({ length: n }, (_, i) => quote({
    id: `q${i}`, number: `Q-${String(i).padStart(4, '0')}`, ...over(i),
  }));

// ---- presence & shape -----------------------------------------------------

describe('quotes — the detail reaches the context', () => {
  const text = ctx(cloudData({ clients: [client()], quotes: [quote()] }));

  it('emits a roll-up with the total count', () => {
    expect(quoteSection(text)).toContain('הצעות מחיר: 1 סה״כ');
  });

  it('names the number, the client, the total, the status and the date', () => {
    const line = detailLine(text);
    expect(line).toContain('Q-2026-014');
    expect(line).toContain('דנה כהן');
    expect(line).toContain('נשלחה');
    expect(line).toContain(HE_DATE('2026-08-01'));
  });

  it('states the VAT-inclusive total — 2 × 1000 + 18% = 2,360', () => {
    // Hand-computed, not read back from quoteTotal(), so a change to the math
    // fails here instead of agreeing with itself.
    expect(detailLine(text)).toMatch(/2,360/);
  });

  it('leaves the pre-existing pendingQuotes count line UNCHANGED', () => {
    expect(text).toContain('הצעות מחיר ממתינות: 1.');
  });

  it('breaks the statuses down in the header', () => {
    const t = ctx(cloudData({
      quotes: [
        quote({ id: 'a', status: 'draft' }), quote({ id: 'b', status: 'sent' }),
        quote({ id: 'c', status: 'viewed' }), quote({ id: 'd', status: 'accepted' }),
        quote({ id: 'e', status: 'rejected' }), quote({ id: 'f', status: 'rejected' }),
      ],
    }));
    const h = quoteSection(t);
    expect(h).toContain('6 סה״כ — 3 ממתינות (1 טיוטות, 1 נשלחו, 1 נצפו), 1 אושרו, 2 נדחו.');
  });
});

// ---- what must NEVER reach the prompt --------------------------------------

describe('quotes — the unbounded fields are EXCLUDED, not truncated', () => {
  const text = ctx(cloudData({
    clients: [client()],
    quotes: [quote({
      notes: 'ה'.repeat(400),
      items: [{ id: 'i1', desc: 'תיאור-שורה-סודי', qty: 1, price: 10 }],
    })],
  }));

  it('never emits the quote notes, at any truncation length', () => {
    expect(text).not.toContain('ה'.repeat(20));
  });

  it('never emits a line-item description', () => {
    expect(text).not.toContain('תיאור-שורה-סודי');
  });

  it('never emits the internal row id', () => {
    expect(detailLine(text)).not.toContain('q1');
  });
});

// ---- cap & ordering --------------------------------------------------------

describe('quotes — the cap', () => {
  it('at 6 prints all six and no overflow clause', () => {
    const t = ctx(cloudData({ quotes: manyQuotes(6) }));
    expect(detailLine(t)).toContain('Q-0005');
    expect(t).not.toContain('שאינן מפורטות כאן');
  });

  it('at 7 prints six and declares the remainder', () => {
    const t = ctx(cloudData({ quotes: manyQuotes(7) }));
    expect(detailLine(t)).toContain('ועוד 1 הצעות שאינן מפורטות כאן.');
    expect(detailLine(t)).not.toContain('Q-0006');
  });

  it('printed + hidden always reconciles with the header total', () => {
    for (const n of [1, 2, 5, 6, 7, 13, 60, 401]) {
      const t = ctx(cloudData({ quotes: manyQuotes(n) }));
      const printed = (detailLine(t).match(/Q-\d{4}/g) || []).length;
      const m = detailLine(t).match(/ועוד (\d+) הצעות שאינן מפורטות/);
      const hidden = m ? Number(m[1]) : 0;
      expect(printed + hidden).toBe(n);
      expect(quoteSection(t)).toContain(`הצעות מחיר: ${n} סה״כ`);
    }
  });
});

describe('quotes — pending first, array order preserved', () => {
  // 3 accepted FIRST in the array (they are the newest), then 4 pending.
  const data = cloudData({
    quotes: [
      ...manyQuotes(3, (i) => ({ id: `acc${i}`, number: `A-000${i}`, status: 'accepted' })),
      ...manyQuotes(4, (i) => ({ id: `pen${i}`, number: `P-000${i}`, status: 'sent' })),
    ],
  });
  const line = detailLine(ctx(data));

  it('puts every pending quote ahead of every non-pending one', () => {
    const order = (line.match(/[AP]-000\d/g) || []);
    expect(order.slice(0, 4)).toEqual(['P-0000', 'P-0001', 'P-0002', 'P-0003']);
    expect(order.slice(4)).toEqual(['A-0000', 'A-0001']); // cap 6 → 2 accepted fit
  });

  it('fills the cap with non-pending quotes once the pending ones are placed', () => {
    expect(line).toContain('A-0000');
    expect(line).toContain('ועוד 1 הצעות שאינן מפורטות כאן.');
  });

  it('preserves the array order and is NOT re-sorted by date', () => {
    // Blank / malformed / out-of-order dates must not move a row.
    const t = ctx(cloudData({
      quotes: [
        quote({ id: 'x', number: 'X-1', date: '', status: 'sent' }),
        quote({ id: 'y', number: 'Y-2', date: '2099-01-01', status: 'sent' }),
        quote({ id: 'z', number: 'Z-3', date: 'not-a-date', status: 'sent' }),
      ],
    }));
    expect(detailLine(t).match(/[XYZ]-\d/g)).toEqual(['X-1', 'Y-2', 'Z-3']);
  });
});

// ---- the two absences ------------------------------------------------------

describe('quotes — zero quotes is NOT the same as zero pending', () => {
  it('no quotes at all says so explicitly', () => {
    const t = ctx(cloudData({ quotes: [] }));
    expect(quoteSection(t)).toBe('- הצעות מחיר: אין הצעות מחיר בחשבון הזה.');
    expect(t).not.toContain('הצעות מחיר אחרונות');
  });

  it('quotes exist but none pending says THAT, and never the no-quotes sentence', () => {
    const t = ctx(cloudData({
      quotes: [quote({ id: 'a', status: 'accepted' }), quote({ id: 'b', status: 'rejected' })],
    }));
    expect(quoteSection(t)).toContain('2 סה״כ — אין הצעות ממתינות');
    expect(t).not.toContain('אין הצעות מחיר בחשבון הזה');
    // The ambiguous numeric form is what this slice removes.
    expect(quoteSection(t)).not.toContain('0 ממתינות');
  });

  it('a non-array quotes collection emits nothing at all — no fabricated absence', () => {
    // Unreachable in the shipped app (dashboardKpis would throw first); pinned
    // so a defensive path can never become a "not connected" falsehood.
    const t = artValuePack.buildContext({
      ...cloudData(), quotes: [], clients: [],
    });
    expect(t).toContain('אין הצעות מחיר בחשבון הזה');
    expect(t).not.toContain('הצעות מחיר: המודול אינו מחובר');
  });
});

// ---- malformed / missing fields -------------------------------------------

describe('quotes — an unavailable value is stated, never defaulted', () => {
  it('a quote with NO items array says the total is unavailable — never ₪0', () => {
    const t = ctx(cloudData({ quotes: [quote({ items: undefined })] }));
    expect(detailLine(t)).toContain('סכום לא זמין');
    expect(detailLine(t)).not.toContain('₪0');
  });

  it('a quote with an EMPTY items array is a real zero and says ₪0', () => {
    const t = ctx(cloudData({ quotes: [quote({ items: [] })] }));
    expect(detailLine(t)).toMatch(/₪\s?0/);
    expect(detailLine(t)).not.toContain('סכום לא זמין');
  });

  it('a clientId that resolves to no client is NOT reported as "no client"', () => {
    const t = ctx(cloudData({ clients: [], quotes: [quote({ clientId: 'ghost' })] }));
    expect(detailLine(t)).toContain('לקוח שאינו זמין כרגע');
    expect(detailLine(t)).not.toContain('ללא לקוח');
  });

  it('a null clientId IS reported as "no client"', () => {
    const t = ctx(cloudData({ clients: [client()], quotes: [quote({ clientId: null })] }));
    expect(detailLine(t)).toContain('ללא לקוח');
    expect(detailLine(t)).not.toContain('לקוח שאינו זמין כרגע');
  });

  it('a missing number says so', () => {
    const t = ctx(cloudData({ quotes: [quote({ number: '   ' })] }));
    expect(detailLine(t)).toContain('ללא מספר');
  });

  it('a missing or unparseable date says so', () => {
    for (const d of [null, '', 'לא תאריך']) {
      const t = ctx(cloudData({ quotes: [quote({ date: d })] }));
      expect(detailLine(t)).toContain('ללא תאריך');
    }
  });

  it('an unknown status is labelled, counted in the total, and in NO bucket', () => {
    const t = ctx(cloudData({
      quotes: [quote({ id: 'a', status: 'sent' }), quote({ id: 'b', status: 'expired' })],
    }));
    expect(detailLine(t)).toContain('סטטוס לא ידוע');
    expect(quoteSection(t)).toContain('2 סה״כ — 1 ממתינות');
    expect(quoteSection(t)).toContain('ועוד 1 בסטטוס לא ידוע (אינן נכללות בפילוח שלמעלה).');
  });

  // ⚠️ NO null-row test, and the reason is a PRE-EXISTING upstream limit rather
  // than an omission here. quoteLines() does filter(Boolean) and handles a null
  // row correctly, but nothing can observe that: artValueContext() calls
  // dashboardKpis() FIRST, and calc.js:131 dereferences `q.status` unguarded, so
  // a null row throws before this builder is reached. It is unreachable in the
  // shipped app — api.fetchAll() maps quotes through rowToQuote(), which cannot
  // yield null (unlike charges/payments, which are normalized AND filtered) — so
  // it is recorded, not fixed: hardening calc.js is a change to shared KPI code
  // for a state no data path produces, and it is out of this slice's boundary.

  it('caps a very long client name and a very long number', () => {
    const t = ctx(cloudData({
      clients: [client({ name: 'ל'.repeat(120) })],
      quotes: [quote({ number: 'Q'.repeat(80) })],
    }));
    expect(detailLine(t)).toContain('ל'.repeat(40));
    expect(detailLine(t)).not.toContain('ל'.repeat(41));
    expect(detailLine(t)).toContain('Q'.repeat(24));
    expect(detailLine(t)).not.toContain('Q'.repeat(25));
  });
});

// ---- the anti-drift control ------------------------------------------------

describe('quotes — the pending predicate cannot drift from dashboardKpis', () => {
  it('the header count equals k.pendingQuotes for every status mix', () => {
    const STATUSES = ['draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired'];
    for (let seed = 0; seed < 40; seed++) {
      const quotes = Array.from({ length: (seed % 9) + 1 }, (_, i) => quote({
        id: `q${i}`, status: STATUSES[(seed * 7 + i * 3) % STATUSES.length],
      }));
      const data = cloudData({ quotes });
      const expected = dashboardKpis(data).pendingQuotes;
      const section = quoteSection(ctx(data));
      if (expected === 0) expect(section).toContain('אין הצעות ממתינות');
      else expect(section).toContain(`— ${expected} ממתינות (`);
    }
  });
});

// ---- the budget: what actually stops Jake ----------------------------------

describe('quotes — the context budget', () => {
  const LIMIT = AI_GATEWAY_INPUT_LIMITS.MAX_CONTEXT_CHARS;

  // ⚠️ THERE IS NO ROW QUOTA ON public.quotes. campaigns caps at 200 and assets
  // at 40 in their INSERT policies; `quotes_own` carries ownership and nothing
  // else. So the "fits at the quota ceiling" proof used by jakeAssets.test.js
  // is unavailable here — there is no ceiling to build. The bound comes from
  // QUOTE_DETAIL_CAP, and the test below proves it holds by CONSTRUCTION.
  const heavy = (n) => cloudData({
    clients: Array.from({ length: 60 }, (_, i) => ({
      id: `c${i}`, name: `לקוח ${'א'.repeat(18)} ${i}`, status: i % 3 ? 'active' : 'lead',
      value: 12500, nextAction: 'א'.repeat(24),
    })),
    tasks: Array.from({ length: 80 }, (_, i) => ({ id: `t${i}`, title: `משימה ${'א'.repeat(20)} ${i}`, status: 'todo' })),
    outreachLeads: Array.from({ length: 50 }, (_, i) => ({ id: `l${i}`, name: `ליד ${i}`, status: 'pending' })),
    quotes: Array.from({ length: n }, (_, i) => quote({
      id: `q${i}`,
      number: 'Q'.repeat(40),
      clientId: `c${i % 60}`,
      status: ['draft', 'sent', 'viewed', 'accepted', 'rejected'][i % 5],
      items: [{ id: 'i', desc: 'א'.repeat(500), qty: 9999, price: 999999 }],
    })),
  });

  const full = (n) => withBusinessBrain(ctx(heavy(n)), 'אילו הצעות מחיר ממתינות?', {
    businessName: 'א'.repeat(60), industry: 'א'.repeat(40), audience: 'א'.repeat(200),
    services: Array.from({ length: 12 }, () => 'א'.repeat(60)),
  });

  it('fits with 200 max-length quotes on a heavy account plus the business brain', () => {
    expect(full(200).length).toBeLessThanOrEqual(LIMIT);
  });

  it('O(1) IN ROW COUNT — the property that stands in for the missing quota', () => {
    // 200 → 5,000 rows changes only the INTEGERS in the roll-up (total, pending
    // and the five buckets), never the number of detailed rows. A 25× row count
    // must therefore cost a couple of dozen characters, not 25× the section.
    // If this ever fails, the cap has stopped bounding the section and an
    // unbounded collection is being rendered into a prompt the Gateway REJECTS
    // rather than truncates.
    const a = ctx(heavy(200));
    const b = ctx(heavy(5000));
    // Count the DETAIL rows, not the separators: the line's own legend
    // ("מספר · לקוח · …") carries four of the same character.
    const rows = (t) => detailLine(t).split('; ').length;
    expect(rows(b)).toBe(rows(a));                    // identical DETAIL payload
    expect(rows(a)).toBe(6);                          // exactly the cap
    expect(b.length - a.length).toBeLessThan(50);     // digits only
    expect(b.length).toBeLessThanOrEqual(LIMIT);
  });

  it('regression floor: the quotes section costs under 900 chars at the cap', () => {
    // MEASURED on the heavy fixture (60 clients / 80 tasks / 50 leads / 200
    // campaigns / 40 assets, max-length numbers and 500-char item descriptions):
    //   zero quotes ...........................  4,766
    //   200 max-length quotes .................  5,464  (+698)
    //   5,000 quotes ..........................  5,478  (+712 — 14 extra digits)
    //   worst case, + the S0D business brain ..  6,416  (limit 12,000)
    // A jump past 900 means an excluded field came back — `items`, `notes` or an
    // uncapped name — so it fails here rather than as a Gateway REJECTION.
    const withQ = ctx(heavy(200)).length;
    const withoutQ = ctx({ ...heavy(200), quotes: [] }).length;
    expect(withQ - withoutQ).toBeLessThan(900);
  });
});

// ---- containment -----------------------------------------------------------

describe('quotes — read-only, and nothing else was touched', () => {
  const pack = read('../jakePack.js');

  it('adds NO Jake quote write op', () => {
    const agent = read('../jakeAgent.js');
    expect(agent).not.toContain('quoteLines');
  });

  it('does not read the store, the network or api.js', () => {
    expect(pack).not.toContain("from './api.js'");
  });

  it('the builder never touches quote notes or item descriptions', () => {
    const fn = pack.slice(pack.indexOf('function quoteLines'), pack.indexOf('// Context builder'));
    expect(fn).not.toContain('.notes');
    expect(fn).not.toContain('.desc');
  });
});

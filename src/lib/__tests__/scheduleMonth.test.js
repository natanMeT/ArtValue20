import { describe, it, expect } from 'vitest';
import { monthWindow, monthMatrix, listToday, WEEKDAY_LABELS } from '../schedule.js';

// ===================================================================
// Schedule slice 2 — the month grid, the pure half.
//
// Kept in its own file, like the other per-slice suites, so the slice-1
// boundary suite stays exactly what it was.
//
// EVERY test injects `now`; src/lib/schedule.js still reads no clock. Instants
// are built with `new Date(y, m, d, hh, mm)` — LOCAL wall time, the same
// construction toInstant uses — so these are correct in any timezone the suite
// runs in, including CI in UTC.
//
// A NOTE ON THE DST TESTS, SO THEY ARE NOT READ AS MORE THAN THEY ARE.
// Vitest cannot switch the process timezone per test and CI runs in UTC, which
// has NO transition — a test naming one date could pass in CI while proving
// nothing. So instead of naming a transition, these assert the PROPERTY a DST
// bug breaks: consecutive cells are consecutive CIVIL days, and a month
// contributes exactly its own day count — swept across EVERY month of a year
// plus a leap February. In a zone with transitions (Asia/Jerusalem, this
// business's zone) that sweep necessarily crosses both; in UTC it degrades to a
// correctness check rather than a DST check. Stated rather than claimed.
// ===================================================================

const local = (y, m, d, hh = 0, mm = 0) => new Date(y, m - 1, d, hh, mm, 0, 0);
const iso = (...args) => local(...args).toISOString();

const appt = (over = {}) => ({
  id: over.id || 'a1',
  userId: 'u1',
  kind: 'appointment',
  title: 'T',
  status: 'planned',
  startAt: over.startAt || iso(2026, 8, 3, 10, 0),
  endAt: 'endAt' in over ? over.endAt : null,
  clientId: null,
  taskId: null,
  notes: null,
  ...over,
});

const at = (id, y, m, d, hh = 10, over = {}) => appt({ id, startAt: iso(y, m, d, hh, 0), ...over });

const flat = (grid) => grid.weeks.flat();
const allKeys = (grid) => flat(grid).map((c) => c.day);
const allItemIds = (grid) => flat(grid).flatMap((c) => c.items.map((a) => a.id));
const cellFor = (grid, day) => flat(grid).find((c) => c.day === day);
const inMonthCount = (grid) => flat(grid).filter((c) => c.inMonth).length;
const civil = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('monthWindow', () => {
  it('is the half-open local calendar month', () => {
    const w = monthWindow(local(2026, 8, 17, 13, 0));
    expect(w.start.getTime()).toBe(local(2026, 8, 1).getTime());
    expect(w.end.getTime()).toBe(local(2026, 9, 1).getTime());
  });

  it('rolls the YEAR forward from December and back from January', () => {
    expect(monthWindow(local(2026, 12, 10), 1).start.getTime()).toBe(local(2027, 1, 1).getTime());
    expect(monthWindow(local(2026, 1, 10), -1).start.getTime()).toBe(local(2025, 12, 1).getTime());
  });

  it('returns null for an unusable reference rather than an Invalid Date', () => {
    expect(monthWindow(new Date('nope'))).toBeNull();
    expect(monthMatrix([], new Date('nope'))).toBeNull();
  });
});

describe('monthMatrix — shape', () => {
  it('the weekday labels are Sunday-first and are NOT reversed for RTL', () => {
    // RIGHT-to-left column order is the document's dir="rtl". Reversing the
    // array as well would flip twice and land Sunday on the left.
    expect(WEEKDAY_LABELS).toEqual(['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']);
  });

  it('every row holds exactly 7 cells, Sunday through Saturday', () => {
    for (let m = 1; m <= 12; m += 1) {
      const grid = monthMatrix([], local(2026, m, 1));
      for (const week of grid.weeks) {
        expect(week).toHaveLength(7);
        expect(local(...week[0].day.split('-').map(Number)).getDay()).toBe(0);
        expect(local(...week[6].day.split('-').map(Number)).getDay()).toBe(6);
      }
    }
  });

  it('contributes exactly the month’s own days, each once, in consecutive CIVIL order', () => {
    const cases = [...Array(12)].map((_, i) => [2026, i + 1]).concat([[2028, 2]]);
    for (const [y, m] of cases) {
      const grid = monthMatrix([], local(y, m, 1));
      const days = allKeys(grid);
      expect(new Set(days).size).toBe(days.length);
      expect(inMonthCount(grid)).toBe(new Date(y, m, 0).getDate());
      for (let i = 1; i < days.length; i += 1) {
        const prev = local(...days[i - 1].split('-').map(Number));
        const expected = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1);
        expect(days[i]).toBe(civil(expected));
      }
    }
  });

  it('February 2028 is a leap February — 29 in-month days', () => {
    expect(inMonthCount(monthMatrix([], local(2028, 2, 10)))).toBe(29);
  });

  it('a month starting on Saturday needs SIX rows — the tall case the layout must fit', () => {
    // 2026-08-01 is a Saturday: 6 leading cells + 31 days = 37 -> 6 rows.
    const grid = monthMatrix([], local(2026, 8, 1));
    expect(grid.weeks).toHaveLength(6);
    expect(grid.label).toBe('אוגוסט 2026');
  });

  it('marks today, and only today', () => {
    const flagged = flat(monthMatrix([], local(2026, 8, 17, 9, 0))).filter((c) => c.isToday);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].day).toBe('2026-08-17');
  });
});

describe('monthMatrix — placement', () => {
  it('places an appointment in the cell of its startAt', () => {
    const grid = monthMatrix([at('x', 2026, 8, 17)], local(2026, 8, 1));
    expect(cellFor(grid, '2026-08-17').items.map((a) => a.id)).toEqual(['x']);
  });

  it('an appointment whose endAt crosses MIDNIGHT stays on its START day, once', () => {
    const grid = monthMatrix(
      [at('x', 2026, 8, 17, 23, { endAt: iso(2026, 8, 18, 1, 0) })],
      local(2026, 8, 1),
    );
    expect(allItemIds(grid)).toEqual(['x']);
    expect(cellFor(grid, '2026-08-18').items).toHaveLength(0);
  });

  it('an appointment whose endAt crosses the MONTH stays on its start day, once', () => {
    const grid = monthMatrix(
      [at('x', 2026, 8, 31, 22, { endAt: iso(2026, 9, 1, 2, 0) })],
      local(2026, 8, 1),
    );
    expect(allItemIds(grid)).toEqual(['x']);
    expect(cellFor(grid, '2026-08-31').items.map((a) => a.id)).toEqual(['x']);
  });

  it('a NEXT-month appointment shows in the trailing OUTSIDE cell — once, not a false empty', () => {
    const grid = monthMatrix([at('x', 2026, 9, 1)], local(2026, 8, 1));
    const cell = cellFor(grid, '2026-09-01');
    expect(cell.inMonth).toBe(false);
    expect(cell.items.map((a) => a.id)).toEqual(['x']);
    expect(allItemIds(grid)).toEqual(['x']);
  });

  it('a PREVIOUS-month appointment shows in the leading outside cell', () => {
    // August 2026 starts on a Saturday, so the whole of 26–31 July leads it.
    const grid = monthMatrix([at('x', 2026, 7, 30)], local(2026, 8, 1));
    expect(cellFor(grid, '2026-07-30').inMonth).toBe(false);
    expect(allItemIds(grid)).toEqual(['x']);
  });

  it('midnight belongs to the day that is STARTING — the same rule as the lists', () => {
    const grid = monthMatrix([at('x', 2026, 8, 17, 0)], local(2026, 8, 1));
    expect(cellFor(grid, '2026-08-17').items).toHaveLength(1);
    expect(cellFor(grid, '2026-08-16').items).toHaveLength(0);
  });

  it('shows EVERY status — unlike listToday / listWeek, which are agendas', () => {
    const now = local(2026, 8, 17, 9, 0);
    const rows = [
      at('p', 2026, 8, 17, 10),
      at('c', 2026, 8, 17, 11, { status: 'cancelled' }),
      at('d', 2026, 8, 17, 12, { status: 'completed' }),
      at('n', 2026, 8, 17, 13, { status: 'no_show' }),
    ];
    expect(cellFor(monthMatrix(rows, now), '2026-08-17').items.map((a) => a.id))
      .toEqual(['p', 'c', 'd', 'n']);
    expect(listToday(rows, now).map((a) => a.id)).toEqual(['p']);
  });

  it('orders the items inside a cell by start time', () => {
    const grid = monthMatrix(
      [at('late', 2026, 8, 17, 16), at('early', 2026, 8, 17, 8)],
      local(2026, 8, 1),
    );
    expect(cellFor(grid, '2026-08-17').items.map((a) => a.id)).toEqual(['early', 'late']);
  });

  it('survives unusable rows instead of creating a phantom cell', () => {
    const grid = monthMatrix(
      [null, { id: 'bad', startAt: 'not-a-date' }, at('ok', 2026, 8, 17)],
      local(2026, 8, 1),
    );
    expect(allItemIds(grid)).toEqual(['ok']);
  });

  it('an offset month reads its OWN rows — the grid is a pure view over ONE fetch', () => {
    const rows = [at('aug', 2026, 8, 17), at('sep', 2026, 9, 17)];
    expect(cellFor(monthMatrix(rows, local(2026, 8, 1), 0), '2026-09-17')).toBeUndefined();
    expect(cellFor(monthMatrix(rows, local(2026, 8, 1), 1), '2026-09-17').items.map((a) => a.id))
      .toEqual(['sep']);
  });
});

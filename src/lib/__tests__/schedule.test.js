import { describe, it, expect } from 'vitest';
import {
  APPOINTMENT_KINDS, APPOINTMENT_STATUSES, OPEN_STATUSES, SCHEDULE_LIMITS,
  toInstant, splitInstant, dayKey, timeLabel, formatTimeRange,
  localDayWindow, withinWindow,
  validateAppointment, normalizeAppointmentRow,
  sortByStart, listToday, listWeek, listInDays, groupByDay,
  findOverlapIds, scheduleCounts,
} from '../schedule.js';

// ===================================================================
// Schedule Core slice 1 — the pure boundary.
//
// EVERY test here injects `now`. src/lib/schedule.js reads no clock, and that
// is the property that makes midnight, month-end and week-boundary behaviour
// testable at all rather than dependent on when the suite happens to run.
//
// Instants are constructed with `new Date(y, m, d, hh, mm)` — LOCAL wall time,
// the same construction toInstant uses — so these tests are correct in any
// timezone the suite runs in, including CI in UTC.
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

describe('vocabularies mirror the CHECK constraints', () => {
  it('kinds are exactly the three approved values', () => {
    expect([...APPOINTMENT_KINDS]).toEqual(['appointment', 'lesson', 'event']);
  });

  it('statuses are exactly the four approved values', () => {
    expect([...APPOINTMENT_STATUSES]).toEqual(['planned', 'completed', 'cancelled', 'no_show']);
  });

  it('only `planned` counts as agenda — history is not agenda', () => {
    expect([...OPEN_STATUSES]).toEqual(['planned']);
  });

  it('bounds mirror appointments_title_bounded / appointments_notes_bounded', () => {
    expect(SCHEDULE_LIMITS).toEqual({ title: 160, notes: 2000 });
  });
});

describe('toInstant — wall clock in, absolute instant out', () => {
  it('interprets date + time in the LOCAL zone', () => {
    expect(toInstant('2026-08-03', '10:30')).toBe(iso(2026, 8, 3, 10, 30));
  });

  it('a missing time means midnight, not "now"', () => {
    expect(toInstant('2026-08-03', '')).toBe(iso(2026, 8, 3, 0, 0));
  });

  it('refuses a malformed date or time instead of returning an Invalid Date', () => {
    expect(toInstant('03/08/2026', '10:30')).toBe('');
    expect(toInstant('2026-08-03', '10.30')).toBe('');
    expect(toInstant('', '10:30')).toBe('');
    expect(toInstant(null, null)).toBe('');
  });

  it('refuses out-of-range components rather than silently wrapping', () => {
    expect(toInstant('2026-13-01', '10:00')).toBe('');
    expect(toInstant('2026-08-03', '24:00')).toBe('');
    expect(toInstant('2026-08-03', '10:60')).toBe('');
  });

  // NEGATIVE CONTROL for the civil-date guard. Without the getFullYear/
  // getMonth/getDate re-check, `new Date(2026, 1, 30)` rolls forward to 2 March
  // and the function would return a valid-looking instant for a date that does
  // not exist.
  it('refuses an impossible civil date instead of rolling it forward', () => {
    expect(toInstant('2026-02-30', '09:00')).toBe('');
    expect(toInstant('2026-02-28', '09:00')).toBe(iso(2026, 2, 28, 9, 0));
  });
});

describe('splitInstant — the exact inverse, so a re-save cannot move anything', () => {
  it('round-trips date + time', () => {
    const i = toInstant('2026-08-03', '10:30');
    expect(splitInstant(i)).toEqual({ date: '2026-08-03', time: '10:30' });
  });

  it('pads single-digit months, days, hours and minutes', () => {
    expect(splitInstant(iso(2026, 1, 2, 3, 4))).toEqual({ date: '2026-01-02', time: '03:04' });
  });

  it('returns empty strings for an unparseable instant', () => {
    expect(splitInstant('not-a-date')).toEqual({ date: '', time: '' });
    expect(splitInstant(null)).toEqual({ date: '', time: '' });
  });

  it('dayKey and timeLabel are the two halves of it', () => {
    const i = iso(2026, 8, 3, 10, 30);
    expect(dayKey(i)).toBe('2026-08-03');
    expect(timeLabel(i)).toBe('10:30');
  });
});

describe('formatTimeRange — an open-ended appointment is not a half range', () => {
  it('renders a range when there is an end', () => {
    expect(formatTimeRange(iso(2026, 8, 3, 10, 0), iso(2026, 8, 3, 11, 15))).toBe('10:00–11:15');
  });

  it('renders the start ALONE when there is no end', () => {
    expect(formatTimeRange(iso(2026, 8, 3, 10, 0), null)).toBe('10:00');
    expect(formatTimeRange(iso(2026, 8, 3, 10, 0), '')).toBe('10:00');
  });

  it('renders nothing at all for an unparseable start', () => {
    expect(formatTimeRange('nope', null)).toBe('');
  });
});

describe('localDayWindow — half-open, so midnight belongs to exactly one day', () => {
  it('a one-day window is [today 00:00, tomorrow 00:00)', () => {
    const w = localDayWindow(local(2026, 8, 3, 15, 45), 1);
    expect(w.start.getTime()).toBe(local(2026, 8, 3, 0, 0).getTime());
    expect(w.end.getTime()).toBe(local(2026, 8, 4, 0, 0).getTime());
  });

  it('includes its own midnight and EXCLUDES the next one', () => {
    const w = localDayWindow(local(2026, 8, 3, 12, 0), 1);
    expect(withinWindow(iso(2026, 8, 3, 0, 0), w)).toBe(true);
    expect(withinWindow(iso(2026, 8, 4, 0, 0), w)).toBe(false);
    expect(withinWindow(iso(2026, 8, 3, 23, 59), w)).toBe(true);
  });

  it('crosses a month boundary correctly', () => {
    const w = localDayWindow(local(2026, 8, 31, 9, 0), 7);
    expect(w.end.getTime()).toBe(local(2026, 9, 7, 0, 0).getTime());
    expect(withinWindow(iso(2026, 9, 6, 23, 0), w)).toBe(true);
    expect(withinWindow(iso(2026, 9, 7, 0, 1), w)).toBe(false);
  });

  it('crosses a year boundary correctly', () => {
    const w = localDayWindow(local(2026, 12, 30, 9, 0), 7);
    expect(w.end.getTime()).toBe(local(2027, 1, 6, 0, 0).getTime());
  });

  it('a bad `now` yields no window rather than a wrong one', () => {
    expect(localDayWindow(new Date('nope'), 1)).toBe(null);
    expect(withinWindow(iso(2026, 8, 3, 10, 0), null)).toBe(false);
  });
});

describe('validateAppointment — every rule mirrors a server constraint', () => {
  const base = { title: 'שיעור', date: '2026-08-03', startTime: '10:00' };

  it('accepts the minimum viable payload and normalizes it', () => {
    const v = validateAppointment(base);
    expect(v.ok).toBe(true);
    expect(v.value).toMatchObject({
      kind: 'appointment', title: 'שיעור', status: 'planned',
      startAt: iso(2026, 8, 3, 10, 0), endAt: null,
      clientId: null, taskId: null, notes: null,
    });
  });

  it('refuses a blank or whitespace-only title (appointments_title_bounded)', () => {
    expect(validateAppointment({ ...base, title: '' }).ok).toBe(false);
    expect(validateAppointment({ ...base, title: '   ' }).ok).toBe(false);
  });

  it('refuses a title over the bound, and accepts one exactly at it', () => {
    expect(validateAppointment({ ...base, title: 'x'.repeat(161) }).ok).toBe(false);
    expect(validateAppointment({ ...base, title: 'x'.repeat(160) }).ok).toBe(true);
  });

  it('refuses notes over the bound, and accepts exactly at it', () => {
    expect(validateAppointment({ ...base, notes: 'x'.repeat(2001) }).ok).toBe(false);
    expect(validateAppointment({ ...base, notes: 'x'.repeat(2000) }).ok).toBe(true);
  });

  it('refuses an unknown kind (appointments_kind_allowed)', () => {
    expect(validateAppointment({ ...base, kind: 'class' }).ok).toBe(false);
    expect(validateAppointment({ ...base, kind: 'lesson' }).ok).toBe(true);
  });

  it('refuses an unknown status (appointments_status_allowed)', () => {
    expect(validateAppointment({ ...base, status: 'maybe' }).ok).toBe(false);
    expect(validateAppointment({ ...base, status: 'no_show' }).ok).toBe(true);
  });

  it('refuses a missing start', () => {
    expect(validateAppointment({ title: 'x' }).ok).toBe(false);
    expect(validateAppointment({ ...base, startTime: '' , date: '' }).ok).toBe(false);
  });

  // NEGATIVE CONTROL for the ordering rule — this is the client mirror of
  // appointments_time_order (23514).
  it('refuses an end that is not strictly after the start', () => {
    expect(validateAppointment({ ...base, endTime: '10:00' }).ok).toBe(false);
    expect(validateAppointment({ ...base, endTime: '09:59' }).ok).toBe(false);
    expect(validateAppointment({ ...base, endTime: '10:01' }).ok).toBe(true);
  });

  it('an ABSENT end is fine — it is a real state, not a missing value', () => {
    const v = validateAppointment({ ...base, endTime: '' });
    expect(v.ok).toBe(true);
    expect(v.value.endAt).toBe(null);
  });

  it('refuses a malformed end time rather than dropping it silently', () => {
    const v = validateAppointment({ ...base, endTime: '25:00' });
    expect(v.ok).toBe(false);
  });

  it('accepts a pre-normalized payload (startAt/endAt) by the same rules', () => {
    expect(validateAppointment({
      title: 'x', startAt: iso(2026, 8, 3, 10, 0), endAt: iso(2026, 8, 3, 9, 0),
    }).ok).toBe(false);
    expect(validateAppointment({
      title: 'x', startAt: iso(2026, 8, 3, 10, 0), endAt: iso(2026, 8, 3, 11, 0),
    }).ok).toBe(true);
  });

  it('reports errors in Hebrew and never quotes a PostgreSQL message', () => {
    const v = validateAppointment({ ...base, title: '' });
    expect(v.errors.length).toBeGreaterThan(0);
    for (const e of v.errors) {
      expect(e).not.toMatch(/23514|23503|violates|constraint|relation|null value/i);
    }
  });
});

describe('normalizeAppointmentRow — a malformed row is dropped, not half-rendered', () => {
  const row = {
    id: 'a1', user_id: 'u1', kind: 'lesson', title: 'שיעור', status: 'planned',
    start_at: iso(2026, 8, 3, 10, 0), end_at: null, client_id: null, task_id: null,
    notes: null, created_at: 'c', updated_at: 'u',
  };

  it('maps snake_case to the canonical camelCase shape', () => {
    expect(normalizeAppointmentRow(row)).toMatchObject({
      id: 'a1', userId: 'u1', kind: 'lesson', title: 'שיעור',
      status: 'planned', endAt: null, clientId: null, taskId: null,
    });
  });

  it('keeps the optional links when present', () => {
    const r = normalizeAppointmentRow({ ...row, client_id: 'c1', task_id: 'tk_1' });
    expect(r.clientId).toBe('c1');
    expect(r.taskId).toBe('tk_1');
  });

  for (const missing of ['id', 'user_id', 'title', 'start_at']) {
    it(`drops a row missing ${missing}`, () => {
      expect(normalizeAppointmentRow({ ...row, [missing]: '' })).toBe(null);
    });
  }

  it('drops a row with an unknown kind or status', () => {
    expect(normalizeAppointmentRow({ ...row, kind: 'class' })).toBe(null);
    expect(normalizeAppointmentRow({ ...row, status: 'maybe' })).toBe(null);
  });

  it('drops a non-object', () => {
    expect(normalizeAppointmentRow(null)).toBe(null);
    expect(normalizeAppointmentRow('x')).toBe(null);
  });
});

describe('lists — today / week / all, with `now` injected', () => {
  const now = local(2026, 8, 3, 12, 0);
  const items = [
    appt({ id: 'today-late', startAt: iso(2026, 8, 3, 18, 0) }),
    appt({ id: 'today-early', startAt: iso(2026, 8, 3, 8, 0) }),
    appt({ id: 'yesterday', startAt: iso(2026, 8, 2, 10, 0) }),
    appt({ id: 'in-6-days', startAt: iso(2026, 8, 9, 10, 0) }),
    appt({ id: 'in-7-days', startAt: iso(2026, 8, 10, 10, 0) }),
    appt({ id: 'cancelled-today', startAt: iso(2026, 8, 3, 9, 0), status: 'cancelled' }),
  ];

  it('sorts earliest first', () => {
    expect(sortByStart(items).map((a) => a.id)[0]).toBe('yesterday');
  });

  it('today = this local day only, planned only, in time order', () => {
    expect(listToday(items, now).map((a) => a.id)).toEqual(['today-early', 'today-late']);
  });

  it('the week window is 7 days STARTING today — day 7 is outside it', () => {
    const ids = listWeek(items, now).map((a) => a.id);
    expect(ids).toContain('in-6-days');
    expect(ids).not.toContain('in-7-days');
    expect(ids).not.toContain('yesterday');
  });

  // NEGATIVE CONTROL for the openOnly filter.
  it('drops non-planned rows from the agenda, but can be asked for them', () => {
    expect(listToday(items, now).map((a) => a.id)).not.toContain('cancelled-today');
    expect(listToday(items, now, false).map((a) => a.id)).toContain('cancelled-today');
  });

  it('returns [] rather than throwing on rubbish input', () => {
    expect(listInDays(null, now)).toEqual([]);
    expect(listInDays(items, new Date('nope'))).toEqual([]);
    expect(listInDays([null, undefined], now)).toEqual([]);
  });

  it('groups into local calendar days, in order, each internally sorted', () => {
    const g = groupByDay(items);
    expect(g.map((x) => x.day)).toEqual(['2026-08-02', '2026-08-03', '2026-08-09', '2026-08-10']);
    expect(g[1].items.map((a) => a.id)).toEqual(['today-early', 'cancelled-today', 'today-late']);
  });

  it('counts what the KPI strip shows', () => {
    // week = today-early + today-late + in-6-days. `cancelled-today` is not
    // agenda, `yesterday` is past, `in-7-days` is outside the half-open window.
    expect(scheduleCounts(items, now)).toEqual({ today: 2, week: 3, planned: 5, total: 6 });
  });
});

describe('findOverlapIds — shown, never refused (migration L2)', () => {
  const A = iso(2026, 8, 3, 10, 0);

  it('flags two appointments whose ranges intersect', () => {
    const hits = findOverlapIds([
      appt({ id: 'x', startAt: A, endAt: iso(2026, 8, 3, 11, 0) }),
      appt({ id: 'y', startAt: iso(2026, 8, 3, 10, 30), endAt: iso(2026, 8, 3, 11, 30) }),
    ]);
    expect([...hits].sort()).toEqual(['x', 'y']);
  });

  it('does NOT flag back-to-back appointments — touching is not overlapping', () => {
    const hits = findOverlapIds([
      appt({ id: 'x', startAt: A, endAt: iso(2026, 8, 3, 11, 0) }),
      appt({ id: 'y', startAt: iso(2026, 8, 3, 11, 0), endAt: iso(2026, 8, 3, 12, 0) }),
    ]);
    expect(hits.size).toBe(0);
  });

  it('does NOT flag appointments on different days', () => {
    const hits = findOverlapIds([
      appt({ id: 'x', startAt: A, endAt: iso(2026, 8, 3, 11, 0) }),
      appt({ id: 'y', startAt: iso(2026, 8, 4, 10, 0), endAt: iso(2026, 8, 4, 11, 0) }),
    ]);
    expect(hits.size).toBe(0);
  });

  it('an open-ended appointment has no extent — it collides only at the same instant', () => {
    expect(findOverlapIds([
      appt({ id: 'x', startAt: A, endAt: null }),
      appt({ id: 'y', startAt: iso(2026, 8, 3, 10, 30), endAt: null }),
    ]).size).toBe(0);
    expect([...findOverlapIds([
      appt({ id: 'x', startAt: A, endAt: null }),
      appt({ id: 'y', startAt: A, endAt: null }),
    ])].sort()).toEqual(['x', 'y']);
  });

  it('ignores cancelled / completed rows — history cannot double-book', () => {
    const hits = findOverlapIds([
      appt({ id: 'x', startAt: A, endAt: iso(2026, 8, 3, 11, 0) }),
      appt({ id: 'y', startAt: A, endAt: iso(2026, 8, 3, 11, 0), status: 'cancelled' }),
    ]);
    expect(hits.size).toBe(0);
  });
});

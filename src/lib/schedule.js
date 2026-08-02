// ===================================================================
// schedule — the SINGLE pure boundary for Schedule Core (slice 1).
//
// WHAT AN APPOINTMENT IS: one scheduled occurrence — a meeting, a lesson or an
// event — with a start INSTANT, an optional end instant, an outcome status, and
// optional links to a client and to a task.
//
// NAMING BOUNDARY — READ THIS BEFORE EXTENDING ANYTHING HERE.
//   This module owns `public.appointments`: durable, per-account, one row per
//   real occurrence. It is NOT the Growth OS MONTHLY ACTION CALENDAR
//   (`src/data/growthCalendar.js`, `/growth/calendar`), which is a pure
//   PLANNING model that turns an income target into a suggested weekly activity
//   volume and stores NOTHING. Same English word, two different lifetimes.
//   This file MUST NOT import from `src/data/growthCalendar.js` or from
//   `src/pages/growth/**`, and nothing there may import this file. Campaigns
//   slice 1 recorded this exact defect class; the mitigation is the same —
//   separate vocabulary, pinned by a test.
//
// TIME IS AN INSTANT, NOT A DATE.
//   Every existing date in this product is a `date` with no time of day
//   (tasks.deadline, clients.next_action_date, charges.service_date, …).
//   start_at / end_at are `timestamptz` — absolute instants, stored in UTC.
//   The form collects a wall-clock date + time, and `toInstant` interprets it in
//   the RUNTIME'S LOCAL ZONE (Asia/Jerusalem for this business). There is no
//   timezone field anywhere in this slice: a second copy of "which zone is
//   this?" is exactly the kind of duplicated rule that drifts.
//
// NO CLOCK INSIDE THIS MODULE. Every function that needs "now" takes it as an
// argument. A module that reads the clock cannot be tested for the boundary
// cases that matter here (midnight, month end, the last day of the week).
//
// Pure + dependency-free: NO store, NO network, NO React, NO Supabase,
// NO clock, NO randomness. Mirrors the receivables.js / campaigns.js /
// assetLibrary.js precedent.
//
// AUTHORITY. Every rule here is a CLIENT-SIDE MIRROR of a server rule, kept so
// the user gets a truthful message instead of an opaque failure. The server is
// authoritative in every case:
//   * kind domain            -> appointments_kind_allowed        (23514)
//   * status domain          -> appointments_status_allowed      (23514)
//   * end after start        -> appointments_time_order          (23514)
//   * title 1..160 / notes   -> appointments_title_bounded, appointments_notes_bounded
//   * ownership              -> RLS, four policies
//   * same-owner client link -> appointments_client_same_owner_fk (23503)
//   * same-owner task link   -> appointments_task_same_owner_fk   (23503)
// When the two disagree, the SERVER wins and its refusal is surfaced as a
// failure. This file never decides that a write succeeded.
// ===================================================================

// ---------------- vocabularies (frozen, mirroring the CHECK constraints) ----

export const APPOINTMENT_KINDS = Object.freeze(['appointment', 'lesson', 'event']);

export const APPOINTMENT_KIND_LABELS = Object.freeze({
  appointment: 'תור',
  lesson: 'שיעור',
  event: 'אירוע',
});

export const APPOINTMENT_STATUSES = Object.freeze(['planned', 'completed', 'cancelled', 'no_show']);

export const APPOINTMENT_STATUS_LABELS = Object.freeze({
  planned: 'מתוכנן',
  completed: 'התקיים',
  cancelled: 'בוטל',
  no_show: 'לא הגיע',
});

// Badge classes reused from the existing design system (no new CSS).
export const APPOINTMENT_STATUS_CLASS = Object.freeze({
  planned: 'badge-payment',
  completed: 'badge-completed',
  cancelled: 'badge-lost',
  no_show: 'badge-lost',
});

/**
 * The statuses that still describe something the business is expecting.
 * `planned` alone: a cancelled or finished occurrence is history, not agenda.
 */
export const OPEN_STATUSES = Object.freeze(['planned']);

/** Mirrors appointments_title_bounded / appointments_notes_bounded. */
export const SCHEDULE_LIMITS = Object.freeze({ title: 160, notes: 2000 });

// ---------------- small helpers ----------------

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const pad2 = (n) => String(n).padStart(2, '0');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/**
 * A wall-clock date + time, interpreted in the RUNTIME'S LOCAL ZONE, as an ISO
 * instant. Returns '' for anything unparseable rather than an Invalid Date,
 * so a malformed field can never travel further as a Date object that only
 * fails later.
 *
 * Deliberately NOT `new Date('2026-08-03T10:30')`: that form is
 * implementation-defined across engines for strings without a zone. Building
 * from numeric parts is unambiguous — local by construction.
 */
export function toInstant(dateStr, timeStr) {
  const d = str(dateStr);
  const t = str(timeStr) || '00:00';
  if (!DATE_RE.test(d) || !TIME_RE.test(t)) return '';
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  if (m < 1 || m > 12 || day < 1 || day > 31 || hh > 23 || mm > 59) return '';
  const dt = new Date(y, m - 1, day, hh, mm, 0, 0);
  // Rejects impossible civil dates (2026-02-30 rolls forward to March).
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== day) return '';
  return dt.toISOString();
}

/**
 * The inverse of toInstant: an ISO instant -> the local { date, time } the form
 * edits. Round-trips exactly, so opening and re-saving an appointment without
 * touching it cannot move it.
 */
export function splitInstant(iso) {
  const dt = new Date(str(iso));
  if (Number.isNaN(dt.getTime())) return { date: '', time: '' };
  return {
    date: `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`,
    time: `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`,
  };
}

/** Local calendar day of an instant, as 'YYYY-MM-DD'. '' when unparseable. */
export function dayKey(iso) {
  return splitInstant(iso).date;
}

/** Local 'HH:MM' of an instant. '' when unparseable. */
export function timeLabel(iso) {
  return splitInstant(iso).time;
}

/**
 * 'HH:MM–HH:MM', or just 'HH:MM' when there is no stated end. An open-ended
 * appointment is ordinary (end_at is nullable) and must not render as a range
 * with a blank side.
 */
export function formatTimeRange(startIso, endIso) {
  const a = timeLabel(startIso);
  if (!a) return '';
  const b = timeLabel(endIso);
  return b ? `${a}–${b}` : a;
}

/** Midnight (local) at the start of the day containing `ref`. */
function startOfLocalDay(ref) {
  const dt = new Date(ref);
  if (Number.isNaN(dt.getTime())) return null;
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0, 0);
}

/**
 * The half-open window [start, end) covering `days` local calendar days
 * beginning with the day containing `now`. `days = 1` is today.
 *
 * Half-open on purpose: an appointment at exactly midnight belongs to the day
 * that is starting, never to both days or to neither.
 */
export function localDayWindow(now, days = 1) {
  const start = startOfLocalDay(now);
  if (!start) return null;
  const n = Number.isFinite(days) && days >= 1 ? Math.floor(days) : 1;
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + n, 0, 0, 0, 0);
  return { start, end };
}

/** True when `iso` falls inside the half-open window. */
export function withinWindow(iso, window) {
  if (!window) return false;
  const t = new Date(str(iso)).getTime();
  if (Number.isNaN(t)) return false;
  return t >= window.start.getTime() && t < window.end.getTime();
}

// ---------------- validation ----------------

/**
 * Validate ONE appointment payload. Returns { ok, errors, value } — `value` is
 * the normalized payload the api layer writes, and is present only when ok.
 *
 * Every rule mirrors a server constraint (see the AUTHORITY note at the top).
 * Errors are Hebrew and user-facing; they never quote a PostgreSQL message.
 */
export function validateAppointment(input) {
  const errors = [];
  const src = input && typeof input === 'object' ? input : {};

  const title = str(src.title);
  if (!title) errors.push('צריך למלא כותרת.');
  else if (title.length > SCHEDULE_LIMITS.title) {
    errors.push(`הכותרת ארוכה מדי (עד ${SCHEDULE_LIMITS.title} תווים).`);
  }

  const kind = str(src.kind) || 'appointment';
  if (!APPOINTMENT_KINDS.includes(kind)) errors.push('סוג הרישום אינו מוכר.');

  const status = str(src.status) || 'planned';
  if (!APPOINTMENT_STATUSES.includes(status)) errors.push('הסטטוס אינו מוכר.');

  // The form supplies date + time separately; an already-normalized payload may
  // supply startAt directly. Both paths converge here, so neither can bypass
  // the ordering rule below.
  const startAt = str(src.startAt) || toInstant(src.date, src.startTime);
  if (!startAt) errors.push('צריך למלא תאריך ושעת התחלה.');

  const hasEnd = !!(str(src.endAt) || str(src.endTime));
  const endAt = hasEnd ? (str(src.endAt) || toInstant(src.date, src.endTime)) : '';
  if (hasEnd && !endAt) errors.push('שעת הסיום אינה תקינה.');

  if (startAt && endAt && new Date(endAt).getTime() <= new Date(startAt).getTime()) {
    errors.push('שעת הסיום חייבת להיות אחרי שעת ההתחלה.');
  }

  const notes = str(src.notes);
  if (notes.length > SCHEDULE_LIMITS.notes) {
    errors.push(`ההערות ארוכות מדי (עד ${SCHEDULE_LIMITS.notes} תווים).`);
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    value: {
      kind,
      title,
      status,
      startAt,
      // '' would be written as an empty string; the column is nullable and the
      // absence of an end is a real, distinct state.
      endAt: endAt || null,
      clientId: str(src.clientId) || null,
      taskId: str(src.taskId) || null,
      notes: notes || null,
    },
  };
}

// ---------------- rows -> memory ----------------

/**
 * Cloud row -> the canonical camelCase in-memory shape. Returns null for a row
 * that cannot be trusted (missing id/user_id/title/start_at, or an unknown kind
 * or status), so a malformed row is dropped rather than rendered as half an
 * appointment on a day list.
 */
export function normalizeAppointmentRow(row) {
  if (!row || typeof row !== 'object') return null;
  const id = str(row.id);
  const userId = str(row.user_id);
  const title = str(row.title);
  const kind = str(row.kind);
  const status = str(row.status);
  const startAt = str(row.start_at);
  if (!id || !userId || !title || !startAt) return null;
  if (!APPOINTMENT_KINDS.includes(kind)) return null;
  if (!APPOINTMENT_STATUSES.includes(status)) return null;
  return {
    id,
    userId,
    kind,
    title,
    status,
    startAt,
    endAt: str(row.end_at) || null,
    clientId: str(row.client_id) || null,
    taskId: str(row.task_id) || null,
    notes: str(row.notes) || null,
    createdAt: str(row.created_at) || null,
    updatedAt: str(row.updated_at) || null,
  };
}

// ---------------- lists ----------------

/** Earliest first — the only order a day or week list is ever read in. */
export function sortByStart(items) {
  return [...(Array.isArray(items) ? items : [])]
    .filter(Boolean)
    .sort((a, b) => str(a.startAt).localeCompare(str(b.startAt)));
}

/**
 * The appointments starting inside a window of `days` local days beginning
 * today, earliest first.
 *
 * `openOnly` (default true) drops cancelled / completed / no-show rows: an
 * agenda answers "what is still expected of me", and a cancelled lesson is not.
 * The history is never deleted — it is simply not the agenda.
 */
export function listInDays(items, now, days = 1, openOnly = true) {
  const window = localDayWindow(now, days);
  if (!window) return [];
  return sortByStart(
    (Array.isArray(items) ? items : []).filter((a) => {
      if (!a) return false;
      if (openOnly && !OPEN_STATUSES.includes(a.status)) return false;
      return withinWindow(a.startAt, window);
    }),
  );
}

/** Today's agenda. */
export function listToday(items, now, openOnly = true) {
  return listInDays(items, now, 1, openOnly);
}

/** The next seven local days, today included. */
export function listWeek(items, now, openOnly = true) {
  return listInDays(items, now, 7, openOnly);
}

/** Group a sorted list into local calendar days, in order. */
export function groupByDay(items) {
  const out = [];
  const index = new Map();
  for (const a of sortByStart(items)) {
    const key = dayKey(a.startAt);
    if (!key) continue;
    if (!index.has(key)) {
      const bucket = { day: key, items: [] };
      index.set(key, bucket);
      out.push(bucket);
    }
    index.get(key).items.push(a);
  }
  return out;
}

/**
 * Ids of appointments whose time ranges overlap another's.
 *
 * SHOWN, NEVER REFUSED (declared limitation L2 of the migration). A business
 * double-books on purpose — two rooms, two teachers — and neither the schema
 * nor this module can tell an intentional overlap from a mistake. So the screen
 * marks them and the user decides.
 *
 * An appointment with no stated end has no extent and can only collide with
 * something starting at the same instant.
 */
export function findOverlapIds(items) {
  const list = sortByStart(items).filter((a) => OPEN_STATUSES.includes(a.status));
  const hit = new Set();
  const span = (a) => {
    const s = new Date(str(a.startAt)).getTime();
    const e = a.endAt ? new Date(str(a.endAt)).getTime() : s;
    return Number.isNaN(s) ? null : { s, e: Number.isNaN(e) ? s : e };
  };
  for (let i = 0; i < list.length; i += 1) {
    const a = span(list[i]);
    if (!a) continue;
    for (let j = i + 1; j < list.length; j += 1) {
      const b = span(list[j]);
      if (!b) continue;
      if (b.s >= a.e && !(a.s === a.e && b.s === a.s)) break; // sorted: nothing later can overlap
      if (b.s < a.e || (a.s === b.s)) {
        hit.add(list[i].id);
        hit.add(list[j].id);
      }
    }
  }
  return hit;
}

/** Counts for the screen's KPI strip. `now` is injected, never read here. */
export function scheduleCounts(items, now) {
  const all = Array.isArray(items) ? items : [];
  return {
    today: listToday(all, now).length,
    week: listWeek(all, now).length,
    planned: all.filter((a) => a && a.status === 'planned').length,
    total: all.length,
  };
}

// ---------------- month grid (slice 2) ----------------
//
// READ-ONLY BY CONSTRUCTION. Nothing below writes, validates or normalizes a
// payload — it only ARRANGES rows that `listAppointments` already returned into
// calendar cells. There is no new server call and no new writable surface.
//
// STILL NOT THE GROWTH MONTHLY ACTION CALENDAR. `/growth/calendar` plans
// activity VOLUME from an income target and persists nothing; this arranges
// real `public.appointments` rows. The import ban stated at the top of this
// file covers everything here, and a test pins it in BOTH directions.
//
// PLACEMENT IS BY `startAt` ALONE — the same rule `groupByDay` already uses, so
// a cell and a list can never disagree about which day an appointment is on.
// An appointment whose `endAt` crosses midnight, or the end of the month,
// appears ONCE, in the cell of its START. See N2.

export const WEEKDAY_LABELS = Object.freeze(['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']);

const MONTH_LABELS = Object.freeze([
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]);

/** 'YYYY-MM-DD' from a local Date, matching dayKey's format exactly. */
const civilKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * The half-open window [start, end) of a local calendar MONTH: the month
 * containing `ref`, shifted by `offset` months.
 *
 * Built from numeric parts, exactly like localDayWindow, so a December `+1`
 * rolls the YEAR by construction rather than by arithmetic this file would own.
 * Half-open for the same reason: midnight on the 1st belongs to the month that
 * is starting, never to both and never to neither.
 */
export function monthWindow(ref, offset = 0) {
  const dt = new Date(ref);
  if (Number.isNaN(dt.getTime())) return null;
  const n = Number.isFinite(offset) ? Math.trunc(offset) : 0;
  const start = new Date(dt.getFullYear(), dt.getMonth() + n, 1, 0, 0, 0, 0);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

/**
 * The month grid: `{ label, window, weeks }`, where `weeks` is an array of rows
 * of exactly 7 cells `{ day, inMonth, isToday, items }`.
 *
 * WEEK STARTS SUNDAY. `getDay()` is already 0 = Sunday, which is the Hebrew
 * week, so no shifting happens here and none may be added. The RIGHT-to-left
 * column order is the document's `dir="rtl"`, not an array reversal — reversing
 * here would flip twice and land Sunday on the left.
 *
 * LEADING / TRAILING CELLS CARRY THEIR APPOINTMENTS. They render muted, but
 * hiding their rows would show an empty week at the month boundary while the
 * account genuinely has something booked there — a false empty, which is the
 * one failure mode this product refuses. Each appointment still appears exactly
 * once in the returned matrix.
 *
 * DST-SAFE. Cells advance by CIVIL date (`new Date(y, m, d + i)`), never by
 * adding 24h of milliseconds: a 23- or 25-hour day would otherwise drop or
 * duplicate a date.
 *
 * EVERY STATUS IS SHOWN — unlike listToday / listWeek, which are agendas and
 * drop anything not `planned`. A month is a review of what happened as well as
 * what is coming; filtering to open rows would render every past day empty.
 */
export function monthMatrix(items, ref, offset = 0) {
  const window = monthWindow(ref, offset);
  if (!window) return null;

  const { start } = window;
  const year = start.getFullYear();
  const month = start.getMonth();

  const byDay = new Map();
  for (const a of sortByStart(items)) {
    const key = dayKey(a?.startAt);
    if (!key) continue;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(a);
  }

  const todayKey = civilKey(new Date(ref));
  const leading = start.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const trailing = 6 - new Date(year, month, daysInMonth).getDay();
  const total = leading + daysInMonth + trailing;

  const weeks = [];
  for (let i = 0; i < total; i += 1) {
    const cellDate = new Date(year, month, 1 - leading + i, 0, 0, 0, 0);
    const key = civilKey(cellDate);
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push({
      day: key,
      dayOfMonth: cellDate.getDate(),
      inMonth: cellDate.getMonth() === month && cellDate.getFullYear() === year,
      isToday: key === todayKey,
      items: byDay.get(key) || [],
    });
  }

  return { label: `${MONTH_LABELS[month]} ${year}`, window, weeks };
}

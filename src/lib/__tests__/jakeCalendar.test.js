// ===================================================================
// Jake sees the calendar — `public.appointments` reaches Jake's context and
// daily briefing through the JAKE SEAM, and every absence stays truthful.
//
// THE GAP THIS FILE PINS. `api.fetchAll()` hydrates nine collections and
// appointments is not one of them; there is no reducer for them either. So the
// Schedule module was durable, live and INVISIBLE to Jake: he answered
// "מה יש לי היום" — a string `isBriefingRequest` already matches — from tasks,
// quotes and charges, and silently omitted the calendar.
//
// These tests EXECUTE the shipped builders (artValuePack.buildContext /
// .briefing) rather than pinning source text, matching the
// jakeContextTruthfulness.test.js precedent. `now` is INJECTED as a fixed
// instant everywhere: schedule.js is clock-free by contract and the day/week
// boundaries are the whole point, so a real clock would make this file
// non-deterministic exactly where it must not be.
//
// NO network, NO model, NO Gateway, NO store.
// ===================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { artValuePack } from '../jakePack.js';
import { withBusinessBrain } from '../jakeBusinessContext.js';
import { AI_GATEWAY_INPUT_LIMITS } from '../aiGatewayInput.js';

const ctx = (d) => artValuePack.buildContext(d);
const brief = (d) => artValuePack.briefing(d);

// ---- fixtures ------------------------------------------------------------

// EXACTLY the shape api.fetchAll() returns — no projects / inventory /
// activity key, and (before this slice) no appointments key either.
function cloudData(extra = {}) {
  return {
    clients: [], quotes: [], transactions: [], outreachLeads: [], tasks: [],
    businessProfile: null, charges: [], payments: [],
    meta: { source: 'supabase' },
    ...extra,
  };
}

// A fixed LOCAL wall-clock instant. Built from numeric parts (never a parsed
// zoneless string) so it means the same civil moment on any runtime, exactly
// like schedule.js's own helpers.
const NOW = new Date(2026, 7, 5, 10, 0, 0, 0); // 2026-08-05, 10:00 local

/** An appointment at a local wall-clock offset in days/hours from NOW's day. */
function appt(overrides = {}) {
  const {
    dayOffset = 0, hour = 12, minute = 0, endHour = null,
    status = 'planned', kind = 'appointment', title = 'פגישה', id = 'a1',
  } = overrides;
  const start = new Date(2026, 7, 5 + dayOffset, hour, minute, 0, 0);
  const end = endHour === null ? null : new Date(2026, 7, 5 + dayOffset, endHour, minute, 0, 0);
  return {
    id, userId: 'u1', kind, title, status,
    startAt: start.toISOString(),
    endAt: end ? end.toISOString() : null,
    clientId: null, taskId: null, notes: null,
    createdAt: null, updatedAt: null,
  };
}

// The builders read the clock internally, so the injected NOW is applied by
// pinning Date for the duration of one call. Restored immediately.
function at(now, fn) {
  const Real = global.Date;
  class Pinned extends Real {
    constructor(...args) {
      if (args.length === 0) return new Real(now.getTime());
      return new Real(...args);
    }

    static now() { return now.getTime(); }
  }
  global.Date = Pinned;
  try { return fn(); } finally { global.Date = Real; }
}

const contextAt = (d, now = NOW) => at(now, () => ctx(d));
const briefAt = (d, now = NOW) => at(now, () => brief(d));

// ---- 1-2. absence is not emptiness ---------------------------------------

describe('calendar hydration truthfulness', () => {
  it('1. an ABSENT appointments collection is declared, never reported as empty', () => {
    const text = contextAt(cloudData());
    expect(text).toContain('אין לי גישה ליומן');
    expect(text).toContain('אל תאמר שאין פגישות');
    // The exact phantom this slice must not create.
    expect(text).not.toContain('אין רשומות מתוכננות להיום');
    expect(text).not.toContain('רשומות היום');
  });

  it('2. an EMPTY array is a real, honest "nothing today" and emits no briefing line', () => {
    const text = contextAt(cloudData({ appointments: [] }));
    expect(text).toContain('אין רשומות מתוכננות להיום');
    expect(text).not.toContain('אין לי גישה ליומן');
    // No week line at zero.
    expect(text).not.toContain('בשבעת הימים הקרובים');
    expect(briefAt(cloudData({ appointments: [] }))).not.toContain('📅');
  });
});

// ---- 3-4. the today list and its cap -------------------------------------

describe('today list', () => {
  it('3. lists today\'s appointments earliest first, with times and kind', () => {
    const items = [
      appt({ id: 'b', hour: 14, endHour: 15, title: 'שיעור צילום', kind: 'lesson' }),
      appt({ id: 'a', hour: 9, endHour: 10, title: 'פגישה עם דני' }),
    ];
    const text = contextAt(cloudData({ appointments: items }));
    expect(text).toContain('2 רשומות היום');
    expect(text).toContain('09:00–10:00 פגישה עם דני (תור)');
    expect(text).toContain('14:00–15:00 שיעור צילום (שיעור)');
    // Earliest first.
    expect(text.indexOf('09:00')).toBeLessThan(text.indexOf('14:00'));

    const b = briefAt(cloudData({ appointments: items }));
    expect(b).toContain('📅 2 רשומות היום');
    // The calendar leads למעקב.
    expect(b).toContain('למעקב:\n• 📅');
  });

  it('4. CAPS the list at 5 and says how many are not shown', () => {
    const items = Array.from({ length: 7 }, (_, i) => appt({
      id: `x${i}`, hour: 8 + i, title: `רשומה ${i}`,
    }));
    const text = contextAt(cloudData({ appointments: items }));
    expect(text).toContain('7 רשומות היום');
    expect(text).toContain('ועוד 2 שאינן מפורטות כאן');
    // The 6th and 7th titles are absent from the listed block.
    expect(text).toContain('רשומה 4');
    expect(text).not.toContain('רשומה 5');
    expect(text).not.toContain('רשומה 6');
  });
});

// ---- 5-6. negative controls: the agenda is not the history ----------------

describe('agenda filtering (negative controls)', () => {
  it('5. a CANCELLED appointment today is absent from context and briefing', () => {
    const d = cloudData({
      appointments: [appt({ id: 'c', hour: 9, title: 'בוטל היום', status: 'cancelled' })],
    });
    const text = contextAt(d);
    expect(text).not.toContain('בוטל היום');
    expect(text).toContain('אין רשומות מתוכננות להיום');
    expect(briefAt(d)).not.toContain('📅');
  });

  it('6. completed / no_show today are absent too', () => {
    const d = cloudData({
      appointments: [
        appt({ id: 'd', hour: 9, title: 'התקיים', status: 'completed' }),
        appt({ id: 'e', hour: 11, title: 'לא הגיע', status: 'no_show' }),
      ],
    });
    const text = contextAt(d);
    expect(text).not.toContain('התקיים');
    expect(text).not.toContain('לא הגיע');
    expect(text).toContain('אין רשומות מתוכננות להיום');
  });
});

// ---- 7-8. the week horizon is a COUNT, never a list -----------------------

describe('week count', () => {
  it('7. tomorrow is not today, and is counted in the week', () => {
    const d = cloudData({ appointments: [appt({ id: 'f', dayOffset: 1, title: 'מחר' })] });
    const text = contextAt(d);
    expect(text).toContain('אין רשומות מתוכננות להיום');
    expect(text).toContain('בשבעת הימים הקרובים: 1 רשומות מתוכננות');
    // A count, never a list.
    expect(text).not.toContain('מחר');
    expect(briefAt(d)).not.toContain('📅');
  });

  it('8. an empty week emits no week line at all', () => {
    // Day 8 is outside the 7-day window.
    const d = cloudData({ appointments: [appt({ id: 'g', dayOffset: 8 })] });
    expect(contextAt(d)).not.toContain('בשבעת הימים הקרובים');
  });
});

// ---- 9-10. boundaries -----------------------------------------------------

describe('day boundary and open-ended rows', () => {
  it('9. the day window is HALF-OPEN: 00:00 today in, 23:59 today in, 00:00 tomorrow out', () => {
    const d = cloudData({
      appointments: [
        appt({ id: 'h', hour: 0, minute: 0, title: 'חצות היום' }),
        appt({ id: 'i', hour: 23, minute: 59, title: 'סוף היום' }),
        appt({ id: 'j', dayOffset: 1, hour: 0, minute: 0, title: 'חצות מחר' }),
      ],
    });
    const text = contextAt(d);
    expect(text).toContain('2 רשומות היום');
    expect(text).toContain('חצות היום');
    expect(text).toContain('סוף היום');
    expect(text).not.toContain('חצות מחר');
  });

  it('10. an appointment with no end renders a single time, never a dangling range', () => {
    const d = cloudData({ appointments: [appt({ id: 'k', hour: 16, endHour: null, title: 'פתוח' })] });
    const text = contextAt(d);
    expect(text).toContain('16:00 פתוח (תור)');
    expect(text).not.toContain('16:00– פתוח');
  });
});

// ---- 11-12. a failed read is not a quiet day -----------------------------

describe('read failure vs local/demo', () => {
  it('11. a FAILED cloud read tells the user, and never claims nothing today', () => {
    const d = cloudData({ appointmentsError: true });
    const b = briefAt(d);
    expect(b).toContain('לא הצלחתי לטעון את היומן');
    expect(b).not.toContain('אין רשומות');
    // An all-clear would be unwarranted when the calendar could not be read.
    expect(b).not.toContain('הכל רגוע');
    expect(contextAt(d)).toContain('אין לי גישה ליומן');
  });

  it('12. local/demo (absent collection, no error) stays silent in the briefing', () => {
    const b = briefAt(cloudData());
    expect(b).not.toContain('📅');
    expect(b).not.toContain('לא הצלחתי לטעון את היומן');
  });
});

// ---- 13. the context budget ----------------------------------------------

describe('Gateway context budget', () => {
  it('13. a heavy account plus a full day stays well inside MAX_CONTEXT_CHARS', () => {
    const N = (n, f) => Array.from({ length: n }, (_, i) => f(i));
    const profile = {
      businessName: 'סטודיו לדוגמה',
      positioning: 'עיצוב ומיתוג לעסקים קטנים בצפון',
      audiences: ['בעלי עסקים'],
      tone: ['חם', 'מקצועי'],
      differentiators: ['שירות אישי', 'זמינות'],
      services: [{ name: 'מיתוג' }, { name: 'אתרים' }, { name: 'קמפיינים' }],
      palette: { primary: '#112233', secondary: '#AABBCC' },
    };
    const heavy = cloudData({
      clients: N(40, (i) => ({ id: `c${i}`, name: `לקוח מספר ${i} בעמ`, status: ['lead', 'active', 'completed', 'await_payment'][i % 4], value: 1000 + i * 137, nextAction: `לחזור אליו בנושא הצעת המחיר ${i}` })),
      quotes: N(20, (i) => ({ id: `q${i}`, clientId: `c${i}`, status: 'pending', items: [], total: 5000 })),
      transactions: N(30, (i) => ({ id: `t${i}`, type: i % 2 ? 'income' : 'expense', amount: 500 + i, date: '2026-08-01' })),
      outreachLeads: N(25, (i) => ({ id: `l${i}`, name: `ליד עסקי ארוך שם ${i}`, status: ['pending', 'contacted', 'irrelevant'][i % 3] })),
      tasks: N(30, (i) => ({ id: `k${i}`, title: `משימה ארוכה יחסית מספר ${i}`, status: 'open', deadline: '2026-08-05' })),
      charges: N(12, (i) => ({ id: `ch${i}`, clientId: `c${i}`, lifecycle: i % 5 ? 'open' : 'cancelled', amount: 2000 + i, dueDate: `2026-07-2${i % 9}`, serviceDate: '2026-06-01' })),
      payments: N(8, (i) => ({ id: `p${i}`, chargeId: `ch${i}`, amount: 500 + i, paidAt: '2026-07-15' })),
      businessProfile: profile,
      appointments: N(7, (i) => appt({ id: `s${i}`, hour: 8 + i, endHour: 9 + i, title: `רשומה ארוכה יחסית מספר ${i}` })),
    });
    const wire = withBusinessBrain(contextAt(heavy), 'תכתוב לי הודעה ללקוח', profile);
    // Over-limit input FAILS deterministically at the Gateway and is never
    // truncated, so an uncapped list would not degrade Jake — it would stop him.
    expect(wire.length).toBeLessThan(AI_GATEWAY_INPUT_LIMITS.MAX_CONTEXT_CHARS);
  });
});

// ---- 14-16. the seam's two ordering invariants ---------------------------
//
// ⚠️ SOURCE-PINNED, NOT BEHAVIOURAL — and the limitation is deliberate, not an
// oversight. This repo has NO component-test infrastructure (no jsdom, no
// testing-library, zero rendered-component tests), and adding it would be a
// package change this slice is not authorised to make. So the two invariants
// that live in Assistant.jsx are asserted structurally, with negative controls
// so the guard can genuinely fail. Behavioural proof of the marker ordering is
// owner QA, not this file. Precedent: the A1 parser-backed guard and the
// Campaigns cloud-only path, both source-pinned for the same reason.

const ASSISTANT_SRC = readFileSync(
  fileURLToPath(new URL('../../components/ai/Assistant.jsx', import.meta.url)),
  'utf8',
);

// Full-line comments stripped, for the "must NOT appear" assertions only. A
// raw-source scan matches the very comments that DOCUMENT the forbidden
// pattern — this guard caught itself doing exactly that on its first run.
// Only whole comment lines are removed, so no URL or in-string '//' is touched.
const ASSISTANT_CODE = ASSISTANT_SRC
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

/** The morning-briefing effect body alone — anchors are unique in the file. */
function briefingEffect() {
  const from = ASSISTANT_SRC.indexOf('// Proactive MORNING BRIEFING');
  const to = ASSISTANT_SRC.indexOf('}, [open, calendarSettled]);');
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  return ASSISTANT_SRC.slice(from, to);
}

describe('Jake seam ordering invariants (source-pinned)', () => {
  it('14. the once-a-day marker is written AFTER the briefing is composed', () => {
    const body = briefingEffect();
    const composed = body.indexOf('activePack.briefing(');
    const marked = body.indexOf('localStorage.setItem(briefDateKey');
    expect(composed).toBeGreaterThan(-1);
    expect(marked).toBeGreaterThan(-1);
    // The defect this slice fixes: marking before composing burns the marker on
    // a briefing built without the calendar, and the account gets no second
    // automatic briefing that day.
    expect(composed).toBeLessThan(marked);
    // Negative control — the naive pre-slice order must be absent.
    expect(body).not.toMatch(/setItem\(briefDateKey[^;]*;[\s\S]*activePack\.briefing\(/);
  });

  it('15. the briefing waits for the calendar read to SETTLE', () => {
    const body = briefingEffect();
    expect(body).toContain('!calendarSettled');
    expect(ASSISTANT_SRC).toContain('}, [open, calendarSettled]);');
    // The wait is bounded: a request that never settles must not suppress the
    // briefing forever. Fail toward the visible state.
    expect(ASSISTANT_SRC).toMatch(/CALENDAR_READ_TIMEOUT_MS\s*=\s*4000/);
    expect(ASSISTANT_SRC).toMatch(/setTimeout\([\s\S]{0,160}CALENDAR_READ_TIMEOUT_MS/);
  });

  it('16. a failed read never sets an empty array, and the seam stays read-only', () => {
    // `[]` would mean "loaded and empty" — the phantom fact this slice exists
    // to avoid. Only the resolved rows may be set.
    expect(ASSISTANT_CODE).not.toMatch(/setAppointments\(\s*\[\s*\]\s*\)/);
    expect(ASSISTANT_CODE).toMatch(/setAppointments\(rows\)/);
    // Read-only: no appointment write ever reaches the assistant.
    for (const w of ['createAppointment', 'updateAppointment', 'deleteAppointment', 'setAppointmentStatus']) {
      expect(ASSISTANT_CODE).not.toContain(w);
    }
  });
});

// ---- 17. the calendar did not perturb the rest of the context -------------

describe('scope containment', () => {
  it('17. hydrated CRM wording is unchanged and no write surface was added', () => {
    const d = cloudData({ appointments: [appt({ id: 'z', hour: 9 })] });
    const text = contextAt(d);
    // The pre-existing lines still read exactly as before.
    expect(text).toContain('לקוחות ב-CRM: 0 סה״כ');
    expect(text).toContain('פרויקטים: המודול אינו מחובר לחשבון הזה');
    expect(text).toContain('מלאי: המודול אינו מחובר לחשבון הזה');
    // Campaigns and assets stay out of scope.
    expect(text).not.toContain('קמפיינים');
    expect(text).not.toContain('נכסים');
  });
});

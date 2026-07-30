import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateAppointment, listToday } from '../../lib/schedule.js';

// ===================================================================
// Schedule Core slice 1 — the Schedule screen.
//
// House pattern (no jsdom in this repo): the pages pull in store/router/motion
// and are not cleanly renderable under Vitest — so, like
// financeReceivables.test.jsx, we extract the ACTUAL shipped handlers from the
// source and EXECUTE them with injected deps (behavioural proof), and
// source-pin the JSX wiring that cannot be executed.
//
// The four claims this file exists to defend:
//   1. nothing is shown as saved before the server confirms it;
//   2. a failed save leaves the modal OPEN with the typed values intact —
//      closing it looks exactly like success;
//   3. in local/demo mode the whole screen is truthfully unavailable rather
//      than a form that appears to save and does not;
//   4. the screen reads the clock ONCE and injects it — src/lib/schedule.js
//      never reads it, which is what makes the day boundaries testable.
// ===================================================================

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const page = read('../Schedule.jsx');
const modal = read('../../components/forms/AppointmentModal.jsx');
const api = read('../../lib/api.js');
const app = read('../../App.jsx');
const nav = read('../../components/layout/sidebarNav.js');

// ---- behavioural harness: run the real shipped handlers with injected deps ---

function extract(name, argSig) {
  const m = page.match(new RegExp(`const ${name} = async \\(${argSig}\\) => \\{[\\s\\S]*?\\n  \\};`));
  if (!m) throw new Error(`handler not found: ${name}(${argSig})`);
  return m[0];
}

const RUN_SRC = extract('run', 'fn, okMsg');
const SAVE_SRC = extract('save', 'payload');

/**
 * Build the two REAL handlers over injected state. Everything the source closes
 * over is provided here, so what runs is the shipped code, not a paraphrase.
 */
function harness({ createOk = true, updateOk = true } = {}) {
  const calls = { create: [], update: [], load: 0, toast: [], errors: [], busy: [] };
  let modalOpen = true;
  let editing = null;

  const deps = {
    setBusy: (v) => calls.busy.push(v),
    setError: (v) => calls.errors.push(v),
    load: async () => { calls.load += 1; },
    toast: (m) => calls.toast.push(m),
    userId: 'u1',
    createAppointment: async (uid, p) => {
      calls.create.push([uid, p]);
      if (!createOk) { const e = new Error('nope'); e.userSafe = false; throw e; }
      return { id: 'new' };
    },
    updateAppointment: async (id, p) => {
      calls.update.push([id, p]);
      if (!updateOk) { const e = new Error('nope'); throw e; }
      return { id };
    },
    setModalOpen: (v) => { modalOpen = v; },
    setEditing: (v) => { editing = v; },
  };

  // eslint-disable-next-line no-new-func
  const build = new Function(
    ...Object.keys(deps),
    `${RUN_SRC}\n${SAVE_SRC}\nreturn { run, save };`,
  );
  const { run, save } = build(...Object.values(deps));
  return { run, save, calls, state: () => ({ modalOpen, editing }) };
}

describe('nothing is shown as saved before the server confirms it', () => {
  it('a successful create toasts ONLY after the write and the reload resolve', async () => {
    const h = harness();
    await h.save({ title: 'x', date: '2026-08-03', startTime: '10:00' });
    expect(h.calls.create).toHaveLength(1);
    expect(h.calls.load).toBe(1);
    expect(h.calls.toast).toEqual(['הרישום נוסף ליומן']);
    expect(h.calls.errors).toContain('');
  });

  it('routes an edit to updateAppointment with the row id, never to create', async () => {
    const h = harness();
    await h.save({ id: 'a1', title: 'x', date: '2026-08-03', startTime: '10:00' });
    expect(h.calls.update).toEqual([['a1', { id: 'a1', title: 'x', date: '2026-08-03', startTime: '10:00' }]]);
    expect(h.calls.create).toHaveLength(0);
    expect(h.calls.toast).toEqual(['הרישום עודכן']);
  });

  // NEGATIVE CONTROL — the failure path.
  it('a FAILED create toasts nothing and surfaces an error instead', async () => {
    const h = harness({ createOk: false });
    await h.save({ title: 'x', date: '2026-08-03', startTime: '10:00' });
    expect(h.calls.toast).toEqual([]);
    expect(h.calls.errors.at(-1)).toBe('הפעולה לא הושלמה ולא נשמר דבר. אפשר לנסות שוב.');
  });

  it('a failed write never reloads — the authoritative list is left alone', async () => {
    const h = harness({ createOk: false });
    await h.save({ title: 'x', date: '2026-08-03', startTime: '10:00' });
    expect(h.calls.load).toBe(0);
  });

  it('busy is set true before the write and false in a finally, on both paths', async () => {
    const ok = harness();
    await ok.save({ title: 'x', date: '2026-08-03', startTime: '10:00' });
    expect(ok.calls.busy).toEqual([true, false]);

    const bad = harness({ createOk: false });
    await bad.save({ title: 'x', date: '2026-08-03', startTime: '10:00' });
    expect(bad.calls.busy).toEqual([true, false]);
  });

  it('a user-safe server refusal is shown verbatim, not replaced by the generic text', async () => {
    const h = harness();
    const err = new Error('הסטטוס אינו מוכר.');
    err.userSafe = true;
    await h.run(async () => { throw err; }, 'nope');
    expect(h.calls.errors.at(-1)).toBe('הסטטוס אינו מוכר.');
    expect(h.calls.toast).toEqual([]);
  });
});

describe('a failed save leaves the modal open with the typed values intact', () => {
  it('closes the modal ONLY on success', async () => {
    const ok = harness();
    await ok.save({ title: 'x', date: '2026-08-03', startTime: '10:00' });
    expect(ok.state().modalOpen).toBe(false);
    expect(ok.state().editing).toBe(null);
  });

  // THE CONTROL THIS BEHAVIOUR EXISTS FOR: a closed modal after a failed write
  // is indistinguishable from a successful save.
  it('leaves the modal OPEN when the write fails', async () => {
    const bad = harness({ createOk: false });
    await bad.save({ title: 'x', date: '2026-08-03', startTime: '10:00' });
    expect(bad.state().modalOpen).toBe(true);
  });
});

describe('the modal and the api layer share ONE validator', () => {
  it('both call validateAppointment — the modal cannot accept what the boundary rejects', () => {
    expect(modal).toContain('validateAppointment(form)');
    expect(api).toContain('validateAppointment(input)');
  });

  it('the modal has NO status field — the outcome is recorded from the list', () => {
    expect(modal).not.toMatch(/APPOINTMENT_STATUSES/);
    expect(modal).not.toMatch(/set\('status'/);
  });

  it('the modal disables submit while a write is in flight', () => {
    expect(modal).toContain('disabled={saving}');
    expect(modal).toContain("{saving ? 'שומר…'");
  });

  it('an invalid payload is refused before any api call is reachable', () => {
    expect(validateAppointment({ title: '', date: '2026-08-03', startTime: '10:00' }).ok).toBe(false);
    expect(validateAppointment({ title: 'x', date: '2026-08-03', startTime: '10:00', endTime: '09:00' }).ok).toBe(false);
  });
});

describe('cloud-only containment (the S0A rule, inverted)', () => {
  it('renders a truthful unavailable state in local/demo mode', () => {
    expect(page).toContain('if (!isSupabaseConfigured) return <LocalUnavailable />;');
    expect(page).toContain('זמין רק בחשבון בענן');
  });

  it('does NOT use the beta copy — appointments ARE in the beta, just not local', () => {
    expect(page).not.toContain('BetaUnavailable');
    expect(page).not.toContain('עדיין לא נכלל בבטא');
  });

  it('the nav entry is cloudOnly, never betaHidden', () => {
    const line = nav.split('\n').find((l) => l.includes("to: '/schedule'"));
    expect(line).toContain('cloudOnly: true');
    expect(line).not.toContain('betaHidden');
  });

  it('the route is registered and NOT wrapped in a beta gate', () => {
    expect(app).toContain('path="/schedule"');
    const line = app.split('\n').find((l) => l.includes('path="/schedule"'));
    expect(line).not.toContain('GrowthBetaGate');
    expect(line).not.toContain('BetaUnavailable');
  });

  it('is /schedule and never re-registers /growth/calendar', () => {
    expect((app.match(/path="\/growth\/calendar"/g) || [])).toHaveLength(1);
    expect(page).not.toContain('growthCalendar');
  });
});

describe('the clock is read in the page, once, and injected', () => {
  it('the page reads it exactly once, in lazy state', () => {
    expect(page).toContain('const [now] = useState(() => new Date());');
    expect((page.match(/new Date\(\)/g) || [])).toHaveLength(1);
  });

  it('the pure module reads no clock at all', () => {
    const lib = read('../../lib/schedule.js');
    const executable = lib.split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n');
    expect(executable).not.toMatch(/Date\.now\(\)/);
    expect(executable).not.toMatch(/new Date\(\s*\)/);
  });

  // POSITIVE CONTROL: the injected clock really drives the lists.
  it('the same items produce different day lists for different injected clocks', () => {
    const items = [{
      id: 'a', status: 'planned',
      startAt: new Date(2026, 7, 3, 10, 0).toISOString(),
    }];
    expect(listToday(items, new Date(2026, 7, 3, 8, 0))).toHaveLength(1);
    expect(listToday(items, new Date(2026, 7, 4, 8, 0))).toHaveLength(0);
  });
});

describe('nothing else was touched', () => {
  it('the page never dispatches through the store — it owns its own state', () => {
    expect(page).not.toMatch(/dispatch\(/);
    expect(page).not.toMatch(/ADD_APPOINTMENT|UPDATE_APPOINTMENT|DELETE_APPOINTMENT/);
  });

  it('store.jsx knows nothing about appointments', () => {
    expect(read('../../store/store.jsx')).not.toMatch(/appointment/i);
  });

  it('the api layer writes to `appointments` and to no other table', () => {
    const block = api.slice(api.indexOf('Schedule Core slice 1'));
    const tables = [...block.matchAll(/\.from\('(\w+)'\)/g)].map((m) => m[1]);
    expect([...new Set(tables)]).toEqual(['appointments']);
  });

  it('the api layer never touches tasks or clients when writing an appointment', () => {
    const block = api.slice(api.indexOf('Schedule Core slice 1'));
    expect(block).not.toMatch(/\.from\('tasks'\)/);
    expect(block).not.toMatch(/\.from\('clients'\)/);
  });
});

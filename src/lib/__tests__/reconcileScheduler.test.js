import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createReconcileScheduler, DEFAULT_QUIESCE_TIMEOUT_MS } from '../reconcileScheduler.js';
import { reducer } from '../../store/store.jsx';

// ===================================================================
// Stale-list refetch race — the store's lost-update defect.
//
// `refetch()` does `setData(fresh)`, an ABSOLUTE replacement, while every other
// state write is functional. A failed write used to call it immediately, so its
// response could be produced before the concurrent successful writes committed
// and restore rows the server had already deleted.
//
// ⚠️ THESE TESTS EXECUTE THE REAL SCHEDULER, and the interleaving ones drive it
// with the REAL exported `reducer` through a faithful model of the store's
// setData semantics (updater fn OR absolute value) — the same harness shape
// that reproduced the defect during diagnosis. `sleep` is injected so nothing
// depends on wall-clock timing.
// ===================================================================

const flush = () => new Promise((r) => setTimeout(r, 0));
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

// React setState semantics: accepts an updater fn OR an absolute value.
function makeStore(initial) {
  let state = initial;
  return {
    get: () => state,
    setData: (next) => { state = typeof next === 'function' ? next(state) : next; },
  };
}

const baseState = (clientIds) => ({
  clients: clientIds.map((id) => ({ id, name: id })),
  quotes: [], transactions: [], outreachLeads: [],
  projects: [], tasks: [], plinks: [], pfiles: [], comms: [], inventory: [], activity: [],
  charges: [], payments: [],
});

// A faithful model of store.jsx's durable non-task branch:
// optimistic reduce FIRST (synchronous), then persist, then reconcile on failure.
function makeWorld({ serverIds, failFor, failLatency, successLatency, fetchLatency }) {
  const store = makeStore(baseState(serverIds));
  let server = [...serverIds];
  const s = createReconcileScheduler({
    fetchAll: async () => { await tick(fetchLatency); return baseState([...server]); },
    apply: (fresh) => store.setData(fresh),
  });
  const dispatch = (action) => {
    store.setData((d) => reducer(d, action));                 // optimistic, functional
    const willFail = failFor.includes(action.id);
    const persist = (async () => {
      await tick(willFail ? failLatency : successLatency);
      if (willFail) throw new Error('refused');
      server = server.filter((x) => x !== action.id);         // server commits
    })();
    return s.trackWrite(persist).then(
      () => ({ ok: true }),
      async (e) => { await s.requestReconcile(); return { ok: false, error: e }; }
    );
  };
  return { store, dispatch, scheduler: s, serverNow: () => [...server] };
}

const IDS = ['c1', 'c2', 'c3', 'c4'];
const runBulk = (w, ids) => Promise.allSettled(ids.map((id) => w.dispatch({ type: 'DELETE_CLIENT', id })));

describe('reconcileScheduler · the defect is gone', () => {
  it('3. failure resolves FASTER than the successes — UI now equals the DB', async () => {
    const w = makeWorld({ serverIds: IDS, failFor: ['c1'], failLatency: 0, successLatency: 40, fetchLatency: 5 });
    await runBulk(w, IDS);
    expect(w.serverNow()).toEqual(['c1']);
    expect(w.store.get().clients.map((c) => c.id)).toEqual(['c1']); // pre-fix this was all four
  });

  it('4. failure resolves SLOWER than the successes — still correct (no regression)', async () => {
    const w = makeWorld({ serverIds: IDS, failFor: ['c1'], failLatency: 80, successLatency: 5, fetchLatency: 5 });
    await runBulk(w, IDS);
    expect(w.store.get().clients.map((c) => c.id)).toEqual(['c1']);
  });

  it('1. four concurrent failures produce EXACTLY ONE fetch (pre-fix: four)', async () => {
    const w = makeWorld({ serverIds: IDS, failFor: IDS, failLatency: 5, successLatency: 5, fetchLatency: 5 });
    await runBulk(w, IDS);
    expect(w.scheduler.stats().fetches).toBe(1);
    expect(w.scheduler.stats().coalesced).toBe(3);
  });

  it('6. a single failure with nothing concurrent behaves exactly as before — one immediate fetch', async () => {
    const w = makeWorld({ serverIds: ['c1'], failFor: ['c1'], failLatency: 0, successLatency: 0, fetchLatency: 0 });
    await w.dispatch({ type: 'DELETE_CLIENT', id: 'c1' });
    const st = w.scheduler.stats();
    expect(st.fetches).toBe(1);
    expect(st.applied).toBe(1);
    expect(st.timedOut).toBe(0);
  });
});

describe('reconcileScheduler · quiesce', () => {
  it('2. no fetch is issued while a write is in flight; it fires once the last one settles', async () => {
    let released;
    const gate = new Promise((r) => { released = r; });
    const order = [];
    const s = createReconcileScheduler({
      fetchAll: async () => { order.push('fetch'); return baseState([]); },
      apply: () => order.push('apply'),
    });
    const slow = s.trackWrite(gate);
    const failing = s.trackWrite(Promise.reject(new Error('x'))).catch(async () => {
      order.push('reconcile-requested');
      await s.requestReconcile();
      order.push('reconcile-done');
    });
    await tick(20);
    expect(s.pendingWrites()).toBe(1);            // the slow write is still out
    expect(order).toEqual(['reconcile-requested']); // and NO fetch has happened
    released();
    await slow;
    await failing;
    expect(order).toEqual(['reconcile-requested', 'fetch', 'apply', 'reconcile-done']);
  });

  it('7. a write that never settles does not hang the reconcile — the bound applies and it still applies', async () => {
    let applied = false;
    const s = createReconcileScheduler({
      fetchAll: async () => baseState([]),
      apply: () => { applied = true; },
      quiesceTimeoutMs: 40,
      sleep: (ms) => tick(ms),
    });
    s.trackWrite(new Promise(() => {}));          // never settles
    await s.requestReconcile();
    expect(applied).toBe(true);                   // degrades to pre-fix behaviour, deliberately
    expect(s.stats().timedOut).toBe(1);
  });
});

describe('reconcileScheduler · ordering', () => {
  // ⚠️ THE FIRST VERSION OF THIS BLOCK ASSERTED THE WRONG THING and failed,
  // which is how the following was found: with coalescing, two reconciles can
  // NEVER be in flight at once — `requestReconcile()` hands back the same
  // promise — so the generation guard inside the module cannot fire today. It
  // is kept as defence in depth, and what is pinned here is the INVARIANT that
  // makes it unreachable, not the dead branch. Pinning the branch would have
  // meant writing a test that proves nothing.
  it('5. reconciles never overlap: concurrent callers share ONE fetch and ONE apply', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const applied = [];
    const s = createReconcileScheduler({
      fetchAll: async () => {
        concurrent += 1; maxConcurrent = Math.max(maxConcurrent, concurrent);
        await tick(20); concurrent -= 1; return 'snapshot';
      },
      apply: (fresh) => applied.push(fresh),
    });
    await Promise.all([s.requestReconcile(), s.requestReconcile(), s.requestReconcile()]);
    expect(maxConcurrent).toBe(1);
    expect(applied).toEqual(['snapshot']);        // exactly one apply, not three
    expect(s.stats().fetches).toBe(1);
  });

  it('5b. sequential reconciles apply in issue order, newest last', async () => {
    const applied = [];
    let call = 0;
    const s = createReconcileScheduler({
      fetchAll: async () => { call += 1; return `snapshot-${call}`; },
      apply: (fresh) => applied.push(fresh),
    });
    await s.requestReconcile();
    await s.requestReconcile();
    expect(applied).toEqual(['snapshot-1', 'snapshot-2']);
  });
});

describe('reconcileScheduler · trackWrite contract', () => {
  it('9. passes values and rejections through unchanged, and decrements on both', async () => {
    const s = createReconcileScheduler({ fetchAll: async () => ({}), apply: () => {} });
    await expect(s.trackWrite(Promise.resolve('v'))).resolves.toBe('v');
    await expect(s.trackWrite(Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(s.pendingWrites()).toBe(0);
  });

  it('10. ANTI-DEADLOCK: the decrement runs BEFORE the caller error handler, so a failing write can reconcile', async () => {
    const s = createReconcileScheduler({ fetchAll: async () => ({}), apply: () => {} });
    let pendingSeenInsideHandler = null;
    await s.trackWrite(Promise.reject(new Error('x'))).catch(() => {
      pendingSeenInsideHandler = s.pendingWrites();
    });
    // If this were 1, the write would be waiting for a reconcile that is waiting
    // for the write — the gate card would sit disabled forever.
    expect(pendingSeenInsideHandler).toBe(0);
  });

  it('a failing write that reconciles from its own handler completes (no deadlock, end to end)', async () => {
    const s = createReconcileScheduler({ fetchAll: async () => baseState([]), apply: () => {} });
    const result = await s.trackWrite(Promise.reject(new Error('x'))).then(
      () => ({ ok: true }),
      async (e) => { await s.requestReconcile(); return { ok: false, error: e }; }
    );
    expect(result.ok).toBe(false);
    expect(s.stats().applied).toBe(1);
  });

  it('double-settling cannot double-decrement the counter', async () => {
    const s = createReconcileScheduler({ fetchAll: async () => ({}), apply: () => {} });
    const p = Promise.resolve(1);
    await Promise.all([s.trackWrite(p), s.trackWrite(p)]);
    expect(s.pendingWrites()).toBe(0);
  });
});

describe('reconcileScheduler · never rejects', () => {
  it('8. a failing fetchAll still RESOLVES the reconcile so the caller can settle { ok: false }', async () => {
    const reported = [];
    const s = createReconcileScheduler({
      fetchAll: async () => { throw new Error('offline'); },
      apply: () => { throw new Error('apply must not be called'); },
      onError: (msg) => reported.push(msg),
    });
    await expect(s.requestReconcile()).resolves.toBeUndefined();
    expect(s.stats().applied).toBe(0);
    expect(reported).toEqual(['שגיאת טעינה']);   // the caller's business fallback
  });

  it('the RAW technical message never escapes the module (render-boundary control)', async () => {
    const reported = [];
    const leak = 'permission denied for table clients (PostgREST 42501) at https://x.supabase.co/rest/v1/clients';
    const s = createReconcileScheduler({
      fetchAll: async () => { throw new Error(leak); },
      apply: () => {},
      onError: (msg) => reported.push(msg),
    });
    await s.requestReconcile();
    expect(reported).toHaveLength(1);
    expect(reported[0]).toBe('שגיאת טעינה');
    expect(reported[0]).not.toContain('supabase');
    expect(reported[0]).not.toContain('42501');
    expect(reported[0]).not.toContain('permission denied');
  });

  it('an error explicitly marked user-safe is still passed through (boundary not over-broad)', async () => {
    const reported = [];
    const err = new Error('technical'); err.userMessage = 'לא ניתן לטעון כרגע';
    const s = createReconcileScheduler({
      fetchAll: async () => { throw err; },
      apply: () => {},
      onError: (msg) => reported.push(msg),
    });
    await s.requestReconcile();
    expect(reported).toEqual(['לא ניתן לטעון כרגע']);
  });

  it('a later failure gets a FRESH reconcile after the previous one finished', async () => {
    let n = 0;
    const s = createReconcileScheduler({ fetchAll: async () => { n += 1; return baseState([]); }, apply: () => {} });
    await s.requestReconcile();
    await s.requestReconcile();
    expect(n).toBe(2); // coalescing is per in-flight window, not permanent
  });
});

describe('reconcileScheduler · KNOWN LIMITATION, deliberately not fixed', () => {
  it('11. an UNRELATED local edit made during a reconcile is still erased (defect (b), out of scope)', async () => {
    const store = makeStore(baseState(['c1']));
    const s = createReconcileScheduler({
      fetchAll: async () => { await tick(30); return baseState(['c1']); },
      apply: (fresh) => store.setData(fresh),
    });
    const p = s.requestReconcile();
    await tick(5);
    store.setData((d) => reducer(d, { type: 'ADD_CLIENT', payload: { id: 'NEW', name: 'typed by the user' } }));
    expect(store.get().clients.some((c) => c.id === 'NEW')).toBe(true);
    await p;
    // Still erased: the absolute setData(fresh) is unchanged. Fixing this needs a
    // pending-operations reconciler, explicitly out of this slice's scope.
    expect(store.get().clients.some((c) => c.id === 'NEW')).toBe(false);
  });
});

describe('store.jsx · wiring', () => {
  const store = readFileSync(fileURLToPath(new URL('../../store/store.jsx', import.meta.url)), 'utf8');

  it('every durable persist is counted as an in-flight write', () => {
    expect(store).toContain('trackWrite(persist(act, userId))');
    expect(store).toContain('trackWrite(persistReceivable(act, userId))');
    expect(store).toContain('trackWrite(api.upsertBusinessProfile(userId, act.payload))');
    expect(store.match(/trackWrite\(/g).length).toBe(4);
  });

  it('all four failure paths reconcile BEFORE settling { ok: false } — the S0B contract', () => {
    const body = store.slice(store.indexOf('const dispatch = useCallback('), store.indexOf('// ---- auth actions ----'));
    const reconciles = [...body.matchAll(/await requestReconcile\(\)/g)];
    expect(reconciles).toHaveLength(4);
    for (const m of reconciles) {
      const after = body.slice(m.index);
      expect(after.indexOf('ok: false')).toBeGreaterThan(-1);
      // the reconcile is awaited before the failure result is produced
      expect(after.indexOf('ok: false')).toBeLessThan(after.indexOf('ok: true') === -1 ? Infinity : after.indexOf('ok: true'));
    }
  });

  it('dispatch no longer calls refetch directly', () => {
    const body = store.slice(store.indexOf('const dispatch = useCallback('), store.indexOf('// ---- auth actions ----'));
    expect(body).not.toContain('refetch()');
  });

  it('hydration and imports still use the direct refetch (no concurrency there)', () => {
    expect(store).toContain('setLoading(true);\r\n    refetch();');
    expect(store.match(/await refetch\(\);/g).length).toBe(2); // migrateFromLocal + importBackup
  });

  it('the scheduler is stable across renders (useMemo, no deps)', () => {
    expect(store).toMatch(/useMemo\(\(\) => createReconcileScheduler\(\{[\s\S]*?\}\), \[\]\)/);
  });

  it('the quiesce bound is the approved 10s default', () => {
    expect(DEFAULT_QUIESCE_TIMEOUT_MS).toBe(10_000);
  });
});

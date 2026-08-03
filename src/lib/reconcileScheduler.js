// ===================================================================
// Reconcile scheduler — pure, no React, no store, no DOM, no clock of its own.
//
// THE DEFECT THIS EXISTS TO KILL. `refetch()` in store.jsx does
// `setData(await api.fetchAll())` — an ABSOLUTE replacement. Every other state
// write in the store uses the functional form `setData(d => reducer(d, action))`.
// An absolute set is last-writer-wins: it discards any state change applied
// after the fetch was issued.
//
// A bulk delete fires N dispatches in parallel; the durable non-task branch
// applies its optimistic reducer removal SYNCHRONOUSLY and only then persists.
// When one dispatch failed, its catch called `await refetch()` immediately —
// and if that response was produced before the sibling DELETEs committed
// server-side, `fresh` still contained the deleted rows and restored them over
// the optimistic removals. The UI listed 4 clients while the database held 1.
//
// ⚠️ THE CLAIM WAS RIGHT AND THE LIST WAS WRONG. This was measured in owner QA:
// the bulk-delete message said "3 deleted, 1 failed" and the database agreed
// exactly — only the on-screen list was stale. So this is NOT a truthfulness
// defect in the message; it is a lost-update defect in the store.
//
// ⚠️ PRE-EXISTING, AND ONLY VISIBLE BECAUSE THE MESSAGE BECAME TRUTHFUL.
// Before the bulk-delete fix the stale list was CONSISTENT with the false
// "✓ נמחקו 4" claim, so nobody could see it. Making the claim honest is what
// exposed the list. The bug did not appear — it became observable.
//
// THE SHAPE OF THE FIX. A failure no longer refetches immediately. It requests
// a RECONCILE, which (1) coalesces — N concurrent failures produce ONE fetch,
// (2) waits for quiesce — the fetch is issued only when no write is in flight,
// so it cannot race a sibling, and (3) applies under a GENERATION GUARD, so an
// older in-flight response can never overwrite a newer one's result.
//
// ⚠️ WHAT THIS DELIBERATELY DOES NOT FIX. The absolute `setData(fresh)` still
// erases an UNRELATED local edit made while a reconcile is in flight. Fixing
// that in general needs a pending-operations reconciler, which is far out of
// proportion to this defect and would touch every write path. It is out of
// scope by explicit decision and is pinned by a test as known/accepted, so no
// later reader mistakes it for covered.
// ===================================================================

import { userFacingError } from './userFacingError.js';

/** Default bound on how long a reconcile will wait for writes to quiesce. */
export const DEFAULT_QUIESCE_TIMEOUT_MS = 10_000;

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Create a reconcile scheduler.
 *
 * @param {object}   opts
 * @param {Function} opts.fetchAll  () => Promise<data> — the authoritative read
 * @param {Function} opts.apply     (fresh) => void      — store.jsx passes setData
 * @param {number}  [opts.quiesceTimeoutMs]
 * @param {Function}[opts.sleep]    (ms) => Promise      — injected for deterministic tests
 * @param {Function}[opts.onError]  (userMessage: string) => void — a SANITISED
 *        message, never the raw caught error. Reported, never thrown.
 */
export function createReconcileScheduler({
  fetchAll,
  apply,
  quiesceTimeoutMs = DEFAULT_QUIESCE_TIMEOUT_MS,
  sleep = realSleep,
  onError,
} = {}) {
  let pending = 0;          // writes currently in flight
  let inFlight = null;      // the shared coalesced reconcile promise
  let generation = 0;       // monotonic; the guard against out-of-order applies
  const counters = { fetches: 0, applied: 0, skipped: 0, timedOut: 0, coalesced: 0 };

  /**
   * Count a write as in-flight for as long as it is unsettled.
   *
   * Returns a promise that settles IDENTICALLY to `p` — same value, same
   * rejection. The caller chains its own `.then(onOk, onErr)` on the RESULT.
   *
   * ⚠️ THE DECREMENT MUST HAPPEN BEFORE THE CALLER'S HANDLERS RUN, and that is
   * the single most dangerous ordering in this module. A failing write asks for
   * a reconcile from its own error handler; if it were still counted as
   * in-flight at that moment, the reconcile would wait for a write that is
   * waiting for the reconcile — a DEADLOCK, and the bulk-delete gate card would
   * sit disabled forever. `.finally()` is attached here, before the caller
   * attaches anything, so it runs first. This is pinned by a test.
   */
  function trackWrite(p) {
    pending += 1;
    let settled = false;
    const release = () => { if (!settled) { settled = true; pending -= 1; } };
    return Promise.resolve(p).finally(release);
  }

  /** Wait until nothing is in flight. Resolves true if quiesced, false on timeout. */
  async function waitForQuiesce() {
    if (pending === 0) return true;
    const deadline = quiesceTimeoutMs;
    let waited = 0;
    const step = 5;
    while (pending > 0 && waited < deadline) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(step);
      waited += step;
    }
    return pending === 0;
  }

  async function runReconcile() {
    const quiesced = await waitForQuiesce();
    if (!quiesced) counters.timedOut += 1;
    // ⚠️ On timeout we still fetch and apply. That degrades to the PRE-FIX
    // behaviour for this one pathological case (a write that never settles),
    // and it is chosen deliberately: leaving the store unreconciled forever is
    // the S0A false-success class, which is strictly worse than a stale row.
    const gen = (generation += 1);
    let fresh;
    try {
      counters.fetches += 1;
      fresh = await fetchAll();
    } catch (e) {
      // Never rethrow: the caller must still be able to settle { ok: false }.
      //
      // ⚠️ THE RAW ERROR NEVER LEAVES THIS MODULE. A Supabase/PostgREST error
      // carries row-level-security text, endpoint URLs and SQLSTATE codes; the
      // caller sets it as user-visible state, so it crosses `userFacingError`
      // HERE rather than being handed out raw and sanitised by convention.
      // (Caught by the CLASS A parse-tree guard in studioHostedModeContainment
      // — this module is reachable from the creative routes.)
      console.error(e);
      if (onError) onError(userFacingError(e, 'שגיאת טעינה'));
      return;
    }
    // ⚠️ DEFENCE IN DEPTH, AND CURRENTLY UNREACHABLE — stated rather than left
    // to look load-bearing. Coalescing holds `inFlight` for the whole run, so
    // `requestReconcile()` can never start a second overlapping reconcile and
    // this branch cannot fire today. It is kept because it is one comparison
    // and it is the only thing standing between a future change (dropping
    // coalescing, or adding a second caller) and a silent out-of-order apply.
    // A test pins the invariant that makes it unreachable, NOT the branch.
    if (gen !== generation) { counters.skipped += 1; return; } // a newer reconcile owns the state
    counters.applied += 1;
    apply(fresh);
  }

  /**
   * Request an authoritative reconcile. Coalesced: concurrent callers share one
   * fetch and one apply. NEVER REJECTS — a failed read is reported through
   * `onError` and the promise still resolves, so a caller can always go on to
   * return its own `{ ok: false }`.
   */
  function requestReconcile() {
    if (inFlight) { counters.coalesced += 1; return inFlight; }
    inFlight = runReconcile().finally(() => { inFlight = null; });
    return inFlight;
  }

  return {
    trackWrite,
    requestReconcile,
    pendingWrites: () => pending,
    stats: () => ({ ...counters }),
  };
}

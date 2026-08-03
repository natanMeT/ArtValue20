// ===================================================================
// Bulk-delete OUTCOME summariser — pure, no React, no store, no DOM, no clock.
//
// THE DEFECT THIS EXISTS TO KILL. `runBulkDelete` in Assistant.jsx used to do
// `ids.forEach((id) => dispatch(...))` and then, in the SAME tick, toast
// `נמחקו N ✓` and write `✓ נמחקו N` into the chat. Every dispatch promise was
// discarded, so a cloud delete that the server REFUSED still reported success —
// and because the durable non-task branch of the store reduces optimistically
// (store.jsx: `setData(reducer(...))` runs BEFORE `persist()`), the screen
// agreed with the false claim until a refetch put the rows back. The chat
// message is NOT transient (see chatPersistence.js), so the false claim was
// written to localStorage and survived a reload.
//
// This is the S0A false-success class: a claim that a write happened, made
// before — or instead of — reading whether it did. Every other write path in
// Assistant.jsx was hardened to await its result; this one was not.
//
// The Hebrew copy lives HERE, not in the component, for one reason: a string
// built inside a React hook can only be pinned by reading the source, while a
// string returned by a pure function can be EXECUTED in a test with a mocked
// dispatch. The outcome wording is the product of this fix, so it is the thing
// that must be tested, not merely grepped.
//
// ⚠️ WHAT THIS MODULE DELIBERATELY DOES NOT CLAIM. The failure copy does not
// say "הנתונים רועננו". A failed durable dispatch DOES `await refetch()` before
// settling `{ ok: false }` — but the `!userId` branch of the store returns
// `{ ok: false }` with NO refetch at all, so the refresh is not something this
// module can know happened. Asserting it would be the same class of defect the
// slice is removing, pointed at the recovery step instead of the write.
// ===================================================================

/**
 * The ONE rule for reading a store dispatch result.
 *
 * A result counts as a FAILURE only when it explicitly says so — `{ ok: false }`.
 * `undefined`, `null`, a non-object, or anything without `ok === false` counts
 * as success.
 *
 * ⚠️ THIS IS A DELIBERATE CHOICE, NOT AN OVERSIGHT, and the reason is
 * consistency rather than optimism. `confirmAction` in Assistant.jsx — the
 * already-hardened SINGLE-delete path, which this fix is modelled on — reads
 * its result as `if (res && res.ok === false)`. If the bulk path treated an
 * unreadable result as failure while the single path treated it as success,
 * the same store contract would produce OPPOSITE claims two functions apart in
 * the same component, which is a worse defect than either default alone.
 *
 * In practice the branch is unreachable from the real store: every branch of
 * `dispatch` returns a promise settling to an `{ ok }` object. It is pinned so
 * that a future dispatch which stops doing that fails a test instead of
 * silently changing what the user is told.
 */
export function isDispatchFailure(res) {
  return !!(res && typeof res === 'object' && res.ok === false);
}

/**
 * Normalise `Promise.allSettled` output into plain dispatch results, preserving
 * INDEX ORDER so a result can still be paired with the id that produced it.
 *
 * A REJECTED promise becomes `{ ok: false, error }`. The store never rejects
 * today (every failure path resolves a settled `{ ok: false }`), but a rejection
 * is definite proof the write did not confirm, and routing it through
 * `allSettled` is what keeps the call site from throwing — an exception thrown
 * mid-loop would skip the outcome message entirely and leave the gate card
 * frozen, which is a false-success by silence.
 */
export function settledDispatchResults(settled) {
  return (Array.isArray(settled) ? settled : []).map((s) => {
    if (!s || typeof s !== 'object') return s;
    if (s.status === 'rejected') return { ok: false, error: s.reason };
    if (s.status === 'fulfilled') return s.value;
    return s;
  });
}

/**
 * Summarise a bulk delete into exactly what the user may be told.
 *
 * @param {Array<string>} ids      the ids dispatched, in dispatch order
 * @param {Array<any>}    results  one result per id, SAME ORDER (see settledDispatchResults)
 * @param {object}        gate     { entityLabel, items } — the picker payload
 * @returns {{ okIds: string[], failedIds: string[], toast: {text:string,kind:string}|null, text: string }}
 *
 * `toast` is null whenever nothing was deleted — a toast is the product's
 * "it worked" signal and must not fire for a delete that did not happen.
 *
 * An id whose result is MISSING (results shorter than ids) is counted as a
 * failure: an absent result is not a confirmed write. This is the one place
 * where absence is treated as failure rather than as success, and it is not in
 * tension with `isDispatchFailure` — there the dispatch answered in a shape we
 * could not read, here it did not answer at all.
 */
export function summarizeBulkDelete(ids, results, gate) {
  const list = Array.isArray(ids) ? ids : [];
  const res = Array.isArray(results) ? results : [];
  const label = (gate && gate.entityLabel) || 'פריטים';
  const total = (gate && Array.isArray(gate.items)) ? gate.items.length : list.length;

  const okIds = [];
  const failedIds = [];
  list.forEach((id, i) => {
    const settledForId = i < res.length;
    if (settledForId && !isDispatchFailure(res[i])) okIds.push(id);
    else failedIds.push(id);
  });

  if (!list.length) {
    return { okIds, failedIds, toast: null, text: 'לא נמחק כלום — לא נבחר דבר.' };
  }

  // ---- none succeeded: no toast, no ✓, no count that implies a deletion ----
  if (!okIds.length) {
    return {
      okIds,
      failedIds,
      toast: null,
      text: `לא נמחק כלום — המחיקה בענן נכשלה (${failedIds.length} מתוך ${list.length} ${label}). בדוק את הרשימה ונסה שוב.`,
    };
  }

  // ---- partial: state BOTH numbers; never let the successes imply the whole ----
  if (failedIds.length) {
    return {
      okIds,
      failedIds,
      // 'error' kind deliberately: a partial bulk delete is not a success event,
      // and a green ✓ toast would read as one no matter what number it carries.
      toast: { text: `נמחקו ${okIds.length} מתוך ${list.length} — ${failedIds.length} נכשלו`, kind: 'error' },
      text: `⚠️ נמחקו ${okIds.length} ${label} מתוך ${list.length} שנבחרו. ${failedIds.length} לא נמחקו — המחיקה בענן נכשלה עבורם. בדוק את הרשימה ונסה שוב.`,
    };
  }

  // ---- all succeeded: the pre-fix wording, unchanged, now actually earned ----
  const all = okIds.length === total;
  return {
    okIds,
    failedIds,
    toast: { text: `נמחקו ${okIds.length} ✓`, kind: 'success' },
    text: `✓ נמחקו ${okIds.length} ${label}${all ? ' (הכל)' : ` מתוך ${total}`}.`,
  };
}

/**
 * Run the whole bulk delete and return the outcome. This is the ENTIRE decision
 * path — dispatch fan-out, settling, pairing, summarising — deliberately kept
 * out of the React component so a test can EXECUTE it against a mocked dispatch
 * instead of grepping the component's source for a shape that looks right.
 * Assistant.jsx keeps only what genuinely needs React: the toast and the message
 * swap.
 *
 * The dispatches are PARALLEL by construction: `ids.map` invokes `dispatch` for
 * every id synchronously, before the first await — the same concurrency the
 * pre-fix `forEach` had.
 *
 * Never throws. A dispatch that throws SYNCHRONOUSLY is caught by the try/catch
 * below; one that returns a rejecting promise is absorbed by `allSettled`. Both
 * become `{ ok: false }` — a write that blew up is not a write that confirmed —
 * so the caller always gets an outcome to render and the gate card can never be
 * left frozen mid-flight.
 */
export async function executeBulkDelete(dispatch, gate, ids) {
  const list = Array.isArray(ids) ? ids : [];
  const type = gate && gate.dispatchType;
  const settled = await Promise.allSettled(list.map((id) => {
    try {
      return Promise.resolve(dispatch({ type, id }));
    } catch (error) {
      return Promise.reject(error);
    }
  }));
  return summarizeBulkDelete(list, settledDispatchResults(settled), gate);
}

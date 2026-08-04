// ===================================================================
// calendarReadState — the pure decision for what the Jake seam holds after ONE
// appointments read settles.
//
// WHY THIS IS A MODULE AND NOT THREE INLINE SETTERS. The Jake Calendar slice
// shipped this decision inline in Assistant.jsx and got it WRONG: a failed read
// set the error flag but left the PREVIOUSLY LOADED rows in state. `isHydrated`
// therefore stayed true, the briefing took the list branch, and Jake presented
// a snapshot nobody had verified as the current calendar — with no notice.
// Owner QA reproduced it deterministically (PR #199 QA step 7b): read succeeds,
// panel reopened with the read blocked, and Jake repeated the same seven
// appointments verbatim.
//
// Inline, the only possible guard was a source grep. As a module the rule is
// EXECUTED by tests. Same reasoning that moved the reconcile decision into
// reconcileScheduler.js.
//
// THE RULE: only a SUCCESSFUL read may leave rows behind. A rejection or a
// timeout returns the seam to "not loaded", because absence is the only honest
// representation of a calendar that could not be read.
//
// A stale list is not a weaker truth than no list — it is a confident claim
// nobody verified. Dropping it is what lets the existing unavailable notice
// fire, and the notice is the whole point of the slice.
//
// Pure + dependency-free: NO store, NO network, NO React, NO clock.
// ===================================================================

export const CALENDAR_OUTCOME = Object.freeze({
  LOADED: 'loaded',
  FAILED: 'failed',
  TIMED_OUT: 'timed_out',
});

/**
 * The seam state after one read settles.
 *
 * Returns `{ appointments, error, settled }`, where `appointments` is the array
 * on success and `undefined` on every other outcome — `undefined` is the
 * "never loaded" half of the structural `Array.isArray` discriminator every
 * consumer already uses, so restoring it is what re-enables the unavailable
 * wording.
 *
 * A LOADED outcome carrying a non-array is treated as a FAILURE, not as an
 * empty calendar: `[]` would assert "nothing scheduled", which is exactly the
 * claim an unusable response cannot support.
 */
export function calendarStateAfterRead(outcome, rows) {
  if (outcome === CALENDAR_OUTCOME.LOADED && Array.isArray(rows)) {
    return { appointments: rows, error: false, settled: true };
  }
  return { appointments: undefined, error: true, settled: true };
}

// ===================================================================
// campaignReadState — the pure decision for what the Jake seam holds after ONE
// campaigns read settles.
//
// SAME RULE AS THE CALENDAR, DELIBERATELY A SEPARATE MODULE. calendarReadState
// exists because the Jake Calendar slice shipped that decision inline and got
// it wrong: a failed read set the error flag but left the PREVIOUSLY LOADED
// rows in state, so Jake presented a snapshot nobody had verified. The rule is
// identical here, but the two lanes are NOT merged into one generic helper:
// the calendar's third key (`settled`) exists ONLY to gate the morning
// briefing, and campaigns deliberately do NOT gate it. A shared module would
// couple the two contracts, and the next edit to one would silently move the
// other. One builder per lane contract.
//
// THE RULE: only a SUCCESSFUL read may leave rows behind. A rejection or a
// timeout returns the seam to "not loaded", because absence is the only honest
// representation of a list that could not be read.
//
// A stale list is not a weaker truth than no list — it is a confident claim
// nobody verified. Dropping it is what lets the unavailable wording fire.
//
// Pure + dependency-free: NO store, NO network, NO React, NO clock.
// ===================================================================

export const CAMPAIGN_OUTCOME = Object.freeze({
  LOADED: 'loaded',
  FAILED: 'failed',
  TIMED_OUT: 'timed_out',
});

/**
 * The seam state after one campaigns read settles.
 *
 * Returns `{ campaigns, error }` — TWO keys, not three. There is no `settled`
 * flag on purpose: nothing waits for this read. The morning briefing is gated
 * on the CALENDAR only, and adding a second gate would delay every briefing and
 * put a second failure mode in front of the once-a-day marker.
 *
 * `campaigns` is the array on success and `undefined` on every other outcome —
 * `undefined` is the "never loaded" half of the structural `Array.isArray`
 * discriminator every consumer already uses, so restoring it is what re-enables
 * the unavailable wording.
 *
 * A LOADED outcome carrying a non-array is treated as a FAILURE, not as an
 * empty list: `[]` would assert "there are no campaigns", which is exactly the
 * claim an unusable response cannot support.
 */
export function campaignStateAfterRead(outcome, rows) {
  if (outcome === CAMPAIGN_OUTCOME.LOADED && Array.isArray(rows)) {
    return { campaigns: rows, error: false };
  }
  return { campaigns: undefined, error: true };
}

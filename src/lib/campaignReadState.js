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
 * Returns `{ campaigns, error, settled }`.
 *
 * ⚠️ THE THIRD KEY IS FOR WORDING, NEVER FOR GATING — and this is a DELIBERATE
 * REVERSAL of what this header said before. It used to read "TWO keys, not
 * three. There is no `settled` flag on purpose", because the calendar's flag
 * exists to gate the morning briefing and campaigns must not. That reason is
 * still true and still enforced: `settled` here is consumed ONLY to decide
 * which unhydrated WORDING jakePack emits, and the morning briefing remains
 * gated on the CALENDAR alone (owner decision D1, pinned by a test). Wiring
 * this key into the briefing gate would delay every briefing and put a second
 * failure mode in front of the once-a-day marker.
 *
 * Why it exists at all: `{ campaigns, error }` encodes TWO absences (a failed
 * cloud read, and local/demo having no campaigns module) while the product has
 * THREE — the third being "the read has not come back yet". Collapsing the
 * third into the second made Jake say "המודול אינו מחובר לחשבון הזה" during the
 * ≤4s window after a cloud panel open, which is FALSE: the module is connected
 * and the rows are durable, they simply have not arrived.
 *
 * `settled` is `true` on EVERY outcome, because this function runs only once a
 * read has settled. It is a constant by construction and is returned rather
 * than assumed so tests can EXECUTE the rule instead of grepping the caller.
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
    return { campaigns: rows, error: false, settled: true };
  }
  return { campaigns: undefined, error: true, settled: true };
}

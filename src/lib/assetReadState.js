// ===================================================================
// assetReadState — the pure decision for what the Jake seam holds after ONE
// asset-library read settles.
//
// THE THIRD SEAM, AND DELIBERATELY THE THIRD MODULE. calendarReadState came
// first (the Jake Calendar slice shipped that decision inline and got it wrong:
// a failed read set the error flag but left the PREVIOUSLY LOADED rows in
// state, so Jake presented a snapshot nobody had verified). campaignReadState
// repeated the RULE without sharing the CODE, because the calendar's third key
// (`settled`) exists only to gate the morning briefing. This module is the
// same again, for the same reason.
//
// DO NOT MERGE THE THREE INTO ONE HELPER. They are not one contract with three
// callers — they are three contracts that currently agree on two of their
// keys. The calendar has three keys and gates the briefing; campaigns and
// assets have two and gate nothing. A shared abstraction would couple them so
// the next edit to one silently moves the others, which is exactly the class
// of defect the separate modules were created to stop. One builder per lane
// contract.
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

export const ASSET_OUTCOME = Object.freeze({
  LOADED: 'loaded',
  FAILED: 'failed',
  TIMED_OUT: 'timed_out',
});

/**
 * The seam state after one asset-library read settles.
 *
 * Returns `{ assets, error, settled }`.
 *
 * ⚠️ THE THIRD KEY IS FOR WORDING, NEVER FOR GATING — a DELIBERATE REVERSAL of
 * what this header said before ("TWO keys, not three... no `settled` flag").
 * The original reason is still true and still enforced: the calendar's flag
 * gates the morning briefing and assets must not, so `settled` here is consumed
 * ONLY to decide which unhydrated WORDING jakePack emits. The briefing remains
 * gated on the CALENDAR alone (owner decision D1, pinned by a test).
 *
 * Why it exists at all: `{ assets, error }` encodes TWO absences (a failed
 * cloud read, and local/demo having no asset library) while the product has
 * THREE — the third being "the read has not come back yet". Collapsing the
 * third into the second made Jake say "המודול אינו מחובר לחשבון הזה" during the
 * ≤4s window after a cloud panel open, which is FALSE: the library is
 * connected and the rows are durable, they simply have not arrived.
 *
 * `settled` is `true` on EVERY outcome, because this function runs only once a
 * read has settled. It is a constant by construction and is returned rather
 * than assumed so tests can EXECUTE the rule instead of grepping the caller.
 *
 * `assets` is the array on success and `undefined` on every other outcome —
 * `undefined` is the "never loaded" half of the structural `Array.isArray`
 * discriminator every consumer already uses, so restoring it is what re-enables
 * the unavailable wording.
 *
 * A LOADED outcome carrying a non-array is treated as a FAILURE, not as an
 * empty list: `[]` would assert "there are no assets in this account", which is
 * exactly the claim an unusable response cannot support.
 */
export function assetStateAfterRead(outcome, rows) {
  if (outcome === ASSET_OUTCOME.LOADED && Array.isArray(rows)) {
    return { assets: rows, error: false, settled: true };
  }
  return { assets: undefined, error: true, settled: true };
}

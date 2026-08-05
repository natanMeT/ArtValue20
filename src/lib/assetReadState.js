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
 * Returns `{ assets, error }` — TWO keys, not three. Like campaigns and unlike
 * the calendar there is no `settled` flag: nothing waits for this read. The
 * morning briefing is gated on the CALENDAR only, and adding a second gate
 * would delay every briefing and put another failure mode in front of the
 * once-a-day marker.
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
    return { assets: rows, error: false };
  }
  return { assets: undefined, error: true };
}

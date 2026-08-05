// ===================================================================
// campaignReadState — the pure decision the Jake campaigns seam commits after
// ONE read settles. These tests EXECUTE the shipped function; they never pin
// its source text, which is the whole reason the rule was moved out of the
// component in the first place.
//
// THE REGRESSION THIS FILE EXISTS FOR (T6). The calendar slice shipped this
// decision inline and got it wrong: a failed read set the error flag but left
// the PREVIOUSLY LOADED rows in state, so Jake presented an unverified snapshot
// with no notice. Only a SUCCESSFUL read may leave rows behind.
//
// NO network, NO React, NO store, NO clock.
// ===================================================================
import { describe, it, expect } from 'vitest';
import { campaignStateAfterRead, CAMPAIGN_OUTCOME } from '../campaignReadState.js';

const rows = [
  { id: 'a', userId: 'u', title: 'קמפיין קיץ', status: 'active', startDate: null, endDate: null },
  { id: 'b', userId: 'u', title: 'קמפיין חורף', status: 'draft', startDate: null, endDate: null },
];

describe('campaignStateAfterRead — the three outcomes', () => {
  it('T1 LOADED with an array keeps the rows and clears the error', () => {
    const s = campaignStateAfterRead(CAMPAIGN_OUTCOME.LOADED, rows);
    expect(s.campaigns).toEqual(rows);
    expect(s.error).toBe(false);
  });

  it('T2 LOADED with an EMPTY array is loaded-and-empty, never "not loaded"', () => {
    const s = campaignStateAfterRead(CAMPAIGN_OUTCOME.LOADED, []);
    // `[]` must survive as `[]`: it is the only value that lets Jake say
    // "אין קמפיינים" truthfully. Turning it into undefined would silently
    // downgrade a verified fact into an unavailable notice.
    expect(Array.isArray(s.campaigns)).toBe(true);
    expect(s.campaigns).toHaveLength(0);
    expect(s.error).toBe(false);
  });

  it('T3 LOADED carrying a NON-array is a failure, not an empty list', () => {
    for (const bad of [null, undefined, {}, 'rows', 0, NaN]) {
      const s = campaignStateAfterRead(CAMPAIGN_OUTCOME.LOADED, bad);
      expect(s.campaigns, `non-array ${String(bad)} must not become a list`).toBeUndefined();
      expect(s.error).toBe(true);
    }
  });

  it('T4 FAILED returns to "never loaded" and raises the error', () => {
    const s = campaignStateAfterRead(CAMPAIGN_OUTCOME.FAILED);
    expect(s.campaigns).toBeUndefined();
    expect(s.error).toBe(true);
  });

  it('T5 TIMED_OUT is treated exactly like FAILED', () => {
    expect(campaignStateAfterRead(CAMPAIGN_OUTCOME.TIMED_OUT))
      .toEqual(campaignStateAfterRead(CAMPAIGN_OUTCOME.FAILED));
  });

  it('T5b an unknown outcome fails CLOSED, never open', () => {
    const s = campaignStateAfterRead('something-else', rows);
    expect(s.campaigns).toBeUndefined();
    expect(s.error).toBe(true);
  });
});

describe('T6 — a failed read after a SUCCESSFUL one leaves NO stale rows', () => {
  it('drops the previously loaded rows instead of keeping them', () => {
    // The exact sequence owner QA reproduced on the calendar (PR #199 step 7b):
    // read succeeds, panel reopened with the read blocked.
    const first = campaignStateAfterRead(CAMPAIGN_OUTCOME.LOADED, rows);
    expect(first.campaigns).toHaveLength(2);

    const second = campaignStateAfterRead(CAMPAIGN_OUTCOME.FAILED);
    expect(second.campaigns, 'a failed read must not carry the old rows forward').toBeUndefined();
    expect(second.error).toBe(true);
  });

  it('and the same holds for a timeout', () => {
    campaignStateAfterRead(CAMPAIGN_OUTCOME.LOADED, rows);
    const after = campaignStateAfterRead(CAMPAIGN_OUTCOME.TIMED_OUT);
    expect(after.campaigns).toBeUndefined();
  });
});

describe('the contract shape itself', () => {
  // ⚠️ CHANGED BY C1, DELIBERATELY. This block used to assert TWO keys and "no
  // `settled` flag", because the calendar's flag gates the morning briefing and
  // campaigns must not. That reason still holds and is still enforced — but by
  // the BRIEFING tests, not by the absence of the key. `settled` now exists here
  // for WORDING only: it is what lets jakePack tell the pre-settle window apart
  // from local/demo, instead of calling a connected module "not connected".
  it('returns THREE keys, and `settled` is true on EVERY outcome', () => {
    expect(Object.keys(campaignStateAfterRead(CAMPAIGN_OUTCOME.LOADED, rows)).sort())
      .toEqual(['campaigns', 'error', 'settled']);
    expect(Object.keys(campaignStateAfterRead(CAMPAIGN_OUTCOME.FAILED)).sort())
      .toEqual(['campaigns', 'error', 'settled']);
  });

  it('C1 — every outcome settles, so the pending wording can never stick', () => {
    // This function runs ONLY once a read has settled, so `settled` is a
    // constant by construction. Executed rather than assumed: the Assistant
    // derives `pending = !settled` from it, and a single outcome returning
    // false would leave Jake announcing "still loading" forever.
    const outcomes = [
      campaignStateAfterRead(CAMPAIGN_OUTCOME.LOADED, rows),
      campaignStateAfterRead(CAMPAIGN_OUTCOME.LOADED, []),
      campaignStateAfterRead(CAMPAIGN_OUTCOME.LOADED, 'not-an-array'),
      campaignStateAfterRead(CAMPAIGN_OUTCOME.FAILED),
      campaignStateAfterRead(CAMPAIGN_OUTCOME.TIMED_OUT),
      campaignStateAfterRead('something-else', rows),
    ];
    for (const s of outcomes) expect(s.settled).toBe(true);
  });

  it('the outcome enum is frozen and complete', () => {
    expect(Object.isFrozen(CAMPAIGN_OUTCOME)).toBe(true);
    expect(Object.values(CAMPAIGN_OUTCOME).sort()).toEqual(['failed', 'loaded', 'timed_out']);
  });

  it('does not mutate or copy-alias the caller rows', () => {
    const input = [...rows];
    const s = campaignStateAfterRead(CAMPAIGN_OUTCOME.LOADED, input);
    expect(input).toHaveLength(2);
    expect(s.campaigns).toBe(input);
  });
});

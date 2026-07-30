import { describe, it, expect } from 'vitest';
import {
  CAMPAIGN_LIMITS, CAMPAIGN_QUOTA, CAMPAIGN_STATUSES, CAMPAIGN_TRANSITIONS,
  CAMPAIGN_STATUS_LABELS, CAMPAIGN_STATUS_CLASS,
  canTransition, nextStatuses, validateCampaign, canCreateWithin,
  normalizeCampaignRow, sortCampaignsNewestFirst, countTasksForCampaign,
} from '../campaigns.js';

// ===================================================================
// Campaigns slice 1 — the pure client boundary.
//
// Everything here is an ADVISORY MIRROR of a server rule. These tests pin the
// mirror; they cannot and do not prove the database enforces anything. That is
// what campaignsMigration.test.js (DDL text) and the owner-run SQL controls in
// the PR body (live database) are for.
// ===================================================================

describe('status transition graph (mirror of trg_campaigns_status_transition)', () => {
  it('allows exactly the four legal moves', () => {
    expect(canTransition('draft', 'active')).toBe(true);
    expect(canTransition('draft', 'cancelled')).toBe(true);
    expect(canTransition('active', 'completed')).toBe(true);
    expect(canTransition('active', 'cancelled')).toBe(true);
  });

  // NEGATIVE CONTROL for the graph: the moves that must be refused. Without
  // these the "allows" test above passes for a function that returns true.
  it('refuses every move out of a TERMINAL state', () => {
    for (const from of ['completed', 'cancelled']) {
      for (const to of CAMPAIGN_STATUSES) {
        if (to === from) continue;
        expect(canTransition(from, to), `${from} -> ${to} must be refused`).toBe(false);
      }
    }
  });

  it('refuses skipping the active step and every backwards move', () => {
    expect(canTransition('draft', 'completed')).toBe(false);
    expect(canTransition('active', 'draft')).toBe(false);
    expect(canTransition('completed', 'active')).toBe(false);
    expect(canTransition('cancelled', 'draft')).toBe(false);
  });

  it('always allows an UNCHANGED status — editing a title must never be refused', () => {
    for (const s of CAMPAIGN_STATUSES) expect(canTransition(s, s)).toBe(true);
  });

  it('refuses unknown states in either position', () => {
    expect(canTransition('draft', 'archived')).toBe(false);
    expect(canTransition('archived', 'active')).toBe(false);
    expect(canTransition(null, 'active')).toBe(false);
    expect(canTransition('draft', undefined)).toBe(false);
  });

  it('nextStatuses offers only legal moves, and nothing at all from a terminal state', () => {
    expect(nextStatuses('draft')).toEqual(['active', 'cancelled']);
    expect(nextStatuses('active')).toEqual(['completed', 'cancelled']);
    expect(nextStatuses('completed')).toEqual([]);
    expect(nextStatuses('cancelled')).toEqual([]);
    expect(nextStatuses('nonsense')).toEqual([]);
  });

  it('every status has a Hebrew label and a badge class (no unlabelled state can render)', () => {
    for (const s of CAMPAIGN_STATUSES) {
      expect(CAMPAIGN_STATUS_LABELS[s]).toBeTruthy();
      expect(CAMPAIGN_STATUS_CLASS[s]).toBeTruthy();
    }
    expect(Object.keys(CAMPAIGN_TRANSITIONS).sort()).toEqual([...CAMPAIGN_STATUSES].sort());
  });
});

describe('validateCampaign', () => {
  it('accepts a minimal campaign and normalizes blanks to null', () => {
    const r = validateCampaign({ title: '  השקת חבילת אתרים  ' });
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ title: 'השקת חבילת אתרים', objective: null, startDate: null, endDate: null });
  });

  it('requires a title, and rejects a whitespace-only one', () => {
    expect(validateCampaign({}).ok).toBe(false);
    expect(validateCampaign({ title: '   ' }).ok).toBe(false);
  });

  // Over-limit is a VISIBLE error, never a silent truncation of saved data.
  it('rejects over-limit title and objective instead of truncating', () => {
    const longTitle = validateCampaign({ title: 'a'.repeat(CAMPAIGN_LIMITS.title + 1) });
    expect(longTitle.ok).toBe(false);
    expect(longTitle.value).toBeNull();

    const longObj = validateCampaign({ title: 'ok', objective: 'a'.repeat(CAMPAIGN_LIMITS.objective + 1) });
    expect(longObj.ok).toBe(false);
    expect(longObj.value).toBeNull();
  });

  it('accepts exactly-at-limit values (the boundary is inclusive, as in the CHECK)', () => {
    const r = validateCampaign({
      title: 'a'.repeat(CAMPAIGN_LIMITS.title),
      objective: 'b'.repeat(CAMPAIGN_LIMITS.objective),
    });
    expect(r.ok).toBe(true);
  });

  it('accepts ISO dates and rejects malformed or impossible ones', () => {
    expect(validateCampaign({ title: 'x', startDate: '2026-08-01' }).ok).toBe(true);
    expect(validateCampaign({ title: 'x', startDate: '01/08/2026' }).ok).toBe(false);
    expect(validateCampaign({ title: 'x', startDate: '2026-02-31' }).ok).toBe(false);
    expect(validateCampaign({ title: 'x', endDate: '2026-13-01' }).ok).toBe(false);
  });

  it('rejects an inverted date range (mirror of campaigns_date_order)', () => {
    const r = validateCampaign({ title: 'x', startDate: '2026-09-01', endDate: '2026-08-01' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('מוקדם');
  });

  it('accepts equal start and end dates (a one-day campaign is legal)', () => {
    expect(validateCampaign({ title: 'x', startDate: '2026-08-01', endDate: '2026-08-01' }).ok).toBe(true);
  });

  it('accepts one date without the other', () => {
    expect(validateCampaign({ title: 'x', startDate: '2026-08-01' }).ok).toBe(true);
    expect(validateCampaign({ title: 'x', endDate: '2026-08-01' }).ok).toBe(true);
  });

  it('never throws on hostile input', () => {
    for (const bad of [null, undefined, 0, '', [], 'string']) {
      expect(() => validateCampaign(bad)).not.toThrow();
      expect(validateCampaign(bad).ok).toBe(false);
    }
  });
});

describe('canCreateWithin (advisory mirror of the 200-row quota)', () => {
  it('permits an attempt below the cap and refuses at or above it', () => {
    expect(canCreateWithin(0)).toBe(true);
    expect(canCreateWithin(CAMPAIGN_QUOTA - 1)).toBe(true);
    expect(canCreateWithin(CAMPAIGN_QUOTA)).toBe(false);
    expect(canCreateWithin(CAMPAIGN_QUOTA + 1)).toBe(false);
  });

  it('refuses a count it cannot trust rather than assuming room', () => {
    for (const bad of [null, undefined, -1, NaN, Infinity, 'ten', {}]) {
      expect(canCreateWithin(bad)).toBe(false);
    }
  });

  it('mirrors the number in the migration', () => {
    expect(CAMPAIGN_QUOTA).toBe(200);
  });
});

describe('normalizeCampaignRow', () => {
  const row = {
    id: 'c1', user_id: 'u1', title: 'קמפיין', objective: 'מטרה', status: 'active',
    start_date: '2026-08-01', end_date: '2026-08-31',
    created_at: '2026-07-28T10:00:00Z', updated_at: '2026-07-28T10:00:00Z',
  };

  it('maps a well-formed row to the canonical camelCase shape', () => {
    expect(normalizeCampaignRow(row)).toEqual({
      id: 'c1', userId: 'u1', title: 'קמפיין', objective: 'מטרה', status: 'active',
      startDate: '2026-08-01', endDate: '2026-08-31',
      createdAt: '2026-07-28T10:00:00Z', updatedAt: '2026-07-28T10:00:00Z',
    });
  });

  it('drops a row it cannot trust rather than rendering half a campaign', () => {
    expect(normalizeCampaignRow({ ...row, id: '' })).toBeNull();
    expect(normalizeCampaignRow({ ...row, user_id: null })).toBeNull();
    expect(normalizeCampaignRow({ ...row, title: '   ' })).toBeNull();
    expect(normalizeCampaignRow({ ...row, status: 'archived' })).toBeNull();
    expect(normalizeCampaignRow(null)).toBeNull();
    expect(normalizeCampaignRow('nope')).toBeNull();
  });

  it('turns absent optional columns into null, not into the string "null"', () => {
    const r = normalizeCampaignRow({ ...row, objective: null, start_date: null, end_date: null });
    expect(r.objective).toBeNull();
    expect(r.startDate).toBeNull();
    expect(r.endDate).toBeNull();
  });
});

describe('sortCampaignsNewestFirst', () => {
  it('orders by createdAt descending, matching campaigns_user_created_idx', () => {
    const out = sortCampaignsNewestFirst([
      { id: 'b', createdAt: '2026-07-02T00:00:00Z' },
      { id: 'a', createdAt: '2026-07-03T00:00:00Z' },
      { id: 'c', createdAt: '2026-07-01T00:00:00Z' },
    ]);
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate its input and tolerates junk', () => {
    const input = [{ id: 'a', createdAt: '2026-07-01T00:00:00Z' }];
    const copy = [...input];
    sortCampaignsNewestFirst(input);
    expect(input).toEqual(copy);
    expect(sortCampaignsNewestFirst(null)).toEqual([]);
    expect(sortCampaignsNewestFirst([null, undefined])).toEqual([]);
  });
});

// Campaign delete safety — the count behind the confirmation copy.
describe('countTasksForCampaign · the KNOWN link count (warning, never a gate)', () => {
  const tasks = [
    { id: 't1', campaignId: 'c1' },
    { id: 't2', campaignId: 'c1' },
    { id: 't3', campaignId: 'c2' },
    { id: 't4', campaignId: null },
    { id: 't5' },
  ];

  it('counts only the tasks pointing at that campaign', () => {
    expect(countTasksForCampaign(tasks, 'c1')).toBe(2);
    expect(countTasksForCampaign(tasks, 'c2')).toBe(1);
  });

  it('an unknown campaign counts zero (never throws, never matches loosely)', () => {
    expect(countTasksForCampaign(tasks, 'c-does-not-exist')).toBe(0);
  });

  it('unlinked tasks — null and absent campaignId — are never counted', () => {
    expect(countTasksForCampaign([{ campaignId: null }, {}], 'c1')).toBe(0);
  });

  it('a blank/missing campaign id counts zero rather than matching unlinked tasks', () => {
    // The trap: str(null) === str(undefined) === '', so without the early
    // return an empty id would match every UNLINKED task and the copy would
    // claim links that do not exist.
    expect(countTasksForCampaign(tasks, null)).toBe(0);
    expect(countTasksForCampaign(tasks, '')).toBe(0);
    expect(countTasksForCampaign(tasks, undefined)).toBe(0);
  });

  it('a missing or malformed task list is zero, not a crash', () => {
    expect(countTasksForCampaign(null, 'c1')).toBe(0);
    expect(countTasksForCampaign(undefined, 'c1')).toBe(0);
    expect(countTasksForCampaign([], 'c1')).toBe(0);
    expect(countTasksForCampaign([null, undefined], 'c1')).toBe(0);
  });

  it('is pure — it does not mutate the list it is given', () => {
    const input = [{ id: 't1', campaignId: 'c1' }];
    const copy = JSON.parse(JSON.stringify(input));
    countTasksForCampaign(input, 'c1');
    expect(input).toEqual(copy);
  });
});

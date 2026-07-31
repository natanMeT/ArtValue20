import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeAssetRow, filterFavoriteAssets, nextFavoriteState, sortAssetsNewestFirst,
} from '../assetLibrary.js';

// ===================================================================
// Asset Library slice 2 — favorites: the pure rules and the IO seam.
//
// SCOPE OF THIS EVIDENCE, stated plainly: everything below runs against a
// recording double. It proves the CLIENT contract — what is sent, what is
// believed, and what is refused. It does NOT prove the server enforcement
// (the RLS update policy and the single-column grant). Those live in Postgres
// and are covered by the migration rehearsal and the owner-run controls.
// ===================================================================

const UID = '11111111-2222-4333-8444-555555555555';
const AID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const row = (over = {}) => ({
  id: AID, user_id: UID, ext: 'png', mime: 'image/png', byte_size: 10,
  storage_path: `${UID}/${AID}.png`, created_at: '2026-08-01T00:00:00Z', ...over,
});

describe('normalizeAssetRow · the favorite flag is read strictly', () => {
  it('carries a true flag through', () => {
    expect(normalizeAssetRow(row({ is_favorite: true })).favorite).toBe(true);
  });

  it('reads a pre-slice-2 row (column absent) as NOT a favorite, never undefined', () => {
    const norm = normalizeAssetRow(row());
    expect(norm.favorite).toBe(false);
  });

  it('refuses to guess: any non-true value is false', () => {
    // an un-migrated database, a text column, or a driver that hands back 'f'
    // must never light up a star.
    for (const v of [false, null, undefined, 0, 1, 'f', 't', 'true', {}]) {
      expect(normalizeAssetRow(row({ is_favorite: v })).favorite).toBe(false);
    }
  });

  it('does not change any slice 1 field while adding the new one', () => {
    const norm = normalizeAssetRow(row({ is_favorite: true }));
    expect(norm.storagePath).toBe(`${UID}/${AID}.png`);
    expect(norm.kind).toBe('image');
    expect(norm.url).toBe(null);
  });
});

describe('filterFavoriteAssets · a filter, not a re-ordering', () => {
  const items = [
    { id: 'a', createdAt: 3, favorite: false },
    { id: 'b', createdAt: 2, favorite: true },
    { id: 'c', createdAt: 1, favorite: true },
  ];

  it('keeps only starred items', () => {
    expect(filterFavoriteAssets(items).map((i) => i.id)).toEqual(['b', 'c']);
  });

  it('PRESERVES the given order — starring must never move an item', () => {
    const sorted = sortAssetsNewestFirst(items);
    expect(filterFavoriteAssets(sorted).map((i) => i.createdAt)).toEqual([2, 1]);
  });

  it('is total: a non-array, or items with no flag, yield an empty list not a crash', () => {
    expect(filterFavoriteAssets(null)).toEqual([]);
    expect(filterFavoriteAssets(undefined)).toEqual([]);
    expect(filterFavoriteAssets([{ id: 'x' }, null])).toEqual([]);
  });
});

describe('nextFavoriteState · unknown must resolve to "star it", not to a flip', () => {
  it('toggles a known state', () => {
    expect(nextFavoriteState({ favorite: true })).toBe(false);
    expect(nextFavoriteState({ favorite: false })).toBe(true);
  });

  it('treats an absent/malformed flag as not-a-favorite, so the first click stars', () => {
    for (const item of [{}, { favorite: undefined }, { favorite: null }, { favorite: 'yes' }, null]) {
      expect(nextFavoriteState(item)).toBe(true);
    }
  });
});

// ===================================================================
// The IO seam. THE failure this covers: PostgREST reports an RLS-refused
// update as SUCCESS WITH ZERO ROWS — there is no error to guard on. A client
// that trusts the absent error claims a save that never happened.
// ===================================================================
const h = vi.hoisted(() => ({ calls: [], data: null, error: null }));

vi.mock('../supabase.js', () => ({
  supabase: {
    from: (table) => {
      const chain = {
        update: (patch) => { h.calls.push({ op: 'update', table, patch }); return chain; },
        eq: (col, val) => { h.calls.push({ op: 'eq', col, val }); return chain; },
        select: (cols) => { h.calls.push({ op: 'select', cols }); return Promise.resolve({ data: h.data, error: h.error }); },
      };
      return chain;
    },
    storage: { from: () => ({}) },
  },
}));

const { setAssetFavorite } = await import('../api.js');

beforeEach(() => { h.calls = []; h.data = null; h.error = null; });

describe('setAssetFavorite · persist-first, server-confirmed', () => {
  it('sends is_favorite and NOTHING else — the only column the grant allows', async () => {
    h.data = [{ id: AID, is_favorite: true }];
    await setAssetFavorite(AID, true);
    const update = h.calls.find((c) => c.op === 'update');
    expect(Object.keys(update.patch)).toEqual(['is_favorite']);
    expect(update.patch.is_favorite).toBe(true);
    expect(update.table).toBe('assets');
  });

  it('filters by the asset id and asks for the row BACK as its evidence', async () => {
    h.data = [{ id: AID, is_favorite: false }];
    await setAssetFavorite(AID, false);
    expect(h.calls).toContainEqual({ op: 'eq', col: 'id', val: AID });
    expect(h.calls.some((c) => c.op === 'select')).toBe(true);
  });

  it('coerces the flag to a strict boolean — no truthy string reaches the row', async () => {
    h.data = [{ id: AID, is_favorite: false }];
    await setAssetFavorite(AID, 'yes');
    expect(h.calls.find((c) => c.op === 'update').patch.is_favorite).toBe(false);
  });

  it('REJECTS when the server changed ZERO rows — the RLS-refusal case, which carries no error', async () => {
    h.data = []; h.error = null;
    await expect(setAssetFavorite(AID, true)).rejects.toThrow(/לא נשמר/);
  });

  it('REJECTS when the server returns a state other than the one requested', async () => {
    h.data = [{ id: AID, is_favorite: false }];
    await expect(setAssetFavorite(AID, true)).rejects.toThrow(/לא נשמר/);
  });

  it('REJECTS a real error instead of swallowing it', async () => {
    h.error = new Error('permission denied for column prompt');
    await expect(setAssetFavorite(AID, true)).rejects.toThrow('permission denied for column prompt');
  });

  it('resolves with the CONFIRMED state on success', async () => {
    h.data = [{ id: AID, is_favorite: true }];
    await expect(setAssetFavorite(AID, true)).resolves.toBe(true);
  });

  it('touches NO storage — favorites are a row update, with no second write', async () => {
    h.data = [{ id: AID, is_favorite: true }];
    await setAssetFavorite(AID, true);
    expect(h.calls.every((c) => c.table === undefined || c.table === 'assets')).toBe(true);
    expect(h.calls.some((c) => /upload|remove|sign/.test(c.op))).toBe(false);
  });
});

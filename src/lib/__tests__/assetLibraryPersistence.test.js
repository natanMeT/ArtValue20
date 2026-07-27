import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===================================================================
// Asset Library slice 1 — the IO ORDERING contract, at the api.js seam.
//
// THE RULE UNDER TEST: always fail toward the VISIBLE state.
//   create: ROW first, then BYTES  (a failed upload leaves a visible
//           dangling row, never an invisible orphan object)
//   delete: OBJECT first, then ROW (a failed remove leaves the row, so
//           nothing claims a success that did not happen)
//
// These are the two failure modes the slice was required to control:
//   NC-1  a row whose file was NOT deleted
//   NC-2  quota exploitation
//
// SCOPE OF THIS EVIDENCE — stated plainly. This file proves the CLIENT
// ordering and refusals against a recording double. It does NOT prove the
// server enforcement (RLS, the path CHECK, the quota policy): those live in
// Postgres and are verified by the owner-run SQL controls in the PR body,
// against the live database, after the migration is applied.
// ===================================================================

const h = vi.hoisted(() => ({
  calls: [],                 // ordered log of every IO operation
  insertError: null,
  selectRows: [],
  selectError: null,
  uploadError: null,
  removeError: null,
  deleteRowError: null,
  signed: [],
  signedError: null,
}));

vi.mock('../supabase.js', () => ({
  supabase: {
    from: (table) => {
      const chain = {
        insert: (row) => { h.calls.push({ op: 'row.insert', table, row }); return Promise.resolve({ error: h.insertError }); },
        select: () => { h.calls.push({ op: 'row.select', table }); return chain; },
        order: () => Promise.resolve({ data: h.selectRows, error: h.selectError }),
        delete: () => chain,
        eq: (col, val) => { h.calls.push({ op: 'row.delete', table, col, val }); return Promise.resolve({ error: h.deleteRowError }); },
      };
      return chain;
    },
    storage: {
      from: (bucket) => ({
        upload: (path, blob, opts) => {
          h.calls.push({ op: 'object.upload', bucket, path, opts, type: blob?.type, size: blob?.size });
          return Promise.resolve({ error: h.uploadError });
        },
        remove: (paths) => {
          h.calls.push({ op: 'object.remove', bucket, paths });
          return Promise.resolve({ error: h.removeError });
        },
        createSignedUrls: (paths, ttl) => {
          h.calls.push({ op: 'object.signedUrls', bucket, paths, ttl });
          return Promise.resolve({ data: h.signed, error: h.signedError });
        },
        getPublicUrl: () => { h.calls.push({ op: 'object.PUBLIC_URL' }); return { data: { publicUrl: 'x' } }; },
      }),
    },
  },
}));

import * as api from '../api.js';
import { ASSET_QUOTA, ASSET_MAX_BYTES } from '../assetLibrary.js';

const UID = '11111111-2222-4333-8444-555555555555';
const blob = (type = 'image/png', size = 1024) => ({ type, size });
const ops = () => h.calls.map((c) => c.op);

beforeEach(() => {
  h.calls = [];
  h.insertError = null; h.selectRows = []; h.selectError = null;
  h.uploadError = null; h.removeError = null; h.deleteRowError = null;
  h.signed = []; h.signedError = null;
});

// -------------------------------------------------------------------
describe('createAsset — ROW first, then BYTES', () => {
  it('writes the row before the object, and only then reports success', async () => {
    const id = await api.createAsset(UID, blob(), { source: 'text-to-image' }, 0);
    expect(ops()).toEqual(['row.insert', 'object.upload']);
    expect(id).toBeTruthy();
  });

  it('stores the object at exactly {uid}/{asset_id}.{ext} and the row agrees', async () => {
    const id = await api.createAsset(UID, blob('image/webp'), {}, 0);
    const [ins, up] = h.calls;
    expect(up.path).toBe(`${UID}/${id}.webp`);
    expect(ins.row.storage_path).toBe(up.path);
    expect(ins.row.user_id).toBe(UID);
    expect(ins.row.ext).toBe('webp');
  });

  it('uploads with upsert:false — there is no UPDATE policy, so an overwrite must be REJECTED', async () => {
    await api.createAsset(UID, blob(), {}, 0);
    const up = h.calls.find((c) => c.op === 'object.upload');
    expect(up.opts.upsert).toBe(false);
    expect(up.opts.contentType).toBe('image/png');
  });

  it('a failed ROW insert writes nothing at all — no object is uploaded', async () => {
    h.insertError = new Error('rls');
    await expect(api.createAsset(UID, blob(), {}, 0)).rejects.toBeTruthy();
    expect(ops()).toEqual(['row.insert']);
    expect(ops()).not.toContain('object.upload');
  });

  it('a failed UPLOAD rejects, and DELIBERATELY leaves the row (visible), never deleting it', async () => {
    h.uploadError = new Error('quota');
    await expect(api.createAsset(UID, blob(), {}, 0)).rejects.toMatchObject({ userSafe: true });
    // the row is NOT cleaned up: a "failed" upload that actually landed would
    // otherwise become an invisible orphan object.
    expect(ops()).toEqual(['row.insert', 'object.upload']);
    expect(ops()).not.toContain('row.delete');
  });

  it('the dangling row is identified on the error so the UI can surface it', async () => {
    h.uploadError = new Error('quota');
    await expect(api.createAsset(UID, blob(), {}, 0)).rejects.toMatchObject({
      danglingAssetId: expect.any(String),
    });
  });
});

// -------------------------------------------------------------------
describe('createAsset — server rules are mirrored BEFORE anything is written', () => {
  it('refuses a disallowed MIME with no row and no object', async () => {
    await expect(api.createAsset(UID, blob('image/gif'), {}, 0)).rejects.toMatchObject({ userSafe: true });
    expect(h.calls).toHaveLength(0);
  });

  it('refuses an over-size file with no row and no object', async () => {
    await expect(api.createAsset(UID, blob('image/png', ASSET_MAX_BYTES + 1), {}, 0))
      .rejects.toMatchObject({ userSafe: true });
    expect(h.calls).toHaveLength(0);
  });

  it('NC-2 · quota exploitation — the 41st write is refused before any IO', async () => {
    await expect(api.createAsset(UID, blob(), {}, ASSET_QUOTA)).rejects.toMatchObject({ userSafe: true });
    expect(h.calls).toHaveLength(0);
    // and the boundary is not off by one: the 40th still writes
    await api.createAsset(UID, blob(), {}, ASSET_QUOTA - 1);
    expect(ops()).toEqual(['row.insert', 'object.upload']);
  });

  it('refuses when the account id is missing — never writes to an unscoped path', async () => {
    await expect(api.createAsset(null, blob(), {}, 0)).rejects.toBeTruthy();
    expect(h.calls).toHaveLength(0);
  });

  it('bounds the metadata written to the row', async () => {
    await api.createAsset(UID, blob(), { prompt: 'p'.repeat(9000), junk: 'x' }, 0);
    const row = h.calls[0].row;
    expect(row.prompt).toHaveLength(2000);
    expect(row.junk).toBeUndefined();
  });
});

// -------------------------------------------------------------------
describe('deleteAsset — OBJECT first, then ROW', () => {
  const path = `${UID}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.png`;
  const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  it('removes the object before the row', async () => {
    await api.deleteAsset(path, id);
    expect(ops()).toEqual(['object.remove', 'row.delete']);
    expect(h.calls[0].paths).toEqual([path]);
  });

  it('NC-1 · a row whose file was NOT deleted — a failed object remove leaves the row and rejects', async () => {
    h.removeError = new Error('storage down');
    await expect(api.deleteAsset(path, id)).rejects.toBeTruthy();
    // THE control: the row delete must NOT have been attempted. If it had, the
    // object would survive with no row pointing at it — invisible forever.
    expect(ops()).toEqual(['object.remove']);
    expect(ops()).not.toContain('row.delete');
  });

  it('a failed ROW delete rejects — the item stays visible and the delete is retryable', async () => {
    h.deleteRowError = new Error('network');
    await expect(api.deleteAsset(path, id)).rejects.toBeTruthy();
    expect(ops()).toEqual(['object.remove', 'row.delete']);
  });
});

// -------------------------------------------------------------------
describe('listAssets — signed URLs only, dangling rows stay visible', () => {
  const AID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const BID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
  const rowFor = (id, ext = 'png', createdAt = '2026-07-27T10:00:00.000Z') => ({
    id, user_id: UID, ext, mime: `image/${ext}`, byte_size: 10,
    storage_path: `${UID}/${id}.${ext}`, kind: 'image', created_at: createdAt,
  });

  it('mints SHORT-LIVED SIGNED urls and never a public url', async () => {
    h.selectRows = [rowFor(AID)];
    h.signed = [{ path: `${UID}/${AID}.png`, signedUrl: 'https://signed/a', error: null }];
    const items = await api.listAssets();
    expect(items[0].url).toBe('https://signed/a');
    const call = h.calls.find((c) => c.op === 'object.signedUrls');
    expect(call.ttl).toBeLessThanOrEqual(300);
    expect(ops()).not.toContain('object.PUBLIC_URL');
  });

  it('keeps a row whose object is MISSING, with url null, so the user can see and delete it', async () => {
    h.selectRows = [rowFor(AID), rowFor(BID)];
    h.signed = [
      { path: `${UID}/${AID}.png`, signedUrl: 'https://signed/a', error: null },
      { path: `${UID}/${BID}.png`, signedUrl: null, error: { message: 'not found' } },
    ];
    const items = await api.listAssets();
    expect(items).toHaveLength(2);                                   // NOT filtered out
    expect(items.find((i) => i.id === BID).url).toBeNull();
  });

  it('drops a row whose path does not reconstruct from its own columns', async () => {
    const foreign = { ...rowFor(AID), storage_path: `99999999-8888-4777-8666-555555555555/${AID}.png` };
    h.selectRows = [foreign, rowFor(BID)];
    h.signed = [{ path: `${UID}/${BID}.png`, signedUrl: 'https://signed/b', error: null }];
    const items = await api.listAssets();
    expect(items.map((i) => i.id)).toEqual([BID]);
  });

  it('returns newest first', async () => {
    h.selectRows = [rowFor(AID, 'png', '2026-07-01T00:00:00.000Z'), rowFor(BID, 'png', '2026-07-27T00:00:00.000Z')];
    h.signed = [];
    const items = await api.listAssets();
    expect(items.map((i) => i.id)).toEqual([BID, AID]);
  });

  it('issues no signed-url call at all for an empty library', async () => {
    h.selectRows = [];
    expect(await api.listAssets()).toEqual([]);
    expect(ops()).not.toContain('object.signedUrls');
  });
});

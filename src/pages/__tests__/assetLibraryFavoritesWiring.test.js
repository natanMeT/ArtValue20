import { describe, it, expect, vi } from 'vitest';
import { createCloudAssetStore, createDeviceGalleryAdapter } from '../ImageStudio.jsx';

// ===================================================================
// Asset Library slice 2 — the favorites capability at the gallery seam.
//
// The page must decide what to render by asking whether the CAPABILITY exists,
// never by testing which mode it is in. So the durable backing exposes
// `setFavorite` and the device backing must NOT — a no-op stub would let the
// star render and then silently do nothing, which is the false-success class
// this project spent S0A closing.
// ===================================================================

const UID = '11111111-2222-4333-8444-555555555555';

const io = () => ({
  listAssets: vi.fn().mockResolvedValue([]),
  createAsset: vi.fn().mockResolvedValue('new-id'),
  deleteAsset: vi.fn().mockResolvedValue(true),
  setAssetFavorite: vi.fn().mockResolvedValue(true),
});

describe('cloud adapter · favorites exist and are addressed by the item\'s own id', () => {
  it('exposes the capability', () => {
    expect(typeof createCloudAssetStore(UID, io()).setFavorite).toBe('function');
  });

  it('passes the asset id and the requested state through unchanged', async () => {
    const x = io();
    await createCloudAssetStore(UID, x).setFavorite({ id: 'a1', favorite: false }, true);
    expect(x.setAssetFavorite).toHaveBeenCalledWith('a1', true);
  });

  it('sends the state it was GIVEN — it does not re-derive the toggle itself', async () => {
    // two callers computing the next state independently is how a UI and an IO
    // layer drift apart; the next state is decided once, upstream.
    const x = io();
    await createCloudAssetStore(UID, x).setFavorite({ id: 'a1', favorite: true }, false);
    expect(x.setAssetFavorite).toHaveBeenCalledWith('a1', false);
  });

  it('PROPAGATES a failure instead of resolving — no optimistic star survives it', async () => {
    const x = io();
    x.setAssetFavorite.mockRejectedValue(new Error('העדכון לא נשמר. רענן ונסה שוב.'));
    await expect(createCloudAssetStore(UID, x).setFavorite({ id: 'a1' }, true))
      .rejects.toThrow(/לא נשמר/);
  });

  it('leaves the slice 1 operations untouched', async () => {
    const x = io();
    const store = createCloudAssetStore(UID, x);
    await store.add({ type: 'image/png' }, { source: 's' }, 7);
    await store.remove({ id: 'a1', storagePath: `${UID}/a1.png` });
    expect(x.createAsset).toHaveBeenCalledWith(UID, { type: 'image/png' }, { source: 's' }, 7);
    expect(x.deleteAsset).toHaveBeenCalledWith(`${UID}/a1.png`, 'a1');
    expect(store.durable).toBe(true);
  });
});

describe('device adapter · the capability is ABSENT, not a silent no-op', () => {
  const store = () => ({
    dbName: 'artvalue_gallery_local',
    list: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue('id'),
    remove: vi.fn().mockResolvedValue(true),
  });

  it('does not expose setFavorite as a callable', () => {
    expect(createDeviceGalleryAdapter(store()).setFavorite).toBeFalsy();
  });

  it('stays non-durable and otherwise unchanged by slice 2', async () => {
    const s = store();
    const adapter = createDeviceGalleryAdapter(s);
    expect(adapter.durable).toBe(false);
    await adapter.remove({ id: 'g_123' });
    expect(s.remove).toHaveBeenCalledWith('g_123');
  });
});

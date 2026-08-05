import { describe, it, expect, vi } from 'vitest';
import {
  createCloudAssetStore, createDeviceGalleryAdapter, disposeGalleryItems,
} from '../ImageStudio.jsx';

// ===================================================================
// Asset Library slice 1 — the gallery seam inside ImageStudio.
//
// ONE interface, two backings. The page must not know which mode it is in,
// and the DURABLE backing must never be confused with the device one.
// ===================================================================

const UID = '11111111-2222-4333-8444-555555555555';

describe('cloud adapter — durable, account-scoped', () => {
  const io = () => ({
    listAssets: vi.fn().mockResolvedValue([]),
    createAsset: vi.fn().mockResolvedValue('new-id'),
    deleteAsset: vi.fn().mockResolvedValue(true),
  });

  it('declares itself durable, so truthful failure handling can key off it', () => {
    expect(createCloudAssetStore(UID, io()).durable).toBe(true);
  });

  it('passes the account id and the current count to every save', async () => {
    const x = io();
    await createCloudAssetStore(UID, x).add({ type: 'image/png' }, { source: 's' }, 7);
    expect(x.createAsset).toHaveBeenCalledWith(UID, { type: 'image/png' }, { source: 's' }, 7);
  });

  it('deletes by the item\'s OWN storage path — never a path built at the call site', async () => {
    const x = io();
    const item = { id: 'a1', storagePath: `${UID}/a1.png` };
    await createCloudAssetStore(UID, x).remove(item);
    expect(x.deleteAsset).toHaveBeenCalledWith(`${UID}/a1.png`, 'a1');
  });

  it('propagates a failure instead of resolving — the caller can never claim a false save', async () => {
    const x = io();
    x.createAsset.mockRejectedValue(new Error('upload failed'));
    await expect(createCloudAssetStore(UID, x).add({}, {}, 0)).rejects.toThrow('upload failed');
  });
});

describe('device adapter — the UNCHANGED local/demo store', () => {
  const store = () => ({
    dbName: 'artvalue_gallery_local',
    list: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue('id'),
    remove: vi.fn().mockResolvedValue(true),
  });

  it('is NOT durable, so cloud-only truthfulness rules do not fire in local/demo', () => {
    expect(createDeviceGalleryAdapter(store()).durable).toBe(false);
  });

  it('removes by id — the device store has no storage path', async () => {
    const s = store();
    await createDeviceGalleryAdapter(s).remove({ id: 'g_123' });
    expect(s.remove).toHaveBeenCalledWith('g_123');
  });

  it('keeps its account-scoped database name (S0F.1 isolation is unchanged)', () => {
    expect(createDeviceGalleryAdapter(store()).dbName).toBe('artvalue_gallery_local');
  });

  // Slice 4 — WHY UPLOAD IS DURABLE-ONLY, stated as a measured fact rather than
  // a preference. The device seam takes (blob, meta) and DROPS the third
  // argument, so an upload routed through it would silently lose the count the
  // truthful quota pre-refusal is computed from. The cloud seam takes all three.
  it('drops the count argument the upload path depends on', async () => {
    const s = store();
    await createDeviceGalleryAdapter(s).add({ type: 'image/png' }, { source: 'upload' }, 7);
    expect(s.add).toHaveBeenCalledWith({ type: 'image/png' }, { source: 'upload' });
    expect(s.add.mock.calls[0]).toHaveLength(2);
  });
});

describe('disposeGalleryItems — only object URLs are ours to release', () => {
  it('revokes blob: urls, as before', () => {
    const revoked = [];
    const n = disposeGalleryItems([{ url: 'blob:x/1' }, { url: 'blob:x/2' }], (u) => revoked.push(u));
    expect(n).toBe(2);
    expect(revoked).toEqual(['blob:x/1', 'blob:x/2']);
  });

  it('NEVER passes a short-lived SIGNED url to revokeObjectURL — it is not ours to revoke', () => {
    const revoked = [];
    const n = disposeGalleryItems(
      [{ url: 'https://project.supabase.co/storage/v1/object/sign/assets/x.png?token=abc' }],
      (u) => revoked.push(u),
    );
    expect(n).toBe(0);
    expect(revoked).toEqual([]);
  });

  it('skips a dangling item that has no url at all', () => {
    const revoked = [];
    expect(disposeGalleryItems([{ url: null }, {}], (u) => revoked.push(u))).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import {
  ASSET_MIME_TO_EXT, ASSET_MIME_ALLOWLIST, ASSET_MAX_BYTES, ASSET_QUOTA,
  isAssetUuid, assetStoragePath, assetExtForMime, sanitizeAssetMeta,
  validateAssetUpload, normalizeAssetRow, sortAssetsNewestFirst,
} from '../assetLibrary.js';

// ===================================================================
// Asset Library slice 1 — the PURE boundary. Every rule here mirrors a
// server rule; these tests pin the mirror, not the authority.
// ===================================================================

const UID = '11111111-2222-4333-8444-555555555555';
const AID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER = '99999999-8888-4777-8666-555555555555';

describe('asset path — byte-exact structural isolation', () => {
  it('builds exactly {uid}/{asset_id}.{ext}, the string the SQL CHECK reconstructs', () => {
    expect(assetStoragePath(UID, AID, 'png')).toBe(`${UID}/${AID}.png`);
    expect(assetStoragePath(UID, AID, 'webp')).toBe(`${UID}/${AID}.webp`);
  });

  it('never yields a path that is not owned by the given account', () => {
    const path = assetStoragePath(UID, AID, 'png');
    expect(path.startsWith(`${UID}/`)).toBe(true);
    expect(path.includes(OTHER)).toBe(false);
  });

  it('refuses to build a path from a malformed id rather than improvising one', () => {
    expect(assetStoragePath('not-a-uuid', AID, 'png')).toBeNull();
    expect(assetStoragePath(UID, 'nope', 'png')).toBeNull();
    expect(assetStoragePath(UID, AID, 'gif')).toBeNull();
    expect(assetStoragePath(UID, AID, '')).toBeNull();
    // path traversal can never be smuggled through the id
    expect(assetStoragePath('../..', AID, 'png')).toBeNull();
    expect(assetStoragePath(`${UID}/../${OTHER}`, AID, 'png')).toBeNull();
  });

  it('isAssetUuid accepts a real uuid and rejects near-misses', () => {
    expect(isAssetUuid(UID)).toBe(true);
    expect(isAssetUuid(`${UID}x`)).toBe(false);
    expect(isAssetUuid(null)).toBe(false);
    expect(isAssetUuid(undefined)).toBe(false);
  });
});

describe('MIME allowlist + extension mapping', () => {
  it('allows exactly the three image types the bucket allows', () => {
    expect(ASSET_MIME_ALLOWLIST).toEqual(['image/png', 'image/jpeg', 'image/webp']);
    expect(ASSET_MIME_TO_EXT['image/jpeg']).toBe('jpg');
  });

  it('rejects every disallowed type, including plausible ones', () => {
    for (const bad of ['image/gif', 'image/svg+xml', 'text/html', 'application/pdf', 'video/mp4', '', null]) {
      expect(assetExtForMime(bad)).toBeNull();
    }
  });

  it('is case-insensitive on the declared MIME', () => {
    expect(assetExtForMime('IMAGE/PNG')).toBe('png');
  });
});

describe('validateAssetUpload — truthful pre-refusal', () => {
  const base = { userId: UID, assetId: AID, mime: 'image/png', byteSize: 1024, currentCount: 0 };

  it('accepts a valid upload and returns the exact path it will use', () => {
    const v = validateAssetUpload(base);
    expect(v.ok).toBe(true);
    expect(v.path).toBe(`${UID}/${AID}.png`);
    expect(v.ext).toBe('png');
    expect(v.mime).toBe('image/png');
  });

  it('refuses a disallowed type and names it', () => {
    const v = validateAssetUpload({ ...base, mime: 'image/gif' });
    expect(v.ok).toBe(false);
    expect(v.error).toContain('image/gif');
  });

  it('refuses a file over 10MB and names the real size', () => {
    const v = validateAssetUpload({ ...base, byteSize: ASSET_MAX_BYTES + 1 });
    expect(v.ok).toBe(false);
    expect(v.error).toContain('10MB');
  });

  it('accepts a file exactly at the limit (the boundary is inclusive, as in the CHECK)', () => {
    expect(validateAssetUpload({ ...base, byteSize: ASSET_MAX_BYTES }).ok).toBe(true);
  });

  it('refuses an empty or unreadable blob', () => {
    expect(validateAssetUpload({ ...base, byteSize: 0 }).ok).toBe(false);
    expect(validateAssetUpload({ ...base, byteSize: undefined }).ok).toBe(false);
  });

  it('refuses at the quota and names it — the 40th is allowed, the 41st is not', () => {
    expect(validateAssetUpload({ ...base, currentCount: ASSET_QUOTA - 1 }).ok).toBe(true);
    const v = validateAssetUpload({ ...base, currentCount: ASSET_QUOTA });
    expect(v.ok).toBe(false);
    expect(v.error).toContain(String(ASSET_QUOTA));
  });

  it('refuses when the account cannot be identified — never falls back to an unscoped path', () => {
    const v = validateAssetUpload({ ...base, userId: null });
    expect(v.ok).toBe(false);
    expect(v.path).toBeUndefined();
  });
});

describe('metadata is bounded so a row can never become a payload', () => {
  it('keeps only the known fields, trimmed', () => {
    expect(sanitizeAssetMeta({ source: ' text-to-image ', prompt: 'x', nope: 'drop', blob: 'huge' }))
      .toEqual({ source: 'text-to-image', prompt: 'x' });
  });

  it('truncates to the CHECK limits instead of writing an over-limit row', () => {
    const out = sanitizeAssetMeta({ prompt: 'p'.repeat(5000), source: 's'.repeat(200) });
    expect(out.prompt).toHaveLength(2000);
    expect(out.source).toHaveLength(40);
  });

  it('handles absent / non-object metadata', () => {
    expect(sanitizeAssetMeta(null)).toEqual({});
    expect(sanitizeAssetMeta('nope')).toEqual({});
  });
});

describe('normalizeAssetRow — hydration is as strict as a save', () => {
  const row = {
    id: AID, user_id: UID, ext: 'png', mime: 'image/png', byte_size: 2048,
    storage_path: `${UID}/${AID}.png`, kind: 'image', source: 'text-to-image',
    prompt: 'a cat', created_at: '2026-07-27T10:00:00.000Z',
  };

  it('normalizes a well-formed row', () => {
    const a = normalizeAssetRow(row);
    expect(a.id).toBe(AID);
    expect(a.storagePath).toBe(`${UID}/${AID}.png`);
    expect(a.kind).toBe('image');
    expect(a.meta).toEqual({ source: 'text-to-image', prompt: 'a cat' });
    expect(a.url).toBeNull(); // filled in later from a signed URL
  });

  it('REJECTS a row whose stored path does not reconstruct from its own columns', () => {
    // this is the client-side mirror of assets_storage_path_matches_owner:
    // a row pointing at another account's object is not rendered at all.
    expect(normalizeAssetRow({ ...row, storage_path: `${OTHER}/${AID}.png` })).toBeNull();
    expect(normalizeAssetRow({ ...row, storage_path: `${UID}/${AID}.webp` })).toBeNull();
    expect(normalizeAssetRow({ ...row, storage_path: '../secrets.png' })).toBeNull();
  });

  it('rejects a row with a malformed id or owner', () => {
    expect(normalizeAssetRow({ ...row, id: 'x' })).toBeNull();
    expect(normalizeAssetRow({ ...row, user_id: 'x' })).toBeNull();
    expect(normalizeAssetRow(null)).toBeNull();
  });
});

describe('ordering', () => {
  it('sorts newest first', () => {
    const out = sortAssetsNewestFirst([{ createdAt: 1 }, { createdAt: 3 }, { createdAt: 2 }]);
    expect(out.map((x) => x.createdAt)).toEqual([3, 2, 1]);
  });

  it('does not mutate its input', () => {
    const input = [{ createdAt: 1 }, { createdAt: 2 }];
    sortAssetsNewestFirst(input);
    expect(input.map((x) => x.createdAt)).toEqual([1, 2]);
  });
});

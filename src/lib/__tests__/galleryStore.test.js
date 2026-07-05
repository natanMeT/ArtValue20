import { describe, it, expect } from 'vitest';
import {
  normalizeGalleryKind, normalizeGalleryMeta, normalizeGalleryRecord,
  filterGalleryItems, GALLERY_KINDS, GALLERY_MAX,
} from '../galleryStore.js';

// ===================================================================
// galleryStore — pure record-normalization + filter coverage for the
// video render-history slice. No IndexedDB, no ComfyUI, no browser.
// ===================================================================

describe('normalizeGalleryKind', () => {
  it('keeps valid kinds', () => {
    expect(normalizeGalleryKind('image')).toBe('image');
    expect(normalizeGalleryKind('video')).toBe('video');
  });
  it('defaults invalid / missing kind to image', () => {
    for (const bad of [undefined, null, '', 'clip', 'audio', 42, {}]) {
      expect(normalizeGalleryKind(bad)).toBe('image');
    }
  });
  it('exposes the supported kinds', () => {
    expect(GALLERY_KINDS).toEqual(['image', 'video']);
  });
});

describe('normalizeGalleryMeta', () => {
  it('keeps only the known string fields', () => {
    expect(normalizeGalleryMeta({ source: 'text-to-image', prompt: 'p', preset: 'x', engine: 'local' }))
      .toEqual({ source: 'text-to-image', prompt: 'p', preset: 'x', engine: 'local' });
  });
  it('drops unknown keys and non-string / empty values', () => {
    expect(normalizeGalleryMeta({ source: 'pack', bogus: 'y', prompt: 42, preset: '', engine: null }))
      .toEqual({ source: 'pack' });
  });
  it('degrades gracefully on missing / non-object meta', () => {
    expect(normalizeGalleryMeta(undefined)).toEqual({});
    expect(normalizeGalleryMeta(null)).toEqual({});
    expect(normalizeGalleryMeta('nope')).toEqual({});
    expect(normalizeGalleryMeta({})).toEqual({});
  });
});

describe('normalizeGalleryRecord — backward compatibility', () => {
  it('old { id, blob, createdAt } record normalizes to kind image + empty meta', () => {
    const old = { id: 'g_1', blob: {}, createdAt: 111 };
    expect(normalizeGalleryRecord(old)).toEqual({ id: 'g_1', createdAt: 111, kind: 'image', meta: {} });
  });
  it('new image record preserves kind image + meta', () => {
    const rec = { id: 'g_2', createdAt: 222, kind: 'image', meta: { source: 'smart-edit', engine: 'local' } };
    expect(normalizeGalleryRecord(rec)).toEqual({ id: 'g_2', createdAt: 222, kind: 'image', meta: { source: 'smart-edit', engine: 'local' } });
  });
  it('new video record preserves kind video + meta', () => {
    const rec = { id: 'g_3', createdAt: 333, kind: 'video', meta: { source: 'image-to-video', prompt: 'motion' } };
    expect(normalizeGalleryRecord(rec)).toEqual({ id: 'g_3', createdAt: 333, kind: 'video', meta: { source: 'image-to-video', prompt: 'motion' } });
  });
  it('invalid kind falls back to image; partial meta is sanitized', () => {
    const rec = { id: 'g_4', createdAt: 444, kind: 'clip', meta: { source: 'x', junk: 1 } };
    expect(normalizeGalleryRecord(rec)).toEqual({ id: 'g_4', createdAt: 444, kind: 'image', meta: { source: 'x' } });
  });
  it('never throws on null/empty', () => {
    expect(normalizeGalleryRecord(null)).toEqual({ id: undefined, createdAt: undefined, kind: 'image', meta: {} });
  });
});

describe('filterGalleryItems', () => {
  const items = [
    { id: 'a', kind: 'image' },
    { id: 'b', kind: 'video' },
    { id: 'c', kind: 'image' },
    { id: 'd' }, // legacy → treated as image
  ];
  it('all returns everything', () => {
    expect(filterGalleryItems(items, 'all').map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('image returns image + legacy records', () => {
    expect(filterGalleryItems(items, 'image').map((x) => x.id)).toEqual(['a', 'c', 'd']);
  });
  it('video returns only video records', () => {
    expect(filterGalleryItems(items, 'video').map((x) => x.id)).toEqual(['b']);
  });
  it('unknown tab and non-array input degrade safely', () => {
    expect(filterGalleryItems(items, 'whatever').map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(filterGalleryItems(null, 'all')).toEqual([]);
    expect(filterGalleryItems(undefined, 'video')).toEqual([]);
  });
});

describe('cap constant is kind-agnostic', () => {
  it('GALLERY_MAX is a single shared cap (no per-kind cap)', () => {
    expect(GALLERY_MAX).toBe(40);
    expect(typeof GALLERY_MAX).toBe('number');
  });
});

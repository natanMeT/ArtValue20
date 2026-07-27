// ===================================================================
// Image gallery — persistent collection of generated images.
// Bytes live in IndexedDB (keeps the main app state small). Capped so
// it never grows unbounded. Used to collect shots of the same subject
// and feed them into the video montage.
//
// S0F.1: access is ONLY through createGalleryStore(session) — there is no
// unscoped read/write entry point left, so no caller can reach a
// device-global gallery.
// ===================================================================

import { userScopeKey } from './userIdentity.js';

// S0F.1 (D6) — the gallery is scoped PER ACCOUNT. `artvalue_gallery` (bare)
// is the PRE-S0F.1 device-global database: it is LEGACY and is never opened,
// read, migrated, copied or deleted here. A scoped name is always
// `artvalue_gallery_<user.id>` (or `artvalue_gallery_local` with no session),
// so it can never collide with the legacy database by construction. A future
// explicit import may surface legacy assets; nothing implicit ever will.
const DB_NAME_BASE = 'artvalue_gallery';
const STORE = 'items';
export const GALLERY_MAX = 40;

// --- Record normalization (pure) ------------------------------------
// Records gained kind/meta over time. Old rows ({id,blob,createdAt}) must
// still read cleanly, so every read is normalized: unknown/invalid kind →
// 'image', missing meta → {}. No IndexedDB version bump or migration — new
// rows just carry the extra fields and old rows default on read.
export const GALLERY_KINDS = ['image', 'video'];

export function normalizeGalleryKind(kind) {
  return GALLERY_KINDS.includes(kind) ? kind : 'image';
}

// Keep only the small known string fields; drop anything else / non-strings.
export function normalizeGalleryMeta(meta) {
  if (!meta || typeof meta !== 'object') return {};
  const out = {};
  for (const k of ['source', 'prompt', 'preset', 'engine']) {
    if (typeof meta[k] === 'string' && meta[k]) out[k] = meta[k];
  }
  return out;
}

// Normalize a raw stored row into the public shape (without the blob).
export function normalizeGalleryRecord(record) {
  const r = record || {};
  return {
    id: r.id,
    createdAt: r.createdAt,
    kind: normalizeGalleryKind(r.kind),
    meta: normalizeGalleryMeta(r.meta),
  };
}

// Filter listed items by the UI tab. 'all' (or unknown) → everything.
export function filterGalleryItems(items, tab) {
  const list = Array.isArray(items) ? items : [];
  if (tab === 'image' || tab === 'video') return list.filter((it) => normalizeGalleryKind(it.kind) === tab);
  return list;
}

// The per-account database name. NEVER the bare legacy `artvalue_gallery`.
export function galleryDbName(session) {
  return userScopeKey(DB_NAME_BASE, session);
}

const _dbs = new Map(); // dbName → Promise<IDBDatabase> (one connection per scope)

function openDb(dbName) {
  if (_dbs.has(dbName)) return _dbs.get(dbName);
  const p = new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  _dbs.set(dbName, p);
  return p;
}

function rndId() { return `g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }

/**
 * Account-scoped gallery handle. Every read/write goes to THIS account's own
 * database, so one account can never see another's assets on a shared device.
 * @param {object|null} session Supabase session (null in local/demo mode).
 */
export function createGalleryStore(session) {
  const dbName = galleryDbName(session);
  const db = () => openDb(dbName);

  async function enforceCap() {
    const d = await db();
    const rows = await new Promise((res) => {
      const tx = d.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => res([]);
    });
    if (rows.length <= GALLERY_MAX) return;
    const toDelete = rows.sort((a, b) => a.createdAt - b.createdAt).slice(0, rows.length - GALLERY_MAX);
    const tx = d.transaction(STORE, 'readwrite');
    toDelete.forEach((it) => tx.objectStore(STORE).delete(it.id));
  }

  return {
    dbName,

    // Store one asset. `meta` may carry { kind, source, prompt, preset, engine };
    // kind defaults to 'image', meta fields are sanitized to small strings.
    async add(blob, meta = {}) {
      const d = await db();
      const id = rndId();
      const kind = normalizeGalleryKind(meta.kind);
      const cleanMeta = normalizeGalleryMeta(meta);
      await new Promise((res, rej) => {
        const tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ id, blob, createdAt: Date.now(), kind, meta: cleanMeta });
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
      await enforceCap();
      return id;
    },

    async list() {
      const d = await db();
      const rows = await new Promise((res, rej) => {
        const tx = d.transaction(STORE, 'readonly');
        const r = tx.objectStore(STORE).getAll();
        r.onsuccess = () => res(r.result || []);
        r.onerror = () => rej(r.error);
      });
      return rows
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((it) => ({ ...normalizeGalleryRecord(it), url: URL.createObjectURL(it.blob) }));
    },

    async get(id) {
      const d = await db();
      return new Promise((res, rej) => {
        const tx = d.transaction(STORE, 'readonly');
        const r = tx.objectStore(STORE).get(id);
        r.onsuccess = () => res(r.result?.blob || null);
        r.onerror = () => rej(r.error);
      });
    },

    async remove(id) {
      const d = await db();
      return new Promise((res) => {
        const tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = () => res(true);
        tx.onerror = () => res(false);
      });
    },
  };
}

// Fetch any image src (data url, blob url, remote url) into a Blob.
export async function srcToBlob(src) {
  const r = await fetch(src);
  return r.blob();
}

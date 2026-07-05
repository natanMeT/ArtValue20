// ===================================================================
// Image gallery — persistent collection of generated images.
// Bytes live in IndexedDB (keeps the main app state small). Capped so
// it never grows unbounded. Used to collect shots of the same subject
// and feed them into the video montage.
// ===================================================================

const DB_NAME = 'artvalue_gallery';
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

let _db;
function db() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function rndId() { return `g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }

// Store one asset. `meta` may carry { kind, source, prompt, preset, engine };
// kind defaults to 'image', meta fields are sanitized to small strings.
export async function addImage(blob, meta = {}) {
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
}

export async function listImages() {
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
}

export async function getBlob(id) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(id);
    r.onsuccess = () => res(r.result?.blob || null);
    r.onerror = () => rej(r.error);
  });
}

export async function removeImage(id) {
  const d = await db();
  return new Promise((res) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => res(true);
    tx.onerror = () => res(false);
  });
}

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
  const d2 = await db();
  const tx = d2.transaction(STORE, 'readwrite');
  toDelete.forEach((it) => tx.objectStore(STORE).delete(it.id));
}

// Fetch any image src (ComfyUI /view url, data url, blob url) into a Blob.
export async function srcToBlob(src) {
  const r = await fetch(src);
  return r.blob();
}

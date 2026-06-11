// ===================================================================
// Image gallery — persistent collection of generated images.
// Bytes live in IndexedDB (keeps the main app state small). Capped so
// it never grows unbounded. Used to collect shots of the same subject
// and feed them into the video montage.
// ===================================================================

const DB_NAME = 'artvalue_gallery';
const STORE = 'items';
export const GALLERY_MAX = 40;

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

export async function addImage(blob) {
  const d = await db();
  const id = rndId();
  await new Promise((res, rej) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ id, blob, createdAt: Date.now() });
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
    .map((it) => ({ id: it.id, createdAt: it.createdAt, url: URL.createObjectURL(it.blob) }));
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

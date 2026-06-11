// ===================================================================
// Local file storage via IndexedDB.
// The main app state (localStorage, ~5MB cap) holds ONLY metadata
// (name, size, type). The actual file bytes live here in IndexedDB,
// which is built for large binary data and stays out of the hot JSON
// path — so uploading files never bloats or slows the rest of the app.
// ===================================================================

const DB_NAME = 'artvalue_files';
const STORE = 'files';
const MAX_BYTES = 50 * 1024 * 1024; // 50MB soft cap per file

let _db;
function db() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

export { MAX_BYTES };

export async function putFile(id, blob) {
  if (blob && blob.size > MAX_BYTES) throw new Error(`הקובץ גדול מדי (מקסימום ${Math.round(MAX_BYTES / 1024 / 1024)}MB)`);
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => res(true);
    tx.onerror = () => rej(tx.error);
  });
}

export async function getFile(id) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(id);
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => rej(r.error);
  });
}

export async function deleteFile(id) {
  try {
    const d = await db();
    return await new Promise((res) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => res(true);
      tx.onerror = () => res(false);
    });
  } catch { return false; }
}

export async function openStoredFile(meta) {
  const blob = await getFile(meta.id);
  if (!blob) throw new Error('הקובץ לא נמצא במאגר המקומי');
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function downloadStoredFile(meta) {
  const blob = await getFile(meta.id);
  if (!blob) throw new Error('הקובץ לא נמצא במאגר המקומי');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = meta.name || 'file'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Storage usage estimate (used + quota) in bytes, when the browser supports it.
export async function storageEstimate() {
  try { return (await navigator.storage?.estimate?.()) || null; } catch { return null; }
}

// Guess a FILE_TYPES id from the file name / mime.
export function guessFileType(name = '', mime = '') {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (mime.startsWith('video') || ['mp4', 'mov', 'webm', 'avi'].includes(ext)) return 'video';
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (['zip', 'rar', '7z'].includes(ext)) return 'zip';
  if (['svg', 'ai', 'eps'].includes(ext)) return 'logo';
  if (mime.startsWith('image') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image';
  if (['txt', 'md', 'rtf'].includes(ext)) return 'text';
  return 'other';
}

export function formatBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

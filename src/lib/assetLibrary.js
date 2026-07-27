// ===================================================================
// assetLibrary — the SINGLE pure boundary for the durable cloud Asset
// Library (slice 1). Path construction, MIME/extension mapping, size and
// metadata rules, and row normalization all live here, so the IO layer
// (`api.js`) and the UI (`ImageStudio.jsx`) cannot invent their own.
//
// Pure + dependency-free: NO store, NO network, NO React, NO Supabase,
// NO clock, NO randomness. Mirrors the businessProfile.js precedent.
//
// AUTHORITY. Every rule here is a CLIENT-SIDE MIRROR of a server rule, kept
// so the user gets a truthful message instead of an opaque failure. The
// server is authoritative in every case:
//   * MIME allowlist / per-file size -> bucket config + CHECK constraints
//   * path shape                     -> assets_storage_path_matches_owner
//   * 40-asset quota                 -> WITH CHECK of the storage.objects
//                                       INSERT policy
// When the two disagree, the SERVER wins and its refusal is surfaced as a
// failure. This file never decides that a write succeeded.
// ===================================================================

// Mirrors storage.buckets.allowed_mime_types + assets_mime_allowed.
// The extension is derived from the MIME so the two can never disagree in a
// stored path; 'jpg' is the canonical extension for image/jpeg (the DB also
// accepts 'jpeg' for forward compatibility, but this client only writes 'jpg').
export const ASSET_MIME_TO_EXT = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
});

export const ASSET_MIME_ALLOWLIST = Object.freeze(Object.keys(ASSET_MIME_TO_EXT));

// Mirrors storage.buckets.file_size_limit + assets_byte_size_bounded (10 MiB).
export const ASSET_MAX_BYTES = 10485760;

// Mirrors the `< 40` in the storage.objects INSERT policy. ADVISORY ONLY —
// it exists to refuse before creating a row, never to authorize a write.
export const ASSET_QUOTA = 40;

// Mirrors assets_meta_bounded.
export const ASSET_META_LIMITS = Object.freeze({
  source: 40, prompt: 2000, preset: 120, engine: 40,
});

const str = (v) => (v == null ? '' : String(v)).trim();

// A Supabase user id is a uuid; a stored path is built from it verbatim, so a
// malformed id must never reach a path. Accepts canonical lowercase or upper.
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isAssetUuid(v) {
  return UUID_RE.test(str(v));
}

/**
 * THE path. Byte-exact counterpart of the SQL CHECK
 *   storage_path = user_id::text || '/' || id::text || '.' || ext
 * Returns null when any part is invalid — a caller that cannot build a path
 * must not fall back to some other shape, it must fail.
 */
export function assetStoragePath(userId, assetId, ext) {
  if (!isAssetUuid(userId) || !isAssetUuid(assetId)) return null;
  const e = str(ext);
  if (!Object.values(ASSET_MIME_TO_EXT).includes(e)) return null;
  return `${str(userId)}/${str(assetId)}.${e}`;
}

/** Canonical extension for an allowed MIME, or null when not allowed. */
export function assetExtForMime(mime) {
  return ASSET_MIME_TO_EXT[str(mime).toLowerCase()] || null;
}

// Keep only the small known string fields, trimmed and length-capped, so a
// row can never become a payload. Over-limit values are TRUNCATED here because
// these are descriptive labels, not user-entered data being saved — unlike the
// Business Context, where over-limit is a visible error on data the user typed.
export function sanitizeAssetMeta(meta) {
  if (!meta || typeof meta !== 'object') return {};
  const out = {};
  for (const [k, max] of Object.entries(ASSET_META_LIMITS)) {
    const s = str(meta[k]);
    if (s) out[k] = s.slice(0, max);
  }
  return out;
}

/**
 * Pre-flight for one upload. Returns { ok, error } where `error` is a truthful
 * Hebrew message naming the actual reason. `currentCount` is the account's
 * known asset count; the quota check is ADVISORY (see ASSET_QUOTA).
 */
export function validateAssetUpload({ userId, assetId, mime, byteSize, currentCount } = {}) {
  if (!isAssetUuid(userId)) return { ok: false, error: 'לא ניתן לזהות את החשבון — התחבר מחדש ונסה שוב.' };
  if (!isAssetUuid(assetId)) return { ok: false, error: 'מזהה נכס לא תקין.' };

  const ext = assetExtForMime(mime);
  if (!ext) {
    return { ok: false, error: `סוג הקובץ אינו נתמך (${str(mime) || 'לא ידוע'}). נתמכים: PNG, JPEG, WEBP.` };
  }

  const size = Number(byteSize);
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: 'הקובץ ריק או פגום.' };
  if (size > ASSET_MAX_BYTES) {
    const mb = (size / 1048576).toFixed(1);
    return { ok: false, error: `הקובץ גדול מדי (${mb}MB). המגבלה היא 10MB לקובץ.` };
  }

  const count = Number(currentCount);
  if (Number.isFinite(count) && count >= ASSET_QUOTA) {
    return { ok: false, error: `הגלריה מלאה (${ASSET_QUOTA} פריטים). מחק פריט קיים כדי לשמור חדש.` };
  }

  const path = assetStoragePath(userId, assetId, ext);
  if (!path) return { ok: false, error: 'לא ניתן לבנות נתיב אחסון תקין.' };

  return { ok: true, ext, path, byteSize: size, mime: str(mime).toLowerCase() };
}

/**
 * Normalize one `public.assets` row into the shape the gallery renders.
 * A row whose path/owner is malformed is rejected (null) rather than shown —
 * hydration follows the same rule as a save.
 *
 * `url` is filled in later from a short-lived signed URL. A row whose object
 * is missing keeps `url: null` and renders as a DANGLING item the user can
 * delete — see the ordering note in api.js.
 */
export function normalizeAssetRow(row) {
  const r = row || {};
  if (!isAssetUuid(r.id) || !isAssetUuid(r.user_id)) return null;
  const ext = str(r.ext);
  const expected = assetStoragePath(r.user_id, r.id, ext);
  if (!expected || expected !== str(r.storage_path)) return null;
  return {
    id: str(r.id),
    storagePath: expected,
    mime: str(r.mime),
    byteSize: Number(r.byte_size) || 0,
    createdAt: r.created_at ? Date.parse(r.created_at) : 0,
    kind: 'image',
    meta: sanitizeAssetMeta({
      source: r.source, prompt: r.prompt, preset: r.preset, engine: r.engine,
    }),
    url: null,
  };
}

/** Newest first — the order the gallery has always rendered in. */
export function sortAssetsNewestFirst(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0));
}

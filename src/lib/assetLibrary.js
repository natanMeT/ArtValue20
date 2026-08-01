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
    // Slice 2. The column is NOT NULL DEFAULT false, so a row written before
    // this slice reads as `false`, never undefined. Strict === true: any other
    // value (null, 'f', 0, a missing column on an un-migrated database) means
    // NOT a favorite. A star is never shown on a guess.
    favorite: r.is_favorite === true,
    // Slice 3. The optional campaign link. A value that is not a well-formed
    // uuid reads as NOT LINKED rather than being carried through as a string:
    // the column is uuid, so anything else cannot have come from the FK and
    // must not be handed back to an update as if it had.
    campaignId: isAssetUuid(r.campaign_id) ? str(r.campaign_id) : null,
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

/**
 * Slice 2 — the favorites tab.
 *
 * A FILTER, not a re-ordering: starring an item must not move it, so the
 * gallery keeps its one ordering rule (newest first) in every tab. Order is
 * preserved exactly as given.
 */
export function filterFavoriteAssets(items) {
  return (Array.isArray(items) ? items : []).filter((it) => it?.favorite === true);
}

/**
 * The next favorite state for a toggle. Pure so the UI never computes it
 * inline: `!item.favorite` on an item whose flag is undefined would silently
 * turn "unknown" into "true" and star something the server never confirmed.
 */
export function nextFavoriteState(item) {
  return item?.favorite !== true;
}

// ===================================================================
// Slice 3 — the optional asset -> campaign link.
//
// AUTHORITY, restated for this seam: the composite foreign key
//   (campaign_id, user_id) -> campaigns (id, user_id)
// is what makes a cross-account link impossible. Nothing in this file enforces
// that, and nothing here may ever be presented as if it did. These helpers
// exist so the UI cannot invent its own shapes.
// ===================================================================

/**
 * Normalize a campaign selection from the UI into what the column accepts.
 *
 * WHY THIS IS NOT `value || null`. An HTML <select> yields the EMPTY STRING for
 * its blank option, and '' sent to a uuid column fails as `22P02 invalid input
 * syntax for type uuid` BEFORE the foreign key is ever evaluated — an opaque
 * error for what is actually the ordinary "no campaign" case. TaskModal.jsx
 * already documents this exact trap for tasks.campaign_id.
 *
 * @returns {{ ok: true, value: string|null } | { ok: false, value: null }}
 *   ok+null  = unlink (blank selection)
 *   ok+uuid  = link to that campaign
 *   !ok      = a value that is neither, which is a bug in the caller, not a
 *              user error — it is never silently coerced to "unlink".
 */
export function normalizeCampaignLink(v) {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v !== 'string') return { ok: false, value: null };
  const s = str(v);
  if (!s) return { ok: true, value: null };
  return isAssetUuid(s) ? { ok: true, value: s } : { ok: false, value: null };
}

/**
 * Resolve what to SHOW for one asset's campaign link. THREE outcomes, not two.
 *
 *   { state: 'none' }            the asset is not linked
 *   { state: 'named', label }    linked, and the campaign is known
 *   { state: 'unknown' }         linked to an id we cannot resolve
 *
 * The third state is the point. An id can fail to resolve because the campaign
 * was deleted (the FK nulled it server-side, but this snapshot predates that),
 * because the campaign list failed to load, or because the list belongs to a
 * different moment. In every one of those cases the screen must say so. Folding
 * it into 'none' would tell the user an asset is unlinked while the database
 * says otherwise, and inventing a label would be worse.
 */
export function campaignLabelForAsset(item, campaigns) {
  const id = str(item?.campaignId);
  if (!id) return { state: 'none' };
  const list = Array.isArray(campaigns) ? campaigns : [];
  const hit = list.find((c) => c && str(c.id) === id);
  const label = str(hit?.title);
  return label ? { state: 'named', label } : { state: 'unknown' };
}

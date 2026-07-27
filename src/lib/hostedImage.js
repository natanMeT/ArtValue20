// ===================================================================
// hostedImage — the Studio's ONLY image lane.
//
// PRODUCT BOUNDARY (2026-07-27, owner decision): the Studio is CLOUD/GATEWAY
// ONLY. This module exists so that is a STRUCTURAL fact rather than a runtime
// one: it contains no engine URL, no model constant, no capability flag, no
// probe and no localhost reference, so nothing the Studio imports can reach a
// local address even if a future caller tried.
//
// The browser never holds a provider key and never calls a provider directly.
// The protected server-owned Gateway action `studio.generate_image` owns
// provider / model / size / MIME / budget; the browser sends only prompt and
// aspect ratio. A configured-Gateway failure NEVER falls back to another
// provider — it fails visibly with a business-facing message.
//
// Pollinations remains ONLY as the no-key DEMO fallback, and only when Supabase
// is genuinely unconfigured (local development). It is a remote service, not a
// local engine, and it never masks a configured Gateway failure.
//
// Returns { src, engine, demo }.
// ===================================================================

import { userError } from './userFacingError.js';
import { isSupabaseConfigured } from './supabase.js';
import { callAiGateway } from './aiGatewayClient.js';
import { guardedFetch } from './networkPolicy.js';

const POLLI_TOKEN = import.meta.env.VITE_POLLINATIONS_TOKEN || '';
const POLLI_MODEL = import.meta.env.VITE_POLLINATIONS_MODEL || 'flux';

// Image creation is available when the hosted AI Gateway (Supabase) is
// configured, or the Pollinations demo token exists. No local engine
// participates in this decision any more.
export const isImageAiConfigured = Boolean(isSupabaseConfigured || POLLI_TOKEN);

function pollinations(text) {
  const seed = Math.floor(Math.random() * 1_000_000);
  const src = `https://gen.pollinations.ai/image/${encodeURIComponent(text)}?model=${POLLI_MODEL}&width=1024&height=1024&nologo=true&seed=${seed}&key=${encodeURIComponent(POLLI_TOKEN)}`;
  return { src, engine: 'pollinations', demo: false };
}

// Explicit aspect → Gateway ratio table. Only the three ImageStudio presets are
// recognized; anything else resolves to the square default. No ratio math and no
// caller-supplied arbitrary ratio ever reaches the server.
const GATEWAY_ASPECT_RATIO = Object.freeze({ square: '1:1', portrait: '2:3', landscape: '3:2' });
export function toGatewayAspectRatio(aspect) {
  return GATEWAY_ASPECT_RATIO[aspect] || '1:1';
}

// Validate the Gateway's successful image result and convert it to the UI shape,
// or null when it is missing / malformed / not JPEG / empty base64. Pure: the
// base64 stays in memory; nothing is logged or persisted here.
function gatewayImageToResult(res) {
  if (!res || res.ok !== true) return null;
  const image = res.result && res.result.image;
  if (!image || typeof image !== 'object') return null;
  if (image.mimeType !== 'image/jpeg') return null;
  const base64 = image.base64;
  if (typeof base64 !== 'string' || base64.length === 0) return null;
  return { src: `data:image/jpeg;base64,${base64}`, engine: 'gateway', demo: false, mimeType: 'image/jpeg' };
}

// CONTROLLED reason -> business message table. The rendered text is chosen by US
// from a known Gateway reason CODE; provider-supplied `error.message` text is
// never rendered and can never self-declare as user-safe.
const GATEWAY_IMAGE_MESSAGES = Object.freeze({
  unauthenticated: 'צריך להתחבר כדי ליצור תמונה',
  unauthorized: 'צריך להתחבר כדי ליצור תמונה',
  rate_limited: 'שירות התמונות עמוס כרגע — נסה שוב עוד רגע',
  budget_exceeded: 'שירות התמונות עמוס כרגע — נסה שוב עוד רגע',
  budget_guard_unavailable: 'שירות התמונות עמוס כרגע — נסה שוב עוד רגע',
});
const GATEWAY_IMAGE_FALLBACK = 'יצירת התמונה נכשלה — נסה שוב מאוחר יותר';

// Build the Error to THROW for a Gateway image failure, carrying structured
// provenance so the render boundary keeps actionable guidance without ever
// trusting provider text. `.message` stays business-facing for EVERY case, so it
// cannot leak through any surface that logs or renders it; diagnostics live in a
// STRUCTURED field instead.
export function gatewayImageErrorToThrow(res) {
  const code = res && res.error && res.error.code;
  const known = typeof code === 'string' && Object.prototype.hasOwnProperty.call(GATEWAY_IMAGE_MESSAGES, code);
  const e = userError(known ? GATEWAY_IMAGE_MESSAGES[code] : GATEWAY_IMAGE_FALLBACK);
  e.gatewayReason = typeof code === 'string' && code ? code : null;
  e.gatewayMapped = known;
  return e;
}

// Exactly ONE Gateway attempt. On a valid JPEG → the UI shape. On ok:true but a
// malformed / PNG / empty image → fail VISIBLY (no retry, no other provider).
// Only a genuinely unconfigured Supabase (dev) unlocks the Pollinations demo,
// and only when a publishable token exists.
export async function generateImage(prompt, opts = {}) {
  const text = (prompt || '').trim();
  if (!text) throw userError('יש להזין תיאור לתמונה');
  const res = await callAiGateway('studio.generate_image', {
    prompt: text,
    aspectRatio: toGatewayAspectRatio(opts.aspect),
  });
  if (res && res.ok === true) {
    const converted = gatewayImageToResult(res);
    if (converted) return converted;
    throw gatewayImageErrorToThrow(null);
  }
  const code = res && res.error && res.error.code;
  if (code === 'supabase_not_configured') {
    if (POLLI_TOKEN) return pollinations(text);
    throw userError('יצירת התמונה אינה זמינה כרגע.');
  }
  throw gatewayImageErrorToThrow(res);
}

export async function downloadImage(src, name = 'artvalue-image.png') {
  try {
    // Runtime destination → network policy boundary (data:/blob: pass; a private
    // or unparseable address is refused before any request is issued).
    const r = await guardedFetch(src);
    const blob = await r.blob();
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u; a.download = name; a.click();
    URL.revokeObjectURL(u);
  } catch {
    window.open(src, '_blank');
  }
}

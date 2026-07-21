// ===================================================================
// Gemini IMAGE adapter (server-only, Deno) — M2 J3C S4.1.
//
// The dedicated image-generation lane for the ai-gateway shell. Deliberately
// SEPARATE from the text adapter/provider (geminiAdapter.ts /
// geminiProvider.ts stay byte-identical): this file owns the Interactions
// API endpoint, the pinned image model, the API key read, and the ONE fetch.
// All request/response shaping is delegated to the pure, node-tested
// contract helpers (buildGeminiImageInteractionRequest /
// parseGeminiImageInteractionResponse) — this module only adds the key, the
// endpoint, the model, and the fetch.
//
// The shell invokes runGeminiImage DIRECTLY (exactly once per approved
// request). It does NOT go through the text execution registry: the shared
// capability vocabulary (aiProviderCore.PROVIDER_CAPABILITIES) is text-only
// and out of scope for this slice, and the registry rejects a second
// 'gemini' registration by design. Registry integration is a future,
// separately-approved refactor.
//
// Guarantees (all fail closed):
//   - no key → provider_not_configured (503), NO network call
//   - exactly ONE provider attempt — no retry, no fallback, no second provider
//   - bounded request time (abort → provider_error 502)
//   - upstream non-2xx / thrown fetch / malformed JSON → provider_error (502)
//     with a generic body; the raw provider response/error text is NEVER
//     returned to the client and NEVER logged (status/name codes only)
//   - anything but exactly one valid ≤8MiB image/png → invalid_provider_response
//   - the API key never appears in any URL, response, log, or error
// ===================================================================

import {
  buildGeminiImageInteractionRequest,
  parseGeminiImageInteractionResponse,
  buildProviderNotConfiguredResponse,
  buildProviderErrorResponse,
  buildInvalidPayloadResponse,
  buildInvalidProviderResponse,
  buildProviderImageSuccessResponse,
  GEMINI_IMAGE_MAX_DECODED_BYTES,
} from '../_shared/aiGatewayContract.js';
import type { ActionProfile } from './actionProfiles.ts';

// Current official Interactions API endpoint (ai.google.dev/gemini-api/docs/
// image-generation). The model is PINNED server-side per the owner decision —
// no env override, no caller authority.
const GEMINI_INTERACTIONS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
export const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image';

// Bounded provider wait, compatible with the existing shell (which sets no
// outer timeout): image generation is slower than text, but the request must
// still terminate well inside the platform wall clock. Abort → 502.
export const GEMINI_IMAGE_TIMEOUT_MS = 60_000;

export function isGeminiImageConfigured(): boolean {
  return Boolean(Deno.env.get('GEMINI_API_KEY'));
}

// ---- content-free upstream failure classification (M2 J3C S4.1a) ----
// A CLOSED allowlist of internal diagnostic codes. The value is chosen ONLY
// by branching on the numeric HTTP status / the local Error.name — never
// built from upstream data — so no provider content can ever ride along.
// It travels adapter → shell → recordUsage (ai_usage.error_code) and is
// NEVER placed in the client response body.
export const GEMINI_IMAGE_DIAGNOSTIC_CODES = Object.freeze([
  'provider_http_400',
  'provider_google_invalid_argument',
  'provider_google_failed_precondition',
  'provider_http_401',
  'provider_http_403',
  'provider_http_404',
  'provider_http_408',
  'provider_http_409',
  'provider_http_429',
  'provider_http_5xx',
  'provider_http_other',
  'provider_timeout',
  'provider_transport_error',
  'provider_malformed_json',
  'invalid_provider_response',
] as const);

export type GeminiImageDiagnosticCode = (typeof GEMINI_IMAGE_DIAGNOSTIC_CODES)[number];

// Known statuses map 1:1; other 5xx collapse to provider_http_5xx; anything
// else collapses to provider_http_other. Pure arithmetic on the status code.
export function classifyGeminiImageHttpStatus(status: unknown): GeminiImageDiagnosticCode {
  const s = (typeof status === 'number' && Number.isFinite(status)) ? status : NaN;
  switch (s) {
    case 400: return 'provider_http_400';
    case 401: return 'provider_http_401';
    case 403: return 'provider_http_403';
    case 404: return 'provider_http_404';
    case 408: return 'provider_http_408';
    case 409: return 'provider_http_409';
    case 429: return 'provider_http_429';
  }
  if (s >= 500 && s <= 599) return 'provider_http_5xx';
  return 'provider_http_other';
}

// Thrown fetch/abort classification: inspects ONLY Error.name (a safe local
// property — never a message, stack, or upstream text). AbortSignal.timeout
// aborts surface as 'TimeoutError' (or 'AbortError' on older runtimes).
export function classifyGeminiImageThrown(e: unknown): GeminiImageDiagnosticCode {
  const name = (e instanceof Error && typeof e.name === 'string') ? e.name : '';
  return (name === 'TimeoutError' || name === 'AbortError')
    ? 'provider_timeout'
    : 'provider_transport_error';
}

// ---- bounded HTTP-400 body refinement (M2 J3C S4.1b) ----
// Google's troubleshooting guide distinguishes two materially different 400
// statuses: INVALID_ARGUMENT (malformed/unsupported request) vs
// FAILED_PRECONDITION (billing/project/region precondition). ONLY for an
// upstream 400 we read a strictly bounded body into ephemeral memory, take
// the structured `error.status` path, and map the two exact values; anything
// else falls back to provider_http_400. The body text never leaves this
// module — never logged, never persisted, never returned.
export const GEMINI_IMAGE_ERROR_BODY_MAX_BYTES = 16 * 1024;
// Hard cap on read() calls: the byte cap alone would not bound recursion on a
// stream that keeps yielding zero-length chunks. Every read counts.
export const GEMINI_IMAGE_ERROR_BODY_MAX_READS = 256;

// JSON-compatible media type: application/json or application/*+json, with
// optional parameters, case-insensitive. Anything else (missing, malformed,
// text/html, text/plain, application/octet-stream, …) is NOT trusted —
// the body of a non-JSON 400 is never read.
export function isJsonMediaType(contentType: unknown): boolean {
  if (typeof contentType !== 'string') return false;
  const media = contentType.split(';')[0].trim().toLowerCase();
  if (media === 'application/json') return true;
  if (!media.startsWith('application/')) return false;
  const subtype = media.slice('application/'.length);
  return subtype.endsWith('+json') && subtype.length > '+json'.length;
}

// Reads at most GEMINI_IMAGE_ERROR_BODY_MAX_BYTES across at most
// GEMINI_IMAGE_ERROR_BODY_MAX_READS read() calls (chunk-recursive — both caps
// bound recursion). Gates: JSON Content-Type required BEFORE any read; a
// valid Content-Length above the byte cap rejects with ZERO reads (early
// guard only — the live byte cap stays authoritative). Over-cap bytes,
// over-cap reads, read failure, or invalid UTF-8 → cancel the stream exactly
// once (cancel failure swallowed) + null; the violating chunk is never
// decoded or appended. Never throws, never logs. Deliberately NOT
// res.text()/res.json(): those are unbounded and must never run on an
// upstream error body.
export async function readGeminiImageErrorBodyBounded(res: {
  headers?: { get?: (name: string) => string | null } | null;
  body?: { getReader?: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }>; cancel?: () => Promise<unknown> } } | null;
}): Promise<string | null> {
  try {
    const headers = res ? res.headers : null;
    const header = (name: string): string | null => (
      (headers && typeof headers.get === 'function') ? headers.get(name) : null
    );
    if (!isJsonMediaType(header('content-type'))) return null;
    const declaredLength = header('content-length');
    if (typeof declaredLength === 'string' && /^\d+$/.test(declaredLength.trim())
      && Number(declaredLength.trim()) > GEMINI_IMAGE_ERROR_BODY_MAX_BYTES) {
      return null; // early reject — zero reads
    }
    const stream = res ? res.body : null;
    if (!stream || typeof stream.getReader !== 'function') return null;
    const reader = stream.getReader();
    let cancelled = false;
    const cancelOnce = async (): Promise<void> => {
      if (cancelled) return;
      cancelled = true;
      try { await reader.cancel?.(); } catch { /* cancel failure never propagates */ }
    };
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const pump = async (reads: number, received: number, text: string): Promise<string | null> => {
      if (reads >= GEMINI_IMAGE_ERROR_BODY_MAX_READS) {
        await cancelOnce();
        return null;
      }
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      const size = value ? value.byteLength : 0;
      if (received + size > GEMINI_IMAGE_ERROR_BODY_MAX_BYTES) {
        await cancelOnce();
        return null;
      }
      return pump(reads + 1, received + size, text + decoder.decode(value, { stream: true }));
    };
    try {
      return await pump(0, 0, '');
    } catch {
      // read failure or decoder (invalid UTF-8) failure — release the stream
      await cancelOnce();
      return null;
    }
  } catch {
    return null;
  }
}

// Maps a bounded 400 body to the two allowlisted Google statuses. EXACT
// case-sensitive matches on the structured `error.status` path only; every
// other shape (null body, malformed JSON, non-object, missing/unknown/
// wrong-case status) falls back to provider_http_400. Never throws.
export function classifyGeminiImage400Body(bodyText: string | null): GeminiImageDiagnosticCode {
  try {
    if (typeof bodyText !== 'string' || !bodyText) return 'provider_http_400';
    const json: unknown = JSON.parse(bodyText);
    if (json === null || typeof json !== 'object' || Array.isArray(json)) return 'provider_http_400';
    const err = (json as { error?: unknown }).error;
    if (err === null || typeof err !== 'object' || Array.isArray(err)) return 'provider_http_400';
    const status = (err as { status?: unknown }).status;
    if (status === 'INVALID_ARGUMENT') return 'provider_google_invalid_argument';
    if (status === 'FAILED_PRECONDITION') return 'provider_google_failed_precondition';
    return 'provider_http_400';
  } catch {
    return 'provider_http_400';
  }
}

// Runs ONE Gemini image generation for an already-validated gateway decision
// using the SERVER-OWNED image action profile. Returns
// { status, body, resultChars } exactly like the text provider; resultChars
// is the CONTENT-FREE base64 character count of the returned image (fits the
// existing ai_usage result_chars column). diagnosticCode (S4.1a) is the
// INTERNAL allowlisted upstream-failure classification — the shell may pass
// it ONLY to recordUsage; it must never enter the client response body.
// deno-lint-ignore no-explicit-any
export async function runGeminiImage(
  decision: any,
  profile: ActionProfile,
): Promise<{
  status: number;
  body: unknown;
  resultChars: number | null;
  diagnosticCode?: GeminiImageDiagnosticCode | null;
}> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    // Fail closed — no network call, no fallback to any frontend key.
    return { status: 503, body: buildProviderNotConfiguredResponse(decision), resultChars: null };
  }

  // Drift guard: this adapter serves ONLY image profiles. A wrong profile is
  // a server misconfiguration — fail closed, never infer or repair.
  if (!profile || profile.outputMode !== 'image') {
    console.error('[ai-gateway] image adapter profile drift', JSON.stringify({ provider: 'gemini', model: GEMINI_IMAGE_MODEL }));
    return { status: 502, body: buildProviderErrorResponse(decision), resultChars: null };
  }

  const built = buildGeminiImageInteractionRequest(
    decision && decision.request ? decision.request.payload : undefined,
    profile,
  );
  if (!built.ok) {
    return { status: 400, body: buildInvalidPayloadResponse(decision, built.error), resultChars: null };
  }

  try {
    // EXACTLY ONE attempt. The key travels only in the header — never the URL.
    const res = await fetch(GEMINI_INTERACTIONS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ model: GEMINI_IMAGE_MODEL, ...built.body }),
      signal: AbortSignal.timeout(GEMINI_IMAGE_TIMEOUT_MS),
    });
    if (!res.ok) {
      // Status code ONLY in the log — the raw provider error body is never
      // logged and never enters the response. S4.1b: ONLY for a 400 we read a
      // strictly bounded body to refine the INTERNAL diagnostic (allowlisted
      // mapping; ephemeral text discarded here); every other status keeps the
      // S4.1a status-arithmetic classification with NO body read.
      console.error('[ai-gateway] gemini image upstream error', JSON.stringify({ provider: 'gemini', model: GEMINI_IMAGE_MODEL, status: res.status }));
      const diagnosticCode = res.status === 400
        ? classifyGeminiImage400Body(await readGeminiImageErrorBodyBounded(res))
        : classifyGeminiImageHttpStatus(res.status);
      return { status: 502, body: buildProviderErrorResponse(decision), resultChars: null, diagnosticCode };
    }
    const json = await res.json().catch(() => null);
    if (json === null) {
      console.error('[ai-gateway] gemini image malformed json', JSON.stringify({ provider: 'gemini', model: GEMINI_IMAGE_MODEL, status: res.status }));
      return { status: 502, body: buildProviderErrorResponse(decision), resultChars: null, diagnosticCode: 'provider_malformed_json' };
    }
    const image = parseGeminiImageInteractionResponse(json, {
      expectedMimeType: profile.imageMimeType || 'image/png',
      maxDecodedBytes: GEMINI_IMAGE_MAX_DECODED_BYTES,
    });
    if (!image) {
      // Multiple images, text-only output, wrong MIME, malformed/oversized
      // base64, unsafe keys — all fail closed. Content-free diagnostic only.
      console.error('[ai-gateway] gemini image invalid response', JSON.stringify({ provider: 'gemini', model: GEMINI_IMAGE_MODEL, status: res.status }));
      return { status: 502, body: buildInvalidProviderResponse(decision), resultChars: null, diagnosticCode: 'invalid_provider_response' };
    }
    return {
      status: 200,
      body: buildProviderImageSuccessResponse(decision, image),
      resultChars: image.base64.length,
    };
  } catch (e) {
    // Timeout/abort/network — the error NAME only (never a message that could
    // echo request/response content).
    const name = (e instanceof Error && typeof e.name === 'string') ? e.name.slice(0, 40) : 'unknown';
    console.error('[ai-gateway] gemini image request threw', JSON.stringify({ provider: 'gemini', model: GEMINI_IMAGE_MODEL, name }));
    return { status: 502, body: buildProviderErrorResponse(decision), resultChars: null, diagnosticCode: classifyGeminiImageThrown(e) };
  }
}

// ---- server-owned image capability requirement (mirrors geminiAdapter's
// requiredGatewayCapabilities drift-guard pattern, image-scoped) ----
// STATIC map keyed ONLY by the validated actionType; `output` doubles as a
// drift guard against the server-owned profile. Mismatch → null → the shell
// fails CLOSED through its provider-error path.
const REQUIRED_IMAGE_ACTIONS: Readonly<Record<string, true>> = Object.freeze({
  'studio.generate_image': true,
});

export const REQUIRED_IMAGE_ACTION_KEYS: readonly string[] = Object.freeze(
  Object.keys(REQUIRED_IMAGE_ACTIONS),
);

export function isGatewayImageAction(
  actionType: unknown,
  profile: unknown,
): boolean {
  try {
    if (typeof actionType !== 'string'
      || !Object.prototype.hasOwnProperty.call(REQUIRED_IMAGE_ACTIONS, actionType)) {
      return false;
    }
    if (profile === null || typeof profile !== 'object') return false;
    return (profile as { outputMode?: unknown }).outputMode === 'image';
  } catch {
    return false;
  }
}

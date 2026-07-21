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

// Runs ONE Gemini image generation for an already-validated gateway decision
// using the SERVER-OWNED image action profile. Returns
// { status, body, resultChars } exactly like the text provider; resultChars
// is the CONTENT-FREE base64 character count of the returned image (fits the
// existing ai_usage result_chars column).
// deno-lint-ignore no-explicit-any
export async function runGeminiImage(
  decision: any,
  profile: ActionProfile,
): Promise<{ status: number; body: unknown; resultChars: number | null }> {
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
      // Status code ONLY — the raw provider error body is never read into a
      // log or response (stricter than the text lane, per the S4.1 contract).
      console.error('[ai-gateway] gemini image upstream error', JSON.stringify({ provider: 'gemini', model: GEMINI_IMAGE_MODEL, status: res.status }));
      return { status: 502, body: buildProviderErrorResponse(decision), resultChars: null };
    }
    const json = await res.json().catch(() => null);
    if (json === null) {
      console.error('[ai-gateway] gemini image malformed json', JSON.stringify({ provider: 'gemini', model: GEMINI_IMAGE_MODEL, status: res.status }));
      return { status: 502, body: buildProviderErrorResponse(decision), resultChars: null };
    }
    const image = parseGeminiImageInteractionResponse(json, {
      expectedMimeType: profile.imageMimeType || 'image/png',
      maxDecodedBytes: GEMINI_IMAGE_MAX_DECODED_BYTES,
    });
    if (!image) {
      // Multiple images, text-only output, wrong MIME, malformed/oversized
      // base64, unsafe keys — all fail closed. Content-free diagnostic only.
      console.error('[ai-gateway] gemini image invalid response', JSON.stringify({ provider: 'gemini', model: GEMINI_IMAGE_MODEL, status: res.status }));
      return { status: 502, body: buildInvalidProviderResponse(decision), resultChars: null };
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
    return { status: 502, body: buildProviderErrorResponse(decision), resultChars: null };
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

// ===================================================================
// Gemini text provider (server-only, Deno).
//
// The ONLY file allowed to read the provider secret and call the network
// for Gemini. The API key is read exclusively from the server-side
// Deno.env (`GEMINI_API_KEY`) — never a VITE_* / frontend env, never
// hardcoded. All request/response shaping is delegated to the pure,
// node-tested contract helpers; this module only adds the key, the
// endpoint, and the fetch. The key and raw upstream payloads are never
// placed into any response returned to the client.
//
// Fail-closed: no key → provider_not_configured (503), no fetch.
// Upstream failure → provider_error (502), generic sanitized message.
// ===================================================================

import {
  buildGeminiTextRequest,
  parseGeminiTextResponse,
  buildProviderNotConfiguredResponse,
  buildProviderErrorResponse,
  buildInvalidPayloadResponse,
  buildProviderSuccessResponse,
} from '../_shared/aiGatewayContract.js';

const GEMINI_MODELS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';

export function isGeminiConfigured(): boolean {
  return Boolean(Deno.env.get('GEMINI_API_KEY'));
}

// Runs a Gemini text completion for an already-validated gateway decision.
// Returns { status, body } — the caller (index.ts) writes the HTTP response.
// deno-lint-ignore no-explicit-any
export async function runGeminiText(decision: any): Promise<{ status: number; body: unknown }> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    // Fail closed — no network call, no fallback to any frontend key.
    return { status: 503, body: buildProviderNotConfiguredResponse(decision) };
  }

  const built = buildGeminiTextRequest(decision && decision.request ? decision.request.payload : undefined);
  if (!built.ok) {
    return { status: 400, body: buildInvalidPayloadResponse(decision, built.error) };
  }

  const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
  const url = `${GEMINI_MODELS_ENDPOINT}/${model}:generateContent`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
      body: JSON.stringify(built.body),
    });
    if (!res.ok) {
      // Do not forward upstream status text / body (may leak details).
      return { status: 502, body: buildProviderErrorResponse(decision) };
    }
    const json = await res.json().catch(() => null);
    const text = parseGeminiTextResponse(json);
    if (!text) {
      return { status: 502, body: buildProviderErrorResponse(decision) };
    }
    return { status: 200, body: buildProviderSuccessResponse(decision, text) };
  } catch (_e) {
    return { status: 502, body: buildProviderErrorResponse(decision) };
  }
}

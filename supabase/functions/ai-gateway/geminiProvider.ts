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
  toProviderMessagesForAction,
  buildGeminiMessagesRequest,
  parseGeminiTextResponse,
  parseStructuredResult,
  normalizeActionsBlockResult,
  providerResultChars,
  buildProviderNotConfiguredResponse,
  buildProviderErrorResponse,
  buildInvalidPayloadResponse,
  buildInvalidProviderResponse,
  buildProviderSuccessResponse,
  buildProviderJsonSuccessResponse,
} from '../_shared/aiGatewayContract.js';
import type { ActionProfile } from './actionProfiles.ts';

const GEMINI_MODELS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
// Out-of-box default only. The authoritative model is the server-side
// GEMINI_MODEL secret (read below) — always set it to a model the key can
// call (verify via Google ListModels). `gemini-2.0-flash` was retired for the
// live key and 404'd; `gemini-2.5-flash` is the current stable flash model.
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

export function isGeminiConfigured(): boolean {
  return Boolean(Deno.env.get('GEMINI_API_KEY'));
}

// Runs a Gemini completion for an already-validated gateway decision using the
// SERVER-OWNED action profile (system instruction, generation config, output
// mode, schema). The profile — never the caller — drives all execution
// behavior. Returns { status, body, resultChars }; the caller (index.ts)
// writes the HTTP response and logs the content-free resultChars count.
// deno-lint-ignore no-explicit-any
export async function runGeminiText(
  decision: any,
  profile: ActionProfile,
): Promise<{ status: number; body: unknown; resultChars: number | null }> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    // Fail closed — no network call, no fallback to any frontend key.
    return { status: 503, body: buildProviderNotConfiguredResponse(decision), resultChars: null };
  }

  // The adapter consumes ONLY normalized provider messages (never a raw browser
  // payload): the validated payload — prompt-only, multi-turn, or an action-
  // specific shape (crm.lead_ideas → the pure contract builder) — is mapped to
  // provider-independent [{ role, text }] first, then to the Gemini body with the
  // SERVER-OWNED profile. user → user, assistant → model. The action-aware
  // mapping lives entirely in the pure contract (toProviderMessagesForAction);
  // no business branching happens here.
  const messages = toProviderMessagesForAction(
    decision ? decision.actionType : undefined,
    decision && decision.request ? decision.request.payload : undefined,
  );
  const built = messages
    ? buildGeminiMessagesRequest(messages, profile)
    : {
      ok: false as const,
      error: { code: 'invalid_payload', message: 'Invalid payload.' },
    };
  if (!built.ok) {
    return { status: 400, body: buildInvalidPayloadResponse(decision, built.error), resultChars: null };
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
      // Diagnostics only — server-side log, never returned to the client and
      // never includes the key/Authorization/request body. The upstream error
      // snippet is capped; Google error bodies do not contain the API key.
      let snippet = '';
      try {
        snippet = (await res.text()).slice(0, 200);
      } catch {
        snippet = '';
      }
      console.error('[ai-gateway] gemini upstream error', JSON.stringify({ provider: 'gemini', model, status: res.status, snippet }));
      return { status: 502, body: buildProviderErrorResponse(decision), resultChars: null };
    }
    const json = await res.json().catch(() => null);
    const rawText = parseGeminiTextResponse(json);
    if (!rawText) {
      // deno-lint-ignore no-explicit-any
      const finishReason = (json as any)?.candidates?.[0]?.finishReason ?? 'unknown';
      console.error('[ai-gateway] gemini empty completion', JSON.stringify({ provider: 'gemini', model, status: res.status, finishReason }));
      return { status: 502, body: buildProviderErrorResponse(decision), resultChars: null };
    }

    // result_chars counts the RAW provider text (completion, or raw JSON string
    // BEFORE parsing) — never a re-serialized object length. Content-free.
    const resultChars = providerResultChars(rawText);

    if (profile && profile.outputMode === 'json') {
      const parsed = parseStructuredResult(rawText, profile.resultContract);
      if (!parsed.ok) {
        // Fail closed on malformed / schema-invalid structured output. No raw
        // text, parse detail, or schema is logged or returned.
        console.error('[ai-gateway] gemini invalid structured response', JSON.stringify({ provider: 'gemini', model, status: res.status, contract: profile.resultContract }));
        return { status: 502, body: buildInvalidProviderResponse(decision), resultChars };
      }
      return { status: 200, body: buildProviderJsonSuccessResponse(decision, parsed.value), resultChars };
    }

    if (profile && profile.resultTransform === 'actions_block') {
      // jake.force_actions lane: the caller-visible text is normalized to ONE
      // canonical fenced actions block, or exactly "[]" (fail-closed) — provider
      // prose, checkmarks, or echoed instructions never reach the client. The
      // server never interprets or executes the ops; parsing + confirmation stay
      // with the frontend extractActions flow. result_chars keeps counting the
      // RAW provider text (content-free, pre-normalization).
      return {
        status: 200,
        body: buildProviderSuccessResponse(decision, normalizeActionsBlockResult(rawText)),
        resultChars,
      };
    }

    return { status: 200, body: buildProviderSuccessResponse(decision, rawText), resultChars };
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 200);
    console.error('[ai-gateway] gemini request threw', JSON.stringify({ provider: 'gemini', model, message }));
    return { status: 502, body: buildProviderErrorResponse(decision), resultChars: null };
  }
}

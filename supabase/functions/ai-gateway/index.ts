// ===================================================================
// Supabase Edge Function: ai-gateway
//
// Thin HTTP shell. ALL validation + provider routing lives in the pure,
// node-testable contract layer (supabase/functions/_shared/
// aiGatewayContract.js). The ONLY provider wired so far is Gemini TEXT,
// and its key + fetch live solely in ./geminiProvider.ts — never here.
//
// Flow: parse → decide → if a Gemini-executable text action routes to
// gemini, run it (fail-closed on missing secret); otherwise return the
// existing not_implemented decision. Each terminal outcome is logged
// best-effort to `ai_usage` (content-free) — logging NEVER blocks or
// changes the response. Budget checks remain deferred.
//
// The contract lives in _shared so this function is self-contained inside
// Supabase's uploadable function tree (Dashboard + CLI deploy).
// ===================================================================

import {
  buildAiGatewayResponse,
  buildAiGatewayDecision,
  isGeminiExecutableAction,
  buildUsageRecord,
} from '../_shared/aiGatewayContract.js';
import { runGeminiText } from './geminiProvider.ts';
import { logUsage } from './usageLog.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// deno-lint-ignore no-explicit-any
const serve = (globalThis as any).Deno?.serve;

serve?.(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({
      ok: false,
      error: { code: 'method_not_allowed', message: 'Use POST.' },
      execution: { status: 'rejected' },
    }, 405);
  }

  // Auth: Supabase's JWT gate runs before this handler (deploy keeps
  // verify-jwt ON). The function trusts no request field for provider
  // choice — routing is decided by the pure contract.

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({
      ok: false,
      error: { code: 'invalid_json', message: 'Body must be valid JSON.' },
      execution: { status: 'rejected' },
    }, 400);
  }

  const requestId = crypto.randomUUID();
  const decision = buildAiGatewayDecision(body);

  // Prompt length is captured as a COUNT only — the raw text never leaves
  // this scope and is never passed to the logger.
  const promptChars = (decision.ok && decision.request && decision.request.payload
    && typeof decision.request.payload.prompt === 'string')
    ? decision.request.payload.prompt.length
    : null;

  // Best-effort usage logging: buildUsageRecord is content-free, logUsage
  // never throws, and this wrapper double-guards so a logging failure can
  // never block or fail the AI response.
  // deno-lint-ignore no-explicit-any
  async function recordUsage(fields: any): Promise<void> {
    try {
      await logUsage(buildUsageRecord({ requestId, decision, promptChars, ...fields }));
    } catch {
      // swallow — observability must not affect the response
    }
  }

  // Invalid / unknown action → existing rejected 400 behavior.
  if (!decision.ok) {
    await recordUsage({ status: 'invalid_action', httpStatus: 400, errorCode: decision.error?.code ?? 'invalid_action' });
    return json(buildAiGatewayResponse(body), 400);
  }

  // Only executable Gemini-first text actions that actually resolve to
  // gemini run a real provider call. Everything else stays deferred.
  if (isGeminiExecutableAction(decision.actionType) && decision.routing.selectedProvider === 'gemini') {
    const { status, body: out } = await runGeminiText(decision);
    // result_chars is a COUNT only — the completion text is never logged.
    const resultChars = (out && out.result && typeof out.result.text === 'string') ? out.result.text.length : null;
    await recordUsage({
      status: out?.execution?.status ?? 'provider_error',
      httpStatus: status,
      provider: 'gemini',
      errorCode: out?.error?.code ?? null,
      resultChars,
    });
    return json(out, status);
  }

  // Otherwise: unchanged not_implemented decision.
  await recordUsage({ status: 'not_implemented', httpStatus: 200 });
  return json(buildAiGatewayResponse(body), 200);
});

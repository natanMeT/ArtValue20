// ===================================================================
// Supabase Edge Function: ai-gateway
//
// Thin HTTP shell. ALL validation + provider routing lives in the pure,
// node-testable contract layer (supabase/functions/_shared/
// aiGatewayContract.js). The ONLY provider wired so far is Gemini TEXT,
// and its key + fetch live solely in ./geminiProvider.ts — never here.
//
// AUTH: every POST requires a real authenticated end-user. Auth is enforced
// with the official @supabase/server user context (verify_jwt stays ON at the
// platform edge; a publishable/anon key is NOT sufficient user identity). The
// verified user UUID comes only from the signed, server-verified claims —
// never from the request body.
//
// BUDGET: before ANY real provider call, an atomic, fail-closed budget guard
// (per-user minute rate + per-user daily/monthly + global monthly estimated
// caps) must APPROVE and RESERVE the request via the service-role-only RPC
// public.reserve_ai_budget. If the guard cannot run (missing estimate, RPC/DB
// error, or a malformed result) the shell fails closed and makes NO provider
// call. Reservation is conservative: an approved reservation stays consumed
// even if Gemini later returns an upstream error (no refund in this slice).
//
// Flow: OPTIONS → auth → parse → decide → guard (executable branch only) →
// provider. Each terminal outcome is logged best-effort to `ai_usage`
// (content-free, now with the verified user_id) — logging NEVER blocks or
// changes the response.
//
// The contract lives in _shared so this function is self-contained inside
// Supabase's uploadable function tree (Dashboard + CLI deploy).
// ===================================================================

import { createSupabaseContext } from 'npm:@supabase/server@1.3.0';
import {
  buildAiGatewayResponse,
  buildAiGatewayDecision,
  isGeminiExecutableAction,
  buildUsageRecord,
  buildProviderErrorResponse,
  buildUnauthenticatedResponse,
  buildRateLimitedResponse,
  buildBudgetExceededResponse,
  buildBudgetGuardUnavailableResponse,
} from '../_shared/aiGatewayContract.js';
import { runGeminiText } from './geminiProvider.ts';
import { getActionProfile } from './actionProfiles.ts';
import { getBudgetPolicy, resolveEstimatedCostUsd } from './budgetPolicy.ts';
import { reserveAiBudget } from './budgetGuard.ts';
import { logUsage } from './usageLog.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // The browser Supabase client (functions.invoke) sends x-client-info +
  // apikey in addition to authorization/content-type — all must be allowed
  // or the preflight fails and the call surfaces as network_error.
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Optional extraHeaders are used ONLY for a sanitized Retry-After on rate
// limiting; CORS + Content-Type are always preserved and win by default. RPC
// output can never inject arbitrary headers — the caller sanitizes first.
function json(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...(extraHeaders || {}) },
  });
}

// deno-lint-ignore no-explicit-any
const serve = (globalThis as any).Deno?.serve;

serve?.(async (req: Request): Promise<Response> => {
  // CORS preflight is public and runs BEFORE any authentication.
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

  const requestId = crypto.randomUUID();

  // Best-effort, content-free usage logging. buildUsageRecord takes only
  // counts + the verified user id; logUsage never throws; this wrapper
  // double-guards so a logging failure can never block or fail the response.
  // deno-lint-ignore no-explicit-any
  async function recordUsage(fields: any): Promise<void> {
    try {
      await logUsage(buildUsageRecord({ requestId, ...fields }));
    } catch {
      // swallow — observability must not affect the response
    }
  }

  // ---- Authentication (official @supabase/server user context) ----
  // verify_jwt stays ON at the platform edge; here we additionally require a
  // real END-USER (authMode === 'user' + a verified user UUID). A publishable/
  // anon key passes the edge gate but yields no user id and is rejected. The
  // user id comes ONLY from the signed, server-verified claims — never the body.
  // deno-lint-ignore no-explicit-any
  let ctx: any = null;
  try {
    const authResult = await createSupabaseContext(req, { auth: 'user' });
    ctx = authResult && authResult.data ? authResult.data : null;
  } catch {
    ctx = null;
  }
  const claims = ctx && ctx.authMode === 'user' ? (ctx.userClaims || ctx.jwtClaims || null) : null;
  const userId = (claims && typeof claims.sub === 'string' && claims.sub) ? claims.sub : null;

  if (!userId) {
    // Content-free unauthenticated log: user_id NULL, action_type 'unknown'.
    // No token / header / claim / auth internals are echoed.
    await recordUsage({ decision: null, promptChars: null, userId: null, status: 'unauthenticated', httpStatus: 401, errorCode: 'unauthenticated' });
    return json(buildUnauthenticatedResponse(), 401);
  }

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

  const decision = buildAiGatewayDecision(body);

  // Prompt length is captured as a COUNT only — the raw text never leaves
  // this scope and is never passed to the logger.
  const promptChars = (decision.ok && decision.request && decision.request.payload
    && typeof decision.request.payload.prompt === 'string')
    ? decision.request.payload.prompt.length
    : null;

  // Invalid / unknown action → existing rejected 400 behavior (now user-linked).
  if (!decision.ok) {
    await recordUsage({ decision, promptChars, userId, status: 'invalid_action', httpStatus: 400, errorCode: decision.error?.code ?? 'invalid_action' });
    return json(buildAiGatewayResponse(body), 400);
  }

  // Only executable Gemini-first text actions that actually resolve to
  // gemini run a real provider call — and ONLY after the budget guard approves.
  if (isGeminiExecutableAction(decision.actionType) && decision.routing.selectedProvider === 'gemini') {
    // Execution behavior is owned by the frozen, server-only action profile
    // (system instruction, generation config, output mode, schema) — selected
    // strictly by validated actionType, never by caller input.
    const profile = getActionProfile(decision.actionType);
    if (!profile) {
      // Fail closed: an executable action with no server-owned profile is a
      // server misconfiguration — never fall back to caller configuration.
      await recordUsage({ decision, promptChars, userId, status: 'provider_error', httpStatus: 502, provider: 'gemini', errorCode: 'provider_error' });
      return json(buildProviderErrorResponse(decision), 502);
    }

    // ---- Budget guard: reserve BEFORE Gemini (every provider action, all
    // tiers — the old tier-based budget-check flag is intentionally ignored). ----
    const policy = getBudgetPolicy();
    const estimatedCostUsd = resolveEstimatedCostUsd(decision);
    if (estimatedCostUsd === null) {
      // No usable server-owned estimate → fail closed, NO provider call.
      await recordUsage({ decision, promptChars, userId, status: 'budget_guard_unavailable', httpStatus: 503, provider: 'gemini', errorCode: 'budget_guard_unavailable' });
      return json(buildBudgetGuardUnavailableResponse(decision), 503);
    }

    const guard = await reserveAiBudget({
      supabaseAdmin: ctx.supabaseAdmin,  // service-role client from the verified context
      userId,                            // VERIFIED user UUID (never from the body)
      requestId,                         // server-generated
      actionType: decision.actionType,
      estimatedCostUsd,                  // server-owned estimate from the routing decision
      policy,
    });

    if (guard.status === 'rate_limited') {
      await recordUsage({ decision, promptChars, userId, status: 'rate_limited', httpStatus: 429, provider: 'gemini', errorCode: 'rate_limited' });
      const retry = (typeof guard.retryAfterSeconds === 'number' && guard.retryAfterSeconds > 0)
        ? { 'Retry-After': String(guard.retryAfterSeconds) }
        : undefined;
      return json(buildRateLimitedResponse(decision), 429, retry);
    }
    if (guard.status === 'budget_exceeded') {
      await recordUsage({ decision, promptChars, userId, status: 'budget_exceeded', httpStatus: 429, provider: 'gemini', errorCode: 'budget_exceeded' });
      return json(buildBudgetExceededResponse(decision), 429);
    }
    if (guard.status !== 'approved') {
      // 'unavailable' (RPC/DB error or malformed result) → fail closed, no call.
      await recordUsage({ decision, promptChars, userId, status: 'budget_guard_unavailable', httpStatus: 503, provider: 'gemini', errorCode: 'budget_guard_unavailable' });
      return json(buildBudgetGuardUnavailableResponse(decision), 503);
    }

    // Approved + reserved → run the provider. resultChars is a COUNT only.
    const { status, body: out, resultChars } = await runGeminiText(decision, profile);
    await recordUsage({
      decision,
      promptChars,
      userId,
      status: out?.execution?.status ?? 'provider_error',
      httpStatus: status,
      provider: 'gemini',
      errorCode: out?.error?.code ?? null,
      resultChars,
    });
    return json(out, status);
  }

  // Otherwise: unchanged not_implemented decision (now user-linked).
  await recordUsage({ decision, promptChars, userId, status: 'not_implemented', httpStatus: 200 });
  return json(buildAiGatewayResponse(body), 200);
});

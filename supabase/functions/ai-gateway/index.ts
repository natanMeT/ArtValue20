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
  buildInvalidPayloadResponse,
  buildUnauthenticatedResponse,
  buildRateLimitedResponse,
  buildBudgetExceededResponse,
  buildBudgetGuardUnavailableResponse,
  validateAiGatewayInput,
  AI_GATEWAY_ERROR_CODES,
} from '../_shared/aiGatewayContract.js';
import { isGeminiImageExecutableAction } from '../_shared/aiGatewayContract.js';
import { createExecutionRegistry } from '../_shared/aiExecutionRegistry.js';
import { geminiAdapter, requiredGatewayCapabilities } from './geminiAdapter.ts';
import { runGeminiImage, isGatewayImageAction, GEMINI_IMAGE_MODEL } from './geminiImageAdapter.ts';
import { getActionProfile } from './actionProfiles.ts';
import { getBudgetPolicy, resolveEstimatedCostUsd } from './budgetPolicy.ts';
import { reserveAiBudget } from './budgetGuard.ts';
import { logUsage } from './usageLog.ts';

// ---- execution registry (M2 Slice 2C): ONE instance, ONE registration ----
// Registration captures the adapter by typeof only — it can NEVER invoke
// run/isConfigured. A failed registration is a server misconfiguration:
// fail fast at module load (same precedent as the actionProfiles coverage
// check) with a deterministic, content-free error.
const executionRegistry = createExecutionRegistry();
const geminiRegistration = executionRegistry.register(geminiAdapter);
if (!geminiRegistration.ok) {
  throw new Error('ai-gateway: gemini adapter registration failed');
}

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

// Derive the VERIFIED authenticated user id from a @supabase/server user
// context. Server-only; never trusts the request body/payload/options and
// never decodes a JWT manually — it reads only the already-verified context.
//
// @supabase/server shapes (v1.x): ctx.userClaims is the NORMALIZED user object
// ({ id, role, email, appMetadata, userMetadata }) — it uses `id`, NOT `sub`.
// ctx.jwtClaims is the RAW JWT payload ({ sub, role, ... }). So:
//   role = userClaims.role  || jwtClaims.role   (must be "authenticated")
//   id   = userClaims.id     || jwtClaims.sub     (must be a valid UUID)
// authMode must be exactly "user". Any failure → null → 401 (no budget RPC,
// no Gemini call).
// deno-lint-ignore no-explicit-any
function getAuthenticatedUserId(ctx: any): string | null {
  if (!ctx || typeof ctx !== 'object' || ctx.authMode !== 'user') return null;
  const userClaims = (ctx.userClaims && typeof ctx.userClaims === 'object') ? ctx.userClaims : null;
  const jwtClaims = (ctx.jwtClaims && typeof ctx.jwtClaims === 'object') ? ctx.jwtClaims : null;
  // role: prefer the normalized userClaims.role, fall back to the raw jwtClaims.role
  const role = (userClaims && typeof userClaims.role === 'string' && userClaims.role)
    || (jwtClaims && typeof jwtClaims.role === 'string' && jwtClaims.role)
    || null;
  if (role !== 'authenticated') return null;
  // id: prefer the normalized userClaims.id, fall back to the raw jwtClaims.sub
  // (NOTE: the normalized user object exposes `id`, never a `sub` field).
  const id = (userClaims && typeof userClaims.id === 'string' && userClaims.id)
    || (jwtClaims && typeof jwtClaims.sub === 'string' && jwtClaims.sub)
    || null;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return (typeof id === 'string' && uuidRe.test(id)) ? id : null;
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
  // Verified identity: authMode === 'user', role === 'authenticated', and a
  // valid UUID from userClaims.id (or the raw jwtClaims.sub fallback).
  const userId = getAuthenticatedUserId(ctx);

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

    // ---- Strict per-action input validation (BEFORE budget + provider) ----
    // Validate the ORIGINAL raw caller payload for this normalized action — NOT
    // decision.request.payload, which the decision sanitizer has already stripped
    // of authority/unknown keys. The C1 contract requires EXACTLY { prompt }, so
    // authority + unknown caller fields must be REJECTED here, never silently
    // removed. On success, thread the normalized { prompt } forward; inputChars is
    // a content-free count for usage logging.
    const rawPayload = (body !== null && typeof body === 'object' && !Array.isArray(body))
      ? (body as { payload?: unknown }).payload
      : undefined;
    const input = validateAiGatewayInput(decision.actionType, rawPayload);
    if (!input.ok) {
      await recordUsage({ decision, promptChars: null, userId, status: 'invalid_payload', httpStatus: 400, provider: 'gemini', errorCode: AI_GATEWAY_ERROR_CODES.INVALID_PAYLOAD });
      return json(buildInvalidPayloadResponse(decision, { code: AI_GATEWAY_ERROR_CODES.INVALID_PAYLOAD, message: 'Invalid payload.' }), 400);
    }
    decision.request.payload = input.payload; // provider consumes ONLY the normalized payload
    const inputChars = input.inputChars;

    // ---- Budget guard: reserve BEFORE Gemini (every provider action, all
    // tiers — the old tier-based budget-check flag is intentionally ignored). ----
    const policy = getBudgetPolicy();
    const estimatedCostUsd = resolveEstimatedCostUsd(decision);
    if (estimatedCostUsd === null) {
      // No usable server-owned estimate → fail closed, NO provider call.
      await recordUsage({ decision, promptChars: inputChars, userId, status: 'budget_guard_unavailable', httpStatus: 503, provider: 'gemini', errorCode: 'budget_guard_unavailable' });
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
      await recordUsage({ decision, promptChars: inputChars, userId, status: 'rate_limited', httpStatus: 429, provider: 'gemini', errorCode: 'rate_limited' });
      const retry = (typeof guard.retryAfterSeconds === 'number' && guard.retryAfterSeconds > 0)
        ? { 'Retry-After': String(guard.retryAfterSeconds) }
        : undefined;
      return json(buildRateLimitedResponse(decision), 429, retry);
    }
    if (guard.status === 'budget_exceeded') {
      await recordUsage({ decision, promptChars: inputChars, userId, status: 'budget_exceeded', httpStatus: 429, provider: 'gemini', errorCode: 'budget_exceeded' });
      return json(buildBudgetExceededResponse(decision), 429);
    }
    if (guard.status !== 'approved') {
      // 'unavailable' (RPC/DB error or malformed result) → fail closed, no call.
      await recordUsage({ decision, promptChars: inputChars, userId, status: 'budget_guard_unavailable', httpStatus: 503, provider: 'gemini', errorCode: 'budget_guard_unavailable' });
      return json(buildBudgetGuardUnavailableResponse(decision), 503);
    }

    // Approved + reserved → resolve the server-owned required capabilities
    // and select the ONE adapter for the server-owned routing decision. Both
    // steps are deterministic and fail CLOSED to the existing provider-error
    // path (502, same client-visible body, content-free usage row) — no
    // fallback, no second provider, no retry. The provider id comes ONLY
    // from decision.routing.selectedProvider; the capability list comes ONLY
    // from the static server-owned map + its profile drift guard.
    const requiredCapabilities = requiredGatewayCapabilities(decision.actionType, profile);
    if (requiredCapabilities === null) {
      await recordUsage({ decision, promptChars: inputChars, userId, status: 'provider_error', httpStatus: 502, provider: 'gemini', errorCode: 'provider_error' });
      return json(buildProviderErrorResponse(decision), 502);
    }
    const selection = executionRegistry.selectAdapter({
      provider: decision.routing.selectedProvider,
      capabilities: requiredCapabilities,
    });
    if (!selection.ok) {
      await recordUsage({ decision, promptChars: inputChars, userId, status: 'provider_error', httpStatus: 502, provider: 'gemini', errorCode: 'provider_error' });
      return json(buildProviderErrorResponse(decision), 502);
    }

    // Selected → run the provider EXACTLY ONCE. selection.adapter.run IS the
    // unchanged Gemini implementation reference, called with the same
    // decision/profile arguments as before. resultChars is a COUNT only.
    const { status, body: out, resultChars } = await selection.adapter.run(decision, profile);
    await recordUsage({
      decision,
      promptChars: inputChars,
      userId,
      status: out?.execution?.status ?? 'provider_error',
      httpStatus: status,
      provider: 'gemini',
      errorCode: out?.error?.code ?? null,
      resultChars,
    });
    return json(out, status);
  }

  // ---- IMAGE lane (M2 J3C S4.1): studio.generate_image only ----
  // Mirrors the text branch's lifecycle EXACTLY — profile → strict input
  // validation → budget reservation → ONE provider attempt — but invokes the
  // dedicated image adapter directly (the text execution registry stays
  // text-only; its capability vocabulary is untouched). No fallback, no
  // retry, no second provider; every rejection is content-free.
  if (isGeminiImageExecutableAction(decision.actionType) && decision.routing.selectedProvider === 'gemini') {
    const profile = getActionProfile(decision.actionType);
    if (!isGatewayImageAction(decision.actionType, profile)) {
      // Missing/drifted profile is a server misconfiguration — fail closed.
      await recordUsage({ decision, promptChars, userId, status: 'provider_error', httpStatus: 502, provider: 'gemini', model: GEMINI_IMAGE_MODEL, errorCode: 'provider_error' });
      return json(buildProviderErrorResponse(decision), 502);
    }

    // Strict per-action input validation (BEFORE budget + provider): the
    // ORIGINAL raw payload must be EXACTLY { prompt, aspectRatio } — authority
    // and unknown keys are REJECTED here, never silently removed.
    const rawPayload = (body !== null && typeof body === 'object' && !Array.isArray(body))
      ? (body as { payload?: unknown }).payload
      : undefined;
    const input = validateAiGatewayInput(decision.actionType, rawPayload);
    if (!input.ok) {
      await recordUsage({ decision, promptChars: null, userId, status: 'invalid_payload', httpStatus: 400, provider: 'gemini', model: GEMINI_IMAGE_MODEL, errorCode: AI_GATEWAY_ERROR_CODES.INVALID_PAYLOAD });
      return json(buildInvalidPayloadResponse(decision, { code: AI_GATEWAY_ERROR_CODES.INVALID_PAYLOAD, message: 'Invalid payload.' }), 400);
    }
    decision.request.payload = input.payload; // provider consumes ONLY the normalized payload
    const inputChars = input.inputChars;

    // Budget guard: reserve BEFORE the provider call — same fail-closed order
    // as the text lane. The per-image reservation comes ONLY from the server
    // routing decision (router-pinned $0.07 for this action).
    const policy = getBudgetPolicy();
    const estimatedCostUsd = resolveEstimatedCostUsd(decision);
    if (estimatedCostUsd === null) {
      await recordUsage({ decision, promptChars: inputChars, userId, status: 'budget_guard_unavailable', httpStatus: 503, provider: 'gemini', model: GEMINI_IMAGE_MODEL, errorCode: 'budget_guard_unavailable' });
      return json(buildBudgetGuardUnavailableResponse(decision), 503);
    }
    const guard = await reserveAiBudget({
      supabaseAdmin: ctx.supabaseAdmin,
      userId,
      requestId,
      actionType: decision.actionType,
      estimatedCostUsd,
      policy,
    });
    if (guard.status === 'rate_limited') {
      await recordUsage({ decision, promptChars: inputChars, userId, status: 'rate_limited', httpStatus: 429, provider: 'gemini', model: GEMINI_IMAGE_MODEL, errorCode: 'rate_limited' });
      const retry = (typeof guard.retryAfterSeconds === 'number' && guard.retryAfterSeconds > 0)
        ? { 'Retry-After': String(guard.retryAfterSeconds) }
        : undefined;
      return json(buildRateLimitedResponse(decision), 429, retry);
    }
    if (guard.status === 'budget_exceeded') {
      await recordUsage({ decision, promptChars: inputChars, userId, status: 'budget_exceeded', httpStatus: 429, provider: 'gemini', model: GEMINI_IMAGE_MODEL, errorCode: 'budget_exceeded' });
      return json(buildBudgetExceededResponse(decision), 429);
    }
    if (guard.status !== 'approved') {
      await recordUsage({ decision, promptChars: inputChars, userId, status: 'budget_guard_unavailable', httpStatus: 503, provider: 'gemini', model: GEMINI_IMAGE_MODEL, errorCode: 'budget_guard_unavailable' });
      return json(buildBudgetGuardUnavailableResponse(decision), 503);
    }

    // Approved + reserved → EXACTLY ONE image provider attempt.
    const { status, body: out, resultChars, diagnosticCode } = await runGeminiImage(decision, profile);
    // S4.1a: the allowlisted, content-free upstream diagnostic goes ONLY into
    // the existing ai_usage.error_code seat (via recordUsage). The client body
    // `out` is returned untouched — the diagnostic never enters the response.
    await recordUsage({
      decision,
      promptChars: inputChars,
      userId,
      // deno-lint-ignore no-explicit-any
      status: (out as any)?.execution?.status ?? 'provider_error',
      httpStatus: status,
      provider: 'gemini',
      model: GEMINI_IMAGE_MODEL,
      errorCode: (typeof diagnosticCode === 'string' && diagnosticCode)
        ? diagnosticCode
        // deno-lint-ignore no-explicit-any
        : ((out as any)?.error?.code ?? null),
      resultChars,
    });
    return json(out, status);
  }

  // Otherwise: unchanged not_implemented decision (now user-linked).
  await recordUsage({ decision, promptChars, userId, status: 'not_implemented', httpStatus: 200 });
  return json(buildAiGatewayResponse(body), 200);
});

// ===================================================================
// AI Gateway — server-only budget guard.
//
// SERVER-ONLY. Calls the atomic public.reserve_ai_budget RPC through the
// trusted service-role admin client (supabaseAdmin) provided by the
// authenticated @supabase/server context. It NEVER constructs its own client,
// NEVER reads request payload content, and NEVER receives raw prompt / system
// / result text.
//
// The RPC is EXECUTE-granted to service_role ONLY (revoked from public / anon /
// authenticated), so a signed-in client cannot call it directly and consume
// counters without a provider request. The RPC trusts the user UUID only
// because the Edge Function passes the VERIFIED id and only the service role
// may invoke it.
//
// Fail-closed: any RPC / network / DB error, or any malformed RPC result,
// normalizes to `unavailable`. The shell must never fall back to an unguarded
// provider call.
// ===================================================================

import type { BudgetPolicy } from './budgetPolicy.ts';

export type BudgetGuardResult =
  | { ok: true; status: 'approved' }
  | { ok: false; status: 'rate_limited'; retryAfterSeconds: number | null }
  | { ok: false; status: 'budget_exceeded' }
  | { ok: false; status: 'unavailable' };

export interface ReserveAiBudgetParams {
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any;        // trusted service-role client from the auth context
  userId: string;            // VERIFIED auth user UUID (never from the request body)
  requestId: string;         // server-generated request id
  actionType: string;        // validated action type
  estimatedCostUsd: number;  // server-owned estimate (from the routing decision)
  policy: BudgetPolicy;       // server-owned limits
}

const RETRY_AFTER_MAX_SECONDS = 3600;

// Normalize an RPC row (table-returning fn → array, or a bare object) into a
// strict shape, or null if it is not well-formed.
// deno-lint-ignore no-explicit-any
function normalizeRpcRow(data: any): { allowed: boolean; reason: string; retryAfterSeconds: number | null } | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  if (typeof row.allowed !== 'boolean' || typeof row.reason !== 'string') return null;
  const ra = row.retry_after_seconds;
  const retryAfterSeconds = (typeof ra === 'number' && Number.isFinite(ra) && ra > 0)
    ? Math.min(Math.round(ra), RETRY_AFTER_MAX_SECONDS)
    : null;
  return { allowed: row.allowed, reason: row.reason, retryAfterSeconds };
}

// Reserve budget BEFORE the provider call. Returns a small discriminated
// result; never throws.
export async function reserveAiBudget(params: ReserveAiBudgetParams): Promise<BudgetGuardResult> {
  const { supabaseAdmin, userId, requestId, actionType, estimatedCostUsd, policy } = params || ({} as ReserveAiBudgetParams);

  // Defensive fail-closed on bad inputs — never proceed to a provider call.
  if (!supabaseAdmin || typeof supabaseAdmin.rpc !== 'function') return { ok: false, status: 'unavailable' };
  if (typeof userId !== 'string' || !userId) return { ok: false, status: 'unavailable' };
  if (typeof estimatedCostUsd !== 'number' || !Number.isFinite(estimatedCostUsd) || estimatedCostUsd < 0) {
    return { ok: false, status: 'unavailable' };
  }
  if (!policy || typeof policy !== 'object') return { ok: false, status: 'unavailable' };

  // deno-lint-ignore no-explicit-any
  let result: any;
  try {
    result = await supabaseAdmin.rpc('reserve_ai_budget', {
      p_user_id: userId,
      p_request_id: requestId,
      p_action_type: actionType,
      p_estimated_cost_usd: estimatedCostUsd,
      p_rate_per_minute: policy.ratePerMinute,
      p_user_daily_limit_usd: policy.userDailyUsd,
      p_user_monthly_limit_usd: policy.userMonthlyUsd,
      p_global_monthly_limit_usd: policy.globalMonthlyUsd,
    });
  } catch {
    return { ok: false, status: 'unavailable' };   // network / thrown → fail closed
  }

  if (!result || result.error) return { ok: false, status: 'unavailable' };  // PostgREST error → fail closed

  const row = normalizeRpcRow(result.data);
  if (!row) return { ok: false, status: 'unavailable' };                     // malformed → fail closed

  if (row.allowed === true && row.reason === 'approved') return { ok: true, status: 'approved' };
  if (row.allowed === false && row.reason === 'rate_limited') {
    return { ok: false, status: 'rate_limited', retryAfterSeconds: row.retryAfterSeconds };
  }
  if (row.allowed === false && row.reason === 'budget_exceeded') return { ok: false, status: 'budget_exceeded' };

  // Any other combination is unexpected → fail closed.
  return { ok: false, status: 'unavailable' };
}

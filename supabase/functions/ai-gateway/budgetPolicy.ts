// ===================================================================
// AI Gateway — server-only budget policy (limits + reservation estimate).
//
// SERVER-ONLY. Owns the conservative safety-guard limits used by the budget
// guard, and the extraction of a request's estimated reservation from the
// validated server routing decision. It is NOT re-exported through any
// src/lib shim and MUST NOT be imported by any frontend module — limits are
// never exposed to the browser.
//
// Limits come ONLY from server environment variables (with safe fallbacks +
// upper clamps); a caller can never override them. These are ESTIMATED safety
// caps, NOT provider billing truth — there is no commercial pricing table
// here. The reservation estimate comes only from the router's costEstimate;
// a request may never supply its own estimated cost.
// ===================================================================

export interface BudgetPolicy {
  ratePerMinute: number;      // max authenticated requests per fixed minute (per user)
  userDailyUsd: number;       // per-user estimated USD cap per day
  userMonthlyUsd: number;     // per-user estimated USD cap per month
  globalMonthlyUsd: number;   // global org estimated USD cap per month
}

// Conservative defaults for the current single-owner / internal system.
// Frozen so the defaults themselves can never be mutated at runtime.
const DEFAULTS = Object.freeze({
  ratePerMinute: 10,
  userDailyUsd: 1.0,
  userMonthlyUsd: 15.0,
  globalMonthlyUsd: 50.0,
});

// Reasonable absolute bounds — env overrides are clamped into these so a
// mis-set variable can never disable the guard or set an absurd cap.
const RATE_MIN = 1;
const RATE_MAX = 10000;
const USD_MIN = 0.01;
const USD_MAX = 1000000;

// Read a server env var without hard-depending on Deno (so this module also
// imports cleanly under Node/Vitest, where Deno is absent → undefined → fallback).
function readEnv(name: string): string | undefined {
  // deno-lint-ignore no-explicit-any
  const env = (globalThis as any).Deno?.env;
  return env && typeof env.get === 'function' ? env.get(name) : undefined;
}

function parseFinite(raw: string | undefined): number | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Missing / non-finite / zero / negative → fallback; otherwise clamp to [min,max].
function resolveInt(name: string, fallback: number, min: number, max: number): number {
  const n = parseFinite(readEnv(name));
  if (n === null || n <= 0) return fallback;
  return Math.min(Math.max(Math.round(n), min), max);
}
function resolveUsd(name: string, fallback: number, min: number, max: number): number {
  const n = parseFinite(readEnv(name));
  if (n === null || n <= 0) return fallback;
  return Math.min(Math.max(n, min), max);
}

// Build the deeply-frozen policy from server env (or defaults). Takes NO
// caller input — limits are server-owned only.
export function getBudgetPolicy(): BudgetPolicy {
  return Object.freeze({
    ratePerMinute: resolveInt('AI_BUDGET_RATE_PER_MINUTE', DEFAULTS.ratePerMinute, RATE_MIN, RATE_MAX),
    userDailyUsd: resolveUsd('AI_BUDGET_USER_DAILY_USD', DEFAULTS.userDailyUsd, USD_MIN, USD_MAX),
    userMonthlyUsd: resolveUsd('AI_BUDGET_USER_MONTHLY_USD', DEFAULTS.userMonthlyUsd, USD_MIN, USD_MAX),
    globalMonthlyUsd: resolveUsd('AI_BUDGET_GLOBAL_MONTHLY_USD', DEFAULTS.globalMonthlyUsd, USD_MIN, USD_MAX),
  });
}

// The frozen default policy (for tests / documentation of the safe baseline).
export const BUDGET_POLICY_DEFAULTS: BudgetPolicy = DEFAULTS;

// The estimated reservation for a request comes ONLY from the validated server
// routing decision (decision.routing.costEstimate.estimatedCost). Must be a
// finite, non-negative number; otherwise null → the shell fails closed and
// makes NO provider call. A request-supplied estimate is never consulted.
// deno-lint-ignore no-explicit-any
export function resolveEstimatedCostUsd(decision: any): number | null {
  const est = decision && decision.routing && decision.routing.costEstimate
    ? decision.routing.costEstimate.estimatedCost
    : undefined;
  if (typeof est === 'number' && Number.isFinite(est) && est >= 0) return est;
  return null;
}

// ===================================================================
// AI Gateway frontend client — isolated seam (UNWIRED).
//
// One public call: `callAiGateway(actionType, payload)`. It invokes the
// deployed Supabase Edge Function `ai-gateway` via the existing Supabase
// client and returns a normalized, UI-safe result object. It never
// throws for normal failures.
//
// The frontend is NOT provider authority: there is no provider/model
// parameter, and any provider/model/secret keys smuggled in `payload`
// are stripped with the SAME sanitizer the server uses. Provider/model
// selection is decided entirely server-side.
//
// This module is intentionally imported by NOTHING yet (no UI, no Jake,
// no Studio) — it is the client seam only. No prompt persistence, no
// URL/storage writes, no navigation, no auto-generation.
// ===================================================================

import { supabase, isSupabaseConfigured } from './supabase.js';
import { normalizeActionType } from './aiGateway.js';
import { normalizeGatewayPayload } from './aiGatewayContract.js';

const GATEWAY_FUNCTION_NAME = 'ai-gateway';

// Client-side error codes (server codes like provider_not_configured /
// provider_error / invalid_payload / not_implemented pass through from the
// Edge Function body unchanged).
export const AI_GATEWAY_CLIENT_CODES = Object.freeze({
  SUPABASE_NOT_CONFIGURED: 'supabase_not_configured',
  INVALID_ACTION: 'invalid_action',
  UNAUTHORIZED: 'unauthorized',
  NETWORK_ERROR: 'network_error',
  GATEWAY_ERROR: 'gateway_error',
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// ---- pure: build the invoke() args, or a deterministic invalid_action ----
export function buildGatewayInvokeArgs(actionType, payload = {}) {
  const action = normalizeActionType(actionType);
  if (!action) {
    return {
      ok: false,
      error: {
        code: AI_GATEWAY_CLIENT_CODES.INVALID_ACTION,
        message: 'Unknown or unsupported actionType.',
      },
    };
  }
  // Same sanitizer the server applies — strips provider/model/apiKey/secret/
  // token/etc. so the frontend can never assert provider authority.
  const safePayload = normalizeGatewayPayload(payload);
  return {
    ok: true,
    name: GATEWAY_FUNCTION_NAME,
    body: { actionType: action, payload: safePayload },
  };
}

// ---- pure: map an invoke outcome to a stable UI-safe result ----
// `data`  = the Edge Function response body (from a 2xx `data`, or recovered
//           from the error body on non-2xx) — may carry ok:true or ok:false.
// `error` = a client/network/config signal { code, message } when there is
//           no usable server body.
export function normalizeGatewayResult(data, error) {
  if (error && typeof error === 'object') {
    return {
      ok: false,
      error: {
        code: error.code || AI_GATEWAY_CLIENT_CODES.GATEWAY_ERROR,
        message: error.message || 'AI Gateway request failed.',
      },
      execution: { status: 'rejected' },
    };
  }

  if (isPlainObject(data)) {
    if (data.ok === true) {
      return {
        ok: true,
        actionType: data.actionType ?? null,
        routing: data.routing ?? null,
        provider: data.provider ?? null,
        execution: data.execution ?? null,
        result: data.result ?? null,
        usage: data.usage ?? null,
      };
    }
    if (data.ok === false && isPlainObject(data.error)) {
      return {
        ok: false,
        actionType: data.actionType ?? null,
        error: {
          code: data.error.code || AI_GATEWAY_CLIENT_CODES.GATEWAY_ERROR,
          message: data.error.message || 'AI Gateway error.',
        },
        execution: isPlainObject(data.execution) ? data.execution : { status: 'rejected' },
      };
    }
  }

  return {
    ok: false,
    error: { code: AI_GATEWAY_CLIENT_CODES.GATEWAY_ERROR, message: 'Unexpected AI Gateway response.' },
    execution: { status: 'rejected' },
  };
}

// functions.invoke reports non-2xx via `error` (FunctionsHttpError) with the
// real response on `error.context` (a Response) — NOT on `data`. Recover the
// server's JSON body from there so codes like provider_not_configured survive.
async function readInvokeErrorBody(error) {
  const ctx = error && error.context;
  if (!ctx || typeof ctx.json !== 'function') return null;
  try {
    return await ctx.json();
  } catch {
    return null;
  }
}

function classifyInvokeError(error) {
  const status = (error && error.context && typeof error.context.status === 'number') ? error.context.status : 0;
  if (status === 401 || status === 403) return AI_GATEWAY_CLIENT_CODES.UNAUTHORIZED;
  if (status === 0) return AI_GATEWAY_CLIENT_CODES.NETWORK_ERROR;
  return AI_GATEWAY_CLIENT_CODES.GATEWAY_ERROR;
}

// ---- thin impure shell: feature-detect → invoke → normalize (never throws) ----
export async function callAiGateway(actionType, payload = {}) {
  if (!isSupabaseConfigured || !supabase) {
    return normalizeGatewayResult(null, {
      code: AI_GATEWAY_CLIENT_CODES.SUPABASE_NOT_CONFIGURED,
      message: 'AI Gateway is not configured.',
    });
  }

  const args = buildGatewayInvokeArgs(actionType, payload);
  if (!args.ok) {
    // Invalid action → fail fast, no network call.
    return normalizeGatewayResult(null, args.error);
  }

  try {
    const { data, error } = await supabase.functions.invoke(args.name, { body: args.body });
    if (error) {
      const body = await readInvokeErrorBody(error);
      if (body) return normalizeGatewayResult(body, null);
      return normalizeGatewayResult(null, {
        code: classifyInvokeError(error),
        message: 'AI Gateway request failed.',
      });
    }
    return normalizeGatewayResult(data, null);
  } catch {
    return normalizeGatewayResult(null, {
      code: AI_GATEWAY_CLIENT_CODES.NETWORK_ERROR,
      message: 'AI Gateway request failed.',
    });
  }
}

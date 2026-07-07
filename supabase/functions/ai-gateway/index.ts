// ===================================================================
// Supabase Edge Function: ai-gateway (STUB)
//
// Thin HTTP shell only. ALL validation + provider routing lives in the
// pure, node-testable contract layer (supabase/functions/_shared/
// aiGatewayContract.js). This stub performs NO provider execution and
// reads NO provider secrets — it returns a routing decision with
// execution deferred.
//
// The contract lives in _shared so this function is self-contained
// inside Supabase's uploadable function tree (Dashboard + CLI deploy).
// NOTE: not deployed in this slice; deploy wiring is a later slice.
// ===================================================================

import { buildAiGatewayResponse } from '../_shared/aiGatewayContract.js';

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

  // Auth placeholder: Supabase JWT verification is deferred to the wiring
  // slice. The stub trusts nothing and executes no provider regardless.

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

  const result = buildAiGatewayResponse(body);
  return json(result, result.ok ? 200 : 400);
});

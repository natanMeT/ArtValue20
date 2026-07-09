// ===================================================================
// AI Gateway usage log (server-only, Deno).
//
// Best-effort insert of ONE content-free `ai_usage` row per terminal
// gateway outcome. Server-side only: it uses the service-role key
// (auto-injected into deployed Edge Functions as SUPABASE_SERVICE_ROLE_KEY)
// against PostgREST — never the frontend anon client, never a browser.
//
// The service role bypasses RLS, which is why writes succeed even though
// there is no insert policy. It MUST never reach the frontend.
//
// Privacy: the `record` passed here is already content-free (built by the
// pure buildUsageRecord — counts only, no prompt/response text). This
// module logs no keys, no prompts, no response text; on failure it emits
// only a safe status diagnostic. It NEVER throws — usage logging must not
// block or fail the AI response.
// ===================================================================

// deno-lint-ignore no-explicit-any
type UsageRecord = Record<string, any>;

export async function logUsage(record: UsageRecord): Promise<'logged' | 'log_failed' | 'log_skipped'> {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  // No server credentials → skip silently (e.g. local run). Never blocks.
  if (!url || !serviceKey) return 'log_skipped';

  try {
    const res = await fetch(`${url}/rest/v1/ai_usage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(record),
    });
    if (!res.ok) {
      // status only — never the key, the record, or any content
      console.error('[ai-gateway] usage log rejected', JSON.stringify({ status: res.status }));
      return 'log_failed';
    }
    return 'logged';
  } catch (e) {
    const message = (e instanceof Error ? e.message : 'unknown').slice(0, 120);
    console.error('[ai-gateway] usage log threw', JSON.stringify({ message }));
    return 'log_failed';
  }
}

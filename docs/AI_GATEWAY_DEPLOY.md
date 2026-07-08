# AI Gateway — Deploy Verification Runbook

## 1. Purpose

This runbook verifies the **already-merged AI Gateway Edge Function stub** end-to-end on a real Supabase project **before** any real provider execution, secrets, or frontend wiring are added.

The stub is intentionally inert: it authenticates nothing beyond Supabase's own JWT gate, calls no AI provider, reads no secrets, and costs nothing. Deploying it proves the transport layer — CLI bundling of `_shared`, CORS, request parsing, and the response contract — at zero risk. Only after this verification is green does the first real provider slice (`feat/ai-gateway-gemini-text`) make sense.

All commands in this document are **user-executed** (they require your Supabase account). Nothing here modifies the repo.

## 2. Current architecture summary

- **Edge Function:** `supabase/functions/ai-gateway/index.ts` — thin Deno HTTP shell (CORS + POST-only + defensive JSON parse).
- **Canonical shared modules:** `supabase/functions/_shared/aiGateway.js` (pure provider router) and `supabase/functions/_shared/aiGatewayContract.js` (request validation / response normalization). The function imports `../_shared/aiGatewayContract.js`, so the whole function tree is self-contained for deploy.
- **Compatibility shims:** `src/lib/aiGateway.js` and `src/lib/aiGatewayContract.js` are re-export shims pointing at the `_shared` canonicals — app tests import through them; behavior is identical.
- **Execution status:** every valid request returns `execution.status: "not_implemented"` — a routing decision only, never a provider call.
- **Secrets:** none are required or read. `Deno.env` is not used anywhere in the function tree in this slice.

## 3. Prerequisites

- A Supabase account with access to the ArtValue project (the same project the app's `VITE_SUPABASE_URL` points at).
- **Supabase CLI** installed. Windows options:
  - `scoop install supabase` (recommended), or
  - `winget install Supabase.CLI`, or
  - download from https://github.com/supabase/cli/releases
- *(Optional)* **Deno** installed, for a local type-check before deploying: https://deno.land
- Your **project ref** — the short id in your project URL: `https://<PROJECT_REF>.supabase.co` (also under Dashboard → Project Settings → General).
- Your **anon key** — Dashboard → Project Settings → API → `anon` `public`. This is the same publishable key the frontend already uses; it is *not* a secret, but treat the transcript with normal care.
- Ability to complete `supabase login` (opens a browser to issue an access token).

## 4. Local verification (before deploying)

From the repo root:

```powershell
npm test
```

Expected: all test files green (the AI Gateway suites cover routing, the contract, purity, and the Edge Function source guardrails).

If Deno is installed, also run:

```powershell
deno check supabase/functions/ai-gateway/index.ts
```

Expected: no errors. If Deno is not installed, skip this — `supabase functions deploy` type-checks at bundle time anyway.

## 5. Supabase CLI flow

Run each step and keep the output:

```powershell
supabase --version
supabase login
supabase link --project-ref <PROJECT_REF>
supabase functions deploy ai-gateway
```

Notes:

- **JWT verification stays ON** (the default). Do **not** pass `--no-verify-jwt`. The deployed endpoint will require a valid `Authorization: Bearer <anon key>` header, which matches the future auth story and keeps the endpoint from being anonymously invocable.
- If `supabase link` insists on creating or modifying `supabase/config.toml`, **stop and report the exact prompt/output before accepting** — that file is intentionally not part of this slice and its introduction should be reviewed first. (If the CLI only writes a project-ref pointer under `.git`-ignored state, that is fine.)
- Deploy uploads `supabase/functions/ai-gateway/` **and** `supabase/functions/_shared/` (the CLI includes `_shared` automatically). No import map or `deno.json` is needed — the function has zero external imports.

## 6. Smoke test

Replace `<PROJECT_REF>` and `<ANON_KEY>`, then run:

**Valid request** (curl; Git Bash / any shell with curl):

```bash
curl -s -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/ai-gateway" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "apikey: <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"actionType":"text.copy","payload":{"prompt":"בדיקה"}}'
```

PowerShell equivalent:

```powershell
Invoke-RestMethod -Method Post `
  -Uri "https://<PROJECT_REF>.supabase.co/functions/v1/ai-gateway" `
  -Headers @{ Authorization = "Bearer <ANON_KEY>"; apikey = "<ANON_KEY>" } `
  -ContentType "application/json" `
  -Body '{"actionType":"text.copy","payload":{"prompt":"test"}}' | ConvertTo-Json -Depth 8
```

**Expected response** (HTTP 200):

```json
{
  "ok": true,
  "actionType": "text.copy",
  "request": { "actionType": "text.copy", "payload": { "prompt": "בדיקה" }, "options": {} },
  "routing": {
    "providerChain": ["gemini", "openai", "openrouter", "ollama"],
    "selectedProvider": "gemini",
    "costTier": "low",
    "requiresServer": true,
    "requiresBudgetCheck": false,
    "costEstimate": { "costTier": "low", "estimatedUnits": 1, "estimatedCost": 0.002, "currency": "USD", "isExact": false }
  },
  "execution": {
    "status": "not_implemented",
    "message": "AI Gateway proxy stub is ready; provider execution is deferred."
  },
  "usage": { "logging": "deferred", "budgetCheck": "deferred" }
}
```

Key assertions: `ok: true`, actionType normalized, `routing` present, `execution.status: "not_implemented"`, `usage.logging: "deferred"`, `usage.budgetCheck: "deferred"`.

**Invalid actionType** (same headers, body `{"actionType":"text.hack"}`) — expected HTTP 400:

```json
{
  "ok": false,
  "error": { "code": "invalid_action", "message": "Unknown or missing actionType. Use a value from AI_ACTION_TYPES." },
  "execution": { "status": "rejected" }
}
```

**Other negative checks:**

- Malformed JSON body → HTTP 400, `error.code: "invalid_json"`, `execution.status: "rejected"`.
- GET request → HTTP 405, `error.code: "method_not_allowed"`.
- Missing/invalid `Authorization` header → HTTP 401 from Supabase's JWT gate (before the function runs) — this confirms JWT verification is ON.

## 7. What to paste back for review

Copy all of the following into the ChatGPT/Claude review thread:

1. Output of `supabase functions deploy ai-gateway` (success line or full error).
2. The **valid** smoke-test response JSON.
3. The **invalid-actionType** smoke-test response JSON.
4. The HTTP status you got with **no** Authorization header (expect 401).
5. Local `npm test` summary line.
6. `deno check` output, if you ran it.
7. Any error message from any step, verbatim.

## 8. Security notes

- **No provider keys in this slice.** The stub needs none and reads none.
- **Do not add `GEMINI_API_KEY` yet.** It belongs to the next slice (`feat/ai-gateway-gemini-text`) and will be set as a server-side Edge secret:
  ```powershell
  supabase secrets set GEMINI_API_KEY=...
  ```
  and read via `Deno.env.get()` inside the function shell only — never in the pure `_shared` modules.
- **No `VITE_*` provider secrets, ever again.** `VITE_*` values are baked into the public frontend bundle.
- **`VITE_GEMINI_API_KEY` stays for now** (the legacy frontend path still uses it) and is rotated **only after** server-side Gemini parity is proven — rotating earlier would break working features for no security gain, since the replacement path wouldn't exist yet.

## 9. Next slices (in order)

1. **`feat/ai-gateway-gemini-text`** — first real server-side provider: Gemini text execution behind an action whitelist, `GEMINI_API_KEY` via Edge secrets, fail-closed `provider_not_configured` when unset.
2. **Frontend wiring** — `aiGatewayClient.js` + `supabase.functions.invoke`, feature-detected, behind explicit user CTAs only; lands after deploy + provider parity are proven.
3. **Key rotation** — migrate remaining Gemini traffic server-side, then rotate and remove `VITE_GEMINI_API_KEY`.

## 10. Gemini text live verification (run after the Gemini-text slice merges)

The `feat/ai-gateway-gemini-text` slice adds real server-side Gemini **text** execution for the gemini-first text actions (`text.copy`, `text.crm_message`, `studio.prompt_enhance`, `crm.suggest_next_action`). Verify it live:

**1. Set the secret** (server-side only — never a `VITE_*`, never pasted into chat):

```powershell
supabase secrets set GEMINI_API_KEY=<your-key> --project-ref weciwurjfwmqihcyexzj
```

Optional model override (non-secret; default `gemini-2.0-flash`):

```powershell
supabase secrets set GEMINI_MODEL=gemini-2.0-flash --project-ref weciwurjfwmqihcyexzj
```

**2. Redeploy** (JWT verification stays ON — do not pass `--no-verify-jwt`):

```powershell
supabase functions deploy ai-gateway
```

**3. Smoke test — executable Gemini text action** (expect HTTP 200, real completion):

```powershell
Invoke-RestMethod -Method Post `
  -Uri "<SUPABASE_PROJECT_URL>/functions/v1/ai-gateway" `
  -Headers @{ Authorization = "Bearer <ANON_KEY>"; apikey = "<ANON_KEY>" } `
  -ContentType "application/json" `
  -Body '{"actionType":"text.copy","payload":{"prompt":"Write one short line about a coffee shop."}}' | ConvertTo-Json -Depth 8
```

Expected success shape:

```json
{
  "ok": true,
  "actionType": "text.copy",
  "provider": "gemini",
  "execution": { "status": "completed" },
  "result": { "text": "…real Gemini output…" },
  "usage": { "logging": "deferred", "budgetCheck": "deferred" }
}
```

**4. Verify the other paths:**

- **Missing secret** (test *before* step 1, or after `supabase secrets unset GEMINI_API_KEY` + redeploy): `text.copy` → HTTP 503, `error.code: "provider_not_configured"`, `execution.status: "provider_not_configured"`, **no** `result` (fail-closed, no provider call).
- **Missing prompt** (`{"actionType":"text.copy","payload":{}}`) → HTTP 400, `error.code: "invalid_payload"`.
- **Deferred action** (`{"actionType":"image.poster"}`) → HTTP 200, `execution.status: "not_implemented"` (unchanged; no provider call).
- **Anthropic-first text action** (`{"actionType":"text.strategy"}`) → still `not_implemented` (routes to anthropic, which isn't wired).
- **Invalid actionType** → HTTP 400, `error.code: "invalid_action"`.
- **Optional — no `Authorization` header** → HTTP 401 from Supabase's JWT gate (confirms JWT verification is ON — the check skipped in the stub deploy).

**5. Paste back:** the deploy line, the successful `text.copy` response JSON, the `provider_not_configured` response (if tested), the `image.poster` `not_implemented` response, the no-auth HTTP status, and `npm test` summary. **Never paste the API key or any secret into chat.**

Provider errors surface as HTTP 502 `error.code: "provider_error"` with a fixed generic message — upstream provider text and the key are never forwarded to the client.

### Troubleshooting `provider_error` (HTTP 502)

`provider_error` is the sanitized catch-all for any upstream Gemini failure (non-2xx, empty completion, or a thrown request). The client never sees the real reason by design.

- **Known fix already applied:** the request body no longer sends `generationConfig.thinkingConfig` — that field is Gemini 2.5-series only and the default `gemini-2.0-flash` rejected it with HTTP 400, which showed up as a 502. Re-deploy after pulling this change, then re-run the `text.copy` smoke test.
- **To see the real upstream reason:** the function now logs a safe diagnostic line (provider, model, upstream HTTP status, and a short capped snippet — **never** the key or your prompt). Read it in **Supabase Dashboard → Edge Functions → `ai-gateway` → Logs** (or Logs Explorer). Look for `[ai-gateway] gemini upstream error` / `gemini empty completion` / `gemini request threw`.
- **If the status is 400/404 with a model name:** check the `GEMINI_MODEL` secret (or leave it unset to use the default `gemini-2.0-flash`). **If it's 429 / quota:** the key's project has hit a limit — a repo change cannot fix that.

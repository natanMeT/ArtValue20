# ArtValue — Project Tracker (living cross-session handoff)

> **Canonical source — this file is the ONLY tracker:** `docs/PROJECT_TRACKER.md` in `natanMeT/ArtValue20`. **Claude's memory may contain only a SHORT POINTER to this file — never a duplicate mirror.** The former memory mirror was deleted precisely because it went stale (it sat at the S0D era while this file moved through S0E, S0F.1 and P1), which is exactly how a later session gets misled. Read this file live at preflight; do not trust a cached copy. Claude keeps this file current; ChatGPT reviews the diff and does not edit it.

**Maintained by:** Claude Code — grounded in the real repo (reads files, runs commands).
**Purpose:** single source of truth for state, so work continues across sessions with no loss.
Nathan passes this to ChatGPT so it can review/advise **without re-deriving or guessing** state.
**ChatGPT does NOT edit this document.** Only Claude updates it.
**Last updated:** 2026-07-27 — session: **COMPLETE LOCAL-ENGINE RETIREMENT (rounds 8–15) — CLOSED / LIVE IN PRODUCTION.** Merge commit `9ecb8ebf023886f32496d3002944a3b092314cfe` (parents `5d7506d1` + the approved head `cd651ea`), 2026-07-27T07:00:34Z, **0 unresolved review threads**, Codex clean on the exact merged head. **The retirement is LIVE:** Production **`b3708cc2` / `index-C4frcMDi.js` (source `2c8b1df`)**, promoted unchanged from the accepted Preview `17bba0b3` (12/12 byte-identical), Edge `ai-gateway` **v36 ACTIVE / `verify_jwt=true`**. Current rollback target **`247ef9ec`**; `476830a2` is a historical fallback. No migration, schema, Auth or secret change. Rollback tag `pre-local-engine-retirement` @ `5d7506d1`. At the merged head: focused proof 2 files / 172 passed; **full suite 110 files / 3,074 passed / 0 skipped / 0 failed**. **The closure box in the Baseline below is the authoritative state.** Authenticated Studio generation and authenticated Jake Gateway calls are now **VERIFIED** (Preview acceptance, Account A). The Edge redeploy has been **performed** (v35 → v36).

> *Everything below in this summary is a **HISTORICAL** account of how the slice was built. Round labels such as "IN FLIGHT" describe the state **at that round**, not today.*

**(Round 11 — historical)** Nathan's absolute decision: no executable local-engine code anywhere in the repository, product AND tooling. Round 10's two disclosed exceptions are withdrawn. **The AI Gateway shared contract changed:** `comfyui` / `ollama` / `fooocus` / `a1111` are removed from `AI_PROVIDERS`, `AI_MODELS` and every routing chain, together with the `LOCAL_PROVIDERS` partition, the `localFirst` selection option (and its response metadata) and the local zero-cost branch — the 20-action cloud vocabulary is unchanged and every action still resolves to a non-empty all-API chain. **`scripts/local-review-prep.mjs` (a local-Ollama caller), its test, the whole `scripts/` directory, `comfy_help.txt` and the `local:review-prep` / `dev:local` / `preview:local` npm scripts are DELETED.** Docs corrected where they claimed local engines are still supported. Repo-wide proof scans **172 non-test executables** across `src/`, `supabase/`, root and `scripts/` for engine names and local addresses with comments stripped, and proves the `src/lib` Gateway shims are pure re-exports so no divergent copy can exist. Two further Codex P2s on `1233034` (a DemoMode copy regression of mine, and eval-provenance wording) were confirmed and fixed. Codex then broke the proof's hand-written scanner three times (URL `//` in string literals; nested `.mjs`/`.cjs`; then object literals in template substitutions, JSX text and regex after `return`). The approximation WAS the defect, so it is gone: the scanner is now **parser-backed via `@babel/parser`**, blanking only the parser's own comment ranges, and the address classes were widened to RFC1918/link-local/IPv6 private ranges in network context. Suite at that round **110 files / 2,997 passed / 0 skipped / 0 failed** *(superseded — the merged head measured 3,074)*, build green (`index-C4frcMDi.js`, 608.05 kB); the app bundle now has **zero** hits for every local term including the provider-registry strings that survived round 10. Runtime: retired routes fail safe, all surviving creative routes render, 0 local requests, 0 console messages. ⚠️ **An Edge `ai-gateway` redeploy will be REQUIRED later — NOT performed here**; nothing deployed, no secret or remote configuration touched. *(Still true today — see the PR #118 box.)* Prior round summaries follow. **(Round 10 — historical)** 

---

## How we work (roles)
- **Claude Code** = grounded author + executor. Reads the real code, runs commands, writes code/tests, deploys only under instruction. Authors technical briefs with real file/line/count evidence. Owns this tracker.
- **ChatGPT** = active technical supervisor + reviewer + translator. Reviews plans/diffs, supervises the staging, and MAY author detailed step-prompts for Claude — **built on the grounded facts Claude / this tracker provide**. Must NOT invent code-level facts (file paths, line numbers, function names, schema types, test counts, token budgets); those come from Claude or are asked for. Also translates Claude's technical messages into plain language for Nathan.
- **Nathan** = owner. Relays between the two; makes product + approval decisions. Not expected to understand the deep technical detail himself.

**The loop:** Nathan states the goal → Claude produces a grounded plan/brief (+ updates this tracker) → Nathan sends it to ChatGPT → ChatGPT supervises/critiques (and may write the next detailed prompt for Claude, grounded in Claude's material) → Nathan relays back → Claude executes → Claude updates this tracker.

**Message format Claude uses with Nathan (every technical message):** 🟢 a plain-language summary Nathan reads, + 🔵 a grounded block Nathan routes to ChatGPT without needing to understand it.

**ChatGPT GitHub access:** ChatGPT has read access to Nathan's GitHub → it CAN read actual file contents to verify code facts. It still CANNOT run tests/builds, see live Cloudflare/Supabase state, the uncommitted working tree, or token costs — those come from Claude / this tracker.

**Switching GPT chats:** when Nathan starts a fresh ChatGPT chat, Claude hands him the current tracker (paste) or points to the file source on GitHub, so the new chat knows exactly where things stand.

---

## Baseline (current — COMPLETE LOCAL-ENGINE RETIREMENT CLOSED / LIVE in Production)

> ### ✅ COMPLETE LOCAL-ENGINE RETIREMENT — **CLOSED / LIVE IN PRODUCTION** (2026-07-27)
>
> ArtValue is now a **cloud-only product in Production**. Every executable ComfyUI / Ollama / Fooocus / A1111
> integration — and its consumers, routes, provider registrations, configuration, scripts and tooling — is gone from
> the running application.
>
> | | |
> | --- | --- |
> | **Production deployment** | **`b3708cc2-ab2e-44ee-a557-8cc2ae688635`** (Environment Production, branch `main`, source `2c8b1df`) |
> | **Bundle** | **`index-C4frcMDi.js`** — SHA256 `3b9872b38ab6f19935f979ecc536a1d0aa3c5d2c682f6aa683e17c2f9470ebbc` (693,452 B) |
> | Release source | `2c8b1dff2f35d3f7ff7fc6c3d43df01eb8c0189d` (PR #119 merge). Application-code anchor `753ee2e`; later commits are test/docs-only |
> | Code PRs | [#118](https://github.com/natanMeT/ArtValue20/pull/118) merged `9ecb8eb` · [#119](https://github.com/natanMeT/ArtValue20/pull/119) merged `2c8b1df` |
> | **Edge** | `ai-gateway` **v36 ACTIVE, `verify_jwt=true`** — deployed from merged main; the only function on the project |
> | Migration / schema / Auth / secrets | **none** — 6/6 migrations applied and matching |
> | Preview accepted | **`17bba0b3`** (`retirement-preview-2c8b1df`) — full authenticated acceptance PASS |
>
> **Artifact proof — promoted unchanged, never rebuilt.** The deployed `dist/` was proven byte-identical three ways
> **before** deployment: local `dist/` ≡ the pre-Preview scan manifest (no drift) ≡ the bytes Preview actually served
> (12/12). Wrangler reported **"Uploaded 0 files (12 already uploaded)"**, and the canonical
> `artvalue-product.pages.dev` then served **12/12 files HTTP 200 and byte-identical**, with `index.html` referencing
> `assets/index-C4frcMDi.js`. The one build had already reproduced the previously smoke-verified hash exactly,
> confirming the intervening commits were test/docs-only.
>
> **Authenticated Preview acceptance (Account A) — all ten checks PASS.** Studio exposes one creative lane
> (`טקסט → תמונה`) plus Mockup Studio, Poster Editor, presets and aspect ratios; **zero** retired terms anywhere;
> Account A's durable brand palette (`#B7FF00 #0E0E0E #00D9FF #05070A #F5F7FA`) loaded, toggle active, and present in
> the generation payload; **exactly one** `studio.generate_image` call → **200 `ok:true`** through Edge v36, a real
> image returned with truthful success UI; the asset appeared in the uid-scoped gallery, opened and downloaded;
> **Jake answered in exactly one Gateway call listing only תמונה מהירה / Image Studio / Growth OS / גלריה — no retired
> capability** (the previous Production bundle advertised סדרת דמות / אלבום דוגמנית / פרזנטור מוצר); all ten retired
> routes failed safe to the dashboard; 25 s idle (former poll 15 s) produced **0** requests; **0 local-engine requests
> and 0 console errors throughout**. The single QA asset (`QA_RETIREMENT_ACCEPTANCE`) was deleted and the store
> verified back to 0 items, with **no database writes at any point** and business data unchanged (3 clients, 0 tasks,
> 0 quotes, ₪0 transactions).
>
> **Production smoke (non-mutating) — PASS.** Canonical URL serves `index-C4frcMDi.js`; the authenticated Account A
> session loads Clients, Quotes, Finance and Growth OS; Studio shows only supported cloud functionality with the brand
> palette active; **0** retired terms; retired routes fail safe; 20 s idle → **0** requests; **0** local-engine
> requests, **0** mutating requests, **0** console errors; Edge re-confirmed v36 / `verify_jwt=true`. No generation,
> save or delete was performed.
>
> **Rollback hierarchy — exactly one current target; never collapse these.**
> 1. **CURRENT rollback target: `247ef9ec-ad3a-4c15-8b16-25afa1c47f2b`** (source `03c23c2`, bundle
>    `index-BZ3B-0yd.js`) — the immediately previous Production deployment, verified **HTTP 200** and still serving its
>    own bundle after this release.
> 2. **HISTORICAL FALLBACK ONLY — not the current target: `476830a2-f8ea-45dc-b0ce-a71876bc48dd`** (source `7e30199`,
>    `index-BrR14XIC.js`), verified **HTTP 200**. Older deployments are progressively further behind.
> 3. Git rollback tag **`pre-local-engine-retirement` @ `5d7506d1`**. Edge rollback: redeploy the pre-merge
>    `supabase/functions/_shared/` to restore the v35 contract.
>
> **Remaining unselected follow-up (NOT implemented, NOT scheduled): platform-level egress hardening.** A guarantee
> that no future code path can construct a private-network request belongs to CSP `connect-src` and server-side egress
> policy, not to application JavaScript. Named sub-item: `fetchSiteText` passes a user-supplied URL to the third-party
> reader proxy — pre-existing, released behaviour, unchanged by this release.
>
> **P1 Atomic Quote Persistence remains CLOSED / LIVE. PR #117 remains paused and untouched.**
- Repo: `C:\Users\PC\ArtValue` (origin/main). GitHub repo `natanMeT/ArtValue20`.
- **Active application release code anchor:** **`2c8b1dff2f35d3f7ff7fc6c3d43df01eb8c0189d`** (repository `main` after docs PR #119; the running Production artifact was built from this commit). *(Historical anchors, retained only as the sources of older deployments: `03c23c2` — Studio containment, now the **current rollback target's** source; `7e30199` — P1; `983f4899` — S0F.1.)*
- **Three DISTINCT anchors — never collapse them.** This tracker records no fixed value for the repository head, because documentation merges advance it continuously and any pinned value would be false within minutes:
  1. **Repository `main` HEAD — NOT recorded here. Resolve it LIVE at every task's preflight** (`git rev-parse origin/main`). Do not read any SHA in this document as "the current head".
  2. **Historical application-code merge anchors:** `9ecb8eb` (PR #118) and `2c8b1df` (PR #119) — where the local-engine retirement entered `main`; its code is **now RELEASED** (see anchor 3). `29cccdd` (PR #114, Studio containment) is an older such anchor.
  3. **Deployed Production source:** **`2c8b1df`** — the commit the running Production artifact was actually built from (complete local-engine retirement). The prior `03c23c2` (Studio containment) is retained as the **current rollback deployment's** source.
  A live head will normally differ from anchors 2 and 3. **Divergence is expected and is NOT deployment drift. Never treat "merged into `main`" as "live" — always confirm which commit the running artifact was built from.**
- Hosting: Cloudflare Pages `artvalue-product` — canonical https://artvalue-product.pages.dev
- **Current Production deploy: `b3708cc2-ab2e-44ee-a557-8cc2ae688635`** (Environment Production, branch `main`, source **`2c8b1df`**, bundle **`index-C4frcMDi.js`**) — **LIVE (Complete Local-Engine Retirement — cloud-only product)**. Deployed by reusing the exact Preview-accepted `dist/` — **NOT rebuilt** (wrangler "Uploaded 0 files (12 already uploaded)"). **Served-bytes proof: 12/12 files fetched from the canonical URL are HTTP 200 and byte-identical (SHA256) to the accepted artifact**; entry `index-C4frcMDi.js` = `3b9872b38ab6f19935f979ecc536a1d0aa3c5d2c682f6aa683e17c2f9470ebbc` (693,452 bytes). Before deployment the same `dist/` was additionally proven identical to the pre-Preview scan manifest **and** to the bytes Preview `17bba0b3` actually served. Authenticated Account A **Preview acceptance (10/10) and non-mutating Production smoke both PASSED**.
- **Rollback hierarchy — exactly ONE deployment may be called the current target. Do not collapse these levels.**
  1. **CURRENT frontend rollback target: `247ef9ec-ad3a-4c15-8b16-25afa1c47f2b`** (source `03c23c2`, bundle `index-BZ3B-0yd.js`, Studio / Local-Engine UI Containment) — the immediately previous Production deployment, retained and **verified HTTP 200 post-deploy, still serving its own bundle**. **This is the deployment to roll back to.**
  2. **HISTORICAL FALLBACK ONLY — NOT the current target: `476830a2-f8ea-45dc-b0ce-a71876bc48dd`** (source `7e30199`, bundle `index-BrR14XIC.js`, P1) — retained, verified HTTP 200. It is **two releases behind**, so rolling back here would revert the Studio containment as well as the retirement. Use only if target 1 is itself unusable. (Older `e63198b7` S0F.1 / `4b86993d` S0E / `69f8a175` S0D / `cec116b9` S0C / `31cb521d` S0B / `4cb17aee` S0A are retained historically — likewise fallbacks only, progressively further behind.)
  3. **Edge rollback:** redeploy the pre-merge `supabase/functions/_shared/` to restore the **v35** contract. **Git rollback tag: `pre-local-engine-retirement` @ `5d7506d1`.**
- Preview (retained): **`17bba0b3-e904-49e3-9c8f-45e88f60f1fe`** (branch `retirement-preview-2c8b1df`, source `2c8b1df`, bundle `index-C4frcMDi.js`) — full authenticated acceptance PASSED; **this is the artifact promoted to Production unchanged**. The Studio-containment Preview `ec239e3b`, the P1 Preview `c999988e` and the S0F.1 Preview `0760f00e` are retained historically.
- Git rollback tags (P1): `pre-atomic-quote-persistence` @ `716da1b`, `pre-atomic-quote-live-compatibility` @ `f7ff9fad`, `pre-atomic-quote-pk-catalog-cast` @ `2e1b137` — all retained.
- Git rollback tags: `pre-local-engine-retirement` @ `5d7506d1`, `pre-s0f-creative-trust-brand-palette` @ `5efbeb9103710875fc3dad882ae78aca4b2938bc`, `pre-s0e-demo-tour-containment` @ `c10ac5590967410d0931a89b08a7bdab12030b25`, `pre-s0e-guided-onboarding` @ `becd070be72c5c0d59148f870db378cfad9cebea`, `pre-s0d-business-context` @ `3ee62aee`, `pre-s0c-identity-isolation` @ `385f77874da68f905b504facf92843e7ede76d97`, `pre-s0b-cloud-persistence` @ `7066520` — all retained.
- **Edge: `ai-gateway` v36 ACTIVE, `verify_jwt=true`** — the only function on the project. **v36 removed the local providers from the shared contract**: `comfyui` / `ollama` / `fooocus` / `a1111` are gone from `AI_PROVIDERS`, `AI_MODELS` and every routing chain, together with the `LOCAL_PROVIDERS` partition, the `localFirst` ordering option and its response metadata, and the local zero-cost branch; the 20-action cloud vocabulary is unchanged and every action still resolves to a non-empty all-API chain. Verified live: a request naming `provider:'ollama'` with `localFirst` returns `options:{}` and the chain `["gemini","openai","openrouter"]`. *(Historical: **v35** was the previous ACTIVE version — its only S0F.1 change was the Jake persona text constant and its related comment in `actionProfiles.ts`; it remains the Edge rollback target.)* Account Business Context continues to be assembled + injected by the **frontend chat/draft seam** before the existing Gateway call; the ImageStudio brand-palette block is likewise composed **frontend-side** into the existing `studio.generate_image` prompt.
- Supabase: project `weciwurjfwmqihcyexzj`; **all 6 migrations applied & matching, none pending** — `20260726120000_atomic_quote_persistence.sql` (P1) applied 2026-07-26, `public.save_quote_atomic` live and verified (SECURITY INVOKER, empty `search_path`; **`authenticated` is the only client-facing role with EXECUTE — `anon` and PUBLIC are denied/absent; `service_role` also holds EXECUTE via Supabase's project-level defaults and is server-side only**). **S0F.1 added NO migration** (no Product/Inventory/Campaign/Asset-Library schema). S0D migration `20260724120000_s0d_business_profile.sql` remains **APPLIED & verified** — `public.business_profile`: PK `user_id`, FK → `auth.users(id)` ON DELETE CASCADE, RLS ON + policy `business_profile_own` (USING+WITH CHECK `auth.uid()=user_id`), trigger `trg_business_profile_updated`→`set_updated_at()`, authenticated GRANTs present.
- **Test evidence for the CURRENT release (Studio containment, source `03c23c2`) — read the scope, the two figures are NOT one run:**
  - **Full suite — on the EARLIER implementation head, before the fail-closed capability correction:** 121 files / **3,098 passed / 1 pre-existing skip / 0 failed**. This figure does **not** describe the final corrected code.
  - **Focused affected suite — on the FINAL corrected code that was built and deployed:** every test file importing the changed exports or the changed Studio pages — **27 files / 1,608 passed / 0 failed**. **The full suite was deliberately NOT rerun on the final head.** Justification (recorded in the Studio section): the changed exports have exactly two production consumers (`geminiImage.js`, `ImageStudio.jsx`) and every test file importing either was inside the focused set.
  - **Production build at the released commit `03c23c2`: GREEN** — the single build that produced the deployed artifact.
  - **Real-runtime evidence beyond tests (this is what covers the final head end-to-end):** Preview `ec239e3b` authenticated QA acceptance **PASS** and Production `247ef9ec` authenticated non-mutating Account A smoke **PASS**, both against the byte-identical released artifact.
- **Historical test figures (P1 release, commit `7e30199`):** 120 files / 3,065 passed / 1 skip / 0 failed; build green. Retained as history — **not** evidence for the currently deployed Studio code.
- **Branch / HEAD / working tree are session-specific, not canonical state:** every task must verify its own branch, HEAD and working tree at preflight before acting (the pre-existing untracked `dist-profile/` is expected). Do not store a particular clean-tree snapshot as durable canonical truth. (There is no memory mirror of this tracker — Claude's memory holds only a short pointer to this file. This repository copy under `docs/` is the sole canonical tracker.)

---

## Status ledger
- **S0A False-Success Containment** — CLOSED / LIVE VERIFIED (Production `4cb17aee`, superseded by S0B then S0C; retained historically).
- **S0B Cloud Persistence (durable Tasks + client Follow-ups)** — **CLOSED / LIVE VERIFIED** (Production `31cb521d`, now superseded by S0C `cec116b9`; `31cb521d` retained as the S0C rollback target). Delivered durable+truthful Tasks + `clients.next_action/next_action_date`; migration `20260722120000_s0b_tasks_followups` applied.
- **S0C Identity & User-Isolation Trust Hardening** — **CLOSED / LIVE VERIFIED in Production (2026-07-24).**
  - **Release chain:** PR [#100](https://github.com/natanMeT/ArtValue20/pull/100) merged → main `3ee62aee` → Edge `ai-gateway` **v33→v34** (2 text-only Jake constants) → Cloudflare **Preview `b69fe8a1`** (branch `s0c-preview-3ee62a`) + **two-account same-browser acceptance PASS** → **Production `cec116b9`** (reused the exact Preview-tested `dist/`, NOT rebuilt — proven by "Uploaded 0 files (12 already uploaded)" + content-hashed `index-CE6IJ-rJ.js`) + non-mutating Account A prod smoke PASS. No rollback taken.
  - **Delivered (identity + isolation, additive over S0B):**
    - Session-derived identity (`userIdentity.js`: full_name → name → email-prefix → neutral `'משתמש'`), replacing hardcoded Nathan/ArtValue identity.
    - Neutral role/email presentation in the Topbar (session name + email + avatar initial; no fabricated `'מנהל מערכת'`).
    - Per-user Jake **chat + brief** localStorage keys, scoped by stable Supabase `user.id` (`artvalue_jake_chat_<uid>` / `artvalue_jake_brief_date_<uid>`), with save-before-loader guard on account switch.
    - Legacy device-global keys (`artvalue_jake_chat` / `artvalue_jake_brief_date`) **never read, migrated, copied or deleted** (verified with live sentinels across A→B→A).
    - Active-account task assignee (TaskModal `defaultAssignee` + Assistant enriches un-assigned Jake `add_task` once → same enriched object feeds proposal AND execute, so approved==persisted; explicit assignee never overridden) with locked **neutral fallback `'משתמש'`**.
    - Generic Jake **business-assistant** persona ("אתה ג׳יק — העוזר העסקי של סטודיו Art Value"), no longer "העוזר האישי של נתן".
    - **No forced Nathan signature** in drafted messages (neutral sign-off unless the user explicitly asks for a specific signature).
    - **Two-account same-browser isolation VERIFIED** live: Account A (owner account) / Account B (isolated QA account) resolved distinctly; B never saw A's chat/brief; per-user task ownership (RLS `tasks_own`) + assignee-follows-account; proposal assignee == persisted assignee, DB row absent pre-confirm; explicit `דנה לוי` preserved.
    - **S0A/S0B behavior + frozen LIVE lanes preserved:** Jake propose→confirm→execute + durable Tasks/Follow-ups intact; Outreach/Diagnose/ImageStudio render; Projects/Inventory/Templates/Activity remain BetaUnavailable; 0 console errors; DB baseline exact; Edge v34/JWT healthy.
  - **Historical correction:** Production Local-engine containment is **NOT** an S0C outcome. Local paths were already gated off by default through `src/lib/localEngines.js` / PR #75, which predate S0C. S0C resolved session-derived identity and per-user Jake chat/brief isolation.
  - **Scope discipline:** Edge diff = ONLY 2 `actionProfiles.ts` text constants (persona + draft signature); router / actionTypes / contracts / request-response payloads / provider routing / validation / budget / confirmation flow / all non-Jake profiles / JWT — **UNCHANGED**. No SQL/schema/migration. Server persona is a drift-guarded verbatim copy of the frontend pack (both edited identically).
- **S0D Business Context (durable per-account Business Profile)** — **CLOSED / LIVE VERIFIED in Production (2026-07-24).**
  - **Release chain:** PR [#101](https://github.com/natanMeT/ArtValue20/pull/101) → merge `22ee2f3` (head-gated to `7750bd3f`; parents `3ee62aee` S0C + `7750bd3f`) → migration `20260724120000_s0d_business_profile.sql` **APPLIED** on `weciwurjfwmqihcyexzj` → **Preview `f4da6153`** (branch `s0d-preview-22ee2f3`) + **two-account authenticated acceptance PASS** → **Production `69f8a175`** (`index-DnfLj9lz.js`, byte-identical to Preview — "Uploaded 0 files (12 already uploaded)") + **non-mutating Account A prod smoke PASS**. No rollback taken (`cec116b9` retained).
  - **Delivered (additive over S0C):** durable per-account Business Context in `public.business_profile` (one row per user, `user_id` PK); **RLS owner isolation** (`business_profile_own`); fields = business name, positioning, audiences, tone, differentiators, services; **optional brand palette with primary REQUIRED when a palette is defined**, stored canonical **UPPERCASE `#RRGGBB`**; **shared validation across save/import/hydration**; **persist-first truthful saves** (success only after Supabase confirms; failure → visible error toast, no false success, no DB row); **authoritative editor resync while preserving dirty input**; **neutral behavior for unconfigured/malformed profiles** (never ArtValue fallback); the configured profile is available to **all free-form Jake chat/draft turns** and **direct Business Context questions** (name/services/palette) answered from the durable profile.
  - **Acceptance evidence:** two-account isolation VERIFIED — Account A (owner account) = real **ArtValue** profile; Account B (isolated QA account) = QA **"מאפיית בדיקה S0D"** profile (intentionally retained); each row owned by the correct account; validation (empty-name / invalid-HEX / secondary-without-primary / over-limit-not-truncated) all block with no DB row; failure-injection surfaced an error toast with no false success and no row; refresh rehydrates every field; a generic marketing draft used A's positioning/tone/services; Growth contained + LIVE lanes (Outreach/Diagnose/ImageStudio/Tasks) healthy; all REST hydration 200; **zero console errors**; Jake propose→confirm→execute intact.
  - **Scope discipline:** **NO Gateway/Edge change** (ai-gateway v34/JWT-on unchanged; router / actionTypes / contracts / request-response payloads / provider routing / validation / usage controls / profiles all UNCHANGED). Frontend + one additive migration only; account Business Context assembled + injected by the frontend chat/draft seam before the existing Gateway call. Non-mutating smoke left final DB counts unchanged.
- **S0E Guided Business Onboarding MVP (incl. dual-tour cloud correction)** — **CLOSED / LIVE VERIFIED in Production (2026-07-26).**
  - **Release chain:** PR [#103](https://github.com/natanMeT/ArtValue20/pull/103) → main `c10ac5590967410d0931a89b08a7bdab12030b25` → corrective PR [#104](https://github.com/natanMeT/ArtValue20/pull/104) → **active release source `272fc148984b68c26aa46d24e1cdefc2878cddb9`** → corrected **Preview `ea0dcc02`** (branch `s0e-preview-272fc14`) + acceptance PASS on an unconfigured account → **Production `4b86993d`** (`index-DRaTE7f5.js`, byte-identical to Preview — "Uploaded 0 files (12 already uploaded)") + **non-mutating Account A prod smoke PASS**. No rollback taken (`69f8a175` retained, HTTP 200).
  - **Delivered — five-step guided Hebrew RTL setup:** (1) business identity, (2) offer/services, (3) audiences, tone and differentiators, (4) optional brand palette, (5) review, confirmation and durable save.
  - **Completion + entry rules:** completion derives **only** from the durable account-owned Business Context; completion floor = valid business name + positioning + at least one named service; auto-open occurs **only after successful authenticated cloud hydration**; configured accounts bypass automatic onboarding; a **failed hydration can neither expose nor auto-open** any onboarding entry point (wizard, banner or Settings launcher).
  - **Dismissal + re-entry:** "Later" dismisses automatic opening while the setup banner remains available; Settings retains **both** the onboarding launcher and the granular Business Context editor; draft and dismissal state are scoped by stable user ID; a **versioned draft baseline** prevents a stale local draft from overriding newer cloud data.
  - **Validation + persistence:** the shared S0D validation remains authoritative (no competing rules); validation errors route to the relevant wizard step carrying the exact field message; save is **persist-first and truthful** — no completion or success before Supabase confirms; a failed save preserves dirty input and creates no false completion.
  - **First value:** successful completion offers an **editable Jake composer prefill** that never auto-sends, never executes an action, never alters chat history and never crosses accounts.
  - **DemoMode dual-tour correction (PR #104):** in authenticated cloud mode the legacy walkthrough is **manual-only** (Dashboard "מצב הדגמה" → the existing `artvalue:demo:open` event); local/demo keeps its existing auto-open-once behavior unchanged; **S0E and DemoMode no longer auto-open together.** One production file changed (`src/components/ai/DemoMode.jsx`, +23/−5) plus one new focused test file.
  - **Acceptance evidence:** on a clean origin an unconfigured account (Account D) saw the S0E wizard auto-open and **exactly one** first-run overlay, with DemoMode absent and its seen key never written; "Later" closed the wizard while the banner remained; the Dashboard control opened DemoMode manually with no wizard reopening; **0 Gateway calls, 0 console messages, 0 rows created**. Production smoke on the configured owner account (Account A): hydration clean, Business Context loads, **no wizard and no banner**, Settings launcher present, Jake opens without sending, Tasks/Outreach/Diagnose/ImageStudio render, Growth/Projects/Inventory/Templates/Activity remain BetaUnavailable, reads only.
  - **Scope discipline:** **NO migration and NO Gateway/Edge change** (ai-gateway v34/JWT-on unchanged; router / actionTypes / contracts / payloads / provider routing / validation / usage controls / profiles all UNCHANGED). Frontend-only, additive over S0D; the frozen LIVE lanes were unchanged. Tests 111 files / 2885 passed / 1 pre-existing skip / 0 failures; build green.
- **S0F.1 Creative Trust, Account Isolation & Brand-Palette Consumption** — **CLOSED / LIVE VERIFIED in Production (2026-07-26).**
  - **Release chain:** PR [#106](https://github.com/natanMeT/ArtValue20/pull/106) → main **`983f4899a7c9736669d97b49ed1575129f820653`** → Edge `ai-gateway` **v34→v35** (persona text only; ACTIVE, `verify_jwt=true`; authenticated persona smoke PASS) → **Preview `0760f00e-d54d-4285-b5dd-93919e2842f5`** (branch `s0f1-preview-983f489`) + **three-account (A/B/D) acceptance PASS** → **Production `e63198b7-ebd6-4b7d-9872-c9bcd1a5ab0a`** (`index-lvfFFwEn.js`, byte-identical to Preview — "Uploaded 0 files (12 already uploaded)") + **authenticated non-mutating Account A smoke PASS**. No rollback taken (`4b86993d` retained, HTTP 200).
  - **Delivered — truthful cloud containment of the creative lanes:**
    - The authenticated-cloud Jake **campaign lane is truthfully contained**: no demo concepts are presented as real output, **no campaign-generation Gateway call is made**, and **no campaign/package record is written**. The message states plainly that nothing was run and nothing was saved.
    - **AdStudio** is hidden from authenticated-cloud navigation and its direct route renders BetaUnavailable **before** any scan, analyzer or image generation can run. Local/demo behaviour is retained unchanged; the frozen engine entry points were not edited to achieve containment.
    - The **ArtValue-specific offer-brief chip** is hidden in authenticated cloud (still present in local/demo).
  - **Delivered — identity and account-awareness:**
    - **Jake persona:** ArtValue is the **product/system brand**, never the signed-in account's own business. Jake works only from the active account's approved Business Context, states honestly when that context is missing, makes no Nathan-personal-assistant claim, and assigns no fixed Studio-ArtValue service list to another account. Server and frontend persona remain a byte-identical drift-guarded pair.
    - **Outreach:** configured accounts compose outreach copy from their own session identity and approved business profile (name, positioning, services) plus the selected lead's own need; unconfigured accounts receive a **truthful setup-required state** with a working link to Business Context — no message body and **no fabricated sender or business facts**.
    - **Quote issuer:** a configured account issues under its own approved business name (print preview header/footer and the share text); an unconfigured account gets neutral quote presentation. **No fixed ArtValue logo, tagline or personal contact.**
  - **Delivered — brand-palette consumption (ImageStudio):**
    - Displays the active account's saved palette only; palette guidance is **ON by default** with a **per-generation OFF control** that changes local UI state alone (**no `business_profile` write**).
    - The exact approved **uppercase `#RRGGBB`** values are passed unchanged inside a delimited brand-palette block appended to the existing `studio.generate_image` prompt — **no HEX invented, altered or added**, and **no palette block at all** when the account has none.
    - **The application theme is never recoloured** by the account palette.
    - The **final** prompt (user text **plus** the palette block) is validated against the canonical **2,000-character** Gateway input limit; an over-limit request is **blocked before the Gateway** with a truthful Hebrew message naming both the length and the palette contribution, preserving the user's input and creating no loading, success, image or gallery record.
  - **Delivered — per-account device-local isolation:**
    - Creative-campaign, production-package and gallery device storage are **scoped by the stable account user ID**, with **no cross-account fallback**; when no account id can be resolved in authenticated cloud there is no persistent write at all.
    - The pre-S0F.1 device-global stores are **LEGACY and are never read, migrated, copied or deleted**.
    - **Classification (important):** these are **per-account isolated device-local storage**, **NOT** a durable cloud Asset Library. A durable Asset Library remains an open product item.
    - **Gallery account-switch race closed:** a stale asynchronous result can no longer commit after the namespace changes, and stale object URLs are disposed.
  - **Explicitly NOT delivered (no false capability claims):** Growth remains fully BetaUnavailable; **no** Product / Inventory / Campaign / Asset-Library schema was added; **no** public or guest Growth Console was added; **no** Website Scanner was added.
  - **Acceptance evidence (Preview `0760f00e`, Accounts A/B/D):** AdStudio absent from nav and BetaUnavailable by direct route for A and B; all five Growth routes plus Projects/Inventory/Templates/Activity BetaUnavailable; offer chip absent; the campaign request contained for both configured accounts with **0 Gateway calls** and no confirmation card. Account B's Jake identified only B's business with zero Account A facts; **Account D received the truthful "Business Context not configured" answer with zero invented facts**. Outreach copy for B used only B's identity/business/services and the lead's own need; D showed the setup-required state. Palette isolation verified: A saw only A's five HEX values, B only B's two, D none; the intercepted outbound prompt carried A's exact palette roles/HEX unchanged, and with the palette OFF carried no palette block at all; the over-limit prompt was rejected before any Gateway request. Storage isolation verified across A→B→A with three distinct uid-scoped buckets and three distinct gallery namespaces, no bare legacy key ever read or created, and B never rendering A's gallery item or object URLs. Quote issuer verified on B via a temporary `S0F1_SMOKE_` client + quote. **All temporary QA records were deleted and the database baseline restored**; the Production smoke was fully non-mutating (**0 mutating requests, 0 console errors**, hydration REST all 200).
  - **Scope discipline:** **NO migration.** The Edge diff was limited to the Jake persona text constant and its directly related comment; router / actionTypes / contracts / payloads / provider routing / validation / budget + usage controls / confirmation flow / all non-persona profiles are UNCHANGED, and the ImageStudio palette composition stays frontend-side. Tests 118 files / 2978 passed / 1 pre-existing skip / 0 failures; build green.

---

## S0B approved product decisions (historical — still in force)
1. Follow-up = persist existing client fields `next_action` + `next_action_date` (NO separate follow_ups table).
2. `tasks.project_id` nullable, no FK; a task may link to a client or be standalone. Projects stay out of scope / unavailable.
3. Truthful success: Task + client Follow-up writes show success only AFTER Supabase confirms; failure leaves no false local state.
4. `tasks.id` = TEXT (accepts legacy prefixed ids + uuid).
5. `tasks.client_id` → `clients.id` ON DELETE SET NULL.
6. One PR for Tasks + both Follow-up fields (do not split into separate releases).

---

## Frozen (do not touch)
`supabase/functions/**`, Gateway/Edge/adapters/profiles/prompts/contracts, `aiGateway*.js`, `gemini.js`, Jake prompt/decision/planning/handoff contracts, Outreach, Diagnose, ImageStudio, Creative V1/V2, Projects/Inventory/Templates/Activity pages, `BetaUnavailable.jsx`, `BETA_HIDDEN_MODULES`, `sidebarNav` hidden-module behavior, quote/tx/lead/AI-usage schemas, packages/deps, env/secrets/settings, deploy config, Release & Hosting Runbook, `dist-profile/`. (S0C touched only the identity/isolation surfaces named in its ledger entry; the server-persona text edit was the sole, approved exception inside `supabase/functions/**`. S0D touched only the Business Context frontend surfaces + one additive migration; no Gateway/Edge change. S0E touched only the onboarding frontend surfaces plus, in its correction, the single legacy-tour file `src/components/ai/DemoMode.jsx`; no migration and no Gateway/Edge change. **S0F.1 touched only the containment / account-awareness / palette / storage-scoping frontend surfaces named in its ledger entry; its sole exception inside `supabase/functions/**` was the approved Jake persona text constant and its directly related comment in `actionProfiles.ts`. The frozen Creative V1 engine entry points and prompts were NOT edited — containment is enforced at the product seam above them. No migration.**)

**Freeze scope clarification:** application/runtime frozen areas above remain unchanged unless separately authorized, and the **Release & Hosting Runbook remains frozen** unless separately authorized. **The canonical roadmaps are NOT runtime-frozen:** they may be updated only through the documentation policy in [`docs/README.md`](README.md) — after Nathan's approval and ChatGPT diff review. This carve-out is documentation-only and changes no product/runtime freeze.

---

## Open root problems
Durability:
- ✅ **Tasks** — durable in cloud (S0B). Closed.
- ✅ **Client Follow-ups** (`next_action`/`next_action_date`) — durable in cloud (S0B). Closed.
- ✅ **Business Context** (per-account) — durable in cloud (S0D). **Closed / LIVE.**
- ⬜ **Projects** — still non-durable / BETA-unavailable (no durable table).
- ⬜ **Inventory** — still non-durable / BETA-unavailable.
- ⬜ **Products** — no durable table.
- ⬜ **Templates / Activity** — still non-durable / BETA-unavailable.
- ⬜ **Campaigns** — no durable table. Creative-campaign and production-package records are **per-account isolated device-local storage** (S0F.1), **not** durable cloud records.
- ⬜ **Asset Library** — does not exist. The ImageStudio gallery is **per-account isolated device-local storage** (S0F.1), not a durable cloud Asset Library.

Beta-trust blockers — RESOLVED:
- ✅ **Hardcoded Nathan/ArtValue identity** — RESOLVED (S0C: session-derived identity, neutral fallback).
- ✅ **Per-user Jake chat/brief history** — RESOLVED (S0C: user-id-scoped keys; legacy globals never read/migrated).
- ✅ **Exposed Local paths** — CORRECTED / RESOLVED (gated off by `src/lib/localEngines.js`, PR #75 — predates S0C).
- ✅ **Hardcoded cross-account business facts in Jake marketing chat/draft** — RESOLVED (S0D: Jake consumes the active account's durable Business Context; neutral when unconfigured).
- ✅ **Absence of durable account-owned Business Context** — RESOLVED (S0D: `public.business_profile`).
- ✅ **Absence of durable brand palette** — RESOLVED (S0D: optional palette, primary required when used, canonical uppercase `#RRGGBB`).
- ✅ **False success on Business Context save** — RESOLVED (S0D: persist-first truthful saves; failure → error toast, no false success, no row).
- ✅ **Cross-account Business Context exposure** — RESOLVED (S0D: RLS owner isolation; two-account isolation verified live).
- ✅ **Onboarding / business-setup wizard** — **RESOLVED (S0E: five-step guided setup over the durable Business Context; CLOSED / LIVE VERIFIED).**
- ✅ **Overlapping first-run tours** — RESOLVED (S0E correction PR #104: DemoMode is manual-only in authenticated cloud mode; S0E onboarding is the single automatic first-run flow).
- ✅ **Demo creative output presented as real work in authenticated cloud** — RESOLVED (S0F.1: the Jake campaign lane and AdStudio are truthfully contained; nothing is run, claimed or saved).
- ✅ **ArtValue business identity leaking into other accounts' Outreach and quotes** — RESOLVED (S0F.1: account-aware Outreach copy and quote issuer; truthful setup-required / neutral presentation when unconfigured).
- ✅ **Device-global creative/gallery storage shared across accounts on one device** — RESOLVED (S0F.1: uid-scoped creative/package/gallery namespaces, no cross-account fallback, legacy globals never read or migrated, gallery account-switch race closed).
- ✅ **Account brand palette not reaching image generation** — RESOLVED (S0F.1: exact approved uppercase HEX passed unchanged, ON by default with a per-generation OFF control, over-limit blocked before the Gateway).

Still open:
- ⬜ **Durable Asset Library** — does not exist; the gallery is device-local per account.
- ⬜ **Durable Campaigns** — no durable table; campaign/package records are device-local per account.
- ⬜ **Products durability** — no durable table.
- ⬜ **Projects / Inventory / Templates / Activity durability** — still open (BETA-unavailable).
- ⬜ **Organization boundaries** — no organizations/memberships layer exists.
- ⬜ **Credits / cost controls** — no customer-facing usage credits or cost controls exist.
- ⬜ **Jake conversation-refresh UX** — future improvement (nuance below; NOT a release blocker).
- ✅ **Quote cloud-save source-label correction** — RESOLVED and LIVE (PR #108, Production `476830a2`).
- ✅ **Non-atomic quote persistence** — RESOLVED and LIVE: migration `20260726120000` applied, `public.save_quote_atomic` live, failure-injection acceptance 13/13, Production `476830a2`.

## Open follow-ups (non-blocking)
- ✅ **Jake advertises creative capabilities that the cloud path cannot run — RESOLVED and LIVE.** Fixed in the Studio Hosted Mode Containment Correction and the complete local-engine retirement (PR #118 → PR #119), **deployed to Production 2026-07-27 as `b3708cc2`**. Verified live in the authenticated Preview acceptance: Jake lists only `תמונה מהירה` / `Image Studio` / `Growth OS` / `גלריה` — **0 retired capabilities**. It turned out to be more than a wording issue: it was the **entry point** into the hidden-mode hand-off defect. Original entry retained below for history.
- ⚠️ **(historical) Jake advertises creative capabilities that the cloud path cannot run — truthfulness follow-up, NOT a regression.** Observed during both the Preview and Production authenticated smokes: asked what he can do, Jake lists `סדרת דמות`, `אלבום דוגמנית` and `פרזנטור מוצר`, which are **hidden in the cloud UI** because they require a local engine. Cause: `systemCapabilities()` in `businessBrain.js` enumerates every *live* workflow from the catalog regardless of engine availability. **This predates the Studio containment slice** — that slice only removed the engine NAMES from the same text — so it is not a regression and did not block release. Worth a future slice that filters the advertised capability list by what the current runtime can actually execute. **Not selected; do not begin without Nathan's approval.**
- ✅ **Quote cloud-save source label truthfulness — RESOLVED / LIVE.** `src/pages/Quotes.jsx` previously toasted "נשמר מקומית" in authenticated cloud mode even though the quote was durably persisted (wording/source-label only — never data loss). PR #108 routes both quote toasts through the source-aware `saveLabel(mode)` helper (`'נשמר במערכת'` in `supabase` mode); confirmed on Preview with the byte-identical artifact ("הצעת מחיר נוצרה · נשמר במערכת" / "ההצעה עודכנה · נשמר במערכת") and **shipped to Production in deployment `476830a2`**.

## Growth OS status (authenticated cloud beta)
- Growth OS remains **fully BetaUnavailable** in the authenticated cloud beta, **unchanged by S0F.1**. All **five** Growth routes (`/growth`, `/growth/leads`, `/growth/calendar`, `/growth/content`, `/calls`) **and their navigation entries are contained** (nav entries absent; direct routes → BetaUnavailable). **Outreach remains LIVE** and is now account-aware (S0F.1). Local/demo Growth is **unchanged**. **AdStudio joined the contained set in S0F.1.**
- **Reason:** Growth's current datasets and content library are **ArtValue-specific** and cannot be exposed to other accounts.
- **Reopening is blocked on** durable **Campaigns**, a durable **Asset Library**, and an **account-aware Growth data model**. S0F.1 delivered the account-aware Business Context and palette consumption for Jake, Outreach, quotes and ImageStudio, **but it did not add any of those three durability prerequisites and does not reopen Growth.**
- **No public or guest Growth Console exists**, and none was added.

## Accepted operational nuance (NOT a release blocker)
- After saving or materially changing Business Context, a **fresh Jake conversation is currently required** for the cleanest immediate grounding (Jake business-context is captured per-conversation). Track a **future UX improvement** to communicate or automate that refresh. **Explicitly NOT classified as an S0D release blocker.**

## Website Scanner — planned separate future candidate (NOT implemented)
Recorded here only as a **planned future product slice / candidate**, not as an existing capability and **not** as the selected next slice:
- An **optional Business Context import tool**: server-side URL extraction that **previews and proposes** findings for the owner to approve **before** anything is saved.
- The **shared Business Context validator remains authoritative** — an importer may not introduce competing validation rules.
- Would require explicit security controls: **SSRF / private-IP blocking, redirect limits, response-size limits, time limits and rate limiting.**
- **Not implemented. Not required for S0F.1. Not automatically selected as the next slice.**

## Open decisions awaiting Nathan
- [x] **Next product slice — Studio / local-engine UI containment: DONE, CLOSED / LIVE** *(shipped as deployment `247ef9ec`, now the rollback target; superseded in Production by the complete local-engine retirement, `b3708cc2`)* — see its section below. The candidate list below is preserved for the slice AFTER this one.
- [ ] **Slice after this one — PENDING NATHAN DECISION.** Do NOT begin/design/invent the next slice until Nathan selects one and approves a spec. Candidate open items: durable **Asset Library**; durable **Campaigns** + account-aware Growth data model (the Growth reopening prerequisites); **Products / Projects / Inventory / Templates / Activity durability**; **organization boundaries**; **credits / cost controls**; **Website Scanner** (per the section above); Jake conversation-refresh UX. **NOT a candidate: the Quote cloud-save source-label correction — it is already RESOLVED and LIVE in Production (implemented in merged PR #108, shipped in deployment `476830a2`), so it must never be selected or re-implemented as a new slice.**

## Studio Hosted Mode Containment Correction — **CLOSED / LIVE IN PRODUCTION** (opened 2026-07-26; merged 2026-07-27 as PR #118; deployed as `b3708cc2`)

> **This corrective work is now LIVE in Production** (deployment `b3708cc2` / `index-C4frcMDi.js`, source `2c8b1df`). The released behaviour is
> real and unchanged; the absolute closure wording below was **too strong** and is corrected here. **No rollback is
> indicated** — this is a truthfulness/containment defect in an error string and a mode-selection guard, **not data
> loss, not a security or Auth exposure, no schema/Gateway involvement.**

**What was found (during the SAFE STOP on PR #117, raised by Codex):** the capability filter guarded only the **visible
mode tiles**. A **Jake→Studio hand-off** set `mode` directly, and the Studio panels render from `mode`, not from the
tile list. So in a **hosted** build the hidden `presenter` mode could be selected, its two-image panel rendered, and the
resulting failure printed the raw engine string `Qwen-Image-Edit אינו מותקן במנוע` to the user.

**PROVEN IN THE DOM before any edit** (hosted-configuration build, local-engine gate closed, deterministic hand-off
injected through the real router-state seam — no LLM involved): the presenter **tile stayed hidden** while the panel
`תמונת פרזנטור + תמונת מוצר` **rendered**, with the presenter CTA `צור ויזואל מוצר` active. The reachability chain
(`jakeDecisionEngine` → `workflowIdToMode` → `readStudioHandoff` → `setMode`) carries **no capability gate at any step**.

**Correction of a previously recorded FALSE claim:** this tracker and PR #117 stated that all residual `Qwen` artifact
hits were **"non-rendered internals"**. **That classification was wrong** — at least one was user-reachable. String
absence/presence in the bundle was treated as reachability evidence when it is not; the technical strings legitimately
remain inside diagnostic `Error` objects.

**Fixed in three defensive layers** (branch `fix/studio-hosted-mode-containment`; *written while the PR was open — it was **merged** on 2026-07-27 as PR #118 and **deployed to Production the same day** as `b3708cc2`*):
1. **Jake truthfulness** — `systemCapabilities()` now takes the authoritative available-mode set and advertises only
   workflows this configuration can actually open. **Fail closed** if a caller omits it. Availability is *injected*, not
   imported, so `businessBrain.js` keeps its no-engine-imports boundary (its own guard test caught my first attempt).
2. **Authoritative mode validation** — `src/lib/studioModes.js` owns the requirements and is authoritative for **every**
   entry path. Hand-offs resolve through it; an unavailable request falls back to a valid business state with a truthful
   notice. A `useLayoutEffect` net (pre-paint, so no flash) catches any other indirect input.
3. **User-facing error boundary** — `src/lib/userFacingError.js` renders only text explicitly declared safe
   (`userSafe` / `userMessage`); everything else falls back. Classification is by **identity, not substring matching**.
   The technical message stays on the Error for diagnostics and is never rendered.

**Verification:** 26 new regression tests through the real seams + **three real negative controls** (reverting each layer
fails 1, 4 and 8 tests respectively); focused affected suite **30 files / 697 passed / 0 failed**; production build green.
**Post-fix DOM proof:** hosted hand-off no longer renders the panel (truthful containment notice, CTA back to
`צור תמונה עם AI`, **0 engine terms, 0 requests, 0 local-address requests**), valid hand-offs still work, and a
local/demo build with the capability **positively declared but genuinely unavailable** still offers the mode, fails
**closed**, and renders `יצירת ויזואל מוצר אינה זמינה כרגע` with **0 engine terms**.

### Round 2 — the first PR #118 implementation was INCOMPLETE (2 further Codex P2s, both confirmed)

**Both findings were real and both were mine.** Recorded rather than quietly folded in:

1. **A regression I introduced.** The new fail-closed render boundary **flattened actionable hosted Gateway guidance**
   (`'צריך להתחבר כדי ליצור תמונה'`, `'שירות התמונות עמוס כרגע — נסה שוב עוד רגע'`) into the generic fallback, because
   those Errors carried neither marker. **Corrected** with a controlled reason→message table keyed by the Gateway
   **reason code**: a known code renders its existing guidance, an unknown/technical one renders the safe generic, and
   **provider-supplied text is never rendered and can never self-declare as safe** (proven with a hostile payload
   carrying both a technical message and a forged `userSafe` flag). Diagnostics live in structured fields
   (`gatewayReason` / `gatewayMapped`), **not** in `.message` — which preserves a stronger pre-existing invariant, pinned
   by the Gateway suite, that a Gateway image Error never carries the raw code or server detail in its message.
2. **An incomplete fix.** Layer 1 filtered the *workflow* list but not `STATIC_CAPABILITIES`, so Jake still advertised
   `product-lock-blend` (gated by `hasLocalComfy`) and a `creative-modes` description naming editing, video and
   presenter. **Corrected** by giving each Studio-related static entry an **explicit** availability relationship
   (`requires: { capability }` / `requires: { anyStudioMode }`) — never array position or wording — and by deriving the
   `creative-modes` description from the injected available-mode labels so it can only state what is actually open.
   Filtering happens **before** any `maxCapabilities` slicing, so truncation cannot promote a hidden entry.

**Round-2 verification:** 42 regression tests (16 added) including assertions against the **real final consumer** — the
built Jake prompt text — plus **two more negative controls** (reverting the Gateway mapping fails 5 tests; reverting the
static filter fails 4). Focused affected suite **30 files / 712 passed / 0 failed**; production build green.
`ImageStudio.jsx` is **byte-identical** to the DOM-proven head, so the round-1 browser evidence still applies to the
hand-off and render seams.

### Round 3 — authorised DEFECT-CLASS SWEEP (rounds 1–2 fixed instances; this closes the classes)

**Why a third round was needed — the method, not the luck.** Rounds 1 and 2 each fixed the reported instances while a
sibling path in the *same class* survived, because I inventoried the paths I had reasoned about rather than enumerating
the class. Round 3 was scoped as an exhaustive inventory across four axes before any edit: (1) every error producer →
catch → rendered consumer; (2) every workflow / static capability / preset / badge / CTA / description that promises or
routes to a capability; (3) every mode-or-tab write from indirect input; (4) every **gated subfeature inside an
otherwise-available mode**.

**Seven reachable instances found and corrected** (the three Codex reported, plus four the sweep surfaced):

| # | Instance | Class |
|---|---|---|
| 1 | `AdStudio` **initial** generation loop rendered `e.message` (only the retry path had been fixed) | A · error render |
| 2 | `AdStudio` scan + campaign paths rendered `e.message` | A |
| 3 | **`gemini.js` pulled raw PROVIDER text into the thrown message** (`e?.error?.message`) — reached every consumer | A |
| 4 | `MockupStudio` export `alert('יצוא נכשל: ' + e.message)` | A |
| 5 | `Diagnose` + `Outreach` — rendered consumers of that same shared helper | A |
| 6 | `product-lock` **description asserted the gated B2 AI seam/shadow enhancement** although it needs the local engine | D · gated subfeature |
| 7 | Presets `photo_restoration` (→`img2img`) and `product_motion_video` (→`video`) rendered as `זמין` hosted **and printed "↳ run it in tab X"** for tabs that do not exist | B · capability promise |

**How each class is now closed, structurally:** every creative render surface routes through `userFacingError`; the
shared helper captures provider text as **diagnostics only** (`providerDetail` / `httpStatus`) and can no longer throw it
as a message — **zero bare `throw new Error(` remain in `gemini.js`**; a gated subfeature is declared on its workflow
(`subfeatures: [{ requires: 'comfy', … }]`) and appended to the description **only when satisfied**; presets are filtered
by `isStudioModeAvailable(p.targetTab, …)` so an unavailable target mode means the preset is not offered at all, and a
selected preset cannot outlive its availability.

**Round-3 verification:** 53 regression tests (11 added, now asserting at **class level** — e.g. *no* creative surface
may render a caught error message — not per-instance); **four further negative controls**, each failing on revert;
focused affected suite **43 files / 931 passed / 1 pre-existing skip / 0 failed**; production build green.
**Browser smokes re-run because rendered behaviour changed:** hosted → the two hidden-tab presets are **gone**, no
"↳ הרץ בלשונית" guidance, hand-off still contained, **0 engine terms / 0 requests / 0 local-address requests**;
local/demo with capabilities genuinely declared → **both presets return**, all 8 mode tiles return, the Product Lock B2
button and its explainer return, and the declared-but-unavailable failure still renders
`יצירת ויזואל מוצר אינה זמינה כרגע` with **0 engine terms**, failing closed.

**PR [#117](https://github.com/natanMeT/ArtValue20/pull/117) remains OPEN and PAUSED** — its absolute closure wording and
release anchors cannot be finalised until this correction is **deployed**, since the roadmaps describe the *released*
artifact. **P1 Atomic Quote Persistence remains CLOSED / LIVE, unaffected.**

### Round 4 — MECHANICALLY DERIVED BOUNDARIES (three more siblings; the *method* was the defect)

Codex reviewed the round-3 head `563c6a9f` and found **three further instances inside the classes round 3 declared
closed**. All three were verified real:

| # | Instance | Class it should have been inside |
|---|---|---|
| 1 | `PosterEditor.jsx:141` — `alert('יצוא נכשל: ' + (e?.message || e))`; imported by `ImageStudio.jsx:24`, rendered at `:1539` | A · error render |
| 2 | `ImageStudio.jsx:1208` — an **ungated** paragraph telling hosted users to click «שפר חיבור וצללים», while the button itself was gated at `:1276` | D · gated subfeature |
| 3 | `hebrew_ui_mockup` — `targetTab: 'text'` (available) but `localReady: false`, `requiresApi: true`, `provider: 'gpt-image-2'`; it survived a tab-only filter | B · capability promise |

**Why round 3 missed them — the structural causes, not the individual oversights.**

1. **The verified surface set was hand-assembled.** `ImageStudio` imports three studio children (`PosterEditor`,
   `MockupStudio`, `ProductPlacer`); only `MockupStudio` was checked, because the round-2 brief had named it. Worse, the
   round-3 *class* test encoded that same literal `SURFACES` array, so the test inherited the blind spot and passed.
   **A test whose scope is a literal list cannot detect a missing member.** (A second, independent reason #1 escaped: the
   round-3 regex required `e.message` and the shipped code wrote `e?.message` — optional chaining slipped the pattern.)
2. **The gate was applied to the ACTION, not to every reference to the gated thing.** The B2 button was correctly behind
   `hasLocalComfy` and the Jake description was corrected, so the class looked closed — but the mode's own help text,
   which *instructs the user to use* the control, was never grepped for the subfeature's label.
3. **Availability was modelled on the axis that caused the original bug (modes) rather than on the requirement fields the
   data already declares.** The preset schema carries `localReady` / `requiresApi` / `provider`; the round-3 edit even
   rendered `!p.localReady && '· עתידי'` in the block being changed without connecting it to availability.

Common meta-cause: **the inventory was bounded by the shape of the reported defect, not by the structure of the system.**

**What round 4 changed — the boundaries are now derived mechanically, not by recall.**

- **Derived render-surface graph** (`src/pages/__tests__/support/moduleGraph.js`, no new dependency): the verified set is
  the transitive **project-local import closure** of the creative route roots. It resolves static / dynamic / side-effect
  imports, follows only relative specifiers (so third-party modules stay out), and is sorted + order-independent.
  `PosterEditor`, `MockupStudio`, `ProductPlacer`, `MaskCanvas` and `store.jsx` now enter verification automatically —
  **46 modules**, where the hand-written list had 5. The CLASS-A predicate uses **balanced argument-list extraction**, so
  "inside a sink call" is decided by the real extent of the expression rather than a character window.
- **The derived graph immediately found two violations nobody had reported:** `store.jsx:360`
  `setError(e.message || 'שגיאת טעינה')` (that `error` is exposed on the store context and rendered — Supabase/PostgREST
  text could reach the UI), and `geminiImage.js:1090` `throw new Error(\`היצירה נכשלה: ${e.message}…\`)` which
  interpolated the engine cause into the message. Both corrected; the technical detail is retained on the Error for
  diagnostics via `engineError()`.
- **One authority per gated subfeature** (`STUDIO_SUBFEATURES` in `lib/studioModes.js`): the requirement **and every
  user-visible string** (action label, busy label, help sentence, note, Jake title/description/capability text) live in a
  single record. `ImageStudio`, `creativeWorkflows.js` and `businessBrain.js` now reference it — the workflow card carries
  `subfeatures: ['product-lock-blend']` (ids only) and availability is injected via `studioAvailability()`. **A surface
  cannot render the label without asking for availability, because the surface no longer owns the text.**
- **Complete preset requirement evaluation** (`lib/presetAvailability.js`): destination mode, local readiness, API
  requirement and provider are all evaluated; unknown/undeclared values fail closed. `SUPPORTED_API_PROVIDERS` is
  deliberately **empty — no new provider is introduced**. A **schema-coverage invariant** fails when a preset gains a
  field that is in neither `PRESET_REQUIREMENT_FIELDS` nor `PRESET_DESCRIPTIVE_FIELDS`, so a requirement can never be
  added and silently ignored. `futureProvider` is classified **descriptive on purpose** (a recipe can declare a better
  future provider while being fully local-ready today) rather than given a rule that would never fire.

**Round-4 verification.** Full suite on the FINAL head — **123 files / 3,196 passed / 1 pre-existing skip / 0 failed**
(not a focused subset: this PR now spans shared creative helpers, the store, Business Brain and multiple rendered
surfaces) — plus **one production build, green**. Four negative controls, each proving the invariant discriminates:
the round-3 hand-written list is shown to be **provably incomplete** (it misses `PosterEditor`); dropping a transitive
child from the roots removes it from the graph; ungating the B2 help text puts it outside the balanced gate region;
a `targetTab`-only filter is shown to pass `hebrew_ui_mockup`; and an unhandled new requirement field is reported by the
coverage check. The three shipped defect shapes (including the `e?.message` optional-chaining form) are each detected by
the new predicate, while `console.*`, `userFacingError(...)` and data-contract `message:` fields correctly are not.

**Evidence classes — stated separately, not merged.**
- **Real DOM / runtime (browser, two builds served by `vite preview`):** *Hosted* (`index-CP1VZj91.js`) → exactly **2**
  mode tiles; exactly **4** presets with `hebrew_ui_mockup` **absent**; Product Lock panel open shows the base guidance
  but **no B2 label, no B2 help sentence, no B2 note**; a real generation attempt renders
  `יצירת התמונה אינה זמינה כרגע.`; **0 console messages, 0 requests to any local-engine address**, 0 engine terms in the
  DOM. *Configured local/demo* → **9** mode tiles, both engine-backed presets return, `hebrew_ui_mockup` **still absent**
  (API-only ⇒ unavailable even locally), and the B2 **action + help sentence + note return together**; a real failed
  generation renders `יצירת התמונה אינה זמינה כרגע. נסה/י שוב בעוד רגע.` with **0 engine terms**, failing closed.
  ⚠️ Both smoke builds were served with Supabase intentionally unconfigured so the Studio DOM could be reached **without
  entering any credentials**; that affects the auth gate only, not the local-engine axis under test.
- **Executed code (not a source proxy):** the shipped `posterExportErrorText` mapping is exported and called directly
  with a real canvas-taint `Error`, an `engineError`, junk values and a `userError` — technical text never survives.
- **Source/test proxies (labelled as such):** the ImageStudio wiring pins (`studioSubfeature(...)`, `availablePresets(...)`,
  the balanced-region gate containment) are assertions over source text, not runtime observations.

**Status AT THAT ROUND: merged, not yet deployed** *(historical)*. PR #118 was merged 2026-07-27 (merge `9ecb8eb`); the slice is now **LIVE in Production** as deployment `b3708cc2` — see the closure box in the Baseline. **P1 Atomic Quote Persistence remains
CLOSED / LIVE.** **PR #117 remains paused and untouched.**

### Round 5 — ARCHITECTURE REPAIR after an independent review (the enforcement layer was the defect)

Codex reviewed the round-4 head `cdd94308` and returned **three more P2 findings, all inside the classes the round-4
"mechanical invariants" claimed to cover**. All three were verified by EXECUTING the real artifacts, not by inspection.
An independent read-only architecture review was then run against the actual diff; its verdict was **repair in place
(A), not rebuild or replace** — the runtime authorities from rounds 1–4 are sound and behaviour-verified; what failed
four times is the **enforcement layer**, which tried to prove safety by scanning source text for known shapes.

**The pattern behind all four escapes.** Each invariant mechanised ONE dimension and left the adjacent one hand-written:
files derived but identifier names listed; text ownership enforced but the consumer set listed; schema fields enumerated
but their semantics assumed. Enumerating unsafe *shapes* is open-ended; the fix is to make unsafe consumption return
nothing at runtime, and to verify the narrow remainder from the parse tree.

| Codex finding | Verified how | Root cause |
|---|---|---|
| A recognised local provider was accepted without checking its own capability | Executed: `photo_restoration` (`local-qwen-edit`) offered under `{comfy:true, qwen:false}`; `product_motion_video` (`local-ltx-video`) offered under `{video:true, ltx:false}` | The evaluator checked provider MEMBERSHIP, never CAPABILITY, on a false premise ("the mode already encodes the engine requirement") |
| Raw-error detection depended on hand-written catch-variable names | Executed the shipped predicate: `catch(failure){setError(failure.message)}` → **0** violations | The file set was derived; the identifier set was not |
| Gated-subfeature enforcement scanned only known consumers | `studioSubfeature()` returned the FULL text record plus `available:false` | An API hole, not a test gap: every consumer's gating discipline was load-bearing |

**Stage 1 — capability-closed data access (the decisive change).** `studioSubfeature()` now returns **empty text fields**
when the subfeature is unavailable, not the real text plus a flag. A consumer cannot render what it cannot obtain, so a
new or careless child has nothing to leak — gated or not. `runLockBlend` also refuses at its own seam. The round-4
balanced-region JSX scan was **deleted**: with a closed API it proves nothing the API does not already guarantee.

**Stage 2 — provider registry.** `PRESET_PROVIDERS` declares what each provider NEEDS, resolved through
`satisfiesCapability` — the same predicate modes and subfeatures use, so there is one capability vocabulary.
**Owner decision (2026-07-27):** enforce the provider exactly where it EXECUTES. `text` is served by whichever lane owns
text-to-image (the account's Gateway when hosted), so there `provider` is authoring metadata and gating on it would hide
every business recipe in a hosted build without making any promise truer. Every other mode is enforced — and the
exemption is a LIST (`PROVIDER_RECOMMENDATION_ONLY_MODES = ['text']`), so any mode added later is enforced by default.
Remaining gap recorded, not silently closed: model-specific wording inside `qualityNotes` for the hosted text lane.

**Stage 3 — the CLASS-A rule now reads the PARSE TREE** (`support/errorFlow.js`, using `@babel/parser` already present
in the tree via `@vitejs/plugin-react` — **no new dependency**). Every `catch` is found structurally and its binding is
whatever the author named it; every use is **DEFAULT-DENIED** unless it matches a small closed set of safe handlings
(the declared boundaries, `console.*`, bare rethrow, inspection, and one level of alias whose own uses are all safe).
Enumerating SAFETY is closed and reviewable; enumerating SINKS is not. 17 controls pass, including the two shapes the
regex missed. Stated limit: alias tracking is one level. `gentleError` was added to the boundary list after reading it.

**Stage 4 — the scope decision, recorded instead of implied.** Running the rule app-wide found leaks of this very class
OUTSIDE the creative routes. **Owner decision: PR #118 stays scoped to the Studio** (47 modules, **0 violations**), and
the rest is recorded as KNOWN DEBT with exact sites — asserted by a test that fails if the debt is fixed or if the file
enters the graph, so it cannot go stale silently:
- `src/pages/ProjectDetail.jsx:243,267,279` — `toast(err.message)` ×3, IndexedDB/File-API text. **Reachable**: unlike
  `Projects.jsx`, the `/projects/:id` route has **no BetaUnavailable gate** — a separate containment gap worth its own PR.
- `src/lib/jakeAgent.js:738` — action-handler failure text reaches Jake's visible log.
- Latent (not a leak): `Settings.jsx:74` renders `err.message` only when it EQUALS a known Hebrew business string.
- Non-rendering: `Assistant.jsx` `window.__creativeLastError` debug hook; creative/v2 structured `reason`/`details`/`log`.

**Stage 5 — verification. Full suite on the final head: 123 files / 3,214 passed / 1 pre-existing skip / 0 failed;
one production build green.** Three browser configurations, real DOM:
- **Hosted** (`index-CgXN4ePx.js`): 2 mode tiles; exactly 4 presets, `hebrew_ui_mockup` absent; Product Lock shows its
  base guidance with **no B2 label, sentence or note**; **0 console messages, 0 local-engine requests**, 0 engine terms.
- **Fully declared local**: 9 tiles, 6 presets, B2 action + guidance + note return together.
- **PARTIAL local rig (ComfyUI, no Qwen/PuLID declared)** — the configuration stage 2 exists for: 7 tiles, and
  `photo_restoration` is **ABSENT** while `img2img` is open. That is the first Codex finding reproduced and closed in the DOM.

⚠️ **Honest limit, recorded rather than papered over.** The LTX half could NOT be reproduced in the browser:
`hasQwenEdit`/`hasPulidModel` are POSITIVELY declared, but `hasLtxVideo`/`hasVideoModel`/`hasKontextModel` are still
derived as `COMFY_URL && <model constant>`, and those constants carry non-empty defaults — so `ltx` is true whenever
ComfyUI is configured and the `{video:true, ltx:false}` state cannot occur live today. The guard is correct and
**proven at the evaluator level by execution**, but dormant in the app until `ltx` is declared the way `qwen` is. A test
pins this asymmetry so a future change forces the note to be updated.

**Evidence classes stay separate:** real DOM (three configurations above) · executed code (`posterExportErrorText`,
`presetUnavailableReason`, `isProviderExecutable`, `unsafeErrorFlows` on parsed fixtures) · source pins (the ImageStudio
wiring and the capability-derivation asymmetry), labelled as such.

### Round 6 — FINAL ARCHITECTURAL CORRECTION (four Codex findings on `f4fcf89`)

Codex reviewed the round-5 head and raised four gaps. All four were verified before any edit — three of them by
**executing the shipped code**, not by reading it.

**1 · Provider EXECUTION authority (P1).** Availability said a recipe could be *offered*; it never made the declared
provider *run*. The seam picked its path from raw flags — `ImageStudio.jsx:633`
`hasKontextModel ? editImage : generateImg2Img` and `hasLtxVideo ? ltxVideo : animateImage` — and never consulted the
active preset. So a `{qwen:true, kontext:false}` rig ran the Qwen identity recipe through **SDXL**, and a Kontext rig
through **Kontext**, while the guidance named Qwen-Edit. Fixed: `PRESET_PROVIDERS` now declares an `executors` map
(mode → execution-path id) and `resolveStudioExecution(mode, preset, caps)` decides the path. A preset that declares a
provider runs on that provider **or not at all — there is no fallback branch on either failure path**; with nothing
promised, the ordinary capability chain still applies. Both seams (`onCta` and `animateResult`) consume the resolution.
**Consequence, stated plainly: `photo_restoration` is now unavailable in every configuration.** It declares
`local-qwen-edit` and targets `img2img`, but Qwen-Edit's only execution path here is `qwenCompose` (multi-image,
`presenter`) — there is no single-image Qwen edit. Offering it promised an engine that could never execute it.

**2 · AST boundary semantics + catch patterns.** Two real holes: (a) treating everything under a named boundary as safe
accepted `userError(e.message)` — which marks the provider text `userSafe`, so `userFacingError` renders it **verbatim**
— and `engineError('tech', e.message)`, whose second argument becomes `userMessage`. The leak, laundered through the
boundary. Fixed with `BOUNDARY_SEMANTICS`: each boundary declares WHICH argument positions may receive a caught value
(`userFacingError`/`engineError`/sanitizers → `[0]`; `userError` → `[]`; `console.*` → all), and reaching an unsafe
position is definitive even under an outer boundary. (b) `catch ({ message })` has an `ObjectPattern` param, so the
early return skipped the **entire handler**. Fixed with `catchBindingNames`, which extracts bindings from object/array/
default/rest patterns; an unrecognised pattern is **reported, never skipped**. 16 new parsed fixtures.

**3 · Closed subfeature authority.** The raw registry was still exported, so a consumer could import it and render
`REGISTRY[id].guidance` with no capability check — and the uniqueness invariant stayed green because the literal was
still defined only in the authority file. The definitions are now **private**; `studioSubfeature()` is the only public
route to user-visible text, and only non-sensitive metadata (`STUDIO_SUBFEATURE_IDS`, `SUBFEATURE_TEXT_FIELDS`,
`SUBFEATURE_META_FIELDS`) is exported. A test imports the module namespace and asserts **no export carries any
protected string**.

**4 · Dependency ownership.** `@babel/parser` was used directly by test code while only present transitively through
Vite. Declared as a direct devDependency (`^7.29.7`) and the lockfile updated.

**5 · Fail-closed capability inputs.** Round 5 recorded that `ltx`/`video`/`kontext` were derived as
`COMFY_URL && <model constant>` — and every constant carries a non-empty default, so they reported TRUE on any rig with
an engine URL. Strict provider enforcement cannot be stronger than its inputs. **All five optional stacks now share one
positive declaration** (`optionalStack` → `optionalCapabilityDeclared`), matching the convention already proven for
PuLID/Qwen: `VITE_COMFYUI_LTX`, `VITE_COMFYUI_SVD`, `VITE_COMFYUI_KONTEXT`, `VITE_COMFYUI_PULID`,
`VITE_COMFYUI_QWEN_EDIT`. `.env.example` documents all five and now states explicitly that a `*_MODEL` constant names
which file to load and can never prove it exists. **The round-5 "recorded limit" is CLOSED, and it was closed in the DOM.**

**Verification. Full suite on the final head: 123 files / 3,233 passed / 1 pre-existing skip / 0 failed. One production
build, green.** Browser smoke limited to the changed runtime behaviour, three configurations:
- **ComfyUI configured, NOTHING declared** — the state that could not exist before: **4 modes only** (video, before/after
  and character all gone), and `product_motion_video` **absent**. That is the LTX case reproduced in the real DOM.
- **Fully declared rig** — 9 modes, `product_motion_video` present, B2 action + guidance + note all return;
  `photo_restoration` **absent by design** (finding 1).
- **Hosted** (`index-yy5vPhJD.js`) — unchanged: 2 modes, 4 presets, no B2 text, **0 console messages, 0 local-engine
  requests**, 0 engine terms.

**Real execution evidence** (not proxies): `resolveStudioExecution` resolved against `STUDIO_EXECUTOR_FN` by **function
identity** — a Qwen-declared recipe resolves to `qwenCompose` itself and to neither `editImage` nor `generateImg2Img`;
an LTX recipe resolves to `ltxVideo` and, with SVD present but LTX absent, resolves to **nothing** rather than
`animateImage`. Plus the AST rule executed over parsed fixtures, and the module-namespace import proving the registry is
unreachable. **Source/AST proxies** (labelled): the two ImageStudio seam pins and the capability-declaration pins.

**NOT verified, stated rather than implied:** no authenticated end-to-end generation was run (no engine and no
credentials in this session), so provider routing is proven at the resolution seam and by function identity, not by a
completed render on a live ComfyUI rig; the recorded out-of-scope debt (`ProjectDetail` ×3, `jakeAgent` ×1) is
re-measured and unchanged but still **not fixed**; and no Production or Preview deployment was touched.

**Status AT THAT ROUND: merged, not yet deployed** *(historical — now LIVE in Production; see the closure box)*. **P1 remains CLOSED / LIVE. PR #117 remains paused and untouched.**

### Round 7 — two final Codex P2 corrections (head `11cf66b`)

Both verified before editing.

**1 · LTX-only result action.** Round 6 made `hasLtxVideo` and `hasVideoModel` independent positive declarations, which
was correct — but the result-card "צור אנימציה" action at `ImageStudio.jsx:1520` was still gated on `hasVideoModel`
alone. An LTX-only rig therefore had an open video mode and a working `ltx-video` executor, yet no way to animate a
generated result. Fixed by giving VISIBILITY and EXECUTION the same resolution: `resolveResultAnimation(caps)` (=
`resolveStudioExecution('video', null, caps)`) is computed once, the button renders on `resultAnimation.ok`, and
`animateResult` runs `resultAnimation.executor` — so the two can no longer disagree. Verified by execution across all
four configurations: **LTX-only → offered, routes `ltxVideo` (never `animateImage`); SVD-only → offered, routes
`animateImage` (never `ltxVideo`); both → `ltx-video` by the declared chain order, deterministically; neither → hidden
AND refused** (`no-executor-available`). No silent substitution on any branch.

**2 · AST condition bypass.** The condition/comparison/unary exemptions were POSITIONAL only, so
`catch (e) { if (setError(e.message)) retry(); }` reached the `IfStatement` with the whole call as `node.test` and was
classified safe — although the value had already been rendered by the time the condition evaluated. `!setError(…)` and
`setError(…) === 1` bypassed the same way through the unary and comparison exemptions. Fixed: inspection now
additionally requires the sub-expression carrying the caught value to be **side-effect free** (`isSideEffectFree`
rejects any call / new / assignment / update / await / yield / tagged template anywhere inside). Condition carriers were
also widened to `do…while`, `for` and `SwitchCase`, so the exemption cannot be sidestepped by choosing a different loop
form. **17 new parsed fixtures**: 9 bypass shapes all flagged, 8 legitimate inspections (`typeof`, `instanceof`,
equality, bare property conditions, logical property inspection) all still accepted. The creative graph remains **0
violations / 47 modules**, and the recorded out-of-scope debt re-measures unchanged (`ProjectDetail` ×3, `jakeAgent` ×1).

**Verification. Full suite on the final head: 123 files / 3,243 passed / 1 pre-existing skip / 0 failed. One production
build, green.** Minimal runtime smoke for the changed behaviour only — **LTX-only** (`index-DwWjD6y4.js`): video mode,
before/after mode and the LTX recipe all present; **SVD-only**: video mode present while before/after and the LTX recipe
are correctly absent, 0 engine terms.

⚠️ **NOT verified, stated rather than implied.** The result-card BUTTON itself could not be observed in the DOM: it
renders only inside a completed result, and producing one requires a live engine or Gateway credentials, neither
available in this session. Its visibility is proven by **executing the shipped predicate** (`canAnimateResult` /
`resolveResultAnimation`) across all four configurations and by function identity against `STUDIO_EXECUTOR_FN`; the JSX
wiring itself is a **source pin**. The DOM evidence above covers the same capability resolution as expressed in the mode
tiles and recipe list, not the button.

📌 **Adjacent observation, deliberately NOT patched (out of scope for that round).** The `isCallee` exemption in
`errorFlow.js` treats a method call on the caught value as safe, so `setError(e.toString())` currently reports **0
violations**. It is latent — that shape occurs nowhere in the creative graph (grepped) — and it is a different exemption
from the two findings, so it was left alone rather than widening the PR. Recorded here so the next review can decide.

### Round 8 — PRODUCT DECISION: the Studio is CLOUD/GATEWAY ONLY (2026-07-27)

**Owner decision, superseding the LTX correction:** ArtValue Studio is cloud/Gateway only. The LTX Codex finding was
resolved by **removing the feature**, not by exposing or repairing it. Nothing local was preserved "for later".

**Removed from the Studio's dependency and execution surface**
- **7 of 9 modes deleted** (smart edit, area edit, image→video, before/after, product presenter, character pack, model
  album) with their panels, handlers, state, idea packs and copy. `MODES` is now `text` + `lock`, matching
  `STUDIO_MODE_REQUIREMENTS` exactly — the retired ids were removed from BOTH, not hidden in one.
- **`geminiImage.js` and `comfyProgress.js` DELETED.** The Studio's image lane is a new `lib/hostedImage.js` containing
  only the Gateway path — no engine URL, no model constant, no capability flag, no probe, no job watcher.
- **The capability vocabulary is gone**: `hasLocalComfy / hasLtxVideo / hasVideoModel / hasKontextModel / hasPulidModel /
  hasQwenEdit / liveStudioCapabilities` no longer exist. `studioModes.js` takes **no capability argument at all** — a
  mode is either part of the product or it is not, so there is nothing left to infer optimistically.
- **The provider registry and executor routing are gone** (`PRESET_PROVIDERS`, `MODE_EXECUTOR_CHAIN`,
  `resolveStudioExecution`, `STUDIO_EXECUTOR_FN`, `resolveResultAnimation`). Presets carry no `provider`,
  `recommendedModel` or `modelFamily`; the three recipes that targeted retired modes or an external provider were
  deleted; model-specific wording (FLUX/SDXL) was rewritten as business guidance.
- **The gated Product Lock B2 subfeature was removed entirely**, and with it the whole subfeature registry, snapshot and
  Business-Brain plumbing. Product Lock B1 — the exact in-browser canvas composite — **survives untouched**.
- **7 retired workflow cards removed** from the catalog; `engine` values `comfyui`/`fooocus`/`mixed` replaced by
  `gateway`/`browser`, because Jake reads that field. `product_visual` no longer maps to a retired workflow or capability.
- **Studio-only env declarations removed** (`VITE_COMFYUI_LTX/_SVD/_KONTEXT/_PULID/_QWEN_EDIT` and the LTX/Kontext model
  constants). `VITE_COMFYUI_URL` stays, documented as **not used by the Studio**.

**What was PRESERVED, and why**
- The hosted Gateway lane, the two working modes and their business-facing experience.
- The gallery/history (device-local, no engine), the poster editor, the mockup studio, the brand palette, the prompt
  enhancement, the Gateway prompt-limit guard and the whole error boundary.
- **`localComfyEngine.js` (new)** holds ONLY what two PROVEN consumers outside the Studio still call —
  `AdStudio.jsx` → `generateMaxRealism`, and `comfyPoster.js` (Jake's poster) → `generateLocalImage` /
  `checkLocalEngine` / `hasLocalComfy`. Every Studio-only engine path was deleted rather than moved. A test asserts
  those are the **only two importers**.
- **No Gateway contract, Edge function, schema, migration, Auth or Production change.** `supabase/` has zero diff.

**Also in this round — the second Codex P2 (AST condition bypass) is fixed.** Inspection now additionally requires the
sub-expression carrying the caught value to be **side-effect free**, so `if (setError(e.message)) retry();`,
`!setError(…)` and `setError(…) === 1` are all rejected; carriers were widened to `do…while` / `for` / `SwitchCase`.
17 parsed fixtures; legitimate `typeof` / `instanceof` / equality / property inspection unchanged.

**Scope proof (executed, not asserted in prose)**
- The Studio's own import closure (**33 modules**) contains **no** `localComfyEngine.js`, `localEngines.js`,
  `comfyProgress.js` or `geminiImage.js`, and **no CODE** in it names a local engine, address or checkpoint (comments
  are stripped first — several modules explain in prose why the engine is gone, which is the opposite of a leak).
- `ImageStudio.jsx` contains none of `checkLocalEngine / listImageModels / hasPulidNode / hasQwenEditNode / onComfyJob /
  markNextComfyJob / watchJob / cancelJob / object_info / system_stats` — opening the Studio performs no request.
- The single generation call is `generateImage(p, { aspect })`: no provider, model, size, arch or engine field.
- Every retired mode id resolves through `resolveStudioMode` to `text` with `contained:true, retired:true`; a hand-off
  naming a retired workflow yields `mode: null` and still prefills the prompt.
- Jake: no retired workflow, no gated subfeature, and no capability object naming an engine.

**Verification.** Full suite **118 files / 3,058 passed / 1 pre-existing skip / 0 failed**; one production build green.
Bundle **725 kB → 660 kB (−65 kB)**. Hosted browser smoke (`index-DK6hxNbp.js`): **2 mode tiles, 4 presets, 0 engine
terms in the DOM, 0 console messages, and only same-origin asset requests** — no local address contacted; Product Lock
opens and shows no B2 text; a real generation attempt renders `יצירת התמונה אינה זמינה כרגע.`.
Local-engine browser matrices were retired with the feature and were **not** run.

⚠️ **Stated rather than implied.** The built artifact still CONTAINS local-engine strings (`comfyui`, `8188`,
`safetensors`, `KSampler`), because `AdStudio` and the Jake poster adapter legitimately still use
`localComfyEngine.js`, and the server-side Gateway contract registers local provider NAMES for its own routing table.
String presence in a single-chunk bundle is not proof of reachability — this project recorded that lesson earlier — so
"no reachable Studio local path" is proven **structurally, by the Studio's import closure**, plus the DOM/network
evidence above. No authenticated end-to-end generation was run (no credentials this session).

**Status AT THAT ROUND: merged, not yet deployed** *(historical — the slice went LIVE in Production on 2026-07-27 as deployment `b3708cc2`; see the closure box in the Baseline)*. **P1 remains CLOSED / LIVE. PR #117 remains paused and untouched.**

### Round 9 — PRODUCT DECISION: Product Lock removed entirely + 4 Codex findings on `7f9daf8`

**Owner decision:** Product Lock is unnecessary and is removed completely. Round 8 had preserved B1 (the browser
composite); that is no longer approved. The Studio now has **exactly ONE creative mode: `text`** — description → image,
served by the account's protected AI Gateway.

**Codex reviewed `7f9daf8` and raised 4 findings. All were real; none was waved through as superseded.** Two were
**regressions I introduced in round 8** — stated plainly:

| # | Finding | Status |
|---|---|---|
| 1 (P1) | `maxRealismGraph` referenced `wrapNatural` / `wrapRealism` / `NATURAL_WILD` / `FACE_WILD`, which I did **not** carry over when splitting `localComfyEngine.js` out. **Every configured AdStudio render would have thrown a `ReferenceError` before submitting a job.** | **My regression. Fixed** — helpers restored into the module with their consumer. |
| 2 (P2) | `jakeExecutionPlanner.js` still planned `product-presenter` steps and `seam-shadow-blend`; `jakeHandoffResolver.js` still described both. Nulling a capability had not removed the plumbing. | **Fixed** — plan types, step ids, step metadata and descriptions retired; both intents now land on the one hosted lane. |
| 3 (P2) | A retired workflow yields `mode: null`, and the hand-off effect **skipped resolution entirely**, so an already-mounted Studio kept its current mode with the new prompt hidden behind it. | **Fixed** — *every* accepted hand-off resolves, including a null mode. |
| 4 (P2) | Gallery delete still called `setSelectedIds` after round 8 removed that state → `ReferenceError` aborting `refreshGallery()`. | **My regression. Fixed** — stale call removed. |

**Product Lock removal — removed, not hidden**
- The `lock` mode, its tile, panel, controls, state (`lockBusy`, `placerRef`) and `buildLockComposite` handler.
- **`ProductPlacer.jsx` and `lib/productLock.js` DELETED** — traced first: `productLock.js`'s only consumer was
  `ProductPlacer`, whose only consumer was `ImageStudio`. Both were orphaned by the removal, so neither survives.
- The `product-lock` workflow card; `lock` removed from `STUDIO_MODE_REQUIREMENTS` and `STUDIO_MODE_LABELS` and **added
  to `RETIRED_STUDIO_MODES`**, so an indirect entry path is contained explicitly rather than falling through.
- Jake: the `product_lock_flow` plan type, the `product-lock` / `exact-composite` / `seam-shadow-blend` steps, the
  resolver title/description, and the Business-Brain product-mode note. The `product_lock` and `product_visual` intents
  still classify — a user may well ask — but both now produce the **studio_marketing_asset** plan seeded with
  `fast-image`, so a retired request lands safely on the remaining hosted experience **keeping its prompt**.
- The two-image uploader and all upload state (`file`, `endFile`, previews, refs, pickers) became orphaned with the last
  image-taking mode and were removed; `SOURCE_BY_MODE` collapsed to `{ text }`.
- The Business-Brain `product-visuals` **service** pitch no longer claims 1:1 pixel preservation (a system capability
  that no longer exists); the service itself is untouched.

**Retained:** the hosted Gateway text-to-image experience, gallery/history, poster editor, mockup studio, brand palette,
prompt enhancement, the error boundary — and **no Gateway contract, Edge, schema, migration or Auth change**
(`supabase/` has zero diff). No replacement provider or new creative feature was introduced. Growth stays contained.

**Verification.** Full suite **117 files / 3,040 passed / 1 pre-existing skip / 0 failed**; one production build green;
bundle **660 → 648 kB**. Hosted browser smoke (`index-PzfbwgkL.js`): **1 mode tile, 4 presets, 0 file uploaders,
0 Product Lock wording, 0 engine terms, 0 console messages, and no request to any local address**; a real generation
attempt renders `יצירת התמונה אינה זמינה כרגע.`.

⚠️ **Codex's review of `7f9daf8` is NOT merge-clearance for that head** — it raised 4 findings, all fixed here, and the
head itself has been superseded. No authenticated end-to-end generation was run (no credentials this session).

**Status AT THAT ROUND: merged, not yet deployed** *(historical — the slice went LIVE in Production on 2026-07-27 as deployment `b3708cc2`; see the closure box in the Baseline)*. **P1 remains CLOSED / LIVE. PR #117 remains paused and untouched.**

### Round 10 — FINAL PRODUCT DECISION: **the whole application is CLOUD-ONLY** (2026-07-27)

**Owner decision (supersedes the round-8/9 boundary):** ArtValue is a cloud-only product. The boundary that retained
local-engine support for **AdStudio** and the **Jake poster adapter** is withdrawn. Every remaining EXECUTABLE
local-engine path across the entire application is **REMOVED, not repaired and not disabled**. The Codex findings about
missing helpers and the parser inside `localComfyEngine.js` are therefore **structurally obsolete**: the module and all
of its consumers are gone.

**Inventory was derived from the real import graph**, not a keyword list — see the new proof suite
`src/lib/__tests__/localEngineRetirement.test.js`, which walks the transitive closure from `src/main.jsx`.

**Deleted modules (7 runtime + 6 test files)**

| Deleted | Why it could not stay |
|---|---|
| `src/lib/localComfyEngine.js` | The ComfyUI bridge itself (submit / poll / `/view` / `system_stats` / FaceDetailer / upscale probes). |
| `src/lib/localEngines.js` | The production gate. With no local engine left to gate, the gate is itself the last local-engine surface. |
| `src/lib/comfyPoster.js` | Jake's workstation poster adapter — the only consumer of the bridge outside AdStudio. |
| `src/creative/v2/poster/comfyPosterPrompt.js` | Its only consumer was `comfyPoster.js`; orphaned by that deletion. |
| `src/components/ai/posterOverlay.js`, `src/components/ai/posterExport.js` | Overlay + PNG export for the workstation poster image; orphaned with the poster card. |
| `src/pages/AdStudio.jsx` | Its ONLY output was a workstation render (`generateMaxRealism`). With no cloud implementation, the page had nothing left to do. **Deleted, not contained** — containment is for modules the product still has. |

**Retired features (removed from every discoverable surface)**
- **AdStudio** — page, `/adstudio` route, sidebar entry, `BETA_HIDDEN_MODULES` membership, and its DemoMode tour step
  (retargeted to the hosted Studio with truthful copy). It is no longer "beta-hidden"; it does not exist.
- **`/workflow` and `/fooocus`** — the legacy redirect routes were removed too; a route named after a workstation engine
  is itself a local-engine surface. A **catch-all `path="*"` → `Navigate to "/"`** now makes every retired deep link,
  bookmark or restored router state fail SAFE instead of rendering an empty shell.
- **Jake's poster generation** — the poster CTA on the offer-brief card, `generatePoster`, the `posterProgress` /
  `posterResult` / `posterError` cards, `PosterOverlay`, `PosterExportButton` and `posterErrorText`. The deterministic,
  model-free **offer brief itself is untouched**, including its text poster/ad brief section.
- **Brain selection** — `jakeBrainPref` / `setJakeBrain` / `jakeBrainLabel` / `jakeBrainOrder` had **no production
  consumer** and the "local" branch named a workstation model. There is now exactly ONE brain: the account's Gateway.
- **The local text lane in `gemini.js`** — `LOCAL_LLM_URL`, `localChat`, the ComfyUI VRAM self-heal (`freeImageVram`),
  `freeCreativeModel`, `useLocalLLM` and every local branch. `toEnglishImagePrompt` was a model call; it is now
  **deterministic and synchronous**. The Creative Director text pipeline survives on managed Gemini (or its demo stubs).
- **The eval harness's REAL mode** — `runRealEval` called a workstation model and could never run again; removed with
  `realGuard.test.js`. The committed baseline snapshot and the deterministic FIXTURE mode are unchanged.

**Truthfulness fixes (required regardless of the deletion)**
- Studio header no longer promises editing existing images or image-to-video; it now describes only description-to-image.
- The `product_hero_shot` preset no longer tells the user to switch to the retired Smart Edit mode.
- Business Brain no longer claims posters / product visuals / **video** are produced in-system; the DemoMode intro no
  longer calls the Studio a creative engine that generates ads.
- `localReady` → **`recipeReady`** across presets/availability: the flag meant "recipe usable today", but its name read
  as "ready on the local engine".

**Structural proof** (`localEngineRetirement.test.js`, plus updated suites)
- Every deleted module is absent from disk; **nothing in `src/` imports one**.
- The transitive import closure of `src/main.jsx` (>40 modules, reaching `App.jsx` and `ImageStudio.jsx`) contains
  **no retired module, no local address, and no workstation-engine term in executable code**.
- **No runtime file in `src/` reads any local-engine env var** (14 names asserted) and `.env.example` ships no such
  assignment — so no setting can re-open a hidden path.
- No retired route is registered; the catch-all is asserted; `/studio` is still registered.
- Every LIVE workflow routes to an available Studio mode; every Jake intent that reaches the Studio resolves to a LIVE
  cloud workflow (`fast-image`); no plan step or preset advertises a retired operation.
- Growth stays `BetaUnavailable` behind the 5-route gate; **`supabase/` has zero diff**.

**Built-artifact inspection** (supporting evidence only — route/import/runtime proof is authoritative)
- App bundle: **0 `localhost`, 0 `127.0.0.1`, 0 `http://` URLs of any kind**, 0 `:8188` / `:7860` / `:11434`,
  0 `safetensors` / `RealVisXL` / `flux1-dev` / `CheckpointLoaderSimple` / `FaceDetailer` / `prompt_id` / `system_stats`,
  0 `adstudio`.
- The `localhost` / `127.0.0.1` hits in `supabase-*.js` are inside the third-party `@supabase/supabase-js` vendor chunk.

**Runtime checks (browser, production build)**
- Hosted build (`dist/`, Supabase configured): login gate, **0 console messages**, **0 local-address requests** across
  load, five route navigations and idle.
- A scratch demo-mode build (temp dir; `dist/` untouched) exercised the route table: **`/adstudio`, `/workflow` and
  `/fooocus` all resolve to `#/`** (fail safe); `/studio` renders with the corrected copy, **1 mode, 4 presets, 0 file
  uploaders**; Jake opens with the offer chip and **no poster CTA**; **0 engine terms anywhere in the DOM**,
  **0 local-engine requests**, 0 console messages. A generate click issued **zero network requests**.

**KNOWN AND DISCLOSED — local terminology / code that REMAINS**

| What | Why it stays |
|---|---|
| `supabase/functions/_shared/aiGateway.js` registers `comfyui` / `ollama` / `fooocus` / `a1111` as provider **NAMES** in the server's routing table (and reaches the browser bundle via the shared input-limits import). | It is part of the **DEPLOYED Gateway contract**, which this slice must not change. It is a name table only: asserted to contain **no local address and no fetch to one**, and the browser never selects a provider. |
| `scripts/local-review-prep.mjs` still calls a LOCAL Ollama for an **advisory** review summary. | Developer tooling, not the product: outside `src/`, **never imported by the application** (asserted against the import closure) and never bundled. |
| The preset id `local_ad_creative`. | "Local" here means a **local business**, not a local engine. |
| `gemini.js` keeps `fetchSiteText` / `analyzeBusiness`, orphaned by AdStudio's deletion. | They are **not** local-engine paths — they call `r.jina.ai` and managed Gemini — and they are part of the **FROZEN Creative Director V1 public API**, whose surface is under a standing no-change-without-approval rule. Flagged for a future approved dead-code slice. |

**Verification.** Full suite **111 files / 3,000 passed / 0 skipped / 0 failed**; one production build green
(`index-DcZkyu7y.js`, 608.60 kB, down from 648 kB). The file count fell because 6 test files were deleted with their
subjects and no compatibility scaffolding was retained.

WARNING — **not verified:** no authenticated end-to-end hosted generation was run (no credentials this session), so the
authenticated Studio/Jake path is proved structurally and by unauthenticated runtime, not by a signed-in run.

**Status AT THAT ROUND: merged, not yet deployed** *(historical — the slice went LIVE in Production on 2026-07-27 as deployment `b3708cc2`; see the closure box in the Baseline)*. **P1 remains CLOSED / LIVE. PR #117 remains paused and untouched.**

### Round 11 — ABSOLUTE CLOUD-ONLY BOUNDARY: no executable local code anywhere in the repo (2026-07-27)

**Owner decision (absolute):** ArtValue must contain **no executable local-engine code anywhere in the repository** —
the whole product AND its supporting tooling, not only browser-reachable code. Round 10 removed the application paths
and left two disclosed exceptions; this round removes both. Dormant executable local code is no longer acceptable
merely because it is currently unreachable.

The pending Codex review of `1233034` was **superseded by this decision** and was not waited on. Its four findings from
the earlier `2ff51c2` review were already replied to and resolved; nothing in them touches surviving code.

**AI GATEWAY CONTRACT CHANGE — the substantive change this round.**
`supabase/functions/_shared/aiGateway.js` (canonical) no longer registers a local provider in ANY form:

| Removed | Detail |
|---|---|
| Provider vocabulary | `comfyui`, `ollama`, `fooocus`, `a1111` removed from `AI_PROVIDERS`. `normalizeProvider('ollama')` now returns `null` — a retired name is not a provider, so it cannot be preferred, made available or excluded. |
| Model registry | The `comfyui` (image/video/inpaint) and `ollama` (text) entries in `AI_MODELS`. |
| Routing chains | Every occurrence in `DEFAULT_PROVIDER_BY_ACTION` — 12 text/CRM/Jake chains lost `ollama`; `image.poster`, `image.variation`, `image.product_presenter`, `image.product_lock`, `video.short_ad`, `video.product_demo` lost `comfyui`. |
| Capability partition | `LOCAL_PROVIDERS` and the private `isLocalProvider` / `isApiProvider` helpers. `API_PROVIDERS` is now exactly the vocabulary minus the `none` sentinel. |
| Provider SELECTION | The `localFirst` ordering option, and `metadata.localFirst` on every `buildAiRequest` result. `apiFirst` is retained as an accepted no-op (the partition is now the identity). |
| Cost model | The local-provider zero-cost branch in `estimateCost`; only the explicit `none` sentinel is free. |

**The cloud ACTION vocabulary is UNCHANGED** — all 20 action types survive, every one still resolves to a non-empty
chain, and every provider in every chain is an API provider. No new provider was introduced and no business-facing
behavior changed. `aiGatewayContract.js` had one stale comment naming `localFirst`; corrected.

⚠️ **AN EDGE DEPLOYMENT WILL BE REQUIRED LATER — NOT PERFORMED IN THIS TASK.** The deployed `ai-gateway` function
(v35) still carries the OLD shared table. Nothing was deployed, no secret or remote configuration was touched, and the
running Production frontend is unaffected (it is still `247ef9ec`, built long before this branch).

**Also deleted this round**
- `scripts/local-review-prep.mjs` and `scripts/__tests__/local-review-prep.test.mjs` — the review-prep CLI called a
  local Ollama for an advisory summary. It was disclosed last round as "tooling, not product"; that exception is now
  withdrawn. The `scripts/` directory no longer exists.
- `comfy_help.txt` (repo root) — a committed ComfyUI CLI help dump, i.e. local-engine setup reference material.
- npm scripts `local:review-prep` (deleted tool) plus `dev:local` / `preview:local`, which pinned the dev/preview
  servers to `127.0.0.1` with hardcoded ports. They were redundant with `dev` / `preview` and were the last
  `127.0.0.1` strings in `package.json`.

**Documentation corrected (current-state claims, not history)**
- `ARTVALUE_ENGINEERING_METHOD.md` stated *"Local providers ... remain registered as dev/fallback providers — nothing
  local is deleted or disabled by gateway work."* That is now the exact opposite of the rule; replaced with the
  cloud-only invariant. The review step invoking the deleted script was removed and the checklist renumbered.
- `Art-Value-Brief.md` carried a local-engine capability table (Ollama / ComfyUI / models) presented as the product's
  engine. Replaced with the cloud reality, under an explicit **"היסטוריה בלבד — אינו נתמך יותר"** banner.
- `AI_GATEWAY_DEPLOY.md` sample `providerChain` no longer shows `ollama`.
- `DECISION_LOG.md` keeps its dated history and now carries an explicit **SUPERSEDED 2026-07-27** line.
- `jakeos-doc/index.html` made three present-tense claims that Jake still runs locally on Ollama; corrected.

**Repository-wide structural proof** (`src/lib/__tests__/localEngineRetirement.test.js`, extended)
- **172 non-test executable files** scanned across `src/`, `supabase/`, the repo root and `scripts/` (asserted
  non-vacuous): **no engine name and no local address in executable code** anywhere, comments stripped first.
- No package script starts, probes or calls a local model; `scripts/` is asserted absent.
- Gateway: no local name in `AI_PROVIDERS` / `API_PROVIDERS` / `AI_MODELS` / any chain / `normalizeProvider`;
  `LOCAL_PROVIDERS` is `undefined`; `localFirst` cannot change any chain for any action and is absent from metadata;
  all 20 actions keep a non-empty all-API chain.
- **Canonical-copy synchronization proved structurally:** each `src/lib/aiGateway*.js` shim must be *nothing but*
  `export * from '../../supabase/functions/_shared/…'`, so a second divergent provider table cannot exist.
- Retained from round 10: the app import closure from `src/main.jsx` is clean; no retired route registered; catch-all
  present; every Jake/Studio target is a LIVE cloud lane; Growth stays `BetaUnavailable`.

**Verification.** Suite **110 files / 2,980 passed / 0 skipped / 0 failed**. One production build green
(`index-CADF5y0K.js`, 608.02 kB). Artifact: the app bundle now has **0 hits for every one of** `localhost`,
`127.0.0.1`, `comfy`, `ComfyUI`, `fooocus`, `ollama`, `a1111`, `automatic1111`, `:8188`, `:7860`, `:11434`,
`safetensors`, `adstudio`, `localFirst`, `LOCAL_PROVIDERS` and `http://` — the provider-registry strings that survived
round 10 are gone. No non-vendor chunk contains any of them.

**Runtime smoke.** Hosted build (`dist/`): 5-route navigation + 3s idle → 8 requests, **0 local requests**, 0 console
messages; the only non-origin request in either build is the Google Fonts stylesheet. Route table exercised on a
scratch demo build (temp dir, deleted afterwards; `dist/` untouched): `/adstudio`, `/workflow`, `/fooocus` all resolve
to `#/`; `/studio`, `/diagnose`, `/outreach`, `/assets`, `/growth` all render; Studio shows 4 presets and **0 file
uploaders**; Jake opens with **no poster CTA**; **0 engine terms in the DOM, 0 local-engine requests, 0 console
messages**.

**Local terminology that REMAINS — all NON-EXECUTABLE history**
| Where | Why it is not a path |
|---|---|
| `docs/DECISION_LOG.md`, `docs/PROJECT_TRACKER.md`, `docs/roadmaps/*`, `docs/Art-Value-Brief.md` | Dated release history and superseded decisions. Markdown; no setup instructions; the Brief's table is under an explicit "no longer supported" banner. |
| Comments in `aiGateway.js`, `gemini.js`, `chatPersistence.js`, `betaCapabilities.js`, `jakeExecutionPlanner.js` and the test suites | They NAME the retired engines in order to record that they are gone. Every scan strips comments before asserting, and the test suites name them to assert absence. |
| Preset id `local_ad_creative` | "Local" = a local *business*. |
| `gemini.js` `fetchSiteText` / `analyzeBusiness` | Orphaned by AdStudio's deletion but not local paths (r.jina.ai + managed Gemini) and part of the FROZEN Creative Director V1 API. Flagged for a future approved dead-code slice. |

**NOT PERFORMED — required later, in order:** Preview deploy + acceptance → **Edge `ai-gateway` redeploy** (the shared
contract changed) → Production deploy. None was started; no remote mutation of any kind was made.

**Codex reviewed `1233034` mid-round and raised 2 further P2 findings. Both were real, both are MINE, both are fixed:**

| # | Finding | Status |
|---|---|---|
| 1 (P2) | The DemoMode Studio step I rewrote last round claimed *"היצירה רצה בענן המאובטח של החשבון שלך"*. But `shouldAutoOpenDemo` returns **false** in cloud mode — the tour auto-opens ONLY in local/demo, i.e. exactly where there is no account, no account cloud, and (with the default empty Pollinations token) no image lane at all. My copy promised both an account and a working generation in its primary environment. | **My regression. Fixed** — the step now describes the SURFACE and its always-available browser-side tools (prompt recipes, poster editor, mockup composer) and states that image creation itself is available once the account is connected to the creation service. |
| 2 (P2) | My new `runCriticEval.js` header said the removed REAL mode's *"committed baseline snapshot ... is unchanged"*, implying the REAL runner produced it. It did not: `v1Snapshots.json` is `source: 'fixture-synthetic'`, hand-authored and expanded by `buildBaseline.js`, and the REAL runner only ever wrote separate candidate artifacts. Worse, `BASELINE_META.warning` still told evaluators that authoritative quality *"requires a human-labeled real local-model run"* — a now-impossible procedure — and `buildBaseline.js` still described the real-run path as existing. | **Fixed** — provenance stated precisely (removing the runner changes no snapshot provenance); the warning now says the real-model validation it pointed at is NO LONGER AVAILABLE in this repository and names the deterministic fixture run as the supported measurement, while still refusing to call it validation. `v1Snapshots.json` was **regenerated from the builder — a 1-line diff** (the warning string only), which is itself the proof that no sample data drifted; `dataset.test.js` re-derives and deep-equals it. |

Re-verified after the fixes: suite **110 files / 2,980 passed / 0 failed**; build green (`index-C4frcMDi.js`, 608.05 kB);
artifact still **0** for every local term; hosted runtime **0 local requests, 0 console messages**.

**Codex then reviewed the retirement PROOF itself and raised 2 findings in it. Both were real; both are fixed.**
This round changed **no product code** — only the proof and its new support module — so no rebuild was required and the
verified artifact stays `index-C4frcMDi.js`.

| # | Finding | Status |
|---|---|---|
| 1 (P1) | The comment stripper was `s.replace(/\/\/[^
]*/g, '')`. It has no idea what a string is, so it read the `//` inside a URL as a line comment: `fetch('http://127.0.0.1:8188/prompt')` became `fetch('http:` **before either repository-wide assertion looked at it**. The single most common shape of a local-engine call walked straight through my own gate. | **Fixed** — replaced with a **syntax-aware scanner** (`src/lib/__tests__/support/sourceScan.js`) that removes comments while emitting string, template (incl. `${…}`) and regex literals verbatim. Regex handling matters independently: an apostrophe inside a regex used to open a phantom string that swallowed the rest of the file. Design rule: **every ambiguous case preserves text**, so the failure direction is a loud false positive, never a silent miss. |
| 2 (P2) | The recursive walker matched only `.js/.jsx/.ts/.tsx`; `.mjs`/`.cjs` were recognised **only at the repository root**. A caller added as `src/tool.mjs`, `supabase/functions/tool.mjs` or a nested `.cjs` sat outside both scans. | **Fixed** — one `collectModules()` walks every root recursively over the full extension set (`.js .jsx .mjs .cjs .ts .tsx .cts .mts`), skipping only build/dep directories. `resolveLocal` resolves the same set. |

**Negative controls added — the substantive part.** Every assertion in this suite is a *"nothing found"* assertion, and a
scan that silently cannot find anything looks identical to one that found nothing. Codex caught exactly that twice, so
the primitives were extracted into `support/sourceScan.js` and the controls now exercise **the same code the gate runs**:
- 5 planted local-engine calls (single/double-quoted, template literal, template-with-substitution, object literal) must
  be DETECTED — and the suite **reproduces the bypass**, asserting the OLD regex stripper loses every one of them while
  the new one holds all five.
- 4 comment forms (line, block, trailing, JSDoc) naming a retired address/engine must be IGNORED.
- A regex-literal-with-apostrophe must not hide the call on the following line; division must not be misread as a regex.
- 4 modules planted in a temp directory (`tool.mjs`, `nested/deep/probe.cjs`, `nested/adapter.ts`,
  `nested/deep/legacy.cts`) must all be collected and reported — with the OLD extension filter asserted to miss the
  `.mjs`/`.cjs` ones.

**Result of re-running the corrected gate over the real repository:** still **0 offenders** across **172 non-test
executables**. The fixes exposed nothing that the broken gate had been hiding — today the repo contains no `.mjs`/`.cjs`
module at all — so this is a guard against a future bypass, not the discovery of a live one. Stated plainly rather than
implied. The stale header comment claiming the deleted Ollama review script "remains as a known exception" was removed;
there is no remaining exception.

Suite **110 files / 2,997 passed / 0 skipped / 0 failed** (+17 control tests). No build re-run: no executable production
code changed.

**Codex broke the hand-written scanner a THIRD time (3 findings on `b6fbd04`). The approximation itself was the
defect, so it is gone — replaced with parser-backed analysis.** This round changed **no product code**; the verified
artifact stays `index-C4frcMDi.js`.

| # | Finding | Status |
|---|---|---|
| 1 (P1) | A nested template whose substitution held an **object literal** ended the template early: the object's `}` decremented a depth its `{` never incremented, so ``const u = `${({}).x ? `http://127.0.0.1:8188/prompt` : ``}`;`` lost the URL. | **Obsolete by replacement** — the parser tracks substitution and brace nesting. |
| 2 (P1) | **JSX text had no state at all**, so `<p>Open http://127.0.0.1:8188/prompt</p>` was truncated at `http:`. The scan explicitly covers `.jsx`/`.tsx`, so an address rendered as unquoted JSX text bypassed the boundary. | **Obsolete by replacement** — JSX text is never touched. |
| 3 (P2) | Regex detection looked only at the previous **character**, so `return /it's fine/;` read as division; the apostrophe opened a phantom string that ate the rest of the line. | **Obsolete by replacement** — the parser tokenizes regex in every expression context. |

**The method now (`support/sourceScan.js`).** `executableSource()` hands the file to **`@babel/parser`** (already a
declared direct devDependency) and blanks **only the byte ranges the parser reports as comments**, preserving length and
newlines. Nothing else is altered. That single rule satisfies every invariant structurally rather than heuristically:
comments excluded; strings, template literals and JSX text left byte-for-byte inspectable; nested substitutions and
ordinary nested braces handled by the parser; regex literals tokenized in every valid context; per-extension plugin sets
so **JS / JSX / TS / TSX / MJS / CJS / MTS / CTS each parse as their real syntax** (a `.ts` reads `<T>x` as a type
assertion, a `.tsx` as an element — they are asserted to get different plugins); and an unparseable executable file
throws `UnparseableSourceError` naming the file — **never silently skipped**.

**Address-class gap closed** (independently identified, not from the review). The invariant is about network
DESTINATIONS, and a workstation engine is as reachable at `192.168.x.x` on the studio LAN as at `127.0.0.1`. The
detector now covers loopback (the whole `127/8`), RFC1918 (`10/8`, `172.16/12`, `192.168/16`), IPv4 link-local
(`169.254/16`), the unspecified address, and IPv6 loopback / link-local (`fe80::/10`) / unique-local (`fc00::/7`) —
**only in a network context** (behind a scheme, behind a protocol-relative `//`, or followed by a port), so ordinary
numeric business data is not mistaken for an endpoint. 8 positive and 8 negative controls pin both directions,
including a version string `'10.0.0.1'`, an SKU embedding `192.168.1.50`, float arithmetic on `127.0`, a clock time,
and a **public** IP endpoint `8.8.8.8:443` which must NOT flag.

**Controls include Codex's three exact reproductions verbatim**, plus 8 regex-context cases (`return`, `if`, `while`,
`case`, array, `&&`, call argument, `typeof`) each followed by a forbidden URL **on the same line**, 8 planted calls
across quoting/JSX/TS/CJS forms, 5 comment forms (incl. a JSX expression comment), 8 per-extension syntax cases, and
5 modules planted at depth in a temp directory. They call the **production primitive**, never a parallel copy.

**Two real defects were caught by the new controls themselves, and fixed:** pinning `.cjs`/`.cts` to `sourceType:
'script'` made valid `.cts` (`export = x`) unparseable — now `'unambiguous'` everywhere; and the import closure was
resolving `./styles/app.css`, a non-executable asset, into the parser — `resolveLocal` now returns only real modules.
The loud-failure invariant is what surfaced both.

**Result over the real repository:** 283 files scanned, **all parse**, **0 offenders** across **169 non-test
executables** (169 not 172 — the closure no longer counts the three non-module assets it used to resolve). The stricter
address classes exposed nothing that had been hiding. Stated rather than implied.

Suite **110 files / 3,043 passed / 0 skipped / 0 failed** (+46 controls). No build and no runtime re-run: no executable
production code changed. **Superseded by the round below: Codex then found a UTF-16 offset drift and an address-form gap in this same proof layer.**

**Codex found 2 further P1s in the proof layer on `d84cfdc`. Both real; both fixed. No product code changed** —
the verified artifact stays `index-C4frcMDi.js`.

| # | Finding | Status |
|---|---|---|
| 1 (P1) | Babel reports `start`/`end` as **UTF-16 code-unit** offsets, but the blanking loop walked `[...s]`, which iterates **code points**. Every astral character (an emoji) before a comment shifted the blanked window one place right; with enough of them the window slid past the comment and **erased executable text after it**, including part of a later forbidden URL. | **Fixed** — blanking is now done with `String.prototype.slice` between sorted comment ranges, so the mutable representation and Babel's offsets share one indexing space. Length and line structure are preserved exactly. |
| 2 (P1) | Private-host detection was a list of **textual regex forms**. `fe80::/10` spans `fe80`–`febf` but only the literal `fe80` prefix matched, and URL parsing normalizes `127.1`, `2130706433` and `0x7f000001` all to `127.0.0.1`. With an unlisted port such as `9000`, nothing matched — code could reach a loopback or link-local workstation while the scan reported clean. | **Fixed by removing the regex host vocabulary entirely.** Candidate destinations now go through the platform's **WHATWG `URL` normalizer** — the same algorithm a browser applies — and the NORMALIZED host is classified **numerically**. |

**The normalization boundary.** `hasLocalAddress()` extracts candidates (a scheme, a protocol-relative `//`, or an
explicit `host:port`), hands each to `new URL()`, and classifies `url.hostname` by range: loopback `127/8`, RFC1918
`10/8` · `172.16/12` · `192.168/16`, link-local `169.254/16`, the unspecified address, `localhost`, and IPv6 `::1`,
`::`, **the whole `fe80::/10` (fe80–febf)** and **the whole `fc00::/7` (fc00–fdff)**. Because classification is numeric,
it holds for **every textual form the parser accepts** — shorthand, decimal, hexadecimal, octal, compressed IPv6 —
and for **any port**, not only the four engine ports (those remain a separate signal for composed expressions such as
`base + ':8188/prompt'`, where no host exists to normalize). Zone identifiers (`fe80::1%eth0`, `%25eth0`) are rejected
by the URL spec, so they are stripped and the base address is classified rather than lost.

**The business-data boundary is preserved by the EXTRACTION step, not by the classifier:** standalone IP-like text is
never a candidate, so it is never normalized. Controls pin that in both directions, including `const n = 2130706433;`
— a bare integer that *would* normalize to loopback if it were a host — plus a version string, an SKU, float
arithmetic, a clock time, and public endpoints (`8.8.8.8:443`, `[2606:4700::1]:443`) and the exact off-by-one
neighbours `172.32.0.1`, `192.169.0.1`, `[fe7f::1]`, `[fec0::1]`.

**Codex's exact reproductions are controls:** emoji before a comment with a forbidden destination after it (asserted
still detectable, at 1/2/5/20/80 emoji, with the old code-point indexing shown to drift); and `127.1`, `2130706433`,
`0x7f000001`, `[fe90::1]`, `[febf::1]` — every one on the unlisted port `9000`. All controls import the **production
primitive** the repository scan calls.

**One further real defect surfaced while fixing these:** the `http://${candidate}` parse fallback was being applied to
already-schemed candidates, so `http://http://[fe80::1%25eth0]…` parsed with the truthy host `http` and pre-empted the
zone-id retry — swallowing a link-local destination. Exactly one parse shape per candidate now.

**Result over the real repository:** 283 files scanned, **all parse**, **0 offenders** across 169 non-test executables.
The stricter normalization exposed nothing that had been hiding.

Suite **110 files / 3,069 passed / 0 skipped / 0 failed** (+26 controls). **Superseded by the round below: Codex then
showed that a destination assembled at runtime can never be seen by ANY source-text scan, so the text proof was replaced
by a runtime network-policy boundary plus an AST egress invariant.**

**Codex's review of `826de90` ended the text-scanning approach. 2 P1s; the second is decisive.** The first was another
missing address form (IPv4-mapped IPv6, `[::ffff:127.0.0.1]` → `[::ffff:7f00:1]`). The second was not a missing form at
all: a destination assembled at runtime —

    const host = '127.0.0.1'; fetch('http://' + host + ':9000/x');   fetch(`http://${host}:9000/x`);

— **never exists as a URL literal**, so no source-text scan can ever see it. That is proof that a source-level proxy
cannot decide a runtime property. Both were reproduced before any edit.

> ⚠️ **THE ENTIRE FRAMEWORK DESCRIBED IN THE REST OF THIS ROUND WAS REMOVED IN ROUND 12 (below).** `networkPolicy.js`,
> `guardedFetch`, the AST sink registry and its suite no longer exist, and the five production sinks were restored to
> their prior cloud behaviour. It is recorded here as the historical account of a **scope expansion**, not as a
> description of the code. Read Round 12 for the shipped state.

**THE PROOF WAS REPLACED, NOT EXTENDED.** The cloud-only claim is now the CONJUNCTION of two layers, and this round
changed PRODUCTION code to create the first one.

**Layer 1 — RUNTIME (`src/lib/networkPolicy.js`, NEW production module).** The real execution boundary. Every approved
adapter issues its request through `guardedFetch()`, which normalizes the destination with the platform's **WHATWG URL
parser** and refuses loopback, RFC1918, link-local, unspecified and **IPv4-mapped IPv6** hosts, on **any port**. However
the string was assembled, by the time it reaches this function it is concrete — and concrete destinations are decidable.
Five real sinks were routed through it, behavior-preserving: `gemini.js` ×2 (the Google API call, and `fetchSiteText`,
where the **user-supplied target** is now classified before the reader proxy is asked to fetch it), `hostedImage.js`,
`galleryStore.js`, `PosterEditor.jsx`. `data:`/`blob:` pass as NON-EGRESS; unparseable/host-less/unsupported-scheme
destinations **fail closed**.

**Layer 2 — STRUCTURAL (`support/networkEgress.js` + `networkEgressInvariant.test.js`, NEW).** Network sinks are found
in the **AST by shape** — `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `Worker`, `sendBeacon`,
`importScripts`, non-literal `import()`, `element.src=` — never by identifier name or URL text. An explicit
**ADAPTER_REGISTRY** lists the only 4 modules permitted to hold a sink; every other product module must hold **zero**.
`src/lib/networkPolicy.js` is asserted to be the **only** module in the product that may call `fetch` at all.

**Neither layer alone is the proof, and the suite says so:** layer 1 without layer 2 is bypassed by adding a second
sink; layer 2 without layer 1 cannot see an assembled host.

**Controls (47 in the new suite).** Both Codex reproductions; destinations assembled by concatenation, template
substitution, object field, array join and a concatenated scheme; IPv4-mapped IPv6 forbidden *and* public variants;
11 disguised sinks including `window.fetch`, `globalThis.fetch` and **`const cloudTransport = fetch`** (aliasing the
global into a friendly name); a simulated new unapproved `telemetryClient.js` that must fail the registry; five
sink-free sources that must NOT be falsely accused (a property named `fetch`, a function named `fetchClients`, a JSX
`src` prop); and approved cloud traffic (Supabase, Gemini, Pollinations, r.jina.ai, fonts, `data:`, `blob:`) still
allowed. `guardedFetch` is asserted to issue **no request at all** when it refuses.

**Three real defects were caught by these controls while writing them:** the sink detector missed a **global aliased
into a variable** and missed `import(x)` under Babel's `Import` callee shape (both fixed); and a `0.0.0.0/8` rule was
too wide — the URL parser normalizes the clock string `12:30` to host `0.0.0.12`, which would have broken the
business-data boundary, so only the unspecified address itself is rejected.

**ONE narrow, disclosed exemption.** The policy module is the classifier, so it necessarily NAMES `localhost` and the
RFC1918 octets. It is excluded from the *address text* scans, with a **compensating assertion** that it holds no URL
candidate of its own — and layer 2 independently proves it is the sole `fetch` holder. In the built bundle the only two
`localhost` occurrences are that classifier's own comparison: the string is now present **because it is blocked**.

**Evidence quality, stated explicitly**
- **Enforced at the real execution boundary:** every destination passed to `guardedFetch`/`assertPublicDestination` —
  including one assembled at runtime — is normalized and classified before a request is issued.
- **Enforced structurally (AST/registry):** no product module outside the 4 registered adapters may contain any network
  sink; only the policy module may call `fetch`; a new raw client wrapper cannot enter silently whatever it is named.
- **Only a source-level proxy now:** the destination-text scanner, explicitly DEMOTED to defence-in-depth. It is no
  longer presented as proof that assembled local destinations are impossible.
- **Still NOT provable statically:** a destination reached through a sink the platform adds later; egress from a
  third-party dependency's own code (Supabase's transport is trusted, not proven); DNS resolving a public name to a
  private address — a network-layer property this boundary cannot decide; and `element.src=` in the 3 registered image
  components, which is contained structurally but **not** runtime-validated.
- **Not verified:** no authenticated end-to-end hosted generation (no credentials in any of these sessions).

**Verification.** Suite **111 files / 3,117 passed / 0 skipped / 0 failed**. One production build green
(`index-Cb5pUh5g.js`, 610.27 kB — +2.2 kB, the policy module). Runtime smoke: 5-route navigation + 3s idle → 8 requests,
**0 local requests**, 0 console messages, the only non-origin request being the Google Fonts stylesheet.

**Status AT THAT ROUND: merged, not yet deployed** *(historical — the slice went LIVE in Production on 2026-07-27 as deployment `b3708cc2`; see the closure box in the Baseline)*. **P1 remains CLOSED / LIVE. PR #117 remains paused and untouched.**

### Round 12 — SCOPE CORRECTION: the network-egress framework is REMOVED (2026-07-27)

**Codex's review of `4382331` raised five valid findings against the newly introduced network-policy and structural
egress framework:** redirects can reach a private destination after the initial check; dynamic JSX resource attributes
bypass `guardedFetch`; destructured or reflective captures of network globals bypass the structural detector;
`0.0.0.0/8` is incompletely classified; CGNAT `100.64.0.0/10` is not rejected.

**None of the five was patched.** They were correct, and they were correct about a framework that should not have been
built. Rounds 10–11 drifted from the approved product decision — *remove all executable local-engine integrations from
ArtValue* — into an unapproved universal guarantee: **that arbitrary future JavaScript can never construct a
private-network request.** That is a different problem with a different solution shape, and a hand-built runtime shim
plus an AST scanner is not that solution. Each review round made the framework more elaborate without making the
product decision any more established than it already was.

**Removed in this round**

| Removed | Was |
| --- | --- |
| `src/lib/networkPolicy.js` | production module: `guardedFetch`, `assertPublicDestination`, `classifyDestination`, `isForbiddenHost` |
| `src/lib/__tests__/support/networkEgress.js` | AST structural sink detector |
| `src/lib/__tests__/networkEgressInvariant.test.js` | ADAPTER_REGISTRY invariant suite (47 controls) |

**Restored to their pre-framework cloud behaviour** (plain `fetch`, byte-for-byte as previously released):
`gemini.js` ×2 (the Google API call and `fetchSiteText`), `hostedImage.js` (`downloadImage`), `galleryStore.js`
(`srcToBlob`), `PosterEditor.jsx` (image load). **No cloud functionality was removed with the framework** — the diff is
purely the removal of the wrapper and its imports, verified line by line.

**The retirement scanner is kept, and re-scoped to what it can honestly prove.** `support/sourceScan.js` still parses
with `@babel/parser` and still normalizes candidates through the WHATWG `URL` parser — those were genuine fixes, and
normalization is what makes the narrow claim correct (`127.1`, `2130706433` and `0x7f000001` are all the same loopback
address). What is gone is the universal private-address classifier. It now classifies **loopback only** —
`localhost`/`*.localhost`, `127.0.0.0/8`, `[::1]` and the IPv4-mapped loopback form — plus the four retired engine
ports (`8188`, `8189`, `7860`, `11434`). That is exactly the surface the retired engines occupied. RFC1918, link-local,
unique-local, CGNAT and the unspecified range are **explicitly out of scope**, and controls now pin that in both
directions.

**Why the five findings are structurally obsolete rather than patched**

| Codex finding | Why it no longer applies |
| --- | --- |
| Redirects reach a private destination after the initial check | `guardedFetch` — the thing that performed an initial check — does not exist |
| Dynamic JSX resource attributes bypass `guardedFetch` | same: there is no boundary to bypass |
| Destructured / reflective captures bypass the structural detector | the structural detector and its registry are deleted |
| `0.0.0.0/8` incompletely classified | there is no address-class classifier; loopback is `127/8` and nothing else |
| CGNAT `100.64.0.0/10` not rejected | CGNAT is out of scope by design, and stated as such in the code and the controls |

**The claim this PR now makes — and only this claim**

- All known executable ComfyUI, Ollama, Fooocus and A1111 integrations were removed.
- Their consumers, routes, provider registrations, configuration, scripts and tooling were removed.
- The Studio and the product no longer expose or invoke those engines.
- Runtime smoke observed **zero** local-engine requests.
- Regression tests prevent the **specifically retired** modules, providers, routes and configuration from returning.

**What this PR explicitly does NOT claim.** It does not claim that arbitrary future JavaScript can never construct a
private-network request. That is a platform-level security-hardening concern — CSP `connect-src`, server-side egress
policy, or an approved network architecture — and it is recorded below as an unselected follow-up, not implemented here.

**Verification**

- Suite **110 files / 3,057 passed / 0 skipped / 0 failed**.
- Production build green — and the emitted artifact is **`index-C4frcMDi.js`**, byte-identical by content hash to the
  pre-framework artifact that was already smoke-verified earlier in this PR. The removal restored the previously
  verified bundle exactly; the framework's `index-Cb5pUh5g.js` is gone. `localhost` occurrences in the app bundle: **0**
  (they existed only because the deleted classifier named them).
- **Browser smoke re-run** on a build of this head: 8 retired route paths (`/adstudio`, `/workflow`, `/workflowstudio`,
  `/fooocus`, `/comfy`, `/comfyui`, `/ollama`, `/a1111`) all fail safe to the dashboard; `/studio` renders with **0**
  engine terms; Jake opens with **0** engine terms; with a spy over `fetch`/`XMLHttpRequest`/`WebSocket`/`EventSource`
  across the whole drive plus an 8s idle: **0 requests total, 0 local-engine requests, 0 console messages**.
- **Smoke limitation, stated:** the drive was unauthenticated (no credentials in this session), so authenticated
  Studio generation and Jake Gateway calls were not exercised — the same limitation recorded in earlier rounds.

**Unselected follow-up (NOT implemented, NOT in this PR): platform-level egress hardening.** If the product ever needs a
guarantee that no code path can reach a private address, the mechanism is a CSP `connect-src` allowlist plus server-side
egress policy — not application-level JavaScript. One concrete sub-item worth naming: `fetchSiteText` passes a
user-supplied URL to the third-party reader proxy, so the proxy can be asked to fetch a private address on the user's
behalf. That is pre-existing, released behaviour and is unchanged by this PR.

**Status AT THAT ROUND: merged, not yet deployed** *(historical — now LIVE in Production; see the closure box)*. **P1 remains CLOSED / LIVE. PR #117
remains paused and untouched.**

### Round 13 — the retirement MANIFEST (2 Codex P2s on `753ee2e`, both regression coverage only)

**Both findings were valid, and both had one root cause.** The retirement was enforced against two lists that were
**written, not derived** — so anything nobody happened to type stayed unprotected:

1. the removed-module set omitted implementations this PR actually deleted — `comfyProgress.js`, `geminiImage.js`,
   `productLock.js`, `ProductPlacer.jsx`, `local-review-prep.mjs`;
2. the retired-variable set omitted almost the entire removed ComfyUI configuration family — the PuLID, Kontext, Qwen,
   LTX, SVD and FLUX-tuning variables, plus `VITE_JAKE_CLOUD_MODEL` and `VITE_GEMINI_IMAGE_MODEL`.

**One authoritative source now exists: `src/lib/__tests__/support/retirementManifest.js`.** Its contents were **derived
mechanically from the PR diff and repository history, not recalled**, and the derivation commands are recorded in its
header so the next person re-derives rather than re-guesses:

- **modules** — `git diff --diff-filter=D --name-only 5d7506d1..HEAD`, plus the earlier retirement commits `1233034`,
  `705575a`, `95e70a1`; each entry carries the commit that removed it. **15 modules** (was 7).
- **environment** — production reads at the PR base **minus** production reads at HEAD, unioned with the `VITE_*`
  assignments this PR removed from `.env.example`, minus everything production still reads. **29 variables** (was 14).
- providers, routes and package-script terms moved into the same manifest, so the suite enumerates nothing of its own.

**What the suite now proves:** every manifest-listed file is absent; no production source imports **or recreates** a
manifest module under its retired path (with a control proving that predicate fires on `./comfyProgress.js` and stays
quiet on `./hostedImage.js`); no executable production source reads any manifest variable; no retired assignment remains
in `.env.example`; the manifest contains Codex's named omissions **and is strictly larger than them** (≥18 `VITE_COMFYUI_*`
entries, so the finding cannot be satisfied by adding five strings); and — the opposite failure direction — it lists
**none** of the seven variables production still legitimately reads.

**The pre-fix gate is demonstrated to have been permissive, not merely narrower.** Controls reconstruct both `753ee2e`
lists verbatim and show the old sets reporting **CLEAN** while `src/lib/comfyProgress.js` is back on disk and while
`import.meta.env.VITE_COMFYUI_PULID` is read — and the manifest rejecting both. A third control shows the gap was
systematic (≥8 modules and ≥14 variables missed), and a fourth shows **why terminology scanning cannot replace the
manifest**: the engine regex is word-anchored, so `VITE_COMFYUI_QWEN_VAE` never trips it. Terminology scanning stays as
**supporting** evidence only.

**Verification.** **Test-only change — no production source was touched, so no build and no browser smoke were run**
(the artifact remains the already-verified `index-C4frcMDi.js`). Focused proof suites: **2 files / 167 passed / 0
failed** (`localEngineRetirement.test.js` **115 passed**, up from 103; `studioHostedModeContainment.test.js` 52).
**Correction to Round 12's count:** the full-suite figure recorded there (110 files / 3,057) predates these 12 added
assertions and was not re-run in this round. *(Superseded by Round 14 below: the retirement total is now 119.)*

### Round 14 — the retirement invariants now cover the WHOLE repository (1 Codex P2 on `1c6987b`)

**Finding confirmed against the real code.** The retired-environment assertion — and the manifest's retired-path import
assertion with it — walked `src/` only, via a `runtimeFiles()` helper. The **Supabase Edge function and its shared
modules under `supabase/functions/` are production code that ships and executes**, so a retired variable read there was
never inspected. Tooling roots and repository-root modules were equally uncovered.

**Fix, within the existing structure and with no new walker.** The repository-wide collector `repoExecutables()` already
existed inside the repository-scan describe block; it is **hoisted to module scope** and paired with one
`productionExecutables()` = repository-wide executables **minus** tests. The `src/`-only helper is **deleted**, so every
retirement invariant — legacy env reads, manifest env reads, manifest retired-path imports — now shares one set by
construction and cannot drift apart again. Tests stay excluded in the one place, because a test may legitimately NAME a
retired module or variable in order to assert nothing reads it (this suite does exactly that).

**Result: no live offender.** Widening the scan to `supabase/` and the repository root found **0** retired variable
reads. This is a **coverage guard against a future regression, not the discovery of a live one** — stated plainly rather
than presented as a catch.

**Four controls pin the new coverage:** the production set demonstrably reaches `supabase/functions/`, `src/` and the
repository root and is strictly larger than the `src/`-only set; it still excludes every test path, including this file;
the pre-fix `src/`-only scope is shown **not to contain** a real Edge module that the corrected set does contain; and a
non-vacuity check confirms the scan reads real source (>100 files) and that the predicate fires on a planted
`import.meta.env.VITE_COMFYUI_QWEN_UNET`.

**Verification.** **Test-only change — no production source touched, so no build and no browser smoke were run**;
the artifact remains the already-verified `index-C4frcMDi.js`. Focused proof suites: **2 files / 171 passed / 0 failed**
(`localEngineRetirement.test.js` **119**, up from 115; `studioHostedModeContainment.test.js` 52). The full suite was not
re-run this round. No product behavior changed; the removed network-policy work is not reopened. **Nothing was
deployed at this round**; the slice was merged later, on 2026-07-27, and is **now LIVE in Production** as deployment
`b3708cc2` (see the closure box in the Baseline). PR #117 remains paused and untouched. *(Counts superseded by Round 15 below.)*

### Round 15 — TERMINAL walk fix + PROOF SCOPE FROZEN (1 Codex P2 on `d417d00`)

**The finding, and why it was the third of its kind.** The "repository-wide" collector still enumerated a FIXED set of
roots (`src`, `supabase`, `scripts`, plus root-level files), so an executable module placed in `public/` — or in any
future top-level directory — was silently omitted. This is the same class Codex raised on `1361a84` (root-level
`.mjs`/`.cjs`) and `1c6987b` (the `supabase/` tree). Each previous fix widened an **allowlist**, which is exactly why
the question kept returning.

**Independent review before acting.** Fable reviewed the actual diff, the Codex history and the real repository layout
read-only and found: the product implementation is complete, **no product-code blocker**, the P2 is technically valid
but protects only **hypothetical future file placement** (`docs/`, `posts/`, `public/`, `jakeos-doc/` contain **zero**
executable modules today, and a root-recursive walk therefore adds nothing to the present scan), and repository-root
recursion is the correct **terminal** fix for the class. Recorded honestly: this round is a **future-placement guard,
not the discovery of a live gap**.

**Fix — the allowlist is gone, not widened.** `repoExecutables()` is now `collectModules('.')`: recursion from the
repository root using the existing collector. **No new walker, no new scanner.** Exclusions live in one place
(`SKIP_DIRS` in `support/sourceScan.js`) and are limited to three kinds — dependencies (`node_modules`), build/generated
output (`dist`, `dist-profile`, `coverage`, `artifacts`, `.vite`) and operational state (`.git`, `.wrangler`, `.claude`).
**Ordinary content directories are deliberately NOT excluded**: `docs/`, `posts/`, `public/` and `jakeos-doc/` hold no
module today, and skipping them would rebuild the same allowlist inverted. Test exclusion stays centralized in
`productionExecutables()`.

**Controls, including the required demonstration.** A real `.mjs` module is **planted in `docs/`** — a directory no list
ever named — and proved to be (a) collected by the production set, (b) **absent** from the pre-fix fixed-root set, and
(c) caught by the retired-variable assertion (`VITE_COMFYUI_PULID`); it is removed again in a `finally`, with cleanup
asserted. Further controls prove the set reaches `src/`, `supabase/functions/` and the root `vite.config.js`; that tests
remain excluded (including this file and the manifest) **while the raw walk still sees them**, so the exclusion is
centralized rather than accidental; that `node_modules`, `dist`, `dist-profile`, `coverage`, `artifacts`, `.git`,
`.wrangler`, `.claude` and `.vite` are all absent from the walk **and** that the walk is not over-excluded (>200
modules); and non-vacuity of the scan itself.

**Verification.** **Test-only change — no production source touched, so no build and no browser smoke were run**; the
artifact remains the already-verified `index-C4frcMDi.js`. Focused proof: **2 files / 172 passed / 0 failed**
(`localEngineRetirement.test.js` **120**). **Full suite re-run once to replace the stale count: 110 files / 3,074 passed
/ 0 skipped / 0 failed** — this supersedes the Round 12 figure (110 / 3,057) that predated the manifest work.

**PROOF SCOPE IS NOW FROZEN.** Any further Codex finding is to be **classified, not auto-patched**: an actual current
product defect, an invalid release claim, or another hypothetical proof-completeness improvement — and reported for
Nathan's merge decision. *(Historical: merged 2026-07-27 and since deployed — Production `b3708cc2`.)* P1 remains CLOSED / LIVE. PR #117
remains paused and untouched.

**No product behavior changed. The removed network-policy work is not reopened.** **Nothing was deployed at this
round**; the slice was merged later, on 2026-07-27, as PR #118, and is **now LIVE in Production** as deployment
`b3708cc2`. P1 remains CLOSED / LIVE.
PR #117 remains paused and untouched.

## PR #118 Release Readiness — **SUPERSEDED / EXECUTED** (preflight, 2026-07-27)

> *Historical record of the pre-release preflight. Every gate below has since been executed: the docs PR merged, Edge deployed v36, the frontend built once and accepted on Preview, and Production deployed as `b3708cc2`. See the closure box in the Baseline for the live state.*

Read-only preflight. **Nothing was deployed, no secret or configuration was mutated, no build was run.** Four
independent approval gates follow; each needs its own explicit authorization.

### Merge record (verified live, not assumed)

| Item | Verified value |
| --- | --- |
| PR #118 | **MERGED** 2026-07-27T07:00:34Z |
| Merge commit | `9ecb8ebf023886f32496d3002944a3b092314cfe` |
| Parents | `5d7506d1` (pre-merge `main`) + **`cd651ead168f728aee50bd8c481df611b7b704f9`** (the approved head, as 2nd parent ✅) |
| Unresolved review threads | **0** |
| Codex verdict | clean on the **exact** approved head: *"Didn't find any major issues. 🚀 — Reviewed commit `cd651ead16`"*, 2026-07-27T06:27:54Z — **33 min before the merge**; no Codex review submitted afterwards |
| Rollback tag | `pre-local-engine-retirement` @ `5d7506d1`, pushed and retained |

**Correction of record:** the merge report claimed no final Codex verdict had returned before merging. It had. The
statement was wrong and is corrected here.

### Gate 2 — Edge `ai-gateway` redeploy (read-only preflight)

- **Exactly one deployed function requires redeployment: `ai-gateway`.** It is the **only** function that exists on the
  project (`supabase functions list` returns a single entry) and the only one the merge touches.
- **Live now:** `ai-gateway` **v35, status ACTIVE, `verify_jwt=true`**, entrypoint `supabase/functions/ai-gateway/index.ts`.
  Redeploying makes it **v36**.
- **What the merge changed, and is NOT live** — `supabase/functions/_shared/` only, 2 files, −58/+36 lines:
  - `aiGateway.js` — `comfyui` / `ollama` / `fooocus` / `a1111` removed from `AI_PROVIDERS`; the `LOCAL_PROVIDERS`
    partition **deleted**; `comfyui` and `ollama` entries removed from `AI_MODELS`; `ollama` removed from the tail of
    **11** `DEFAULT_PROVIDER_BY_ACTION` chains; the `localFirst` ordering branch and its `metadata.localFirst` field
    **removed** (`apiFirst` retained as an accepted no-op, so existing callers keep working); the local-provider
    zero-cost branch in `estimateCost` reduced to the `'none'` sentinel.
  - `aiGatewayContract.js` — **comment only**: `localFirst` dropped from the list of routing options the untrusted
    boundary discards. **No behavioural change** (the boundary already discarded *every* caller-supplied routing key).
- **Cloud action vocabulary is UNCHANGED** — all 20 action types remain, and every action still has a non-empty chain of
  API providers. `ai-gateway/index.ts` and every adapter under `ai-gateway/` are **untouched** by the merge.
- **Canonical ↔ shim synchronization: VERIFIED IN SYNC.** All three `src/lib` shims are pure re-exports of the canonical
  `supabase/functions/_shared/` modules (`export * from '../../supabase/functions/_shared/<name>.js';`), asserted by the
  retirement suite. The frontend and the Edge function therefore read one contract; **they should be released together**,
  and a frontend-only release would ship a bundle whose contract copy is ahead of the deployed Edge function.
- **No migration, schema, Auth, secret or configuration mutation is required.** `supabase migration list --linked`
  confirms **6/6 applied and matching, none pending**; the merge adds no migration and touches no `config.toml`,
  `wrangler.toml` or secret. `.env.example` and `package.json` changed (retired variables and scripts removed) — both are
  **repository documentation/tooling, not deployed configuration**.
- **Future commands (NOT executed):**
  ```
  supabase functions deploy ai-gateway --project-ref weciwurjfwmqihcyexzj
  supabase functions list --project-ref weciwurjfwmqihcyexzj      # expect version 36, ACTIVE, verify_jwt=true
  ```
  Post-deploy smoke: one authenticated `jake.chat` and one `studio.generate_image` call, confirming a normal reply, and
  a negative check that a request naming a local provider is not routable.
- **Rollback method:** redeploy the **previous** function source from the pre-merge tree
  (`git checkout pre-local-engine-retirement -- supabase/functions` → `supabase functions deploy ai-gateway`), which
  restores the v35 contract as a new version. **Currently live rollback target: v35 itself, which stays live until an
  approved deploy replaces it.**

### Gate 3/4 — frontend release (read-only preflight)

- **Merged application-code anchor: `753ee2ee0b8ed60a262b2bff9396eb1a603f85d1`.** Verified: the three commits after it
  on the branch — `1c6987b`, `d417d00`, `cd651ea` — touch **only** `src/lib/__tests__/**` and `docs/`, i.e. they are
  **test-and-documentation-only**. The release source is nevertheless the **merge commit `9ecb8eb`**.
- **The previously tested artifact is NOT eligible for promotion.** `dist/assets/index-C4frcMDi.js` on disk was built
  **before** the merge, from the `753ee2e`-era tree. Exact-artifact promotion requires an artifact built **from the
  released commit**, so a fresh build from `9ecb8eb` is mandatory. *(It is expected — not guaranteed — to reproduce the
  same content hash, since the intervening commits are test-only; if it does, that reproduction is itself corroborating
  evidence, and if it does not, the difference must be explained before promotion.)*
- **Required steps, in order:** (1) confirm clean tree at `9ecb8eb`; (2) **one** production build; (3) artifact scan —
  0 occurrences of `comfy`/`ComfyUI`/`ollama`/`fooocus`/`a1111`/`localhost`/`127.0.0.1`/`:8188`/`:11434`/`:7860` and of
  every retired `VITE_*` name in the emitted bundle; (4) deploy that `dist/` to a **Preview** branch; (5) verify the
  Preview serves the built bundle (12/12 files byte-identical); (6) authenticated acceptance; (7) promote the **same**
  `dist/` to Production unchanged (expect wrangler "Uploaded 0 files"); (8) served-bytes proof 12/12; (9) authenticated
  non-mutating Production smoke.
- **Authenticated acceptance checklist (the gap that has never been closed):** sign in as Account A → **Studio**: open
  `/studio`, run **one real cloud generation** end-to-end and confirm an image returns with a truthful in-product
  message on failure; confirm the brand palette applies; confirm gallery save/download work. **Jake**: open the
  assistant, send one real message and confirm a Gateway reply, and confirm Jake's capability text names **no** engine.
  Confirm Business Context loads and Growth lanes remain `BetaUnavailable`.
- **Retired-route and zero-local-engine-request checks:** navigate `/adstudio`, `/workflow`, `/workflowstudio`,
  `/fooocus`, `/comfy`, `/comfyui`, `/ollama`, `/a1111` — each must fail safe to the dashboard; with a spy over
  `fetch` / `XMLHttpRequest` / `WebSocket` / `EventSource` across the whole session plus an idle period, expect
  **0 requests to any loopback address or engine port**, 0 engine terms in rendered text, and 0 console errors.
- **Production smoke:** non-mutating, authenticated, on the canonical `artvalue-product.pages.dev` — correct bundle
  served, all assets HTTP 200, 0 console errors, 0 mutating requests, DB row counts unchanged before/after.
- **Frontend rollback — three distinct roles, never collapse them (verified LIVE against Cloudflare Pages, 2026-07-27):**
  1. **LIVE now:** **`247ef9ec-ad3a-4c15-8b16-25afa1c47f2b`** (source `03c23c2`) — the canonical
     `artvalue-product.pages.dev` serves its bundle **`index-BZ3B-0yd.js`**.
  2. **CURRENT rollback target, until this new release is promoted:** **`476830a2-f8ea-45dc-b0ce-a71876bc48dd`**
     (source `7e30199`, bundle `index-BrR14XIC.js`) — the immediately previous Production deployment. It is **NOT**
     live: its alias serves its own, different bundle.
  3. **AFTER the future Studio-retirement promotion:** the new deployment becomes live and **`247ef9ec`** becomes the
     rollback target; `476830a2` demotes to historical fallback.

  Restored via the Cloudflare Pages deployment history. Git-level rollback: `pre-local-engine-retirement` @ `5d7506d1`.

### Four approval gates — none authorized yet

| # | Gate | Target | Rollback target | Ready for approval |
| --- | --- | --- | --- | --- |
| 1 | Documentation PR merge | this tracker PR (1 file, docs-only) | revert the docs merge | **YES** |
| 2 | Edge `ai-gateway` deploy | v35 → v36 from `9ecb8eb` | redeploy the pre-merge `_shared/` (v35 contract) | **YES** — read-only preflight complete |
| 3 | Frontend build + Preview | one build from `9ecb8eb` → Preview deploy | none needed (Preview is isolated) | **YES** — build is the first executing step |
| 4 | Production deploy | promote the Preview-accepted `dist/` unchanged | **`476830a2`** until promotion; **`247ef9ec`** (the currently LIVE deployment) after it | **NO** — blocked on gate 3 evidence: Preview artifact + **authenticated Studio/Jake acceptance**, which has never been performed |

**Recommended order: 1 → 2 → 3 → 4.** Gates 2 and 3 should land close together because the frontend shims and the Edge
function share one contract module.
## Studio / Local-Engine UI Containment — **LIVE IN PRODUCTION** (2026-07-26)

**Status: RELEASED, then SUPERSEDED.** This slice went live as `247ef9ec` / `index-BZ3B-0yd.js` (source `03c23c2`).
It has since been **superseded in Production by the complete local-engine retirement** — deployment `b3708cc2` /
`index-C4frcMDi.js` (source `2c8b1df`), which also carries the corrective containment work recorded above.
`247ef9ec` is now the **current rollback target**.

- **Code:** PR [#114](https://github.com/natanMeT/ArtValue20/pull/114) merged as `29cccddda52e1c546b4ae46be052285ec24d2116`; docs PR [#115](https://github.com/natanMeT/ArtValue20/pull/115) merged as `03c23c23568905cb42e7f154014dd2ddc32bb58f`. Codex round 2 clean (reviewed commit `bb8e955ef2`), 0 unresolved threads.
- **Build: exactly ONE**, from `main` @ `03c23c2`. The same `dist/` was deployed to Preview and then promoted to Production **without rebuilding** — re-hashed immediately before promotion and confirmed identical, and wrangler reported **"Uploaded 0 files (12 already uploaded)"**.
- **Artifact scan:** local-engine gate **provably closed** (`VITE_ENABLE_LOCAL_ENGINES` absent from the baked env ⇒ `resolveLocalEngineUrl()` returns `""` unconditionally). **0 occurrences** of `ComfyUI` / `Fooocus` / `PuLID` / `start_engine` / `Start ArtValue Image Engine` and every removed Hebrew label. Residual `LTX` / `Qwen` / `SDXL` / `Kontext` / `Ollama` hits were classified as graph `class_type` names, model filename constants, non-rendered preset `qualityNotes`, or the Jake error-matcher regex. **⚠️ THAT CLASSIFICATION WAS PARTLY FALSE:** at least one `Qwen` occurrence (`Qwen-Image-Edit אינו מותקן במנוע`) was **user-reachable** through a hosted Jake→Studio hand-off — see the correction section above. String presence in a bundle is not proof of rendering, and its absence is not proof of correct routing.
- **Preview `ec239e3b`** (branch `studio-containment-preview-03c23c2`): 12/12 served files byte-identical; **authenticated QA-account acceptance PASS**.
- **Production `247ef9ec`:** 12/12 served files byte-identical on the canonical URL; **authenticated non-mutating Account A smoke PASS**.
- **Rollback — the CURRENT target is `476830a2` / `index-BrR14XIC.js`** (source `7e30199`, the immediately previous Production deployment), retained and verified healthy post-deploy. The older `e63198b7` (S0F.1) is a **historical fallback only**, never the current target.
- **No migration. Edge `ai-gateway` v35 unchanged and not redeployed. No schema, Auth, Gateway-contract or data change.**

### Authenticated Production acceptance — Account A, non-mutating (PASS)
Every item below was measured in the browser against the released bundle, with a request spy plus a mutation guard:

| Check | Result |
|---|---|
| Requests on opening `/studio` | **0 of any kind** (and 0 to any local address) |
| Idle 17s on `/studio` (retired poll was 15s) | **0** requests |
| Local-address requests, whole smoke | **0** |
| Engine-status panel / workflow map / model picker | **absent** |
| Engine terms rendered (18 checked) | **0** |
| Modes offered | exactly **2** — `טקסט → תמונה`, `מוצר מדויק` (correct: every other mode requires a local engine) |
| HD toggle | **hidden** (previously rendered in hosted builds while doing nothing) |
| Retained surfaces | business presets, quick ideas, aspect ratio, prompt enhancement, Mockup Studio, generate CTA — all present |
| S0F.1 brand palette (Account A) | **renders** — 5 swatches, real approved colours |
| `#/workflow`, `#/fooocus` | both land on `#/studio`, no engine screen, no engine terms |
| `/adstudio` | **BetaUnavailable** |
| Growth — all 5 routes | **contained** |
| Jake | opens with **0** Gateway calls; one read-only question → **1** call; **1,174-character reply with 0 engine names** |
| Console errors, whole smoke | **0** |
| **Mutating requests (POST/PUT/PATCH/DELETE to data endpoints)** | **0 — nothing created, edited, saved, generated, confirmed or deleted** |

The Jake result is the strongest single piece of evidence: that question pulls `systemCapabilities()` — and therefore the workflow catalog — into his system prompt, which is exactly where engine names used to leak. The reply is clean at runtime, not merely in source.

### Approved product boundary
Remove or contain user-facing local-engine / provider / tool complexity from the Studio experience for **every** user
(authenticated cloud *and* local/demo), while preserving the business-facing creative product.
**This is cleanup and containment — NOT provider replacement. No new managed image/video provider is introduced.**

### Inventory actually found (reachability proven, not keyword-guessed)
- `/workflow` and `/fooocus` were **already** retired in R4.1 — they redirect to `/studio`. Nothing further was needed.
- **`EngineStatus`** (ImageStudio) — a local-GPU availability + setup panel ("מנוע התמונות כבוי", "איך מפעילים",
  the desktop shortcut and the `start_engine.bat` path) driven by a **15-second `checkLocalEngine()` poll**.
- **Mount-time local-engine discovery** — opening the Studio fired `listImageModels()`
  (`/object_info/CheckpointLoaderSimple`), `hasPulidNode()` and `hasQwenEditNode()`.
- **`CreativeWorkflowMap`** ("מפת ה־Workflows") — a workflow-management surface whose cards carried
  **ComfyUI / Fooocus / Mixed** engine badges.
- **Checkpoint picker** — "מודל (N מקומיים)" FLUX/SDXL chips whose tooltips were `.safetensors` filenames.
- **Engine names in copy** — the result badge ("מקומי · FLUX.1", "מקומי · עריכה (Kontext)", "Pollinations · Flux"),
  the job card's ComfyUI **graph node** (`class_type`, e.g. `KSampler`), the "מנוע עקביות" PuLID/Kontext toggle,
  mode help text (LTX / SDXL / Qwen / PuLID / Kontext), the "מקומי על ה-GPU שלך" header and preset recipe labels.
- **AdStudio** — an "engine off — start Ollama (aya-expanse:8b)" warning bar.
- **Jake** — "צור פוסטר עם ComfyUI", "נוצר מקומית · ComfyUI", and local-engine start-it-yourself error copy.
- **Thrown generation errors** naming ComfyUI / Kontext / Stable Diffusion, surfaced in the Studio error banner.
- **Leak path found by tracing, not by grep:** live workflow-catalog **descriptions/tags** (PuLID, Kontext, Qwen, LTX,
  SDXL/FLUX, LoRA) flow into `systemCapabilities()` → **Jake's system prompt**, so the assistant could speak engine
  names back to the user. The catalog also advertised the workflow-map screen as a capability.

### What this PR removes / contains
Deletes `CreativeWorkflowMap.jsx`, the `EngineStatus` panel and its poll, the checkpoint picker, the three mount-time
probes, the PuLID/Kontext engine toggle and the job card's engine-node readout. Replaces the two probe-derived
capability flags with configuration-derived constants (`hasPulidModel`, `hasQwenEdit`) that mirror the existing
`hasKontextModel` pattern. Rewrites every user-visible engine string across ImageStudio, AdStudio, Jake, the preset
pack, the workflow catalog and the thrown generation errors. Gates the HD toggle on `hasLocalComfy` (it previously
rendered in hosted builds where it did nothing).

### What business-facing Studio functionality REMAINS
All nine creative modes (text→image, smart edit, area edit, image→video, before/after, product presenter, Product Lock,
character set, model album), business preset recipes, quick ideas, aspect ratio, brand-palette consumption (S0F.1),
gallery + filters + montage + batch animate, Poster Editor, Mockup Studio, Product Placer, the Jake→Studio hand-off and
the protected AI-Gateway prompt enhancement. `/studio` and `/adstudio` still render; `/workflow` and `/fooocus` still
redirect to `/studio`.

### Deliberately RETAINED (narrower cleanup than expected — with the reason)
- **`src/data/creativeWorkflows.js` (the catalog DATA) was NOT deleted.** Its user-facing renderer was, but
  `studioHandoff.js`, `jakeDecisionEngine.js` and `businessBrain.js` all consume `liveWorkflows()` / `CREATIVE_WORKFLOWS`.
  Deleting it would have broken Jake. Only the user-reachable text inside it was cleaned; the internal `engine` field stays.
- **`src/lib/localEngines.js` stays** — it is the production safety gate, not a UI surface.
- **Local-engine implementation in `geminiImage.js` / `comfyProgress.js` / `comfyPoster.js` stays.** It is still the
  local development path and still hosts the Gateway lane. It is unreachable in any hosted build (gate closed).
- **Non-rendered internals stay:** ComfyUI graph `class_type` names, model filename constants, env defaults, and the
  Jake error-matcher regex that recognises legacy local-engine error text without displaying any engine name.

### Verification performed
- **Runtime (real behaviour, with a positive control):** dev server in local/demo mode with the local-engine gate
  **OPEN** (`localEngineUrl` = `http://127.0.0.1:8188`). A `window.fetch` spy recorded, on opening `/studio`:
  **baseline `main` → 4 local-engine requests** (`/system_stats` ×2, `/object_info/CheckpointLoaderSimple` ×2);
  **this branch → 0**. Idle for 18s on `/studio` (the old poll was 15s) → **0** further requests.
  `#/workflow` and `#/fooocus` both landed on `#/studio` with no engine screen. Live DOM check: **0** of 18 engine terms
  present, all 9 mode tiles and every retained surface rendering, **0** console errors across five route transitions.
- **This runtime smoke caught a real regression that 3,094 source-level tests did not:** moving the capability flags from
  `useState` to plain `const` placed them *after* the `modes` list that reads them → a temporal-dead-zone
  `ReferenceError` that blanked the entire Studio. Fixed, and the declaration order is now pinned by a test.
- **Tests (first head):** 121 files / 3,098 passed, 1 skipped, 0 failed. **After the fail-closed correction the FOCUSED affected surface was run** — every test file touching `geminiImage` / the changed flags / the Studio pages: **27 files / 1,608 passed / 0 failed** — plus a green production build. The full suite was last green at the previous head; it was not rerun, because the changed exports have exactly two production consumers (`geminiImage.js`, `ImageStudio.jsx`) and every test file importing them was included. New suite
  `src/pages/__tests__/studioLocalEngineContainment.test.js` (30 cases). Three pre-existing assertions were updated to
  the new, stronger guarantees (the result badge now names no engine on *any* lane, not just the Gateway lane).
- **Build:** green. **Built-artifact scan:** `ComfyUI`, `Fooocus`, `PuLID`, `start_engine`, and every removed Hebrew
  label are **0 occurrences**. Remaining `Qwen` / `LTX` / `Kontext` / `SDXL` / `Ollama` hits were each opened and confirmed
  to be graph node names, model filename constants, non-rendered preset `qualityNotes`, or the error-matcher regex.
- **Artifact-level proof the gate is closed in a production build:** `VITE_ENABLE_LOCAL_ENGINES` is absent from the baked
  env object, so `resolveLocalEngineUrl()` returns `''` unconditionally and no local URL can be requested — regardless of
  the `127.0.0.1` literals Vite bakes in from the build machine's env.

### Unchanged by this slice
AI Gateway contracts and cloud routing, Edge `ai-gateway` **v35** (not redeployed), Auth, database schema, migrations
(none added), Production deployment, Growth containment (still fully `BetaUnavailable`), and all user data — nothing
migrated, deleted or rewritten. No new provider.

### Review findings (Codex) — round 1 (2 x P2), plus a follow-up correction
Codex reviewed the first commit and raised **2 P2 findings**. Both were verified against the code before acting.

**Finding 1 — optional stacks were no longer gated by anything.** `COMFY_PULID_MODEL` / `QWEN_UNET` / `QWEN_CLIP` /
`QWEN_VAE` all carry a non-empty `||` default, so `hasPulidModel` / `hasQwenEdit` collapsed to `Boolean(COMFY_URL)`: a rig
with ComfyUI but without those optional custom nodes would have shown the album/presenter modes and always routed
character packs through PuLID instead of the Kontext fallback.
- **First attempt (`b807fa1`) was INSUFFICIENT and is superseded.** It added an opt-*out*
  (`VITE_COMFYUI_PULID=0`), which still treated **missing/undefined configuration as available** — i.e. fail **open**.
  Nathan's review caught that it did not satisfy the capability invariant.
- **Corrected (`ff5a42e`): optional capabilities now FAIL CLOSED.** A capability is unavailable unless **positively
  declared** (`1`/`true`/`on`/`yes`); missing, undefined, empty, unknown or malformed configuration => **unavailable**.
  The Kontext fallback is preserved rather than routed into, and the Studio still performs no discovery request on open
  or while idle. **Stated limitation:** this is a positive *declaration*, not runtime discovery — it cannot detect a stack
  that is installed but undeclared (that rig declares it once, in `.env`), which is the safe direction to be wrong in.

**Finding 2 — FLUX presets silently fell back to the SDXL graph.** Dropping `arch` with the picker made `useFlux` false
for every local render. Fixed by deriving the family from the applied **preset's own metadata** via the exported pure
`presetModelFamily()`; no checkpoint filename returns and the Gateway payload is unchanged.

### Evidence for the correction — execution-level, with negative controls
`src/pages/__tests__/studioCapabilityAndRouting.test.js` (15 cases) proves behaviour, not source text:
- **Capability matrix (executed):** engine configured + undeclared -> **unavailable**; positively declared
  (`1`/`true`/`on`/`yes`) -> available; explicitly `0`/`false`/`off`/`no` -> unavailable; malformed
  (`maybe`, `2`, whitespace, `undefined`) -> unavailable; no engine -> unavailable even if declared.
- **Dependent modes + fallback (executed):** undeclared stacks do not expose album/presenter; character series stays
  available via Kontext and `usePulid` is false, so work is never routed into an absent stack.
- **FLUX routing (executed through the REAL call seam):** `presetModelFamily(preset)` -> `generateImage()` -> `comfyUI()`
  -> `comfySubmit()` -> `fetch('/prompt')`, with the submitted **graph** inspected. A FLUX business preset produces a
  graph containing `FluxGuidance` + `EmptySD3LatentImage`; a non-FLUX preset and "no preset" produce the SDXL graph
  (`EmptyLatentImage`, no `FluxGuidance`). Family is read from graph structure, so no label is trusted.
- **Negative controls run (both bite):** forcing `presetModelFamily` to return `undefined` fails the FLUX execution test;
  restoring the fail-open predicate fails 6 capability tests. A green result here is therefore meaningful.
- **Browser re-verification at the corrected head (`bb8e955`), engine gate OPEN (`127.0.0.1:8188`) — both directions:**
  with the stacks **undeclared**, the Studio offered **7** modes — album and presenter correctly absent — while character
  series stayed available (Kontext fallback preserved) and `hasPulidModel`/`hasQwenEdit` read `false` despite
  `hasLocalComfy === true`; with the stacks **declared** (`VITE_COMFYUI_PULID=1`, `VITE_COMFYUI_QWEN_EDIT=1`) the same
  build offered **9** modes with album and presenter present. **Both runs: 0 local-engine fetches on open, 0 console
  errors, 0 engine terms in the DOM**, and 0 further requests after idling 18s on `/studio`.

### Review outcome — round 2: CLEAN
Codex re-reviewed the corrected head and reported **"Didn't find any major issues"** — **reviewed commit `bb8e955ef2`**. Both original P2 threads were answered with the corrected evidence and are now **RESOLVED; 0 unresolved threads remain**.

The only commit after the reviewed one (`c6871ab`) is **documentation-only**: 6 added lines in this file recording the browser re-verification, 0 deletions, no code. Independently confirmed — the `src/` tree hash is **identical** at both commits (`255bd4c7edb0aa2fbd181a1b22cb528fa6de9aee`), and a diff over `src/ .env.example supabase/ package.json vite.config.js index.html` between them is **empty**. The technical head is therefore the reviewed head; tests and build were not rerun because no code changed.

### Release sequence — ALL STAGES COMPLETED
1. ✅ Codex review clean (`bb8e955ef2`), 0 unresolved threads.
2. ✅ Merge to `main` (PR #114 → `29cccdd`; docs PR #115 → `03c23c2`).
3. ✅ One build from `03c23c2` + artifact scan.
4. ✅ Preview `ec239e3b` + authenticated QA acceptance.
5. ✅ Production `247ef9ec` by reusing the accepted artifact; **current rollback target `476830a2`** retained (`e63198b7` remains a historical fallback only).
6. ✅ Authenticated non-mutating Account A Production smoke.
7. ✅ Documentation closure — this section.

## P1 Atomic Quote Persistence — **CLOSED / LIVE IN PRODUCTION** (2026-07-26)

> **Truthful status: the release is COMPLETE and LIVE.** Five PRs merged, migration `20260726120000` **applied and verified**, `public.save_quote_atomic` **live**, and the accepted artifact is **deployed to Production as `476830a2-f8ea-45dc-b0ce-a71876bc48dd` / `index-BrR14XIC.js`** (all 12 files byte-match the Preview-accepted artifact). Its rollback target at the time, `e63198b7`, is retained and reachable — **now a historical fallback only; the current rollback target is `476830a2`**. **Atomicity is established**, by the live failure-injection acceptance (13/13), the authorization/RLS evidence, the Preview UI acceptance on the same artifact and exact-artifact promotion. A later authenticated Production smoke (2026-07-26, alongside the Studio release) additionally confirmed Quotes/Finance render and authenticated reads are healthy. **One OPTIONAL additional Production-UI validation remains outstanding — quote-row visibility and a Production-UI RPC re-exercise — which is a validation gap only and does NOT reopen this release** (detailed below).

### Production release (LIVE)
- **Deployment `476830a2-f8ea-45dc-b0ce-a71876bc48dd`** — Environment Production, branch `main`, source `7e30199`, entry bundle **`index-BrR14XIC.js`**; canonical **https://artvalue-product.pages.dev**.
- **Deployed by reusing the exact Preview-accepted `dist/` — NOT rebuilt.** wrangler reported **"Uploaded 0 files (12 already uploaded)"**, i.e. Cloudflare recognised every file as already present, which is itself evidence that the bytes are identical to the accepted Preview artifact.
- **Served-bytes proof (not a page-load proxy):** all **12/12** files fetched from the canonical Production URL are **byte-identical** (`cmp`) to the local accepted `dist/`, including the entry bundle `index-BrR14XIC.js` (SHA256 `ec4a865a12c4a90f81063e3df366610f26bc45c3c37e9ad1792e24df29c64745`, 819,230 bytes) and `index.html` (SHA256 `205080b2…`, 1,285 bytes). Every asset returned HTTP 200.
- **Rollback target AT THE TIME OF THE P1 RELEASE (historical):** **`e63198b7-ebd6-4b7d-9872-c9bcd1a5ab0a`** (source `983f4899`, bundle `index-lvfFFwEn.js`) — HTTP 200, still serving its own bundle. **Superseded:** since the Studio containment release the **current** rollback target is **`476830a2`**; `e63198b7` is now a **historical fallback only**.
- **Edge unchanged:** `ai-gateway` **v35, ACTIVE, `verify_jwt=true`** (unchanged across the entire release; no Gateway/contract change in any of the five PRs).
- **Database unchanged by the deployment** (read-only verified after deploy): 6 migrations, `save_quote_atomic` present, 2 canonical policies, **quotes 0 / quote_items 0**, orphan_items 0, quotes_without_items 0; Nathan's account 3 clients / 0 quotes; outreach_leads 24, business_profile 3, tasks 0, transactions 0. **No QA or business record was created by the deployment or its verification.**

### Applied migration
- **`20260726120000_atomic_quote_persistence.sql` — APPLIED 2026-07-26** (as a controlled retry; the first authorized attempt failed safely, see below). Migration list now 6/6 local=remote; `db push --dry-run` reports **"Remote database is up to date"**.
- **Verified read-only:** exactly one function `public.save_quote_atomic(p_mode text, p_quote jsonb, p_items jsonb)` → `returns void`, `prosecdef=false` (**SECURITY INVOKER**), `proconfig = search_path=""`, `p_items` defaults to `NULL::jsonb`, plpgsql, **no conflicting overload**. Grants: **`authenticated` EXECUTE; `anon` and PUBLIC absent**; `service_role` also holds EXECUTE via Supabase's project-level default privileges — server-side only, never shipped to a browser, so **no client-facing grant beyond `authenticated`**. Unchanged: RLS on both tables, exactly two canonical own-row policies (`USING`/`WITH CHECK` = `auth.uid() = user_id`), PK `quotes(id)` / `quote_items(id)`, FK `quote_id → quotes(id) ON DELETE CASCADE`, trigger `trg_quotes_updated → set_updated_at`, column counts unchanged.

### Acceptance evidence
- **Failure-injection acceptance — 13/13 PASSED** (live database, dedicated `QA_ATOMIC_` records, all cleaned up). The fault was deliberately chosen to fail **after** the parent row is inserted (`position: 1.5` passes the function's `jsonb_typeof='number'` validation, then fails on `(elem->>'position')::integer` during the item INSERT). Results: **create failure → quote 0 / items 0 (NO PARTIAL QUOTE)**; **failed update replacement → original 2 items intact, parent status unchanged, 0 replacement rows leaked**; valid create/update controls passed; omitted date → `current_date`; missing quote → `P0002`; **foreign-owner update → `P0002` and the row invisible under RLS**.
- **Authorization over real HTTP:** anon `POST /rest/v1/rpc/save_quote_atomic` → **`42501 permission denied`, HTTP 401**.
- **Preview UI acceptance** (deployment `c999988e`, QA account, same artifact): Network filtered to `save_quote_atomic` showed **exactly 2 requests for 2 saves** (update 269 ms, create 278 ms), both **HTTP 204 No Content** (matching `returns void`); toasts read **"ההצעה עודכנה · נשמר במערכת"** and **"הצעת מחיר נוצרה · נשמר במערכת"** — never "נשמר מקומית"; persisted rows matched the on-screen total to the shekel; deletes correctly use the plain delete path. All QA records were then deleted and the database verified back to baseline.
- **Artifact scan:** no source maps, no `.env`, no `sb_secret` / `service_role` / service-JWT in the bundle; only the public publishable key and project URL (by design). Positive controls in the shipped bundle: `save_quote_atomic` present, **`writeItems` 0 occurrences**.
- **Test suite at the released commit:** 120 files / **3065 passed / 1 skipped / 0 failed**; production build green.

### Evidence quality — real item vs proxy, and what was NOT verified
- **Real deployed item:** the byte-level `cmp` of all 12 files fetched from the canonical Production URL against the accepted `dist/`, plus wrangler's "0 files uploaded". These prove Production serves exactly the accepted artifact.
- **Proxy only:** a successful page load, HTTP 200s, and screenshots. These were **not** treated as artifact identity.
- **Important distinction preserved:** the filtered DevTools Network screenshots during Preview acceptance showed the presence of exactly two `save_quote_atomic` calls, but a *filtered* view **cannot independently prove the absence of direct `quotes`/`quote_items` writes**. That absence is established by **artifact/code evidence** — `writeItems` has 0 occurrences in the shipped bundle and `api.js` issues exactly one RPC per save (covered by unit tests) — not by the screenshots.
- **Optional additional Production-UI validation — outstanding, and it does NOT reopen or weaken this release.** An authenticated Production smoke was run 2026-07-26 alongside the Studio containment release, with a live Account A session on the released bundle `index-BZ3B-0yd.js`; `/quotes` and `/finance` were inspected read-only.
  - **Proven by that smoke:** both pages **render and hydrate** on the released bundle with **no error banner, 0 console errors and 0 mutating requests**, and **authenticated Production reads are healthy** in general (the Clients page showed Account A's **3 real clients**).
  - **Not observed, for two benign reasons:** Account A held **0 quotes and 0 transactions**, so *existing quote-row visibility* had nothing to display; and **no Production create/edit was authorized**, so `save_quote_atomic` was **not re-exercised through the Production UI**.
  - **Classification: an optional additional Production-UI validation gap — NOT an open release item.** P1's **database atomicity was already established** by the live failure-injection acceptance (**13/13**), the authorization/RLS evidence (anon RPC → `42501` / HTTP 401; foreign-owner update → `P0002` and invisible under RLS), the **Preview UI acceptance on the same artifact** (exactly one `save_quote_atomic` 204 per save), and **exact-artifact promotion** to Production. The gap therefore **does not reopen, invalidate or weaken the closed P1 release**. Close it opportunistically — an authorized real quote save on Production, or inspecting an account that already holds quote rows.
- **Deviation from expected release state:** none. One measurement anomaly occurred and was resolved: an initial byte-comparison reported a mismatch on the entry bundle and `index.html`. The downloaded copies were themselves faulty — the file meant to hold the 819,230-byte entry bundle contained only 1,285 bytes, and an earlier download had produced 0 bytes — so the comparison was invalid rather than the artifact. Re-running the download and comparison produced **12/12 byte-match**. The underlying cause of the faulty downloads was not isolated and is not claimed.

### Merged code
- **PR [#108](https://github.com/natanMeT/ArtValue20/pull/108) — MERGED** (main `716da1b`). Truthful cloud-save behavior for **Quotes** and **Finance**: the page-level save handlers now await the settled `{ ok }` result instead of toasting success unconditionally, so a failed cloud write can no longer show a success message. Adds **in-flight duplicate-submit guards** (synchronous ref latch + visible `saving` state) so a rapid second click cannot dispatch a second id-less `ADD_*` and mint duplicate rows. Contains the **quote-to-project conversion** in authenticated cloud mode, where `ADD_PROJECT` is blocked by the Memory-Only firewall (it previously toasted success and navigated to a project that was never created). **This behaviour is now LIVE in Production** (deployment `476830a2` / `index-BrR14XIC.js`), and the truthful `saveLabel(mode)` wording was confirmed on Preview with the byte-identical artifact.
- **PR [#109](https://github.com/natanMeT/ArtValue20/pull/109) — MERGED** (main `f7ff9fa`). Atomic quote persistence through **one `SECURITY INVOKER` RPC**, `public.save_quote_atomic(p_mode text, p_quote jsonb, p_items jsonb)`: the quote parent row and the complete `quote_items` snapshot are written inside a single database transaction, so they succeed together or roll back together. Ownership is derived from `auth.uid()` only (a client-supplied `user_id` is never read), RLS stays enabled and authoritative, and `EXECUTE` is granted to `authenticated` only. `src/lib/api.js` `createQuote`/`updateQuote` each issue exactly one RPC call; the old sequential parent-then-`writeItems()` path is removed with no fallback.
- **PR [#110](https://github.com/natanMeT/ArtValue20/pull/110) — MERGED** (main `2e1b137`). **Live/canonical quote-schema compatibility correction.** A read-only audit found two legitimate differences between the live `quotes` table (which predates canonical `schema.sql`) and the canonical shape: `quotes.date` is `date NOT NULL DEFAULT CURRENT_DATE` live vs nullable canonically, and `quotes.created_at` is nullable live vs `NOT NULL` canonically. **No table was altered.** The preflight now pins those two columns by exact TYPE while accepting either nullability (documented as deliberate variants; `created_at` still requires a `now()` default), and the create INSERT uses a **robust `CURRENT_DATE` fallback** — `coalesce((p_quote->>'date')::date, current_date)` — so an omitted or JSON-null date is safe under the live `NOT NULL` while an invalid date still raises and rolls back.

### First authorized migration attempt — **FAILED SAFELY** (historical; superseded by the successful retry below)
- The authorized `supabase db push --linked` **aborted inside the migration's initial fail-loud catalog preflight block** — a block whose *operations* are read-only (catalog `SELECT`s plus `RAISE`), but which ran **as part of the full migration transaction, not inside an explicitly declared READ ONLY transaction** — with PostgreSQL **`ERROR: 42883: operator does not exist: name[] = text[]`**. `pg_attribute.attname` is `name`, so `array_agg(a.attname …)` produced `name[]`, compared against `array['id']` which is `text[]`; both primary-key catalog checks hit it.
- **The transaction aborted before creating or altering anything.** Verified read-only afterwards: the migration **remained pending**, `public.save_quote_atomic` **remained absent**, **no migration-history entry** was created (`supabase_migrations` unchanged at 5 rows), and **no business-data mutation** occurred (`quotes` 0 rows, `quote_items` 0 rows, policies/triggers unchanged). This is the fail-closed design behaving correctly.

### PR [#111](https://github.com/natanMeT/ArtValue20/pull/111) — MERGED (main `a098b0b`), corrected that failure
- Exact correction, applied to **both** PK catalog checks (`public.quotes` and `public.quote_items`):
  ```sql
  array_agg(a.attname::text order by k.ord) = array['id']::text[]
  ```
  Both sides are now explicitly compatible `text[]`; no guard was weakened, removed or restructured.
- **Regression coverage added** pinning the type-compatibility syntax itself (not the error text): exactly two `a.attname::text` aggregates, exactly two `array['id']::text[]` comparisons, and rejection of the bare incompatible form. The new assertions were validated to **fail** against the pre-fix file and **pass** against the corrected one.
- **The complete corrected preflight passed against the live catalogs**: the whole `do $preflight$ … $preflight$;` block was mechanically extracted from the corrected migration and executed inside **one continuous READ ONLY transaction** — `BEGIN TRANSACTION READ ONLY`, `SHOW transaction_read_only` returned **`on`**, the DO block compiled and completed without raising (confirmed by a marker `SELECT` after it), and the transaction ended with **`ROLLBACK`**. A negative control running the pre-fix block through the identical harness still reproduced `42883`. Remote state was re-verified unchanged afterwards.
- At that point `supabase db push --dry-run --linked` proposed exactly the one then-pending atomic migration and nothing else. *(It has since been applied; the dry-run now reports "Remote database is up to date".)*

### Release sequence — ALL STAGES COMPLETED (historical record)

Every stage below is **done**; nothing here is an outstanding instruction.

1. ✅ Nathan's explicit approval obtained at each gate.
2. ✅ **Migration applied** — controlled **retry** of exactly `20260726120000_atomic_quote_persistence.sql`. (The *first* authorized attempt had failed safely in the preflight; PR #111 corrected the cause. That incident is recorded above as history, not as pending work.)
3. ✅ **Remote read-only function/security verification** — signature, `SECURITY INVOKER`, empty `search_path`, `p_items` default, grants, RLS/policies/PK/FK/trigger all confirmed.
4. ✅ **Built exactly once** from merged `main` (`7e30199`).
5. ✅ **Artifact safety scan** — clean.
6. ✅ **Preview deployment** `c999988e` + UI acceptance.
7. ✅ **Transactional failure-injection acceptance — 13/13.**
8. ✅ **Production deployment** of the accepted artifact — `476830a2-f8ea-45dc-b0ce-a71876bc48dd`.
9. ⚠️ **Production smoke — partial.** Unauthenticated load verified clean (correct bundle, all assets 200, zero console errors, zero Supabase requests). The **authenticated** Account A smoke was **NOT performed** — no live session existed on the Production origin and signing in was out of scope. See the limitation recorded above; carried forward as an open item.
10. ✅ **Documentation closure** — this section.

## Next action
**No slice is in flight.** S0A + S0B + S0C + S0D + S0E + S0F.1 + P1 Atomic Quote Persistence + **Studio / Local-Engine
UI Containment are all CLOSED / LIVE.**

> ⚠️ **But `main` carries merged, undeployed work.** The **complete local-engine retirement** (PR
> [#118](https://github.com/natanMeT/ArtValue20/pull/118), merged 2026-07-27 as `9ecb8eb`) is on `main` and is
> **running nowhere** — see the PR #118 box in the Baseline and the Release Readiness section. **Merged is not live.**

Production is **`247ef9ec-ad3a-4c15-8b16-25afa1c47f2b` / `index-BZ3B-0yd.js`** (source `03c23c2`), promoted from the
accepted Preview artifact without rebuilding, with **12/12 byte-identical served files** and an **authenticated
non-mutating Account A smoke PASS**. **Current rollback target: `476830a2` / `index-BrR14XIC.js`** (source `7e30199`)
— retained and verified healthy; `e63198b7` (S0F.1) is a **historical fallback only**, never the current target.
No migration; Edge `ai-gateway` **v35** unchanged.

**CLOSED / LIVE:** the **Studio Hosted Mode Containment Correction** and the complete local-engine retirement (see their sections) — merged 2026-07-27 as PR #118 and **deployed to Production as `b3708cc2`**. PR #117 (roadmaps/exports) is **paused** pending its own review.

**Carried-forward notes — neither is an open release item and neither blocks anything:**
1. **P1 — an OPTIONAL additional Production-UI validation.** **P1 Atomic Quote Persistence is CLOSED / LIVE**; its
   atomicity is established by the 13/13 failure-injection acceptance, the authorization/RLS evidence, the Preview UI
   acceptance on the same artifact and exact-artifact promotion. The authenticated Production smoke additionally proved
   Quotes/Finance render and authenticated reads are healthy. Account A simply held 0 quote and 0 transaction rows, and
   no Production create/edit was authorized, so quote-row visibility and a Production-UI RPC re-exercise were not
   observed. Close opportunistically; **nothing is reopened or blocked.**
2. **Jake advertises creative capabilities the cloud path cannot run** — a truthfulness follow-up recorded under open
   follow-ups. Pre-existing, not a regression, not selected.

The versioned roadmaps (Business OS v0.9 / AI Gateway v5.5) and the `.docx` exports are **NOT updated by this PR** — the
canonical roadmap advance is a separate, separately-approved documentation step. **The next product slice remains
PENDING NATHAN DECISION** and must not be started until he selects one.

## Change log
- **2026-07-26** — **Studio Hosted Mode Containment Correction — round 3, authorised DEFECT-CLASS SWEEP.** Rounds 1 and 2 fixed reported instances while siblings in the same class survived; round 3 inventoried the class across four axes before editing and corrected **seven reachable instances** — AdStudio's initial generation loop (the missed sibling of the retry path), AdStudio scan/campaign, **`gemini.js` pulling raw provider text into the thrown message**, MockupStudio's export alert, Diagnose + Outreach as rendered consumers of that shared helper, the `product-lock` description asserting the **gated** B2 enhancement, and the two presets that advertised and routed to hidden tabs. Structural closures: every creative render surface routes through `userFacingError`; provider text is diagnostics-only and **zero bare `throw new Error(` remain in `gemini.js`**; gated subfeatures are declared per workflow and appended only when satisfied; presets are filtered by target-mode availability. 53 tests (class-level assertions), four further negative controls, 43 files / 931 passed / 1 skip, build green, and both browser smokes re-run (hosted: hidden-tab presets gone, 0 engine terms, 0 requests; local/demo: presets, all 8 modes and Product Lock B2 restored, failure still fails closed with business-facing text). **Status AT THAT DATE: IN FLIGHT / NOT RELEASED** *(the slice was merged 2026-07-27 as PR #118 and remains undeployed)*; **PR #117 paused; P1 CLOSED / LIVE.**
- **2026-07-26** — **Studio Hosted Mode Containment Correction — round 2 (the first implementation was INCOMPLETE).** Codex raised two further P2s on the corrective PR and **both were confirmed real**: (a) the new render boundary **flattened actionable hosted Gateway guidance** into the generic fallback — a regression introduced by the fix itself — now corrected with a controlled reason→message table keyed by the Gateway reason code, where provider text is never rendered and cannot self-declare as safe, and diagnostics sit in structured fields rather than `.message` (preserving the stronger pre-existing invariant that a Gateway image Error never carries the raw code or server detail); and (b) `STATIC_CAPABILITIES` was left unfiltered, so Jake still advertised `product-lock-blend` and a `creative-modes` description naming hidden workflows — now each Studio-related static entry carries an **explicit** availability requirement and the `creative-modes` text is derived from the injected available-mode labels, with filtering applied **before** any `maxCapabilities` slicing. 42 regression tests including assertions on the real built Jake prompt, two further negative controls (5 and 4 failures on revert), 30 files / 712 passed, build green. **Status AT THAT DATE: IN FLIGHT / NOT RELEASED** *(merged 2026-07-27 as PR #118, still undeployed)*; **PR #117 still paused; P1 remains CLOSED / LIVE.**
- **2026-07-26** — **Studio Hosted Mode Containment Correction — IN FLIGHT / NOT RELEASED** *(status at that date; merged 2026-07-27 as PR #118, still undeployed)*. Codex raised a P2 on docs PR #117; the SAFE STOP investigation proved the defect is **hosted-reachable**, not local/demo-only. The capability filter guarded only the visible mode tiles, while a **Jake→Studio hand-off** set `mode` directly and the panels render from `mode` — so a hosted build could render the hidden `presenter` panel and print the raw engine string `Qwen-Image-Edit אינו מותקן במנוע`. **Proven in the DOM against a hosted-configuration build using a deterministic hand-off through the real router-state seam (no LLM), before any edit.** Corrected in three layers: capability-aware Jake advertising (fail closed, availability injected so `businessBrain.js` keeps its no-engine-imports boundary); an authoritative available-mode set (`src/lib/studioModes.js`) enforced on every entry path plus a pre-paint safety net; and a user-facing error boundary (`src/lib/userFacingError.js`) that renders only explicitly declared text and classifies by **identity, not substring matching**, keeping technical detail on the Error for diagnostics. 26 new regression tests through the real seams, **three real negative controls** (reverting each layer fails 1 / 4 / 8 tests), focused affected suite **30 files / 697 passed**, production build green, and post-fix DOM proof in both hosted and local/demo configurations. **Also corrected a FALSE claim** previously recorded here and in PR #117: the residual `Qwen` artifact hits were **not** all non-rendered internals. **No migration, no Gateway/Edge/Auth/schema change, no rollback indicated, nothing deployed.** PR #117 paused; P1 remains CLOSED / LIVE.
- **2026-07-26** — **Studio / Local-Engine UI Containment CLOSED / LIVE VERIFIED in Production.** Release chain: PR [#114](https://github.com/natanMeT/ArtValue20/pull/114) → `29cccdd` → docs PR [#115](https://github.com/natanMeT/ArtValue20/pull/115) → `03c23c2` → **one build** from `03c23c2` + artifact scan (local-engine gate provably closed; 0 occurrences of every removed user-facing engine label) → Preview **`ec239e3b`** (12/12 byte-identical, authenticated QA acceptance PASS) → **Production `247ef9ec-ad3a-4c15-8b16-25afa1c47f2b` / `index-BZ3B-0yd.js`** by reusing the accepted `dist/` (wrangler "Uploaded 0 files (12 already uploaded)"; **12/12 served files byte-identical**) + **authenticated non-mutating Account A Production smoke PASS**. **Current rollback target `476830a2` / `index-BrR14XIC.js`** retained and verified healthy post-deploy (the older S0F.1 `e63198b7` is a **historical fallback only**, not the current target). **Test evidence, exact scope:** the full suite (121 files / 3,098 passed / 1 skip / 0 failed) was last green on the **earlier implementation head**; after the fail-closed capability correction the **focused affected suite** was run on the **final corrected code** (27 files / 1,608 passed / 0 failed) plus a **green production build at `03c23c2`** — the full suite was deliberately not rerun on the final head, and the final head's end-to-end coverage comes from the Preview and Production authenticated acceptances. Delivered: removal of the local-GPU status/setup panel and its 15s poll, the ComfyUI/Fooocus-badged workflow map, the checkpoint picker, the PuLID/Kontext engine toggle, the job card's engine graph-node readout, three mount-time local-engine probes (replaced by fail-closed configuration-derived capability flags), and every user-visible engine name across ImageStudio, AdStudio, Jake, the preset pack, the workflow catalog and thrown generation errors — **including the catalog text that reaches Jake's system prompt** (verified live: a 1,174-character Jake reply enumerating the creative capabilities with **0 engine names**). Retained: all nine creative modes where the runtime supports them, business presets, brand palette, gallery, Poster Editor, Mockup Studio, Product Lock, the Jake→Studio hand-off. **Production smoke measured 0 requests on Studio open, 0 during a 17s idle, 0 local-address requests, 0 engine terms, 0 console errors and 0 mutating requests.** **No migration, no schema/Auth/Gateway-contract change, Edge v35 not redeployed, Growth still BetaUnavailable, no user data touched.** One recorded nuance: an initial served-bytes sweep briefly returned the SPA index.html fallback for the new entry asset on one edge node (propagation race) — a clean refetch and full re-sweep were 12/12. Two carried-forward notes, **neither an open release item**: **P1 Atomic Quote Persistence remains CLOSED / LIVE** with one **optional additional Production-UI validation** outstanding — the same-session authenticated Production smoke proved Quotes/Finance render and authenticated reads are healthy, while Account A held 0 quote and 0 transaction rows and no Production create/edit was authorized, so quote-row visibility and a Production-UI RPC re-exercise were not observed; atomicity was already established by the 13/13 failure-injection acceptance, the authorization/RLS evidence and the Preview UI acceptance on the same artifact. And **Jake advertising cloud-unavailable creative capabilities** (pre-existing truthfulness follow-up, not a regression).
- **2026-07-26** — **Tracker consistency correction (documentation-only).** Removed a self-invalidating assertion that repository `main` *equals* the PR #114 merge SHA — merging any documentation PR advances `main`, so the claim would have been false immediately and could have led later release work to treat the #114 merge as the repository head. The baseline now defines **three distinct anchors that must never be collapsed**: (1) the repository head, **deliberately not recorded** and resolved live at every preflight; (2) the **merged-but-unreleased application-code anchor** `29cccdd…` (the PR #114 merge commit, a historical anchor); (3) the **deployed Production source** `7e30199`. Divergence between them is expected and is not deployment drift. Also de-duplicated two leftover Production / rollback-branch-and-tag lines in the Studio status section (meaning unchanged) and re-anchored the `src/`-tree equality claim to the merge commit rather than to a moving head. Raised as a Codex P2 on PR #115. No code, tests, configuration, roadmaps or exports changed; no deployment; Production and Edge unchanged; P1 remains CLOSED / LIVE.
- **2026-07-26** — **Studio / Local-Engine UI Containment MERGED into `main` — NOT RELEASED.** PR [#114](https://github.com/natanMeT/ArtValue20/pull/114) merged as `29cccddda52e1c546b4ae46be052285ec24d2116` (parents `4f4180b` + `c30dff2`), pinned to the approved head SHA. Codex round 2 clean (reviewed commit `bb8e955ef2`), **0 unresolved review threads**; the `src/` tree on `main` is byte-identical to the reviewed tree (`255bd4c7edb0aa2fbd181a1b22cb528fa6de9aee`). **No Preview or Production deployment was performed:** Production stays `476830a2` / `index-BrR14XIC.js` (source `7e30199`), Edge `ai-gateway` v35 unchanged and not redeployed, **no migration**, schema/Auth/Gateway contracts untouched, Growth still `BetaUnavailable`, no user data touched. Branch `studio/local-engine-ui-containment` @ `c30dff2` and tag `pre-studio-local-engine-containment` @ `4f4180b` retained. **`main` now carries merged application code that has never been built or deployed — "merged" is not "live".** Open release gate: **authenticated cloud acceptance on Preview** (all browser verification so far was local/demo). Documentation-only correction in this PR; no code, tests, configuration, roadmaps or exports changed.
- **2026-07-26** — *(historical entry, written when the PR was opened; superseded by the entries above — the slice is now merged AND released to Production)* **Studio / Local-Engine UI Containment — IN FLIGHT / NOT RELEASED.** Nathan selected Studio / local-engine UI cleanup as the active slice. Branch `studio/local-engine-ui-containment`, rollback tag `pre-studio-local-engine-containment` @ `4f4180b`. Implementation PR opened (**not merged, not deployed**); Production unchanged at `476830a2` / `index-BrR14XIC.js`. Removes the local-GPU status/setup panel and its 15s poll, the ComfyUI/Fooocus-badged workflow map (`CreativeWorkflowMap.jsx` deleted), the `.safetensors` checkpoint picker, the PuLID/Kontext engine toggle, the job card's engine graph-node readout, and every user-visible engine name across ImageStudio, AdStudio, Jake, the preset pack and the thrown generation errors; replaces three mount-time local-engine probes with configuration-derived flags. **Runtime-proven with a positive control:** with the engine gate OPEN, a fetch spy recorded 4 local-engine requests on opening `/studio` on `main` and **0** on this branch (and 0 while idle for 18s). That smoke caught a temporal-dead-zone `ReferenceError` — introduced by the flag refactor — that blanked the Studio and which no source-level test detected; fixed and pinned. **Narrower than expected:** `creativeWorkflows.js` could not be deleted because `studioHandoff.js`, `jakeDecisionEngine.js` and `businessBrain.js` consume it — its user-reachable text (which reaches Jake's system prompt) was cleaned instead. Tests 121/3094/1skip; build green; artifact scan clean for every removed label. **No migration, no Gateway/Edge/Auth/schema change, no new provider, no data touched; Growth containment unchanged.** Preview + authenticated cloud acceptance still required.
- **2026-07-26** — **P1 Atomic Quote Persistence CLOSED / LIVE VERIFIED in Production.** Chain: PR #108 (truthful Quotes/Finance saves + duplicate-submit guards + quote-to-project cloud containment) → `716da1b`; PR #109 (one `SECURITY INVOKER` `save_quote_atomic` RPC + `api.js` single-RPC rewire) → `f7ff9fa`; PR #110 (live/canonical `quotes.date` + `quotes.created_at` compatibility variants + `coalesce(…, current_date)` create fallback, **no table altered**) → `2e1b137`; **first authorized apply FAILED SAFELY** with `42883: operator does not exist: name[] = text[]` in the migration's initial fail-loud catalog preflight block (read-only *operations*, but inside the full migration transaction — **not** a declared READ ONLY transaction), aborting before creating or altering anything; PR #111 (both PK checks → `array_agg(a.attname::text order by k.ord) = array['id']::text[]`, regression coverage, complete corrected preflight PASSED against live catalogs inside one `BEGIN TRANSACTION READ ONLY` / `SHOW transaction_read_only`=`on` / DO / `ROLLBACK` session, negative control still reproducing `42883`) → `a098b0b`; docs PR #112 → `7e30199`. **Migration `20260726120000` APPLIED (retry) & verified**; `public.save_quote_atomic` live (SECURITY INVOKER, empty `search_path`; **`authenticated` is the only client-facing EXECUTE role, `anon`/PUBLIC denied — proven `42501`/HTTP 401 over real HTTP — while `service_role` also holds EXECUTE via Supabase defaults, server-side only**). **Failure-injection acceptance 13/13** (fault injected after the parent insert → **no partial quote**; failed replacement left original items and parent intact; foreign-owner update `P0002` + invisible under RLS); QA records cleaned, DB back to baseline. **Preview `c999988e` UI acceptance PASSED** (exactly one `save_quote_atomic` 204 per save; truthful "נשמר במערכת" toasts). **Production `476830a2-f8ea-45dc-b0ce-a71876bc48dd` / `index-BrR14XIC.js`** deployed by reusing the accepted `dist/` ("Uploaded 0 files (12 already uploaded)"), **12/12 served files byte-match**; its then-rollback `e63198b7` retained and reachable (**historical fallback only since the Studio release — the current rollback target is `476830a2`**); Edge `ai-gateway` v35 / `verify_jwt=true` unchanged; DB unchanged by the deploy (quotes 0 / quote_items 0, no QA or business record created). Tests 120/3065/1skip; build green. **Recorded limitation at the time: the authenticated Production smoke was NOT performed** — no live Account A session existed and signing in was out of scope; unauthenticated Production load verified clean (correct bundle, all assets 200, zero console errors, zero Supabase requests). *(Superseded by the 2026-07-26 Studio-release entry above: an authenticated Production smoke has since been run and confirmed Quotes/Finance render and authenticated reads are healthy; only an optional additional Production-UI validation remains, which does not reopen this release.)* Also recorded: filtered DevTools Network views cannot prove the *absence* of direct table writes — that assurance comes from artifact/code evidence (`writeItems` 0 occurrences in the shipped bundle).
- **2026-07-26** — **S0F.1 Creative Trust, Account Isolation & Brand-Palette Consumption CLOSED / LIVE VERIFIED in Production.** Release chain: PR #106 → main `983f489` → Edge `ai-gateway` **v34→v35** (Jake persona text constant + its related comment only; ACTIVE, `verify_jwt=true`; persona smoke PASS) → Preview `0760f00e` (branch `s0f1-preview-983f489`) + three-account (A/B/D) acceptance PASS → **Production `e63198b7`** (reused Preview-tested `dist/`, `index-lvfFFwEn.js` — "Uploaded 0 files (12 already uploaded)") + authenticated non-mutating Account A smoke PASS; no rollback (`4b86993d` retained, HTTP 200). Delivered truthful cloud containment of the Jake campaign lane and AdStudio (nothing run, nothing claimed, nothing saved, zero Gateway calls), the hidden ArtValue offer-brief chip, a Jake persona in which **ArtValue is the product/system brand** and Jake works only from the active account's approved Business Context, account-aware **Outreach** and **quote issuer** (truthful setup-required / neutral presentation when unconfigured), **ImageStudio brand-palette consumption** (exact approved uppercase HEX unchanged, ON by default with per-generation OFF, never recolouring the app theme, final prompt validated against the canonical 2,000-character Gateway limit and blocked truthfully before the Gateway when over), and **per-account uid-scoped device-local** creative/package/gallery storage with the account-switch race closed and legacy globals never read, migrated, copied or deleted. **Local creative/gallery stores are per-account isolated device-local storage — NOT durable; a durable Asset Library remains open.** Growth remains fully BetaUnavailable; no Product/Inventory/Campaign/Asset-Library schema, no public/guest Growth Console and no Website Scanner were added. **No migration.** Tests 118/2978/1skip; build green. Rollback tag `pre-s0f-creative-trust-brand-palette` @ `5efbeb91` retained. Recorded non-blocking follow-up: **Quote cloud-save source label truthfulness** (wording only; persistence is correct). Next slice remains PENDING NATHAN DECISION.
- **2026-07-26** — **S0E Guided Business Onboarding CLOSED / LIVE VERIFIED in Production (incl. dual-tour cloud correction).** Release chain: PR #103 → main `c10ac55` → corrective PR #104 → active release source `272fc14` → corrected Preview `ea0dcc02` (branch `s0e-preview-272fc14`) + acceptance PASS on an unconfigured account → **Production `4b86993d`** (reused Preview-tested `dist/`, `index-DRaTE7f5.js` — "Uploaded 0 files (12 already uploaded)") + non-mutating Account A prod smoke PASS; no rollback (`69f8a175` retained, HTTP 200). Delivered a five-step guided Hebrew RTL setup over the durable S0D Business Context with hydration-gated auto-open, configured-account bypass, uid-scoped draft/dismissal, versioned draft baseline, step-routed validation errors, persist-first truthful save and an editable non-auto-sending Jake first-value prefill. **DemoMode correction:** manual-only in authenticated cloud mode, unchanged in local/demo, so the two first-run tours can no longer open together. **No migration; Edge `ai-gateway` v34/JWT unchanged; no Gateway/contract change.** Tests 111/2885/1skip; build green. Rollback tags `pre-s0e-demo-tour-containment` @ `c10ac55` and `pre-s0e-guided-onboarding` @ `becd070` retained. Resolved blockers: Onboarding/business-setup wizard; overlapping first-run tours. Next slice remains PENDING NATHAN DECISION.
- **2026-07-26** — **Canonical documentation advanced to Business OS v0.8 + AI Gateway v5.4.** S0E recorded as CLOSED / LIVE VERIFIED in both roadmaps; Onboarding removed from the active blocker list; the Gateway roadmap carries a **no-change** release note (S0E shipped with zero Gateway/Edge change; the onboarding first-value CTA only prefills the existing frontend Jake composer and never calls the Gateway, auto-sends, executes an action or alters the contract). Hebrew RTL `.docx` exports regenerated for the new versions; **v0.7 and v5.3 exports preserved untouched**. Documentation-only change; no code/runtime/infrastructure/data change.
- **2026-07-24** — **Canonical documentation established under `docs/`.** Business OS Master Product Roadmap advanced to **v0.7** and AI Gateway Master Roadmap advanced to **v5.3**, both as authoritative Markdown (`docs/roadmaps/`) with generated Hebrew RTL `.docx` release exports (`docs/releases/`). This tracker copied to `docs/PROJECT_TRACKER.md` as the authoritative source (memory copy demoted to mirror). Two factual corrections carried through the docs: (1) Local-engine containment predates S0C (`localEngines.js` / PR #75); (2) Word filenames use the exact `_HE` suffix. Documentation-only change; no code/runtime/infrastructure/data change.
- **2026-07-24** — **S0D Business Context CLOSED / LIVE VERIFIED in Production.** Migration `20260724120000_s0d_business_profile.sql` APPLIED on `weciwurjfwmqihcyexzj` (public.business_profile: PK user_id, FK→auth.users(id) ON DELETE CASCADE, RLS `business_profile_own` USING+WITH CHECK `auth.uid()=user_id`, trigger→`set_updated_at()`, authenticated GRANTs). Preview `f4da6153` (branch `s0d-preview-22ee2f3`) + two-account authenticated acceptance PASS; **Production `69f8a175`** (reused Preview-tested `dist/`, `index-DnfLj9lz.js` — "Uploaded 0 files (12 already uploaded)") + non-mutating Account A prod smoke PASS; no rollback (`cec116b9` retained, HTTP 200). Final DB: business_profile=2 (A real ArtValue + B QA bakery, retained), clients=3, tasks=0, outreach_leads=24, quotes=0, transactions=0, quote_items=0, profile=1. **Edge v34/JWT unchanged; no Gateway/contract change** (context injected by frontend seam). Tests 107/2759/1skip. Resolved blockers: hardcoded cross-account business facts, durable Business Context, durable palette, false-success-on-save, cross-account exposure. Growth OS temporarily contained (ArtValue-specific datasets/content) → named follow-up "Account-aware Growth & Creative Context". Accepted nuance (not a blocker): fresh-Jake-conversation needed after saving context.
- **2026-07-24** — **S0D Business Context MERGED to `main` (not live).** PR #101 "S0D: add durable per-account Business Context" → merge-commit `22ee2f3` (head-gated to head `7750bd3f`, no squash/rebase; first parent `3ee62aee` = S0C, second parent `7750bd3f`; merged 00:28:57Z). Merge turn was git-only: all 9 gates passed (25 files, 0 unresolved threads, tests 107/2759/1skip at head, build green); **migration `20260724120000_s0d_business_profile.sql` NOT run; no Preview/Prod/Edge deploy; no Auth/data/secret/config/doc mutation.** Rollback tag `pre-s0d-business-context` @ `3ee62aee` + source branch `s0d/business-context-mvp` retained; local main fast-forwarded to `22ee2f3`. Production still S0C `cec116b9`.
- **2026-07-24** — **S0C roadmap docs read + verified.** Nathan/ChatGPT re-issued the two owner-owned roadmaps from Claude's drop-ins as **Business OS v0.6** + **AI Gateway v5.2**; Claude read both in full and confirmed they record the S0C closure correctly. `.docx` not edited by Claude. Next doc versions per convention = v0.7 / v5.3.
- **2026-07-24** — **S0C Identity & User-Isolation CLOSED / LIVE VERIFIED.** PR #100 → merge `3ee62aee`; Edge `ai-gateway` v33→v34 (2 text-only Jake constants, JWT on); Preview `b69fe8a1` + two-account same-browser acceptance PASS; Production `cec116b9` (reused Preview-tested `dist/`, `index-CE6IJ-rJ.js`) + non-mutating Account A smoke PASS; no rollback. **S0C-delivered results:** session-derived identity + per-user Jake chat/brief isolation (hardcoded identity and device-global Jake history blockers closed). **Production Local-engine containment is NOT an S0C result** — it was a separate, already-existing correction via `src/lib/localEngines.js` / PR #75 that predates S0C. Business Context + Onboarding remain open. Tests 101/2690/1skip. Prod deploy superseded `31cb521d` (retained for rollback).
- **2026-07-23** — S0B Cloud Persistence CLOSED/LIVE: migration `20260722120000` applied; Preview `c7750d9e` + Production `31cb521d` deployed & smoke-verified; durable+truthful Tasks and client Follow-ups; existing CRM/data and all frozen/LIVE lanes unchanged. Prod deploy superseded `4cb17aee` (retained for rollback).
- **2026-07-22** — S0B merged (PR #99 → main `385f7787`); migration authored, not yet run.
- **2026-07-22** — S0A False-Success Containment CLOSED/LIVE (Production `4cb17aee`).

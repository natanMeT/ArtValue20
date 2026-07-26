# ArtValue — Project Tracker (living cross-session handoff)

> **Canonical source (authoritative from this point forward):** this file — `docs/PROJECT_TRACKER.md` in `natanMeT/ArtValue20`. The prior copy in Claude's memory directory may remain as a convenience mirror, but it is **not** an independent source of truth and must point here. Claude keeps this file current; ChatGPT reviews the diff and does not edit it.

**Maintained by:** Claude Code — grounded in the real repo (reads files, runs commands).
**Purpose:** single source of truth for state, so work continues across sessions with no loss.
Nathan passes this to ChatGPT so it can review/advise **without re-deriving or guessing** state.
**ChatGPT does NOT edit this document.** Only Claude updates it.
**Last updated:** 2026-07-26 — session: **Studio / Local-Engine UI Containment — IN FLIGHT / NOT RELEASED** (implementation PR open; not merged, not deployed; Production unchanged at `476830a2` / `index-BrR14XIC.js`). Prior closed session: **P1 Atomic Quote Persistence — CLOSED / LIVE VERIFIED in Production.** PRs [#108](https://github.com/natanMeT/ArtValue20/pull/108) → [#109](https://github.com/natanMeT/ArtValue20/pull/109) → [#110](https://github.com/natanMeT/ArtValue20/pull/110) → [#111](https://github.com/natanMeT/ArtValue20/pull/111) → docs [#112](https://github.com/natanMeT/ArtValue20/pull/112) merged to `main` (`7e30199`); migration `20260726120000_atomic_quote_persistence.sql` **APPLIED & verified**; `public.save_quote_atomic` **live**; failure-injection acceptance **13/13** and Preview UI acceptance PASSED; **Production `476830a2-f8ea-45dc-b0ce-a71876bc48dd` / `index-BrR14XIC.js`** deployed by reusing the accepted artifact (12/12 served files byte-match). Rollback `e63198b7` retained. **Recorded limitation: the authenticated Production smoke was NOT run** (no live Account A session; login out of scope) — see the section below. Prior closed session: **S0F.1 Creative Trust, Account Isolation & Brand-Palette Consumption — CLOSED / LIVE VERIFIED in Production** (PR [#106](https://github.com/natanMeT/ArtValue20/pull/106) → main `983f489` → Edge `ai-gateway` **v34→v35** (Jake persona text only) → Preview `0760f00e` + three-account (A/B/D) acceptance PASS → **Production `e63198b7` / `index-lvfFFwEn.js`** + authenticated non-mutating Account A smoke PASS). Truthful cloud containment of the creative/campaign lanes, account-aware Outreach and quote issuer, per-account device-local creative/gallery isolation, and account brand-palette consumption in ImageStudio are now live; **no migration**. Prior: S0E Guided Business Onboarding CLOSED / LIVE VERIFIED (Production `4b86993d`, retained as the S0F.1 frontend rollback).

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

## Baseline (current — P1 Atomic Quote Persistence CLOSED / LIVE in Production)
- Repo: `C:\Users\PC\ArtValue` (origin/main). GitHub repo `natanMeT/ArtValue20`.
- **Active application release code anchor:** `7e301993f21a8a56ab1a4dd2d9b7cec6c9793df6` (repository `main` after docs PR #112; the P1 Production artifact was built from this commit). The prior S0F.1 anchor `983f4899a7c9736669d97b49ed1575129f820653` is retained historically as the rollback deployment's source.
- **Repository main HEAD:** resolve **live** at each task's preflight (e.g. `git rev-parse origin/main`). Repository main may carry later documentation-only commits and can therefore differ from the active application release code anchor **without** indicating application or deployment drift.
- Hosting: Cloudflare Pages `artvalue-product` — canonical https://artvalue-product.pages.dev
- Current Production deploy: **`476830a2-f8ea-45dc-b0ce-a71876bc48dd`** (Environment Production, branch `main`, source `7e30199`, bundle **`index-BrR14XIC.js`**) — **LIVE (P1 Atomic Quote Persistence)**. Deployed by reusing the exact Preview-accepted `dist/` — NOT rebuilt (wrangler "Uploaded 0 files (12 already uploaded)"). **Served-bytes proof: all 12/12 files fetched from the canonical URL are byte-identical (`cmp`) to the accepted artifact**; entry `index-BrR14XIC.js` = `ec4a865a12c4a90f81063e3df366610f26bc45c3c37e9ad1792e24df29c64745` (819,230 bytes), `index.html` = `205080b22aff81bf0a930753b18c41a94537a81faa9443cdf8c6e016574e3d24`; every asset HTTP 200; zero console errors on load.
- Frontend rollback target (retained, healthy HTTP 200): **`e63198b7-ebd6-4b7d-9872-c9bcd1a5ab0a`** (source `983f4899`, bundle `index-lvfFFwEn.js`, S0F.1) — verified reachable and still serving its own bundle after the P1 deploy. (Older `4b86993d` S0E / `69f8a175` S0D / `cec116b9` S0C / `31cb521d` S0B / `4cb17aee` S0A retained historically.)
- Preview (retained): **`c999988e-2a28-493e-b183-06b993e6bdc5`** (branch `p1-atomic-quote-preview-7e30199`, source `7e30199`, bundle `index-BrR14XIC.js`) — failure-injection + UI acceptance PASSED; this is the artifact promoted to Production. The S0F.1 Preview `0760f00e` is retained historically.
- Git rollback tags (P1): `pre-atomic-quote-persistence` @ `716da1b`, `pre-atomic-quote-live-compatibility` @ `f7ff9fad`, `pre-atomic-quote-pk-catalog-cast` @ `2e1b137` — all retained.
- Git rollback tags: `pre-s0f-creative-trust-brand-palette` @ `5efbeb9103710875fc3dad882ae78aca4b2938bc`, `pre-s0e-demo-tour-containment` @ `c10ac5590967410d0931a89b08a7bdab12030b25`, `pre-s0e-guided-onboarding` @ `becd070be72c5c0d59148f870db378cfad9cebea`, `pre-s0d-business-context` @ `3ee62aee`, `pre-s0c-identity-isolation` @ `385f77874da68f905b504facf92843e7ede76d97`, `pre-s0b-cloud-persistence` @ `7066520` — all retained.
- Edge: `ai-gateway` **v35 ACTIVE, `verify_jwt=true`**. **S0F.1's only Edge change was the Jake persona text constant and its directly related comment in `actionProfiles.ts`** — router / actionTypes / contracts / request-response payloads / provider routing / validation / budget + usage controls / confirmation flow / all non-persona profiles remain UNCHANGED. Account Business Context continues to be assembled + injected by the **frontend chat/draft seam** before the existing Gateway call; the ImageStudio brand-palette block is likewise composed **frontend-side** into the existing `studio.generate_image` prompt.
- Supabase: project `weciwurjfwmqihcyexzj`; **all 6 migrations applied & matching, none pending** — `20260726120000_atomic_quote_persistence.sql` (P1) applied 2026-07-26, `public.save_quote_atomic` live and verified (SECURITY INVOKER, empty `search_path`; **`authenticated` is the only client-facing role with EXECUTE — `anon` and PUBLIC are denied/absent; `service_role` also holds EXECUTE via Supabase's project-level defaults and is server-side only**). **S0F.1 added NO migration** (no Product/Inventory/Campaign/Asset-Library schema). S0D migration `20260724120000_s0d_business_profile.sql` remains **APPLIED & verified** — `public.business_profile`: PK `user_id`, FK → `auth.users(id)` ON DELETE CASCADE, RLS ON + policy `business_profile_own` (USING+WITH CHECK `auth.uid()=user_id`), trigger `trg_business_profile_updated`→`set_updated_at()`, authenticated GRANTs present.
- Tests: **120 files / 3065 passed / 1 pre-existing skip / 0 failures** (at the released commit `7e30199`); production build green.
- **Branch / HEAD / working tree are session-specific, not canonical state:** every task must verify its own branch, HEAD and working tree at preflight before acting (the pre-existing untracked `dist-profile/` is expected). Do not store a particular clean-tree snapshot as durable canonical truth. (The memory-mirror of this tracker lives OUTSIDE the repo, in the memory dir, so it never shows in `git status`; this repository copy under `docs/` is the authoritative one.)

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
- [x] **Next product slice — SELECTED by Nathan: Studio / local-engine UI containment.** IN FLIGHT / NOT RELEASED — see its section below. The candidate list below is preserved for the slice AFTER this one.
- [ ] **Slice after this one — PENDING NATHAN DECISION.** Do NOT begin/design/invent the next slice until Nathan selects one and approves a spec. Candidate open items: durable **Asset Library**; durable **Campaigns** + account-aware Growth data model (the Growth reopening prerequisites); **Products / Projects / Inventory / Templates / Activity durability**; **organization boundaries**; **credits / cost controls**; **Website Scanner** (per the section above); Jake conversation-refresh UX. **NOT a candidate: the Quote cloud-save source-label correction — it is already RESOLVED and LIVE in Production (implemented in merged PR #108, shipped in deployment `476830a2`), so it must never be selected or re-implemented as a new slice.**

## Studio / Local-Engine UI Containment — **IN FLIGHT / NOT RELEASED** (2026-07-26)

**Status: implementation PR open; NOT merged, NOT built for release, NOT deployed to Preview or Production, NOT live.**
Production remains **`476830a2-f8ea-45dc-b0ce-a71876bc48dd` / `index-BrR14XIC.js`** (source `7e30199`), unchanged by this slice.
Rollback tag `pre-studio-local-engine-containment` @ `4f4180b`; branch `studio/local-engine-ui-containment`.

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
- **Tests:** 121 files / **3,098 passed, 1 skipped, 0 failed**. New suite
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

### Review findings (Codex) — both CONFIRMED and FIXED
Codex raised **2 P2 findings** on the first commit; both were verified against the code before acting, and both are fixed in `b807fa1`:
1. **Optional stacks were no longer gated by anything.** `COMFY_PULID_MODEL` / `QWEN_UNET` / `QWEN_CLIP` / `QWEN_VAE` all
   carry a non-empty `||` default, so `hasPulidModel` / `hasQwenEdit` collapsed to `Boolean(COMFY_URL)` — a rig with
   ComfyUI but without those optional custom nodes would have shown the album/presenter modes and always routed character
   packs through PuLID instead of the Kontext fallback. Fixed with an explicit opt-out
   (`VITE_COMFYUI_PULID` / `VITE_COMFYUI_QWEN_EDIT` = `0`/`false`/`off`/`no`) rather than a restored page-load probe.
   **Stated limitation: this is operator-declared, not discovered — coarser than the removed runtime node checks.**
2. **FLUX presets silently fell back to the SDXL graph.** Dropping `arch` with the picker made `useFlux` false for every
   local render. Fixed by deriving the family from the applied **preset's own metadata** (`presetArch`), which is a
   business choice the user already made — no checkpoint filename returns, and the Gateway payload is unchanged.

Re-verified at runtime after the fixes: Studio renders, 9 modes, **0** local-engine fetches on open, **0** console errors,
**0** engine terms in the DOM. Tests **121/3098/1skip**; build green.

### Verification still required before Preview and Production
1. Any further review findings addressed.
2. Preview deploy and **authenticated cloud acceptance** — the runtime smoke above was local/demo only; the
   authenticated cloud path (where the engine gate is closed and the local-only modes are hidden) has **not** been
   exercised in a browser.
3. Confirm on Preview that `/studio` issues **zero** requests to any local address and that no engine terminology
   appears for an authenticated account, including in Jake's replies.
4. Confirm `/adstudio` still renders `BetaUnavailable` and Growth remains contained for an authenticated account.
5. Only then a Production deploy, reusing the Preview-accepted artifact, with the current Production retained as rollback.

## P1 Atomic Quote Persistence — **CLOSED / LIVE IN PRODUCTION** (2026-07-26)

> **Truthful status: the release is COMPLETE and LIVE.** Five PRs merged, migration `20260726120000` **applied and verified**, `public.save_quote_atomic` **live**, and the accepted artifact is **deployed to Production as `476830a2-f8ea-45dc-b0ce-a71876bc48dd` / `index-BrR14XIC.js`** (all 12 files byte-match the Preview-accepted artifact). Rollback target `e63198b7` retained and reachable. **One evidence limitation is recorded below: the authenticated Production smoke could not be run** (no live Account A session existed and signing in was out of scope), so authenticated Production behaviour is verified by Preview acceptance + artifact identity, not by a Production login.

### Production release (LIVE)
- **Deployment `476830a2-f8ea-45dc-b0ce-a71876bc48dd`** — Environment Production, branch `main`, source `7e30199`, entry bundle **`index-BrR14XIC.js`**; canonical **https://artvalue-product.pages.dev**.
- **Deployed by reusing the exact Preview-accepted `dist/` — NOT rebuilt.** wrangler reported **"Uploaded 0 files (12 already uploaded)"**, i.e. Cloudflare recognised every file as already present, which is itself evidence that the bytes are identical to the accepted Preview artifact.
- **Served-bytes proof (not a page-load proxy):** all **12/12** files fetched from the canonical Production URL are **byte-identical** (`cmp`) to the local accepted `dist/`, including the entry bundle `index-BrR14XIC.js` (SHA256 `ec4a865a12c4a90f81063e3df366610f26bc45c3c37e9ad1792e24df29c64745`, 819,230 bytes) and `index.html` (SHA256 `205080b2…`, 1,285 bytes). Every asset returned HTTP 200.
- **Rollback target retained and reachable:** **`e63198b7-ebd6-4b7d-9872-c9bcd1a5ab0a`** (source `983f4899`, bundle `index-lvfFFwEn.js`) — HTTP 200, still serving its own bundle.
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
- **NOT verified:** the **authenticated Production smoke**. At verification time no live Account A session existed on the Production origin (only leftover uid-scoped app keys), and signing in was outside scope, so the app presented the login screen. Consequently, authenticated Production screens (Quotes/Finance rendering, existing data visible) were **not** exercised in Production. What *was* verified unauthenticated: the app loads normally, serves the correct entry bundle, all assets 200, **zero console errors**, and **zero Supabase REST/RPC requests** (hence no mutation). Authenticated behaviour rests on Preview acceptance with the byte-identical artifact.
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
**A slice IS in flight: Studio / Local-Engine UI Containment — IN FLIGHT / NOT RELEASED.** Its implementation PR is open
and must not be merged or deployed until reviewed. Production is still **`476830a2-f8ea-45dc-b0ce-a71876bc48dd` /
`index-BrR14XIC.js`** (source `7e30199`) — this slice has changed nothing that is live.

S0A + S0B + S0C + S0D + S0E + S0F.1 + **P1 Atomic Quote Persistence all remain CLOSED / LIVE**; P1 is live with migration
`20260726120000` applied and `public.save_quote_atomic` verified, rollback `e63198b7` / `index-lvfFFwEn.js` retained.
**Open item carried forward: the authenticated Production smoke for P1 was not performed** (no live Account A session at
verification time) — worth a one-off authenticated check on Production at Nathan's convenience.

Immediate next steps for the in-flight slice: review the PR, then Preview + **authenticated cloud acceptance** (the
completed smoke was local/demo only), then a Production deploy reusing the accepted artifact. The versioned roadmaps
(Business OS v0.9 / AI Gateway v5.5) and the `.docx` exports are **deliberately NOT updated by this PR** — release
closure will update this tracker again after Production acceptance. The slice AFTER this one remains PENDING NATHAN
DECISION.

## Change log
- **2026-07-26** — **Studio / Local-Engine UI Containment — IN FLIGHT / NOT RELEASED.** Nathan selected Studio / local-engine UI cleanup as the active slice. Branch `studio/local-engine-ui-containment`, rollback tag `pre-studio-local-engine-containment` @ `4f4180b`. Implementation PR opened (**not merged, not deployed**); Production unchanged at `476830a2` / `index-BrR14XIC.js`. Removes the local-GPU status/setup panel and its 15s poll, the ComfyUI/Fooocus-badged workflow map (`CreativeWorkflowMap.jsx` deleted), the `.safetensors` checkpoint picker, the PuLID/Kontext engine toggle, the job card's engine graph-node readout, and every user-visible engine name across ImageStudio, AdStudio, Jake, the preset pack and the thrown generation errors; replaces three mount-time local-engine probes with configuration-derived flags. **Runtime-proven with a positive control:** with the engine gate OPEN, a fetch spy recorded 4 local-engine requests on opening `/studio` on `main` and **0** on this branch (and 0 while idle for 18s). That smoke caught a temporal-dead-zone `ReferenceError` — introduced by the flag refactor — that blanked the Studio and which no source-level test detected; fixed and pinned. **Narrower than expected:** `creativeWorkflows.js` could not be deleted because `studioHandoff.js`, `jakeDecisionEngine.js` and `businessBrain.js` consume it — its user-reachable text (which reaches Jake's system prompt) was cleaned instead. Tests 121/3094/1skip; build green; artifact scan clean for every removed label. **No migration, no Gateway/Edge/Auth/schema change, no new provider, no data touched; Growth containment unchanged.** Preview + authenticated cloud acceptance still required.
- **2026-07-26** — **P1 Atomic Quote Persistence CLOSED / LIVE VERIFIED in Production.** Chain: PR #108 (truthful Quotes/Finance saves + duplicate-submit guards + quote-to-project cloud containment) → `716da1b`; PR #109 (one `SECURITY INVOKER` `save_quote_atomic` RPC + `api.js` single-RPC rewire) → `f7ff9fa`; PR #110 (live/canonical `quotes.date` + `quotes.created_at` compatibility variants + `coalesce(…, current_date)` create fallback, **no table altered**) → `2e1b137`; **first authorized apply FAILED SAFELY** with `42883: operator does not exist: name[] = text[]` in the migration's initial fail-loud catalog preflight block (read-only *operations*, but inside the full migration transaction — **not** a declared READ ONLY transaction), aborting before creating or altering anything; PR #111 (both PK checks → `array_agg(a.attname::text order by k.ord) = array['id']::text[]`, regression coverage, complete corrected preflight PASSED against live catalogs inside one `BEGIN TRANSACTION READ ONLY` / `SHOW transaction_read_only`=`on` / DO / `ROLLBACK` session, negative control still reproducing `42883`) → `a098b0b`; docs PR #112 → `7e30199`. **Migration `20260726120000` APPLIED (retry) & verified**; `public.save_quote_atomic` live (SECURITY INVOKER, empty `search_path`; **`authenticated` is the only client-facing EXECUTE role, `anon`/PUBLIC denied — proven `42501`/HTTP 401 over real HTTP — while `service_role` also holds EXECUTE via Supabase defaults, server-side only**). **Failure-injection acceptance 13/13** (fault injected after the parent insert → **no partial quote**; failed replacement left original items and parent intact; foreign-owner update `P0002` + invisible under RLS); QA records cleaned, DB back to baseline. **Preview `c999988e` UI acceptance PASSED** (exactly one `save_quote_atomic` 204 per save; truthful "נשמר במערכת" toasts). **Production `476830a2-f8ea-45dc-b0ce-a71876bc48dd` / `index-BrR14XIC.js`** deployed by reusing the accepted `dist/` ("Uploaded 0 files (12 already uploaded)"), **12/12 served files byte-match**; rollback `e63198b7` retained and reachable; Edge `ai-gateway` v35 / `verify_jwt=true` unchanged; DB unchanged by the deploy (quotes 0 / quote_items 0, no QA or business record created). Tests 120/3065/1skip; build green. **Recorded limitation: the authenticated Production smoke was NOT performed** — no live Account A session existed and signing in was out of scope; unauthenticated Production load verified clean (correct bundle, all assets 200, zero console errors, zero Supabase requests). Also recorded: filtered DevTools Network views cannot prove the *absence* of direct table writes — that assurance comes from artifact/code evidence (`writeItems` 0 occurrences in the shipped bundle).
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

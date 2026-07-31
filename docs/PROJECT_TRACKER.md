# ArtValue — Project Tracker (living cross-session handoff)

> **Canonical source — this file is the ONLY tracker:** `docs/PROJECT_TRACKER.md` in `natanMeT/ArtValue20`. **Claude's memory may contain only a SHORT POINTER to this file — never a duplicate mirror.** The former memory mirror was deleted precisely because it went stale (it sat at the S0D era while this file moved through S0E, S0F.1 and P1), which is exactly how a later session gets misled. Read this file live at preflight; do not trust a cached copy. Claude keeps this file current; ChatGPT reviews the diff and does not edit it.

**Maintained by:** Claude Code — grounded in the real repo (reads files, runs commands).
**Purpose:** single source of truth for state, so work continues across sessions with no loss.
Nathan passes this to ChatGPT so it can review/advise **without re-deriving or guessing** state.
**ChatGPT does NOT edit this document.** Only Claude updates it.
**Last updated:** 2026-07-31 — session: **CAMPAIGN DELETE SAFETY — RELEASED / LIVE IN PRODUCTION (see the box directly below).** **Production `c2bb560e-a562-4a00-b90f-15b4e4711ac7` / `index-CZQwY28c.js`**, Environment Production, branch `main`, source **`5bea9ee`** — the **accepted Preview artifact promoted unchanged** (`wrangler` reported **"Uploaded 0 files (12 already uploaded)"**; the **served** bundle is **byte-identical by SHA-256** to the artifact the owner QA'd, `638fab8519296508c7693780ad0013a8aeaa87fe11fb69afe1dee8b0120eae88`, 766,629 B). A **FRONTEND-ONLY** slice: deleting a campaign used to run straight from the button's `onClick`, so one click deleted the campaign **and silently unlinked every task attached to it** via the FK's `on delete set null`. It now opens a confirmation that says the tasks are **not** deleted but their link is removed, with **"ידועות N משימות מקושרות"** — a **warning, never a gate**. Merge `fc05c19f894b8a0521825abf1bddce3c98586b49` (PR [#157](https://github.com/natanMeT/ArtValue20/pull/157), head-gated to `cb1555f0`). **NO migration, NO DB change** — migrations remain **13 applied of 13 tracked, none pending**. **Owner QA was run in a REAL VISIBLE BROWSER and PASSED**; QA residue **verified zero RLS-independently**. **Current rollback target is now `bc0aa2a2` / `index-BL6kQf-e.js`**, verified HTTP 200 after the deploy; `86d5cca9` demoted to a historical fallback, retained. **NO git rollback tag was created for this release** — stated rather than implied. Full suite **131 files / 3,783 passed / 0 failed**. **No Edge/Auth/secret/package change.** ⚠️ **This release cost an extra cycle to a QA-harness misdiagnosis — the MODAL DETOUR (PR [#158](https://github.com/natanMeT/ArtValue20/pull/158) merged, then FULLY REVERTED by PR [#159](https://github.com/natanMeT/ArtValue20/pull/159)); the QA-METHOD WARNING in the box below is the durable lesson and should be read before trusting any animation-dependent QA result.** Previous session *(HISTORICAL — that release is now the rollback target)*: **CAMPAIGNS SLICE 3 — RELEASED / LIVE IN PRODUCTION.** **Production `bc0aa2a2-6569-4c2f-a16a-4ebd2deaf734` / `index-BL6kQf-e.js`**, Environment Production, branch `main`, source **`669e8da`** — the **accepted Preview artifact promoted unchanged** (`wrangler` reported **"Uploaded 0 files (12 already uploaded)"**; the **served** Production bundle is **byte-identical by SHA-256** to the locally accepted artifact, `25174190a20217ea07152362eafb996570c04cdb3a2d57da8f4e2b4e489ad7c4`, 766,033 B). A **FRONTEND-ONLY** slice that finally surfaces `tasks.campaign_id`: the column and its composite FK have been applied and live since `20260729120000`, but there were **0 occurrences of `campaign_id` anywhere in `src/`**, so the link could never be set or read. **NO migration, NO DB change** — migrations remain **13 applied of 13 tracked, none pending**. Merge `669e8daa6431ce4a2d90470ad1614bcc72dec316` (PR [#155](https://github.com/natanMeT/ArtValue20/pull/155), head-gated to `395c7b0d`). **Current rollback target is now `86d5cca9` / `index-o0xZrfkL.js`**, verified HTTP 200 after the deploy still serving its own bundle; `c45518fb` is demoted to a historical fallback, retained. **NO git rollback tag was created for this release** — stated rather than implied. Full suite **130 files / 3,769 passed / 0 failed**. **No Edge/Auth/secret/package change.** Previous session *(HISTORICAL — that release is now the rollback target)*: **FINANCE CHARGE SAFE DELETE — FULLY CLOSED, NO OPEN ITEMS.** Its last gate, the **authenticated non-mutating Production smoke, PASSED 2026-07-31** on the isolated QA account: cloud mode confirmed, Finance renders signed in, **console clean (0 messages)**, **0 writes** (19 Supabase requests, 18 read-shaped, **0 RPC calls**), and **charges/payments/transactions 0 → 0** before and after. Two coverage limits are recorded in the box below rather than glossed: the **QA account was empty**, so the smoke covers cloud auth + Finance load + no writes while the **delete guard is covered by the earlier owner-driven Preview and stale-tab QA**; and the GET conclusion is **inferred from URL shape, not from captured HTTP verbs**. *(At the time of that session there was no code, deploy or DB change; Production then stood at `86d5cca9` / `index-o0xZrfkL.js` with rollback target `c45518fb` — **both figures are superseded by Campaigns Slice 3 above**, which promoted `bc0aa2a2` and demoted `86d5cca9` to the rollback target.)* Release detail for that slice: **Production `86d5cca9-88e2-40db-9869-664cfc1567e8` / `index-o0xZrfkL.js`**, Environment Production, branch `main`, source **`1eb7b2a`** — the **accepted Preview artifact promoted unchanged** (`wrangler` reported **"Uploaded 0 files (12 already uploaded)"**; local `dist/`, accepted Preview `5a9e7277` and Production are **12/12 byte-identical by SHA-256**, entry bundle SHA256 `12479eedfcae2e93392cdc4fd151509bd95b56136fccf4ecb44f89a9947abfe8`, 765,155 B). Closes the first of the two F1 gaps recorded last session: **a charge can now be deleted from the UI, and ONLY if no payment row belongs to it.** The rule is enforced by a new RPC, **not** by the screen — `payments_charge_same_owner_fk` is `ON DELETE CASCADE`, so the pre-existing `deleteCharge` would have silently destroyed every payment attached to the charge. Merge `1eb7b2abd44249da83f1c4891d4a5d3fcd44a88c` (PR [#150](https://github.com/natanMeT/ArtValue20/pull/150), parents `2c9bec42` + the owner-approved head `0db561a8`, merged with `--match-head-commit`). **Migration `20260802120000` APPLIED and VERIFIED LIVE 2026-07-30 on the FIRST attempt — 13 applied of 13 tracked, none pending; `db push --dry-run --linked` = "Remote database is up to date".** **Current rollback target is now `c45518fb` / `index-B21Es_EZ.js`**, verified HTTP 200 after the deploy still serving its own bundle; `478e4d62` is demoted to a historical fallback, retained. Full suite **128 files / 3,738 passed / 0 failed**. Rollback tag `pre-charge-safe-delete` @ `2c9bec42`. **No Edge/Auth/secret/package change:** Edge `ai-gateway` v36 ACTIVE / `verify_jwt=true`, untouched. Previous session *(HISTORICAL — every figure below is scoped to that release, NOT current: it is now the rollback target, and migrations are 13 of 13)*: **CLIENT PROFILE SLICE 1 — RELEASED / LIVE IN PRODUCTION.** **Production `c45518fb-17b6-448a-b35e-cb9a3a46367d` / `index-B21Es_EZ.js`**, Environment Production, branch `main`, source **`d9d5bf0`** — the **accepted Preview artifact promoted unchanged** (`wrangler` reported **"Uploaded 0 files (12 already uploaded)"**, and Production is **12/12 byte-identical by SHA-256** to the accepted `dist/`; entry bundle SHA256 `505f5850a0bc6276906863b669b69df925f8a1c0748deb09ad165ff764d3128d`, 763,594 B). A **FRONTEND-ONLY** slice: the client detail modal now shows a real snapshot built **only** from data the product already holds — next action, charges and balance, payments received, related tasks, related appointments/lessons, and linked quotes — each section with its own empty state. Merge `d9d5bf01e4506528b8562d0d0e5d08639fb691ef` (PR [#148](https://github.com/natanMeT/ArtValue20/pull/148), head-gated to `3570c00`). **NO migration, NO DB/schema change, NO Edge/Auth/secret/package change** — migrations remain **12 applied of 12 tracked, none pending**; Edge `ai-gateway` v36 ACTIVE / `verify_jwt=true`, untouched. **Current rollback target is now `478e4d62` / `index-PcQFaAu-.js`**, verified HTTP 200 after the deploy still serving its own bundle; `ad09b631` is demoted to a historical fallback, retained. Full suite **127 files / 3,705 passed / 0 failed**. **No git rollback tag was created for this release** — stated rather than implied, since every previous release carried one.

**THE TWO F1 GAPS — ONE NOW CLOSED, ONE DELIBERATELY UNCHANGED.** (a) **CLOSED 2026-07-30 by Finance Charge Safe Delete:** a charge can be deleted from the UI, and **only if no payment row belongs to it**. Enforced by `public.delete_charge_if_unpaid(uuid)`, not by the screen. (b) **UNCHANGED, and deliberately so:** a cancelled charge keeps its payments and those payments keep counting in **"הכנסה בפועל"**. Cancelling a claim does not un-receive money, so this is correct accounting rather than a defect; it is pinned by a test and now **stated on screen beside the number** ("הכנסה בפועל כוללת גם תשלומים שהתקבלו על חיובים שבוטלו"). Cancelling remains not a way to undo money.

**THE STALE-TAB PATH IS NOW EXERCISED (2026-07-31)** — the first of the slice's two remaining items; the second, the **authenticated Production smoke, also passed 2026-07-31**, so **no open items remain**. It was carried for one day as an accepted cosmetic gap; it no longer is. Owner-driven two-tab run on the isolated QA account `natanturgeman5@gmail.com`: the same charge open in two tabs, a payment recorded in tab B, then the **row trash icon 🗑️** clicked in tab A (**not** the cancel ✕). The server **refused**, the **charge stayed visible**, the **payment stayed recorded**, there was **no success toast**, and the screen showed the **specific** message **"לחיוב הזה רשומים תשלומים…"** — not the generic fallback. Cleanup was done through the UI in the only order the rule permits (payment first, then the charge), and **zero residue was verified read-only** afterwards: `charges_total = 0`, `payments_total = 0`, checked as the owner role so no policy could hide a row.

**WHAT THAT CLOSES, PRECISELY.** The full chain is now measured end to end rather than reasoned: the RPC refuses with `23514` → **PostgREST delivers that SQLSTATE to `supabase-js` as `error.code`** → `api.deleteCharge` maps it to a `userMessage` → the store renders it. Only the middle hop had ever been unproven for `23514`/`P0002` specifically (it was measured for `42501` via an `anon` call). The **client half is now permanently guarded** by `src/lib/__tests__/chargeDeleteErrorContract.test.js` (PR [#152](https://github.com/natanMeT/ArtValue20/pull/152), merged as `67a53f801053c00ddb0c42f32bc91ee64993f7e9`), which **executes** the shipped function instead of pinning its source text — the previous tests never ran it. Two mutations were measured, not assumed: replacing `engineError` with a bare `throw error` fails the `23514` test, and renaming the RPC argument to `{ chargeId }` fails the call test. Test-only, no production code changed; suite **129 files / 3,748 passed / 0 failed**.

**LIMITS RECORDED, NOT FIXED (declared in the migration header as L1–L3):** the RPC governs **the product's user-initiated path only** — `payments_charge_same_owner_fk` remains **`ON DELETE CASCADE`** and still fires for an owner-role direct table delete and for the `auth.users` cascade, by design (changing it to `RESTRICT` is checked immediately and could break account deletion mid-cascade). A charge that holds payments cannot be deleted at all; correcting money stays on the explicit `DELETE_PAYMENT` path. No audit row is written for a successful delete — the product has no financial audit log yet.

**(HISTORICAL — previous release)** **UI POLISH + DASHBOARD ACTION CARD — RELEASED / LIVE IN PRODUCTION.** **Production `478e4d62` / `index-PcQFaAu-.js`**, Environment Production, branch `main`, commit-hash `83f2dfa` — the **accepted Preview artifact promoted unchanged** (`wrangler` reported **"Uploaded 0 files (12 already uploaded)"**, and Production↔Preview are **7/7 byte-identical by SHA-256**, matching the local `dist/` hashes as well). A **UI-only** slice: it replaces the Dashboard conversion-rate KPI with a truthful near-term action card built **only** from data `fetchAll` already hydrates, and fixes the visible defects behind the QA screenshots. The root cause of most of them was not styling drift but **five component classes that had no definition anywhere in the stylesheet** (`.table`, `.form-row`, `.form-actions`, `.form-error`, `.row-actions`), so Campaigns and Schedule were rendering raw unstyled tables and forms; and a **missing `color-scheme` declaration**, which is why native date/time pickers rendered white on the dark UI. Merge `83f2dfaf46e540df408298b8e918b52630a1e95a` (PR [#144](https://github.com/natanMeT/ArtValue20/pull/144), parents `e80a1341` + the owner-approved head `145c970e`, merged with `--match-head-commit`). **NO migration, NO DB/schema change, NO Edge/Auth/secret/package change** — migrations remain **12 applied of 12 tracked, none pending**; Edge `ai-gateway` v36 ACTIVE / `verify_jwt=true`, untouched. **Current rollback target is now `ad09b631` / `index-QaS25VkC.js`**, verified HTTP 200 after the deploy; `88b20584` is demoted to a historical fallback, retained. Full suite **126 files / 3,681 passed / 0 failed**. Rollback tag `pre-ui-polish-action-card` @ `e80a1341`. Previous session: **SCHEDULE CORE SLICE 1 — RELEASED / LIVE IN PRODUCTION.** **Production `ad09b631-8d70-421c-b3fc-543972b95723` / `index-QaS25VkC.js`**, Environment Production, branch `main`, commit-hash `660f671e` — the **accepted Preview artifact promoted unchanged** (`wrangler` reported **"Uploaded 0 files (12 already uploaded)"**, and Production↔Preview are **12/12 byte-identical by SHA-256**). Delivers `public.appointments`: the product’s **first durable time-of-day entity**, since every existing date in the schema is a `date` with no time of day. One table with a `kind` (`appointment`/`lesson`/`event`), a **stored** outcome `status`, and **two composite same-owner foreign keys** to `clients` and `tasks`, both `ON DELETE SET NULL` **with the column list**. Named `appointments`, deliberately NOT `calendar_events` — "calendar" is already the Growth OS monthly action board (`src/data/growthCalendar.js`), which persists nothing. Merge `660f671ee923e2fdd75a2aed5f2c4979304d7701` (PR [#142](https://github.com/natanMeT/ArtValue20/pull/142), parents `b2bd9c4b` + the owner-approved head `a5804d1b`, merged with `--match-head-commit`). **Migration `20260801120000` APPLIED and VERIFIED LIVE 2026-07-30 on the FIRST attempt — 12 applied of 12 tracked, none pending; `db push --dry-run --linked` = "Remote database is up to date".** It applied first time **because the exact file was executed against a real PostgreSQL 17.6 before the PR was opened** — the rule F1 established after two failed applies — and that rehearsal caught a brittle assertion in this very file, which was rewritten before merge. PART A matched exactly and **every PART B acceptance control was decisive on disposable QA records**, including **`23503` on both same-owner keys**, four `23514` domain refusals, and the column-list `ON DELETE SET NULL` semantics proven by deleting a parent; QA cleanup **verified zero under RLS and RLS-independently**. **Authenticated Preview UI QA PASSED 2026-07-30** with real clicks and typing only, on the isolated QA account (identity verified from the JWT first; the **owner account was never written to**). **Authenticated non-mutating Production smoke PASSED**: cloud mode, `/schedule` renders signed in, `GET /rest/v1/appointments` **200**, **48/48 network requests HTTP 200 and every one a `GET` — 0 writes**, 0 console messages, and row counts **identical before and after**. **Current rollback target is now `88b20584` / `index-BLR2aev7.js`.** Full suite **125 files / 3,658 passed / 0 failed**. Rollback tag `pre-schedule-core-slice1` @ `b2bd9c4`. **No Edge/Auth/secret/package change:** Edge `ai-gateway` v36 ACTIVE / `verify_jwt=true`, untouched. Previous session: **F1 CORE RECEIVABLES SLICE 1 — RELEASED / LIVE IN PRODUCTION.** **Production `88b20584-b375-4073-a762-f91dc2f1a1e8` / `index-BLR2aev7.js`**, Environment Production, branch `main`, commit-hash `c281cda` — the **accepted Preview artifact promoted unchanged** (`wrangler` reported **"Uploaded 0 files (12 already uploaded)"**, and Production↔Preview are **10/10 byte-identical by SHA-256**). Authenticated **non-mutating Production smoke PASSED** on the isolated **QA account B**: cloud mode, Finance renders signed in, KPI/empty state correct, **49/49 network requests HTTP 200 and every one a `GET` — 0 writes**, 0 console messages, and `clients/charges/payments/quotes/transactions/tasks` **identical before and after**. **Current rollback target is now `90a7dc15` / `index-9FYipeQ9.js`.** Preview **`10dbbf8d-d02d-4fcb-8255-6d83a5bff70b`** (branch `f1-preview-110bb1e`, source `110bb1e`, bundle `index-BLR2aev7.js`) — https://10dbbf8d.artvalue-product.pages.dev; the first smoke was **non-mutating and UNAUTHENTICATED** (8/8 assets 200, 0 console messages, **0 REST calls**), and on **2026-07-30 the AUTHENTICATED Preview UI QA PASSED** in a foreground Chrome with **real clicks and real typing only** — the receivables screen was rendered signed in on the isolated **QA account B** (never the **owner account**), a charge of **₪1,000** (service `2026-02-15`, `net60`) showed the computed due date **`2026-04-29` on screen before submit**, a **₪400** payment produced **balance ₪600** and the derived badge **`שולם חלקית`**, cancellation returned the KPIs to ₪0 while **retaining** the payment in actual revenue, and a new payment on the cancelled charge was **refused** (submit disabled in the UI; **`23514`** from `payment_reject_cancelled_charge()` reproduced independently under RLS, with a positive control). **0 console messages of any level**, and QA cleanup **verified zero residue under RLS and RLS-independently**. **Production is UNCHANGED at `90a7dc15` / `index-9FYipeQ9.js`** — the release gate is now the only one left open. Feature merge `56d13ef738c7c01b6fd24c2e7faa988b0a042df9` (PR [#134](https://github.com/natanMeT/ArtValue20/pull/134)), then **two migration-repair merges**: `f4423550a660f5f4b7e3a85fb135d661daf139a0` (PR [#136](https://github.com/natanMeT/ArtValue20/pull/136), head-gated to `7f4e537`) and `601b3c9480cf7a59e999af03a403983d0a90a1a2` (PR [#137](https://github.com/natanMeT/ArtValue20/pull/137), head-gated to `590d987`). **Migration `20260731120000` APPLIED and VERIFIED LIVE 2026-07-30 — 11 applied of 11 tracked, none pending; `db push --dry-run --linked` = "Remote database is up to date".** **It took three apply attempts, and the first two failures are the story of this slice** — the migration had never been executed against a real PostgreSQL before it was merged, so two execution-only defects survived 21 Codex rounds and a 122-file suite (see the box below). PART A matched exactly and **all nine PART B acceptance controls were decisive on disposable QA records**, including **two `23503` refusals**, a **`42703`**, a **`23514`** trigger refusal and the column-list `ON DELETE SET NULL` semantics; QA cleanup **verified zero by query, per-account and RLS-independently**. Full suite **122 files / 3,522 passed / 0 failed**. Rollback tag `pre-finance-receivables-slice1` @ `110baf1`. **No build, no deployment, no Edge/Auth/secret change:** Production remains `90a7dc15` / `index-9FYipeQ9.js`, Edge `ai-gateway` v36 untouched. Previous session: **CAMPAIGNS SLICE 2 (`tasks.campaign_id`) — MIGRATION APPLIED / VERIFIED LIVE / STILL NOT RELEASED.** Merge `8b6a78a792aa019e1d38c3edeb4e629a92de02e5` (PR [#131](https://github.com/natanMeT/ArtValue20/pull/131), parents `735309b` + the owner-approved head `c6b489c`, merged with `--match-head-commit`). **Migration `20260729120000` APPLIED and VERIFIED LIVE 2026-07-30 — 10 applied of 10 tracked, none pending *at that moment*** (today: **11 applied of 11 tracked, none pending**), so the live schema matched `supabase/migrations/**` then and matches it now. `8b6a78a` is the historical anchor for that feature merge, **contained in** `main`; the current `main` HEAD is not pinned here and must be resolved live. PART A (read-only catalog) matched exactly and PART B's five acceptance controls were all decisive on **disposable QA records**, including **both `23503` refusals** (cross-account and nonexistent campaign) and the `on delete set null (campaign_id)` semantics; QA cleanup **verified zero by query**. Codex CLEAN on the merged head; 3 P2s raised, fixed and resolved; 0 unresolved. **No build, no deployment, no Edge/Auth/secret change:** Production remains `90a7dc15` / `index-9FYipeQ9.js`, Edge `ai-gateway` v36 untouched. Full suite 119 files / 3,265 passed / 0 failed *at the merged head*. Rollback tag `pre-campaigns-slice-2` @ `735309b`. Previous session: **REVOKE `anon` EXECUTE ON THE QUOTA COUNTERS — CLOSED (migration-only).** Merge `a8501c3da902cc37c4ad52b701ad25dceae91f6e` (PR [#129](https://github.com/natanMeT/ArtValue20/pull/129), parents `c2a076b` + the owner-gated head `3c4f432`). Migration **`20260728130000` APPLIED and verified live — 9 applied of 9 tracked *at that moment*** (today: **11 applied of 11 tracked, none pending**); checker CLEAN. **`anon` → EXECUTE denied on all three counters; `authenticated` → retained.** Behavioural proof, not just the ACL flag: an `anon` call to `campaign_row_count()` returned **`0`** before and raises **`42501 permission denied`** after. **NO frontend change, therefore NO build and NO deployment: Production remains `90a7dc15-1ed1-4d2a-ad6e-9044c786334c` / `index-9FYipeQ9.js` (source `97b4229`), current rollback target remains `5bcf1ef0`, Edge `ai-gateway` v36 untouched.** Full suite 118 files / 3,227 passed / 0 failed. Rollback tag `pre-revoke-anon-counter-execute` @ `c2a076b`. **The closure box in the Baseline below remains the authoritative RELEASE state — this slice did not change it.**

> ### ✅ CAMPAIGN DELETE SAFETY — **CLOSED / LIVE IN PRODUCTION** (merge + Preview + owner visible-browser QA + Production release 2026-07-31)
>
> **THE DEFECT.** `deleteCampaign` ran straight from the button's `onClick`. Combined with the FK's
> `on delete set null (campaign_id)`, **one click deleted a campaign and silently unlinked every task attached
> to it** — no confirmation of any kind, no warning, no undo. Found during the Campaigns Slice 3 Preview QA.
>
> | | |
> |---|---|
> | Merge | `fc05c19f894b8a0521825abf1bddce3c98586b49` — PR [#157](https://github.com/natanMeT/ArtValue20/pull/157), head-gated to `cb1555f0` with `--match-head-commit` |
> | Files | **4** (+188 / −4): `src/pages/Campaigns.jsx`, `src/lib/campaigns.js`, `src/lib/__tests__/campaigns.test.js`, and a new `src/pages/__tests__/campaignDeleteConfirm.test.js` |
> | Migration | **NONE — frontend-only, no database object touched.** Migrations remain **13 applied of 13 tracked, none pending** |
> | Behaviour | `מחק` opens the existing `ConfirmDialog`. With known links: *"המשימות המקושרות לא יימחקו — אבל הקישור שלהן לקמפיין יוסר, ולא ניתן לשחזר אותו. ידועות N משימות מקושרות."* With none: *"הפעולה אינה הפיכה."* |
> | ⚠️ A WARNING, never a GATE | The delete is offered **whatever the count is**; nothing is disabled or short-circuited by it. A client-side count **cannot enforce** — the Finance charge-delete slice is the precedent for putting a real rule in the database, and this deliberately is not one. **Two assertions pin that the count never becomes a refusal**, so a later change cannot quietly turn a warning into a guard that lies when the snapshot is stale |
> | ⚠️ "ידועות N", never "בדיוק N" | The count reads `data.tasks`, the client's hydrated snapshot, so it can **under-report** a task linked in another tab or session since the last `fetchAll`. The wording stays true when N is short. Same weakness the charge-delete slice documented; the difference is that here it is advisory, so under-reporting is cosmetic rather than a data-safety hole |
> | Implementation | `countTasksForCampaign` is a **pure exported function** in `src/lib/campaigns.js`, so the logic that computes something is **EXECUTED** in tests rather than source-pinned. It guards a real trap: a blank campaign id must count **zero**, not match every *unlinked* task (`str(null) === ''`). **No new query** — the count reads already-hydrated data |
> | ✅ Preview | **`58d664a4`** (branch `cds-qa-preview-5bea9ee`, source `5bea9ee`, bundle `index-CZQwY28c.js`) — https://58d664a4.artvalue-product.pages.dev |
> | ✅ Owner visible-browser QA | **PASSED 2026-07-31**, run by the owner in a **real, visible browser** — deliberately not in the automated pane, for the reason in the QA-METHOD WARNING below. Dialog opens before deletion; **cancel closes it and the page remains clickable**; **no invisible overlay and no click-blocking after close**; a campaign with linked tasks shows the warning with the **correct `ידועות N`**; confirm deletes the campaign; **linked tasks survive and show `—`**; modal fade/close normal |
> | ✅ QA residue | **Zero, verified RLS-INDEPENDENTLY** by service-role query after cleanup: `campaigns` **0** (QA-prefixed **0**), `tasks` **0** (QA-prefixed **0**), and `charges` / `payments` / `transactions` / `quotes` / `appointments` all **0**. `clients` = **3**, the owner's pre-existing real baseline — **not residue**; no client was ever created by QA |
> | Deploy | **Promoted unchanged, NO rebuild.** **Production `c2bb560e-a562-4a00-b90f-15b4e4711ac7`** (branch `main`, source `5bea9ee`) — https://c2bb560e.artvalue-product.pages.dev, canonical https://artvalue-product.pages.dev. Entry bundle **`index-CZQwY28c.js`** SHA256 `638fab8519296508c7693780ad0013a8aeaa87fe11fb69afe1dee8b0120eae88` (766,629 B), CSS `index-C2xFwEsP.css`. `wrangler` reported **"Uploaded 0 files (12 already uploaded)"**, and the **served** Production bundle hashes **byte-identical** to the artifact the owner QA'd |
> | Production smoke | **Unauthenticated, non-mutating. PASS.** Canonical HTTP 200; `wrangler pages deployment list` confirms `c2bb560e` is the current Production deployment (Environment Production, branch `main`, source `5bea9ee`); served bundle SHA-256 matches the accepted artifact. ⚠️ **The first canonical fetch returned the OLD bundle — edge cache, not a failed promotion**; with `Cache-Control: no-cache` and a cache-busting query it serves `index-CZQwY28c.js`. **THIRD consecutive release to show this — it is settled edge behaviour, not a symptom** |
> | Rollback | **Frontend target `bc0aa2a2` / `index-BL6kQf-e.js`**, HTTP 200 confirmed after the deploy, still serving its own bundle; `86d5cca9` demoted to a historical fallback, retained. **NO git rollback tag was created for this release** — stated rather than implied. A frontend rollback is complete: this slice added no database object |
> | Tests | Full suite **131 files / 3,783 passed / 0 failed**, re-run on the merged `main`. Build green |
>
> ### ⚠️ QA-METHOD WARNING — THE MODAL DETOUR, AND WHY IT COST A RELEASE CYCLE
>
> **Recorded so it is not rediscovered the same expensive way.** During this slice's Preview QA, Claude
> reported a severe app-wide defect: an invisible `.modal-overlay` that survived close, intercepted every
> click and left the screen "click-dead until reload". On that basis the Production release was **blocked**
> and a companion fix was written and merged — PR [#158](https://github.com/natanMeT/ArtValue20/pull/158),
> merge `274f554e` (a `key` on the `AnimatePresence` child plus `pointerEvents: 'none'` on exit).
>
> **The defect was not real.** It was an artifact of the automated browser pane, which is **hidden**:
> `document.visibilityState: "hidden"`, and **`requestAnimationFrame` fired 0 frames in 1 second**.
> framer-motion drives all animation off rAF, so in that pane enter animations never run (modals sit at
> `initial` opacity 0) and **exit animations never complete, so `AnimatePresence` never unmounts the node** —
> producing exactly the "stuck invisible overlay" that was reported. The earlier "control" (the same symptom
> on `TaskModal`, untouched code) proved nothing, because everything in the pane was frozen.
>
> **PR #158 was fully reverted** by PR [#159](https://github.com/natanMeT/ArtValue20/pull/159), merge
> `5bea9eed`. `src/components/ui/Modal.jsx` is **byte-identical to its pre-#158 state** (verified: empty
> `git diff` against `fc05c19f`), the phantom-driven test file was deleted, and the suite returned to its
> pre-#158 count of **3,783**. The rebuilt artifact was byte-identical too, which is why the Production
> promotion reported "Uploaded 0 files". The `key` was **not** kept: three long-shipped `AnimatePresence`
> usages in this repo have the identical **unkeyed single-conditional-child** pattern with no such issue —
> `src/components/ai/Assistant.jsx:983`, `:1011`, and `src/components/ai/DemoMode.jsx:130`. Keys are required
> for *lists* and `mode="wait"` swaps (why `Toaster` keys by id and `App.jsx` keys route transitions), not for
> a single conditional child.
>
> **THE DURABLE RULE: in the automated browser pane, ANY conclusion that depends on an animation completing
> is unreliable.** DOM and data assertions are sound there — element presence, text content, row counts,
> network calls, console output — and everything this slice actually verified that way held up. But
> visibility, transitions, fade state and unmount-after-exit **must be checked in a real, visible browser**.
> Probe it cheaply before trusting such a result: `document.visibilityState` and an rAF frame count.
>
> ❌ **RETIRED FOLLOW-UP:** the `src/components/ai/DemoMode.jsx:130` "unkeyed overlay" item raised during the
> detour is **withdrawn** — it was a latent instance of a bug that does not exist. No action needed.
>
> ---
>
> ### ✅ (HISTORICAL — previous release) CAMPAIGNS SLICE 3 (`tasks.campaign_id` surfaced) — **CLOSED / LIVE IN PRODUCTION** (merge + Preview + authenticated Preview UI QA + Production release 2026-07-31)
>
> **THE SCHEMA WAS ALREADY LIVE; THE PRODUCT WAS NOT.** Campaigns slice 2 applied `public.tasks.campaign_id`
> and its composite FK `(campaign_id, user_id) → public.campaigns (id, user_id)` on 2026-07-30. Until this
> slice there were **0 occurrences of `campaign_id` anywhere in `src/`** — `TASK_FIELDS` never wrote it and
> `rowToTask` never read it, so the column existed, was correct, and could not be used. This slice is the
> client half, and nothing else: **frontend-only, no migration, no DB change, no Edge/Auth/secret/package
> change.**
>
> | | |
> |---|---|
> | Merge | `669e8daa6431ce4a2d90470ad1614bcc72dec316` — PR [#155](https://github.com/natanMeT/ArtValue20/pull/155), head-gated to `395c7b0d26f386166f98c43bf007a8762a3f936a` with `--match-head-commit` |
> | Files | **6** (+270 / −12): `src/lib/api.js`, `src/components/forms/TaskModal.jsx`, `src/pages/Tasks.jsx`, `src/lib/__tests__/apiTaskMapping.test.js`, `src/pages/__tests__/tasksBetaContainment.test.js`, and a new `src/pages/__tests__/tasksCampaignLink.test.js`. **`src/store/store.jsx` was in scope and deliberately NOT touched** — `ADD_TASK`/`UPDATE_TASK` spread the payload with no whitelist, so nothing there needed to change |
> | Migration | **NONE — this slice touches no database object.** Migrations remain **13 applied of 13 tracked, none pending** |
> | Behaviour | Optional `קמפיין` picker in the task modal, first option `ללא קמפיין`; campaign title (or `—`) per row in the Tasks list; the link is never required. The picker follows the **exact `clients` precedent** — the prop defaults to `[]` and the control renders only where a caller supplies a list, so the frozen **ProjectDetail caller is untouched** and **Jake task creation is untouched** |
> | Campaign load | **Page-local and fail-soft, deliberately NOT part of `fetchAll`** — a `listCampaigns` failure must never be able to break app hydration. Campaigns are cloud-only, so in local/demo the fetch never runs, the list stays empty, and the picker and column are **absent** rather than empty controls implying a missing feature |
> | ⚠️ Defect found and fixed #1 | **`''` into a `uuid` column.** `mapToRow` passes `''` straight through and `nullifyBlankDates` is deliberately date-scoped, so an unselected campaign would have reached PostgreSQL as `''` and failed **`22P02`** — *before* the FK was ever consulted, surfacing as a raw driver error rather than a domain refusal. The form coerces (`campaignId \|\| null`) **and** a new `nullifyBlankUuids` coerces again at the DB boundary, so any other caller is safe by construction rather than by remembering |
> | ⚠️ Defect found and fixed #2 | **An import regression introduced BY this slice, caught before merge.** Adding `campaignId` to `TASK_FIELDS` made `buildBulkTaskRows` carry an imported task's **original** campaign id through unmapped. There is no `campaignIdMap` — campaigns are not part of the import — so that id names a campaign the account does not own and the composite FK would have refused the **entire import** with **`23503`**, breaking a path that worked before. `campaign_id` is now forced to `null` on import; imported tasks arrive unlinked. Pinned by a named regression test |
> | Test assertion narrowed | `tasksBetaContainment.test.js` asserted `src.includes('isSupabaseConfigured') === false`. That over-reached: it banned the **identifier**, when what S0B established is that Tasks must not be **gated** on cloud mode. Slice 3 reads the flag for the cloud-only campaign fetch, so the assertion now pins the real rule — the flag may be read, never to short-circuit the page or a mutation. **Recorded because weakening a guard to make one's own change pass is exactly what deserves review scrutiny** |
> | ✅ Preview | **`963b89e2`** (branch `campaigns-slice3-preview-669e8da`, source `669e8da`, bundle `index-BL6kQf-e.js`) — https://963b89e2.artvalue-product.pages.dev |
> | ✅ Authenticated Preview UI QA | **6 of 6 PASSED 2026-07-31** on the isolated QA account `natanturgeman5@gmail.com` (owner signed in manually; the password was never seen or entered by Claude). (1) A task with **no** campaign saves cleanly — no `22P02`. (2) A linked task shows the campaign title in the `קמפיין` column, correctly aligned as the 4th cell. (3) Editing a linked task **preselects** its campaign. (4) Switching to `ללא קמפיין` saves, toasts `המשימה עודכנה`, renders `—`, **and survives a full reload** — so `null` reached the database, not just local state. (5) With **0 campaigns** the picker, the header and the column are all **absent**; all three appeared the moment campaigns existed. (6) Deleting the linked campaign leaves the task at `—` after reload — no error, no crash, no orphan. **0 console messages of any level** across the entire session |
> | ✅ QA residue | **Zero, verified.** 2 tasks + 2 campaigns created, all `S3_QA_`-prefixed, all deleted. Fresh server hydration afterwards: **0 tasks, 0 campaigns (`0/200`)**, and no `S3_QA` string anywhere in the DOM. **No pre-existing row was touched** |
> | Deploy | **Preview, then Production — ONE build total, promoted unchanged.** **Production `bc0aa2a2-6569-4c2f-a16a-4ebd2deaf734`** (branch `main`, source `669e8da`) — https://bc0aa2a2.artvalue-product.pages.dev, canonical https://artvalue-product.pages.dev. Entry bundle **`index-BL6kQf-e.js`** SHA256 `25174190a20217ea07152362eafb996570c04cdb3a2d57da8f4e2b4e489ad7c4` (766,033 B), CSS `index-C2xFwEsP.css`. **NO rebuild** — `wrangler` reported **"Uploaded 0 files (12 already uploaded)"**, and the **served** bundle hashes **byte-identical** to the accepted artifact |
> | Production smoke | **Unauthenticated, non-mutating. PASS.** Canonical HTTP 200; `wrangler pages deployment list` confirms `bc0aa2a2` is the current Production deployment (Environment Production, branch `main`, source `669e8da`); the served entry bundle is SHA-256 identical to the accepted artifact. ⚠️ **The first canonical fetch returned the OLD bundle — edge cache, not a failed promotion**; with `Cache-Control: no-cache` and a cache-busting query it serves `index-BL6kQf-e.js`. **This is the second consecutive release to show it, so it is expected edge behaviour rather than a new symptom** |
> | Rollback | **Frontend target `86d5cca9` / `index-o0xZrfkL.js`**, HTTP 200 confirmed after the deploy, still serving its own bundle; `c45518fb` demoted to a historical fallback, retained. **NO git rollback tag was created for this release** — stated rather than implied, since several previous releases carried one. A frontend rollback is complete for this slice: it added no database object, so there is nothing to un-apply |
> | Tests | Full suite **130 files / 3,769 passed / 0 failed**, re-run on the merged `main`. Build green. The data contract — `''` → `null`, the mapping, the hydration and the import guard — is **EXECUTED** against the real functions in `apiTaskMapping.test.js` |
>
> **⚠️ TEST-COVERAGE LIMIT, STATED NOT GLOSSED.** This repo has **no jsdom and no `@testing-library`**, so a React
> component cannot be rendered in tests; the page-test convention is **source pinning**, which is weaker than
> execution — PR [#152](https://github.com/natanMeT/ArtValue20/pull/152) replaced exactly that kind of pin for
> `api.deleteCharge` after finding it had never run the function. The JSX wiring in `tasksCampaignLink.test.js`
> is therefore **pinned, not executed**. What closes the gap for this release is the owner-driven Preview UI QA
> above, not the unit suite.
>
> ### 🔎 TWO FOLLOW-UPS FOUND DURING QA — ONE CLOSED, ONE **WITHDRAWN AS FALSE**
>
> **1. Campaign delete has NO confirmation at all.** Not a native `confirm()`, not a dialog — one click on
> `מחק` and the campaign is gone. Combined with the FK's `on delete set null`, a single misclick silently
> deletes a campaign **and unlinks every task attached to it**, with no warning and no undo.
> ✅ **CLOSED 2026-07-31 by Campaign Delete Safety** (PR [#157](https://github.com/natanMeT/ArtValue20/pull/157),
> Production `c2bb560e` / `index-CZQwY28c.js`) — see the box at the top of this document.
>
> **2. ~~Dialogs stay open after a successful mutation.~~ ❌ WITHDRAWN — THIS FOLLOW-UP WAS FALSE.**
> It claimed the task modal stayed open after a successful save, and asserted it had been *"proven"*
> pre-existing by a control on the delete path. **Both the finding and the control were wrong.** The symptom
> was an artifact of the QA harness, not of the product: the browser pane driving that QA was **hidden**
> (`document.visibilityState: "hidden"`) and fired **0 `requestAnimationFrame` frames per second**.
> framer-motion drives every animation off rAF, so enter animations never ran (modals sat at `initial`
> opacity 0 and looked "stuck"/invisible) and **exit animations never completed, so `AnimatePresence` never
> unmounted the node**. The "control" proved nothing precisely because *everything* in that pane was frozen.
> **Owner verification in a real, visible browser on 2026-07-31 found no such behaviour** — modals opened,
> closed and faded normally, and the page stayed clickable. **Do not plan work against this item.**
> The full detour is recorded in the QA-METHOD WARNING below.
>
> ---
>
> ### ✅ (HISTORICAL — previous release) FINANCE CHARGE SAFE DELETE — **FULLY CLOSED / LIVE IN PRODUCTION** (applied + Preview + owner UI QA + Production release 2026-07-30; stale-tab refusal + authenticated Production smoke 2026-07-31 — **no open items remain**)
>
> **THE RULE: deleting a charge must never destroy a payment.** A charge may be deleted **only if no payment
> row belongs to it**. This closes F1 gap (a) — `deleteCharge` existed end-to-end but nothing called it.
>
> **WHY EXPOSING THE EXISTING FUNCTION WOULD HAVE BEEN A DEFECT, NOT A FEATURE.**
> `payments_charge_same_owner_fk` is **`ON DELETE CASCADE`**, so the old
> `from('charges').delete()` silently destroyed every payment attached to the charge. Payments are the
> **source of truth for received revenue**, so losing one moves "הכנסה בפועל" and cannot be undone.
>
> 📌 **WHY A UI GATE COULD NOT ENFORCE IT — the reason this slice carries a migration.** The obvious gate,
> `received === 0`, is a **SUM over rows the client happens to hold**, and it reads `0` while a payment row
> genuinely exists: when the row was dropped by `normalizePaymentRow` (unparseable amount, missing id), when
> the payment was recorded after the last `fetchAll` (another tab, device, session), and in the window
> between the confirm click and the `DELETE`. The database rules out the *arithmetic* cases —
> `payments_amount_positive` is `check (amount > 0)` on `numeric(14,2)`, so a `0`, a negative and a
> net-zero sum are all impossible — but **none of those three cases are addressed by that CHECK**. So the
> client gates on **row EXISTENCE**, and the server enforces.
>
> **`public.delete_charge_if_unpaid(p_charge_id uuid)`** — `SECURITY DEFINER`, `set search_path = ''`,
> ownership from `auth.uid()`. It (1) takes the charge `FOR UPDATE` **and** checks ownership in one
> statement, (2) refuses if `exists (select 1 from public.payments where charge_id = …)`, (3) deletes with
> ownership repeated on the statement itself.
>
> 📌 **`SECURITY DEFINER` IS LOAD-BEARING HERE, NOT A CONVENIENCE.** Under `SECURITY INVOKER` the payments
> existence check would be **RLS-filtered** — a row the caller cannot see would read as "no payments" and be
> cascaded away, which is the exact defect the function exists to prevent. The cost is that RLS no longer
> scopes the charge either, so ownership is enforced **explicitly** and derived from the session, never from
> an argument. The payments check is deliberately **not** filtered by `user_id`: a row that somehow violated
> the composite FK must still **block** the delete rather than be filtered out of the check.
>
> 📌 **CROSS-ACCOUNT NON-DISCLOSURE.** "Does not exist" and "belongs to another account" raise the
> **identical error from a SINGLE raise site** (`P0002`), and the ownership check runs **before** the
> payments check — so the function is not an existence oracle for other accounts, and nothing about their
> payments is observable. Proven on both the SQLSTATE **and the message text**.
>
> 📌 **RACE SAFETY WAS MEASURED, NOT ASSERTED.** `FOR UPDATE` conflicts with the **`FOR KEY SHARE`** a
> concurrent payment `INSERT` takes on the parent row via the FK. Both interleavings are safe: lock-first →
> the INSERT blocks, we delete, it then fails `23503`; insert-first → we block, then see the payment and
> refuse `23514`. On real PostgreSQL 17.6, two concurrent sessions: the INSERT blocked **5.97 s** against a
> held lock versus **0.01 s** with no holder.
>
> **REJECTED ALTERNATIVES, recorded so the next person meets the reason.** FK `CASCADE` → `RESTRICT`: both
> tables' `user_id` are `references auth.users on delete cascade`, and RESTRICT is checked immediately, so it
> could fail the auth-user cascade mid-way and **break account deletion**; it also contradicts the CASCADE
> semantics the reducer, the import path and existing tests all mirror. A `BEFORE DELETE` trigger fires on
> that same cascade with no clean way to tell a user delete from a cascade. **Neither closes the race.**
>
> 📌 **THE RULE THAT MADE IT APPLY FIRST TIME, AND WHAT IT CAUGHT.** The exact file was executed against a
> real PostgreSQL 17.6 **before the PR was opened** — the rule F1 established after two failed applies. The
> rehearsal **failed on its own postflight**: it asserted `proconfig @> array['search_path=']`, but
> PostgreSQL stores `set search_path = ''` as **`search_path=""` WITH the quotes**, so the assertion was
> false for a correctly hardened function. Corrected to match the parsed value before merge, and pinned by a
> test. The same wrong literal sits in a **comment** in `20260726120000_atomic_quote_persistence.sql`.
>
> | | |
> | --- | --- |
> | PR | [#150](https://github.com/natanMeT/ArtValue20/pull/150) — **MERGED 2026-07-30T19:46:08Z**, merge commit `1eb7b2abd44249da83f1c4891d4a5d3fcd44a88c` (parents `2c9bec42df536c2c44866d7a13ee423bc1db1568` + the owner-approved head `0db561a8aaa74ed6d3cc012a304f3436a91c6e10`, merged with `--match-head-commit`) |
> | Migration | `20260802120000_charge_delete_guard.sql` — **APPLIED and VERIFIED LIVE 2026-07-30, FIRST attempt.** **13 applied of 13 tracked, none pending**; `db push --dry-run --linked` = **"Remote database is up to date"**. Additive and idempotent: one function plus its grants. **NO table, column, constraint, policy or data change** — pinned by a test that the only DML in the file is `delete from public.charges` |
> | Files | **6** (+667 / −7): the migration, `src/lib/api.js`, `src/pages/Finance.jsx`, `src/pages/__tests__/financeReceivables.test.jsx`, a new `src/lib/__tests__/chargeDeleteGuardMigration.test.js`, and `src/lib/__tests__/scheduleMigration.test.js`. **`src/store/store.jsx` was in scope and deliberately NOT touched** — `DELETE_CHARGE` was already routed and its failure path already renders `userFacingError` |
> | Allowlist deviation | `scheduleMigration.test.js` asserted `files[files.length - 1] === '20260801120000_…'` — that Schedule's migration is the **last file in the directory forever**, so **any** new migration fails an unrelated slice's test. Changed to assert what it meant (Schedule contributed exactly one file, sorting after F1). Test-only, no behaviour. **Raised before merge and explicitly approved by the owner** |
> | Grants | `authenticated` EXECUTE **yes**; `anon` **no**; `PUBLIC` **no**. `revoke … from public` alone is NOT sufficient — Supabase's default privileges grant EXECUTE to `anon`, the omission that shipped twice before (`20260728130000`). `securityDefinerGrants.test.js` is a **class guard** and picked the new function up **with no edit** |
> | ✅ DB acceptance | **19/19 PASS** on disposable QA records, whole run inside a **rolled-back** transaction. Unpaid charge deleted; charge **with** a payment refused **`23514`** with **both the charge and its payment surviving**; cross-account **`P0002`**; nonexistent id **`P0002`** with a **byte-identical message**; `prosecdef true`; `proconfig search_path=""`; identity args `p_charge_id uuid`; `anon` false / `authenticated` true / `PUBLIC` false; `payments_charge_same_owner_fk` still `confdeltype='c'` |
> | ✅ HTTP-path control | `POST /rest/v1/rpc/delete_charge_if_unpaid` as **anon** → **HTTP 401**, `{"code":"42501","message":"permission denied for function delete_charge_if_unpaid"}`. Two facts measured, not reasoned: the `anon` revoke holds **end-to-end over HTTP**, and **PostgREST passes the raw SQLSTATE through verbatim as `code`** — the mechanism `api.deleteCharge` depends on |
> | ✅ Owner Preview UI QA | **PASSED 2026-07-30** on the isolated **QA account** (`natanturgeman5@gmail.com`), owner-driven. Unpaid open charge **shows** the delete control; after recording a payment the control **is withdrawn**; deleting the payment **brings it back**; unpaid charge deletes after confirm; a **cancelled + unpaid** charge is still deletable; a charge **with** a payment offers cancel/reopen but **not** delete; the payment stays recorded and still counts correctly after cancel/reopen. **The owner account was never written to** |
> | ✅ Stale-tab refusal | **EXERCISED AND PASSED 2026-07-31** — carried for one day as an accepted cosmetic gap, now closed. Owner-driven two-tab run on QA account `natanturgeman5@gmail.com`: same charge in two tabs, payment recorded in tab B, then the **row trash icon 🗑️** clicked in tab A (**not** the cancel ✕). Server **refused**; **charge stayed visible**; **payment stayed recorded**; **no success toast**; the **specific** message **"לחיוב הזה רשומים תשלומים…"** rendered, not the generic fallback. This is the one path that proves `23514` survives the PostgREST → `supabase-js` hop as `error.code`. Cleanup through the UI (payment first, then charge); **zero residue verified read-only** as the owner role — `charges_total = 0`, `payments_total = 0` |
> | ✅ Client contract, executed | `src/lib/__tests__/chargeDeleteErrorContract.test.js` — PR [#152](https://github.com/natanMeT/ArtValue20/pull/152), merged `67a53f801053c00ddb0c42f32bc91ee64993f7e9`, **test-only, no production code changed**. The earlier tests pinned `api.deleteCharge` by **source text** and never ran it. This one executes it: the RPC call **including the argument name** (PostgREST resolves by name — a rename would 404 live while every source-text assertion still passed), `23514` → the payments-exist message, `P0002` → the not-found message **and** an assertion that it leaks nothing about ownership, unknown/absent code → generic fallback, success → `true`. **Mutations measured:** `engineError` → `throw error` fails the `23514` test; `{ p_charge_id }` → `{ chargeId }` fails the call test; `api.js` restored byte-identical. Suite **129 files / 3,748 passed / 0 failed** |
> | Deploy | **Preview, then Production — ONE build total, promoted unchanged.** Preview **`5a9e7277`** (branch `charge-delete-preview-1eb7b2a`, source `1eb7b2a`) — https://5a9e7277.artvalue-product.pages.dev. **Production `86d5cca9-88e2-40db-9869-664cfc1567e8`** (branch `main`, source `1eb7b2a`) — https://86d5cca9.artvalue-product.pages.dev, canonical https://artvalue-product.pages.dev. Entry bundle **`index-o0xZrfkL.js`** SHA256 `12479eedfcae2e93392cdc4fd151509bd95b56136fccf4ecb44f89a9947abfe8` (765,155 B), CSS `index-C2xFwEsP.css`. **NO rebuild** — `wrangler` reported **"Uploaded 0 files (12 already uploaded)"**, and local `dist/` ↔ Preview ↔ Production are **12/12 byte-identical by SHA-256** |
> | Production smoke | **Unauthenticated, non-mutating.** Canonical **HTTP 200**; served `index.html` and `assets/index-o0xZrfkL.js` SHA-256 **identical** to the accepted artifact; `wrangler pages deployment list` confirms `86d5cca9` is the current Production deployment. ⚠️ **The first canonical fetch returned the OLD bundle — edge cache, not a failed promotion**; with `Cache-Control: no-cache` and with a cache-busting query it serves `index-o0xZrfkL.js`. *(Superseded: the authenticated smoke below was carried as the last open item and is now closed.)* |
> | ✅ Authenticated Production smoke | **PASSED 2026-07-31 — non-mutating, read-only, the last open item on this slice.** Owner signed in manually on the isolated QA account `natanturgeman5@gmail.com`; **Claude never saw or entered the password**. **Cloud mode confirmed** — live session against Supabase project `weciwurjfwmqihcyexzj` (`sb-weciwurjfwmqihcyexzj-auth-token` present), not demo/memory-only. Canonical https://artvalue-product.pages.dev served **`assets/index-o0xZrfkL.js`** = Production `86d5cca9`. **Finance (`#/finance`) rendered fully signed in**: totals, cashflow chart, net-profit chart, transactions panel and the charges panel empty state. **Console CLEAN — zero messages of any level** across login, Dashboard, Finance and two route switches. **No network writes:** 19 Supabase requests total, **18 read-shaped `/rest/v1/<table>?select=*&order=…`**, **zero `/rest/v1/rpc/` calls of any kind — so `delete_charge_if_unpaid` was never invoked**; the single non-select request is `/auth/v1/token?grant_type=password`, the owner's own manual login. Request count was **19 before and 19 after** the dwell and both route switches — the session emitted no further traffic. **No data changes: charges 0 → 0, payments 0 → 0, transactions 0 → 0**, all monetary totals ₪0 before and after. **Residue: none in data** (an in-page log-only fetch/XHR shim was installed for evidence; it captured 0 calls and is wiped by any reload) |
> | ⚠️ What this smoke does and does not cover | Recorded so the coverage split is not overstated. **The QA account was EMPTY** (0 charges / 0 payments), so the smoke covers **cloud auth + Finance load under a real session + zero writes** — it does **NOT** re-exercise the delete guard against real rows. **The delete guard is covered by the prior owner-driven QA instead**: the Preview UI QA row and the stale-tab refusal row above. Second limit: **the GET conclusion is inferred, not captured.** The browser pane's network recorder logged only the document and static assets, so the request list was reconstructed from `PerformanceResourceTiming`, which exposes URLs but **not HTTP verbs**; the read-only conclusion rests on the PostgREST `select=…&order=…` signature plus the absence of any RPC or bare-table endpoint. Strong, but one inferential step short of a captured verb — unlike the previous three releases, whose smokes asserted the method directly (e.g. "48/48 … every one a `GET`") |
> | QA residue | **Zero, verified twice.** All controls ran inside rolled-back transactions; the one committed race-test charge was deleted and verified. After the owner's Preview QA two charges + two payments remained on the QA account — **reported, and cleared by the owner** — then re-verified as the owner role (RLS-independent): `charges_total = 0`, `payments_total = 0`. Back to the exact pre-slice baseline |
> | Rollback | **Frontend target `c45518fb` / `index-B21Es_EZ.js`**, HTTP 200 confirmed. Git tag `pre-charge-safe-delete` @ `2c9bec42`. ⚠️ **A frontend rollback does NOT remove the function** — the migration is additive and stays applied; nothing older calls it, so it is inert. A DB rollback would need its own `drop function` migration, which was **not** written |
> | Tests | Full suite **128 files / 3,738 passed / 0 failed**. The decisive new test: a charge where `chargeReceived() === 0` **but a payment row exists** must still hide the control — the sum-based gate is the defect being guarded |
>
> ---
>
> ### ✅ UI POLISH + DASHBOARD ACTION CARD — **CLOSED / LIVE IN PRODUCTION** (merge + Preview + authenticated UI QA + Production release 2026-07-30)
>
> A **UI-only** slice. It replaces the Dashboard **conversion-rate KPI** with a truthful near-term action
> card, and fixes the visible layout/theming defects found in the QA screenshots.
>
> **WHY THE CONVERSION CARD WENT.** It was a percentage over quote statuses — a number nobody acted on, and
> on the real quote counts this product holds it read 0% or 100%. It is replaced by a **`דורש טיפול`** count
> tile and a **`מה דורש טיפול`** panel: overdue tasks, tasks due today, overdue open charges with the open
> balance, and clients with no planned next action.
>
> **THE CARD IS BUILT ONLY FROM DATA ALREADY HYDRATED.** It reads `data.tasks`, `data.clients`,
> `data.charges` and `data.payments` — all of which `fetchAll` already loads — and reuses the shared
> `isChargeOpen` / `decorateCharge` definitions, so cancelled and fully-paid charges are excluded by the same
> rule the Finance screen uses. **No fetch, no new table, no schema.** A row whose count is zero is **not
> rendered**, because an always-present "0 …" line trains the eye to skip the card.
>
> 📌 **THE DIARY IS DELIBERATELY EXCLUDED, AND THE CARD SAYS SO ON SCREEN.** `public.appointments` is live,
> but it is **not part of `fetchAll`**, so the store holds no diary rows on the Dashboard. Rendering
> "0 appointments today" from an unloaded source would be a **false claim** — the S0A rule applied to a
> read surface. The card states the exclusion instead. Wiring the diary into the Dashboard is its own slice.
>
> **THE ROOT CAUSE OF THE SCREENSHOTS WAS NOT STYLING DRIFT.** Five component classes — `.table`,
> `.form-row`, `.form-actions`, `.form-error`, `.row-actions` — **had no definition anywhere in the
> stylesheet**, so Campaigns and Schedule rendered raw unstyled browser tables and forms. Separately,
> **`color-scheme` was never declared**, which is why native date/time pickers rendered white on the dark UI —
> the inputs themselves were not the defect. Both are fixed centrally rather than per-screen, so the next
> date field somebody adds inherits the fix.
>
> | | |
> | --- | --- |
> | PR | [#144](https://github.com/natanMeT/ArtValue20/pull/144) — **MERGED 2026-07-30T13:37:55Z**, merge commit `83f2dfaf46e540df408298b8e918b52630a1e95a` (parents `e80a1341ba5742108c97e755879cc396f405e384` + the owner-approved head `145c970ee4c8f1997584b22a9cddc44e9e3d3791`), merged with `--match-head-commit` so a moved head would have failed the merge |
> | Migration | **NONE — this slice touches no database object.** Migrations were **12 applied of 12 tracked, none pending** *at that release* (today: **13 of 13**, after `20260802120000`); `db push --dry-run --linked` = **"Remote database is up to date"**, verified at that session's preflight |
> | Rollback tag | `pre-ui-polish-action-card` @ `e80a1341` |
> | Branch | `feat/ui-polish-action-card` — retained |
> | Files merged | **11** (+582 / −14): `src/index.css`, `src/styles/app.css`, `src/pages/Dashboard.jsx`, `Schedule.jsx`, `Campaigns.jsx`, `Assets.jsx`, `Pipeline.jsx`, `src/components/forms/ClientModal.jsx`, `AppointmentModal.jsx`, `src/components/layout/Sidebar.jsx`, and one new test file |
> | Frozen-file exception | **`src/components/layout/Sidebar.jsx` — ONE line, owner-authorized** (method §15 minimal exception). The global CTA read as a new-lead action while sitting above every module; it now reads `לקוח חדש`. **Label only** — same button, same `navigate('/intake')`, same class, same icon |
> | Review | **Self-review only — NO Codex this slice, by owner instruction.** 0 reviews, 0 comments, 0 unresolved threads at merge |
> | Tests | Full suite **126 files / 3,681 passed / 0 failed** (from 125 / 3,658). **23 added**; **9 negative controls**, each measured failing when its fix is reverted |
> | Deploy | **Preview, then Production — ONE build total, promoted unchanged.** Preview **`e31c6cbf`** (branch `uipolish-preview-83f2dfa`, source `83f2dfa`) — https://e31c6cbf.artvalue-product.pages.dev. **Production `478e4d62`** (branch `main`, commit-hash `83f2dfa`) — https://478e4d62.artvalue-product.pages.dev, canonical https://artvalue-product.pages.dev. Entry bundle **`index-PcQFaAu-.js`**, CSS `index-C2xFwEsP.css`. **NO rebuild:** the same `dist/` was deployed, `wrangler` reported **"Uploaded 0 files (12 already uploaded)"**, and Production↔Preview are **7/7 byte-identical by SHA-256** — the served hashes also match the local `dist/` hashes, so local, Preview and Production are the same artifact three ways. **NO Edge/Auth/secret/package change** |
> | ✅ Authenticated Preview UI QA | **PASSED 2026-07-30** on the isolated **QA account** — identity verified **from the JWT access-token payload before any write** (`role: authenticated`, uid `54281dc5…`, and **not** the owner address). **Five preflight gates verified first:** `visibilityState=visible`, `hasFocus=true`, `requestAnimationFrame` measured at **61 fps** (152 frames / 2,504 ms), screenshot capture working, and a real click confirmed `isTrusted`. Real OS-level clicks and keystrokes only. **9 screens covered:** Dashboard (no conversion card; KPI set = הכנסות החודש / עסקאות פעילות / **דורש טיפול** / לידים חדשים; action panel, all-clear text and diary disclaimer all present), Sidebar (`לקוח חדש`), Schedule, AppointmentModal (card 680px, date + both time inputs `color-scheme: dark` on `rgb(35,34,34)`), Schedule with a row (headers, 14px cell padding, wrapping action pills), Campaigns (form laid out; **both date inputs dark**), Pipeline, Assets (correct empty-state branch + CTA), ClientModal (720px). **Assistant/pet measured `visibility: hidden` / `opacity: 0` / `pointer-events: none` while a modal is open**, and visible again on close. **No horizontal overflow on any screen** (`scrollWidth − clientWidth = −10px`). **0 console messages of any level.** Cleanup **verified zero**, including on the `הכל` tab which retains cancelled and completed rows |
> | ✅ Production smoke | **Authenticated, NON-MUTATING. PASSED 2026-07-30** on the isolated **QA account** (identity re-verified from the JWT first; **not** the owner account). Canonical **HTTP 200** serving **`index-PcQFaAu-.js`**; the Dashboard renders signed in with the **`דורש טיפול`** tile and the **`מה דורש טיפול`** panel, and the sidebar CTA reads **`לקוח חדש`** — the new code is live. **48/48 network requests HTTP 200 and every single one a `GET`** — **0 `POST`/`PATCH`/`DELETE`, therefore 0 writes**. **0 console messages of any level.** No record was created, edited or deleted in Production |
>
> **Reported, NOT fixed — out of scope:** the guided demo tour (`src/components/ai/DemoMode.jsx:41`) still
> narrates the Dashboard as showing `אחוז המרה`. The artifact scan caught it as **1 hit** in the built bundle,
> and it was **identified rather than assumed benign**. That file was never on this slice's allowed list, so
> the copy is stale by one clause and stays that way until its own slice. The other non-zero scan hit,
> `ליד חדש` **×9**, was resolved the same way: every occurrence was located and read in context — the
> `/intake` route title, two Jake NLU synonym maps, an image-generation prompt string, the pipeline stage
> label, the Intake page title and Outreach ×3. **None is a global module CTA**, which is what the slice
> actually removed.
>
> **Artifact scan before deploying:** **0 hits** across all eleven secret patterns (`service_role`,
> `SUPABASE_SERVICE`, `sk_live`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `xoxb-`, `ghp_`, `AKIA`,
> `PRIVATE KEY`, `client_secret`) and **0 JWT-shaped tokens**. Positive control: the new code IS in the
> bundle — `color-scheme` ×2, `דורש טיפול` ×4, `מה דורש טיפול` ×3, `kpi-grid-3` ×3, `table-wrap` ×13.
>
> **Owner gates:**
> 1. ✅ **Merge PR #144** — 2026-07-30, head-gated to `145c970e`.
> 2. ✅ **Build + Preview deploy** — 2026-07-30. **One** build from merged `main`; Preview `e31c6cbf` from that
>    exact `dist/`.
> 3. ✅ **Authenticated Preview UI QA — PASSED 2026-07-30, owner-enabled.** See the box row above.
> 4. ✅ **Production deploy — TAKEN 2026-07-30 on explicit owner approval.** **ONE** deploy, no rebuild.
>    **Current rollback target: `ad09b631` / `index-QaS25VkC.js`**, verified HTTP 200 after the deploy;
>    `88b20584` is demoted to a historical fallback, retained.
>
> ⚠️ **A rollback here is a pure frontend rollback and is complete** — unlike the last three slices, this one
> applied no migration, so there is no additive schema change left behind to reason about.
>
> ⚠️ **Method note earned this slice, and it cost two stopped QA attempts.** `visibilityState` and even
> `document.hasFocus()` are **not** sufficient rendering gates. One attempt measured `hasFocus: true` with
> `visibilityState: hidden` and **0 frames in 2,556 ms** — a tab holding keyboard focus while Chrome had
> suspended its compositing, because it was not the *selected* tab in its window. Screenshots still returned
> images through the debugger's forced-capture path, which is exactly what makes it dangerous. **Measure
> `requestAnimationFrame` and require a real frame rate**; a captured image is not proof that the page drew it.
>
> ### ✅ SCHEDULE CORE SLICE 1 — **CLOSED / LIVE IN PRODUCTION** (applied + Preview + authenticated UI QA + Production release 2026-07-30)
>
> Adds `public.appointments` — one scheduled occurrence: a meeting, a lesson or an event, with a start
> **instant**, an optional end, an outcome status, and optional links to a client and to a task.
>
> **Why it is new and not a duplicate of anything.** Every date the product stored before this slice is a
> `date` with NO time of day (`tasks.deadline`, `clients.next_action_date`, `charges.service_date`,
> `quotes.date`), so "what do I have today at 10:30?" could not be expressed at all. This is the first
> `timestamptz` business entity in the product.
>
> **NAMING BOUNDARY.** The table is `appointments`, deliberately **not** `calendar_events`. "Calendar" is
> already taken by the Growth OS monthly action board (`src/data/growthCalendar.js`, `/growth/calendar`), a
> pure planning model that persists nothing. Same word, two lifetimes — the Campaigns slice 1 defect class.
> A test fails if the new code imports from it, or if anything under `pages/growth/**` imports the diary.
>
> | | |
> | --- | --- |
> | PR | [#142](https://github.com/natanMeT/ArtValue20/pull/142) — **MERGED 2026-07-30**, merge commit `660f671ee923e2fdd75a2aed5f2c4979304d7701` (parents `b2bd9c4b1d1b11ff6cfb44b545dc755c2416fb4e` + the owner-approved head `a5804d1b13530b75bdaca93001ff28bb0dd6caab`), merged with `--match-head-commit` so a moved head would have failed the merge |
> | Migration | `20260801120000_schedule_core_slice1.sql` — **APPLIED and VERIFIED LIVE 2026-07-30, FIRST attempt.** **12 applied of 12 tracked, none pending** *at that release* (today: **13 of 13**, after `20260802120000`); `db push --dry-run --linked` = **"Remote database is up to date"** |
> | Rollback tag | `pre-schedule-core-slice1` @ `b2bd9c4` |
> | Branch | `feat/schedule-core-slice1` — retained |
> | Files merged | **12** (+2,931 / −2): the migration, `src/lib/schedule.js`, `src/lib/api.js`, `src/pages/Schedule.jsx`, `src/components/forms/AppointmentModal.jsx`, `src/App.jsx`, `src/components/layout/sidebarNav.js`, three new test files, and two owner-approved nav-inventory guards |
> | Review | **Self-review only — NO Codex this slice, by owner instruction.** 0 reviews, 0 comments, 0 unresolved threads at merge |
> | Tests | Full suite **125 files / 3,658 passed / 0 failed** (from 122 / 3,522). **136 added**; **10 negative controls**, each measured failing when its fix is reverted |
> | Deploy | **Preview, then Production — ONE build total, promoted unchanged.** Preview **`840b5a94-6516-46f7-b2bd-053652681c7d`** (branch `schedule-preview-660f671e`, source `660f671e`) — https://840b5a94.artvalue-product.pages.dev. **Production `ad09b631-8d70-421c-b3fc-543972b95723`** (branch `main`, commit-hash `660f671e`) — https://ad09b631.artvalue-product.pages.dev, canonical https://artvalue-product.pages.dev. Entry bundle **`index-QaS25VkC.js`**. **NO rebuild:** the same `dist/` was deployed, `wrangler` reported **"Uploaded 0 files (12 already uploaded)"**, and Production↔Preview are **12/12 byte-identical by SHA-256**. **NO Edge/Auth/secret/package change** |
> | ✅ Authenticated Preview UI QA | **PASSED 2026-07-30.** Owner-driven signed-in session on the isolated **QA account** — identity verified from the JWT **before any write** (its uid differs from the owner’s, and it held 0 clients against the owner’s 3); the **owner account was never written to**. **Four preflight gates verified first:** `visibilityState=visible`, `hasFocus=true`, `requestAnimationFrame` measured at **61 fps** (62 frames / 1,008 ms), screenshot capture working, and a real click confirmed registering. Real OS-level clicks and keystrokes only — **no programmatic handler invocation**. **Results:** the negative control ran FIRST — an end time equal to the start was **refused in the UI** (שעת הסיום חייבת להיות אחרי שעת ההתחלה.), the modal stayed **open with every typed value intact**, and **0 POST requests** were made; then a lesson `SC_UI_QA_lesson` 10:00–11:15 linked to a QA client saved (toast, KPIs 0→1 on all three, row reading `10:00–11:15 / שיעור / מתוכנן`), and the server stored **`start_at` 07:00 UTC = 10:00 Asia/Jerusalem** and **`end_at` 08:15 UTC = 11:15**; all four statuses proved reachable, each moving the row out of the agenda while **retaining** it under “הכל”; the row survived a full navigate-away and re-fetch; deletion through the UI emptied the diary. **0 console messages of any level.** Cleanup **verified zero under RLS and RLS-independently** |
> | ✅ Production smoke | **Authenticated, NON-MUTATING. PASSED 2026-07-30** on the isolated **QA account** (identity re-verified from the JWT first; **not** the owner account). Canonical **HTTP 200** serving **`index-QaS25VkC.js`**; **cloud mode** confirmed (נתונים בענן, no local `artvalue_data`); **`/schedule` renders signed in** with the three KPI tiles at `0`, the היום/השבוע/הכל tabs and the אין רישומים בטווח הזה empty state; **`GET /rest/v1/appointments?select=*&order=start_at.asc` returned 200**, so the endpoint is live and RLS-readable in Production. **48/48 network requests HTTP 200 and every single one a `GET`** — **0 `POST`/`PATCH`/`DELETE`, therefore 0 writes**. **0 console messages of any level** across a fully tracked page load. **Row counts identical before and after** (`appointments=0`, `clients=3`, `tasks=0`, `charges=0`, `payments=0`, `quotes=0`, `transactions=0`) — **no record was created, edited or deleted**, and no QA record was created in Production |
>
> **What the schema adds.** `public.appointments`: `id uuid` (client-assigned, no default), `user_id` → `auth.users`
> CASCADE, `kind` (`appointment`/`lesson`/`event`), `title` (1–160, non-blank), optional `client_id uuid` and
> `task_id text`, `start_at timestamptz NOT NULL`, nullable `end_at timestamptz` (strictly after the start),
> `status` (`planned`/`completed`/`cancelled`/`no_show`), bounded `notes`, timestamps. **Four RLS policies, one
> per command, all to `authenticated`, all own-row.** Three indexes, one `updated_at` trigger. **No quota and no
> SECURITY DEFINER function** — an appointment costs one row, and capping it would refuse the business its own
> diary; this also avoids the counter-function class whose default `anon` EXECUTE grant needed its own
> migration (`20260728130000`).
>
> **`status` IS STORED — and that is a deliberate difference from F1.** Receivables refused a stored status
> because it is derivable from amounts nobody can dispute. An appointment’s outcome is **not** derivable from
> anything in the row: only a human knows whether the lesson happened, was cancelled, or the client did not
> show up. Here the column *is* the fact, not a second copy of one.
>
> **THE TWO COMPOSITE SAME-OWNER KEYS.**
> `appointments (client_id, user_id) → clients (id, user_id)` **SET NULL (client_id)** and
> `appointments (task_id, user_id) → tasks (id, user_id)` **SET NULL (task_id)**.
> A foreign key is checked **by the system, not through RLS** — RLS hiding account B’s client from account A’s
> SELECT does not stop A from *referencing* it. Carrying `user_id` into the key makes that structurally
> impossible. **SET NULL and not CASCADE on both:** deleting a contact, or tidying up a task, must never erase
> the record that a lesson happened. **The column list is load-bearing** — a bare `SET NULL` also nulls
> `user_id` (NOT NULL) and every parent delete would fail, months later, in production.
>
> **The ONE thing added to an existing table:** `public.tasks` gained `tasks_id_user_unique UNIQUE (id, user_id)`
> and nothing else — no column, no policy, no trigger, no data, no change to the S0B `tasks_own` policy. It is
> the key the task link points at, added through an inspect-then-add block rather than a blind drop.
>
> 📌 **The migration applied FIRST TIME, and the reason is the F1 rule.** The exact file was **executed against a
> real PostgreSQL 17.6** — the same version the live project runs — before the PR was opened: the full chain
> (`schema.sql` + 10 prior migrations + this one) on a fresh database, then re-applied to prove idempotency.
> **That rehearsal earned its keep immediately:** the first execution FAILED on a brittle assertion in this very
> file (a total column count on `public.tasks`), which rolled back completely inside its single transaction and
> was replaced with a permanent, narrow invariant before merge. A count pinned to today’s schema would have
> falsely accused this file the next time any slice added a task column. **A migration that has never been run
> is not known to work** — and the corollary now proven in the other direction: one that has been run, applies.
>
> **10 negative controls, every one measured failing.** Two at the database level: a **single-column** client FK
> **permits the cross-account link — 1 row leaked**, while the shipped composite key refuses the identical
> insert; and a **bare** `SET NULL` fails the parent delete with `null value in column "user_id" … violates
> not-null constraint`, PostgreSQL’s generated statement literally reading `SET "client_id" = NULL,
> "user_id" = NULL`. Eight in source, each fix reverted and only the correct tests failing. The **PR #137
> structural guard** ships here too: every `DO` block’s `DECLARE` names are checked against its own table
> aliases, with a positive control on the exact shape that broke F1’s second apply.
>
> **Reported, NOT fixed — out of scope:** `public.tasks.client_id` remains a **single-column** FK (F1’s **L5**).
> The Clients screen exposes **no delete affordance**, so the client-deletion semantic could not be exercised
> through real clicks — it is proven at the database level in PART B instead. Appointments are not in
> `fetchAll`, the Dashboard or `bulkUpload` (import/export), matching Campaigns — declared, not hidden.
>
> **Declared limitations (in the migration header):** L1 MATCH SIMPLE / optional links · L2 no overlap
> constraint — double-booking is **shown, never refused** · L3 no `charge_id` (deferred by explicit owner
> decision; F1’s L6 is unresolved) · L4 no recurrence · L5 no status-transition trigger — corrections are
> ordinary · L6 no timezone column, UTC stored and Asia/Jerusalem rendered · L7 `tasks.client_id` unchanged.
>
> **Owner gates:**
> 1. ✅ **Merge PR #142** — 2026-07-30, head-gated.
> 2. ✅ **Apply migration `20260801120000`** — 2026-07-30, **first attempt**. **12 applied of 12 tracked** *at that release* (today: **13 of 13**).
> 3. ✅ **PART A** — read-only catalog verification. **MATCHED EXACTLY**: 4 policies (one per command, all
>    `{authenticated}`, own-row, none mentioning `row_count`), both composite keys verbatim with the column-list
>    `SET NULL`, `tasks_id_user_unique` non-deferrable, 12 columns, both instants `timestamptz`, 5 CHECKs,
>    4 indexes, 1 trigger, 0 SECURITY DEFINER functions, 0 rows.
> 4. ✅ **PART B** — mutating acceptance controls on **two QA accounts** and **disposable `SC_QA_` records only**,
>    under the real `authenticated` role with RLS active. Both `23503` same-owner refusals, four `23514` domain
>    refusals, no residue after either refusal, both parent-delete semantics, cross-account isolation 0 vs own 1,
>    and the `updated_at` trigger proven transaction-independently. Cleanup **verified zero** per-account under
>    RLS and RLS-independently. The owner account was never touched.
> 5. ✅ **Build + Preview deploy** — 2026-07-30. **One** build from merged `main`; Preview `840b5a94` from that
>    exact `dist/`. **Artifact scan before deploying:** the Schedule code IS in the bundle (`appointments` ×7,
>    `/schedule` ×2, `no_show` ×3, `start_at` ×3, `end_at` ×2, `lesson` ×2). **No secrets:** 0 hits for
>    `service_role`, `SUPABASE_SERVICE`, `sk_live`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `xoxb-`, `ghp_`,
>    `AKIA`, `PRIVATE KEY`, `client_secret`, and **0 JWT-shaped tokens** — the only key shipped is the Supabase
>    **publishable** key. Both non-zero hits were identified rather than assumed benign: the 2 `sk-` matches are
>    `ask-clarifying-q` strings, and all 4 `localhost`/`127.0.0.1` hits live **inside the vendored
>    `@supabase/supabase-js` chunk** — **zero in the application chunk**.
> 6. ✅ **Authenticated Preview UI QA — PASSED 2026-07-30, owner-driven.** See the box row above.
> 7. ✅ **Production deploy — TAKEN 2026-07-30 on explicit owner approval.** **ONE** deploy, no rebuild.
>    **Current rollback target: `88b20584` / `index-BLR2aev7.js`**, verified HTTP 200 after the deploy;
>    `90a7dc15` is demoted to a historical fallback, retained.
>
> ⚠️ **A frontend rollback does NOT undo migration `20260801120000`** — it is additive and stays applied.
>
> ⚠️ **Method note carried forward from F1, and it bit twice this slice.** A QA that cannot be seen is not a
> visual QA. The first attempt at the authenticated QA ran in a browser that was not compositing frames
> (`requestAnimationFrame` fired **once in 39.6 seconds** while `visibilityState` still reported `visible` — so
> visibility alone is **not** the test), and the session in that browser turned out to be the **owner account**,
> not a QA account. Both were caught by running the identity and rendering gates **before** any write, and the
> QA was stopped and handed back to the owner rather than faked. Measure rAF, and verify the JWT, every time.

> ### ✅ F1 CORE RECEIVABLES SLICE 1 — **CLOSED / LIVE IN PRODUCTION** (applied + Preview + authenticated UI QA + Production release 2026-07-30)
>
> Separates **money expected to be billed** (`public.charges`) from **money that actually arrived**
> (`public.payments`). Before this slice the product had only `transactions`, which conflates "we will invoice this"
> with "this was received", so it could not answer *how much is still open?* without guessing. It also hardens five
> existing relationships into **composite same-owner foreign keys** — a foreign key is checked by the system, not
> through RLS, so a single-column key permits a durable pointer from one account's data into another's.
>
> ✅ **STATE — the SCHEMA CHANGE IS LIVE; there is still no release.** Migration
> `20260731120000_finance_receivables_slice1.sql` is **APPLIED**: **11 applied of 11 tracked, none pending**, and
> `supabase db push --dry-run --linked` returns **"Remote database is up to date"**. The live schema and
> `supabase/migrations/**` are in **full parity** again — the window this box previously described is closed.
> `public.charges`, `public.payments` and all five composite same-owner keys now exist in the database.
> **The frontend is merged but NOT built and NOT deployed**, so the Finance receivables area is not reachable by any
> user: Production still serves the pre-F1 bundle. **No build, no deployment, no Edge/Auth/secret change**; the Production release,
> bundle, rollback target and Edge version in the boxes below are **UNCHANGED** by this slice and remain
> authoritative. `56d13ef` is the historical anchor for this feature merge, **contained in** `main`; the current
> `main` HEAD is never pinned here and must be resolved live (`git rev-parse origin/main`).
>
> | | |
> | --- | --- |
> | PR | [#134](https://github.com/natanMeT/ArtValue20/pull/134) — **MERGED 2026-07-30T04:39:32Z**, merge commit `56d13ef738c7c01b6fd24c2e7faa988b0a042df9` (parents `110baf16026d676ab4c698238b35f1092e9077db` + the owner-approved head `c811fac02e086427ce6a93e7ab179ba81e94c03c`), merged with `--match-head-commit c811fac…` so a moved head would have failed the merge |
> | Migration | `20260731120000_finance_receivables_slice1.sql` — **APPLIED and VERIFIED LIVE 2026-07-30** on linked project `weciwurjfwmqihcyexzj` via `supabase db push --linked`. **11 applied of 11 tracked, none pending**; `db push --dry-run --linked` = **"Remote database is up to date"**. The successful apply emitted exactly two NOTICEs (the two single-column FK replacements) and its own PART 6 self-verifying assertions passed. **This was the THIRD attempt — see "Two failed applies" below** |
> | Repair merges | **PR [#136](https://github.com/natanMeT/ArtValue20/pull/136)** → merge `f4423550a660f5f4b7e3a85fb135d661daf139a0` (parents `a32ac8a` + head-gated `7f4e537`); **PR [#137](https://github.com/natanMeT/ArtValue20/pull/137)** → merge `601b3c9480cf7a59e999af03a403983d0a90a1a2` (parents `f442355` + head-gated `590d987`). Both edited ONLY the then-pending migration and its contract test |
> | Rollback tag | `pre-finance-receivables-slice1` @ `110baf1` |
> | Branch | `feat/finance-receivables-slice1` — retained |
> | Files merged | **11** (+6,404 / −5): the migration, `src/lib/receivables.js`, `src/lib/api.js`, `src/store/store.jsx`, `src/pages/Finance.jsx`, `src/pages/Settings.jsx`, `ChargeModal.jsx`, `PaymentModal.jsx` and three test files |
> | Review | **Codex 21 rounds, 41 findings — ALL 41 fixed, replied to and RESOLVED. 0 unresolved threads** at the merged head |
> | Tests | Full suite **122 files / 3,511 passed / 0 failed**, re-run on merged `main`. 246 added (73 pure calculations, 100 migration contract, 73 Finance + Settings); **68 negative controls**, each proven to fail when its fix is reverted |
> | Deploy | **Preview, then Production — ONE build total, promoted unchanged.** Preview **`10dbbf8d-d02d-4fcb-8255-6d83a5bff70b`** (Environment Preview, branch `f1-preview-110bb1e`, source **`110bb1e`**) — https://10dbbf8d.artvalue-product.pages.dev. Built once from merged `main`; entry bundle **`index-BLR2aev7.js`**. **Production `88b20584-b375-4073-a762-f91dc2f1a1e8`** (Environment Production, branch `main`, commit-hash `c281cda`) — https://88b20584.artvalue-product.pages.dev, canonical https://artvalue-product.pages.dev. **NO rebuild:** the same `dist/` was deployed, `wrangler` reported **"Uploaded 0 files (12 already uploaded)"**, and Production↔Preview are **10/10 byte-identical by SHA-256**. **NO Edge/Auth/secret/package change.** ⚠️ **Read the two anchors separately:** the artifact was **built from `110bb1e`**, while the deployment is **labelled with commit `c281cda`** — the delta between them is **docs only** (one file, `docs/PROJECT_TRACKER.md`), verified before deploying |
> | Preview smoke | **Non-mutating, UNAUTHENTICATED. PASS as far as it goes.** App loaded, **all 8 assets HTTP 200**, entry bundle is the freshly built `index-BLR2aev7.js`, **0 console messages of any level**, and **0 REST/API calls — therefore 0 reads and 0 writes** and no data touched. The signed-out gate rendered correctly (Hebrew RTL sign-in form). **No sign-in was performed, no account was used, no QA record was created in the browser, and no password was requested or handled** |
> | ✅ Authenticated Preview UI QA | **PASSED 2026-07-30 — this gate is now CLOSED.** Owner-driven signed-in session on the Preview URL, on the isolated **QA account B**, verified as the QA account **before** any write; the **owner account** was never touched and its 3 real clients were unchanged throughout (`clients_total=3` before and after). Driven with **real OS-level clicks, real keystrokes and real `F5`** in a foreground Chrome — **no programmatic handler invocation**. **Preflight gates verified first and all four passed:** `document.visibilityState=visible`, `requestAnimationFrame` measured at **60 fps** (91 frames / 1,509 ms), screenshot capture working, and a real click confirmed registering. Screenshot per material step. **Results, each seen on screen and each re-verified against the server:** client created; charge **₪1,000** (`final`, `net60`, service `2026-02-15`) with due date **`29/04/2026` computed and locked in the form BEFORE submit** (stored `due_date 2026-04-29`, `due_date_source computed`); payment **₪400** → KPIs `צפוי ₪1,000 / התקבל ₪400 / יתרה ₪600`, row badge **`שולם חלקית`** (server balance `600.00`, and **no status column exists** — derived, as designed); cancellation via the confirm dialog (truthful copy: "התשלומים שכבר נרשמו יישארו רשומים") → `lifecycle=cancelled`, KPIs back to ₪0, charge moved to **חיובים שבוטלו**, and the ₪400 **retained** in actual revenue; a new payment on the cancelled charge **REFUSED** — the UI shows "החיוב בוטל, ולכן לא ניתן לרשום עליו תשלום חדש" with **`רישום` disabled**, and the server refusal was reproduced **independently under RLS** as **`23514` from `public.payment_reject_cancelled_charge()` line 19** — the **trigger**, not the FK — with a **positive control** proving the identical insert succeeds when `lifecycle='open'` (rolled back). **0 console messages of any level** across a fully tracked page load, no error toast, no failed write (the store `console.error`s on every failure). **Cleanup: payment deleted through the UI, charge + client deleted as account B under RLS; zero residue verified BOTH ways** — under RLS `clients/charges/payments = 0/0/0`, and RLS-independently `charges_total=0`, `payments_total=0`, `qa_clients=0`, `qa_charges=0`, account-B rows `0` |
> | ✅ Production smoke | **Authenticated, NON-MUTATING. PASSED 2026-07-30** on the isolated **QA account B** (identity re-verified against the JWT before anything else; **not** the owner account). Canonical **HTTP 200** serving **`index-BLR2aev7.js`**; **cloud mode** confirmed (`נתונים בענן`, no local `artvalue_data`); **Finance renders signed in** with the receivables section present, KPIs `צפוי ₪0 / התקבל ₪0 / יתרה ₪0`, the `אין חיובים פתוחים` empty state, 0 table rows and the actual-revenue note reading `₪0 — מתוכה ₪0 … ו-₪0 …`. **49/49 network requests HTTP 200 and every single one a `GET`** — including `/rest/v1/charges` and `/rest/v1/payments`, so the F1 endpoints are live and RLS-readable in Production — **and 0 `POST`/`PATCH`/`DELETE`, therefore 0 writes**. **0 console messages of any level** across a fully tracked reload. **Row counts identical before and after** (`clients=3`, `charges=0`, `payments=0`, `quotes=0`, `transactions=0`, `tasks=0`) — **no record was created, edited or deleted**, and the owner's 3 real clients were untouched |
>
> **What the schema adds, once applied.** `public.charges`: one expected billing event (`deposit`/`partial`/`final`,
> terms `immediate`/`net30`/`net60`/`net90`, service date, due date, optional invoice link, lifecycle
> `open`/`cancelled`, `amount_total numeric(14,2)` including VAT). `public.payments`: money received against a
> charge, `charge_id NOT NULL` — the source of truth for received revenue. **Payment status is DERIVED and has no
> column** (`paid`/`partially_paid`/`expected` from the amounts); the migration refuses a stored status column both
> in its preflight and in its assertions. **Due date** = end of the *service* month + 0/30/60/90 days; worked control
> `2026-02-15` + net60 → `2026-04-29`. Overpayment is permitted, never yields a negative balance, and the surplus is
> surfaced separately. **No quotas and no SECURITY DEFINER function**; four plain RLS policies per table.
>
> **The five composite same-owner keys — TWO ARE WIDENED, THREE ARE NEW.** The distinction is load-bearing for
> anyone reading this later: only the first two existed before this migration, and only they carry a delete action
> this slice had to preserve. The other three are **this slice's own decisions**, made here for the first time, and a
> future slice may revisit them on their merits — they are not inherited contracts.
> - **Widened in place** (single-column → composite; the existing `20260717090000` delete action preserved byte for
>   byte, because changing one while widening a key would be two decisions hiding in one):
>   `quotes (client_id, user_id) → clients` **CASCADE** — quote documents are client-scoped and go with the client;
>   `transactions (client_id, user_id) → clients` **SET NULL (client_id)** — the financial ledger survives client
>   deletion.
> - **New with the new tables** (no prior behaviour to preserve; each action chosen in this slice):
>   `charges (client_id, user_id) → clients` **SET NULL (client_id)** and
>   `charges (quote_id, user_id) → quotes` **SET NULL (quote_id)** — charges follow the ledger: money owed is not
>   erased by deleting a contact or a quote; `payments (charge_id, user_id) → charges` **CASCADE** — a payment
>   cannot outlive the charge it was recorded against.
>
> **The column list on SET NULL is load-bearing** on all four of them: a bare `SET NULL` also nulls `user_id`
> (NOT NULL), so every delete of a parent with children would fail, months later, in production.
>
> 📌 **The migration is self-verifying and fail-loud.** PART 1 checks every precondition and SAFE STOPs before a
> single object is created or altered — server version, table and column shapes, defaults, numeric precision, primary
> keys, timestamp columns, existing CHECK-violating rows, existing index definitions **including the expected
> table**, ownership keys, and **orphan or cross-owner rows for all seven relationships it keys** (block `(k1b)`).
> That last one and the table-aware index lookup were the final two Codex P2s, closed in `6502f17`; a third fix
> (`c811fac`) made `runMigrate` share the import-result toast builder, so a partial cloud upload can no longer report
> success while silently dropping receivables.
>
> **Reported, NOT fixed — out of scope:** `public.tasks.client_id` remains a **single-column** FK to `clients(id)`
> and carries the same cross-account exposure as the two keys hardened here (declared as **L5** in the migration).
> A `transaction` still cannot be linked to a `charge`, so a person entering the same receipt through both forms is
> double-counted in "actual revenue" — the system never does this to itself, and the screen reports payments and
> income transactions as separate figures so the duplicate is visible (**L6**).
>
> **Owner gates:**
> 1. ✅ **Apply migration `20260731120000`** — done 2026-07-30 on the third attempt. **11 applied of 11 tracked.**
> 2. ✅ **PART A** — read-only catalog verification, checks 1–7 from the migration's VERIFICATION section. **MATCHED EXACTLY.**
> 3. ✅ **PART B** — nine mutating acceptance controls on **two QA accounts** and **disposable QA records only**;
>    cleanup **verified zero by query**, per-account and RLS-independently. The real owner account was never touched.
> 4. ✅ **Build + Preview deploy** — done 2026-07-30. Full suite **122 files / 3,522 passed / 0 failed**, then **one**
>    production build from merged `main`, then Preview `10dbbf8d` from that exact tested `dist/`.
>    **Artifact scan before deploying:** the receivables code IS in the bundle — `charges` ×32, `payments` ×22, plus
>    `amount_total`, `payment_terms`, `due_date_source`, `lifecycle` ×16 and `partially_paid` ×3. **No secrets:** 0
>    hits for `service_role`, `SUPABASE_SERVICE`, `sk_live`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `xoxb-`, `ghp_`,
>    `AKIA`, `PRIVATE KEY`, `client_secret`, and **0 JWT-shaped tokens** — the only key shipped is the Supabase
>    **publishable** key (`sb_publishable_…`), which is client-side by design. The 5 `sk-` matches were verified as
>    false positives (`ask-clarifying-q` ×2, `.mask-canvas` ×3 in CSS). **No local URLs:** 0 hits for `localhost`,
>    `127.0.0.1`, `192.168.`, `file://`, `:5173`, `:8188`, `C:\`.
> 5. ✅ **Authenticated Preview UI QA — PASSED 2026-07-30, owner-driven.** Real clicks and real typing only, on
>    **QA account B** and **disposable `F1_UI_QA*` records only**; the four preflight gates (visible, rAF at 60 fps,
>    screenshot, real click registering) were verified BEFORE any write. Charge → computed due date `2026-04-29` seen
>    in the form before submit → payment ₪400 → balance ₪600 / `שולם חלקית` → cancellation (payment retained) →
>    payment on a cancelled charge refused in the UI and by the `23514` trigger under RLS. 0 console messages;
>    cleanup verified zero residue under RLS and RLS-independently. See the box row above for the full evidence.
>    ⚠️ **Method note — a QA that cannot be seen is not a visual QA.** The first attempt ran in a browser pane that
>    was never displayed: `visibilityState` stayed `hidden`, `requestAnimationFrame` never fired, screenshots failed
>    outright, and OS-level clicks stopped landing. In that state framer-motion enter/exit animations never advance,
>    so closed modals and consumed toasts linger in the DOM with their last props and the KPI count-ups stay frozen
>    at ₪0 — artifacts that read exactly like product defects (one was briefly mistaken for a save stuck on "שומר…",
>    when the write had in fact succeeded). **Rule: verify visibility + rAF + screenshot + a real click BEFORE
>    trusting any UI acceptance, and never substitute programmatic handler invocation for a real click.**
> 6. ✅ **Production deploy — TAKEN 2026-07-30 on explicit owner approval.** **ONE** deploy, no rebuild: the exact
>    accepted `dist/` was promoted to **`88b20584-b375-4073-a762-f91dc2f1a1e8`** (branch `main`, commit-hash
>    `c281cda`). Parity was proven **before** deploying — local `dist/` vs the Preview's served bytes **10/10
>    identical by SHA-256** — and again **after**, Production↔Preview **10/10 identical**, with `wrangler` reporting
>    **"Uploaded 0 files (12 already uploaded)"**. Preflight also confirmed 11/11 migrations, `ai-gateway` v36
>    ACTIVE / `verify_jwt=true`, and that the `110bb1e`→`c281cda` delta is **docs only**. The authenticated
>    **non-mutating Production smoke PASSED** (see the box row above). **Current rollback target: `90a7dc15`.**
>
> **⚠️ Two failed applies before this one — the durable lesson of this slice.**
> The migration was merged after 21 Codex rounds, 41 findings and a 122-file suite, and it had **never been executed
> against a real PostgreSQL**. Two defects survived all of that, both in the *verification* scaffolding rather than
> the DDL, and each was found only by running it:
> 1. **`ERROR: syntax error at or near "notnull" (SQLSTATE 42601)`** — precondition check (c) used the reserved word
>    `notnull` as an unquoted column alias, so the `DO` block **failed to parse**, aborting before any DDL *and*
>    before its own `raise exception` guards could report anything. Fixed in **PR #136** (rename to
>    `requires_not_null`, 3 lines).
> 2. **`ERROR: record "c" is not assigned yet (SQLSTATE 55000)`** — PART 6 declared `c record;` / `n int;` and then
>    aliased `pg_class c` / `pg_namespace n`; PL/pgSQL resolves `c.relname` against the **declared variable**, not the
>    table alias. This one aborted **after the DDL had run and after both existing single-column FKs were replaced** —
>    the single transaction rolled all of it back, verified read-only (`charges`/`payments` absent, 0 new keys, both
>    original FKs still present, no history row). Fixed in **PR #137**: the whole file was swept for the class,
>    **8 `DO` blocks scanned, 5 collisions found, all in PART 6**, all renamed to `ci`/`ns`.
>
> **The rule this establishes:** a migration's own assertion blocks are code, and text-level contract tests cannot
> execute them. PR #137 added a **structural guard** (every `DO` block's `DECLARE` names vs its own table aliases,
> with negative controls) because the second defect was invisible to all 105 existing text assertions — the SQL was
> well-formed and every identifier existed. **A migration that has never been run is not known to work**, however
> many rounds of review it has passed.
>
> **PART A — read-only catalog verification. MATCHED EXACTLY.**
> 1. Both tables exist: `to_regclass` returns `charges` and `payments`.
> 2. RLS enabled on both: `rowsecurity = true, true`.
> 3. **Exactly 8 policies, 4 per table**, one per command, **all to `{authenticated}`**, all own-row
>    (`auth.uid() = user_id` as `qual` for select/update/delete, as `with_check` for insert/update).
>    **No policy mentions `row_count`** — no quota, and therefore no SECURITY DEFINER counter function.
> 4. **All five composite foreign keys, verbatim as specified:**
>    - `quotes` → `FOREIGN KEY (client_id, user_id) REFERENCES clients(id, user_id) ON DELETE CASCADE`
>    - `transactions` → `FOREIGN KEY (client_id, user_id) REFERENCES clients(id, user_id) ON DELETE SET NULL (client_id)`
>    - `charges` → `FOREIGN KEY (client_id, user_id) REFERENCES clients(id, user_id) ON DELETE SET NULL (client_id)`
>    - `charges` → `FOREIGN KEY (quote_id, user_id) REFERENCES quotes(id, user_id) ON DELETE SET NULL (quote_id)`
>    - `payments` → `FOREIGN KEY (charge_id, user_id) REFERENCES charges(id, user_id) ON DELETE CASCADE`
> 5. **No single-column client FK survived**: the only single-column keys left on `quotes`/`transactions` are
>    `quotes_user_id_fkey` and `transactions_user_id_fkey`, both `REFERENCES auth.users(id) ON DELETE CASCADE`.
>    **Nothing on `client_id`.**
> 6. **No stored payment status**: `0` columns named `status`/`payment_status`/`paid`/`is_paid` on `charges`.
> 7. Existing data untouched: `charges` **0** rows, `payments` **0** rows on first apply.
>
> Extended catalog evidence, same read-only pass: `charges` **15** columns / `payments` **7**; **9** CHECK constraints
> across the two tables; **8** indexes; **3** non-internal triggers — `trg_charges_updated`, `trg_payments_updated`
> and `trg_payments_reject_cancelled` (the server-side cancelled-charge rule).
>
> **PART B — nine acceptance controls, all decisive.** Run under the real `authenticated` role with RLS active and
> `request.jwt.claims` set per account, on **disposable QA records only** — QA clients `KA`/`KB`, charge `HA`,
> payments `PA`/`PX`, all with a `f1f1f1f1-…` id prefix and `F1_QA_` names. Two QA accounts were used; **the real
> owner account was never touched and no real data was read into or written by any control.**
> 1. **Control 8 — positive.** As A: charge `HA` inserted against A's own client `KA` → **1 row**, `amount_total`
>    `1000.00`, `lifecycle` `open`, and the worked due date **`2026-04-29`** (service `2026-02-15`, end of Feb + net60).
> 2. **Control 9 — positive, derived status.** As A: payment `PA` of `400.00` → total `1000.00`, received `400.00`,
>    **balance `600.00`** = `partially_paid`, computed from the amounts with **no status column anywhere**.
> 3. **Control 10 — the negative this slice exists for.** As A, naming B's client `KB`:
>    **REFUSED with `23503`** — `violates foreign key constraint "charges_client_same_owner_fk"`,
>    `DETAIL: Key is not present in table "clients".` **No residue**: `HA.client_id` was still `KA` afterwards.
>    Supporting fact from the same account: A's `select` of `KB` returned **0 rows** — exactly the RLS blindness that
>    makes a key, not a policy, the only real defence.
> 4. **Control 11 — negative, cross-account payment.** As B, naming A's charge `HA`: **REFUSED with `23503`** on
>    `payments_charge_same_owner_fk`, same `DETAIL`.
> 5. **Control 12 — negative, no stored status.** As A, `set status='paid'`: **REFUSED with `42703`**
>    `column "status" of relation "charges" does not exist`.
> 6. **Control 13 — negative, cancelled charge refuses payment.** As A, with `HA` cancelled: **REFUSED with `23514`**
>    — `payments: charge … is cancelled and cannot receive a payment`, and the `CONTEXT` names
>    `public.payment_reject_cancelled_charge() line 19` — proof the **trigger** fired, not the FK. (The migration warns
>    that a `23503` here would mean the control never ran.) **The correction path still works:** deleting an existing
>    payment (`PX`) *while the charge was cancelled* **succeeded**, so a mistake is never stranded.
> 7. **Control 14 — deletion semantics, client side (destructive).** As A, `delete from clients where id = KA` →
>    **1 row**; `KA` = 0 rows afterwards, and **`HA` is still present** with `client_id` **NULL** and `user_id`
>    **unchanged**. This is the live proof that the **column-list** `ON DELETE SET NULL (client_id)` landed: a bare
>    `SET NULL` would have tried to null `charges.user_id` (NOT NULL) and failed the delete outright.
> 8. **Control 15 — deletion semantics, charge side (destructive).** As A, `delete from charges where id = HA` →
>    `HA` = 0 rows and **`PA` = 0 rows by CASCADE**, with no orphaned payment left behind.
> 9. **Control 16 — isolation.** As A: `count(*) from charges where user_id = B` → **0**.
>
> **QA cleanup — VERIFIED ZERO BY QUERY, not assumed, and proven twice.** `HA`, `PA`, `PX` and `KA` were already gone
> via controls 13–15; `KB` was deleted as B. Then: **per-account under RLS** — all five ids returned `0`. Then
> **RLS-independently as `postgres`** so nothing could hide behind a policy — `public.charges` **0** rows,
> `public.payments` **0** rows, `F1_QA_%` clients **0**, the two QA client ids **0**, and `public.clients` back to
> **3** rows, exactly the real owner's pre-existing data. **The database baseline is fully restored.**

> ### ✅ CAMPAIGNS SLICE 2 — **MERGED + MIGRATION APPLIED / VERIFIED LIVE — NOW RELEASED BY SLICE 3** (merged 2026-07-29, applied 2026-07-30, surfaced in Production 2026-07-31)
>
> The optional **task → campaign** link: one nullable `public.tasks.campaign_id` plus the composite foreign key
> `(campaign_id, user_id) → public.campaigns (id, user_id)`, so a task can **never** reference another account's
> campaign. A single-column FK would not do this: a foreign key is checked **by the system, not through RLS**, so RLS
> hiding account B's campaign from account A does not stop A from referencing it. Carrying `user_id` into the key is
> what makes cross-account linking structurally impossible.
>
> **STATE — SUPERSEDED 2026-07-31: the schema was live and the product release is NO LONGER pending.**
> **Campaigns slice 3** (PR [#155](https://github.com/natanMeT/ArtValue20/pull/155), Production `bc0aa2a2` /
> `index-BL6kQf-e.js`) surfaced this column in the UI, so the task → campaign link is now usable in the
> product. The paragraph below is the state **as of this slice** and is retained for history:
>
> *The migration is **applied and verified live** (10 applied of 10 tracked, none pending* at that moment*;
> today **13 of 13, none pending**), so `public.tasks.campaign_id` and the composite FK now exist in the
> database. There is still **no build, no deployment, no Edge/Auth/secret change** — and none is needed,
> because the frontend is untouched* **at the time of slice 2** *. The Production release, bundle and rollback
> target in the boxes below are **UNCHANGED by slice 2** — but they have since moved on; the authoritative
> current release is the **Campaigns Slice 3** box at the top of this document.*
>
> ✅ **The earlier merged-but-unapplied gap is CLOSED.** `main` **contains** the Campaigns #2 feature-merge
> `8b6a78a` — it is **not pinned to it**, and this document must never claim it is. `8b6a78a` is the historical anchor
> for *this slice's* feature merge; the current `main` HEAD moves with every later commit (this documentation PR
> included) and **must always be resolved live** (`git rev-parse origin/main`). ⚠️ **Scope of the parity claim that
> used to sit here.** This paragraph read "the live schema is no longer behind the repo… that window is over". That
> was true **only between the 2026-07-30 apply of `20260729120000` and the 2026-07-30 merge of F1** — a window of
> hours. It is **no longer true**, and stating it in the present tense made this document answer the schema-parity
> question two ways at once, six lines apart. What still holds, scoped to *this slice*: `public.tasks.campaign_id`
> and its composite FK **do exist in the database**, so a reader of `supabase/migrations/**` is not misled about
> **Campaigns slice 2**. Overall parity **also holds again as of the 2026-07-30 F1 apply**: **11 applied of 11
> tracked, none pending.** **The ✅ F1 box above is the authoritative statement on parity; the Baseline's Supabase
> line is where the current count lives.** *(Historical: both this slice and F1 held a window in which `main`
> deliberately carried merged, unapplied database work — a known owner gate, not drift. **Both windows are now
> closed.**)*
>
> 📌 **Two conventions this box exists to enforce, for every future slice:**
> **(1)** Migration counts are always written **"N applied of M tracked"**, and a historical count carries an explicit
> time scope (*"at that release"*, *"at that moment"*). A bare `N/M` fraction cannot be read as either applied or
> tracked, and silently contradicts a pending migration. This rule is mechanically checkable: no migration sentence in
> this file may contain a bare fraction. **(2)** No paragraph states that `main` **is** a given SHA. A merge
> commit is an anchor *contained in* `main`; the HEAD is resolved live, never quoted from this file.
>
> | | |
> | --- | --- |
> | Migration | `20260729120000_campaigns_slice2_task_link.sql` — **APPLIED and VERIFIED LIVE 2026-07-30** on linked project `weciwurjfwmqihcyexzj` via `supabase db push --linked`. Linked `migration list` showed a populated remote column for it: **10 applied of 10 tracked**, none pending *at that moment* (today **11 of 11, none pending**). The apply emitted exactly one NOTICE (`constraint "tasks_campaign_same_owner_fk" … does not exist, skipping`, from the idempotent `drop constraint if exists`) and its own self-verifying assertion blocks passed |
> | PART A (read-only) | **MATCHED EXACTLY.** `tasks.campaign_id` = `uuid` / `is_nullable=YES` / `column_default=NULL` / `is_generated=NEVER`. FK def verbatim: `FOREIGN KEY (campaign_id, user_id) REFERENCES campaigns(id, user_id) ON DELETE SET NULL (campaign_id)`. Partial index present: `CREATE INDEX idx_tasks_campaign ON public.tasks USING btree (campaign_id) WHERE (campaign_id IS NOT NULL)`. Existing tasks unlinked and valid: `0` tasks with a non-NULL `campaign_id` |
> | PART B (mutating acceptance) | **ALL FIVE CONTROLS DECISIVE — see the dedicated block below the table.** Run on **disposable QA records only** (campaign `CA`, campaign `CB`, task `TA`) owned by two **QA** accounts; **the real owner account** was **never touched** and no real data was read into or written by any control |
> | QA cleanup | **VERIFIED ZERO BY QUERY, not assumed.** `TA` = 0, `CA` = 0, `CB` = 0. Proven twice: per-account under RLS, then **RLS-independently as the owner role** so nothing could hide behind a policy. Whole-table totals returned to their exact pre-apply baseline — `public.tasks` 0 rows, `public.campaigns` 0 rows, `0` linked tasks |
> | PR | [#131](https://github.com/natanMeT/ArtValue20/pull/131) — **MERGED 2026-07-28T23:01:55Z**, merge commit `8b6a78a792aa019e1d38c3edeb4e629a92de02e5` (parents `735309b` + the owner-approved head `c6b489c`), merged with `--match-head-commit c6b489c` so a moved head would have failed the merge |
> | Rollback tag | `pre-campaigns-slice-2` @ `735309b` |
> | Branch | `slice/campaigns-2-task-campaign-link` — retained |
> | Review | **Codex CLEAN on the exact merged head `c6b489cf56`.** Three P2s were raised across two rounds, all confirmed valid, all fixed, all replied to and **RESOLVED — 0 unresolved threads** |
> | Frontend | **UNTOUCHED.** `TASK_FIELDS` in `src/lib/api.js` is an allow-list, so the new column is never written and `select('*')` simply ignores it. Wiring `campaignId` is a later, separate slice |
> | Deletion semantics | `on delete set null (campaign_id)` — the **column list is load-bearing**: a bare `SET NULL` would also null `tasks.user_id` (NOT NULL) and make every delete of a campaign that has tasks fail. PG15+ syntax; live project is **17.6** |
> | Backfill | **None, and none needed.** Existing tasks keep `campaign_id` NULL and stay valid (a composite FK is MATCH SIMPLE — a NULL key column skips the check) |
> | Tests | `src/lib/__tests__/campaignsSlice2Migration.test.js` — **38** focused DDL-contract tests. Full suite at the merged head **119 files / 3,265 passed / 0 failed**. *This session added no code and ran no suite — it applied the migration and executed the acceptance controls against the live database* |
>
> **PART B — the five acceptance controls, with their decisive results.** Each ran as the account named, under the
> real `authenticated` role with RLS active, on disposable QA records created for this run and deleted after it.
> 1. **Control 4 — positive (own campaign links).** As A: `update tasks set campaign_id = CA where id = TA` →
>    **1 row**, `campaign_id = CA`, `user_id` unchanged. Supporting fact captured in the same transaction: A's
>    `select` of `CB` returned **0 rows**, which is precisely the RLS blindness that control 5 then defeats.
> 2. **Control 5 — the negative control this slice exists for.** As A, naming B's campaign `CB`:
>    **REFUSED with `23503`** — `insert or update on table "tasks" violates foreign key constraint
>    "tasks_campaign_same_owner_fk"`, `DETAIL: Key is not present in table "campaigns".` A **could not** create a
>    durable pointer into B's data even though it knew the id. **No residue** — verified immediately afterwards:
>    `TA.campaign_id` was still `CA`, exactly as before the refused statement.
> 3. **Control 6 — unlink is always allowed.** As A: `set campaign_id = null` → **1 row**, `campaign_id` NULL,
>    `user_id` unchanged.
> 4. **Control 7 — deletion semantics (destructive, on `CA` only).** As A: relink `TA` → `CA`, then
>    `delete from campaigns where id = CA` → **1 row deleted**. Afterwards `CA` = 0 rows, and **`TA` is still
>    present** with `campaign_id` **NULL** and `user_id` **unchanged**. This is the live proof that the column-list
>    form of `on delete set null (campaign_id)` landed correctly — a bare `SET NULL` would have failed here with a
>    not-null violation on `tasks.user_id`.
> 5. **Control 8 — negative (nonexistent campaign).** As A, `set campaign_id = gen_random_uuid()`: **REFUSED with
>    `23503`**, same constraint name and same `DETAIL`. Optionality is a NULL, never an unmatched id.
>
> 📌 **How "as account A / as account B" was executed, stated plainly because it is a substitution.** The controls were
> **not** run through a browser sign-in: no QA account password is available in this environment, and Claude does not
> handle passwords. Each control instead ran server-side inside one transaction under
> `set local role authenticated` + `set local request.jwt.claims = '{"sub":"<qa-uid>", …}'`, which was **proved to be
> genuine** before any control ran — a probe returned `current_user = authenticated` and `auth.uid() = <qa-uid>`, and
> RLS demonstrably applied (A saw 0 of B's campaigns). This is decisive for **exactly** what the controls test: the
> composite FK is enforced **by the system, not through RLS**, so the `23503` refusals do not depend on which
> transport carried the statement. What it does **not** cover is the HTTP/PostgREST/JWT path — no such coverage was
> claimed, and none is needed while the frontend never writes this column.
>
> **The three P2s, because each is a reusable lesson:**
> 1. A pre-existing `campaign_id` was accepted on **type alone**. `add column if not exists` silently no-ops, so a
>    `NOT NULL` variant would break every task insert and a defaulted one would populate links nobody chose.
> 2. A **`GENERATED ALWAYS`** column passes type, nullability *and* default checks — its expression lives in
>    `generation_expression`, not `column_default`. Now requires `is_generated = 'NEVER'`.
> 3. The verification block claimed *"none of these modify data"* while five controls wrote and one **deleted a
>    campaign row**. Now split into read-only PART A and mutating PART B, with the delete marked destructive at the
>    point of use, disposable QA records mandated, and cleanup **verified by query rather than assumed**.
>
> ⚠️ **This is the first migration to touch a table that holds real user data**, and it makes Campaigns slice 1
> **non-rollback-able in isolation** — **as of 2026-07-30 this is no longer conditional: the FK EXISTS in the live
> database**, so it must be dropped before `campaigns_id_user_unique` or the `campaigns` table could be. That ordering
> was known and accepted when slice 1 was planned. Any future rollback plan touching `campaigns` must name this FK.
>
> **Owner gates — all database gates now taken.** ✅ Merge (approved by Nathan, locked to `c6b489c`).
> ✅ **Apply the migration** — done 2026-07-30, 10 applied of 10 tracked *at that moment*. ✅ **PART A** read-only verification —
> matched exactly. ✅ **PART B** two-account acceptance controls — a cross-account link was **refused with `23503`**,
> a nonexistent campaign was **refused with `23503`**, and a campaign delete left the task present with `campaign_id`
> NULL and `user_id` unchanged, **on disposable QA records, with cleanup verified zero by query**.
> ➖ Build and deploy — **not applicable and not performed**; the frontend is untouched, so there is nothing to
> release. A later slice that wires `campaignId` into the UI would reopen that gate.

> *The paragraph below describes the release that is running in Production. The slice above has not changed it — Campaigns slice 2's migration is now **applied and verified live**, but it is a schema-only change that produced **no build and no deployment**; the session before it changed database grants only and likewise produced no new release.*

**(RELEASE IN PRODUCTION)** **F1 CORE RECEIVABLES SLICE 1 (charges vs payments, derived payment status) — CLOSED / LIVE IN PRODUCTION.** Production **`88b20584-b375-4073-a762-f91dc2f1a1e8` / `index-BLR2aev7.js`** (Environment Production, branch `main`, commit-hash `c281cda`; the artifact was **built from `110bb1e`** and the delta to `c281cda` is **docs only**), promoted **unchanged** from the accepted Preview `10dbbf8d` — `wrangler` "Uploaded 0 files (12 already uploaded)", Production↔Preview **10/10 byte-identical**. Bundle **`index-BLR2aev7.js`** SHA256 `1277f2ccfe0c457cd2c8083d5dc728bc075320cb93ba4fffb5dad250393fbe46` (735,443 B). **Current rollback target `90a7dc15`**; `5bcf1ef0` is now a **historical fallback only**. Migration **`20260731120000` APPLIED and verified live — 11 applied of 11 tracked, none pending**. Edge `ai-gateway` **v36 ACTIVE / `verify_jwt=true`, untouched**; no secret change. Authenticated Preview UI QA **PASSED** and the authenticated **non-mutating Production smoke PASSED** (49/49 requests 200, all `GET`, 0 writes, 0 console messages, row counts unchanged), both on the isolated QA account. Rollback tag `pre-finance-receivables-slice1` @ `110baf1`. **The closure box in the Baseline below is the authoritative state.**

> *The paragraph below describes the PREVIOUS release and is retained as history. Its "Production …" and "Current rollback target …" statements describe that release, NOT today.*

**(HISTORICAL — previous release)** **CAMPAIGNS SLICE 1 (durable per-account business campaigns) — CLOSED, since superseded in Production.** Merge `97b4229c0b1d600646c53e04364647d9ab9401fb` (PR [#127](https://github.com/natanMeT/ArtValue20/pull/127), parents `a548518` + the owner-gated head `8510cd1`). Production **`90a7dc15-1ed1-4d2a-ad6e-9044c786334c` / `index-9FYipeQ9.js` (source `97b4229`)**, promoted unchanged from the accepted Preview `19a58ba9` (wrangler "Uploaded 0 files (12 already uploaded)"). **Current rollback target `5bcf1ef0`**; `b3708cc2` is now a **historical fallback only**. Migration **`20260728120000` APPLIED and verified live — 8 applied of 8 tracked *at that release*; today the project is at **11 applied of 11 tracked, none pending** (F1's `20260731120000` was applied 2026-07-30)**. Edge `ai-gateway` **v36 ACTIVE / `verify_jwt=true`, untouched**; no secret change. Full suite 117 files / 3,219 passed / 0 failed *at that release*. Rollback tag `pre-campaigns-slice-1` @ `a548518`. **The closure box in the Baseline below is the authoritative state.**

> *The paragraph below describes the PREVIOUS release and is retained as history. Its "Production …" and "Current rollback target …" statements describe that release, NOT today.*

**(HISTORICAL — previous release)** **ASSET LIBRARY SLICE 1 (durable cloud gallery images) — CLOSED / LIVE IN PRODUCTION.** Merge `87fed4bffcb2b84d7967f371b9f1063d79db433f` (PR [#125](https://github.com/natanMeT/ArtValue20/pull/125), parents `3803b61` + the owner-gated head `607cac1`). Production **`5bcf1ef0-fa3e-4ff6-b55f-7a22f68db3aa` / `index-dUN1r8PM.js` (source `87fed4b`)**, promoted unchanged from the accepted Preview `d1235743` (wrangler "Uploaded 0 files (12 already uploaded)"; canonical serves 12/12 byte-identical). **Current rollback target `b3708cc2`**; `247ef9ec` is now a **historical fallback only**. Migration **`20260727120000` APPLIED and verified live — 7 applied of 7 tracked *at that release*** (today: **11 applied of 11 tracked, none pending**). Edge `ai-gateway` **v36 ACTIVE / `verify_jwt=true`, untouched**; no secret change. Full suite 114 files / 3,153 passed / 0 failed. Rollback tag `pre-asset-library-slice-1` @ `3803b61`. **The closure box in the Baseline below is the authoritative state.**

> *The paragraph below describes the PREVIOUS release and is retained as history. Its "Production …" and "Current rollback target …" statements describe that release, NOT today.*

**(HISTORICAL — two releases back)** **COMPLETE LOCAL-ENGINE RETIREMENT (rounds 8–15) — CLOSED, since superseded in Production.** Merge commit `9ecb8ebf023886f32496d3002944a3b092314cfe` (parents `5d7506d1` + the approved head `cd651ea`), 2026-07-27T07:00:34Z, **0 unresolved review threads**, Codex clean on the exact merged head. **The retirement is LIVE:** Production **`b3708cc2` / `index-C4frcMDi.js` (source `2c8b1df`)**, promoted unchanged from the accepted Preview `17bba0b3` (12/12 byte-identical), Edge `ai-gateway` **v36 ACTIVE / `verify_jwt=true`**. Current rollback target **`247ef9ec`**; `476830a2` is a historical fallback. No migration, schema, Auth or secret change. Rollback tag `pre-local-engine-retirement` @ `5d7506d1`. At the merged head: focused proof 2 files / 172 passed; **full suite 110 files / 3,074 passed / 0 skipped / 0 failed**. **The closure box in the Baseline below is the authoritative state.** Authenticated Studio generation and authenticated Jake Gateway calls are now **VERIFIED** (Preview acceptance, Account A). The Edge redeploy has been **performed** (v35 → v36).

> *Everything below in this summary is a **HISTORICAL** account of how the slice was built. Round labels such as "IN FLIGHT" describe the state **at that round**, not today.*

**(Round 11 — historical)** Nathan's absolute decision: no executable local-engine code anywhere in the repository, product AND tooling. Round 10's two disclosed exceptions are withdrawn. **The AI Gateway shared contract changed:** `comfyui` / `ollama` / `fooocus` / `a1111` are removed from `AI_PROVIDERS`, `AI_MODELS` and every routing chain, together with the `LOCAL_PROVIDERS` partition, the `localFirst` selection option (and its response metadata) and the local zero-cost branch — the 20-action cloud vocabulary is unchanged and every action still resolves to a non-empty all-API chain. **`scripts/local-review-prep.mjs` (a local-Ollama caller), its test, the whole `scripts/` directory, `comfy_help.txt` and the `local:review-prep` / `dev:local` / `preview:local` npm scripts are DELETED.** Docs corrected where they claimed local engines are still supported. Repo-wide proof scans **172 non-test executables** across `src/`, `supabase/`, root and `scripts/` for engine names and local addresses with comments stripped, and proves the `src/lib` Gateway shims are pure re-exports so no divergent copy can exist. Two further Codex P2s on `1233034` (a DemoMode copy regression of mine, and eval-provenance wording) were confirmed and fixed. Codex then broke the proof's hand-written scanner three times (URL `//` in string literals; nested `.mjs`/`.cjs`; then object literals in template substitutions, JSX text and regex after `return`). The approximation WAS the defect, so it is gone: the scanner is now **parser-backed via `@babel/parser`**, blanking only the parser's own comment ranges, and the address classes were widened to RFC1918/link-local/IPv6 private ranges in network context. Suite at that round **110 files / 2,997 passed / 0 skipped / 0 failed** *(superseded — the merged head measured 3,074)*, build green (`index-C4frcMDi.js`, 608.05 kB); the app bundle now has **zero** hits for every local term including the provider-registry strings that survived round 10. Runtime: retired routes fail safe, all surviving creative routes render, 0 local requests, 0 console messages. ⚠️ **An Edge `ai-gateway` redeploy will be REQUIRED later — NOT performed here**; nothing deployed, no secret or remote configuration touched. *(Historical: that redeploy was subsequently PERFORMED — `ai-gateway` went v35 → v36 on 2026-07-27 and is ACTIVE with `verify_jwt=true`. No further redeploy is required.)* Prior round summaries follow. **(Round 10 — historical)** 

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

## Baseline (current — F1 CORE RECEIVABLES SLICE 1 CLOSED / LIVE in Production)

> ### ✅ F1 CORE RECEIVABLES SLICE 1 — **CLOSED / LIVE IN PRODUCTION** (2026-07-30)
>
> | | |
> | --- | --- |
> | **Production deployment** | **`88b20584-b375-4073-a762-f91dc2f1a1e8`** (Environment Production, branch `main`, commit-hash `c281cda`) |
> | **Bundle** | **`index-BLR2aev7.js`** — SHA256 `1277f2ccfe0c457cd2c8083d5dc728bc075320cb93ba4fffb5dad250393fbe46` (735,443 B) |
> | Artifact provenance | **Built from `110bb1e`** (the Preview source), promoted **unchanged** from Preview `10dbbf8d`. **ONE build total**, no rebuild for Production: `wrangler` "Uploaded 0 files (12 already uploaded)", Production↔Preview **10/10 byte-identical by SHA-256**. The `110bb1e`→`c281cda` delta is **docs only** (one file) |
> | Code PR | [#134](https://github.com/natanMeT/ArtValue20/pull/134) (feature) + repair merges [#136](https://github.com/natanMeT/ArtValue20/pull/136) / [#137](https://github.com/natanMeT/ArtValue20/pull/137) |
> | Migration | **`20260731120000_finance_receivables_slice1.sql` APPLIED and verified live 2026-07-30 — 11 applied of 11 tracked, none pending.** No Auth or secret change |
> | **Edge** | `ai-gateway` **v36 ACTIVE, `verify_jwt=true`** — **UNCHANGED, not redeployed** by this slice |
> | Preview accepted | **`10dbbf8d-d02d-4fcb-8255-6d83a5bff70b`** — authenticated UI QA PASSED on the isolated QA account, real clicks only |
> | Production smoke | **Authenticated, non-mutating: PASSED.** 49/49 requests HTTP 200, **all `GET`, 0 writes**, 0 console messages, row counts identical before and after |
> | **Current rollback target** | **`90a7dc15-1ed1-4d2a-ad6e-9044c786334c`** (source `97b4229`, bundle `index-9FYipeQ9.js`, Campaigns slice 1) — the immediately previous Production deployment. `5bcf1ef0` is now a **historical fallback only** |
> | Git rollback tag | `pre-finance-receivables-slice1` @ `110baf1` |
>
> **A frontend rollback does NOT undo migration `20260731120000`** — it is additive and stays applied; the previous
> bundle simply never queries `public.charges` / `public.payments`.
>

> ### (HISTORICAL — previous release) CAMPAIGNS SLICE 1 — **CLOSED, since superseded in Production** (2026-07-28)
>
> *Its "Production deployment", "Bundle" and rollback statements below describe THAT release, NOT today. Today's
> Production is F1 `88b20584` / `index-BLR2aev7.js` — see the box directly above.*
>
> `public.campaigns` is the durable, per-account **business campaign**: title, objective, status, start/end dates,
> with a minimal management screen. This delivers a **second** of the three **§7.6** Growth reopening prerequisites —
> **Growth is NOT reopened**; an account-aware Growth data model remains open and reopening still requires its own
> approved slice.
>
> **⚠️ NAMING BOUNDARY — the single most important fact about this slice.** `public.campaigns` is **NOT**
> `src/creative/v2/campaignStore.js`. That module is a device-local **creative session** (one brief → 3 concepts →
> selection) in `localStorage`; this is a durable business object with a lifecycle. Same English word, lifetimes an
> order of magnitude apart. Nothing was migrated between them, neither references the other, and a test fails if the
> new page or lib imports from `src/creative/v2/**`. **In all future writing the creative one is a "creative
> session", never a "campaign".**
>
> | | |
> | --- | --- |
> | **Production deployment** | **`90a7dc15-1ed1-4d2a-ad6e-9044c786334c`** (Environment Production, branch `main`, source `97b4229`) |
> | **Bundle** | **`index-9FYipeQ9.js`** — SHA256 `1dc210937f5fbb1ca61cd08cf9c86a645b9ee43ab06f73f37ee441220fd0ee31` (706,290 B) |
> | Release source | `97b4229c0b1d600646c53e04364647d9ab9401fb` (PR #127 merge; parents `a548518` + the owner-gated head `8510cd1`) |
> | Code PR | [#127](https://github.com/natanMeT/ArtValue20/pull/127) — merged with `--match-head-commit 8510cd1`, so a moved head would have failed the merge |
> | **Edge** | `ai-gateway` **v36 ACTIVE, `verify_jwt=true`** — **UNCHANGED, not redeployed** by this slice |
> | Migration | **`20260728120000_campaigns_slice1.sql` APPLIED 2026-07-28 — 8 applied of 8 tracked, matching *at that release*; the project is now at **11 applied of 11 tracked, none pending** (F1's `20260731120000` was applied 2026-07-30).** No Auth or secret change |
> | Preview accepted | **`19a58ba9`** (`campaigns-slice-1-preview`) — two-QA-account acceptance PASS |
> | Rollback tag | `pre-campaigns-slice-1` @ `a548518` |
>
> **The TRIGGER is the protection — not the UI.** A `CHECK` constraint sees one row and never the `(OLD → NEW)` pair,
> so the lifecycle is enforced by `trg_campaigns_status_transition`, a plain `BEFORE UPDATE` trigger (**not**
> `BEFORE UPDATE OF status`, whose column form fires only when the client names the column in its `SET` list and
> would therefore make enforcement depend on the caller). This is the repo's **first** status-transition trigger.
> **Proven live:** `completed → active` issued through the privileged CLI role — which **bypasses RLS** — was still
> refused with **`ERROR 23514: campaigns: illegal status transition completed -> active`**. RLS is role-dependent;
> this trigger is not.
>
> **The row quota lives on INSERT ALONE — 200 per account.** `campaigns_insert_own` carries
> `campaign_row_count() < 200`; `campaigns_update_own` carries ownership and **nothing else**. An earlier revision
> also mirrored the quota into the UPDATE policy, and **owner review removed it**: an UPDATE cannot raise the row
> count and its `WITH CHECK` already blocks moving a row between accounts, so that predicate **could never fire** —
> and a condition that can never fire is not defence in depth, it is a second copy of a rule free to drift from the
> first. **Live proof that the cap gates creation and never recovery:** at exactly 200 rows an account still edits
> and cancels (`1, 1, 200`). The counter is a zero-argument `SECURITY DEFINER` function, because a policy counting
> the table it guards recurses infinitely.
>
> **Isolation proven at the API layer, not merely in the UI.** With account D's own valid token, an **unfiltered**
> `select` on `campaigns` returned `[]`, and account B's campaign **targeted by exact UUID** returned `[]`, while
> that row demonstrably existed. Positive control: after D created one row the identical query returned exactly that
> row and B's stayed invisible — so the `[]` was RLS scoping, not a dead query.
>
> **Local/demo is not verifiable in the cloud and is NOT claimed as verified in Production.** Campaigns is a
> cloud-only module, so the page renders a truthful unavailable state locally rather than a form that would persist
> nothing (the S0A false-success rule, inverted; the nav entry uses a new `cloudOnly` flag, the mirror image of
> `betaHidden`). Because `isSupabaseConfigured` is fixed **at build time**, no cloud deployment can exercise that
> path — it is covered by source-pinned tests plus a negative control, and by nothing else.
>
> **Acceptance evidence.** Preview `19a58ba9` on **two QA accounts** (the JWT `sub` was read before any write, both
> times): create → **full reload → the row survived** (confirmed server-side with the right `user_id`); edit;
> `draft→active` then `active→completed` with the offered buttons changing per state; in a terminal state only
> `ערוך`/`מחק` remain — **0 transition buttons** — and an instrumented `fetch` recorded **0 requests** when every
> remaining button was clicked; delete → gone, and still gone after a reload; **0 console messages**. The zeroes are
> meaningful because a **legal** transition was measured emitting exactly one `PATCH {"status":…}` + a `GET`
> re-read, and a create emitting `POST` then `GET` — the screen never updates optimistically. Production smoke on
> **Account A**: Campaigns loads `0/200` empty, all other modules normal, **0 console messages**, and a write
> detector recorded **0 writes / 2 reads** with the DB byte-for-byte unchanged after.

> ### (HISTORICAL — previous release) ASSET LIBRARY SLICE 1 — CLOSED, since superseded in Production (2026-07-27)
>
> ImageStudio gallery images are now **durable cloud assets** owned by the signed-in account: a private `assets`
> Storage bucket plus `public.assets` metadata rows. Changing device no longer loses generated images. This closes
> the durability gap named in roadmap **§4.5** and delivers **one** of the three **§7.6** Growth reopening
> prerequisites — **Growth is NOT reopened**; durable Campaigns and an account-aware Growth data model remain open.
>
> | | |
> | --- | --- |
> | **Production deployment** | **`5bcf1ef0-fa3e-4ff6-b55f-7a22f68db3aa`** (Environment Production, branch `main`, source `87fed4b`) |
> | **Bundle** | **`index-dUN1r8PM.js`** — SHA256 `03e8f062be62b678bbb442639fa2a75033a123e1a6277a7842b8b54c10ac225c` (697,879 B) |
> | Release source | `87fed4bffcb2b84d7967f371b9f1063d79db433f` (PR #125 merge; parents `3803b61` + the owner-gated head `607cac1`) |
> | Code PR | [#125](https://github.com/natanMeT/ArtValue20/pull/125) — merge gated on head `607cac1`, verified before merging |
> | **Edge** | `ai-gateway` **v36 ACTIVE, `verify_jwt=true`** — **UNCHANGED, not redeployed** by this slice |
> | Migration | **`20260727120000_asset_library_slice1.sql` APPLIED 2026-07-27 — 7 applied of 7 tracked, matching *at that time*; the project is now at **11 applied of 11 tracked, none pending** (F1's `20260731120000` was applied 2026-07-30).** No Auth or secret change |
> | Preview accepted | **`d1235743`** (`assets-preview-87fed4b`) — full authenticated QA-account acceptance PASS |
> | Rollback tag | `pre-asset-library-slice-1` @ `3803b61` |
>
> **Design — isolation is STRUCTURAL, not merely policy-based.** The object path is `{auth.uid()}/{asset_id}.{ext}`
> and `public.assets` carries `check (storage_path = user_id::text || '/' || id::text || '.' || ext)`, which
> **reconstructs the exact string from the row's own columns** — not a prefix test, not a `LIKE` pattern. Bytes are
> reached only through **short-lived signed URLs**; the bucket is private and the public-URL helper is never called.
>
> **The quota is SYMMETRIC — 40, enforced on BOTH sides.** A create writes the **row first** and only then the
> bytes, so a quota on `storage.objects` alone would leave `public.assets` uncapped: an account at 40 could insert a
> row, have the upload refused, keep the dangling row by design, and repeat without bound. That defect was found in
> owner review and corrected in `607cac1`. Each side has its **own** `SECURITY DEFINER` counter — a dangling row
> counts as a row but not an object, so one shared counter would be wrong. Both take **no owner argument**.
> A policy that counts from the table it guards would recurse infinitely; `SECURITY DEFINER` is what breaks the cycle.
>
> **The ordering rule — always fail toward the VISIBLE state.** Create = row, then bytes; delete = object, then row.
> An orphaned object is invisible forever; a dangling row is visible and deletable. A failed upload therefore leaves
> the row **deliberately uncleaned** — removing it would risk erasing the record of an object that actually landed.
>
> **NO data migration.** The device IndexedDB gallery (`artvalue_gallery_<uid>`) is **legacy** in cloud mode: never
> read, converted, copied or deleted. Local/demo is unchanged. **Visible consequence, by design:** images that
> existed only in a device gallery no longer appear in cloud mode — they are not deleted, they are not read.
>
> **Live database evidence (2026-07-27, owner-run SQL against the real project):** the **row quota is PROVEN** —
> seeded 40 rows; an impersonation probe confirmed `running_as = authenticated`, `auth.uid()` = the QA account
> and `rows_counted = 40`; the 41st insert failed with **`ERROR 42501: new row violates row-level security policy`**;
> after freeing exactly one slot the **identical statement succeeded**; cleanup returned `remaining_qa = 0`,
> `total_rows = 0`. **The probe is what makes this evidence** — it rules out an empty `auth.uid()` or a path-CHECK
> violation as the source of the same error. Without the positive half it would prove a block, not a quota.
>
> **Preview acceptance evidence (QA account, the only place these are testable):** create issued
> `POST /rest/v1/assets` **201** then `POST /storage/v1/object/assets/{uid}/{asset_id}.jpg` **200** (row-first
> confirmed live); refresh preserved the item, served from `/object/sign/` with a token, 484,018 bytes decoding to
> 1024×1024; delete issued `DELETE /storage/…` **200** then `DELETE /rest/v1/assets?id=eq.…` **204** (object-first
> confirmed live) and the item did not return after refresh. **Storage policies:** write outside own prefix →
> **403**, signed URL for another account's path → **404**, `x-upsert: true` overwrite → **403**, duplicate path →
> **409**. **Object quota:** filled to 40, the 41st → **403**; freeing one slot made the identical write **200**.
> Cleanup verified from three independent sources: storage list 0, rows 0, `asset_object_count()` **0**.
> **0 console messages throughout.**
>
> **Production smoke (non-mutating, the owner account) — PASS.** Gallery hydration
> issued exactly one `GET /rest/v1/assets` → 200 (Account A holds 0 cloud assets); across five routes only **2 GETs
> total, 0 writes, 0 console messages**; the account's brand palette rendered.
>
> **Declared limitations — recorded, not fixed:**
> - **L1 Concurrency.** Both quota predicates count inside the statement snapshot, so two simultaneous creates at 39
>   can reach 41. It bounds growth; it is **not** a security boundary.
> - **L2 Account deletion.** `on delete cascade` removes `public.assets` **rows**, not Storage **objects**.
> - **L3 Declared MIME.** `allowed_mime_types` validates the Content-Type the client **declares**; no byte sniffing.
> - **L4 No UPDATE policy.** Absence is the denial, which is why every upload must pass `upsert: false` — **proven
>   live** by the `x-upsert` attempt returning 403.
> - **✅ RESOLVED 2026-07-29 (was: `anon` holds EXECUTE on both counter functions).** `revoke … from public` does
>   not remove a role's own explicit grant, and Supabase grants EXECUTE to `anon` by default — so `anon` kept it.
>   Closed by migration `20260728130000`, which revoked EXECUTE from `anon` on **all three** counters at once;
>   `anon` now raises `42501` and `authenticated` is unaffected. **The class is closed too, not just the
>   instances** — see the Baseline entry for `securityDefinerGrants.test.js`.
>
> **(HISTORICAL — previous release) COMPLETE LOCAL-ENGINE RETIREMENT — CLOSED, superseded in Production.** ArtValue
> became a **cloud-only product** in that release; every executable ComfyUI / Ollama / Fooocus / A1111 integration and
> its consumers, routes, provider registrations, configuration, scripts and tooling were removed. It shipped as
> deployment **`b3708cc2`** / `index-C4frcMDi.js` (source `2c8b1df`, PRs [#118](https://github.com/natanMeT/ArtValue20/pull/118) `9ecb8eb` and [#119](https://github.com/natanMeT/ArtValue20/pull/119) `2c8b1df`), with Preview
> `17bba0b3` accepted and **6 applied of 6 tracked** *at that time*. **`b3708cc2` is today a HISTORICAL FALLBACK ONLY** (see the
> hierarchy below) — it was the current rollback target under the Asset Library release and was demoted by
> Campaigns slice 1; it is no longer the live deployment and no longer the target to roll back to.
>
> **DEFINITION — what "promoting the exact artifact" means in THIS project.** It means **re-deploying the same
> byte-identical `dist/` to the production branch**, producing a **new deployment id**. It does **NOT** mean
> promoting the Preview deployment *object*: `wrangler pages deployment` offers only `list` / `create` / `tail` /
> `delete`, so no CLI operation turns an existing preview deployment into the production one. The signature of a
> correct promotion is wrangler reporting **"Uploaded 0 files (N already uploaded)"** — the bytes were already in
> the project store, so nothing was rebuilt. Every release in this project has been made this way. **Recorded
> because the phrase "promote that deployment, not the dist in the folder" caused an unnecessary SAFE STOP in the
> Campaigns slice 1 release.** The requirement is byte-identity of the served artifact, not identity of the
> deployment object.
>
> **Artifact proof for the CURRENT release (Campaigns slice 1) — promoted unchanged, never rebuilt.** Exactly
> **one** build, from `97b4229`. The same `dist/` was verified byte-identical to the bytes Preview `19a58ba9`
> actually served (entry SHA256 `1dc21093…0ee31`) before promotion. Wrangler reported **"Uploaded 0 files (12
> already uploaded)"**, and the canonical `artvalue-product.pages.dev` then served `index.html` referencing
> **`assets/index-9FYipeQ9.js`**, re-downloaded and confirmed at **SHA256 `1dc21093…0ee31`, 706,290 B**, with an
> ETag identical to the accepted Preview's.
>
> **Artifact scan for the CURRENT release — product code clean, with a positive control.** The product chunk
> `index-9FYipeQ9.js` contains **0** occurrences of the public-URL helper and **0** local-engine identifiers. The
> scanner was first proven able to report a hit (`createSignedUrl` = 1, `"/campaigns"` = 2 in the same chunk), so
> the zeroes are meaningful. One match on `/workflow` was investigated and is a **regex literal** inside Jake's
> intent classifier (`intent:"creative_workflow"`), not a route — the quoted forms `"/workflow"`, `"/fooocus"` and
> `"/adstudio"` are all **0**. The only other hit is the vendor chunk `supabase-C8W5_S3P.js`, **byte-identical
> (SHA256 `11d6e4f5…`) to the chunk Production was already serving**.
>
> **⚠️ Measurement trap #3 — an early asset request after deploying returns the SPA's `index.html`.** The first
> post-deploy fetch of `/assets/index-9FYipeQ9.js` returned **1,285 bytes of `index.html`** (the SPA catch-all,
> because the asset had not finished propagating), whose SHA256 naturally did not match — which reads exactly like a
> corrupted release. **Check the downloaded SIZE and the ETag before concluding a mismatch:** a Vite filename *is*
> the content hash, so a genuine content change would have changed the filename. Re-fetch with `--retry`.
>
> **(HISTORICAL — previous release) Artifact proof (Asset Library slice 1) — promoted unchanged, never rebuilt.** Exactly **one**
> build, from `87fed4b`. Before Preview the artifact was scanned; before Production the same `dist/` was re-verified
> **12/12 byte-identical to the bytes Preview actually served**. Wrangler reported **"Uploaded 0 files (12 already
> uploaded)"**, and the canonical `artvalue-product.pages.dev` then served **12/12 files byte-identical**, with
> `index.html` referencing `assets/index-dUN1r8PM.js` (entry SHA256 `03e8f062…`, 697,879 B).
>
> **Artifact scan before deploying — product code clean, with a positive control.** The product chunk
> `index-dUN1r8PM.js` contains **0** occurrences of the public-URL helper, **0** local-engine identifiers and **0**
> loopback addresses. The scanner was first proven able to report a hit (`createSignedUrls` = 1 in the same chunk),
> so the zeroes are meaningful. The **only** hit anywhere in the artifact is the public-URL helper's own **definition
> inside the Supabase SDK vendor chunk** `supabase-C8W5_S3P.js`, which is **byte-identical (SHA256 `11d6e4f5…`) to
> the chunk Production was already serving** — this release introduced no new occurrence.
>
> **⚠️ Two measurement traps recorded so they are not re-learned the expensive way.**
> 1. **Post-deploy propagation.** For roughly a minute after promotion the canonical `/` still served the OLD bundle
>    **even with cache-busting and `no-cache`**, while `/index.html` already served the new one. Five repeated
>    cache-busted probes then agreed. Wait and re-probe before declaring a mismatch.
> 2. **Content-hashed assets make a naive 12/12 pass meaningless.** Both the old and new entry bundles return HTTP
>    200 simultaneously, so only `index.html` distinguishes releases — and it must be compared at **`/`**, the path
>    users actually hit, not at `/index.html`.
>
> **(HISTORICAL — previous release) Artifact proof.** The retirement's deployed `dist/` was proven byte-identical three ways
> **before** deployment: local `dist/` ≡ the pre-Preview scan manifest (no drift) ≡ the bytes Preview actually served
> (12/12). Wrangler reported **"Uploaded 0 files (12 already uploaded)"**, and the canonical
> `artvalue-product.pages.dev` then served **12/12 files HTTP 200 and byte-identical**, with `index.html` referencing
> `assets/index-C4frcMDi.js`. The one build had already reproduced the previously smoke-verified hash exactly,
> confirming the intervening commits were test/docs-only.
>
> **(HISTORICAL — previous release) Authenticated Preview acceptance (Account A) — all ten checks PASS.** Studio exposes one creative lane
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
> **(HISTORICAL — previous release) Production smoke (non-mutating) — PASS.** At that time the canonical URL served `index-C4frcMDi.js`; the authenticated Account A
> session loads Clients, Quotes, Finance and Growth OS; Studio shows only supported cloud functionality with the brand
> palette active; **0** retired terms; retired routes fail safe; 20 s idle → **0** requests; **0** local-engine
> requests, **0** mutating requests, **0** console errors; Edge re-confirmed v36 / `verify_jwt=true`. No generation,
> save or delete was performed.
>
> **Rollback hierarchy AS IT STOOD AT THAT RELEASE — superseded. For today's hierarchy read the Baseline list
> above: the current target is `5bcf1ef0` and `b3708cc2` has been demoted to a historical fallback.**
> 1. **Current rollback target *at that time*: `b3708cc2-ab2e-44ee-a557-8cc2ae688635`** (source `2c8b1df`, bundle
>    `index-C4frcMDi.js`, complete local-engine retirement) — the immediately previous Production deployment,
>    verified **HTTP 200 and still serving its own bundle after this release**. **This is the deployment to roll
>    back to.**
> 2. **HISTORICAL FALLBACK ONLY — NOT the current target: `247ef9ec-ad3a-4c15-8b16-25afa1c47f2b`** (source
>    `03c23c2`, bundle `index-BZ3B-0yd.js`, Studio containment). **It was demoted from current target by this
>    release and was NOT deleted.** Rolling back here would also revert the complete local-engine retirement.
>    `476830a2` (source `7e30199`, `index-BrR14XIC.js`) and the older `e63198b7` / `4b86993d` / `69f8a175` /
>    `cec116b9` / `31cb521d` / `4cb17aee` are likewise fallbacks only, progressively further behind.
> 3. Git rollback tag **`pre-asset-library-slice-1` @ `3803b61`**. **No Edge rollback applies to this release —
>    `ai-gateway` v36 was not redeployed.** (The retirement's Edge rollback, restoring the v35 contract, remains
>    documented under that release.)
>
> **⚠️ A rollback of the FRONTEND does not undo the migration.** `20260727120000` is applied and additive; the
> `assets` table, bucket and policies remain in place after any frontend rollback. The previous bundle simply never
> queries them, so the device-local gallery behaviour returns. Nothing needs to be un-migrated to roll back.
>
> **Remaining unselected follow-up (NOT implemented, NOT scheduled): platform-level egress hardening.** A guarantee
> that no future code path can construct a private-network request belongs to CSP `connect-src` and server-side egress
> policy, not to application JavaScript. Named sub-item: `fetchSiteText` passes a user-supplied URL to the third-party
> reader proxy — pre-existing, released behaviour, unchanged by this release.
>
> **P1 Atomic Quote Persistence remains CLOSED / LIVE. PR #117 remains paused and untouched.**
- Repo: `C:\Users\PC\ArtValue` (origin/main). GitHub repo `natanMeT/ArtValue20`.
- **Active application release code anchor:** **`97b4229c0b1d600646c53e04364647d9ab9401fb`** (PR #127 merge; the running Production artifact was built from this commit). *(Historical anchors, retained only as the sources of older deployments: `87fed4b` — Asset Library slice 1, now the rollback target's source; `2c8b1df` — complete local-engine retirement, now the **current rollback target's** source; `03c23c2` — Studio containment; `7e30199` — P1; `983f4899` — S0F.1.)*
- **Three DISTINCT anchors — never collapse them.** This tracker records no fixed value for the repository head, because documentation merges advance it continuously and any pinned value would be false within minutes:
  1. **Repository `main` HEAD — NOT recorded here. Resolve it LIVE at every task's preflight** (`git rev-parse origin/main`). Do not read any SHA in this document as "the current head".
  2. **Historical application-code merge anchors:** `87fed4b` (PR #125) — where Asset Library slice 1 entered `main`; its code is **now RELEASED** (see anchor 3). `9ecb8eb` (PR #118), `2c8b1df` (PR #119) and `29cccdd` (PR #114) are older such anchors.
  3. **Deployed Production source:** **`87fed4b`** — the commit the running Production artifact was actually built from (Asset Library slice 1). The prior `2c8b1df` (complete local-engine retirement) is retained as the **current rollback deployment's** source.
  A live head will normally differ from anchors 2 and 3. **Divergence is expected and is NOT deployment drift. Never treat "merged into `main`" as "live" — always confirm which commit the running artifact was built from.**
- Hosting: Cloudflare Pages `artvalue-product` — canonical https://artvalue-product.pages.dev
- **Current Production deploy: `c2bb560e-a562-4a00-b90f-15b4e4711ac7`** (Environment Production, branch `main`, source **`5bea9ee`**, bundle **`index-CZQwY28c.js`**) — **LIVE (Campaign Delete Safety — frontend-only, no migration)**, deployed 2026-07-31, the accepted Preview artifact **promoted unchanged** ("Uploaded 0 files (12 already uploaded)"; the **served** bundle is **byte-identical by SHA-256** to the artifact the owner QA'd, `638fab8519296508c7693780ad0013a8aeaa87fe11fb69afe1dee8b0120eae88`, 766,629 B). Migrations are **13 applied of 13 tracked, none pending**; Edge `ai-gateway` v36 ACTIVE / `verify_jwt=true`, untouched. **Full evidence: the box at the top of this file — that box, not this line, is the source of truth for the current release.** *(Superseded, in order: `bc0aa2a2-6569-4c2f-a16a-4ebd2deaf734` / `index-BL6kQf-e.js` (source `669e8da`, Campaigns slice 3) is now the **current rollback target**; `86d5cca9-88e2-40db-9869-664cfc1567e8` / `index-o0xZrfkL.js` (source `1eb7b2a`, Finance Charge Safe Delete) is a **historical fallback only**, retained.)*
  - *(HISTORICAL — the line below is the superseded description of an earlier deploy, retained as history and NOT current: )* **`86d5cca9-88e2-40db-9869-664cfc1567e8`** (source **`1eb7b2a`**, bundle **`index-o0xZrfkL.js`**) — **was LIVE (Finance Charge Safe Delete — frontend + one additive function migration)**, deployed 2026-07-30, the accepted Preview artifact **promoted unchanged** ("Uploaded 0 files (12 already uploaded)"; local `dist/` ↔ Preview `5a9e7277` ↔ Production were **12/12 byte-identical by SHA-256**). *(This line was left standing as a present-tense "Current Production deploy" claim through two later releases — Campaigns slice 3 and Campaign Delete Safety. It is corrected here; see the note at the end of this bullet group.)*
  - *(HISTORICAL — the line below is the superseded description of the previous deploy, retained as history and NOT current: )* **`c45518fb-17b6-448a-b35e-cb9a3a46367d`** (source **`d9d5bf0`**, bundle **`index-B21Es_EZ.js`**) — **was LIVE (Client Profile slice 1 — frontend-only, no migration)**, deployed 2026-07-30, the accepted Preview artifact **promoted unchanged** ("Uploaded 0 files (12 already uploaded)"; canonical was **12/12 byte-identical by SHA-256** to the accepted `dist/`). Migrations were **12 applied of 12 tracked, none pending** *at that release* (today: **13 of 13**, after `20260802120000` was applied 2026-07-30). **No git rollback tag was created for that release.**
  - *(HISTORICAL — the line below is the superseded description of the previous deploy, retained as history and NOT current: )* **`478e4d62`** (commit-hash **`83f2dfa`**, bundle **`index-PcQFaAu-.js`**) — **was LIVE (UI Polish + Dashboard action card — UI-only, no migration)**, deployed 2026-07-30, the accepted Preview artifact **promoted unchanged** ("Uploaded 0 files (12 already uploaded)"; Production↔Preview **7/7 byte-identical by SHA-256**, matching the local `dist/` hashes). Migrations remain **12 applied of 12 tracked, none pending**; Edge `ai-gateway` v36 ACTIVE / `verify_jwt=true`, untouched. **Full evidence: the ✅ box at the top of this file — that box, not this line, is the source of truth for the current release.** *(Superseded, in order: `ad09b631-8d70-421c-b3fc-543972b95723` / `index-QaS25VkC.js` (commit-hash `660f671e`, Schedule Core slice 1) is now the **current rollback target**; `88b20584-b375-4073-a762-f91dc2f1a1e8` / `index-BLR2aev7.js` (commit-hash `c281cda`, artifact built from `110bb1e`, F1 Core Receivables slice 1) is a **historical fallback only**, retained.)*
  - *(HISTORICAL — the two lines below are the superseded descriptions of earlier deploys, retained as history and NOT current: )* **`88b20584-b375-4073-a762-f91dc2f1a1e8`** (commit-hash **`c281cda`**, built from `110bb1e`, bundle **`index-BLR2aev7.js`**) — **was LIVE (F1 Core Receivables slice 1)**, promoted unchanged from Preview `10dbbf8d`, authenticated non-mutating smoke PASSED. **`90a7dc15-1ed1-4d2a-ad6e-9044c786334c`** (branch `main`, source **`97b4229`**, bundle **`index-9FYipeQ9.js`**) — **was LIVE (Campaigns slice 1)**. **UNCHANGED by F1, re-verified 2026-07-30 after the F1 Preview went up.** *(HISTORICAL: at that moment an F1 Preview `10dbbf8d-d02d-4fcb-8255-6d83a5bff70b` (branch `f1-preview-110bb1e`, source `110bb1e`, bundle `index-BLR2aev7.js`) was awaiting authenticated UI acceptance. **Since resolved** — it was accepted and promoted as Production `88b20584`, which has itself since been superseded twice.)* **(HISTORICAL — the previous deploy `5bcf1ef0` / `index-dUN1r8PM.js`, source `87fed4b`, Asset Library slice 1, is now the current rollback target.)** Deployed by reusing the exact Preview-accepted `dist/` — **NOT rebuilt** (wrangler "Uploaded 0 files (12 already uploaded)"). **Served-bytes proof: 12/12 files fetched from the canonical URL are byte-identical (SHA256) to the accepted artifact**; entry `index-dUN1r8PM.js` = `03e8f062be62b678bbb442639fa2a75033a123e1a6277a7842b8b54c10ac225c` (697,879 bytes). Authenticated QA-account **Preview acceptance PASS** and a non-mutating **Account A Production smoke PASS** (one `GET /rest/v1/assets` → 200, 2 GETs across five routes, 0 writes, 0 console messages).
- **Rollback hierarchy — exactly ONE deployment may be called the current target. Do not collapse these levels.**
  1. **CURRENT frontend rollback target: `c45518fb-17b6-448a-b35e-cb9a3a46367d`** (source `d9d5bf0`, bundle `index-B21Es_EZ.js`, Client Profile slice 1) — the immediately previous Production deployment, promoted to current target by the Finance Charge Safe Delete release and **verified HTTP 200 post-deploy on 2026-07-30, still serving its own bundle**. **This is the deployment to roll back to.** ⚠️ **Rolling back here does NOT remove `public.delete_charge_if_unpaid`** — `20260802120000` is additive and stays applied; no pre-release code calls the function, so it is inert after a rollback. Undoing it would need its own `drop function` migration, which was deliberately not written. *(`478e4d62` / `index-PcQFaAu-.js` (UI Polish + Dashboard action card) was the current target until this release and is now a **historical fallback only** — retained, NOT deleted.)*
  2. **HISTORICAL FALLBACK ONLY — NOT the current target: `88b20584-b375-4073-a762-f91dc2f1a1e8`** (commit-hash `c281cda`, built from `110bb1e`, bundle `index-BLR2aev7.js`, F1 Core Receivables slice 1) — **demoted from current target by the Schedule Core release; retained, NOT deleted.** Rolling back here would revert Schedule Core slice 1's frontend as well. Use only if target 1 is itself unusable. (Older `90a7dc15` Campaigns slice 1 / `5bcf1ef0` Asset Library slice 1 / `b3708cc2` local-engine retirement / `247ef9ec` Studio containment / `476830a2` P1 / `e63198b7` S0F.1 / `4b86993d` S0E / `69f8a175` S0D / `cec116b9` S0C / `31cb521d` S0B / `4cb17aee` S0A are retained historically — likewise fallbacks only, progressively further behind.)
  3. **Git rollback tag: `pre-ui-polish-action-card` @ `e80a1341`.** **No Edge rollback applies to this release — `ai-gateway` v36 was NOT redeployed.** **The current release added NO migration**, so no frontend rollback can undo one. Rolling back past Schedule Core does **not** undo migration `20260801120000` (`public.appointments`) — it is additive and stays applied; an older bundle simply never queries the table. (The earlier tags `pre-campaigns-slice-1` @ `a548518` and `pre-asset-library-slice-1` @ `3803b61` are retained.)
- Preview (retained) — **(HISTORICAL: the entries below stop at Campaigns slice 1. For the Previews of the three releases since — F1, Schedule Core slice 1 and UI Polish + Dashboard action card — read the ✅ box at the top of this file, which is the source of truth.)** **`19a58ba9-9b85-4f87-a19a-5f218cb0e8b5`** (branch `campaigns-slice-1-preview`, source `97b4229`, bundle `index-9FYipeQ9.js`) — two-QA-account acceptance PASSED; **this is the artifact promoted to Production unchanged**. Previously: **`d1235743-564d-43a9-bf26-bb7a25d3850d`** (branch `assets-preview-87fed4b`, source `87fed4b`, bundle `index-dUN1r8PM.js`) — full authenticated QA-account acceptance PASSED; **this is the artifact promoted to Production unchanged**. The retirement Preview `17bba0b3`, the Studio-containment Preview `ec239e3b`, the P1 Preview `c999988e` and the S0F.1 Preview `0760f00e` are retained historically.
- Git rollback tags (P1): `pre-atomic-quote-persistence` @ `716da1b`, `pre-atomic-quote-live-compatibility` @ `f7ff9fad`, `pre-atomic-quote-pk-catalog-cast` @ `2e1b137` — all retained.
- Git rollback tags: `pre-asset-library-slice-1` @ `3803b61`, `pre-local-engine-retirement` @ `5d7506d1`, `pre-s0f-creative-trust-brand-palette` @ `5efbeb9103710875fc3dad882ae78aca4b2938bc`, `pre-s0e-demo-tour-containment` @ `c10ac5590967410d0931a89b08a7bdab12030b25`, `pre-s0e-guided-onboarding` @ `becd070be72c5c0d59148f870db378cfad9cebea`, `pre-s0d-business-context` @ `3ee62aee`, `pre-s0c-identity-isolation` @ `385f77874da68f905b504facf92843e7ede76d97`, `pre-s0b-cloud-persistence` @ `7066520` — all retained.
- **Edge: `ai-gateway` v36 ACTIVE, `verify_jwt=true`** — the only function on the project. **v36 removed the local providers from the shared contract**: `comfyui` / `ollama` / `fooocus` / `a1111` are gone from `AI_PROVIDERS`, `AI_MODELS` and every routing chain, together with the `LOCAL_PROVIDERS` partition, the `localFirst` ordering option and its response metadata, and the local zero-cost branch; the 20-action cloud vocabulary is unchanged and every action still resolves to a non-empty all-API chain. Verified live: a request naming `provider:'ollama'` with `localFirst` returns `options:{}` and the chain `["gemini","openai","openrouter"]`. *(Historical: **v35** was the previous ACTIVE version — its only S0F.1 change was the Jake persona text constant and its related comment in `actionProfiles.ts`; it remains the Edge rollback target.)* Account Business Context continues to be assembled + injected by the **frontend chat/draft seam** before the existing Gateway call; the ImageStudio brand-palette block is likewise composed **frontend-side** into the existing `studio.generate_image` prompt.
- Supabase: project `weciwurjfwmqihcyexzj`; **11 applied of 11 tracked — NONE PENDING**, and `supabase db push --dry-run --linked` returns **"Remote database is up to date"** (verified 2026-07-30). The live schema matches `supabase/migrations/**` in full. `20260731120000_finance_receivables_slice1.sql` (F1 Core Receivables slice 1) was **APPLIED and verified live 2026-07-30** — `public.charges`, `public.payments` and the five composite same-owner keys now exist in the database — as was `20260729120000_campaigns_slice2_task_link.sql` (Campaigns slice 2). ⚠️ **Schema parity is NOT release parity:** F1's frontend is merged but **not built and not deployed**, so Production still serves the pre-F1 bundle and no user can reach the Finance receivables area. *(Historical: this line recorded a merged-but-unapplied window twice — for Campaigns slice 2 (2026-07-29→30) and for F1 (2026-07-30). Both are closed.)*
  - **`20260728130000_revoke_anon_counter_execute.sql` (revoke `anon` EXECUTE) APPLIED 2026-07-29 and VERIFIED LIVE.** Grants only — no table, data, policy or function body changed, so no frontend behaviour changed and no build or deployment followed. Live ACLs after: `anon` EXECUTE **denied** and `authenticated` EXECUTE **retained** on `public.asset_row_count()`, `public.asset_object_count()` and `public.campaign_row_count()` (`public.reserve_ai_budget` unchanged: service_role only).
    - **Behavioural proof, not merely the ACL flag:** an `anon` call to `campaign_row_count()` returned **`0`** before the migration and raises **`ERROR 42501: permission denied for function campaign_row_count`** after.
    - **The write that matters PROVEN live end-to-end:** the quota policies call the counters **as the querying role**, so a too-broad revoke would have broken every cloud create. As QA account B under `set local role authenticated` + JWT claims, a probe first confirmed `running_as = authenticated`, `uid` = QA account B, `counter_value = 1`; the INSERT **committed**, the DELETE **committed**, and `campaigns` returned to **0 rows**. Account A untouched throughout.
    - **The migration asserts its own postcondition in BOTH directions** (`has_function_privilege` for `anon` *and* for `authenticated`) and SAFE STOPs on a missing counter, so a revoke that did nothing — or that took `authenticated` down with it — aborts instead of reaching production.
  - **`20260728120000_campaigns_slice1.sql` (Campaigns slice 1) APPLIED 2026-07-28 and VERIFIED LIVE.** Adds `public.campaigns` (PK `id` uuid, `user_id` → `auth.users(id)` ON DELETE CASCADE, RLS ON, `title`/`objective`/`status`/`start_date`/`end_date`), verified against the live database rather than from the code: 9 columns, RLS on, **exactly four policies, all `to authenticated`** (`campaigns_select_own` / `campaigns_insert_own` / `campaigns_update_own` / `campaigns_delete_own`), the **200-row quota in `campaigns_insert_own` ALONE** (`campaign_row_count() < 200`) with `campaigns_update_own` carrying `auth.uid() = user_id` on **both** sides and no quota, `trg_campaigns_status_transition` (plain `BEFORE UPDATE`) plus `trg_campaigns_updated`, `campaign_row_count` **`SECURITY DEFINER`, 0 arguments, `search_path=""`**, and `unique (id, user_id)`.
    - **`unique (id, user_id)` was deliberate slice-2 preparation, and it is NO LONGER INERT.** Campaigns slice 2 (`20260729120000`) was applied 2026-07-30, so `tasks(campaign_id, user_id) → campaigns(id, user_id)` **exists in the live database** and this UNIQUE is now the key it references. Without this UNIQUE the FK would be rejected outright. ⚠️ **This constraint can no longer be dropped before the slice-2 FK is dropped** — slice 1 stopped being rollback-able in isolation **when the migration was applied**, which has now happened.
    - **Transition enforcement PROVEN live:** `completed → active` through the privileged CLI role (which bypasses RLS) → **`ERROR 23514: campaigns: illegal status transition completed -> active`**. **The trigger is the protection, not the UI.**
    - **Quota gates creation, never recovery:** at exactly 200 rows an account still edits and cancels (`1, 1, 200`).
    - **Isolation PROVEN at the API layer:** account D's own token, unfiltered `select` → `[]`; account B's campaign by exact UUID → `[]`; and after D created one row the identical query returned exactly that row — so the `[]` was RLS scoping, not a dead query.
  - **`20260727120000_asset_library_slice1.sql` (Asset Library slice 1) APPLIED 2026-07-27 and VERIFIED LIVE.** Adds the **private** `assets` bucket (`public = false`, `file_size_limit = 10485760`, `allowed_mime_types = {image/png,image/jpeg,image/webp}`) and `public.assets` (PK `id`, `user_id` → `auth.users(id)` ON DELETE CASCADE, RLS ON). **Structural isolation:** `check (storage_path = user_id::text || '/' || id::text || '.' || ext)` — the path is reconstructed from the row's own columns, not prefix-matched. **Three policies per surface, and NO UPDATE policy on either** (`assets_select_own` / `assets_insert_own` / `assets_delete_own`; `assets_objects_select_own` / `assets_objects_insert_own` / `assets_objects_delete_own`). **Symmetric 40 quota** in the `WITH CHECK` of BOTH INSERT policies via two separate `SECURITY DEFINER`, zero-argument counters (`public.asset_row_count()`, `public.asset_object_count()`) — a counter must be `SECURITY DEFINER` or a policy counting its own table recurses infinitely.
    - **Row quota PROVEN by live SQL:** seeded 40; probe confirmed `running_as = authenticated`, `auth.uid()` = the QA account, `rows_counted = 40`; the 41st insert → **`ERROR 42501: new row violates row-level security policy`**; the identical statement **succeeded** after freeing one slot; cleanup left `remaining_qa = 0`, `total_rows = 0`. **The probe is what makes this evidence** — it excludes an empty `auth.uid()` or a path-CHECK violation as the cause of the same error.
    - **Object quota and Storage policies PROVEN in the Preview acceptance** (they are not reachable from SQL): write outside own prefix → **403**, signed URL for another account's path → **404**, `x-upsert: true` → **403** (the live proof that **L4** holds: no UPDATE policy exists, so uploads must pass `upsert: false`), duplicate path → **409**; filled to 40 objects, the 41st → **403**, and freeing one slot made the identical write **200**.
    - **✅ RESOLVED 2026-07-29 by migration `20260728130000`** (was: `anon` holds EXECUTE on all three counters, because `revoke … from public` does not remove a role's own explicit default grant — the identical line produced the identical hole in two consecutive slices). Fixed as **one** migration, and the **class** is closed by `src/lib/__tests__/securityDefinerGrants.test.js`.
  - `20260726120000_atomic_quote_persistence.sql` (P1) applied 2026-07-26, `public.save_quote_atomic` live and verified (SECURITY INVOKER, empty `search_path`; **`authenticated` is the only client-facing role with EXECUTE — `anon` and PUBLIC are denied/absent; `service_role` also holds EXECUTE via Supabase's project-level defaults and is server-side only**). **S0F.1 added NO migration** (no Product/Inventory/Campaign/Asset-Library schema). S0D migration `20260724120000_s0d_business_profile.sql` remains **APPLIED & verified** — `public.business_profile`: PK `user_id`, FK → `auth.users(id)` ON DELETE CASCADE, RLS ON + policy `business_profile_own` (USING+WITH CHECK `auth.uid()=user_id`), trigger `trg_business_profile_updated`→`set_updated_at()`, authenticated GRANTs present.
- **CLASS GUARD — `src/lib/__tests__/securityDefinerGrants.test.js` (added 2026-07-29).** **Every `security definer` function declared anywhere under `supabase/` must revoke EXECUTE from `anon`, or CI fails.** This is the part that closes the class rather than three instances: the next counter added the way the previous two were written fails in CI before it can be applied. It scans the whole SQL corpus (a revoke may legitimately live in a **later** migration than the declaration it protects — which is exactly how these three were fixed), attributes `security definer` per declaration so it cannot bleed onto the next function in a file, strips both comment forms, and **asserts the parser found what it is meant to guard** so it cannot rot into a check that passes by finding nothing. Proven by injecting a new counter written exactly like the two earlier ones: the guard failed and named it.
- **⚠️ OPEN, non-blocking — NEW, and it is an AUDIT candidate, not a fix: the schema has TWO sources of truth.** `public.reserve_ai_budget(...)` is `security definer` but is declared in **`supabase/schema.sql`, not in any migration** — so `supabase/migrations/**` is **not** a complete description of the live function surface, and a reader who trusts the migration set alone will have an incomplete picture. The function itself is **correct and not a hole** (live: `anon` and `authenticated` both denied, `service_role` only; and `schema.sql` already revokes it from `anon`, which is why it passes the new class guard and serves as its built-in positive control). **Recorded as a candidate for a schema-provenance audit — do NOT "fix" it by moving files.** The open question is which artifact is authoritative for the live schema, and that is a decision, not a patch.
- **Test evidence for the CURRENT release (Campaign Delete Safety, source `5bea9ee`, deployment `c2bb560e`, bundle `index-CZQwY28c.js`):** full suite **131 files / 3,783 passed / 0 failed**; **NO migration, NO DB/schema change, NO Edge/Auth/secret/package change** — migrations are **13 applied of 13 tracked, none pending**, and Edge `ai-gateway` v36 stays ACTIVE / `verify_jwt=true`. Promoted **unchanged** ("Uploaded 0 files (12 already uploaded)"); the **served** bundle is byte-identical by SHA-256 to the artifact the owner QA'd in a real visible browser.
- **(HISTORICAL — previous release) Test evidence for Finance Charge Safe Delete, source `1eb7b2a`, deployment `86d5cca9`, bundle `index-o0xZrfkL.js`:** full suite **128 files / 3,738 passed / 0 failed**; **ONE additive function migration (`20260802120000`, applied first attempt) — NO table/column/constraint/policy/data change, NO Edge/Auth/secret/package change** — migrations are **13 applied of 13 tracked, none pending**, and Edge `ai-gateway` v36 stays ACTIVE / `verify_jwt=true`. **Exactly one build**, from the merged head. Promoted **unchanged** ("Uploaded 0 files (12 already uploaded)"), local `dist/` ↔ Preview ↔ Production **12/12 byte-identical by SHA-256**.
- **(HISTORICAL — previous release) Test evidence for Client Profile slice 1, source `d9d5bf0`, deployment `c45518fb`, bundle `index-B21Es_EZ.js`:** full suite **127 files / 3,705 passed / 0 failed**; **NO migration, NO DB/schema change, NO Edge/Auth/secret/package change** — migrations were **12 applied of 12 tracked, none pending** *at that release*. Promoted **unchanged** ("Uploaded 0 files (12 already uploaded)"), canonical **12/12 byte-identical by SHA-256** to the accepted `dist/`.
  - **Authenticated Preview QA PASSED** on an isolated QA account (identity verified from the JWT first; the owner account was never written to): empty client shows correct empty states; a task, an appointment, a quote, and **two charges — one linked directly and one reachable only through the quote** — all rendered, with **צפוי ₪1,700 / התקבל ₪1,100 / יתרה ₪600** matching Finance exactly. QA records were deleted afterwards and **residue verified zero per table against the server** (clients/tasks/quotes/quote_items/charges/payments/appointments/transactions all 0).
  - **Authenticated non-mutating Production smoke PASSED:** `/clients` renders signed in, **27 REST requests, every one a `GET` and all 200 — 0 writes**, 0 console messages.
  - **NOT verified, stated rather than implied:** the Production smoke ran on a QA account holding **no clients**, so the profile panel itself was not opened in Production — opening it would have required a write, which a non-mutating smoke may not do. The panel was verified on the **byte-identical** accepted Preview artifact (same SHA-256).
- **(HISTORICAL — previous release) Test evidence for UI Polish + Dashboard action card, commit-hash `83f2dfa`, deployment `478e4d62`, bundle `index-PcQFaAu-.js`:** full suite **126 files / 3,681 passed / 0 failed**; **NO migration, NO DB/schema change, NO Edge/Auth/secret/package change** — migrations stay **12 applied of 12 tracked, none pending**, and Edge `ai-gateway` v36 stays ACTIVE / `verify_jwt=true`. The accepted Preview artifact was **promoted unchanged** ("Uploaded 0 files (12 already uploaded)"; Production↔Preview **7/7 byte-identical by SHA-256**, matching the local `dist/` hashes). **The ✅ box at the top of this file carries the full evidence for this release; the lines below are earlier releases, retained as history.**
- **(HISTORICAL — three releases back) Test evidence for Campaigns slice 1, source `97b4229`, deployment `90a7dc15`:** full suite **117 files / 3,219 passed / 0 skipped / 0 failed** (baseline before the slice: 114 / 3,153 → +3 files, +66 tests); **exactly one** production build, emitting the deployed `index-9FYipeQ9.js`; **eight negative controls**, each run and each failing only the correct test(s) — transition trigger removed from the DDL (1), INSERT quota removed (1), UPDATE quota changed to `<` i.e. the lockout (1), local-mode guard removed from the page (1), `betaHidden` ignored in local mode i.e. an S0A regression (1), the quota predicate re-added to the UPDATE policy (2), a dangling `L4` left in the limitations list (1); two-QA-account **Preview acceptance PASS** and a non-mutating **Account A Production smoke PASS** with a write detector reading **0 writes / 2 reads**.
  - **Two harness defects were found BY the controls, not by review:** (a) a "must not contain X" source scan matched the **comment explaining why X is absent**, so the scan had to strip comments first; (b) the stripper then had to remove `//` lines **before** `/* */`, because a line comment containing the glob `src/creative/v2/**` opens a block-comment match that runs to the next `*/` and swallowed the component. A positive control now proves the stripper removes prose while keeping code.
- **(HISTORICAL — four releases back) Test evidence for Asset Library slice 1, source `87fed4b`, deployment `5bcf1ef0`, now a HISTORICAL FALLBACK ONLY (the current rollback target is `ad09b631` — see the rollback hierarchy above):** full suite **114 files / 3,153 passed / 0 skipped / 0 failed**; **exactly one** production build, emitting the deployed `index-dUN1r8PM.js`; **eight negative controls**, each run and each failing for the right reason — reversed delete order (3 failures), disabled client quota pre-check (2), row cleaned up after a failed upload (1), quota predicate removed + UPDATE policy added (2), path CHECK weakened to a `LIKE` prefix (1), signed URLs passed to `revokeObjectURL` (1), row-quota predicate removed (1), the un-quota'd `FOR ALL` policy restored (1); authenticated QA-account **Preview acceptance PASS** and a non-mutating **Account A Production smoke PASS**.
  - **Two harness defects were found BY the controls, not by review** — recorded because both would otherwise have produced a false CLEAN: (a) the migration checker stripped `--` lines but **not `/* */` blocks**, so a predicate commented OUT still satisfied its own test — the row-quota control did not fire until the strip was corrected; (b) the public-URL artifact scan needed a **positive control** before its zero could be trusted, and it immediately caught a hit in comment prose (which is why `src/lib/api.js` never spells that helper's name).
- **(HISTORICAL — two releases back) Test evidence for the complete local-engine retirement, source `2c8b1df`, deployment `b3708cc2`, now a HISTORICAL FALLBACK ONLY:** full suite **110 files / 3,074 passed / 0 skipped / 0 failed**; focused retirement proof **2 files / 172 passed**; one production build green emitting `index-C4frcMDi.js`; authenticated Preview acceptance **10/10 PASS** on Account A and a non-mutating Production smoke **PASS**.
- **(HISTORICAL — previous release) Test evidence for the Studio-containment release, source `03c23c2`, now the rollback target `247ef9ec`. These figures describe THAT artifact, not the one running today — read the scope, the two figures are NOT one run:**
  - **Full suite — on the EARLIER implementation head, before the fail-closed capability correction:** 121 files / **3,098 passed / 1 pre-existing skip / 0 failed**. This figure does **not** describe the final corrected code.
  - **Focused affected suite — on the FINAL corrected code that was built and deployed:** every test file importing the changed exports or the changed Studio pages — **27 files / 1,608 passed / 0 failed**. **The full suite was deliberately NOT rerun on the final head.** Justification (recorded in the Studio section): the changed exports have exactly two production consumers (`geminiImage.js`, `ImageStudio.jsx`) and every test file importing either was inside the focused set.
  - **Production build at the released commit `03c23c2`: GREEN** — the single build that produced the deployed artifact.
  - **Real-runtime evidence beyond tests (this is what covers the final head end-to-end):** Preview `ec239e3b` authenticated QA acceptance **PASS** and Production `247ef9ec` authenticated non-mutating Account A smoke **PASS**, both against the byte-identical released artifact.
- **Historical test figures (P1 release, commit `7e30199`):** 120 files / 3,065 passed / 1 skip / 0 failed; build green. Retained as history — **not** evidence for the currently deployed Studio code.
- **Branch / HEAD / working tree are session-specific, not canonical state:** every task must verify its own branch, HEAD and working tree at preflight before acting (the pre-existing untracked `dist-profile/` is expected). Do not store a particular clean-tree snapshot as durable canonical truth. (There is no memory mirror of this tracker — Claude's memory holds only a short pointer to this file. This repository copy under `docs/` is the sole canonical tracker.)

---

## Status ledger
- **Client Profile slice 1 (a real client snapshot from existing data only)** — **CLOSED / RELEASED / LIVE VERIFIED in Production (2026-07-30).**
  - **Chain:** PR [#148](https://github.com/natanMeT/ArtValue20/pull/148) → merge `d9d5bf01e4506528b8562d0d0e5d08639fb691ef` (head-gated to `3570c00`) → one build → Preview `c209c126` (alias `cp-preview-d9d5bf0`) → authenticated Preview QA PASS → Production **`c45518fb` / `index-B21Es_EZ.js`**, promoted unchanged → authenticated non-mutating Production smoke PASS (0 writes).

- **Finance Charge Safe Delete (delete a charge only if it has no payment row)** — **CLOSED / RELEASED / LIVE in Production (2026-07-30).** Closes F1 gap (a). Enforced by `public.delete_charge_if_unpaid(uuid)`, not by the screen.
  - **Chain:** PostgreSQL 17.6 rehearsal of the exact file in a rolled-back transaction (caught the `search_path=""` postflight defect) → PR [#150](https://github.com/natanMeT/ArtValue20/pull/150) → merge `1eb7b2abd44249da83f1c4891d4a5d3fcd44a88c` (head-gated to `0db561a8`, `--match-head-commit`) → migration `20260802120000` **APPLIED first attempt, 13/13** → 19/19 DB acceptance controls + anon HTTP control → one build → Preview `5a9e7277` (branch `charge-delete-preview-1eb7b2a`) → **owner Preview UI QA PASS** on the QA account → Production **`86d5cca9` / `index-o0xZrfkL.js`**, promoted unchanged ("Uploaded 0 files (12 already uploaded)", 12/12 byte-identical) → unauthenticated Production smoke PASS → QA residue cleared and re-verified zero.
  - **Delivered:** the client detail modal renders next action, charges and balance, payments received, related tasks, related appointments/lessons and linked quotes — **read-only**, with an empty state per section. Pure selectors in `src/components/clients/clientProfile.js`, panel in `src/components/clients/ClientProfilePanel.jsx`. **5 frontend files, no DB change of any kind.**
  - **The two things that make it honest:** a charge is reached **either** directly (`charges.client_id`) **or** through the client's quote (`charges.quote_id`), de-duplicated by id so a charge carrying both links is counted once and the balance cannot double; and the money is computed by the **same** `receivablesTotals` / `decorateCharge` Finance already ships, so the profile can never disagree with the Finance screen. The next action is never invented — client follow-up, else earliest open task, else earliest planned diary row, else an empty state saying all three are absent.
  - **Appointments are the one input not in the store** (they are cloud-only), so the panel reads them on demand. In local/demo mode, and on a failed read, it says the diary is **unavailable** rather than showing "no appointments" — a claim the product cannot make.
  - **Account isolation enforced twice:** RLS, plus the selectors dropping any row carrying a foreign `user_id`. Proven by test (a foreign payment cannot pay off this account's charge) and in QA.
  - **Reported, not fixed — both pre-existing F1 gaps found by this slice's QA:** a charge **cannot be deleted from the UI** (`deleteCharge` exists but nothing calls it), and a **cancelled charge keeps its payments, which keep counting in actual revenue**. See the box at the top of this file.
- **F1 Core Receivables slice 1 (charges, payments, five same-owner composite keys)** — **CLOSED / RELEASED / LIVE VERIFIED in Production (2026-07-30).** Released as Production **`88b20584` / `index-BLR2aev7.js`** (commit-hash `c281cda`, artifact built from `110bb1e`) with the authenticated non-mutating Production smoke PASSED — see the **(RELEASE IN PRODUCTION)** box for F1 above. **That deployment has since been superseded twice** (Schedule Core slice 1 `ad09b631`, then UI Polish + Dashboard action card `478e4d62`, which is live today); F1 itself remains live in the product.
  - **Chain:** PR [#134](https://github.com/natanMeT/ArtValue20/pull/134) → merge `56d13ef` (head-gated to `c811fac`) → ❌ apply attempt 1 failed (`42601`, reserved word `notnull`) → PR [#136](https://github.com/natanMeT/ArtValue20/pull/136) → merge `f442355` (head-gated to `7f4e537`) → ❌ apply attempt 2 failed (`55000`, `record "c" is not assigned yet`; **full rollback verified**) → PR [#137](https://github.com/natanMeT/ArtValue20/pull/137) → merge `601b3c9` (head-gated to `590d987`) → ✅ **migration `20260731120000` APPLIED — 11 applied of 11 tracked, dry-run clean** *(the project is now at **12 of 12** — Schedule Core's `20260801120000` followed)* → ✅ **PART A matched exactly** → ✅ **PART B nine controls decisive, QA residue zero** → ✅ **built, Preview `10dbbf8d` accepted, promoted unchanged to Production `88b20584`**.
  - **Delivered in code:** `public.charges` (expected billing: kind, terms, service/due dates, invoice link, `open`/`cancelled` lifecycle, `numeric(14,2)` incl. VAT) and `public.payments` (money received, `charge_id NOT NULL`); **payment status DERIVED, no column**; due date = end of the *service* month + 0/30/60/90 (`2026-02-15` + net60 → `2026-04-29`); overpayment permitted, never a negative balance, surplus surfaced; four plain RLS policies per table, **no quota and no SECURITY DEFINER function**; a cloud-only Finance receivables area that renders a truthful unavailable state in local/demo, with confirmed-first writes because a duplicate charge is a duplicate invoice.
  - **The point of the slice:** five relationships become **composite same-owner** keys. A foreign key is checked by the system, **not** through RLS, so RLS hiding account B's client from A does not stop A from *referencing* it — A only needs the id. Carrying `user_id` into the key makes the cross-account pointer structurally impossible. **Two of the five are WIDENED and three are NEW:** `quotes.client_id` and `transactions.client_id` predate this migration, so their existing delete actions (CASCADE / SET NULL) are preserved exactly; the three on the new `charges` and `payments` tables receive their delete behaviour **for the first time in this slice** and are its own decisions, not inherited contracts. Every `SET NULL` names its column, because a bare one would also null the NOT NULL `user_id`.
  - **✅ Database and release are both closed.** Migration applied and verified live 2026-07-30 (11 of 11 at that point, dry-run clean); PART A matched exactly and all nine PART B controls were decisive on disposable QA records, with cleanup verified zero per-account and RLS-independently. The frontend was then built once, accepted on **Preview `10dbbf8d`** and promoted **unchanged** to Production `88b20584`, with the authenticated non-mutating Production smoke PASSED. See the F1 **(RELEASE IN PRODUCTION)** box above for the full evidence and for the two failed applies.
  - **Reported, not fixed:** `tasks.client_id` still single-column (**L5**); no `transaction → charge` link, so a person can double-count a receipt while the system never does (**L6**).
- **Asset Library slice 1 (durable cloud gallery images)** — **CLOSED / LIVE VERIFIED in Production (2026-07-27).**
  - **Release chain:** PR [#125](https://github.com/natanMeT/ArtValue20/pull/125) → main `87fed4b` (merge gated on head `607cac1`) → migration `20260727120000` **APPLIED + verified live** → **one build** + artifact scan → **Preview `d1235743`** (QA-account acceptance PASS) → **Production `5bcf1ef0`** (`index-dUN1r8PM.js`, promoted unchanged — "Uploaded 0 files (12 already uploaded)") + **non-mutating Account A smoke PASS**. No rollback taken (`b3708cc2` retained, HTTP 200).
  - **Delivered:** a private `assets` bucket + `public.assets` rows; **structural** per-account isolation by path CHECK; owner-only RLS on both surfaces; bytes only via **short-lived signed URLs**; server-enforced MIME allowlist, 10 MiB per-file ceiling and a **symmetric 40-asset quota** on rows *and* objects; **persist-first truthful saves** — a durable save that fails is surfaced, never swallowed.
  - **Ordering rule:** create = row → bytes; delete = object → row. **Always fail toward the visible state** — a dangling row is visible and deletable, an orphaned object is invisible forever, so a failed upload deliberately leaves its row.
  - **NO data migration.** The device IndexedDB gallery is legacy in cloud mode: never read, converted, copied or deleted; local/demo unchanged. **Visible consequence, by design:** device-only images no longer appear in cloud mode.
  - **Owner review found a real defect and it was fixed before the migration ran** (`607cac1`): the quota had been enforced only on `storage.objects`, leaving `public.assets` uncapped under the row-first ordering — an account at 40 could insert unlimited dangling rows. The correction added a second `SECURITY DEFINER` counter and split the `FOR ALL` policy into one policy per command, so being at the cap can never block SELECT or DELETE (deleting is how a full account recovers).
  - **Scope discipline:** **NO Gateway/Edge change** (v36 untouched, not redeployed), no secret change, no gallery redesign, no roadmap change. Frontend + one additive migration only. Growth remains BetaUnavailable — **this slice does NOT reopen it**.
  - **✅ RESOLVED 2026-07-29:** `anon` EXECUTE on both counters was revoked by migration `20260728130000` (together with `campaign_row_count`). It was harmless only while `arg_count = 0`; that accident is no longer what protects it.
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
- ✅ **Campaigns (business campaigns)** — **durable in cloud (slice 1). CLOSED / LIVE.** `public.campaigns`, owner-only RLS, server-enforced status transitions, 200-row quota on INSERT. **Scope is the campaign object itself**: linking campaigns to tasks/follow-ups, assets, leads, scheduling, measurement, success criteria and post-run review are **NOT** included and remain open. **The device-local creative/production-package records (S0F.1) are a *creative session*, are unrelated to this table, and were NOT migrated into it.**
- ✅ **Asset Library (gallery images)** — **durable in cloud (slice 1). CLOSED / LIVE.** Private `assets` bucket + `public.assets`, owner-only, signed-URL access, symmetric 40 quota. Scope is **gallery images only**: favourites, approve/reject, usage rights, versions, campaign association, cross-account sharing, logo/brand assets and video are **NOT** included and remain open.

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
- ✅ **Durable Asset Library (gallery images)** — **RESOLVED and LIVE** (slice 1). Remaining Asset-Library scope beyond gallery images (favourites, approve/reject, usage rights, versions, campaign association, cross-account sharing, logo/brand assets, video) is **still open**.
- ✅ **Durable Campaigns** — **RESOLVED and LIVE** (slice 1). Remaining campaign scope (task/follow-up linkage, assets, leads, scheduling, measurement, success definition, post-run review) is **still open**. The device-local creative-session records remain device-local and were not migrated.
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
- **Reopening is blocked on** durable **Campaigns**, a durable **Asset Library**, and an **account-aware Growth data model**. **TWO of the three are now delivered:** Asset Library slice 1 (gallery images) and Campaigns slice 1 (the durable campaign object). **Growth is still NOT reopened — the third prerequisite, an account-aware Growth data model, remains open**, and reopening still requires a separate approved slice. Note that Campaigns slice 1 delivers the *object*; the campaign↔task/follow-up linkage that a Growth workflow would need is explicitly out of its scope. (S0F.1 delivered the account-aware Business Context and palette consumption but none of the three prerequisites.)
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
- [x] **Asset Library slice 1 (durable cloud gallery images): DONE, CLOSED / LIVE** *(Production `5bcf1ef0`, now the current rollback target)*.
- [x] **Campaigns slice 1 (durable per-account business campaigns): DONE, CLOSED / LIVE** *(Production `90a7dc15`)*. **Slice 2 — `tasks.campaign_id` + composite-FK cross-account ownership enforcement — is MERGED with its migration APPLIED and VERIFIED LIVE (PR [#131](https://github.com/natanMeT/ArtValue20/pull/131) merged as `8b6a78a`; migration `20260729120000` applied 2026-07-30 — **10 applied of 10 tracked**, none pending *at that moment*). It is a schema-only change: no build and no deployment, because the frontend is untouched, so the Production deployment and bundle recorded above are unchanged by it; see the box at the top.**
- [x] **Revoke `anon` EXECUTE on the quota counters: DONE, CLOSED** *(migration `20260728130000` applied 2026-07-29; migration-only, no release)*. Closed the **class** as well as the three instances.
- [ ] **Slice after this one — PENDING NATHAN DECISION.** Do NOT begin/design/invent the next slice until Nathan selects one and approves a spec. Candidate open items: **account-aware Growth data model** (the last of the three Growth reopening prerequisites); **Asset Library beyond gallery images** (favourites, approve/reject, usage rights, versions, campaign association, logo/brand assets, video); **a schema-provenance audit** (`supabase/schema.sql` vs `supabase/migrations/**` — two sources of truth for the live schema; see the Baseline note); **Products / Projects / Inventory / Templates / Activity durability**; **organization boundaries**; **credits / cost controls**; **Website Scanner** (per the section above); Jake conversation-refresh UX. **NOT candidates — already done, and selecting either would mean re-implementing merged work:**
  - **Campaigns slice 2 (`tasks.campaign_id` + composite FK).** **MERGED** as `8b6a78a` (PR [#131](https://github.com/natanMeT/ArtValue20/pull/131)) and its **migration APPLIED + PART A/PART B verified live 2026-07-30** — there is nothing left to design, build, apply or verify. **No owner gate remains open on it.** The only thing it could still grow is a *later, separately specified* slice that wires `campaignId` into the UI. Tracked in the ✅ box at the top of this file, not here.
  - **The Quote cloud-save source-label correction** — already RESOLVED and LIVE in Production (implemented in merged PR #108, shipped in deployment `476830a2`).

## Studio Hosted Mode Containment Correction — **CLOSED; its behaviour is still LIVE** (opened 2026-07-26; merged 2026-07-27 as PR #118; first released as `b3708cc2`, since carried forward through `5bcf1ef0` and today `90a7dc15`)

> **This corrective work is still LIVE in Production** — it *first shipped* in deployment `b3708cc2` / `index-C4frcMDi.js` (source `2c8b1df`) and has been carried forward in every release since; **today it runs from `90a7dc15` / `index-9FYipeQ9.js`.** The released behaviour is
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

⚠️ **(HISTORICAL, at that round) AN EDGE DEPLOYMENT WILL BE REQUIRED LATER — NOT PERFORMED IN THAT TASK.** The
deployed `ai-gateway` function was still v35 with the OLD shared table; nothing was deployed and the Production
frontend of that moment (`247ef9ec`) was unaffected. *(Since resolved: the Edge went to **v36**, which is the live
version today, and Production has since moved to `b3708cc2`, then `5bcf1ef0`, and today `90a7dc15`.)*

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
`b3708cc2` (Production has since moved on twice; today `90a7dc15`). P1 remains CLOSED / LIVE.
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
  confirms **6 applied of 6 tracked, matching, none pending** *at that time*; the merge adds no migration and touches no `config.toml`,
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
- **(HISTORICAL — the rollback roles as they stood during the retirement release. Superseded twice since; for today's
  hierarchy read the Baseline above, which is the ONLY authoritative statement of the current target.)**
  1. **LIVE at that time:** **`247ef9ec-ad3a-4c15-8b16-25afa1c47f2b`** (source `03c23c2`, bundle `index-BZ3B-0yd.js`).
  2. **Rollback target at that time:** **`476830a2-f8ea-45dc-b0ce-a71876bc48dd`** (source `7e30199`, bundle
     `index-BrR14XIC.js`).
  3. **What then happened:** the retirement was promoted, `247ef9ec` became the target, and Asset Library slice 1 has
     since demoted it — **today the current target is `b3708cc2`** and `247ef9ec` is a historical fallback only.

  Restored via the Cloudflare Pages deployment history. Git-level rollback: `pre-local-engine-retirement` @ `5d7506d1`.

### Four approval gates — none authorized yet

| # | Gate | Target | Rollback target | Ready for approval |
| --- | --- | --- | --- | --- |
| 1 | Documentation PR merge | this tracker PR (1 file, docs-only) | revert the docs merge | **YES** |
| 2 | Edge `ai-gateway` deploy | v35 → v36 from `9ecb8eb` | redeploy the pre-merge `_shared/` (v35 contract) | **YES** — read-only preflight complete |
| 3 | Frontend build + Preview | one build from `9ecb8eb` → Preview deploy | none needed (Preview is isolated) | **YES** — build is the first executing step |
| 4 | Production deploy | promote the Preview-accepted `dist/` unchanged | **`476830a2`** until promotion; **`247ef9ec`** (the LIVE deployment *at that time*; today `90a7dc15`) after it | **NO** — blocked on gate 3 evidence: Preview artifact + **authenticated Studio/Jake acceptance**, which has never been performed |

**Recommended order: 1 → 2 → 3 → 4.** Gates 2 and 3 should land close together because the frontend shims and the Edge
function share one contract module.
## Studio / Local-Engine UI Containment — **LIVE IN PRODUCTION** (2026-07-26)

**Status: RELEASED, then SUPERSEDED THREE TIMES** (by `b3708cc2`, `5bcf1ef0` and today `90a7dc15`)**.** This slice went live as `247ef9ec` / `index-BZ3B-0yd.js` (source
`03c23c2`). It was superseded in Production by the complete local-engine retirement (`b3708cc2` /
`index-C4frcMDi.js`, source `2c8b1df`), which also carries the corrective containment work recorded above, and that
in turn by Asset Library slice 1 (`5bcf1ef0` / `index-dUN1r8PM.js`) and then by Campaigns slice 1 (`90a7dc15` /
`index-9FYipeQ9.js`). **`247ef9ec` and `b3708cc2` are historical fallbacks only — the current rollback target is
`5bcf1ef0`.**

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
- **`20260726120000_atomic_quote_persistence.sql` — APPLIED 2026-07-26** (as a controlled retry; the first authorized attempt failed safely, see below). Migration list at that date: **6 applied of 6 tracked**, local=remote; `db push --dry-run` reported **"Remote database is up to date"**.
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
- At that point `supabase db push --dry-run --linked` proposed exactly the one then-pending atomic migration and nothing else. *(It has since been applied. Campaigns slice 2 then made the dry-run propose `20260729120000` for a day, until that migration was applied 2026-07-30. F1's `20260731120000` then did the same until it too was applied 2026-07-30. **The dry-run IS clean today — "Remote database is up to date"; 11 applied of 11 tracked.** See the Baseline for the current count.)*

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
**Nothing is mid-flight. As of 2026-07-30 there is no undeployed slice and no open release gate.** Production is
`86d5cca9` / `index-o0xZrfkL.js` (source `1eb7b2a`, Finance Charge Safe Delete), migrations are **13 applied of 13
tracked, none pending**, Edge `ai-gateway` v36 is ACTIVE / `verify_jwt=true`, and the current rollback target is
`c45518fb` / `index-B21Es_EZ.js`.

**One open item carried forward from Finance Charge Safe Delete (not a blocker):**
1. **No authenticated Production smoke** was run for this release, unlike the previous three.

*(The stale-tab refusal item was CLOSED 2026-07-31 — exercised on the QA account, specific Hebrew message
confirmed, charge and payment both preserved, zero residue. See the ✅ box at the top of this file.)*

**One F1 candidate remains, and one earlier pair is still on the table:**
- **F1 gap (b) is CLOSED as "no change needed"** — cancelled-charge payments counting in "הכנסה בפועל" is correct
  accounting, is pinned by a test, and is now stated on screen. It is **not** a candidate for a future slice.

**Two candidates are on the table, both raised by Client Profile slice 1's QA and neither started:**
1. **A charge cannot be deleted from the UI.** `deleteCharge` exists in `src/lib/api.js` and in the store, but no
   control calls it, so a charge created by mistake can only be parked as `cancelled` and never removed.
2. **A cancelled charge keeps its payments, and those payments keep counting in "הכנסה בפועל".** The screen states
   this, so it is documented rather than broken — but it means cancelling is not a way to undo money.

The next slice is an owner decision — **read the box at the top of this file for the live state before starting one,
and re-verify branch, HEAD and working tree at preflight.**

**(HISTORICAL — NOT current. The rest of this section was the Next action while F1 Core Receivables slice 1 was still
unreleased. F1 has since been released as Production `88b20584`, and Production has moved on twice more; every ⏳ gate
below is CLOSED. Retained because the reasoning — applied is not released, merged is not live — is the durable part.)**
At that moment: **F1 Core Receivables slice 1 had its migration APPLIED and PART A + PART B VERIFIED LIVE, and was
STILL NOT RELEASED.** Feature PR [#134](https://github.com/natanMeT/ArtValue20/pull/134) merged as
`56d13ef`, then two migration-repair merges — [#136](https://github.com/natanMeT/ArtValue20/pull/136) as `f442355` and
[#137](https://github.com/natanMeT/ArtValue20/pull/137) as `601b3c9` — were needed because the migration failed twice
on execution-only defects. It applied on the third attempt: **11 applied of 11 tracked, `db push --dry-run --linked`
= "Remote database is up to date".** PART A matched exactly; all nine PART B controls were decisive on disposable QA
records (`23503` ×2, `42703`, `23514`, and the column-list `SET NULL` / `CASCADE` semantics), and QA cleanup was
verified zero per-account **and** RLS-independently. Full suite **122 files / 3,522 passed / 0 failed**.
**Schema parity is restored; release parity is not** — there was **no build and no deployment**.

**Build and Preview are now done too** — Preview `10dbbf8d` (branch `f1-preview-110bb1e`, source `110bb1e`, bundle
`index-BLR2aev7.js`), from a single build of merged `main` after a green suite, with the artifact scanned for the
receivables code, for secrets and for local URLs before it was deployed.

**The next step is a SEPARATE owner action, and it is not implied by the Preview deploy:**
1. ⏳ **Authenticated Preview UI acceptance on https://10dbbf8d.artvalue-product.pages.dev — THE OPEN GATE.**
   Everything verified so far is catalog-level (PART A), SQL-level (PART B), artifact-level (the bundle scan) or
   signed-out (the smoke). **No one has yet seen the Finance receivables screen work in a browser while signed in.**
   This must be owner-driven: this session does not sign in, does not use a real account and does not handle passwords.
   Worth checking specifically: the screen renders in cloud mode; a charge can be created with confirm-first;
   a payment records and the balance derives correctly; a cancelled charge refuses a payment in the UI as the trigger
   does in SQL; and the local/demo mode still shows its truthful unavailable state.
2. ⏳ **Production deploy — NOT on the table until gate 1 passes.** When it is, promote the *same* accepted `dist/`
   unchanged (expect "Uploaded 0 files"), then a non-mutating Production smoke, per the last three releases.
3. **Nothing else is owed on the schema.** The migration, PART A and PART B are all closed — do not re-apply, re-verify
   or re-design them.

> ⚠️ **(HISTORICAL, at that moment) `main` carried merged, undeployed work.** The complete local-engine retirement (PR
> [#118](https://github.com/natanMeT/ArtValue20/pull/118), merged 2026-07-27 as `9ecb8eb`) was on `main` and running
> nowhere. *(Since resolved — it was released as `b3708cc2`, and Production has since moved on again.)* The general
> rule it illustrates still holds: **merged is not live.** *(It holds again today, for F1's frontend — the migration is
> applied and the schema is live, but the Finance receivables screen is merged, unbuilt and undeployed, so no user can
> reach it. See the ✅ box at the top: applied is not released either.)*

**(HISTORICAL — the state at that round; for today read the Baseline.)** Production was
**`247ef9ec-ad3a-4c15-8b16-25afa1c47f2b` / `index-BZ3B-0yd.js`** (source `03c23c2`), promoted from the accepted
Preview artifact without rebuilding, with **12/12 byte-identical served files** and an **authenticated non-mutating
Account A smoke PASS**. The rollback target at that time was `476830a2` / `index-BrR14XIC.js` (source `7e30199`).
No migration; Edge `ai-gateway` was **v35**. *(Today: Production `90a7dc15` / `index-9FYipeQ9.js`, current rollback
target `5bcf1ef0`, Edge v36, 11 migrations tracked and 10 applied.)*

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
canonical roadmap advance is a separate, separately-approved documentation step. **No further product slice may be
started** until Nathan selects one.

## Change log
- **2026-07-31** — **Finance Charge Safe Delete: the last open item CLOSED. Stale-tab refusal exercised; the error contract is now an executed test, not a source-text pin.** Two changes, neither touching production code. **(1) The stale-tab path was run and PASSED** — owner-driven, two tabs on the isolated QA account `natanturgeman5@gmail.com`: the same charge open twice, a payment recorded in tab B, then the **row trash icon 🗑️** clicked in tab A (**not** the cancel ✕). The server **refused**, the **charge stayed visible**, the **payment stayed recorded**, there was **no success toast**, and the **specific** message **"לחיוב הזה רשומים תשלומים…"** rendered rather than the generic fallback. That is the one path proving `23514` survives the **PostgREST → `supabase-js`** hop as `error.code` — the only link in the chain that had never been measured for this code (it had been measured for `42501` via an `anon` call). Cleanup through the UI in the only order the rule permits — payment first, then charge — and **zero residue verified read-only** as the owner role (`charges_total = 0`, `payments_total = 0`). The gap recorded on 2026-07-30 as an **accepted cosmetic gap** is therefore **closed after one day**, not carried. **(2) PR [#152](https://github.com/natanMeT/ArtValue20/pull/152) → merge `67a53f801053c00ddb0c42f32bc91ee64993f7e9`**, one new file `src/lib/__tests__/chargeDeleteErrorContract.test.js` (+151 / −0), **test-only**. The existing tests pinned `api.deleteCharge` by **source text** and never executed it, so nothing could say what a user actually sees when the server refuses. This one runs the shipped function against a stubbed transport and follows the value through the **real** `userFacingError` with the **real** fallback string read out of `store.jsx`: the RPC call **including the argument name** (PostgREST resolves by name, so a rename would 404 live while every source-text assertion still passed), `23514` → the payments-exist message, `P0002` → the not-found message **plus** an assertion that it leaks nothing about ownership (the migration raises one error for "no such charge" and "not your charge"), unknown or absent code → the generic fallback, success → `true`. The stub throws if `deleteCharge` ever reaches for `.from()` again — the cascade path this slice removed. **Two mutations measured, not assumed:** `engineError` → `throw error` fails the `23514` test, and `{ p_charge_id }` → `{ chargeId }` fails the call test; `api.js` restored byte-identical. Full suite **129 files / 3,748 passed / 0 failed** (from 128 / 3,738). **NO production code, NO migration, NO build, NO deployment, NO DB change, NO new slice:** Production remains `86d5cca9` / `index-o0xZrfkL.js`, migrations **13 applied of 13 tracked, none pending**, Edge `ai-gateway` v36 ACTIVE / `verify_jwt=true`, untouched. **One open item remains on this slice:** no authenticated Production smoke was run for the release, unlike the previous three.
- **2026-07-30** — **Finance Charge Safe Delete: RELEASED / LIVE IN PRODUCTION. Migration applied on the first attempt; owner Preview UI QA PASSED.** PR [#150](https://github.com/natanMeT/ArtValue20/pull/150) → merge **`1eb7b2abd44249da83f1c4891d4a5d3fcd44a88c`** (parents `2c9bec42` + the owner-approved head `0db561a8`, `--match-head-commit`); rollback tag `pre-charge-safe-delete` @ `2c9bec42`. **Closes F1 gap (a):** a charge can be deleted from the UI, and **only if no payment row belongs to it**. `deleteCharge` already existed end-to-end but nothing called it — and exposing it as-is would have been a defect, because `payments_charge_same_owner_fk` is **ON DELETE CASCADE** and the old direct delete silently destroyed every payment attached to the charge. **A UI gate could not enforce this**, which is why the slice carries a migration: `received === 0` is a SUM over rows the client happens to hold and reads 0 while a payment row exists (dropped by `normalizePaymentRow`, recorded after the last `fetchAll`, or landing between the confirm click and the DELETE). The `payments_amount_positive` CHECK rules out the *arithmetic* cases (amount `0`, negative, net-zero) but **none of those three**. Adds **`public.delete_charge_if_unpaid(uuid)`** — `SECURITY DEFINER`, `set search_path = ''`, ownership from `auth.uid()` — which locks the charge `FOR UPDATE`, refuses on payment-row **EXISTENCE** (not a sum), then deletes with ownership repeated on the statement. **`SECURITY DEFINER` is load-bearing:** under INVOKER the existence check would be RLS-filtered and could miss the very row it exists to find. **Cross-account non-disclosure:** not-found and not-owned raise the identical `P0002` from a **single raise site**, ownership checked before payments — proven on both code and message text. **Race measured, not asserted:** `FOR UPDATE` conflicts with the `FOR KEY SHARE` a concurrent payment INSERT takes via the FK — the INSERT blocked **5.97 s** against a held lock vs **0.01 s** with no holder, on real PostgreSQL 17.6. **Rejected alternatives recorded in the migration header:** FK `CASCADE`→`RESTRICT` (checked immediately; could break account deletion mid-cascade) and a `BEFORE DELETE` trigger (fires on that cascade too); neither closes the race. **Migration `20260802120000` APPLIED FIRST ATTEMPT** — **13 applied of 13 tracked**, `db push --dry-run --linked` = "Remote database is up to date" — **because the exact file was executed against a real PostgreSQL 17.6 before the PR was opened**. That rehearsal **failed on its own postflight** and caught a real defect: it asserted `proconfig @> array['search_path=']`, but PostgreSQL stores `set search_path = ''` as **`search_path=""` with quotes**, so the assertion was false for a correctly hardened function; corrected and pinned by a test. **19/19 DB acceptance controls PASS** on disposable records inside a rolled-back transaction — unpaid charge deleted; charge with a payment refused **`23514`** with **both charge and payment surviving**; cross-account and nonexistent both **`P0002`** with byte-identical messages; `anon` false / `authenticated` true / `PUBLIC` false; FK still `confdeltype='c'`. **HTTP-path control:** an `anon` call returned **401 / `42501`**, proving both that the revoke holds end-to-end and that **PostgREST passes the raw SQLSTATE through verbatim as `code`**. **Owner Preview UI QA PASSED** on the isolated QA account: control shown for an unpaid charge, **withdrawn** once a payment exists, **restored** when the payment is deleted, delete works after confirm, a cancelled+unpaid charge is still deletable, a charge with a payment offers cancel/reopen but not delete, and the payment still counts after cancel/reopen. **One build**, Preview **`5a9e7277`**, then Production **`86d5cca9-88e2-40db-9869-664cfc1567e8`** by promoting the identical `dist/` ("Uploaded 0 files (12 already uploaded)"; local ↔ Preview ↔ Production **12/12 byte-identical**), entry **`index-o0xZrfkL.js`**. **Current rollback target is now `c45518fb` / `index-B21Es_EZ.js`**; `478e4d62` demoted to a historical fallback, retained. **A frontend rollback does NOT remove the function** — the migration is additive and stays applied, and no pre-release code calls it. **Gap 2 UNCHANGED and reclassified as no-change-needed:** payments on a cancelled charge still count in "הכנסה בפועל" — correct accounting, pinned by a test, and now stated on screen. ⚠️ **Two things NOT done, recorded rather than implied:** the **stale-tab refusal message** was never exercised (owner-accepted cosmetic gap — the refusal is proven server-side, only the toast text is unverified) — *(**SINCE CLOSED**: exercised and PASSED 2026-07-31, see the entry directly above; this clause is scoped to 2026-07-30)* — and **no authenticated Production smoke** was run, unlike the previous three releases *(still open)*. **One approved allowlist deviation:** `scheduleMigration.test.js` asserted its own migration is the last file in the directory forever, so any new migration failed an unrelated slice's test; changed to assert what it meant. Full suite **128 files / 3,738 passed / 0 failed**. **NO table/column/constraint/policy/data change, NO rebuild, NO second Preview, NO Edge/Auth/secret/package change, NO new slice:** Edge `ai-gateway` v36 ACTIVE / `verify_jwt=true`, untouched.
- **2026-07-30** — **Schedule Core slice 1: RELEASED / LIVE IN PRODUCTION. Migration applied on the first attempt; authenticated Preview UI QA and non-mutating Production smoke both PASSED.** PR [#142](https://github.com/natanMeT/ArtValue20/pull/142) → merge **`660f671ee923e2fdd75a2aed5f2c4979304d7701`** (parents `b2bd9c4b` + the owner-approved head `a5804d1b`, `--match-head-commit`); rollback tag `pre-schedule-core-slice1` @ `b2bd9c4`. Adds `public.appointments` — the product’s **first durable time-of-day entity** — with a `kind` discriminator (`appointment`/`lesson`/`event`), a **stored** outcome `status`, and **two composite same-owner foreign keys** to `clients` and `tasks`, both `ON DELETE SET NULL` **with the column list** (a bare one would null the NOT NULL `user_id` and break every parent delete). `public.tasks` gained exactly one constraint (`tasks_id_user_unique`) and nothing else. **No quota, no SECURITY DEFINER function.** Named `appointments`, not `calendar_events`, to keep the boundary against the Growth OS planning board that persists nothing. **Migration `20260801120000` APPLIED FIRST ATTEMPT** — 12 applied of 12 tracked, `db push --dry-run --linked` = "Remote database is up to date" — **because the exact file was executed against a real PostgreSQL 17.6 before the PR was opened**, the rule F1 established after two failed applies. That rehearsal caught a brittle assertion in this very file (a total column count on `public.tasks`) which aborted the first run, rolled back completely inside its single transaction, and was replaced with a permanent narrow invariant before merge. **PART A matched exactly**; **PART B decisive** on two QA accounts and disposable `SC_QA_` records — `23503` on both same-owner keys, four `23514` domain refusals, no residue after either refusal, both parent-delete semantics (appointment survives, link nulled, `user_id` intact), isolation 0 vs own 1, and `updated_at` proven transaction-independently; cleanup **verified zero under RLS and RLS-independently**, owner account never touched. **Authenticated Preview UI QA PASSED** on the isolated QA account with real clicks and typing only, after verifying four rendering gates (rAF **61 fps**) and the JWT identity **before any write**: the invalid-end negative control was refused in the UI with **0 POSTs** and the modal left open with its values, a lesson 10:00–11:15 stored as **07:00Z / 08:15Z**, all four statuses reachable, history retained under “הכל”, 0 console messages, cleanup zero. **One build**, Preview **`840b5a94`**, then Production **`ad09b631-8d70-421c-b3fc-543972b95723`** by promoting the identical `dist/` ("Uploaded 0 files (12 already uploaded)"; Production↔Preview **12/12 byte-identical**), entry **`index-QaS25VkC.js`**. **Authenticated non-mutating Production smoke PASSED**: `/schedule` renders signed in, `GET /rest/v1/appointments` **200**, **48/48 requests HTTP 200 and every one a `GET` — 0 writes**, 0 console messages, row counts identical before and after. **Current rollback target is now `88b20584` / `index-BLR2aev7.js`**; `90a7dc15` demoted to a historical fallback, retained. **A frontend rollback does NOT undo the migration** — it is additive and stays applied. Full suite **125 files / 3,658 passed / 0 failed**; 136 tests added; **10 negative controls**, two measured at the database level (a single-column FK **leaked 1 cross-account row**; a bare `SET NULL` failed the parent delete on `user_id`). **NO Codex this slice (owner instruction), NO rebuild, NO second Preview, NO migration/schema change beyond this one, NO Edge/Auth/secret/package change, NO new slice:** Edge `ai-gateway` v36 ACTIVE / `verify_jwt=true`, untouched.
- **2026-07-30** — **F1 Core Receivables slice 1: RELEASED / LIVE IN PRODUCTION. Authenticated non-mutating Production smoke PASSED.** Docs PR [#140](https://github.com/natanMeT/ArtValue20/pull/140) merged as **`c281cda1d16c25f1d5647ee94536a991837fdef5`** (parents `4f33e252` + head-gated `b238830a`, merged with `--match-head-commit`), making that the release commit-hash. **Preflight, all green before touching Production:** 11 applied of 11 tracked; Edge `ai-gateway` **v36 ACTIVE / `verify_jwt=true`**; Production still `90a7dc15` / `index-9FYipeQ9.js`; and the `110bb1e`→`c281cda` delta **docs only** (one file, `docs/PROJECT_TRACKER.md`). **Artifact parity proven BEFORE deploying — this is why no rebuild happened:** the local `dist/` was compared against the Preview's **served bytes** and all **10/10 files matched by SHA-256**, entry **`index-BLR2aev7.js`** (SHA256 `1277f2ccfe0c457cd2c8083d5dc728bc075320cb93ba4fffb5dad250393fbe46`, 735,443 B). **ONE deploy, the same accepted `dist/` promoted unchanged:** Production **`88b20584-b375-4073-a762-f91dc2f1a1e8`** (Environment Production, branch `main`, `--commit-hash c281cda1…`) — https://88b20584.artvalue-product.pages.dev, canonical https://artvalue-product.pages.dev; `wrangler` reported **"Uploaded 0 files (12 already uploaded)"**. **Post-deploy:** canonical **HTTP 200** serving `index-BLR2aev7.js`, Production↔Preview **10/10 byte-identical**, Edge and migrations **unchanged**, rollback deployments re-verified HTTP 200 still serving their own bundles. **Authenticated non-mutating Production smoke PASSED** on the isolated **QA account B** (identity re-verified from the JWT first; the owner account was never used): cloud mode `נתונים בענן`, **Finance renders signed in**, KPIs `צפוי ₪0 / התקבל ₪0 / יתרה ₪0`, `אין חיובים פתוחים` empty state, **49/49 network requests HTTP 200 and every one a `GET`** — including `/rest/v1/charges` and `/rest/v1/payments`, so the F1 endpoints are live and RLS-readable — **0 `POST`/`PATCH`/`DELETE`, therefore 0 writes**, **0 console messages of any level**, and row counts **identical before and after** (`clients=3`, `charges=0`, `payments=0`, `quotes=0`, `transactions=0`, `tasks=0`). **No record was created, edited or deleted.** **Current rollback target is now `90a7dc15`**; `5bcf1ef0` is a historical fallback only. **A frontend rollback does NOT undo migration `20260731120000`** — it is additive and stays applied. **NO rebuild, NO new Preview, NO migration/schema/Edge/Auth/secret/package change, NO Codex, NO new feature or slice.** Rollback tag `pre-finance-receivables-slice1` @ `110baf1`.
- **2026-07-30** — **F1 Core Receivables slice 1: CODE MERGED, MIGRATION NOT APPLIED *at the moment of the merge*, NOT RELEASED.** *(This entry describes the merge only. The migration was applied later the same day — see the "APPLIED and VERIFIED LIVE on the THIRD attempt" entry immediately below; every "not applied" statement here is scoped to the merge, not to today.)* PR [#134](https://github.com/natanMeT/ArtValue20/pull/134) → merge **`56d13ef`** (parents `110baf1` + the owner-approved head `c811fac`, merged with `--match-head-commit c811fac02e086427ce6a93e7ab179ba81e94c03c`, so a moved head would have failed the merge); rollback tag `pre-finance-receivables-slice1` @ `110baf1`. Adds `public.charges` (expected billing) and `public.payments` (money received; the source of truth for received revenue), and establishes **five composite same-owner foreign keys** — `quotes`/`transactions`/`charges` → `clients`, `charges` → `quotes`, `payments` → `charges`. **Two are WIDENED, three are NEW:** only `quotes.client_id` and `transactions.client_id` existed before, and their delete actions are preserved byte for byte (changing one while widening a key would be two decisions hiding in one); the three on the new tables get their CASCADE / SET NULL **for the first time here**, as this slice's own choices. Every `SET NULL` names its column, because a bare one would null the NOT NULL `user_id`. **Payment status is DERIVED and has no column.** **Migration `20260731120000` was NOT applied *at that moment* — 10 applied of 11 tracked, one pending** (confirmed by `migration list --linked` after the merge: an empty remote column) — *(today: **11 applied of 11 tracked, none pending**; it was applied later the same day)* — so `main` then deliberately carried a schema change that was **not** in the live database, exactly as Campaigns slice 2 did for one day. Applying it is a **separate owner gate**, and PART A / PART B (two QA accounts, disposable records, cleanup verified zero by query) follow only after that. **Codex 21 rounds / 41 findings — all 41 fixed, replied to and RESOLVED, 0 unresolved threads.** The last three: PART 1 gained **orphan and cross-owner anti-joins for all seven relationships it keys** (`(k1b)`, pre-DDL, guarded by `pg_attribute` existence checks so an `auth` parent is reachable and the block can never itself raise an undefined-column error); the PART 1 index lookup now **requires the expected `tablename`**, because index names are schema-wide and `create index if not exists` is name-only — with a schema-wide re-check so a hijacked name is a loud SAFE STOP rather than a silent skip; and `runMigrate` now shares `importResultToast` with `importData`, so a partial cloud upload reports its skipped charges/payments instead of an unqualified success. **One negative control found a defect in the new tests themselves:** a single `toContain` on the toast-kind pass-through was satisfied by the other call site, so dropping `runMigrate`'s kind **passed** — it now counts both call sites. Full suite **122 files / 3,511 passed / 0 failed** (from 119 / 3,265), re-run on merged `main`; 246 tests added and **68 negative controls**, each proven to fail when its fix is reverted and each file restored byte-identical afterwards. **Reported, not fixed:** `public.tasks.client_id` is still a single-column FK (**L5**), and a `transaction` still cannot be linked to a `charge` (**L6**) so a person — never the system — can double-count one receipt. **NO migration applied, NO build, NO Preview, NO Production deployment, NO Edge/Auth/secret change, NO new slice:** Production stays `90a7dc15` / `index-9FYipeQ9.js`, current rollback target `5bcf1ef0`, Edge `ai-gateway` v36 untouched.
- **2026-07-30** — **F1 Core Receivables slice 1: PREVIEW DEPLOYED. Authenticated Preview UI acceptance STILL PENDING. Production NOT deployed.** Docs PR [#138](https://github.com/natanMeT/ArtValue20/pull/138) merged as **`110bb1e5ac4835e7a2d792af84ced652cb13be28`** (parents `601b3c9` + head-gated `b1fccb0`), making that the release source. Then, in one hard-ordered pass: **11 applied of 11 tracked** and `db push --dry-run --linked` = "Remote database is up to date"; Production confirmed **unchanged** at `90a7dc15` / `index-9FYipeQ9.js` (fetched from the canonical URL, HTTP 200, `index.html` still referencing that bundle) and Edge `ai-gateway` **v36 ACTIVE / `verify_jwt=true`**; full suite **122 files / 3,522 passed / 0 failed**; **exactly one** production build from merged `main`, entry **`index-BLR2aev7.js`**. **Artifact scanned BEFORE deploying:** receivables code present (`charges` ×32, `payments` ×22, `amount_total`, `payment_terms`, `due_date_source`, `lifecycle` ×16, `partially_paid` ×3); **0** hits for `service_role`, `SUPABASE_SERVICE`, `sk_live`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `xoxb-`, `ghp_`, `AKIA`, `PRIVATE KEY`, `client_secret`; **0 JWT-shaped tokens** (the only key shipped is the Supabase **publishable** key, client-side by design); the 5 `sk-` matches verified as false positives (`ask-clarifying-q` ×2, `.mask-canvas` ×3); **0** hits for `localhost`, `127.0.0.1`, `192.168.`, `file://`, `:5173`, `:8188`, `C:\`. Deployed **Preview `10dbbf8d-d02d-4fcb-8255-6d83a5bff70b`** from that exact tested `dist/`, branch `f1-preview-110bb1e`, `--commit-hash 110bb1e…` so the deployment is tied to the source commit — https://10dbbf8d.artvalue-product.pages.dev ("Uploaded 2 files (10 already uploaded)"). **Smoke — non-mutating and UNAUTHENTICATED:** app loaded, **8/8 assets HTTP 200**, entry bundle the freshly built `index-BLR2aev7.js`, **0 console messages at any level**, **0 REST/API calls — 0 reads, 0 writes, no data touched**, signed-out Hebrew RTL gate rendered correctly. **No sign-in, no real account, no QA record created in the browser, no password requested or handled.** *(A screenshot could not be captured — the browser pane was not compositing frames in this environment; the accessibility tree, network log and console output are the evidence instead.)* **⚠️ The honest limit: nobody has yet seen the Finance receivables UI work signed in** — everything proven so far is catalog-level, SQL-level, artifact-level or signed-out. That authenticated acceptance is the open gate and is owner-driven. **NO Production deploy, NO Edge/Auth/secret/package change, NO migration or DB change, NO Codex, NO new feature or slice:** Production stays `90a7dc15` / `index-9FYipeQ9.js`, rollback target `5bcf1ef0`, Edge v36 untouched.
- **2026-07-30** — **F1 Core Receivables slice 1: migration `20260731120000` APPLIED and VERIFIED LIVE on the THIRD attempt; PART A + PART B PASSED; QA residue zero. Still NO release.** Applied to linked project `weciwurjfwmqihcyexzj` with `supabase db push --linked` — **11 applied of 11 tracked, none pending**, and `db push --dry-run --linked` = **"Remote database is up to date"**, closing the merged-but-unapplied gate opened by the 2026-07-30 feature merge `56d13ef`. **The first two attempts FAILED, and that is the durable lesson of this slice: the migration had never been executed against a real PostgreSQL before it was merged**, so two defects survived 21 Codex rounds, 41 findings and a 122-file suite — both in the *verification* scaffolding rather than the DDL, and both invisible to text-level contract tests. (1) `ERROR: syntax error at or near "notnull" (SQLSTATE 42601)` — precondition check (c) used the reserved word `notnull` as an unquoted column alias, so the `DO` block **failed to parse**, aborting before any DDL *and* before its own `raise exception` guards could report anything; fixed in PR [#136](https://github.com/natanMeT/ArtValue20/pull/136) → merge `f442355` (head-gated `7f4e537`), a 3-line rename to `requires_not_null`. (2) `ERROR: record "c" is not assigned yet (SQLSTATE 55000)` — PART 6 declared `c record;` / `n int;` then aliased `pg_class c` / `pg_namespace n`, and PL/pgSQL resolves `c.relname` against the **declared variable**, not the table alias; this one aborted **after the DDL had run and after both existing single-column FKs had been replaced**, and the single transaction rolled all of it back — **verified read-only: `charges`/`payments` absent, 0 new composite keys, `quotes_client_id_fkey` and `transactions_client_id_fkey` both still present, no migration-history row, no business data touched.** Fixed in PR [#137](https://github.com/natanMeT/ArtValue20/pull/137) → merge `601b3c9` (head-gated `590d987`), which swept the **whole file** for the class — **8 `DO` blocks scanned, 5 collisions found, all in PART 6**, all renamed to `ci`/`ns` — and added a **structural guard** (each block's `DECLARE` names vs its own table aliases) with in-test, artifact-level and other-block negative controls, because 105 existing text assertions could not see this: the SQL was well-formed and every identifier existed. **Both fixes edited only the then-pending migration and its contract test; neither changed logic or DDL.** **PART A (read-only) matched exactly:** both tables present; RLS enabled on both; **exactly 8 policies, 4 per table**, all `{authenticated}`, all own-row, **none mentioning `row_count`** (no quota, no SECURITY DEFINER counter); **all five composite FKs verbatim** — `quotes … ON DELETE CASCADE`, `transactions … ON DELETE SET NULL (client_id)`, `charges … ON DELETE SET NULL (client_id)`, `charges … ON DELETE SET NULL (quote_id)`, `payments … ON DELETE CASCADE`; **no single-column `client_id` FK survived** (only the two `user_id → auth.users` keys remain); **0** stored payment-status columns; `charges` and `payments` both **0** rows. Extended read-only evidence: 15 / 7 columns, 9 CHECK constraints, 8 indexes, 3 triggers (`trg_charges_updated`, `trg_payments_updated`, `trg_payments_reject_cancelled`). **PART B — nine controls decisive, on disposable QA records only, two QA accounts, the real owner account never touched:** (8) positive charge insert — 1 row, `1000.00`, `open`, worked due date **`2026-04-29`**; (9) payment `400.00` → **balance `600.00`** derived with no status column; (10) **the control this slice exists for** — A naming B's client was **REFUSED with `23503` … "charges_client_same_owner_fk", DETAIL: Key is not present in table "clients"**, with **no residue** (`client_id` still the original), while A's `select` of B's client returned **0 rows**; (11) B naming A's charge **REFUSED with `23503`** on `payments_charge_same_owner_fk`; (12) `set status='paid'` **REFUSED with `42703`**; (13) a payment against a **cancelled** charge **REFUSED with `23514`**, `CONTEXT` naming `public.payment_reject_cancelled_charge() line 19` — proof the **trigger** fired and not the FK, which the migration explicitly warns about — and **deleting an existing payment while cancelled still succeeded**, so a mistake is never stranded; (14) deleting the QA client left the charge **present** with `client_id` **NULL** and `user_id` **unchanged** — the live proof that the *column-list* `on delete set null (client_id)` landed, where a bare `SET NULL` would have raised a not-null violation on `user_id`; (15) deleting the charge **CASCADEd** the payment to 0; (16) cross-account isolation **0**. **Cleanup verified, not assumed:** all five QA ids returned 0 per-account under RLS **and** RLS-independently as `postgres`, with `charges` 0, `payments` 0, `F1_QA_%` clients 0, and `public.clients` back to **3** rows — exactly the real owner's pre-existing data. **Disclosed substitution, same as Campaigns slice 2:** "as account A / as account B" was executed server-side via `set local role authenticated` + `request.jwt.claims`, verified genuine beforehand (`current_user = authenticated`, `auth.uid()` = the QA uid), **not** through a browser sign-in — no QA password exists in this environment. Decisive for system-enforced foreign keys and triggers; the HTTP/PostgREST path is **not** covered and no such coverage is claimed. **NO build, NO Preview, NO Production deployment, NO Edge/Auth/secret change, NO Codex, NO new slice:** Production stays `90a7dc15` / `index-9FYipeQ9.js`, rollback target `5bcf1ef0`, Edge `ai-gateway` v36 untouched. Full suite **122 files / 3,522 passed / 0 failed**. **Schema parity restored; release parity not — the Finance receivables area is unreachable by users until a separately-approved build/deploy.** Documentation-only PR for this entry.
- **2026-07-30** — **Campaigns slice 2: migration `20260729120000` APPLIED and VERIFIED LIVE; PART A + PART B acceptance PASSED; QA residue zero. Still NO release.** Applied to linked project `weciwurjfwmqihcyexzj` with `supabase db push --linked`; **10 applied of 10 tracked, none pending** (from 9 applied of 10 tracked), closing the merged-but-unapplied gate opened on 2026-07-29. The migration's own preflight and postcondition assertion blocks passed; the single NOTICE came from its idempotent `drop constraint if exists`. **PART A (read-only) matched exactly:** `tasks.campaign_id` = `uuid` / nullable `YES` / default `NULL` / `is_generated = NEVER`; FK verbatim `FOREIGN KEY (campaign_id, user_id) REFERENCES campaigns(id, user_id) ON DELETE SET NULL (campaign_id)`; partial index `idx_tasks_campaign … WHERE (campaign_id IS NOT NULL)` present; `0` tasks carried a non-NULL `campaign_id`. **PART B — all five controls decisive, on disposable QA records only, on two QA accounts, with **the real owner account** never touched:** (4) A linked its task to its own campaign — 1 row, `user_id` unchanged, while A's `select` of B's campaign returned **0 rows**; (5) **the control this slice exists for** — A naming B's campaign was **REFUSED with `23503` … violates foreign key constraint "tasks_campaign_same_owner_fk", DETAIL: Key is not present in table "campaigns"**, and left **no residue** (the link was still the original one afterwards); (6) unlink allowed — 1 row, NULL; (7) deleting the QA campaign deleted **1 row** and left the task **present** with `campaign_id` **NULL** and `user_id` **unchanged** — the live proof that the *column-list* `on delete set null (campaign_id)` landed, where a bare `SET NULL` would have raised a not-null violation; (8) a nonexistent campaign was **REFUSED with `23503`**, same constraint. **Cleanup verified, not assumed:** task `TA` = 0, campaign `CA` = 0, campaign `CB` = 0, proven per-account under RLS *and* RLS-independently as the owner role, with whole-table totals back to the exact pre-apply baseline (`tasks` 0, `campaigns` 0, `0` linked). **Disclosed substitution:** "as account A / as account B" was executed server-side via `set local role authenticated` + `set local request.jwt.claims`, verified genuine beforehand (`current_user = authenticated`, `auth.uid()` = the QA uid, RLS applying), **not** through a browser sign-in — no QA password exists in this environment. That is decisive for a system-enforced foreign key; the HTTP/PostgREST path is **not** covered and no such coverage is claimed. **NO frontend build, NO Preview, NO Production deployment, NO Edge/Auth/secret change, NO migration edit, NO PR merge, NO new slice:** Production stays `90a7dc15` / `index-9FYipeQ9.js`, rollback target `5bcf1ef0`, Edge `ai-gateway` v36 untouched. **Slice 1 is now formally non-rollback-able in isolation** — the FK exists live, so it must be dropped before `campaigns_id_user_unique`. Documentation-only PR; the next product slice remains **PENDING NATHAN DECISION**.
- **2026-07-29** — **Campaigns slice 2 MERGED / NOT APPLIED *at that date* / NOT RELEASED, and a tracker-consistency correction (documentation-only).** *(The apply and acceptance run landed the next day — see the 2026-07-30 entry above; the "not applied" statements in this entry describe 2026-07-29 only.)* PR [#131](https://github.com/natanMeT/ArtValue20/pull/131) → feature merge **`8b6a78a`** (parents `735309b` + the owner-approved head `c6b489c`, merged with `--match-head-commit c6b489c`); rollback tag `pre-campaigns-slice-2` @ `735309b`. Adds nullable `public.tasks.campaign_id` + composite FK `(campaign_id, user_id) → campaigns (id, user_id)` with `on delete set null (campaign_id)`. **Migration `20260729120000` was NOT applied *as of that date* — 9 applied of 10 tracked *at that moment*** — so `main` then carried a column and a foreign key that were **not yet in the live schema** *(applied 2026-07-30)*. Codex CLEAN on the merged head; **three P2s across two rounds, all valid, all fixed**: type-only validation of a pre-existing column; a `GENERATED ALWAYS` column passing the type/nullability/default checks (its expression lives in `generation_expression`, not `column_default`); and a verification block that claimed to be read-only while five controls wrote and one **deleted a campaign row**. Full suite **119 files / 3,265 passed / 0 failed**. **Documentation correction in PR [#132](https://github.com/natanMeT/ArtValue20/pull/132), from two further P2s against the tracker itself:** every migration count is now written **"N applied of M tracked"**, with historical counts explicitly time-scoped (a bare fraction cannot be read as either applied or tracked, and silently contradicted the pending migration), and **no paragraph pins `main` to a SHA** — `8b6a78a` is the historical anchor *contained in* `main`, and the HEAD is resolved live. Both conventions are now stated in the slice box so future slices inherit them. Swept the whole file *mechanically* — every `N/M` fraction enumerated with context and each migration-context one rewritten (the two "today" table rows, the release paragraph, the Asset Library release line, the same-day changelog entry below, the header status line, the Studio/P1 gate lines and the historical `db push` records), leaving byte-identity (`12/12`), acceptance (`13/13`) and quota (`0/200`) fractions untouched because they are not migration counts; also corrected the now-stale claim that slice 1's `unique (id, user_id)` is simply "INERT today" — it is inert **in the live database**, but the FK referencing it now exists in the repo, and slice 1 stops being rollback-able in isolation **when the migration is applied**, not at merge. **No build, no deployment, and no migration applied *that day*:** Production stays `90a7dc15` / `index-9FYipeQ9.js`, rollback target `5bcf1ef0`, Edge `ai-gateway` v36 untouched.
- **2026-07-29** — **Revoke `anon` EXECUTE on the three quota counters — CLOSED (migration-only; no release).** PR [#129](https://github.com/natanMeT/ArtValue20/pull/129) → main **`a8501c3`** (merged with `--match-head-commit 3c4f432`) → migration **`20260728130000_revoke_anon_counter_execute.sql` APPLIED 2026-07-29 — 9 applied of 9 tracked *at that moment*, before Campaigns slice 2 was tracked later the same day** (today: **11 applied of 11 tracked, none pending**), checker back to **CLEAN**. **The defect:** `revoke … from public` does **not** remove a role's own explicit grant, and Supabase's project-level defaults grant EXECUTE on new functions to `anon` — so the identical closing line in the Asset Library and Campaigns migrations left `anon` holding EXECUTE **both times**. Exposure was zero only because every counter takes **no argument** and reads `auth.uid()` itself; a `p_owner` parameter on any of them would have made it a cross-account count leak. **Fixed as ONE migration** covering `asset_row_count`, `asset_object_count` and `campaign_row_count`, with `authenticated` explicitly re-granted. **Verified live, in both directions:** `anon` EXECUTE denied and `authenticated` EXECUTE retained on all three; and behaviourally — an `anon` call to `campaign_row_count()` returned **`0`** before and raises **`42501 permission denied`** after. **The write that matters was proven end-to-end**, because the quota policies call the counters as the querying role and a too-broad revoke would have broken every cloud create: as QA account B under `set local role authenticated` + JWT claims, a probe confirmed `running_as = authenticated`, `uid` = QA account B, `counter_value = 1`, then INSERT committed, DELETE committed and `campaigns` returned to 0 rows; **Account A untouched.** **What closes the CLASS rather than three instances:** `src/lib/__tests__/securityDefinerGrants.test.js` fails CI for **any** `security definer` function declared under `supabase/` without a revoke from `anon` — corpus-wide (a revoke may live in a later migration than its declaration), per-declaration attribution, both comment forms stripped, and a positive control asserting the parser actually found what it guards. Negative controls: removing each of the three revokes failed 2 tests each; adding a **new** counter written exactly the way the two earlier slices wrote theirs failed the class rule and named it. The migration also **asserts its own postcondition in both directions** and SAFE STOPs on a missing counter. **NO frontend change, therefore no build, no Preview and no deployment** — Production stays `90a7dc15` / `index-9FYipeQ9.js`, current rollback target stays `5bcf1ef0`, Edge `ai-gateway` v36 untouched, no secret change. Full suite **118 files / 3,227 passed / 0 failed** (from 117 / 3,219). Rollback tag `pre-revoke-anon-counter-execute` @ `c2a076b`. **New open item, non-blocking, recorded as an AUDIT candidate and explicitly not a fix:** `public.reserve_ai_budget` is `security definer` but declared in `supabase/schema.sql` rather than in a migration, so the migration set is not a complete description of the live function surface — two sources of truth for the schema. The function itself is correct (service_role only) and passes the new guard.
- **2026-07-28** — **Campaigns slice 1 (durable per-account business campaigns) CLOSED / LIVE VERIFIED in Production.** Release chain: PR [#127](https://github.com/natanMeT/ArtValue20/pull/127) → main **`97b4229`** (merged with `--match-head-commit 8510cd1`, so a moved head would have failed the merge) → migration **`20260728120000_campaigns_slice1.sql` APPLIED** (**8 applied of 8 tracked** *at that date*) and **verified against the live database rather than from the code** → **exactly one build** from `97b4229` + artifact scan → **Preview `19a58ba9`** (two-QA-account acceptance PASS) → **Production `90a7dc15` / `index-9FYipeQ9.js`** by re-deploying the identical `dist/` (wrangler "Uploaded 0 files (12 already uploaded)"; served entry re-downloaded at SHA256 `1dc21093…0ee31`, 706,290 B) + **non-mutating Account A Production smoke PASS**. **Current rollback target `5bcf1ef0` / `index-dUN1r8PM.js`** verified HTTP 200 post-deploy; **`b3708cc2` demoted to historical fallback, retained, not deleted (§22 requires exactly one current target)**. Rollback tag `pre-campaigns-slice-1` @ `a548518`. Delivered: `public.campaigns` (title, objective, status, start/end dates), owner-only RLS with **one policy per command**, a **200-row quota on INSERT alone**, a **`BEFORE UPDATE` status-transition trigger** — the repo's first — and `unique (id, user_id)` shipped inert as slice-2 preparation, plus a minimal management screen that is **cloud-only** and renders a truthful unavailable state in local/demo (the S0A false-success rule inverted; new `cloudOnly` nav flag, the mirror image of `betaHidden`). **NAMING BOUNDARY, the point of the slice:** `public.campaigns` is a durable **business campaign** and is **not** `src/creative/v2/campaignStore.js`, a device-local **creative session** (brief → 3 concepts → selection); same word, lifetimes an order of magnitude apart, nothing migrated between them, and a test fails if the new code imports from `src/creative/v2/**`. **The trigger is the protection, not the UI:** `completed → active` through the privileged CLI role, which bypasses RLS, was refused with **`ERROR 23514`**. **Owner review removed a predicate that could never fire:** the quota had also been mirrored into the UPDATE policy as `<= 200`, but an UPDATE cannot raise the row count and its `WITH CHECK` already blocks moving a row between accounts — a condition that can never fire is not defence in depth, it is a second copy of a rule free to drift; the declared limitation describing it was **deleted rather than renumbered**, and a test now fails on a dangling `L4`. **Evidence:** full suite **117 files / 3,219 passed / 0 failed** (from 114 / 3,153), build green, **eight negative controls** each failing only the correct test(s); isolation proven **at the API layer** (account D's own token: unfiltered `select` → `[]`, B's campaign by exact UUID → `[]`, and after D created one row the identical query returned exactly that row — so the `[]` was scoping, not a dead query); quota gates creation and never recovery (at 200 rows an account still edits and cancels: `1, 1, 200`). **NOT verified and not claimed:** the local/demo unavailable state — `isSupabaseConfigured` is fixed at build time, so no cloud deployment can exercise it; it is covered by source-pinned tests plus a negative control. **Open at the time, now RESOLVED (2026-07-29, migration `20260728130000` — see the entry above):** `anon` holds EXECUTE on `asset_row_count`, `asset_object_count` **and** `campaign_row_count` — `revoke … from public` does not remove a role's explicit default grant, which is why the identical line produced the identical result in two slices; **fix as ONE migration, not per slice.** **No Gateway/Edge change** (v36 ACTIVE / `verify_jwt=true`, not redeployed), no secret change, no roadmap change. **Growth remains BetaUnavailable — this slice delivers a SECOND of its three reopening prerequisites and does NOT reopen it;** the third, an account-aware Growth data model, remains open. **Two process lessons recorded in the Baseline:** "promoting the exact artifact" in this project means re-deploying the byte-identical `dist/` and producing a new deployment id — wrangler has no promote command, and the phrase "promote that deployment, not the dist in the folder" caused an unnecessary SAFE STOP; and an early post-deploy asset request returns the SPA's `index.html` (1,285 B), whose hash mismatch reads exactly like a corrupted release — check size and ETag first, since a Vite filename *is* the content hash.
- **2026-07-27** — **Asset Library slice 1 (durable cloud gallery images) CLOSED / LIVE VERIFIED in Production.** Release chain: PR [#125](https://github.com/natanMeT/ArtValue20/pull/125) → main **`87fed4b`** (merge gated on the approved head `607cac1`, verified before merging) → migration **`20260727120000_asset_library_slice1.sql` APPLIED** (**7 applied of 7 tracked** *at that date*, "Remote database is up to date") → **exactly one build** from `87fed4b` + artifact scan → **Preview `d1235743`** (12/12 byte-identical, authenticated QA-account acceptance PASS) → **Production `5bcf1ef0` / `index-dUN1r8PM.js`** by reusing the accepted `dist/` (wrangler "Uploaded 0 files (12 already uploaded)"; canonical serves 12/12 byte-identical) + **non-mutating Account A Production smoke PASS**. **Current rollback target `b3708cc2` / `index-C4frcMDi.js`** verified HTTP 200 post-deploy; **`247ef9ec` demoted to historical fallback, retained, not deleted (§22 requires exactly one current target)**. Rollback tag `pre-asset-library-slice-1` @ `3803b61`. Delivered: a **private** `assets` bucket + `public.assets`, **structural** per-account isolation (`check (storage_path = user_id::text || '/' || id::text || '.' || ext)` — reconstruction, not prefix matching), owner-only RLS on both surfaces with **no UPDATE policy on either**, bytes reachable only through **short-lived signed URLs**, a server-enforced MIME allowlist and 10 MiB ceiling, and a **symmetric 40-asset quota on rows AND objects** via two separate zero-argument `SECURITY DEFINER` counters. **Ordering rule — always fail toward the visible state:** create = row → bytes, delete = object → row; a failed upload deliberately leaves its row, because an orphaned object is invisible forever while a dangling row is visible and deletable. **NO data migration** — the device IndexedDB gallery is legacy in cloud mode, never read, converted, copied or deleted (visible consequence by design: device-only images no longer appear in cloud mode); local/demo unchanged. **Owner review caught a real defect before the migration ran** (fixed in `607cac1`): the quota had been enforced only on `storage.objects`, so under the row-first ordering `public.assets` was uncapped and an account at 40 could insert unlimited dangling rows — the fix added the row counter and split the `FOR ALL` policy into one policy per command so the cap can never block SELECT or DELETE. **Evidence:** full suite **114 files / 3,153 passed / 0 failed**, build green, **eight negative controls** each failing for the right reason; **row quota proven by live SQL** (40 seeded; probe confirmed `running_as = authenticated`, `auth.uid()` = the QA account, `rows_counted = 40`; the 41st → `ERROR 42501`; the identical statement succeeded after freeing one slot; cleanup `remaining_qa = 0`, `total_rows = 0` — the probe is what excludes an empty `auth.uid()` or a path-CHECK violation as the cause); **object quota and Storage policies proven in the Preview acceptance** (403 on a foreign prefix, 404 on another account's signed URL, **403 on `x-upsert`** — the live proof of **L4**, 409 on a duplicate path, 403 on the 41st object and 200 after freeing a slot). **Two harness defects were found by the controls themselves:** the migration checker ignored `/* */` blocks so a commented-out predicate satisfied its own test, and the public-URL artifact scan needed a positive control before its zero meant anything. **Open at the time, now RESOLVED (2026-07-29 — see the 2026-07-29 entry): `anon` retains EXECUTE on both counters** — `revoke … from public` does not remove Supabase's default role grants; exposure is zero **only** because `arg_count = 0`, and **adding a parameter would make it a cross-account leak** — revoke in the next migration. **No Gateway/Edge change** (v36 ACTIVE / `verify_jwt=true`, not redeployed), no secret change, no roadmap change, no gallery redesign. **Growth remains BetaUnavailable — this slice delivers ONE of its three reopening prerequisites and does NOT reopen it.** Two measurement traps recorded for future releases: post-deploy edge propagation briefly served the old bundle at `/` even with cache-busting, and content-hashed assets make a naive 12/12 comparison pass while `/` still serves the old app.
- **2026-07-27** — **Target audience widened in the product roadmap; the separate vision file removed as a duplicate (documentation-only).** **`docs/PRODUCT_VISION.md` deleted the same day it was added.** It was written on the premise that nothing in `docs/` explained the product in one page; the owner then produced an older Word export (`Business OS v0.6`, 24 July) which turned out to be **the same document as `docs/roadmaps/BUSINESS_OS_MASTER_ROADMAP.md`, now four versions ahead at v0.10** — §1.1 vision, §1.3 what ArtValue is, §1.4 what it is not, §1.5 market entry. The new file duplicated those sections, so it was removed rather than maintained; `docs/README.md` returns to three authoritative Markdown files and now names §1.1–§1.5 as where the vision lives, so this is not re-attempted. **Correction to the record:** four capabilities were reported to the owner as absent — Website Scanner, whole-campaign planning, the growth centre and the monthly action calendar. **All four are already in the roadmap**; Website Scanner is **§4.3, PLANNED, with SSRF/private-IP blocking, redirect, response-size, timeout and rate limits already specified and owner approval required before any finding is saved**. The initial search missed it because it searched for `SiteScanner`, not `Website Scanner` / `סורק האתר`. Growth OS and the monthly calendar exist in code (`src/pages/growth/`) and are contained as `BetaUnavailable` in the cloud by `GrowthBetaGate`, not unbuilt — reopening is blocked on durable Campaigns, a durable Asset Library and an account-aware Growth data model. **Roadmap edits:** §1.5 now states explicitly that the audience is **not only small businesses** — educational institutions, charities, car dealerships and similar organizations with multiple stakeholders, approval chains and data sensitivity — and that permissions, approvals, vertical modules and client-specific screens are therefore product requirements, with a bespoke screen built **under prior agreement and separate pricing**; §5.3 gains an **educational-institutions** vertical row (school year and cohorts, enrollment, parents as a second contact, board/management approval chain, payments and scholarships, institutional events, high-sensitivity parent communication → *Enrollment & Community Pack*). No code, tests, configuration, migration or deployment; Production, Edge and data unchanged.
- **2026-07-27** — ~~**`docs/PRODUCT_VISION.md` added**~~ *(superseded by the entry above — the file was removed the same day as a duplicate of §1.1–§1.5.)* **Original entry:** **`docs/PRODUCT_VISION.md` added — a one-page, non-technical product vision (documentation-only).** Both roadmaps are long strategic drafts that carry release history; neither is the document you hand to a person to explain the product in one page, and after phase 2 nothing in `docs/` filled that role. The new page states the problem, the promise (the closed loop: understanding → decision → creation → distribution → follow-up → measurement → learning), who it is for, what Jake is, **what ArtValue explicitly is *not*** (not a content generator, not a chat layer over a CRM, not an automation pile, not an installed tool), five non-negotiable principles (human accountability · account isolation · visible failure · commercial integrity · evidence-based status) and the success measure. **It carries no release identifiers, versions or rollback targets** and points at this tracker for live state and at the roadmaps for sequencing — it is a fifth strategic document, not a fifth state document. The filename previously existed and was deleted in phase 2 (it governed the frozen local Creative Director Engine v1, removed from the product); the content is new and unrelated. `docs/README.md` updated: the authoritative set is now four Markdown files. **Reported, not fixed (out of scope):** `docs/Art-Value-Brief.md` still asserts local-engine operation as present tense in six places (lines 12, 33, 76, 120, 130, 136 — "all AI runs locally on the user's machine, completely free", localStorage as the data store, "all components run locally on the user's hardware"); only its §3 engine table carries the retirement notice, so the same stale-state class corrected in the roadmaps survives in that file. No code, tests, configuration, migration or deployment; Production, Edge and data unchanged.
- **2026-07-27** — **Working rules absorbed into `docs/ARTVALUE_ENGINEERING_METHOD.md` (documentation-only).** Extended the existing method document rather than adding a rules file — a second rules document would recreate the duplication phase 2 just removed. Seven sections added: **§19 Owner Approval Gates** (merge, deploy, migration, secrets/config/dependencies, slice selection, anything reaching a third party, destructive git — never autonomous; defect fixing inside the slice's allowed files is autonomous, and a defect found outside them is reported rather than fixed); **§20 Scope Discipline in Practice** (every plan states what is out of scope before work starts; six symptoms that scope is growing; *is this still in scope?* is asked **before** *is there a more elegant way?* — the deleted egress framework was an elegant, universal solution to a problem nobody approved); **§21 Positive and Negative Controls** (a check that has never failed is not known to be a check — prove the failure and its count before the fix and the pass after; state the counting rule with every count; never simulate the artifact); **§22 Rollback Hierarchy** (exactly one current target — the deployment immediately before the live one — everything older labeled historical, target verified reachable after each deploy, recorded in this tracker only); **§23 Verification Before "Done"** (implemented ≠ verified; unverifiable steps are reported as awaiting owner-executed verification, partial work is named partial); **§24 Defect-Pattern Log** (append-only, in this document because an agent reads it at task start and a lesson in an unopened file prevents nothing; seeded with four patterns measured 2026-07-27 — historical labels do not neutralize present-tense claims inside them; blanket exemption markers hide what they were built to catch; a language-neutral check with English-only markers is half a check; on the *second* instance of a defect, inventory the class before editing again); **§25 Practices Considered and Not Adopted**, with reasons — "use subagents liberally" (contradicts the project instruction and the evidence: real-system verification caught the defects, a local model scored 0/12 on the golden set; a separate session *with repo access* that verifies claims is the form that works) and `tasks/todo.md` (a fourth state location). Cross-references added in §7 and §8. No code, tests, configuration, migration or deployment; Production, Edge and data unchanged.
- **2026-07-27** — **Documentation architecture phase 2 — one state document instead of four (documentation-only).** Live-release identifiers were **removed** from `docs/roadmaps/BUSINESS_OS_MASTER_ROADMAP.md`, `docs/roadmaps/AI_GATEWAY_MASTER_ROADMAP.md` and `docs/README.md` and replaced by a pointer — *מצב השחרור החי — ראה `docs/PROJECT_TRACKER.md`*. **This tracker is now the only document in `docs/` that states the release source, Production deployment ID, served bundle, Edge version or rollback target.** Both roadmaps are **kept separate** (product vs infrastructure — owner decision, chosen over merging them) and keep every historical record of what an earlier slice did; only present-tense claims about today were rewritten. Rationale, measured: the same identifiers lived in four documents, one was updated per release, and the roadmaps drifted across three consecutive releases — duplication was the mechanism, so the duplication was removed rather than policed. Deleted: `docs/KNOWN_ISSUES.md` (last touched 2026-06-19, referenced by nothing — a five-week-old known-issues list misinforms more than an absent one) and `docs/PRODUCT_VISION.md` (2026-06-11, referenced by nothing; it governed the frozen local Creative Director Engine v1, which the local-engine retirement removed from the product). Also deleted **all eight** `.docx` exports under `docs/releases/` — not only the six superseded ones: each export froze the release identifiers of its export day into a Word file a human reads with nothing marking it superseded, so keeping the two newest would have recreated the same defect class. Word exports are now generated from the canonical Markdown on request and are **not committed**; git history retains the removed ones. One dangling prose reference to the deleted vision document was cleaned from `docs/DECISION_LOG.md`. Deterministic pre-PR checker CLEAN (0 blockers). No code, tests, configuration, migration or deployment; Production, Edge and data unchanged.
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

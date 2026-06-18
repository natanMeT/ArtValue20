# ArtValue – Engineering Decision Log

> Permanent record. Per PRODUCT_VISION (Decision Log): every major decision records
> Date · Decision · Reason · Alternatives considered · Outcome. Append-only; newest last.

---

### 2026-06-09 · Build the Creative Director inside the CRM, not as a separate Python project
- **Reason:** The CRM already had the ComfyUI/Ollama clients and AdStudio; a separate engine would duplicate pipelines and fragment the product.
- **Alternatives:** Standalone `creative-engine/` Python CLI (per an early spec); hybrid module + CLI.
- **Outcome:** Engine lives in `src/lib/gemini.js`, surfaced via `/adstudio`. One product.

### 2026-06-09 · Model split — DictaLM for ideation, aya for copy/scoring/critic
- **Reason:** Benchmark showed DictaLM-3.0-12B is far more original/wild but its Hebrew prose is flowery and its self-scoring collapses (stopping always 1–2); aya writes cleaner Hebrew and scores with real spread.
- **Alternatives:** All-DictaLM; all-aya; keep aya only.
- **Outcome:** `VITE_CREATIVE_LLM_MODEL`=DictaLM (analyze/strategy/note/brainstorm/expand); aya (`VITE_LOCAL_LLM_MODEL`)=score/copy/critic/translate + Jake. Verified DictaLM-3.0-Nemotron-12B-Instruct Q5_K_M runs on Ollama 0.30.6 (hybrid-SSM supported).

### 2026-06-09 · Kill-Safe gate = numeric score floor (5.0), not the LLM's `safe` boolean
- **Reason:** The model's binary safe flag was noisy/contradictory (aya over-flagged ~90%, killing 11/12; DictaLM under-flagged). The calibrated numeric score is the reliable courage signal.
- **Alternatives:** Trust the LLM boolean; floor 5.5 (too aggressive); no floor.
- **Outcome:** `safe = total < 5.0`. Kills the weak bottom, keeps a full set. Validated 0–4 kills/business.

### 2026-06-09 · Copy layer routed to aya (Creative Editor); expand reliability hardened
- **Reason:** DictaLM copy was convoluted; expand returned empty JSON for a fraction of concepts.
- **Alternatives:** Keep DictaLM copy; single expand call.
- **Outcome:** `writeCopy` (aya) writes headline/subline/CTA; `expandConcept` retries once then falls to a deterministic fallback so output is **never empty**. English hero-object enforced; typography words whole ≤6 letters (no truncation).

### 2026-06-09 · FREEZE Creative Director Engine v1
- **Reason:** Validation across businesses proved the core metrics: campaign size 8/8 → target, premium copy ~97%, Creative Critic relevance 100% (at 1300 tokens), zero broken output.
- **Alternatives:** Keep iterating to remove the fallback first.
- **Outcome:** v1 frozen. **Known limitation accepted:** expand-fallback ~20–33% (fallback-grade ads). Deferred to v2. No further v1 feature work.

### 2026-06-09 · Agent-ready refactor (no behavior change)
- **Reason:** Prepare for future agent migration without touching frozen behavior.
- **Alternatives:** Leave page-owned orchestration; full agent migration now (premature).
- **Outcome:** Added canonical `runCreativeDirector(brand, opts)` orchestrator, JSDoc I/O schemas, structured logging hook `setEngineLogger`, and injectable `campaignMemory`. `AdStudio.jsx` became a thin consumer. Build clean, behavior identical (critique off by default), dev server healthy.

### 2026-06-11 · STABILIZATION FINAL before freeze — move `image_prompt` to first field in the expand schema
- **Reason:** A read-only diagnostic probe (76 real DictaLM calls over the 54 stress-test concepts, replicating `expandConcept` exactly) **refuted the truncation hypothesis**: 0 truncations (`finish_reason=length` never fired; successes used avg 759 / max 1176 of 1500 tokens). The real dominant cause of expand-fallback was DictaLM **omitting the `image_prompt` key** when it sat near the end of a 10-field schema — a complete, well-formed JSON minus that one field (17% of attempts, `finish=stop`), plus occasional generation-degeneration into unterminated JSON (9%). A control arm with `image_prompt` first recovered 7/7 of the hardest failures.
- **Alternatives:** Raise `maxTokens` to 3072 (rejected — measured unnecessary, 0 truncations); relax `valid()` to drop the copy-gate (rejected by owner — out of scope); add a new narrow retry (rejected — existing retry already halves the rate); freeze as-is at 13% realized (viable, but the fix is a single-field reorder with measured 7/7 recovery).
- **Scope (strictly):** ONLY reordered `image_prompt` to be the first key in the expand schema string (`gemini.js`). `maxTokens` unchanged (1500), `valid()` unchanged, retry-once unchanged, pipeline/UI unchanged.
- **Outcome (measured, same 54 concepts, before → after):** realized fallback **13% → 6%**; the dominant cause `missing_image_prompt` **17% → 0%** (eliminated); truncation still 0; **7/7 previously-hard concepts fixed; zero image-quality regressions** (every concept that produced a usable `image_prompt` before still does, plus the 7). Build clean. **Documented residual (NOT fixed):** with `image_prompt` now reliably emitted first, the omission pressure shifts to the trailing `copy.headline`, so the unchanged strict `valid()` (which requires `copy.headline`) flags ~6% of concepts as fallback **even though they hold a fully valid `image_prompt`** — and since the engine discards DictaLM's copy and rewrites it with aya (`writeCopy`), those are copy-gate artifacts, not real image failures. A future, separately-approved change to `valid()` (image_prompt-only) would take realized fallback to ~0–2%; left for a deliberate v2 decision. **v1 remains frozen with this single stabilization applied.**

### 2026-06-19 · Post-freeze reliability pass (owner-directed) — Jake real memory + reader-clean analysis fix
- **Reason:** Owner testing surfaced two real defects. (a) Jake answered "what was my income/value before I changed it?" by **fabricating** a number (and a fake supporting client) — root cause: the app stored only current state, no history, so even a perfect model had nothing to read. (b) Site analysis failed on `elitcar.co.il` ("הניתוח נכשל") — measured cause: reader fetched fine (36,966 chars) but 14k of nav/URL/emoji noise derailed DictaLM into wrong-schema JSON (0/3 with `business`). Owner explicitly authorized proceeding (branch → measure → merge), outside the frozen *generation* pipeline.
- **Changes:** (1) **Audit-log memory** — `store.jsx` records an append-only `activity` trail (client add / value / status / income / expense) with timestamp + before→after, capped 200, backward-compatible; surfaced into Jake's context; Jake's history rule rewritten to answer FROM the log and decline only when absent. (2) **`fetchSiteText` cleaning** — strip markdown-link/URL/emoji noise (`cleanReaderText`) + trim to 6k. (Earlier same day: Jake history guardrail — stop inventing past numbers — merged separately.)
- **Measured:** Memory — live in-app a 2,500→3,500 value edit recorded `שווי X: 2,500 → 3,500`, and Jake reads it **4/4 correct** (was 0/4, pure fabrication). Reader-clean — elitcar raw 14k **0/3** valid → cleaned 6k **3/3** valid. Builds clean.
- **Scope:** Jake (`chatWithLocalModel`), store reducer/context, and `fetchSiteText`. The Creative Director **generation** pipeline (analyze→…→render core) remains frozen; `fetchSiteText` is the pre-analysis reader, fixed under explicit owner authorization with measurement.
- **Outcome:** Merged to `main` and pushed. Both defects resolved with measured evidence. KI-1 marked RESOLVED.

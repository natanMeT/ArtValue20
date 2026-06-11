# ArtValue — Known Issues (v1 frozen)

> Per PRODUCT_VISION: weaknesses are documented, not fixed without a deliberate
> decision. These are accepted limitations of frozen Creative Director Engine v1.

### KI-1 · Business analysis can fail on some real sites
- **Observed:** Live demo on `tishbi.com` (יקב תשבי) → "הניתוח נכשל — נסה אתר אחר". `aroma.co.il` worked on the first try.
- **Cause (likely):** Reader returns thin/JS-rendered content for some sites, or DictaLM returns an analysis JSON without a usable `business` field. Site-dependent + model variance.
- **Impact:** A client-demo URL might fail at the analysis step.
- **Mitigation (process, no code change):** Pre-test the exact client URL before a meeting; keep a known-good fallback URL ready.

### KI-2 · Full campaign render is long (~15–20 min)
- **Observed:** Text pipeline ~6–9 min + six FLUX renders ~9 min. Too long to watch live in a client meeting.
- **Mitigation:** For meetings, run analysis + strategy LIVE (fast, ~2 min, impressive) and reveal a PRE-RENDERED 6-poster campaign. Do not make a client watch the rendering.

### KI-3 · Occasional copy slips / off-brand drift (v1 copy limitation)
- **Observed (Aroma run):** one typo ("גלות" → "גלו"), one off-brand word ("פיצה" for a coffee chain), one duplicate CTA ("גלה את השלווה" ×2), one tonally-intense subline ("גם כשהעולם דועך לחור שחור").
- **Impact:** ~1–2 of 6 ads need a light human edit before showing a client.
- **Mitigation:** Human glance + pick the best 4 of 6 for the client.

### KI-4 · Fallback / expand-empty rate not surfaced in the UI
- The engine flags fallback-grade concepts internally but the UI does not show it (intentional — the user should never feel "AI generated an image"). To measure fallback for a given run, wire `setEngineLogger` (not done in the UI). Expand-fallback rate ~20–33% remains the documented v1 limitation.

### Note · Browser-automation input race (NOT a product issue)
- During automated UI driving, setting a React-controlled input + immediately clicking raced (state not yet applied). A human typing then clicking has no such race. Recorded only to avoid mistaking it for a product bug.

### KI-5 · Stress test (10 businesses, 2026-06-09) — NOT READY for autonomous production
- **Reliability under load:** the full unattended 60-render run HUNG after 1 business and died (~2 hrs lost). Completing required manual render batching + VRAM frees.
- **Fallback 37%** across 54 ads (67% for abstract/service businesses like a dentist → off-brand visuals, e.g. a volcano for a dental clinic).
- **Copy repetition (severe):** 6/9 businesses repeat the same opening word in 3–5 of 6 ads ("טעמים"×5, "עיצוב"×5, "נהיגה"×4). The similarity dedup runs on the idea (pre-expand) and never catches the repetition that emerges in aya's final copy (sim_rejected=0 across all 9).
- **Off-concept drift:** a construction company got "cleaning" ads.
- **Typography ~50% misspell** (IMPRA, LUXUR). Critic flagged a weakness in 94% of ads.
- **Verdict:** strong assisted/draft tool (pick best 2–3 of 6 + human copy edit); NOT ready for autonomous production. Full report: `D:\Downloads\ArtValue_StressTest\_REPORT.md`. v2 gaps: render-load reliability, lower fallback, copy-level dedup, concept fidelity, typography spelling.

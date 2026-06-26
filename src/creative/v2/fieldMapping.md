# Creative V2 ↔ Creative Director V1 — Bidirectional Field-Mapping Contract

This is the single, authoritative translation contract between the **canonical
Creative V2** schema (`types.ts` / `schema.js`) and the **frozen Creative
Director V1** (`src/lib/gemini.js` → `runCreativeDirector(brand, opts)`).

The adapter (`creativeDirectorAdapter.js`) is the **only** place this mapping is
implemented. The Context Builder produces canonical V2 **only** — it never speaks
V1. Every transform, default, and information-loss risk below is intentional and
tested (`__tests__/fieldMapping.test.js`, `__tests__/adapter.test.js`).

Rule: nothing is ever **silently** dropped, invented, inferred, renamed, merged,
split, or defaulted. Each row is an explicit decision.

---

## A. REQUEST PATH — Canonical V2 request → V1 `brand` input + `opts`

| Canonical V2 field | → V1 field | Transform | Default / fallback | Validation | Info-loss risk |
|---|---|---|---|---|---|
| `business.name` + `business.industry` | `brand.business` | `"{name} — {industry}"` | — (both required) | request validated first | none |
| `business.description` + `campaign.objective` + `campaign.offer` + product/service names | `brand.positioning` | deterministic one-line: `"{description||name} · {objectiveLabel}{; הצעה: offer}{; מוצרים: names}"` | `business.name` | — | product **price/margin** not included (see Gap 1) |
| `brand.audience[]` + `campaign.targetAudience` | `brand.audience` | join unique: `[...audience, targetAudience].join('; ')` | `campaign.targetAudience` | non-empty | none |
| `business.industry` | `brand.industry` | direct | `''` | — | none |
| `business.relevantInsights[]` + `brand.designRules[]` | `brand.differentiators` | concat, dedup | `[]` | — | none |
| `brand.tone[]` | `brand.tone` | direct | `[]` | — | none |
| `business.relevantInsights[]` | `brand.emotional_triggers` | direct copy | `[]` | — | overlaps differentiators (intentional) |
| `brand.colors[]` | `brand.palette` | keep `#hex`-like only | `[]` | hex filter | non-hex color names dropped (documented) |
| `brand.forbiddenStyles[]` | `brand.do_not` | direct | `[]` | — | none |
| `brand.tone[]` (scan) | `brand.luxury_level` | `tone` joined matches /יוקרה\|פרימיום\|luxury\|premium/ → `'premium'`, else → `'mid'` | `'mid'` (no luxury signal) | enum | coarse derivation (always derived; never a separate fallback) |
| — (no canonical source) | `brand.weaknesses` | — | `[]` | — | Gap 6 (V1 optional) |
| — (no canonical source) | `brand.trust_signals` | — | `[]` | — | Gap 6 (V1 optional) |
| — (no canonical source) | `brand.cards` | — | `[]` | — | Gap 6 (display-only; unused by runCreativeDirector) |
| `requestedConceptCount` (=3) | `opts.target` | direct | `3` | must be 3 | none |
| (adapter config) | `opts.brainstormSize` | execution config | `30` | — | V1 default pool (reliable concept yield through the kill-safe gate) |
| (adapter config) | `opts.maxRounds` | execution config | `2` | — | V1 default — a 2nd brainstorm round runs ONLY if the first yields too few |
| (adapter config) | `opts.withCritique` | execution config | `false` | — | risks[] therefore empty (Gap 4) |

## B. RESPONSE PATH — V1 output → Canonical V2 result

| V1 output field | → Canonical V2 field | Transform | Default / fallback | Validation | Info-loss risk |
|---|---|---|---|---|---|
| *(request)* `requestId` | `result.requestId` | carried from request (not from V1) | — | non-empty | none |
| `strategy.promise` \|\| `note.feel` | `strategy.businessProblem` | first non-empty(promise, note.feel) | `"קמפיין {objectiveLabel} עבור {request.business.name}"` (note: `request.business.name`, NOT V1 `brand.business`) | non-empty | approximation (documented) |
| *(request)* `campaign.objective` | `strategy.campaignObjective` | objective→Hebrew label | objective key | non-empty | sourced from request, not V1 |
| `strategy.triggers.psychological` | `strategy.audienceInsight` | direct | `campaign.targetAudience` | non-empty | none |
| `strategy.visual_direction` \|\| `strategy.dna` | `strategy.strategicDirection` | first non-empty(visual_direction, dna) | `'כיוון קריאטיבי ממוקד'` | non-empty | none |
| `strategy.core_message` | `strategy.keyMessage` | direct | `''` → fails RESULT_INVALID | non-empty | none |
| `concept.copy.headline` \|\| `concept.core_idea` \|\| `concept.idea` | `concept.name` | first non-empty, clip to 48 chars | `"קונספט {i+1}"` | non-empty | display label |
| `concept.marketing_principle` \|\| `concept.mechanism` | `concept.strategicAngle` | first non-empty(marketing_principle, mechanism) | `"מנגנון קריאטיבי {i+1}"` | non-empty | none |
| `concept.emotional_reaction` \|\| `concept.psychological_principle` | `concept.emotionalTone` | first non-empty(emotional_reaction, psychological_principle) | `'טון רגשי'` | non-empty | none |
| `concept.core_idea` \|\| `concept.idea` | `concept.coreIdea` | first non-empty(core_idea, idea) | `"רעיון מרכזי {i+1}"` | non-empty | none |
| `concept.copy.headline` \|\| `concept.core_idea` | `concept.headlineDirection` | first non-empty(copy.headline, core_idea) | `"כיוון כותרת {i+1}"` | non-empty | none |
| `concept.visual_metaphor` \|\| `concept.image_prompt` | `concept.visualDirection` | first non-empty(visual_metaphor, image_prompt), then clip to 280 | `"כיוון ויזואלי {i+1}"` | non-empty | full prompt trimmed for display |
| `concept.hero_object` \|\| `concept.word` | `concept.heroObject` | first non-empty(hero_object, word) | `'אובייקט מרכזי בקומפוזיציה'` | non-empty | Gap 3 default |
| `concept.layout` | `concept.compositionDirection` | join the non-empty of `[text_zone, "overlay "+overlay, "משקל "+font_weight]` with ` · ` (empty layout segments are dropped) | `'קומפוזיציה ממוקדת — מוקד יחיד'` | non-empty | layout summarized |
| *(request)* `brand.colors[]` | `concept.colorDirection` | from request (V1 has no per-concept color) | `[]` | string[] | Gap 3 (no per-concept color in V1) |
| `concept.psychological_principle` \|\| `concept.marketing_principle` | `concept.whyItWorks` | first non-empty(psychological_principle, marketing_principle) | `'מנגנון פסיכולוגי שמושך תשומת לב ועוצר גלילה'` | non-empty | approximation |
| `concept.critique?` (withCritique) | `concept.risks` | `[why_fail, weakest]` filtered | `[]` | string[] | Gap 4 (withCritique off → []) |
| `concept.total` | `concept.originalityScore` | `Number(total)\|\|0` | `0` | number | Gap 5 (composite, not per-axis) |
| `concept.total` | `concept.brandFitScore` | `Number(total)\|\|0` | `0` | number | Gap 5 (composite, not per-axis) |
| max-`total` concept | `recommendedConceptId` | id of highest-scoring concept | first concept id | string | none |
| — | `metadata.engineVersion` | constant `'creative-director-v1'` | — | non-empty | none |
| (adapter option) | `metadata.model` | passed by bridge (creative model name) | omitted | optional | none |
| (adapter timing) | `metadata.durationMs` | `Date.now()` around `runV1` | omitted | optional | non-deterministic (excluded from golden) |
| (adapter clock) | `metadata.createdAt` | ISO timestamp | — | non-empty | non-deterministic (excluded from golden) |

---

## C. EXPLICIT GAPS (every canonical-without-V1 and V1-without-canonical field)

1. **`business.products[].price` / `.margin`, `services[].price` / `.margin`** — V1
   generation is pricing-agnostic. **Decision: unsupported in V1 — preserved only
   in the V2 request** (names are summarized into `positioning`). Pricing is never
   sent to or used by V1.
2. **`campaign.channel`, `campaign.format`, `campaign.constraints`** — V1 produces
   channel/format-agnostic concept directions. **Decision: unsupported in V1 —
   preserved only in V2** (stored on the `CreativeCampaignRecord`, used by later
   render phases, not this slice).
3. **`concept.colorDirection`** — V1 has no per-concept color output. **Decision:
   documented default** from `request.brand.colors` (empty array if none).
4. **`concept.risks`** — V1 surfaces per-concept risks only when `withCritique:true`
   (off this slice for V1-parity). **Decision: documented default `[]`.**
5. **`concept.originalityScore` / `brandFitScore`** — V1 keeps only the composite
   `concept.total` after expand (per-axis scores from `scoreBrainstorm` are not
   retained on the concept). **Decision: documented info-loss** — both derived from
   `total`. A future V2 engine can expose true per-axis scores.
6. **V1 `brand.weaknesses` / `trust_signals` / `cards`** — no canonical source.
   **Decision: documented default `[]`** (V1-optional; `cards` is display-only and
   unused by `runCreativeDirector`).
7. **V1 `brand.positioning`** — no single canonical field. **Decision: deterministic
   transform** from description + objective + offer + product names.

Nothing outside this table crosses the boundary.

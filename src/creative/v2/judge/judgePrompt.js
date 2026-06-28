// ===================================================================
// judgePrompt — pure, deterministic builder for the Semantic Creative Judge prompt.
//
// OFFLINE-ONLY: produces a STRING prompt; it never calls a model and imports nothing
// from runtime. The prompt explicitly encodes ArtValue Creative Standard v1, lays out
// the brief/strategy/concept (+ sibling summaries for semantic near-duplicate
// detection), and demands STRICT JSON in the exact concept-level schema (no ranking,
// no recommendation, no selection — diagnostics only).
// ===================================================================
import { DIMENSION_KEYS, FLAG_KEYS, MAX_RATIONALE, JUDGE_VERSION } from './judgeSchema.js';

// ArtValue Creative Standard v1 — the rubric the judge must apply (encoded verbatim
// in spirit). Kept as data so a test can assert each rule is present in the prompt.
export const STANDARD_V1_RULES = Object.freeze([
  'Do not reject a strong idea only because execution or language is rough.',
  'Prefer original/strange concepts over clear-but-expected ones when they have visual/poster/campaign potential.',
  'Treat a broken or contradictory hero object as serious.',
  'Broken language lowers grade; if it makes the concept structurally incoherent, that is a serious failure.',
  '"best" means real client/poster/campaign potential, not merely the least-broken option.',
  'Separate idea strength from execution polish.',
  'Separate generic clarity from creative value.',
]);

const str = (v) => String(v == null ? '' : v).trim();

function conceptBlock(concept, { withId = true } = {}) {
  const c = concept || {};
  const lines = [];
  if (withId) lines.push(`conceptId: ${str(c.id)}`);
  lines.push(`name: ${str(c.name)}`);
  lines.push(`strategicAngle: ${str(c.strategicAngle)}`);
  lines.push(`coreIdea: ${str(c.coreIdea)}`);
  lines.push(`headlineDirection: ${str(c.headlineDirection)}`);
  lines.push(`visualDirection: ${str(c.visualDirection)}`);
  lines.push(`heroObject: ${str(c.heroObject)}`);
  lines.push(`whyItWorks: ${str(c.whyItWorks)}`);
  return lines.join('\n');
}

function briefBlock(request) {
  const r = request || {};
  const b = r.business || {}; const br = r.brand || {}; const c = r.campaign || {};
  const parts = [];
  if (str(b.name) || str(b.industry)) parts.push(`business: ${str(b.name)} — ${str(b.industry)}`);
  if (str(br.brandName)) parts.push(`brand: ${str(br.brandName)}`);
  if (Array.isArray(br.audience) && br.audience.length) parts.push(`audience: ${br.audience.join(', ')}`);
  if (Array.isArray(br.tone) && br.tone.length) parts.push(`tone: ${br.tone.join(', ')}`);
  if (str(c.objective)) parts.push(`objective: ${str(c.objective)}`);
  if (str(c.targetAudience)) parts.push(`targetAudience: ${str(c.targetAudience)}`);
  if (str(c.offer)) parts.push(`offer: ${str(c.offer)}`);
  if (str(c.channel) || str(c.format)) parts.push(`channel/format: ${str(c.channel)} ${str(c.format)}`);
  return parts.join('\n');
}

function strategyBlock(strategy) {
  const s = strategy || {};
  const parts = [];
  for (const k of ['businessProblem', 'campaignObjective', 'audienceInsight', 'strategicDirection', 'keyMessage']) {
    if (str(s[k])) parts.push(`${k}: ${str(s[k])}`);
  }
  return parts.join('\n');
}

// The exact JSON skeleton the judge must return (kept in sync with judgeSchema).
function schemaSkeleton() {
  const dims = DIMENSION_KEYS.map((k) => `"${k}": 0.0`).join(', ');
  const flags = FLAG_KEYS.map((k) => `"${k}": false`).join(', ');
  return [
    '{',
    '  "conceptId": "<id>",',
    `  "judgeVersion": "${JUDGE_VERSION}",`,
    '  "deterministic": false,',
    '  "ok": true,',
    `  "dimensions": { ${dims} },   // each 0..1`,
    `  "flags": { ${flags} },`,
    '  "nearDuplicateOf": [],   // sibling conceptIds judged to be the SAME idea (semantic)',
    `  "rationale": "<= ${MAX_RATIONALE} chars",`,
    '  "confidence": 0.0',
    '}',
  ].join('\n');
}

/**
 * Build the strict semantic-judge prompt for ONE concept.
 * @param {{ request?: object, strategy?: object, concept: object, siblings?: Array<{id,name,coreIdea}> }} args
 * @returns {string}
 */
export function buildJudgePrompt({ request, strategy, concept, siblings = [] } = {}) {
  const L = [];
  L.push('You are a senior creative director judging ONE advertising concept for ArtValue.');
  L.push('Apply "ArtValue Creative Standard v1" exactly:');
  STANDARD_V1_RULES.forEach((r, i) => L.push(`  ${i + 1}. ${r}`));
  L.push('');
  L.push('You produce SEMANTIC DIAGNOSTICS ONLY. You do NOT rank, do NOT pick a best,');
  L.push('and do NOT output any recommendation or selection — only describe this concept.');
  L.push('');
  const brief = briefBlock(request);
  if (brief) { L.push('## Brief'); L.push(brief); L.push(''); }
  const strat = strategyBlock(strategy);
  if (strat) { L.push('## Strategy'); L.push(strat); L.push(''); }
  L.push('## Concept under review');
  L.push(conceptBlock(concept));
  L.push('');
  if (Array.isArray(siblings) && siblings.length) {
    L.push('## Sibling concepts (for SEMANTIC near-duplicate detection only)');
    siblings.forEach((s) => L.push(`- ${str(s.id)}: ${str(s.name)} — ${str(s.coreIdea)}`));
    L.push('Set nearDuplicateOf to the sibling conceptId(s) expressing the SAME idea (paraphrases count), else [].');
    L.push('');
  }
  L.push('## Score calibration: use the FULL 0.0-1.0 range; do NOT default to 0.8+');
  L.push('- 0.0-0.2 = broken / unusable / deeply off-brief.');
  L.push('- 0.3-0.5 = weak / unclear / risky.');
  L.push('- 0.6-0.7 = acceptable but limited.');
  L.push('- 0.8-0.9 = strong.');
  L.push('- 1.0 = rare, exceptional.');
  L.push('Most concepts should NOT receive 0.8+ unless clearly justified. Reserve high scores and score honestly across the full range.');
  L.push('');
  L.push('## Dimensions (score each 0..1 per the calibration above, higher = better)');
  L.push('- briefRelevance: on-brief, no wrong-domain contamination.');
  L.push('- heroCoherence: the hero object truly matches the depicted idea.');
  L.push('- meaningCoherence: the concept makes sense (fluent AND coherent, not nonsense).');
  L.push('- originality: fresh/strange vs clear-but-expected (do NOT inflate — most concepts are conventional).');
  L.push('- posterPotential: real poster/campaign pull (NOT merely least-broken).');
  L.push('- clientUsability: safe/clear to hand a client (separate from creative value).');
  L.push('');
  L.push('## Flags (boolean) - apply each STRICTLY; when unsure, leave a flag false');
  L.push('- semanticHeroMismatch: fire ONLY when the hero object clearly contradicts the brief, metaphor, product, audience, or intended meaning. Do NOT fire for minor imperfection, stylistic oddity, or a metaphor that remains explainable. Treat as a SERIOUS negative diagnostic, not a soft concern.');
  L.push('- incoherentMeaning: fire when the concept meaning, promise, visual logic, or cause-effect relationship is internally unclear or nonsensical. A fluent sentence can still be incoherent. Do NOT require total unreadability.');
  L.push('- offBriefContamination: fire when the concept appears to solve a DIFFERENT business problem, or uses the wrong industry logic, wrong audience, or wrong product category, or imports unrelated brief elements. Do NOT fire for harmless supporting details.');
  L.push('- genericButUsable: fire when the concept is clear and client-safe but expected, conventional, category-standard, or not creatively distinctive. Do NOT mark the same concept as BOTH genericButUsable AND strangeButStrong unless there is an explicit reason.');
  L.push('- strangeButStrong: fire ONLY when the concept is BOTH genuinely non-obvious AND poster/campaign-worthy. Do NOT fire merely because the wording is unusual. Do NOT fire on weak/reject concepts unless the core idea is clearly strong but execution is rough.');
  L.push('- roughButRescuable: fire ONLY when the core idea is strong/usable but execution, language, or framing is flawed. Do NOT fire when the idea itself is incoherent, off-brief, generic, or reject-level.');
  L.push('');
  L.push(`Output STRICT JSON ONLY (no preamble, no markdown), exactly this shape (conceptId = "${str(concept && concept.id)}"):`);
  L.push(schemaSkeleton());
  return L.join('\n');
}

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
  L.push('## Dimensions (score 0..1, higher = better)');
  L.push('- briefRelevance: on-brief, no wrong-domain contamination.');
  L.push('- heroCoherence: the hero object truly matches the depicted idea.');
  L.push('- meaningCoherence: the concept makes sense (fluent AND coherent, not nonsense).');
  L.push('- originality: fresh/strange vs clear-but-expected.');
  L.push('- posterPotential: real poster/campaign pull (NOT merely least-broken).');
  L.push('- clientUsability: safe/clear to hand a client (separate from creative value).');
  L.push('');
  L.push('## Flags (boolean)');
  L.push('- semanticHeroMismatch: hero object does not match the concept it depicts.');
  L.push('- incoherentMeaning: fluent grammar but the meaning is broken/contradictory.');
  L.push('- offBriefContamination: content bleeds in from the wrong domain/brief.');
  L.push('- genericButUsable: clear and usable but generic (clarity ≠ creative value).');
  L.push('- strangeButStrong: original/unusual with genuine poster/campaign potential.');
  L.push('- roughButRescuable: idea is strong but execution/language is rough — do NOT treat as reject.');
  L.push('');
  L.push(`Output STRICT JSON ONLY (no preamble, no markdown), exactly this shape (conceptId = "${str(concept && concept.id)}"):`);
  L.push(schemaSkeleton());
  return L.join('\n');
}

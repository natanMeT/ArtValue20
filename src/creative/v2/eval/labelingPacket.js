// ===================================================================
// Blind human-labeling packet generator (pure). Turns a REAL candidate snapshot
// into anti-bias labeling packets: each case shows the brief + its concepts in a
// deterministically RANDOMIZED order under neutral display labels (A/B/C), with
// blank judgment fields and NONE of V1's or the critic's decisions. The reversible
// A/B/C→conceptId mapping and all V1/critic outputs live ONLY in a SEPARATE hidden
// comparison key, to be opened AFTER labels are recorded.
//
// Sampling design (per approval): every (brief, sample) is its own case
// (10 briefs × 3 samples = 30 cases), split into 3 packets of 10 BY SAMPLE INDEX
// so each packet covers all 10 briefs once. Concepts from different samples are
// never merged. No model, no I/O here.
// ===================================================================
import { BRIEF_BY_ID } from './briefs.js';

const DISPLAY_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];
const CONCEPT_FIELDS = ['name', 'strategicAngle', 'coreIdea', 'headlineDirection', 'visualDirection', 'heroObject', 'whyItWorks'];

// Deterministic FNV-1a hash → reproducible per-case shuffle (no Math.random).
function fnv1a(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function seededOrder(n, seed) {
  return Array.from({ length: n }, (_, i) => i)
    .map((i) => ({ i, k: fnv1a(`${seed}:${i}`) }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map((x) => x.i);
}

/** Flatten a candidate file into ordered cases [{caseId, briefId, sampleIndex, request, result}]. */
export function buildCases(candidate) {
  const cases = [];
  for (const [briefId, entry] of Object.entries(candidate.snapshots)) {
    (entry.samples || []).forEach((s, k) => {
      cases.push({ caseId: s.sampleId, briefId, sampleIndex: k, request: s.request, result: s.result });
    });
  }
  return cases;
}

/**
 * Build blind packets + the hidden comparison key.
 * @param {object} candidate the real candidate snapshot file
 * @param {Record<string, object>} critiquesByCaseId caseId → critique (for the hidden key only)
 * @param {{ packetSize?: number }} [opts]
 */
export function buildPacketsAndKey(candidate, critiquesByCaseId = {}, opts = {}) {
  const cases = buildCases(candidate);
  const sampleCount = candidate.meta?.sampleCount || (cases[0] ? cases.filter((c) => c.briefId === cases[0].briefId).length : 1);
  const blindCases = [];
  const key = [];

  for (const c of cases) {
    const concepts = c.result.concepts;
    const order = seededOrder(concepts.length, c.caseId); // reversible permutation
    const display = order.map((origIdx, di) => ({ label: DISPLAY_LABELS[di], concept: concepts[origIdx] }));
    const mapping = Object.fromEntries(display.map((d) => [d.label, d.concept.id]));
    const brief = BRIEF_BY_ID[c.briefId] || {};

    // BLIND case — neutral labels, brief context, blank judgment fields. No V1/critic.
    blindCases.push({
      caseId: c.caseId,
      briefId: c.briefId,
      category: brief.category || '',
      need: brief.needText || '',
      concepts: display.map((d) => ({ label: d.label, ...Object.fromEntries(CONCEPT_FIELDS.map((f) => [f, d.concept[f]])) })),
      judgment: {
        labels: Object.fromEntries(display.map((d) => [d.label, ''])), // best|acceptable|weak|reject
        preferredOrder: [], mustNotReject: [], shouldDemote: [], shouldReject: [],
        strongUnusual: [], nearDupPairs: [], generic: [], notes: '',
      },
    });

    // HIDDEN key — reversible mapping + every V1/critic decision (opened AFTER labeling).
    const crit = critiquesByCaseId[c.caseId] || null;
    key.push({
      caseId: c.caseId,
      displayToConceptId: mapping,
      v1RecommendedConceptId: c.result.recommendedConceptId,
      critic: crit ? {
        recommendedConceptId: crit.recommendedConceptId,
        ranking: crit.ranking,
        rejected: crit.rejected,
        demoted: (crit.evaluations || []).filter((e) => e.demoted).map((e) => e.conceptId),
        protected: (crit.evaluations || []).filter((e) => e.protectedAsStrongUnusual).map((e) => e.conceptId),
        composites: Object.fromEntries((crit.evaluations || []).map((e) => [e.conceptId, Math.round(e.composite * 1000) / 1000])),
      } : null,
    });
  }

  const packetCount = sampleCount;
  const packets = Array.from({ length: packetCount }, (_, si) => ({
    packetId: `packet-sample${si}`,
    sampleIndex: si,
    cases: blindCases.filter((b) => b.caseId.endsWith(`#sample${si}`)),
  })).filter((p) => p.cases.length);

  return { packets, key, totals: { briefs: Object.keys(candidate.snapshots).length, sampleCount, cases: cases.length } };
}

// ---- markdown renderers ----
export function renderPacketMarkdown(packet, meta = {}) {
  const L = [];
  L.push(`# Human Labeling Packet — ${packet.packetId} (${packet.cases.length} cases)`);
  L.push('');
  const completion = meta.completion || 'UNKNOWN';
  L.push(`**Status: PROVISIONAL** — candidate completion = \`${completion}\`${meta.coverage ? ` (${meta.coverage})` : ''}.`);
  L.push('Labels recorded here become the authoritative golden set ONLY after full coverage (30/30) and review.');
  if (completion !== 'COMPLETED') L.push('> ⚠️ PARTIAL dataset — for inspection only; not eligible to become the authoritative golden set yet.');
  L.push('');
  L.push('BLIND review. For each concept choose **best / acceptable / weak / reject**, then fill the per-case fields.');
  L.push('Concept order is randomized and neutral (A/B/C). Do not look up V1 or the critic — judge on merit only.');
  L.push('');
  packet.cases.forEach((c, idx) => {
    L.push(`## ${idx + 1}. Case \`${c.caseId}\` — ${c.category}`);
    L.push(`**Brief:** ${c.need}`);
    L.push('');
    c.concepts.forEach((cc) => {
      L.push(`### Concept ${cc.label}`);
      L.push(`- name: ${cc.name}`);
      L.push(`- strategic angle: ${cc.strategicAngle}`);
      L.push(`- core idea: ${cc.coreIdea}`);
      L.push(`- headline direction: ${cc.headlineDirection}`);
      L.push(`- visual direction: ${cc.visualDirection}`);
      L.push(`- hero object: ${cc.heroObject}`);
      L.push(`- why it works: ${cc.whyItWorks}`);
      L.push(`- **judgment (best/acceptable/weak/reject):** ______`);
      L.push('');
    });
    L.push('Per-case judgment:');
    L.push('- preferred order (e.g. B>A>C): ______');
    L.push('- must not reject: ______');
    L.push('- should demote: ______');
    L.push('- should reject: ______');
    L.push('- strong unusual: ______');
    L.push('- near-duplicate pairs: ______');
    L.push('- generic concepts: ______');
    L.push('- notes: ______');
    L.push('');
    L.push('---');
    L.push('');
  });
  return L.join('\n');
}

export function renderKeyMarkdown(key, meta = {}) {
  const L = [];
  L.push('# Hidden Comparison Key — DO NOT OPEN UNTIL LABELS ARE RECORDED');
  L.push('');
  L.push(`source candidate: \`${meta.candidatePath || ''}\` · model: \`${meta.model || ''}\` · criticVersion: \`${meta.criticVersion || ''}\``);
  L.push('');
  key.forEach((k) => {
    L.push(`## \`${k.caseId}\``);
    L.push(`- display → conceptId: ${JSON.stringify(k.displayToConceptId)}`);
    L.push(`- V1 recommended: ${k.v1RecommendedConceptId}`);
    if (k.critic) {
      L.push(`- critic recommended: ${k.critic.recommendedConceptId}`);
      L.push(`- critic ranking: ${k.critic.ranking.join('>')}`);
      L.push(`- rejected: ${k.critic.rejected.map((r) => r.conceptId).join(',') || '—'} · demoted: ${k.critic.demoted.join(',') || '—'} · protected: ${k.critic.protected.join(',') || '—'}`);
      L.push(`- composites: ${JSON.stringify(k.critic.composites)}`);
    }
    L.push('');
  });
  return L.join('\n');
}

/** Blank machine-readable label template (human fills; later converts to goldens). */
export function buildBlankLabelTemplate(packets) {
  const out = {};
  packets.forEach((p) => p.cases.forEach((c) => { out[c.caseId] = c.judgment; }));
  return out;
}

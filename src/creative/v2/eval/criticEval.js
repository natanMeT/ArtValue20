// ===================================================================
// Pure critic-evaluation engine — turns (request, V1 result, critic critique,
// human golden) into per-brief metrics, an aggregate, a PASS/FAIL verdict, and a
// markdown report. No model, no I/O, no app-runtime imports. Deterministic: same
// inputs → identical numbers and report. This module produces EVIDENCE; it never
// asserts the critic is good.
//
// Baseline policy (this slice): the model seam is OFF, so for deterministic
// snapshot replay degradedRunRate must be 0. Rig-unavailability is NOT counted
// here — it is reported upstream as status INCOMPLETE / LOCAL_RIG_UNAVAILABLE.
// ===================================================================
import { LABEL_RANK } from './goldenSchema.js';

export const CRITIC_EVAL_VERSION = 'critic-eval-v1';

// Calibration bars are DIAGNOSTIC only (they never flip PASS/FAIL). Hard safety
// gates and the value gate are exact (0/1 and delta ≥ 0) — see verdict().
export const EVAL_THRESHOLDS = Object.freeze({
  calibration: { genericDemotion: 0.7, nearDup: 0.7 },
});

const r3 = (x) => (x == null || Number.isNaN(x) ? null : Math.round(x * 1000) / 1000);
const pos = (order, id) => order.indexOf(id);
const labelOf = (golden, id) => golden.labels[id];
const rankOf = (golden, id) => LABEL_RANK[labelOf(golden, id)];

/**
 * Per-brief raw metrics. Reads the V1 result, the critic critique, and the golden.
 * Returns counts/flags (not rates) so aggregate() can pool correctly.
 */
export function evaluateBrief({ result, critique, golden }) {
  const conceptIds = result.concepts.map((c) => c.id);
  const bestSet = new Set(conceptIds.filter((id) => labelOf(golden, id) === 'best'));
  const v1Order = conceptIds.slice();                 // original V1 order
  const criticRanking = Array.isArray(critique.ranking) && critique.ranking.length ? critique.ranking : v1Order;
  const v1Rec = result.recommendedConceptId;
  const criticRec = critique.recommendedConceptId;
  const rejectedSet = new Set((critique.rejected || []).map((r) => r.conceptId));
  const demotedSet = new Set((critique.evaluations || []).filter((e) => e.demoted).map((e) => e.conceptId));

  // Top-1 (critic vs V1) against the human 'best' set.
  const v1Top1Hit = bestSet.has(v1Rec) ? 1 : 0;
  const criticTop1Hit = bestSet.has(criticRec) ? 1 : 0;

  // Pairwise ranking concordance over comparable pairs (differing golden labels).
  let comparablePairs = 0; let v1Concordant = 0; let criticConcordant = 0;
  for (let i = 0; i < conceptIds.length; i += 1) {
    for (let j = i + 1; j < conceptIds.length; j += 1) {
      const a = conceptIds[i]; const b = conceptIds[j];
      const ra = rankOf(golden, a); const rb = rankOf(golden, b);
      if (ra === rb) continue;
      comparablePairs += 1;
      const higher = ra > rb ? a : b; const lower = ra > rb ? b : a;
      if (pos(v1Order, higher) < pos(v1Order, lower)) v1Concordant += 1;
      if (pos(criticRanking, higher) < pos(criticRanking, lower)) criticConcordant += 1;
    }
  }

  // False-reject: protected ids = best ∪ acceptable ∪ mustNotReject.
  const protectedIds = [...new Set(
    conceptIds.filter((id) => ['best', 'acceptable'].includes(labelOf(golden, id))).concat(golden.mustNotReject || []),
  )];
  const falseRejectViolations = protectedIds.filter((id) => rejectedSet.has(id)).length;
  const falseRejectOfBest = [...bestSet].filter((id) => rejectedSet.has(id)).length;

  // False-promote: critic recommended a concept the human rated weak/reject.
  const falsePromote = ['weak', 'reject'].includes(labelOf(golden, criticRec)) ? 1 : 0;

  // Near-duplicate handling: keep the stronger, drop/demote the weaker.
  const dupPairs = golden.nearDupPairs || [];
  let dupTotal = 0; let dupSuccess = 0;
  dupPairs.forEach(([x, y]) => {
    dupTotal += 1;
    const weaker = rankOf(golden, x) <= rankOf(golden, y) ? x : y;
    const stronger = weaker === x ? y : x;
    if ((rejectedSet.has(weaker) || demotedSet.has(weaker)) && !rejectedSet.has(stronger)) dupSuccess += 1;
  });

  // Strong-unusual preservation (must not be rejected).
  const su = golden.strongUnusual || [];
  const suPreserved = su.filter((id) => !rejectedSet.has(id)).length;

  // Generic demotion accuracy (rejected OR demoted).
  const gen = golden.generic || [];
  const genHandled = gen.filter((id) => rejectedSet.has(id) || demotedSet.has(id)).length;

  return {
    briefId: golden.briefId,
    conceptIds,
    v1Order,
    criticRanking,
    v1Rec,
    criticRec,
    rejected: [...rejectedSet],
    demoted: [...demotedSet],
    ok: critique.ok === true,
    // counts
    v1Top1Hit,
    criticTop1Hit,
    comparablePairs,
    v1Concordant,
    criticConcordant,
    protectedCount: protectedIds.length,
    falseRejectViolations,
    falseRejectOfBest,
    falsePromote,
    dupTotal,
    dupSuccess,
    suTotal: su.length,
    suPreserved,
    genTotal: gen.length,
    genHandled,
    degraded: critique.ok === true && critique.degraded === true ? 1 : 0,
    changed: criticRec !== v1Rec ? 1 : 0,
  };
}

const sum = (arr, k) => arr.reduce((a, b) => a + b[k], 0);
const ratio = (n, d) => (d > 0 ? n / d : null); // null = not applicable

/** Pool per-brief rows into dataset-level metrics. */
export function aggregate(rows) {
  const n = rows.length;
  const okRows = rows.filter((r) => r.ok);
  const top1V1 = ratio(sum(rows, 'v1Top1Hit'), n);
  const top1Critic = ratio(sum(rows, 'criticTop1Hit'), n);
  const pairV1 = ratio(sum(rows, 'v1Concordant'), sum(rows, 'comparablePairs'));
  const pairCritic = ratio(sum(rows, 'criticConcordant'), sum(rows, 'comparablePairs'));
  const suPreservation = ratio(sum(rows, 'suPreserved'), sum(rows, 'suTotal'));
  return {
    datasetSize: n,
    top1: { v1: top1V1, critic: top1Critic, delta: (top1Critic ?? 0) - (top1V1 ?? 0) },
    pairwise: { v1: pairV1, critic: pairCritic, delta: (pairCritic ?? 0) - (pairV1 ?? 0) },
    falseRejectRate: ratio(sum(rows, 'falseRejectViolations'), sum(rows, 'protectedCount')),
    falseRejectOfBestCount: sum(rows, 'falseRejectOfBest'),
    falsePromoteRate: ratio(sum(rows, 'falsePromote'), n),
    nearDupAccuracy: ratio(sum(rows, 'dupSuccess'), sum(rows, 'dupTotal')),
    strongUnusualPreservation: suPreservation === null ? 1 : suPreservation, // vacuously preserved if none labeled
    strongUnusualLabeled: sum(rows, 'suTotal'),
    genericDemotionAccuracy: ratio(sum(rows, 'genHandled'), sum(rows, 'genTotal')),
    coverage: ratio(sum(rows, 'ok'), n),
    degradedRunRate: ratio(sum(okRows, 'degraded'), okRows.length),
    changeRate: ratio(sum(rows, 'changed'), n),
  };
}

/**
 * PASS / FAIL from the aggregate. (INCOMPLETE is decided upstream by the runner
 * for rig-unavailability; pass that via opts.incomplete to short-circuit.)
 */
export function verdict(agg, opts = {}) {
  if (opts.incomplete) {
    return { status: 'INCOMPLETE', reason: opts.reason || 'LOCAL_RIG_UNAVAILABLE', hardGates: null, valueGate: null, calibration: null };
  }
  const hardGates = {
    falseRejectOfBestZero: agg.falseRejectOfBestCount === 0,
    strongUnusualPreserved: agg.strongUnusualPreservation === 1,
    fullCoverage: agg.coverage === 1,
    zeroDegraded: agg.degradedRunRate === 0 || agg.degradedRunRate === null,
  };
  const valueGate = {
    top1NoWorse: agg.top1.delta >= 0,
    pairwiseNoWorse: agg.pairwise.delta >= 0,
  };
  const hardOk = Object.values(hardGates).every(Boolean);
  const valueOk = Object.values(valueGate).every(Boolean);
  const calibration = {
    genericDemotionOk: agg.genericDemotionAccuracy == null ? null : agg.genericDemotionAccuracy >= EVAL_THRESHOLDS.calibration.genericDemotion,
    nearDupOk: agg.nearDupAccuracy == null ? null : agg.nearDupAccuracy >= EVAL_THRESHOLDS.calibration.nearDup,
  };
  return { status: hardOk && valueOk ? 'PASS' : 'FAIL', hardGates, valueGate, calibration };
}

const pct = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
const signed = (x) => (x == null ? 'n/a' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}pp`);

/**
 * Render a human-reviewable markdown report. Pure (returns a string).
 *
 * When `meta.goldenValidity === 'mismatched'` (a fresh real candidate whose
 * concepts are NOT the ones the committed goldens were authored against), every
 * golden-DEPENDENT metric is rendered `n/a — re-label required` so the report can
 * never present a misleading PASS/FAIL. Structural metrics (coverage, degraded,
 * change-rate) and per-brief rankings/reject/demote remain valid and are shown.
 */
export function renderReport({ meta, rows, agg, vrd }) {
  const mismatched = meta.goldenValidity === 'mismatched';
  const gd = (s) => (mismatched ? 'n/a — re-label required' : s); // golden-dependent value guard
  const L = [];
  L.push(`# Critic Evaluation Report — ${vrd.status}`);
  L.push('');
  L.push(`- mode: \`${meta.mode}\` · source: \`${meta.source}\``);
  if (meta.reason) L.push(`- reason: \`${meta.reason}\``);
  L.push(`- model: \`${meta.model || 'none (deterministic replay)'}\` · samples/brief: ${meta.sampleCount} · dataset size: ${agg.datasetSize}`);
  L.push(`- seam: \`OFF\` (deterministic baseline) · eval: \`${CRITIC_EVAL_VERSION}\` · createdAt: ${meta.createdAt}`);
  if (mismatched) {
    L.push('');
    L.push('> ⚠️ DESCRIPTIVE ONLY. The committed goldens are pinned to the baseline snapshot; this');
    L.push('> candidate produced different concepts, so golden-dependent metrics are `n/a` until the');
    L.push('> candidate is promoted and re-labeled. Structural metrics below are valid as-is.');
  }
  if (meta.reliability) {
    const r = meta.reliability;
    L.push('');
    L.push(`## Completion & V1 generation reliability — ${meta.completion || r.status}`);
    L.push('(separate from critic quality; retries are NOT evidence of better creative quality)');
    L.push('| metric | value |');
    L.push('|---|---|');
    L.push(`| required cases | ${r.requiredCases} |`);
    L.push(`| successful cases | ${r.successfulCases} |`);
    L.push(`| permanently failed cases | ${r.permanentlyFailedCases} |`);
    L.push(`| total generation attempts | ${r.totalGenerationAttempts} |`);
    L.push(`| first-attempt failures | ${r.firstAttemptFailures} |`);
    L.push(`| recovered-by-retry | ${r.recoveredByRetryCases} |`);
    L.push(`| unrecovered | ${r.unrecoveredCases} |`);
    L.push(`| first-attempt success rate | ${pct(r.firstAttemptSuccessRate)} |`);
    L.push(`| final success rate | ${pct(r.finalSuccessRate)} |`);
    L.push(`| error classes | ${JSON.stringify(r.errorClasses)} |`);
    if (r.failedSampleIds && r.failedSampleIds.length) L.push(`| failed cases | ${r.failedSampleIds.join(', ')} |`);
  }
  L.push('');
  L.push('## Summary (V1 vs Critic)');
  L.push('| metric | V1 | Critic | delta |');
  L.push('|---|---|---|---|');
  L.push(`| Top-1 agreement | ${gd(pct(agg.top1.v1))} | ${gd(pct(agg.top1.critic))} | ${gd(signed(agg.top1.delta))} |`);
  L.push(`| Pairwise agreement | ${gd(pct(agg.pairwise.v1))} | ${gd(pct(agg.pairwise.critic))} | ${gd(signed(agg.pairwise.delta))} |`);
  L.push('');
  L.push('## Safety & diagnostic metrics');
  L.push('| metric | value | valid |');
  L.push('|---|---|---|');
  L.push(`| false-reject rate | ${gd(pct(agg.falseRejectRate))} | golden |`);
  L.push(`| false-reject-of-best (count) | ${gd(String(agg.falseRejectOfBestCount))} | golden |`);
  L.push(`| strong-unusual preservation | ${gd(`${pct(agg.strongUnusualPreservation)} (${agg.strongUnusualLabeled} labeled)`)} | golden |`);
  L.push(`| generic-demotion accuracy | ${gd(pct(agg.genericDemotionAccuracy))} | golden |`);
  L.push(`| near-duplicate detection accuracy | ${gd(pct(agg.nearDupAccuracy))} | golden |`);
  L.push(`| false-promote rate | ${gd(pct(agg.falsePromoteRate))} | golden |`);
  L.push(`| coverage | ${pct(agg.coverage)} | structural |`);
  L.push(`| degraded-run rate | ${pct(agg.degradedRunRate)} | structural |`);
  L.push(`| V1→critic recommendation change rate | ${pct(agg.changeRate)} | structural |`);
  L.push('');
  L.push('## Per-brief diagnostics');
  L.push('| brief | V1 order | critic ranking | V1 rec | critic rec | rejected | demoted | top1 V1/C | degraded |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  rows.forEach((r) => {
    const top1 = mismatched ? 'n/a' : `${r.v1Top1Hit}/${r.criticTop1Hit}`;
    L.push(`| ${r.briefId} | ${r.v1Order.join('>')} | ${r.criticRanking.join('>')} | ${r.v1Rec} | ${r.criticRec} | ${r.rejected.join(',') || '—'} | ${r.demoted.join(',') || '—'} | ${top1} | ${r.degraded ? 'yes' : 'no'} |`);
  });
  L.push('');
  L.push('## Verdict');
  if (vrd.status === 'INCOMPLETE') {
    L.push(`**INCOMPLETE** — ${vrd.reason}. No critic quality conclusion drawn.`);
  } else {
    L.push(`**${vrd.status}**`);
    L.push(`- hard safety gates: ${JSON.stringify(vrd.hardGates)}`);
    L.push(`- value gate (critic ≥ V1): ${JSON.stringify(vrd.valueGate)}`);
    L.push(`- calibration (diagnostic): ${JSON.stringify(vrd.calibration)}`);
  }
  return L.join('\n');
}

/** End-to-end pure run over an array of { request, result, critique, golden }. */
export function runEvaluation(items, meta, opts = {}) {
  const rows = items.map((it) => evaluateBrief(it));
  const agg = aggregate(rows);
  // A candidate whose goldens don't match (real, un-relabeled) can never yield a
  // golden-based PASS/FAIL — its verdict is INCOMPLETE / CANDIDATE_REQUIRES_RELABEL.
  const vrdOpts = meta.goldenValidity === 'mismatched'
    ? { incomplete: true, reason: 'CANDIDATE_REQUIRES_RELABEL', ...opts }
    : opts;
  const vrd = verdict(agg, vrdOpts);
  const report = renderReport({ meta, rows, agg, vrd });
  return { rows, agg, vrd, report };
}

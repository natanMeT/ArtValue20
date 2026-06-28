// ===================================================================
// judgeEval — PURE, offline metrics engine for the Semantic Creative Judge.
//
// Scores validated judge outputs against human labels (in conceptId space — the
// blind A/B/C → conceptId de-blinding is done UPSTREAM by the offline runner, never
// here). No model, no I/O, no React. Deterministic; never throws.
//
// HARD INVARIANT: there is NO Top-1 here (no selector exists yet). `top1` is always
// null. This engine measures SIGNAL ALIGNMENT only:
//   • flag recall/precision vs human sets (strangeButStrong↔strongUnusual,
//     genericButUsable↔generic)
//   • severe-negative-flag false positives vs mustNotReject
//   • roughButRescuable precision (should not land on human 'reject')
//   • posterPotential / clientUsability SEPARATION (best/acceptable vs weak/reject)
//   • nearDuplicateOf vs human nearDupPairs (pair recall/precision)
//   • no-best handling (cases with no best are kept; excluded from any Top-1)
//   • degraded / parse-failure count
// ===================================================================

const SEVERE_NEG_FLAGS = Object.freeze(['semanticHeroMismatch', 'incoherentMeaning', 'offBriefContamination']);
const isBestAcc = (lab) => lab === 'best' || lab === 'acceptable';
const isWeakReject = (lab) => lab === 'weak' || lab === 'reject';
const ratio = (num, den) => (den ? Math.round((num / den) * 1000) / 1000 : null);
const mean = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000 : null);
const pairKey = (a, b) => [String(a), String(b)].sort().join('::');

function validJudge(item) {
  // conceptId -> validated judge output (ok===true only)
  const out = {};
  for (const [id, j] of Object.entries(item.judge || {})) if (j && j.ok === true) out[id] = j;
  return out;
}

// micro-averaged flag-vs-set recall/precision across all items
function flagAlignment(items, flagName, setName) {
  let tp = 0; let fp = 0; let fn = 0;
  for (const item of items) {
    const valid = validJudge(item);
    const truth = new Set((item.sets && item.sets[setName]) || []);
    const validIds = new Set(Object.keys(valid));
    const predicted = new Set(Object.keys(valid).filter((id) => valid[id].flags[flagName] === true));
    for (const id of predicted) (truth.has(id) ? (tp += 1) : (fp += 1));
    for (const id of truth) if (validIds.has(id) && !predicted.has(id)) fn += 1; // FN only over judged concepts
  }
  return { tp, fp, fn, recall: ratio(tp, tp + fn), precision: ratio(tp, tp + fp) };
}

function negativeFlagConcentration(items, flagName) {
  let total = 0; let onWeakReject = 0; let onBestAcceptable = 0;
  for (const item of items) {
    const valid = validJudge(item);
    for (const [id, j] of Object.entries(valid)) {
      if (j.flags[flagName] !== true) continue;
      total += 1;
      const lab = (item.labelByConceptId || {})[id];
      if (isWeakReject(lab)) onWeakReject += 1; else if (isBestAcc(lab)) onBestAcceptable += 1;
    }
  }
  return { total, onWeakReject, onBestAcceptable };
}

function mustNotRejectFP(items) {
  let withSevere = 0; let total = 0;
  for (const item of items) {
    const valid = validJudge(item);
    for (const id of (item.sets && item.sets.mustNotReject) || []) {
      const j = valid[id]; if (!j) continue; // only judged concepts
      total += 1;
      if (SEVERE_NEG_FLAGS.some((f) => j.flags[f] === true)) withSevere += 1;
    }
  }
  return { withSevereNegFlag: withSevere, total, rate: ratio(withSevere, total) };
}

function roughButRescuablePrecision(items) {
  let onReject = 0; let total = 0;
  for (const item of items) {
    const valid = validJudge(item);
    for (const [id, j] of Object.entries(valid)) {
      if (j.flags.roughButRescuable !== true) continue;
      total += 1;
      if ((item.labelByConceptId || {})[id] === 'reject') onReject += 1;
    }
  }
  return { onReject, total, rate: ratio(onReject, total) };
}

function separation(items, dim) {
  const bestAcc = []; const weakReject = [];
  for (const item of items) {
    const valid = validJudge(item);
    for (const [id, j] of Object.entries(valid)) {
      const lab = (item.labelByConceptId || {})[id];
      const v = j.dimensions[dim];
      if (!Number.isFinite(v)) continue;
      if (isBestAcc(lab)) bestAcc.push(v); else if (isWeakReject(lab)) weakReject.push(v);
    }
  }
  const m1 = mean(bestAcc); const m2 = mean(weakReject);
  return { meanBestAcc: m1, meanWeakReject: m2, gap: (m1 == null || m2 == null) ? null : Math.round((m1 - m2) * 1000) / 1000, nBestAcc: bestAcc.length, nWeakReject: weakReject.length };
}

function nearDuplicate(items) {
  let tp = 0; let fp = 0; let fn = 0;
  for (const item of items) {
    const valid = validJudge(item);
    const present = new Set(Object.keys(item.judge || {}));
    const predicted = new Set();
    for (const [id, j] of Object.entries(valid)) {
      for (const other of j.nearDuplicateOf || []) {
        if (present.has(other) && other !== id) predicted.add(pairKey(id, other));
      }
    }
    const human = new Set(((item.sets && item.sets.nearDupPairs) || []).map(([a, b]) => pairKey(a, b)));
    for (const k of predicted) (human.has(k) ? (tp += 1) : (fp += 1));
    for (const k of human) if (!predicted.has(k)) fn += 1;
  }
  return { tpPairs: tp, fpPairs: fp, fnPairs: fn, pairRecall: ratio(tp, tp + fn), pairPrecision: ratio(tp, tp + fp) };
}

/**
 * Evaluate judge outputs against human labels (conceptId space).
 * @param {Array<{ caseId:string, bestConceptId:string|null,
 *   labelByConceptId:Record<string,'best'|'acceptable'|'weak'|'reject'>,
 *   sets:{ mustNotReject:string[], shouldReject:string[], strongUnusual:string[], generic:string[], nearDupPairs:[string,string][] },
 *   judge:Record<string, object> }>} items
 * @returns {object} metrics (top1 is ALWAYS null — no selector exists)
 */
export function evaluateJudge(items) {
  const list = Array.isArray(items) ? items : [];
  let conceptCount = 0; let degraded = 0; let noBestCases = 0;
  for (const item of list) {
    if (!item || item.bestConceptId == null) noBestCases += 1;
    for (const j of Object.values(item.judge || {})) { conceptCount += 1; if (!j || j.ok !== true) degraded += 1; }
  }

  return {
    top1: null, // INVARIANT: no selector → no Top-1
    n: { cases: list.length, concepts: conceptCount, noBestCases, degraded },
    flagAlignment: {
      strangeButStrong: flagAlignment(list, 'strangeButStrong', 'strongUnusual'),
      genericButUsable: flagAlignment(list, 'genericButUsable', 'generic'),
    },
    negativeFlagConcentration: {
      semanticHeroMismatch: negativeFlagConcentration(list, 'semanticHeroMismatch'),
      incoherentMeaning: negativeFlagConcentration(list, 'incoherentMeaning'),
      offBriefContamination: negativeFlagConcentration(list, 'offBriefContamination'),
    },
    mustNotRejectFP: mustNotRejectFP(list),
    roughButRescuablePrecision: roughButRescuablePrecision(list),
    separation: {
      posterPotential: separation(list, 'posterPotential'),
      clientUsability: separation(list, 'clientUsability'),
    },
    nearDuplicate: nearDuplicate(list),
  };
}

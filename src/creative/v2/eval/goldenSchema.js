// ===================================================================
// Pure validators for the Critic Evaluation slice — briefs, goldens, and the
// committed V1 snapshot. No model, no React, no I/O. Every validator returns
// { ok, errors } and never throws. Reuses the canonical Creative V2 validators
// (schema.js) for the embedded request/result so a snapshot can never drift from
// the real contract.
// ===================================================================
import { validateCreativeCampaignRequest, validateCreativeCampaignResult } from '../schema.js';

export const GOLDEN_LABELS = Object.freeze(['best', 'acceptable', 'weak', 'reject']);
export const LABEL_RANK = Object.freeze({ best: 3, acceptable: 2, weak: 1, reject: 0 });

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isIdArray = (v, ids) => Array.isArray(v) && v.every((x) => ids.includes(x));

/** Validate one evaluation brief (input only — concepts come from V1). */
export function validateBrief(b) {
  const errors = [];
  if (!isObj(b)) return { ok: false, errors: ['brief must be an object'] };
  if (!isStr(b.id)) errors.push('brief.id required');
  if (!isStr(b.category)) errors.push('brief.category required');
  if (!isStr(b.needText)) errors.push('brief.needText required');
  if (!isObj(b.data)) errors.push('brief.data required (CRM snapshot object)');
  if (b.overrides !== undefined && !isObj(b.overrides)) errors.push('brief.overrides must be an object');
  return { ok: errors.length === 0, errors };
}

/**
 * Validate a golden judgment against the concept ids of its pinned snapshot.
 * @param {object} g golden
 * @param {string[]} conceptIds ids from the pinned snapshot result (the V1 order)
 */
export function validateGolden(g, conceptIds) {
  const errors = [];
  if (!isObj(g)) return { ok: false, errors: ['golden must be an object'] };
  if (!isStr(g.briefId)) errors.push('golden.briefId required');
  if (!isStr(g.snapshotRef)) errors.push('golden.snapshotRef required (pins the golden to a snapshot sample)');
  if (!isObj(g.labels)) errors.push('golden.labels required');
  else {
    const keys = Object.keys(g.labels);
    conceptIds.forEach((id) => { if (!keys.includes(id)) errors.push(`golden.labels missing concept ${id}`); });
    keys.forEach((k) => {
      if (!conceptIds.includes(k)) errors.push(`golden.labels has unknown concept ${k}`);
      if (!GOLDEN_LABELS.includes(g.labels[k])) errors.push(`golden.labels.${k} must be one of ${GOLDEN_LABELS.join('|')}`);
    });
  }
  if (!isIdArray(g.preferredOrder, conceptIds) || g.preferredOrder.length !== conceptIds.length
    || new Set(g.preferredOrder).size !== conceptIds.length) {
    errors.push('golden.preferredOrder must be a permutation of the snapshot concept ids');
  }
  ['mustNotReject', 'shouldDemote', 'shouldReject', 'strongUnusual', 'generic'].forEach((k) => {
    if (g[k] !== undefined && !isIdArray(g[k], conceptIds)) errors.push(`golden.${k} must be ids from the snapshot`);
  });
  if (g.nearDupPairs !== undefined) {
    if (!Array.isArray(g.nearDupPairs) || !g.nearDupPairs.every((p) => Array.isArray(p) && p.length === 2 && isIdArray(p, conceptIds))) {
      errors.push('golden.nearDupPairs must be an array of [id,id] pairs from the snapshot');
    }
  }
  if (g.notes !== undefined && typeof g.notes !== 'string') errors.push('golden.notes must be a string');
  return { ok: errors.length === 0, errors };
}

/** Validate one snapshot sample { sampleId, request, result } via the canonical validators. */
export function validateSnapshotSample(s) {
  const errors = [];
  if (!isObj(s)) return { ok: false, errors: ['sample must be an object'] };
  if (!isStr(s.sampleId)) errors.push('sample.sampleId required');
  const rq = validateCreativeCampaignRequest(s.request);
  if (!rq.ok) rq.errors.forEach((e) => errors.push(`sample.request: ${e}`));
  const rs = validateCreativeCampaignResult(s.result);
  if (!rs.ok) rs.errors.forEach((e) => errors.push(`sample.result: ${e}`));
  return { ok: errors.length === 0, errors };
}

/** Validate the whole committed snapshot file shape. */
export function validateSnapshotFile(file) {
  const errors = [];
  if (!isObj(file) || !isObj(file.meta) || !isObj(file.snapshots)) {
    return { ok: false, errors: ['snapshot file must be { meta:{...}, snapshots:{...} }'] };
  }
  for (const [briefId, entry] of Object.entries(file.snapshots)) {
    if (!isObj(entry) || !Array.isArray(entry.samples) || entry.samples.length === 0) {
      errors.push(`snapshots.${briefId}.samples must be a non-empty array`);
      continue;
    }
    entry.samples.forEach((s, i) => {
      const v = validateSnapshotSample(s);
      if (!v.ok) v.errors.forEach((e) => errors.push(`snapshots.${briefId}.samples[${i}]: ${e}`));
    });
  }
  return { ok: errors.length === 0, errors };
}

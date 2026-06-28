// ===================================================================
// Critic-evaluation runner. Two modes over the same pure engine (criticEval.js):
//
//  • FIXTURE (default): replays the committed baseline snapshot (v1Snapshots.json)
//    through the REAL critic and scores it against the committed goldens. Fully
//    deterministic — no model. This is the reviewable baseline measurement.
//
//  • REAL (opt-in): calls the real local model (via the adapter) K times per brief,
//    writes a SEPARATE candidate artifact under artifacts/critic-eval/ — it NEVER
//    overwrites the approved baseline snapshot. Promotion of a candidate to the
//    committed baseline is an explicit human step. If the rig is unavailable, it
//    returns status INCOMPLETE / LOCAL_RIG_UNAVAILABLE (NOT a degraded critic run).
//
// Intended to run under vitest / vite-node (so import.meta.env reaches the rig and
// JSON import works). The fixture path imports no model.
// ===================================================================
import SNAPSHOT from './v1Snapshots.json';
import { GOLDENS } from './goldens.js';
import { critiqueConcepts, CRITIQUE_VERSION } from '../conceptCritic.js';
import { runEvaluation } from './criticEval.js';
import { summarizeReliability } from './reliability.js';

/** Replay the committed baseline snapshot through the critic and score it. */
export async function runFixtureEval() {
  const items = [];
  for (const [bid, entry] of Object.entries(SNAPSHOT.snapshots)) {
    const { request, result } = entry.samples[0];
    const critique = await critiqueConcepts({ concepts: result.concepts, strategy: result.strategy, request });
    items.push({ request, result, critique, golden: GOLDENS[bid] });
  }
  const meta = {
    mode: 'fixture', source: SNAPSHOT.meta.source, model: SNAPSHOT.meta.model,
    sampleCount: SNAPSHOT.meta.sampleCount, createdAt: SNAPSHOT.meta.createdAt,
  };
  return runEvaluation(items, meta);
}

/**
 * Real local-model run. Writes a candidate artifact; never touches the baseline.
 * @param {{ timestamp:string, outDir?:string, sampleCount?:number }} opts
 *   `timestamp` MUST be supplied by the caller (no Date.now here → reproducible path).
 */
export async function runRealEval({ timestamp, outDir = 'artifacts/critic-eval', sampleCount = 3, runMeta = {}, resumeFrom = null, priorRecords = [] } = {}) {
  if (!timestamp) throw new Error('runRealEval requires an explicit timestamp (deterministic artifact path)');
  const gemini = await import('../../../lib/gemini.js');
  if (!gemini.isGeminiConfigured || !gemini.useLocalLLM) {
    const meta = { mode: 'real', source: 'local-model', reason: 'LOCAL_RIG_UNAVAILABLE', sampleCount, createdAt: timestamp };
    const { report } = runEvaluation([], meta, { incomplete: true, reason: 'LOCAL_RIG_UNAVAILABLE' });
    return { completion: 'INCOMPLETE', reason: 'LOCAL_RIG_UNAVAILABLE', report, candidatePath: null };
  }
  const { createCreativeDirectorAdapter } = await import('../creativeDirectorAdapter.js');
  const { BRIEFS } = await import('./briefs.js');
  const { makeRequest } = await import('./buildBaseline.js');
  const fs = await import('node:fs');
  const { createHash } = await import('node:crypto');

  const adapter = createCreativeDirectorAdapter({ runV1: gemini.runCreativeDirector });
  const log = (m) => { try { /* eslint-disable-next-line no-console */ console.log(m); } catch { /* noop */ } };
  fs.mkdirSync(outDir, { recursive: true });
  const candidatePath = `${outDir}/candidate-snapshots-${timestamp}.json`;

  const candidate = {
    meta: {
      source: 'local-model', mode: 'real',
      model: runMeta.model || null,
      generationConfig: runMeta.generationConfig || null,
      mainCommit: runMeta.mainCommit || null,
      criticVersion: CRITIQUE_VERSION,
      sampleCount, createdAt: timestamp,
      briefIds: BRIEFS.map((b) => b.id),
      failures: [], reliability: null, completion: null,
    },
    snapshots: {},
  };

  // RESUME: carry already-succeeded cases from a prior checkpoint; only the MISSING
  // cases are (re)generated. Carry their per-call telemetry from priorRecords.
  const completed = new Set();
  if (resumeFrom) {
    try {
      const prior = JSON.parse(fs.readFileSync(resumeFrom, 'utf8'));
      for (const [bid, entry] of Object.entries(prior.snapshots || {})) {
        candidate.snapshots[bid] = { samples: entry.samples.slice() };
        entry.samples.forEach((s) => completed.add(s.sampleId));
      }
      log(`resume: carried ${completed.size} succeeded cases from ${resumeFrom}`);
    } catch (e) { log(`resume: could not read ${resumeFrom}: ${e && e.message}`); }
  }
  // telemetry records: carried successes from the prior run + fresh records below.
  const records = (priorRecords || []).filter((r) => completed.has(r.sampleId) && r.ok);

  const RIG_DOWN_RE = /ECONNREFUSED|fetch failed|ENOTFOUND|ECONNRESET|socket hang up|ETIMEDOUT|network|Failed to fetch/i;
  const isRigDown = (e) => RIG_DOWN_RE.test(String((e && (e.details || e.message)) || e));
  const writeCheckpoint = () => fs.writeFileSync(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`, 'utf8');

  const total = BRIEFS.length * sampleCount;
  let done = completed.size;
  // returns { ok, result?, rigDown?, record:{sampleId, attempts, firstAttemptOk, ok, errorCode} }
  async function runOneCall(request, sampleId) {
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const result = await adapter.run(request);
        return { ok: true, result, record: { sampleId, attempts: attempt, firstAttemptOk: attempt === 1, ok: true, errorCode: lastErr && lastErr.code } };
      } catch (e) {
        lastErr = e;
        if (isRigDown(e)) return { ok: false, rigDown: true, error: String((e && (e.details || e.message)) || e).slice(0, 200) };
        log(`  ↻ retry ${attempt}/3 ${sampleId}: ${(e && e.code) || ''} ${String((e && (e.details || e.message)) || e).slice(0, 100)}`);
      }
    }
    return { ok: false, rigDown: false, error: `${(lastErr && lastErr.code) || 'CALL_FAILED'}: ${String((lastErr && (lastErr.details || lastErr.message)) || lastErr).slice(0, 160)}`, record: { sampleId, attempts: 3, firstAttemptOk: false, ok: false, errorCode: (lastErr && lastErr.code) || 'CALL_FAILED' } };
  }

  for (const brief of BRIEFS) {
    const request = makeRequest(brief);
    const samples = (candidate.snapshots[brief.id] && candidate.snapshots[brief.id].samples) || [];
    for (let k = 0; k < sampleCount; k += 1) {
      const sampleId = `${brief.id}#sample${k}`;
      if (completed.has(sampleId)) continue; // resume: skip already-done
      const r = await runOneCall(request, sampleId);
      done += 1;
      if (r.record) records.push(r.record);
      if (r.ok) { samples.push({ sampleId, request, result: r.result }); log(`[${done}/${total}] ${sampleId} ✓`); continue; }
      if (r.rigDown) {
        log(`[${done}/${total}] ${sampleId} ✗ RIG DOWN — aborting`);
        writeCheckpoint(); // preserve whatever succeeded so a resume can finish it
        const meta = { mode: 'real', source: 'local-model', reason: 'LOCAL_RIG_UNAVAILABLE', sampleCount, createdAt: timestamp };
        const { report } = runEvaluation([], meta, { incomplete: true, reason: 'LOCAL_RIG_UNAVAILABLE' });
        return { completion: 'INCOMPLETE', reason: 'LOCAL_RIG_UNAVAILABLE', detail: r.error, report, candidatePath, checkpoint: true };
      }
      candidate.meta.failures.push({ sampleId, error: r.error });
      log(`[${done}/${total}] ${sampleId} ✗ recorded failure: ${r.error}`);
    }
    candidate.snapshots[brief.id] = { samples };
    if (!samples.length) delete candidate.snapshots[brief.id];
    writeCheckpoint(); // never lose progress on a long run
  }

  // Reliability telemetry (SEPARATE from critic quality) + completion status.
  const reliability = summarizeReliability(records, total);
  candidate.meta.reliability = reliability;
  candidate.meta.completion = reliability.status; // COMPLETED (30/30) | PARTIAL | INCOMPLETE

  if (reliability.successfulCases === 0) {
    writeCheckpoint();
    const meta = { mode: 'real', source: 'local-model', reason: 'ALL_CALLS_FAILED', sampleCount, createdAt: timestamp };
    const { report } = runEvaluation([], meta, { incomplete: true, reason: 'ALL_CALLS_FAILED' });
    return { completion: 'INCOMPLETE', reason: 'ALL_CALLS_FAILED', detail: JSON.stringify(candidate.meta.failures).slice(0, 400), report, candidatePath, reliability };
  }

  // DESCRIPTIVE eval over successful sample0s (goldens pinned to baseline → not authoritative).
  const items = [];
  for (const [briefId, entry] of Object.entries(candidate.snapshots)) {
    const s0 = entry.samples[0];
    const critique = await critiqueConcepts({ concepts: s0.result.concepts, strategy: s0.result.strategy, request: s0.request });
    items.push({ request: s0.request, result: s0.result, critique, golden: GOLDENS[briefId] });
  }
  const candidateJson = `${JSON.stringify(candidate, null, 2)}\n`;
  fs.writeFileSync(candidatePath, candidateJson, 'utf8');
  const checksum = createHash('sha256').update(candidateJson).digest('hex');
  fs.writeFileSync(`${candidatePath}.sha256`, `${checksum}  candidate-snapshots-${timestamp}.json\n`, 'utf8');
  const meta = { mode: 'real', source: 'local-model', model: candidate.meta.model, sampleCount, createdAt: timestamp, goldenValidity: 'mismatched', reliability, completion: reliability.status };
  const evalRes = runEvaluation(items, meta);
  fs.writeFileSync(`${outDir}/report-${timestamp}.md`, evalRes.report, 'utf8');
  log(`DONE: completion=${reliability.status} ${reliability.successfulCases}/${total} cases, ${reliability.permanentlyFailedCases} permanent failures`);
  return {
    completion: reliability.status,                 // COMPLETED | PARTIAL | INCOMPLETE
    reason: reliability.reason,                      // MISSING_CASES when PARTIAL
    evalStatus: evalRes.vrd.status,                  // CANDIDATE_REQUIRES_RELABEL (descriptive)
    report: evalRes.report, candidatePath, reportPath: `${outDir}/report-${timestamp}.md`,
    checksum, candidateMeta: candidate.meta, reliability, failures: candidate.meta.failures,
  };
}

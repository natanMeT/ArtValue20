// ===================================================================
// V1 generation-reliability telemetry (pure). Kept SEPARATE from critic-quality:
// a per-call V1 failure is a generation-robustness fact, never a critic-quality
// signal, and retries that eventually succeed are NOT evidence of better creative
// quality — they are recorded honestly as recovered-by-retry.
//
// `summarizeReliability` turns per-call records into the required telemetry +
// completion status. `parseRunLog` reconstructs per-call records from a runner
// stdout log (used for a run whose telemetry wasn't recorded natively).
// ===================================================================

/**
 * @param {Array<{sampleId:string, attempts:number, firstAttemptOk:boolean, ok:boolean, errorCode?:string}>} records
 * @param {number} requiredCases
 */
export function summarizeReliability(records, requiredCases = 30) {
  const attempted = records.length;
  const successful = records.filter((r) => r.ok);
  const permanentlyFailed = records.filter((r) => !r.ok);
  const firstAttemptSuccesses = records.filter((r) => r.firstAttemptOk).length;
  const recoveredByRetry = records.filter((r) => r.ok && !r.firstAttemptOk).length;
  const totalAttempts = records.reduce((a, r) => a + (r.attempts || 0), 0);
  const errorClasses = {};
  records.forEach((r) => { if (r.errorCode) errorClasses[r.errorCode] = (errorClasses[r.errorCode] || 0) + 1; });

  const successfulCases = successful.length;
  const status = successfulCases >= requiredCases ? 'COMPLETED' : successfulCases > 0 ? 'PARTIAL' : 'INCOMPLETE';

  return {
    requiredCases,
    attemptedCases: attempted,
    successfulCases,
    permanentlyFailedCases: permanentlyFailed.length,
    totalGenerationAttempts: totalAttempts,
    firstAttemptFailures: attempted - firstAttemptSuccesses,
    recoveredByRetryCases: recoveredByRetry,
    unrecoveredCases: permanentlyFailed.length,
    firstAttemptSuccessRate: attempted ? firstAttemptSuccesses / attempted : null,
    finalSuccessRate: requiredCases ? successfulCases / requiredCases : null,
    errorClasses,
    failedSampleIds: permanentlyFailed.map((r) => r.sampleId),
    status,
    reason: status === 'PARTIAL' ? 'MISSING_CASES' : undefined,
  };
}

/**
 * Reconstruct per-call records from a runner stdout log. Structural (not emoji-
 * dependent): a `[n/total] <sampleId> ...` line is a terminal event (success unless
 * it says "recorded failure" / "RIG DOWN"); each `retry .. <sampleId>: <CODE>` line
 * means that call's earlier attempt failed.
 */
export function parseRunLog(text) {
  const lines = String(text || '').split(/\r?\n/);
  const order = [];
  const byId = new Map();
  const ensure = (id) => {
    if (!byId.has(id)) { byId.set(id, { sampleId: id, attempts: 1, firstAttemptOk: true, ok: false, errorCode: undefined }); order.push(id); }
    return byId.get(id);
  };
  for (const ln of lines) {
    const retry = ln.match(/retry\s+\d+\/\d+\s+(\S+#sample\d+):\s*(\S+)?/);
    if (retry) { const r = ensure(retry[1]); r.firstAttemptOk = false; r.attempts += 1; if (retry[2]) r.errorCode = retry[2].replace(/:$/, ''); continue; }
    const term = ln.match(/\[\d+\/\d+\]\s+(\S+#sample\d+)\s+(.*)$/);
    if (term) {
      const r = ensure(term[1]); const rest = term[2];
      if (/recorded failure/i.test(rest)) { r.ok = false; const m = rest.match(/recorded failure:\s*([A-Z0-9_]+)/); if (m) r.errorCode = m[1]; }
      else if (/RIG DOWN/i.test(rest)) { r.ok = false; r.errorCode = 'RIG_DOWN'; }
      else { r.ok = true; }
    }
  }
  return order.map((id) => byId.get(id));
}

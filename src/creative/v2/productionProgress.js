// ===================================================================
// productionProgress — the SINGLE optional progress seam for the production
// slice. Pure data + a failure-safe emitter. It knows nothing about React,
// the browser, persistence, or the LLM; it only formats progress events and
// hands them to an injected callback.
//
// Contract of one event:
//   { stage, status, message, timestamp }
//     stage     — a stable id from PRODUCTION_STAGE_ORDER
//     status    — 'active' | 'done' | 'error'
//     message   — polished Hebrew UI string for the stage
//     timestamp — Date.now() (runtime engine code — allowed)
//
// Events correspond to REAL execution points only; nothing here is persisted.
// ===================================================================

// 'fallback' = the stage COMPLETED, but via a documented deterministic fallback
// after the underlying seam threw (e.g. the translation provider failed and we
// continued with the English skeleton). It is an honest non-error completion —
// distinct from 'done' (clean success) and 'error' (fatal, generation rejected).
export const PROGRESS_STATUS = Object.freeze({ ACTIVE: 'active', DONE: 'done', ERROR: 'error', FALLBACK: 'fallback' });

// Stable stage id → polished Hebrew label. The order of keys is the canonical
// narrative order (the UI renders this order; `rewrite` is conditional).
export const PRODUCTION_STAGES = Object.freeze({
  context: 'קורא את הקשר הקמפיין',
  analyze: 'מנתח את הקונספט הנבחר',
  copy: 'מנסח קופי בעברית',
  lint: 'בודק שפה שיווקית גנרית',
  rewrite: 'משכתב את הקופי',
  translate: 'מתרגם את הקונספט הוויזואלי לאנגלית',
  visual: 'בונה בריף ויזואלי ופרומפט תמונה',
  validate: 'מאמת את חבילת ההפקה',
  ready: 'מוכן לסקירה',
});

// Canonical emission order. `rewrite` is included for UI layout but is only
// EMITTED when an actual copy retry runs.
export const PRODUCTION_STAGE_ORDER = Object.freeze(Object.keys(PRODUCTION_STAGES));

// Resolve the Hebrew label for a stage id, falling back to the id itself.
export function progressMessage(stage) {
  return PRODUCTION_STAGES[stage] || stage;
}

/**
 * Build a failure-safe progress emitter.
 *
 * @param {(e:{stage:string,status:string,message:string,timestamp:number})=>void} [onProgress]
 *   Optional sink. When absent (or not a function) every emit is a no-op, so the
 *   engine behaves exactly as before. A throwing sink can NEVER break generation.
 * @param {() => number} [now] - injectable clock (defaults to Date.now) for tests.
 * @returns {{ emit(stage:string, status:string): void }}
 */
export function createProgressEmitter(onProgress, now = Date.now) {
  const sink = typeof onProgress === 'function' ? onProgress : null;
  return {
    emit(stage, status) {
      if (!sink) return;
      try {
        sink({ stage, status, message: progressMessage(stage), timestamp: now() });
      } catch {
        // progress is best-effort telemetry — a faulty sink must not abort work.
      }
    },
  };
}

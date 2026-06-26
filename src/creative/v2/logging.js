// ===================================================================
// Structured creative events — reuses the JakeOS convention of small, named,
// structured events (not a new logging platform). Each event is { event, ts,
// ...payload }. Sinks: console.debug (dev) + a bounded in-memory ring buffer
// (inspection + tests). Sensitive customer data is never passed here by callers
// (the context builder already summarizes/sanitizes upstream).
// ===================================================================

export const CREATIVE_EVENTS = Object.freeze([
  'creative_context_built',
  'creative_brief_created',
  'creative_request_validated',
  'creative_adapter_mapping_started',
  'creative_adapter_mapping_completed',
  'creative_engine_started',
  'creative_engine_completed',
  'creative_engine_failed',
  'creative_output_normalized',
  'creative_output_validated',
  'creative_concepts_ready',
  'creative_concept_selection_proposed',
  'creative_concept_selected',
  'creative_campaign_saved',
]);

const RING_MAX = 200;
let ring = [];
let sink = (rec) => { try { /* eslint-disable-next-line no-console */ console.debug('[creative]', rec.event, rec); } catch { /* noop */ } };

/** Emit a structured creative event. Unknown event names are allowed but flagged. */
export function logCreativeEvent(event, payload = {}) {
  const rec = {
    event,
    ts: new Date().toISOString(),
    known: CREATIVE_EVENTS.includes(event),
    ...payload,
  };
  ring.push(rec);
  if (ring.length > RING_MAX) ring = ring.slice(-RING_MAX);
  try { sink(rec); } catch { /* never let logging break the flow */ }
  return rec;
}

export function getCreativeEventLog() { return [...ring]; }
export function clearCreativeEventLog() { ring = []; }
/** Swap the console sink (tests use a no-op; an app could forward to telemetry). */
export function setCreativeEventSink(fn) { sink = typeof fn === 'function' ? fn : (() => {}); }

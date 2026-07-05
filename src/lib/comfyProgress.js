// ===================================================================
// comfyProgress — additive job-progress layer for the local ComfyUI bridge.
// Pure parsers + a per-job /ws watcher + a targeted cancel helper. Imports
// nothing from geminiImage — the UI passes baseUrl/clientId/promptId from
// the onComfyJob seam. No top-level side effects: nothing runs at import.
//
// Engine facts this module is built on (verified against ComfyUI 0.23.0):
// • executing/progress/executed/execution_error are sent ONLY to the socket
//   whose sid equals the submitting client_id — the watcher must connect
//   with the SAME per-job clientId the bridge used on POST /prompt.
// • 'status' is a global broadcast with no prompt_id — never per-job state.
// • On connect the server may send an 'executing' greeting WITHOUT a
//   prompt_id — it must never match the watched job.
// • Binary frames (previews) arrive on the job socket — ignore non-strings.
// • POST /interrupt WITHOUT a {prompt_id} body is a GLOBAL interrupt that
//   can kill an unrelated job. Always send the targeted form.
// • A prompt deleted from queue_pending never appears in /history — the
//   caller must treat 'deleted' as immediately terminal.
// ===================================================================

// Normalize one /ws message for a specific prompt. Returns null for anything
// that is not a state change for THIS prompt (broadcast 'status', other
// prompts, the no-prompt_id connect greeting, progress_state / custom-node
// spam, binary frames, malformed input). Never throws.
export function parseWsEvent(raw, promptId) {
  if (typeof raw !== 'string' || !promptId) return null;
  let msg;
  try { msg = JSON.parse(raw); } catch { return null; }
  const d = msg && typeof msg === 'object' ? msg.data : null;
  if (!msg?.type || !d || typeof d !== 'object') return null;
  if (d.prompt_id !== promptId) return null; // also drops the prompt_id-less greeting
  switch (msg.type) {
    case 'execution_start':
    case 'execution_cached':
      return { kind: 'running' };
    case 'executing':
      return d.node == null ? { kind: 'done' } : { kind: 'running', node: String(d.node) };
    case 'progress':
      return {
        kind: 'progress',
        node: d.node == null ? '' : String(d.node),
        value: Number(d.value) || 0,
        max: Number(d.max) || 0,
      };
    case 'execution_success': return { kind: 'done' };
    case 'execution_error': return { kind: 'error' };
    case 'execution_interrupted': return { kind: 'interrupted' };
    default: return null;
  }
}

// Locate a prompt in a GET /queue response. Entries are tuples
// (number, prompt_id, ...); queue_pending is heap-ordered, so position is
// computed after sorting by the priority number. Never throws.
export function parseQueueState(q, promptId) {
  const running = Array.isArray(q?.queue_running) ? q.queue_running : [];
  const pending = Array.isArray(q?.queue_pending) ? q.queue_pending : [];
  if (running.some((it) => Array.isArray(it) && it[1] === promptId)) return { state: 'running' };
  const sorted = pending
    .filter((it) => Array.isArray(it))
    .sort((a, b) => (Number(a[0]) || 0) - (Number(b[0]) || 0));
  const idx = sorted.findIndex((it) => it[1] === promptId);
  if (idx >= 0) return { state: 'pending', position: idx + 1 };
  return { state: 'absent' };
}

// Cancel one job. Pending → removed from the queue ('deleted' — the caller
// must stop waiting itself, the job will never reach /history). Running →
// TARGETED interrupt ('interrupted' — /history gets an error entry, so the
// bridge's polling settles within ~1.5s). Never throws, never sends a
// bodyless /interrupt.
export async function cancelJob(baseUrl, promptId, opts = {}) {
  const f = opts.fetchImpl || ((...a) => fetch(...a));
  if (!baseUrl || !promptId) return 'not_found';
  try {
    const q = await (await f(`${baseUrl}/queue`)).json();
    const { state } = parseQueueState(q, promptId);
    if (state === 'pending') {
      await f(`${baseUrl}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delete: [promptId] }),
      });
      return 'deleted';
    }
    if (state === 'running') {
      await f(`${baseUrl}/interrupt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_id: promptId }),
      });
      return 'interrupted';
    }
    return 'not_found';
  } catch { return 'error'; }
}

// Watch one job. Opens a per-job WebSocket with the job's own clientId
// (unique sid → no collision with other tabs/watchers), reconciles the
// initial state from GET /queue (events sent before the socket opened are
// dropped by the server), and falls back to /queue polling if the socket
// fails. Terminal updates (done/error/interrupted) are sticky — nothing is
// emitted after them. Returns stop(); stop() is idempotent and guarantees
// no further onUpdate calls and no orphan poll loop.
export function watchJob(baseUrl, clientId, promptId, onUpdate, opts = {}) {
  const WS = opts.WebSocketImpl || (typeof WebSocket !== 'undefined' ? WebSocket : null);
  const f = opts.fetchImpl || ((...a) => fetch(...a));
  const pollMs = opts.pollMs || 2000;
  let stopped = false;
  let terminal = false;
  let pollTimer = null;
  let polling = false;
  let ws = null;

  const emit = (u) => {
    if (stopped || terminal || !u) return;
    if (u.kind === 'done' || u.kind === 'error' || u.kind === 'interrupted') terminal = true;
    try { onUpdate(u); } catch { /* noop */ }
  };

  const pollOnce = async () => {
    try {
      const q = await (await f(`${baseUrl}/queue`)).json();
      const s = parseQueueState(q, promptId);
      if (s.state === 'running') emit({ kind: 'running' });
      else if (s.state === 'pending') emit({ kind: 'queued', position: s.position });
      // 'absent' is ambiguous (done OR never seen) — completion stays owned
      // by the bridge's /history polling; the watcher makes no claim.
    } catch { /* engine unreachable — the bridge owns failure handling */ }
  };

  const startPolling = () => {
    if (stopped || terminal || polling) return;
    polling = true;
    const tick = async () => {
      if (stopped || terminal) return;
      await pollOnce();
      if (!stopped && !terminal) pollTimer = setTimeout(tick, pollMs);
    };
    pollTimer = setTimeout(tick, pollMs);
  };

  pollOnce(); // initial reconciliation (WS may connect after execution began)

  try {
    if (!WS) throw new Error('no websocket');
    ws = new WS(`${String(baseUrl).replace(/^http/, 'ws')}/ws?clientId=${encodeURIComponent(clientId)}`);
    ws.onmessage = (e) => { const u = parseWsEvent(e && e.data, promptId); if (u) emit(u); };
    ws.onerror = () => startPolling();
    ws.onclose = () => startPolling();
  } catch { startPolling(); }

  return function stop() {
    stopped = true;
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    try { if (ws) ws.close(); } catch { /* noop */ }
  };
}

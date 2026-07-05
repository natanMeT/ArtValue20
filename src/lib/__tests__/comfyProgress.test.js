import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseWsEvent, parseQueueState, cancelJob, watchJob } from '../comfyProgress.js';

// ===================================================================
// comfyProgress — Studio queue / progress / cancel layer.
// Pure parsers + injected fakes only. Tripwire: nothing here may touch the
// real network (the dev machine's engine is genuinely live on :8188).
// ===================================================================

const PID = 'p-watched';
const msg = (type, data) => JSON.stringify({ type, data });

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('parseWsEvent', () => {
  it('maps this prompt\'s lifecycle events', () => {
    expect(parseWsEvent(msg('execution_start', { prompt_id: PID }), PID)).toEqual({ kind: 'running' });
    expect(parseWsEvent(msg('execution_cached', { prompt_id: PID, nodes: [] }), PID)).toEqual({ kind: 'running' });
    expect(parseWsEvent(msg('executing', { prompt_id: PID, node: '3' }), PID)).toEqual({ kind: 'running', node: '3' });
    expect(parseWsEvent(msg('executing', { prompt_id: PID, node: null }), PID)).toEqual({ kind: 'done' });
    expect(parseWsEvent(msg('progress', { prompt_id: PID, node: '3', value: 7, max: 26 }), PID))
      .toEqual({ kind: 'progress', node: '3', value: 7, max: 26 });
    expect(parseWsEvent(msg('execution_success', { prompt_id: PID }), PID)).toEqual({ kind: 'done' });
    expect(parseWsEvent(msg('execution_error', { prompt_id: PID }), PID)).toEqual({ kind: 'error' });
    expect(parseWsEvent(msg('execution_interrupted', { prompt_id: PID, node_id: '3' }), PID)).toEqual({ kind: 'interrupted' });
  });

  it('ignores other prompts and the prompt_id-less connect greeting', () => {
    // Real 0.23.0 behavior: on connect the server sends executing WITHOUT a
    // prompt_id (node may be non-null). It must never read as done/running.
    expect(parseWsEvent(msg('executing', { node: null }), PID)).toBeNull();
    expect(parseWsEvent(msg('executing', { node: '7' }), PID)).toBeNull();
    expect(parseWsEvent(msg('executing', { prompt_id: 'other', node: null }), PID)).toBeNull();
    expect(parseWsEvent(msg('execution_interrupted', { prompt_id: 'other' }), PID)).toBeNull();
    expect(parseWsEvent(msg('progress', { prompt_id: 'other', value: 1, max: 2 }), PID)).toBeNull();
  });

  it('ignores broadcast status, unknown types, binary frames and malformed input', () => {
    expect(parseWsEvent(msg('status', { status: { exec_info: { queue_remaining: 0 } }, sid: 'x' }), PID)).toBeNull();
    expect(parseWsEvent(msg('progress_state', { prompt_id: PID, nodes: {} }), PID)).toBeNull();
    expect(parseWsEvent(msg('crystools.monitor', { prompt_id: PID }), PID)).toBeNull();
    expect(parseWsEvent('not json', PID)).toBeNull();
    expect(parseWsEvent(new ArrayBuffer(8), PID)).toBeNull();
    expect(parseWsEvent(null, PID)).toBeNull();
    expect(parseWsEvent(JSON.stringify({ type: 'progress' }), PID)).toBeNull();
    expect(parseWsEvent(JSON.stringify({ data: { prompt_id: PID } }), PID)).toBeNull();
  });

  it('progress with max 0 normalizes without NaN', () => {
    const u = parseWsEvent(msg('progress', { prompt_id: PID, value: 0, max: 0 }), PID);
    expect(u).toEqual({ kind: 'progress', node: '', value: 0, max: 0 });
  });
});

describe('parseQueueState', () => {
  // Real /queue tuple shape: (number, prompt_id, prompt, extra_data, outputs)
  const item = (n, id) => [n, id, {}, {}, []];

  it('finds running / pending (position by priority order) / absent', () => {
    expect(parseQueueState({ queue_running: [item(1, PID)], queue_pending: [] }, PID)).toEqual({ state: 'running' });
    // heap-ordered pending: array index is NOT the position
    const q = { queue_running: [item(1, 'r')], queue_pending: [item(9, 'z'), item(3, PID), item(5, 'y')] };
    expect(parseQueueState(q, PID)).toEqual({ state: 'pending', position: 1 });
    expect(parseQueueState(q, 'z')).toEqual({ state: 'pending', position: 3 });
    expect(parseQueueState({ queue_running: [], queue_pending: [] }, PID)).toEqual({ state: 'absent' });
  });

  it('never throws on malformed input', () => {
    for (const bad of [null, undefined, {}, { queue_running: 'x' }, { queue_pending: [null, 'x', [1]] }]) {
      expect(parseQueueState(bad, PID)).toEqual({ state: 'absent' });
    }
  });
});

describe('cancelJob', () => {
  const queueRes = (q) => ({ json: async () => q, ok: true });

  it('deletes a pending job with the exact body', async () => {
    const calls = [];
    const f = vi.fn(async (url, init) => { calls.push([url, init]); return queueRes({ queue_running: [], queue_pending: [[1, PID, {}, {}, []]] }); });
    expect(await cancelJob('http://e:1', PID, { fetchImpl: f })).toBe('deleted');
    expect(calls[1][0]).toBe('http://e:1/queue');
    expect(JSON.parse(calls[1][1].body)).toEqual({ delete: [PID] });
  });

  it('interrupts a running job with a TARGETED body — never bodyless', async () => {
    const calls = [];
    const f = vi.fn(async (url, init) => { calls.push([url, init]); return queueRes({ queue_running: [[1, PID, {}, {}, []]], queue_pending: [] }); });
    expect(await cancelJob('http://e:1', PID, { fetchImpl: f })).toBe('interrupted');
    const [url, init] = calls[1];
    expect(url).toBe('http://e:1/interrupt');
    expect(init.headers['Content-Type']).toBe('application/json');
    // a bodyless /interrupt is a GLOBAL interrupt that can kill another job
    expect(JSON.parse(init.body)).toEqual({ prompt_id: PID });
  });

  it('absent → not_found with no mutating request; failures → error; never throws', async () => {
    const f = vi.fn(async () => queueRes({ queue_running: [], queue_pending: [] }));
    expect(await cancelJob('http://e:1', PID, { fetchImpl: f })).toBe('not_found');
    expect(f).toHaveBeenCalledTimes(1); // only the GET /queue check
    expect(await cancelJob('http://e:1', PID, { fetchImpl: vi.fn(async () => { throw new Error('down'); }) })).toBe('error');
    expect(await cancelJob('', PID, {})).toBe('not_found');
    expect(await cancelJob('http://e:1', '', {})).toBe('not_found');
  });
});

describe('watchJob', () => {
  class FakeWS {
    constructor(url) { this.url = url; FakeWS.last = this; }
    close() { this.closed = true; }
  }
  const idleQueue = async () => ({ json: async () => ({ queue_running: [], queue_pending: [] }) });

  it('connects with ws:// scheme + the job clientId and forwards this job\'s events', async () => {
    const updates = [];
    const stop = watchJob('http://e:1', 'client-9', PID, (u) => updates.push(u), { WebSocketImpl: FakeWS, fetchImpl: idleQueue });
    expect(FakeWS.last.url).toBe('ws://e:1/ws?clientId=client-9');
    FakeWS.last.onmessage({ data: msg('executing', { node: null }) });          // greeting → ignored
    FakeWS.last.onmessage({ data: msg('progress', { prompt_id: PID, node: '3', value: 1, max: 4 }) });
    FakeWS.last.onmessage({ data: msg('progress', { prompt_id: 'other', value: 9, max: 9 }) });
    expect(updates).toEqual([{ kind: 'progress', node: '3', value: 1, max: 4 }]);
    stop();
  });

  it('terminal updates are sticky — nothing is emitted after done/interrupted', async () => {
    const updates = [];
    const stop = watchJob('http://e:1', 'c', PID, (u) => updates.push(u), { WebSocketImpl: FakeWS, fetchImpl: idleQueue });
    FakeWS.last.onmessage({ data: msg('execution_success', { prompt_id: PID }) });
    FakeWS.last.onmessage({ data: msg('progress', { prompt_id: PID, value: 1, max: 4 }) });
    FakeWS.last.onmessage({ data: msg('status', { status: { exec_info: { queue_remaining: 0 } } }) });
    expect(updates).toEqual([{ kind: 'done' }]);
    stop();
  });

  it('falls back to polling when the socket fails — and stop() kills the loop', async () => {
    vi.useFakeTimers();
    const f = vi.fn(async () => ({ json: async () => ({ queue_running: [[1, PID, {}, {}, []]], queue_pending: [] }) }));
    const updates = [];
    const stop = watchJob('http://e:1', 'c', PID, (u) => updates.push(u), { WebSocketImpl: FakeWS, fetchImpl: f, pollMs: 2000 });
    await vi.advanceTimersByTimeAsync(0); // initial reconciliation
    expect(updates).toEqual([{ kind: 'running' }]);
    FakeWS.last.onclose();                 // socket dies → polling takes over
    await vi.advanceTimersByTimeAsync(4100);
    expect(f.mock.calls.length).toBeGreaterThanOrEqual(3);
    const before = f.mock.calls.length;
    stop();
    await vi.advanceTimersByTimeAsync(10000);
    expect(f.mock.calls.length).toBe(before); // no zombie poll loop after stop()
  });

  it('a stopped watcher never emits, even if the socket later fires', async () => {
    const updates = [];
    const stop = watchJob('http://e:1', 'c', PID, (u) => updates.push(u), { WebSocketImpl: FakeWS, fetchImpl: idleQueue });
    stop();
    FakeWS.last.onmessage({ data: msg('progress', { prompt_id: PID, value: 1, max: 2 }) });
    FakeWS.last.onclose();
    expect(updates).toEqual([]);
    expect(FakeWS.last.closed).toBe(true);
  });

  it('WebSocket constructor failure falls back to polling instead of throwing', async () => {
    vi.useFakeTimers();
    class BrokenWS { constructor() { throw new Error('no ws'); } }
    const f = vi.fn(async () => ({ json: async () => ({ queue_running: [], queue_pending: [[1, PID, {}, {}, []]] }) }));
    const updates = [];
    const stop = watchJob('http://e:1', 'c', PID, (u) => updates.push(u), { WebSocketImpl: BrokenWS, fetchImpl: f, pollMs: 2000 });
    await vi.advanceTimersByTimeAsync(2100);
    expect(updates[0]).toEqual({ kind: 'queued', position: 1 });
    stop();
  });
});

describe('module hygiene', () => {
  it('imports with no top-level network side effects', async () => {
    vi.stubGlobal('fetch', () => { throw new Error('network escaped import'); });
    vi.stubGlobal('WebSocket', class { constructor() { throw new Error('network escaped import'); } });
    vi.resetModules();
    const m = await import('../comfyProgress.js');
    expect(typeof m.parseWsEvent).toBe('function');
    expect(typeof m.watchJob).toBe('function');
    expect(typeof m.cancelJob).toBe('function');
  });
});

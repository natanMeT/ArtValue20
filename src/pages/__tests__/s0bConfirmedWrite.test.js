import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// S0B — confirmed-write + truthful-failure contract across store, follow-up UI,
// and the narrow Jake seam. Source-pinned (these live inside React hooks/pages).
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('S0B · store restores authoritative state before settling { ok: false }', () => {
  const store = read('../../store/store.jsx');
  // ⚠️ S0B'S GUARANTEE IS UNCHANGED; ONLY THE MECHANISM MOVED (stale-list race
  // slice). The failure paths used to call `refetch()` directly, which was a
  // lost update whenever writes ran concurrently: `refetch` does an ABSOLUTE
  // `setData(fresh)`, so a response produced before the sibling writes committed
  // restored rows the server had already deleted. They now await
  // `requestReconcile()`, which waits for in-flight writes to settle, coalesces
  // concurrent failures into one fetch, and applies the result the same way.
  // **Authoritative state is still applied BEFORE { ok: false } settles** — that
  // is what S0B pins, and it is asserted by ORDER below rather than by matching
  // a literal comment, which is exactly how the previous version of this pin
  // could have rotted on a reword.
  it('task failure reconciles BEFORE returning { ok: false } (no false task state)', () => {
    const branch = store.slice(store.indexOf('if (isTaskDispatch(act.type))'), store.indexOf('// S0A: in cloud mode'));
    expect(branch).toMatch(/await requestReconcile\(\);\s*return \{ ok: false, error: e \}/);
  });
  it('durable non-task failure reconciles before settling (follow-up-bearing client saves)', () => {
    const branch = store.slice(store.indexOf('// S0A: in cloud mode'), store.indexOf('// ---- auth actions ----'));
    const reconcileAt = branch.indexOf('await requestReconcile();');
    const failAt = branch.indexOf('return { ok: false, error: e };');
    expect(reconcileAt).toBeGreaterThan(-1);
    expect(failAt).toBeGreaterThan(-1);
    expect(reconcileAt).toBeLessThan(failAt);
  });
  it('the failed write is no longer counted in flight when it asks to reconcile (anti-deadlock)', () => {
    // trackWrite decrements in `.finally()`, attached before the caller's
    // handlers, so a failing write is out of the in-flight set by the time its
    // error handler calls requestReconcile(). Executed proof lives in
    // src/lib/__tests__/reconcileScheduler.test.js; this pins the wiring.
    expect(store).toContain('trackWrite(persist(act, userId))');
  });
  it('dispatch returns a settled { ok } result in every branch (never rejects)', () => {
    expect(store.includes('return Promise.resolve({ ok: true }); // local mode')).toBe(true);
    expect(store.includes('if (isMemoryOnlyDispatch(action.type)) return Promise.resolve({ ok: false });')).toBe(true);
  });
});

describe('S0B · client follow-up UI honors the failure contract', () => {
  const clients = read('../Clients.jsx');
  const modal = read('../../components/forms/ClientModal.jsx');
  it('Clients.save awaits { ok } and shows success / closes ONLY on ok:true', () => {
    const m = clients.match(/const save = async \(client\) => \{([\s\S]*?)\n  \};/);
    expect(m, 'async save present').not.toBe(null);
    const body = m[1];
    expect(body.includes('await dispatch(')).toBe(true);
    expect(body.indexOf('res?.ok === false')).toBeLessThan(body.indexOf('toast('));        // no success toast on failure
    expect(body.indexOf('res?.ok === false')).toBeLessThan(body.indexOf('setEditing(null)')); // modal stays open on failure
  });
  it('ClientModal adds a nextActionDate field, normalizes empty→null, keeps nextAction + onSave', () => {
    expect(modal.includes('nextActionDate: null')).toBe(true);
    expect(modal.includes("type=\"date\" value={form.nextActionDate || ''}")).toBe(true);
    expect(modal.includes('nextActionDate: e.target.value || null')).toBe(true);
    expect(modal.includes("set('nextAction')")).toBe(true);
    expect(modal.includes('onSave({ ...form, value: Number(form.value) || 0 })')).toBe(true); // follow-up rides through unchanged
  });
});

describe('S0B · Jake awaits durable task persistence (narrow Assistant seam, jakeAgent unchanged)', () => {
  const assistant = read('../../components/ai/Assistant.jsx');
  const jakeAgent = read('../../lib/jakeAgent.js');
  it('approvePreview captures + awaits task writes and does NOT claim success on failure', () => {
    expect(assistant.includes('const approvePreview = async (idx, actions)')).toBe(true);
    expect(assistant.includes('await Promise.all(taskWrites)')).toBe(true);
    expect(assistant.includes('/_TASK$/.test(action.type)')).toBe(true);
    expect(assistant.includes('לא נשמרו בענן')).toBe(true); // truthful failure card
  });
  it('confirmAction awaits the delete result before the success toast', () => {
    const m = assistant.match(/const confirmAction = async \(idx, d\) => \{([\s\S]*?)\n  \};/);
    expect(m, 'async confirmAction present').not.toBe(null);
    const body = m[1];
    expect(body.indexOf('await dispatch(')).toBeLessThan(body.indexOf("toast('בוצע"));
    expect(body.includes('res.ok === false')).toBe(true);
  });
  it('proposal→confirmation→execution contract in jakeAgent.js is unchanged (no broad Jake rewrite)', () => {
    expect(jakeAgent.includes('export function executeActions(actions, data, dispatch, registry = ACTION_HANDLERS, entities = BUSINESS_ENTITIES)')).toBe(true);
    expect(jakeAgent.includes("dispatch({ type: 'ADD_TASK', payload });")).toBe(true);
  });
});

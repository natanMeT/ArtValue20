import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ===================================================================
// S0B — Tasks are now DURABLY persisted in cloud mode. The S0A read-only
// containment is removed; the truthfulness guarantee MOVES to confirmed-write:
// every task mutation AWAITS the store's { ok } result and shows success ONLY
// after a confirmed cloud write (never a false success). Source-pinned, per the
// repo's page-test convention (Tasks.jsx pulls store/router).
// ===================================================================
const src = readFileSync(fileURLToPath(new URL('../Tasks.jsx', import.meta.url)), 'utf8');

describe('Tasks.jsx — S0B durable + confirmed-write (source pins)', () => {
  it('the S0A read-only containment is gone (no betaBlocked / BETA_MESSAGES / isSupabaseConfigured)', () => {
    expect(src.includes('betaBlocked')).toBe(false);
    expect(src.includes('BETA_MESSAGES')).toBe(false);
    expect(src.includes('isSupabaseConfigured')).toBe(false);
  });

  it('save awaits the dispatch result and shows success only on { ok } (no false success)', () => {
    const m = src.match(/const save = async \(task\) => \{([\s\S]*?)\n  \};/);
    expect(m, 'async save present').not.toBe(null);
    const body = m[1];
    expect(body.includes('await dispatch(')).toBe(true);
    expect(body.indexOf('res?.ok === false')).toBeLessThan(body.indexOf('toast('));   // bail before success toast
    expect(body.indexOf('res?.ok === false')).toBeLessThan(body.indexOf('setEditing(null)')); // bail before closing
  });

  it('status change awaits confirmation before the status toast', () => {
    const m = src.match(/const setStatus = async \(task, status\) => \{([\s\S]*?)\n  \};/);
    expect(m, 'async setStatus present').not.toBe(null);
    const body = m[1];
    expect(body.indexOf('await dispatch(')).toBeLessThan(body.indexOf('toast('));
    expect(body.includes("type: 'UPDATE_TASK'")).toBe(true);
    expect(body.includes('res?.ok === false')).toBe(true);
  });

  it('delete awaits confirmation before the deletion toast', () => {
    const m = src.match(/const remove = async \(\) => \{([\s\S]*?)\n  \};/);
    expect(m, 'async remove present').not.toBe(null);
    const body = m[1];
    expect(body.indexOf('await dispatch(')).toBeLessThan(body.indexOf('toast('));
    expect(body.includes("type: 'DELETE_TASK'")).toBe(true);
    expect(body.includes('res?.ok === false')).toBe(true);
  });

  it('task creation is no longer gated by cloud mode or by having projects', () => {
    expect(src.includes('disabled={(data.projects || []).length === 0}')).toBe(false);
  });

  it('TaskModal receives clients so a task can be client-linked or standalone', () => {
    expect(src.includes('clients={data.clients || []}')).toBe(true);
  });
});

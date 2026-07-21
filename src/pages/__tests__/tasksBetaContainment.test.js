import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ===================================================================
// S0A finding 1 — EVERY task mutation entry point is contained in cloud beta.
// Tasks.jsx pulls the store/router, so (per the repo's page-test convention)
// we source-pin the containment: create, edit/save, status change, "mark
// complete", and delete all gate on `betaBlocked` (= isSupabaseConfigured),
// and the row mutation controls are disabled/hidden. Local/demo mode keeps the
// full behavior (betaBlocked === false).
// ===================================================================
const src = readFileSync(fileURLToPath(new URL('../Tasks.jsx', import.meta.url)), 'utf8');

describe('Tasks.jsx — beta mutation containment (source pins)', () => {
  it('derives betaBlocked from the Supabase (cloud) transport', () => {
    expect(src.includes("import { isSupabaseConfigured } from '../lib/supabase.js';")).toBe(true);
    expect(src.includes('const betaBlocked = isSupabaseConfigured;')).toBe(true);
  });

  it('save/create is guarded before dispatch with no success toast', () => {
    expect(/const save = \(task\) => \{\s*if \(betaBlocked\) \{[^}]*return;/.test(src)).toBe(true);
  });

  it('status change (incl. "mark complete") is guarded before dispatch', () => {
    // setStatus early-returns on betaBlocked BEFORE dispatching UPDATE_TASK.
    const m = src.match(/const setStatus = \(task, status\) => \{([\s\S]*?)\};/);
    expect(m, 'setStatus present').not.toBe(null);
    const body = m[1];
    expect(body.indexOf('betaBlocked')).toBeLessThan(body.indexOf("dispatch({ type: 'UPDATE_TASK'"));
    expect(body.includes('return;')).toBe(true);
  });

  it('delete is guarded before dispatch', () => {
    const m = src.match(/const remove = \(\) => \{([\s\S]*?)\};/);
    expect(m, 'remove present').not.toBe(null);
    const body = m[1];
    expect(body.indexOf('betaBlocked')).toBeLessThan(body.indexOf("dispatch({ type: 'DELETE_TASK'"));
  });

  it('row mutation controls are read-only in beta: status select disabled, action buttons hidden', () => {
    expect(src.includes('disabled={betaBlocked}')).toBe(true);
    expect(src.includes('{!betaBlocked && t.status !== \'done\' &&')).toBe(true);
    expect(src.includes('{!betaBlocked && <button className="icon-action" onClick={() => setEditing(t)}')).toBe(true);
    expect(src.includes('{!betaBlocked && <button className="icon-action del"')).toBe(true);
  });

  it('the create affordances are hidden in beta and a calm note is shown', () => {
    expect(src.includes('action={!betaBlocked &&')).toBe(true);
    expect(src.includes('BETA_MESSAGES.tasks')).toBe(true);
  });
});

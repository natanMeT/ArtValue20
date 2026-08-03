import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { reducer } from '../store.jsx';

// S0B — durable task persistence. Reducer behavior + confirmed-write wiring pins.
const base = () => ({
  clients: [], quotes: [], transactions: [], outreachLeads: [],
  projects: [], tasks: [], plinks: [], pfiles: [], comms: [], inventory: [], activity: [],
});

describe('S0B · task reducer behavior', () => {
  it('ADD_TASK inserts a client-linked task (id preserved)', () => {
    const s = reducer(base(), { type: 'ADD_TASK', payload: { id: 'tk_1', title: 't', clientId: 'c1', projectId: null, status: 'new', priority: 'normal' } });
    expect(s.tasks).toHaveLength(1);
    expect(s.tasks[0]).toMatchObject({ id: 'tk_1', title: 't', clientId: 'c1', projectId: null });
  });

  it('ADD_TASK standalone (no project, no client) is allowed', () => {
    const s = reducer(base(), { type: 'ADD_TASK', payload: { id: 'tk_2', title: 'standalone', projectId: null, clientId: null } });
    expect(s.tasks[0]).toMatchObject({ id: 'tk_2', projectId: null, clientId: null });
  });

  it('UPDATE_TASK merges the patch (status change), leaving other fields intact', () => {
    const s0 = { ...base(), tasks: [{ id: 'tk_1', title: 't', status: 'new', priority: 'normal' }] };
    const s = reducer(s0, { type: 'UPDATE_TASK', payload: { id: 'tk_1', status: 'done' } });
    expect(s.tasks[0].status).toBe('done');
    expect(s.tasks[0].title).toBe('t');
  });

  it('DELETE_TASK removes by id', () => {
    const s0 = { ...base(), tasks: [{ id: 'tk_1' }, { id: 'tk_2' }] };
    const s = reducer(s0, { type: 'DELETE_TASK', id: 'tk_1' });
    expect(s.tasks.map((t) => t.id)).toEqual(['tk_2']);
  });
});

// ---- source pins: confirmed-write wiring + persist route + authenticated load ----
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const storeSrc = read('../store.jsx');
const apiSrc = read('../../lib/api.js');

describe('S0B · store confirmed-write wiring (source pins)', () => {
  it('persist() routes ADD/UPDATE/DELETE_TASK to api.*Task', () => {
    expect(storeSrc).toContain("case 'ADD_TASK': return api.createTask(userId, action.payload);");
    expect(storeSrc).toContain("case 'UPDATE_TASK': return api.updateTask(action.payload);");
    expect(storeSrc).toContain("case 'DELETE_TASK': return api.deleteTask(action.id);");
  });

  it('tasks use confirmed-write: persist BEFORE the reducer applies (no optimistic task state)', () => {
    const taskBranch = storeSrc.slice(storeSrc.indexOf('if (isTaskDispatch(act.type))'), storeSrc.indexOf('// S0A: in cloud mode'));
    // trackWrite() wraps the persist so the reconcile scheduler counts it as an
    // in-flight write; the confirmed-write ORDER is unchanged.
    expect(taskBranch).toContain('return trackWrite(persist(act, userId)).then(');
    expect(taskBranch).toContain('setData((d) => reducer(d, act)); return { ok: true };');
    // failure path: authoritative state restored + truthful result (no false task
    // state). The direct refetch became the coalesced, quiesce-gated reconcile.
    expect(taskBranch).toContain('requestReconcile()');
    expect(taskBranch).toContain('{ ok: false, error: e }');
  });

  it('dispatch returns a settled result so callers can await confirmation', () => {
    expect(storeSrc).toContain('return Promise.resolve({ ok: true }); // local mode');
  });
});

describe('S0B · authenticated load includes tasks (source pins)', () => {
  it('fetchAll selects tasks, guards the error, and maps into the tasks key', () => {
    expect(apiSrc).toContain("supabase.from('tasks').select('*')");
    expect(apiSrc).toContain('guard(tasksRes.error)');
    expect(apiSrc).toContain('tasks: tasksRes.data.map(rowToTask),');
  });
});

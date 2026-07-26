import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DURABLE_DISPATCH,
  MEMORY_ONLY_DISPATCH,
  isMemoryOnlyDispatch,
  JAKE_DURABLE_OPS,
  JAKE_BETA_UNAVAILABLE_OPS,
  JAKE_ACTION,
  classifyJakeAction,
  partitionJakeActions,
  triggersAutoIncome,
  betaBlockedMessage,
  BETA_HIDDEN_MODULES,
  BETA_MESSAGES,
} from '../betaCapabilities.js';
import { ACTION_HANDLERS } from '../jakeAgent.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ===================================================================
// S0A — beta false-success containment. This suite is the guard for the
// single capability classifier: if a new Jake op or store dispatch is added
// without being classified, a test here fails.
// ===================================================================

describe('dispatch classification — lockstep with store.jsx persist()', () => {
  const store = read('../../store/store.jsx');
  // Isolate the persist() switch body so we only match its `case 'X':` labels.
  const persistBody = store.slice(store.indexOf('function persist('), store.indexOf('const StoreCtx'));
  const persistCases = new Set([...persistBody.matchAll(/case '([A-Z_]+)':/g)].map((m) => m[1]));

  it('every DURABLE_DISPATCH type has a real persist() route', () => {
    for (const type of DURABLE_DISPATCH) {
      expect(persistCases.has(type), `durable type not routed in persist(): ${type}`).toBe(true);
    }
  });

  it('every persist()-routed type is classified durable (never memory-only)', () => {
    for (const type of persistCases) {
      expect(DURABLE_DISPATCH.has(type), `persisted type missing from DURABLE_DISPATCH: ${type}`).toBe(true);
      expect(isMemoryOnlyDispatch(type)).toBe(false);
    }
  });

  it('no dispatch type is both durable and memory-only', () => {
    for (const t of MEMORY_ONLY_DISPATCH) expect(DURABLE_DISPATCH.has(t)).toBe(false);
  });

  it('memory-only types are the project/inventory/link/file/comm mutations (S0B: tasks are durable)', () => {
    ['ADD_PROJECT', 'ADD_ITEM', 'ADD_LINK', 'ADD_FILE', 'ADD_COMM']
      .forEach((t) => expect(isMemoryOnlyDispatch(t)).toBe(true));
    ['ADD_CLIENT', 'ADD_QUOTE', 'ADD_TX', 'ADD_LEAD', 'ADD_TASK', 'UPDATE_TASK', 'DELETE_TASK']
      .forEach((t) => expect(isMemoryOnlyDispatch(t)).toBe(false));
  });
});

describe('Jake op classification — every registry op is classified', () => {
  it('every ACTION_HANDLERS op (except delete_all) is durable or beta-unavailable, never unknown', () => {
    for (const op of Object.keys(ACTION_HANDLERS)) {
      if (op === 'delete_all') continue; // entity-scoped, tested separately
      const cls = classifyJakeAction({ op });
      expect(cls, `unclassified Jake op: ${op}`).not.toBe(JAKE_ACTION.UNKNOWN);
      expect([JAKE_ACTION.DURABLE, JAKE_ACTION.BETA_UNAVAILABLE]).toContain(cls);
    }
  });

  it('durable and beta sets are disjoint and cover the registry', () => {
    for (const op of JAKE_DURABLE_OPS) expect(JAKE_BETA_UNAVAILABLE_OPS.has(op)).toBe(false);
    const known = new Set([...JAKE_DURABLE_OPS, ...JAKE_BETA_UNAVAILABLE_OPS, 'delete_all']);
    for (const op of Object.keys(ACTION_HANDLERS)) {
      expect(known.has(op), `registry op not in any classifier set: ${op}`).toBe(true);
    }
  });

  it('durable CRM ops classify durable', () => {
    ['add_client', 'update_client', 'delete_client', 'add_quote', 'add_income', 'add_expense', 'move_pipeline', 'add_lead', 'delete_tx']
      .forEach((op) => expect(classifyJakeAction({ op })).toBe(JAKE_ACTION.DURABLE));
  });

  it('mark_paid classifies beta-unavailable (auto-income is memory-only, not persisted)', () => {
    expect(classifyJakeAction({ op: 'mark_paid', client: 'דני' })).toBe(JAKE_ACTION.BETA_UNAVAILABLE);
    expect(JAKE_DURABLE_OPS.has('mark_paid')).toBe(false);
    expect(JAKE_BETA_UNAVAILABLE_OPS.has('mark_paid')).toBe(true);
  });

  it('memory-only module ops classify beta-unavailable (S0B: task ops are durable)', () => {
    ['add_project', 'delete_project', 'add_item', 'add_stock', 'remove_stock', 'delete_item']
      .forEach((op) => expect(classifyJakeAction({ op })).toBe(JAKE_ACTION.BETA_UNAVAILABLE));
  });

  it('S0B: individual task ops classify durable; bulk delete_all tasks stays contained', () => {
    ['add_task', 'update_task', 'delete_task']
      .forEach((op) => expect(classifyJakeAction({ op })).toBe(JAKE_ACTION.DURABLE));
    expect(classifyJakeAction({ op: 'delete_all', entity: 'tasks' })).toBe(JAKE_ACTION.BETA_UNAVAILABLE);
  });

  it('unknown op fails closed', () => {
    expect(classifyJakeAction({ op: 'launch_rockets' })).toBe(JAKE_ACTION.UNKNOWN);
    expect(classifyJakeAction({})).toBe(JAKE_ACTION.UNKNOWN);
    expect(classifyJakeAction(null)).toBe(JAKE_ACTION.UNKNOWN);
  });

  it('delete_all is entity-scoped and fails closed on missing/empty/unknown target', () => {
    expect(classifyJakeAction({ op: 'delete_all', entity: 'clients' })).toBe(JAKE_ACTION.DURABLE);
    expect(classifyJakeAction({ op: 'delete_all', entity: 'transactions' })).toBe(JAKE_ACTION.DURABLE);
    expect(classifyJakeAction({ op: 'delete_all', entity: 'inventory' })).toBe(JAKE_ACTION.BETA_UNAVAILABLE);
    expect(classifyJakeAction({ op: 'delete_all', entity: 'tasks' })).toBe(JAKE_ACTION.BETA_UNAVAILABLE);
    expect(classifyJakeAction({ op: 'delete_all', entity: 'projects' })).toBe(JAKE_ACTION.BETA_UNAVAILABLE);
    expect(classifyJakeAction({ op: 'delete_all', entity: 'nonsense' })).toBe(JAKE_ACTION.UNKNOWN);
    // finding 5: missing / empty entity must NOT default to inventory — fail closed.
    expect(classifyJakeAction({ op: 'delete_all' })).toBe(JAKE_ACTION.UNKNOWN);
    expect(classifyJakeAction({ op: 'delete_all', entity: '' })).toBe(JAKE_ACTION.UNKNOWN);
  });
});

describe('auto-income synthesis containment (finding 3)', () => {
  it('add_client → completed_paid + value triggers auto-income (memory-only)', () => {
    expect(triggersAutoIncome({ op: 'add_client', name: 'דני', status: 'completed_paid', value: 3000 })).toBe(true);
    expect(triggersAutoIncome({ op: 'add_client', name: 'דני', status: 'שולם', value: 3000 })).toBe(true);
    // lead / no value → no synthesis
    expect(triggersAutoIncome({ op: 'add_client', name: 'דני', status: 'lead', value: 3000 })).toBe(false);
    expect(triggersAutoIncome({ op: 'add_client', name: 'דני', status: 'completed_paid', value: 0 })).toBe(false);
  });

  it('update_client that lands a client in completed_paid + value triggers synthesis', () => {
    const clients = [{ id: 'c1', name: 'דני כהן', status: 'active', value: 3000 }];
    expect(triggersAutoIncome({ op: 'update_client', client: 'דני כהן', status: 'completed_paid' }, clients)).toBe(true);
    // changing a value on an already-paid client also updates the memory auto-tx
    const paid = [{ id: 'c1', name: 'דני כהן', status: 'completed_paid', value: 3000 }];
    expect(triggersAutoIncome({ op: 'update_client', client: 'דני כהן', value: 5000 }, paid)).toBe(true);
    // moving AWAY from paid does not synthesise income → durable status change
    expect(triggersAutoIncome({ op: 'update_client', client: 'דני כהן', status: 'active' }, paid)).toBe(false);
  });

  it('plain durable CRM ops do not trigger synthesis', () => {
    expect(triggersAutoIncome({ op: 'add_income', amount: 500 })).toBe(false);
    expect(triggersAutoIncome({ op: 'update_client', client: 'x', phone: '050' }, [])).toBe(false);
  });

  it('cloud mode: mark_paid and paid-client payloads are blocked; direct income stays allowed', () => {
    const clients = [{ id: 'c1', name: 'דני כהן', status: 'active', value: 3000 }];
    const r = partitionJakeActions([
      { op: 'mark_paid', client: 'דני כהן' },
      { op: 'add_client', name: 'רון', status: 'completed_paid', value: 1000 },
      { op: 'update_client', client: 'דני כהן', status: 'completed_paid' },
      { op: 'add_income', amount: 800 },
      { op: 'add_client', name: 'ליד חדש', status: 'lead' },
    ], { isCloudBeta: true, clients });
    const allowedOps = r.allowed.map((a) => a.op);
    expect(allowedOps).toContain('add_income');
    expect(allowedOps).toContain('add_client'); // the plain lead add
    expect(r.allowed.find((a) => a.op === 'add_client' && a.status === 'completed_paid')).toBeUndefined();
    const blockedOps = r.blocked.map((a) => a.op);
    expect(blockedOps).toContain('mark_paid');
    expect(r.blocked.filter((a) => a.op === 'add_client').length).toBe(1); // paid one
    expect(r.blocked.filter((a) => a.op === 'update_client').length).toBe(1);
    expect(r.message).toMatch(/תשלום|הכנסה/);
  });
});

describe('partitionJakeActions', () => {
  it('local mode: nothing is blocked (localStorage is durable)', () => {
    const acts = [{ op: 'add_task', title: 'x' }, { op: 'add_client', name: 'y' }];
    const r = partitionJakeActions(acts, { isCloudBeta: false });
    expect(r.allowed).toEqual(acts);
    expect(r.blocked).toEqual([]);
    expect(r.message).toBe('');
  });

  it('cloud mode: durable allowed, memory-only blocked', () => {
    const durable = { op: 'add_client', name: 'דני' };
    const blocked = { op: 'add_project', name: 'פרויקט' };
    const r = partitionJakeActions([durable, blocked], { isCloudBeta: true });
    expect(r.allowed).toEqual([durable]);
    expect(r.blocked).toEqual([blocked]);
    expect(r.message).toContain('פרויקטים');
    expect(r.message.length).toBeGreaterThan(0);
  });

  it('S0B cloud mode: durable task ops are allowed (not blocked)', () => {
    const r = partitionJakeActions([
      { op: 'add_task', title: 'לשלוח סקיצה' },
      { op: 'update_task', task: 'x', set: { status: 'done' } },
      { op: 'delete_task', task: 'x' },
    ], { isCloudBeta: true });
    expect(r.blocked).toEqual([]);
    expect(r.allowed.map((a) => a.op)).toEqual(['add_task', 'update_task', 'delete_task']);
    expect(r.message).toBe('');
  });

  it('cloud mode: unknown op is blocked (fail closed), not silently allowed', () => {
    const r = partitionJakeActions([{ op: 'hack_the_gibson' }], { isCloudBeta: true });
    expect(r.allowed).toEqual([]);
    expect(r.blocked.length).toBe(1);
  });

  it('info-only (no actions) yields nothing allowed and nothing blocked', () => {
    const r = partitionJakeActions([], { isCloudBeta: true });
    expect(r.allowed).toEqual([]);
    expect(r.blocked).toEqual([]);
    expect(r.message).toBe('');
  });

  it('mixed inventory + project batch reports both capabilities', () => {
    const r = partitionJakeActions([{ op: 'add_item', name: 'a' }, { op: 'add_project', name: 'b' }], { isCloudBeta: true });
    expect(r.allowed).toEqual([]);
    expect(r.blocked.length).toBe(2);
    expect(r.message).toContain('מלאי');
    expect(r.message).toContain('פרויקטים');
  });

  it('mixed durable + blocked batch (finding 4): durable allowed, blocked reported, message present', () => {
    const durable = { op: 'add_client', name: 'דני', status: 'lead' };
    const blocked = { op: 'add_project', name: 'פרויקט' };
    const r = partitionJakeActions([durable, blocked], { isCloudBeta: true });
    expect(r.allowed).toEqual([durable]); // client proceeds to the confirm card
    expect(r.blocked).toEqual([blocked]); // project never reaches a card / execution
    expect(r.message).toContain('פרויקטים');
  });
});

describe('beta messages + modules', () => {
  it('blocked message names durable capabilities that DO persist', () => {
    const msg = betaBlockedMessage([{ op: 'add_project' }]);
    expect(msg).toContain('לקוחות');
    expect(msg).toMatch(/בטא/);
  });

  it('hidden modules are exactly the S0A Memory-Only set + growth (S0D) + adstudio (S0F.1)', () => {
    expect([...BETA_HIDDEN_MODULES].sort()).toEqual(['activity', 'adstudio', 'growth', 'inventory', 'projects', 'templates']);
  });

  it('S0B: the tasks/follow-ups beta note is gone (both are durable); module copy remains', () => {
    expect(BETA_MESSAGES.tasks).toBeUndefined();
    expect(BETA_MESSAGES.moduleTitle).toContain('בטא');
    expect(BETA_MESSAGES.moduleHint).toContain('בטא');
  });
});

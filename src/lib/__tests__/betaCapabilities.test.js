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

  it('memory-only types are the project/task/inventory/link/file/comm mutations', () => {
    ['ADD_TASK', 'UPDATE_TASK', 'DELETE_TASK', 'ADD_PROJECT', 'ADD_ITEM', 'ADD_COMM']
      .forEach((t) => expect(isMemoryOnlyDispatch(t)).toBe(true));
    ['ADD_CLIENT', 'ADD_QUOTE', 'ADD_TX', 'ADD_LEAD'].forEach((t) => expect(isMemoryOnlyDispatch(t)).toBe(false));
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
    ['add_client', 'update_client', 'delete_client', 'add_quote', 'mark_paid', 'add_income', 'move_pipeline', 'add_lead', 'delete_tx']
      .forEach((op) => expect(classifyJakeAction({ op })).toBe(JAKE_ACTION.DURABLE));
  });

  it('memory-only ops classify beta-unavailable', () => {
    ['add_task', 'update_task', 'delete_task', 'add_project', 'delete_project', 'add_item', 'add_stock', 'remove_stock', 'delete_item']
      .forEach((op) => expect(classifyJakeAction({ op })).toBe(JAKE_ACTION.BETA_UNAVAILABLE));
  });

  it('unknown op fails closed', () => {
    expect(classifyJakeAction({ op: 'launch_rockets' })).toBe(JAKE_ACTION.UNKNOWN);
    expect(classifyJakeAction({})).toBe(JAKE_ACTION.UNKNOWN);
    expect(classifyJakeAction(null)).toBe(JAKE_ACTION.UNKNOWN);
  });

  it('delete_all is entity-scoped', () => {
    expect(classifyJakeAction({ op: 'delete_all', entity: 'clients' })).toBe(JAKE_ACTION.DURABLE);
    expect(classifyJakeAction({ op: 'delete_all', entity: 'transactions' })).toBe(JAKE_ACTION.DURABLE);
    expect(classifyJakeAction({ op: 'delete_all', entity: 'inventory' })).toBe(JAKE_ACTION.BETA_UNAVAILABLE);
    expect(classifyJakeAction({ op: 'delete_all', entity: 'tasks' })).toBe(JAKE_ACTION.BETA_UNAVAILABLE);
    expect(classifyJakeAction({ op: 'delete_all', entity: 'projects' })).toBe(JAKE_ACTION.BETA_UNAVAILABLE);
    expect(classifyJakeAction({ op: 'delete_all', entity: 'nonsense' })).toBe(JAKE_ACTION.UNKNOWN);
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
    const blocked = { op: 'add_task', title: 'לשלוח סקיצה' };
    const r = partitionJakeActions([durable, blocked], { isCloudBeta: true });
    expect(r.allowed).toEqual([durable]);
    expect(r.blocked).toEqual([blocked]);
    expect(r.message).toContain('משימות');
    expect(r.message.length).toBeGreaterThan(0);
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
});

describe('beta messages + modules', () => {
  it('blocked message names durable capabilities that DO persist', () => {
    const msg = betaBlockedMessage([{ op: 'add_task' }]);
    expect(msg).toContain('לקוחות');
    expect(msg).toMatch(/בטא/);
  });

  it('hidden modules are exactly projects/inventory/templates', () => {
    expect([...BETA_HIDDEN_MODULES].sort()).toEqual(['inventory', 'projects', 'templates']);
  });

  it('tasks beta copy is present and calm (no error jargon)', () => {
    expect(BETA_MESSAGES.tasks).toContain('בטא');
    expect(BETA_MESSAGES.tasks).not.toMatch(/error|Error|שגיאה/);
  });
});

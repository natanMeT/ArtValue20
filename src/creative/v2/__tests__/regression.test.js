import { describe, it, expect } from 'vitest';
import * as gemini from '../../../lib/gemini.js';
import { describeActions, extractActions } from '../../../lib/jakeAgent.js';

// H. Regression — prove the slice did not change V1 or existing Jake behavior.
// (The browser-level regressions — Demo Mode loads, production build clean,
// confirm/reconcile UI — are verified via `vite build` + the live preview.)

describe('H. regression — frozen Creative Director V1 public API is intact', () => {
  it('runCreativeDirector and the V1 stages are still exported functions', () => {
    expect(typeof gemini.runCreativeDirector).toBe('function');
    expect(typeof gemini.analyzeBusiness).toBe('function');
    expect(typeof gemini.buildStrategy).toBe('function');
    expect(typeof gemini.brainstormConcepts).toBe('function');
    expect(typeof gemini.expandConcept).toBe('function');
    expect(typeof gemini.toEnglishImagePrompt).toBe('function');
  });
});

describe('H. regression — existing Jake gen-2 functionality is intact', () => {
  const data = {
    clients: [{ id: 'c1', name: 'דני כהן', value: 1000, status: 'active' }],
    inventory: [], outreachLeads: [], projects: [], tasks: [], quotes: [], transactions: [],
  };

  it('describeActions still resolves & renders proposed CRUD ops', () => {
    const lines = describeActions(
      [{ op: 'add_client', name: 'משה לוי', value: 500, status: 'lead' }, { op: 'update_client', client: 'דני', value: 2000 }],
      data,
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('משה לוי');
    expect(lines[1]).toContain('דני כהן'); // existing client resolved from the ref "דני"
  });

  it('extractActions still parses a fenced actions block and keeps the prose', () => {
    const { clean, actions } = extractActions('בוצע\n```actions\n[{"op":"add_client","name":"X"}]\n```');
    expect(actions).toHaveLength(1);
    expect(actions[0].op).toBe('add_client');
    expect(clean).toContain('בוצע');
  });
});

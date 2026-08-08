// ===================================================================
// T1 — Jake action-advertising truthfulness (cloud).
//
// The defect this pins against: the server-owned jake.chat /
// jake.force_actions system prompt used to advertise ops that
// partitionJakeActions BLOCKS in authenticated cloud (inventory ops,
// project ops, mark_paid, and delete_all over inventory/projects/tasks) —
// Jake promised an action, the user asked for it, and the product refused
// one turn later.
//
// Three layers, strongest first:
//   1. EXECUTABLE SEMANTIC INVARIANT — every op advertised in the CLOUD
//      guide must classify DURABLE by the REAL runtime classifier
//      (classifyJakeAction), including every advertised delete_all entity.
//      This replaces truth-by-byte-equality: the truth condition itself is
//      executed, so a future op added to the cloud guide without a durable
//      classification fails here no matter which copy it was typed into.
//   2. Byte-equality drift guards — the Edge constants are VERBATIM copies
//      of the frontend cloud canonicals (same mechanism as every prior
//      pack constant; never keyword matching).
//   3. Local surface unchanged — local/demo keeps the FULL guide and the
//      FULL persona, byte-identical to their canonical constants, still
//      advertising the modules that are durable there.
// ===================================================================
import { describe, it, expect } from 'vitest';
import { ACTIONS_GUIDE, CLOUD_ACTIONS_GUIDE } from '../jakeAgent.js';
import { activePack } from '../jakePack.js';
import {
  classifyJakeAction, JAKE_ACTION, JAKE_BETA_UNAVAILABLE_OPS,
} from '../betaCapabilities.js';
import {
  JAKE_PACK_PERSONA,
  JAKE_PACK_ACTIONS_GUIDE,
  JAKE_PACK_RULES,
  JAKE_PACK_CONFIRM_GUIDE,
  getActionProfile,
} from '../../../supabase/functions/ai-gateway/actionProfiles.ts';

// Every op bullet advertised in a guide: "- op_name — ...". Anchored to the
// line start so prose mentions (e.g. "השתמש ב-add_income") are not double
// counted — the bullet is the advertisement.
const advertisedOps = (guide) => [...guide.matchAll(/^- ([a-z_]+) — /gm)].map((m) => m[1]);

// The advertised delete_all entity list: "- delete_all — ... entity (חובה): a/b/c."
function advertisedBulkEntities(guide) {
  const m = guide.match(/^- delete_all — [^\n]*entity \(חובה\): ([a-z/]+)\./m);
  return m ? m[1].split('/') : null;
}

describe('T1 · executable semantic invariant — advertised ⊆ durable (cloud)', () => {
  it('every op advertised in the cloud guide classifies DURABLE by the runtime classifier', () => {
    const ops = advertisedOps(CLOUD_ACTIONS_GUIDE);
    // Sanity: the guide still advertises a real action surface (a regex that
    // silently matches nothing must not turn this test vacuous).
    expect(ops.length).toBeGreaterThanOrEqual(15);
    for (const op of ops) {
      if (op === 'delete_all') continue; // entity-scoped, asserted below
      expect(classifyJakeAction({ op }), op).toBe(JAKE_ACTION.DURABLE);
    }
    expect(ops).toContain('delete_all');
  });

  it('every advertised delete_all entity classifies DURABLE; memory-only targets are not advertised', () => {
    const entities = advertisedBulkEntities(CLOUD_ACTIONS_GUIDE);
    expect(entities).not.toBeNull();
    expect(entities.length).toBeGreaterThanOrEqual(4);
    for (const entity of entities) {
      expect(classifyJakeAction({ op: 'delete_all', entity }), entity).toBe(JAKE_ACTION.DURABLE);
    }
    for (const blocked of ['inventory', 'projects', 'tasks']) {
      expect(entities.includes(blocked), blocked).toBe(false);
    }
  });

  it('no cloud-blocked op token appears ANYWHERE in the cloud guide or cloud persona', () => {
    for (const op of JAKE_BETA_UNAVAILABLE_OPS) {
      expect(CLOUD_ACTIONS_GUIDE.includes(op), op).toBe(false);
      expect(activePack.cloudPersona.includes(op), op).toBe(false);
    }
  });

  it('the cloud persona does not advertise hidden modules and keeps its identity rules', () => {
    expect(activePack.cloudPersona.includes('מלאי')).toBe(false);
    expect(activePack.cloudPersona.includes('פרויקטים')).toBe(false);
    expect(activePack.cloudPersona).toContain('אתה ג׳יק');
    expect(activePack.cloudPersona).toContain('ההקשר העסקי המאושר של החשבון הפעיל');
  });

  it('the composed cloud system prompts carry no cloud-blocked op token at all', () => {
    for (const action of ['jake.chat', 'jake.force_actions']) {
      const s = getActionProfile(action).systemInstruction;
      for (const op of JAKE_BETA_UNAVAILABLE_OPS) {
        expect(s.includes(op), `${action}:${op}`).toBe(false);
      }
    }
  });
});

describe('T1 · drift guards — Edge constants are verbatim copies of the cloud canonicals', () => {
  it('server actions guide === activePack.cloudActionsGuide === CLOUD_ACTIONS_GUIDE', () => {
    expect(activePack.cloudActionsGuide === CLOUD_ACTIONS_GUIDE).toBe(true);
    expect(JAKE_PACK_ACTIONS_GUIDE === CLOUD_ACTIONS_GUIDE).toBe(true);
    expect(JAKE_PACK_ACTIONS_GUIDE.length).toBe(CLOUD_ACTIONS_GUIDE.length);
  });

  it('server persona === activePack.cloudPersona', () => {
    expect(JAKE_PACK_PERSONA === activePack.cloudPersona).toBe(true);
    expect(JAKE_PACK_PERSONA.length).toBe(activePack.cloudPersona.length);
  });

  it('rules + confirm guide still copy the SHARED canonicals (unchanged by T1)', () => {
    expect(JAKE_PACK_RULES === activePack.rules).toBe(true);
    expect(JAKE_PACK_CONFIRM_GUIDE === activePack.confirmGuide).toBe(true);
  });

  it('the composed cloud prompts embed the CLOUD guide, never the full local guide', () => {
    for (const action of ['jake.chat', 'jake.force_actions']) {
      const s = getActionProfile(action).systemInstruction;
      expect(s.includes(CLOUD_ACTIONS_GUIDE), action).toBe(true);
      expect(s.includes(ACTIONS_GUIDE), action).toBe(false);
    }
    expect(getActionProfile('jake.chat').systemInstruction.includes(JAKE_PACK_PERSONA)).toBe(true);
  });
});

describe('T1 · local/demo surface unchanged', () => {
  it('the pack still carries the FULL guide and FULL persona for local mode', () => {
    expect(activePack.actionsGuide === ACTIONS_GUIDE).toBe(true);
    expect(activePack.persona.includes('מלאי')).toBe(true);
    expect(activePack.persona.includes('פרויקטים')).toBe(true);
  });

  it('the full local guide still advertises every locally-durable module op', () => {
    // In local mode every listed op persists to localStorage, so the full
    // advertising is truthful THERE — T1 must not shrink it. Assert on the
    // BULLETS (the advertisement), not on token presence anywhere: the money
    // rules also mention ops in prose, so a plain includes() cannot detect a
    // deleted bullet.
    const bullets = advertisedOps(ACTIONS_GUIDE);
    for (const op of JAKE_BETA_UNAVAILABLE_OPS) {
      expect(bullets.includes(op), op).toBe(true);
    }
    const entities = advertisedBulkEntities(ACTIONS_GUIDE);
    expect(entities).toContain('inventory');
    expect(entities).toContain('projects');
    expect(entities).toContain('tasks');
  });
});

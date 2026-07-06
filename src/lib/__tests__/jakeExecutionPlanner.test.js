import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PLAN_TYPES, STEP_IDS, HANDOFF_TARGETS, SUGGESTED_ACTIONS, SEED_BUILDERS,
  buildPlan, planFromText,
} from '../jakeExecutionPlanner.js';
import { INTENTS, buildDecision } from '../jakeDecisionEngine.js';
import * as businessBrain from '../../data/businessBrain.js';
import * as growthContext from '../../data/growthContext.js';

// ===================================================================
// Jake Execution Planner — pure deterministic decision → plan.
// Vocabulary integrity, per-intent mappings, seed references, shape
// stability, hostile-input safety, purity. No execution anywhere.
// ===================================================================

const PLAN_KEYS = [
  'intent', 'domain', 'capability', 'workflow', 'planType', 'steps',
  'suggestedNextAction', 'handoffTarget', 'requiresConfirmation', 'seed',
  'confidence', 'reason',
];

// Sample text per intent (all verified Decision Engine routings).
const TEXT_BY_INTENT = {
  create_marketing_asset: 'תכין לי פוסטר על CRM',
  build_campaign: 'תבנה לי קמפיין',
  create_content_plan: 'תכנן חודש תוכן',
  crm_operation: 'כמה לקוחות יש לי?',
  growth_strategy: 'מה כדאי לי לעשות היום?',
  creative_workflow: 'איזה Workflow מתאים?',
  product_visual: 'תכין לי ויזואל למוצר עם פרזנטור',
  product_lock: 'אני רוצה להחליף רקע למוצר',
  business_strategy: 'איך לבדל את השירות שלי',
  studio_prompt: 'תכין לי פרומפט לסטודיו',
  system_help: 'מה אתה יכול לעשות?',
  general_chat: 'מי אתה?',
  unknown: 'אזעטqwe זבל',
};

describe('exports', () => {
  it('exposes the full stable API', () => {
    expect(Array.isArray(PLAN_TYPES)).toBe(true);
    expect(Array.isArray(STEP_IDS)).toBe(true);
    expect(Array.isArray(HANDOFF_TARGETS)).toBe(true);
    expect(Array.isArray(SUGGESTED_ACTIONS)).toBe(true);
    expect(typeof buildPlan).toBe('function');
    expect(typeof planFromText).toBe('function');
    expect(Object.isFrozen(PLAN_TYPES)).toBe(true);
    expect(Object.isFrozen(STEP_IDS)).toBe(true);
  });
});

describe('every intent → full stable-shape plan', () => {
  it('all 13 intents produce a valid plan with only vocabulary values', () => {
    for (const intent of INTENTS) {
      const plan = planFromText(TEXT_BY_INTENT[intent]);
      expect(plan.intent, intent).toBe(intent);
      expect(Object.keys(plan).sort()).toEqual([...PLAN_KEYS].sort());
      expect(PLAN_TYPES, intent).toContain(plan.planType);
      expect(HANDOFF_TARGETS, intent).toContain(plan.handoffTarget);
      expect(SUGGESTED_ACTIONS, intent).toContain(plan.suggestedNextAction);
      expect(typeof plan.requiresConfirmation).toBe('boolean');
      expect(plan.steps.length, intent).toBeGreaterThan(0);
      for (const step of plan.steps) {
        expect(STEP_IDS, `${intent}:${step.id}`).toContain(step.id);
        expect(typeof step.label).toBe('string');
        expect(step.label.length).toBeGreaterThan(0);
        expect(step.status).toBe('planned');
        expect(typeof step.optional).toBe('boolean');
        expect(step.capability === null || typeof step.capability === 'string').toBe(true);
      }
      if (plan.seed !== null) {
        expect(SEED_BUILDERS, intent).toContain(plan.seed.builder);
        expect(Array.isArray(plan.seed.args)).toBe(true);
      }
    }
  });
});

describe('the spec example — poster request', () => {
  it("planFromText('תכין לי פוסטר על CRM') → studio_marketing_asset / fast-image / buildPosterBrief", () => {
    const plan = planFromText('תכין לי פוסטר על CRM');
    expect(plan.intent).toBe('create_marketing_asset');
    expect(plan.planType).toBe('studio_marketing_asset');
    expect(plan.workflow).toBe('fast-image');
    expect(plan.capability).toBe('poster');
    expect(plan.steps.map((s) => s.id)).toEqual(['business-brain', 'poster-brief', 'studio-prompt', 'studio-workflow']);
    expect(plan.suggestedNextAction).toBe('prepare_studio_prompt');
    expect(plan.handoffTarget).toBe('studio');
    expect(plan.requiresConfirmation).toBe(true);
    expect(plan.seed).toEqual({ builder: 'buildPosterBrief', args: ['תכין לי פוסטר על CRM'] });
  });
});

describe('per-intent mappings', () => {
  const planOf = (intent) => planFromText(TEXT_BY_INTENT[intent]);

  it('build_campaign → business_campaign / growth / campaign seed / confirm', () => {
    const p = planOf('build_campaign');
    expect(p.planType).toBe('business_campaign');
    expect(p.steps.map((s) => s.id)).toEqual(['business-brain', 'service-campaign', 'content-sequence', 'follow-up-message']);
    expect(p.handoffTarget).toBe('growth');
    expect(p.requiresConfirmation).toBe(true);
    expect(p.seed.builder).toBe('buildServiceCampaignSeed');
  });

  it('create_content_plan → content_plan / growth / focusService seed arg', () => {
    const p = planOf('create_content_plan');
    expect(p.planType).toBe('content_plan');
    expect(p.handoffTarget).toBe('growth');
    expect(p.seed).toEqual({ builder: 'buildMonthlyContentPlanSeed', args: [{ focusService: TEXT_BY_INTENT.create_content_plan }] });
  });

  it('product_visual → product_visual / studio / product-presenter workflow seed', () => {
    const p = planOf('product_visual');
    expect(p.planType).toBe('product_visual');
    expect(p.steps.map((s) => s.id)).toEqual(['product-visual-brief', 'product-presenter', 'studio-workflow']);
    expect(p.seed.builder).toBe('buildStudioPromptSeed');
    expect(p.seed.args[0]).toBe('product-presenter'); // decision.workflow
  });

  it('product_lock → product_lock_flow matching the real merged B1→B2 flow', () => {
    const p = planOf('product_lock');
    expect(p.planType).toBe('product_lock_flow');
    expect(p.steps.map((s) => s.id)).toEqual(['product-lock', 'exact-composite', 'seam-shadow-blend']);
    expect(p.handoffTarget).toBe('studio');
    expect(p.seed.args[0]).toBe('product-lock');
  });

  it('studio_prompt → studio_marketing_asset with fast-image seed', () => {
    const p = planOf('studio_prompt');
    expect(p.planType).toBe('studio_marketing_asset');
    expect(p.steps.map((s) => s.id)).toEqual(['business-brain', 'studio-prompt', 'studio-workflow']);
    expect(p.seed.args[0]).toBe('fast-image');
  });

  it('crm_operation → crm / conservative confirmation / no seed', () => {
    const p = planOf('crm_operation');
    expect(p.planType).toBe('crm_operation');
    expect(p.steps.map((s) => s.id)).toEqual(['crm-context', 'action-preview']);
    expect(p.handoffTarget).toBe('crm');
    expect(p.requiresConfirmation).toBe(true);
    expect(p.seed).toBeNull();
  });

  it('growth_strategy → growth_focus / no confirmation / daily_focus seed', () => {
    const p = planOf('growth_strategy');
    expect(p.planType).toBe('growth_focus');
    expect(p.requiresConfirmation).toBe(false);
    expect(p.seed).toEqual({ builder: 'buildGrowthPromptSeed', args: ['daily_focus'] });
  });

  it('creative_workflow → advice / workflow target / no seed / no confirmation', () => {
    const p = planOf('creative_workflow');
    expect(p.planType).toBe('creative_workflow_advice');
    expect(p.handoffTarget).toBe('workflow');
    expect(p.requiresConfirmation).toBe(false);
    expect(p.seed).toBeNull();
  });

  it('business_strategy → advice / assistant / brain-context seed', () => {
    const p = planOf('business_strategy');
    expect(p.planType).toBe('business_strategy_advice');
    expect(p.steps.map((s) => s.id)).toEqual(['business-brain', 'positioning', 'offer-angle', 'next-actions']);
    expect(p.handoffTarget).toBe('assistant');
    expect(p.seed).toEqual({ builder: 'buildBusinessBrainContext', args: [] });
  });

  it('system_help / general_chat → direct_answer; unknown → clarify with optional answer', () => {
    expect(planOf('system_help').planType).toBe('direct_answer');
    expect(planOf('system_help').handoffTarget).toBe('assistant');
    const chat = planOf('general_chat');
    expect(chat.planType).toBe('direct_answer');
    expect(chat.handoffTarget).toBeNull();
    expect(chat.requiresConfirmation).toBe(false);
    const unk = planOf('unknown');
    expect(unk.planType).toBe('clarify');
    expect(unk.steps.map((s) => s.id)).toEqual(['ask-clarifying-question', 'answer-directly']);
    expect(unk.steps[0].optional).toBe(false);
    expect(unk.steps[1].optional).toBe(true);
    expect(unk.suggestedNextAction).toBe('ask_clarifying_question');
    expect(unk.handoffTarget).toBeNull();
    expect(unk.seed).toBeNull();
  });
});

describe('seed references are real, whitelisted builders — never called', () => {
  it('every whitelisted seed builder exists as a real export', () => {
    const sources = { ...businessBrain, ...growthContext };
    for (const name of SEED_BUILDERS) {
      expect(typeof sources[name], name).toBe('function');
    }
  });

  it('every plan seed uses only whitelisted builder names', () => {
    for (const intent of INTENTS) {
      const seed = planFromText(TEXT_BY_INTENT[intent]).seed;
      if (seed !== null) expect(SEED_BUILDERS, intent).toContain(seed.builder);
    }
  });
});

describe('planFromText ≡ buildPlan(buildDecision(text))', () => {
  it('deep-equals for every intent sample', () => {
    for (const text of Object.values(TEXT_BY_INTENT)) {
      expect(planFromText(text)).toEqual(buildPlan(buildDecision(text), { userText: text }));
    }
  });
});

describe('hostile inputs never throw', () => {
  it('planFromText survives garbage', () => {
    for (const bad of [null, undefined, 42, {}, [], NaN, '', '   ', '😀'.repeat(60)]) {
      expect(() => planFromText(bad)).not.toThrow();
      const p = planFromText(bad);
      expect(Object.keys(p).sort()).toEqual([...PLAN_KEYS].sort());
    }
  });

  it('buildPlan survives malformed/foreign decisions (→ clarify fallback)', () => {
    for (const bad of [null, undefined, 42, [], {}, { intent: 'fake_intent' }, { intent: 42 }, { intent: 'crm_operation', confidence: 'x' }]) {
      expect(() => buildPlan(bad)).not.toThrow();
    }
    const fallback = buildPlan({ intent: 'not_real' });
    expect(fallback.intent).toBe('unknown');
    expect(fallback.planType).toBe('clarify');
    expect(fallback.confidence).toBe(0.3);
    // a valid foreign decision with a bad confidence is normalized, not rejected
    const norm = buildPlan({ intent: 'crm_operation', domain: 'crm', capability: 'crm-management', workflow: null, confidence: 99, reason: 'x' });
    expect(norm.intent).toBe('crm_operation');
    expect(norm.confidence).toBe(0.3);
  });
});

describe('determinism', () => {
  it('repeated calls are deep-equal and steps are fresh objects (no shared state)', () => {
    const a = planFromText('תכין לי פוסטר');
    const b = planFromText('תכין לי פוסטר');
    expect(a).toEqual(b);
    expect(a.steps).not.toBe(b.steps);
    expect(a.steps[0]).not.toBe(b.steps[0]);
    a.steps[0].status = 'mutated';
    expect(planFromText('תכין לי פוסטר').steps[0].status).toBe('planned');
  });
});

describe('purity · runtime imports Decision Engine only', () => {
  it('single runtime import; no impure APIs, no execution seams', () => {
    const code = readFileSync(fileURLToPath(new URL('../jakeExecutionPlanner.js', import.meta.url)), 'utf8');
    const importLines = code.split('\n').filter((l) => /^\s*import\b/.test(l));
    expect(importLines.length).toBe(1);
    expect(importLines[0]).toMatch(/from '\.\/jakeDecisionEngine\.js'/);
    // executable lines only — the header comment documents the bans
    const codeOnly = code
      .replace(/\/\*[^]*?\*\//g, '')
      .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    for (const banned of ['window.', 'fetch(', 'Date.now(', 'Math.random(', 'localStorage', 'dispatchEvent', 'CustomEvent', 'jake:ask', 'askJake']) {
      expect(codeOnly.includes(banned), banned).toBe(false);
    }
  });
});

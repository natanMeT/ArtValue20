import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  HANDOFF_SOURCES, HANDOFF_TITLES, HANDOFF_DESCRIPTIONS, SEED_RESOLVERS,
  normalizeHandoffTarget, resolvePlanSeed, buildHandoffPayload,
} from '../jakeHandoffResolver.js';
import { SEED_BUILDERS, PLAN_TYPES, HANDOFF_TARGETS, planFromText } from '../jakeExecutionPlanner.js';
import * as businessBrain from '../../data/businessBrain.js';
import * as growthContext from '../../data/growthContext.js';

// ===================================================================
// Jake Handoff Resolver — pure plan → handoff payload. Whitelist seed
// resolution, payload shape/determinism, null/malformed safety, purity.
// Executes nothing.
// ===================================================================

const PAYLOAD_KEYS = [
  'id', 'source', 'target', 'planType', 'workflow', 'suggestedNextAction',
  'title', 'description', 'prompt', 'seed', 'requiresConfirmation',
];

describe('exports', () => {
  it('exposes the full API', () => {
    expect(HANDOFF_SOURCES).toEqual(['jake']);
    expect(typeof HANDOFF_TITLES).toBe('object');
    expect(typeof HANDOFF_DESCRIPTIONS).toBe('object');
    expect(typeof resolvePlanSeed).toBe('function');
    expect(typeof buildHandoffPayload).toBe('function');
    expect(typeof normalizeHandoffTarget).toBe('function');
    expect(Object.isFrozen(SEED_RESOLVERS)).toBe(true);
  });

  it('has a Hebrew title + description for every plan type', () => {
    for (const pt of PLAN_TYPES) {
      expect(typeof HANDOFF_TITLES[pt], pt).toBe('string');
      expect(HANDOFF_TITLES[pt].length, pt).toBeGreaterThan(0);
      expect(typeof HANDOFF_DESCRIPTIONS[pt], pt).toBe('string');
      expect(HANDOFF_DESCRIPTIONS[pt].length, pt).toBeGreaterThan(0);
    }
  });
});

describe('whitelist integrity', () => {
  it('the resolver map covers EXACTLY the planner SEED_BUILDERS', () => {
    expect(Object.keys(SEED_RESOLVERS).sort()).toEqual([...SEED_BUILDERS].sort());
  });

  it('every whitelisted builder is the REAL exported function', () => {
    const sources = { ...businessBrain, ...growthContext };
    for (const name of SEED_BUILDERS) {
      expect(SEED_RESOLVERS[name], name).toBe(sources[name]);
    }
  });
});

describe('end-to-end: the spec poster example', () => {
  it("planFromText('תכין לי פוסטר על CRM') → full studio handoff payload", () => {
    const plan = planFromText('תכין לי פוסטר על CRM');
    const payload = buildHandoffPayload(plan);
    expect(payload.source).toBe('jake');
    expect(payload.target).toBe('studio');
    expect(payload.planType).toBe('studio_marketing_asset');
    expect(payload.workflow).toBe('fast-image');
    expect(payload.requiresConfirmation).toBe(true);
    expect(typeof payload.prompt).toBe('string');
    expect(payload.prompt.length).toBeGreaterThan(100);
    expect(payload.prompt).toContain('פוסטר');            // real poster brief
    expect(payload.prompt).toContain('כללים:');            // safety block resolved through
    expect(payload.seed.builder).toBe('buildPosterBrief');
    expect(payload.id).toBe('jake-studio_marketing_asset'); // deterministic slug
    expect(payload.title).toBe(HANDOFF_TITLES.studio_marketing_asset);
  });
});

describe('per-intent seed resolution', () => {
  const promptOf = (text) => buildHandoffPayload(planFromText(text));

  it('growth focus resolves buildGrowthPromptSeed', () => {
    const p = promptOf('מה כדאי לי לעשות היום?');
    expect(p.seed.builder).toBe('buildGrowthPromptSeed');
    expect(p.prompt).toContain('מוקד פעולה יומי');
  });

  it('business campaign resolves buildServiceCampaignSeed', () => {
    const p = promptOf('תבנה לי קמפיין');
    expect(p.seed.builder).toBe('buildServiceCampaignSeed');
    expect(p.prompt).toContain('קמפיין');
  });

  it('content plan resolves buildMonthlyContentPlanSeed', () => {
    const p = promptOf('תכנן חודש תוכן');
    expect(p.seed.builder).toBe('buildMonthlyContentPlanSeed');
    expect(p.prompt).toContain('תוכנית תוכן');
  });

  it('product visual / product lock / studio prompt resolve buildStudioPromptSeed', () => {
    for (const [text, wf] of [
      ['תכין לי ויזואל למוצר עם פרזנטור', 'product-presenter'],
      ['אני רוצה להחליף רקע למוצר', 'product-lock'],
      ['תכין לי פרומפט לסטודיו', 'fast-image'],
    ]) {
      const p = promptOf(text);
      expect(p.seed.builder, text).toBe('buildStudioPromptSeed');
      expect(p.seed.args[0], text).toBe(wf);
      expect(typeof p.prompt, text).toBe('string');
      expect(p.prompt, text).toContain('כללים:');
    }
  });

  it('business strategy resolves buildBusinessBrainContext', () => {
    const p = promptOf('איך לבדל את השירות שלי');
    expect(p.seed.builder).toBe('buildBusinessBrainContext');
    expect(p.prompt).toContain('ArtValue Business Brain');
  });

  it('null-seed plans return prompt null (crm / workflow advice / chat / unknown)', () => {
    for (const text of ['כמה לקוחות יש לי?', 'איזה Workflow מתאים?', 'מי אתה?', 'אזעטqwe זבל']) {
      const p = promptOf(text);
      expect(p.prompt, text).toBeNull();
      expect(p.seed, text).toBeNull();
    }
  });
});

describe('resolvePlanSeed · safety', () => {
  it('forged unknown builder → null', () => {
    expect(resolvePlanSeed({ seed: { builder: 'evilBuilder', args: [] } })).toBeNull();
    expect(resolvePlanSeed({ seed: { builder: 'constructor', args: [] } })).toBeNull();
    expect(resolvePlanSeed({ seed: { builder: 'toString', args: [] } })).toBeNull();
  });

  it('malformed seeds → null', () => {
    for (const seed of [null, undefined, 'x', 42, [], { builder: 42, args: [] }, { builder: 'buildPosterBrief' }, { args: [] }]) {
      expect(resolvePlanSeed({ seed })).toBeNull();
    }
    expect(resolvePlanSeed(null)).toBeNull();
    expect(resolvePlanSeed('not a plan')).toBeNull();
  });

  it('a builder that throws is caught → null (Proxy options arg throws on property access)', () => {
    const bomb = new Proxy({}, { get() { throw new Error('boom'); } });
    const hostile = { seed: { builder: 'buildMonthlyContentPlanSeed', args: [bomb] } };
    expect(() => resolvePlanSeed(hostile)).not.toThrow();
    expect(resolvePlanSeed(hostile)).toBeNull();
  });
});

describe('buildHandoffPayload · shape + safety', () => {
  it('payload has EXACTLY the 11 stable keys — and no createdAt/timestamp', () => {
    for (const text of ['תכין לי פוסטר', 'כמה לקוחות?', 'מי אתה', 'זבל']) {
      const p = buildHandoffPayload(planFromText(text));
      expect(Object.keys(p).sort()).toEqual([...PAYLOAD_KEYS].sort());
      expect('createdAt' in p).toBe(false);
      expect(HANDOFF_TARGETS).toContain(p.target);
      expect(PLAN_TYPES).toContain(p.planType);
      expect(typeof p.requiresConfirmation).toBe('boolean');
    }
  });

  it('never throws on hostile/malformed input → safe clarify payload', () => {
    for (const bad of [null, undefined, 42, {}, [], NaN, 'hostile string', { planType: 'fake' }, { seed: { builder: 'x' } }]) {
      expect(() => buildHandoffPayload(bad)).not.toThrow();
      const p = buildHandoffPayload(bad);
      expect(p.planType).toBe('clarify');
      expect(p.id).toBe('jake-unknown');
      expect(p.target).toBeNull();
      expect(p.prompt).toBeNull();
      expect(p.source).toBe('jake');
      expect(p.title).toBe(HANDOFF_TITLES.clarify);
    }
  });

  it('normalizeHandoffTarget validates against the planner vocabulary', () => {
    expect(normalizeHandoffTarget('studio')).toBe('studio');
    expect(normalizeHandoffTarget(null)).toBeNull();
    expect(normalizeHandoffTarget('mars')).toBeNull();
    expect(normalizeHandoffTarget(42)).toBeNull();
  });

  it('is deterministic — repeated calls deep-equal, seed echoed as a fresh copy', () => {
    const plan = planFromText('תכין לי פוסטר על CRM');
    const a = buildHandoffPayload(plan);
    const b = buildHandoffPayload(plan);
    expect(a).toEqual(b);
    expect(a.seed).not.toBe(plan.seed);          // echo is a copy, not the same ref
    expect(a.seed.args).not.toBe(plan.seed.args);
  });
});

describe('purity · source-level', () => {
  it('runtime imports are planner + businessBrain + growthContext only; no impure APIs', () => {
    const code = readFileSync(fileURLToPath(new URL('../jakeHandoffResolver.js', import.meta.url)), 'utf8');
    // multi-line-aware: capture full import statements, not just first lines
    const importLines = (code.match(/import[^]*?from\s*'[^']+';/g) || []).join('\n');
    expect(importLines).toMatch(/from '\.\/jakeExecutionPlanner\.js'/);
    expect(importLines).toMatch(/from '\.\.\/data\/businessBrain\.js'/);
    expect(importLines).toMatch(/from '\.\.\/data\/growthContext\.js'/);
    for (const forbidden of ['Assistant', 'lib/gemini', 'jakePack', 'jakeAgent', 'askJake', 'geminiImage']) {
      expect(importLines.includes(forbidden), forbidden).toBe(false);
    }
    // executable lines only — the header comment documents the bans
    const codeOnly = code
      .replace(/\/\*[^]*?\*\//g, '')
      .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    for (const banned of ['Date.now(', 'Math.random(', 'window.', 'fetch(', 'localStorage', 'sessionStorage', 'dispatchEvent', 'CustomEvent', 'jake:ask', 'askJake', 'navigate', 'useNavigate']) {
      expect(codeOnly.includes(banned), banned).toBe(false);
    }
  });
});

// ===================================================================
// J3 — systemCapabilities TRUTHFULNESS: Jake must not advertise Growth OS
// in authenticated cloud, where BETA_HIDDEN_MODULES hides the whole module
// and every Growth route renders BetaUnavailable.
//
// THE GAP THIS FILE PINS. STATIC_CAPABILITIES.growth-os used to carry no
// availability condition, so the live chat/draft context advertised a
// surface the signed-in cloud user cannot open. The fix is an EXPLICIT
// requirement (requires: { module: 'growth' }) evaluated against a
// runtime hidden-modules set that the LIVE CALLER passes — the pure data
// layer never decides the mode itself, and a missing set fails OPEN so
// the frozen legacy builder and local/demo stay byte-identical.
//
// Every positive test here EXECUTES the real shipped path
//   withBusinessBrain → buildAccountBusinessContext → systemCapabilities
// (no rewritten simulation), matching the jakeCampaigns.test.js precedent.
//
// NO network, NO model, NO Gateway, NO store.
// ===================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withBusinessBrain } from '../jakeBusinessContext.js';
import { systemCapabilities, buildAccountBusinessContext, buildBusinessBrainContext } from '../../data/businessBrain.js';
import { studioAvailability } from '../studioModes.js';
import { BETA_HIDDEN_MODULES } from '../betaCapabilities.js';
import { artValuePack } from '../jakePack.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const CRM_CONTEXT = '- לקוחות ב-CRM: 12 סה״כ.\n- החודש: הכנסות 5,000 ₪.';
const MARKETING_Q = 'תכין לי פוסט על CRM';
const CAMPAIGN_Q = 'מה קורה עם הקמפיינים שלי?';
const PROFILE = {
  businessName: 'סטודיו אלפא', positioning: 'עיצוב מותגים', audiences: ['יזמים'],
  tone: ['חד'], services: [{ name: 'מיתוג', pitch: 'לוגו וזהות' }],
};

// EXACTLY the shape api.fetchAll() returns (jakeCampaigns.test.js precedent) —
// so T4 reproduces the diagnosed wire context through the REAL pack builder.
const cloudData = (extra = {}) => ({
  clients: [], quotes: [], transactions: [], outreachLeads: [], tasks: [],
  businessProfile: PROFILE, charges: [], payments: [],
  meta: { source: 'supabase' },
  ...extra,
});

// The two Hebrew/Latin markers of the growth-os capability line.
const GROWTH_MARKERS = ['Growth OS', 'מרכז הצמיחה'];

// ---- T1 · cloud Growth absence --------------------------------------------

describe('T1 — cloud: the real hidden set removes Growth from the wire context', () => {
  const cloud = withBusinessBrain(CRM_CONTEXT, MARKETING_Q, PROFILE, BETA_HIDDEN_MODULES);
  const local = withBusinessBrain(CRM_CONTEXT, MARKETING_Q, PROFILE, null);

  it('the cloud context advertises no Growth capability', () => {
    for (const m of GROWTH_MARKERS) expect(cloud, m).not.toContain(m);
  });

  it('positive control: the same call without a hidden set DOES advertise Growth', () => {
    for (const m of GROWTH_MARKERS) expect(local, m).toContain(m);
  });

  it('the cloud hidden set actually contains growth (the pin is not vacuous)', () => {
    expect(BETA_HIDDEN_MODULES.has('growth')).toBe(true);
  });

  it('decision 4: Growth is SILENTLY absent — no replacement unavailability wording', () => {
    expect(cloud).not.toContain('Growth אינו זמין');
    expect(cloud).not.toContain('אינו זמין בענן');
  });
});

// ---- T2 · local/demo byte identity ----------------------------------------

describe('T2 — local/demo: the 4-arg null path is byte-identical to the legacy 3-arg path', () => {
  const CASES = [
    ['configured + marketing', PROFILE, MARKETING_Q],
    ['configured + context question', PROFILE, 'מה שם העסק שלי?'],
    ['configured + lean CRM', PROFILE, 'כמה לקוחות יש לי?'],
    ['unconfigured + marketing', null, MARKETING_Q],
    ['unconfigured + lean CRM', null, 'כמה לקוחות יש לי?'],
  ];

  it('every case: 3-arg === 4-arg with null', () => {
    for (const [label, profile, q] of CASES) {
      expect(withBusinessBrain(CRM_CONTEXT, q, profile, null), label)
        .toBe(withBusinessBrain(CRM_CONTEXT, q, profile));
    }
  });

  it('the configured local output still advertises Growth OS', () => {
    const out = withBusinessBrain(CRM_CONTEXT, MARKETING_Q, PROFILE, null);
    for (const m of GROWTH_MARKERS) expect(out, m).toContain(m);
  });
});

// ---- T3 · frozen legacy builder byte identity ------------------------------

describe('T3 — the frozen legacy builder is untouched by module filtering', () => {
  it('deterministic and still advertising Growth OS (fail-open default)', () => {
    const a = buildBusinessBrainContext();
    expect(buildBusinessBrainContext()).toBe(a);
    expect(a).toContain('Growth OS');
  });

  it('the legacy builder SOURCE never reads hiddenModules — no option exists to pass', () => {
    const src = read('../../data/businessBrain.js');
    const start = src.indexOf('export function buildBusinessBrainContext');
    const end = src.indexOf('// Account-aware Business Context (S0D)');
    const fn = src.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(fn).not.toContain('hiddenModules');
  });
});

// ---- T4 · campaign-question wire reproduction ------------------------------

describe('T4 — the diagnosed defect: a campaign question no longer carries Growth in cloud', () => {
  const wireCtx = artValuePack.buildContext(cloudData());

  it('cloud wire context for the campaign question is Growth-free', () => {
    const wire = withBusinessBrain(wireCtx, CAMPAIGN_Q, PROFILE, BETA_HIDDEN_MODULES);
    for (const m of GROWTH_MARKERS) expect(wire, m).not.toContain(m);
  });

  it('positive control: the pre-fix behavior (no hidden set) reproduces the defect', () => {
    const wire = withBusinessBrain(wireCtx, CAMPAIGN_Q, PROFILE, null);
    expect(wire).toContain('Growth OS');
  });
});

// ---- T5 · filtering happens BEFORE maxCapabilities slicing ------------------

describe('T5 — hidden modules are removed before the cap, so the slot promotes a real entry', () => {
  it('with cap 4 and growth hidden, the 5th entry (creative-modes) is promoted into the window', () => {
    // Full list order: fast-image, image-studio, growth-os, gallery, creative-modes.
    // Filter-then-slice at cap 4 → [fast-image, image-studio, gallery, creative-modes].
    // A slice-then-filter mutant yields only 3 entries and loses creative-modes.
    const out = buildAccountBusinessContext(null, {
      maxCapabilities: 4,
      availableModes: studioAvailability(),
      hiddenModules: new Set(['growth']),
    });
    expect(out).toContain('מצבי יצירה בסטודיו');
    expect(out).not.toContain('Growth OS');
  });
});

// ---- T6 · static survivors / nothing else changes ---------------------------

describe('T6 — cloud capabilities equal local capabilities minus exactly growth-os', () => {
  const local = systemCapabilities(studioAvailability());
  const cloud = systemCapabilities({ ...studioAvailability(), hiddenModules: BETA_HIDDEN_MODULES });

  it('deep-equal after removing growth-os from the local list — ids, titles, descriptions, order', () => {
    expect(cloud).toEqual(local.filter((c) => c.id !== 'growth-os'));
  });

  it('Image Studio, gallery and the studio lane survive in cloud (decision 6)', () => {
    const ids = cloud.map((c) => c.id);
    for (const kept of ['fast-image', 'image-studio', 'gallery', 'creative-modes']) {
      expect(ids, kept).toContain(kept);
    }
  });

  it('internal fields still never leak (requires stays stripped on the gated entry)', () => {
    for (const c of [...local, ...cloud]) {
      expect(c.requires, c.id).toBeUndefined();
      expect(c.describe, c.id).toBeUndefined();
    }
  });
});

// ---- T7 · Studio mode gating unchanged (fail closed) ------------------------

describe('T7 — Studio MODE gating stays fail-closed while module gating fails open', () => {
  it('empty modes + empty hidden set: every mode-carrying entry and creative-modes still drop', () => {
    const caps = systemCapabilities({ modes: [], modeLabels: [], hiddenModules: new Set() });
    expect(caps.filter((c) => c.mode)).toEqual([]);
    expect(caps.map((c) => c.id)).not.toContain('creative-modes');
    expect(caps.length).toBeGreaterThan(0); // non-Studio surfaces survive
  });

  it('omitting the snapshot entirely still fails closed on modes (pre-J3 contract intact)', () => {
    expect(systemCapabilities().filter((c) => c.mode)).toEqual([]);
  });
});

// ---- T8 · the live Assistant call sites pass the hidden set EXPLICITLY ------

describe('T8 — both live call sites pin the explicit runtime argument (owner decision 3)', () => {
  const assistant = read('../../components/ai/Assistant.jsx');

  it('chat lane passes isSupabaseConfigured ? BETA_HIDDEN_MODULES : null', () => {
    expect(assistant).toContain(
      'chatJake(convo, withBusinessBrain(activePack.buildContext(jakeData()), text, data.businessProfile, isSupabaseConfigured ? BETA_HIDDEN_MODULES : null))',
    );
  });

  it('draft lane passes isSupabaseConfigured ? BETA_HIDDEN_MODULES : null', () => {
    expect(assistant).toContain(
      'draftWithJake(convo, withBusinessBrain(activePack.buildContext(jakeData()), text, data.businessProfile, isSupabaseConfigured ? BETA_HIDDEN_MODULES : null))',
    );
  });

  it('the real set is imported from the one source of truth, not redeclared', () => {
    expect(assistant).toContain("import { partitionJakeActions, BETA_MESSAGES, BETA_HIDDEN_MODULES } from '../../lib/betaCapabilities.js';");
  });

  it('the pure seam module still never decides the mode itself', () => {
    const seam = read('../jakeBusinessContext.js');
    expect(seam).not.toContain('isSupabaseConfigured');
    expect(seam).not.toContain('betaCapabilities');
  });
});

// ---- T9 · S0F.1 campaign containment regression ----------------------------

describe('T9 — the campaign-interception lane is byte-untouched by J3', () => {
  const assistant = read('../../components/ai/Assistant.jsx');

  it('campaign intent still routes to the contained lane before the chat lane', () => {
    expect(assistant).toContain('if (isCampaignRequest(text)) {');
    expect(assistant).toContain('BETA_MESSAGES.creativeCampaignUnavailable');
  });

  it('drafting still yields to campaign intent', () => {
    expect(assistant).toContain('if (isDraftRequest(text) && !isCampaignRequest(text)) {');
  });
});

// ---- T10 · malformed / unknown availability fixtures ------------------------

describe('T10 — malformed or unknown hidden-module input fails OPEN and stays inert', () => {
  const base = systemCapabilities(studioAvailability());

  it('a bare string is NOT iterated into a filter — no filtering happens', () => {
    expect(systemCapabilities({ ...studioAvailability(), hiddenModules: 'growth' })).toEqual(base);
  });

  it('unknown module ids filter nothing', () => {
    expect(systemCapabilities({ ...studioAvailability(), hiddenModules: new Set(['nonexistent-module']) })).toEqual(base);
  });

  it('no accidental string coercion of entries', () => {
    expect(systemCapabilities({ ...studioAvailability(), hiddenModules: new Set(['undefined', 'null']) })).toEqual(base);
  });

  it('an Array works exactly like a Set', () => {
    expect(systemCapabilities({ ...studioAvailability(), hiddenModules: ['growth'] }))
      .toEqual(systemCapabilities({ ...studioAvailability(), hiddenModules: new Set(['growth']) }));
  });

  it('non-collection garbage (object / number / true) → no filtering', () => {
    for (const bad of [{}, 42, true]) {
      expect(systemCapabilities({ ...studioAvailability(), hiddenModules: bad })).toEqual(base);
    }
  });

  it('the seam passes malformed input through unchanged — the data layer is the single normalizer', () => {
    const out = withBusinessBrain(CRM_CONTEXT, MARKETING_Q, PROFILE, 'growth');
    expect(out).toBe(withBusinessBrain(CRM_CONTEXT, MARKETING_Q, PROFILE, null));
  });
});

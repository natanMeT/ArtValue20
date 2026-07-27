import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BUSINESS_BRAIN, BUSINESS_BRAIN_SAFETY, systemCapabilities,
  buildBusinessBrainContext, buildPosterBrief, buildMonthlyContentPlanSeed,
  buildServiceCampaignSeed, buildStudioPromptSeed,
} from '../businessBrain.js';
import { liveWorkflows, soonWorkflows } from '../creativeWorkflows.js';

// ===================================================================
// Jake Business Brain — pure data + deterministic prompt builders.
// No component render, no assistant engine, no events, no model.
// ===================================================================

const ALL_BUILDER_OUTPUTS = () => [
  buildBusinessBrainContext(),
  buildPosterBrief('crm'),
  buildPosterBrief('נושא חופשי כלשהו'),
  buildMonthlyContentPlanSeed(),
  buildServiceCampaignSeed('growth-os'),
  buildServiceCampaignSeed('unknown-service'),
  buildStudioPromptSeed('product-lock', 'שעון יוקרה'),
  buildStudioPromptSeed('no-such-workflow', ''),
];

describe('BUSINESS_BRAIN · structure', () => {
  it('exists and is deeply frozen', () => {
    expect(BUSINESS_BRAIN.id).toBe('artvalue');
    expect(Object.isFrozen(BUSINESS_BRAIN)).toBe(true);
    expect(Object.isFrozen(BUSINESS_BRAIN.profile)).toBe(true);
    expect(Object.isFrozen(BUSINESS_BRAIN.services)).toBe(true);
    expect(Object.isFrozen(BUSINESS_BRAIN.services.crm)).toBe(true);
    expect(Object.isFrozen(BUSINESS_BRAIN.contentPillars)).toBe(true);
    expect(() => { BUSINESS_BRAIN.profile.name = 'x'; }).toThrow();
  });

  it('profile carries the ArtValue name and both positioning lines', () => {
    expect(BUSINESS_BRAIN.profile.name).toBe('ArtValue');
    expect(BUSINESS_BRAIN.profile.positioning).toContain('לא עוד אתר');
    expect(BUSINESS_BRAIN.profile.positioningAlt).toContain('לא עוד CRM גנרי');
    expect(BUSINESS_BRAIN.profile.differentiators.length).toBeGreaterThanOrEqual(3);
    expect(BUSINESS_BRAIN.profile.audiences.length).toBeGreaterThanOrEqual(2);
  });

  it('service catalog includes at least 8 services, each complete', () => {
    const services = Object.values(BUSINESS_BRAIN.services);
    expect(services.length).toBeGreaterThanOrEqual(8);
    const ids = services.map((s) => s.id);
    for (const id of ['crm', 'automations', 'websites', 'landing-pages', 'business-os', 'creative-studio', 'product-visuals', 'growth-os']) {
      expect(ids).toContain(id);
    }
    for (const s of services) {
      expect(s.name.length, s.id).toBeGreaterThan(0);
      expect(s.pitch.length, s.id).toBeGreaterThan(0);
      expect(s.pains.length, s.id).toBeGreaterThan(0);
      expect(s.cta.length, s.id).toBeGreaterThan(0);
    }
  });

  it('visual identity is dark premium with electric lime #d4ff3f', () => {
    expect(BUSINESS_BRAIN.visual.style).toContain('dark premium');
    expect(BUSINESS_BRAIN.visual.style).toContain('Business OS');
    expect(BUSINESS_BRAIN.visual.colors).toContain('#d4ff3f');
    expect(BUSINESS_BRAIN.visual.forbidden.join(' ')).toContain('גיימינג');
    expect(BUSINESS_BRAIN.visual.forbidden.join(' ')).toContain('קריפטו');
  });
});

describe('systemCapabilities · derived registry', () => {
  // systemCapabilities now takes the AUTHORITATIVE set of Studio modes this
  // configuration can open (injected by lib/jakeBusinessContext.js). Supplying
  // every live mode reproduces the original "everything is available" contract.
  const ALL_LIVE_MODES = liveWorkflows().map((w) => w.mode).filter(Boolean);

  it('includes every live workflow (safe fields only) and marks it studio-kind', () => {
    const caps = systemCapabilities(ALL_LIVE_MODES);
    for (const w of liveWorkflows()) {
      const cap = caps.find((c) => c.id === w.id);
      expect(cap, w.id).toBeTruthy();
      expect(cap.kind).toBe('studio');
      expect(cap.title).toBe(w.title);
      expect(cap.engine).toBe(w.engine);
      if (w.mode) expect(cap.mode).toBe(w.mode);
    }
  });

  it('FAILS CLOSED when the available-mode set is omitted', () => {
    // A caller that forgets to inject availability must under-advertise rather
    // than promise a creative mode the Studio would refuse to open.
    const caps = systemCapabilities();
    expect(caps.filter((c) => c.mode)).toEqual([]);
    expect(caps.length).toBeGreaterThan(0); // non-studio surfaces still listed
  });

  it('never includes soon/deferred workflow cards', () => {
    const capIds = systemCapabilities().map((c) => c.id);
    for (const w of soonWorkflows()) {
      expect(capIds, w.id).not.toContain(w.id);
    }
  });

  it('adds the static system surfaces without clobbering studio entries', () => {
    // Studio-related static surfaces carry an explicit availability requirement,
    // so the availability snapshot is supplied here. There is no capability map
    // or subfeature registry any more — both went with the local engine.
    const caps = systemCapabilities({ modes: ALL_LIVE_MODES, modeLabels: [] });
    for (const id of ['image-studio', 'growth-os', 'gallery', 'creative-modes']) {
      const cap = caps.find((c) => c.id === id);
      expect(cap, id).toBeTruthy();
      expect(cap.kind).toBe('system');
    }
    // registry ids are unique
    const ids = caps.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('buildBusinessBrainContext', () => {
  it('is deterministic and includes profile, services, pillars, capabilities and safety block', () => {
    const a = buildBusinessBrainContext();
    expect(buildBusinessBrainContext()).toBe(a);
    expect(a).toContain('ArtValue');
    expect(a).toContain('לא עוד אתר');
    expect(a).toContain('השירותים שאנחנו מוכרים');
    expect(a).toContain('עמודי תוכן');
    expect(a).toContain('יכולות המערכת');
    expect(a).toContain('כללים:');
    for (const rule of BUSINESS_BRAIN_SAFETY) expect(a).toContain(rule);
  });

  it('respects include/max options and stays bounded', () => {
    const slim = buildBusinessBrainContext({ includeCapabilities: false, includeServices: false });
    expect(slim).not.toContain('יכולות המערכת (לשימוש'); // section header (safety block still mentions capabilities)
    expect(slim).not.toContain('השירותים שאנחנו מוכרים');
    expect(slim).toContain('כללים:'); // safety always present
    const limited = buildBusinessBrainContext({ maxServices: 2, maxCapabilities: 3 });
    expect(limited.length).toBeLessThan(buildBusinessBrainContext().length);
    expect(buildBusinessBrainContext({ maxServices: 'x' })).toBe(buildBusinessBrainContext()); // invalid → default
  });
});

describe('buildPosterBrief', () => {
  const REQUIRED_SECTIONS = [
    '1. קונספט מרכזי',
    '2. כותרת לפוסטר',
    '3. טקסט קצר לפוסטר',
    '4. קופי לפוסט',
    '5. CTA',
    '6. פרומפט באנגלית ל־Image Studio',
    '7. רעיון לפולואפ / המשך פרסום',
  ];

  it('includes all 7 required sections and the English image-prompt requirement', () => {
    const brief = buildPosterBrief('crm');
    for (const s of REQUIRED_SECTIONS) expect(brief).toContain(s);
    expect(brief).toContain('באנגלית');
    expect(brief).toContain('Image Studio');
  });

  it('grounds a known service in its pitch, pains and CTA', () => {
    const brief = buildPosterBrief('crm');
    expect(brief).toContain(BUSINESS_BRAIN.services.crm.name);
    expect(brief).toContain(BUSINESS_BRAIN.services.crm.pitch);
    expect(brief).toContain(BUSINESS_BRAIN.services.crm.pains[0]);
    // matches by Hebrew name too
    expect(buildPosterBrief('מערכת CRM חכמה')).toContain(BUSINESS_BRAIN.services.crm.pitch);
  });

  it('handles unknown topics and empty input safely (never throws)', () => {
    const free = buildPosterBrief('סדנת צילום מוצרים');
    expect(free).toContain('סדנת צילום מוצרים');
    expect(free).toContain('אין שירות קטלוגי תואם');
    const empty = buildPosterBrief('');
    expect(empty).toContain('שירותי ArtValue');
    expect(buildPosterBrief(null)).toContain('שירותי ArtValue');
  });
});

describe('buildMonthlyContentPlanSeed', () => {
  it('uses day numbers, never real dates', () => {
    const seed = buildMonthlyContentPlanSeed();
    expect(seed).toContain('30 ימים');
    expect(seed).toContain('מספר יום');
    expect(seed).toContain('בלי תאריכים אמיתיים');
    expect(seed).not.toMatch(/\d{1,2}[./]\d{1,2}[./]\d{2,4}/); // no date-like strings
  });

  it('respects options with safe clamping and focus-service grounding', () => {
    const seed = buildMonthlyContentPlanSeed({ days: 14, focusService: 'growth-os', audience: 'בעלי חנויות' });
    expect(seed).toContain('14 ימים');
    expect(seed).toContain(BUSINESS_BRAIN.services.growthOs.name);
    expect(seed).toContain('בעלי חנויות');
    expect(buildMonthlyContentPlanSeed({ days: 9999 })).toContain('60 ימים'); // clamped
    expect(buildMonthlyContentPlanSeed({ days: 'x' })).toContain('30 ימים'); // fallback
  });
});

describe('buildServiceCampaignSeed', () => {
  it('builds a grounded campaign for a known service', () => {
    const seed = buildServiceCampaignSeed('product-visuals');
    expect(seed).toContain(BUSINESS_BRAIN.services.productVisuals.name);
    expect(seed).toContain(BUSINESS_BRAIN.services.productVisuals.pains[0]);
    expect(seed).toContain('5–7 פוסטים');
    expect(seed).toContain('וואטסאפ');
    expect(seed).toContain('באנגלית');
  });

  it('falls back safely for an unknown service (never throws)', () => {
    const seed = buildServiceCampaignSeed('space-tourism');
    expect(seed).toContain('לא נמצא שירות תואם');
    expect(seed).toContain('ArtValue');
    expect(buildServiceCampaignSeed(null)).toContain('לא נמצא שירות תואם');
  });
});

describe('buildStudioPromptSeed', () => {
  it('grounds a known live workflow in its real title/mode/engine', () => {
    const wf = liveWorkflows().find((w) => w.id === 'product-lock');
    const seed = buildStudioPromptSeed('product-lock', 'שעון יוקרה');
    expect(seed).toContain(wf.title);
    expect(seed).toContain(`מצב סטודיו: ${wf.mode}`);
    expect(seed).toContain('שעון יוקרה');
    expect(seed).toContain('פרומפט יצירה באנגלית');
    // product workflow → pixel-preservation note
    expect(seed).toContain('1:1');
  });

  it('falls back to a generic Image Studio brief for unknown workflows (never throws)', () => {
    const seed = buildStudioPromptSeed('jetpack-mode', 'נושא כלשהו');
    expect(seed).toContain('לא נמצא בין היכולות החיות');
    expect(seed).toContain('Image Studio');
    expect(buildStudioPromptSeed(null, null)).toContain('ויזואל שיווקי ל-ArtValue');
  });

  it('never treats a soon/deferred card as an executable workflow', () => {
    for (const w of soonWorkflows()) {
      const seed = buildStudioPromptSeed(w.id, 'x');
      expect(seed, w.id).toContain('לא נמצא בין היכולות החיות');
    }
  });
});

describe('businessBrain · safety and hygiene', () => {
  it('every builder output carries the full safety block', () => {
    for (const out of ALL_BUILDER_OUTPUTS()) {
      expect(out).toContain('כללים:');
      for (const rule of BUSINESS_BRAIN_SAFETY) expect(out).toContain(rule);
    }
  });

  it('no output contains forbidden overpromising claims', () => {
    const FORBIDDEN = ['מבטיח מכירות', 'תוצאה ודאית', 'הכנסה מובטחת'];
    const blob = ALL_BUILDER_OUTPUTS().join('\n') + JSON.stringify(BUSINESS_BRAIN);
    for (const bad of FORBIDDEN) expect(blob.includes(bad)).toBe(false);
  });

  it('module source imports only allowed data modules (no offer/engine/assistant paths)', () => {
    const code = readFileSync(fileURLToPath(new URL('../businessBrain.js', import.meta.url)), 'utf8');
    const importLines = code.split('\n').filter((l) => /^\s*import\b/.test(l));
    expect(importLines.length).toBeGreaterThan(0);
    for (const line of importLines) {
      expect(line, line).toMatch(/from '\.\/(growthContentAds|creativeWorkflows|creativePresets)\.js'/);
    }
    // comments may NAME forbidden paths (to document the ban) — imports may not
    const importBlob = importLines.join('\n');
    for (const forbidden of ['creative/v2/offer', 'lib/gemini', 'Assistant', 'jakePack', 'geminiImage']) {
      expect(importBlob.includes(forbidden), forbidden).toBe(false);
    }
    // and it is browser-free / clock-free / network-free (call forms — the
    // header comment legitimately NAMES these APIs while banning them)
    for (const banned of ['window.', 'fetch(', 'Date.now(', 'localStorage', 'Math.random']) {
      expect(code.includes(banned), banned).toBe(false);
    }
  });

  it('builders are deterministic across calls', () => {
    expect(buildPosterBrief('crm')).toBe(buildPosterBrief('crm'));
    expect(buildMonthlyContentPlanSeed({ days: 21 })).toBe(buildMonthlyContentPlanSeed({ days: 21 }));
    expect(buildServiceCampaignSeed('crm')).toBe(buildServiceCampaignSeed('crm'));
    expect(buildStudioPromptSeed('fast-image', 'x')).toBe(buildStudioPromptSeed('fast-image', 'x'));
    expect(JSON.stringify(systemCapabilities())).toBe(JSON.stringify(systemCapabilities()));
  });
});

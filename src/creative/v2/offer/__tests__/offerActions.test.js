import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { generateOfferCampaignBrief, createOfferOrchestrator, OFFER_ACTIONS } from '../offerActions.js';
import { validateOfferCampaignBrief } from '../offerSchema.js';
import { ARTVALUE_SERVICES } from '../presets/artValueServices.js';

function req(overrides = {}) {
  return {
    prospect: { businessType: 'משרד תיווך נדל"ן', businessName: 'נדל"ן הצפון' },
    signals: { painPoints: ['לידים נופלים בין הכיסאות'], currentSituation: 'מנהלים באקסל' },
    goal: { objective: 'generate_leads', channel: 'whatsapp', language: 'he-IL' },
    ...overrides,
  };
}

describe('generateOfferCampaignBrief — orchestrator', () => {
  it('exposes a single non-confirm action in the catalogue', () => {
    expect(OFFER_ACTIONS).toHaveLength(1);
    expect(OFFER_ACTIONS[0].name).toBe('generate_offer_campaign_brief');
    expect(OFFER_ACTIONS[0].confirm).toBe(false);
  });

  it('1. returns ok:true with a valid brief for real-estate / תיווך', () => {
    const r = generateOfferCampaignBrief(req());
    expect(r.ok).toBe(true);
    expect(r.degraded).toBe(false);
    expect(r.errors).toEqual([]);
    expect(r.brief).toBeTruthy();
    expect(r.brief.offer.service).toBe(ARTVALUE_SERVICES.smart_crm.name);
  });

  it('2. returns ok:true with a valid brief for a clinic', () => {
    const r = generateOfferCampaignBrief(req({ prospect: { businessType: 'מרפאת שיניים' } }));
    expect(r.ok).toBe(true);
    expect(r.brief.offer.service).toBe(ARTVALUE_SERVICES.automation.name);
  });

  it('3. unknown business type falls back safely (still ok:true, default offer)', () => {
    const r = generateOfferCampaignBrief(req({ prospect: { businessType: 'qqq-zzz-לא-מוכר' } }));
    expect(r.ok).toBe(true);
    expect(r.brief.offer.service).toBe(ARTVALUE_SERVICES.digital_presence.name);
    expect(r.brief.risks.some((x) => x.type === 'generic_business_type')).toBe(true);
  });

  it('4. offerOverride works', () => {
    const r = generateOfferCampaignBrief(req({ offerOverride: { service: 'דף נחיתה', valueProposition: 'דף ממוקד להשקה' } }));
    expect(r.ok).toBe(true);
    expect(r.brief.offer.service).toBe(ARTVALUE_SERVICES.landing_page.name);
    expect(r.brief.offer.valueProposition).toBe('דף ממוקד להשקה');
  });

  it('5. output passes validateOfferCampaignBrief', () => {
    const r = generateOfferCampaignBrief(req());
    expect(validateOfferCampaignBrief(r.brief).ok).toBe(true);
  });

  it('6. deterministic result for identical input', () => {
    expect(generateOfferCampaignBrief(req())).toEqual(generateOfferCampaignBrief(req()));
  });

  it('7. does not mutate input', () => {
    const r = req();
    const snapshot = JSON.parse(JSON.stringify(r));
    generateOfferCampaignBrief(r);
    expect(r).toEqual(snapshot);
  });

  it('8. invalid request returns ok:false and does not throw', () => {
    for (const bad of [null, undefined, 42, 'x', [], {}, { prospect: {} }, { prospect: { businessType: '' } }]) {
      let r;
      expect(() => { r = generateOfferCampaignBrief(bad); }).not.toThrow();
      expect(r.ok).toBe(false);
      expect(r.brief).toBe(null);
      expect(r.degraded).toBe(true);
      expect(Array.isArray(r.errors)).toBe(true);
      expect(r.errors.length).toBeGreaterThan(0);
    }
  });

  it('the optional factory exposes the same behaviour', () => {
    const orch = createOfferOrchestrator();
    expect(orch.offerActions).toBe(OFFER_ACTIONS);
    expect(orch.generateOfferCampaignBrief(req())).toEqual(generateOfferCampaignBrief(req()));
  });
});

// ---------- source-level guarantees scoped to offerActions.js ----------
const SRC_FILE = 'src/creative/v2/offer/offerActions.js';
const rawSrc = fs.readFileSync(SRC_FILE, 'utf8');
const code = rawSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); // strip comments
function importSpecifiers(src) {
  return [...src.matchAll(/(?:^|\s)(?:import|export)\b[^'"\n]*?\bfrom\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
}
const specs = importSpecifiers(rawSrc);

describe('offerActions.js — purity / isolation', () => {
  it('9. contains no persistence/store/localStorage code', () => {
    expect(/localStorage|sessionStorage|indexedDB|\.save\s*\(|persist/i.test(code)).toBe(false);
  });

  it('10. no Gemini/API/provider/model/fetch/dynamic-import code', () => {
    expect(/\bfetch\s*\(/.test(code)).toBe(false);
    expect(/\bimport\s*\(/.test(code)).toBe(false);
    expect(/\brequire\s*\(/.test(code)).toBe(false);
    expect(/gemini|openai|ollama|provider|\/model/i.test(code)).toBe(false);
    for (const s of specs) expect(/gemini|provider|openai|ollama|\/lib\/|\/model/i.test(s), s).toBe(false);
  });

  it('11. does not import poster/', () => {
    for (const s of specs) expect(s.includes('poster'), s).toBe(false);
  });

  it('12. does not import judge/diagnostics/eval', () => {
    for (const s of specs) {
      expect(s.includes('judge'), s).toBe(false);
      expect(s.includes('diagnostics'), s).toBe(false);
      expect(s.includes('eval'), s).toBe(false);
    }
  });

  it('13. imports only sibling offer modules (no runtime/UI escape)', () => {
    for (const s of specs) {
      expect(s.startsWith('./'), `non-sibling import ${s}`).toBe(true);
      expect(s.includes('..'), `parent escape ${s}`).toBe(false);
    }
    expect(specs.sort()).toEqual(['./offerCampaignBridge.js', './offerSchema.js']);
  });

  it('14. no Date.now / new Date / Math.random', () => {
    expect(/Date\.now|new Date\(/.test(code)).toBe(false);
    expect(/Math\.random/.test(code)).toBe(false);
  });
});

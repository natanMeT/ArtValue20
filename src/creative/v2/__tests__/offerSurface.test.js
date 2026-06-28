import { describe, it, expect, vi } from 'vitest';

// Offer Campaign Assistant Surface — composition-root WIRING test.
//
// Proves createArtValueCreative() exposes the deterministic, failure-safe
// generateOfferCampaignBrief action and that it is ArtValue-mapped, model-free,
// persistence-free, and poster-bridge-free.
//
// The two model seams (runCreativeDirector / draftWithJake) are mocked as SPIES
// solely to PROVE they are never called by the offer action — this slice must not
// touch Gemini/API/local model.
const { runSpy, draftSpy } = vi.hoisted(() => ({
  runSpy: vi.fn(async () => ({})),
  draftSpy: vi.fn(async () => ({ text: '' })),
}));
vi.mock('../../../lib/gemini.js', async (importActual) => {
  const actual = await importActual();
  return { ...actual, runCreativeDirector: runSpy, draftWithJake: draftSpy };
});

import { createArtValueCreative } from '../createArtValueCreative.js';
import { validateOfferCampaignBrief } from '../offer/offerSchema.js';
import { ARTVALUE_SERVICES } from '../offer/presets/artValueServices.js';

const emptyData = { clients: [], inventory: [], transactions: [], quotes: [], tasks: [], projects: [], outreachLeads: [], activity: [] };
const make = () => createArtValueCreative({ getData: () => emptyData, user: 'נתן' });

function req(overrides = {}) {
  return {
    prospect: { businessType: 'משרד תיווך נדל"ן', businessName: 'נדל"ן הצפון' },
    signals: { painPoints: ['לידים נופלים בין הכיסאות'], currentSituation: 'מנהלים באקסל' },
    goal: { objective: 'generate_leads', channel: 'whatsapp', language: 'he-IL' },
    ...overrides,
  };
}

describe('Offer Campaign Assistant Surface — createArtValueCreative wiring', () => {
  it('exposes generateOfferCampaignBrief as a function on the surface', () => {
    expect(typeof make().generateOfferCampaignBrief).toBe('function');
  });

  it('valid request → ok:true with a brief that passes validateOfferCampaignBrief', () => {
    const r = make().generateOfferCampaignBrief(req());
    expect(r.ok).toBe(true);
    expect(r.degraded).toBe(false);
    expect(r.errors).toEqual([]);
    expect(validateOfferCampaignBrief(r.brief).ok).toBe(true);
    expect(r.brief.status).toBe('draft');
  });

  it('real-estate / תיווך maps to the smart CRM offer', () => {
    const r = make().generateOfferCampaignBrief(req());
    expect(r.brief.offer.service).toBe(ARTVALUE_SERVICES.smart_crm.name);
  });

  it('clinic / מרפאה maps to the automation offer', () => {
    const r = make().generateOfferCampaignBrief(req({ prospect: { businessType: 'מרפאת שיניים' } }));
    expect(r.ok).toBe(true);
    expect(r.brief.offer.service).toBe(ARTVALUE_SERVICES.automation.name);
  });

  it('unknown business type → digital presence fallback + generic_business_type risk', () => {
    const r = make().generateOfferCampaignBrief(req({ prospect: { businessType: 'qqq-לא-מוכר' } }));
    expect(r.ok).toBe(true);
    expect(r.brief.offer.service).toBe(ARTVALUE_SERVICES.digital_presence.name);
    expect(r.brief.risks.some((x) => x.type === 'generic_business_type')).toBe(true);
  });

  it('invalid request → ok:false / degraded:true and never throws', () => {
    const surface = make();
    for (const bad of [null, undefined, 42, 'x', [], {}, { prospect: {} }, { prospect: { businessType: '' } }]) {
      let r;
      expect(() => { r = surface.generateOfferCampaignBrief(bad); }).not.toThrow();
      expect(r.ok).toBe(false);
      expect(r.brief).toBe(null);
      expect(r.degraded).toBe(true);
      expect(Array.isArray(r.errors) && r.errors.length > 0).toBe(true);
    }
  });

  it('is deterministic for identical input', () => {
    const s = make();
    expect(s.generateOfferCampaignBrief(req())).toEqual(s.generateOfferCampaignBrief(req()));
  });

  it('calls NO model seam (no Gemini/API/local model) and does not mutate input', () => {
    const input = req();
    const snapshot = JSON.parse(JSON.stringify(input));
    make().generateOfferCampaignBrief(input);
    expect(runSpy).not.toHaveBeenCalled();
    expect(draftSpy).not.toHaveBeenCalled();
    expect(input).toEqual(snapshot);
  });

  it('produces a DRAFT brief only — no persisted id, no poster artifact (no store / no poster bridge)', () => {
    const r = make().generateOfferCampaignBrief(req());
    // a persisted entity would carry an id; a draft brief never does
    expect(r.brief.id).toBeUndefined();
    expect(r.brief.status).toBe('draft');
    // posterAdBrief is a TEXT brief, never a rendered / poster-bridge artifact
    expect(typeof r.brief.posterAdBrief.headline).toBe('string');
    expect(r.brief.posterAdBrief.image).toBeUndefined();
    expect(r.brief.posterAdBrief.url).toBeUndefined();
  });
});

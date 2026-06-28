import { describe, it, expect } from 'vitest';
import { buildOfferCampaignBrief, OfferBridgeError, OFFER_DEFAULT_PRESET_ID } from '../offerCampaignBridge.js';
import { validateOfferCampaignBrief } from '../offerSchema.js';
import { ARTVALUE_SERVICES } from '../presets/artValueServices.js';

// A realistic ArtValue prospect: a real-estate office with no CRM.
function makeRequest(overrides = {}) {
  return {
    prospect: { businessType: 'משרד תיווך נדל"ן', businessName: 'נדל"ן הצפון', audience: 'מוכרים וקונים', region: 'צפת' },
    signals: { painPoints: ['לידים נופלים בין הכיסאות'], currentSituation: 'מנהלים הכול באקסל וברשימות' },
    goal: { objective: 'generate_leads', channel: 'whatsapp', language: 'he-IL' },
    ...overrides,
  };
}

describe('buildOfferCampaignBrief — generic engine + ArtValue preset', () => {
  it('1. is deterministic for identical input', () => {
    const a = buildOfferCampaignBrief(makeRequest());
    const b = buildOfferCampaignBrief(makeRequest());
    expect(a).toEqual(b);
  });

  it('2. does not mutate its input', () => {
    const req = makeRequest();
    const snapshot = JSON.parse(JSON.stringify(req));
    buildOfferCampaignBrief(req);
    expect(req).toEqual(snapshot);
  });

  it('3. output contains all required sections and is schema-valid', () => {
    const brief = buildOfferCampaignBrief(makeRequest());
    for (const key of [
      'prospect', 'status', 'preset', 'diagnosis', 'offer', 'campaignAngle',
      'salesMessage', 'whatsappOutreach', 'posterAdBrief', 'landingHero',
      'followUp', 'objectionHandling', 'visualDirection', 'risks',
    ]) {
      expect(brief, `missing section ${key}`).toHaveProperty(key);
    }
    expect(brief.status).toBe('draft');
    expect(brief.preset).toBe(OFFER_DEFAULT_PRESET_ID);
    expect(validateOfferCampaignBrief(brief).ok).toBe(true);
  });

  it('4. maps a known businessType to a relevant ArtValue offer (real-estate → smart CRM)', () => {
    const brief = buildOfferCampaignBrief(makeRequest());
    expect(brief.offer.service).toBe(ARTVALUE_SERVICES.smart_crm.name);
    // diagnosis combines the prospect's own signal pain with preset pains.
    expect(brief.diagnosis.businessPain).toContain('לידים נופלים בין הכיסאות');
    expect(brief.diagnosis.businessPain.length).toBeGreaterThan(1);
  });

  it('4b. an unknown businessType falls back to a default offer + flags a risk', () => {
    const brief = buildOfferCampaignBrief(makeRequest({ prospect: { businessType: 'qqq-zzz-לא-מוכר' } }));
    expect(brief.offer.service).toBe(ARTVALUE_SERVICES.digital_presence.name);
    expect(brief.risks.some((r) => r.type === 'generic_business_type')).toBe(true);
  });

  it('5. offerOverride bypasses preset selection', () => {
    const brief = buildOfferCampaignBrief(makeRequest({
      offerOverride: { service: 'דף נחיתה', valueProposition: 'דף ממוקד להשקה' },
    }));
    expect(brief.offer.service).toBe(ARTVALUE_SERVICES.landing_page.name);
    expect(brief.offer.valueProposition).toBe('דף ממוקד להשקה');
    expect(brief.risks.some((r) => r.type === 'override')).toBe(true);
  });

  it('6. WhatsApp outreach is fully populated', () => {
    const { whatsappOutreach: w } = buildOfferCampaignBrief(makeRequest());
    expect(w.opener.length).toBeGreaterThan(0);
    expect(w.body.length).toBeGreaterThan(0);
    expect(w.cta.length).toBeGreaterThan(0);
    expect(w.opener).toContain('נדל"ן הצפון'); // businessName woven into the opener
  });

  it('7. posterAdBrief is non-empty', () => {
    const { posterAdBrief: p } = buildOfferCampaignBrief(makeRequest());
    expect(p.headline.length).toBeGreaterThan(0);
    expect(p.subheadline.length).toBeGreaterThan(0);
    expect(p.heroIdea.length).toBeGreaterThan(0);
    expect(p.avoidList.length).toBeGreaterThan(0);
  });

  it('8. landingHero is non-empty', () => {
    const { landingHero: l } = buildOfferCampaignBrief(makeRequest());
    expect(l.headline.length).toBeGreaterThan(0);
    expect(l.subheadline.length).toBeGreaterThan(0);
    expect(l.cta.length).toBeGreaterThan(0);
    expect(l.sections.length).toBeGreaterThan(0);
  });

  it('9. followUp is non-empty', () => {
    const { followUp: f } = buildOfferCampaignBrief(makeRequest());
    expect(f.angle.length).toBeGreaterThan(0);
    expect(f.message.length).toBeGreaterThan(0);
  });

  it('10. objectionHandling is populated with well-formed pairs', () => {
    const { objectionHandling } = buildOfferCampaignBrief(makeRequest());
    expect(objectionHandling.length).toBeGreaterThanOrEqual(4);
    for (const o of objectionHandling) {
      expect(o.objection.length).toBeGreaterThan(0);
      expect(o.reply.length).toBeGreaterThan(0);
    }
  });

  it('throws a typed error on a non-object request', () => {
    for (const bad of [null, undefined, 42, 'x', []]) {
      expect(() => buildOfferCampaignBrief(bad)).toThrow(OfferBridgeError);
    }
  });

  it('fills a low-signal risk when no pains/situation are provided', () => {
    const brief = buildOfferCampaignBrief({
      prospect: { businessType: 'משרד תיווך נדל"ן' },
      goal: { objective: 'generate_leads', channel: 'whatsapp' },
    });
    expect(brief.risks.some((r) => r.type === 'low_signal')).toBe(true);
  });

  // ---------- 14. extensibility: a fake second preset flows through unchanged ----------
  const fakePreset = {
    id: 'fake_preset',
    defaultsFor: () => ({ language: 'en-US', tone: ['plain'], channel: 'whatsapp', objective: 'generate_leads' }),
    selectOffer: () => ({
      service: 'Fake Widget Setup',
      serviceId: 'fake_widget',
      valueProposition: 'We install fake widgets that do fake things.',
      whatsIncluded: ['widget A', 'widget B'],
      proofPoints: ['proof one'],
      pains: ['fake pain'],
      angle: { angle: 'fake angle', keyMessage: 'fake key message', hook: 'fake hook?' },
      visual: { mood: 'neutral', heroIdea: 'a single widget', palette: ['gray'] },
      matchType: 'rule',
    }),
    objectionsFor: () => [{ objection: 'why?', reply: 'because.' }],
  };

  it('14a. a fake preset injected via opts.preset works without engine changes', () => {
    const brief = buildOfferCampaignBrief(makeRequest(), { preset: fakePreset });
    expect(brief.preset).toBe('fake_preset');
    expect(brief.offer.service).toBe('Fake Widget Setup');
    expect(brief.campaignAngle.hook).toBe('fake hook?');
    expect(validateOfferCampaignBrief(brief).ok).toBe(true);
  });

  it('14b. a fake preset resolved by id via opts.presets + request.preset works', () => {
    const brief = buildOfferCampaignBrief(
      makeRequest({ preset: 'fake_preset' }),
      { presets: { fake_preset: fakePreset } },
    );
    expect(brief.preset).toBe('fake_preset');
    expect(brief.offer.service).toBe('Fake Widget Setup');
    expect(validateOfferCampaignBrief(brief).ok).toBe(true);
  });
});

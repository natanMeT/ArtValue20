import { describe, it, expect } from 'vitest';
import { buildOfferCampaignBrief } from '../offerCampaignBridge.js';
import { validateOfferCampaignBrief, validateOfferCampaignRequest } from '../offerSchema.js';

const validBrief = () => buildOfferCampaignBrief({
  prospect: { businessType: 'משרד תיווך נדל"ן', businessName: 'נדל"ן הצפון' },
  signals: { painPoints: ['לידים נופלים'] },
  goal: { objective: 'generate_leads', channel: 'whatsapp' },
});

describe('validateOfferCampaignBrief', () => {
  it('11. accepts a well-formed brief', () => {
    const res = validateOfferCampaignBrief(validBrief());
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it('13. never throws on bad input; returns an explicit invalid result', () => {
    for (const bad of [null, undefined, 42, 'x', [], true, NaN]) {
      const res = validateOfferCampaignBrief(bad);
      expect(res.ok).toBe(false);
      expect(Array.isArray(res.errors)).toBe(true);
      expect(res.errors.length).toBeGreaterThan(0);
    }
  });

  it("12a. rejects a wrong status (must be 'draft')", () => {
    const b = validBrief(); b.status = 'saved';
    expect(validateOfferCampaignBrief(b).ok).toBe(false);
  });

  it('12b. rejects missing top-level sections', () => {
    for (const key of [
      'prospect', 'diagnosis', 'offer', 'campaignAngle', 'salesMessage',
      'whatsappOutreach', 'posterAdBrief', 'landingHero', 'followUp',
      'objectionHandling', 'visualDirection', 'risks',
    ]) {
      const b = validBrief(); delete b[key];
      expect(validateOfferCampaignBrief(b).ok, `missing ${key} should be invalid`).toBe(false);
    }
  });

  it('12c. rejects an empty objectionHandling array', () => {
    const b = validBrief(); b.objectionHandling = [];
    expect(validateOfferCampaignBrief(b).ok).toBe(false);
  });

  it('12d. rejects a malformed offer (empty whatsIncluded)', () => {
    const b = validBrief(); b.offer.whatsIncluded = [];
    expect(validateOfferCampaignBrief(b).ok).toBe(false);
  });

  it('12e. rejects a malformed risk level', () => {
    const b = validBrief(); b.risks = [{ type: 'x', level: 'extreme', note: 'n' }];
    expect(validateOfferCampaignBrief(b).ok).toBe(false);
  });

  it('12f. rejects empty businessPain / context', () => {
    const b1 = validBrief(); b1.diagnosis.businessPain = [];
    expect(validateOfferCampaignBrief(b1).ok).toBe(false);
    const b2 = validBrief(); b2.diagnosis.context = '';
    expect(validateOfferCampaignBrief(b2).ok).toBe(false);
  });
});

describe('validateOfferCampaignRequest', () => {
  it('accepts a minimal valid request', () => {
    const res = validateOfferCampaignRequest({
      prospect: { businessType: 'מרפאת שיניים' },
      goal: { objective: 'generate_leads', channel: 'whatsapp' },
    });
    expect(res.ok).toBe(true);
  });

  it('rejects a request without prospect.businessType and never throws', () => {
    for (const bad of [null, {}, { prospect: {} }, { prospect: { businessType: '' } }]) {
      const res = validateOfferCampaignRequest(bad);
      expect(res.ok).toBe(false);
      expect(res.errors.length).toBeGreaterThan(0);
    }
  });

  it('rejects a malformed offerOverride', () => {
    const res = validateOfferCampaignRequest({
      prospect: { businessType: 'x' }, offerOverride: { valueProposition: 'no service' },
    });
    expect(res.ok).toBe(false);
  });
});

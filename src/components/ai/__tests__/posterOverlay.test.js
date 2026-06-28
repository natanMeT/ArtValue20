import { describe, it, expect } from 'vitest';
import { buildPosterOverlay, POSTER_OVERLAY_CTA_FALLBACK } from '../posterOverlay.js';

// A full, realistic OfferCampaignBrief slice (only the fields the overlay reads).
const fullBrief = {
  prospect: { businessType: 'משרד תיווך נדל״ן', businessName: 'נדל״ן הצפון' },
  offer: { service: 'מערכת CRM חכמה', valueProposition: 'כל הלידים במקום אחד' },
  campaignAngle: { angle: 'שום ליד לא הולך לאיבוד', keyMessage: 'כל פנייה מנוהלת ונענית בזמן', hook: 'כמה עסקאות נפלו החודש?' },
  posterAdBrief: { headline: 'כמה עסקאות נפלו החודש?', subheadline: 'כל הלידים במקום אחד', heroIdea: 'מסך CRM', avoidList: [] },
  landingHero: { headline: 'x', subheadline: 'y', cta: 'קבעו שיחה קצרה', sections: [] },
};

describe('posterOverlay — buildPosterOverlay (deterministic Hebrew overlay derivation)', () => {
  it('is deterministic for identical input', () => {
    expect(buildPosterOverlay(fullBrief)).toEqual(buildPosterOverlay(fullBrief));
  });

  it('maps the primary fields from a full brief', () => {
    expect(buildPosterOverlay(fullBrief)).toEqual({
      headline: 'כמה עסקאות נפלו החודש?',
      subheadline: 'כל הלידים במקום אחד',
      cta: 'קבעו שיחה קצרה',
      label: 'מערכת CRM חכמה',
    });
  });

  it('headline fallback chain: posterAdBrief.headline → campaignAngle.keyMessage → offer.service → ""', () => {
    expect(buildPosterOverlay({ posterAdBrief: { headline: 'A' }, campaignAngle: { keyMessage: 'B' }, offer: { service: 'C' } }).headline).toBe('A');
    expect(buildPosterOverlay({ posterAdBrief: {}, campaignAngle: { keyMessage: 'B' }, offer: { service: 'C' } }).headline).toBe('B');
    expect(buildPosterOverlay({ posterAdBrief: {}, campaignAngle: {}, offer: { service: 'C' } }).headline).toBe('C');
    expect(buildPosterOverlay({ posterAdBrief: {}, campaignAngle: {}, offer: {} }).headline).toBe('');
  });

  it('subheadline fallback chain: posterAdBrief.subheadline → offer.valueProposition → ""', () => {
    expect(buildPosterOverlay({ posterAdBrief: { subheadline: 'S' }, offer: { valueProposition: 'V' } }).subheadline).toBe('S');
    expect(buildPosterOverlay({ posterAdBrief: {}, offer: { valueProposition: 'V' } }).subheadline).toBe('V');
    expect(buildPosterOverlay({ posterAdBrief: {}, offer: {} }).subheadline).toBe('');
  });

  it('cta fallback: landingHero.cta → POSTER_OVERLAY_CTA_FALLBACK', () => {
    expect(buildPosterOverlay({ landingHero: { cta: 'בואו נדבר' } }).cta).toBe('בואו נדבר');
    expect(buildPosterOverlay({ landingHero: {} }).cta).toBe(POSTER_OVERLAY_CTA_FALLBACK);
    expect(buildPosterOverlay({}).cta).toBe(POSTER_OVERLAY_CTA_FALLBACK);
    expect(POSTER_OVERLAY_CTA_FALLBACK).toBe('קבעו שיחה קצרה');
  });

  it('label fallback: offer.service → prospect.businessType → ""', () => {
    expect(buildPosterOverlay({ offer: { service: 'SVC' }, prospect: { businessType: 'BT' } }).label).toBe('SVC');
    expect(buildPosterOverlay({ offer: {}, prospect: { businessType: 'BT' } }).label).toBe('BT');
    expect(buildPosterOverlay({ offer: {}, prospect: {} }).label).toBe('');
  });

  it('trims string fields', () => {
    const r = buildPosterOverlay({ posterAdBrief: { headline: '  כותרת  ', subheadline: '\tתת\n' }, offer: { service: '  שירות ' } });
    expect(r.headline).toBe('כותרת');
    expect(r.subheadline).toBe('תת');
    expect(r.label).toBe('שירות');
  });

  it('partial / missing / malformed brief never throws and returns the 4 keys', () => {
    for (const bad of [null, undefined, 42, 'x', [], {}, { offer: null }, { posterAdBrief: 'nope' }]) {
      let r;
      expect(() => { r = buildPosterOverlay(bad); }).not.toThrow();
      expect(Object.keys(r).sort()).toEqual(['cta', 'headline', 'label', 'subheadline']);
      expect(r.cta).toBe(POSTER_OVERLAY_CTA_FALLBACK); // CTA always present
      expect(typeof r.headline).toBe('string');
    }
  });

  it('does not mutate its input', () => {
    const input = JSON.parse(JSON.stringify(fullBrief));
    const snapshot = JSON.parse(JSON.stringify(input));
    buildPosterOverlay(input);
    expect(input).toEqual(snapshot);
  });
});

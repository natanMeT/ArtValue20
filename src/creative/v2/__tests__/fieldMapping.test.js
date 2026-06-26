import { describe, it, expect } from 'vitest';
import { mapRequestToV1, normalizeV1ToResult } from '../creativeDirectorAdapter.js';
import { validRequest, v1OutputFixture } from './fixtures.js';

const V1_BRAND_KEYS = ['business', 'positioning', 'audience', 'industry', 'differentiators', 'emotional_triggers', 'tone', 'trust_signals', 'luxury_level', 'weaknesses', 'do_not', 'palette', 'cards'];

describe('B. field mapping — REQUEST path (canonical → V1)', () => {
  it('maps every required canonical field into the V1 brand', () => {
    const { brand, opts } = mapRequestToV1(validRequest);
    expect(brand.business).toBe('Art Value — סטודיו דיגיטלי');
    expect(brand.positioning).toContain('הגדלת מכירות');
    expect(brand.positioning).toContain('דמו חינם');     // offer folded in
    expect(brand.positioning).toContain('מערכות CRM');    // service NAME folded in
    expect(brand.audience).toBe('בעלי עסקים; בעלי עסקים שמנהלים ידנית');
    expect(brand.tone).toEqual(['פרימיום', 'חד']);
    expect(opts).toEqual({ target: 3, brainstormSize: 12, maxRounds: 1, withCritique: false });
  });

  it('produces EXACTLY the documented V1 brand keys (no invented field)', () => {
    const { brand } = mapRequestToV1(validRequest);
    expect(Object.keys(brand).sort()).toEqual([...V1_BRAND_KEYS].sort());
  });

  it('derives luxury_level deterministically from tone', () => {
    expect(mapRequestToV1(validRequest).brand.luxury_level).toBe('premium'); // tone has פרימיום
    const mid = { ...validRequest, brand: { ...validRequest.brand, tone: ['ידידותי', 'נגיש'] } };
    expect(mapRequestToV1(mid).brand.luxury_level).toBe('mid');
  });

  it('keeps only #hex colors in palette', () => {
    const req = { ...validRequest, brand: { ...validRequest.brand, colors: ['#d4ff3f', 'ירוק', '#abc'] } };
    expect(mapRequestToV1(req).brand.palette).toEqual(['#d4ff3f', '#abc']);
  });

  it('applies documented defaults consistently (empty optionals → V1 [])', () => {
    const minimal = {
      ...validRequest,
      business: { name: 'X', industry: 'Y' },
      brand: { brandName: 'X', audience: ['a'], tone: ['t'], language: 'he-IL' },
    };
    const { brand } = mapRequestToV1(minimal);
    expect(brand.differentiators).toEqual([]);
    expect(brand.emotional_triggers).toEqual([]);
    expect(brand.do_not).toEqual([]);
    expect(brand.palette).toEqual([]);
    expect(brand.weaknesses).toEqual([]);   // Gap 6 default
    expect(brand.trust_signals).toEqual([]); // Gap 6 default
    expect(brand.cards).toEqual([]);         // Gap 6 default
  });

  it('does NOT leak unsupported fields (channel/format/price) into V1', () => {
    const { brand } = mapRequestToV1(validRequest);
    const json = JSON.stringify(brand);
    expect(json).not.toContain('channel');
    expect(json).not.toContain('format');
    expect(json).not.toContain('"price"');   // Gap 1: pricing never sent to V1
    expect('channel' in brand).toBe(false);
    expect('format' in brand).toBe(false);
  });

  it('is deterministic (same input → same output) and does not mutate input', () => {
    const snap = JSON.stringify(validRequest);
    const a = mapRequestToV1(validRequest);
    const b = mapRequestToV1(validRequest);
    expect(a).toEqual(b);
    expect(JSON.stringify(validRequest)).toBe(snap);
  });
});

describe('B. field mapping — RESPONSE path (V1 → canonical), reverse table', () => {
  const result = normalizeV1ToResult(v1OutputFixture, validRequest, {});

  it('maps strategy fields per the table', () => {
    expect(result.strategy.keyMessage).toBe('הופכים בלגן לניהול אחד');     // core_message
    expect(result.strategy.businessProblem).toBe('כל העסק במקום אחד — בלי וואטסאפ ואקסל'); // promise
    expect(result.strategy.audienceInsight).toBe('שייכות');                // triggers.psychological
    expect(result.strategy.strategicDirection).toBe('קולנועי, עמוק, מינימלי-עשיר'); // visual_direction
    expect(result.strategy.campaignObjective).toBe('הגדלת מכירות');        // from REQUEST objective label
  });

  it('maps concept fields per the table, including documented gaps', () => {
    const c = result.concepts[0];
    expect(c.id).toBe('concept-1');
    expect(c.strategicAngle).toBe('בידול דרך פשטות');     // marketing_principle
    expect(c.headlineDirection).toBe('מרכז שליטה אחד');   // copy.headline
    expect(c.heroObject).toBe('glowing control tower');
    expect(c.compositionDirection).toBe('עליון · overlay כהה · משקל 800'); // layout summary
    expect(c.colorDirection).toEqual(['#d4ff3f', '#c7bfff']); // Gap 3: from request brand.colors
    expect(c.risks).toEqual([]);                          // Gap 4: withCritique off
    expect(c.originalityScore).toBe(8.6);                 // Gap 5: from composite total
    expect(c.brandFitScore).toBe(8.6);                    // Gap 5: from composite total
  });

  it('recommends the highest-scoring concept', () => {
    expect(result.recommendedConceptId).toBe('concept-1'); // total 8.6 > 8.1 > 7.9
  });

  it('does not mutate the V1 output', () => {
    const snap = JSON.stringify(v1OutputFixture);
    normalizeV1ToResult(v1OutputFixture, validRequest, {});
    expect(JSON.stringify(v1OutputFixture)).toBe(snap);
  });
});

import { describe, it, expect } from 'vitest';
import {
  validateCreativeCampaignRequest, validateCreativeCampaignResult, validateConceptShape,
  OBJECTIVES, CHANNELS, FORMATS,
} from '../schema.js';
import { validRequest, diverseConcepts } from './fixtures.js';

const validResult = {
  requestId: 'req_test_1',
  strategy: { businessProblem: 'בלגן', campaignObjective: 'הגדלת מכירות', audienceInsight: 'שייכות', strategicDirection: 'קולנועי', keyMessage: 'מסר' },
  concepts: diverseConcepts,
  recommendedConceptId: 'concept-1',
  metadata: { engineVersion: 'creative-director-v1', createdAt: '2026-01-01T00:00:00.000Z' },
};

describe('A. schema — request', () => {
  it('a valid request passes', () => {
    expect(validateCreativeCampaignRequest(validRequest)).toEqual({ ok: true, errors: [] });
  });
  it('missing required field fails', () => {
    const bad = { ...validRequest, business: { ...validRequest.business, name: '' } };
    const r = validateCreativeCampaignRequest(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/business.name/);
  });
  it('unsupported objective enum fails', () => {
    const bad = { ...validRequest, campaign: { ...validRequest.campaign, objective: 'world_domination' } };
    expect(validateCreativeCampaignRequest(bad).ok).toBe(false);
  });
  it('unsupported channel/format enum fails', () => {
    expect(validateCreativeCampaignRequest({ ...validRequest, campaign: { ...validRequest.campaign, channel: 'tiktok' } }).ok).toBe(false);
    expect(validateCreativeCampaignRequest({ ...validRequest, campaign: { ...validRequest.campaign, format: '2:3' } }).ok).toBe(false);
  });
  it('wrong language fails (only he-IL this phase)', () => {
    expect(validateCreativeCampaignRequest({ ...validRequest, brand: { ...validRequest.brand, language: 'en-US' } }).ok).toBe(false);
  });
  it('requestedConceptCount must be exactly 3', () => {
    expect(validateCreativeCampaignRequest({ ...validRequest, requestedConceptCount: 4 }).ok).toBe(false);
  });
  it('rejects non-object', () => {
    expect(validateCreativeCampaignRequest(null).ok).toBe(false);
    expect(validateCreativeCampaignRequest('x').ok).toBe(false);
  });
  it('enum catalogues are the documented sets', () => {
    expect(OBJECTIVES).toContain('generate_leads');
    expect(CHANNELS).toContain('whatsapp');
    expect(FORMATS).toContain('A4');
  });
});

describe('A. schema — result', () => {
  it('a valid result passes', () => {
    expect(validateCreativeCampaignResult(validResult)).toEqual({ ok: true, errors: [] });
  });
  it('fails when not exactly 3 concepts', () => {
    expect(validateCreativeCampaignResult({ ...validResult, concepts: diverseConcepts.slice(0, 2) }).ok).toBe(false);
  });
  it('fails on duplicate concept ids', () => {
    const dup = [diverseConcepts[0], diverseConcepts[1], { ...diverseConcepts[2], id: 'concept-1' }];
    const r = validateCreativeCampaignResult({ ...validResult, concepts: dup });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/unique/);
  });
  it('fails when a concept is missing required fields', () => {
    const broken = [{ ...diverseConcepts[0], heroObject: '' }, diverseConcepts[1], diverseConcepts[2]];
    expect(validateCreativeCampaignResult({ ...validResult, concepts: broken }).ok).toBe(false);
  });
  it('fails when score fields are not numbers', () => {
    const broken = [{ ...diverseConcepts[0], originalityScore: 'high' }, diverseConcepts[1], diverseConcepts[2]];
    expect(validateCreativeCampaignResult({ ...validResult, concepts: broken }).ok).toBe(false);
  });
  it('fails when metadata is missing', () => {
    const { metadata, ...noMeta } = validResult;
    expect(validateCreativeCampaignResult(noMeta).ok).toBe(false);
  });
  it('validateConceptShape pinpoints the offending field', () => {
    expect(validateConceptShape({}, 'c').join(' ')).toMatch(/c\.id/);
  });
});

describe('A. schema — validators are pure (no defaults injected)', () => {
  it('does not mutate the input', () => {
    const snap = JSON.stringify(validRequest);
    validateCreativeCampaignRequest(validRequest);
    expect(JSON.stringify(validRequest)).toBe(snap);
  });
});

import { describe, it, expect } from 'vitest';
import {
  buildComfyPosterPrompt,
  ComfyPosterPromptError,
  POSTER_PROMPT_HEBREW_RE,
  POSTER_PROMPT_NO_TEXT,
} from '../comfyPosterPrompt.js';

// Minimal offer-brief fixtures matching the real OfferCampaignBrief shape (the only
// fields the prompt builder reads: offer.service + visualDirection.{mood,palette}).
const realEstate = {
  offer: { service: 'מערכת CRM חכמה' },
  visualDirection: { mood: 'נקי ומקצועי', heroIdea: 'מסך CRM יחיד', palette: ['כחול עמוק', 'לבן', 'אפור'] },
};
const clinic = {
  offer: { service: 'אוטומציות' },
  visualDirection: { mood: 'רגוע ונקי', heroIdea: 'יומן שמתעדכן לבד', palette: ['טורקיז', 'לבן', 'ירוק רך'] },
};
const unknownService = {
  offer: { service: 'שירות-לא-ממופה' },
  visualDirection: { mood: 'מצב-רוח-לא-ידוע', palette: ['צבע-לא-ידוע'] },
};

describe('comfyPosterPrompt — deterministic English poster prompt builder', () => {
  it('is deterministic for identical input', () => {
    expect(buildComfyPosterPrompt(realEstate)).toEqual(buildComfyPosterPrompt(realEstate));
  });

  it('produces an English-only promptEn and negativeEn (no Hebrew leaks)', () => {
    for (const brief of [realEstate, clinic, unknownService, {}]) {
      const r = buildComfyPosterPrompt(brief);
      expect(POSTER_PROMPT_HEBREW_RE.test(r.promptEn), `Hebrew in promptEn: ${r.promptEn}`).toBe(false);
      expect(POSTER_PROMPT_HEBREW_RE.test(r.negativeEn), `Hebrew in negativeEn: ${r.negativeEn}`).toBe(false);
    }
  });

  it('always includes the no-text constraint (image carries no lettering)', () => {
    const r = buildComfyPosterPrompt(realEstate);
    expect(r.promptEn.includes(POSTER_PROMPT_NO_TEXT)).toBe(true);
    expect(r.negativeEn.includes(POSTER_PROMPT_NO_TEXT)).toBe(true);
    // negative also explicitly bans text/letters/typography/watermark.
    expect(/text|letters|typography|watermark/i.test(r.negativeEn)).toBe(true);
  });

  it('maps the known service to its English iconographic hero theme', () => {
    expect(buildComfyPosterPrompt(realEstate).promptEn).toMatch(/CRM dashboard/i);
    expect(buildComfyPosterPrompt(clinic).promptEn).toMatch(/automated|pipelines|gears/i);
    expect(buildComfyPosterPrompt(realEstate).meta.themeMatched).toBe(true);
  });

  it('maps the Hebrew palette to English colors', () => {
    const r = buildComfyPosterPrompt(realEstate);
    expect(r.promptEn).toMatch(/deep blue/);
    expect(r.promptEn).toMatch(/white/);
    expect(r.promptEn).toMatch(/grey/);
    expect(r.meta.colorCount).toBe(3);
  });

  it('falls back to safe English generics for an unmapped service/mood/color', () => {
    const r = buildComfyPosterPrompt(unknownService);
    expect(POSTER_PROMPT_HEBREW_RE.test(r.promptEn)).toBe(false); // unmapped Hebrew never leaks
    expect(r.meta.themeMatched).toBe(false);
    expect(r.meta.moodMatched).toBe(false);
    expect(r.meta.colorCount).toBe(0); // the unknown Hebrew color is dropped
    expect(r.promptEn).toMatch(/premium/i);
  });

  it('defaults to 4:5 portrait and honors a valid aspect override', () => {
    const def = buildComfyPosterPrompt(realEstate);
    expect(def.aspect).toBe('4:5');
    expect(def.sizeHint).toBe('portrait');
    expect(def.width).toBe(1024);
    expect(def.height).toBe(1280);
    const sq = buildComfyPosterPrompt(realEstate, { aspect: '1:1' });
    expect(sq.aspect).toBe('1:1');
    expect(sq.width).toBe(1024);
    expect(sq.height).toBe(1024);
    // an invalid aspect falls back to the 4:5 default
    expect(buildComfyPosterPrompt(realEstate, { aspect: 'banana' }).aspect).toBe('4:5');
  });

  it('handles a partial/empty offer brief object without throwing', () => {
    for (const partial of [{}, { offer: {} }, { visualDirection: {} }, { offer: { service: '' }, visualDirection: { palette: [] } }]) {
      const r = buildComfyPosterPrompt(partial);
      expect(typeof r.promptEn).toBe('string');
      expect(r.promptEn.length).toBeGreaterThan(0);
      expect(POSTER_PROMPT_HEBREW_RE.test(r.promptEn)).toBe(false);
    }
  });

  it('throws ComfyPosterPromptError for a non-object (malformed) brief', () => {
    for (const bad of [null, undefined, 42, 'x', []]) {
      expect(() => buildComfyPosterPrompt(bad)).toThrow(ComfyPosterPromptError);
    }
  });

  it('does not mutate its input', () => {
    const input = JSON.parse(JSON.stringify(realEstate));
    const snapshot = JSON.parse(JSON.stringify(input));
    buildComfyPosterPrompt(input);
    expect(input).toEqual(snapshot);
  });
});

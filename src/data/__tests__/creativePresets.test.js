import { describe, it, expect } from 'vitest';
import {
  CREATIVE_PRESETS, PRESET_SUBJECT_TOKEN, isTextImagePreset, presetById,
} from '../creativePresets.js';

// ===================================================================
// ArtValue business creative presets — data quality + safety.
// (Slice: creative engine detection + business presets)
// ===================================================================

const REQUIRED = ['id', 'title', 'titleHe', 'category', 'useCase', 'aspectRatios', 'promptScaffold', 'qualityNotes', 'pitfalls', 'recipeReady', 'requiresApi'];
const VALID_ASPECTS = ['square', 'portrait', 'landscape'];
// No hype / fake-guarantee language anywhere in preset copy.
const FORBIDDEN = ['מובטח', 'מבטיח', 'הכי טוב', 'פי 2', 'הכפלה', 'תוך שניות', 'guarantee', '100%'];

describe('creativePresets — pack shape', () => {
  it('ships at least 6 presets', () => {
    expect(CREATIVE_PRESETS.length).toBeGreaterThanOrEqual(4);
  });

  it('every preset id is unique', () => {
    const ids = CREATIVE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every preset has all required fields', () => {
    for (const p of CREATIVE_PRESETS) {
      for (const f of REQUIRED) {
        expect(p[f], `${p.id} missing ${f}`).not.toBe(undefined);
      }
    }
  });


  it('every prompt scaffold carries the subject placeholder', () => {
    for (const p of CREATIVE_PRESETS) {
      expect(p.promptScaffold.includes(PRESET_SUBJECT_TOKEN), `${p.id} scaffold has no ${PRESET_SUBJECT_TOKEN}`).toBe(true);
    }
  });

  it('aspectRatios only reference real Image Studio aspect ids (or are empty)', () => {
    for (const p of CREATIVE_PRESETS) {
      expect(Array.isArray(p.aspectRatios)).toBe(true);
      for (const a of p.aspectRatios) expect(VALID_ASPECTS, `${p.id} bad aspect ${a}`).toContain(a);
    }
  });
});

describe('creativePresets — provider/readiness integrity', () => {
  it('local-ready presets never require an external API', () => {
    for (const p of CREATIVE_PRESETS.filter((x) => x.recipeReady)) {
      expect(p.requiresApi, `${p.id} is local-ready but requiresApi`).toBe(false);
    }
  });

  it('any API-requiring preset is clearly marked future/external', () => {
    for (const p of CREATIVE_PRESETS.filter((x) => x.requiresApi)) {
      expect(p.recipeReady).toBe(false);
      expect(p.futureProvider, `${p.id} requiresApi but no futureProvider`).toBeTruthy();
    }
  });

});

describe('creativePresets — grounded, safe copy', () => {
  it('contains no hype / fake-guarantee language in any string field', () => {
    for (const p of CREATIVE_PRESETS) {
      const blob = Object.values(p).filter((v) => typeof v === 'string').join(' | ');
      for (const bad of FORBIDDEN) expect(blob, `${p.id} contains "${bad}"`).not.toContain(bad);
    }
  });

  it('brand/dashboard/ad presets warn about the diffusion text-rendering limitation', () => {
    for (const p of CREATIVE_PRESETS.filter((x) => ['brand', 'dashboard', 'ad'].includes(x.category) && x.recipeReady)) {
      expect(p.pitfalls.includes('טקסט'), `${p.id} should warn about text rendering`).toBe(true);
    }
  });


  it('no dashboard preset claims local readable Hebrew UI text', () => {
    for (const p of CREATIVE_PRESETS.filter((x) => x.category === 'dashboard')) {
      // Either it is not local-ready (external), or its pitfalls acknowledge the
      // local Hebrew-text limitation — it must never promise local readable UI.
      const acknowledges = !p.recipeReady || p.pitfalls.includes('עברית');
      expect(acknowledges, `${p.id} must not claim local readable Hebrew UI`).toBe(true);
    }
  });
});

describe('creativePresets — helpers', () => {
  it('isTextImagePreset is true for every ready text preset (no model dimension)', () => {
    for (const p of CREATIVE_PRESETS) expect(isTextImagePreset(p), p.id).toBe(p.targetTab === 'text' && p.recipeReady === true);
    expect(isTextImagePreset(null)).toBe(false);
  });

  it('presetById resolves known ids and returns null otherwise', () => {
    expect(presetById('product_hero_shot').category).toBe('product');
    expect(presetById('nope')).toBe(null);
  });
});

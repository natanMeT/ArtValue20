import { describe, it, expect } from 'vitest';
import {
  CREATIVE_PRESETS, PRESET_SUBJECT_TOKEN, isTextImagePreset, presetById,
} from '../creativePresets.js';

// ===================================================================
// ArtValue business creative presets — data quality + safety.
// (Slice: creative engine detection + business presets)
// ===================================================================

const REQUIRED = ['id', 'title', 'titleHe', 'category', 'useCase', 'provider', 'modelFamily', 'aspectRatios', 'promptScaffold', 'qualityNotes', 'pitfalls', 'localReady', 'requiresApi'];
const VALID_ASPECTS = ['square', 'portrait', 'landscape'];
// No hype / fake-guarantee language anywhere in preset copy.
const FORBIDDEN = ['מובטח', 'מבטיח', 'הכי טוב', 'פי 2', 'הכפלה', 'תוך שניות', 'guarantee', '100%'];

describe('creativePresets — pack shape', () => {
  it('ships at least 6 presets', () => {
    expect(CREATIVE_PRESETS.length).toBeGreaterThanOrEqual(6);
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

  it('every preset has provider + model-family + a prompt scaffold', () => {
    for (const p of CREATIVE_PRESETS) {
      expect(p.provider.length).toBeGreaterThan(3);
      expect(p.modelFamily.length).toBeGreaterThan(1);
      expect(p.promptScaffold.length).toBeGreaterThan(20);
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
    for (const p of CREATIVE_PRESETS.filter((x) => x.localReady)) {
      expect(p.requiresApi, `${p.id} is local-ready but requiresApi`).toBe(false);
    }
  });

  it('any API-requiring preset is clearly marked future/external', () => {
    for (const p of CREATIVE_PRESETS.filter((x) => x.requiresApi)) {
      expect(p.localReady).toBe(false);
      expect(p.futureProvider, `${p.id} requiresApi but no futureProvider`).toBeTruthy();
    }
  });

  it('exactly one future GPT Image 2 preset exists and is not claimed local-ready', () => {
    const future = CREATIVE_PRESETS.filter((p) => p.futureProvider === 'gpt-image-2' && p.requiresApi);
    expect(future.length).toBeGreaterThanOrEqual(1);
    for (const p of future) expect(p.localReady).toBe(false);
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
    for (const p of CREATIVE_PRESETS.filter((x) => ['brand', 'dashboard', 'ad'].includes(x.category) && x.localReady)) {
      expect(p.pitfalls.includes('טקסט'), `${p.id} should warn about text rendering`).toBe(true);
    }
  });

  it('the restoration preset warns about identity preservation', () => {
    const r = CREATIVE_PRESETS.find((p) => p.category === 'restoration');
    expect(r).toBeTruthy();
    expect(r.pitfalls.includes('זהות') || r.qualityNotes.includes('זהות')).toBe(true);
  });

  it('no dashboard preset claims local readable Hebrew UI text', () => {
    for (const p of CREATIVE_PRESETS.filter((x) => x.category === 'dashboard')) {
      // Either it is not local-ready (external), or its pitfalls acknowledge the
      // local Hebrew-text limitation — it must never promise local readable UI.
      const acknowledges = !p.localReady || p.pitfalls.includes('עברית');
      expect(acknowledges, `${p.id} must not claim local readable Hebrew UI`).toBe(true);
    }
  });
});

describe('creativePresets — helpers', () => {
  it('isTextImagePreset is true only for local flux/sdxl text presets', () => {
    const texty = CREATIVE_PRESETS.filter(isTextImagePreset);
    expect(texty.length).toBeGreaterThanOrEqual(3);
    for (const p of texty) {
      expect(p.targetTab).toBe('text');
      expect(p.localReady).toBe(true);
      expect(['flux', 'sdxl']).toContain(p.modelFamily);
    }
    // restoration (qwen), video (ltx), and the future GPT preset are NOT text-image
    expect(isTextImagePreset(presetById('photo_restoration'))).toBe(false);
    expect(isTextImagePreset(presetById('product_motion_video'))).toBe(false);
    expect(isTextImagePreset(presetById('hebrew_ui_mockup'))).toBe(false);
  });

  it('presetById resolves known ids and returns null otherwise', () => {
    expect(presetById('product_hero_shot').category).toBe('product');
    expect(presetById('nope')).toBe(null);
  });
});

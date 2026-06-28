// posterExport — PNG export of the final poster (image + baked Hebrew overlay).
// Pure helpers are tested directly; exportPosterPng is tested for its fail-closed
// guards (no real canvas in the node test env). No pixels are asserted.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { exportPosterPng, posterPngFilename, wrapClamp } from '../posterExport.js';

describe('posterExport — posterPngFilename (sanitization + fallback)', () => {
  it('keeps a Hebrew+Latin service name, spaces become dashes', () => {
    expect(posterPngFilename('מערכת CRM חכמה')).toBe('artvalue-poster-מערכת-CRM-חכמה.png');
  });

  it('strips filesystem-illegal characters', () => {
    expect(posterPngFilename('a/b:c')).toBe('artvalue-poster-abc.png');
    expect(posterPngFilename('x*y?z|w')).toBe('artvalue-poster-xyzw.png');
  });

  it('collapses + trims whitespace/dashes', () => {
    expect(posterPngFilename('  hello   world  ')).toBe('artvalue-poster-hello-world.png');
  });

  it('falls back to artvalue-poster.png when empty / missing / all-illegal', () => {
    expect(posterPngFilename('')).toBe('artvalue-poster.png');
    expect(posterPngFilename('   ')).toBe('artvalue-poster.png');
    expect(posterPngFilename(null)).toBe('artvalue-poster.png');
    expect(posterPngFilename(undefined)).toBe('artvalue-poster.png');
    expect(posterPngFilename('***')).toBe('artvalue-poster.png');
  });

  it('never throws for malformed input', () => {
    for (const bad of [null, undefined, 42, {}, [], true]) {
      expect(() => posterPngFilename(bad)).not.toThrow();
      expect(posterPngFilename(bad).endsWith('.png')).toBe(true);
    }
  });
});

describe('posterExport — wrapClamp (greedy wrap + clamp/ellipsis)', () => {
  const len = (s) => s.length; // synthetic measure: width === char count

  it('wraps to width within the line budget', () => {
    expect(wrapClamp(len, 'aaa bbb ccc', 7, 3)).toEqual(['aaa bbb', 'ccc']);
  });

  it('clamps to maxLines and ellipsizes the last line', () => {
    const out = wrapClamp(len, 'aa bb cc dd', 2, 1);
    expect(out).toHaveLength(1);
    expect(out[0].endsWith('…')).toBe(true);
  });

  it('returns [] for empty / missing text', () => {
    expect(wrapClamp(len, '', 10, 2)).toEqual([]);
    expect(wrapClamp(len, null, 10, 2)).toEqual([]);
    expect(wrapClamp(len, undefined, 10, 2)).toEqual([]);
  });

  it('does not break a single over-long word and never throws', () => {
    expect(() => wrapClamp(len, 'verylongword', 3, 2)).not.toThrow();
    expect(wrapClamp(len, 'verylongword', 3, 2)).toEqual(['verylongword']);
  });
});

describe('posterExport — exportPosterPng (fail-closed, never throws)', () => {
  it('empty src returns { ok:false, reason:"no_src" }', async () => {
    await expect(exportPosterPng({ src: '' })).resolves.toEqual({ ok: false, reason: 'no_src' });
    await expect(exportPosterPng({})).resolves.toEqual({ ok: false, reason: 'no_src' });
  });

  it('valid src but no canvas/context returns { ok:false, reason:"no_canvas" }', async () => {
    // node test env: `document` is undefined (or jsdom canvas has no 2d context),
    // so a real export cannot proceed — proving the fail-closed guard.
    const r = await exportPosterPng({ src: 'http://127.0.0.1:8188/view?filename=x.png&type=output', overlay: { headline: 'כותרת' }, service: 'אוטומציות' });
    expect(r).toEqual({ ok: false, reason: 'no_canvas' });
  });

  it('never throws for any (malformed) input', async () => {
    for (const bad of [null, undefined, 42, 'x', [], {}, { src: 123 }]) {
      // eslint-disable-next-line no-await-in-loop
      await expect(exportPosterPng(bad)).resolves.toHaveProperty('ok', false);
    }
  });
});

describe('posterExport — source purity (no provider / token / store / persistence)', () => {
  const raw = fs.readFileSync('src/components/ai/posterExport.js', 'utf8');
  // Strip comments first (mirrors comfyPoster.test.js): scan executable code only.
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('no Pollinations usage or token', () => {
    expect(/pollinat/i.test(code)).toBe(false);
    expect(code.includes('VITE_POLLINATIONS')).toBe(false);
  });

  it('no Gemini / OpenAI / Ollama provider references', () => {
    expect(/gemini|openai|ollama/i.test(code)).toBe(false);
    expect(/VITE_GEMINI/i.test(code)).toBe(false);
  });

  it('no Supabase / DB references', () => {
    expect(/supabase/i.test(code)).toBe(false);
  });

  it('no store / gallery / persistence writes', () => {
    expect(/galleryStore|campaignStore|productionStore/i.test(code)).toBe(false);
    expect(/localStorage|addToGallery/i.test(code)).toBe(false);
  });

  it('imports nothing (fully self-contained)', () => {
    const specs = [...raw.matchAll(/from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(specs).toEqual([]);
  });
});

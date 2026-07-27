import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Slice: Studio Prompt Enhancement → Protected AI Gateway.
// ImageStudio.jsx pulls in the store/router/canvas, so it is not cleanly
// renderable under Vitest. We instead (a) extract
// and run the ACTUAL pure helpers from the shipped source, and (b) source-guard
// the wiring — the same pattern used for the other Edge/page seams in this repo.

const SRC = readFileSync(fileURLToPath(new URL('../ImageStudio.jsx', import.meta.url)), 'utf8');
const IMG = readFileSync(fileURLToPath(new URL('../../lib/hostedImage.js', import.meta.url)), 'utf8');

// Extract a single self-contained function from the source and make it callable.
const extractFn = (name) => {
  const m = SRC.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`));
  expect(m, `${name} present`).not.toBe(null);
  // eslint-disable-next-line no-new-func
  return new Function(`${m[0]}\nreturn ${name};`)();
};
const studioEnhanceText = extractFn('studioEnhanceText');
const studioEnhanceError = extractFn('studioEnhanceError');
// buildStudioEnhancePrompt depends on the instruction constants + selector — extract the chain.
const chain = SRC.match(/const ENHANCE_INSTRUCTIONS[\s\S]*?function buildStudioEnhancePrompt\(idea, kind\) \{[\s\S]*?\n\}/);
expect(chain, 'enhancement helper chain present').not.toBe(null);
// eslint-disable-next-line no-new-func
const buildStudioEnhancePrompt = new Function(`${chain[0]}\nreturn buildStudioEnhancePrompt;`)();

describe('studio prompt-enhance · wiring (source guards)', () => {
  it('imports the protected AI Gateway client', () => {
    expect(/import \{ callAiGateway \} from '\.\.\/lib\/aiGatewayClient\.js'/.test(SRC)).toBe(true);
  });

  it('no longer imports enhanceImagePrompt or gemini.js at all', () => {
    expect(SRC.includes('enhanceImagePrompt')).toBe(false);
    expect(SRC.includes("from '../lib/gemini.js'")).toBe(false);
  });

  it('enhancement calls exactly callAiGateway("studio.prompt_enhance", { prompt })', () => {
    expect(/callAiGateway\('studio\.prompt_enhance',\s*\{\s*prompt:\s*buildStudioEnhancePrompt\(/.test(SRC)).toBe(true);
  });

  it('supplies NO provider / model / key / options authority and no Google endpoint', () => {
    // no direct Google transport or browser key anywhere in the page (the image
    // result label became the neutral 'AI מאובטח' Gateway badge in S4.2)
    for (const banned of ['VITE_GEMINI_API_KEY', 'generativelanguage', 'X-goog-api-key', 'import.meta.env.VITE_GEMINI']) {
      expect(SRC.includes(banned), banned).toBe(false);
    }
    // the executable call site carries only actionType + a { prompt: ... } payload
    const payload = (SRC.match(/callAiGateway\('studio\.prompt_enhance',\s*(\{[^}]*\})/) || [null, ''])[1];
    expect(payload.includes('prompt')).toBe(true);
    for (const authKey of ['provider', 'model', 'apiKey', 'options', 'system']) {
      expect(payload.includes(authKey), authKey).toBe(false);
    }
  });

  it('success reads result.result.text (via studioEnhanceText) and updates the prompt field', () => {
    expect(SRC.includes('studioEnhanceText(res)')).toBe(true);
    expect(/res\.result\.text/.test(SRC)).toBe(true);
    // setPrompt is only reached on success (guarded by `if (better)`)
    expect(/if \(better\) \{\s*[\s\S]*?setPrompt\(better\)/.test(SRC)).toBe(true);
  });

  it('loading starts and always stops (finally → setEnhancing(false))', () => {
    expect(SRC.includes('setEnhancing(true)')).toBe(true);
    expect(/finally \{\s*[\s\S]*?setEnhancing\(false\)/.test(SRC)).toBe(true);
  });

  it('failure surfaces a safe message and NEVER falls back to the legacy Gemini path', () => {
    expect(/else \{\s*[\s\S]*?setError\(studioEnhanceError\(res\)\)/.test(SRC)).toBe(true);
    // enhanceImagePrompt / gemini.js must not appear anywhere as a fallback
    expect(SRC.includes('enhanceImagePrompt')).toBe(false);
  });

  it('is click-triggered only — no automatic call on mount', () => {
    expect(SRC.includes('onClick={enhance}')).toBe(true);
    // `enhance` is passed as a handler reference, never invoked as enhance()
    expect(/\benhance\(\)/.test(SRC)).toBe(false);
  });
});

describe('studio prompt-enhance · image generation path is untouched', () => {
  it('ImageStudio drives the hosted Gateway lane for generation', () => {
    expect(/from '\.\.\/lib\/hostedImage\.js'/.test(SRC)).toBe(true);
    expect(SRC.includes('generateImage')).toBe(true);
    // PRODUCT BOUNDARY (2026-07-27): the local engine entry points are gone from
    // the Studio, not merely unused by it.
    for (const gone of ['editImage', 'inpaintImage', 'qwenCompose', 'productLockBlend', 'ltxVideo', 'flfVideo', 'animateImage', 'geminiImage']) {
      expect(SRC.includes(gone), gone).toBe(false);
    }
  });

  it('hostedImage.js routes the image path through the protected AI Gateway', () => {
    // S4.2 retired the direct browser-Gemini image call: the hosted lane is a
    // single callAiGateway('studio.generate_image', …) attempt, no Google transport.
    expect(IMG.includes("callAiGateway('studio.generate_image'")).toBe(true);
    expect(IMG.includes('generativelanguage.googleapis.com')).toBe(false);
    expect(IMG.includes('X-goog-api-key')).toBe(false);
    expect(IMG.includes('VITE_GEMINI_API_KEY')).toBe(false);
    // this module owns image generation only — never the prompt-enhance action
    expect(IMG.includes('studio.prompt_enhance')).toBe(false);
  });
});

describe('studio prompt-enhance · prompt assembly preserves the enhancement instruction', () => {
  it('keeps the generate instruction verbatim (the edit/inpaint modes are retired)', () => {
    expect(SRC.includes('STAY 100% FAITHFUL')).toBe(true);
    for (const retired of ['keep the person, colors and composition unchanged', 'marked a region of a photo to replace']) {
      expect(SRC.includes(retired), retired).toBe(false);
    }
  });

  it('assembles instruction + user request into one plain-text prompt', () => {
    const p = buildStudioEnhancePrompt('לוגו זהב על רקע לבן', 'generate');
    expect(p.includes('STAY 100% FAITHFUL')).toBe(true);       // instruction preserved
    expect(p.includes('USER REQUEST')).toBe(true);
    expect(p.includes('לוגו זהב על רקע לבן')).toBe(true);        // user idea included
  });

  it('there is exactly ONE instruction now, whatever is passed', () => {
    for (const arg of [undefined, 'edit', 'inpaint', 'weird']) {
      expect(buildStudioEnhancePrompt('x', arg).includes('STAY 100% FAITHFUL')).toBe(true);
    }
  });
});

describe('studio prompt-enhance · result + error handling (real helpers)', () => {
  it('success extracts result.result.text, trimmed and unquoted', () => {
    expect(studioEnhanceText({ ok: true, result: { text: '  "golden logo, white background"  ' } }))
      .toBe('golden logo, white background');
  });

  it('any non-success / malformed result yields empty (so the prompt is preserved)', () => {
    for (const res of [
      null, undefined, {}, [], 'x', 42,
      { ok: false, error: { code: 'unauthenticated' } },
      { ok: true, result: null },
      { ok: true, result: { text: 123 } },
      { ok: true },
    ]) {
      expect(studioEnhanceText(res), JSON.stringify(res)).toBe('');
    }
  });

  it('each Gateway failure code maps to a safe, generic message (no server detail)', () => {
    expect(studioEnhanceError({ ok: false, error: { code: 'unauthenticated' } })).toBe('צריך להתחבר כדי לשדרג פרומפט');
    const busy = 'שירות השדרוג עמוס כרגע — נסה שוב עוד רגע';
    expect(studioEnhanceError({ ok: false, error: { code: 'rate_limited' } })).toBe(busy);
    expect(studioEnhanceError({ ok: false, error: { code: 'budget_exceeded' } })).toBe(busy);
    expect(studioEnhanceError({ ok: false, error: { code: 'budget_guard_unavailable' } })).toBe(busy);
    expect(studioEnhanceError({ ok: false, error: { code: 'network_error' } })).toBe('שגיאה בשדרוג הפרומפט');
    expect(studioEnhanceError(null)).toBe('שגיאה בשדרוג הפרומפט');
  });

  it('the error message never echoes raw server / provider / DB text', () => {
    const leaky = { ok: false, error: { code: 'budget_guard_unavailable', message: 'PostgREST RPC failed: service_role secret sk-LEAK' } };
    const msg = studioEnhanceError(leaky);
    for (const bad of ['PostgREST', 'RPC', 'service_role', 'secret', 'sk-LEAK']) {
      expect(msg.includes(bad), bad).toBe(false);
    }
  });

  it('helpers never throw on hostile input', () => {
    for (const h of [null, undefined, 42, 'x', {}, [], NaN, true]) {
      expect(() => studioEnhanceText(h)).not.toThrow();
      expect(() => studioEnhanceError(h)).not.toThrow();
    }
  });
});

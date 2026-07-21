// ===================================================================
// M2 J3C S2 — Verified dead-code retirement (source pins).
//
// Seven legacy symbols with zero non-test production callers were deleted:
//   gemini.js      — chatWithLocalModel, forceActions, enhanceImagePrompt,
//                    demoEnhance
//   geminiImage.js — imageEngineName, generatePulidScene, qwenEdit
// Orphans removed with them (proven single-caller): the
// `import { activePack, buildJakeSystem } from './jakePack.js'` line and the
// JAKE_NO_THINK constant in gemini.js.
//
// This suite pins: the symbols are gone, no non-test source references them,
// the active replacements and Gateway lanes are intact, the generateImage engine
// policy holds (local precedence + hosted Gateway; browser Gemini retired in
// S4.2), and Creative V1 survives byte-for-byte in the sections these deletions
// touched nothing near.
// ===================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const gemini = read('../gemini.js');
const geminiImage = read('../geminiImage.js');
const imageStudio = read('../../pages/ImageStudio.jsx');

// \b-bounded so forceActionsJake / qwenEditGraph / hasQwenEditNode never match.
const DEAD = [
  /\bchatWithLocalModel\b/,
  /\bforceActions\b/,
  /\benhanceImagePrompt\b/,
  /\bdemoEnhance\b/,
  /\bimageEngineName\b/,
  /\bgeneratePulidScene\b/,
  /\bqwenEdit\b/,
];

describe('S2 · the seven approved dead symbols are gone from the two files', () => {
  it('gemini.js no longer defines its four', () => {
    for (const re of DEAD.slice(0, 4)) {
      // allow the retirement note comments, which never use the bare identifier
      // in code position — so simply: the identifier must not appear at all,
      // except inside the explicit "retired here" comment lines.
      const stripped = gemini.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
      expect(re.test(stripped), String(re)).toBe(false);
    }
  });

  it('geminiImage.js no longer defines its three', () => {
    const stripped = geminiImage.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    for (const re of DEAD.slice(4)) {
      expect(re.test(stripped), String(re)).toBe(false);
    }
  });

  it('the proven orphans went with them: jakePack import and JAKE_NO_THINK', () => {
    expect(gemini.includes("from './jakePack.js'")).toBe(false);
    expect(gemini.includes('JAKE_NO_THINK')).toBe(false);
    expect(gemini.includes('activePack')).toBe(false);
    expect(gemini.includes('buildJakeSystem')).toBe(false);
    // the sibling NO_THINK (Creative chatJson) is NOT an orphan and stays
    expect(gemini.includes('const NO_THINK')).toBe(true);
  });
});

describe('S2 · no non-test production source references any dead symbol', () => {
  it('repository-wide scan of src/ (excluding tests) is clean', () => {
    const rootDir = fileURLToPath(new URL('../..', import.meta.url));
    const offenders = [];
    const walk = (dir) => {
      let entries; try { entries = readdirSync(dir); } catch { return; }
      for (const name of entries) {
        if (name === '__tests__' || name === 'node_modules') continue;
        const full = `${dir}/${name}`;
        let s; try { s = statSync(full); } catch { continue; }
        if (s.isDirectory()) { walk(full); continue; }
        if (!/\.(jsx?|tsx?)$/.test(name) || /\.test\.[jt]sx?$/.test(name)) continue;
        const stripped = readFileSync(full, 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
        for (const re of DEAD) {
          if (re.test(stripped)) offenders.push(`${full} :: ${re}`);
        }
      }
    };
    walk(rootDir);
    expect(offenders, offenders.join(' | ')).toEqual([]);
  });
});

describe('S2 · active replacements and Gateway lanes are intact', () => {
  it('the five released Gateway lanes remain exported and gateway-routed', () => {
    for (const fn of ['chatJake', 'forceActionsJake', 'draftWithJake', 'generateLeadIdeas', 'diagnoseQuote']) {
      expect(gemini.includes(`export async function ${fn}(`), fn).toBe(true);
    }
    for (const action of ['jake.chat', 'jake.force_actions', 'jake.draft_message', 'crm.lead_ideas', 'crm.diagnose_quote']) {
      expect(gemini.includes(`callAiGateway('${action}'`), action).toBe(true);
    }
    expect((gemini.match(/callAiGateway\(/g) || []).length).toBe(5);
    // demoChat (frozen unconfigured fallback) survives
    expect(gemini.includes('function demoChat(')).toBe(true);
    // legacy brain exports are NOT part of this slice
    for (const kept of ['export const isGeminiConfigured', 'export function jakeBrainPref()', 'export function setJakeBrain(', 'export function jakeBrainLabel()']) {
      expect(gemini.includes(kept), kept).toBe(true);
    }
  });

  it('ImageStudio still enhances via studio.prompt_enhance and never imports gemini.js', () => {
    expect(imageStudio.includes("callAiGateway('studio.prompt_enhance'")).toBe(true);
    expect(imageStudio.includes("from '../lib/gemini.js'")).toBe(false);
    expect(imageStudio.includes('enhanceImagePrompt')).toBe(false);
  });

  // M2 J3C S4.2 superseded the retired order (…→ Pollinations → browser Gemini):
  // the hosted tail is now a single protected AI-Gateway attempt, and the direct
  // browser-Gemini branch is gone. Local engines keep their exact precedence.
  it('generateImage engine policy: ComfyUI → local SD → single Gateway attempt; no browser Gemini', () => {
    const start = geminiImage.indexOf('export async function generateImage(');
    expect(start).toBeGreaterThan(-1);
    const body = geminiImage.slice(start);
    const iComfy = body.indexOf('if (COMFY_URL)');
    const iLocal = body.indexOf('if (LOCAL_URL)');
    const iGateway = body.indexOf('generateImageViaGateway(text, opts)');
    expect(iComfy).toBeGreaterThan(-1);
    expect(iLocal).toBeGreaterThan(iComfy);
    expect(iGateway).toBeGreaterThan(iLocal);
    // the retired direct-browser-Gemini branch and its vectors are gone
    expect(body.includes('if (API_KEY)')).toBe(false);
    expect(geminiImage.includes('generativelanguage')).toBe(false);
    expect(geminiImage.includes('X-goog-api-key')).toBe(false);
    expect(geminiImage.includes('VITE_GEMINI_API_KEY')).toBe(false);
  });

  it('Creative V1 core and image-side survivors are untouched', () => {
    for (const kept of [
      'export async function runCreativeDirector(brand, opts = {})',
      'async function chatJson(sys, user, opts = {})',
      'export async function fetchSiteText(rawUrl)',
      "https://r.jina.ai/",
      'export async function buildStrategy(brand)',
      'export async function generateConceptWave(brand, strategy, opts = {})',
      'export async function scoreConcepts(concepts, brand, strategy)',
      'export function setEngineLogger(fn)',
    ]) {
      expect(gemini.includes(kept), kept).toBe(true);
    }
    for (const kept of [
      'export async function generateMaxRealism(prompt, opts = {})',
      'export async function generateImage(',
      'export const isImageAiConfigured',
      'function pollinations(text)',
      'export async function qwenCompose(',
      'export async function characterPackPulid(',
      'export async function productLockBlend(',
    ]) {
      expect(geminiImage.includes(kept), kept).toBe(true);
    }
  });
});

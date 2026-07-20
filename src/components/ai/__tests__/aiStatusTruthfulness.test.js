// ===================================================================
// M2 J3C S1 — Truthful AI status UI (source pins).
//
// The released Jake / Diagnose / Outreach lanes are served exclusively by
// the server-owned AI Gateway, so their availability indicator is Supabase
// (the Gateway transport), NOT the legacy browser-key flag. This suite pins:
//   1. Assistant renders a NON-CLICKABLE status ("AI מאובטח" / "מצב הדגמה")
//      keyed on isSupabaseConfigured — no brain selector, no cycling, no
//      localStorage write, no model/provider name.
//   2. Diagnose + Outreach demo wording keys on isSupabaseConfigured.
//   3. The five released Gateway call expressions are byte-identical.
//   4. Frozen files (gemini.js brain exports, AdStudio's real demo gate)
//      are untouched.
// ===================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const assistant = read('../Assistant.jsx');
const diagnose = read('../../../pages/Diagnose.jsx');
const outreach = read('../../../pages/Outreach.jsx');
const adstudio = read('../../../pages/AdStudio.jsx');
const gemini = read('../../../lib/gemini.js');

describe('S1 · Assistant truthful status (non-clickable, Gateway-keyed)', () => {
  it('renders the configured/demo status texts keyed on isSupabaseConfigured', () => {
    expect(assistant.includes("import { isSupabaseConfigured } from '../../lib/supabase.js';")).toBe(true);
    expect(assistant.includes("{isSupabaseConfigured ? 'AI מאובטח' : 'מצב הדגמה'}")).toBe(true);
  });

  it('the status element is a non-clickable span with the existing ai-brain classes', () => {
    // extract the status snippet and prove it is a <span>, not a <button>
    const start = assistant.indexOf('<span className="ai-brain"');
    expect(start).toBeGreaterThan(-1);
    // the inner dot span is self-closing, so the first '</span>' closes the status element
    const snippet = assistant.slice(start, assistant.indexOf('</span>', start) + 7);
    expect(snippet.includes('onClick')).toBe(false);
    expect(snippet.includes('disabled')).toBe(false);
    expect(snippet.includes('<button')).toBe(false);
    // reuses the existing dot style; lit only when the Gateway transport is live
    expect(snippet.includes('ai-brain-dot')).toBe(true);
  });

  it('the obsolete brain-selection control is fully removed (no cycling, no pref, no storage)', () => {
    for (const banned of [
      'cycleBrain', 'jakeBrainLabel', 'jakeBrainPref', 'setJakeBrain', 'brainTick',
      'isGeminiConfigured', 'artvalue_jake_brain',
      'אוטומטי / ענן / מקומי', 'החכם ביותר',
      '<button\n                          className="ai-brain"',
    ]) {
      expect(assistant.includes(banned), banned).toBe(false);
    }
    // no clickable element carries the ai-brain class anymore
    expect(/<button[^>]*className="ai-brain"/.test(assistant)).toBe(false);
  });

  it('no model/provider name is shown by the status (server owns provider authority)', () => {
    // note: gentleError's matcher regex legitimately contains 'Ollama' — it
    // matches legacy error TEXT and displays no provider name.
    for (const banned of ['JAKE_CLOUD_MODEL', 'gemini-2.5-flash', 'כפתור המוח']) {
      expect(assistant.includes(banned), banned).toBe(false);
    }
  });
});

describe('S1 · Diagnose + Outreach demo wording keys on the Gateway transport', () => {
  it('Diagnose badge: neutral "מצב הדגמה" only when Supabase is not configured', () => {
    expect(diagnose.includes("import { isSupabaseConfigured } from '../lib/supabase.js';")).toBe(true);
    expect(diagnose.includes('isGeminiConfigured')).toBe(false);
    expect(diagnose.includes('{!isSupabaseConfigured && <span className="badge badge-neutral">')).toBe(true);
    expect(diagnose.includes('ללא מפתח Gemini')).toBe(false);
  });

  it('Outreach: "(מצב הדגמה)" appended only when Supabase is not configured', () => {
    expect(outreach.includes("import { isSupabaseConfigured } from '../lib/supabase.js';")).toBe(true);
    expect(outreach.includes('isGeminiConfigured')).toBe(false);
    expect(outreach.includes("{!isSupabaseConfigured && ' (מצב הדגמה)'}")).toBe(true);
    expect(outreach.includes('ללא מפתח Gemini')).toBe(false);
  });
});

describe('S1 · locked compatibility — released Gateway calls byte-identical', () => {
  it('the three Assistant lane call expressions are unchanged', () => {
    expect(assistant.includes('chatJake(convo, withBusinessBrain(activePack.buildContext(data), text))')).toBe(true);
    expect(assistant.includes('forceActionsJake(text, activePack.buildContext(data))')).toBe(true);
    expect(assistant.includes('draftWithJake(convo, withBusinessBrain(activePack.buildContext(data), text))')).toBe(true);
  });

  it('Diagnose/Outreach lane call expressions are unchanged and stay off the gateway client', () => {
    expect(diagnose.includes('await diagnoseQuote(form)')).toBe(true);
    expect(outreach.includes('generateLeadIdeas(niche, 6)')).toBe(true);
    for (const src of [assistant, diagnose, outreach]) {
      expect(src.includes('aiGateway')).toBe(false);
      expect(src.includes('callAiGateway')).toBe(false);
    }
  });

  it('no browser provider call or new network surface was introduced', () => {
    for (const banned of ['generativelanguage', 'X-goog', 'fetch(', 'localhost', '127.0.0.1']) {
      expect(diagnose.includes(banned), `Diagnose: ${banned}`).toBe(false);
      expect(outreach.includes(banned), `Outreach: ${banned}`).toBe(false);
    }
    expect(assistant.includes('generativelanguage')).toBe(false);
    expect(assistant.includes('X-goog')).toBe(false);
  });
});

describe('S1 · frozen files untouched', () => {
  it('gemini.js keeps the legacy brain exports for a later approved dead-code slice', () => {
    for (const kept of [
      'export const isGeminiConfigured',
      'export function jakeBrainPref()',
      'export function setJakeBrain(',
      'export function jakeBrainLabel()',
    ]) {
      expect(gemini.includes(kept), kept).toBe(true);
    }
  });

  it("AdStudio keeps its real isGeminiConfigured demo gate (Creative V1 truly runs demo without an engine)", () => {
    expect(adstudio.includes('isGeminiConfigured')).toBe(true);
    expect(adstudio.includes('{!isGeminiConfigured && (')).toBe(true);
  });
});

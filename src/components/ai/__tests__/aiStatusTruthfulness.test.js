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
//   4. The brain-selection surface is gone from BOTH the Assistant and
//      gemini.js (local-engine retirement, 2026-07-27) — there is exactly one
//      brain now, the account's Gateway, so there is nothing to select.
// ===================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const assistant = read('../Assistant.jsx');
const diagnose = read('../../../pages/Diagnose.jsx');
const outreach = read('../../../pages/Outreach.jsx');
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
    for (const banned of ['JAKE_CLOUD_MODEL', 'gemini-2.5-flash', 'כפתור המוח']) {
      expect(assistant.includes(banned), banned).toBe(false);
    }
  });

  // gentleError used to keep a matcher regex naming 'Ollama' so it could
  // recognise the legacy workstation-engine error TEXT. That engine is gone,
  // and so is the matcher: the Assistant now names no engine at all.
  it('the Assistant names no workstation engine anywhere (not even in a matcher)', () => {
    for (const term of ['Ollama', 'ComfyUI', 'comfy', 'Fooocus', 'A1111', 'localhost', '127.0.0.1']) {
      expect(assistant.includes(term), term).toBe(false);
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
  // ⚠️ REPINNED by the Jake Calendar slice, and ONLY in the context ARGUMENT:
  // `data` → `jakeData()`, the store snapshot plus the seam-read appointments.
  // Everything this guard actually protects is unchanged and still asserted —
  // same three lane functions, same business-brain wrapper on chat + draft,
  // force-actions still lean, same arity, same wire payload. The Gateway
  // contract, the action ids and the `context: { summary }` shape were not
  // touched by that slice.
  it('the three Assistant lane call expressions are unchanged', () => {
    // J3 repin: chat + draft gained a 4th EXPLICIT hidden-modules argument
    // (isSupabaseConfigured ? BETA_HIDDEN_MODULES : null) so Jake stops
    // advertising Growth OS in cloud. Same lanes, same wrapper, same profile.
    expect(assistant.includes('chatJake(convo, withBusinessBrain(activePack.buildContext(jakeData()), text, data.businessProfile, isSupabaseConfigured ? BETA_HIDDEN_MODULES : null))')).toBe(true);
    expect(assistant.includes('forceActionsJake(text, activePack.buildContext(jakeData()))')).toBe(true);
    expect(assistant.includes('draftWithJake(convo, withBusinessBrain(activePack.buildContext(jakeData()), text, data.businessProfile, isSupabaseConfigured ? BETA_HIDDEN_MODULES : null))')).toBe(true);
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

describe('S1 · one brain, nothing to select', () => {
  it('gemini.js still reports configuration truthfully', () => {
    expect(gemini.includes('export const isGeminiConfigured')).toBe(true);
  });

  it('every brain-selection export is gone from gemini.js', () => {
    for (const gone of [
      'jakeBrainPref', 'setJakeBrain', 'jakeBrainLabel', 'jakeBrainOrder',
      'artvalue_jake_brain', 'VITE_JAKE_BRAIN', 'VITE_JAKE_MODEL',
    ]) {
      expect(gemini.includes(gone), gone).toBe(false);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { studioHandoffFor } from '../assistantStudioHandoff.js';

// ===================================================================
// assistantStudioHandoff — pure gate for the Assistant's Studio handoff
// card, plus source-level pins on the Assistant integration (readFileSync
// pattern — click-bound navigation only, no generation, no persistence
// of the payload, untouched confirm/askJake machinery).
// ===================================================================

describe('studioHandoffFor · studio-positive texts → payload', () => {
  it('poster request → studio payload with fast-image workflow and a real prompt', () => {
    const p = studioHandoffFor('תכין לי פוסטר על CRM');
    expect(p).not.toBeNull();
    expect(p.source).toBe('jake');
    expect(p.target).toBe('studio');
    expect(p.planType).toBe('studio_marketing_asset');
    expect(p.workflow).toBe('fast-image');
    expect(typeof p.prompt).toBe('string');
    expect(p.prompt.length).toBeGreaterThan(50);
    expect(p.requiresConfirmation).toBe(true);
  });

  it('product presenter / product lock / studio prompt phrasings → studio payloads', () => {
    for (const [text, wf] of [
      ['אני רוצה להחליף רקע למוצר', 'fast-image'],
      ['תכין לי פרומפט לסטודיו', 'fast-image'],
    ]) {
      const p = studioHandoffFor(text);
      expect(p, text).not.toBeNull();
      expect(p.target, text).toBe('studio');
      expect(p.workflow, text).toBe(wf);
      expect(p.prompt.length, text).toBeGreaterThan(0);
    }
  });
});

describe('studioHandoffFor · non-studio texts → null', () => {
  it('campaign / content plan / crm / growth / workflow / strategy / chat / unknown', () => {
    for (const text of [
      'תבנה לי קמפיין',
      'תכנן חודש תוכן',
      'כמה לקוחות יש לי?',
      'מה כדאי לי לעשות היום?',
      'איזה Workflow מתאים?',
      'איך לבדל את השירות שלי',
      'מה אתה יכול לעשות?',
      'מי אתה?',
      'אזעטqwe זבל',
    ]) {
      expect(studioHandoffFor(text), text).toBeNull();
    }
  });
});

describe('studioHandoffFor · safety', () => {
  it('hostile input never throws', () => {
    for (const bad of [null, undefined, 42, {}, [], NaN, '', '   ', 'x'.repeat(5000)]) {
      expect(() => studioHandoffFor(bad)).not.toThrow();
      expect(studioHandoffFor(bad)).toBeNull();
    }
  });

  it('is deterministic — repeated calls deep-equal', () => {
    expect(studioHandoffFor('תכין לי פוסטר על CRM')).toEqual(studioHandoffFor('תכין לי פוסטר על CRM'));
    expect(studioHandoffFor('תבנה קמפיין')).toBe(studioHandoffFor('תבנה קמפיין')); // both null
  });

  it('source purity — no navigation/model/storage/event/clock tokens', () => {
    const code = readFileSync(fileURLToPath(new URL('../assistantStudioHandoff.js', import.meta.url)), 'utf8');
    const importLines = (code.match(/import[^]*?from\s*'[^']+';/g) || []).join('\n');
    expect(importLines).toMatch(/from '\.\/jakeExecutionPlanner\.js'/);
    expect(importLines).toMatch(/from '\.\/jakeHandoffResolver\.js'/);
    const codeOnly = code
      .replace(/\/\*[^]*?\*\//g, '')
      .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    for (const banned of ['navigate', 'useNavigate', 'localStorage', 'sessionStorage', 'dispatchEvent', 'CustomEvent', 'jake:ask', 'askJake', 'fetch(', 'Date.now(', 'Math.random(', 'window.']) {
      expect(codeOnly.includes(banned), banned).toBe(false);
    }
  });
});

describe('Assistant integration · source-level pins', () => {
  const assistant = readFileSync(fileURLToPath(new URL('../../components/ai/Assistant.jsx', import.meta.url)), 'utf8');

  it('imports studioHandoffFor and uses it exactly twice (draft + chat lanes)', () => {
    expect(assistant).toMatch(/import\s*\{\s*studioHandoffFor\s*\}\s*from\s*'[^']*lib\/assistantStudioHandoff\.js'/);
    // 1 import + 2 lane call sites = 3 occurrences, no more (no other lane appends)
    expect((assistant.match(/studioHandoffFor/g) || []).length).toBe(3);
    expect((assistant.match(/studioHandoffFor\(text\)/g) || []).length).toBe(2);
  });

  it('renders the handoff card branch with the validity guard and the button', () => {
    expect(assistant).toContain("m.handoff && m.handoff.target === 'studio' && m.handoff.prompt ?");
    expect(assistant).toContain('פתח ב-Studio עם הפרומפט מוכן');
    expect(assistant).toContain('הפרומפט מוכן — היצירה תתחיל רק אחרי לחיצה על Generate ב-Studio.');
  });

  it('navigation to /studio is CLICK-BOUND only, via handleOpenStudioHandoff', () => {
    // exactly one navigate('/studio' — inside the handler
    expect((assistant.match(/navigate\('\/studio'/g) || []).length).toBe(1);
    const handlerStart = assistant.indexOf('const handleOpenStudioHandoff');
    expect(handlerStart).toBeGreaterThan(-1);
    const handler = assistant.slice(handlerStart, assistant.indexOf('};', handlerStart));
    expect(handler).toContain("navigate('/studio', { state: { jakeHandoff: handoff } })");
    expect(handler).toContain('setOpen(false)');
    // handler is invoked ONLY from onClick — exactly one call site (the
    // definition uses `= (handoff) =>`, so it doesn't match this pattern)
    expect(assistant).toContain('onClick={() => handleOpenStudioHandoff(m.handoff)}');
    const invocations = (assistant.match(/handleOpenStudioHandoff\(/g) || []).length;
    expect(invocations).toBe(1);
    // no effect BODY dispatches the handoff navigation (scan each effect,
    // not the whole file — the growthAskJakeButtons pattern)
    const effectBodies = [...assistant.matchAll(/use(?:Layout)?Effect\(\s*\(\)\s*=>\s*\{([^]*?)\}\s*,/g)].map((m) => m[1]);
    expect(effectBodies.length).toBeGreaterThan(0);
    for (const eff of effectBodies) {
      expect(eff.includes('handleOpenStudioHandoff')).toBe(false);
      expect(eff.includes("navigate('/studio'")).toBe(false);
      expect(eff.includes('studioHandoffFor')).toBe(false);
    }
  });

  it('the handoff handler contains no generation/execution tokens', () => {
    const handlerStart = assistant.indexOf('const handleOpenStudioHandoff');
    const handler = assistant.slice(handlerStart, assistant.indexOf('};', handlerStart));
    for (const gen of ['run(', 'onCta(', 'buildLockComposite(', 'executeActions', 'askJake']) {
      expect(handler.includes(gen), gen).toBe(false);
    }
  });

  it('excluded lanes stay handoff-free (briefing / campaign / bulk-delete regions)', () => {
    // briefing lane: between "2) Briefing lane" and the drafting lane comment
    const briefing = assistant.slice(assistant.indexOf('2) Briefing lane'), assistant.indexOf('4) Drafting lane'));
    expect(briefing.includes('studioHandoffFor')).toBe(false);
    // campaign lane: between "4.5) Creative campaign lane" and "5) Chat"
    const campaign = assistant.slice(assistant.indexOf('4.5) Creative campaign lane'), assistant.indexOf('5) Chat'));
    expect(campaign.includes('studioHandoffFor')).toBe(false);
    // bulk-delete lane: between "1) Bulk delete" and "2) Briefing lane"
    const bulk = assistant.slice(assistant.indexOf('1) Bulk delete'), assistant.indexOf('2) Briefing lane'));
    expect(bulk.includes('studioHandoffFor')).toBe(false);
  });

  it('confirm/action machinery and the jake:ask seam are untouched', () => {
    expect(assistant).toContain('const approvePreview = async (idx, actions) => {'); // S0B: awaits durable task writes; propose→confirm→execute intact
    expect(assistant).toContain("window.addEventListener('jake:open', onOpen)");
    expect(assistant).toContain("window.addEventListener('jake:ask', onAsk)");
    expect(assistant).toContain('detectBulkDelete(text, activePack.entities)');
  });

  it('no query params or new storage in the handoff path', () => {
    expect(assistant.includes('useSearchParams')).toBe(false);
    expect(assistant.includes('URLSearchParams')).toBe(false);
    // handoff-related code never touches storage (CHAT_KEY persistence itself
    // is pre-existing and now transient-filters handoff messages)
    const handoffCard = assistant.slice(assistant.indexOf("m.handoff && m.handoff.target === 'studio'"), assistant.indexOf('m.preview ?'));
    expect(handoffCard.includes('localStorage')).toBe(false);
    expect(handoffCard.includes('sessionStorage')).toBe(false);
    expect(handoffCard.includes('dispatchEvent')).toBe(false);
    expect(handoffCard.includes('CustomEvent')).toBe(false);
  });
});

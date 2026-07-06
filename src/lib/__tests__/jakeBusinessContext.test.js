import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BUSINESS_CONTEXT_MARKER, shouldIncludeBusinessBrain, withBusinessBrain,
} from '../jakeBusinessContext.js';
import { buildPosterBrief } from '../../data/businessBrain.js';

// ===================================================================
// jakeBusinessContext — conditional Business Brain grounding for Jake's
// free-form lanes. Pure router/append tests + source-level Assistant
// wiring pins (readFileSync pattern — no DOM renderer in this repo).
// ===================================================================

const CRM_CONTEXT = '- לקוחות ב-CRM: 12 סה״כ.\n- החודש: הכנסות 5,000 ₪.';

describe('shouldIncludeBusinessBrain · router', () => {
  const POSITIVE = [
    'תכין לי פוסט על CRM',
    'תכין פוסטר למערכת CRM',
    'רעיון לפוסטר',
    'איך לשווק את השירות',
    'תכתוב קופי',
    'תכין מודעה',
    'תכין סלוגן',
    'תבנה לי קמפיין',
    'תכנן חודש תוכן',
    'פרומפט לסטודיו',
    'תמונה למוצר',
    'ויזואל למוצר',
    'איך למכור את האוטומציות',
    'איך לבדל את השירות',
    'תכין הצעה ללקוח על מערכת CRM',
    'Studio prompt',
    'poster for CRM',
    'marketing campaign',
    'content plan',
  ];
  const NEGATIVE = [
    'כמה לקוחות יש לי?',
    'מה חשוב היום?',
    'עדכן שווי ל-5000',
    'מחק את המשימה',
    'תוסיף לקוח חדש',
    'מה ההכנסות החודש?',
    'תראה לי מלאי נמוך',
    'תזכיר לי להתקשר',
  ];

  it('returns true for business/marketing/content/Studio requests', () => {
    for (const t of POSITIVE) expect(shouldIncludeBusinessBrain(t), t).toBe(true);
  });

  it('returns false for ordinary CRM/ERP operational requests', () => {
    for (const t of NEGATIVE) expect(shouldIncludeBusinessBrain(t), t).toBe(false);
  });

  it('returns false for null/empty/non-string input', () => {
    expect(shouldIncludeBusinessBrain(null)).toBe(false);
    expect(shouldIncludeBusinessBrain(undefined)).toBe(false);
    expect(shouldIncludeBusinessBrain('')).toBe(false);
    expect(shouldIncludeBusinessBrain('   ')).toBe(false);
    expect(shouldIncludeBusinessBrain(42)).toBe(false);
  });
});

describe('withBusinessBrain · append behavior', () => {
  it('returns the original context unchanged when the router says no', () => {
    expect(withBusinessBrain(CRM_CONTEXT, 'כמה לקוחות יש לי?')).toBe(CRM_CONTEXT);
  });

  it('dedupes: unchanged when userText already carries the brain marker (button prompts)', () => {
    const buttonPrompt = buildPosterBrief('crm'); // real button seed — carries the sentinel
    expect(buttonPrompt).toContain(BUSINESS_CONTEXT_MARKER);
    expect(withBusinessBrain(CRM_CONTEXT, buttonPrompt)).toBe(CRM_CONTEXT);
  });

  it('appends the Business Brain AFTER the original CRM context', () => {
    const out = withBusinessBrain(CRM_CONTEXT, 'תכין לי פוסט על CRM');
    expect(out.startsWith(CRM_CONTEXT)).toBe(true);
    expect(out.length).toBeGreaterThan(CRM_CONTEXT.length);
    expect(out.indexOf('לקוחות ב-CRM')).toBeLessThan(out.indexOf('ArtValue Business Brain'));
  });

  it('includes the Business Brain header, services and safety block', () => {
    const out = withBusinessBrain(CRM_CONTEXT, 'תכין לי פוסט על CRM');
    expect(out).toContain('הקשר עסקי — ArtValue Business Brain');
    expect(out).toContain('השירותים שאנחנו מוכרים');
    expect(out).toContain(BUSINESS_CONTEXT_MARKER);
  });

  it('includes the anti-claim rule', () => {
    const out = withBusinessBrain(CRM_CONTEXT, 'תכין לי פוסט על CRM');
    expect(out).toContain('כלל פעולה נוסף:');
    expect(out).toContain('אל תטען שיצרת תמונה, פרסמת פוסט או שלחת הודעה');
  });

  it('is deterministic', () => {
    expect(withBusinessBrain(CRM_CONTEXT, 'תכין מודעה')).toBe(withBusinessBrain(CRM_CONTEXT, 'תכין מודעה'));
  });

  it('handles null/empty context safely (still a string, never throws)', () => {
    expect(withBusinessBrain(null, 'כמה לקוחות יש לי?')).toBe('');
    const out = withBusinessBrain(null, 'תכין לי פוסט על CRM');
    expect(typeof out).toBe('string');
    expect(out).toContain('ArtValue Business Brain');
  });

  it('appended brain block stays bounded (< 3500 chars)', () => {
    const out = withBusinessBrain(CRM_CONTEXT, 'תכין לי פוסט על CRM');
    expect(out.length - CRM_CONTEXT.length).toBeLessThan(3500);
  });
});

describe('Assistant wiring (source-level)', () => {
  const assistant = readFileSync(new URL('../../components/ai/Assistant.jsx', import.meta.url), 'utf8');

  it('imports withBusinessBrain from the helper', () => {
    expect(assistant).toMatch(/import\s*\{\s*withBusinessBrain\s*\}\s*from\s*'[^']*lib\/jakeBusinessContext\.js'/);
  });

  it('wraps exactly the drafting lane and the default chat lane', () => {
    expect(assistant).toContain('draftWithJake(convo, withBusinessBrain(activePack.buildContext(data), text))');
    expect(assistant).toContain('chatJake(convo, withBusinessBrain(activePack.buildContext(data), text))');
    // exactly 2 usages + 1 import line = 3 occurrences, no more
    expect((assistant.match(/withBusinessBrain/g) || []).length).toBe(3);
  });

  it('does NOT wrap forceActionsJake (action-conversion pass stays lean)', () => {
    expect(assistant).toContain('forceActionsJake(text, activePack.buildContext(data))');
    expect(assistant).not.toContain('forceActionsJake(text, withBusinessBrain');
  });

  it('leaves the briefing and campaign lanes untouched', () => {
    expect(assistant).toContain('activePack.briefing(data)');           // briefing lane
    expect(assistant).toContain('createArtValueCreative');              // campaign lane entry
    expect(assistant).not.toContain('createArtValueCreative(withBusinessBrain');
  });

  it('adds no raw seam usage (no new dispatchEvent/CustomEvent beyond the existing jake:ask listener)', () => {
    // the Assistant LISTENS to the seam; it must not gain a dispatcher
    expect(assistant).not.toContain("dispatchEvent(new CustomEvent('jake:ask'");
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BUSINESS_CONTEXT_MARKER, shouldIncludeBusinessBrain, withBusinessBrain, isBusinessContextQuestion,
} from '../jakeBusinessContext.js';
import { buildPosterBrief, buildAccountBusinessContext, BUSINESS_CONTEXT_UNCONFIGURED } from '../../data/businessBrain.js';

// ===================================================================
// jakeBusinessContext — conditional Business Brain grounding for Jake's
// free-form lanes. Pure router/append tests + source-level Assistant
// wiring pins (readFileSync pattern — no DOM renderer in this repo).
// ===================================================================

const CRM_CONTEXT = '- לקוחות ב-CRM: 12 סה״כ.\n- החודש: הכנסות 5,000 ₪.';

// S0D: sample durable profiles for the account-aware brain, and the set of
// hardcoded-ArtValue markers that must NEVER appear in the account/neutral brain.
const PROFILE_A = { businessName: 'סטודיו אלפא', positioning: 'עיצוב מותגים לעסקים קטנים', audiences: ['יזמים'], tone: ['חד'], differentiators: ['מהיר ואישי'], services: [{ name: 'מיתוג', pitch: 'לוגו וזהות ויזואלית' }], brandPalette: { primary: '#112233', accent: '#00FFAA' } };
const PROFILE_B = { businessName: 'מאפיית בטא', positioning: 'לחם מחמצת יומי טרי', audiences: ['תושבי השכונה'], tone: ['חם'], services: [{ name: 'מאפים' }], brandPalette: { primary: '#AA0000' } };
const ARTVALUE_MARKERS = ['ArtValue', 'Business Brain', '#d4ff3f', 'השירותים שאנחנו מוכרים'];

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

  it('appends the account-aware business context AFTER the original CRM context', () => {
    const out = withBusinessBrain(CRM_CONTEXT, 'תכין לי פוסט על CRM');
    expect(out.startsWith(CRM_CONTEXT)).toBe(true);
    expect(out.length).toBeGreaterThan(CRM_CONTEXT.length);
    expect(out.indexOf('לקוחות ב-CRM')).toBeLessThan(out.indexOf('הקשר עסקי'));
  });

  it('no profile → NEUTRAL unconfigured block, universal capabilities + safety, ZERO ArtValue facts', () => {
    const out = withBusinessBrain(CRM_CONTEXT, 'תכין לי פוסט על CRM');
    expect(out).toContain('הקשר עסקי');
    expect(out).toContain(BUSINESS_CONTEXT_UNCONFIGURED);
    expect(out).toContain('יכולות המערכת');   // universal product capabilities kept
    expect(out).toContain(BUSINESS_CONTEXT_MARKER); // safety kept
    for (const m of ARTVALUE_MARKERS) expect(out, m).not.toContain(m);
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
    expect(out).toContain(BUSINESS_CONTEXT_UNCONFIGURED);
    for (const m of ARTVALUE_MARKERS) expect(out, m).not.toContain(m);
  });

  it('appended brain block stays bounded (< 3500 chars)', () => {
    const out = withBusinessBrain(CRM_CONTEXT, 'תכין לי פוסט על CRM');
    expect(out.length - CRM_CONTEXT.length).toBeLessThan(3500);
  });
});

describe('withBusinessBrain · S0D router correction (configured always; unconfigured on context-Qs)', () => {
  const NAME_Q = 'מה שם העסק שלי?';
  const SERVICES_Q = 'איזה שירותים הגדרתי?';
  const PALETTE_Q = 'מה צבעי המותג שלי?';
  const GENERIC_DRAFT = 'תכתוב מייל תודה קצר ללקוח';
  const ORDINARY_CRM = 'כמה לקוחות יש לי?';

  it('configured A: direct "what is my business name?" → A\'s business name (not router-gated)', () => {
    const out = withBusinessBrain(CRM_CONTEXT, NAME_Q, PROFILE_A);
    expect(out).toContain('סטודיו אלפא');
    expect(out).not.toContain(BUSINESS_CONTEXT_UNCONFIGURED);
    for (const m of ARTVALUE_MARKERS) expect(out).not.toContain(m);
  });

  it('configured B: same question → only B\'s facts (A↔B isolated)', () => {
    const out = withBusinessBrain(CRM_CONTEXT, NAME_Q, PROFILE_B);
    expect(out).toContain('מאפיית בטא');
    expect(out).not.toContain('סטודיו אלפא');
  });

  it('configured A: services + palette direct questions surface the durable profile', () => {
    expect(withBusinessBrain(CRM_CONTEXT, SERVICES_Q, PROFILE_A)).toContain('מיתוג');
    expect(withBusinessBrain(CRM_CONTEXT, PALETTE_Q, PROFILE_A)).toContain('#112233');
  });

  it('configured A: a GENERIC drafting request is grounded in the account context', () => {
    const out = withBusinessBrain(CRM_CONTEXT, GENERIC_DRAFT, PROFILE_A);
    expect(out.startsWith(CRM_CONTEXT)).toBe(true);
    expect(out).toContain('סטודיו אלפא');
  });

  it('configured A: even an ordinary CRM question grounds the account (always-on when configured)', () => {
    expect(withBusinessBrain(CRM_CONTEXT, ORDINARY_CRM, PROFILE_A)).toContain('סטודיו אלפא');
  });

  it('unconfigured: direct profile question → truthful NEUTRAL block, zero ArtValue facts', () => {
    for (const q of [NAME_Q, SERVICES_Q, PALETTE_Q, 'מה המיצוב שלי?', 'מי קהל היעד שלי?']) {
      const out = withBusinessBrain(CRM_CONTEXT, q, null);
      expect(out, q).toContain(BUSINESS_CONTEXT_UNCONFIGURED);
      for (const m of ARTVALUE_MARKERS) expect(out, `${q} · ${m}`).not.toContain(m);
    }
  });

  it('unconfigured: ordinary CRM question stays LEAN (no block)', () => {
    expect(withBusinessBrain(CRM_CONTEXT, ORDINARY_CRM, null)).toBe(CRM_CONTEXT);
    expect(withBusinessBrain(CRM_CONTEXT, 'עדכן שווי ל-5000', null)).toBe(CRM_CONTEXT);
  });

  it('marker dedupe holds even when configured → exactly one block (button seed carries its own)', () => {
    const seed = buildPosterBrief('crm'); // carries BUSINESS_CONTEXT_MARKER
    expect(withBusinessBrain(CRM_CONTEXT, seed, PROFILE_A)).toBe(CRM_CONTEXT);
    const out = withBusinessBrain(CRM_CONTEXT, NAME_Q, PROFILE_A);
    expect((out.match(/הקשר עסקי —/g) || []).length).toBe(1);
  });

  it('stays within the accepted bound (configured account block < 3500 over base)', () => {
    const out = withBusinessBrain(CRM_CONTEXT, NAME_Q, PROFILE_A);
    expect(out.length - CRM_CONTEXT.length).toBeLessThan(3500);
  });

  it('isBusinessContextQuestion: matches profile intents, not ordinary CRM', () => {
    for (const q of [NAME_Q, SERVICES_Q, PALETTE_Q, 'מה המיצוב שלי?', 'מה הבידול שלי?', 'business name', 'brand palette', 'my services']) {
      expect(isBusinessContextQuestion(q), q).toBe(true);
    }
    for (const q of [ORDINARY_CRM, 'מה חשוב היום?', 'תוסיף לקוח חדש', 'מחק את המשימה', '', null]) {
      expect(isBusinessContextQuestion(q), String(q)).toBe(false);
    }
  });
});

describe('buildAccountBusinessContext · account-aware / neutral / isolation (S0D)', () => {
  it('valid profile → only that account\'s approved facts; ZERO ArtValue facts', () => {
    const out = buildAccountBusinessContext(PROFILE_A);
    expect(out).toContain('פרופיל העסק (מאושר ע״י המשתמש)');
    expect(out).toContain('סטודיו אלפא');
    expect(out).toContain('עיצוב מותגים לעסקים קטנים');
    expect(out).toContain('מיתוג');       // service name from the profile
    expect(out).toContain('#112233');      // palette primary from the profile
    expect(out).toContain('יכולות המערכת'); // universal capabilities kept
    expect(out).not.toContain(BUSINESS_CONTEXT_UNCONFIGURED); // configured → not neutral
    for (const m of ARTVALUE_MARKERS) expect(out, m).not.toContain(m);
  });

  it('no / malformed profile → neutral unconfigured, ZERO ArtValue facts', () => {
    for (const bad of [null, undefined, {}, { businessName: '   ' }, { positioning: 'x' }]) {
      const out = buildAccountBusinessContext(bad);
      expect(out).toContain(BUSINESS_CONTEXT_UNCONFIGURED);
      expect(out).toContain('יכולות המערכת');
      for (const m of ARTVALUE_MARKERS) expect(out, m).not.toContain(m);
    }
  });

  it('two different profiles → isolated output (no cross-bleed)', () => {
    const a = buildAccountBusinessContext(PROFILE_A);
    const b = buildAccountBusinessContext(PROFILE_B);
    expect(a).toContain('סטודיו אלפא');
    expect(a).not.toContain('מאפיית בטא');
    expect(a).not.toContain('#AA0000');
    expect(b).toContain('מאפיית בטא');
    expect(b).not.toContain('סטודיו אלפא');
    expect(b).not.toContain('#112233');
  });

  it('withBusinessBrain threads the profile → account facts reach chat/draft; A↔B isolated', () => {
    const outA = withBusinessBrain(CRM_CONTEXT, 'תכין לי פוסט על CRM', PROFILE_A);
    const outB = withBusinessBrain(CRM_CONTEXT, 'תכין לי פוסט על CRM', PROFILE_B);
    expect(outA).toContain('סטודיו אלפא');
    expect(outA).not.toContain('מאפיית בטא');
    expect(outB).toContain('מאפיית בטא');
    expect(outB).not.toContain('סטודיו אלפא');
    for (const m of ARTVALUE_MARKERS) { expect(outA).not.toContain(m); expect(outB).not.toContain(m); }
  });

  it('exactly ONE business block (no duplicate durable + hardcoded)', () => {
    const out = withBusinessBrain(CRM_CONTEXT, 'תכין לי פוסט על CRM', PROFILE_A);
    expect((out.match(/הקשר עסקי —/g) || []).length).toBe(1);
    expect(out).not.toContain('Business Brain');
  });

  it('account brain stays bounded (well under the 12,000-char context contract)', () => {
    expect(buildAccountBusinessContext(PROFILE_A).length).toBeLessThan(3500);
    expect(buildAccountBusinessContext(null).length).toBeLessThan(3500);
  });
});

describe('Assistant wiring (source-level)', () => {
  const assistant = readFileSync(new URL('../../components/ai/Assistant.jsx', import.meta.url), 'utf8');

  it('imports withBusinessBrain from the helper', () => {
    expect(assistant).toMatch(/import\s*\{\s*withBusinessBrain\s*\}\s*from\s*'[^']*lib\/jakeBusinessContext\.js'/);
  });

  it('wraps exactly the drafting + chat lanes, threading the account profile (3-arg)', () => {
    // S0D: the pinned call gained a 3rd argument — the signed-in account's
    // durable profile (data.businessProfile). This STRONGER pin proves the
    // account is threaded into the brain seam, so the account-aware brain
    // renders THAT account's facts (or neutral) and can never regress to a
    // hardcoded-only ArtValue brain that would leak to another account.
    // Jake Calendar slice: context argument `data` → `jakeData()`. The 3rd
    // argument — the account profile this guard exists to pin — is untouched,
    // and it still reads from the store `data`, not the composed snapshot.
    expect(assistant).toContain('draftWithJake(convo, withBusinessBrain(activePack.buildContext(jakeData()), text, data.businessProfile))');
    expect(assistant).toContain('chatJake(convo, withBusinessBrain(activePack.buildContext(jakeData()), text, data.businessProfile))');
    // exactly 2 usages + 1 import line = 3 occurrences, no more (3rd ARG adds no token)
    expect((assistant.match(/withBusinessBrain/g) || []).length).toBe(3);
  });

  it('does NOT wrap forceActionsJake (action-conversion pass stays lean)', () => {
    expect(assistant).toContain('forceActionsJake(text, activePack.buildContext(jakeData()))');
    expect(assistant).not.toContain('forceActionsJake(text, withBusinessBrain');
  });

  it('leaves the briefing and campaign lanes untouched', () => {
    // The briefing lane still takes the pack builder directly with NO brain
    // wrapper — the only change is the calendar-bearing snapshot it is given.
    expect(assistant).toContain('activePack.briefing(jakeData())');     // briefing lane
    expect(assistant).not.toContain('briefing(withBusinessBrain');
    expect(assistant).toContain('createArtValueCreative');              // campaign lane entry
    expect(assistant).not.toContain('createArtValueCreative(withBusinessBrain');
  });

  it('adds no raw seam usage (no new dispatchEvent/CustomEvent beyond the existing jake:ask listener)', () => {
    // the Assistant LISTENS to the seam; it must not gain a dispatcher
    expect(assistant).not.toContain("dispatchEvent(new CustomEvent('jake:ask'");
  });
});

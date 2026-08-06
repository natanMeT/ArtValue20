import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isCampaignRequest, isDraftRequest, answerFromData } from '../Assistant.jsx';

// ===================================================================
// C1 — Jake campaign interception.
//
// Before this slice, clause 1 of isCampaignRequest was a BARE NOUN test, so any
// message containing "קמפיין" was swallowed by the S0F.1 creative-containment
// lane (Assistant.jsx lane 4.5) BEFORE Jake's context lane (5) could answer from
// the durable campaigns + the task↔campaign join. Containment keeps its
// precedence and its message; it now triggers on creative-ACTION intent.
//
// ⚠️ These controls IMPORT AND CALL the real exported predicates — the matcher
// is never re-typed here. A test that re-implements the rule proves nothing.
//
// ⚠️ What this file does NOT do: it does not render React. It proves the
// predicates and the exact Boolean each lane evaluates. The rendered
// destination is established by owner QA on the Preview artifact.
// ===================================================================

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const assistant = read('../Assistant.jsx');

// A hydrated-but-empty store snapshot: enough for answerFromData to be a real
// call rather than a guard-clause bail-out.
const DATA = { clients: [], quotes: [], transactions: [], leads: [], tasks: [], inventory: [] };

// ---- CONTAINED — creative-action intent, and the fail-closed default --------
const CONTAINED = [
  ['N1  build verb + noun',            'תבנה לי קמפיין לפייסבוק'],
  ['N2  build verb (תכין)',            'תכין קמפיין להשקת המוצר'],
  ['N3  build infinitive',             'רוצה לבנות קמפיין חדש'],
  ['N4  run verb',                     'תריץ קמפיין לחג'],
  ['N5  BUILD beats LEAD_FRAME',       'צור קמפיין ללידים'],
  ['N6  clause 2, no noun at all',     'רעיונות לפרסום'],
  ['N7  English build verb',           'build a campaign for me'],
  ['N8  bare noun — fail closed',      'קמפיין'],
  ['N9  ambiguous desire — fail closed', 'אני רוצה קמפיין'],
  ['N10 BUILD beats INFO frame',       'תבנה קמפיין — מה התקציב?'],
];

// ---- RELEASED — informational, CRM-lead and drafting frames ----------------
// ⚠️ P1/P2/P5 use the PLURAL "קמפיינים". Until the plural correction they were
// VACUOUS — the noun accepted only the final nun ן, so no plural form was a
// campaign at all and those three passed identically against the pre-slice
// matcher. The noun now accepts both nun forms, so they exercise the rule for
// real. Their SINGULAR twins (P1s/P2s/P5s) are kept: they pin that the release
// is driven by the info frame and not by the noun's shape.
const RELEASED = [
  ['P1  info (מה) — plural',    'מה קורה עם הקמפיינים שלי'],
  ['P1s info (מה) — singular',  'מה קורה עם הקמפיין שלי'],
  ['P2  info (כמה) — plural',   'כמה קמפיינים פעילים יש לי'],
  ['P2s info (כמה) — singular', 'כמה משימות יש בקמפיין הזה'],
  ['P3  info (אילו) + tasks',   'אילו משימות שייכות לקמפיין ההשקה'],
  ['P4  info (סטטוס)',          'מה הסטטוס של קמפיין הקיץ'],
  ['P5  info (תראה) — plural',  'תראה לי את הקמפיינים הפעילים'],
  ['P5s info (תראה) — singular','תראה לי את הקמפיין הפעיל'],
  ['P6  info (איזה) + tasks',   'איזה קמפיין הכי מקושר למשימות'],
  ['P7  LEAD_FRAME only',       'ליד חדש הגיע מהקמפיין באינסטגרם'],
  ['P8  English info',          'what is the status of my campaigns?'],
  ['P9  drafting frame',        'תכתוב לי הודעה על הקמפיין'],
];

describe('C1 · creative-action intent is CONTAINED (S0F.1 preserved)', () => {
  for (const [label, text] of CONTAINED) {
    it(`${label} → contained`, () => {
      expect(isCampaignRequest(text), text).toBe(true);
    });
  }
});

describe('C1 · informational / CRM-lead / drafting frames REACH their lanes', () => {
  for (const [label, text] of RELEASED) {
    it(`${label} → released`, () => {
      expect(isCampaignRequest(text), text).toBe(false);
    });
  }
});

// ---- lane DESTINATIONS -----------------------------------------------------
// Each released control must reach a DIFFERENT lane. Asserting "not contained"
// is not enough — a released message that no lane claims is a silent regression.

describe('C1 · lane destinations are distinct', () => {
  // Lane 4 (Assistant.jsx:1046) evaluates exactly `isDraftRequest(text) && !isCampaignRequest(text)`.
  it('P9 reaches the DRAFTING lane, and is the only released control that does', () => {
    expect(isDraftRequest('תכתוב לי הודעה על הקמפיין') && !isCampaignRequest('תכתוב לי הודעה על הקמפיין')).toBe(true);
    for (const [label, text] of RELEASED) {
      if (label.startsWith('P9')) continue;
      expect(isDraftRequest(text), `${label} must NOT be drafting`).toBe(false);
    }
  });

  it('the lane-4 guard expression is still the one asserted above', () => {
    expect(assistant).toContain('if (isDraftRequest(text) && !isCampaignRequest(text)) {');
  });

  // Lane 3 (Assistant.jsx:1036) would answer from code and return before lane 5.
  it('the informational + lead controls FALL THROUGH lane 3 to Jake context', () => {
    for (const [label, text] of RELEASED) {
      if (label.startsWith('P9')) continue;
      expect(answerFromData(text, DATA), `${label} must not be swallowed by the info lane`).toBe(null);
    }
  });

  // Lane 2 is not exported (exporting it is outside this slice's approved
  // scope), so it is pinned structurally: its matcher carries no campaign token.
  it('the briefing lane cannot claim a campaign question', () => {
    const brief = assistant.slice(assistant.indexOf('function isBriefingRequest'));
    const body = brief.slice(0, brief.indexOf('\n}'));
    expect(body).not.toMatch(/קמפיי?ן|campaign/i);
  });

  // Lane 4.5 keeps its position and its message (S0F.1 D1).
  it('containment still precedes the context lane and the message is untouched', () => {
    const lane45 = assistant.indexOf('if (isCampaignRequest(text)) {');
    const lane5 = assistant.indexOf('const { text: reply } = await chatJake(');
    expect(lane45).toBeGreaterThan(-1);
    expect(lane5).toBeGreaterThan(lane45);
    expect(assistant).toContain('BETA_MESSAGES.creativeCampaignUnavailable');
  });
});

// ---- the PHANTOM info frame ------------------------------------------------
// /(?:^|\s)מה/ matches the first two letters of "מהקמפיין". With a leading
// anchor only, P7 would be released by a phantom INFO frame while appearing to
// prove the LEAD escape. These two controls isolate the escapes from each other.

describe('C1 · the lead escape is real, not a phantom info frame', () => {
  it('P7 minus its lead token falls back to CONTAINED', () => {
    expect(isCampaignRequest('חדש הגיע מהקמפיין באינסטגרם')).toBe(true);
  });

  it('an inflected "מה…" prefix alone never releases', () => {
    expect(isCampaignRequest('תעשה משהו מהקמפיין הזה')).toBe(true);
  });
});

// ---- the plural noun — the CORRECTION -------------------------------------
// /קמפיי?ן/ accepted only the FINAL nun ן (U+05DF). The Hebrew plural
// "קמפיינים" spells the same consonant with the MEDIAL nun נ (U+05E0), so no
// plural form was ever a campaign. That was a REAL S0F.1 containment hole — a
// plural creative build request reached the model — and it is closed here by
// /קמפיי?[ןנ]/. Singular and plural must now behave IDENTICALLY at every
// branch of the rule; that symmetry is what these controls pin.

describe('C1 · plural forms behave exactly like the singular', () => {
  it('a PLURAL creative build request is contained, like its singular form', () => {
    expect(isCampaignRequest('תבנה לי קמפיינים חדשים')).toBe(true);
    expect(isCampaignRequest('תכין קמפיינים לחג')).toBe(true);
    expect(isCampaignRequest('תבנה לי קמפיין חדש')).toBe(true);
  });

  it('PLURAL informational questions reach Jake context', () => {
    expect(isCampaignRequest('מה קורה עם הקמפיינים שלי')).toBe(false);
    expect(isCampaignRequest('כמה קמפיינים פעילים יש לי')).toBe(false);
    expect(isCampaignRequest('תראה לי את הקמפיינים הפעילים')).toBe(false);
  });

  it('a bare PLURAL noun fails closed, like a bare singular one', () => {
    expect(isCampaignRequest('קמפיינים')).toBe(true);
    expect(isCampaignRequest('קמפיין')).toBe(true);
  });

  it('the tolerated single-yod spelling still works in both numbers', () => {
    expect(isCampaignRequest('תבנה קמפינים לחג')).toBe(true);
    expect(isCampaignRequest('מה קורה עם הקמפינים')).toBe(false);
  });
});

// ---- residual limits of the verb sets (documented, accepted) ---------------
// Both fail CLOSED (contained), which is the safe direction, but they are real:
// a past-tense or descriptive use of a build verb still reads as build intent.

describe('C1 · known residuals — build verbs win even in a question', () => {
  it('a past-tense Hebrew build verb still contains', () => {
    expect(isCampaignRequest('מי בנה את הקמפיין הזה?')).toBe(true);
  });

  it('an English descriptive "run" still contains', () => {
    expect(isCampaignRequest('how did the campaign run?')).toBe(true);
  });
});

// ---- mode parity (owner decision 2) ----------------------------------------
describe('C1 · ONE intent rule for cloud and local/demo', () => {
  it('the predicate takes only text and never reads the mode', () => {
    expect(isCampaignRequest.length).toBe(1);
    const fn = assistant.slice(assistant.indexOf('function campaignCreativeIntent'));
    expect(fn.slice(0, fn.indexOf('\n}'))).not.toContain('isSupabaseConfigured');
  });

  it('clauses 2 and 3 are byte-identical to the pre-slice matcher', () => {
    expect(assistant).toContain("|| /(רעיונות|כיוונים)\\s*(ל)?(פרסום|מודעה|קריאייטיב|קריאטיב)/.test(t)");
    expect(assistant).toContain("|| /(תכין|בנה|תבנה|רוצה)\\s*(לי\\s*)?(מודעת? פרסום|כמה רעיונות פרסום)/.test(t);");
  });
});

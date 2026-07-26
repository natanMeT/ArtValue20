import { describe, it, expect } from 'vitest';
import {
  buildAccountOutreachMessage, canBuildAccountOutreach, OUTREACH_SETUP_REQUIRED,
} from '../outreachMessage.js';
import { CATS } from '../../data/outreach.js';

// ===================================================================
// S0F.1 — account-aware cold-outreach copy. The legacy category templates
// name one person at one business ("שמי נתן מ-Art Value"); a signed-in
// account must see ONLY its own approved facts, or a truthful
// setup-required state. Nothing is ever invented.
// Pure module: no React, no storage, no network, no sending.
// ===================================================================

const ACCOUNT_A = {
  businessName: 'סטודיו א',
  positioning: 'מעצבים חוויות דיגיטליות לעסקים קטנים.',
  services: [{ name: 'עיצוב אתרים' }, { name: 'מיתוג' }, { name: 'ניהול קמפיינים' }, { name: 'רביעי שלא ייכנס' }],
};
const ACCOUNT_B = { businessName: 'מאפייה ב', positioning: 'לחם מחמצת יומי.' };

describe('canBuildAccountOutreach — the business-name floor', () => {
  it('true only with a real business name', () => {
    expect(canBuildAccountOutreach(ACCOUNT_A)).toBe(true);
    expect(canBuildAccountOutreach({ businessName: '  ' })).toBe(false);
    for (const p of [null, undefined, {}, [], 'x', { positioning: 'רק מיצוב' }]) {
      expect(canBuildAccountOutreach(p)).toBe(false);
    }
  });
});

describe('configured account — only its OWN identity and profile', () => {
  const msg = buildAccountOutreachMessage({
    leadName: 'יקב הגליל', need: 'מערכת הזמנות', senderName: 'רות', businessProfile: ACCOUNT_A,
  });

  it('uses the session display name and the account business name', () => {
    expect(msg).toContain('רות');
    expect(msg).toContain('סטודיו א');
    expect(msg).toContain('יקב הגליל');
  });

  it('carries the account positioning, its services and the lead\'s own need', () => {
    expect(msg).toContain('מעצבים חוויות דיגיטליות לעסקים קטנים.');
    expect(msg).toContain('עיצוב אתרים');
    expect(msg).toContain('מיתוג');
    expect(msg).toContain('ניהול קמפיינים');
    expect(msg).not.toContain('רביעי שלא ייכנס'); // bounded to 3 services
    expect(msg).toContain('מערכת הזמנות');
  });

  it('contains NO ArtValue / Nathan tenant facts', () => {
    expect(msg).not.toContain('Art Value');
    expect(msg).not.toContain('ArtValue');
    expect(msg).not.toContain('נתן');
  });

  it('never mixes accounts', () => {
    const b = buildAccountOutreachMessage({ leadName: 'ליד', senderName: 'דן', businessProfile: ACCOUNT_B });
    expect(b).toContain('מאפייה ב');
    expect(b).not.toContain('סטודיו א');
    expect(b).not.toContain('עיצוב אתרים');
  });

  it('omits optional fields instead of inventing filler', () => {
    const bare = buildAccountOutreachMessage({ leadName: 'ליד', senderName: 'דן', businessProfile: { businessName: 'עסק ג' } });
    expect(bare).toContain('עסק ג');
    expect(bare).not.toContain('אנחנו עוזרים בעיקר עם');
    expect(bare).not.toContain('חשבתי שזה יכול להתאים');
  });

  it('falls back to a neutral opener (never another person) with no display name', () => {
    const noName = buildAccountOutreachMessage({ leadName: 'ליד', senderName: '', businessProfile: ACCOUNT_B });
    expect(noName).toContain('מאפייה ב');
    expect(noName).not.toContain('נתן');
  });
});

describe('unconfigured / malformed account — invents nothing', () => {
  it('returns null so the caller can show the truthful setup state', () => {
    for (const p of [null, undefined, {}, { positioning: 'מיצוב בלי שם' }, { businessName: '' }]) {
      expect(buildAccountOutreachMessage({ leadName: 'ליד', senderName: 'דן', businessProfile: p })).toBeNull();
    }
  });

  it('the setup copy states why no message is shown and promises nothing', () => {
    expect(OUTREACH_SETUP_REQUIRED).toContain('ההקשר העסקי');
    expect(OUTREACH_SETUP_REQUIRED).not.toContain('Art Value');
    expect(OUTREACH_SETUP_REQUIRED).not.toContain('נתן');
  });
});

describe('legacy templates are untouched (local/demo unchanged)', () => {
  it('data/outreach.js still carries its original ArtValue copy for local/demo', () => {
    // toContain here proves the legacy pack was NOT rewritten — not a neutrality claim.
    expect(CATS.length).toBe(8);
    expect(CATS.every((c) => typeof c.msg === 'string' && c.msg.includes('{name}'))).toBe(true);
    expect(CATS[0].msg).toContain('Art Value');
  });
});

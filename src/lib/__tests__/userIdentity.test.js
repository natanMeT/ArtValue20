import { describe, it, expect } from 'vitest';
import { resolveDisplayName, avatarInitial, userScopeKey } from '../userIdentity.js';

// S0C — session-derived identity + per-user storage-key scoping.
// Locked contract: full_name → name → email prefix → 'משתמש'; keys scope by
// the stable user.id ONLY (never name/email); no session → '_local' bucket;
// a scoped key NEVER equals the bare legacy base key.

const sess = (user) => ({ user });

describe('resolveDisplayName · locked fallback chain', () => {
  it('prefers user_metadata.full_name', () => {
    expect(resolveDisplayName(sess({
      id: 'u1', email: 'dana@example.com',
      user_metadata: { full_name: 'דנה לוי', name: 'ignored' },
    }))).toBe('דנה לוי');
  });

  it('falls back to user_metadata.name when full_name is missing/blank', () => {
    expect(resolveDisplayName(sess({
      id: 'u1', email: 'dana@example.com',
      user_metadata: { full_name: '   ', name: 'Dana' },
    }))).toBe('Dana');
  });

  it('falls back to the email prefix when metadata has no usable name', () => {
    expect(resolveDisplayName(sess({ id: 'u1', email: 'dana.levi@example.com', user_metadata: {} })))
      .toBe('dana.levi');
    expect(resolveDisplayName(sess({ id: 'u1', email: 'ben@x.co' }))).toBe('ben');
  });

  it('trims whitespace from metadata names', () => {
    expect(resolveDisplayName(sess({ id: 'u1', user_metadata: { full_name: '  רות כהן  ' } }))).toBe('רות כהן');
  });

  it('neutral fallback: no session / no user / no email → "משתמש" (never a person)', () => {
    expect(resolveDisplayName(null)).toBe('משתמש');
    expect(resolveDisplayName(undefined)).toBe('משתמש');
    expect(resolveDisplayName({})).toBe('משתמש');
    expect(resolveDisplayName(sess({ id: 'u1' }))).toBe('משתמש');
    expect(resolveDisplayName(sess({ id: 'u1', email: '', user_metadata: {} }))).toBe('משתמש');
    expect(resolveDisplayName(null)).not.toBe('נתן');
  });

  it('non-string metadata values are ignored safely', () => {
    expect(resolveDisplayName(sess({ id: 'u1', email: 'a@b.c', user_metadata: { full_name: 42, name: null } })))
      .toBe('a');
  });
});

describe('avatarInitial', () => {
  it('is the first character of the resolved display name', () => {
    expect(avatarInitial(sess({ id: 'u1', user_metadata: { full_name: 'דנה לוי' } }))).toBe('ד');
    expect(avatarInitial(sess({ id: 'u1', email: 'ben@x.co' }))).toBe('b');
    expect(avatarInitial(null)).toBe('מ'); // from the neutral fallback
  });
});

describe('userScopeKey · stable per-user key derivation', () => {
  const BASE = 'artvalue_jake_chat';

  it('scopes by the stable user.id only', () => {
    expect(userScopeKey(BASE, sess({ id: 'uuid-aaa', email: 'a@x.co', user_metadata: { full_name: 'A' } })))
      .toBe('artvalue_jake_chat_uuid-aaa');
  });

  it('different users get different keys', () => {
    const a = userScopeKey(BASE, sess({ id: 'uuid-aaa' }));
    const b = userScopeKey(BASE, sess({ id: 'uuid-bbb' }));
    expect(a).not.toBe(b);
  });

  it('the key never embeds display name or email (id only)', () => {
    const k = userScopeKey(BASE, sess({ id: 'uuid-aaa', email: 'secret@mail.com', user_metadata: { full_name: 'שם גלוי' } }));
    expect(k.includes('secret')).toBe(false);
    expect(k.includes('mail.com')).toBe(false);
    expect(k.includes('שם גלוי')).toBe(false);
  });

  it('no session → fixed "_local" bucket (stable across calls)', () => {
    expect(userScopeKey(BASE, null)).toBe('artvalue_jake_chat_local');
    expect(userScopeKey(BASE, undefined)).toBe(userScopeKey(BASE, {}));
  });

  it('NEVER returns the bare legacy base key — legacy stays unread by construction', () => {
    expect(userScopeKey(BASE, null)).not.toBe(BASE);
    expect(userScopeKey(BASE, sess({ id: 'u1' }))).not.toBe(BASE);
    expect(userScopeKey('artvalue_jake_brief_date', null)).not.toBe('artvalue_jake_brief_date');
  });

  it('same user id is deterministic', () => {
    expect(userScopeKey(BASE, sess({ id: 'u1' }))).toBe(userScopeKey(BASE, sess({ id: 'u1' })));
  });
});

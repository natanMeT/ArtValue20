import { describe, it, expect } from 'vitest';
import {
  validateBusinessProfile, normalizeBusinessProfile, isEmptyBusinessProfile,
  normalizeHex, BUSINESS_PROFILE_LIMITS, PALETTE_ROLES,
} from '../businessProfile.js';

// ===================================================================
// businessProfile — the single normalize/validate boundary (S0D).
// ===================================================================

const fieldsWithError = (res) => new Set(res.errors.map((e) => e.field));

describe('validateBusinessProfile · business_name (required)', () => {
  it('rejects an entirely empty profile (no business name) — never a misleading configured row', () => {
    for (const raw of [undefined, null, {}, { businessName: '   ' }, { positioning: 'x', audiences: ['a'] }]) {
      const res = validateBusinessProfile(raw);
      expect(res.ok).toBe(false);
      expect(fieldsWithError(res).has('businessName')).toBe(true);
      expect(res.value).toBe(null);
    }
  });

  it('accepts a minimal profile with just a business name (trimmed)', () => {
    const res = validateBusinessProfile({ businessName: '  סטודיו אלפא  ' });
    expect(res.ok).toBe(true);
    expect(res.value.businessName).toBe('סטודיו אלפא');
    expect(res.value.audiences).toEqual([]);
    expect(res.value.services).toEqual([]);
    expect(res.value.brandPalette).toBe(null);
  });

  it('rejects an over-length business name (no silent truncation)', () => {
    const res = validateBusinessProfile({ businessName: 'x'.repeat(BUSINESS_PROFILE_LIMITS.businessName + 1) });
    expect(res.ok).toBe(false);
    expect(fieldsWithError(res).has('businessName')).toBe(true);
  });
});

describe('validateBusinessProfile · lists + services', () => {
  it('removes blank list entries before validation', () => {
    const res = validateBusinessProfile({ businessName: 'א', audiences: ['יזמים', '', '   ', 'עסקים'] });
    expect(res.ok).toBe(true);
    expect(res.value.audiences).toEqual(['יזמים', 'עסקים']);
  });

  it('rejects over-limit list counts and over-length items', () => {
    const many = Array.from({ length: BUSINESS_PROFILE_LIMITS.audiences.max + 1 }, (_, i) => `a${i}`);
    expect(validateBusinessProfile({ businessName: 'א', audiences: many }).ok).toBe(false);
    const long = 'x'.repeat(BUSINESS_PROFILE_LIMITS.tone.each + 1);
    expect(validateBusinessProfile({ businessName: 'א', tone: [long] }).ok).toBe(false);
  });

  it('drops fully-blank services, requires a name for retained ones, pitch optional', () => {
    const res = validateBusinessProfile({
      businessName: 'א',
      services: [{ name: '', pitch: '' }, { name: 'מיתוג' }, { name: 'אתר', pitch: 'דף נחיתה' }],
    });
    expect(res.ok).toBe(true);
    expect(res.value.services).toEqual([{ name: 'מיתוג' }, { name: 'אתר', pitch: 'דף נחיתה' }]);
  });

  it('rejects a service item that has a pitch but no name', () => {
    const res = validateBusinessProfile({ businessName: 'א', services: [{ name: '', pitch: 'תיאור בלי שם' }] });
    expect(res.ok).toBe(false);
    expect(fieldsWithError(res).has('services')).toBe(true);
  });
});

describe('validateBusinessProfile · palette (optional, primary-only minimum, HEX)', () => {
  it('palette is optional — a profile with no palette is valid', () => {
    expect(validateBusinessProfile({ businessName: 'א' }).value.brandPalette).toBe(null);
    expect(validateBusinessProfile({ businessName: 'א', brandPalette: {} }).value.brandPalette).toBe(null);
  });

  it('normalizes valid HEX to canonical UPPERCASE #RRGGBB', () => {
    const res = validateBusinessProfile({ businessName: 'א', brandPalette: { primary: '#aabbcc', accent: '#00ffaa' } });
    expect(res.ok).toBe(true);
    expect(res.value.brandPalette).toEqual({ primary: '#AABBCC', accent: '#00FFAA' });
  });

  it('requires primary when any palette color is present', () => {
    const res = validateBusinessProfile({ businessName: 'א', brandPalette: { accent: '#00FFAA' } });
    expect(res.ok).toBe(false);
    expect(fieldsWithError(res).has('palette.primary')).toBe(true);
  });

  it('rejects invalid HEX visibly (per role)', () => {
    const res = validateBusinessProfile({ businessName: 'א', brandPalette: { primary: 'red', secondary: '#12345' } });
    expect(res.ok).toBe(false);
    expect(fieldsWithError(res).has('palette.primary')).toBe(true);
    expect(fieldsWithError(res).has('palette.secondary')).toBe(true);
  });

  it('PALETTE_ROLES = primary + 4 optionals; primary is first', () => {
    expect(PALETTE_ROLES[0]).toBe('primary');
    expect(PALETTE_ROLES).toEqual(['primary', 'secondary', 'accent', 'neutral1', 'neutral2']);
  });
});

describe('normalizeHex / normalizeBusinessProfile / isEmptyBusinessProfile', () => {
  it('normalizeHex → uppercase or null', () => {
    expect(normalizeHex('#aabbcc')).toBe('#AABBCC');
    expect(normalizeHex('  #Aabbcc ')).toBe('#AABBCC');
    expect(normalizeHex('nope')).toBe(null);
    expect(normalizeHex('')).toBe(null);
    expect(normalizeHex(null)).toBe(null);
  });

  it('normalizeBusinessProfile returns value or null (malformed → null)', () => {
    expect(normalizeBusinessProfile({ businessName: 'א' })).toMatchObject({ businessName: 'א' });
    expect(normalizeBusinessProfile({})).toBe(null);
    expect(normalizeBusinessProfile(null)).toBe(null);
  });

  it('isEmptyBusinessProfile true for null / missing name', () => {
    expect(isEmptyBusinessProfile(null)).toBe(true);
    expect(isEmptyBusinessProfile({ businessName: '' })).toBe(true);
    expect(isEmptyBusinessProfile({ businessName: 'א' })).toBe(false);
  });
});

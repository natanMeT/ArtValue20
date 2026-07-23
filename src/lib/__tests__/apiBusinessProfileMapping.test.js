import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { rowToBusinessProfile, mapToRow, BUSINESS_PROFILE_FIELDS } from '../api.js';

// ===================================================================
// api ↔ business_profile mapping (S0D). Pure mapping only (no network) +
// source-level wiring pins for fetchAll / upsert / bulkUpload.
// ===================================================================

const apiSrc = readFileSync(new URL('../api.js', import.meta.url), 'utf8');

const ROW = {
  user_id: 'u1', business_name: 'סטודיו אלפא', positioning: 'מיצוב',
  audiences: ['יזמים'], tone: ['חד'], differentiators: ['מהיר'],
  services: [{ name: 'מיתוג', pitch: 'לוגו' }], brand_palette: { primary: '#112233' },
  created_at: '2026-07-24', updated_at: '2026-07-24',
};

describe('rowToBusinessProfile (snake → camel, through the shared validator)', () => {
  it('maps a valid row to the canonical camelCase shape (drops ids/timestamps)', () => {
    expect(rowToBusinessProfile(ROW)).toEqual({
      businessName: 'סטודיו אלפא', positioning: 'מיצוב',
      audiences: ['יזמים'], tone: ['חד'], differentiators: ['מהיר'],
      services: [{ name: 'מיתוג', pitch: 'לוגו' }], brandPalette: { primary: '#112233' },
    });
  });

  it('null / malformed rows → null (treated as unconfigured → neutral)', () => {
    expect(rowToBusinessProfile(null)).toBe(null);
    expect(rowToBusinessProfile({ user_id: 'u1' })).toBe(null);              // no business_name
    expect(rowToBusinessProfile({ business_name: '   ' })).toBe(null);       // blank name
    expect(rowToBusinessProfile({ business_name: 'x', brand_palette: { accent: '#00FFAA' } })).toBe(null); // palette w/o primary
  });

  it('normalizes HEX to uppercase during hydration', () => {
    expect(rowToBusinessProfile({ business_name: 'x', brand_palette: { primary: '#aabbcc' } }).brandPalette).toEqual({ primary: '#AABBCC' });
  });
});

describe('BUSINESS_PROFILE_FIELDS (camel → snake write map)', () => {
  it('maps the canonical value to a snake row', () => {
    const value = rowToBusinessProfile(ROW);
    expect(mapToRow(value, BUSINESS_PROFILE_FIELDS)).toEqual({
      business_name: 'סטודיו אלפא', positioning: 'מיצוב',
      audiences: ['יזמים'], tone: ['חד'], differentiators: ['מהיר'],
      services: [{ name: 'מיתוג', pitch: 'לוגו' }], brand_palette: { primary: '#112233' },
    });
  });
});

describe('api source wiring (S0D)', () => {
  it('fetchAll reads business_profile (per-user, one row) and returns businessProfile', () => {
    expect(apiSrc).toContain("supabase.from('business_profile').select('*').limit(1)");
    expect(apiSrc).toContain('businessProfile: rowToBusinessProfile(');
  });

  it('upsertBusinessProfile validates at the boundary and upserts on user_id', () => {
    expect(apiSrc).toContain('export async function upsertBusinessProfile(userId, profile)');
    expect(apiSrc).toContain('validateBusinessProfile(profile)');
    expect(apiSrc).toContain("onConflict: 'user_id'");
  });

  it('bulkUpload imports business_profile through the SAME validator + adds to counts', () => {
    expect(apiSrc).toContain('validateBusinessProfile(data.businessProfile)');
    expect(apiSrc).toContain('businessProfile');
  });
});

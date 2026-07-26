import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveQuoteIssuer, QUOTE_DOC_TITLE, buildQuoteShareMessage } from '../quoteIssuer.js';
import { hasDurableProfile } from '../../data/businessBrain.js';

// ===================================================================
// S0F.1 correction — the customer-facing quote must carry the ACTIVE
// account's approved issuing business, or none at all. Before this fix the
// quote sheet and the share message hardcoded one studio's name, tagline,
// logo mark and a personal contact address for EVERY account.
//
// Behavioral proof on the pure resolver + source pins for the two rendering
// surfaces (this repo has no DOM renderer).
// ===================================================================

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const quotePrint = read('../../pages/QuotePrint.jsx');
const quotesPage = read('../../pages/Quotes.jsx');

const ACCOUNT_A = { businessName: 'סטודיו א', positioning: 'מיצוב א', services: [{ name: 'שירות א' }] };
const ACCOUNT_B = { businessName: 'מאפייה ב' };

describe('resolveQuoteIssuer — the active account, or nothing', () => {
  it('a configured account issues under its OWN saved business name', () => {
    expect(resolveQuoteIssuer(ACCOUNT_A)).toEqual({ name: 'סטודיו א' });
    expect(resolveQuoteIssuer(ACCOUNT_B)).toEqual({ name: 'מאפייה ב' });
  });

  it('account A\'s name never appears for account B (no cross-account reuse)', () => {
    expect(resolveQuoteIssuer(ACCOUNT_B).name).not.toBe(resolveQuoteIssuer(ACCOUNT_A).name);
    expect(resolveQuoteIssuer(ACCOUNT_B).name).not.toContain('סטודיו א');
  });

  it('unconfigured / malformed profile → null (neutral document, nothing invented)', () => {
    for (const p of [null, undefined, {}, [], 'x', { businessName: '   ' }, { positioning: 'בלי שם' }]) {
      expect(resolveQuoteIssuer(p)).toBeNull();
    }
  });

  it('NEVER falls back to Art Value / a person', () => {
    for (const p of [null, {}, { businessName: '' }]) {
      expect(JSON.stringify(resolveQuoteIssuer(p) || '')).not.toContain('Art Value');
      expect(JSON.stringify(resolveQuoteIssuer(p) || '')).not.toContain('נתן');
    }
    // ...and it DOES issue as Art Value when that is genuinely the saved name
    expect(resolveQuoteIssuer({ businessName: 'Art Value' })).toEqual({ name: 'Art Value' });
  });

  it('reuses the SHARED S0D usable-profile floor (no duplicated validation)', () => {
    expect(quotePrint.includes('resolveQuoteIssuer')).toBe(true);
    expect(read('../quoteIssuer.js')).toContain("import { hasDurableProfile } from '../data/businessBrain.js'");
    for (const p of [ACCOUNT_A, ACCOUNT_B, null, {}, { businessName: ' ' }]) {
      expect(Boolean(resolveQuoteIssuer(p))).toBe(hasDurableProfile(p));
    }
  });

  it('is pure — the input profile is never mutated', () => {
    const snapshot = JSON.stringify(ACCOUNT_A);
    resolveQuoteIssuer(ACCOUNT_A);
    expect(JSON.stringify(ACCOUNT_A)).toBe(snapshot);
  });
});

describe('buildQuoteShareMessage — the same issuer rule', () => {
  it('names the account\'s own business when configured', () => {
    const m = buildQuoteShareMessage({ businessProfile: ACCOUNT_A, quoteNumber: 'Q-1', totalText: '₪1,000' });
    expect(m).toContain('סטודיו א');
    expect(m).toContain('Q-1');
    expect(m).toContain('₪1,000');
    expect(m).not.toContain('Art Value');
  });

  it('stays issuer-free (and invents nothing) when unconfigured', () => {
    const m = buildQuoteShareMessage({ businessProfile: null, quoteNumber: 'Q-2', totalText: '₪500' });
    expect(m).toContain(QUOTE_DOC_TITLE);
    expect(m).toContain('Q-2');
    expect(m).not.toContain('Art Value');
    expect(m).not.toContain('נתן');
    expect(m).not.toContain('מ־');
  });

  it('never leaks one account\'s name into another\'s message', () => {
    const b = buildQuoteShareMessage({ businessProfile: ACCOUNT_B, quoteNumber: 'Q-3', totalText: '₪10' });
    expect(b).toContain('מאפייה ב');
    expect(b).not.toContain('סטודיו א');
  });
});

describe('the rendered quote surfaces carry no hardcoded issuer facts', () => {
  it('QuotePrint has no hardcoded business name, tagline, logo mark or contact', () => {
    const body = quotePrint.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(body).not.toContain('Art Value');
    expect(body).not.toContain('ArtValue');
    expect(body).not.toContain('סטודיו למיתוג ועיצוב דיגיטלי'); // fixed issuer tagline
    expect(body).not.toContain('qp-brand-sub');
    expect(body).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);        // no hardcoded contact address
    expect(body).not.toContain('<svg viewBox="0 0 64 64"');     // no fixed logo mark
  });

  it('Quotes.jsx share message is built from the account profile', () => {
    expect(quotesPage).toContain("import { buildQuoteShareMessage } from '../lib/quoteIssuer.js'");
    expect(quotesPage).toContain('buildQuoteShareMessage({ businessProfile: data.businessProfile');
    expect(quotesPage).not.toContain('Art Value');
  });

  it('issuer is resolved ONCE, so screen and print/PDF cannot disagree', () => {
    expect((quotePrint.match(/resolveQuoteIssuer\(/g) || []).length).toBe(1);
    expect(quotePrint).toContain('const issuer = resolveQuoteIssuer(data.businessProfile);');
    expect(quotePrint).toContain('window.print()'); // same DOM is printed
  });

  it('a missing Business Context never blocks access to the quote', () => {
    // the only early return is the not-found guard; nothing gates on the profile
    expect(quotePrint).toContain('if (!quote) {');
    expect(quotePrint).not.toMatch(/if \(!issuer\)[\s\S]{0,60}return/);
    expect(quotePrint).toContain('{QUOTE_DOC_TITLE}'); // neutral title always rendered
  });

  it('quote content, totals and customer fields are untouched', () => {
    for (const kept of [
      'quoteSubtotal(quote)', 'quoteVat(quote)', 'quoteTotal(quote)',
      '{quote.number}', '{quote.vatRate}', '{client?.name', '{it.desc}',
    ]) {
      expect(quotePrint.includes(kept), kept).toBe(true);
    }
  });

  it('introduces no DB / API / Gateway write', () => {
    for (const banned of ['dispatch(', 'callAiGateway', 'supabase', 'upsert', 'fetch(']) {
      expect(quotePrint.includes(banned), banned).toBe(false);
    }
    expect(read('../quoteIssuer.js')).not.toContain('dispatch');
    expect(read('../quoteIssuer.js')).not.toContain('localStorage');
  });
});

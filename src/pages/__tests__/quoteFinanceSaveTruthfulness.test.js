import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { saveLabel } from '../../lib/saveLabel.js';
import { BETA_MESSAGES, isMemoryOnlyDispatch, MEMORY_ONLY_DISPATCH } from '../../lib/betaCapabilities.js';

// Quote + Finance cloud save truthfulness — confirmed defects:
//   1. Quotes.save / Finance.save dispatched durable writes WITHOUT awaiting the
//      settled { ok } result and toasted "נשמר מקומית" unconditionally — a false
//      success window on failure AND a misleading source label on real cloud saves.
//   2. Quotes exposed "הפוך לפרויקט" in authenticated cloud, where ADD_PROJECT is
//      blocked by the memory-only firewall — it toasted 'נוצר פרויקט מההצעה' and
//      navigated to a ProjectDetail that was never created.
// House pattern (no jsdom): unit-test the pure pieces, source-pin the page wiring
// exactly like s0bConfirmedWrite.test.js does for Clients.

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const quotes = read('../Quotes.jsx');
const finance = read('../Finance.jsx');

describe('Quotes · persist-first save (awaits { ok } like Clients.save)', () => {
  const m = quotes.match(/const save = async \(quote\) => \{([\s\S]*?)\n  \};/);
  it('save is async, awaits the dispatch of ADD_QUOTE/UPDATE_QUOTE', () => {
    expect(m, 'async save present').not.toBe(null);
    expect(m[1].includes('await dispatch(')).toBe(true);
    expect(m[1].includes("{ type: 'UPDATE_QUOTE', payload: quote }")).toBe(true);
    expect(m[1].includes("{ type: 'ADD_QUOTE', payload: quote }")).toBe(true);
  });
  it('failure exits BEFORE any success toast / close / reset (dirty form preserved)', () => {
    const body = m[1];
    const fail = body.indexOf('res?.ok === false');
    expect(fail).toBeGreaterThan(-1);
    expect(fail).toBeLessThan(body.indexOf('toast('));
    expect(fail).toBeLessThan(body.indexOf('setEditing(null)'));
    expect(fail).toBeLessThan(body.indexOf('setPreset(null)'));
  });
  it('success wording is source-aware via saveLabel(mode); no hardcoded local claim', () => {
    expect(quotes.includes("import { saveLabel } from '../lib/saveLabel.js';")).toBe(true);
    expect(quotes.includes('ההצעה עודכנה · ${saveLabel(mode)}')).toBe(true);
    expect(quotes.includes('הצעת מחיר נוצרה · ${saveLabel(mode)}')).toBe(true);
    expect(quotes.includes('נשמר מקומית')).toBe(false);
  });
  it('mode really comes from the store hook', () => {
    expect(quotes.includes('const { data, dispatch, toast, mode } = useStore();')).toBe(true);
  });
});

describe('Quotes · cloud quote→project conversion is truthfully contained', () => {
  it('cloudBeta comes from the existing seam (isSupabaseConfigured), no new flag', () => {
    expect(quotes.includes("import { isSupabaseConfigured } from '../lib/supabase.js';")).toBe(true);
    expect(quotes.includes('const cloudBeta = isSupabaseConfigured;')).toBe(true);
  });
  it('toProject guards cloud FIRST: no ADD_PROJECT dispatch, no success toast, no navigation', () => {
    const m = quotes.match(/const toProject = \(quote\) => \{([\s\S]*?)\n  \};/);
    expect(m, 'toProject present').not.toBe(null);
    const body = m[1];
    const guard = body.indexOf('if (cloudBeta)');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(body.indexOf("dispatch("));
    expect(guard).toBeLessThan(body.indexOf('navigate('));
    expect(guard).toBeLessThan(body.indexOf('נוצר פרויקט מההצעה'));
    // the guard returns with the truthful centralized message, before anything runs
    expect(body.includes('toast(BETA_MESSAGES.quoteToProjectUnavailable')).toBe(true);
    expect(body.match(/if \(cloudBeta\) \{[\s\S]*?return;\s*\}/)).not.toBe(null);
  });
  it('accepted-status flow offers the convert dialog ONLY outside cloud beta', () => {
    expect(quotes.includes("if (status === 'accepted' && !cloudBeta) setConvertOffer(quote);")).toBe(true);
  });
  it('the card control renders a truthful unavailable state in cloud, keeps the button locally', () => {
    expect(quotes.includes("quote.status === 'accepted' && (cloudBeta ? (")).toBe(true);
    expect(quotes.includes('{BETA_MESSAGES.quoteToProjectUnavailable}')).toBe(true);
    expect(quotes.includes('הפוך לפרויקט')).toBe(true); // local/demo path retained
  });
  it('the centralized message is calm, truthful Hebrew from betaCapabilities', () => {
    expect(typeof BETA_MESSAGES.quoteToProjectUnavailable).toBe('string');
    expect(BETA_MESSAGES.quoteToProjectUnavailable).toContain('פרויקטים');
    expect(BETA_MESSAGES.quoteToProjectUnavailable).toContain('אינה זמינה');
  });
});

describe('Finance · persist-first save (awaits { ok } like Clients.save)', () => {
  const m = finance.match(/const save = async \(tx\) => \{([\s\S]*?)\n  \};/);
  it('save is async, awaits the dispatch of ADD_TX/UPDATE_TX', () => {
    expect(m, 'async save present').not.toBe(null);
    expect(m[1].includes('await dispatch(')).toBe(true);
    expect(m[1].includes("{ type: 'UPDATE_TX', payload: tx }")).toBe(true);
    expect(m[1].includes("{ type: 'ADD_TX', payload: tx }")).toBe(true);
  });
  it('failure exits BEFORE any success toast / close (dirty form preserved)', () => {
    const body = m[1];
    const fail = body.indexOf('res?.ok === false');
    expect(fail).toBeGreaterThan(-1);
    expect(fail).toBeLessThan(body.indexOf('toast('));
    expect(fail).toBeLessThan(body.indexOf('setEditing(null)'));
  });
  it('success wording is source-aware via saveLabel(mode); no hardcoded local claim', () => {
    expect(finance.includes("import { saveLabel } from '../lib/saveLabel.js';")).toBe(true);
    expect(finance.includes('התנועה עודכנה · ${saveLabel(mode)}')).toBe(true);
    expect(finance.includes('תנועה נוספה · ${saveLabel(mode)}')).toBe(true);
    expect(finance.includes('נשמר מקומית')).toBe(false);
    expect(finance.includes('const { data, dispatch, toast, mode } = useStore();')).toBe(true);
  });
});

describe('containment guards unchanged (no firewall weakening)', () => {
  it('ADD_PROJECT is still classified Memory-Only and blocked by the store firewall', () => {
    expect(MEMORY_ONLY_DISPATCH.has('ADD_PROJECT')).toBe(true);
    expect(isMemoryOnlyDispatch('ADD_PROJECT')).toBe(true);
    const store = read('../../store/store.jsx');
    expect(store.includes('if (isMemoryOnlyDispatch(action.type)) return Promise.resolve({ ok: false });')).toBe(true);
  });
  it('saveLabel still distinguishes supabase from everything else', () => {
    expect(saveLabel('supabase')).toBe('נשמר במערכת');
    expect(saveLabel('local')).toBe('נשמר מקומית');
    expect(saveLabel(undefined)).toBe('נשמר מקומית');
  });
});

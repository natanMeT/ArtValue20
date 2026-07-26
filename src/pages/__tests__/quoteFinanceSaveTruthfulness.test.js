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
//   3. (review correction) awaiting the write keeps the modal mounted with an
//      enabled submit — a second click before settlement dispatched a second
//      id-less ADD_* and withId() minted a fresh uuid for each → duplicate rows.
//      Fixed with a synchronous in-flight ref latch + visible `saving` state.
//
// House pattern (no jsdom): the pages pull in store/router/motion and are not
// cleanly renderable under Vitest — so, like ImageStudio.aiGateway.test.jsx, we
// extract the ACTUAL shipped save handler from the source and EXECUTE it with
// injected deps (behavioral proof), and source-pin the JSX wiring.

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const quotes = read('../Quotes.jsx');
const finance = read('../Finance.jsx');
const quoteModal = read('../../components/forms/QuoteModal.jsx');
const txModal = read('../../components/forms/TransactionModal.jsx');

// ---- behavioral harness: run the real shipped `save` with injected deps ------
const extractSave = (src, argName) => {
  const m = src.match(new RegExp(`const save = async \\(${argName}\\) => \\{[\\s\\S]*?\\n  \\};`));
  if (!m) throw new Error(`save handler not found for (${argName})`);
  return m[0];
};

// Quotes save closes over: savingRef, setSaving, dispatch, toast, saveLabel,
// mode, setEditing, setPreset. Finance omits setPreset. The REAL saveLabel is
// injected (not a stub) so wording assertions exercise the shipped helper too.
function makeQuotesSave(deps) {
  // eslint-disable-next-line no-new-func
  const f = new Function(
    'savingRef', 'setSaving', 'dispatch', 'toast', 'saveLabel', 'mode', 'setEditing', 'setPreset',
    `${extractSave(quotes, 'quote')}\nreturn save;`
  );
  return f(deps.savingRef, deps.setSaving, deps.dispatch, deps.toast, saveLabel, deps.mode, deps.setEditing, deps.setPreset);
}
function makeFinanceSave(deps) {
  // eslint-disable-next-line no-new-func
  const f = new Function(
    'savingRef', 'setSaving', 'dispatch', 'toast', 'saveLabel', 'mode', 'setEditing',
    `${extractSave(finance, 'tx')}\nreturn save;`
  );
  return f(deps.savingRef, deps.setSaving, deps.dispatch, deps.toast, saveLabel, deps.mode, deps.setEditing);
}

const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

// Fresh dep bag with counters; dispatch is overridable per test.
function makeDeps(dispatchImpl, mode = 'supabase') {
  const calls = { dispatch: 0, toasts: [], closed: 0, presetCleared: 0, savingStates: [] };
  return {
    calls,
    savingRef: { current: false },
    setSaving: (v) => calls.savingStates.push(v),
    dispatch: (action) => { calls.dispatch += 1; return dispatchImpl(action); },
    toast: (msg) => calls.toasts.push(msg),
    mode,
    setEditing: (v) => { if (v === null) calls.closed += 1; },
    setPreset: (v) => { if (v === null) calls.presetCleared += 1; },
  };
}

describe('Quotes.save · BEHAVIORAL (real shipped handler)', () => {
  it('rapid double invocation in the same tick dispatches EXACTLY ONCE', async () => {
    const d = deferred();
    const deps = makeDeps(() => d.promise);
    const save = makeQuotesSave(deps);
    const p1 = save({ clientId: 'c1', items: [] });          // id-less → ADD_QUOTE
    const p2 = save({ clientId: 'c1', items: [] });          // same tick, before any await settles
    d.resolve({ ok: true });
    await Promise.all([p1, p2]);
    expect(deps.calls.dispatch).toBe(1);                     // ONE row, not two
    expect(deps.calls.toasts.length).toBe(1);                // one success claim
    expect(deps.savingRef.current).toBe(false);              // latch released
  });

  it('latch RELEASES after settlement — a later save dispatches again', async () => {
    const deps = makeDeps(() => Promise.resolve({ ok: true }));
    const save = makeQuotesSave(deps);
    await save({ clientId: 'c1', items: [] });
    await save({ clientId: 'c1', items: [] });
    expect(deps.calls.dispatch).toBe(2);
  });

  it('failure { ok:false }: no success toast, no close, no reset — and submit re-enabled', async () => {
    const deps = makeDeps(() => Promise.resolve({ ok: false }));
    const save = makeQuotesSave(deps);
    await save({ clientId: 'c1', items: [] });
    expect(deps.calls.toasts.length).toBe(0);                // no success claim
    expect(deps.calls.closed).toBe(0);                       // modal stays open (dirty input kept)
    expect(deps.calls.presetCleared).toBe(0);
    expect(deps.savingRef.current).toBe(false);              // guard released for retry
    expect(deps.calls.savingStates).toEqual([true, false]);  // visible pending toggled off
    await save({ clientId: 'c1', items: [] });               // retry is possible
    expect(deps.calls.dispatch).toBe(2);
  });

  it('a REJECTED dispatch still releases the latch and claims no success', async () => {
    const deps = makeDeps(() => Promise.reject(new Error('boom')));
    const save = makeQuotesSave(deps);
    await expect(save({ clientId: 'c1', items: [] })).rejects.toThrow('boom');
    expect(deps.calls.toasts.length).toBe(0);
    expect(deps.calls.closed).toBe(0);
    expect(deps.savingRef.current).toBe(false);
  });

  it('cloud success: source-aware wording via the REAL saveLabel + close + reset', async () => {
    const deps = makeDeps(() => Promise.resolve({ ok: true }), 'supabase');
    const save = makeQuotesSave(deps);
    await save({ clientId: 'c1', items: [] });
    expect(deps.calls.toasts[0]).toBe('הצעת מחיר נוצרה · נשמר במערכת');
    await save({ id: 'q1', clientId: 'c1', items: [] });
    expect(deps.calls.toasts[1]).toBe('ההצעה עודכנה · נשמר במערכת');
    expect(deps.calls.closed).toBe(2);
    expect(deps.calls.presetCleared).toBe(2);
  });

  it('local/demo success keeps the truthful local wording', async () => {
    const deps = makeDeps(() => Promise.resolve({ ok: true }), 'local');
    const save = makeQuotesSave(deps);
    await save({ clientId: 'c1', items: [] });
    expect(deps.calls.toasts[0]).toBe('הצעת מחיר נוצרה · נשמר מקומית');
  });
});

describe('Finance.save · BEHAVIORAL (real shipped handler)', () => {
  it('rapid double invocation in the same tick dispatches EXACTLY ONCE', async () => {
    const d = deferred();
    const deps = makeDeps(() => d.promise);
    const save = makeFinanceSave(deps);
    const p1 = save({ type: 'income', amount: 100 });        // id-less → ADD_TX
    const p2 = save({ type: 'income', amount: 100 });
    d.resolve({ ok: true });
    await Promise.all([p1, p2]);
    expect(deps.calls.dispatch).toBe(1);                     // ONE transaction, totals not doubled
    expect(deps.savingRef.current).toBe(false);
  });

  it('failure { ok:false }: no success toast, no close, dirty state kept, guard released', async () => {
    const deps = makeDeps(() => Promise.resolve({ ok: false }));
    const save = makeFinanceSave(deps);
    await save({ type: 'income', amount: 100 });
    expect(deps.calls.toasts.length).toBe(0);
    expect(deps.calls.closed).toBe(0);
    expect(deps.savingRef.current).toBe(false);
    expect(deps.calls.savingStates).toEqual([true, false]);
    await save({ type: 'income', amount: 100 });
    expect(deps.calls.dispatch).toBe(2);                     // retry possible after failure
  });

  it('success wording is source-aware (cloud + local) and closes the modal', async () => {
    const cloud = makeDeps(() => Promise.resolve({ ok: true }), 'supabase');
    await makeFinanceSave(cloud)({ type: 'income', amount: 100 });
    expect(cloud.calls.toasts[0]).toBe('תנועה נוספה · נשמר במערכת');
    expect(cloud.calls.closed).toBe(1);
    const local = makeDeps(() => Promise.resolve({ ok: true }), 'local');
    await makeFinanceSave(local)({ id: 't1', type: 'income', amount: 100 });
    expect(local.calls.toasts[0]).toBe('התנועה עודכנה · נשמר מקומית');
  });
});

describe('pages · in-flight guard wiring (source pins)', () => {
  it('both pages hold a synchronous ref latch + visible saving state', () => {
    for (const src of [quotes, finance]) {
      expect(src.includes('const savingRef = useRef(false);')).toBe(true);
      expect(src.includes('const [saving, setSaving] = useState(false);')).toBe(true);
      expect(src.includes('if (savingRef.current) return; // already in flight')).toBe(true);
      // latch is set BEFORE the await and released in finally
      const body = extractSave(src, src === quotes ? 'quote' : 'tx');
      expect(body.indexOf('savingRef.current = true')).toBeLessThan(body.indexOf('await dispatch('));
      expect(body).toMatch(/finally \{\s*savingRef\.current = false;\s*setSaving\(false\);/);
    }
  });
  it('the saving state is passed to both modals', () => {
    expect(quotes.includes('saving={saving}')).toBe(true);
    expect(finance.includes('saving={saving}')).toBe(true);
  });
});

describe('modals · pending/disabled behavior (source pins)', () => {
  it('QuoteModal disables submit on saving AND keeps the validity guard', () => {
    expect(quoteModal.includes('saving = false }')).toBe(true);
    expect(quoteModal.includes('disabled={!valid || saving}')).toBe(true);
    expect(quoteModal.includes("{saving ? 'שומר…' : (initial ? 'שמירת שינויים' : 'יצירת הצעה')}")).toBe(true);
    // validity-only submit guard inside submit() unchanged
    expect(quoteModal.includes('if (!valid) return;')).toBe(true);
  });
  it('TransactionModal disables submit on saving with a truthful pending label', () => {
    expect(txModal.includes('saving = false }')).toBe(true);
    expect(txModal.includes('disabled={saving}')).toBe(true);
    expect(txModal.includes("{saving ? 'שומר…' : (initial ? 'שמירה' : 'הוספה')}")).toBe(true);
  });
  it('ClientModal is NOT part of this correction (unchanged)', () => {
    expect(read('../../components/forms/ClientModal.jsx').includes('saving')).toBe(false);
  });
});

describe('Quotes · persist-first save wiring (source pins)', () => {
  const body = extractSave(quotes, 'quote');
  it('save awaits the dispatch of ADD_QUOTE/UPDATE_QUOTE', () => {
    expect(body.includes('await dispatch(')).toBe(true);
    expect(body.includes("{ type: 'UPDATE_QUOTE', payload: quote }")).toBe(true);
    expect(body.includes("{ type: 'ADD_QUOTE', payload: quote }")).toBe(true);
  });
  it('failure exits BEFORE any success toast / close / reset (dirty form preserved)', () => {
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
    expect(guard).toBeLessThan(body.indexOf('dispatch('));
    expect(guard).toBeLessThan(body.indexOf('navigate('));
    expect(guard).toBeLessThan(body.indexOf('נוצר פרויקט מההצעה'));
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

describe('Finance · persist-first save wiring (source pins)', () => {
  const body = extractSave(finance, 'tx');
  it('save awaits the dispatch of ADD_TX/UPDATE_TX', () => {
    expect(body.includes('await dispatch(')).toBe(true);
    expect(body.includes("{ type: 'UPDATE_TX', payload: tx }")).toBe(true);
    expect(body.includes("{ type: 'ADD_TX', payload: tx }")).toBe(true);
  });
  it('failure exits BEFORE any success toast / close (dirty form preserved)', () => {
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

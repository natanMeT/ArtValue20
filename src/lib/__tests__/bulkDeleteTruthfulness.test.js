import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  isDispatchFailure,
  settledDispatchResults,
  summarizeBulkDelete,
  executeBulkDelete,
} from '../bulkDeleteOutcome.js';

// ===================================================================
// runBulkDelete false-success — the booked live defect.
//
// Pre-fix, `runBulkDelete` did `ids.forEach((id) => dispatch(...))`, discarded
// every promise, and toasted `נמחקו N ✓` in the same tick. A refused cloud
// delete reported success, and because the chat message is persisted (see
// chatPersistence.js) the false claim survived a reload.
//
// ⚠️ THESE TESTS EXECUTE THE REAL ARTIFACT. The whole decision path — dispatch
// fan-out, settling, id↔result pairing, the Hebrew copy — lives in
// `bulkDeleteOutcome.js` and is run here against a mocked dispatch. The React
// component keeps only the toast and the message swap, and those two lines are
// the only thing source-pinned. There is no jsdom and no @testing-library in
// this project (no `test` block in vite.config.js), so a rendered click cannot
// be measured; that limit is stated rather than papered over.
// ===================================================================

const GATE = {
  entity: 'clients',
  entityLabel: 'הלקוחות',
  dispatchType: 'DELETE_CLIENT',
  items: [
    { id: 'c1', label: 'לקוח א' },
    { id: 'c2', label: 'לקוח ב' },
    { id: 'c3', label: 'לקוח ג' },
  ],
};
const ALL_IDS = ['c1', 'c2', 'c3'];

// A store-shaped dispatch: resolves a settled { ok } object, never rejects —
// exactly the contract store.jsx's dispatch guarantees in every branch.
const dispatchWhere = (failIds) => {
  const calls = [];
  const fn = (action) => {
    calls.push(action);
    return Promise.resolve(failIds.includes(action.id) ? { ok: false } : { ok: true });
  };
  fn.calls = calls;
  return fn;
};

describe('bulkDeleteOutcome · all succeeded', () => {
  it('claims exactly N, and only after every dispatch settled ok', async () => {
    const dispatch = dispatchWhere([]);
    const out = await executeBulkDelete(dispatch, GATE, ALL_IDS);
    expect(out.okIds).toEqual(['c1', 'c2', 'c3']);
    expect(out.failedIds).toEqual([]);
    expect(out.toast).toEqual({ text: 'נמחקו 3 ✓', kind: 'success' });
    expect(out.text).toBe('✓ נמחקו 3 הלקוחות (הכל).');
  });

  it('dispatches the gate DELETE type once per id, and nothing else', async () => {
    const dispatch = dispatchWhere([]);
    await executeBulkDelete(dispatch, GATE, ALL_IDS);
    expect(dispatch.calls).toEqual([
      { type: 'DELETE_CLIENT', id: 'c1' },
      { type: 'DELETE_CLIENT', id: 'c2' },
      { type: 'DELETE_CLIENT', id: 'c3' },
    ]);
  });

  it('a SUBSET that all succeeds says "מתוך", never "(הכל)"', async () => {
    const out = await executeBulkDelete(dispatchWhere([]), GATE, ['c1', 'c2']);
    expect(out.text).toBe('✓ נמחקו 2 הלקוחות מתוך 3.');
    expect(out.text).not.toContain('הכל');
  });
});

describe('bulkDeleteOutcome · none succeeded — THE DEFECT', () => {
  it('makes NO success claim: no ✓, no toast, no deleted count', async () => {
    const dispatch = dispatchWhere(ALL_IDS);
    const out = await executeBulkDelete(dispatch, GATE, ALL_IDS);
    expect(out.okIds).toEqual([]);
    expect(out.failedIds).toEqual(['c1', 'c2', 'c3']);
    // A toast is the product's "it worked" signal — it must not fire at all.
    expect(out.toast).toBe(null);
    expect(out.text).not.toContain('✓');
    expect(out.text).not.toMatch(/נמחקו \d/); // the pre-fix false claim, verbatim
    expect(out.text).toBe('לא נמחק כלום — המחיקה בענן נכשלה (3 מתוך 3 הלקוחות). בדוק את הרשימה ונסה שוב.');
  });

  it('the pre-fix wording is unreachable when nothing was deleted', async () => {
    const out = await executeBulkDelete(dispatchWhere(ALL_IDS), GATE, ALL_IDS);
    expect(out.text).not.toBe('✓ נמחקו 3 הלקוחות (הכל).');
  });
});

describe('bulkDeleteOutcome · partial', () => {
  it('states BOTH numbers and never lets the successes imply the whole', async () => {
    const out = await executeBulkDelete(dispatchWhere(['c2']), GATE, ALL_IDS);
    expect(out.okIds).toEqual(['c1', 'c3']);
    expect(out.failedIds).toEqual(['c2']);
    expect(out.text).toContain('נמחקו 2');
    expect(out.text).toContain('מתוך 3');
    expect(out.text).toContain('1 לא נמחקו');
    expect(out.text).not.toContain('✓'); // partial is not a success event
  });

  it('the partial toast is an ERROR toast, not a green ✓', async () => {
    const out = await executeBulkDelete(dispatchWhere(['c2']), GATE, ALL_IDS);
    expect(out.toast.kind).toBe('error');
    expect(out.toast.text).toBe('נמחקו 2 מתוך 3 — 1 נכשלו');
    expect(out.toast.text).not.toContain('✓');
  });

  it('one success out of many is still not reported as "הכל"', async () => {
    const out = await executeBulkDelete(dispatchWhere(['c1', 'c3']), GATE, ALL_IDS);
    expect(out.okIds).toEqual(['c2']);
    expect(out.text).not.toContain('הכל');
    expect(out.text).toContain('2 לא נמחקו');
  });
});

describe('bulkDeleteOutcome · id ↔ result pairing', () => {
  it('names the ids that actually failed, whatever order they settle in', async () => {
    // c1 resolves LAST despite dispatching first; c3 resolves immediately.
    const dispatch = (action) => {
      if (action.id === 'c1') return new Promise((r) => setTimeout(() => r({ ok: false }), 20));
      if (action.id === 'c2') return new Promise((r) => setTimeout(() => r({ ok: true }), 10));
      return Promise.resolve({ ok: false });
    };
    const out = await executeBulkDelete(dispatch, GATE, ALL_IDS);
    expect(out.failedIds).toEqual(['c1', 'c3']); // NOT ['c3','c1'] — index order, not settle order
    expect(out.okIds).toEqual(['c2']);
  });

  it('summarizeBulkDelete pairs strictly by index', () => {
    const out = summarizeBulkDelete(ALL_IDS, [{ ok: true }, { ok: false }, { ok: true }], GATE);
    expect(out.okIds).toEqual(['c1', 'c3']);
    expect(out.failedIds).toEqual(['c2']);
  });

  it('a MISSING result (short results array) counts as failed, never as deleted', () => {
    const out = summarizeBulkDelete(ALL_IDS, [{ ok: true }], GATE);
    expect(out.okIds).toEqual(['c1']);
    expect(out.failedIds).toEqual(['c2', 'c3']); // absent ≠ confirmed
  });
});

describe('bulkDeleteOutcome · unreadable results — PINNED, deliberate', () => {
  // Mirrors confirmAction's `if (res && res.ok === false)`. Pinned so that a
  // dispatch which stops returning { ok } fails a test instead of silently
  // changing what the user is told. Unreachable from the real store today.
  it('failure means EXACTLY { ok: false }; nothing else is read as failure', () => {
    expect(isDispatchFailure({ ok: false })).toBe(true);
    expect(isDispatchFailure({ ok: false, error: new Error('x') })).toBe(true);
    expect(isDispatchFailure({ ok: true })).toBe(false);
    expect(isDispatchFailure(undefined)).toBe(false);
    expect(isDispatchFailure(null)).toBe(false);
    expect(isDispatchFailure({})).toBe(false);
    expect(isDispatchFailure('ok')).toBe(false);
    expect(isDispatchFailure(0)).toBe(false);
  });

  it('a dispatch returning undefined (non-promise) is treated as succeeded', async () => {
    const out = await executeBulkDelete(() => undefined, GATE, ALL_IDS);
    expect(out.okIds).toEqual(['c1', 'c2', 'c3']);
    expect(out.toast).toEqual({ text: 'נמחקו 3 ✓', kind: 'success' });
  });

  it('a dispatch returning a bare value (non-promise) is treated as succeeded', async () => {
    const out = await executeBulkDelete(() => 'done', GATE, ALL_IDS);
    expect(out.failedIds).toEqual([]);
  });

  it('this choice matches confirmAction, the single-delete path it mirrors', () => {
    const assistant = readFileSync(fileURLToPath(new URL('../../components/ai/Assistant.jsx', import.meta.url)), 'utf8');
    expect(assistant).toContain('if (res && res.ok === false)');
  });
});

describe('bulkDeleteOutcome · a failing dispatch can never throw past the outcome', () => {
  it('a REJECTED dispatch promise resolves to a failure, and does not throw', async () => {
    const dispatch = (action) => (action.id === 'c2'
      ? Promise.reject(new Error('network down'))
      : Promise.resolve({ ok: true }));
    let out;
    await expect((async () => { out = await executeBulkDelete(dispatch, GATE, ALL_IDS); })()).resolves.toBeUndefined();
    expect(out.failedIds).toEqual(['c2']);
    expect(out.okIds).toEqual(['c1', 'c3']);
  });

  it('a dispatch that throws SYNCHRONOUSLY is contained too', async () => {
    const dispatch = (action) => { if (action.id === 'c1') throw new Error('boom'); return Promise.resolve({ ok: true }); };
    const out = await executeBulkDelete(dispatch, GATE, ALL_IDS);
    expect(out.failedIds).toEqual(['c1']);
    expect(out.okIds).toEqual(['c2', 'c3']);
  });

  it('EVERY dispatch rejecting still produces a renderable no-success outcome', async () => {
    const out = await executeBulkDelete(() => Promise.reject(new Error('offline')), GATE, ALL_IDS);
    expect(out.toast).toBe(null);
    expect(out.text).toContain('לא נמחק כלום');
  });

  it('settledDispatchResults maps rejections to { ok: false } in index order', () => {
    const mapped = settledDispatchResults([
      { status: 'fulfilled', value: { ok: true } },
      { status: 'rejected', reason: new Error('x') },
    ]);
    expect(mapped[0]).toEqual({ ok: true });
    expect(mapped[1].ok).toBe(false);
  });
});

describe('bulkDeleteOutcome · degenerate input stays total', () => {
  it('an empty selection claims nothing and toasts nothing', async () => {
    const out = await executeBulkDelete(dispatchWhere([]), GATE, []);
    expect(out.toast).toBe(null);
    expect(out.okIds).toEqual([]);
    expect(out.text).toBe('לא נמחק כלום — לא נבחר דבר.');
  });

  it('a gate with no entityLabel still produces truthful copy', () => {
    const out = summarizeBulkDelete(['x'], [{ ok: false }], {});
    expect(out.text).toContain('לא נמחק כלום');
    expect(out.toast).toBe(null);
  });
});

// ---- NEGATIVE CONTROL ---------------------------------------------------
// A guard that cannot fail has not run. This re-implements the summariser the
// PRE-FIX way — claiming every id, ignoring `results` entirely — and proves the
// assertions above reject it. If this block ever passes the real summariser,
// the suite above is measuring nothing.
describe('bulkDeleteOutcome · negative control — a results-ignoring summariser MUST fail', () => {
  const ignoresResults = (ids, _results, gate) => ({
    okIds: [...ids],
    failedIds: [],
    toast: { text: `נמחקו ${ids.length} ✓`, kind: 'success' },
    text: `✓ נמחקו ${ids.length} ${gate.entityLabel} (הכל).`,
  });

  it('the pre-fix shape claims success on a total failure (this is the defect)', () => {
    const bad = ignoresResults(ALL_IDS, [{ ok: false }, { ok: false }, { ok: false }], GATE);
    expect(bad.toast).not.toBe(null);
    expect(bad.text).toContain('✓ נמחקו 3');
  });

  it('the REAL summariser rejects exactly that input — the assertions bite', () => {
    const real = summarizeBulkDelete(ALL_IDS, [{ ok: false }, { ok: false }, { ok: false }], GATE);
    const bad = ignoresResults(ALL_IDS, [{ ok: false }, { ok: false }, { ok: false }], GATE);
    expect(real.text).not.toBe(bad.text);
    expect(real.toast).toBe(null);
    expect(bad.toast).not.toBe(null);
  });

  it('and rejects it on a PARTIAL failure too', () => {
    const real = summarizeBulkDelete(ALL_IDS, [{ ok: true }, { ok: false }, { ok: true }], GATE);
    const bad = ignoresResults(ALL_IDS, [{ ok: true }, { ok: false }, { ok: true }], GATE);
    expect(real.okIds).toHaveLength(2);
    expect(bad.okIds).toHaveLength(3);
    expect(real.text).not.toBe(bad.text);
  });
});

// ---- SOURCE PINS --------------------------------------------------------
// Only the two lines that genuinely need React are pinned here: the toast and
// the message swap. Everything else above is executed.
describe('Assistant.jsx · runBulkDelete wiring', () => {
  const assistant = readFileSync(fileURLToPath(new URL('../../components/ai/Assistant.jsx', import.meta.url)), 'utf8');
  const body = (() => {
    const start = assistant.indexOf('const runBulkDelete =');
    expect(start, 'runBulkDelete present').toBeGreaterThan(-1);
    return assistant.slice(start, assistant.indexOf('const cancelGate =', start));
  })();

  it('runBulkDelete is async', () => {
    expect(body).toMatch(/const runBulkDelete = async \(idx, gate, ids\) =>/);
  });

  it('AWAITS the result before the first toast — the fix, in one assertion', () => {
    const awaitAt = body.indexOf('await executeBulkDelete(');
    const toastAt = body.indexOf('toast(');
    expect(awaitAt).toBeGreaterThan(-1);
    expect(toastAt).toBeGreaterThan(-1);
    expect(awaitAt).toBeLessThan(toastAt);
  });

  it('toasts CONDITIONALLY on the outcome — never unconditionally', () => {
    expect(body).toContain('if (outcome.toast) toast(outcome.toast.text, outcome.toast.kind);');
    expect(body).not.toMatch(/^\s*toast\(`נמחקו/m);
  });

  it('the message text comes from the outcome, not from ids.length', () => {
    expect(body).toContain('text: outcome.text');
    expect(body).not.toContain('${ids.length}');
  });

  it('the pre-fix fire-and-forget pattern is GONE from the whole file', () => {
    expect(assistant).not.toContain('ids.forEach((id) => dispatch(');
    expect(assistant).not.toMatch(/ids\.forEach\([^)]*dispatch/);
  });

  it('the gate card passes the promise back so the caller can await it', () => {
    expect(assistant).toContain('onDelete={(ids) => runBulkDelete(i, m.gate, ids)}');
  });
});

describe('Assistant.jsx · GateCard double-dispatch guard', () => {
  const assistant = readFileSync(fileURLToPath(new URL('../../components/ai/Assistant.jsx', import.meta.url)), 'utf8');
  const card = assistant.slice(assistant.indexOf('function GateCard('), assistant.indexOf('function OfferBriefForm('));

  it('holds a synchronous ref guard, not only a state flag', () => {
    // State alone is insufficient: two clicks in one tick both read the
    // pre-render `busy === false`. A ref updates synchronously.
    expect(card).toContain('const runningRef = useRef(false);');
    expect(card).toContain('if (runningRef.current) return;');
    expect(card).toContain('runningRef.current = true;');
  });

  it('awaits onDelete and releases the guard in finally', () => {
    expect(card).toMatch(/await onDelete\(\[\.\.\.selected\]\)/);
    expect(card).toMatch(/finally \{ runningRef\.current = false; setBusy\(false\); \}/);
  });

  it('the delete button is disabled while running and no longer calls onDelete inline', () => {
    expect(card).toContain('disabled={busy || !selected.size}');
    expect(card).toContain('onClick={submitDelete}');
    expect(card).not.toContain('onClick={() => onDelete([...selected])}');
  });

  it('cancel is disabled mid-flight so the card cannot unmount over an in-flight delete', () => {
    expect(card).toMatch(/disabled=\{busy\} onClick=\{onCancel\}/);
  });

  it('the guard sits on the ONE sink both entry paths reach', () => {
    // Deterministic lane (send → detectBulkDelete) and model-proposed
    // delete_all (approvePreview → codeGates) both render this same card.
    expect(assistant).toContain('const gate = buildBulkDeleteGate(bulkEntity, data, activePack.entities);');
    expect(assistant).toContain("codeGates.forEach((g) => setMessages((m) => [...m,");
    expect(assistant.match(/<GateCard /g)).toHaveLength(1);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { applyJakePrefill } from '../jakePrefill.js';

// ===================================================================
// jakePrefill (S0E · M2) — REAL behavioral proof (no jsdom needed).
// applyJakePrefill is the EXACT function the Assistant wires to the
// `jake:prefill` event. The injected ctx carries spies — including a
// `send`/`dispatch` spy that must NEVER be called — so "no auto-send" and
// "preserve existing composer" are proven behaviorally, not by source pins.
// ===================================================================

function spyCtx(current = '') {
  let input = current;
  const setInput = vi.fn((v) => { input = v; });
  const open = vi.fn();
  const getInput = vi.fn(() => input);
  // Deliberately NOT part of the real ctx — proves the handler can never reach them.
  const send = vi.fn();
  const dispatch = vi.fn();
  return { ctx: { open, getInput, setInput }, spies: { setInput, open, getInput, send, dispatch }, getInputValue: () => input };
}

describe('applyJakePrefill · opens + fills empty composer, never sends', () => {
  it('empty composer receives the exact text and Jake opens', () => {
    const { ctx, spies, getInputValue } = spyCtx('');
    const r = applyJakePrefill({ text: 'הצע 3 פעולות', source: 'onboarding' }, ctx);
    expect(spies.open).toHaveBeenCalledTimes(1);
    expect(spies.setInput).toHaveBeenCalledWith('הצע 3 פעולות');
    expect(getInputValue()).toBe('הצע 3 פעולות');
    expect(r).toEqual({ opened: true, filled: true });
    expect(spies.send).not.toHaveBeenCalled();
    expect(spies.dispatch).not.toHaveBeenCalled();
  });

  it('existing non-empty composer text is preserved verbatim (opens, never overwrites)', () => {
    const { ctx, spies, getInputValue } = spyCtx('טקסט שהמשתמש כתב');
    const r = applyJakePrefill({ text: 'הצעה מהאונבורדינג' }, ctx);
    expect(spies.open).toHaveBeenCalledTimes(1);
    expect(spies.setInput).not.toHaveBeenCalled();
    expect(getInputValue()).toBe('טקסט שהמשתמש כתב');
    expect(r).toEqual({ opened: true, filled: false });
    expect(spies.send).not.toHaveBeenCalled();
  });

  it('whitespace-only existing input is treated as empty (gets filled)', () => {
    const { ctx, spies } = spyCtx('   ');
    applyJakePrefill({ text: 'הצעה' }, ctx);
    expect(spies.setInput).toHaveBeenCalledWith('הצעה');
  });

  it('blank / missing / invalid text → does nothing (does not even open)', () => {
    for (const detail of [undefined, null, {}, { text: '' }, { text: '   ' }, { text: 42 }]) {
      const { ctx, spies } = spyCtx('');
      const r = applyJakePrefill(detail, ctx);
      expect(spies.open).not.toHaveBeenCalled();
      expect(spies.setInput).not.toHaveBeenCalled();
      expect(spies.send).not.toHaveBeenCalled();
      expect(r).toEqual({ opened: false, filled: false });
    }
  });

  it('the ctx exposes ONLY open/getInput/setInput — no send/append/history capability', () => {
    const { ctx } = spyCtx('');
    expect(Object.keys(ctx).sort()).toEqual(['getInput', 'open', 'setInput']);
  });
});

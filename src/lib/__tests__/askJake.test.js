import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { askJake } from '../askJake.js';

// ===================================================================
// askJake — the single jake:ask dispatch point (Ask Jake buttons slice).
// Runs in the node environment: window/CustomEvent do NOT exist by
// default, which is itself one of the behaviors under test.
// ===================================================================

describe('askJake — non-browser environment (no window)', () => {
  it('returns false and does not throw when window is unavailable', () => {
    expect(typeof window).toBe('undefined');
    expect(askJake('שאלה כלשהי')).toBe(false);
  });
});

describe('askJake — browser-like environment (stubbed)', () => {
  let dispatched;

  beforeEach(() => {
    dispatched = [];
    class FakeCustomEvent {
      constructor(type, opts = {}) {
        this.type = type;
        this.detail = opts.detail;
      }
    }
    vi.stubGlobal('CustomEvent', FakeCustomEvent);
    vi.stubGlobal('window', { dispatchEvent: vi.fn((e) => { dispatched.push(e); return true; }) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('dispatches a jake:ask event with detail === prompt and returns true', () => {
    const prompt = 'שאלה: מה כדאי לי לעשות היום?\nהקשר…';
    expect(askJake(prompt)).toBe(true);
    expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatched[0].type).toBe('jake:ask');
    expect(dispatched[0].detail).toBe(prompt);
  });

  it('returns false and does not dispatch for an empty string', () => {
    expect(askJake('')).toBe(false);
    expect(window.dispatchEvent).not.toHaveBeenCalled();
  });

  it('returns false and does not dispatch for whitespace-only input', () => {
    expect(askJake('   \n\t ')).toBe(false);
    expect(window.dispatchEvent).not.toHaveBeenCalled();
  });

  it('returns false and does not dispatch for non-string input', () => {
    for (const bad of [null, undefined, 42, {}, [], () => {}]) {
      expect(askJake(bad)).toBe(false);
    }
    expect(window.dispatchEvent).not.toHaveBeenCalled();
  });

  it('returns false when CustomEvent is unavailable', () => {
    vi.stubGlobal('CustomEvent', undefined);
    expect(askJake('שאלה')).toBe(false);
    expect(window.dispatchEvent).not.toHaveBeenCalled();
  });

  it('returns false when window has no dispatchEvent function', () => {
    vi.stubGlobal('window', {});
    expect(askJake('שאלה')).toBe(false);
  });
});

describe('askJake — module hygiene', () => {
  it('importing the module has no side effects (nothing dispatched at import time)', async () => {
    // The module was imported at the top of this file while `window` did not
    // exist — any import-time dispatch would have thrown. Re-import fresh to
    // make the property explicit.
    vi.resetModules();
    const mod = await import('../askJake.js');
    expect(typeof mod.askJake).toBe('function');
  });
});

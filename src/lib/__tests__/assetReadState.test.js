import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assetStateAfterRead, ASSET_OUTCOME } from '../assetReadState.js';

// ===================================================================
// The pure seam decision for the asset library. Same RULE as the calendar and
// campaigns, deliberately NOT the same module — see the header of
// assetReadState.js for why the three are not merged.
// ===================================================================

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('assetStateAfterRead', () => {
  it('keeps the rows only on a successful read', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    expect(assetStateAfterRead(ASSET_OUTCOME.LOADED, rows)).toEqual({ assets: rows, error: false });
  });

  it('keeps an EMPTY successful read as an empty array, not as "not loaded"', () => {
    // [] is a verified fact ("this account has no assets"); undefined is not.
    expect(assetStateAfterRead(ASSET_OUTCOME.LOADED, [])).toEqual({ assets: [], error: false });
  });

  it('drops the rows on FAILED', () => {
    expect(assetStateAfterRead(ASSET_OUTCOME.FAILED, [{ id: 'a' }]))
      .toEqual({ assets: undefined, error: true });
  });

  it('drops the rows on TIMED_OUT', () => {
    expect(assetStateAfterRead(ASSET_OUTCOME.TIMED_OUT, [{ id: 'a' }]))
      .toEqual({ assets: undefined, error: true });
  });

  it('treats a LOADED non-array as a FAILURE, never as an empty list', () => {
    // [] would assert "there are no assets" — the one claim an unusable
    // response cannot support.
    for (const bad of [null, undefined, {}, 'rows', 0, NaN, false]) {
      expect(assetStateAfterRead(ASSET_OUTCOME.LOADED, bad))
        .toEqual({ assets: undefined, error: true });
    }
  });

  it('treats an unknown outcome as a failure', () => {
    expect(assetStateAfterRead('something_else', [{ id: 'a' }]))
      .toEqual({ assets: undefined, error: true });
  });

  it('returns exactly two keys — there is no `settled` gate on this lane', () => {
    expect(Object.keys(assetStateAfterRead(ASSET_OUTCOME.LOADED, []))).toEqual(['assets', 'error']);
    expect(Object.keys(assetStateAfterRead(ASSET_OUTCOME.FAILED))).toEqual(['assets', 'error']);
  });

  it('does not mutate or copy the caller rows', () => {
    const rows = [{ id: 'a' }];
    expect(assetStateAfterRead(ASSET_OUTCOME.LOADED, rows).assets).toBe(rows);
  });
});

describe('assetReadState purity', () => {
  const src = read('../assetReadState.js');
  // Strip line comments first, then block comments — the reverse order lets a
  // `//`-commented glob containing `/*` swallow the file (measured in
  // campaignsContainment.test.js).
  const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  it('imports nothing at all', () => {
    expect(code).not.toMatch(/\bimport\b/);
    expect(code).not.toMatch(/\brequire\(/);
  });

  it('has no store, network, React, storage or clock', () => {
    for (const forbidden of ['react', 'supabase', 'localStorage', 'sessionStorage', 'fetch(', 'Date.now', 'new Date']) {
      expect(code).not.toContain(forbidden);
    }
  });
});

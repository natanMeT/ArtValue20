import { describe, it, expect } from 'vitest';
import {
  activeBrandPalette, brandPaletteInstruction, withBrandPalette,
  PALETTE_BLOCK_START, PALETTE_BLOCK_END,
} from '../brandPalette.js';

// ===================================================================
// S0F.1 (D5) — brand-palette consumption. Proves the four locked rules:
//   * the EXACT stored uppercase HEX values are passed through (no
//     normalization, no substitution, no derived shades);
//   * OFF injects nothing at all (prompt byte-identical);
//   * an absent / malformed palette invents nothing;
//   * one account's palette can never appear in another's prompt.
// Pure module: no React, no storage, no network.
// ===================================================================

const A = { businessName: 'עסק א', brandPalette: { primary: '#112233', secondary: '#AABBCC', accent: '#FF00AA', neutral1: '#000000', neutral2: '#FFFFFF' } };
const B = { businessName: 'עסק ב', brandPalette: { primary: '#0E0E0E' } };

describe('activeBrandPalette — what counts as a usable palette', () => {
  it('returns the roles in canonical order with the exact stored values', () => {
    expect(activeBrandPalette(A)).toEqual([
      { role: 'primary', value: '#112233' },
      { role: 'secondary', value: '#AABBCC' },
      { role: 'accent', value: '#FF00AA' },
      { role: 'neutral1', value: '#000000' },
      { role: 'neutral2', value: '#FFFFFF' },
    ]);
  });

  it('a primary-only palette is usable', () => {
    expect(activeBrandPalette(B)).toEqual([{ role: 'primary', value: '#0E0E0E' }]);
  });

  it('no profile / no palette → null (nothing to show, nothing to inject)', () => {
    for (const p of [null, undefined, {}, { businessName: 'x' }, { brandPalette: null }, { brandPalette: [] }, 'nope']) {
      expect(activeBrandPalette(p)).toBeNull();
    }
  });

  it('MALFORMED values are dropped, never repaired', () => {
    // lowercase / 3-digit / named / non-string are all non-canonical
    expect(activeBrandPalette({ brandPalette: { primary: '#aabbcc' } })).toBeNull();
    expect(activeBrandPalette({ brandPalette: { primary: '#ABC' } })).toBeNull();
    expect(activeBrandPalette({ brandPalette: { primary: 'red' } })).toBeNull();
    expect(activeBrandPalette({ brandPalette: { primary: 123456 } })).toBeNull();
    // a valid primary survives while a malformed secondary is simply omitted
    expect(activeBrandPalette({ brandPalette: { primary: '#112233', secondary: '#zzz' } }))
      .toEqual([{ role: 'primary', value: '#112233' }]);
  });

  it('a palette WITHOUT a valid primary is unusable in full (S0D rule)', () => {
    expect(activeBrandPalette({ brandPalette: { secondary: '#AABBCC', accent: '#FF00AA' } })).toBeNull();
  });
});

describe('brandPaletteInstruction — exact values, clearly delimited', () => {
  it('emits every stored HEX verbatim inside the delimiters', () => {
    const block = brandPaletteInstruction(A);
    expect(block.startsWith(PALETTE_BLOCK_START)).toBe(true);
    expect(block.endsWith(PALETTE_BLOCK_END)).toBe(true);
    for (const hex of ['#112233', '#AABBCC', '#FF00AA', '#000000', '#FFFFFF']) {
      expect(block).toContain(hex);
    }
  });

  it('invents no color when there is no usable palette', () => {
    expect(brandPaletteInstruction(null)).toBe('');
    expect(brandPaletteInstruction({ businessName: 'x' })).toBe('');
    expect(brandPaletteInstruction({ brandPalette: { primary: '#abc' } })).toBe('');
  });
});

describe('withBrandPalette — the prompt seam', () => {
  const userPrompt = 'לוגו מודרני לעסק דיגיטלי';

  it('ON + configured palette appends the block and preserves the user prompt', () => {
    const out = withBrandPalette(userPrompt, A, true);
    expect(out.startsWith(userPrompt)).toBe(true);
    expect(out).toContain(PALETTE_BLOCK_START);
    expect(out).toContain('#112233');
  });

  it('OFF returns the prompt BYTE-IDENTICAL (no palette instruction at all)', () => {
    const out = withBrandPalette(userPrompt, A, false);
    expect(out).toBe(userPrompt);
    expect(out).not.toContain(PALETTE_BLOCK_START);
    expect(out).not.toContain('#112233');
  });

  it('absent / malformed palette returns the prompt BYTE-IDENTICAL', () => {
    expect(withBrandPalette(userPrompt, null, true)).toBe(userPrompt);
    expect(withBrandPalette(userPrompt, { businessName: 'x' }, true)).toBe(userPrompt);
    expect(withBrandPalette(userPrompt, { brandPalette: { primary: '#aabbcc' } }, true)).toBe(userPrompt);
  });

  it('never leaks another account\'s palette', () => {
    const outB = withBrandPalette(userPrompt, B, true);
    expect(outB).toContain('#0E0E0E');
    for (const aHex of ['#112233', '#AABBCC', '#FF00AA']) expect(outB).not.toContain(aHex);
  });

  it('does not invent a prompt when the user typed none', () => {
    expect(withBrandPalette('', null, true)).toBe('');
    expect(withBrandPalette('', A, true)).toBe(brandPaletteInstruction(A));
  });
});

// ===================================================================
// S0F.1 — brand-palette prompt consumption (pure, deterministic).
// No React, no DOM, no network, no storage, no clock, no randomness.
//
// CONTRACT (locked S0F.1 product decisions, D5):
//   * The ONLY source is the active account's durable, validated
//     businessProfile.brandPalette (S0D). Nothing else may seed a color.
//   * Values are passed THROUGH byte-exactly — the canonical uppercase
//     `#RRGGBB` the account approved. No normalization, no re-casing, no
//     nearest-color substitution, no added/derived shades.
//   * A palette is usable only when it carries a valid `primary` (the same
//     rule the S0D validator enforces). Missing / malformed → NO palette:
//     the caller shows nothing and injects nothing. A color is NEVER invented.
//   * This module builds a prompt SUFFIX only. It never touches CSS
//     variables or the application theme.
// ===================================================================

import { PALETTE_ROLES } from './businessProfile.js';

// Canonical stored form (S0D): uppercase 6-digit hex. Anything else is
// treated as malformed — we do not repair it, we drop the palette.
const CANONICAL_HEX = /^#[0-9A-F]{6}$/;

const isCanonicalHex = (v) => typeof v === 'string' && CANONICAL_HEX.test(v);

// English role labels for the prompt suffix (image prompts are English-only).
const ROLE_LABEL = {
  primary: 'primary',
  secondary: 'secondary',
  accent: 'accent',
  neutral1: 'neutral',
  neutral2: 'neutral',
};

/**
 * The account's usable palette, or null.
 * Returns role/value pairs in canonical PALETTE_ROLES order, carrying ONLY
 * roles whose stored value is canonical. `primary` is mandatory.
 * @returns {{ role: string, value: string }[] | null}
 */
export function activeBrandPalette(businessProfile) {
  const p = businessProfile && typeof businessProfile === 'object' ? businessProfile.brandPalette : null;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  if (!isCanonicalHex(p.primary)) return null; // no valid primary → no palette at all
  const roles = PALETTE_ROLES
    .filter((role) => isCanonicalHex(p[role]))
    .map((role) => ({ role, value: p[role] }));
  return roles.length ? roles : null;
}

// Clearly delimited so the instruction can never be mistaken for the user's
// own prompt text (and so a test can assert its exact presence/absence).
export const PALETTE_BLOCK_START = '[BRAND PALETTE]';
export const PALETTE_BLOCK_END = '[/BRAND PALETTE]';

/**
 * The palette instruction block for a usable palette, or '' when there is none.
 * Emits the exact stored HEX values, unmodified.
 */
export function brandPaletteInstruction(businessProfile) {
  const roles = activeBrandPalette(businessProfile);
  if (!roles) return '';
  const list = roles.map((r) => `${ROLE_LABEL[r.role] || r.role} ${r.value}`).join(', ');
  return [
    PALETTE_BLOCK_START,
    `Use this exact brand color palette: ${list}.`,
    'Keep these colors dominant in the composition. Do not substitute other brand colors.',
    PALETTE_BLOCK_END,
  ].join('\n');
}

/**
 * Append the palette instruction to a prompt.
 * `enabled=false`, no profile, or an absent/malformed palette all return the
 * prompt UNCHANGED (byte-for-byte) — nothing is injected and nothing invented.
 */
export function withBrandPalette(prompt, businessProfile, enabled = true) {
  const base = typeof prompt === 'string' ? prompt : '';
  if (!enabled) return base;
  const block = brandPaletteInstruction(businessProfile);
  if (!block) return base;
  return base.trim() ? `${base}\n\n${block}` : block;
}

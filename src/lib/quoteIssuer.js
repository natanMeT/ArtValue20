// ===================================================================
// S0F.1 — customer-facing quote issuer identity (pure, deterministic).
// No React, no DOM, no network, no storage, no clock, no randomness.
//
// WHY: the quote sheet and the quote-share message hardcoded ONE studio as
// the issuing business (name, tagline, logo mark and a personal contact
// address). In the authenticated cloud beta that document is produced by
// every signed-in account and sent to THEIR customers, so it must carry the
// active account's own approved identity — or none at all.
//
// CONTRACT:
//   * The only source is the account's durable, approved Business Context
//     (S0D). The usable-profile floor is the SHARED hasDurableProfile()
//     predicate — S0D validation rules are never duplicated here.
//   * Unconfigured / malformed profile → null. The caller then renders a
//     neutral document (plain "הצעת מחיר") and invents NOTHING: no business
//     name, no person, no phone, email, address or logo. Access to the quote
//     itself is never blocked.
//   * "Art Value" is NEVER a fallback. It appears as the issuer only when it
//     genuinely is the active account's saved business name.
//   * Pure: no mutation, no persistence, no quote/customer/amount data.
// ===================================================================

import { hasDurableProfile } from '../data/businessBrain.js';

/**
 * The issuing business for a customer-facing quote document.
 * @param {object|null} businessProfile the active account's durable profile
 * @returns {{ name: string } | null} null when the account has no usable one.
 */
export function resolveQuoteIssuer(businessProfile) {
  if (!hasDurableProfile(businessProfile)) return null;
  return { name: String(businessProfile.businessName).trim() };
}

// Neutral document title — used whether or not an issuer resolved, so an
// unconfigured account still gets a correct, honest quote document.
export const QUOTE_DOC_TITLE = 'הצעת מחיר';

/**
 * The quote-share message text. Names the issuing business ONLY when the
 * account approved one; otherwise it stays truthful and issuer-free.
 * Text only — this builds no link and sends nothing.
 */
export function buildQuoteShareMessage({ businessProfile, quoteNumber, totalText }) {
  const issuer = resolveQuoteIssuer(businessProfile);
  const from = issuer ? ` מ־${issuer.name}` : '';
  return `שלום, מצורפת ${QUOTE_DOC_TITLE} ${quoteNumber || ''}${from} על סך ${totalText || ''}.`.replace(/\s+/g, ' ').trim();
}

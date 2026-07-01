import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CALL_CATEGORIES, buildCallPrep } from '../growthCalls.js';
import {
  LEAD_CATEGORIES, SERVICES, ACTIONS, serviceById, actionById,
} from '../growthLeads.js';
import {
  CONTENT_LIBRARY_ITEMS, itemById, categoryById as contentCategoryById,
  formatById, matchContentTemplates, itemsByCategory,
} from '../growthContentAds.js';

// ===================================================================
// Growth OS — Calls / Follow-up Prep data-integrity coverage.
// Pure, deterministic assertions over the buildCallPrep helper. No runtime,
// UI, network, persistence, AI/provider, or Creative Engine V2 involvement.
// ===================================================================

const allIds = LEAD_CATEGORIES.map((c) => c.id);

describe('growthCalls · CALL_CATEGORIES selector options', () => {
  it('mirrors the lead-mapping categories 1:1 in order', () => {
    expect(CALL_CATEGORIES.map((c) => c.id)).toEqual(allIds);
  });

  it('exposes only id/label/icon (lightweight, self-contained options)', () => {
    for (const opt of CALL_CATEGORIES) {
      expect(Object.keys(opt).sort()).toEqual(['icon', 'id', 'label']);
      expect(typeof opt.id).toBe('string');
      expect(typeof opt.label).toBe('string');
    }
  });

  it('returns fresh option objects (not references into LEAD_CATEGORIES)', () => {
    CALL_CATEGORIES.forEach((opt, i) => {
      expect(opt).not.toBe(LEAD_CATEGORIES[i]);
    });
  });
});

describe('growthCalls · buildCallPrep', () => {
  // Req 1 — returns a prep object for every lead category.
  it('returns a prep object for every lead category', () => {
    for (const id of allIds) {
      const prep = buildCallPrep(id);
      expect(prep).toBeTruthy();
      expect(prep.categoryId).toBe(id);
    }
  });

  // Req 2 — unknown / undefined category id returns a safe null result.
  it('returns null for unknown / undefined / non-string category ids', () => {
    expect(buildCallPrep('does_not_exist')).toBeNull();
    expect(buildCallPrep(undefined)).toBeNull();
    expect(buildCallPrep(null)).toBeNull();
    expect(buildCallPrep('')).toBeNull();
    expect(buildCallPrep(42)).toBeNull();
  });

  // Req 3 — the recommended action resolves in ACTIONS.
  it('resolves the recommended action via ACTIONS', () => {
    for (const cat of LEAD_CATEGORIES) {
      const prep = buildCallPrep(cat.id);
      expect(prep.action).toBeTruthy();
      expect(prep.action).toBe(actionById(cat.action));
      expect(ACTIONS[prep.action.id]).toBe(prep.action);
    }
  });

  // Req 4 — the main offer resolves in the service catalog.
  it('resolves the main offer via serviceById', () => {
    for (const cat of LEAD_CATEGORIES) {
      const prep = buildCallPrep(cat.id);
      expect(prep.offer).toBeTruthy();
      expect(prep.offer).toBe(serviceById(cat.offerId));
      expect(SERVICES[prep.offer.id]).toBe(prep.offer);
    }
  });

  // Req 5 — the entry offer resolves when present, and hasEntry is coherent.
  it('resolves the entry offer when present and flags hasEntry only when distinct', () => {
    for (const cat of LEAD_CATEGORIES) {
      const prep = buildCallPrep(cat.id);
      if (cat.entryOfferId) {
        expect(prep.entryOffer).toBeTruthy();
        expect(prep.entryOffer.id).toBe(cat.entryOfferId);
        expect(prep.hasEntry).toBe(prep.entryOffer.id !== prep.offer.id);
      } else {
        expect(prep.entryOffer).toBeNull();
        expect(prep.hasEntry).toBe(false);
      }
    }
  });

  // Req 6 — matched content templates are real library items.
  it('surfaces only real Content & Ads Library items as templates', () => {
    for (const id of allIds) {
      const prep = buildCallPrep(id);
      for (const t of prep.templates) {
        expect(itemById(t.id)).toBe(t);
        expect(CONTENT_LIBRARY_ITEMS).toContain(t);
      }
      // de-duplicated by id.
      const ids = prep.templates.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
      // capped at 4 (the prep view surfaces 2–4 templates).
      expect(prep.templates.length).toBeLessThanOrEqual(4);
    }
  });

  // Req 7 — matched templates have valid category and format references.
  it('templates carry valid category and format references', () => {
    for (const id of allIds) {
      const prep = buildCallPrep(id);
      for (const t of prep.templates) {
        expect(contentCategoryById(t.categoryId)).toBeTruthy();
        expect(Array.isArray(t.formats)).toBe(true);
        for (const f of t.formats) {
          expect(formatById(f)).toBeTruthy();
        }
      }
    }
  });

  // Req 8 — output includes the call-prep fields sourced from the category.
  it('includes pains, proof, objection, response, whyFit and expectedValue', () => {
    for (const cat of LEAD_CATEGORIES) {
      const prep = buildCallPrep(cat.id);
      expect(Array.isArray(prep.pains)).toBe(true);
      expect(prep.pains).toEqual(cat.pains || []);
      expect(Array.isArray(prep.proof)).toBe(true);
      expect(prep.proof).toEqual(cat.proof || []);
      expect(prep.objection).toBe(cat.objection || '');
      expect(prep.response).toBe(cat.response || '');
      expect(prep.whyFit).toBe(cat.whyFit || '');
      expect(prep.expectedValue).toBe(cat.expectedValue || '');
      expect(prep.offerIds).toEqual(
        [cat.offerId, cat.entryOfferId, ...(cat.upsell || [])].filter(Boolean),
      );
      // upsell path is resolved to real service objects (mirrors offer / entryOffer).
      expect(Array.isArray(prep.upsell)).toBe(true);
      expect(prep.upsell).toEqual((cat.upsell || []).map(serviceById).filter(Boolean));
      for (const s of prep.upsell) {
        expect(s).toBeTruthy();
        expect(SERVICES[s.id]).toBe(s);
      }
    }
  });

  // Req 9 — helper is deterministic.
  it('is deterministic (same input → deep-equal output)', () => {
    for (const id of allIds) {
      expect(buildCallPrep(id)).toEqual(buildCallPrep(id));
    }
  });

  // Req 10 — helper does not mutate source lead or content data.
  it('does not mutate the source lead / content / catalog data', () => {
    const before = JSON.stringify({
      LEAD_CATEGORIES, CONTENT_LIBRARY_ITEMS, SERVICES, ACTIONS,
    });
    for (const id of allIds) {
      const prep = buildCallPrep(id);
      // mutating the returned arrays must not reach back into the sources.
      prep.pains.push('___mutation-probe___');
      prep.proof.push('___mutation-probe___');
      prep.templates.push(null);
      prep.offerIds.push('___mutation-probe___');
    }
    const after = JSON.stringify({
      LEAD_CATEGORIES, CONTENT_LIBRARY_ITEMS, SERVICES, ACTIONS,
    });
    expect(after).toBe(before);
  });

  // Req 11 — every category yields at least one offer-matched content template.
  it('yields at least one offer-matched content template per category', () => {
    for (const id of allIds) {
      const prep = buildCallPrep(id);
      expect(prep.templates.length).toBeGreaterThanOrEqual(1);
      // the offer path itself matches ≥1 real content template…
      expect(matchContentTemplates(prep.offerIds, 4).length).toBeGreaterThanOrEqual(1);
      // …and at least one surfaced template is offer-relevant.
      const anyOfferRelevant = prep.templates.some((t) =>
        (t.relatedOffers || []).some((o) => prep.offerIds.includes(o)),
      );
      expect(anyOfferRelevant).toBe(true);
      // follow-up / WhatsApp templates are prioritized into every prep when they exist.
      const followups = itemsByCategory('followups_whatsapp');
      if (followups.length > 0) {
        const hasFollowup = prep.templates.some((t) => t.categoryId === 'followups_whatsapp');
        expect(hasFollowup).toBe(true);
      }
    }
  });

  // Req 12 — no API / persistence / messaging behavior is introduced.
  it('helper source contains no network, persistence, or messaging APIs', () => {
    const src = readFileSync(new URL('../growthCalls.js', import.meta.url), 'utf8');
    const forbidden = [
      'fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'indexedDB',
      'supabase', 'axios', 'navigator', 'window.', 'document.', 'wa.me',
      'mailto:', 'WebSocket', 'import(',
    ];
    for (const token of forbidden) {
      expect(src.includes(token)).toBe(false);
    }
  });
});

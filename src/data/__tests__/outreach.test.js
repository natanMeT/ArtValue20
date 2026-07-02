import { describe, it, expect } from 'vitest';
import {
  CATS,
  OUTREACH_NEEDS_DEFAULT,
  OUTREACH_SEED,
  OUTREACH_EXTRA,
  OUTREACH_SEED_VERSION,
  OUTREACH_STATUS,
  OUTREACH_TO_GROWTH_CATEGORY,
  catById,
  needFor,
  buildMessage,
} from '../outreach.js';
import { LEAD_CATEGORIES } from '../growthLeads.js';

// ===================================================================
// Outreach data integrity + systems-led positioning.
// (Slice: modal viewport hardening + lead research repositioning)
// ===================================================================

// Persisted leads reference these ids (store.jsx) — renaming/removing one
// orphans saved leads onto the CATS[0] fallback. New ids may be appended.
const STABLE_IDS = ['winery', 'food', 'art', 'beauty', 'hospitality', 'judaica', 'clinic'];

// At least one of these must appear in every opening message so the pitch
// is systems-led, not website-only.
const SYSTEMS_TERMS = ['CRM', 'מערכת', 'מערכות', 'לידים', 'לקוחות', 'פולואפ', 'דשבורד', 'אוטומצי', 'מעקב'];

// Grounded copy — no fake guarantees / hype in outreach messages or needs.
const FORBIDDEN_PHRASES = ['מובטח', 'מבטיח', 'הכפלה', 'להכפיל', 'יכפיל', 'תוך 7 ימים', 'תוך 14 יום', 'תוך 30 יום', 'guarantee', '100%'];

describe('outreach — category id stability', () => {
  it('every historical category id still exists', () => {
    const ids = CATS.map((c) => c.id);
    for (const id of STABLE_IDS) expect(ids, `missing stable id: ${id}`).toContain(id);
  });

  it('category ids are unique', () => {
    const ids = CATS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('OUTREACH_EXTRA ids and content stay stable for the version-gated append', () => {
    // The extra catalog was appended to existing installs under version 2;
    // changing ids here would re-append as duplicates on version bumps.
    expect(OUTREACH_SEED_VERSION).toBe(2);
    const extraIds = OUTREACH_EXTRA.map((e) => e.id);
    expect(new Set(extraIds).size).toBe(extraIds.length);
    for (const e of OUTREACH_EXTRA) expect(e.id).toMatch(/^ext_/);
  });
});

describe('outreach — category shape', () => {
  it('every category has id, label, icon and a non-trivial message', () => {
    for (const c of CATS) {
      expect(typeof c.id).toBe('string');
      expect(c.label.length).toBeGreaterThan(3);
      expect(c.icon.length).toBeGreaterThan(0);
      expect(c.msg.length).toBeGreaterThan(80);
    }
  });

  it('every category has a default need', () => {
    for (const c of CATS) {
      const need = OUTREACH_NEEDS_DEFAULT[c.id];
      expect(typeof need, `missing default need for ${c.id}`).toBe('string');
      expect(need.length).toBeGreaterThan(15);
    }
  });

  it('every message contains the {name} placeholder', () => {
    for (const c of CATS) expect(c.msg, `no {name} in ${c.id}`).toContain('{name}');
  });
});

describe('outreach — systems-led positioning', () => {
  it('every message includes at least one systems term', () => {
    for (const c of CATS) {
      const hit = SYSTEMS_TERMS.some((t) => c.msg.includes(t));
      expect(hit, `message for ${c.id} is not systems-led`).toBe(true);
    }
  });

  it('no message opens with website-builder-only positioning', () => {
    for (const c of CATS) {
      // The self-intro line (2nd line of the message) must not present
      // ArtValue as a website builder first.
      const intro = c.msg.split('\n')[1] || '';
      expect(intro.startsWith('אני בונה אתרים'), `intro of ${c.id} leads with websites`).toBe(false);
      expect(intro, `intro of ${c.id} leads with websites`).not.toMatch(/^(שמי|כאן|מדבר)[^\n]*בונה אתרים ומערכות/);
    }
  });

  it('every message mentions the system value before (or without) the word אתר', () => {
    for (const c of CATS) {
      const sysIdx = SYSTEMS_TERMS.map((t) => c.msg.indexOf(t)).filter((i) => i >= 0);
      const siteIdx = c.msg.indexOf('אתר');
      const firstSys = Math.min(...sysIdx);
      if (siteIdx >= 0) expect(firstSys, `${c.id}: אתר appears before systems value`).toBeLessThan(siteIdx);
    }
  });

  it('default needs are no longer website/store/booking-only', () => {
    const needs = Object.values(OUTREACH_NEEDS_DEFAULT);
    const systemsLed = needs.filter((n) => SYSTEMS_TERMS.some((t) => n.includes(t)));
    expect(systemsLed.length).toBe(needs.length);
  });
});

describe('outreach — grounded copy (no fake guarantees)', () => {
  it('messages contain no guarantee/hype phrases', () => {
    for (const c of CATS) {
      for (const p of FORBIDDEN_PHRASES) {
        expect(c.msg, `forbidden phrase "${p}" in ${c.id}`).not.toContain(p);
      }
    }
  });

  it('default needs contain no guarantee/hype phrases', () => {
    for (const [id, need] of Object.entries(OUTREACH_NEEDS_DEFAULT)) {
      for (const p of FORBIDDEN_PHRASES) {
        expect(need, `forbidden phrase "${p}" in need for ${id}`).not.toContain(p);
      }
    }
  });
});

describe('outreach — helpers and seed still work', () => {
  it('catById resolves known ids and falls back for unknown', () => {
    expect(catById('clinic').id).toBe('clinic');
    expect(catById('no-such-id').id).toBe(CATS[0].id);
    expect(catById(undefined).id).toBe(CATS[0].id);
  });

  it('buildMessage fills {name} and leaves no placeholder behind', () => {
    for (const c of CATS) {
      const out = buildMessage(c.id, 'יקב הרים');
      expect(out).toContain('יקב הרים');
      expect(out).not.toContain('{name}');
    }
  });

  it('needFor prefers the lead need and falls back to the category default', () => {
    expect(needFor({ category: 'food', need: 'צורך ספציפי' })).toBe('צורך ספציפי');
    expect(needFor({ category: 'food' })).toBe(OUTREACH_NEEDS_DEFAULT.food);
    expect(needFor(null)).toBe('');
  });

  it('every seed lead references an existing category and has a need', () => {
    const ids = new Set(CATS.map((c) => c.id));
    for (const lead of OUTREACH_SEED) {
      expect(ids.has(lead.category), `seed lead "${lead.name}" has unknown category`).toBe(true);
      expect(lead.need.length).toBeGreaterThan(10);
    }
  });

  it('status list is unchanged', () => {
    expect(OUTREACH_STATUS).toEqual(['pending', 'contacted', 'irrelevant']);
  });
});

describe('outreach — Growth OS bridge mapping', () => {
  it('every mapped growth category id exists in LEAD_CATEGORIES', () => {
    const growthIds = new Set(LEAD_CATEGORIES.map((c) => c.id));
    for (const [outreachId, growthId] of Object.entries(OUTREACH_TO_GROWTH_CATEGORY)) {
      expect(growthIds.has(growthId), `${outreachId} maps to unknown growth id ${growthId}`).toBe(true);
    }
  });

  it('every mapping key is a real outreach category id', () => {
    const ids = new Set(CATS.map((c) => c.id));
    for (const key of Object.keys(OUTREACH_TO_GROWTH_CATEGORY)) {
      expect(ids.has(key), `mapping key ${key} is not an outreach category`).toBe(true);
    }
  });
});

import { describe, it, expect } from 'vitest';
import {
  CONTENT_CATEGORIES,
  CONTENT_FORMATS,
  CONTENT_LIBRARY_ITEMS,
  FILTERS,
  STATS,
  POSITIONING,
  formatById,
  categoryById,
  itemById,
  itemsByCategory,
  matchesFilter,
  matchContentTemplates,
} from '../growthContentAds.js';
import { SERVICES, LEAD_CATEGORIES } from '../growthLeads.js';

// ===================================================================
// Growth OS — Content & Ads Library data-integrity coverage.
// Pure, deterministic assertions over the static library. No runtime,
// UI, network, persistence, AI, or Creative Engine V2 involvement.
// ===================================================================

const nonEmptyStr = (v) => typeof v === 'string' && v.trim().length > 0;
const nonEmptyArr = (v) => Array.isArray(v) && v.length > 0;

describe('growthContentAds — category identity', () => {
  it('has categories and every category id is unique', () => {
    expect(CONTENT_CATEGORIES.length).toBeGreaterThan(0);
    const ids = CONTENT_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every category has non-empty label / description / goal and valid tags', () => {
    const filterIds = new Set(FILTERS.map((f) => f.id));
    for (const c of CONTENT_CATEGORIES) {
      expect(nonEmptyStr(c.label), `category "${c.id}" label`).toBe(true);
      expect(nonEmptyStr(c.description), `category "${c.id}" description`).toBe(true);
      expect(nonEmptyStr(c.goal), `category "${c.id}" goal`).toBe(true);
      expect(nonEmptyArr(c.tags), `category "${c.id}" tags`).toBe(true);
      for (const t of c.tags) expect(filterIds.has(t), `category "${c.id}" tag "${t}" is a known filter`).toBe(true);
    }
  });
});

describe('growthContentAds — item identity & required fields', () => {
  it('every item id is unique', () => {
    const ids = CONTENT_LIBRARY_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  const REQUIRED_STR = ['id', 'categoryId', 'title', 'description', 'goal', 'bestFor', 'tone', 'hook', 'message', 'cta', 'prompt', 'usageNote'];
  const REQUIRED_ARR = ['formats', 'tags', 'relatedOffers'];

  for (const item of CONTENT_LIBRARY_ITEMS) {
    describe(`item "${item.id}"`, () => {
      for (const field of REQUIRED_STR) {
        it(`${field} is a non-empty string`, () => {
          expect(nonEmptyStr(item[field])).toBe(true);
        });
      }
      for (const field of REQUIRED_ARR) {
        it(`${field} is a non-empty array`, () => {
          expect(nonEmptyArr(item[field])).toBe(true);
        });
      }
    });
  }
});

describe('growthContentAds — reference integrity', () => {
  for (const item of CONTENT_LIBRARY_ITEMS) {
    it(`"${item.id}" categoryId "${item.categoryId}" resolves`, () => {
      expect(categoryById(item.categoryId)).not.toBeNull();
    });

    it(`"${item.id}" every format id resolves in CONTENT_FORMATS`, () => {
      for (const f of item.formats) {
        expect(formatById(f), `format "${f}"`).not.toBeNull();
        expect(CONTENT_FORMATS[f]).toBeTruthy();
      }
    });

    it(`"${item.id}" every relatedOffers id resolves in SERVICES`, () => {
      for (const o of item.relatedOffers) {
        expect(SERVICES[o], `offer "${o}"`).toBeTruthy();
      }
    });

    it(`"${item.id}" every tag is a known filter id`, () => {
      const filterIds = new Set(FILTERS.map((f) => f.id));
      for (const t of item.tags) expect(filterIds.has(t)).toBe(true);
    });
  }
});

describe('growthContentAds — category relatedOffers resolve in SERVICES', () => {
  for (const cat of CONTENT_CATEGORIES) {
    it(`"${cat.id}" relatedOffers is non-empty and every id resolves`, () => {
      expect(nonEmptyArr(cat.relatedOffers)).toBe(true);
      for (const o of cat.relatedOffers) expect(SERVICES[o], `offer "${o}"`).toBeTruthy();
    });
  }
});

describe('growthContentAds — prompt / message / hook / cta present, prompt non-empty', () => {
  for (const item of CONTENT_LIBRARY_ITEMS) {
    it(`"${item.id}" has non-empty hook / message / cta / prompt`, () => {
      expect(nonEmptyStr(item.hook)).toBe(true);
      expect(nonEmptyStr(item.message)).toBe(true);
      expect(nonEmptyStr(item.cta)).toBe(true);
      expect(nonEmptyStr(item.prompt)).toBe(true);
    });
  }
});

describe('growthContentAds — no duplicate title within a category', () => {
  for (const cat of CONTENT_CATEGORIES) {
    it(`"${cat.id}" has unique item titles`, () => {
      const titles = itemsByCategory(cat.id).map((i) => i.title);
      expect(new Set(titles).size).toBe(titles.length);
    });
  }
});

describe('growthContentAds — filters', () => {
  it('"all" matches every item', () => {
    const matched = CONTENT_LIBRARY_ITEMS.filter((i) => matchesFilter(i, 'all'));
    expect(matched).toHaveLength(CONTENT_LIBRARY_ITEMS.length);
  });

  it('every non-"all" filter matches at least one item', () => {
    for (const f of FILTERS) {
      if (f.id === 'all') continue;
      const count = CONTENT_LIBRARY_ITEMS.filter((i) => matchesFilter(i, f.id)).length;
      expect(count, `filter "${f.id}" matched nothing`).toBeGreaterThan(0);
    }
  });

  it('every item matches at least one non-"all" filter', () => {
    const nonAll = FILTERS.filter((f) => f.id !== 'all');
    for (const item of CONTENT_LIBRARY_ITEMS) {
      const matched = nonAll.some((f) => matchesFilter(item, f.id));
      expect(matched, `item "${item.id}" matched no non-all filter`).toBe(true);
    }
  });

  it('every category has at least one item', () => {
    for (const c of CONTENT_CATEGORIES) {
      expect(itemsByCategory(c.id).length, `category "${c.id}" has no items`).toBeGreaterThan(0);
    }
  });
});

describe('growthContentAds — helper lookups', () => {
  it('categoryById returns the exact match for every category', () => {
    for (const c of CONTENT_CATEGORIES) expect(categoryById(c.id)).toBe(c);
  });

  it('formatById returns the exact match for every format', () => {
    for (const id of Object.keys(CONTENT_FORMATS)) expect(formatById(id)).toBe(CONTENT_FORMATS[id]);
  });

  it('itemById returns the exact match for every item', () => {
    for (const item of CONTENT_LIBRARY_ITEMS) expect(itemById(item.id)).toBe(item);
  });

  it('itemsByCategory returns exactly the items of each category', () => {
    for (const c of CONTENT_CATEGORIES) {
      const items = itemsByCategory(c.id);
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((i) => i.categoryId === c.id)).toBe(true);
    }
  });

  it('unknown lookups return a safe null / empty result', () => {
    expect(categoryById('__nope__')).toBeNull();
    expect(categoryById(undefined)).toBeNull();
    expect(formatById('__nope__')).toBeNull();
    expect(formatById(undefined)).toBeNull();
    expect(itemById('__nope__')).toBeNull();
    expect(itemById(undefined)).toBeNull();
    expect(itemsByCategory('__nope__')).toEqual([]);
  });
});

describe('growthContentAds — STATS counts match source arrays', () => {
  it('categories / items / formats / ctas are accurate', () => {
    expect(STATS.categories).toBe(CONTENT_CATEGORIES.length);
    expect(STATS.items).toBe(CONTENT_LIBRARY_ITEMS.length);
    expect(STATS.formats).toBe(Object.keys(CONTENT_FORMATS).length);
    expect(STATS.ctas).toBe(new Set(CONTENT_LIBRARY_ITEMS.map((i) => i.cta)).size);
  });
});

describe('growthContentAds — formats & positioning', () => {
  it('every format has a non-empty name and icon', () => {
    for (const f of Object.values(CONTENT_FORMATS)) {
      expect(nonEmptyStr(f.name)).toBe(true);
      expect(nonEmptyStr(f.icon)).toBe(true);
    }
  });

  it('exposes the ArtValue positioning lines', () => {
    expect(nonEmptyStr(POSITIONING.core)).toBe(true);
    expect(nonEmptyStr(POSITIONING.coreAlt)).toBe(true);
    expect(nonEmptyStr(POSITIONING.services)).toBe(true);
  });
});

// ---- Lead Category → Matching Content Templates (integration helper) ----
const rankIn = (priority, item) => {
  const offers = item.relatedOffers || [];
  for (let i = 0; i < priority.length; i++) if (offers.includes(priority[i])) return i;
  return -1;
};
const offerPath = (cat) => [cat.offerId, cat.entryOfferId, ...(cat.upsell || [])].filter(Boolean);

describe('growthContentAds — matchContentTemplates', () => {
  it('returns an array', () => {
    expect(Array.isArray(matchContentTemplates(['crm_smart']))).toBe(true);
    expect(Array.isArray(matchContentTemplates([]))).toBe(true);
  });

  it('does not mutate source data', () => {
    const before = JSON.stringify(CONTENT_LIBRARY_ITEMS);
    const beforeLen = CONTENT_LIBRARY_ITEMS.length;
    matchContentTemplates(['crm_smart', 'website_premium', 'automation'], 3);
    matchContentTemplates(['business_full'], 999);
    matchContentTemplates(['__nope__']);
    expect(JSON.stringify(CONTENT_LIBRARY_ITEMS)).toBe(before);
    expect(CONTENT_LIBRARY_ITEMS.length).toBe(beforeLen);
    // returns a NEW array of ORIGINAL item references (not clones)
    const r = matchContentTemplates(['crm_smart'], 2);
    expect(r).not.toBe(CONTENT_LIBRARY_ITEMS);
    for (const item of r) expect(CONTENT_LIBRARY_ITEMS.includes(item)).toBe(true);
  });

  it('returns only existing content items', () => {
    const r = matchContentTemplates(['crm_smart', 'automation'], 5);
    for (const item of r) expect(itemById(item.id)).toBe(item);
  });

  it('matches by offerId / entryOfferId / upsell (relatedOffers intersect the offer path)', () => {
    for (const cat of LEAD_CATEGORIES) {
      const path = offerPath(cat);
      const r = matchContentTemplates(path, 999);
      for (const item of r) {
        expect(item.relatedOffers.some((o) => path.includes(o)), `${item.id} vs ${cat.id}`).toBe(true);
      }
    }
  });

  it('ranks exact main-offer matches before entry/upsell matches (monotonic rank)', () => {
    // disjoint tiers: business_full-only items (rank 0) must precede crm_smart items (rank 1)
    const r = matchContentTemplates(['business_full', 'crm_smart'], 999);
    expect(r[0].id).toBe('before_after-1');
    expect(r[1].id).toBe('before_after-2');
    // rank is non-decreasing across the whole result; ties keep library order
    const priority = ['business_full', 'crm_smart'];
    let prevRank = -1;
    let prevIdx = -1;
    for (const item of r) {
      const rank = rankIn(priority, item);
      const idx = CONTENT_LIBRARY_ITEMS.indexOf(item);
      expect(rank).toBeGreaterThanOrEqual(prevRank);
      if (rank === prevRank) expect(idx).toBeGreaterThan(prevIdx);
      prevRank = rank; prevIdx = idx;
    }
  });

  it('returns a safe empty array for unknown / empty / invalid input', () => {
    expect(matchContentTemplates(['__nope__'])).toEqual([]);
    expect(matchContentTemplates([])).toEqual([]);
    expect(matchContentTemplates(undefined)).toEqual([]);
    expect(matchContentTemplates(null)).toEqual([]);
    expect(matchContentTemplates(['', null, undefined])).toEqual([]);
  });

  it('respects the limit', () => {
    const all = matchContentTemplates(['crm_smart', 'website_premium', 'automation'], 999);
    const capped = matchContentTemplates(['crm_smart', 'website_premium', 'automation'], 3);
    expect(capped.length).toBeLessThanOrEqual(3);
    expect(all.length).toBeGreaterThanOrEqual(capped.length);
    expect(capped).toEqual(all.slice(0, 3));
    // a non-positive limit yields no results
    expect(matchContentTemplates(['crm_smart'], 0)).toEqual([]);
    expect(matchContentTemplates(['crm_smart'], -1)).toEqual([]);
  });

  it('every lead category with a mapped offer returns at least one related content item', () => {
    for (const cat of LEAD_CATEGORIES) {
      const path = offerPath(cat);
      expect(path.length, `${cat.id} has offers`).toBeGreaterThan(0);
      const r = matchContentTemplates(path, 4);
      expect(r.length, `${cat.id} matched no templates`).toBeGreaterThan(0);
    }
  });

  it('returned items have valid category and format references', () => {
    for (const cat of LEAD_CATEGORIES) {
      const r = matchContentTemplates(offerPath(cat), 4);
      for (const item of r) {
        expect(categoryById(item.categoryId), `${item.id} category`).not.toBeNull();
        for (const f of item.formats) expect(CONTENT_FORMATS[f], `${item.id} format ${f}`).toBeTruthy();
      }
    }
  });

  it('produces a stable, deterministic order', () => {
    const args = ['crm_smart', 'website_premium', 'automation', 'landing_basic'];
    expect(matchContentTemplates(args, 4)).toEqual(matchContentTemplates(args, 4));
    for (const cat of LEAD_CATEGORIES) {
      expect(matchContentTemplates(offerPath(cat), 4)).toEqual(matchContentTemplates(offerPath(cat), 4));
    }
  });
});

// ---- Content quality gates (GPT Image 2 prompts + Hebrew ad copy rules) ----
const HEBREW = /[֐-׿]/;
const hasHebrew = (s) => HEBREW.test(s);

// Guarantee / hype phrases that must never appear in any visible ad text.
const FORBIDDEN_SUBSTR = [
  'מובטח', 'מבטיח', 'להבטיח', 'הבטחה', 'מהפכה', 'הכפל', 'להכפיל', 'guaranteed',
];
const FORBIDDEN_TIME = /תוך\s*\d+\s*(ימים|יום|שבועות|שבוע|שעות)/;
const FORBIDDEN_TIME_LITERAL = ['תוך שבוע', 'תוך שבועיים'];

// Vague-only visual phrases that must not appear in a GPT Image 2 prompt.
const VAGUE_PROMPT = [
  'modern ad', 'modern business ad', 'professional design',
  'professional digital design', 'business growth', 'ai technology',
];

// Concrete visual-direction vocabulary a usable image prompt should carry.
const VISUAL_KEYWORDS = [
  'composition', 'style', 'color', 'lighting', 'background', 'foreground',
  'layout', 'overlay', 'palette', 'contrast', 'scene', 'frame',
];

const ALL_TEXT_FIELDS = ['title', 'description', 'goal', 'bestFor', 'tone', 'hook', 'message', 'cta', 'prompt', 'usageNote'];

describe('growthContentAds — content quality (GPT Image 2 + Hebrew ad rules)', () => {
  for (const item of CONTENT_LIBRARY_ITEMS) {
    describe(`item "${item.id}"`, () => {
      it('hook / message / cta are non-empty Hebrew copy', () => {
        for (const f of ['hook', 'message', 'cta']) {
          expect(nonEmptyStr(item[f]), `${f}`).toBe(true);
          expect(hasHebrew(item[f]), `${f} has Hebrew`).toBe(true);
        }
      });

      it('prompt is ArtValue-specific and long enough to be usable', () => {
        expect(item.prompt.includes('ArtValue'), 'prompt names ArtValue').toBe(true);
        expect(item.prompt.length, 'prompt length').toBeGreaterThanOrEqual(300);
      });

      it('prompt is a structured GPT Image 2 brief with an exact Hebrew overlay', () => {
        expect(/composition:/i.test(item.prompt), 'has a Composition section').toBe(true);
        expect(/style/i.test(item.prompt), 'has a Style section').toBe(true);
        expect(/overlay/i.test(item.prompt), 'has an overlay section').toBe(true);
        // at least one quoted Hebrew overlay line so the ad text is explicit
        expect(/"[^"\n]*[֐-׿][^"\n]*"/.test(item.prompt), 'has a quoted Hebrew overlay line').toBe(true);
      });

      it('prompt carries concrete visual direction (>= 3 visual keywords)', () => {
        const lc = item.prompt.toLowerCase();
        const hits = VISUAL_KEYWORDS.filter((k) => lc.includes(k)).length;
        expect(hits, `visual keywords found: ${hits}`).toBeGreaterThanOrEqual(3);
      });

      it('prompt avoids vague-only language', () => {
        const lc = item.prompt.toLowerCase();
        for (const v of VAGUE_PROMPT) expect(lc.includes(v), `vague phrase "${v}"`).toBe(false);
      });

      it('no forbidden guarantee / hype phrase in any visible text', () => {
        for (const field of ALL_TEXT_FIELDS) {
          const val = item[field] || '';
          for (const bad of FORBIDDEN_SUBSTR) expect(val.includes(bad), `${field} contains "${bad}"`).toBe(false);
          expect(FORBIDDEN_TIME.test(val), `${field} has a time-guarantee`).toBe(false);
          for (const bad of FORBIDDEN_TIME_LITERAL) expect(val.includes(bad), `${field} contains "${bad}"`).toBe(false);
        }
      });

      it('message placeholders only exist in WhatsApp follow-up templates', () => {
        const placeholders = item.message.match(/\{[^}]+\}/g) || [];
        if (placeholders.length > 0) {
          expect(item.categoryId, 'placeholders only in followups_whatsapp').toBe('followups_whatsapp');
          for (const p of placeholders) expect(['{שם}', '{נציג}']).toContain(p);
        }
      });
    });
  }

  it('every WhatsApp follow-up template personalizes with {שם}', () => {
    const followups = itemsByCategory('followups_whatsapp');
    expect(followups.length).toBeGreaterThan(0);
    for (const item of followups) expect(item.message.includes('{שם}'), `${item.id} has {שם}`).toBe(true);
  });

  it('no ArtValue positioning line uses a forbidden guarantee phrase', () => {
    for (const line of Object.values(POSITIONING)) {
      for (const bad of FORBIDDEN_SUBSTR) expect(line.includes(bad), `positioning contains "${bad}"`).toBe(false);
    }
  });
});

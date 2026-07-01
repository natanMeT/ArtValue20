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
} from '../growthContentAds.js';
import { SERVICES } from '../growthLeads.js';

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

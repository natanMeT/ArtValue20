import { describe, it, expect } from 'vitest';
import {
  LEAD_CATEGORIES,
  SERVICES,
  ACTIONS,
  FILTERS,
  STATS,
  PRICE_DISCLAIMER,
  serviceById,
  actionById,
  categoryById,
  levelMeta,
  formatBand,
  matchesFilter,
} from '../growthLeads.js';

// ===================================================================
// Growth OS — Lead Mapping data-integrity coverage.
// Pure, deterministic assertions over the static catalog. No runtime,
// UI, network, persistence, or Creative Engine V2 involvement.
//
// NOTE ON FIELD NAMES: the spec for this slice used idealized names
// (title / pain / recommendedAction / expectedObjection /
// objectionResponse, filter "high-potential"). The actual, shipped
// schema in growthLeads.js uses: label / pains[] / action / objection /
// response, and the high-potential filter id is "high". These tests
// assert the REAL schema (data is intentionally NOT modified) and the
// mapping is documented here so the two never silently drift.
// ===================================================================

const LEVELS = ['high', 'medium', 'low'];
const LEVEL_AXES = ['salesPotential', 'urgency', 'closeProbability'];
const nonEmptyStr = (v) => typeof v === 'string' && v.trim().length > 0;

describe('growthLeads — category identity', () => {
  it('has at least one category', () => {
    expect(Array.isArray(LEAD_CATEGORIES)).toBe(true);
    expect(LEAD_CATEGORIES.length).toBeGreaterThan(0);
  });

  it('every category id is unique', () => {
    const ids = LEAD_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('growthLeads — required fields are non-empty', () => {
  // spec name -> actual field on the category record
  const REQUIRED = {
    id: 'id',
    title: 'label',
    who: 'who',
    recommendedAction: 'action',
    expectedObjection: 'objection',
    objectionResponse: 'response',
  };

  for (const cat of LEAD_CATEGORIES) {
    describe(`category "${cat.id}"`, () => {
      for (const [specName, field] of Object.entries(REQUIRED)) {
        it(`${specName} (${field}) is a non-empty string`, () => {
          expect(nonEmptyStr(cat[field])).toBe(true);
        });
      }

      it('pain (pains[]) has at least one non-empty entry', () => {
        expect(Array.isArray(cat.pains)).toBe(true);
        expect(cat.pains.length).toBeGreaterThan(0);
        expect(cat.pains.every(nonEmptyStr)).toBe(true);
      });
    });
  }
});

describe('growthLeads — offer / service references resolve', () => {
  for (const cat of LEAD_CATEGORIES) {
    it(`"${cat.id}" offerId "${cat.offerId}" resolves in SERVICES`, () => {
      expect(serviceById(cat.offerId)).not.toBeNull();
      expect(SERVICES[cat.offerId]).toBeTruthy();
    });

    it(`"${cat.id}" entryOfferId "${cat.entryOfferId}" resolves in SERVICES`, () => {
      // entryOfferId is optional by design; only validate when present
      if (cat.entryOfferId == null) return;
      expect(serviceById(cat.entryOfferId)).not.toBeNull();
    });

    it(`"${cat.id}" every upsell id resolves in SERVICES`, () => {
      const upsell = cat.upsell || [];
      expect(Array.isArray(upsell)).toBe(true);
      for (const id of upsell) {
        expect(serviceById(id)).not.toBeNull();
      }
    });
  }
});

describe('growthLeads — action references resolve', () => {
  for (const cat of LEAD_CATEGORIES) {
    it(`"${cat.id}" action "${cat.action}" resolves in ACTIONS`, () => {
      expect(actionById(cat.action)).not.toBeNull();
      expect(ACTIONS[cat.action]).toBeTruthy();
    });
  }
});

describe('growthLeads — level axes use only high/medium/low', () => {
  for (const cat of LEAD_CATEGORIES) {
    for (const axis of LEVEL_AXES) {
      it(`"${cat.id}" ${axis} is one of ${LEVELS.join('/')}`, () => {
        expect(LEVELS).toContain(cat[axis]);
      });

      it(`"${cat.id}" ${axis} maps to a labeled badge`, () => {
        const meta = levelMeta(axis, cat[axis]);
        expect(nonEmptyStr(meta.label)).toBe(true);
        expect(nonEmptyStr(meta.cls)).toBe(true);
      });
    }
  }
});

describe('growthLeads — matchesFilter', () => {
  it('"all" returns every category', () => {
    const matched = LEAD_CATEGORIES.filter((c) => matchesFilter(c, 'all'));
    expect(matched).toHaveLength(LEAD_CATEGORIES.length);
  });

  it('"high" returns only high sales-potential categories', () => {
    const matched = LEAD_CATEGORIES.filter((c) => matchesFilter(c, 'high'));
    expect(matched.length).toBeGreaterThan(0);
    expect(matched.every((c) => c.salesPotential === 'high')).toBe(true);
    // and it must include ALL high-potential categories, none missed
    const allHigh = LEAD_CATEGORIES.filter((c) => c.salesPotential === 'high');
    expect(matched).toHaveLength(allHigh.length);
  });

  it('every non-"all" filter tab matches at least one category', () => {
    for (const f of FILTERS) {
      if (f.id === 'all') continue;
      const count = LEAD_CATEGORIES.filter((c) => matchesFilter(c, f.id)).length;
      expect(count, `filter "${f.id}" matched nothing`).toBeGreaterThan(0);
    }
  });

  it('every category matches at least one non-"all" filter', () => {
    const nonAll = FILTERS.filter((f) => f.id !== 'all');
    for (const cat of LEAD_CATEGORIES) {
      const matched = nonAll.some((f) => matchesFilter(cat, f.id));
      expect(matched, `category "${cat.id}" matched no non-all filter`).toBe(true);
    }
  });
});

describe('growthLeads — formatBand', () => {
  it('renders a readable ₪ price band for every service', () => {
    for (const svc of Object.values(SERVICES)) {
      const band = formatBand(svc);
      expect(band.startsWith('₪')).toBe(true);
      expect(band).toContain('–');           // en-dash range
      expect(/\d/.test(band)).toBe(true);     // contains digits
    }
  });

  it('appends the monthly suffix only for period:"month" services', () => {
    const monthly = Object.values(SERVICES).filter((s) => s.period === 'month');
    expect(monthly.length).toBeGreaterThan(0);
    for (const svc of monthly) {
      expect(formatBand(svc)).toContain('לחודש');
    }
    for (const svc of Object.values(SERVICES).filter((s) => s.period !== 'month')) {
      expect(formatBand(svc)).not.toContain('לחודש');
    }
  });

  it('returns an empty string for a missing service', () => {
    expect(formatBand(null)).toBe('');
    expect(formatBand(undefined)).toBe('');
  });
});

describe('growthLeads — STATS counts match source arrays', () => {
  it('categories / offerTypes / actionTypes are accurate', () => {
    expect(STATS.categories).toBe(LEAD_CATEGORIES.length);
    expect(STATS.offerTypes).toBe(Object.keys(SERVICES).length);
    expect(STATS.actionTypes).toBe(Object.keys(ACTIONS).length);
  });
});

describe('growthLeads — helper lookups', () => {
  it('serviceById returns the matching service or null', () => {
    const anyId = Object.keys(SERVICES)[0];
    expect(serviceById(anyId)).toBe(SERVICES[anyId]);
    expect(serviceById('__nope__')).toBeNull();
    expect(serviceById(undefined)).toBeNull();
  });

  it('actionById returns the matching action or null', () => {
    const anyId = Object.keys(ACTIONS)[0];
    expect(actionById(anyId)).toBe(ACTIONS[anyId]);
    expect(actionById('__nope__')).toBeNull();
    expect(actionById(undefined)).toBeNull();
  });

  it('categoryById returns the matching category or null', () => {
    const anyId = LEAD_CATEGORIES[0].id;
    expect(categoryById(anyId)).toBe(LEAD_CATEGORIES[0]);
    expect(categoryById('__nope__')).toBeNull();
    expect(categoryById(undefined)).toBeNull();
  });
});

describe('growthLeads — disclaimer', () => {
  it('exposes a non-empty price disclaimer string', () => {
    expect(nonEmptyStr(PRICE_DISCLAIMER)).toBe(true);
  });
});

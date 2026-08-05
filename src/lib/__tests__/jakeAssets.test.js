// ===================================================================
// Jake sees the asset library — `public.assets` reaches Jake's CONTEXT (and
// only his context) through the JAKE SEAM, read-only, metadata only, and every
// absence stays truthful.
//
// THE GAP THIS FILE PINS. Four shipped slices built the durable cloud gallery
// (images, favorites, campaign link, user upload) and `api.fetchAll()` hydrates
// none of it; the gallery page owns its own state. Nothing in jakePack.js
// mentioned assets at all — neither data nor a declaration of absence — so an
// ungrounded answer was the only thing available for "מה יש לי בגלריה".
//
// These tests EXECUTE the shipped builder (artValuePack.buildContext) rather
// than pinning source text, matching the jakeCalendar / jakeCampaigns
// precedent. The containment tests at the bottom scan source because there is
// no DOM renderer here.
//
// NO network, NO model, NO Gateway, NO store.
// ===================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { artValuePack } from '../jakePack.js';
import { withBusinessBrain } from '../jakeBusinessContext.js';
import { AI_GATEWAY_INPUT_LIMITS } from '../aiGatewayInput.js';
import { ASSET_QUOTA, ASSET_META_LIMITS, ASSET_SOURCE_UPLOAD } from '../assetLibrary.js';
import { assetStateAfterRead, ASSET_OUTCOME } from '../assetReadState.js';

const ctx = (d) => artValuePack.buildContext(d);
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// Only the asset lines. Several assertions below ("no count", "no long title")
// are about what the ASSET block says, and the surrounding context legitimately
// contains the same substrings for other modules — the leads line carries
// "סה״כ —" and the campaigns line carries the very campaign title an asset
// label must truncate. Scanning the whole context would have passed or failed
// for the wrong reason.
const assetSection = (text) => text.split('\n').filter((l) => l.startsWith('- נכסים')).join('\n');

// The date is rendered with toLocaleDateString('he-IL'), whose padding differs
// between ICU builds. Deriving the expectation the same way pins the FIELD
// without pinning one runtime's zero-padding.
const HE_DATE = (ts) => new Date(ts).toLocaleDateString('he-IL');
const CREATED = Date.parse('2026-08-04T10:00:00.000Z');

// EXACTLY the shape api.fetchAll() returns — no projects / inventory / activity
// key, and no assets or campaigns key either (both ride the seam, not the store).
function cloudData(extra = {}) {
  return {
    clients: [], quotes: [], transactions: [], outreachLeads: [], tasks: [],
    businessProfile: null, charges: [], payments: [],
    meta: { source: 'supabase' },
    ...extra,
  };
}

// A normalizeAssetRow()-shaped row. `url` is deliberately populated with a
// realistic signed URL on every fixture: the builder must never emit it.
const SIGNED = 'https://weciwurjfwmqihcyexzj.supabase.co/storage/v1/object/sign/assets/'
  + 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/11111111-2222-3333-4444-555555555555.png?token=eyJhbGciOi';

const asset = (over = {}) => ({
  id: '11111111-2222-3333-4444-555555555555',
  storagePath: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/11111111-2222-3333-4444-555555555555.png',
  mime: 'image/png',
  byteSize: 204800,
  createdAt: Date.parse('2026-08-04T10:00:00.000Z'),
  kind: 'image',
  favorite: false,
  campaignId: null,
  meta: { source: 'generated', prompt: 'תמונה של חתול', preset: 'studio', engine: 'gemini' },
  url: SIGNED,
  ...over,
});

const manyAssets = (n, over = () => ({})) =>
  Array.from({ length: n }, (_, i) => asset({
    id: `${String(i).padStart(8, '0')}-2222-3333-4444-555555555555`,
    createdAt: Date.parse('2026-08-04T10:00:00.000Z') - i * 3600e3,
    ...over(i),
  }));

const campaign = (over = {}) => ({
  id: 'cccccccc-2222-3333-4444-555555555555', userId: 'u1', title: 'קמפיין קיץ',
  status: 'active', startDate: '2026-08-01', endDate: '2026-09-30', ...over,
});

// ---- the three non-loaded / empty states ----------------------------------

describe('assets — a FAILED cloud read never reads as "no assets"', () => {
  const text = ctx(cloudData({ assets: undefined, assetsError: true }));

  it('says it could not load the library', () => {
    expect(text).toContain('לא הצלחת לטעון את ספריית הנכסים');
    expect(text).toContain('אל תאמר שאין נכסים');
  });

  it('reports no count and no detail whatsoever', () => {
    expect(assetSection(text)).not.toContain('סה״כ');
    expect(text).not.toContain('נכסים אחרונים');
    expect(text).not.toContain('אין נכסים בחשבון הזה');
  });

  it('does not claim the module is disconnected — in cloud mode it is not', () => {
    expect(text).not.toContain('נכסים: המודול אינו מחובר');
  });
});

describe('assets — local/demo uses notConnectedLine, not the failure wording', () => {
  // The discriminator is the error FLAG, not a mode string: absent collection +
  // no error = the module does not exist here.
  const text = ctx({
    clients: [], quotes: [], transactions: [], outreachLeads: [], tasks: [],
    projects: [], inventory: [], activity: [], charges: [], payments: [],
    businessProfile: null,
    assets: undefined, assetsError: false,
  });

  it('states the module is not connected to this account', () => {
    expect(text).toContain('נכסים: המודול אינו מחובר לחשבון הזה');
  });

  it('does not use the transient failure wording', () => {
    expect(text).not.toContain('לא הצלחת לטעון את ספריית הנכסים');
  });

  // ⚠️ This fixture omits `assetsPending`, which is exactly how local/demo and
  // every legacy caller behave. The pre-settle window is a THIRD state, told
  // apart by that key and asserted in the C1 block below.
  it('is the SETTLED not-connected case — the pending window is separate', () => {
    expect(text).not.toContain('עדיין אין לי את הנתונים');
  });
});

// ---- the pre-settle window (C1) -------------------------------------------

// THE THIRD ABSENCE. Between a cloud panel open and the seam read settling
// (≤4s) `assets` is undefined with the error flag FALSE — structurally
// identical to local/demo, so Jake was handed "המודול אינו מחובר לחשבון הזה".
// FALSE in cloud: the library is connected and the rows are durable, they
// simply had not arrived.
describe('C1 — the PRE-SETTLE window is its own state, not "not connected"', () => {
  const text = ctx(cloudData({ assets: undefined, assetsError: false, assetsPending: true }));

  it('emits the approved pending wording', () => {
    expect(text).toContain(
      'נכסים (ספריית התמונות): עדיין אין לי את הנתונים — אל תסיק מכך מסקנה. '
      + 'אל תאמר שאין נכסים ואל תדווח על אפס; אמור בכנות שהנתונים עדיין נטענים.',
    );
  });

  it('NEVER claims the module is disconnected', () => {
    expect(text).not.toContain('נכסים: המודול אינו מחובר');
  });

  it('NEVER claims the read failed — nothing has failed yet', () => {
    expect(text).not.toContain('לא הצלחת לטעון את ספריית הנכסים');
  });

  it('reports no count and no asset of any kind', () => {
    // Non-empty first, or the assertions below pass vacuously.
    expect(assetSection(text)).not.toBe('');
    expect(assetSection(text)).not.toMatch(/\d/);
    expect(text).not.toContain('אין נכסים בחשבון הזה');
    expect(text).not.toContain('מועדפים');
  });

  it('leaks no signed URL, path or identifier (unchanged invariant)', () => {
    expect(text).not.toContain('token=');
    expect(text).not.toContain('/storage/v1/');
  });
});

describe('C1 — precedence: a KNOWN failure is never softened into "loading"', () => {
  it('error wins over pending when a caller sets both', () => {
    const text = ctx(cloudData({ assets: undefined, assetsError: true, assetsPending: true }));
    expect(text).toContain('לא הצלחת לטעון את ספריית הנכסים');
    expect(text).not.toContain('עדיין אין לי את הנתונים');
  });

  it('hydrated rows win over pending — a verified library is never hidden', () => {
    const text = ctx(cloudData({ assets: [asset()], assetsPending: true }));
    expect(assetSection(text)).toContain('1');
    expect(text).not.toContain('עדיין אין לי את הנתונים');
  });

  it('a loaded EMPTY library is a verified fact and outranks pending too', () => {
    const text = ctx(cloudData({ assets: [], assetsPending: true }));
    expect(text).toContain('נכסים (ספריית התמונות): אין נכסים בחשבון הזה.');
    expect(text).not.toContain('עדיין אין לי את הנתונים');
  });
});

describe('C1 — the pending flag DEFAULTS to falsy, and that is load-bearing', () => {
  it('an absent key keeps the pre-existing not-connected wording', () => {
    expect(ctx(cloudData({ assets: undefined, assetsError: false })))
      .toContain('נכסים: המודול אינו מחובר לחשבון הזה');
  });

  it('an explicit false keeps it too', () => {
    expect(ctx(cloudData({ assets: undefined, assetsError: false, assetsPending: false })))
      .toContain('נכסים: המודול אינו מחובר לחשבון הזה');
  });
});

describe('assets — a loaded EMPTY library says so', () => {
  const text = ctx(cloudData({ assets: [], assetsError: false }));

  it('states there are no assets', () => {
    expect(text).toContain('נכסים (ספריית התמונות): אין נכסים בחשבון הזה.');
  });

  it('does not use either absence wording', () => {
    expect(text).not.toContain('לא הצלחת לטעון את ספריית הנכסים');
    expect(text).not.toContain('נכסים: המודול אינו מחובר');
  });
});

// ---- the stale-row defect this seam exists to prevent ----------------------

describe('assets — a failure AFTER a success drops the rows it had', () => {
  it('the seam returns to "not loaded" and the context stops reporting a count', () => {
    const rows = manyAssets(6);
    const loaded = assetStateAfterRead(ASSET_OUTCOME.LOADED, rows);
    const loadedText = ctx(cloudData({ assets: loaded.assets, assetsError: loaded.error }));
    expect(loadedText).toContain('6 סה״כ — 0 הועלו, 6 נוצרו');
    expect(loadedText).toContain('נכסים אחרונים');

    // ...then the next read fails. A stale list is not a weaker truth than no
    // list — it is a confident claim nobody verified.
    const failed = assetStateAfterRead(ASSET_OUTCOME.FAILED);
    expect(failed.assets).toBeUndefined();
    const failedText = ctx(cloudData({ assets: failed.assets, assetsError: failed.error }));
    expect(failedText).toContain('לא הצלחת לטעון את ספריית הנכסים');
    expect(failedText).not.toContain('6 סה״כ');
    expect(failedText).not.toContain('נכסים אחרונים');
    expect(failedText).not.toContain(HE_DATE(CREATED));
  });
});

// ---- hydrated: roll-up + capped detail ------------------------------------

describe('assets — the roll-up counts', () => {
  const data = cloudData({
    assets: [
      asset({ id: 'a1', meta: { source: ASSET_SOURCE_UPLOAD }, favorite: true }),
      asset({ id: 'a2', meta: { source: ASSET_SOURCE_UPLOAD } }),
      asset({ id: 'a3', meta: { source: 'generated' }, favorite: true, campaignId: campaign().id }),
      asset({ id: 'a4', meta: { source: 'generated' } }),
    ],
    campaigns: [campaign()],
  });
  const text = ctx(data);

  it('states total, uploaded, generated, favorites and campaign-linked', () => {
    expect(text).toContain('4 סה״כ — 2 הועלו, 2 נוצרו, 2 מועדפים, 1 משויכים לקמפיין.');
  });

  it('names the module boundary against the device-local creative session', () => {
    expect(text).toContain('לא סשן קריאייטיב מקומי');
  });

  it('derives `generated` as the remainder so the counts always add up', () => {
    // A row with a missing/unknown source must not create a silent third bucket.
    const odd = ctx(cloudData({
      assets: [
        asset({ id: 'x1', meta: { source: ASSET_SOURCE_UPLOAD } }),
        asset({ id: 'x2', meta: {} }),
        asset({ id: 'x3' }),
      ],
    }));
    expect(odd).toContain('3 סה״כ — 1 הועלו, 2 נוצרו');
  });
});

describe('assets — the detail list is capped at 5 with an honest overflow line', () => {
  it('shows 5 and declares the remainder at 12 assets', () => {
    const text = ctx(cloudData({ assets: manyAssets(12) }));
    const detail = text.split('נכסים אחרונים: ')[1];
    expect(detail.split(';').length).toBe(5);
    expect(text).toContain('ועוד 7 שאינם מפורטים כאן.');
  });

  it('omits the overflow clause at exactly 5 and below', () => {
    for (const n of [1, 3, 5]) {
      const text = ctx(cloudData({ assets: manyAssets(n) }));
      expect(text).not.toContain('שאינם מפורטים כאן');
    }
  });

  it('emits the approved metadata fields only', () => {
    const text = ctx(cloudData({
      assets: [asset({ meta: { source: ASSET_SOURCE_UPLOAD }, favorite: true, byteSize: 204800 })],
    }));
    expect(text).toContain(`הועלה ${HE_DATE(CREATED)} (png, 200KB, מועדף)`);
  });

  it('labels a generated asset as נוצר and omits the favorite clause when false', () => {
    const text = ctx(cloudData({ assets: [asset({ meta: { source: 'generated' }, favorite: false })] }));
    expect(text).toContain(`נוצר ${HE_DATE(CREATED)} (png, 200KB)`);
    expect(text).not.toContain('מועדף)');
  });
});

// ---- the campaign-label matrix --------------------------------------------

describe('assets — the campaign-label matrix has THREE outcomes, not two', () => {
  it('unlinked asset: no campaign clause at all', () => {
    const text = ctx(cloudData({ assets: [asset({ campaignId: null })], campaigns: [campaign()] }));
    expect(text).not.toContain('קמפיין: ');
    expect(text).not.toContain('משויך לקמפיין (השם אינו זמין כרגע)');
  });

  it('linked + campaigns loaded + id found: the title is shown', () => {
    const text = ctx(cloudData({
      assets: [asset({ campaignId: campaign().id })],
      campaigns: [campaign({ title: 'קמפיין קיץ' })],
    }));
    expect(text).toContain('קמפיין: קמפיין קיץ)');
  });

  it('linked + campaigns loaded + id NOT found (deleted campaign): says the name is unavailable', () => {
    const text = ctx(cloudData({
      assets: [asset({ campaignId: campaign().id })],
      campaigns: [campaign({ id: 'dddddddd-2222-3333-4444-555555555555', title: 'אחר' })],
    }));
    expect(text).toContain('משויך לקמפיין (השם אינו זמין כרגע)');
  });

  it('linked + campaigns read FAILED: says the name is unavailable, never "unlinked"', () => {
    const text = ctx(cloudData({
      assets: [asset({ campaignId: campaign().id })],
      campaigns: undefined, campaignsError: true,
    }));
    expect(text).toContain('משויך לקמפיין (השם אינו זמין כרגע)');
  });

  it('the LINKED COUNT stays correct in every one of those states', () => {
    const linked = [asset({ id: 'l1', campaignId: campaign().id })];
    for (const camp of [
      { campaigns: [campaign()] },
      { campaigns: [campaign({ id: 'dddddddd-2222-3333-4444-555555555555' })] },
      { campaigns: undefined, campaignsError: true },
    ]) {
      expect(ctx(cloudData({ assets: linked, ...camp }))).toContain('1 משויכים לקמפיין.');
    }
  });

  it('truncates a very long campaign title in the LABEL without touching the count', () => {
    const long = 'ק'.repeat(300);
    const text = ctx(cloudData({
      assets: [asset({ campaignId: campaign().id })],
      campaigns: [campaign({ title: long })],
    }));
    // Scoped to the asset block: the CAMPAIGNS line legitimately carries the
    // full 300-char title, and it is not this slice's to truncate.
    const block = assetSection(text);
    expect(block).toContain(`קמפיין: ${'ק'.repeat(60)})`);
    expect(block).not.toContain('ק'.repeat(61));
    expect(block).toContain('1 משויכים לקמפיין.');
  });
});

// ---- the budget: what actually stops Jake ---------------------------------

describe('assets — the context budget', () => {
  const LIMIT = AI_GATEWAY_INPUT_LIMITS.MAX_CONTEXT_CHARS;

  it('EXCLUDES meta.prompt entirely — 5 max-length prompts alone exceed the limit', () => {
    // MEASURED: including the prompt at the cap of 5 produces 15,310 chars and
    // the Gateway REJECTS (context_too_long) rather than truncating. The prompt
    // is excluded, NOT truncated: a half-sentence prompt is something Jake
    // would quote back as a fact about the user's image.
    const prompt = 'א'.repeat(ASSET_META_LIMITS.prompt);
    const text = ctx(cloudData({
      assets: manyAssets(5, () => ({ meta: { source: 'generated', prompt } })),
    }));
    expect(text.length).toBeLessThanOrEqual(LIMIT);
    // No fragment of the prompt survives at ANY truncation length.
    expect(text).not.toContain('א'.repeat(20));
    expect(text).not.toContain('תיאור:');
  });

  it('excludes meta.preset and meta.engine', () => {
    const text = ctx(cloudData({
      assets: [asset({ meta: { source: 'generated', preset: 'PRESET_MARKER', engine: 'ENGINE_MARKER' } })],
    }));
    expect(text).not.toContain('PRESET_MARKER');
    expect(text).not.toContain('ENGINE_MARKER');
  });

  it('fits at the QUOTA CEILING: 40 assets + 200 campaigns + a full business brain', () => {
    const heavy = cloudData({
      clients: Array.from({ length: 60 }, (_, i) => ({
        id: `c${i}`, name: `לקוח ${'א'.repeat(18)} ${i}`, status: i % 3 ? 'active' : 'lead',
        value: 12500, nextAction: 'א'.repeat(24),
      })),
      tasks: Array.from({ length: 80 }, (_, i) => ({ id: `t${i}`, title: `משימה ${'א'.repeat(20)} ${i}`, status: 'todo' })),
      outreachLeads: Array.from({ length: 50 }, (_, i) => ({ id: `l${i}`, name: `ליד ${i}`, status: 'pending' })),
      campaigns: Array.from({ length: 200 }, (_, i) => campaign({
        id: `${String(i).padStart(8, '0')}-2222-3333-4444-555555555555`,
        title: `קמפיין ${'א'.repeat(100)} ${i}`,
      })),
      assets: manyAssets(ASSET_QUOTA, (i) => ({
        favorite: i % 2 === 0,
        campaignId: `${String(i).padStart(8, '0')}-2222-3333-4444-555555555555`,
        meta: { source: i % 2 ? ASSET_SOURCE_UPLOAD : 'generated', prompt: 'א'.repeat(ASSET_META_LIMITS.prompt) },
      })),
    });
    const full = withBusinessBrain(ctx(heavy), 'מה יש לי בגלריה?', {
      businessName: 'א'.repeat(60), industry: 'א'.repeat(40), audience: 'א'.repeat(200),
      services: Array.from({ length: 12 }, () => 'א'.repeat(60)),
    });
    expect(full.length).toBeLessThanOrEqual(LIMIT);
    // Regression floor: the measured worst case is ~6.5k. A jump past 8k means
    // a field was added back — fail here rather than in production.
    expect(full.length).toBeLessThan(8000);
    expect(ctx(heavy)).toContain('ועוד 35 שאינם מפורטים כאן.');
  });
});

// ---- nothing identifying or fetchable -------------------------------------

describe('assets — no signed URL, path or identifier reaches the context', () => {
  const text = ctx(cloudData({
    assets: manyAssets(5, () => ({ url: SIGNED })),
    campaigns: [campaign()],
  }));

  it('emits no URL of any kind', () => {
    expect(text).not.toContain('http');
    expect(text).not.toContain('://');
    expect(text).not.toContain('token=');
    expect(text).not.toContain('supabase.co');
  });

  it('emits no storage path, asset id or user id', () => {
    expect(text).not.toContain('storage/v1');
    expect(text).not.toContain('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(text).not.toContain('-2222-3333-4444-555555555555');
    expect(text).not.toMatch(/\.png\b/);
  });
});

// ---- read-only: no Jake asset write op exists ------------------------------

describe('assets — READ-ONLY: Jake has no asset write op', () => {
  const agent = read('../jakeAgent.js');
  const pack = read('../jakePack.js');
  const assistant = read('../../components/ai/Assistant.jsx');
  // Strip line comments BEFORE block comments (see campaignsContainment.test.js).
  const strip = (s) => s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  it('jakeAgent.js declares no asset action handler or entity', () => {
    const code = strip(agent);
    for (const forbidden of ['add_asset', 'delete_asset', 'update_asset', 'favorite_asset', 'link_asset', 'assetLibrary']) {
      expect(code).not.toContain(forbidden);
    }
  });

  it('the Jake lane calls no asset mutation', () => {
    for (const code of [strip(pack), strip(assistant)]) {
      for (const forbidden of ['createAsset', 'deleteAsset', 'setAssetFavorite', 'linkAssetCampaign']) {
        expect(code).not.toContain(forbidden);
      }
    }
  });

  it('the Assistant seam reads assets through listAssets() and the pure decider only', () => {
    const code = strip(assistant);
    expect(code).toContain('listAssets()');
    expect(code).toContain('assetStateAfterRead(outcome, rows)');
    // The decision is not re-implemented inline next to the read.
    expect(code).not.toMatch(/setAssets\(\s*rows\s*\)/);
  });

  it('jakePack.js imports metadata helpers only, and never creative/v2', () => {
    const code = strip(pack);
    expect(code).toContain("from './assetLibrary.js'");
    expect(code).not.toContain('creative/v2');
    expect(code).not.toContain('assetStoragePath');
    expect(code).not.toContain('ASSET_BUCKET');
  });
});

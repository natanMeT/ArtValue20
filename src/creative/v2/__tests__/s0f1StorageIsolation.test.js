import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createCampaignStore, CAMPAIGN_STORAGE_KEY } from '../campaignStore.js';
import { createProductionStore, PRODUCTION_STORAGE_KEY } from '../productionStore.js';
import { userScopeKey } from '../../../lib/userIdentity.js';
import { galleryDbName } from '../../../lib/galleryStore.js';

// ===================================================================
// S0F.1 (D6) — per-account isolation of the creative campaign store, the
// production-package store and the gallery database.
//
// Before this slice all three were DEVICE-GLOBAL, so two accounts on one
// browser shared them — the same defect class S0C closed for Jake chat.
// Rules proven here: A cannot read B; a switch lands on the right
// namespace; a scoped key/db-name can never equal the bare legacy one; and
// nothing legacy is read, migrated, copied or deleted.
// ===================================================================

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const root = read('../createArtValueCreative.js');
const assistant = read('../../../components/ai/Assistant.jsx');
const galleryStore = read('../../../lib/galleryStore.js');

const sessionOf = (id) => ({ user: { id } });
const A = sessionOf('11111111-1111-4111-8111-111111111111');
const B = sessionOf('22222222-2222-4222-8222-222222222222');

// One SHARED storage — exactly the shared-device situation the scoping must survive.
function sharedStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    keys: () => [...m.keys()],
    raw: m,
  };
}

const draftFor = (store) => store.createDraft({ tenantId: 'artvalue', requestId: 'r1' });

// Distinct id generators per account: the default generator is time+counter based,
// so two stores created in the same millisecond would mint the SAME id and mask
// (rather than expose) a real isolation failure.
const campaignFor = (session, storage, idPrefix) => createCampaignStore({
  storage, storageKey: userScopeKey(CAMPAIGN_STORAGE_KEY, session), id: () => `${idPrefix}_cmp`,
});
const productionFor = (session, storage, idPrefix) => createProductionStore({
  storage, storageKey: userScopeKey(PRODUCTION_STORAGE_KEY, session), id: () => `${idPrefix}_pkg`,
});

describe('campaign store — account A cannot see account B', () => {
  it('two accounts on ONE storage keep separate record sets', () => {
    const storage = sharedStorage();
    const sa = campaignFor(A, storage, 'a');
    const sb = campaignFor(B, storage, 'b');

    const a1 = draftFor(sa);
    expect(sa.get(a1.id)).toBeTruthy();
    expect(sb.get(a1.id)).toBeNull();

    const b1 = draftFor(sb);
    expect(sb.get(b1.id)).toBeTruthy();
    expect(sa.get(b1.id)).toBeNull();
  });

  it('re-opening account A lands on A\'s namespace (switch reloads correctly)', () => {
    const storage = sharedStorage();
    const first = campaignFor(A, storage, 'a');
    const id = draftFor(first).id;
    campaignFor(B, storage, 'b'); // switch away
    const back = campaignFor(A, storage, 'a');
    expect(back.get(id)).toBeTruthy();
  });
});

describe('production-package store — account A cannot see account B', () => {
  it('two accounts on ONE storage keep separate package sets', () => {
    const storage = sharedStorage();
    const pa = productionFor(A, storage, 'a');
    const pb = productionFor(B, storage, 'b');
    const rec = pa.save({ campaignId: 'c1', conceptId: 'k1' });
    expect(pa.list().length).toBe(1);
    expect(pb.list().length).toBe(0);
    expect(pb.get(rec.id)).toBeNull();
  });
});

describe('legacy device-global storage is never touched', () => {
  it('a scoped key NEVER equals the bare legacy key', () => {
    for (const s of [A, B, null, undefined]) {
      expect(userScopeKey(CAMPAIGN_STORAGE_KEY, s)).not.toBe(CAMPAIGN_STORAGE_KEY);
      expect(userScopeKey(PRODUCTION_STORAGE_KEY, s)).not.toBe(PRODUCTION_STORAGE_KEY);
    }
    expect(galleryDbName(A)).not.toBe('artvalue_gallery');
    expect(galleryDbName(null)).not.toBe('artvalue_gallery');
  });

  it('pre-existing legacy records are never read, migrated, copied or deleted', () => {
    const legacy = JSON.stringify([{ id: 'legacy_1', status: 'concepts_ready' }]);
    const storage = sharedStorage({
      [CAMPAIGN_STORAGE_KEY]: legacy,
      [PRODUCTION_STORAGE_KEY]: JSON.stringify([{ id: 'legacy_pkg' }]),
    });
    const sa = campaignFor(A, storage, 'a');
    const pa = productionFor(A, storage, 'a');

    expect(sa.get('legacy_1')).toBeNull();      // never read into the account
    expect(pa.list()).toEqual([]);              // never migrated
    draftFor(sa);                                // a write must not disturb legacy
    expect(storage.raw.get(CAMPAIGN_STORAGE_KEY)).toBe(legacy); // byte-identical, still present
    expect(storage.raw.has(PRODUCTION_STORAGE_KEY)).toBe(true); // never deleted
  });
});

describe('gallery database is scoped per account', () => {
  it('each account gets its own database name; local/demo has its own bucket', () => {
    expect(galleryDbName(A)).toBe(`artvalue_gallery_${A.user.id}`);
    expect(galleryDbName(B)).toBe(`artvalue_gallery_${B.user.id}`);
    expect(galleryDbName(A)).not.toBe(galleryDbName(B));
    expect(galleryDbName(null)).toBe('artvalue_gallery_local');
  });

  it('no unscoped read/write entry point is exported any more', () => {
    expect(galleryStore).not.toMatch(/export async function (addImage|listImages|getBlob|removeImage)\b/);
    expect(galleryStore).toContain('export function createGalleryStore(session)');
    expect(galleryStore).toContain("const DB_NAME_BASE = 'artvalue_gallery'");
  });
});

describe('composition root + Assistant wiring', () => {
  it('the creative stores are keyed by userScopeKey, never by name or email', () => {
    expect(root).toContain("import { userScopeKey } from '../../lib/userIdentity.js'");
    expect(root).toContain('userScopeKey(base, session)');
    expect(root).toContain('storeDeps(CAMPAIGN_STORAGE_KEY)');
    expect(root).toContain('storeDeps(PRODUCTION_STORAGE_KEY)');
  });

  it('cloud mode WITHOUT a resolved user id makes no persistent write', () => {
    expect(root).toMatch(/isSupabaseConfigured && !hasUserId\) \? \{ \.\.\.scoped, storage: memoryStorage\(\) \}/);
  });

  it('the Assistant rebuilds the orchestrator when the account changes', () => {
    expect(assistant).toContain('creativeScopeRef');
    expect(assistant).toMatch(/creativeScopeRef\.current !== creativeScopeId/);
    expect(assistant).toMatch(/createArtValueCreative\(\{[^}]*session[^}]*\}\)/);
  });
});

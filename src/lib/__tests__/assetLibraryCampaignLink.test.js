import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeAssetRow, normalizeCampaignLink, campaignLabelForAsset,
} from '../assetLibrary.js';

// ===================================================================
// Asset Library slice 3 — the optional asset -> campaign link.
//
// SCOPE OF THIS EVIDENCE, stated plainly: everything below runs against a
// recording double. It proves the CLIENT contract — what is sent, what is
// believed, and what is refused. It does NOT prove the two server rules that
// actually make the link safe:
//   * the composite FK (campaign_id, user_id) -> campaigns (id, user_id),
//     which is what makes a cross-account link impossible;
//   * the column grant, which is what keeps the writable surface to two columns.
// Those live in Postgres and are covered by the migration's own postconditions,
// the local rehearsal, and the owner-run acceptance controls.
// ===================================================================

const UID = '11111111-2222-4333-8444-555555555555';
const AID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const CID = 'cccccccc-dddd-4eee-8fff-000000000001';
const CID2 = 'cccccccc-dddd-4eee-8fff-000000000002';

const row = (over = {}) => ({
  id: AID, user_id: UID, ext: 'png', mime: 'image/png', byte_size: 10,
  storage_path: `${UID}/${AID}.png`, created_at: '2026-08-01T00:00:00Z', ...over,
});

describe('normalizeAssetRow · the campaign link is read strictly', () => {
  it('carries a well-formed uuid through', () => {
    expect(normalizeAssetRow(row({ campaign_id: CID })).campaignId).toBe(CID);
  });

  it('reads a pre-slice-3 row (column absent) as NOT linked, never undefined', () => {
    expect(normalizeAssetRow(row()).campaignId).toBe(null);
  });

  it('refuses to carry a malformed value: the column is uuid, so anything else is not a link', () => {
    for (const v of [null, undefined, '', ' ', 0, 1, false, true, 'not-a-uuid', {}, []]) {
      expect(normalizeAssetRow(row({ campaign_id: v })).campaignId).toBe(null);
    }
  });

  it('does not change any slice 1 / slice 2 field while adding the new one', () => {
    const norm = normalizeAssetRow(row({ campaign_id: CID, is_favorite: true }));
    expect(norm.storagePath).toBe(`${UID}/${AID}.png`);
    expect(norm.kind).toBe('image');
    expect(norm.url).toBe(null);
    expect(norm.favorite).toBe(true);
  });
});

describe('normalizeCampaignLink · the empty string must never reach a uuid column', () => {
  it("maps a <select>'s blank option to NULL — an unlink, not an error", () => {
    // THE defect this exists for: '' on a uuid column fails as 22P02 before the
    // foreign key is even evaluated, turning the ordinary "no campaign" case
    // into an opaque database error.
    expect(normalizeCampaignLink('')).toEqual({ ok: true, value: null });
    expect(normalizeCampaignLink('   ')).toEqual({ ok: true, value: null });
  });

  it('maps null / undefined to NULL', () => {
    expect(normalizeCampaignLink(null)).toEqual({ ok: true, value: null });
    expect(normalizeCampaignLink(undefined)).toEqual({ ok: true, value: null });
  });

  it('passes a well-formed uuid through, trimmed', () => {
    expect(normalizeCampaignLink(CID)).toEqual({ ok: true, value: CID });
    expect(normalizeCampaignLink(` ${CID} `)).toEqual({ ok: true, value: CID });
  });

  it('REFUSES anything else instead of silently unlinking', () => {
    // Coercing a bad value to null would turn a caller bug into a silent
    // destructive edit: the user would see the link disappear and be told it
    // succeeded.
    for (const v of ['nope', '123', 0, 1, false, true, {}, [], () => {}]) {
      expect(normalizeCampaignLink(v)).toEqual({ ok: false, value: null });
    }
  });
});

describe('campaignLabelForAsset · three states, because two would lie', () => {
  const campaigns = [
    { id: CID, title: 'קמפיין קיץ', status: 'active' },
    { id: CID2, title: 'קמפיין חורף', status: 'completed' },
  ];

  it('reports "none" for an unlinked asset', () => {
    expect(campaignLabelForAsset({ campaignId: null }, campaigns)).toEqual({ state: 'none' });
    expect(campaignLabelForAsset({}, campaigns)).toEqual({ state: 'none' });
    expect(campaignLabelForAsset(null, campaigns)).toEqual({ state: 'none' });
  });

  it('names the campaign when it is known', () => {
    expect(campaignLabelForAsset({ campaignId: CID }, campaigns))
      .toEqual({ state: 'named', label: 'קמפיין קיץ' });
    expect(campaignLabelForAsset({ campaignId: CID2 }, campaigns))
      .toEqual({ state: 'named', label: 'קמפיין חורף' });
  });

  it('reports "unknown" — NOT "none" — for a link it cannot resolve', () => {
    // A deleted campaign, a failed campaign read, or a stale snapshot. Saying
    // "no campaign" here would contradict the database; guessing a name would
    // be worse. This is the state the whole helper exists for.
    const orphan = { campaignId: 'ffffffff-0000-4000-8000-000000000000' };
    expect(campaignLabelForAsset(orphan, campaigns)).toEqual({ state: 'unknown' });
  });

  it('reports "unknown" when the campaign list is empty or missing — a failed read is not an unlink', () => {
    const linked = { campaignId: CID };
    expect(campaignLabelForAsset(linked, [])).toEqual({ state: 'unknown' });
    expect(campaignLabelForAsset(linked, null)).toEqual({ state: 'unknown' });
    expect(campaignLabelForAsset(linked, undefined)).toEqual({ state: 'unknown' });
  });

  it('is total: malformed entries in the list do not crash the lookup', () => {
    expect(campaignLabelForAsset({ campaignId: CID }, [null, {}, { id: CID, title: 'ok' }]))
      .toEqual({ state: 'named', label: 'ok' });
  });
});

// ===================================================================
// The IO seam. THE failure this covers is the same class as slice 2's:
// PostgREST reports an RLS-refused update as SUCCESS WITH ZERO ROWS, with no
// error to guard on. A cross-account CAMPAIGN, by contrast, is refused by the
// foreign key and DOES arrive as an error — two different routes, both of which
// must surface as a rejected promise.
// ===================================================================
const h = vi.hoisted(() => ({ calls: [], data: null, error: null }));

vi.mock('../supabase.js', () => ({
  supabase: {
    from: (table) => {
      const chain = {
        update: (patch) => { h.calls.push({ op: 'update', table, patch }); return chain; },
        eq: (col, val) => { h.calls.push({ op: 'eq', col, val }); return chain; },
        select: (cols) => { h.calls.push({ op: 'select', cols }); return Promise.resolve({ data: h.data, error: h.error }); },
      };
      return chain;
    },
    storage: { from: () => ({}) },
  },
}));

const { linkAssetCampaign } = await import('../api.js');

beforeEach(() => { h.calls = []; h.data = null; h.error = null; });

describe('linkAssetCampaign · persist-first, server-confirmed', () => {
  it('sends campaign_id and NOTHING else — the grant allows exactly two columns and this write owns one', async () => {
    h.data = [{ id: AID, campaign_id: CID }];
    await linkAssetCampaign(AID, CID);
    const update = h.calls.find((c) => c.op === 'update');
    expect(Object.keys(update.patch)).toEqual(['campaign_id']);
    expect(update.patch.campaign_id).toBe(CID);
    expect(update.table).toBe('assets');
  });

  it('sends NULL — never the empty string — when unlinking', async () => {
    h.data = [{ id: AID, campaign_id: null }];
    await linkAssetCampaign(AID, '');
    expect(h.calls.find((c) => c.op === 'update').patch.campaign_id).toBe(null);
  });

  it('filters by the asset id and asks for the row BACK as its evidence', async () => {
    h.data = [{ id: AID, campaign_id: CID }];
    await linkAssetCampaign(AID, CID);
    expect(h.calls).toContainEqual({ op: 'eq', col: 'id', val: AID });
    expect(h.calls.some((c) => c.op === 'select')).toBe(true);
  });

  it('REJECTS a malformed campaign value BEFORE any request is made', async () => {
    await expect(linkAssetCampaign(AID, 'not-a-uuid')).rejects.toThrow(/אינה תקינה/);
    expect(h.calls).toEqual([]); // nothing was sent
  });

  it('REJECTS when the server changed ZERO rows — the RLS-refusal case, which carries no error', async () => {
    // Account B updating account A's asset: PostgREST answers 200 with [].
    h.data = []; h.error = null;
    await expect(linkAssetCampaign(AID, CID)).rejects.toThrow(/לא נשמר/);
  });

  it('REJECTS when the server stored a DIFFERENT campaign than the one requested', async () => {
    h.data = [{ id: AID, campaign_id: CID2 }];
    await expect(linkAssetCampaign(AID, CID)).rejects.toThrow(/לא נשמר/);
  });

  it('REJECTS when the server reports NULL for a requested link', async () => {
    h.data = [{ id: AID, campaign_id: null }];
    await expect(linkAssetCampaign(AID, CID)).rejects.toThrow(/לא נשמר/);
  });

  it('REJECTS when more than one row came back', async () => {
    h.data = [{ id: AID, campaign_id: CID }, { id: 'other', campaign_id: CID }];
    await expect(linkAssetCampaign(AID, CID)).rejects.toThrow(/לא נשמר/);
  });

  it('REJECTS the foreign-key violation instead of swallowing it — the cross-account case', async () => {
    // Account A naming account B's campaign. RLS never sees it; the FK does.
    h.error = new Error('insert or update on table "assets" violates foreign key constraint "assets_campaign_same_owner_fk"');
    await expect(linkAssetCampaign(AID, CID)).rejects.toThrow(/assets_campaign_same_owner_fk/);
  });

  it('resolves with the CONFIRMED link on success, and with null on a confirmed unlink', async () => {
    h.data = [{ id: AID, campaign_id: CID }];
    await expect(linkAssetCampaign(AID, CID)).resolves.toBe(CID);
    h.data = [{ id: AID, campaign_id: null }];
    await expect(linkAssetCampaign(AID, null)).resolves.toBe(null);
  });

  it('touches NO storage — the link is a row update, with no second write', async () => {
    h.data = [{ id: AID, campaign_id: CID }];
    await linkAssetCampaign(AID, CID);
    expect(h.calls.every((c) => c.table === undefined || c.table === 'assets')).toBe(true);
    expect(h.calls.some((c) => /upload|remove|sign/.test(c.op))).toBe(false);
  });
});

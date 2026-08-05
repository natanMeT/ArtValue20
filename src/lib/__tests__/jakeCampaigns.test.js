// ===================================================================
// Jake sees the campaigns — `public.campaigns` reaches Jake's CONTEXT (and only
// his context) through the JAKE SEAM, and every absence stays truthful.
//
// THE GAP THIS FILE PINS, and it was worse than the calendar's. `api.fetchAll()`
// hydrates nine collections and campaigns is not one of them; the page owns its
// own state and re-reads after every write. Projects and inventory at least get
// notConnectedLine(), so Jake is TOLD he cannot see them. Campaigns had neither
// data nor a declaration of absence — the word did not appear in jakePack.js at
// all — so an ungrounded answer was the only thing available.
//
// These tests EXECUTE the shipped builders (artValuePack.buildContext /
// .briefing) rather than pinning source text, matching the jakeCalendar.test.js
// and jakeContextTruthfulness.test.js precedent.
//
// NO network, NO model, NO Gateway, NO store.
// ===================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { artValuePack } from '../jakePack.js';
import { withBusinessBrain } from '../jakeBusinessContext.js';
import { AI_GATEWAY_INPUT_LIMITS } from '../aiGatewayInput.js';
import { CAMPAIGN_QUOTA, CAMPAIGN_LIMITS } from '../campaigns.js';

const ctx = (d) => artValuePack.buildContext(d);
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// EXACTLY the shape api.fetchAll() returns — no projects / inventory / activity
// key, and no campaigns key either (campaigns ride the seam, not the store).
function cloudData(extra = {}) {
  return {
    clients: [], quotes: [], transactions: [], outreachLeads: [], tasks: [],
    businessProfile: null, charges: [], payments: [],
    meta: { source: 'supabase' },
    ...extra,
  };
}

const campaign = (over = {}) => ({
  id: 'k1', userId: 'u1', title: 'קמפיין קיץ', objective: 'ל'.repeat(CAMPAIGN_LIMITS.objective),
  status: 'active', startDate: '2026-08-01', endDate: '2026-09-30',
  createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

const many = (n, over = () => ({})) =>
  Array.from({ length: n }, (_, i) => campaign({ id: `k${i}`, title: `קמפיין ${i}`, ...over(i) }));

// ---- hydrated -------------------------------------------------------------

describe('T7 — hydrated campaigns reach the context with the approved fields only', () => {
  const data = cloudData({
    campaigns: [
      campaign({ id: 'a', title: 'קמפיין קיץ', status: 'active' }),
      campaign({ id: 'b', title: 'קמפיין סתיו', status: 'draft' }),
      campaign({ id: 'c', title: 'קמפיין חורף', status: 'completed' }),
      campaign({ id: 'd', title: 'קמפיין אביב', status: 'cancelled' }),
    ],
  });
  const text = ctx(data);

  it('states the total and the exact per-status counts', () => {
    expect(text).toContain('4 סה״כ');
    expect(text).toContain('1 פעילים');
    expect(text).toContain('1 טיוטות');
    expect(text).toContain('1 הושלמו');
    expect(text).toContain('1 בוטלו');
  });

  it('lists the ACTIVE campaign with its Hebrew status label and date window', () => {
    expect(text).toContain('קמפיין קיץ (פעיל) [2026-08-01 → 2026-09-30]');
  });

  it('does not list non-active campaigns individually', () => {
    expect(text).not.toContain('קמפיין סתיו');
    expect(text).not.toContain('קמפיין חורף');
    expect(text).not.toContain('קמפיין אביב');
  });

  it('never leaks the raw status enum, the uuid, or the owner id', () => {
    const line = text.split('\n').find((l) => l.includes('קמפיינים פעילים')) || '';
    for (const leak of ['active', 'draft', 'completed', 'cancelled', 'u1']) {
      expect(line, `must not carry "${leak}"`).not.toContain(leak);
    }
  });

  it('never carries an objective body — the single largest budget risk', () => {
    expect(text).not.toContain('ל'.repeat(40));
  });

  it('names it as a BUSINESS campaign so it cannot be read as a creative session', () => {
    expect(text).toContain('קמפיין עסקי במודול הקמפיינים — לא סשן קריאייטיב');
  });

  it('omits the date window entirely when a campaign has no dates', () => {
    const t = ctx(cloudData({ campaigns: [campaign({ startDate: null, endDate: null })] }));
    expect(t).toContain('קמפיין קיץ (פעיל).');
    expect(t).not.toContain('[—');
  });
});

// ---- the three absences ---------------------------------------------------

describe('T8 — an EMPTY array is a verified fact, not an absence', () => {
  const text = ctx(cloudData({ campaigns: [] }));

  it('says there are no campaigns', () => {
    expect(text).toContain('קמפיינים: אין קמפיינים בחשבון הזה.');
  });

  it('does NOT use either unavailable wording', () => {
    expect(text).not.toContain('לא הצלחת לטעון את הקמפיינים');
    expect(text).not.toContain('קמפיינים: המודול אינו מחובר');
  });
});

describe('T9 — a FAILED cloud read is declared, and never reported as zero', () => {
  const text = ctx(cloudData({ campaigns: undefined, campaignsError: true }));

  it('tells Jake he could not load them', () => {
    expect(text).toContain('לא הצלחת לטעון את הקמפיינים');
  });

  it('forbids the zero claim explicitly', () => {
    expect(text).toContain('אל תאמר שאין קמפיינים');
    expect(text).toContain('אל תדווח על אפס');
  });

  it('does not claim the module is unconnected — that is a different fact', () => {
    expect(text).not.toContain('קמפיינים: המודול אינו מחובר');
  });

  it('states no campaign count at all', () => {
    // Scoped to the campaign line on purpose: "סה״כ —" also appears in the
    // leads line, and a whole-context assertion would pass or fail for a
    // reason that has nothing to do with campaigns.
    const line = text.split('\n').find((l) => l.includes('קמפיינים')) || '';
    expect(line).not.toContain('סה״כ');
    expect(line).not.toContain('פעילים,');
  });
});

// ⚠️ THIS IS THE *SETTLED* NOT-CONNECTED CASE. When it was written it was the
// only unhydrated-with-no-error state there was. It no longer is: the pre-settle
// window is a THIRD state, asserted in the block below, and it is told apart by
// `campaignsPending`. The fixture here deliberately omits that key, which is
// exactly how local/demo and every legacy caller behave.
describe('T10 — local/demo is "not connected", NOT a failure', () => {
  const text = ctx(cloudData({ campaigns: undefined, campaignsError: false }));

  it('uses the shared notConnectedLine wording', () => {
    expect(text).toContain('קמפיינים: המודול אינו מחובר לחשבון הזה');
  });

  it('does NOT use the failure wording', () => {
    expect(text).not.toContain('לא הצלחת לטעון את הקמפיינים');
  });

  it('a missing key behaves identically to an explicit undefined', () => {
    expect(ctx(cloudData())).toContain('קמפיינים: המודול אינו מחובר לחשבון הזה');
  });
});

// ---- the pre-settle window (C1) -------------------------------------------

// THE THIRD ABSENCE. Between a cloud panel open and the seam read settling
// (≤4s) `campaigns` is undefined with the error flag FALSE — structurally
// identical to local/demo, so Jake was handed "המודול אינו מחובר לחשבון הזה".
// That is FALSE in cloud: the module is connected and the rows are durable,
// they simply had not arrived. `campaignsPending` is what tells the two apart.
// Only the campaign lines. The surrounding context legitimately carries
// not-connected wording and digits for OTHER modules (assets, projects,
// inventory, the KPI roll-ups), so scanning the whole string would pass or fail
// for the wrong reason — the same trap jakeAssets.test.js documents.
const campaignSection = (text) => text.split('\n').filter((l) => l.startsWith('- קמפיינים')).join('\n');

describe('C1 — the PRE-SETTLE window is its own state, not "not connected"', () => {
  const text = ctx(cloudData({ campaigns: undefined, campaignsError: false, campaignsPending: true }));

  it('emits the approved pending wording', () => {
    expect(text).toContain(
      'קמפיינים: עדיין אין לי את הנתונים — אל תסיק מכך מסקנה. '
      + 'אל תאמר שאין קמפיינים ואל תדווח על אפס; אמור בכנות שהנתונים עדיין נטענים.',
    );
  });

  it('NEVER claims the module is disconnected', () => {
    // Scoped to the campaign lines: other modules are legitimately
    // not-connected in this fixture.
    expect(campaignSection(text)).not.toBe('');
    expect(campaignSection(text)).not.toContain('המודול אינו מחובר');
  });

  it('NEVER claims the read failed — nothing has failed yet', () => {
    expect(text).not.toContain('לא הצלחת לטעון את הקמפיינים');
  });

  it('reports no count and no campaign of any kind', () => {
    // The section must be non-empty, or every assertion below passes vacuously.
    expect(campaignSection(text)).not.toBe('');
    expect(campaignSection(text)).not.toMatch(/\d/);
    expect(text).not.toContain('קמפיינים פעילים');
    expect(text).not.toContain('אין קמפיינים בחשבון הזה');
  });

  it('carries the do-not-infer instruction, like every other absence wording', () => {
    expect(text).toContain('אל תסיק מכך מסקנה');
  });
});

describe('C1 — precedence: a KNOWN failure is never softened into "loading"', () => {
  it('error wins over pending when a caller sets both', () => {
    const text = ctx(cloudData({ campaigns: undefined, campaignsError: true, campaignsPending: true }));
    expect(text).toContain('לא הצלחת לטעון את הקמפיינים');
    expect(text).not.toContain('עדיין אין לי את הנתונים');
  });

  it('hydrated rows win over pending — a verified list is never hidden', () => {
    const text = ctx(cloudData({ campaigns: many(3), campaignsPending: true }));
    expect(text).toContain('3 סה״כ');
    expect(text).not.toContain('עדיין אין לי את הנתונים');
  });

  it('a loaded EMPTY list is a verified fact and outranks pending too', () => {
    const text = ctx(cloudData({ campaigns: [], campaignsPending: true }));
    expect(text).toContain('קמפיינים: אין קמפיינים בחשבון הזה.');
    expect(text).not.toContain('עדיין אין לי את הנתונים');
  });
});

describe('C1 — the pending flag DEFAULTS to falsy, and that is load-bearing', () => {
  // Inverting this ships a NEW falsehood: local/demo genuinely has no campaigns
  // module and never sets the key, so a truthy default would have it announce
  // that its campaigns are loading, forever.
  it('an absent key keeps the pre-existing not-connected wording', () => {
    expect(ctx(cloudData({ campaigns: undefined, campaignsError: false })))
      .toContain('קמפיינים: המודול אינו מחובר לחשבון הזה');
  });

  it('an explicit false keeps it too', () => {
    expect(ctx(cloudData({ campaigns: undefined, campaignsError: false, campaignsPending: false })))
      .toContain('קמפיינים: המודול אינו מחובר לחשבון הזה');
  });
});

// ---- the cap --------------------------------------------------------------

describe('T11 — the active list is capped at 5 with a truthful overflow', () => {
  const text = ctx(cloudData({ campaigns: many(9) }));

  it('lists exactly five', () => {
    const line = text.split('\n').find((l) => l.includes('קמפיינים פעילים')) || '';
    expect(line.split(';')).toHaveLength(5);
  });

  it('declares the ones it did not list', () => {
    expect(text).toContain('ועוד 4 פעילים שאינם מפורטים כאן');
  });

  it('the roll-up still counts ALL of them, not just the listed five', () => {
    expect(text).toContain('9 סה״כ');
    expect(text).toContain('9 פעילים');
  });

  it('no overflow clause when the actives fit', () => {
    expect(ctx(cloudData({ campaigns: many(5) }))).not.toContain('שאינם מפורטים כאן');
  });
});

// ---- the budget -----------------------------------------------------------

describe('T12/T13 — the context stays under the Gateway limit at QUOTA', () => {
  const LIMIT = AI_GATEWAY_INPUT_LIMITS.MAX_CONTEXT_CHARS;
  const maxTitle = 'ק'.repeat(CAMPAIGN_LIMITS.title);

  // The absolute worst case the product can reach: the account quota, every row
  // active, every title at the campaigns_title_bounded maximum.
  const worst = cloudData({
    campaigns: many(CAMPAIGN_QUOTA, () => ({ status: 'active', title: maxTitle })),
    clients: Array.from({ length: 60 }, (_, i) => ({ id: `c${i}`, name: `לקוח מסחרי בע״מ ${i}`, status: 'active', value: 5000, nextAction: 'לחזור ללקוח ולסגור את הצעת המחיר' })),
    tasks: Array.from({ length: 40 }, (_, i) => ({ id: `t${i}`, title: `משימה ארוכה למדי ${i}`, status: 'open', deadline: '2026-08-10' })),
    outreachLeads: Array.from({ length: 30 }, (_, i) => ({ id: `l${i}`, name: `ליד ${i}`, status: 'pending' })),
  });

  it('T12 the full context.summary stays under MAX_CONTEXT_CHARS', () => {
    const full = withBusinessBrain(ctx(worst), 'מה קורה עם הקמפיינים שלי?', worst.businessProfile);
    expect(full.length).toBeLessThan(LIMIT);
  });

  it('T13 the cap is LOAD-BEARING — the same account uncapped would be REJECTED', () => {
    // Not an assertion about our code: a measurement of what the alternative
    // costs. The Gateway REJECTS an over-limit context rather than truncating
    // it, so an uncapped list would not degrade Jake — it would stop him.
    const uncapped = worst.campaigns
      .map((c) => `${c.title} (פעיל) [${c.startDate} → ${c.endDate}]`).join('; ');
    expect(ctx(worst).length + uncapped.length).toBeGreaterThan(LIMIT);
  });

  it('the campaign block itself costs under 1000 chars at the worst case', () => {
    const withC = ctx(worst).length;
    const without = ctx({ ...worst, campaigns: undefined, campaignsError: false }).length;
    expect(withC - without).toBeLessThan(1000);
  });

  // C1 — the pre-settle state is a SWAP, not an addition: it replaces the
  // not-connected line rather than adding one. Measured at the worst case:
  // pending 3,947 vs not-connected 3,990 vs hydrated 5,085, all / 12,000. The
  // new state is therefore strictly CHEAPER than the wording it replaces and
  // can never become the binding constraint. Asserted as a relation, not as a
  // hardcoded number, so the guarantee survives future wording edits.
  it('C1 the PENDING state costs no more than the wording it replaces', () => {
    const pending = withBusinessBrain(
      ctx({ ...worst, campaigns: undefined, campaignsError: false, campaignsPending: true }),
      'מה קורה עם הקמפיינים שלי?', worst.businessProfile,
    );
    const notConnected = withBusinessBrain(
      ctx({ ...worst, campaigns: undefined, campaignsError: false }),
      'מה קורה עם הקמפיינים שלי?', worst.businessProfile,
    );
    expect(pending.length).toBeLessThan(LIMIT);
    expect(pending.length).toBeLessThanOrEqual(notConnected.length);
  });

  it('C1 the hydrated worst case remains the binding constraint, still under the limit', () => {
    const hydrated = withBusinessBrain(ctx(worst), 'מה קורה עם הקמפיינים שלי?', worst.businessProfile);
    const pending = withBusinessBrain(
      ctx({ ...worst, campaigns: undefined, campaignsError: false, campaignsPending: true }),
      'מה קורה עם הקמפיינים שלי?', worst.businessProfile,
    );
    expect(hydrated.length).toBeLessThan(LIMIT);
    expect(pending.length).toBeLessThan(hydrated.length);
  });
});

// ---- the boundaries -------------------------------------------------------

describe('T14 — read-only: the seam adds no write path and no Jake op', () => {
  const assistant = read('../../components/ai/Assistant.jsx');

  it('Assistant.jsx never calls a durable campaign WRITE function', () => {
    // Word-bounded, not a bare substring. `createCampaign` is a PREFIX of
    // `creative.createCampaignBrief`, which is the device-local creative-session
    // brief — a different module, a different lifetime, and not a write to
    // public.campaigns at all. A substring check would fail on it and teach the
    // next reader that the seam writes when it does not.
    for (const w of ['createCampaign', 'updateCampaign', 'setCampaignStatus', 'deleteCampaign']) {
      const bounded = new RegExp(`\\b${w}\\b\\s*\\(`);
      expect(bounded.test(assistant), `the seam must not call ${w}()`).toBe(false);
    }
  });

  it('it imports exactly ONE campaign function from api.js, and it is the read', () => {
    const line = assistant.split('\n').find((l) => l.includes("from '../../lib/api.js'")) || '';
    expect(line).toContain('listCampaigns');
    expect(line).not.toMatch(/create|update|delete|Status/);
    expect(assistant).toContain('listCampaigns()');
  });

  it('no campaign op was added to the durable action registry', () => {
    const agent = read('../jakeAgent.js');
    expect(agent.toUpperCase()).not.toContain('CAMPAIGN');
  });

  it('campaigns were NOT added to api.fetchAll()', () => {
    // ⚠️ CRLF. This repo checks out with \r\n, so a '\n}\n' boundary never
    // matches, indexOf returns -1, and slice(0, -1) silently hands back almost
    // the WHOLE file — the guard would then assert against unrelated code and
    // could pass or fail for the wrong reason. Same class as the CRLF comment
    // stripper that broke two guards in the Monthly Plan release. Normalize
    // first, then cut.
    const api = read('../api.js').replace(/\r\n/g, '\n');
    const start = api.indexOf('export async function fetchAll');
    expect(start, 'fetchAll must exist for this guard to mean anything').toBeGreaterThan(-1);
    const rest = api.slice(start);
    const end = rest.indexOf('\n}\n');
    expect(end, 'the function body must terminate').toBeGreaterThan(-1);
    const fetchAllBody = rest.slice(0, end);

    expect(fetchAllBody).not.toContain("from('campaigns')");
    // Positive control: the cut really did capture fetchAll's body.
    expect(fetchAllBody).toContain("from('clients')");
  });
});

describe('T15 — the naming boundary and the purity hold in the CODE', () => {
  // ⚠️ COMMENTS MUST BE STRIPPED FIRST. Both modules DESCRIBE the rules they
  // obey — jakePack's header names `src/creative/v2/**` as the thing it must
  // not import, and campaignReadState's header says "NO store". A raw substring
  // check asserts against that prose and fails on a correct file, which is the
  // "guard asserting against its own header comment" defect this repo has
  // already shipped once. Order matters and is inherited from
  // campaignsContainment.test.js: line comments BEFORE block comments, because
  // a `//` line containing `/**` would otherwise open a false block match.
  const strip = (src) => src
    .replace(/\r\n/g, '\n')
    .split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '\n');

  it('the stripper removes prose but keeps code (positive + negative control)', () => {
    expect(strip('// store\nconst a = 1;')).toContain('const a = 1;');
    expect(strip('// store\nconst a = 1;')).not.toContain('store');
    expect(strip('const s = "store";')).toContain('store');
  });

  it('jakePack.js imports nothing from the device-local creative lane', () => {
    expect(strip(read('../jakePack.js'))).not.toContain('creative/v2');
  });

  it('campaignReadState.js is pure — no store, network, React or clock', () => {
    const mod = strip(read('../campaignReadState.js'));
    for (const forbidden of ['supabase', 'react', 'store', 'Date.now', 'new Date', 'fetch(']) {
      expect(mod, `pure module must not use ${forbidden}`).not.toContain(forbidden);
    }
    // Positive control: the stripper did not simply empty the file.
    expect(mod).toContain('export function campaignStateAfterRead');
  });
});

// ---- the briefing must be untouched ---------------------------------------

describe('the morning briefing does NOT carry campaigns (owner decision D1)', () => {
  const data = cloudData({
    campaigns: many(6),
    tasks: [{ id: 't1', title: 'משימה', status: 'open', deadline: '2026-08-05' }],
  });

  it('no campaign appears in the briefing', () => {
    const b = artValuePack.briefing(data);
    expect(b).not.toContain('קמפיין');
  });

  it('a FAILED campaigns read does not add a briefing notice either', () => {
    const b = artValuePack.briefing(cloudData({ campaigns: undefined, campaignsError: true }));
    expect(b).not.toContain('קמפיינים');
  });

  it('the calendar half of the briefing is unchanged by this slice', () => {
    // The calendar notice is the one seam-driven line the briefing DOES carry.
    const b = artValuePack.briefing(cloudData({ appointments: undefined, appointmentsError: true }));
    expect(b).toContain('לא הצלחתי לטעון את היומן');
  });

  // C1 / owner decision D1: `campaignsPending` and `assetsPending` are WORDING
  // signals for the context only. They must never reach the briefing gate —
  // wiring them in would delay every briefing and put two more failure modes in
  // front of the once-a-day marker.
  it('a PENDING campaigns read adds nothing to the briefing and changes nothing in it', () => {
    const base = artValuePack.briefing(cloudData({ campaigns: undefined, campaignsError: false }));
    const pend = artValuePack.briefing(cloudData({ campaigns: undefined, campaignsError: false, campaignsPending: true }));
    expect(pend).toBe(base);
    expect(pend).not.toContain('עדיין אין לי את הנתונים');
  });

  it('a PENDING assets read likewise leaves the briefing byte-identical', () => {
    const base = artValuePack.briefing(cloudData({ assets: undefined, assetsError: false }));
    const pend = artValuePack.briefing(cloudData({ assets: undefined, assetsError: false, assetsPending: true }));
    expect(pend).toBe(base);
  });

  // ⚠️ THIS GUARD EXISTS BECAUSE A MUTATION SURVIVED. Initialising both pending
  // flags to `false` in cloud passed the entire suite: the pure builders were
  // fully covered, but NOTHING asserted the seam's initial value — which is the
  // only thing that makes the pre-settle window truthful in the shipped app.
  // This repo has no jsdom and no rendered-component tests, so the guard is
  // source-level by necessity. Stated, not glossed.
  it('both pending flags are INITIALISED from isSupabaseConfigured (cloud=true, local=false)', () => {
    const assistant = read('../../components/ai/Assistant.jsx');
    expect(assistant).toContain('const [campaignsPending, setCampaignsPending] = useState(isSupabaseConfigured);');
    expect(assistant).toContain('const [assetsPending, setAssetsPending] = useState(isSupabaseConfigured);');
    // Negative control: the stripper/reader did not simply return an empty file.
    expect(assistant).toContain('const [campaigns, setCampaigns] = useState(undefined);');
  });

  it('both pending flags are CLEARED from the module return, not hardcoded', () => {
    const assistant = read('../../components/ai/Assistant.jsx');
    expect(assistant).toContain('setCampaignsPending(!next.settled);');
    expect(assistant).toContain('setAssetsPending(!next.settled);');
    expect(assistant).not.toContain('setCampaignsPending(false)');
    expect(assistant).not.toContain('setAssetsPending(false)');
  });

  it('both pending flags reach jakePack through jakeData()', () => {
    const assistant = read('../../components/ai/Assistant.jsx');
    const jakeData = assistant.slice(assistant.indexOf('const jakeData = () => ({'));
    const body = jakeData.slice(0, jakeData.indexOf('});'));
    expect(body).toContain('campaignsPending');
    expect(body).toContain('assetsPending');
  });

  it('the briefing gate in Assistant.jsx stays CALENDAR-ONLY', () => {
    const assistant = read('../../components/ai/Assistant.jsx');
    const gates = assistant.match(/if \(!open \|\| !\w+\) return;/g) || [];
    expect(gates).toContain('if (!open || !calendarSettled) return;');
    expect(assistant).not.toContain('campaignsSettled');
    expect(assistant).not.toContain('assetsSettled');
    // The pending flags exist, but never inside the briefing gate.
    expect(assistant).toContain('setCampaignsPending');
    expect(assistant).toContain('setAssetsPending');
    expect(assistant).not.toMatch(/!open \|\| !campaignsPending/);
    expect(assistant).not.toMatch(/!open \|\| !assetsPending/);
  });
});

// ===================================================================
// Jake sees WHICH tasks belong to WHICH campaign — the task ↔ campaign join
// reaches Jake's CONTEXT (and only his context), and every absence stays
// truthful.
//
// THE GAP THIS FILE PINS. `tasks.campaign_id` + its composite FK have been live
// since migration 20260729120000, TaskModal has submitted the link since
// Campaigns slice 2 and Tasks.jsx renders a campaign column — yet Jake knew
// campaign titles and task titles and NOTHING about the relation between them.
//
// THE HARD PART, and most of what is pinned below. Tasks ride the STORE and
// campaigns ride the JAKE SEAM, so they settle INDEPENDENTLY: tasks can be fully
// hydrated while campaigns are pending, failed or absent. A naive join reports
// "not linked to a campaign" at exactly the moment the truth is "I could not
// read the campaigns". So:
//   - WHETHER a task carries a campaign id is knowable from `tasks` alone and
//     is stated in EVERY campaigns state.
//   - WHICH campaign it is needs the campaigns read and is stated ONLY when
//     campaigns are hydrated.
//
// These tests EXECUTE the shipped builder (artValuePack.buildContext) rather
// than pinning source text, matching the jakeCampaigns.test.js precedent.
//
// NO network, NO model, NO Gateway, NO store.
// ===================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { artValuePack } from '../jakePack.js';
import { AI_GATEWAY_INPUT_LIMITS } from '../aiGatewayInput.js';
import { CAMPAIGN_LIMITS } from '../campaigns.js';

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
  id: 'k1', userId: 'u1', title: 'קמפיין קיץ', objective: '',
  status: 'active', startDate: null, endDate: null,
  createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

// A task EXACTLY as api.js rowToTask returns it — every field, so an exclusion
// test that passes cannot be passing because the field was never in the fixture.
const task = (over = {}) => ({
  id: 'tk_1', title: 'משימה', status: 'new', priority: 'normal',
  projectId: 'pr_secret', clientId: 'cl_secret', campaignId: null,
  deadline: '2026-08-20', assignee: 'assignee_secret', linkRef: 'link_secret',
  notes: 'notes_secret', createdAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

const ROLLUP = 'שיוך משימות לקמפיינים:';
const LISTING = 'משימות פתוחות לפי קמפיין';
const UNKNOWN_CLAUSE = 'משויכות לקמפיין ששמו אינו זמין לי כרגע';

// ---- grouping, cap, ordering ---------------------------------------------

describe('T1 — linked open tasks are grouped under their campaign', () => {
  const data = cloudData({
    campaigns: [campaign({ id: 'a', title: 'קמפיין קיץ' })],
    tasks: [
      task({ id: 't1', title: 'לשלוח סקיצה', campaignId: 'a' }),
      task({ id: 't2', title: 'לתאם צילום', campaignId: 'a' }),
    ],
  });
  const text = ctx(data);

  it('lists the campaign with both task titles', () => {
    expect(text).toContain(LISTING);
    expect(text).toContain('קמפיין קיץ — לשלוח סקיצה; לתאם צילום');
  });

  it('POSITIVE CONTROL — the titles really are emitted, so the absence checks below are not dead', () => {
    expect(text).toContain('לשלוח סקיצה');
    expect(text).toContain('לתאם צילום');
  });

  it('counts both as linked and none as unlinked', () => {
    expect(text).toContain('2 מתוך 2 המשימות הפתוחות משויכות לקמפיין, 0 אינן משויכות');
  });
});

describe('T2 — TASKS_PER_CAMPAIGN_CAP is 3 and the overflow is stated exactly', () => {
  const data = cloudData({
    campaigns: [campaign({ id: 'a', title: 'קמפיין קיץ' })],
    tasks: [
      task({ id: 't1', title: 'ראשונה', campaignId: 'a' }),
      task({ id: 't2', title: 'שנייה', campaignId: 'a' }),
      task({ id: 't3', title: 'שלישית', campaignId: 'a' }),
      task({ id: 't4', title: 'רביעית', campaignId: 'a' }),
      task({ id: 't5', title: 'חמישית', campaignId: 'a' }),
    ],
  });
  const text = ctx(data);

  it('shows exactly the first three, in the store array order — no new comparator', () => {
    expect(text).toContain('קמפיין קיץ — ראשונה; שנייה; שלישית');
  });

  it('does NOT show the 4th or 5th title', () => {
    expect(text).not.toContain('רביעית');
    expect(text).not.toContain('חמישית');
  });

  it('states the exact hidden count', () => {
    expect(text).toContain('(ועוד 2 משימות פתוחות שאינן מפורטות כאן)');
  });

  it('the roll-up still counts ALL five as linked — the cap hides, it does not miscount', () => {
    expect(text).toContain('5 מתוך 5 המשימות הפתוחות משויכות לקמפיין, 0 אינן משויכות');
  });
});

describe('T3 — a task title is sliced at 60 chars, the only bound that exists', () => {
  // `public.tasks.title` is `text not null` with NO length check and TaskModal
  // has NO maxLength — unbounded from both sides.
  const long = 'א'.repeat(400);
  const data = cloudData({
    campaigns: [campaign({ id: 'a', title: 'קמפיין קיץ' })],
    tasks: [task({ id: 't1', title: long, campaignId: 'a' })],
  });
  const text = ctx(data);

  it('emits exactly 60 characters of the title', () => {
    expect(text).toContain('א'.repeat(60));
    expect(text).not.toContain('א'.repeat(61));
  });
});

// ---- open-only ------------------------------------------------------------

describe('T4 — done tasks are in NO bucket', () => {
  const data = cloudData({
    campaigns: [campaign({ id: 'a', title: 'קמפיין קיץ' })],
    tasks: [
      task({ id: 't1', title: 'פתוחה', campaignId: 'a' }),
      // ⚠️ AN OPEN TASK WITH AN EMPTY TITLE, and it is the discriminator, not
      // filler. `public.tasks.title` is `text not null` but '' satisfies that,
      // and with every fixture task titled, a predicate forked to
      // `status !== 'done' && t.title` is INDISTINGUISHABLE from the real one —
      // a mutation control proved exactly that by surviving. This row makes the
      // fork change the count, so the parity assertion below can see it.
      task({ id: 't1b', title: '', campaignId: 'a' }),
      task({ id: 't2', title: 'סגורה', campaignId: 'a', status: 'done' }),
      task({ id: 't3', title: 'סגורה-ללא-קמפיין', status: 'done' }),
    ],
  });
  const text = ctx(data);

  it('never lists a done task', () => {
    expect(text).not.toContain('סגורה');
  });

  it('excludes done tasks from BOTH the linked and the unlinked count', () => {
    expect(text).toContain('2 מתוך 2 המשימות הפתוחות משויכות לקמפיין, 0 אינן משויכות');
  });

  it('PARITY — the join uses the same open predicate as the tasks count line', () => {
    // Both numbers are derived from `isOpenTask`. A forked predicate makes them
    // disagree, which is the defect this pins.
    expect(text).toContain('משימות: 2 פתוחות');
  });
});

// ---- unlinked -------------------------------------------------------------

describe('T5 — unlinked tasks are stated once, as a count, never per task', () => {
  const data = cloudData({
    campaigns: [campaign({ id: 'a', title: 'קמפיין קיץ' })],
    tasks: [
      task({ id: 't1', title: 'משויכת', campaignId: 'a' }),
      task({ id: 't2', title: 'חופשית-אחת' }),
      task({ id: 't3', title: 'חופשית-שתיים', campaignId: '' }),
    ],
  });
  const text = ctx(data);

  it('counts both the null and the empty-string link as unlinked', () => {
    expect(text).toContain('1 מתוך 3 המשימות הפתוחות משויכות לקמפיין, 2 אינן משויכות');
  });

  it('states it exactly once — O(1), no per-task listing', () => {
    expect(text.split(ROLLUP).length - 1).toBe(1);
  });

  it('does not name the unlinked tasks anywhere', () => {
    expect(text).not.toContain('חופשית-אחת');
    expect(text).not.toContain('חופשית-שתיים');
  });

  it('scopes the count so it cannot be read as contradicting the listing', () => {
    expect(text).toContain('הספירה הזו חלה על כל הקמפיינים, כולל כאלה שאינם פעילים');
  });
});

// ---- the third bucket -----------------------------------------------------

describe('T6 — an unresolvable campaign id is LINKED, never folded into unlinked', () => {
  const data = cloudData({
    campaigns: [campaign({ id: 'a', title: 'קמפיין קיץ' })],
    tasks: [
      task({ id: 't1', title: 'משויכת-ידועה', campaignId: 'a' }),
      task({ id: 't2', title: 'משויכת-נעלמה', campaignId: 'deleted-campaign' }),
    ],
  });
  const text = ctx(data);

  it('counts it as LINKED', () => {
    expect(text).toContain('2 מתוך 2 המשימות הפתוחות משויכות לקמפיין, 0 אינן משויכות');
  });

  it('names the third bucket separately and forbids the wrong inference', () => {
    expect(text).toContain(`מתוך המשויכות, 1 ${UNKNOWN_CLAUSE}`);
    expect(text).toContain('אל תאמר שהן אינן משויכות לקמפיין ואל תנחש את שמו');
  });

  it('does not invent a campaign title for it', () => {
    expect(text).not.toContain('משויכת-נעלמה');
  });

  it('is omitted entirely when there is nothing unresolvable — no "0" noise', () => {
    const clean = ctx(cloudData({
      campaigns: [campaign({ id: 'a' })],
      tasks: [task({ id: 't1', title: 'משויכת', campaignId: 'a' })],
    }));
    expect(clean).not.toContain(UNKNOWN_CLAUSE);
  });
});

describe('T7 — a task on a NON-ACTIVE campaign is counted but not listed', () => {
  const data = cloudData({
    campaigns: [
      campaign({ id: 'a', title: 'קמפיין פעיל', status: 'active' }),
      campaign({ id: 'b', title: 'קמפיין שהושלם', status: 'completed' }),
    ],
    tasks: [
      task({ id: 't1', title: 'על-הפעיל', campaignId: 'a' }),
      task({ id: 't2', title: 'על-שהושלם', campaignId: 'b' }),
    ],
  });
  const text = ctx(data);

  it('counts it as linked, and NOT as unresolvable', () => {
    expect(text).toContain('2 מתוך 2 המשימות הפתוחות משויכות לקמפיין, 0 אינן משויכות');
    expect(text).not.toContain(UNKNOWN_CLAUSE);
  });

  it('does not list it — only shown ACTIVE campaigns are listed', () => {
    expect(text).not.toContain('על-שהושלם');
    expect(text).toContain('על-הפעיל');
  });
});

describe('T8 — a shown active campaign with no open tasks says so', () => {
  const data = cloudData({
    campaigns: [
      campaign({ id: 'a', title: 'קמפיין עם' }),
      campaign({ id: 'b', title: 'קמפיין בלי' }),
    ],
    tasks: [task({ id: 't1', title: 'יחידה', campaignId: 'a' })],
  });
  it('states "אין משימות פתוחות" rather than omitting the campaign', () => {
    expect(ctx(data)).toContain('קמפיין בלי — אין משימות פתוחות');
  });
});

describe('T9 — the listing follows the SAME shown-actives set as the campaigns line', () => {
  // 7 actives, CAMPAIGN_ACTIVE_CAP is 5: the 6th and 7th are listed by neither.
  const campaigns = Array.from({ length: 7 }, (_, i) => campaign({ id: `k${i}`, title: `קמפיין ${i}` }));
  const tasks = campaigns.map((c, i) => task({ id: `t${i}`, title: `משימה-${i}`, campaignId: c.id }));
  const text = ctx(cloudData({ campaigns, tasks }));

  it('lists tasks for the first five actives only', () => {
    for (let i = 0; i < 5; i += 1) expect(text).toContain(`משימה-${i}`);
  });

  it('lists no task for a campaign the campaigns line never named', () => {
    expect(text).not.toContain('משימה-5');
    expect(text).not.toContain('משימה-6');
  });

  it('but still counts all seven as linked', () => {
    expect(text).toContain('7 מתוך 7 המשימות הפתוחות משויכות לקמפיין, 0 אינן משויכות');
  });
});

// ---- THE CROSS-LIFECYCLE GUARD -------------------------------------------

describe('T10 — campaigns PENDING: no names, no false "not linked"', () => {
  const data = cloudData({
    campaignsPending: true,
    tasks: [
      task({ id: 't1', title: 'משויכת', campaignId: 'a' }),
      task({ id: 't2', title: 'לא-משויכת' }),
    ],
  });
  const text = ctx(data);

  it('emits NO per-campaign listing', () => {
    expect(text).not.toContain(LISTING);
  });

  it('still states the linked/unlinked split — it is knowable from tasks alone', () => {
    expect(text).toContain('1 מתוך 2 המשימות הפתוחות משויכות לקמפיין, 1 אינן משויכות');
  });

  it('routes the linked one into the third bucket, not into "unlinked"', () => {
    expect(text).toContain(`מתוך המשויכות, 1 ${UNKNOWN_CLAUSE}`);
  });

  it('leaves the existing campaigns PENDING wording byte-identical', () => {
    expect(text).toContain('קמפיינים: עדיין אין לי את הנתונים — אל תסיק מכך מסקנה.');
  });
});

describe('T11 — campaigns ERROR: same guard, and the failure wording survives', () => {
  const data = cloudData({
    campaignsError: true,
    tasks: [task({ id: 't1', title: 'משויכת', campaignId: 'a' })],
  });
  const text = ctx(data);

  it('emits NO per-campaign listing', () => {
    expect(text).not.toContain(LISTING);
  });

  it('still states the split, and the linked task is not called unlinked', () => {
    expect(text).toContain('1 מתוך 1 המשימות הפתוחות משויכות לקמפיין, 0 אינן משויכות');
    expect(text).toContain(`מתוך המשויכות, 1 ${UNKNOWN_CLAUSE}`);
  });

  it('leaves the existing campaigns ERROR wording byte-identical', () => {
    expect(text).toContain('קמפיינים: אין לי גישה לקמפיינים כרגע ואין לי עליהם נתונים כלל.');
  });
});

describe('T12 — campaigns NOT CONNECTED (local/demo): same guard', () => {
  const text = ctx({
    clients: [], quotes: [], transactions: [], outreachLeads: [],
    projects: [], inventory: [], activity: [], charges: [], payments: [],
    businessProfile: null, meta: { source: 'local' },
    tasks: [task({ id: 't1', title: 'משויכת', campaignId: 'a' })],
  });

  it('emits no listing and leaves the not-connected wording byte-identical', () => {
    expect(text).not.toContain(LISTING);
    expect(text).toContain('קמפיינים: המודול אינו מחובר לחשבון הזה ואין לי עליו נתונים כלל.');
  });
});

describe('T12b — a TRUTHY NON-ARRAY campaigns value is still not hydrated', () => {
  // The discriminator between the two stacked guards: `undefined || []` is [],
  // but `{} || []` is `{}`. Both must reach the same no-listing outcome.
  const text = ctx(cloudData({
    campaigns: {},
    tasks: [task({ id: 't1', title: 'משויכת', campaignId: 'a' })],
  }));

  it('emits no listing and does not throw', () => {
    expect(text).not.toContain(LISTING);
  });

  it('still reports the linked task as linked, not unlinked', () => {
    expect(text).toContain('1 מתוך 1 המשימות הפתוחות משויכות לקמפיין, 0 אינן משויכות');
    expect(text).toContain(`מתוך המשויכות, 1 ${UNKNOWN_CLAUSE}`);
  });
});

describe('T13 — tasks absent or all done: the section is silent, never a fabricated zero', () => {
  it('says nothing when `tasks` is not hydrated', () => {
    const d = cloudData({ campaigns: [campaign({ id: 'a' })] });
    delete d.tasks;
    const text = ctx(d);
    expect(text).not.toContain(LISTING);
    expect(text).not.toContain(ROLLUP);
  });

  it('says nothing when every task is done', () => {
    const text = ctx(cloudData({
      campaigns: [campaign({ id: 'a' })],
      tasks: [task({ id: 't1', title: 'סגורה', status: 'done', campaignId: 'a' })],
    }));
    expect(text).not.toContain(LISTING);
    expect(text).not.toContain(ROLLUP);
  });

  it('says nothing when there are no tasks at all', () => {
    expect(ctx(cloudData({ campaigns: [campaign({ id: 'a' })] }))).not.toContain(ROLLUP);
  });
});

// ---- exclusions -----------------------------------------------------------

describe('T14 — LEAKAGE: only the title and counts reach the context', () => {
  const data = cloudData({
    campaigns: [campaign({ id: 'a', title: 'קמפיין קיץ' })],
    tasks: [task({ id: 't1', title: 'משימה-גלויה', campaignId: 'a' })],
  });
  const text = ctx(data);

  it('POSITIVE CONTROL — the one included field IS present', () => {
    expect(text).toContain('משימה-גלויה');
  });

  it.each([
    ['notes', 'notes_secret'],
    ['assignee', 'assignee_secret'],
    ['linkRef', 'link_secret'],
    ['projectId', 'pr_secret'],
    ['clientId', 'cl_secret'],
    ['id', 'tk_1'],
  ])('excludes %s', (_field, marker) => {
    expect(text).not.toContain(marker);
  });

  it('excludes priority and deadline', () => {
    // Emitted nowhere by this section; asserted against the campaign clause it
    // would most plausibly be appended to.
    const clause = text.slice(text.indexOf(LISTING), text.indexOf(LISTING) + 200);
    expect(clause).not.toContain('normal');
    expect(clause).not.toContain('2026-08-20');
  });
});

// ---- read-only ------------------------------------------------------------

describe('T15 — READ-ONLY: no Jake task or campaign write op was added', () => {
  const pack = read('../jakePack.js');
  const agent = read('../jakeAgent.js');

  it('jakePack does not import the creative-session vocabulary', () => {
    expect(pack).not.toMatch(/from\s+['"][^'"]*creative\/v2/);
  });

  it('jakeAgent has no campaign action handler', () => {
    expect(agent).not.toMatch(/create_campaign|update_campaign|delete_campaign|set_campaign_status/);
  });

  it('jakePack calls no api mutator', () => {
    expect(pack).not.toMatch(/updateTask|createTask|deleteTask|linkTaskCampaign/);
  });
});

// ---- budget ---------------------------------------------------------------

// The quota-ceiling proof used by the campaigns section is UNAVAILABLE here:
// `public.tasks` has no row quota and `title` has no length check. The
// substitute property is O(1) IN TASK COUNT, and it is measured, not asserted.
const heavy = (taskCount) => {
  const campaigns = Array.from({ length: 200 }, (_, i) =>
    campaign({ id: `k${i}`, title: 'ק'.repeat(120), status: 'active' }));
  const tasks = Array.from({ length: taskCount }, (_, i) => task({
    id: `t${i}`,
    title: 'מ'.repeat(400),
    campaignId: i % 3 === 0 ? `k${i % 200}` : null,
    status: i % 7 === 0 ? 'done' : 'new',
  }));
  return cloudData({
    campaigns,
    tasks,
    clients: Array.from({ length: 60 }, (_, i) => ({ id: `c${i}`, name: `לקוח ${i}`, status: 'active', value: 1000 })),
  });
};

describe('T16 — context budget against MAX_CONTEXT_CHARS', () => {
  const LIMIT = AI_GATEWAY_INPUT_LIMITS.MAX_CONTEXT_CHARS;

  // ⚠️ THE NAIVE FORM OF THIS TEST (80 vs 5,000 must be equal) IS WRONG, and it
  // failed on the first run for a reason worth keeping: at 80 tasks most of the
  // five shown campaigns have NO linked task and print the short "אין משימות
  // פתוחות", while at 5,000 every one of them is saturated with 3 titles. The
  // 1,005-char difference is the CAP FILLING UP, not growth with row count.
  // The real property is that growth STOPS once the caps are full, and that the
  // total is bounded by a product that contains no row count at all.
  it('O(1) IN TASK COUNT — past saturation, 5,000 and 50,000 tasks cost the same', () => {
    const a = ctx(heavy(5000)).length;
    const b = ctx(heavy(50000)).length;
    // Only the printed counts widen by a digit; no per-row string is added.
    expect(Math.abs(b - a)).toBeLessThanOrEqual(12);
  });

  it('the 80 → 5,000 growth is bounded by a product containing NO row count', () => {
    const grew = ctx(heavy(5000)).length - ctx(heavy(80)).length;
    // CAMPAIGN_ACTIVE_CAP (5) × (CAMPAIGN_LIMITS.title + TASKS_PER_CAMPAIGN_CAP
    // × TASK_TITLE_CHARS), plus separators. The campaign title term is real and
    // was missing from the first draft of this bound — it is server-bounded by
    // campaigns_title_bounded, so it is still a constant, but it is not zero.
    const BOUND = 5 * (CAMPAIGN_LIMITS.title + 3 * 60) + 300;
    expect(grew).toBeGreaterThan(0);
    expect(grew).toBeLessThan(BOUND);
  });

  it('the capped worst case stays under the limit the Gateway REJECTS at', () => {
    expect(LIMIT).toBe(12000);
    expect(ctx(heavy(5000)).length).toBeLessThan(LIMIT);
  });

  it('THE SLICE IS LOAD-BEARING — uncapped, the same account would be rejected', () => {
    // Control: what this section would cost with neither cap nor title slice.
    const d = heavy(5000);
    const uncapped = d.tasks
      .filter((t) => t.status !== 'done' && t.campaignId)
      .map((t) => t.title).join('; ').length;
    expect(uncapped).toBeGreaterThan(LIMIT);
  });
});

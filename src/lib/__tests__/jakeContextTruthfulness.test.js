// ===================================================================
// Jake Context Truthfulness — the context Jake is given must never assert a
// fact about a module the store did not load.
//
// THE DEFECT THIS FILE PINS. In authenticated cloud mode `refetch()` does
// `setData(await api.fetchAll())` — a whole-object REPLACEMENT — and fetchAll
// returns no `projects` / `inventory` / `activity` key at all. Every consumer
// then wrote `data.projects || []`, which turns "never loaded" into "confirmed
// empty". Jake was handed "פרויקטים פעילים: אין" and "מלאי: ריק" and reported
// them to the signed-in user as facts about their business.
//
// The discriminator asserted throughout is STRUCTURAL — `Array.isArray` on the
// collection — not a mode flag. Local/demo genuinely carries empty arrays and
// its honest "ריק / אין" wording must survive byte-for-byte.
//
// These tests EXECUTE the shipped builders (artValuePack.buildContext /
// .briefing and the exported answerFromData) rather than pinning source text.
// No network, no model, no Gateway, no clock dependence beyond the injected
// dates below.
// ===================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { artValuePack } from '../jakePack.js';
import { overdueCharges, cancelledChargeReceived, receivablesTotals } from '../receivables.js';
import { answerFromData } from '../../components/ai/Assistant.jsx';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const ctx = (d) => artValuePack.buildContext(d);
const brief = (d) => artValuePack.briefing(d);

// ---- fixtures ------------------------------------------------------------

// EXACTLY the shape api.fetchAll() returns: no projects, no inventory, no
// activity key. This is what Jake actually receives for a signed-in account.
function cloudData(extra = {}) {
  return {
    clients: [], quotes: [], transactions: [], outreachLeads: [], tasks: [],
    businessProfile: null, charges: [], payments: [],
    meta: { source: 'supabase' },
    ...extra,
  };
}

// The local/demo store shape: every collection present, some of them empty.
function localData(extra = {}) {
  return {
    clients: [], quotes: [], transactions: [], outreachLeads: [], tasks: [],
    projects: [], inventory: [], activity: [],
    businessProfile: null, charges: [], payments: [],
    meta: {},
    ...extra,
  };
}

// A date far enough in the past that it is overdue under any real clock, and
// one far enough ahead that it is not.
const PAST_DUE = '2020-01-31';
const FUTURE_DUE = '2999-12-31';

const charge = (over = {}) => ({
  id: 'c1', userId: 'u1', clientId: null, quoteId: null,
  kind: 'final', paymentTerms: 'net30',
  serviceDate: '2020-01-01', dueDate: PAST_DUE, dueDateSource: 'computed',
  amountTotal: 1000, description: null, invoiceUrl: null,
  lifecycle: 'open', createdAt: null, updatedAt: null,
  ...over,
});
const payment = (over = {}) => ({
  id: 'p1', userId: 'u1', chargeId: 'c1', amount: 400, paidAt: '2020-02-01',
  createdAt: null, updatedAt: null, ...over,
});

// ===================================================================
// 1) PHANTOM-EMPTY CLAIMS — these fail on the pre-slice code
// ===================================================================
describe('phantom-empty containment · unhydrated domains are never reported as empty', () => {
  const out = ctx(cloudData());

  it('does NOT claim the inventory is empty when inventory was never loaded', () => {
    expect(out.includes('מלאי: ריק')).toBe(false);
    expect(out.includes('אין פריטים עדיין')).toBe(false);
  });

  it('does NOT claim there are no projects when projects were never loaded', () => {
    expect(out.includes('פרויקטים פעילים: אין')).toBe(false);
  });

  it('states inventory + projects as NOT CONNECTED, naming each domain', () => {
    expect(out).toContain('מלאי: המודול אינו מחובר לחשבון הזה');
    expect(out).toContain('פרויקטים: המודול אינו מחובר לחשבון הזה');
  });

  it('forbids Jake from reporting a zero for an unconnected module', () => {
    // The instruction must be explicit, not implied by omission.
    expect(out).toContain('אל תדווח על אפס');
    expect(out).toContain('אמור בכנות שאין לך גישה לנתון הזה');
  });

  it('states the activity log is unavailable rather than letting it read as "nothing changed"', () => {
    // The grounding rules TELL Jake to answer history questions from this log,
    // so silence would have been read as an empty history.
    expect(out).toContain('יומן פעילות: אינו זמין בחשבון הזה');
    expect(out).toContain('אל תסיק שדבר לא השתנה');
  });

  it('every unconnected domain appears exactly once', () => {
    const hits = (s) => out.split(s).length - 1;
    expect(hits('מלאי: המודול אינו מחובר')).toBe(1);
    expect(hits('פרויקטים: המודול אינו מחובר')).toBe(1);
    expect(hits('יומן פעילות: אינו זמין')).toBe(1);
  });
});

// ===================================================================
// 2) HONEST EMPTINESS IS PRESERVED — local/demo must not regress
// ===================================================================
describe('honest emptiness · a real empty array still reads as empty', () => {
  const out = ctx(localData());

  it('keeps the exact legacy inventory wording for a genuinely empty inventory', () => {
    expect(out).toContain('מלאי: ריק (אין פריטים עדיין).');
  });

  it('keeps the exact legacy projects wording for a genuinely empty project list', () => {
    expect(out).toContain('פרויקטים פעילים: אין.');
  });

  it('emits NO not-connected wording for the collections local/demo DOES have', () => {
    // ⚠️ SCOPED, NOT WEAKENED. This assertion was written when every collection
    // in localData() was genuinely present, so ANY not-connected line meant a
    // regression. Campaigns broke that premise honestly: the campaigns module
    // is CLOUD-ONLY — Campaigns.jsx returns an unavailable state in local/demo,
    // pinned by campaignsContainment.test.js — so in local mode Jake genuinely
    // cannot see it, and saying so is the correct behaviour, not a regression.
    // The three original subjects are still asserted individually and exactly.
    expect(out.includes('מלאי: המודול אינו מחובר')).toBe(false);
    expect(out.includes('פרויקטים: המודול אינו מחובר')).toBe(false);
    expect(out.includes('יומן פעילות: אינו זמין')).toBe(false);
    // The permitted not-connected lines in local mode, named explicitly so a
    // future stray one cannot hide behind this exception. ASSETS joined
    // campaigns for the same reason and on the same evidence: the asset library
    // is CLOUD-ONLY — api.fetchAll() never returns it and there is no local
    // gallery — so in local mode Jake genuinely cannot see it.
    const notConnected = out.split('\n').filter((l) => l.includes('אינו מחובר לחשבון הזה'));
    expect(notConnected).toHaveLength(2);
    expect(notConnected.filter((l) => l.includes('קמפיינים'))).toHaveLength(1);
    expect(notConnected.filter((l) => l.includes('נכסים'))).toHaveLength(1);
  });

  it('an empty (but present) activity log stays silent, exactly as before', () => {
    expect(out.includes('יומן פעילות')).toBe(false);
  });
});

// ===================================================================
// 3) HYDRATED NON-EMPTY DOMAINS ARE UNCHANGED
// ===================================================================
describe('hydrated domains · populated collections render exactly as before', () => {
  const out = ctx(localData({
    inventory: [{ id: 'i1', name: 'מסגרת', qty: 3, unit: 'יח׳', unitPrice: 120, lowThreshold: 1 }],
    projects: [{ id: 'pr1', name: 'אתר תדמית', clientName: 'דני', status: 'active', nextAction: 'אפיון' }],
    activity: [{ ts: '2026-08-01T10:00:00.000Z', summary: 'שווי דני: 2,500 ₪ → 3,500 ₪' }],
  }));

  it('renders the real inventory totals and item list', () => {
    expect(out).toContain('מלאי: 1 פריטים');
    expect(out).toContain('פריטי המלאי (שם: כמות): מסגרת: 3 יח׳ (₪120).');
  });

  it('renders the real active project with its next action', () => {
    expect(out).toContain('פרויקטים פעילים: אתר תדמית (דני, הפעולה הבאה: אפיון).');
  });

  it('renders the real activity log with its grounding instruction', () => {
    expect(out).toContain('יומן פעילות (היסטוריה אמיתית');
    expect(out).toContain('שווי דני: 2,500 ₪ → 3,500 ₪');
  });
});

// ===================================================================
// 4) RECEIVABLES ARE INCLUDED WHEN CHARGES EXIST
// ===================================================================
describe('receivables · included when the account actually holds charges', () => {
  it('reports expected / received / open from the real charges + payments', () => {
    const out = ctx(cloudData({
      charges: [charge({ amountTotal: 1000, dueDate: FUTURE_DUE })],
      payments: [payment({ amount: 400 })],
    }));
    expect(out).toContain('חיובים וגבייה');
    expect(out).toContain('1 חיובים פעילים');
    expect(out).toContain('נדרש');
    expect(out).toContain('התקבל');
    expect(out).toContain('יתרה פתוחה');
    // ₪600 open = 1000 − 400, on the numeric(14,2) grid.
    expect(receivablesTotals([charge({ amountTotal: 1000 })], [payment({ amount: 400 })]).open).toBe(600);
  });

  it('names itself the SINGLE source of truth for money owed, and forbids the client-value estimate', () => {
    const out = ctx(cloudData({ charges: [charge()], payments: [] }));
    expect(out).toContain('מקור האמת היחיד ל"כמה כסף מגיע לי"');
    expect(out).toContain('אל תחשב חוב משווי הלקוחות');
  });

  it('emits NOTHING at all when the account holds no charges — never a "₪0 owed" line', () => {
    const out = ctx(cloudData());
    expect(out.includes('חיובים וגבייה')).toBe(false);
    expect(out.includes('יתרה פתוחה')).toBe(false);
    expect(out.includes('חיובים באיחור')).toBe(false);
  });

  it('local/demo — where receivables cannot exist — emits no receivables line', () => {
    expect(ctx(localData()).includes('חיובים וגבייה')).toBe(false);
  });
});

// ===================================================================
// 5) OVERDUE DERIVATION
// ===================================================================
describe('receivables · overdue is derived, and only from what is genuinely late', () => {
  it('a past-due open charge with a balance IS overdue', () => {
    const out = ctx(cloudData({ charges: [charge({ dueDate: PAST_DUE })], payments: [] }));
    expect(out).toContain('חיובים באיחור: 1');
    expect(out).toContain('תאריך הפירעון עבר והיתרה עדיין פתוחה');
  });

  it('a future-due charge is NOT overdue', () => {
    const out = ctx(cloudData({ charges: [charge({ dueDate: FUTURE_DUE })], payments: [] }));
    expect(out.includes('חיובים באיחור')).toBe(false);
  });

  it('a past-due charge paid in FULL is not overdue — settled is not late', () => {
    const out = ctx(cloudData({
      charges: [charge({ amountTotal: 1000, dueDate: PAST_DUE })],
      payments: [payment({ amount: 1000 })],
    }));
    expect(out.includes('חיובים באיחור')).toBe(false);
  });

  it('a charge with NO due date is never overdue — an unknown date is not a late one', () => {
    expect(overdueCharges([charge({ dueDate: null })], [], '2026-08-03')).toEqual([]);
  });

  it('a CANCELLED past-due charge is not overdue and not counted as owed', () => {
    const out = ctx(cloudData({
      charges: [charge({ lifecycle: 'cancelled', dueDate: PAST_DUE })], payments: [],
    }));
    expect(out.includes('חיובים באיחור')).toBe(false);
    expect(out).toContain('0 חיובים פעילים');
  });

  it('overdueCharges refuses to guess when `today` is absent or malformed', () => {
    const cs = [charge({ dueDate: PAST_DUE })];
    expect(overdueCharges(cs, [], undefined)).toEqual([]);
    expect(overdueCharges(cs, [], 'not-a-date')).toEqual([]);
    expect(overdueCharges(cs, [], '')).toEqual([]);
    // …and IS decisive when it is given one (the negative control's control).
    expect(overdueCharges(cs, [], '2026-08-03')).toHaveLength(1);
  });

  it('decorates each overdue charge with its own received + balance', () => {
    const [only] = overdueCharges(
      [charge({ amountTotal: 1000, dueDate: PAST_DUE })], [payment({ amount: 250 })], '2026-08-03',
    );
    expect(only.received).toBe(250);
    expect(only.balance).toBe(750);
  });
});

// ===================================================================
// 6) THE CANCELLED-CHARGE ACCOUNTING RULE
// ===================================================================
describe('receivables · cancelling a claim does not un-receive money', () => {
  const data = cloudData({
    charges: [charge({ id: 'c1', lifecycle: 'cancelled' }), charge({ id: 'c2', dueDate: FUTURE_DUE })],
    payments: [payment({ id: 'p1', chargeId: 'c1', amount: 300 })],
  });

  it('states the rule WITH the number when a cancelled charge holds payments', () => {
    const out = ctx(data);
    expect(out).toContain('כלל חשבונאי');
    expect(out).toContain('התקבלו על חיובים שבוטלו');
    expect(out).toContain('ביטול חיוב אינו מבטל כסף שכבר התקבל');
  });

  it('keeps that money OUT of the open balance', () => {
    expect(receivablesTotals(data.charges, data.payments).received).toBe(0);
    expect(cancelledChargeReceived(data.charges, data.payments)).toBe(300);
  });

  it('says nothing about the rule when no cancelled charge holds a payment', () => {
    const out = ctx(cloudData({ charges: [charge({ dueDate: FUTURE_DUE })], payments: [] }));
    expect(out.includes('כלל חשבונאי')).toBe(false);
  });
});

// ===================================================================
// 7) OVERPAYMENT
// ===================================================================
describe('receivables · an overpayment is surfaced, never netted against another charge', () => {
  it('reports the surplus separately and never a negative balance', () => {
    const out = ctx(cloudData({
      charges: [charge({ amountTotal: 1000, dueDate: FUTURE_DUE })],
      payments: [payment({ amount: 1200 })],
    }));
    expect(out).toContain('תשלום ביתר');
    expect(out).toContain('יתרה פתוחה לעולם אינה שלילית');
    expect(out.includes('-₪')).toBe(false);
  });

  it('says nothing about overpayment in the ordinary case', () => {
    const out = ctx(cloudData({
      charges: [charge({ dueDate: FUTURE_DUE })], payments: [payment({ amount: 400 })],
    }));
    expect(out.includes('תשלום ביתר')).toBe(false);
  });
});

// ===================================================================
// 8) BRIEFING
// ===================================================================
describe('briefing · receivables reach the daily brief without displacing anything', () => {
  it('an overdue charge lands in the URGENT section', () => {
    const b = brief(cloudData({ charges: [charge({ dueDate: PAST_DUE })], payments: [] }));
    expect(b).toContain('דחוף:');
    expect(b).toContain('בחיובים באיחור');
    expect(b).toContain('1 חיובים שתאריך הפירעון שלהם עבר');
  });

  it('a not-yet-due open balance lands in the FOLLOW-UP section, not urgent', () => {
    const b = brief(cloudData({ charges: [charge({ dueDate: FUTURE_DUE })], payments: [] }));
    expect(b).toContain('למעקב:');
    expect(b).toContain('יתרה פתוחה בחיובים (טרם הגיע מועד הפירעון)');
    expect(b.includes('דחוף:')).toBe(false);
  });

  it('the same money is never announced twice — overdue suppresses the open-balance line', () => {
    const b = brief(cloudData({ charges: [charge({ dueDate: PAST_DUE })], payments: [] }));
    expect(b.includes('טרם הגיע מועד הפירעון')).toBe(false);
  });

  it('the client-derived "ממתין לתשלום" line is PRESERVED and kept distinct from charges', () => {
    const b = brief(cloudData({
      clients: [{ id: 'cl1', name: 'דני', status: 'await_payment', value: 5000 }],
      charges: [charge({ dueDate: PAST_DUE })], payments: [],
    }));
    // Both facts present, labelled differently — never merged into one number.
    expect(b).toContain('ממתין לתשלום מ-1 לקוחות');
    expect(b).toContain('בחיובים באיחור');
  });

  it('an account with no charges keeps the original calm briefing exactly', () => {
    const b = brief(cloudData());
    expect(b).toContain('☀️ סיכום היום');
    expect(b).toContain('הכל רגוע');
    expect(b.includes('חיובים')).toBe(false);
  });
});

// ===================================================================
// 9) PRESERVED BEHAVIOUR — the domains this slice must not touch
// ===================================================================
describe('preserved · clients / tasks / leads / quotes / monthly transactions are unchanged', () => {
  const data = cloudData({
    clients: [
      { id: 'c1', name: 'דני כהן', status: 'lead', value: 3000, nextAction: 'להתקשר' },
      { id: 'c2', name: 'רונית', status: 'active', value: 8000 },
    ],
    tasks: [{ id: 't1', title: 'לשלוח הצעה', status: 'todo' }],
    outreachLeads: [{ id: 'l1', name: 'יקב', status: 'pending' }],
    quotes: [{ id: 'q1', number: 'AV-1', status: 'sent', items: [] }],
    transactions: [{ id: 'x1', type: 'income', amount: 2000, date: new Date().toISOString().slice(0, 10) }],
  });
  const out = ctx(data);

  it('client counts, the name roster and the per-client details survive', () => {
    expect(out).toContain('לקוחות ב-CRM: 2 סה״כ (1 לידים, 1 פעילים).');
    expect(out).toContain('רשימת שמות הלקוחות: דני כהן; רונית.');
    expect(out).toContain('הבא: להתקשר');
  });

  it('the lead-research, tasks and pending-quotes lines survive', () => {
    expect(out).toContain('מחקר לידים (עמוד הפניות): 1 לידים סה״כ');
    expect(out).toContain('משימות: 1 פתוחות');
    expect(out).toContain('הצעות מחיר ממתינות: 1.');
  });

  it('the monthly transaction figures survive and are NOT replaced by receivables', () => {
    expect(out).toContain('החודש: הכנסות');
    expect(out).toContain('רווח');
  });

  it('every line is still a single "- " bullet block', () => {
    for (const line of out.split('\n')) expect(line.startsWith('- ')).toBe(true);
  });
});

// ===================================================================
// 10) answerFromData — the SAME phantom, reached by a different path
// ===================================================================
describe('answerFromData · the deterministic shortcut must not invent an empty inventory', () => {
  it('declines the inventory-value question when inventory was never loaded', () => {
    expect(answerFromData('מה ערך המלאי?', cloudData())).toBe(null);
  });

  it('declines the item-count question when inventory was never loaded', () => {
    expect(answerFromData('כמה פריטים במלאי?', cloudData())).toBe(null);
  });

  it('still answers honestly for a genuinely EMPTY (present) inventory', () => {
    expect(answerFromData('מה ערך המלאי?', localData())).toBe('המלאי ריק כרגע — אין פריטים, אז הערך הוא ₪0.');
    expect(answerFromData('כמה פריטים במלאי?', localData())).toBe('אין פריטים במלאי עדיין.');
  });

  it('still answers with real figures for a populated inventory', () => {
    const d = localData({ inventory: [{ id: 'i1', name: 'מסגרת', qty: 2, unitPrice: 100 }] });
    expect(answerFromData('מה ערך המלאי?', d)).toContain('ערך המלאי הכולל הוא');
    expect(answerFromData('כמה פריטים במלאי?', d)).toContain('יש 1 פריטים במלאי');
  });

  it('the client-count answer is untouched by this slice', () => {
    expect(answerFromData('כמה לקוחות יש?', cloudData({ clients: [{ id: 'a', name: 'א' }] }))).toBe('יש 1 לקוחות ב-CRM.');
    expect(answerFromData('כמה לקוחות יש?', cloudData())).toBe('אין לקוחות עדיין.');
  });
});

// ===================================================================
// 11) SCOPE GUARDS — what this slice must NOT have introduced
// ===================================================================
describe('scope · no new lane, no gateway wiring, no clock in the pure layer', () => {
  const pack = read('../jakePack.js');
  const receivablesSrc = read('../receivables.js');

  it('jakePack.js still references no gateway, no profile and no model call', () => {
    // The repo-wide frozen-file guard (aiGatewayContract.test.js) already pins
    // the first two; repeated here so THIS slice owns its own scope proof.
    for (const banned of ['aiGateway', 'actionProfiles', 'generativelanguage']) {
      expect(pack.includes(banned), banned).toBe(false);
    }
    // A real network call, not the words `refetch(` / `fetchAll` that appear in
    // the comments explaining WHY the hydration rule exists. (`draftWithJake`
    // is likewise only NAMED, in the pre-existing draftingGuide comment.)
    expect(/(?<![A-Za-z])fetch\s*\(/.test(pack)).toBe(false);
    // The import list is the real containment: pure local modules only. This
    // slice added the receivables boundary; the Jake Calendar slice added
    // `./schedule.js`, the equally pure, clock-free Schedule Core boundary.
    // Widening this list is a deliberate, reviewable act — that is the point of
    // asserting it exactly rather than as a subset.
    const imports = [...pack.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]).sort();
    expect(imports).toEqual([
      // './campaigns.js' — added by the Jake Campaigns slice for
      // CAMPAIGN_STATUS_LABELS only. It is a PURE module (no store, no network,
      // no React, no clock), so the property this allowlist protects is intact.
      // './assetLibrary.js' — added by the Jake Asset Library Context slice for
      // `campaignLabelForAsset` + `ASSET_SOURCE_UPLOAD` only. It imports NOTHING
      // (zero import statements) and contains no clock, so the property this
      // allowlist protects is intact. Nothing storage-side is pulled in: no
      // bucket name, no storage path builder, no upload validator is used here.
      './assetLibrary.js',
      './calc.js', './campaigns.js', './format.js', './jakeAgent.js', './receivables.js', './schedule.js',
    ]);
  });

  it('receivables.js stays CLOCK-FREE — `today` is injected, never read', () => {
    expect(receivablesSrc.includes('Date.now(')).toBe(false);
    expect(receivablesSrc.includes('new Date()')).toBe(false);
  });

  it('the clock lives in jakePack and is LOCAL, not UTC — a UTC date reports yesterday all evening in Israel', () => {
    expect(pack).toContain('function localIsoDate');
    // The trap this replaced, spelled out so it cannot quietly come back.
    expect(pack.includes("toISOString().slice(0, 10)")).toBe(false);
  });

  it('no new Jake action op was introduced by this slice', () => {
    expect(pack.includes('ACTION_HANDLERS,')).toBe(true); // still the same imported registry
    expect(pack.includes('add_charge')).toBe(false);
    expect(pack.includes('add_payment')).toBe(false);
  });

  it('the hydration discriminator is structural, not a mode flag', () => {
    expect(pack).toContain('const isHydrated = (v) => Array.isArray(v);');
    expect(pack.includes('isSupabaseConfigured')).toBe(false);
  });
});

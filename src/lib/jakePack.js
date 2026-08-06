// ===================================================================
// Jake "Business Pack" — everything that makes ג׳יק specific to ONE business.
//
// The ENGINE is generic and unchanged: the chat loop + agent loop (Assistant.jsx),
// the memory/audit log (store), and the action executor (jakeAgent.js). To retarget
// Jake to a NEW business (a charity fund, a clinic, a law office...), you COPY this
// file, change the persona / domain-rules / entity language and the action set, and
// point `activePack` at it. Build the engine once — configure per business.
// ===================================================================
import { ACTIONS_GUIDE, ACTION_HANDLERS, BUSINESS_ENTITIES } from './jakeAgent.js';
import { dashboardKpis, inventoryTotals, quoteTotal } from './calc.js';
import { formatCurrency } from './format.js';
import {
  receivablesTotals, overdueCharges, cancelledChargeReceived, roundMoney,
} from './receivables.js';
import {
  listToday, listWeek, formatTimeRange, APPOINTMENT_KIND_LABELS,
} from './schedule.js';
import { CAMPAIGN_STATUS_LABELS } from './campaigns.js';
// METADATA HELPER ONLY. `campaignLabelForAsset` is a pure resolver that already
// returns the three states this file needs (none / named / unknown). Nothing
// else from assetLibrary.js is imported, and in particular nothing that touches
// storage paths, signed URLs or upload validation.
import { campaignLabelForAsset, ASSET_SOURCE_UPLOAD } from './assetLibrary.js';

// ===================================================================
// HYDRATION TRUTHFULNESS — absence is not emptiness.
//
// In authenticated cloud mode `refetch()` REPLACES the whole store with what
// api.fetchAll() returns, and fetchAll returns no `projects` / `inventory` /
// `activity` key at all (those modules are not durable in the cloud). The old
// `data.projects || []` therefore turned "never loaded" into "confirmed
// empty", and Jake reported the emptiness to the user as a fact about their
// business — "אין פרויקטים", "המלאי ריק". That is the false-success class S0A
// exists to prevent, pointed the other way: not a fake save, a fake FACT.
//
// The discriminator is STRUCTURAL, not a mode flag: the collection either is
// an array in the store or it is not there. Local/demo carries real arrays
// (possibly empty) and its honest "ריק / אין" wording is preserved byte-for-
// byte; cloud carries nothing and is told so.
// ===================================================================
const isHydrated = (v) => Array.isArray(v);

// One wording for every unhydrated domain, so Jake cannot report a zero for a
// module he simply cannot see.
function notConnectedLine(label) {
  return `${label}: המודול אינו מחובר לחשבון הזה ואין לי עליו נתונים כלל. `
    + `אל תאמר שאין ${label}, אל תדווח על אפס ואל תסיק מכך מסקנה — אמור בכנות שאין לך גישה לנתון הזה.`;
}

// THE THIRD ABSENCE. A seam collection is unhydrated for THREE reasons, not
// two: the cloud read failed, the module does not exist here at all, or THE
// READ HAS NOT COME BACK YET. The third used to fall through to
// notConnectedLine(), so for the ≤4s between a cloud panel open and the seam
// read settling Jake was told "המודול אינו מחובר לחשבון הזה" about campaigns
// and assets — FALSE, since both are durable, live and owned by the account.
//
// Kept beside notConnectedLine() on purpose: they are the two halves of one
// decision and must not drift apart.
//
// ⚠️ NOT applied to the calendar, and that is a measured decision rather than
// an omission. calendarLines() deliberately does NOT use notConnectedLine() —
// its unhydrated wording is "אין לי גישה ליומן כרגע", which asserts no
// disconnection and no zero and stays true during the window. There is no
// falsehood there to fix.
function pendingLine(label, subject) {
  return `${label}: עדיין אין לי את הנתונים — אל תסיק מכך מסקנה. `
    + `אל תאמר שאין ${subject} ואל תדווח על אפס; אמור בכנות שהנתונים עדיין נטענים.`;
}

// Today as a LOCAL calendar date (YYYY-MM-DD). Deliberately not
// toISOString().slice(0,10): that is UTC, so every evening in Israel (UTC+2/+3)
// it reports yesterday and a charge would read as overdue a day late. The pure
// receivables module is clock-free by contract, so the clock lives here.
function localIsoDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ===================================================================
// F1 Core Receivables → Jake. `charges` + `payments` are ALREADY hydrated by
// fetchAll and were, until now, the only durable money data Jake could not
// see: he answered "how much am I owed" from client status + client value,
// which is an estimate of work done, not a claim that was ever issued.
//
// Emitted ONLY when the account actually holds charges. Silence is the
// truthful state both for local/demo (receivables are cloud-only — the store
// refuses the dispatch outright, so a charge can never exist there) and for a
// cloud account that has not used Finance yet. A "₪0 owed" line would be the
// same phantom fact this slice removes everywhere else.
// ===================================================================
function receivablesLines(data, today) {
  const charges = isHydrated(data.charges) ? data.charges : [];
  const payments = isHydrated(data.payments) ? data.payments : [];
  if (!charges.length) return [];

  const t = receivablesTotals(charges, payments);
  const openCount = charges.filter((c) => c && c.lifecycle === 'open').length;
  const overdue = overdueCharges(charges, payments, today);
  const overdueSum = roundMoney(overdue.reduce((s, c) => s + c.balance, 0));
  const cancelledReceived = cancelledChargeReceived(charges, payments);

  const lines = [
    `חיובים וגבייה (מודול הגבייה — זהו מקור האמת היחיד ל"כמה כסף מגיע לי". `
    + `אל תחשב חוב משווי הלקוחות): ${openCount} חיובים פעילים — `
    + `נדרש ${formatCurrency(t.expected)}, התקבל ${formatCurrency(t.received)}, `
    + `יתרה פתוחה ${formatCurrency(t.open)}.`,
  ];
  if (overdue.length) {
    lines.push(`חיובים באיחור: ${overdue.length} בסך ${formatCurrency(overdueSum)} — `
      + 'תאריך הפירעון עבר והיתרה עדיין פתוחה.');
  }
  if (t.overpaid > 0) {
    lines.push(`תשלום ביתר: ${formatCurrency(t.overpaid)} התקבלו מעבר לנדרש. `
      + 'יתרה פתוחה לעולם אינה שלילית, ולכן העודף מוצג בנפרד ולא מקזז חוב של חיוב אחר.');
  }
  if (cancelledReceived > 0) {
    lines.push(`כלל חשבונאי: ${formatCurrency(cancelledReceived)} התקבלו על חיובים שבוטלו. `
      + 'ביטול חיוב אינו מבטל כסף שכבר התקבל — הסכום הזה אינו נכלל ביתרה הפתוחה, אך הכסף אכן התקבל.');
  }
  return lines;
}

// ===================================================================
// Schedule Core → Jake. `public.appointments` is durable, live and CLOUD-ONLY,
// and was invisible to Jake: api.fetchAll() hydrates nine collections and
// appointments is not one of them (there is no reducer for it either — the
// Schedule page owns its own state and re-reads from the server after every
// write). So Jake answered "מה יש לי היום" — a string isBriefingRequest already
// matches — from tasks, quotes and charges, and silently omitted the calendar.
//
// The rows arrive through the JAKE SEAM (Assistant.jsx reads listAppointments()
// once per panel open), NOT through the store: fetchAll's whole-object
// replacement has now produced two shipped defects, and appointments have no
// local reducer, no seed and no localStorage fallback to classify.
//
// SAME STRUCTURAL DISCRIMINATOR AS EVERY OTHER COLLECTION, and note the
// INVERSION it absorbs without a mode flag: for projects/inventory the LOCAL
// mode carries the real (possibly empty) array and cloud carries nothing; for
// appointments it is exactly reversed. `Array.isArray` is right in both.
//
// THE CAP IS A BUDGET GUARD, NOT COSMETIC. This text ships inside the existing
// `context.summary` of the chat and drafting lanes (the action ids are named
// only in gemini.js, and a repo guard enforces that), which the Gateway
// validates against MAX_CONTEXT_CHARS = 12000 and REJECTS over-limit rather
// than truncating — an uncapped list on a busy day would not degrade Jake, it
// would stop him. Measured: a heavy account is ~4.1k on the wire; five
// appointments add ~0.6k.
//
// NO CLOCK HERE EITHER — `now` is injected, exactly like `today` for
// receivables, and schedule.js is clock-free by contract.
// ===================================================================
const CALENDAR_TODAY_CAP = 5;

function calendarLines(data, now) {
  // Not hydrated = a failed cloud read OR local/demo, where the module does not
  // exist at all. The wording is truthful for BOTH without asserting which,
  // which is why it does not reuse notConnectedLine() — that helper states
  // "המודול אינו מחובר לחשבון הזה", false for a transient read failure.
  if (!isHydrated(data.appointments)) {
    return ['יומן: אין לי גישה ליומן כרגע ואין לי עליו נתונים כלל. '
      + 'אל תאמר שאין פגישות, אל תדווח על אפס ואל תסיק מכך מסקנה — אמור בכנות שאין לך גישה ליומן.'];
  }

  // listToday/listWeek drop cancelled / completed / no_show by default: an
  // agenda answers "what is still expected of me". The history is not deleted,
  // it is simply not the agenda. Inherited, never redefined here.
  const today = listToday(data.appointments, now);
  const week = listWeek(data.appointments, now);
  const lines = [];

  if (today.length) {
    const shown = today.slice(0, CALENDAR_TODAY_CAP);
    const hidden = today.length - shown.length;
    const items = shown.map((a) => {
      const range = formatTimeRange(a.startAt, a.endAt);
      const kind = APPOINTMENT_KIND_LABELS[a.kind] || a.kind;
      return `${range} ${a.title} (${kind})`;
    }).join('; ');
    lines.push(`יומן (מודול היומן — זהו מקור האמת היחיד ל"מה יש לי היום"): `
      + `${today.length} רשומות היום — ${items}.`
      + (hidden > 0 ? ` ועוד ${hidden} שאינן מפורטות כאן.` : ''));
  } else {
    lines.push('יומן: אין רשומות מתוכננות להיום.');
  }

  // The week INCLUDES today, so this is a superset count, not an additional
  // one. Omitted entirely at zero — there is no useful "0 מתוכננות" to state
  // once the today line has already been truthful.
  if (week.length) lines.push(`בשבעת הימים הקרובים: ${week.length} רשומות מתוכננות.`);
  return lines;
}

// ===================================================================
// Campaigns → Jake. `public.campaigns` is durable, live and CLOUD-ONLY, and was
// invisible to Jake in a way that was WORSE than the calendar's: projects and
// inventory at least get notConnectedLine(), so Jake is told he cannot see
// them. Campaigns had NO data and NO declaration of absence — nothing in this
// file mentioned them at all, so an ungrounded answer was the only thing
// available for "מה קורה עם הקמפיינים שלי".
//
// The rows arrive through the JAKE SEAM (Assistant.jsx reads listCampaigns()
// once per panel open), NOT through the store: campaigns are page-owned exactly
// like appointments (Campaigns.jsx holds its own state and re-reads from the
// server after every write), with no reducer, no seed and no localStorage
// fallback — a test already forbids all three storage APIs there.
//
// NAMING BOUNDARY, STATED IN THE COPY ITSELF. A campaign here is the durable
// per-account BUSINESS object (public.campaigns), NOT the device-local creative
// session in src/creative/v2/campaignStore.js. Jake is told so in the line, so
// the two vocabularies cannot merge in his answer either. This file must never
// import from src/creative/v2/**.
//
// THE CAP IS A BUDGET GUARD, NOT COSMETIC — and unlike the calendar's, its
// worst case is reachable by design: the account quota is 200 campaigns. This
// text ships inside the existing `context.summary`, which the Gateway validates
// against MAX_CONTEXT_CHARS = 12000 and REJECTS over-limit rather than
// truncating. MEASURED against a heavy account: baseline 4,945 chars; capped
// worst case (200 campaigns, all active, 120-char titles) 5,905 chars. UNCAPPED
// the same account is 25,253 chars — 2.1x the limit — and with objective bodies
// 65,853, or 5.5x. An uncapped list would not degrade Jake, it would STOP him.
// That is why objective bodies are excluded and only actives are listed.
//
// NO CLOCK — status is the whole selector, so unlike the calendar this needs no
// `now` injected.
// ===================================================================
const CAMPAIGN_ACTIVE_CAP = 5;

// THE SHOWN ACTIVES, in ONE place. campaignLines() lists them and
// campaignTaskLines() groups tasks under exactly the same set; two copies of
// `filter(active).slice(CAP)` would be a fork waiting to drift, and a drifted
// copy would attach task names to campaigns Jake was never told about.
function shownActiveCampaigns(all) {
  return (Array.isArray(all) ? all : [])
    .filter((c) => c && c.status === 'active')
    .slice(0, CAMPAIGN_ACTIVE_CAP);
}

function campaignLines(data) {
  if (!isHydrated(data.campaigns)) {
    // TWO different absences, and collapsing them would make one of them a lie.
    // A failed/timed-out CLOUD read is transient; local/demo genuinely has no
    // campaigns module (Campaigns.jsx returns an unavailable state there,
    // pinned by campaignsContainment.test.js), so notConnectedLine IS accurate
    // there — the opposite of the calendar, which cannot reuse it.
    if (data.campaignsError) {
      return ['קמפיינים: אין לי גישה לקמפיינים כרגע ואין לי עליהם נתונים כלל. '
        + 'אל תאמר שאין קמפיינים, אל תדווח על אפס ואל תסיק מכך מסקנה — '
        + 'אמור בכנות שלא הצלחת לטעון את הקמפיינים.'];
    }
    // THE THIRD ABSENCE — checked AFTER the error branch, never before. The two
    // are mutually exclusive by construction (pending is only true before a
    // read settles, error only after), but the order is fixed anyway so a
    // caller that ever sets both gets the FAILURE wording: a read that is known
    // to have failed must never be softened into "still loading".
    //
    // ⚠️ DEFAULTS TO FALSY, AND THAT IS LOAD-BEARING. Absent key = not pending
    // = today's wording, so every existing caller and fixture is unchanged and
    // an unknown consumer fails toward the pre-existing line rather than toward
    // a fabricated "loading" claim. Inverting this would make local/demo — which
    // never sets the key and genuinely has no campaigns module — announce that
    // its campaigns are loading, forever.
    if (data.campaignsPending) return [pendingLine('קמפיינים', 'קמפיינים')];
    return [notConnectedLine('קמפיינים')];
  }

  const all = data.campaigns;
  if (!all.length) return ['קמפיינים: אין קמפיינים בחשבון הזה.'];

  const countOf = (s) => all.filter((c) => c && c.status === s).length;
  const active = all.filter((c) => c && c.status === 'active');
  const lines = ['קמפיינים (קמפיין עסקי במודול הקמפיינים — לא סשן קריאייטיב): '
    + `${all.length} סה״כ — ${countOf('active')} פעילים, ${countOf('draft')} טיוטות, `
    + `${countOf('completed')} הושלמו, ${countOf('cancelled')} בוטלו.`];

  // Only ACTIVES are listed. The roll-up above already states the other three
  // counts truthfully, and listing a completed campaign answers no question the
  // user is asking today while costing the same budget as an active one.
  if (active.length) {
    const shown = shownActiveCampaigns(all);
    const hidden = active.length - shown.length;
    const items = shown.map((c) => {
      const window = (c.startDate || c.endDate) ? ` [${c.startDate || '—'} → ${c.endDate || '—'}]` : '';
      return `${c.title} (${CAMPAIGN_STATUS_LABELS[c.status]})${window}`;
    }).join('; ');
    lines.push(`קמפיינים פעילים: ${items}.`
      + (hidden > 0 ? ` ועוד ${hidden} פעילים שאינם מפורטים כאן.` : ''));
  }
  return lines;
}

// ===================================================================
// Task ↔ Campaign join → Jake. `tasks.campaign_id` and its composite FK have
// been live since migration 20260729120000, TaskModal has submitted the link
// since Campaigns slice 2, and Tasks.jsx renders a campaign column — yet Jake
// knew campaign TITLES and task TITLES and nothing about which belongs to
// which. Asked "אילו משימות שייכות לקמפיין קיץ" he had no grounded answer.
//
// ZERO NEW IO. Tasks ride the STORE (api.fetchAll hydrates them, and
// api.js:172 rowToTask already maps campaign_id → campaignId); campaigns ride
// the JAKE SEAM. Both are already in `data` by the time this runs. No new lane,
// no new timer, no new fetch, and `src/lib/api.js` is untouched.
//
// ⚠️ THE CROSS-LIFECYCLE RULE — the whole reason this is not a two-line change.
// The two collections settle INDEPENDENTLY: tasks are in the store before the
// panel opens, campaigns are read once per panel open and can be pending, failed
// or absent while tasks are fully hydrated. So a naive join would report
// "המשימה אינה משויכת לקמפיין" at exactly the moment the truth is "I could not
// read the campaigns". The split is therefore made on what each source can
// actually answer:
//   - WHETHER a task carries a campaign id  → knowable from `tasks` ALONE, so
//     the roll-up sentence is emitted unconditionally and is true in every
//     campaigns state, including error and pending.
//   - WHICH campaign it is                  → needs the campaigns read, so the
//     per-campaign listing is emitted ONLY when campaigns are hydrated.
// Consequence: this adds ZERO new absence states. It inherits the campaigns
// lane's existing three (error / pending / not-connected) rather than inventing
// a fourth, and campaignLines() is left byte-identical — these lines are
// appended after it, so no existing wording moves.
//
// ONE DIRECTION ONLY, DELIBERATELY: campaign → its open tasks, never
// task → its campaign. Tasks are not individually listed anywhere in this
// context (the tasks line is a scalar roll-up), so a per-task campaign clause
// would mean creating a NEW listing surface over a collection with no quota and
// no title bound — a different, larger slice wearing this one's name.
//
// ⚠️ WHY THE HARD SLICE IS THE ONLY BOUND THAT EXISTS. `public.tasks` has NO
// row quota and `title` is `text not null` with NO length check (migration
// 20260722120000), and TaskModal's title input carries NO maxLength either — so
// a task title is unbounded from BOTH sides. The quota-ceiling argument used by
// the campaigns section is unavailable here for the same reason it was
// unavailable for quotes, and the substitute property is that this section is
// O(1) IN TASK COUNT. Exposure is bounded by
//   CAMPAIGN_ACTIVE_CAP × (campaign title + TASKS_PER_CAMPAIGN_CAP × TASK_TITLE_CHARS)
//   = 5 × (120 + 3 × 60) + separators
// and the campaign title is itself server-bounded at CAMPAIGN_LIMITS.title =
// 120 by campaigns_title_bounded, so every term is a constant and NO term is a
// row count. MEASURED on a 200-active-campaign account with 400-char task
// titles: this section costs 1,986 chars at 5,000 tasks and 1,994 at 50,000 —
// a 10x row increase costs EIGHT CHARACTERS, all of them digits in the counts.
// Full worst-case context 5,067 chars. This text ships inside the same
// `context.summary` the Gateway validates against MAX_CONTEXT_CHARS = 12000 and
// REJECTS over-limit rather than truncating.
//
// EXCLUDED, not truncated: `notes` (unbounded free text — the `meta.prompt`
// exclusion class; a half-sentence note is something Jake would quote back as a
// fact), plus `id`, `clientId`, `projectId`, `assignee`, `linkRef`, `priority`
// and `deadline`. Only the title and counts are emitted.
//
// READ-ONLY. There is no Jake task op and no Jake campaign op; none was added.
// jakeAgent.js is untouched, pinned by jakeCampaignTasks.test.js.
//
// NO CLOCK — status and linkage are the whole selector.
// ===================================================================
const TASKS_PER_CAMPAIGN_CAP = 3;
const TASK_TITLE_CHARS = 60;

// THE OPEN-TASK PREDICATE, in ONE place. artValueContext() and
// artValueBriefing() already defined this inline and identically; this slice
// groups by the SAME set, and a fourth private copy is how the campaign
// grouping and the "N פתוחות" count silently start disagreeing. Semantics are
// unchanged from the inline form it replaces.
const isOpenTask = (t) => t.status !== 'done';

// Three buckets, and the third is the point. `campaignLabelForAsset` is a pure
// resolver keyed off `.campaignId` — the field tasks and assets share — and it
// already returns exactly the three states needed, so it is reused AS-IS rather
// than reimplemented two-outcome here. Reimplementing it is precisely how
// `unknown` gets folded into `none`.
//
// A task whose id resolves to nothing is STILL LINKED. That happens when the
// campaign was deleted since this snapshot, when the campaigns seam read failed,
// and when the read simply has not settled — the wording below is honest for all
// three WITHOUT asserting which. Calling it unlinked would tell the user
// something the database contradicts; inventing a title would be worse.
function taskCampaignBuckets(openTasks, campaigns) {
  const named = new Map();
  let unknown = 0;
  let unlinked = 0;
  for (const t of openTasks) {
    const r = campaignLabelForAsset(t, campaigns);
    if (r.state === 'none') { unlinked += 1; continue; }
    if (r.state === 'unknown') { unknown += 1; continue; }
    const key = String(t.campaignId);
    if (!named.has(key)) named.set(key, []);
    named.get(key).push(t);
  }
  return { named, unknown, unlinked };
}

function campaignTaskLines(data) {
  // Tasks unhydrated → say nothing rather than report a fabricated zero. The
  // pre-existing `משימות: N פתוחות` line is untouched by this slice.
  if (!isHydrated(data.tasks)) return [];
  const open = data.tasks.filter(isOpenTask);
  if (!open.length) return [];

  const { named, unknown, unlinked } = taskCampaignBuckets(open, data.campaigns);
  const linked = open.length - unlinked;
  const lines = [];

  // WHICH campaign — campaigns-dependent, so gated on hydration. Every shown
  // active is listed even at zero tasks: "אין משימות פתוחות" is a fact, while
  // omitting the campaign would leave Jake unable to distinguish "none" from
  // "not covered here".
  //
  // ⚠️ THIS GUARD IS DOUBLED ON PURPOSE, and a mutation test proved it. Removing
  // this line alone changes NOTHING observable, because shownActiveCampaigns()
  // independently returns [] for a non-array and the listing is then skipped for
  // want of campaigns to list — an EQUIVALENT MUTANT, not a coverage hole. Both
  // halves are kept: this one states the cross-lifecycle rule at the point the
  // decision is made, the other one enforces it for any future caller. Deleting
  // EITHER is safe; deleting BOTH emits campaign names during a pending or
  // failed campaigns read, which is the exact falsehood this section exists to
  // prevent — pinned by the double-removal mutation control.
  if (isHydrated(data.campaigns)) {
    const shown = shownActiveCampaigns(data.campaigns);
    if (shown.length) {
      const items = shown.map((c) => {
        const mine = named.get(String(c.id)) || [];
        if (!mine.length) return `${c.title} — אין משימות פתוחות`;
        const take = mine.slice(0, TASKS_PER_CAMPAIGN_CAP);
        const hidden = mine.length - take.length;
        return `${c.title} — ${take.map((t) => String(t.title || '').slice(0, TASK_TITLE_CHARS)).join('; ')}`
          + (hidden > 0 ? ` (ועוד ${hidden} משימות פתוחות שאינן מפורטות כאן)` : '');
      }).join(' | ');
      lines.push(`משימות פתוחות לפי קמפיין (רק הקמפיינים הפעילים המפורטים למעלה): ${items}.`);
    }
  }

  // WHETHER a task is linked — knowable from `tasks` alone, so this sentence is
  // true in every campaigns state and is emitted unconditionally. The scoping
  // clause is load-bearing: the listing above covers only the shown ACTIVES,
  // while this count spans every campaign including draft/completed/cancelled,
  // and without saying so the two numbers read as contradicting each other.
  lines.push(`שיוך משימות לקמפיינים: ${linked} מתוך ${open.length} המשימות הפתוחות משויכות לקמפיין, `
    + `${unlinked} אינן משויכות. הספירה הזו חלה על כל הקמפיינים, כולל כאלה שאינם פעילים ואינם מפורטים כאן.`
    + (unknown > 0
      ? ` מתוך המשויכות, ${unknown} משויכות לקמפיין ששמו אינו זמין לי כרגע — `
        + `אל תאמר שהן אינן משויכות לקמפיין ואל תנחש את שמו.`
      : ''));

  return lines;
}

// ===================================================================
// Assets → Jake. `public.assets` is durable, live and CLOUD-ONLY, and was
// invisible to Jake in exactly the way campaigns were: four shipped slices
// (gallery, favorites, campaign link, user upload) built the whole chain and
// nothing in this file mentioned it, so an ungrounded answer was the only
// thing available for "מה יש לי בגלריה".
//
// The rows arrive through the JAKE SEAM (Assistant.jsx reads listAssets() once
// per panel open), NOT through the store: api.fetchAll() does not hydrate
// assets, the gallery is page-owned exactly like appointments and campaigns,
// and that whole-object replacement has already produced two shipped defects.
//
// READ-ONLY. There is no Jake asset op and none was added — no upload, no
// delete, no favorite, no campaign link. jakeAgent.js is untouched by this
// slice, pinned by jakeAssets.test.js.
//
// NAMING BOUNDARY, STATED IN THE COPY ITSELF. "נכסים" here is the durable
// per-account cloud gallery (public.assets), NOT the device-local creative
// session in src/creative/v2/**. Jake is told so in the roll-up line, so the
// two vocabularies cannot merge in his answer either. This file must never
// import from src/creative/v2/**.
//
// WHAT THE CAP IS AND IS NOT — this differs from the calendar and campaigns,
// and getting it backwards would ship a Jake that stops working on a busy
// account. This text rides inside the same `context.summary` the Gateway
// validates against MAX_CONTEXT_CHARS = 12000 and REJECTS over-limit rather
// than truncating. MEASURED on a heavy account (60 clients, 80 tasks, 50
// leads, 120 transactions, 200 active campaigns with 120-char titles):
//   baseline, no assets ............................  4,750 chars
//   40 assets, capped at 5, no prompt ..............  5,265  (+515)
//   ...the same, plus the S0D business brain .......  6,542  (worst case, OK)
//   40 assets UNCAPPED, no prompt ..................  7,615  (still OK!)
//   5 assets WITH full 2,000-char prompts .......... 15,310  *** REJECTED ***
//   40 assets uncapped WITH prompts ................ 87,975  *** 7.3x limit ***
// So the load-bearing guard is NOT the cap — it is the exclusion of
// `meta.prompt`, whose per-row bound is 2,000 chars (assets_meta_bounded).
// FIVE rows of it alone exceed the limit. The prompt is EXCLUDED, not
// truncated: a half-sentence prompt is something Jake would quote back as a
// fact about the user's image. `meta.preset` and `meta.engine` are excluded as
// 800 chars of near-zero answer value.
//
// NOTHING IDENTIFYING OR FETCHABLE. listAssets() returns a signed `url` for
// every row and this builder never reads it, nor `storagePath`, nor `id`, nor
// any user id. A signed URL is a short-lived bearer credential; putting one in
// a model prompt would hand out the object. Pinned by a leakage test.
//
// NO CLOCK — every date shown comes from the row's own `createdAt`, so unlike
// the calendar this needs no `now` injected.
// ===================================================================
const ASSET_DETAIL_CAP = 5;

const assetKb = (bytes) => `${Math.max(1, Math.round((Number(bytes) || 0) / 1024))}KB`;
const assetMimeLabel = (mime) => String(mime || '').replace(/^image\//, '') || 'תמונה';
const assetDate = (ts) => {
  const n = Number(ts) || 0;
  if (!n) return 'ללא תאריך';
  try { return new Date(n).toLocaleDateString('he-IL'); } catch { return 'ללא תאריך'; }
};

// The campaign clause for ONE asset. THREE outcomes, and the third is the
// point: an asset whose link cannot be named is still LINKED. Folding that into
// "no campaign" would tell the user an asset is unlinked while the database
// says otherwise, and inventing a title would be worse. `unknown` is reached
// two ways — the campaign was deleted since this snapshot, or the campaigns
// seam read failed — and the wording is honest for both without asserting
// which.
function assetCampaignClause(item, campaigns) {
  const r = campaignLabelForAsset(item, campaigns);
  if (r.state === 'named') return `, קמפיין: ${r.label.slice(0, 60)}`;
  if (r.state === 'unknown') return ', משויך לקמפיין (השם אינו זמין כרגע)';
  return '';
}

function assetLines(data) {
  if (!isHydrated(data.assets)) {
    // TWO different absences, and collapsing them would make one of them a lie.
    // A failed/timed-out CLOUD read is transient; local/demo genuinely has no
    // asset library (there is no local gallery table and fetchAll never
    // returns one), so notConnectedLine IS accurate there — the same split as
    // campaigns, and the opposite of the calendar.
    if (data.assetsError) {
      return ['נכסים (ספריית התמונות): אין לי גישה לספריית הנכסים כרגע ואין לי עליה נתונים כלל. '
        + 'אל תאמר שאין נכסים, אל תדווח על אפס ואל תסיק מכך מסקנה — '
        + 'אמור בכנות שלא הצלחת לטעון את ספריית הנכסים.'];
    }
    // THE THIRD ABSENCE — same rule and same ordering as campaigns: after the
    // error branch, and defaulting to falsy so an absent key keeps today's
    // wording. See the campaignLines() note above for why the default direction
    // is load-bearing rather than stylistic.
    if (data.assetsPending) return [pendingLine('נכסים (ספריית התמונות)', 'נכסים')];
    return [notConnectedLine('נכסים')];
  }

  const all = data.assets;
  if (!all.length) return ['נכסים (ספריית התמונות): אין נכסים בחשבון הזה.'];

  // `uploaded` is counted and `generated` is DERIVED as the remainder, so a row
  // with a missing or unrecognised source is absorbed into the larger bucket
  // instead of inventing a silent third one whose absence would make the two
  // printed counts fail to add up to the total.
  const uploaded = all.filter((a) => a && a.meta && a.meta.source === ASSET_SOURCE_UPLOAD).length;
  const generated = all.length - uploaded;
  const favorites = all.filter((a) => a && a.favorite === true).length;
  const linked = all.filter((a) => a && a.campaignId).length;

  const lines = ['נכסים (ספריית התמונות — התמונות השמורות בענן בחשבון הזה, לא סשן קריאייטיב מקומי): '
    + `${all.length} סה״כ — ${uploaded} הועלו, ${generated} נוצרו, `
    + `${favorites} מועדפים, ${linked} משויכים לקמפיין.`];

  // listAssets() already sorts newest-first, so this slice is "the most recent
  // five" without re-sorting (and without a clock).
  const shown = all.slice(0, ASSET_DETAIL_CAP);
  const hidden = all.length - shown.length;
  const items = shown.map((a) => {
    const src = (a && a.meta && a.meta.source === ASSET_SOURCE_UPLOAD) ? 'הועלה' : 'נוצר';
    const fav = a && a.favorite === true ? ', מועדף' : '';
    return `${src} ${assetDate(a && a.createdAt)} `
      + `(${assetMimeLabel(a && a.mime)}, ${assetKb(a && a.byteSize)}${fav}${assetCampaignClause(a, data.campaigns)})`;
  }).join('; ');
  lines.push(`נכסים אחרונים: ${items}.`
    + (hidden > 0 ? ` ועוד ${hidden} שאינם מפורטים כאן.` : ''));
  return lines;
}

// ===================================================================
// Quotes → Jake. `quotes` (WITH their line items) are ALREADY hydrated by
// api.fetchAll() — `select('*')` plus a client-side join of `quote_items` —
// and until now the ONLY quote fact Jake ever received was the scalar
// `k.pendingQuotes`, a `.filter().length`. He could restate "3 ממתינות" and
// answer nothing else: not whose, not how much, not which.
//
// NOT A SEAM. This is the structural difference from campaigns / assets /
// calendar and it removes four states, not one: quotes ride the STORE, so
// there is no `quotesPending`, no `quotesError`, and no ≤4s pre-settle window.
// The whole taxonomy the Jake Pre-Settle Truthfulness slice exists to fix does
// not apply here, and inventing a "not connected" wording for a collection
// that cannot disconnect would be its own untruth. Two states only: hydrated-
// empty and hydrated-non-empty.
//
// TWO ABSENCES, AND COLLAPSING THEM WOULD MAKE ONE OF THEM FALSE. "no quotes
// at all" and "quotes exist, none pending" read identically today (`ממתינות:
// 0`), so Jake cannot tell a business that has never written a quote from one
// that closed everything it sent. Same class as the pre-settle falsehood,
// approached from the opposite direction.
//
// THE BUDGET, AND WHY IT IS ARGUED DIFFERENTLY HERE. `public.quotes` has NO
// ROW QUOTA — unlike campaigns (200, in campaigns_insert_own) and assets (40,
// in the storage INSERT policy). `quotes_own` carries ownership and nothing
// else. So the "fits at the quota ceiling" proof used by jakeAssets.test.js is
// not available: there is no ceiling. The bound here comes from THIS CAP, and
// the property that stands in for the missing quota is that the section is
// O(1) in row count — 5,000 quotes must render the same length as 200. Pinned
// by jakeQuotes.test.js.
//
// EXCLUDED, and the exclusion is the load-bearing guard exactly as
// `meta.prompt` is for assets: `items` (unbounded count × unbounded free-text
// description) and `notes`. Jake gets the TOTAL, never the lines. `vatRate`,
// `validDays` and `id` are omitted as answer-free surface.
//
// NO CLOCK — every date shown comes from the row's own `date` field.
// ===================================================================
const QUOTE_DETAIL_CAP = 6;

// ⚠️ MUST STAY IDENTICAL TO dashboardKpis()'s predicate in calc.js. Two copies
// of one rule are free to drift, and a drifted copy would make the header
// contradict the `pendingQuotes` count printed three lines above it in the very
// same context. calc.js is deliberately NOT edited to share this — the parity
// is proven by EXECUTING both against the same fixture in jakeQuotes.test.js
// rather than by a source-level import that a future refactor could quietly
// re-inline.
const QUOTE_PENDING_STATUSES = ['draft', 'sent', 'viewed'];
const isPendingQuote = (q) => QUOTE_PENDING_STATUSES.includes(q && q.status);

const QUOTE_STATUS_LABELS = {
  draft: 'טיוטה', sent: 'נשלחה', viewed: 'נצפתה', accepted: 'אושרה', rejected: 'נדחתה',
};

const quoteNumber = (q) => {
  const s = String((q && q.number) || '').trim();
  return s ? s.slice(0, 24) : 'ללא מספר';
};

const quoteDate = (v) => {
  if (!v) return 'ללא תאריך';
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return 'ללא תאריך';
    return d.toLocaleDateString('he-IL');
  } catch { return 'ללא תאריך'; }
};

// THREE OUTCOMES, and the third is the point — the same rule as
// assetCampaignClause(). A quote whose client cannot be NAMED still HAS a
// client; folding that into "ללא לקוח" would tell the user the quote is
// unattached while the database says otherwise, and inventing a name would be
// worse. Reachable in principle only if `clients` and `quotes` disagree, which
// fetchAll makes unlikely — which is exactly why it must not silently become
// outcome 3 the day it happens.
function quoteClientLabel(q, byId) {
  if (!q || !q.clientId) return 'ללא לקוח';
  const c = byId.get(q.clientId);
  if (!c) return 'לקוח שאינו זמין כרגע';
  return String(c.name || '').slice(0, 40) || 'לקוח ללא שם';
}

// ₪0 IS A CLAIM. A quote with an empty `items` ARRAY genuinely totals zero and
// says so; a quote whose items never arrived has NO total, and printing ₪0 for
// it would hand Jake a number he will restate as a fact about the user's money.
// The two are distinguished structurally — array vs not-an-array — which is the
// same isHydrated() discriminator used everywhere else in this file.
function quoteTotalLabel(q) {
  if (!q || !Array.isArray(q.items)) return 'סכום לא זמין';
  const total = quoteTotal(q);
  if (!Number.isFinite(total)) return 'סכום לא זמין';
  return formatCurrency(total);
}

function quoteLines(data) {
  // Defensive only, and deliberately SILENT rather than a declared absence:
  // artValueContext() already calls dashboardKpis(data), which does
  // `quotes.filter(...)` unguarded, so a non-array here cannot reach this
  // function in the shipped app. Emitting a "not connected" line for an
  // impossible state would put a falsehood in the prompt to guard a path that
  // does not exist.
  if (!isHydrated(data.quotes)) return [];

  const all = data.quotes.filter(Boolean);
  if (!all.length) return ['הצעות מחיר: אין הצעות מחיר בחשבון הזה.'];

  const byId = new Map((data.clients || []).filter(Boolean).map((c) => [c.id, c]));
  const countOf = (s) => all.filter((q) => q.status === s).length;
  const pending = all.filter(isPendingQuote);
  const known = all.filter((q) => QUOTE_STATUS_LABELS[q.status]).length;
  const unknown = all.length - known;

  // The pending clause is worded, not numeric, when it is zero: "0 ממתינות"
  // beside a non-zero total is the exact ambiguity this slice removes.
  const pendingClause = pending.length
    ? `${pending.length} ממתינות (${countOf('draft')} טיוטות, ${countOf('sent')} נשלחו, ${countOf('viewed')} נצפו)`
    : 'אין הצעות ממתינות';
  let header = `הצעות מחיר: ${all.length} סה״כ — ${pendingClause}, `
    + `${countOf('accepted')} אושרו, ${countOf('rejected')} נדחו.`;
  // An unrecognised status is counted in the TOTAL and in no bucket, so the
  // buckets no longer sum to it — say so rather than let the arithmetic read as
  // broken. Absorbing the remainder into the larger bucket (the assets rule for
  // `source`) would be wrong here: status is a five-value business enum, not a
  // two-value derivation.
  if (unknown > 0) header += ` ועוד ${unknown} בסטטוס לא ידוע (אינן נכללות בפילוח שלמעלה).`;
  const lines = [header];

  // PENDING FIRST, then the rest — and within each group the array order is
  // preserved exactly as fetchAll returned it (created_at DESC). Deliberately
  // NOT re-sorted by `q.date`: that is a user-entered field which may be blank
  // or malformed, so sorting on it would make the selection non-deterministic.
  // Same "no re-sort, no clock" rule assetLines() follows.
  const ordered = [...pending, ...all.filter((q) => !isPendingQuote(q))];
  const shown = ordered.slice(0, QUOTE_DETAIL_CAP);
  const hidden = ordered.length - shown.length;
  const items = shown.map((q) => [
    quoteNumber(q),
    quoteClientLabel(q, byId),
    quoteTotalLabel(q),
    QUOTE_STATUS_LABELS[q.status] || 'סטטוס לא ידוע',
    quoteDate(q.date),
  ].join(' · ')).join('; ');
  lines.push(`הצעות מחיר אחרונות (מספר · לקוח · סכום כולל מע״מ · סטטוס · תאריך): ${items}.`
    + (hidden > 0 ? ` ועוד ${hidden} הצעות שאינן מפורטות כאן.` : ''));
  return lines;
}

// ===================================================================
// Context builder — the compact data snapshot fed to Jake every turn. This is
// business-specific (it knows Art Value's collections + how to phrase them in
// Hebrew), so it lives in the pack. A new business writes its own.
// ===================================================================
function artValueContext(data) {
  const k = dashboardKpis(data);
  const tasks = data.tasks || [];
  const open = tasks.filter(isOpenTask);
  const today = open.filter((t) => t.deadline && new Date(t.deadline).toDateString() === new Date().toDateString());
  const projects = (data.projects || []).filter((p) => p.status !== 'completed');
  const byStatus = (s) => data.clients.filter((c) => c.status === s).length;
  const leads = data.outreachLeads || [];
  const leadContacted = leads.filter((l) => l.status === 'contacted').length;
  const leadPending = leads.filter((l) => l.status === 'pending').length;
  const leadIrrelevant = leads.filter((l) => l.status === 'irrelevant').length;
  const now = new Date();
  // The projects line USED to sit in this literal and is now appended below,
  // still last — the hydrated wording and its position are unchanged.
  const lines = [
    `תאריך היום: ${now.toLocaleDateString('he-IL')}.`,
    `לקוחות ב-CRM: ${data.clients.length} סה״כ (${byStatus('lead')} לידים, ${byStatus('active')} פעילים).`,
    `רשימת שמות הלקוחות: ${data.clients.slice(0, 40).map((c) => c.name).join('; ') || 'אין לקוחות עדיין'}.`,
    `פרטי לקוחות: ${data.clients.slice(0, 14).map((c) => `${c.name} [${c.status}${c.value ? `, ${formatCurrency(c.value)}` : ''}${c.nextAction ? `, הבא: ${c.nextAction}` : ''}]`).join('; ') || 'אין'}.`,
    `מחקר לידים (עמוד הפניות): ${leads.length} לידים סה״כ — ${leadPending} ממתינים, ${leadContacted} נוצר קשר, ${leadIrrelevant} לא רלוונטי. דוגמאות: ${leads.slice(0, 8).map((l) => l.name).join('; ') || 'אין'}.`,
    `החודש: הכנסות ${formatCurrency(k.revenue)}, הוצאות ${formatCurrency(k.expenses)}, רווח ${formatCurrency(k.profit)}.`,
    `משימות: ${open.length} פתוחות, ${today.length} להיום. הצעות מחיר ממתינות: ${k.pendingQuotes}.`,
  ];

  // The calendar frames the day, so it sits directly after the date line and
  // ahead of the CRM collections.
  lines.splice(1, 0, ...calendarLines(data, now));

  // Campaigns — durable, cloud-only, page-owned, and read through the Jake seam.
  // Appended rather than spliced: unlike the calendar it is not time-bound, so
  // it does not belong ahead of the CRM collections, and appending moves no
  // existing line.
  lines.push(...campaignLines(data));

  // Task ↔ campaign join. Appended directly after the campaigns block because
  // the per-campaign listing is resolved against the same shown actives, so the
  // two read together; appending moves no existing line and leaves every
  // campaigns absence wording byte-identical.
  lines.push(...campaignTaskLines(data));

  // Assets — durable, cloud-only, page-owned, read through the Jake seam, and
  // read-only. Placed directly after campaigns because the campaign LABEL on an
  // asset is resolved against the campaigns list, so the two read best adjacent;
  // appending moves no existing line.
  lines.push(...assetLines(data));

  // F1 receivables — durable, already hydrated, and previously invisible to Jake.
  lines.push(...receivablesLines(data, localIsoDate(now)));

  // Quotes — durable, already hydrated (rows AND items), and until now visible
  // to Jake only as the scalar count printed in the tasks line above. That line
  // is UNCHANGED: this is appended, so no existing line moves and the count and
  // the detail are read together.
  lines.push(...quoteLines(data));

  // Projects — unhydrated in cloud mode, so "אין" would be a claim about a
  // module Jake cannot see.
  if (!isHydrated(data.projects)) {
    lines.push(notConnectedLine('פרויקטים'));
  } else {
    lines.push(`פרויקטים פעילים: ${projects.slice(0, 6).map((p) => `${p.name} (${p.clientName}, הפעולה הבאה: ${p.nextAction || '—'})`).join('; ') || 'אין'}.`);
  }

  // Inventory — same rule. An empty ARRAY is still an honest "ריק"; a missing
  // collection is not.
  if (!isHydrated(data.inventory)) {
    lines.push(notConnectedLine('מלאי'));
  } else {
    const inv = inventoryTotals(data.inventory);
    if (inv.count) {
      lines.push(`מלאי: ${inv.count} פריטים, ערך כולל ${formatCurrency(inv.totalValue)}. ${inv.low} במלאי נמוך, ${inv.out} אזלו.`);
      const itemsList = data.inventory.slice(0, 25).map((i) => `${i.name}: ${Number(i.qty) || 0} ${i.unit || 'יח׳'}${i.unitPrice ? ` (₪${i.unitPrice})` : ''}`).join('; ');
      lines.push(`פריטי המלאי (שם: כמות): ${itemsList}.`);
    } else {
      lines.push('מלאי: ריק (אין פריטים עדיין).');
    }
  }

  // Audit-log memory: real recorded history so ג'יק can answer "what changed /
  // what was X before" from facts instead of guessing. When the log is not
  // hydrated at all, staying silent is NOT enough — the grounding rules above
  // tell Jake to answer history questions from it, so an absent log would read
  // as "nothing ever changed". Say so explicitly instead.
  if (!isHydrated(data.activity)) {
    lines.push('יומן פעילות: אינו זמין בחשבון הזה — אין לי היסטוריית שינויים כלל. '
      + 'לשאלות על העבר ("מה היה קודם / מה השתנה") אמור בכנות שאין לך תיעוד, ואל תסיק שדבר לא השתנה.');
  } else {
    const acts = data.activity.slice(0, 12);
    if (acts.length) {
      const fmt = (ts) => { try { return new Date(ts).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
      lines.push(`יומן פעילות (היסטוריה אמיתית — לשאלות "מה השתנה / מה היה קודם" שלוף מכאן ואל תנחש): ${acts.map((a) => `${fmt(a.ts)} ${a.summary}`).join(' | ')}.`);
    }
  }
  return lines.map((l) => `- ${l}`).join('\n');
}

// ===================================================================
// Daily briefing — fully deterministic (computed from the live store, never the
// model) so it's always correct. Business-specific (knows what "money owed" /
// "overdue" mean here), so it lives in the pack alongside the context builder.
// ===================================================================
function artValueBriefing(data) {
  const tasks = data.tasks || [];
  const now = new Date();
  const todayStr = now.toDateString();
  const open = tasks.filter(isOpenTask);
  const overdue = open.filter((t) => t.deadline && new Date(t.deadline) < now && new Date(t.deadline).toDateString() !== todayStr);
  const dueToday = open.filter((t) => t.deadline && new Date(t.deadline).toDateString() === todayStr);
  // Money owed: work marked done / awaiting payment, value > 0, not yet paid.
  const owed = (data.clients || []).filter((c) => ['completed', 'await_payment'].includes(c.status) && Number(c.value) > 0);
  const owedSum = owed.reduce((s, c) => s + (Number(c.value) || 0), 0);
  const stuckLeads = (data.clients || []).filter((c) => c.status === 'lead' && !c.nextAction);
  const k = dashboardKpis(data);
  const names = (arr, key = 'name', n = 3) => arr.slice(0, n).map((x) => x[key]).filter(Boolean).join(', ') + (arr.length > n ? ` ועוד ${arr.length - n}` : '');

  // F1 receivables. The client-derived "owed" line above is DELIBERATELY kept
  // unchanged — it answers "work I have finished and expect to bill", which is
  // a different fact from "claims I have actually issued". They are labelled
  // distinctly (לקוחות vs חיובים) rather than merged, because merging them
  // would double-count exactly the accounts that have both.
  const charges = Array.isArray(data.charges) ? data.charges : [];
  const payments = Array.isArray(data.payments) ? data.payments : [];
  const receivables = receivablesTotals(charges, payments);
  const chargesOverdue = overdueCharges(charges, payments, localIsoDate(now));
  const chargesOverdueSum = roundMoney(chargesOverdue.reduce((s, c) => s + c.balance, 0));

  const urgent = [];
  if (overdue.length) urgent.push(`🔴 ${overdue.length} משימות באיחור — ${names(overdue, 'title')}`);
  if (owed.length) urgent.push(`💸 ${formatCurrency(owedSum)} ממתין לתשלום מ-${owed.length} לקוחות — ${names(owed)}`);
  if (chargesOverdue.length) urgent.push(`🧾 ${formatCurrency(chargesOverdueSum)} בחיובים באיחור — ${chargesOverdue.length} חיובים שתאריך הפירעון שלהם עבר`);
  // Schedule Core. The calendar leads למעקב — it is the only time-bound item in
  // it. Three states, and the third is the point: a FAILED cloud read must not
  // read as a quiet day. Silence is correct only in local/demo, where the module
  // genuinely does not exist and a failure notice would itself be false — which
  // is why appointmentsError is a separate flag from the absent collection.
  const todayList = [];
  const apptToday = isHydrated(data.appointments) ? listToday(data.appointments, now) : [];
  if (apptToday.length) {
    const shownAppt = apptToday.slice(0, 3)
      .map((a) => `${formatTimeRange(a.startAt, a.endAt)} ${a.title}`).join(', ');
    const moreAppt = apptToday.length > 3 ? ` ועוד ${apptToday.length - 3}` : '';
    todayList.push(`📅 ${apptToday.length} רשומות היום — ${shownAppt}${moreAppt}`);
  } else if (data.appointmentsError) {
    todayList.push('📅 לא הצלחתי לטעון את היומן — ייתכן שיש פגישות שאינן מוצגות כאן.');
  }
  if (dueToday.length) todayList.push(`📋 ${dueToday.length} משימות להיום — ${names(dueToday, 'title')}`);
  if (k.pendingQuotes) todayList.push(`📄 ${k.pendingQuotes} הצעות מחיר ממתינות לאישור`);
  if (stuckLeads.length) todayList.push(`👥 ${stuckLeads.length} לידים בלי פעולה הבאה — ${names(stuckLeads)}`);
  // Open balance that is not yet late is follow-up, not urgency. Suppressed
  // when an overdue line is already showing, so the same money is never
  // announced twice in one briefing.
  if (!chargesOverdue.length && receivables.open > 0) {
    todayList.push(`🧾 ${formatCurrency(receivables.open)} יתרה פתוחה בחיובים (טרם הגיע מועד הפירעון)`);
  }

  if (!urgent.length && !todayList.length) {
    return `☀️ סיכום היום\nהכל רגוע — אין משימות דחופות או חובות פתוחים. הכנסות החודש: ${formatCurrency(k.revenue)}. 👌`;
  }
  const parts = ['☀️ סיכום היום'];
  if (urgent.length) parts.push('\nדחוף:\n' + urgent.map((l) => `• ${l}`).join('\n'));
  if (todayList.length) parts.push('\nלמעקב:\n' + todayList.map((l) => `• ${l}`).join('\n'));
  parts.push(`\n💰 החודש: הכנסות ${formatCurrency(k.revenue)} · רווח ${formatCurrency(k.profit)}.`);
  return parts.join('\n');
}

// ===================================================================
// Creative V2 extension point (Phase 7) — turns Art Value CRM state into the
// canonical Creative V2 sub-structures (business/brand/defaults) ONLY. Aggregate
// + PII-free: NO client names, phones, emails, or per-client values leave here —
// only counts and summaries. The generic Context Builder assembles + validates
// the full canonical request from this. Knows nothing about Creative Director V1.
// ===================================================================
function artValueBuildCreativeContext(data, /* { objective, requestedEntityId } */ _opts = {}) {
  const k = dashboardKpis(data);
  const clients = data.clients || [];
  const activeClients = clients.filter((c) => c.status === 'active').length;
  const leads = clients.filter((c) => c.status === 'lead').length;
  const inv = data.inventory || [];

  // Products from inventory — name/category/price/margin only (no PII).
  const products = inv.slice(0, 12).map((it) => {
    const price = Number(it.unitPrice) || undefined;
    const margin = ((Number(it.unitPrice) || 0) - (Number(it.cost) || 0)) || undefined;
    return { id: it.id, name: it.name, ...(it.category ? { description: it.category } : {}), ...(price ? { price } : {}), ...(margin ? { margin } : {}) };
  });

  // The studio's services (static offering — not a CRM table).
  const services = [
    { id: 'svc-website', name: 'בניית אתרים' },
    { id: 'svc-crm', name: 'מערכות CRM וניהול עסק' },
    { id: 'svc-branding', name: 'מיתוג ועיצוב' },
    { id: 'svc-marketing', name: 'קמפיינים ופרסום' },
    { id: 'svc-landing', name: 'דפי נחיתה' },
  ];

  // Insights — AGGREGATE only (never individual customer data).
  const relevantInsights = [
    `הכנסות החודש: ${formatCurrency(k.revenue)}`,
    `${clients.length} לקוחות ב-CRM (${activeClients} פעילים, ${leads} לידים)`,
    k.pendingQuotes ? `${k.pendingQuotes} הצעות מחיר ממתינות` : '',
    inv.length ? `${inv.length} פריטים במלאי` : '',
  ].filter(Boolean);

  return {
    business: {
      name: 'Art Value',
      industry: 'סטודיו דיגיטלי — אתרים, CRM, מיתוג וקמפיינים',
      description: 'סטודיו דיגיטלי שבונה לעסקים נוכחות שמוכרת לבד: אתרים, מערכות CRM, מיתוג וקמפיינים.',
      ...(products.length ? { products } : {}),
      services,
      relevantInsights,
    },
    brand: {
      brandName: 'Art Value',
      audience: ['בעלי עסקים קטנים ובינוניים', 'עסקי בוטיק ופרימיום', 'יזמים בתחילת דרך'],
      tone: ['פרימיום', 'חד ומדויק', 'אנושי ומקצועי'],
      colors: ['#d4ff3f', '#c7bfff', '#0e0e0e'],
      visualStyles: ['קולנועי', 'מינימליסטי-עשיר', 'סוריאליסטי מאופק'],
      designRules: ['מוקד ויזואלי יחיד', 'טקסט עברי קריא', 'ניגודיות גבוהה'],
      forbiddenStyles: ['סטוק גנרי', 'לחיצות יד', 'אנשים מצביעים על מסך'],
      language: 'he-IL',
    },
    defaults: {
      channel: 'instagram_post',
      format: '4:5',
      targetAudience: 'בעלי עסקים שמנהלים את העסק ידנית (וואטסאפ, אקסל, פתקים)',
    },
  };
}

// ---- Art Value pack (the studio CRM/ERP) ----
export const artValuePack = {
  id: 'artvalue',
  name: 'Art Value',
  // WHO Jake is for this business + the scope of help.
  // S0C: generic business-assistant persona — Jake serves whoever is signed in;
  // he is never described as one specific person's personal assistant.
  // S0F.1 (D2): ArtValue is the PRODUCT/SYSTEM brand only — never the signed-in
  // account's own business. Jake claims no fixed ArtValue services for the
  // account and works solely from the account's approved Business Context.
  persona: `אתה ג׳יק — העוזר העסקי של המשתמש בתוך מערכת ArtValue.
פעל אך ורק לפי ההקשר העסקי המאושר של החשבון הפעיל. אל תייחס לחשבון עסק, תחום או שירותים שלא מופיעים בהקשר הזה, ואל תמציא פרטים — אם ההקשר העסקי חסר, אמור זאת בכנות.
אם שואלים מי אתה — אתה ג׳יק. אל תזכיר שאתה מבוסס על מודל חיצוני.
ענה בעברית בלבד, קצר, חברי ותכליתי. עזור עם לקוחות, לידים (מחקר לידים), פרויקטים, משימות, הצעות מחיר, מלאי ופיננסים.`,
  // Grounding rules (accuracy + history). These are reusable across businesses.
  rules: `חוק דיוק (קריטי): "נתוני המערכת" שלמטה הם מקור האמת היחיד והמעודכן. כשנשאלת על כמות / מספר / רשימה / סטטוס — שלוף את התשובה ישירות מהנתונים האלה ואל תנחש ואל תמציא. אם נשאלת "כמה לקוחות?" החזר את המספר המדויק שמופיע בנתונים. אם משהו לא קיים — אמור זאת בכנות.

חוק היסטוריה (קריטי): בנתוני המערכת למטה יש "יומן פעילות" — זו ההיסטוריה האמיתית של שינויים (שווי לקוח, סטטוס, הכנסות/הוצאות) עם תאריך ושעה. לשאלות על העבר ("מה היה השווי של הלקוח קודם", "כמה היו ההכנסות לפני השינוי", "מה השתנה היום") — חפש את התשובה ביומן הפעילות וענה לפיו במדויק (למשל אם רשום "שווי X: 2,500 ₪ → 3,500 ₪", אז לפני השינוי השווי היה 2,500 ₪). אם התשובה לא מופיעה ביומן — אמור בכנות "אין לי תיעוד של זה ביומן הפעילות" ואל תמציא מספר או לקוח/הסבר תומך. עדיף "אין לי את הנתון" על פני ניחוש.`,
  // The action protocol the MODEL is taught (prose) + the registry the executor
  // RUNS (op → handler). The two are a matched pair — the "toolbox". A new
  // business swaps both: its own guide text and its own ACTION_HANDLERS set
  // (or spread these and override/add entries).
  actionsGuide: ACTIONS_GUIDE,
  // CONFIRM MODE (gen-2): every proposed action is shown to the user as an approval
  // card and runs ONLY after the user approves. So phrase actions as PROPOSALS, not
  // done deeds — this is what unifies Jake here with the live cloud embeddings.
  confirmGuide: `## מצב אישור (חשוב מאוד)
כל פעולה שתציע תוצג למשתמש ככרטיס אישור, ותתבצע אך ורק אחרי שהמשתמש לוחץ "אשר ובצע".
- נסח פעולות כהצעה בלשון עתיד: "אוסיף את דני כהן", "אעדכן את השווי ל-5,000 ₪", "אמחק את הפריט" — לא כעובדה מוגמרת ("הוספתי", "עדכנתי", "מחקתי").
- אל תכתוב "✓" או "בוצע" בעצמך — המערכת מוסיפה אישור משלה רק אחרי הביצוע בפועל.
- עדיין כלול תמיד את בלוק ה-actions כרגיל (המערכת קוראת ממנו את הפעולות שתבצע אחרי האישור).
- אם זו שאלת מידע בלבד — אל תכלול בלוק actions, פשוט ענה.`,
  actions: ACTION_HANDLERS,
  // DRAFTING (gen-2): the writing lane — letters / WhatsApp / email / replies, built
  // from real CRM data. No actions; just clean, ready-to-send Hebrew prose.
  draftingGuide: `## משימת ניסוח
המשתמש ביקש שתנסח עבורו טקסט (מכתב, הודעת וואטסאפ, מייל, תשובה ללקוח, פוסט וכד׳).
- כתוב עברית נקייה, חמה ומקצועית — מוכן להעתק-הדבק, בלי שגיאות, בלי מליצות מיותרות.
- התאם את האורך והטון לערוץ: וואטסאפ = קצר וידידותי; מייל = מסודר עם פנייה וסגירה; מכתב = רשמי יותר.
- השתמש בפרטים אמיתיים מנתוני המערכת (שם הלקוח, סכום, שלב, מה שסוכם) כשהם רלוונטיים — אל תמציא עובדות.
- אל תחתום בשם אדם ספציפי ואל תמציא חתימה. סיים ללא חתימה אישית, אלא אם המשתמש ביקש במפורש חתימה מסוימת.
- אל תכלול בלוק actions ואל תבצע פעולות — זו משימת כתיבה בלבד. החזר את הטקסט המוכן בלבד.`,
  // The business data-shape: collections + how to read/summarize them. Drives the
  // executor's working-copy, the bulk-delete picker, the live context snapshot,
  // and the daily briefing. A new business swaps all of these together.
  entities: BUSINESS_ENTITIES,
  buildContext: artValueContext,
  briefing: artValueBriefing,
  // ---- Creative V2 extension points (Phase 7) ----
  buildCreativeContext: artValueBuildCreativeContext,
  creativeRules: { language: 'he-IL', maxConcepts: 3, requireSingleFocalPoint: true, hebrewTextMustBeLegible: true },
  creativePermissions: { analyze: true, brief: true, generate: true, select: true, save: true },
};

// The ACTIVE business pack. Swap this single line to retarget Jake to another
// business — e.g. `export const activePack = charityPack;`.
export const activePack = artValuePack;

// Assemble Jake's full system prompt = pack identity + rules + actions + live data.
// The engine calls this; only the pack changes between businesses.
export function buildJakeSystem(pack, contextText, noThink = '') {
  return `${pack.persona}

${pack.rules}

${pack.actionsGuide}
${pack.confirmGuide ? `\n${pack.confirmGuide}\n` : ''}
נתוני המערכת (זה מה שיש כרגע, עדכני לרגע זה):
${contextText}${noThink}`;
}

// The DRAFTING system prompt — persona + drafting guide + live data, NO actions.
// Used by the writing lane (draftWithJake) so letters/messages read naturally and
// are grounded in real CRM facts.
export function buildJakeDraftSystem(pack, contextText, noThink = '') {
  return `${pack.persona}

${pack.draftingGuide || 'כתוב טקסט נקי ומקצועי בעברית, מוכן לשליחה.'}

נתוני המערכת (לשימוש לפרטים מדויקים — שמות, סכומים, סטטוסים. אל תמציא):
${contextText}${noThink}`;
}

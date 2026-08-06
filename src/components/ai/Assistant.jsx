import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../../store/store.jsx';
import Icon from '../ui/Icon.jsx';
import warriorSit from '../../assets/warrior_sit.png';
import warriorStand from '../../assets/warrior_stand.png';
import warriorWalk from '../../assets/warrior_walk.png';
import { chatJake, forceActionsJake, draftWithJake } from '../../lib/gemini.js';
import { isSupabaseConfigured } from '../../lib/supabase.js';
import { listAppointments, listCampaigns, listAssets } from '../../lib/api.js';
import { calendarStateAfterRead, CALENDAR_OUTCOME } from '../../lib/calendarReadState.js';
import { campaignStateAfterRead, CAMPAIGN_OUTCOME } from '../../lib/campaignReadState.js';
import { assetStateAfterRead, ASSET_OUTCOME } from '../../lib/assetReadState.js';
import { extractActions, executeActions, describeActions, detectBulkDelete, buildBulkDeleteGate } from '../../lib/jakeAgent.js';
import { partitionJakeActions, BETA_MESSAGES } from '../../lib/betaCapabilities.js';
import { executeBulkDelete } from '../../lib/bulkDeleteOutcome.js';
import { activePack } from '../../lib/jakePack.js';
import { withBusinessBrain } from '../../lib/jakeBusinessContext.js';
import { applyJakePrefill } from '../../lib/jakePrefill.js';
import { selectJakeChatHistory } from '../../lib/jakeChatHistory.js';
import { studioHandoffFor } from '../../lib/assistantStudioHandoff.js';
import { createArtValueCreative } from '../../creative/v2/createArtValueCreative.js';
import { PRODUCTION_STAGES, PRODUCTION_STAGE_ORDER } from '../../creative/v2/productionProgress.js';
import { persistableChatMessages } from './chatPersistence.js';
import { dashboardKpis, inventoryTotals, lowStockItems } from '../../lib/calc.js';
import { formatCurrency } from '../../lib/format.js';
import { resolveDisplayName, userScopeKey } from '../../lib/userIdentity.js';

const GREETING = 'שלום! אני ג׳יק, העוזר האישי שלך. אני יודע כל מספר במערכת, יכול לנסח לך מכתבים והודעות, ולבצע פעולות — כל פעולה אציג לך לאישור לפני הביצוע. מה נעשה?';
const SUGGESTIONS = ['מה חשוב היום?', 'הוסף לקוח דני כהן, ליד, 3000 ₪', 'נסח הודעת וואטסאפ ללקוח'];
// S0C: per-user Jake state. Keys are scoped by the stable session user.id via
// userScopeKey — the PRE-S0C device-global keys ('artvalue_jake_chat' /
// 'artvalue_jake_brief_date') are legacy and are never read, migrated or
// deleted, so a shared device can never show one account's chat to another.
const CHAT_KEY_BASE = 'artvalue_jake_chat';
const BRIEF_DATE_KEY_BASE = 'artvalue_jake_brief_date';
// Authorization code required before any BULK delete (e.g. "מחק את כל המלאי").
const CONFIRM_CODE = '123456';
// Schedule Core → Jake: how long the morning briefing waits for the appointments
// read before giving up on it. BOUNDED ON PURPOSE. The briefing is gated on the
// read having SETTLED so the once-a-day marker is never burned on a briefing
// composed without the calendar — but a request that neither resolves nor
// rejects (the Supabase client sets no timeout of its own) would then suppress
// the briefing entirely, which is worse than a briefing that admits the calendar
// is missing. Fail toward the VISIBLE state. The panel-open animation already
// runs ~1.25s, so a healthy read is invisible well inside this.
const CALENDAR_READ_TIMEOUT_MS = 4000;
// Campaigns → Jake: its OWN timeout constant, same value, different reason.
// Nothing waits for this read — campaigns deliberately do not gate the morning
// briefing — so this timer is not there to unblock anything. It exists purely
// to keep the WORDING truthful: the Supabase client sets no timeout of its own,
// and a read that never settles would leave `campaigns` undefined with the
// error flag false, which renders as "המודול אינו מחובר לחשבון הזה" — a false
// statement in cloud mode. The timer converts a hang into an honest
// "could not load".
const CAMPAIGN_READ_TIMEOUT_MS = 4000;
// Assets → Jake: its OWN timeout constant again, same value, same reason as the
// campaigns one. Nothing waits for this read either; the timer exists so a hang
// cannot leave `assets` undefined with the error flag false, which would render
// as "המודול אינו מחובר לחשבון הזה" — false in cloud mode, where the library
// certainly is connected. The timer converts a hang into an honest
// "could not load".
const ASSET_READ_TIMEOUT_MS = 4000;

// Code-gated bulk-delete card: step 1 asks for the auth code; only on the correct
// code does it reveal step 2 — a checkbox picker of exactly what to delete. Holds
// its own transient UI state (code text, selection) so it survives re-renders.
function GateCard({ gate, onDelete, onCancel }) {
  const [stage, setStage] = useState('code');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(() => new Set(gate.items.map((i) => i.id)));
  // The delete is now AWAITED, which opens a window (the cloud round-trip) in
  // which this card is still mounted and its button still live. Without a guard
  // a second click would dispatch the same ids again. `busy` drives the visible
  // disabled state; `runningRef` is what actually enforces it, because a ref is
  // updated SYNCHRONOUSLY — two clicks in one tick both read the pre-render
  // `busy === false`, but the second one sees `runningRef.current === true`.
  const [busy, setBusy] = useState(false);
  const runningRef = useRef(false);

  const submitCode = () => {
    if (code.trim() === CONFIRM_CODE) { setError(''); setStage('select'); }
    else { setError('קוד שגוי. נסה שוב.'); setCode(''); }
  };
  // Fire the delete exactly once and keep the card disabled for the whole
  // round-trip. Reset in `finally` so a future refactor that leaves the card
  // mounted cannot strand it permanently dead (on the current flow the card
  // unmounts, because every outcome replaces the message at its index).
  const submitDelete = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setBusy(true);
    try { await onDelete([...selected]); }
    finally { runningRef.current = false; setBusy(false); }
  };
  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = selected.size === gate.items.length && gate.items.length > 0;
  const toggleAll = () => setSelected(allOn ? new Set() : new Set(gate.items.map((i) => i.id)));

  if (stage === 'code') {
    return (
      <div className="ai-msg assistant ai-confirm ai-gate">
        <div className="ai-confirm-q">🔒 מחיקת כל {gate.entityLabel} ({gate.items.length}) — הזן קוד אישור כדי להמשיך</div>
        <input
          className="ai-gate-code" type="password" inputMode="numeric" autoFocus
          aria-label="קוד אישור למחיקה"
          value={code} onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitCode(); }}
          placeholder="קוד אישור"
        />
        {error && <div className="ai-gate-err">{error}</div>}
        <div className="ai-confirm-actions">
          <button className="btn btn-sm ai-confirm-yes" onClick={submitCode} disabled={!code.trim()}>אישור</button>
          <button className="btn btn-sm btn-ghost" onClick={onCancel}>ביטול</button>
        </div>
      </div>
    );
  }
  return (
    <div className="ai-msg assistant ai-confirm ai-gate">
      <div className="ai-confirm-q row between" style={{ display: 'flex', alignItems: 'center' }}>
        <span>בחר מה למחוק מתוך {gate.entityLabel} ({selected.size}/{gate.items.length})</span>
        <button className="link-btn" onClick={toggleAll}>{allOn ? 'נקה הכל' : 'בחר הכל'}</button>
      </div>
      <div className="ai-gate-list">
        {gate.items.map((it) => (
          <label key={it.id} className="ai-gate-row">
            <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} />
            <span>{it.label}</span>
          </label>
        ))}
      </div>
      <div className="ai-confirm-actions">
        <button className="btn btn-sm ai-confirm-yes" disabled={busy || !selected.size} onClick={submitDelete}>
          {busy ? 'מוחק…' : `מחק נבחרים (${selected.size})`}
        </button>
        {/* Cancel is disabled mid-flight too: it replaces this message and unmounts
            the card, which would hide an in-flight delete rather than stop it. */}
        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={onCancel}>ביטול</button>
      </div>
    </div>
  );
}

// Dedicated, DETERMINISTIC Offer Campaign brief form (no NLP, no model). Holds its
// own transient field state (same self-contained pattern as GateCard) so it survives
// the messages re-render. Submit is disabled until businessType is non-empty — the
// only hard requirement. channel/objective/language are fixed defaults for this slice
// (whatsapp / generate_leads / he-IL), shown read-only.
function OfferBriefForm({ onSubmit, onCancel }) {
  const [businessType, setBusinessType] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [painPoints, setPainPoints] = useState('');
  const [currentSituation, setCurrentSituation] = useState('');
  const canSubmit = businessType.trim().length > 0;
  // Inline styles only (CSS files are out of scope for this slice).
  const field = { width: '100%', boxSizing: 'border-box', marginTop: 6, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line, #ccc)', background: 'var(--bg-soft, #fff)', color: 'inherit', font: 'inherit' };
  const submit = () => { if (canSubmit) onSubmit({ businessType, businessName, painPoints, currentSituation }); };
  return (
    <div className="ai-msg assistant ai-confirm ai-offer-form">
      <div className="ai-confirm-q">📣 בניית בריף הצעה ללקוח</div>
      <input
        style={field} autoFocus value={businessType}
        onChange={(e) => setBusinessType(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        placeholder="סוג העסק (חובה) — למשל: משרד תיווך נדל״ן"
        aria-label="סוג העסק"
      />
      <input
        style={field} value={businessName}
        onChange={(e) => setBusinessName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        placeholder="שם העסק (אופציונלי)"
        aria-label="שם העסק"
      />
      <textarea
        style={{ ...field, minHeight: 52, resize: 'vertical' }} rows={2} value={painPoints}
        onChange={(e) => setPainPoints(e.target.value)}
        placeholder="כאבים / בעיות (אופציונלי) — מופרד בפסיקים או בשורות"
        aria-label="כאבים"
      />
      <input
        style={field} value={currentSituation}
        onChange={(e) => setCurrentSituation(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        placeholder="מצב נוכחי (אופציונלי)"
        aria-label="מצב נוכחי"
      />
      <div className="ai-camp-scores" style={{ marginTop: 8 }}>ערוץ: וואטסאפ · מטרה: יצירת לידים · שפה: עברית</div>
      <div className="ai-confirm-actions">
        <button className="btn btn-sm ai-approve" disabled={!canSubmit} onClick={submit}>צור בריף</button>
        <button className="btn btn-sm btn-ghost" onClick={onCancel}>ביטול</button>
      </div>
    </div>
  );
}

// Map the structured form state → a deterministic OfferCampaignRequest. Pure: trims,
// splits painPoints on commas/newlines, omits empty optionals, fixes the goal.
function buildOfferRequest(form) {
  const t = (v) => String(v == null ? '' : v).trim();
  const businessName = t(form && form.businessName);
  const currentSituation = t(form && form.currentSituation);
  const painPoints = t(form && form.painPoints).split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  const prospect = { businessType: t(form && form.businessType) };
  if (businessName) prospect.businessName = businessName;
  const signals = { painPoints };
  if (currentSituation) signals.currentSituation = currentSituation;
  return {
    prospect,
    signals,
    goal: { objective: 'generate_leads', channel: 'whatsapp', language: 'he-IL' },
  };
}

// Does the text contain an explicit action verb (add/update/delete/…)? If so the
// model must run to emit the action block — we never fully swallow it. (\b word
// boundaries don't work around Hebrew letters, so anchor on start/whitespace.)
function hasActionVerb(text) {
  return /(?:^|\s)(תעדכן|עדכן|תשנה|שנה|תוסיף|הוסף|תמחק|מחק|תסיר|הסר|תוריד|הורד|תרשום|רשום|רשם|תסמן|סמן|תעביר|העבר|תבנה|בנה)/.test(String(text || ''));
}

// Is this a WRITING request (letter / WhatsApp / email / reply)? → drafting lane
// (prose only, no actions). Excludes "הצעת מחיר" which is a real add_quote action.
export function isDraftRequest(text) {
  const t = String(text || '');
  if (/הצע(ת|ות)\s*מחיר/.test(t)) return false;
  const verb = /(כתוב|תכתוב|תכתבי|נסח|תנסח|נסחי|תכין|חבר|תחבר|לכתוב|לנסח|לחבר)/.test(t);
  const channel = /(מכתב|הודעה|מסר|מייל|אימייל|אימל|email|וואטס|whatsapp|תשובה|טיוטה|נאום|פוסט|ברכה|תגובה|הודעת)/i.test(t);
  if (verb && channel) return true;
  return /(מה לכתוב|איך לכתוב|תעזור לי לכתוב|נסח לי|תנסח לי|תכתוב לי הודעה|תכתוב לי מכתב)/.test(t);
}

// Did the model CLAIM an action (past OR proposed future tense) in prose? Used to
// trigger a force-proposal pass when it talked but emitted no actions block.
function claimsActionText(text) {
  return /[✓✅]|בוצע|ביצעתי|הוספתי|עדכנתי|מחקתי|הסרתי|סימנתי|יצרתי|בניתי|רשמתי|נרשמ|הועבר|העברתי|שמרתי|אוסיף|אעדכן|אמחק|איצור|אבנה|ארשום|אסמן|אעביר/.test(String(text || ''));
}

// A calm Hebrew fallback message — the client NEVER sees a raw technical error.
function gentleError(e) {
  // Local-engine retirement (2026-07-27): the special case that recognised the
  // legacy workstation-engine error TEXT is gone with the engine that raised it.
  // Every failure now resolves to ONE calm business-facing line — the error
  // object is never read, so no technical detail can leak through it.
  void e;
  return 'מצטער, לא הצלחתי לעבד את זה כרגע 🙏 נסה/י שוב בעוד רגע, או לנסח קצת אחרת.';
}

// ---- campaign INTENT classification (C1, 2026-08-07) ------------------------
// Until this slice, clause 1 below was a BARE NOUN test — any text containing
// "קמפיין" entered the S0F.1 creative-containment lane before Jake's context was
// consulted, so informational questions about the account's DURABLE campaigns
// (and the task↔campaign join shipped in `08f818d3`) could never be answered at
// all. Containment KEEPS its precedence and its message; it now triggers on
// creative-ACTION intent instead of on the word alone.
//
// Order, and it is load-bearing:
//   1. a BUILD verb with the noun is ABSOLUTE — nothing overrides it;
//   2. otherwise an informational, lead-CRM or drafting frame releases the text
//      to the normal lanes;
//   3. otherwise it FAILS CLOSED into containment (a bare "קמפיין", or an
//      ambiguous "אני רוצה קמפיין", stays contained).
// ONE rule for cloud and local/demo: this predicate never reads the mode. The
// only mode divergence stays at the `isSupabaseConfigured` gate inside the lane.
// ⚠️ BOTH nun forms. Hebrew writes the same consonant as FINAL nun ן (U+05DF)
// word-finally and MEDIAL nun נ (U+05E0) elsewhere, so the singular קמפיין ends
// in ן while the plural קמפיינים carries נ. The pre-slice matcher accepted only
// ן, so NO plural form was ever a campaign — which left a real containment hole
// ("תבנה לי קמפיינים חדשים" reached the model) and made three QA phrasings pass
// for the wrong reason. The optional yod keeps the tolerated קמפין spelling.
const CAMPAIGN_NOUN_RE = /קמפיי?[ןנ]|campaign/i;
// ⚠️ Hebrew has no usable \b (see hasActionVerb above) — and a LEADING anchor
// alone is NOT enough: /(?:^|\s)מה/ matches the first two letters of "מהקמפיין",
// which would release a lead sentence through a PHANTOM info frame instead of
// through the lead frame. Every token below is bounded on BOTH sides.
const CAMPAIGN_BUILD_RE = /(?:^|\s)(תבנה|בנה|לבנות|תכין|הכן|להכין|תיצור|צור|ליצור|להקים|תריץ|הרץ|להריץ|תעצב|לעצב|תייצר|לייצר|build|create|run|design|generate|make)(?=\s|[?!.,;:]|$)/i;
const CAMPAIGN_INFO_RE = /(?:^|\s)(מה|מהו|מהי|כמה|אילו|איזה|מי|סטטוס|תראה|הצג|תגיד|רשימת|what|which|status|show|list|how many)(?=\s|[?!.,;:]|$)/i;
// Reused verbatim from jakeDecisionEngine.js — a campaign named as a lead's
// SOURCE is a CRM statement, never a creative brief. It is an INDEPENDENT
// escape: it must not require an info frame.
const CAMPAIGN_LEAD_RE = /ליד(ים)?|\blead(s)?\b/i;

function campaignCreativeIntent(t) {
  if (!CAMPAIGN_NOUN_RE.test(t)) return false;
  if (CAMPAIGN_BUILD_RE.test(t)) return true;                 // 1 — absolute
  if (CAMPAIGN_INFO_RE.test(t) || t.includes('?')) return false; // 2a — info
  if (CAMPAIGN_LEAD_RE.test(t)) return false;                 // 2b — CRM lead
  if (isDraftRequest(t)) return false;                        // 2c — drafting
  return true;                                                // 3 — fail closed
}

// Is this a CREATIVE CAMPAIGN request (→ Creative V2 slice: brief → adapter → V1)?
export function isCampaignRequest(text) {
  const t = String(text || '');
  return campaignCreativeIntent(t)
    || /(רעיונות|כיוונים)\s*(ל)?(פרסום|מודעה|קריאייטיב|קריאטיב)/.test(t)
    || /(תכין|בנה|תבנה|רוצה)\s*(לי\s*)?(מודעת? פרסום|כמה רעיונות פרסום)/.test(t);
}

// Creative-slice errors → calm Hebrew (NEVER a raw technical error to the user).
function creativeError(e) {
  const code = e && e.code;
  if (code === 'CONCEPTS_TOO_SIMILAR') return 'מנוע הקריאייטיב החזיר כיוונים דומים מדי. הנתונים שלך לא שונו — אפשר לנסות שוב. 🙏';
  if (['NO_OBJECTIVE', 'INVALID_REQUEST', 'REQUEST_INVALID', 'NO_PACK_SUPPORT', 'PACK_BUILD_FAILED'].includes(code)) return 'חסר לי קצת מידע כדי לבנות קמפיין מדויק. נסה/י לתאר מה המטרה ולמי הקמפיין.';
  if (['V1_EXECUTION_FAILED', 'ENGINE_FAILED'].includes(code)) return 'לא הצלחתי להשלים כרגע את יצירת כיווני הקמפיין. הנתונים שלך לא שונו — אפשר לנסות שוב.';
  if (['RESULT_INVALID', 'V1_OUTPUT_INVALID'].includes(code)) return 'מנוע הקריאטיב החזיר תוצאה שאינה תקינה. לא נשמרו שינויים במערכת.';
  return 'מצטער, לא הצלחתי להשלים את הקמפיין כרגע 🙏 הנתונים שלך לא שונו. אפשר לנסות שוב.';
}

// Concise, human-readable critic note for one concept evaluation (additive view —
// never reflects back into the stored concept). Rejected → first reason; demoted →
// first note; strong-unusual → a short tag; otherwise a compact critic score.
function criticNote(ev) {
  if (!ev) return '';
  if (ev.rejected && ev.rejectReasons && ev.rejectReasons.length) return `נדחה: ${ev.rejectReasons[0]}`;
  if (ev.demoted && ev.notes && ev.notes.length) return `מוחלש: ${ev.notes[0]}`;
  if (ev.protectedAsStrongUnusual) return 'רעיון חזק ולא שגרתי';
  return `ציון ביקורת ${Math.round((ev.composite || 0) * 100)}`;
}

// Numbers come from CODE, never from the model. For a recognized computed-number
// QUESTION (e.g. "מה ערך המלאי") return the answer straight from the live store.
// Question-anchored (needs מה/כמה/?/תגיד) so it never fires on a bare command like
// "תעדכן ערך המלאי ל-5000". Used two ways in send(): a pure question is answered
// directly (model skipped); a compound "command + question" lets the command run
// and then appends THIS authoritative figure, so the number is always from code.
export function answerFromData(text, data) {
  const t = String(text || '').trim();
  if (!t) return null;
  const isQuestion = /(?:^|\s)(מה|מהו|מהי|כמה|תגיד|תראה|הצג)/.test(t) || t.includes('?');
  if (!isQuestion) return null;
  // HYDRATION TRUTHFULNESS (same rule as jakePack's context builder): in cloud
  // mode fetchAll() returns no `inventory` key at all, so `|| []` used to make
  // this shortcut answer "המלאי ריק — הערך ₪0" as a confident fact about a
  // module that was never loaded. Absence is not emptiness. When the collection
  // is not in the store we decline to answer here and fall through to the
  // normal lane, whose context now states the module is not connected.
  const inventoryHydrated = Array.isArray(data.inventory);
  const inv = inventoryTotals(inventoryHydrated ? data.inventory : []);
  // Inventory total value: "מה ערך המלאי" / "שווי המלאי" / "כמה שווה המלאי"
  if (/(ערך|שווי|שווה).{0,10}(המלאי|מלאי)/.test(t) || /(מלאי).{0,10}(ערך|שווי|שווה)/.test(t)) {
    if (!inventoryHydrated) return null;
    if (!inv.count) return 'המלאי ריק כרגע — אין פריטים, אז הערך הוא ₪0.';
    return `ערך המלאי הכולל הוא ${formatCurrency(inv.totalValue)} (${inv.count} פריטים).`;
  }
  // Inventory item count: "כמה פריטים במלאי"
  if (/(פריטים|מוצרים)/.test(t) && /(מלאי)/.test(t)) {
    if (!inventoryHydrated) return null;
    return inv.count ? `יש ${inv.count} פריטים במלאי (ערך כולל ${formatCurrency(inv.totalValue)}).` : 'אין פריטים במלאי עדיין.';
  }
  // Client count: "כמה לקוחות יש"
  if (/לקוחות/.test(t)) {
    const n = (data.clients || []).length;
    return n ? `יש ${n} לקוחות ב-CRM.` : 'אין לקוחות עדיין.';
  }
  return null;
}

// Build proactive reminders from the live data (most actionable first).
function buildReminders(data) {
  const out = [];
  const tasks = data.tasks || [];
  const now = new Date();
  const todayStr = now.toDateString();
  const dueToday = tasks.filter((t) => t.status !== 'done' && t.deadline && new Date(t.deadline).toDateString() === todayStr);
  const overdue = tasks.filter((t) => t.status !== 'done' && t.deadline && new Date(t.deadline) < now && new Date(t.deadline).toDateString() !== todayStr);
  const k = dashboardKpis(data);
  const stuckLeads = (data.clients || []).filter((c) => c.status === 'lead' && !c.nextAction);
  const projNext = (data.projects || []).filter((p) => p.status !== 'completed' && p.nextAction);

  const lowStock = lowStockItems(data.inventory || []);
  if (lowStock.length) out.push({ id: 'stock', icon: 'dashboard', text: `${lowStock.length} פריטים במלאי נמוך/אזל`, sub: lowStock[0]?.name, to: '/inventory' });
  if (overdue.length) out.push({ id: 'overdue', icon: 'clock', text: `${overdue.length} משימות באיחור`, sub: overdue[0]?.title, to: '/tasks' });
  if (dueToday.length) out.push({ id: 'today', icon: 'check', text: `${dueToday.length} משימות להיום`, sub: dueToday[0]?.title, to: '/tasks' });
  if (k.pendingQuotes) out.push({ id: 'quotes', icon: 'doc', text: `${k.pendingQuotes} הצעות מחיר ממתינות`, to: '/quotes' });
  if (stuckLeads.length) out.push({ id: 'leads', icon: 'users', text: `${stuckLeads.length} לידים בלי פעולה הבאה`, sub: stuckLeads[0]?.name, to: '/clients' });
  if (projNext.length) out.push({ id: 'proj', icon: 'briefcase', text: `המשך פרויקט: ${projNext[0].name}`, sub: projNext[0].nextAction, to: '/projects' });
  if (out.length) return out.slice(0, 4);

  // Fallback when the system is still empty — friendly onboarding nudges.
  if (!(data.clients || []).length) {
    return [
      { id: 'add-client', icon: 'users', text: 'הוסף את הלקוח הראשון', sub: 'בנה את ה-CRM שלך', to: '/clients' },
      { id: 'try-studio', icon: 'image', text: 'נסה את מחולל התמונות', sub: 'צור לוגו או באנר', to: '/studio' },
      { id: 'overview', icon: 'spark', text: 'מה המערכת יודעת לעשות?', query: 'ספר לי בקצרה מה אפשר לעשות במערכת.' },
    ];
  }
  return [];
}

// Is the user asking for a proactive briefing / "what's important"? (question-like,
// never an action command) → answered deterministically by jakeBriefing.
function isBriefingRequest(text) {
  const t = String(text || '').trim();
  return /(סיכום של היום|סיכום יום|סיכום היום|מה חשוב|מה דחוף|מה הכי חשוב|מה יש לי היום|מה על הפרק|תעדכן אותי|מה המצב היום|מה צריך לעשות היום|בריף)/.test(t);
}

// phases: sit (resting) → walkout → look → idle (reminder) / chatting (chat) → walkback → sit
export default function Assistant() {
  const { data, dispatch, toast, session } = useStore();
  const navigate = useNavigate();
  // S0C: the active account's scoped storage keys (never the bare legacy keys).
  const chatKey = userScopeKey(CHAT_KEY_BASE, session);
  const briefDateKey = userScopeKey(BRIEF_DATE_KEY_BASE, session);
  const displayName = resolveDisplayName(session);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState('sit');
  const [messages, setMessages] = useState(() => {
    try {
      const raw = localStorage.getItem(chatKey);
      // Drop any transient progress card a buggy build may have persisted, so a
      // reload never restores a stuck in-progress card.
      if (raw) { const arr = persistableChatMessages(JSON.parse(raw)); if (arr.length) return arr; }
    } catch { /* ignore */ }
    return [{ role: 'assistant', text: GREETING }];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [bubble, setBubble] = useState(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminders, setReminders] = useState([]);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  // Schedule Core → Jake. `undefined` vs `[]` is LOAD-BEARING and is the same
  // structural discriminator jakePack uses for every other collection: `[]` is
  // "loaded and empty", `undefined` is "never loaded". A failed read must
  // therefore NEVER setAppointments([]) — that would turn absence into a
  // confident "no appointments today", the exact phantom-fact class this
  // codebase keeps closing.
  const [appointments, setAppointments] = useState(undefined);
  // A failed CLOUD read and local/demo both leave `appointments` undefined, but
  // they are different facts: only the first warrants telling the user the
  // calendar could not be loaded. Local/demo has no calendar module at all, so
  // a failure notice there would itself be false.
  const [calendarError, setCalendarError] = useState(false);
  // Local/demo is settled from the first render — there is nothing to wait for,
  // so the morning briefing is never delayed there.
  const [calendarSettled, setCalendarSettled] = useState(!isSupabaseConfigured);
  // Campaigns → Jake. Same structural discriminator, same "absence is not
  // emptiness" rule, and the same reason for a separate error flag: a failed
  // cloud read and local/demo both leave `campaigns` undefined but are
  // different facts. Here — unlike the calendar — local/demo genuinely has no
  // campaigns module, so its wording is notConnectedLine, not a failure notice.
  // Campaigns still do NOT gate the morning briefing — nothing waits on this
  // read, and `campaignsPending` must never be wired into that gate (owner
  // decision D1, pinned by a test). It exists for WORDING only: until the read
  // settles, `campaigns` is undefined with the error flag false, which used to
  // be indistinguishable from local/demo and made Jake claim the module was not
  // connected to this account — false in cloud, where the rows are durable and
  // simply had not arrived. TRUE at mount in cloud, FALSE in local/demo where
  // there is nothing to wait for.
  const [campaigns, setCampaigns] = useState(undefined);
  const [campaignsError, setCampaignsError] = useState(false);
  const [campaignsPending, setCampaignsPending] = useState(isSupabaseConfigured);
  // Assets → Jake. Same structural discriminator and the same "absence is not
  // emptiness" rule once more, and the same reason for a separate error flag:
  // a failed cloud read and local/demo both leave `assets` undefined but are
  // different facts. Like campaigns — and unlike the calendar — local/demo
  // genuinely has no asset library, so its wording is notConnectedLine.
  // Assets still do NOT gate the morning briefing, exactly like campaigns, and
  // `assetsPending` must never be wired into that gate (owner decision D1,
  // pinned by a test). Same wording-only purpose and the same initial value:
  // TRUE at mount in cloud, FALSE in local/demo.
  const [assets, setAssets] = useState(undefined);
  const [assetsError, setAssetsError] = useState(false);
  const [assetsPending, setAssetsPending] = useState(isSupabaseConfigured);
  // The store snapshot PLUS the seam-read calendar — what every Jake lane is
  // handed instead of bare `data`. A fresh shallow object per call is
  // deliberate and costs nothing: this file has no useMemo/useCallback at all,
  // and every consumer is an imperative call inside an effect or an async
  // handler, never a render path or a dependency array.
  const jakeData = () => ({
    ...data,
    appointments,
    appointmentsError: calendarError,
    campaigns,
    campaignsError,
    // The THIRD absence, so jakePack can tell "not read yet" apart from "no
    // module here at all". Read only when `campaigns` is unhydrated.
    campaignsPending,
    // Metadata rows only — the seam below never reads the signed `url` that
    // listAssets() attaches, so no fetchable credential can reach the context.
    assets,
    assetsError,
    assetsPending,
  });
  const scrollRef = useRef(null);
  // Creative V2 orchestrator — built once; reads live CRM data via a ref. The
  // adapter inside wraps the FROZEN Creative Director V1 (injected at composition).
  const dataRef = useRef(data);
  dataRef.current = data;
  // S0F.1 (D6) — the creative campaign + production stores are scoped by the
  // stable session user id, so the orchestrator is rebuilt whenever the account
  // changes and a switch always lands on the correct namespace.
  const creativeRef = useRef(null);
  const creativeScopeRef = useRef(null);
  const creativeScopeId = (session && session.user && session.user.id) || '';
  if (!creativeRef.current || creativeScopeRef.current !== creativeScopeId) {
    creativeScopeRef.current = creativeScopeId;
    creativeRef.current = createArtValueCreative({ getData: () => dataRef.current, user: displayName, session });
  }
  const timers = useRef([]);
  const dismissRef = useRef(null);
  const recognitionRef = useRef(null);

  const supportsSTT = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const supportsTTS = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const after = (ms, fn) => { timers.current.push(setTimeout(fn, ms)); };

  useEffect(() => () => { clearTimers(); clearTimeout(dismissRef.current); }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, open]);

  // Persist the conversation so ג'יק keeps memory across sessions (cap last 60).
  // Live progress cards are transient UI state and are excluded — persisting one
  // would restore a stuck in-progress card (no callback/interval) after reload.
  // S0C: chatKeyRef tracks which account's key the in-memory messages belong to.
  // The save effect is guarded by it (and MUST run before the account-switch
  // loader below) so an account switch never writes the previous account's
  // chat into the new account's scoped key.
  const chatKeyRef = useRef(chatKey);
  useEffect(() => {
    if (chatKeyRef.current !== chatKey) return; // messages belong to the previous account
    try { localStorage.setItem(chatKey, JSON.stringify(persistableChatMessages(messages).slice(-60))); } catch { /* ignore */ }
  }, [messages, chatKey]);

  // Account switch (sign-out/in on the same device): load the NEW account's own
  // chat bucket — never the legacy device-global key, never another account's.
  useEffect(() => {
    if (chatKeyRef.current === chatKey) return;
    chatKeyRef.current = chatKey;
    // S0E M2: clear any UNSENT transient composer text (e.g. an onboarding
    // prefill or a typed draft) so Account A's input can never surface for
    // Account B. Chat history itself stays per-account (loaded below).
    setInput('');
    let loaded = null;
    try {
      const raw = localStorage.getItem(chatKey);
      if (raw) { const arr = persistableChatMessages(JSON.parse(raw)); if (arr.length) loaded = arr; }
    } catch { /* ignore */ }
    setMessages(loaded || [{ role: 'assistant', text: GREETING }]);
  }, [chatKey]);

  const clearChat = () => {
    try { localStorage.removeItem(chatKey); } catch { /* ignore */ }
    setMessages([{ role: 'assistant', text: GREETING }]);
  };

  // Confirm / cancel a pending destructive action (delete) inline in the chat.
  const confirmAction = async (idx, d) => {
    // S0B: await the settled { ok } result (DELETE_TASK is a durable confirmed
    // write; other deletes resolve { ok } too) — report success ONLY on ok:true.
    const res = await dispatch(d.action);
    if (res && res.ok === false) {
      setMessages((m) => m.map((mm, i) => (i === idx ? { role: 'assistant', text: 'לא בוצע — השמירה בענן נכשלה. נסה שוב.', system: true } : mm)));
      return;
    }
    toast('בוצע ✓');
    setMessages((m) => m.map((mm, i) => (i === idx ? { role: 'assistant', text: `✓ ${d.label.replace('?', '')} — בוצע.`, system: true } : mm)));
  };
  const cancelAction = (idx) => {
    setMessages((m) => m.map((mm, i) => (i === idx ? { role: 'assistant', text: 'בוטל — לא נמחק כלום.', system: true } : mm)));
  };

  // ---- propose → confirm → execute: approve a previewed batch of actions ----
  // The batch runs ONLY here, on the user's click. Adds/updates apply immediately;
  // any delete inside the batch still surfaces its own explicit confirm (and bulk
  // deletes a code gate) — nothing destructive happens without a second yes.
  const approvePreview = async (idx, actions) => {
    // S0B: capture durable Task write promises so we can AWAIT confirmed cloud
    // persistence before claiming success. Non-task dispatches are unchanged.
    const taskWrites = [];
    const trackingDispatch = (action) => {
      const p = dispatch(action);
      if (action && /_TASK$/.test(action.type)) taskWrites.push(Promise.resolve(p));
      return p;
    };
    const { logs, pendingDeletes, codeGates = [] } = executeActions(actions, data, trackingDispatch, activePack.actions, activePack.entities);
    const taskResults = await Promise.all(taskWrites);
    if (taskResults.some((r) => r && r.ok === false)) {
      // A durable task write did not persist — the store already refetched
      // authoritative state and showed the error. Do NOT claim success.
      setMessages((m) => m.map((mm, i) => (i === idx
        ? { role: 'assistant', system: true, text: '⚠️ חלק מהפעולות לא נשמרו בענן. הנתונים רועננו — בדוק ונסה שוב.' }
        : mm)));
      return;
    }
    if (logs.some((l) => l.startsWith('✓'))) toast('ג׳יק ביצע פעולה ✓');
    setMessages((m) => m.map((mm, i) => (i === idx
      ? { role: 'assistant', system: true, text: logs.length ? logs.join('\n') : '✓ בוצע.' }
      : mm)));
    pendingDeletes.forEach((d) => setMessages((m) => [...m, { role: 'assistant', confirm: d }]));
    codeGates.forEach((g) => setMessages((m) => [...m,
      { role: 'assistant', text: `למחיקת כל ${g.entityLabel} (${g.items.length}) נדרש קוד אישור. 🔒`, system: true },
      { role: 'assistant', gate: g },
    ]));
  };
  const cancelPreview = (idx) => {
    setMessages((m) => m.map((mm, i) => (i === idx ? { role: 'assistant', system: true, text: 'בוטל — לא בוצעה שום פעולה.' } : mm)));
  };

  // ---- creative campaign: select a concept → reuse the propose→confirm card ----
  // Selecting proposes (no mutation); the campaign concept is persisted ONLY on
  // approve. Cancelling leaves the campaign at 'concepts_ready' (no mutation).
  const selectConcept = (campaignId, conceptId, conceptName) => {
    try {
      creativeRef.current.proposeSelection({ campaignId, conceptId });
      setMessages((m) => [...m, { role: 'assistant', campaignSelect: { campaignId, conceptId, conceptName } }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', system: true, text: creativeError(e) }]);
    }
  };
  const approveCampaignSelect = (idx, sel) => {
    try {
      const rec = creativeRef.current.confirmSelection({ campaignId: sel.campaignId, conceptId: sel.conceptId });
      toast('הקונספט נבחר ונשמר ✓');
      setMessages((m) => m.map((mm, i) => (i === idx
        ? { role: 'assistant', system: true, text: `✓ נבחר ונשמר הקונספט "${sel.conceptName}". מצב הקמפיין: ${rec.status === 'concept_selected' ? 'נבחר קונספט' : rec.status}.` }
        : mm)));
      // Offer the next step: turn the chosen concept into a production package.
      setMessages((m) => [...m, { role: 'assistant', productionOffer: { campaignId: sel.campaignId, conceptName: sel.conceptName } }]);
    } catch (e) {
      setMessages((m) => m.map((mm, i) => (i === idx ? { role: 'assistant', system: true, text: creativeError(e) } : mm)));
    }
  };
  const cancelCampaignSelect = (idx) => {
    setMessages((m) => m.map((mm, i) => (i === idx ? { role: 'assistant', system: true, text: 'בוטל — לא נשמר קונספט. הקמפיין נשאר עם שלושת הכיוונים שהוצעו.' } : mm)));
  };

  // ---- production package: generate a DRAFT from the selected concept (read-only,
  // ZERO mutation), show a review card, persist ONLY on approve. Cancel = no mutation.
  const cancelProductionOffer = (idx) => {
    setMessages((m) => m.map((mm, i) => (i === idx ? { role: 'assistant', system: true, text: 'בסדר — לא נוצרה חבילת הפקה.' } : mm)));
  };
  const generateProduction = async (idx, campaignId, conceptName) => {
    const startedAt = Date.now();
    // Replace the offer with a LIVE progress card. State lives here, in the
    // assistant message — the engine only emits events through the onProgress seam.
    setMessages((m) => m.map((mm, i) => (i === idx
      ? { role: 'assistant', productionProgress: { campaignId, conceptName, statuses: {}, startedAt, nowTs: startedAt, error: null, done: false } }
      : mm)));

    // Merge each REAL progress event into the card at idx (latest status per stage).
    const onProgress = (e) => setMessages((m) => m.map((mm, i) => {
      if (i !== idx || !mm.productionProgress) return mm;
      const pp = mm.productionProgress;
      return { ...mm, productionProgress: { ...pp, statuses: { ...pp.statuses, [e.stage]: e.status }, nowTs: e.timestamp } };
    }));

    // Live elapsed clock while running — a real wall-clock readout, not a fake %.
    const tick = setInterval(() => setMessages((m) => m.map((mm, i) => (
      i === idx && mm.productionProgress && !mm.productionProgress.done
        ? { ...mm, productionProgress: { ...mm.productionProgress, nowTs: Date.now() } }
        : mm))), 250);

    try {
      const pkg = await creativeRef.current.generateProductionPackage({ campaignId, onProgress });
      setMessages((m) => m.map((mm, i) => (i === idx
        ? { role: 'assistant', productionReview: { campaignId, conceptName, package: pkg } }
        : mm)));
    } catch (e) {
      // Honest error state: keep the stage list (the failed stage is already marked
      // 'error' via onProgress) and add a concise Hebrew message — no stack traces.
      setMessages((m) => m.map((mm, i) => (i === idx && mm.productionProgress
        ? { ...mm, productionProgress: { ...mm.productionProgress, done: true, nowTs: Date.now(), error: creativeError(e) } }
        : mm)));
    } finally {
      clearInterval(tick);
    }
  };
  const approveProductionSave = (idx, review) => {
    try {
      const rec = creativeRef.current.saveProductionPackage({ campaignId: review.campaignId, pkg: review.package });
      toast('חבילת ההפקה נשמרה ✓');
      setMessages((m) => m.map((mm, i) => (i === idx
        ? { role: 'assistant', system: true, text: `✓ נשמרה חבילת הפקה ל"${review.conceptName}" (קוד ${rec.id}).` }
        : mm)));
    } catch (e) {
      setMessages((m) => m.map((mm, i) => (i === idx ? { role: 'assistant', system: true, text: creativeError(e) } : mm)));
    }
  };
  const cancelProductionSave = (idx) => {
    setMessages((m) => m.map((mm, i) => (i === idx ? { role: 'assistant', system: true, text: 'בוטל — חבילת ההפקה לא נשמרה.' } : mm)));
  };
  const RISK_HE = { low: 'נמוך', medium: 'בינוני', high: 'גבוה' };

  // Bulk delete after a passed code gate: dispatch a DELETE for each picked id
  // and report ONLY what the store confirmed.
  //
  // This mirrors `confirmAction` (the single-delete path) rather than
  // `approvePreview`: it awaits every result and refuses to claim a deletion it
  // did not see settle. Before this, the promises were discarded and the ✓ toast
  // fired in the same tick as the dispatches — so a refused cloud delete still
  // reported success, and the claim persisted into chat history.
  //
  // The dispatch fan-out lives in `executeBulkDelete` (a pure module) so the
  // decision path can be executed by a test with a mocked dispatch rather than
  // pinned by reading this file. It stays PARALLEL — dispatch is called for
  // every id before the first await, exactly the concurrency the pre-fix
  // `forEach` had — preserves id↔result pairing, and never throws.
  const runBulkDelete = async (idx, gate, ids) => {
    const outcome = await executeBulkDelete(dispatch, gate, ids);
    if (outcome.toast) toast(outcome.toast.text, outcome.toast.kind);
    setMessages((m) => m.map((mm, i) => (i === idx
      ? { role: 'assistant', system: true, text: outcome.text }
      : mm)));
  };
  const cancelGate = (idx) => {
    setMessages((m) => m.map((mm, i) => (i === idx ? { role: 'assistant', system: true, text: 'בוטל — לא נמחק כלום.' } : mm)));
  };

  // ---- Offer Campaign brief: open a structured form → generate a READ-ONLY brief.
  // Deterministic, model-free, persistence-free: it calls the offer action through
  // the orchestrator surface, never a store/draftWithJake/chatJake. The form and the
  // result card are TRANSIENT (excluded from chat persistence) — nothing is saved.
  const openOfferForm = () => {
    setMessages((m) => [...m, { role: 'assistant', offerForm: true }]);
  };
  const cancelOfferForm = (idx) => {
    setMessages((m) => m.map((mm, i) => (i === idx ? { role: 'assistant', system: true, text: 'בוטל — לא נוצר בריף הצעה.' } : mm)));
  };
  const submitOfferForm = (idx, form) => {
    const request = buildOfferRequest(form);
    let r;
    try {
      r = creativeRef.current.generateOfferCampaignBrief(request); // deterministic; never throws
    } catch (e) {
      r = { ok: false, errors: [(e && e.message) || 'offer_failed'] };
    }
    if (r && r.ok && r.brief) {
      setMessages((m) => m.map((mm, i) => (i === idx ? { role: 'assistant', offerBrief: r.brief } : mm)));
    } else {
      setMessages((m) => m.map((mm, i) => (i === idx
        ? { role: 'assistant', system: true, text: 'לא הצלחתי לבנות בריף הצעה כרגע 🙏 ודא/י שמילאת סוג עסק, ונסה/י שוב.' }
        : mm)));
    }
  };
  // Periodic speech bubble (only while resting in the corner).
  useEffect(() => {
    if (phase !== 'sit') { setBubble(null); return undefined; }
    const msgs = ['צריך עזרה? 👋', 'רוצה סיכום של היום?', 'יש לקוחות שכדאי לבדוק', 'שאל אותי כל דבר על העסק'];
    let i = 0;
    const show = () => { setBubble(msgs[i % msgs.length]); i += 1; after(5200, () => setBubble(null)); };
    const first = setTimeout(show, 7000);
    const iv = setInterval(show, 32000);
    return () => { clearTimeout(first); clearInterval(iv); };
  }, [phase]);

  // Schedule Core → Jake: read the account's durable appointments ONCE per panel
  // open, in the Jake seam. Deliberately NOT added to api.fetchAll(): that
  // whole-object replacement has already produced two shipped defects, and
  // appointments have no local reducer, no seed and no localStorage fallback.
  // ONE read per open, not per message. Read-only — nothing here writes.
  useEffect(() => {
    if (!open || !isSupabaseConfigured) return undefined;
    let alive = true;
    // ONE decision point for all three outcomes. It used to be three ad-hoc
    // setter groups, and the failure group forgot to drop the rows a previous
    // successful read had left behind — so Jake reported an unverified calendar
    // as current. The rule now lives in a pure module that tests execute.
    const apply = (outcome, rows) => {
      if (!alive) return;
      const next = calendarStateAfterRead(outcome, rows);
      setAppointments(next.appointments);
      setCalendarError(next.error);
      setCalendarSettled(next.settled);
    };
    const timer = setTimeout(() => apply(CALENDAR_OUTCOME.TIMED_OUT), CALENDAR_READ_TIMEOUT_MS);
    listAppointments()
      .then((rows) => apply(CALENDAR_OUTCOME.LOADED, rows))
      // A failure drops the stale rows: only a successful read may leave any.
      .catch(() => apply(CALENDAR_OUTCOME.FAILED))
      .finally(() => { if (alive) clearTimeout(timer); });
    // `alive` is the unmount / account-switch guard: a stale result can never
    // commit after the panel closed, mirroring the S0F.1 gallery race fix.
    return () => { alive = false; clearTimeout(timer); };
  }, [open]);

  // Campaigns → Jake: read the account's durable campaigns ONCE per panel open,
  // in the Jake seam. Deliberately NOT added to api.fetchAll() — same reasoning
  // as the calendar: that whole-object replacement has already produced two
  // shipped defects, and campaigns have no local reducer, no seed and no
  // localStorage fallback to classify. Read-only — nothing here writes, and no
  // Jake op exists for campaigns.
  //
  // A SECOND INDEPENDENT LANE, NOT A FAN-OUT. Its own `alive` guard, its own
  // timer and its own state pair, so neither read can observe, delay or corrupt
  // the other. That independence is the whole reason two seam reads are safe
  // where a merged three-way read would not have been.
  useEffect(() => {
    if (!open || !isSupabaseConfigured) return undefined;
    let alive = true;
    // ONE decision point for all three outcomes, in a pure module the tests
    // EXECUTE — the correction PR #200 made after a failed calendar read left
    // the previously loaded rows behind.
    const apply = (outcome, rows) => {
      if (!alive) return;
      const next = campaignStateAfterRead(outcome, rows);
      setCampaigns(next.campaigns);
      setCampaignsError(next.error);
      // Every outcome settles, so this always clears. Taken from the module's
      // return rather than hardcoded here so the rule is EXECUTED by tests
      // instead of grepped in this file. D2: pending is NOT re-armed on a later
      // panel open — after the first settle the seam keeps showing its
      // last-known rows, unchanged from before this slice.
      setCampaignsPending(!next.settled);
    };
    const timer = setTimeout(() => apply(CAMPAIGN_OUTCOME.TIMED_OUT), CAMPAIGN_READ_TIMEOUT_MS);
    listCampaigns()
      .then((rows) => apply(CAMPAIGN_OUTCOME.LOADED, rows))
      // A failure drops the stale rows: only a successful read may leave any.
      .catch(() => apply(CAMPAIGN_OUTCOME.FAILED))
      .finally(() => { if (alive) clearTimeout(timer); });
    return () => { alive = false; clearTimeout(timer); };
  }, [open]);

  // Assets → Jake: read the account's durable asset library ONCE per panel
  // open, in the Jake seam. Deliberately NOT added to api.fetchAll() — the same
  // reasoning as the calendar and campaigns: that whole-object replacement has
  // already produced two shipped defects, and the gallery is page-owned with no
  // reducer, no seed and no localStorage fallback to classify.
  //
  // READ-ONLY. `listAssets()` is reused EXACTLY as it ships — src/lib/api.js is
  // untouched by this slice — and no Jake asset op exists: nothing here or in
  // jakeAgent.js uploads, deletes, favorites or links an asset.
  //
  // A THIRD INDEPENDENT LANE, NOT A FAN-OUT. Its own `alive` guard, its own
  // timer and its own state pair, so no read can observe, delay or corrupt
  // another. That independence is why a third seam read is as safe as the
  // second, where a merged three-way read would not have been.
  //
  // `listAssets()` also mints a signed URL per row. That field is simply never
  // read: the rows go into `jakeData()` and only jakePack's assetLines() looks
  // at them, and it reads metadata only.
  useEffect(() => {
    if (!open || !isSupabaseConfigured) return undefined;
    let alive = true;
    // ONE decision point for all three outcomes, in a pure module the tests
    // EXECUTE — the same shape the calendar correction (PR #200) established.
    const apply = (outcome, rows) => {
      if (!alive) return;
      const next = assetStateAfterRead(outcome, rows);
      setAssets(next.assets);
      setAssetsError(next.error);
      // Same as campaigns: always clears, taken from the module so tests
      // execute the rule, and never re-armed on a later open (D2).
      setAssetsPending(!next.settled);
    };
    const timer = setTimeout(() => apply(ASSET_OUTCOME.TIMED_OUT), ASSET_READ_TIMEOUT_MS);
    listAssets()
      .then((rows) => apply(ASSET_OUTCOME.LOADED, rows))
      // A failure drops the stale rows: only a successful read may leave any.
      .catch(() => apply(ASSET_OUTCOME.FAILED))
      .finally(() => { if (alive) clearTimeout(timer); });
    return () => { alive = false; clearTimeout(timer); };
  }, [open]);

  // Proactive MORNING BRIEFING: the first time ג׳יק opens each day, he greets the
  // signed-in user with the deterministic briefing (overdue / money owed / today)
  // — unprompted. S0C: the once-a-day marker is scoped per account, so each user
  // gets their own daily brief on a shared device.
  //
  // ⚠️ ORDER IS THE WHOLE POINT HERE. The marker used to be written BEFORE the
  // briefing was composed. Gating on the calendar read without moving it would
  // mean a briefing composed with no calendar still burned the once-a-day
  // marker, and the account would get no second automatic briefing that day.
  // So: wait for the read to SETTLE (resolve, reject or time out), compose, and
  // only then mark. The marker remains the idempotence mechanism, so the extra
  // re-run when `calendarSettled` flips still produces exactly one briefing.
  useEffect(() => {
    if (!open || !calendarSettled) return;
    try {
      const today = new Date().toDateString();
      if (localStorage.getItem(briefDateKey) === today) return;
      const h = new Date().getHours();
      const greet = h < 12 ? 'בוקר טוב' : h < 18 ? 'צהריים טובים' : 'ערב טוב';
      const brief = activePack.briefing(jakeData());
      setMessages((m) => [...m, { role: 'assistant', text: `${greet}, ${displayName}! 👋\n\n${brief}` }]);
      localStorage.setItem(briefDateKey, today);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, calendarSettled]);

  // Click the agent → he stands, walks in, looks around, then the chat opens.
  const handleOpen = () => {
    if (phase !== 'sit') return;
    clearTimers();
    setBubble(null);
    setPhase('walkout');
    after(820, () => setPhase('look'));
    after(1250, () => { setOpen(true); setPhase('chatting'); });
  };

  // Close the chat → reverse: he walks back and sits down again.
  const handleClose = () => {
    clearTimers();
    setOpen(false);
    setReminderOpen(false);
    setPhase('walkback');
    after(850, () => setPhase('sit'));
  };

  const cancelDismiss = () => { clearTimeout(dismissRef.current); };

  // The agent gets up and sits down → the reminder window closes with him.
  const dismissReminder = () => {
    clearTimers();
    clearTimeout(dismissRef.current);
    setReminderOpen(false);
    setPhase('walkback');
    after(850, () => setPhase('sit'));
  };

  // Proactively: stand, walk over, and pop the reminders window (auto-dismiss if untouched).
  const triggerReminder = () => {
    if (open || reminderOpen || phase !== 'sit') return;
    const items = buildReminders(data);
    if (!items.length) return;
    clearTimers();
    setBubble(null);
    setReminders(items);
    setPhase('walkout');
    after(820, () => setPhase('look'));
    after(1250, () => {
      setPhase('idle');
      setReminderOpen(true);
      dismissRef.current = setTimeout(dismissReminder, 12000); // sit back if ignored
    });
  };

  // Studio handoff card click (user click ONLY — never called from render/
  // effects): close the chat and hand the payload to Studio via router state.
  // ImageStudio consumes it one-shot and prefills prompt/mode; generation
  // still happens only when the user clicks Generate there.
  const handleOpenStudioHandoff = (handoff) => {
    if (!handoff || handoff.target !== 'studio' || !handoff.prompt) return;
    setOpen(false);
    navigate('/studio', { state: { jakeHandoff: handoff } });
  };

  // Click a reminder: navigate to its page (and sit back), or open chat about it.
  const handleReminderClick = (r) => {
    if (r.to) {
      clearTimeout(dismissRef.current);
      navigate(r.to);
      dismissReminder();
      return;
    }
    clearTimers();
    clearTimeout(dismissRef.current);
    setReminderOpen(false);
    setOpen(true);
    setPhase('chatting');
    if (r.query) after(300, () => send(r.query));
  };

  // "Open full chat" CTA → keep the agent up and open the chat panel.
  const openFromReminder = (query) => {
    clearTimers();
    clearTimeout(dismissRef.current);
    setReminderOpen(false);
    setOpen(true);
    setPhase('chatting');
    if (query) after(300, () => send(query));
  };

  // Keep latest trigger in a ref so the interval never goes stale.
  const trigRef = useRef(triggerReminder);
  trigRef.current = triggerReminder;
  useEffect(() => {
    const first = setTimeout(() => trigRef.current(), 22000);
    const iv = setInterval(() => trigRef.current(), 30 * 60 * 1000); // every 30 minutes
    return () => { clearTimeout(first); clearInterval(iv); };
  }, []);

  // ---- Voice output (TTS): read the reply aloud when voice mode is on ----
  const speak = (text) => {
    if (!voiceOn || !supportsTTS) return;
    const clean = (text || '')
      .replace(/[*_#`>•]/g, '')
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, '')
      .trim();
    if (!clean) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      const voices = window.speechSynthesis.getVoices() || [];
      const he = voices.find((v) => (v.lang || '').toLowerCase().startsWith('he'));
      const en = voices.find((v) => (v.lang || '').toLowerCase().startsWith('en'));
      u.voice = he || en || null;
      u.lang = he ? 'he-IL' : 'en-US';
      u.rate = 1.02;
      window.speechSynthesis.speak(u);
    } catch { /* ignore */ }
  };

  const toggleVoice = () => {
    if (voiceOn) { try { window.speechSynthesis.cancel(); } catch { /* noop */ } }
    setVoiceOn((v) => !v);
  };

  // ---- Voice input (STT): press-to-talk. Tap to start, speak as long as you
  // want, tap again (or the stop icon) to finish → only THEN it sends. ----
  const toggleMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (listening) { try { recognitionRef.current?.stop(); } catch { /* noop */ } return; }
    const rec = new SR();
    rec.lang = 'he-IL';
    rec.interimResults = true;
    rec.continuous = true; // keep listening across pauses until the user stops
    let finalTxt = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalTxt += r[0].transcript; else interim += r[0].transcript;
      }
      setInput((finalTxt + interim).trim());
    };
    rec.onend = () => {
      setListening(false);
      const t = finalTxt.trim();
      if (t) send(t); // send only when recording actually ends
    };
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };

  const send = async (textArg) => {
    const text = (textArg ?? input).trim();
    if (!text || loading) return;
    const next = [...messages, { role: 'user', text }];
    setMessages(next);
    setInput('');

    // 1) Bulk delete ("מחק את כל המלאי") — DETERMINISTIC (never trust the model with
    // bulk destructive ops). Code gate (123456) → granular checkbox picker. No model.
    const bulkEntity = detectBulkDelete(text, activePack.entities);
    if (bulkEntity) {
      // Beta containment: bulk-deleting a Memory-Only entity (inventory/tasks/
      // projects) can't durably persist in cloud mode — don't show a code gate
      // that implies it will. Durable entities (clients/leads/quotes/tx) proceed.
      const bulkPart = partitionJakeActions([{ op: 'delete_all', entity: bulkEntity }], { isCloudBeta: isSupabaseConfigured, clients: data.clients });
      if (bulkPart.blocked.length) {
        setMessages((m) => [...m, { role: 'assistant', system: true, text: bulkPart.message }]);
        return;
      }
      const gate = buildBulkDeleteGate(bulkEntity, data, activePack.entities);
      if (!gate || !gate.items.length) {
        setMessages((m) => [...m, { role: 'assistant', system: true, text: `אין ${gate ? gate.entityLabel : 'פריטים'} למחיקה — הרשימה ריקה.` }]);
        return;
      }
      setMessages((m) => [...m,
        { role: 'assistant', text: `למחיקת כל ${gate.entityLabel} (${gate.items.length}) נדרש קוד אישור. 🔒` },
        { role: 'assistant', gate },
      ]);
      return;
    }

    // 2) Briefing lane ("מה חשוב / סיכום היום") → deterministic, from the live store.
    if (isBriefingRequest(text) && !hasActionVerb(text)) {
      const brief = activePack.briefing(jakeData());
      setMessages((m) => [...m, { role: 'assistant', text: brief }]);
      speak(brief);
      return;
    }

    // 3) Info lane — numbers from CODE (instant, always correct). Pure question only.
    const dataAns = answerFromData(text, data);
    const actionish = hasActionVerb(text);
    if (dataAns && !actionish) {
      setMessages((m) => [...m, { role: 'assistant', text: dataAns }]);
      speak(dataAns);
      return;
    }

    // 4) Drafting lane — write a letter / WhatsApp / email / reply (prose only).
    // Campaign intent wins over drafting (a campaign brief may mention a channel word).
    if (isDraftRequest(text) && !isCampaignRequest(text)) {
      setLoading(true);
      try {
        const convo = next.filter((mm) => mm.text && !mm.system).slice(-12);
        const { text: draft } = await draftWithJake(convo, withBusinessBrain(activePack.buildContext(jakeData()), text, data.businessProfile));
        const clean = extractActions(draft).clean || draft; // strip any stray actions block
        setMessages((m) => [...m, { role: 'assistant', text: clean }]);
        speak(clean);
        // Studio handoff card (deterministic, model-free): appended AFTER the
        // answer, only when the request resolves to a studio-target payload.
        // S0D containment: the Studio handoff resolves ArtValue-seeded prompts
        // (buildPosterBrief / buildStudioPromptSeed) via the frozen planner/handoff
        // lane. Suppress it in authenticated cloud beta so no signed-in account
        // receives hardcoded ArtValue business facts. Direct /studio + the
        // ImageStudio lane are untouched; local/demo behavior is preserved.
        const handoff = isSupabaseConfigured ? null : studioHandoffFor(text);
        if (handoff) setMessages((m) => [...m, { role: 'assistant', handoff }]);
      } catch (e) {
        setMessages((m) => [...m, { role: 'assistant', system: true, text: gentleError(e) }]);
      } finally { setLoading(false); }
      return;
    }

    // 4.5) Creative campaign lane (Creative V2 slice) — Jake reads CRM context,
    // builds a canonical brief, runs the FROZEN Creative Director V1 through the
    // adapter, and returns three distinct concepts. Selection/persistence reuse the
    // existing confirm card. Nothing is saved until the user approves a concept.
    if (isCampaignRequest(text)) {
      // S0F.1 (D1) — CONTAINED in authenticated cloud beta. The lane seeds the
      // frozen Creative Director with hardcoded ArtValue brand facts, and with no
      // text engine configured in a hosted build every V1 stage returns a demo
      // stub — so a signed-in account would see placeholder concepts presented as
      // real output. We answer truthfully instead: no Creative V1/V2 run, no
      // Gateway call, no campaign/production record. Local/demo is unchanged.
      if (isSupabaseConfigured) {
        setMessages((m) => [...m, { role: 'assistant', system: true, text: BETA_MESSAGES.creativeCampaignUnavailable }]);
        speak(BETA_MESSAGES.creativeCampaignUnavailable);
        return;
      }
      setLoading(true);
      setMessages((m) => [...m, { role: 'assistant', system: true, text: '🎯 בודק את נתוני העסק, בונה בריף ומריץ את מנהל הקריאייטיב — ייקח רגע…' }]);
      try {
        const creative = creativeRef.current;
        const need = creative.analyzeMarketingNeed(text);
        const { request, campaignId } = creative.createCampaignBrief({ need });
        const _t0 = Date.now();
        const { result, diversity, critique } = await creative.runCreativeDirector({ request, campaignId });
        // Debug-only capture (off in production unless window.__JAKE_DEBUG is set):
        // lets verification read the exact canonical result + diversity + timing.
        if (typeof window !== 'undefined' && window.__JAKE_DEBUG) {
          try { window.__creativeLastRun = { ms: Date.now() - _t0, result, diversity, request }; } catch { /* noop */ }
        }
        setMessages((m) => [...m, {
          role: 'assistant',
          // result.* is the ORIGINAL V1 output (untouched): original concept array,
          // original order, original recommendedConceptId — kept for auditability.
          // `critique` is the additive critic view; the renderer uses it only when
          // critique.ok === true, otherwise it falls back to the V1 fields above.
          campaign: { campaignId, strategy: result.strategy, concepts: result.concepts, recommendedConceptId: result.recommendedConceptId, critique },
        }]);
      } catch (e) {
        if (typeof window !== 'undefined' && window.__JAKE_DEBUG) {
          try { window.__creativeLastError = { code: e && e.code, message: e && e.message, details: e && e.details }; } catch { /* noop */ }
        }
        setMessages((m) => [...m, { role: 'assistant', system: true, text: creativeError(e) }]);
      } finally { setLoading(false); }
      return;
    }

    // 5) Chat → PROPOSE → CONFIRM → EXECUTE. The model PROPOSES actions; nothing
    // touches the store until the user approves the card. (The frozen Creative
    // engine is untouched — this is pure Jake orchestration.)
    setLoading(true);
    try {
      // Caller-owned conversation selection (M2 J2 hotfix): same textual/non-
      // system candidates + same last-14 window as always, then the window
      // OPENS on the first user turn — so a proactive assistant briefing stays
      // visible in the UI but never becomes an assistant-first model history
      // (the deployed server chat contract requires user-first; chatJake maps
      // whatever it receives byte-exactly and repairs nothing).
      const convo = selectJakeChatHistory(next);
      const { text: reply } = await chatJake(convo, withBusinessBrain(activePack.buildContext(jakeData()), text, data.businessProfile));
      let { clean, actions } = extractActions(reply); // eslint-disable-line prefer-const

      // Talked about doing something but emitted no block → force a proposal (2nd pass).
      if (!actions.length && claimsActionText(clean || reply)) {
        try {
          const forced = await forceActionsJake(text, activePack.buildContext(jakeData()));
          const r2 = extractActions(forced);
          if (r2.actions.length) actions = r2.actions;
        } catch { /* it was just talk — leave as prose */ }
      }

      // Beta false-success containment (S0A): split durable actions (allowed to
      // propose→confirm→execute) from Memory-Only / unknown / non-durable-income
      // ones. Blocked actions never reach a confirmation card, never execute, and
      // never yield a fake ✓.
      const { allowed: allowedActions, blocked, message: betaMsg } = partitionJakeActions(actions, { isCloudBeta: isSupabaseConfigured, clients: data.clients });

      // S0C: a Jake add_task with NO explicit assignee follows the ACTIVE
      // account. Enrich ONCE here — the same enriched objects feed the
      // proposal card (preview.actions) and, on approval, executeActions —
      // so what the user approves is exactly what persists. An explicit
      // assignee from the user is never overridden.
      const enrichedActions = allowedActions.map((a) => (
        a && a.op === 'add_task' && !(typeof a.assignee === 'string' && a.assignee.trim())
          ? { ...a, assignee: displayName }
          : a
      ));

      if (enrichedActions.length) {
        // MIXED-BATCH SAFETY: when the same reply also contains blocked actions,
        // suppress the model's free prose entirely — it may claim the blocked
        // action completed ("הוספתי לקוח ומשימה"). The deterministic confirm card
        // (describeActions) only ever describes the ALLOWED durable actions, so it
        // cannot claim a blocked one. With no blocked actions, keep the normal
        // lead-in prose (stripped of any premature ✓).
        if (!blocked.length) {
          const proposal = (clean || '').replace(/\s*[✓✅]\s*/g, ' ').trim();
          if (proposal) { setMessages((m) => [...m, { role: 'assistant', text: proposal }]); speak(proposal); }
        }
        const items = describeActions(enrichedActions, data);
        setMessages((m) => [...m, { role: 'assistant', preview: { actions: enrichedActions, items } }]);
      } else if (!blocked.length) {
        // Pure prose / info answer — no actions at all.
        const body = clean || reply;
        setMessages((m) => [...m, { role: 'assistant', text: body }]);
        speak(body);
      }
      // Beta-unavailable / unknown mutation(s): calm message; nothing executed,
      // no fake activity, no success/completed claim, no confirmation card.
      if (blocked.length) {
        setMessages((m) => [...m, { role: 'assistant', system: true, text: betaMsg }]);
        speak(betaMsg);
      }

      // Studio handoff card (deterministic, model-free): appended AFTER the
      // answer, only when the request resolves to a studio-target payload.
      // S0D containment: suppressed in authenticated cloud beta (the handoff
      // prompt is ArtValue-seeded via the frozen planner/handoff lane). Direct
      // /studio + ImageStudio are untouched; local/demo behavior is preserved.
      const handoff = isSupabaseConfigured ? null : studioHandoffFor(text);
      if (handoff) setMessages((m) => [...m, { role: 'assistant', handoff }]);

      // Compound "command + number-question": append the authoritative store figure.
      if (dataAns && actionish) {
        setMessages((m) => [...m, { role: 'assistant', system: true, text: `⚙️ ${dataAns}` }]);
      }
    } catch (e) {
      // GRACEFUL DEGRADATION — the user NEVER sees a raw technical error.
      const calm = answerFromData(text, data);
      if (calm) setMessages((m) => [...m, { role: 'assistant', text: calm }]);
      else setMessages((m) => [...m, { role: 'assistant', system: true, text: gentleError(e) }]);
    } finally {
      setLoading(false);
    }
  };

  // Let other parts of the app drive Jake — the Demo Mode dispatches `jake:open`
  // to pop the chat and `jake:ask` (detail = prompt) to run a live example.
  const sendRef = useRef(send);
  sendRef.current = send;
  // S0E M2: live composer value for the additive jake:prefill seam (read without
  // a stale closure). inputRef never sends — the prefill handler can only open
  // Jake and set the EMPTY composer.
  const inputRef = useRef(input);
  inputRef.current = input;
  useEffect(() => {
    const forceOpen = () => { clearTimers(); setBubble(null); setReminderOpen(false); setOpen(true); setPhase('chatting'); };
    const onOpen = () => forceOpen();
    const onAsk = (e) => { forceOpen(); const q = e?.detail; if (q) after(360, () => sendRef.current(q)); };
    // S0E M2: additive editable prefill — opens Jake + fills the EMPTY composer
    // WITHOUT sending (no send/chatJake/draftWithJake/forceActionsJake/dispatch/
    // fetch, no message append, no history change). Existing non-empty composer
    // text is preserved verbatim. Exactly one seam; the handler opens Jake itself.
    const onPrefill = (e) => applyJakePrefill(e && e.detail, { open: forceOpen, getInput: () => inputRef.current, setInput });
    window.addEventListener('jake:open', onOpen);
    window.addEventListener('jake:ask', onAsk);
    window.addEventListener('jake:prefill', onPrefill);
    return () => {
      window.removeEventListener('jake:open', onOpen);
      window.removeEventListener('jake:ask', onAsk);
      window.removeEventListener('jake:prefill', onPrefill);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const walking = phase === 'walkout' || phase === 'walkback';
  const sprite = phase === 'sit' ? warriorSit : walking ? warriorWalk : warriorStand;

  return (
    <>
      <AnimatePresence>
        {phase === 'sit' && bubble && (
          <motion.button
            className="ai-bubble"
            onClick={handleOpen}
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.9 }}
            transition={{ duration: 0.25 }}
          >
            {bubble}
          </motion.button>
        )}
      </AnimatePresence>

      <button
        className={`agent p-${phase}`}
        onClick={handleOpen}
        aria-label="העוזר האישי — לחץ לשיחה"
        title="העוזר שלך — לחץ לשיחה"
      >
        <span className="agent-walker">
          <span className="agent-facing">
            <img src={sprite} className="agent-body" alt="" draggable={false} />
          </span>
        </span>
      </button>

      <AnimatePresence>
        {reminderOpen && (
          <motion.div
            className="agent-reminder card"
            onMouseEnter={cancelDismiss}
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="agent-reminder-head">
              <span className="row gap-2"><Icon name="spark" size={15} style={{ color: 'var(--lime-deep)' }} /> תזכורות מהסוכן</span>
              <button className="ar-close" onClick={dismissReminder} aria-label="סגירה"><Icon name="x" size={15} /></button>
            </div>
            <div className="agent-reminder-list">
              {reminders.map((r) => (
                <button key={r.id} className="agent-reminder-item" onClick={() => handleReminderClick(r)}>
                  <span className="ar-ico"><Icon name={r.icon} size={15} /></span>
                  <span className="ar-txt"><b>{r.text}</b>{r.sub ? <span className="dim"> · {r.sub}</span> : null}</span>
                  <Icon name="chevronL" size={14} />
                </button>
              ))}
            </div>
            <button className="agent-reminder-cta" onClick={() => openFromReminder('')}><Icon name="robot" size={14} /> פתח צ'אט מלא</button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <>
            <motion.div className="ai-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={handleClose} />
            <motion.div
              className="ai-panel card"
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.96 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="ai-head">
                <div className="row gap-3">
                  <span className="ai-avatar"><img src={warriorStand} className="ai-avatar-img" alt="" /></span>
                  <div>
                    <div style={{ fontWeight: 800 }}>ג׳יק</div>
                    {/* Truthful AI status (M2 J3C S1): the released Jake lanes are served
                        exclusively by the server-owned AI Gateway, so the old auto/cloud/local
                        brain selector is obsolete. Non-clickable status only — no onClick, no
                        localStorage write, no model/provider name. */}
                    <span className="ai-brain" style={{ cursor: 'default' }}>
                      <span className={`ai-brain-dot ${isSupabaseConfigured ? 'cloud' : ''}`} />
                      {isSupabaseConfigured ? 'AI מאובטח' : 'מצב הדגמה'}
                    </span>
                  </div>
                </div>
                <div className="row gap-1">
                  <button className="btn btn-ghost btn-icon" onClick={clearChat} aria-label="שיחה חדשה" title="שיחה חדשה (איפוס זיכרון)">
                    <Icon name="refresh" size={17} />
                  </button>
                  {supportsTTS && (
                    <button className={`btn btn-ghost btn-icon ${voiceOn ? 'voice-on' : ''}`} onClick={toggleVoice} aria-label="מענה קולי" title={voiceOn ? 'מענה קולי פעיל' : 'הפעל מענה קולי'}>
                      <Icon name={voiceOn ? 'volume' : 'volumeOff'} size={18} />
                    </button>
                  )}
                  <button className="btn btn-ghost btn-icon" onClick={handleClose} aria-label="סגירה"><Icon name="x" size={18} /></button>
                </div>
              </div>

              <div className="ai-messages" ref={scrollRef}>
                {messages.map((m, i) => (
                  m.gate ? (
                    <GateCard key={i} gate={m.gate} onDelete={(ids) => runBulkDelete(i, m.gate, ids)} onCancel={() => cancelGate(i)} />
                  ) : m.confirm ? (
                    <div key={i} className="ai-msg assistant ai-confirm">
                      <div className="ai-confirm-q">{m.confirm.label}</div>
                      <div className="ai-confirm-actions">
                        <button className="btn btn-sm ai-confirm-yes" onClick={() => confirmAction(i, m.confirm)}>אשר מחיקה</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => cancelAction(i)}>ביטול</button>
                      </div>
                    </div>
                  ) : m.handoff && m.handoff.target === 'studio' && m.handoff.prompt ? (
                    <div key={i} className="ai-msg assistant ai-preview">
                      <div className="ai-preview-q">🎨 {m.handoff.title}</div>
                      <p className="muted" style={{ margin: '4px 0 4px', fontSize: '0.82rem', lineHeight: 1.6 }}>{m.handoff.description}</p>
                      <p className="dim" style={{ margin: '0 0 8px', fontSize: '0.74rem', lineHeight: 1.5 }}>הפרומפט מוכן — היצירה תתחיל רק אחרי לחיצה על Generate ב-Studio.</p>
                      <div className="ai-confirm-actions">
                        <button className="btn btn-sm ai-approve" onClick={() => handleOpenStudioHandoff(m.handoff)}>פתח ב-Studio עם הפרומפט מוכן</button>
                      </div>
                    </div>
                  ) : m.preview ? (
                    <div key={i} className="ai-msg assistant ai-preview">
                      <div className="ai-preview-q">📋 לאישור — אבצע את הפעולות הבאות:</div>
                      <ul className="ai-preview-list">
                        {m.preview.items.map((it, k) => <li key={k}>{it}</li>)}
                      </ul>
                      <div className="ai-confirm-actions">
                        <button className="btn btn-sm ai-approve" onClick={() => approvePreview(i, m.preview.actions)}>אשר ובצע</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => cancelPreview(i)}>ביטול</button>
                      </div>
                    </div>
                  ) : m.campaign ? (
                    (() => {
                      const camp = m.campaign;
                      const crit = camp.critique;
                      // Use the critic view ONLY when it succeeded. Otherwise fall back to
                      // the EXACT original V1 order + V1 recommendation (clarification #1).
                      const useCritic = !!(crit && crit.ok === true && Array.isArray(crit.ranking) && crit.ranking.length);
                      const byId = new Map((camp.concepts || []).map((c) => [c.id, c]));
                      const evalById = useCritic ? new Map((crit.evaluations || []).map((e) => [e.conceptId, e])) : null;
                      const rejectedSet = useCritic ? new Set((crit.rejected || []).map((r) => r.conceptId)) : new Set();
                      const orderedIds = (useCritic ? crit.ranking : (camp.concepts || []).map((c) => c.id)).filter((id) => byId.has(id));
                      const badgeId = useCritic ? crit.recommendedConceptId : camp.recommendedConceptId;
                      const survivorIds = orderedIds.filter((id) => !rejectedSet.has(id));
                      const rejectedIds = orderedIds.filter((id) => rejectedSet.has(id));
                      const renderCard = (id, n, isRejected) => {
                        const c = byId.get(id);
                        const ev = evalById ? evalById.get(id) : null;
                        const demoted = !!(ev && ev.demoted);
                        const note = useCritic ? criticNote(ev) : '';
                        return (
                          <div key={id} className={`ai-camp-card ${id === badgeId ? 'rec' : ''} ${demoted ? 'demoted' : ''} ${isRejected ? 'rejected' : ''}`}>
                            <div className="ai-camp-head">
                              <span className="ai-camp-n">{n}</span>
                              <b>{c.name}</b>
                              {id === badgeId && <span className="ai-camp-badge">מומלץ</span>}
                              {demoted && <span className="ai-camp-badge demote">מוחלש</span>}
                            </div>
                            <div className="ai-camp-row"><span>זווית</span> {c.strategicAngle}</div>
                            <div className="ai-camp-row"><span>טון</span> {c.emotionalTone}</div>
                            <div className="ai-camp-row"><span>כותרת</span> {c.headlineDirection}</div>
                            <div className="ai-camp-row"><span>ויזואל</span> {c.visualDirection}</div>
                            <div className="ai-camp-why">💡 {c.whyItWorks}</div>
                            {note && <div className="ai-camp-critic">🧪 {note}</div>}
                            <div className="ai-camp-scores">מקוריות {c.originalityScore} · התאמה למותג {c.brandFitScore}</div>
                            {!isRejected && <button className="btn btn-sm ai-approve ai-camp-pick" onClick={() => selectConcept(camp.campaignId, id, c.name)}>בחר/י קונספט זה</button>}
                          </div>
                        );
                      };
                      return (
                        <div key={i} className="ai-msg assistant ai-campaign">
                          <div className="ai-camp-strategy">
                            <div className="ai-camp-key">🎯 {camp.strategy.keyMessage}</div>
                            <div className="ai-camp-dir">{camp.strategy.strategicDirection}</div>
                          </div>
                          <div className="ai-camp-intro">הכנתי שלושה כיווני קמפיין שונים — בחר/י אחד:</div>
                          {survivorIds.map((id, k) => renderCard(id, k + 1, false))}
                          {rejectedIds.length > 0 && (
                            <details className="ai-camp-rejected">
                              <summary>קונספטים שנדחו ({rejectedIds.length})</summary>
                              {rejectedIds.map((id, k) => renderCard(id, survivorIds.length + k + 1, true))}
                            </details>
                          )}
                        </div>
                      );
                    })()
                  ) : m.campaignSelect ? (
                    <div key={i} className="ai-msg assistant ai-preview">
                      <div className="ai-preview-q">📋 לאישור — לבחור ולשמור את הקונספט:</div>
                      <ul className="ai-preview-list"><li>✦ {m.campaignSelect.conceptName}</li></ul>
                      <div className="ai-confirm-actions">
                        <button className="btn btn-sm ai-approve" onClick={() => approveCampaignSelect(i, m.campaignSelect)}>אשר ושמור</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => cancelCampaignSelect(i)}>ביטול</button>
                      </div>
                    </div>
                  ) : m.productionOffer ? (
                    <div key={i} className="ai-msg assistant ai-preview">
                      <div className="ai-preview-q">🎬 הקונספט נבחר. ליצור חבילת הפקה (ליבה יצירתית + קופי + בריף ויזואלי + פרומפט)?</div>
                      <div className="ai-confirm-actions">
                        <button className="btn btn-sm ai-approve" onClick={() => generateProduction(i, m.productionOffer.campaignId, m.productionOffer.conceptName)}>צור חבילת הפקה</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => cancelProductionOffer(i)}>לא עכשיו</button>
                      </div>
                    </div>
                  ) : m.productionProgress ? (
                    (() => {
                      const pp = m.productionProgress;
                      // Canonical order from the engine's single source of truth;
                      // `rewrite` is hidden until it has actually been emitted.
                      const order = PRODUCTION_STAGE_ORDER.filter((s) => s !== 'rewrite' || pp.statuses.rewrite);
                      const elapsed = Math.max(0, (pp.nowTs - pp.startedAt) / 1000);
                      const errored = order.find((s) => pp.statuses[s] === 'error');
                      return (
                        <div key={i} className="ai-msg assistant ai-campaign">
                          <div className="ai-camp-strategy">
                            <div className="ai-camp-key">🎬 מכין חבילת הפקה — {pp.conceptName}</div>
                          </div>
                          <div className="ai-camp-card">
                            {order.map((s) => {
                              const st = pp.statuses[s] || 'pending';
                              return (
                                <div key={s} className="ai-camp-row" style={{ opacity: st === 'pending' ? 0.4 : 1, color: st === 'error' ? '#b00' : st === 'fallback' ? '#a86b00' : undefined }}>
                                  <span>{st === 'active'
                                    ? <span className="ai-typing"><i /><i /><i /></span>
                                    : st === 'done' ? '✓' : st === 'error' ? '✗' : st === 'fallback' ? '⚠' : '○'}</span> {PRODUCTION_STAGES[s]}{st === 'fallback' ? ' (תרגום חלופי)' : ''}
                                </div>
                              );
                            })}
                          </div>
                          <div className="ai-camp-scores">⏱️ {elapsed.toFixed(1)} שניות</div>
                          {pp.error ? (
                            <div className="ai-camp-card" style={{ color: '#b00' }}>
                              <div className="ai-camp-row"><span>⚠️ שגיאה</span> {errored ? `בשלב "${PRODUCTION_STAGES[errored]}". ` : ''}{pp.error}</div>
                              <div className="ai-confirm-actions">
                                <button className="btn btn-sm ai-approve" onClick={() => generateProduction(i, pp.campaignId, pp.conceptName)}>נסה שוב</button>
                                <button className="btn btn-sm btn-ghost" onClick={() => cancelProductionOffer(i)}>סגור</button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })()
                  ) : m.productionReview ? (
                    (() => {
                      const p = m.productionReview.package;
                      const cc = p.creativeCore; const risk = cc.genericityRisk;
                      return (
                        <div className="ai-msg assistant ai-campaign">
                          <div className="ai-camp-strategy">
                            <div className="ai-camp-key">🎬 חבילת הפקה — {m.productionReview.conceptName}</div>
                          </div>
                          <div className="ai-camp-card">
                            <div className="ai-camp-row"><span>מנגנון יצירתי</span> {cc.creativeMechanism}</div>
                            <div className="ai-camp-row"><span>מטאפורה ויזואלית</span> {cc.visualMetaphor}</div>
                            <div className="ai-camp-row"><span>אובייקט גיבור</span> {cc.heroObject}</div>
                            <div className="ai-camp-row"><span>מנגנון הפתעה</span> {cc.surpriseMechanism}</div>
                            <div className="ai-camp-row"><span>וו זיכרון</span> {cc.memoryHook}</div>
                            <div className="ai-camp-row"><span>סיכון גנריות</span> {RISK_HE[risk.level] || risk.level} ({risk.score}){risk.reasons.length ? ` · ${risk.reasons.join(', ')}` : ''}</div>
                          </div>
                          <div className="ai-camp-card">
                            <div className="ai-camp-row"><span>כותרת</span> {p.copyPackage.headline}</div>
                            <div className="ai-camp-row"><span>תת-כותרת</span> {p.copyPackage.subline}</div>
                            <div className="ai-camp-row"><span>קריאה לפעולה</span> {p.copyPackage.cta}</div>
                            {p.copyPackage.bodyVariants?.length ? <div className="ai-camp-why">📝 {p.copyPackage.bodyVariants[0]}</div> : null}
                            {p.copyPackage.copyWarning ? <div className="ai-camp-row" style={{ color: '#b00' }}><span>⚠️ אזהרת קופי</span> {p.copyPackage.copyWarning}</div> : null}
                          </div>
                          <div className="ai-camp-card">
                            <div className="ai-camp-row"><span>בריף ויזואלי</span> {[p.visualBrief.vibe, p.visualBrief.compositionNote].filter(Boolean).join(' · ')}</div>
                            <div className="ai-camp-row"><span>פלטה</span> {(p.visualBrief.palette || []).join(', ')}</div>
                            <div className="ai-camp-row"><span>Image prompt</span> {p.imagePrompt.promptEn}</div>
                            <div className="ai-camp-row"><span>Negative</span> {p.imagePrompt.negativeEn}</div>
                          </div>
                          <div className="ai-confirm-actions">
                            <button className="btn btn-sm ai-approve" onClick={() => approveProductionSave(i, m.productionReview)}>אשר ושמור</button>
                            <button className="btn btn-sm btn-ghost" onClick={() => cancelProductionSave(i)}>ביטול</button>
                          </div>
                        </div>
                      );
                    })()
                  ) : m.offerForm ? (
                    <OfferBriefForm key={i} onSubmit={(form) => submitOfferForm(i, form)} onCancel={() => cancelOfferForm(i)} />
                  ) : m.offerBrief ? (
                    (() => {
                      const b = m.offerBrief;
                      return (
                        <div key={i} className="ai-msg assistant ai-campaign">
                          <div className="ai-camp-strategy">
                            <div className="ai-camp-key">📣 בריף הצעה — {b.offer.service}</div>
                            <div className="ai-camp-dir">{b.prospect.businessName ? `${b.prospect.businessName} · ` : ''}{b.prospect.businessType}</div>
                          </div>

                          <div className="ai-camp-card">
                            <div className="ai-camp-head"><b>אבחון</b></div>
                            <div className="ai-camp-row"><span>הקשר</span> {b.diagnosis.context}</div>
                            {b.diagnosis.businessPain.map((p, k) => <div key={k} className="ai-camp-row"><span>כאב</span> {p}</div>)}
                          </div>

                          <div className="ai-camp-card">
                            <div className="ai-camp-head"><b>הצעה</b></div>
                            <div className="ai-camp-row"><span>שירות</span> {b.offer.service}</div>
                            <div className="ai-camp-row"><span>ערך</span> {b.offer.valueProposition}</div>
                            <div className="ai-camp-row"><span>כלול</span> {b.offer.whatsIncluded.join(', ')}</div>
                            <div className="ai-camp-row"><span>הוכחות</span> {b.offer.proofPoints.join(', ')}</div>
                          </div>

                          <div className="ai-camp-card">
                            <div className="ai-camp-head"><b>זווית קמפיין</b></div>
                            <div className="ai-camp-row"><span>זווית</span> {b.campaignAngle.angle}</div>
                            <div className="ai-camp-row"><span>מסר</span> {b.campaignAngle.keyMessage}</div>
                            <div className="ai-camp-why">💡 {b.campaignAngle.hook}</div>
                          </div>

                          <div className="ai-camp-card">
                            <div className="ai-camp-head"><b>וואטסאפ</b></div>
                            <div className="ai-camp-row"><span>פתיח</span> {b.whatsappOutreach.opener}</div>
                            <div className="ai-camp-row"><span>גוף</span> {b.whatsappOutreach.body}</div>
                            <div className="ai-camp-row"><span>קריאה לפעולה</span> {b.whatsappOutreach.cta}</div>
                          </div>

                          <div className="ai-camp-card">
                            <div className="ai-camp-head"><b>בריף פוסטר / מודעה</b></div>
                            <div className="ai-camp-row"><span>כותרת</span> {b.posterAdBrief.headline}</div>
                            <div className="ai-camp-row"><span>תת-כותרת</span> {b.posterAdBrief.subheadline}</div>
                            <div className="ai-camp-row"><span>אובייקט גיבור</span> {b.posterAdBrief.heroIdea}</div>
                            <div className="ai-camp-row"><span>להימנע</span> {b.posterAdBrief.avoidList.join(', ')}</div>
                          </div>

                          <div className="ai-camp-card">
                            <div className="ai-camp-head"><b>דף נחיתה</b></div>
                            <div className="ai-camp-row"><span>כותרת</span> {b.landingHero.headline}</div>
                            <div className="ai-camp-row"><span>תת-כותרת</span> {b.landingHero.subheadline}</div>
                            <div className="ai-camp-row"><span>קריאה לפעולה</span> {b.landingHero.cta}</div>
                            <div className="ai-camp-row"><span>מקטעים</span> {b.landingHero.sections.join(' · ')}</div>
                          </div>

                          <div className="ai-camp-card">
                            <div className="ai-camp-head"><b>פולואפ</b></div>
                            <div className="ai-camp-row"><span>זווית</span> {b.followUp.angle}</div>
                            <div className="ai-camp-why">📩 {b.followUp.message}</div>
                          </div>

                          <div className="ai-camp-card">
                            <div className="ai-camp-head"><b>התנגדויות</b></div>
                            {b.objectionHandling.map((o, k) => (
                              <div key={k} className="ai-camp-row"><span>{o.objection}</span> {o.reply}</div>
                            ))}
                          </div>

                          <div className="ai-camp-card">
                            <div className="ai-camp-head"><b>כיוון ויזואלי</b></div>
                            <div className="ai-camp-row"><span>מוד</span> {b.visualDirection.mood}</div>
                            <div className="ai-camp-row"><span>אובייקט גיבור</span> {b.visualDirection.heroIdea}</div>
                            {b.visualDirection.palette && b.visualDirection.palette.length ? <div className="ai-camp-row"><span>פלטה</span> {b.visualDirection.palette.join(', ')}</div> : null}
                          </div>

                          {b.risks && b.risks.length ? (
                            <div className="ai-camp-card">
                              <div className="ai-camp-head"><b>סיכונים</b></div>
                              {b.risks.map((rk, k) => (
                                <div key={k} className="ai-camp-row"><span>{RISK_HE[rk.level] || rk.level}</span> {rk.note}</div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })()
                  ) : (
                    <div key={i} className={`ai-msg ${m.role} ${m.error ? 'err' : ''} ${m.system ? 'ai-action' : ''}`}>{m.text}</div>
                  )
                ))}
                {loading && (
                  <div className="ai-msg assistant"><span className="ai-typing"><i /><i /><i /></span></div>
                )}
                {messages.length <= 1 && !loading && (
                  <div className="ai-suggestions">
                    {SUGGESTIONS.map((s) => <button key={s} className="ai-sugg" onClick={() => send(s)}>{s}</button>)}
                  </div>
                )}
              </div>

              <div className="ai-suggestions" style={{ padding: '0 12px 8px' }}>
                {/* S0F.1 (D3): the offer-brief surface is built on the ArtValue offer
                    preset, so it is hidden in authenticated cloud beta. The preset
                    itself is unchanged and local/demo keeps the chip. */}
                {!isSupabaseConfigured && <button className="ai-sugg" onClick={openOfferForm}>📣 בנה בריף הצעה ללקוח</button>}
              </div>

              <div className="ai-input">
                {supportsSTT && (
                  <button className={`ai-mic ${listening ? 'rec' : ''}`} onClick={toggleMic} aria-label={listening ? 'עצור הקלטה' : 'הקלטה קולית'} title={listening ? 'מקליט… לחץ לעצירה' : 'הקלטה קולית'}>
                    <Icon name={listening ? 'stopSq' : 'mic'} size={18} />
                  </button>
                )}
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
                  placeholder={listening ? 'מקשיב…' : 'כתוב או דבר…'}
                  aria-label="הודעה"
                />
                <button className="ai-send" onClick={() => send()} disabled={!input.trim() || loading} aria-label="שליחה">
                  <Icon name="send" size={18} />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

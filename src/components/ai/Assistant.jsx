import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../../store/store.jsx';
import Icon from '../ui/Icon.jsx';
import warriorSit from '../../assets/warrior_sit.png';
import warriorStand from '../../assets/warrior_stand.png';
import warriorWalk from '../../assets/warrior_walk.png';
import { chatJake, forceActionsJake, draftWithJake, jakeBrainLabel, jakeBrainPref, setJakeBrain, isGeminiConfigured } from '../../lib/gemini.js';
import { extractActions, executeActions, describeActions, detectBulkDelete, buildBulkDeleteGate } from '../../lib/jakeAgent.js';
import { activePack } from '../../lib/jakePack.js';
import { createArtValueCreative } from '../../creative/v2/createArtValueCreative.js';
import { dashboardKpis, inventoryTotals, lowStockItems } from '../../lib/calc.js';
import { formatCurrency } from '../../lib/format.js';

const GREETING = 'שלום! אני ג׳יק, העוזר האישי שלך. אני יודע כל מספר במערכת, יכול לנסח לך מכתבים והודעות, ולבצע פעולות — כל פעולה אציג לך לאישור לפני הביצוע. מה נעשה?';
const SUGGESTIONS = ['מה חשוב היום?', 'הוסף לקוח דני כהן, ליד, 3000 ₪', 'נסח הודעת וואטסאפ ללקוח'];
const CHAT_KEY = 'artvalue_jake_chat';
// Authorization code required before any BULK delete (e.g. "מחק את כל המלאי").
const CONFIRM_CODE = '123456';

// Code-gated bulk-delete card: step 1 asks for the auth code; only on the correct
// code does it reveal step 2 — a checkbox picker of exactly what to delete. Holds
// its own transient UI state (code text, selection) so it survives re-renders.
function GateCard({ gate, onDelete, onCancel }) {
  const [stage, setStage] = useState('code');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(() => new Set(gate.items.map((i) => i.id)));

  const submitCode = () => {
    if (code.trim() === CONFIRM_CODE) { setError(''); setStage('select'); }
    else { setError('קוד שגוי. נסה שוב.'); setCode(''); }
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
        <button className="btn btn-sm ai-confirm-yes" disabled={!selected.size} onClick={() => onDelete([...selected])}>מחק נבחרים ({selected.size})</button>
        <button className="btn btn-sm btn-ghost" onClick={onCancel}>ביטול</button>
      </div>
    </div>
  );
}

// Does the text contain an explicit action verb (add/update/delete/…)? If so the
// model must run to emit the action block — we never fully swallow it. (\b word
// boundaries don't work around Hebrew letters, so anchor on start/whitespace.)
function hasActionVerb(text) {
  return /(?:^|\s)(תעדכן|עדכן|תשנה|שנה|תוסיף|הוסף|תמחק|מחק|תסיר|הסר|תוריד|הורד|תרשום|רשום|רשם|תסמן|סמן|תעביר|העבר|תבנה|בנה)/.test(String(text || ''));
}

// Is this a WRITING request (letter / WhatsApp / email / reply)? → drafting lane
// (prose only, no actions). Excludes "הצעת מחיר" which is a real add_quote action.
function isDraftRequest(text) {
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
  const msg = String(e?.message || '');
  if (/Ollama|מקומי|המנוע|עולה אחרי/i.test(msg)) return '⚠️ המוח המקומי עדיין עולה (Ollama). תן/י לו ~30 שניות ונסה/י שוב — או עברו למוח הענן דרך כפתור המוח למעלה.';
  return 'מצטער, לא הצלחתי לעבד את זה כרגע 🙏 נסה/י שוב בעוד רגע, או לנסח קצת אחרת.';
}

// Is this a CREATIVE CAMPAIGN request (→ Creative V2 slice: brief → adapter → V1)?
function isCampaignRequest(text) {
  const t = String(text || '');
  return /קמפיי?ן/.test(t)
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

// Numbers come from CODE, never from the model. For a recognized computed-number
// QUESTION (e.g. "מה ערך המלאי") return the answer straight from the live store.
// Question-anchored (needs מה/כמה/?/תגיד) so it never fires on a bare command like
// "תעדכן ערך המלאי ל-5000". Used two ways in send(): a pure question is answered
// directly (model skipped); a compound "command + question" lets the command run
// and then appends THIS authoritative figure, so the number is always from code.
function answerFromData(text, data) {
  const t = String(text || '').trim();
  if (!t) return null;
  const isQuestion = /(?:^|\s)(מה|מהו|מהי|כמה|תגיד|תראה|הצג)/.test(t) || t.includes('?');
  if (!isQuestion) return null;
  const inv = inventoryTotals(data.inventory || []);
  // Inventory total value: "מה ערך המלאי" / "שווי המלאי" / "כמה שווה המלאי"
  if (/(ערך|שווי|שווה).{0,10}(המלאי|מלאי)/.test(t) || /(מלאי).{0,10}(ערך|שווי|שווה)/.test(t)) {
    if (!inv.count) return 'המלאי ריק כרגע — אין פריטים, אז הערך הוא ₪0.';
    return `ערך המלאי הכולל הוא ${formatCurrency(inv.totalValue)} (${inv.count} פריטים).`;
  }
  // Inventory item count: "כמה פריטים במלאי"
  if (/(פריטים|מוצרים)/.test(t) && /(מלאי)/.test(t)) {
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
  const { data, dispatch, toast } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState('sit');
  const [messages, setMessages] = useState(() => {
    try {
      const raw = localStorage.getItem(CHAT_KEY);
      if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length) return arr; }
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
  const [brainTick, setBrainTick] = useState(0); // bump to re-read the brain badge after a switch
  const scrollRef = useRef(null);
  // Creative V2 orchestrator — built once; reads live CRM data via a ref. The
  // adapter inside wraps the FROZEN Creative Director V1 (injected at composition).
  const dataRef = useRef(data);
  dataRef.current = data;
  const creativeRef = useRef(null);
  if (!creativeRef.current) creativeRef.current = createArtValueCreative({ getData: () => dataRef.current, user: 'נתן' });
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
  useEffect(() => {
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-60))); } catch { /* ignore */ }
  }, [messages]);

  const clearChat = () => {
    try { localStorage.removeItem(CHAT_KEY); } catch { /* ignore */ }
    setMessages([{ role: 'assistant', text: GREETING }]);
  };

  // Confirm / cancel a pending destructive action (delete) inline in the chat.
  const confirmAction = (idx, d) => {
    dispatch(d.action);
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
  const approvePreview = (idx, actions) => {
    const { logs, pendingDeletes, codeGates = [] } = executeActions(actions, data, dispatch, activePack.actions, activePack.entities);
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
    setMessages((m) => m.map((mm, i) => (i === idx
      ? { role: 'assistant', system: true, text: `🎬 מכין חבילת הפקה ל"${conceptName}" — ליבה יצירתית, קופי, בריף ופרומפט…` }
      : mm)));
    try {
      const pkg = await creativeRef.current.generateProductionPackage({ campaignId });
      setMessages((m) => [...m, { role: 'assistant', productionReview: { campaignId, conceptName, package: pkg } }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', system: true, text: creativeError(e) }]);
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

  // ---- brain switch: cycle auto (smartest) → cloud → local. Lets נתן keep the
  // smartest brain by default but flip to the private/local brain in one click. ----
  const cycleBrain = () => {
    const order = ['auto', 'cloud', 'local'];
    const nextPref = order[(order.indexOf(jakeBrainPref()) + 1) % order.length];
    setJakeBrain(nextPref);
    setBrainTick((t) => t + 1);
    toast(`מוח: ${nextPref === 'auto' ? 'אוטומטי (החכם ביותר)' : nextPref === 'cloud' ? 'ענן' : 'מקומי'}`);
  };

  // Bulk delete after a passed code gate: dispatch a DELETE for each picked id.
  const runBulkDelete = (idx, gate, ids) => {
    ids.forEach((id) => dispatch({ type: gate.dispatchType, id }));
    toast(`נמחקו ${ids.length} ✓`);
    const all = ids.length === gate.items.length;
    setMessages((m) => m.map((mm, i) => (i === idx
      ? { role: 'assistant', system: true, text: `✓ נמחקו ${ids.length} ${gate.entityLabel}${all ? ' (הכל)' : ` מתוך ${gate.items.length}`}.` }
      : mm)));
  };
  const cancelGate = (idx) => {
    setMessages((m) => m.map((mm, i) => (i === idx ? { role: 'assistant', system: true, text: 'בוטל — לא נמחק כלום.' } : mm)));
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

  // Proactive MORNING BRIEFING: the first time ג׳יק opens each day, he greets נתן
  // with the deterministic briefing (overdue / money owed / today) — unprompted.
  useEffect(() => {
    if (!open) return;
    try {
      const today = new Date().toDateString();
      if (localStorage.getItem('artvalue_jake_brief_date') === today) return;
      localStorage.setItem('artvalue_jake_brief_date', today);
      const h = new Date().getHours();
      const greet = h < 12 ? 'בוקר טוב' : h < 18 ? 'צהריים טובים' : 'ערב טוב';
      setMessages((m) => [...m, { role: 'assistant', text: `${greet}, נתן! 👋\n\n${activePack.briefing(data)}` }]);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
      const brief = activePack.briefing(data);
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
        const { text: draft } = await draftWithJake(convo, activePack.buildContext(data));
        const clean = extractActions(draft).clean || draft; // strip any stray actions block
        setMessages((m) => [...m, { role: 'assistant', text: clean }]);
        speak(clean);
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
      setLoading(true);
      setMessages((m) => [...m, { role: 'assistant', system: true, text: '🎯 בודק את נתוני העסק, בונה בריף ומריץ את מנהל הקריאייטיב — ייקח רגע…' }]);
      try {
        const creative = creativeRef.current;
        const need = creative.analyzeMarketingNeed(text);
        const { request, campaignId } = creative.createCampaignBrief({ need });
        const _t0 = Date.now();
        const { result, diversity } = await creative.runCreativeDirector({ request, campaignId });
        // Debug-only capture (off in production unless window.__JAKE_DEBUG is set):
        // lets verification read the exact canonical result + diversity + timing.
        if (typeof window !== 'undefined' && window.__JAKE_DEBUG) {
          try { window.__creativeLastRun = { ms: Date.now() - _t0, result, diversity, request }; } catch { /* noop */ }
        }
        setMessages((m) => [...m, {
          role: 'assistant',
          campaign: { campaignId, strategy: result.strategy, concepts: result.concepts, recommendedConceptId: result.recommendedConceptId },
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
    // touches the store until נתן approves the card. (The frozen Creative engine is
    // untouched — this is pure Jake orchestration.)
    setLoading(true);
    try {
      const convo = next.filter((mm) => mm.text && !mm.system).slice(-14);
      const { text: reply } = await chatJake(convo, activePack.buildContext(data));
      let { clean, actions } = extractActions(reply); // eslint-disable-line prefer-const

      // Talked about doing something but emitted no block → force a proposal (2nd pass).
      if (!actions.length && claimsActionText(clean || reply)) {
        try {
          const forced = await forceActionsJake(text, activePack.buildContext(data));
          const r2 = extractActions(forced);
          if (r2.actions.length) actions = r2.actions;
        } catch { /* it was just talk — leave as prose */ }
      }

      if (actions.length) {
        // It's a PROPOSAL (executes only on approval) — strip any premature "done"
        // checkmark a weaker model may have added, so the prose never contradicts the card.
        const proposal = (clean || '').replace(/\s*[✓✅]\s*/g, ' ').trim();
        if (proposal) { setMessages((m) => [...m, { role: 'assistant', text: proposal }]); speak(proposal); }
        const items = describeActions(actions, data);
        setMessages((m) => [...m, { role: 'assistant', preview: { actions, items } }]);
      } else {
        const body = clean || reply;
        setMessages((m) => [...m, { role: 'assistant', text: body }]);
        speak(body);
      }

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
  useEffect(() => {
    const forceOpen = () => { clearTimers(); setBubble(null); setReminderOpen(false); setOpen(true); setPhase('chatting'); };
    const onOpen = () => forceOpen();
    const onAsk = (e) => { forceOpen(); const q = e?.detail; if (q) after(360, () => sendRef.current(q)); };
    window.addEventListener('jake:open', onOpen);
    window.addEventListener('jake:ask', onAsk);
    return () => { window.removeEventListener('jake:open', onOpen); window.removeEventListener('jake:ask', onAsk); };
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
                    {(() => {
                      void brainTick; // re-read after a brain switch
                      const b = jakeBrainLabel();
                      return (
                        <button
                          className="ai-brain"
                          onClick={cycleBrain}
                          title="המוח של ג׳יק — לחץ להחלפה (אוטומטי / ענן / מקומי)"
                          disabled={!isGeminiConfigured}
                        >
                          <span className={`ai-brain-dot ${b.cloud ? 'cloud' : ''}`} />
                          {isGeminiConfigured ? b.label : 'מצב הדגמה'}
                        </button>
                      );
                    })()}
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
                    <div key={i} className="ai-msg assistant ai-campaign">
                      <div className="ai-camp-strategy">
                        <div className="ai-camp-key">🎯 {m.campaign.strategy.keyMessage}</div>
                        <div className="ai-camp-dir">{m.campaign.strategy.strategicDirection}</div>
                      </div>
                      <div className="ai-camp-intro">הכנתי שלושה כיווני קמפיין שונים — בחר/י אחד:</div>
                      {m.campaign.concepts.map((c, k) => (
                        <div key={c.id} className={`ai-camp-card ${c.id === m.campaign.recommendedConceptId ? 'rec' : ''}`}>
                          <div className="ai-camp-head">
                            <span className="ai-camp-n">{k + 1}</span>
                            <b>{c.name}</b>
                            {c.id === m.campaign.recommendedConceptId && <span className="ai-camp-badge">מומלץ</span>}
                          </div>
                          <div className="ai-camp-row"><span>זווית</span> {c.strategicAngle}</div>
                          <div className="ai-camp-row"><span>טון</span> {c.emotionalTone}</div>
                          <div className="ai-camp-row"><span>כותרת</span> {c.headlineDirection}</div>
                          <div className="ai-camp-row"><span>ויזואל</span> {c.visualDirection}</div>
                          <div className="ai-camp-why">💡 {c.whyItWorks}</div>
                          <div className="ai-camp-scores">מקוריות {c.originalityScore} · התאמה למותג {c.brandFitScore}</div>
                          <button className="btn btn-sm ai-approve ai-camp-pick" onClick={() => selectConcept(m.campaign.campaignId, c.id, c.name)}>בחר/י קונספט זה</button>
                        </div>
                      ))}
                    </div>
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

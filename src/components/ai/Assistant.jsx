import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../../store/store.jsx';
import Icon from '../ui/Icon.jsx';
import warriorSit from '../../assets/warrior_sit.png';
import warriorStand from '../../assets/warrior_stand.png';
import warriorWalk from '../../assets/warrior_walk.png';
import { chatWithLocalModel, forceActions, isGeminiConfigured } from '../../lib/gemini.js';
import { extractActions, executeActions, reconcileClaim, detectBulkDelete, buildBulkDeleteGate, actionSig } from '../../lib/jakeAgent.js';
import { activePack } from '../../lib/jakePack.js';
import { dashboardKpis, inventoryTotals, lowStockItems } from '../../lib/calc.js';
import { formatCurrency } from '../../lib/format.js';

const GREETING = 'שלום! אני ג׳יק, העוזר האישי שלך. אני יודע כל מספר במערכת, זוכר את מה שדיברנו, וגם יכול לבצע פעולות — להוסיף לקוח, לעדכן מלאי ועוד. מה נעשה?';
const SUGGESTIONS = ['כמה לקוחות יש לי?', 'מה המשימות להיום?', 'הוסף פריט מלאי'];
const CHAT_KEY = 'artvalue_jake_chat';
const MAX_AGENT_STEPS = 3; // agent-loop cap: extra autonomous steps after the first
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

// Does the request plausibly need MORE than one step? (sequence words, "for each",
// or ≥2 action verbs). Gates the agent loop so simple one-shot commands stay fast
// and only compound tasks get the autonomous plan→act→observe→repeat treatment.
const ACTION_VERB_G = /(תעדכן|עדכן|תשנה|שנה|תוסיף|הוסף|תמחק|מחק|תסיר|הסר|תוריד|הורד|תרשום|רשום|תסמן|סמן|תעביר|העבר|תבנה|בנה|תיצור|צור)/g;
function isMultiStep(text) {
  const t = String(text || '');
  if (/(אחר כך|ואז|לאחר מכן|בנוסף|וגם|כשתסיים|לכל ה|לכל לקוח|לכל פריט|אחד אחרי|בזה אחר זה)/.test(t)) return true;
  return (t.match(ACTION_VERB_G) || []).length >= 2;
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
  const scrollRef = useRef(null);
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
    // Bulk delete ("מחק את כל המלאי") — handled DETERMINISTICALLY (never trust the
    // small model with destructive bulk ops). Pops a code gate (123456) → then a
    // granular checkbox picker. Returns before the model is ever called.
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
    // Proactive briefing ("מה חשוב / מה דחוף / סיכום היום") → deterministic, from
    // the live store. Skipped if it's an action command (let the executor handle it).
    if (isBriefingRequest(text) && !hasActionVerb(text)) {
      const brief = activePack.briefing(data);
      setMessages((m) => [...m, { role: 'assistant', text: brief }]);
      speak(brief);
      return;
    }
    // Numbers come from CODE. A PURE number-question is answered directly (model
    // skipped → always correct, no noncompliance). A COMPOUND "command + question"
    // still runs the model/executor for the command, then appends this figure.
    const dataAns = answerFromData(text, data);
    const actionish = hasActionVerb(text);
    if (dataAns && !actionish) {
      setMessages((m) => [...m, { role: 'assistant', text: dataAns }]);
      speak(dataAns);
      return;
    }
    setLoading(true);
    try {
      // Send only the recent text turns (bounded history) + the live data snapshot.
      const convo = next.filter((m) => m.text && !m.system).slice(-14);
      const reply = await chatWithLocalModel(convo, activePack.buildContext(data));
      const { clean, actions } = extractActions(reply);
      if (clean) { setMessages((m) => [...m, { role: 'assistant', text: clean }]); speak(clean); }
      let realDone = false;
      let pass1Logs = []; let pass1Pending = [];
      let workingData = data; // live mirror for the agent loop (updated per executed step)
      if (actions.length) {
        const { logs, pendingDeletes, codeGates = [], nextData } = executeActions(actions, data, dispatch, activePack.actions, activePack.entities);
        workingData = nextData || data;
        pass1Logs = logs; pass1Pending = [...pendingDeletes, ...codeGates];
        if (logs.length) {
          setMessages((m) => [...m, { role: 'assistant', text: logs.join('\n'), system: true }]);
          if (logs.some((l) => l.startsWith('✓'))) toast('ג׳יק ביצע פעולה ✓');
        }
        pendingDeletes.forEach((d) => setMessages((m) => [...m, { role: 'assistant', confirm: d }]));
        codeGates.forEach((g) => setMessages((m) => [...m, { role: 'assistant', text: `למחיקת כל ${g.entityLabel} (${g.items.length}) נדרש קוד אישור. 🔒`, system: true }, { role: 'assistant', gate: g }]));
        realDone = logs.some((l) => l.startsWith('✓')) || pendingDeletes.length > 0 || codeGates.length > 0;
        if (!clean && !logs.length && !pendingDeletes.length && !codeGates.length) setMessages((m) => [...m, { role: 'assistant', text: reply }]);
      } else if (!clean) {
        setMessages((m) => [...m, { role: 'assistant', text: reply }]);
      }
      // Claim-vs-execution reconciliation: even when SOMETHING ran, if the prose
      // claims a different action-family than what executed (e.g. "מחקתי" but a
      // stock/no-op ran), surface ⚠️ and drop the fake success.
      const recon = reconcileClaim(clean || reply, actions, pass1Pending, pass1Logs);
      if (recon.mismatch) {
        setMessages((m) => [...m, { role: 'assistant', system: true, text: `⚠️ ${recon.note}` }]);
        realDone = false;
      }
      // Lie-detector: ג'יק claims an action in prose but nothing real executed.
      const claimsAction = /[✓✅]|בוצע|ביצעתי|הוספתי|עדכנתי|מחקתי|הסרתי|סימנתי|יצרתי|בניתי|רשמתי|נרשמ|הועבר|העברתי|החזרתי|שמרתי/.test(clean || reply);
      // failReason: distinguishes WHY the action didn't happen on the final fallback.
      let failReason = null; // 'engine' (Ollama unreachable) | 'noncompliance' (model returned no valid op)
      if (!realDone && claimsAction) {
        // Second pass: force the model to emit ONLY the actions JSON, then run it.
        try {
          const forced = await forceActions(text, activePack.buildContext(data));
          const r2 = extractActions(forced);
          if (r2.actions.length) {
            const { logs, pendingDeletes, codeGates = [], nextData } = executeActions(r2.actions, data, dispatch, activePack.actions, activePack.entities);
            workingData = nextData || workingData;
            if (logs.length) {
              setMessages((m) => [...m, { role: 'assistant', text: logs.join('\n'), system: true }]);
              if (logs.some((l) => l.startsWith('✓'))) toast('ג׳יק ביצע פעולה ✓');
            }
            pendingDeletes.forEach((d) => setMessages((m) => [...m, { role: 'assistant', confirm: d }]));
            codeGates.forEach((g) => setMessages((m) => [...m, { role: 'assistant', text: `למחיקת כל ${g.entityLabel} (${g.items.length}) נדרש קוד אישור. 🔒`, system: true }, { role: 'assistant', gate: g }]));
            realDone = logs.some((l) => l.startsWith('✓')) || pendingDeletes.length > 0 || codeGates.length > 0;
            if (!realDone) failReason = 'noncompliance'; // parsed ops but all failed (warnings already shown)
          } else {
            failReason = 'noncompliance'; // model replied but emitted no valid action
          }
        } catch {
          failReason = 'engine'; // forceActions threw → engine/network unreachable
        }
      }
      if (!realDone && claimsAction) {
        const msg = failReason === 'engine'
          ? '⚠️ המנוע המקומי לא זמין כרגע (Ollama כבוי או עדיין עולה אחרי הפעלת המחשב). הפעולה לא בוצעה. ודא ש-Ollama רץ והמתן ~30 שניות, ואז נסה שוב.'
          : '⚠️ ג׳יק לא הצליח לתרגם את הבקשה לפעולה — הפעולה לא בוצעה. נסה לנסח מפורש יותר, למשל: "תעדכן את השווי של מזקקת צפת ל-5000".';
        setMessages((m) => [...m, { role: 'assistant', system: true, text: msg }]);
      }
      // ---- AGENT LOOP: finish a multi-step task autonomously — plan→act→OBSERVE
      // the result→decide next step→repeat. Engages ONLY for plausibly multi-step
      // requests (so one-shot commands stay fast) and only after a real first step.
      // Guards: dedup by actionSig (never repeat a step), MAX_AGENT_STEPS cap, stop
      // on "DONE" / no-new-action / no-✓-progress, and pause on any delete. The
      // frozen Creative Director engine is untouched — this is pure Jake orchestration.
      if (realDone && !pass1Pending.length && isMultiStep(text)) {
        const executed = new Set((actions || []).map(actionSig));
        const loopConvo = [...convo, { role: 'assistant', text: clean || reply }];
        for (let step = 0; step < MAX_AGENT_STEPS; step += 1) {
          const probe = `המשך אוטונומי של המשימה. הבקשה המקורית של נתן: "${text}". אם היא כבר בוצעה במלואה — ענה בדיוק "DONE" ותו לא. אם נשאר שלב קונקרטי אחד שעוד לא בוצע — בצע אותו עכשיו (בלוק actions אחד בלבד). אל תמציא עבודה חדשה ואל תחזור על פעולה שכבר בוצעה.`;
          let r;
          try { r = await chatWithLocalModel([...loopConvo, { role: 'user', text: probe }], activePack.buildContext(workingData)); } catch { break; }
          if (/\bDONE\b/i.test(r)) break;
          const { clean: c2, actions: a2 } = extractActions(r);
          const fresh = (a2 || []).filter((a) => !executed.has(actionSig(a)));
          if (!fresh.length) break; // nothing new to do → task is complete
          fresh.forEach((a) => executed.add(actionSig(a)));
          loopConvo.push({ role: 'assistant', text: c2 || r });
          const { logs, pendingDeletes, codeGates = [], nextData } = executeActions(fresh, workingData, dispatch, activePack.actions, activePack.entities);
          workingData = nextData || workingData;
          if (logs.length) setMessages((m) => [...m, { role: 'assistant', system: true, text: `🔄 ${logs.join('\n')}` }]);
          if (logs.some((l) => l.startsWith('✓'))) toast('ג׳יק ממשיך לבד ✓');
          pendingDeletes.forEach((d) => setMessages((m) => [...m, { role: 'assistant', confirm: d }]));
          codeGates.forEach((g) => setMessages((m) => [...m, { role: 'assistant', text: `למחיקת כל ${g.entityLabel} (${g.items.length}) נדרש קוד אישור. 🔒`, system: true }, { role: 'assistant', gate: g }]));
          if (pendingDeletes.length || codeGates.length) break; // pause for user confirmation
          if (!logs.some((l) => l.startsWith('✓'))) break; // no real progress → stop
        }
      }
      // Compound "command + number-question": the command ran above; now append the
      // authoritative figure computed from the live store (never the model's number).
      if (dataAns && actionish) {
        setMessages((m) => [...m, { role: 'assistant', system: true, text: `⚙️ ${dataAns}` }]);
      }
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', text: `מצטער, נתקלתי בשגיאה: ${e.message}`, error: true }]);
    } finally {
      setLoading(false);
    }
  };

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
                    <div className="dim" style={{ fontSize: '0.72rem' }}>{isGeminiConfigured ? 'העוזר האישי שלך' : 'מצב הדגמה'}</div>
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

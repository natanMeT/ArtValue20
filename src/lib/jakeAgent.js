// ===================================================================
// Jake Agent — gives ג'יק "hands": he can perform real actions on the
// CRM/inventory by emitting a fenced ```actions JSON block, which we
// parse here and dispatch to the store. Pure module (no React/store
// imports) — executeActions receives `data` + `dispatch` as args.
// ===================================================================

const today = () => new Date().toISOString().slice(0, 10);

// uuid-format id (valid in both local & Supabase modes) for entities created
// mid-batch, so later actions in the same message can reference them.
const genId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0;
  return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

// ---- value normalizers (accept Hebrew labels OR english ids) ----
const CLIENT_STATUS = {
  lead: 'lead', ליד: 'lead', 'ליד חדש': 'lead',
  active: 'active', פעיל: 'active',
  completed: 'completed', הושלם: 'completed',
  completed_paid: 'completed_paid', שולם: 'completed_paid', 'הושלם ושולם': 'completed_paid', 'הושלם ועבר תשלום': 'completed_paid',
  await_payment: 'await_payment', 'ממתין לתשלום': 'await_payment',
  await_material: 'await_material', 'ממתין לחומר': 'await_material',
  await_approval: 'await_approval', 'ממתין לאישור': 'await_approval',
  maintenance: 'maintenance', תחזוקה: 'maintenance',
  lost: 'lost', אבוד: 'lost',
};
const PROJECT_TYPE = {
  website: 'website', אתר: 'website',
  crm: 'crm', 'מערכת crm': 'crm', מערכת: 'crm',
  marketing: 'marketing', שיווק: 'marketing', מודעה: 'marketing', קמפיין: 'marketing',
  branding: 'branding', מיתוג: 'branding',
  landing: 'landing', 'דף נחיתה': 'landing',
  maintenance: 'maintenance', תחזוקה: 'maintenance',
  other: 'other', אחר: 'other',
};
const ITEM_CATEGORIES = ['מוצר', 'חומר גלם', 'אריזה', 'ציוד', 'מרצ׳נדייז', 'אחר'];
const PIPELINE = {
  lead: 'lead', ליד: 'lead', 'ליד חדש': 'lead',
  first_call: 'first_call', 'שיחה ראשונית': 'first_call', שיחה: 'first_call',
  quote_sent: 'quote_sent', 'נשלחה הצעת מחיר': 'quote_sent', 'הצעה נשלחה': 'quote_sent', 'הצעת מחיר': 'quote_sent',
  await_approval: 'await_approval', 'ממתין לאישור': 'await_approval',
  won: 'won', 'נסגר': 'won', נסגר: 'won', 'התחלת עבודה': 'won',
  in_progress: 'in_progress', בעבודה: 'in_progress',
  delivered: 'delivered', נמסר: 'delivered',
  retainer: 'retainer', 'המשך שירות': 'retainer',
  lost: 'lost', אבוד: 'lost',
};
function normPipeline(s) {
  if (s == null) return undefined;
  return PIPELINE[String(s).trim().toLowerCase()] || String(s).trim();
}

function normClientStatus(s) {
  if (s == null) return undefined;
  return CLIENT_STATUS[String(s).trim().toLowerCase()] || String(s).trim();
}
function normProjectType(s) {
  if (s == null) return undefined;
  return PROJECT_TYPE[String(s).trim().toLowerCase()] || String(s).trim();
}
function normCategory(s) {
  if (s == null) return ITEM_CATEGORIES[0];
  const t = String(s).trim();
  return ITEM_CATEGORIES.find((c) => c === t) || 'אחר';
}

// ---- fuzzy lookup by name (exact ci → contains either way) ----
function findClient(data, name) {
  const q = String(name || '').trim().toLowerCase();
  if (!q) return null;
  const cs = data.clients || [];
  return (
    cs.find((c) => (c.name || '').toLowerCase() === q) ||
    cs.find((c) => (c.name || '').toLowerCase().includes(q) || q.includes((c.name || '').toLowerCase())) ||
    null
  );
}
function findItem(data, q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return null;
  const items = data.inventory || [];
  return (
    items.find((i) => (i.name || '').toLowerCase() === s || (i.sku || '').toLowerCase() === s) ||
    items.find((i) => (i.name || '').toLowerCase().includes(s) || s.includes((i.name || '').toLowerCase())) ||
    null
  );
}

// ---- generic fuzzy lookup by a field (exact ci → contains either way, guards empty) ----
function findBy(arr, field, q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return null;
  return (
    (arr || []).find((x) => (x[field] || '').toLowerCase() === s) ||
    (arr || []).find((x) => { const v = (x[field] || '').toLowerCase(); return v && (v.includes(s) || s.includes(v)); }) ||
    null
  );
}
const findProject = (work, q) => findBy(work.projects, 'name', q);
const findTask = (work, q) => findBy(work.tasks, 'title', q);
const findLead = (work, q) => findBy(work.leads, 'name', q);
function findQuote(work, q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return null;
  const byNum = (work.quotes || []).find((x) => String(x.number || '').toLowerCase() === s)
    || (work.quotes || []).find((x) => String(x.number || '').toLowerCase().includes(s));
  if (byNum) return byNum;
  const c = findClient(work, q); // fall back: latest quote for that client
  if (c) { const cq = (work.quotes || []).filter((x) => x.clientId === c.id); if (cq.length) return cq[0]; }
  return null;
}
function findTx(work, q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return null;
  return (work.transactions || []).find((t) => { const d = (t.description || '').toLowerCase(); return d && (d.includes(s) || s.includes(d)); }) || null;
}

// ---- Bulk-delete (code-gated) ----
// Registry mapping an entity key → its data source, the store DELETE action type,
// and a human row label for the picker. Used by both the deterministic intent
// detector and the delete_all op.
const BULK_ENTITIES = {
  inventory: { label: 'פריטי המלאי', src: (d) => d.inventory || [], type: 'DELETE_ITEM', row: (x) => `${x.name || 'פריט'} · ${Number(x.qty) || 0} ${x.unit || 'יח׳'}` },
  clients: { label: 'הלקוחות', src: (d) => d.clients || [], type: 'DELETE_CLIENT', row: (x) => x.name || 'לקוח' },
  leads: { label: 'הלידים', src: (d) => d.outreachLeads || [], type: 'DELETE_LEAD', row: (x) => x.name || 'ליד' },
  tasks: { label: 'המשימות', src: (d) => d.tasks || [], type: 'DELETE_TASK', row: (x) => x.title || 'משימה' },
  projects: { label: 'הפרויקטים', src: (d) => d.projects || [], type: 'DELETE_PROJECT', row: (x) => x.name || 'פרויקט' },
  quotes: { label: 'הצעות המחיר', src: (d) => d.quotes || [], type: 'DELETE_QUOTE', row: (x) => `${x.number || 'הצעה'}` },
  transactions: { label: 'התנועות הכספיות', src: (d) => d.transactions || [], type: 'DELETE_TX', row: (x) => `${x.description || x.category || 'תנועה'} · ${Number(x.amount) || 0} ₪` },
};

// Build the picker payload for a bulk delete: { entity, entityLabel, dispatchType, items:[{id,label}] }.
export function buildBulkDeleteGate(entity, data) {
  const e = BULK_ENTITIES[entity];
  if (!e) return null;
  const items = e.src(data || {}).map((x) => ({ id: x.id, label: e.row(x) })).filter((x) => x.id);
  return { entity, entityLabel: e.label, dispatchType: e.type, items };
}

// Deterministic bulk-delete intent — does NOT rely on the LLM (small models fake
// destructive ops). Matches "מחק/תמחק/למחוק/תרוקן ... כל ... <entity>". Returns the
// entity key or null. (\b doesn't work around Hebrew, so we match substrings.)
export function detectBulkDelete(text) {
  const t = String(text || '');
  const delVerb = /(תמחק|מחק|למחוק|תנקה|נקה)/.test(t);
  const clearVerb = /(תרוקן|רוקן)/.test(t);
  const hasAll = /(כל|הכל|הכול)/.test(t);
  if (!((delVerb && hasAll) || clearVerb)) return null;
  if (/(מלאי|פריט|מוצר)/.test(t)) return 'inventory';
  if (/(לקוח)/.test(t)) return 'clients';
  if (/(ליד|הפני)/.test(t)) return 'leads';
  if (/(משימ)/.test(t)) return 'tasks';
  if (/(פרויקט|פרוייקט)/.test(t)) return 'projects';
  if (/(הצע)/.test(t)) return 'quotes';
  if (/(תנוע|הכנס|הוצא|פיננס|כספ)/.test(t)) return 'transactions';
  return null;
}

// ---- value normalizers for the new modules ----
const PROJECT_STATUS = { active: 'active', פעיל: 'active', 'ממתין לחומר': 'await_material', await_material: 'await_material', 'ממתין לאישור': 'await_approval', await_approval: 'await_approval', 'ממתין לתשלום': 'await_payment', await_payment: 'await_payment', completed: 'completed', הושלם: 'completed', frozen: 'frozen', מוקפא: 'frozen' };
const TASK_STATUS = { new: 'new', חדש: 'new', todo: 'todo', לביצוע: 'todo', in_progress: 'in_progress', בעבודה: 'in_progress', await_client: 'await_client', 'ממתין ללקוח': 'await_client', await_material: 'await_material', 'ממתין לחומר': 'await_material', review: 'review', לבדיקה: 'review', done: 'done', הושלם: 'done', בוצע: 'done' };
const TASK_PRIORITY = { low: 'low', נמוכה: 'low', normal: 'normal', רגילה: 'normal', high: 'high', גבוהה: 'high', urgent: 'urgent', דחופה: 'urgent' };
const LEAD_STATUS = { pending: 'pending', ממתין: 'pending', contacted: 'contacted', 'נוצר קשר': 'contacted', irrelevant: 'irrelevant', 'לא רלוונטי': 'irrelevant' };
const QUOTE_STATUS = { draft: 'draft', טיוטה: 'draft', sent: 'sent', נשלחה: 'sent', נשלח: 'sent', accepted: 'accepted', אושרה: 'accepted', אושר: 'accepted', rejected: 'rejected', נדחתה: 'rejected', נדחה: 'rejected' };
const normMap = (m, s) => (s == null ? undefined : (m[String(s).trim().toLowerCase()] || String(s).trim()));
const normProjectStatus = (s) => normMap(PROJECT_STATUS, s);
const normTaskStatus = (s) => normMap(TASK_STATUS, s);
const normTaskPriority = (s) => normMap(TASK_PRIORITY, s);
const normLeadStatus = (s) => normMap(LEAD_STATUS, s);
const normQuoteStatus = (s) => normMap(QUOTE_STATUS, s);

// ---- system-prompt section that teaches Jake the protocol ----
export const ACTIONS_GUIDE = `## יכולת ביצוע פעולות (חשוב מאוד)
יש לך ידיים — אתה יכול לבצע פעולות אמיתיות במערכת, לא רק לדבר. כשהמשתמש מבקש להוסיף / לעדכן / למחוק לקוח או פריט מלאי, או לשנות כמות במלאי — בצע זאת בפועל.

כדי לבצע פעולה, הוסף בסוף התשובה בלוק קוד בדיוק בפורמט הזה (מערך JSON):
\`\`\`actions
[ { "op": "add_client", "name": "דני כהן", "status": "lead", "value": 3000 } ]
\`\`\`
תמיד גם כתוב משפט קצר וטבעי בעברית למשתמש (לדוגמה: "הוספתי את דני כהן ✓"). אל תציג למשתמש את ה-JSON בתוך המשפט — רק בבלוק.

פעולות זמינות:
- add_client — name (חובה), status (lead/active/completed/completed_paid/await_payment/lost), projectType (website/crm/marketing/branding/landing/other), value (₪ מספר), phone, email, nextAction
- update_client — name (חובה, לזיהוי הלקוח הקיים), ואז שדות לשינוי: status / value / nextAction / phone / email / projectType / newName
- delete_client — name (חובה). מחיקה תוצג למשתמש לאישור לפני ביצוע.
- add_item — name (חובה), qty, unitPrice, cost, category (מוצר/חומר גלם/אריזה/ציוד/מרצ׳נדייז/אחר), lowThreshold, unit, sku, supplier, note
- update_item — item (חובה, שם הפריט הקיים), ואז שדות לשינוי
- add_stock — item (חובה), amount (כמה יחידות להוסיף למלאי)
- remove_stock — item (חובה), amount (כמה יחידות להוריד מהמלאי)
- delete_item — item (חובה). מחיקה תוצג למשתמש לאישור.
- mark_paid — client (חובה, שם הלקוח), amount (הסכום ששולם; אם לא צויין משתמש בשווי הלקוח). מסמן את הלקוח כ"שולם" ורושם הכנסה אוטומטית. זו הפעולה לכל בקשה כמו "תוסיף את הכסף שדני שילם".
- add_income — amount (חובה, ₪), description, category, client (אופציונלי). רישום הכנסה ישירה לפיננסים.
- add_expense — amount (חובה, ₪), description, category. רישום הוצאה.
- move_pipeline — client (חובה), stage (lead/first_call/quote_sent/await_approval/won/in_progress/delivered/retainer/lost). מעביר לקוח בשלבי הפייפליין.
- add_quote — client (חובה), items (חובה: מערך של {desc, qty, price}), vatRate (ברירת מחדל 18), notes. בונה הצעת מחיר מלאה עם מספור וחישוב מע"מ אוטומטי. כשמבקשים "תבנה הצעת מחיר ל-X על אתר ולוגו" — פרק לשורות הגיוניות עם מחירים. דוגמה: {"op":"add_quote","client":"דני","items":[{"desc":"בניית אתר תדמית","qty":1,"price":6000},{"desc":"עיצוב לוגו","qty":1,"price":1200}]}
- add_income_from_clients — scope (all/active/paid, ברירת מחדל all). רושם אוטומטית את השווי של כל לקוח כהכנסה החודש. המערכת לוקחת את הסכומים מהנתונים ולא משכפלת. זו הפעולה לכל בקשה כמו "תיקח את הסכום מהלקוחות ותעביר להכנסות".
- remove_duplicate_clients — מוחק לקוחות כפולים (מציג לאישור). השתמש כשמבקשים לנקות כפילויות.

פעולות מודולים נוספים:
- add_project — name (חובה), client (שם הלקוח), serviceType (website/crm/marketing/branding/landing/other), value, status (active/await_material/await_approval/await_payment/completed/frozen), deadline, nextAction, description.
- update_project — project (שם הפרויקט לזיהוי), ואז שדות לשינוי (status/value/nextAction/deadline/description/newName).
- delete_project — project (חובה). מציג לאישור (מוחק גם משימות/קבצים).
- add_task — title (חובה), project (שם הפרויקט), status (new/todo/in_progress/await_client/review/done), priority (low/normal/high/urgent), deadline, notes.
- update_task — task (שם המשימה), ואז status/priority/deadline/notes/newTitle.
- delete_task — task (חובה). מציג לאישור.
- add_lead — name (חובה), category, status (pending/contacted/irrelevant), need.
- update_lead — lead (שם הליד), ואז status/category/need/newName.
- delete_lead — lead (חובה). מציג לאישור.
- update_quote_status — quote (מספר ההצעה כמו "AV-1042") או client (שם הלקוח), status (טיוטה/נשלחה/אושרה/נדחתה).
- delete_quote — quote (מספר) או client. מציג לאישור.
- update_tx — tx (חלק מתיאור התנועה לזיהוי), ואז amount/category/date/description.
- delete_tx — tx (חלק מתיאור התנועה). מציג לאישור.
- delete_all — מחיקה המונית. entity (חובה): inventory/clients/leads/tasks/projects/quotes/transactions. ⚠️ מחיקה המונית דורשת קוד אישור מהמשתמש ואז בחירה פרטנית — אל תטען שמחקת; רק יוצג מסך אישור. השתמש בזה לבקשות כמו "מחק את כל המלאי".

כללים מחייבים:
- ⛔ הכי חשוב: לעולם אל תכתוב שביצעת פעולה (כמו "הוספתי", "עדכנתי", "מחקתי", "✓") בלי לכלול בפועל בלוק actions תקין באותה תשובה. אם אתה לא שולח בלוק — אסור לטעון שביצעת. בלי "ביצעתי" מדומה.
- אין לך פעולת "שחזור/החזרת לקוח שנמחק". אם מבקשים להחזיר לקוח שנמחק — אמור שצריך להוסיף אותו מחדש עם add_client (אם אתה זוכר את פרטיו), ואל תטען שהחזרת.
- בצע פעולה (בלוק actions) רק כשהמשתמש ביקש במפורש להוסיף/לעדכן/למחוק/לשנות כמות. לשאלות מידע ("כמה לקוחות יש?", "מה במלאי?") — ענה מהנתונים בלבד, בלי שום בלוק actions.
- כסף: כשמבקשים "תוסיף את הכסף ש-X שילם" בלי לציין סכום — השתמש ב-mark_paid עם client בלבד (המערכת תיקח אוטומטית את שווי הלקוח מהנתונים). אסור בהחלט להמציא סכום! רק אם המשתמש אמר מספר מפורש — השתמש בו.
- ⛔ קריטי: כדי לרשום כסף/הכנסות מלקוחות — לעולם אל תשתמש ב-add_client! add_client יוצר לקוח חדש וכפול. לרישום הכנסה מלקוח בודד השתמש ב-mark_paid; לרישום הכנסות מכל הלקוחות בבת אחת השתמש ב-add_income_from_clients. אל תוסיף לקוח שכבר קיים בנתונים.
- אל תמציא שמות פעולות. השתמש אך ורק ב-op מהרשימה למעלה.
- בפעולות מלאי (add_stock/remove_stock) — אל תכתוב את הכמות הסופית במשפט שלך; המערכת תחשב ותאשר את המספר המדויק. כתוב רק "עדכנתי את המלאי ✓".
- בבניית הצעת מחיר (add_quote) — כתוב משפט קצר אחד בלבד למשתמש (כמו "בניתי לך הצעת מחיר ✓"), ואת כל פירוט השורות והמחירים שים אך ורק בתוך בלוק actions — אל תפרט אותן בטקסט. כך הבלוק לא נחתך.
- לזיהוי לקוח/פריט קיים — השתמש בשם המדויק כפי שמופיע בנתוני המערכת.
- אפשר לכלול כמה פעולות במערך אחד.
- אל תמציא מספרים או שמות. הנתונים שניתנו לך הם מקור האמת היחיד.`;

// The set of real ops. Used to gate the parser so a stray {type:"income"} or
// other JSON isn't mistaken for an action (small models name the key "op",
// "type" or "action" inconsistently — we accept all three).
const KNOWN_OPS = new Set([
  'add_client', 'update_client', 'delete_client',
  'add_item', 'update_item', 'add_stock', 'remove_stock', 'delete_item',
  'add_quote', 'mark_paid', 'add_income', 'add_expense', 'move_pipeline',
  'add_income_from_clients', 'remove_duplicate_clients',
  // module coverage (1.1)
  'add_project', 'update_project', 'delete_project',
  'add_task', 'update_task', 'delete_task',
  'add_lead', 'update_lead', 'delete_lead',
  'update_quote_status', 'delete_quote',
  'update_tx', 'delete_tx',
  'delete_all',
]);

// Small models often add // comments, /* */ blocks, or trailing commas inside
// the JSON block — all of which break JSON.parse and silently drop the action.
// Strip them so the action still runs.
function cleanJsonish(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')        // /* block comments */
    .replace(/(?<!:)\/\/[^\n\r]*/g, '')       // // line comments (spare http://)
    .replace(/,(\s*[}\]])/g, '$1')            // trailing commas
    .trim();
}

// Scan the WHOLE reply for every JSON object that contains an "op" key, using
// balanced-brace matching. This is robust to: multiple separate blocks, missing
// or unbalanced ``` fences, prose interleaved between blocks, // comments and
// trailing commas — all of which broke the old fence-pairing approach (a model
// emitting 4 separate action blocks would only get the 1st one executed).
function extractActionObjects(text) {
  const objs = [];
  const spans = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    let depth = 0; let inStr = false; let esc = false; let closed = false; let j = i;
    for (; j < text.length; j++) {
      const ch = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === '{') depth += 1;
      else if (ch === '}') { depth -= 1; if (depth === 0) { closed = true; break; } }
    }
    if (!closed) break;
    const chunk = text.slice(i, j + 1);
    if (/"(?:op|type|action)"\s*:/.test(chunk)) {
      try {
        const o = JSON.parse(cleanJsonish(chunk));
        const name = o && typeof o === 'object' && (o.op || o.type || o.action);
        if (name && KNOWN_OPS.has(name)) { o.op = name; objs.push(o); spans.push([i, j + 1]); i = j; }
      } catch { /* not valid JSON — keep scanning */ }
    }
  }
  return { objs, spans };
}

// ---- parse: pull action object(s) out of the model reply ----
// returns { clean: humanText, actions: [...] }
export function extractActions(text) {
  if (!text) return { clean: text || '', actions: [] };
  const { objs, spans } = extractActionObjects(text);
  let clean = text;
  // remove the action-object substrings (back-to-front to keep indices valid)
  for (let k = spans.length - 1; k >= 0; k -= 1) {
    clean = clean.slice(0, spans[k][0]) + clean.slice(spans[k][1]);
  }
  // tidy: drop fence markers and the now-empty wrapping arrays/commas
  clean = clean
    .replace(/```(?:actions|json)?/gi, '')
    .replace(/```/g, '')
    .replace(/\[[\s,]*\]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { clean, actions: objs };
}

// ---- claim-vs-execution reconciliation ----
// Truth = what the store executed, not the model's prose. The model may narrate
// one action (e.g. "מחקתי…") while a DIFFERENT or degenerate op ran (or none).
// This compares the claimed action-family in the prose against what actually
// executed (parsed ops + pending deletes + ✓ logs) and reports any divergence,
// so the UI can show ⚠️ instead of a fake ✓. High-precision (only flags clear
// contradictions) to avoid false alarms on normal replies.
export function reconcileClaim(prose, actions = [], pendingDeletes = [], logs = []) {
  const t = String(prose || '');
  // NOTE: \b word-boundaries don't work around Hebrew letters (they're non-\w),
  // so we anchor on start/whitespace only and match the distinctive conjugated verb.
  const claimDelete = /(?:^|\s)(מחקתי|הסרתי|נמחק|הוסרה|הוסרו)/.test(t) || /\bdelete[d]?\b/i.test(t);
  const claimAdd = /(?:^|\s)(הוספתי|יצרתי|בניתי|נוספה|נוסף|נוצרה|נוצר)/.test(t);
  const claimChange = /(?:^|\s)(עדכנתי|עודכן|שיניתי|שונה|הועבר|העברתי|סימנתי|סומן|סומנה|רשמתי|נרשמה|נרשמו|נרשם)/.test(t);
  const ops = (actions || []).map((a) => a.op || '');
  const execDelete = (pendingDeletes || []).length > 0;
  const execAdd = ops.some((o) => o.startsWith('add_'));
  const execChange = ops.some((o) => /^(update_|move_|add_stock|remove_stock|mark_paid)/.test(o));
  const anySuccess = (logs || []).some((l) => l.startsWith('✓')) || execDelete;

  // Clearest contradiction (the reported bug): claims a deletion, but nothing was
  // queued for deletion — a stock/no-op ran instead.
  if (claimDelete && !execDelete) {
    return { mismatch: true, note: 'ג׳יק טען שמחק — אך לא נוצרה בקשת מחיקה. שום דבר לא נמחק (מחיקה תמיד דורשת אישור).' };
  }
  // Claims a creation, but no add_* op ran AND nothing else succeeded. Gated on
  // !anySuccess so a successful related op doesn't false-positive — e.g. mark_paid
  // is naturally phrased "הוספתי את הכסף ש... שילם" yet is a real, successful action.
  if (claimAdd && !execAdd && !anySuccess) {
    return { mismatch: true, note: 'ג׳יק טען שהוסיף — אך לא בוצעה פעולת הוספה.' };
  }
  // Claims a change/update, but no change-op succeeded (covers the no-op case:
  // a stock op that resolved to ⚠️ "ללא שינוי" leaves no ✓).
  if (claimChange && !execDelete && !execAdd && (!execChange || !anySuccess)) {
    return { mismatch: true, note: 'ג׳יק טען שעדכן — אך לא בוצע שינוי בפועל.' };
  }
  return { mismatch: false, note: '' };
}

// ---- execute: dispatch each action; collect human logs + pending deletes ----
// returns { logs: string[], pendingDeletes: [{ label, action }] }
export function executeActions(actions, data, dispatch) {
  const logs = [];
  const pendingDeletes = [];
  const codeGates = []; // bulk deletes: require an auth code + granular pick in the UI
  // Live working copy: actions in the SAME batch see entities created/updated by
  // earlier actions (e.g. add_client → then mark_paid / add_quote on that client).
  const work = {
    clients: [...(data.clients || [])],
    inventory: [...(data.inventory || [])],
    transactions: [...(data.transactions || [])],
    quotes: [...(data.quotes || [])],
    projects: [...(data.projects || [])],
    tasks: [...(data.tasks || [])],
    leads: [...(data.outreachLeads || [])],
  };
  const clientRef = (a) => a.client || a.name || a.match;
  const itemRef = (a) => a.item || a.name || a.match;

  for (const a of actions || []) {
    try {
      switch (a.op) {
        case 'add_client': {
          if (!a.name) { logs.push('⚠️ לא צוין שם לקוח להוספה'); break; }
          const dup = work.clients.find((c) => (c.name || '').trim().toLowerCase() === String(a.name).trim().toLowerCase());
          if (dup) { logs.push(`⚠️ הלקוח "${dup.name}" כבר קיים — לא נוצר כפול`); break; }
          const payload = {
            id: genId(),
            name: String(a.name).trim(),
            status: normClientStatus(a.status) || 'lead',
            projectType: normProjectType(a.projectType) || 'website',
            value: Number(a.value) || 0,
            phone: a.phone || '', email: a.email || '',
            nextAction: a.nextAction || '',
            date: today(), pipelineStage: 'lead',
          };
          dispatch({ type: 'ADD_CLIENT', payload });
          work.clients.unshift(payload);
          logs.push(`✓ נוסף לקוח: ${payload.name}`);
          break;
        }
        case 'update_client': {
          const c = findClient(work, clientRef(a));
          if (!c) { logs.push(`⚠️ לא נמצא לקוח בשם "${clientRef(a) || ''}"`); break; }
          // Accept fields directly OR wrapped in a "set" object, plus value aliases.
          const s = (a.set && typeof a.set === 'object') ? { ...a, ...a.set } : a;
          const newVal = s.value ?? s.newValue ?? s.amount;
          const patch = { id: c.id };
          if (s.status !== undefined) patch.status = normClientStatus(s.status);
          if (newVal !== undefined) patch.value = Number(newVal) || 0;
          if (s.nextAction !== undefined) patch.nextAction = s.nextAction;
          if (s.phone !== undefined) patch.phone = s.phone;
          if (s.email !== undefined) patch.email = s.email;
          if (s.projectType !== undefined) patch.projectType = normProjectType(s.projectType);
          if (s.newName) patch.name = String(s.newName).trim();
          dispatch({ type: 'UPDATE_CLIENT', payload: patch });
          Object.assign(c, patch);
          const changed = patch.value !== undefined ? ` (שווי → ${patch.value.toLocaleString('he-IL')} ₪)` : '';
          logs.push(`✓ עודכן לקוח: ${c.name}${changed}`);
          break;
        }
        case 'delete_client': {
          const c = findClient(work, clientRef(a));
          if (!c) { logs.push(`⚠️ לא נמצא לקוח בשם "${clientRef(a) || ''}"`); break; }
          pendingDeletes.push({ label: `למחוק את הלקוח "${c.name}"?`, action: { type: 'DELETE_CLIENT', id: c.id } });
          break;
        }
        case 'add_item': {
          if (!a.name) { logs.push('⚠️ לא צוין שם פריט להוספה'); break; }
          const payload = {
            id: genId(),
            name: String(a.name).trim(),
            category: normCategory(a.category),
            sku: a.sku || '',
            qty: Math.round(Number(a.qty) || 0),
            unit: a.unit || 'יח׳',
            unitPrice: Number(a.unitPrice) || 0,
            cost: Number(a.cost) || 0,
            lowThreshold: Math.round(Number(a.lowThreshold) || 5),
            supplier: a.supplier || '', note: a.note || '',
            updatedAt: today(),
          };
          dispatch({ type: 'ADD_ITEM', payload });
          work.inventory.unshift(payload);
          logs.push(`✓ נוסף פריט מלאי: ${payload.name} (${payload.qty} ${payload.unit})`);
          break;
        }
        case 'update_item': {
          const it = findItem(work, itemRef(a));
          if (!it) { logs.push(`⚠️ לא נמצא פריט "${itemRef(a) || ''}"`); break; }
          const patch = { id: it.id, updatedAt: today() };
          ['name', 'sku', 'unit', 'supplier', 'note'].forEach((f) => { if (a[f] !== undefined) patch[f] = a[f]; });
          if (a.category !== undefined) patch.category = normCategory(a.category);
          if (a.qty !== undefined) patch.qty = Math.round(Number(a.qty) || 0);
          if (a.unitPrice !== undefined) patch.unitPrice = Number(a.unitPrice) || 0;
          if (a.cost !== undefined) patch.cost = Number(a.cost) || 0;
          if (a.lowThreshold !== undefined) patch.lowThreshold = Math.round(Number(a.lowThreshold) || 0);
          dispatch({ type: 'UPDATE_ITEM', payload: patch });
          Object.assign(it, patch);
          logs.push(`✓ עודכן פריט: ${it.name}`);
          break;
        }
        case 'add_stock':
        case 'remove_stock': {
          const it = findItem(work, itemRef(a));
          if (!it) { logs.push(`⚠️ לא נמצא פריט "${itemRef(a) || ''}"`); break; }
          const amt = Math.abs(Math.round(Number(a.amount ?? a.qty ?? a.delta) || 0));
          const cur = Math.round(Number(it.qty) || 0);
          const next = a.op === 'add_stock' ? cur + amt : Math.max(0, cur - amt);
          // A degenerate op (no amount, or qty unchanged) must NOT report success —
          // otherwise a ✓ no-op masquerades as a real change to the lie-detector.
          if (amt === 0) { logs.push(`⚠️ ${it.name}: לא צוינה כמות לשינוי — לא בוצע`); break; }
          if (next === cur) { logs.push(`⚠️ ${it.name}: ללא שינוי (${cur} ${it.unit || ''})`.trim()); break; }
          dispatch({ type: 'UPDATE_ITEM', payload: { id: it.id, qty: next, updatedAt: today() } });
          it.qty = next;
          logs.push(`✓ ${it.name}: ${cur} → ${next} ${it.unit || ''}`.trim());
          break;
        }
        case 'delete_item': {
          const it = findItem(work, itemRef(a));
          if (!it) { logs.push(`⚠️ לא נמצא פריט "${itemRef(a) || ''}"`); break; }
          pendingDeletes.push({ label: `למחוק את הפריט "${it.name}"?`, action: { type: 'DELETE_ITEM', id: it.id } });
          break;
        }
        case 'add_quote': {
          const c = findClient(work, clientRef(a));
          if (!c) { logs.push(`⚠️ לא נמצא לקוח בשם "${clientRef(a) || ''}"`); break; }
          const raw = Array.isArray(a.items) ? a.items : [];
          const items = raw
            .filter((it) => it && (it.desc || it.description))
            .map((it) => ({
              id: 'li' + Math.random().toString(36).slice(2, 9),
              desc: String(it.desc || it.description).trim(),
              qty: Math.round(Number(it.qty) || 1) || 1,
              price: Number(it.price) || 0,
            }));
          if (!items.length) { logs.push('⚠️ הצעת מחיר חייבת לפחות שורה אחת עם תיאור'); break; }
          const vatRate = a.vatRate !== undefined ? Number(a.vatRate) || 0 : 18;
          const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
          const total = Math.round(subtotal * (1 + vatRate / 100));
          const nums = work.quotes.map((q) => parseInt(String(q.number).replace(/\D/g, ''), 10)).filter((n) => !Number.isNaN(n));
          const number = `AV-${(nums.length ? Math.max(...nums) : 1040) + 1}`;
          const qPayload = { id: genId(), number, clientId: c.id, date: today(), validDays: Number(a.validDays) || 30, vatRate, status: normQuoteStatus(a.status) || 'draft', notes: a.notes || '', items };
          dispatch({ type: 'ADD_QUOTE', payload: qPayload });
          work.quotes.unshift(qPayload);
          logs.push(`✓ נוצרה הצעת מחיר ${number} ל-${c.name} · ${items.length} שורות · סה״כ ${total.toLocaleString('he-IL')} ₪`);
          break;
        }
        case 'mark_paid': {
          const c = findClient(work, clientRef(a));
          if (!c) { logs.push(`⚠️ לא נמצא לקוח בשם "${clientRef(a) || ''}"`); break; }
          const amount = a.amount !== undefined ? Number(a.amount) || 0 : (Number(c.value) || 0);
          dispatch({ type: 'UPDATE_CLIENT', payload: { id: c.id, status: 'completed_paid', value: amount, paidDate: today() } });
          c.status = 'completed_paid'; c.value = amount;
          work.transactions.unshift({ type: 'income', clientId: c.id, amount });
          logs.push(`✓ ${c.name} סומן כשולם — נרשמה הכנסה של ${amount.toLocaleString('he-IL')} ₪`);
          break;
        }
        case 'add_income': {
          const amount = Number(a.amount) || 0;
          if (!amount) { logs.push('⚠️ לא צוין סכום הכנסה'); break; }
          const c = a.client ? findClient(work, a.client) : null;
          dispatch({ type: 'ADD_TX', payload: { type: 'income', amount, category: a.category || 'תשלום לקוח', date: a.date || today(), description: a.description || (c ? `תשלום · ${c.name}` : 'הכנסה'), clientId: c?.id || null } });
          work.transactions.unshift({ type: 'income', clientId: c?.id || null, amount });
          logs.push(`✓ נרשמה הכנסה: ${amount.toLocaleString('he-IL')} ₪${c ? ` (${c.name})` : ''}`);
          break;
        }
        case 'add_expense': {
          const amount = Number(a.amount) || 0;
          if (!amount) { logs.push('⚠️ לא צוין סכום הוצאה'); break; }
          dispatch({ type: 'ADD_TX', payload: { type: 'expense', amount, category: a.category || 'הוצאה', date: a.date || today(), description: a.description || 'הוצאה' } });
          logs.push(`✓ נרשמה הוצאה: ${amount.toLocaleString('he-IL')} ₪`);
          break;
        }
        case 'move_pipeline': {
          const c = findClient(work, clientRef(a));
          if (!c) { logs.push(`⚠️ לא נמצא לקוח בשם "${clientRef(a) || ''}"`); break; }
          const stage = normPipeline(a.stage);
          if (!stage) { logs.push('⚠️ לא צוין שלב בפייפליין'); break; }
          dispatch({ type: 'UPDATE_CLIENT', payload: { id: c.id, pipelineStage: stage } });
          c.pipelineStage = stage;
          logs.push(`✓ ${c.name} הועבר בפייפליין → ${stage}`);
          break;
        }
        case 'add_income_from_clients': {
          // Deterministic: record each client's recorded value as income.
          // Amounts come from the DATA (never invented), idempotent (no dupes).
          const scope = a.scope || 'all';
          const cls = work.clients.filter((c) => {
            const v = Number(c.value) || 0;
            if (v <= 0) return false;
            if (scope === 'paid') return c.status === 'completed_paid';
            if (scope === 'active') return c.status === 'active' || c.status === 'completed_paid';
            return true;
          });
          if (!cls.length) { logs.push('⚠️ אין לקוחות עם שווי לרישום הכנסה'); break; }
          let added = 0; let skipped = 0; let total = 0;
          for (const c of cls) {
            const already = work.transactions.some((t) => t.type === 'income' && t.clientId === c.id);
            if (already) { skipped += 1; continue; }
            const amt = Number(c.value) || 0;
            dispatch({ type: 'ADD_TX', payload: { type: 'income', amount: amt, category: 'פרויקט', date: today(), description: `תשלום פרויקט · ${c.name}`, clientId: c.id, fromClient: true } });
            work.transactions.unshift({ type: 'income', clientId: c.id, amount: amt });
            added += 1; total += amt;
          }
          logs.push(`✓ נרשמו ${added} הכנסות מלקוחות · סה״כ ${total.toLocaleString('he-IL')} ₪${skipped ? ` (${skipped} כבר היו רשומים — לא שוכפלו)` : ''}`);
          break;
        }
        case 'remove_duplicate_clients': {
          const groups = new Map();
          for (const c of work.clients) {
            const k = (c.name || '').trim().toLowerCase();
            if (!k) continue;
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push(c);
          }
          const scoreOf = (c) => (Number(c.value) > 0 ? 2 : 0) + (c.phone ? 1 : 0) + (c.email ? 1 : 0) + (c.nextAction ? 1 : 0);
          let found = 0;
          for (const arr of groups.values()) {
            if (arr.length < 2) continue;
            arr.sort((x, y) => scoreOf(y) - scoreOf(x)); // keep the most complete copy
            for (const d of arr.slice(1)) {
              found += 1;
              pendingDeletes.push({ label: `למחוק כפילות של "${d.name}"? (נשמר העותק עם הנתונים)`, action: { type: 'DELETE_CLIENT', id: d.id } });
            }
          }
          if (!found) logs.push('אין לקוחות כפולים — הכל נקי ✓');
          break;
        }
        // ---- Projects ----
        case 'add_project': {
          if (!a.name) { logs.push('⚠️ לא צוין שם פרויקט'); break; }
          const c = a.client ? findClient(work, a.client) : null;
          const payload = { id: genId(), name: String(a.name).trim(), clientId: c?.id || null, clientName: c?.name || 'לקוח', serviceType: normProjectType(a.serviceType) || 'website', value: Number(a.value) || 0, status: normProjectStatus(a.status) || 'active', deadline: a.deadline || '', nextAction: a.nextAction || '', description: a.description || '', missing: '', deliverables: '' };
          dispatch({ type: 'ADD_PROJECT', payload }); work.projects.unshift(payload);
          logs.push(`✓ נוסף פרויקט: ${payload.name}${c ? ` (${c.name})` : ''}`);
          break;
        }
        case 'update_project': {
          const p = findProject(work, a.project || a.name || a.match);
          if (!p) { logs.push(`⚠️ לא נמצא פרויקט "${a.project || a.name || a.match || ''}"`); break; }
          const s = (a.set && typeof a.set === 'object') ? { ...a, ...a.set } : a;
          const patch = { id: p.id };
          if (s.status !== undefined) patch.status = normProjectStatus(s.status);
          if (s.value !== undefined) patch.value = Number(s.value) || 0;
          if (s.nextAction !== undefined) patch.nextAction = s.nextAction;
          if (s.deadline !== undefined) patch.deadline = s.deadline;
          if (s.serviceType !== undefined) patch.serviceType = normProjectType(s.serviceType);
          if (s.description !== undefined) patch.description = s.description;
          if (s.newName) patch.name = String(s.newName).trim();
          dispatch({ type: 'UPDATE_PROJECT', payload: patch }); Object.assign(p, patch);
          logs.push(`✓ עודכן פרויקט: ${p.name}`);
          break;
        }
        case 'delete_project': {
          const p = findProject(work, a.project || a.name || a.match);
          if (!p) { logs.push(`⚠️ לא נמצא פרויקט "${a.project || a.name || a.match || ''}"`); break; }
          pendingDeletes.push({ label: `למחוק את הפרויקט "${p.name}"? (יימחקו גם המשימות והקבצים שלו)`, action: { type: 'DELETE_PROJECT', id: p.id } });
          break;
        }

        // ---- Tasks ----
        case 'add_task': {
          const title = a.title || a.name;
          if (!title) { logs.push('⚠️ לא צוין שם משימה'); break; }
          const p = a.project ? findProject(work, a.project) : null;
          const payload = { id: genId(), title: String(title).trim(), projectId: p?.id || null, clientId: p?.clientId || null, status: normTaskStatus(a.status) || 'new', priority: normTaskPriority(a.priority) || 'normal', deadline: a.deadline || '', assignee: a.assignee || 'נתן', linkRef: '', notes: a.notes || '' };
          dispatch({ type: 'ADD_TASK', payload }); work.tasks.unshift(payload);
          logs.push(`✓ נוספה משימה: ${payload.title}`);
          break;
        }
        case 'update_task': {
          const t = findTask(work, a.task || a.title || a.name || a.match);
          if (!t) { logs.push(`⚠️ לא נמצאה משימה "${a.task || a.title || a.name || a.match || ''}"`); break; }
          const s = (a.set && typeof a.set === 'object') ? { ...a, ...a.set } : a;
          const patch = { id: t.id };
          if (s.status !== undefined) patch.status = normTaskStatus(s.status);
          if (s.priority !== undefined) patch.priority = normTaskPriority(s.priority);
          if (s.deadline !== undefined) patch.deadline = s.deadline;
          if (s.notes !== undefined) patch.notes = s.notes;
          if (s.newTitle || s.newName) patch.title = String(s.newTitle || s.newName).trim();
          dispatch({ type: 'UPDATE_TASK', payload: patch }); Object.assign(t, patch);
          logs.push(`✓ עודכנה משימה: ${t.title}`);
          break;
        }
        case 'delete_task': {
          const t = findTask(work, a.task || a.title || a.name || a.match);
          if (!t) { logs.push(`⚠️ לא נמצאה משימה "${a.task || a.title || a.name || a.match || ''}"`); break; }
          pendingDeletes.push({ label: `למחוק את המשימה "${t.title}"?`, action: { type: 'DELETE_TASK', id: t.id } });
          break;
        }

        // ---- Leads (outreach) ----
        case 'add_lead': {
          if (!a.name) { logs.push('⚠️ לא צוין שם ליד'); break; }
          const payload = { id: genId(), name: String(a.name).trim(), category: a.category || 'other', status: normLeadStatus(a.status) || 'pending', clientId: null, need: a.need || '' };
          dispatch({ type: 'ADD_LEAD', payload }); work.leads.unshift(payload);
          logs.push(`✓ נוסף ליד: ${payload.name}`);
          break;
        }
        case 'update_lead': {
          const l = findLead(work, a.lead || a.name || a.match);
          if (!l) { logs.push(`⚠️ לא נמצא ליד "${a.lead || a.name || a.match || ''}"`); break; }
          const s = (a.set && typeof a.set === 'object') ? { ...a, ...a.set } : a;
          const patch = { id: l.id };
          if (s.status !== undefined) patch.status = normLeadStatus(s.status);
          if (s.category !== undefined) patch.category = s.category;
          if (s.need !== undefined) patch.need = s.need;
          if (s.newName) patch.name = String(s.newName).trim();
          dispatch({ type: 'UPDATE_LEAD', payload: patch }); Object.assign(l, patch);
          logs.push(`✓ עודכן ליד: ${l.name}`);
          break;
        }
        case 'delete_lead': {
          const l = findLead(work, a.lead || a.name || a.match);
          if (!l) { logs.push(`⚠️ לא נמצא ליד "${a.lead || a.name || a.match || ''}"`); break; }
          pendingDeletes.push({ label: `למחוק את הליד "${l.name}"?`, action: { type: 'DELETE_LEAD', id: l.id } });
          break;
        }

        // ---- Quote status / delete ----
        case 'update_quote_status': {
          const ref = a.quote || a.number || a.client || a.match;
          const qt = findQuote(work, ref);
          if (!qt || !qt.id) { logs.push(`⚠️ לא נמצאה הצעת מחיר "${ref || ''}"`); break; }
          const st = normQuoteStatus(a.status);
          if (!st) { logs.push('⚠️ לא צוין סטטוס (טיוטה/נשלחה/אושרה/נדחתה)'); break; }
          dispatch({ type: 'UPDATE_QUOTE', payload: { id: qt.id, status: st } }); qt.status = st;
          logs.push(`✓ הצעת מחיר ${qt.number || ''} → ${st}`);
          break;
        }
        case 'delete_quote': {
          const ref = a.quote || a.number || a.client || a.match;
          const qt = findQuote(work, ref);
          if (!qt || !qt.id) { logs.push(`⚠️ לא נמצאה הצעת מחיר "${ref || ''}"`); break; }
          pendingDeletes.push({ label: `למחוק את הצעת המחיר ${qt.number || ''}?`, action: { type: 'DELETE_QUOTE', id: qt.id } });
          break;
        }

        // ---- Transaction edit / delete ----
        case 'update_tx': {
          const tx = findTx(work, a.tx || a.description || a.match);
          if (!tx || !tx.id) { logs.push(`⚠️ לא נמצאה תנועה כספית "${a.tx || a.description || a.match || ''}"`); break; }
          const s = (a.set && typeof a.set === 'object') ? { ...a, ...a.set } : a;
          const patch = { id: tx.id };
          if (s.amount !== undefined) patch.amount = Number(s.amount) || 0;
          if (s.category !== undefined) patch.category = s.category;
          if (s.date !== undefined) patch.date = s.date;
          if (s.description !== undefined) patch.description = s.description;
          dispatch({ type: 'UPDATE_TX', payload: patch }); Object.assign(tx, patch);
          logs.push(`✓ עודכנה תנועה: ${tx.description || tx.id}`);
          break;
        }
        case 'delete_tx': {
          const tx = findTx(work, a.tx || a.description || a.match);
          if (!tx || !tx.id) { logs.push(`⚠️ לא נמצאה תנועה כספית "${a.tx || a.description || a.match || ''}"`); break; }
          pendingDeletes.push({ label: `למחוק את התנועה "${tx.description || tx.id}"?`, action: { type: 'DELETE_TX', id: tx.id } });
          break;
        }

        // ---- Bulk delete (code-gated, granular pick happens in the UI) ----
        case 'delete_all': {
          const entity = a.entity || a.scope || a.type2 || 'inventory';
          const gate = buildBulkDeleteGate(entity, data);
          if (!gate) { logs.push(`⚠️ לא ניתן למחוק "${entity}" — ישות לא מוכרת`); break; }
          if (!gate.items.length) { logs.push(`אין ${gate.entityLabel} למחיקה — הרשימה ריקה.`); break; }
          codeGates.push(gate);
          break;
        }

        default:
          // Unknown op (e.g. a model hallucinated `show_clients` on an info
          // question) — skip silently so no spurious message appears.
          break;
      }
    } catch (err) {
      logs.push(`⚠️ שגיאה בפעולה ${a.op}: ${err.message}`);
    }
  }
  return { logs, pendingDeletes, codeGates };
}

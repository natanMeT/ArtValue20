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

// ===================================================================
// Business ENTITIES — the data-shape declaration for this business. ONE ordered
// descriptor per collection drives three things at once:
//   1. executeActions' working-copy keys (key ↔ store dataKey; only `leads`
//      differs: it lives under `outreachLeads` in the store),
//   2. the bulk-delete picker (label + per-row text + DELETE dispatch type),
//   3. the deterministic bulk-delete intent detector (`match` = NL keywords).
// This is the Art Value reference set. A new business swaps it (jakePack.js owns
// it as `pack.entities`) — the engine reads it, never hardcodes a collection.
// Order = precedence for detectBulkDelete (first matching keyword wins).
// ===================================================================
export const BUSINESS_ENTITIES = [
  { key: 'inventory', dataKey: 'inventory', label: 'פריטי המלאי', deleteType: 'DELETE_ITEM', match: /(מלאי|פריט|מוצר)/, row: (x) => `${x.name || 'פריט'} · ${Number(x.qty) || 0} ${x.unit || 'יח׳'}` },
  { key: 'clients', dataKey: 'clients', label: 'הלקוחות', deleteType: 'DELETE_CLIENT', match: /(לקוח)/, row: (x) => x.name || 'לקוח' },
  { key: 'leads', dataKey: 'outreachLeads', label: 'הלידים', deleteType: 'DELETE_LEAD', match: /(ליד|הפני)/, row: (x) => x.name || 'ליד' },
  { key: 'tasks', dataKey: 'tasks', label: 'המשימות', deleteType: 'DELETE_TASK', match: /(משימ)/, row: (x) => x.title || 'משימה' },
  { key: 'projects', dataKey: 'projects', label: 'הפרויקטים', deleteType: 'DELETE_PROJECT', match: /(פרויקט|פרוייקט)/, row: (x) => x.name || 'פרויקט' },
  { key: 'quotes', dataKey: 'quotes', label: 'הצעות המחיר', deleteType: 'DELETE_QUOTE', match: /(הצע)/, row: (x) => `${x.number || 'הצעה'}` },
  { key: 'transactions', dataKey: 'transactions', label: 'התנועות הכספיות', deleteType: 'DELETE_TX', match: /(תנוע|הכנס|הוצא|פיננס|כספ)/, row: (x) => `${x.description || x.category || 'תנועה'} · ${Number(x.amount) || 0} ₪` },
];

const entityByKey = (entities, key) => (entities || []).find((e) => e.key === key) || null;

// Build the picker payload for a bulk delete: { entity, entityLabel, dispatchType, items:[{id,label}] }.
export function buildBulkDeleteGate(entity, data, entities = BUSINESS_ENTITIES) {
  const e = entityByKey(entities, entity);
  if (!e) return null;
  const items = (data?.[e.dataKey] || []).map((x) => ({ id: x.id, label: e.row(x) })).filter((x) => x.id);
  return { entity, entityLabel: e.label, dispatchType: e.deleteType, items };
}

// Deterministic bulk-delete intent — does NOT rely on the LLM (small models fake
// destructive ops). Matches "מחק/תמחק/למחוק/תרוקן ... כל ... <entity>", then picks
// the entity by its `match` keywords (first in entities order wins). Returns the
// entity key or null. (\b doesn't work around Hebrew, so we match substrings.)
export function detectBulkDelete(text, entities = BUSINESS_ENTITIES) {
  const t = String(text || '');
  const delVerb = /(תמחק|מחק|למחוק|תנקה|נקה)/.test(t);
  const clearVerb = /(תרוקן|רוקן)/.test(t);
  const hasAll = /(כל|הכל|הכול)/.test(t);
  if (!((delVerb && hasAll) || clearVerb)) return null;
  const hit = (entities || []).find((e) => e.match && e.match.test(t));
  return hit ? hit.key : null;
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

// ---- action refs (which field names a model used to point at an entity) ----
const clientRef = (a) => a.client || a.name || a.match;
const itemRef = (a) => a.item || a.name || a.match;

// ===================================================================
// Modular action registry — each op is a self-contained handler
//   (a, ctx) => void
// where ctx = { work, data, dispatch, logs, pendingDeletes, codeGates }.
// A handler pushes human logs / deferred deletes / code-gates into ctx and
// mutates ctx.work in place, so later actions in the SAME batch observe the
// entities earlier ones created/updated (e.g. add_client → mark_paid).
//
// This registry is the single source of truth for which ops exist: KNOWN_OPS
// (the parser gate) is DERIVED from its keys, so adding an action is one entry
// here — no second list to keep in sync. A business pack can extend or override
// the set by passing its own registry to executeActions(actions,data,dispatch,registry).
// ===================================================================
export const ACTION_HANDLERS = {
  // ---- Clients ----
  add_client(a, { work, dispatch, logs }) {
    if (!a.name) { logs.push('⚠️ לא צוין שם לקוח להוספה'); return; }
    const dup = work.clients.find((c) => (c.name || '').trim().toLowerCase() === String(a.name).trim().toLowerCase());
    if (dup) { logs.push(`⚠️ הלקוח "${dup.name}" כבר קיים — לא נוצר כפול`); return; }
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
  },

  update_client(a, { work, dispatch, logs }) {
    const c = findClient(work, clientRef(a));
    if (!c) { logs.push(`⚠️ לא נמצא לקוח בשם "${clientRef(a) || ''}"`); return; }
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
  },

  delete_client(a, { work, pendingDeletes, logs }) {
    const c = findClient(work, clientRef(a));
    if (!c) { logs.push(`⚠️ לא נמצא לקוח בשם "${clientRef(a) || ''}"`); return; }
    pendingDeletes.push({ label: `למחוק את הלקוח "${c.name}"?`, action: { type: 'DELETE_CLIENT', id: c.id } });
  },

  // ---- Inventory ----
  add_item(a, { work, dispatch, logs }) {
    if (!a.name) { logs.push('⚠️ לא צוין שם פריט להוספה'); return; }
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
  },

  update_item(a, { work, dispatch, logs }) {
    const it = findItem(work, itemRef(a));
    if (!it) { logs.push(`⚠️ לא נמצא פריט "${itemRef(a) || ''}"`); return; }
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
  },

  add_stock(a, ctx) { adjustStock(a, ctx); },
  remove_stock(a, ctx) { adjustStock(a, ctx); },

  delete_item(a, { work, pendingDeletes, logs }) {
    const it = findItem(work, itemRef(a));
    if (!it) { logs.push(`⚠️ לא נמצא פריט "${itemRef(a) || ''}"`); return; }
    pendingDeletes.push({ label: `למחוק את הפריט "${it.name}"?`, action: { type: 'DELETE_ITEM', id: it.id } });
  },

  // ---- Quotes ----
  add_quote(a, { work, dispatch, logs }) {
    const c = findClient(work, clientRef(a));
    if (!c) { logs.push(`⚠️ לא נמצא לקוח בשם "${clientRef(a) || ''}"`); return; }
    const raw = Array.isArray(a.items) ? a.items : [];
    const items = raw
      .filter((it) => it && (it.desc || it.description))
      .map((it) => ({
        id: 'li' + Math.random().toString(36).slice(2, 9),
        desc: String(it.desc || it.description).trim(),
        qty: Math.round(Number(it.qty) || 1) || 1,
        price: Number(it.price) || 0,
      }));
    if (!items.length) { logs.push('⚠️ הצעת מחיר חייבת לפחות שורה אחת עם תיאור'); return; }
    const vatRate = a.vatRate !== undefined ? Number(a.vatRate) || 0 : 18;
    const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
    const total = Math.round(subtotal * (1 + vatRate / 100));
    const nums = work.quotes.map((q) => parseInt(String(q.number).replace(/\D/g, ''), 10)).filter((n) => !Number.isNaN(n));
    const number = `AV-${(nums.length ? Math.max(...nums) : 1040) + 1}`;
    const qPayload = { id: genId(), number, clientId: c.id, date: today(), validDays: Number(a.validDays) || 30, vatRate, status: normQuoteStatus(a.status) || 'draft', notes: a.notes || '', items };
    dispatch({ type: 'ADD_QUOTE', payload: qPayload });
    work.quotes.unshift(qPayload);
    logs.push(`✓ נוצרה הצעת מחיר ${number} ל-${c.name} · ${items.length} שורות · סה״כ ${total.toLocaleString('he-IL')} ₪`);
  },

  update_quote_status(a, { work, dispatch, logs }) {
    const ref = a.quote || a.number || a.client || a.match;
    const qt = findQuote(work, ref);
    if (!qt || !qt.id) { logs.push(`⚠️ לא נמצאה הצעת מחיר "${ref || ''}"`); return; }
    const st = normQuoteStatus(a.status);
    if (!st) { logs.push('⚠️ לא צוין סטטוס (טיוטה/נשלחה/אושרה/נדחתה)'); return; }
    dispatch({ type: 'UPDATE_QUOTE', payload: { id: qt.id, status: st } }); qt.status = st;
    logs.push(`✓ הצעת מחיר ${qt.number || ''} → ${st}`);
  },

  delete_quote(a, { work, pendingDeletes, logs }) {
    const ref = a.quote || a.number || a.client || a.match;
    const qt = findQuote(work, ref);
    if (!qt || !qt.id) { logs.push(`⚠️ לא נמצאה הצעת מחיר "${ref || ''}"`); return; }
    pendingDeletes.push({ label: `למחוק את הצעת המחיר ${qt.number || ''}?`, action: { type: 'DELETE_QUOTE', id: qt.id } });
  },

  // ---- Finance ----
  mark_paid(a, { work, dispatch, logs }) {
    const c = findClient(work, clientRef(a));
    if (!c) { logs.push(`⚠️ לא נמצא לקוח בשם "${clientRef(a) || ''}"`); return; }
    const amount = a.amount !== undefined ? Number(a.amount) || 0 : (Number(c.value) || 0);
    dispatch({ type: 'UPDATE_CLIENT', payload: { id: c.id, status: 'completed_paid', value: amount, paidDate: today() } });
    c.status = 'completed_paid'; c.value = amount;
    work.transactions.unshift({ type: 'income', clientId: c.id, amount });
    logs.push(`✓ ${c.name} סומן כשולם — נרשמה הכנסה של ${amount.toLocaleString('he-IL')} ₪`);
  },

  add_income(a, { work, dispatch, logs }) {
    const amount = Number(a.amount) || 0;
    if (!amount) { logs.push('⚠️ לא צוין סכום הכנסה'); return; }
    const c = a.client ? findClient(work, a.client) : null;
    dispatch({ type: 'ADD_TX', payload: { type: 'income', amount, category: a.category || 'תשלום לקוח', date: a.date || today(), description: a.description || (c ? `תשלום · ${c.name}` : 'הכנסה'), clientId: c?.id || null } });
    work.transactions.unshift({ type: 'income', clientId: c?.id || null, amount });
    logs.push(`✓ נרשמה הכנסה: ${amount.toLocaleString('he-IL')} ₪${c ? ` (${c.name})` : ''}`);
  },

  add_expense(a, { dispatch, logs }) {
    const amount = Number(a.amount) || 0;
    if (!amount) { logs.push('⚠️ לא צוין סכום הוצאה'); return; }
    dispatch({ type: 'ADD_TX', payload: { type: 'expense', amount, category: a.category || 'הוצאה', date: a.date || today(), description: a.description || 'הוצאה' } });
    logs.push(`✓ נרשמה הוצאה: ${amount.toLocaleString('he-IL')} ₪`);
  },

  move_pipeline(a, { work, dispatch, logs }) {
    const c = findClient(work, clientRef(a));
    if (!c) { logs.push(`⚠️ לא נמצא לקוח בשם "${clientRef(a) || ''}"`); return; }
    const stage = normPipeline(a.stage);
    if (!stage) { logs.push('⚠️ לא צוין שלב בפייפליין'); return; }
    dispatch({ type: 'UPDATE_CLIENT', payload: { id: c.id, pipelineStage: stage } });
    c.pipelineStage = stage;
    logs.push(`✓ ${c.name} הועבר בפייפליין → ${stage}`);
  },

  add_income_from_clients(a, { work, dispatch, logs }) {
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
    if (!cls.length) { logs.push('⚠️ אין לקוחות עם שווי לרישום הכנסה'); return; }
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
  },

  remove_duplicate_clients(a, { work, pendingDeletes, logs }) {
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
  },

  // ---- Projects ----
  add_project(a, { work, dispatch, logs }) {
    if (!a.name) { logs.push('⚠️ לא צוין שם פרויקט'); return; }
    const c = a.client ? findClient(work, a.client) : null;
    const payload = { id: genId(), name: String(a.name).trim(), clientId: c?.id || null, clientName: c?.name || 'לקוח', serviceType: normProjectType(a.serviceType) || 'website', value: Number(a.value) || 0, status: normProjectStatus(a.status) || 'active', deadline: a.deadline || '', nextAction: a.nextAction || '', description: a.description || '', missing: '', deliverables: '' };
    dispatch({ type: 'ADD_PROJECT', payload }); work.projects.unshift(payload);
    logs.push(`✓ נוסף פרויקט: ${payload.name}${c ? ` (${c.name})` : ''}`);
  },

  update_project(a, { work, dispatch, logs }) {
    const p = findProject(work, a.project || a.name || a.match);
    if (!p) { logs.push(`⚠️ לא נמצא פרויקט "${a.project || a.name || a.match || ''}"`); return; }
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
  },

  delete_project(a, { work, pendingDeletes, logs }) {
    const p = findProject(work, a.project || a.name || a.match);
    if (!p) { logs.push(`⚠️ לא נמצא פרויקט "${a.project || a.name || a.match || ''}"`); return; }
    pendingDeletes.push({ label: `למחוק את הפרויקט "${p.name}"? (יימחקו גם המשימות והקבצים שלו)`, action: { type: 'DELETE_PROJECT', id: p.id } });
  },

  // ---- Tasks ----
  add_task(a, { work, dispatch, logs }) {
    const title = a.title || a.name;
    if (!title) { logs.push('⚠️ לא צוין שם משימה'); return; }
    const p = a.project ? findProject(work, a.project) : null;
    const payload = { id: genId(), title: String(title).trim(), projectId: p?.id || null, clientId: p?.clientId || null, status: normTaskStatus(a.status) || 'new', priority: normTaskPriority(a.priority) || 'normal', deadline: a.deadline || '', assignee: a.assignee || 'נתן', linkRef: '', notes: a.notes || '' };
    dispatch({ type: 'ADD_TASK', payload }); work.tasks.unshift(payload);
    logs.push(`✓ נוספה משימה: ${payload.title}`);
  },

  update_task(a, { work, dispatch, logs }) {
    const t = findTask(work, a.task || a.title || a.name || a.match);
    if (!t) { logs.push(`⚠️ לא נמצאה משימה "${a.task || a.title || a.name || a.match || ''}"`); return; }
    const s = (a.set && typeof a.set === 'object') ? { ...a, ...a.set } : a;
    const patch = { id: t.id };
    if (s.status !== undefined) patch.status = normTaskStatus(s.status);
    if (s.priority !== undefined) patch.priority = normTaskPriority(s.priority);
    if (s.deadline !== undefined) patch.deadline = s.deadline;
    if (s.notes !== undefined) patch.notes = s.notes;
    if (s.newTitle || s.newName) patch.title = String(s.newTitle || s.newName).trim();
    dispatch({ type: 'UPDATE_TASK', payload: patch }); Object.assign(t, patch);
    logs.push(`✓ עודכנה משימה: ${t.title}`);
  },

  delete_task(a, { work, pendingDeletes, logs }) {
    const t = findTask(work, a.task || a.title || a.name || a.match);
    if (!t) { logs.push(`⚠️ לא נמצאה משימה "${a.task || a.title || a.name || a.match || ''}"`); return; }
    pendingDeletes.push({ label: `למחוק את המשימה "${t.title}"?`, action: { type: 'DELETE_TASK', id: t.id } });
  },

  // ---- Leads (outreach) ----
  add_lead(a, { work, dispatch, logs }) {
    if (!a.name) { logs.push('⚠️ לא צוין שם ליד'); return; }
    const payload = { id: genId(), name: String(a.name).trim(), category: a.category || 'other', status: normLeadStatus(a.status) || 'pending', clientId: null, need: a.need || '' };
    dispatch({ type: 'ADD_LEAD', payload }); work.leads.unshift(payload);
    logs.push(`✓ נוסף ליד: ${payload.name}`);
  },

  update_lead(a, { work, dispatch, logs }) {
    const l = findLead(work, a.lead || a.name || a.match);
    if (!l) { logs.push(`⚠️ לא נמצא ליד "${a.lead || a.name || a.match || ''}"`); return; }
    const s = (a.set && typeof a.set === 'object') ? { ...a, ...a.set } : a;
    const patch = { id: l.id };
    if (s.status !== undefined) patch.status = normLeadStatus(s.status);
    if (s.category !== undefined) patch.category = s.category;
    if (s.need !== undefined) patch.need = s.need;
    if (s.newName) patch.name = String(s.newName).trim();
    dispatch({ type: 'UPDATE_LEAD', payload: patch }); Object.assign(l, patch);
    logs.push(`✓ עודכן ליד: ${l.name}`);
  },

  delete_lead(a, { work, pendingDeletes, logs }) {
    const l = findLead(work, a.lead || a.name || a.match);
    if (!l) { logs.push(`⚠️ לא נמצא ליד "${a.lead || a.name || a.match || ''}"`); return; }
    pendingDeletes.push({ label: `למחוק את הליד "${l.name}"?`, action: { type: 'DELETE_LEAD', id: l.id } });
  },

  // ---- Transaction edit / delete ----
  update_tx(a, { work, dispatch, logs }) {
    const tx = findTx(work, a.tx || a.description || a.match);
    if (!tx || !tx.id) { logs.push(`⚠️ לא נמצאה תנועה כספית "${a.tx || a.description || a.match || ''}"`); return; }
    const s = (a.set && typeof a.set === 'object') ? { ...a, ...a.set } : a;
    const patch = { id: tx.id };
    if (s.amount !== undefined) patch.amount = Number(s.amount) || 0;
    if (s.category !== undefined) patch.category = s.category;
    if (s.date !== undefined) patch.date = s.date;
    if (s.description !== undefined) patch.description = s.description;
    dispatch({ type: 'UPDATE_TX', payload: patch }); Object.assign(tx, patch);
    logs.push(`✓ עודכנה תנועה: ${tx.description || tx.id}`);
  },

  delete_tx(a, { work, pendingDeletes, logs }) {
    const tx = findTx(work, a.tx || a.description || a.match);
    if (!tx || !tx.id) { logs.push(`⚠️ לא נמצאה תנועה כספית "${a.tx || a.description || a.match || ''}"`); return; }
    pendingDeletes.push({ label: `למחוק את התנועה "${tx.description || tx.id}"?`, action: { type: 'DELETE_TX', id: tx.id } });
  },

  // ---- Bulk delete (code-gated, granular pick happens in the UI) ----
  delete_all(a, { data, codeGates, logs, entities }) {
    const entity = a.entity || a.scope || a.type2 || 'inventory';
    const gate = buildBulkDeleteGate(entity, data, entities);
    if (!gate) { logs.push(`⚠️ לא ניתן למחוק "${entity}" — ישות לא מוכרת`); return; }
    if (!gate.items.length) { logs.push(`אין ${gate.entityLabel} למחיקה — הרשימה ריקה.`); return; }
    codeGates.push(gate);
  },
};

// add_stock / remove_stock share a body — direction comes from a.op. A degenerate
// op (no amount, or qty unchanged) must NOT report success, otherwise a ✓ no-op
// masquerades as a real change to the lie-detector (reconcileClaim).
function adjustStock(a, { work, dispatch, logs }) {
  const it = findItem(work, itemRef(a));
  if (!it) { logs.push(`⚠️ לא נמצא פריט "${itemRef(a) || ''}"`); return; }
  const amt = Math.abs(Math.round(Number(a.amount ?? a.qty ?? a.delta) || 0));
  const cur = Math.round(Number(it.qty) || 0);
  const next = a.op === 'add_stock' ? cur + amt : Math.max(0, cur - amt);
  if (amt === 0) { logs.push(`⚠️ ${it.name}: לא צוינה כמות לשינוי — לא בוצע`); return; }
  if (next === cur) { logs.push(`⚠️ ${it.name}: ללא שינוי (${cur} ${it.unit || ''})`.trim()); return; }
  dispatch({ type: 'UPDATE_ITEM', payload: { id: it.id, qty: next, updatedAt: today() } });
  it.qty = next;
  logs.push(`✓ ${it.name}: ${cur} → ${next} ${it.unit || ''}`.trim());
}

// The set of real ops, DERIVED from the registry. Used to gate the parser so a
// stray {type:"income"} or other JSON isn't mistaken for an action (small models
// name the key "op", "type" or "action" inconsistently — we accept all three).
const KNOWN_OPS = new Set(Object.keys(ACTION_HANDLERS));

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

// ---- execute: dispatch each action via the registry; collect logs + deletes ----
// returns { logs, pendingDeletes, codeGates, nextData }. A pack may pass its own
// `registry` (extending/overriding ACTION_HANDLERS) to retarget Jake's toolbox.
export function executeActions(actions, data, dispatch, registry = ACTION_HANDLERS, entities = BUSINESS_ENTITIES) {
  const logs = [];
  const pendingDeletes = [];
  const codeGates = []; // bulk deletes: require an auth code + granular pick in the UI
  // Live working copy, built from the pack's entity declaration (key ↔ store
  // dataKey). Actions in the SAME batch see entities created/updated by earlier
  // ones (e.g. add_client → then mark_paid / add_quote on that client).
  const work = {};
  for (const e of entities) work[e.key] = [...(data[e.dataKey] || [])];
  // Shared context handed to every handler. Mutating work/logs/etc. is the contract.
  const ctx = { work, data, dispatch, logs, pendingDeletes, codeGates, entities };

  for (const a of actions || []) {
    const handler = a && registry[a.op];
    // Unknown op (e.g. a model hallucinated `show_clients` on an info question) —
    // skip silently so no spurious message appears.
    if (typeof handler !== 'function') continue;
    try {
      handler(a, ctx);
    } catch (err) {
      logs.push(`⚠️ שגיאה בפעולה ${a.op}: ${err.message}`);
    }
  }
  // nextData: the live working copy after this batch (adds/updates applied;
  // deletes are deferred to confirmation so they're NOT reflected here), mapped
  // back to store dataKeys. Lets the agent loop OBSERVE the result of a step and
  // plan the next one on fresh state.
  const nextData = { ...data };
  for (const e of entities) nextData[e.dataKey] = work[e.key];
  return { logs, pendingDeletes, codeGates, nextData };
}

// Stable identity for an action — used by the agent loop to skip re-running a
// step it already executed (prevents loops repeating the same op).
export function actionSig(a) {
  if (!a || !a.op) return '';
  const ref = (a.client || a.name || a.item || a.task || a.project || a.lead || a.quote || a.tx || a.match || '').toString().trim().toLowerCase();
  const extra = [a.value, a.amount, a.status, a.stage, a.qty, a.entity].filter((v) => v !== undefined).join('|');
  return `${a.op}:${ref}:${extra}`;
}

// ===================================================================
// describeActions — turn proposed ops into human Hebrew confirm-card lines, with
// the REFERENCED entity RESOLVED against live data (so the user sees "כהן → דני כהן"
// and can catch a wrong match before approving). Powers the gen-2 propose→confirm
// →execute card. Pure (read-only); never mutates. Unknown ops get a safe fallback.
// ===================================================================
const ils2 = (n) => (Number(n) || 0).toLocaleString('he-IL');
const STAGE_HE = { lead: 'ליד', first_call: 'שיחה ראשונית', quote_sent: 'נשלחה הצעה', await_approval: 'ממתין לאישור', won: 'נסגר', in_progress: 'בעבודה', delivered: 'נמסר', retainer: 'המשך שירות', lost: 'אבוד' };

function resolvedName(finder, data, ref, fallback) {
  const hit = finder(data, ref);
  if (hit && hit.name && String(hit.name).toLowerCase() !== String(ref || '').toLowerCase()) return `${ref} → ${hit.name}`;
  return hit?.name || hit?.title || ref || fallback;
}

export function describeActions(actions, data) {
  // leads live under outreachLeads — give the lead finder a data view it understands.
  const leadView = { leads: data.outreachLeads || [] };
  const out = [];
  for (const a of actions || []) {
    const op = a && (a.op || a.type || a.action);
    let line;
    switch (op) {
      case 'add_client': line = `➕ להוסיף לקוח: ${a.name || '—'}${a.value ? ` · ${ils2(a.value)} ₪` : ''}${a.status ? ` · ${normClientStatus(a.status)}` : ''}`; break;
      case 'update_client': line = `✏️ לעדכן לקוח: ${resolvedName(findClient, data, clientRef(a))}${a.value !== undefined || a.amount !== undefined ? ` · שווי → ${ils2(a.value ?? a.amount)} ₪` : ''}${a.status ? ` · סטטוס → ${normClientStatus(a.status)}` : ''}${a.newName ? ` · שם → ${a.newName}` : ''}`; break;
      case 'delete_client': line = `🗑️ למחוק לקוח: ${resolvedName(findClient, data, clientRef(a))} (יידרש אישור מחיקה)`; break;
      case 'add_item': line = `➕ להוסיף פריט מלאי: ${a.name || '—'}${a.qty !== undefined ? ` · ${Math.round(Number(a.qty) || 0)} ${a.unit || 'יח׳'}` : ''}`; break;
      case 'update_item': line = `✏️ לעדכן פריט: ${resolvedName(findItem, data, itemRef(a))}`; break;
      case 'add_stock': line = `📦 להוסיף מלאי: ${resolvedName(findItem, data, itemRef(a))} (+${Math.abs(Math.round(Number(a.amount ?? a.qty) || 0))})`; break;
      case 'remove_stock': line = `📦 להוריד מלאי: ${resolvedName(findItem, data, itemRef(a))} (−${Math.abs(Math.round(Number(a.amount ?? a.qty) || 0))})`; break;
      case 'delete_item': line = `🗑️ למחוק פריט: ${resolvedName(findItem, data, itemRef(a))} (יידרש אישור מחיקה)`; break;
      case 'add_quote': {
        const items = Array.isArray(a.items) ? a.items : [];
        const sub = items.reduce((s, it) => s + (Number(it.qty) || 1) * (Number(it.price) || 0), 0);
        line = `📄 ליצור הצעת מחיר ל-${resolvedName(findClient, data, clientRef(a))} · ${items.length} שורות · ~${ils2(Math.round(sub * 1.18))} ₪ כולל מע״מ`;
        break;
      }
      case 'update_quote_status': line = `✏️ לעדכן סטטוס הצעת מחיר ${a.quote || a.number || ''} → ${a.status || ''}`; break;
      case 'delete_quote': line = `🗑️ למחוק הצעת מחיר ${a.quote || a.number || a.client || ''} (יידרש אישור)`; break;
      case 'mark_paid': line = `💰 לסמן כשולם: ${resolvedName(findClient, data, clientRef(a))}${a.amount !== undefined ? ` · ${ils2(a.amount)} ₪` : ' · לפי שווי הלקוח'} (תירשם הכנסה)`; break;
      case 'add_income': line = `💰 לרשום הכנסה: ${ils2(a.amount)} ₪${a.description ? ` · ${a.description}` : ''}`; break;
      case 'add_expense': line = `💸 לרשום הוצאה: ${ils2(a.amount)} ₪${a.description ? ` · ${a.description}` : ''}`; break;
      case 'add_income_from_clients': line = `💰 לרשום הכנסות מכל הלקוחות (לפי השווי הרשום, ללא כפילויות)`; break;
      case 'move_pipeline': line = `↗️ להעביר בפייפליין: ${resolvedName(findClient, data, clientRef(a))} → ${STAGE_HE[normPipeline(a.stage)] || a.stage || ''}`; break;
      case 'remove_duplicate_clients': line = `🧹 לנקות לקוחות כפולים (יוצג לאישור פרטני)`; break;
      case 'add_project': line = `➕ להוסיף פרויקט: ${a.name || '—'}${a.client ? ` · ${a.client}` : ''}`; break;
      case 'update_project': line = `✏️ לעדכן פרויקט: ${resolvedName(findProject, data, a.project || a.name || a.match)}`; break;
      case 'delete_project': line = `🗑️ למחוק פרויקט: ${resolvedName(findProject, data, a.project || a.name || a.match)} (יידרש אישור)`; break;
      case 'add_task': line = `➕ להוסיף משימה: ${a.title || a.name || '—'}`; break;
      case 'update_task': line = `✏️ לעדכן משימה: ${resolvedName(findTask, data, a.task || a.title || a.name || a.match)}`; break;
      case 'delete_task': line = `🗑️ למחוק משימה: ${resolvedName(findTask, data, a.task || a.title || a.name || a.match)} (יידרש אישור)`; break;
      case 'add_lead': line = `➕ להוסיף ליד: ${a.name || '—'}`; break;
      case 'update_lead': line = `✏️ לעדכן ליד: ${resolvedName(findLead, leadView, a.lead || a.name || a.match)}`; break;
      case 'delete_lead': line = `🗑️ למחוק ליד: ${resolvedName(findLead, leadView, a.lead || a.name || a.match)} (יידרש אישור)`; break;
      case 'update_tx': line = `✏️ לעדכן תנועה כספית: ${a.tx || a.description || a.match || ''}`; break;
      case 'delete_tx': line = `🗑️ למחוק תנועה כספית: ${a.tx || a.description || a.match || ''} (יידרש אישור)`; break;
      case 'delete_all': line = `⚠️ מחיקה המונית של ${a.entity || a.scope || ''} — תידרש הזנת קוד אישור ובחירה פרטנית`; break;
      default: line = `• ${op || 'פעולה'}`;
    }
    out.push(line);
  }
  return out;
}

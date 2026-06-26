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
import { dashboardKpis, inventoryTotals } from './calc.js';
import { formatCurrency } from './format.js';

// ===================================================================
// Context builder — the compact data snapshot fed to Jake every turn. This is
// business-specific (it knows Art Value's collections + how to phrase them in
// Hebrew), so it lives in the pack. A new business writes its own.
// ===================================================================
function artValueContext(data) {
  const k = dashboardKpis(data);
  const tasks = data.tasks || [];
  const open = tasks.filter((t) => t.status !== 'done');
  const today = open.filter((t) => t.deadline && new Date(t.deadline).toDateString() === new Date().toDateString());
  const projects = (data.projects || []).filter((p) => p.status !== 'completed');
  const byStatus = (s) => data.clients.filter((c) => c.status === s).length;
  const leads = data.outreachLeads || [];
  const leadContacted = leads.filter((l) => l.status === 'contacted').length;
  const leadPending = leads.filter((l) => l.status === 'pending').length;
  const leadIrrelevant = leads.filter((l) => l.status === 'irrelevant').length;
  const now = new Date();
  const lines = [
    `תאריך היום: ${now.toLocaleDateString('he-IL')}.`,
    `לקוחות ב-CRM: ${data.clients.length} סה״כ (${byStatus('lead')} לידים, ${byStatus('active')} פעילים).`,
    `רשימת שמות הלקוחות: ${data.clients.slice(0, 40).map((c) => c.name).join('; ') || 'אין לקוחות עדיין'}.`,
    `פרטי לקוחות: ${data.clients.slice(0, 14).map((c) => `${c.name} [${c.status}${c.value ? `, ${formatCurrency(c.value)}` : ''}${c.nextAction ? `, הבא: ${c.nextAction}` : ''}]`).join('; ') || 'אין'}.`,
    `מחקר לידים (עמוד הפניות): ${leads.length} לידים סה״כ — ${leadPending} ממתינים, ${leadContacted} נוצר קשר, ${leadIrrelevant} לא רלוונטי. דוגמאות: ${leads.slice(0, 8).map((l) => l.name).join('; ') || 'אין'}.`,
    `החודש: הכנסות ${formatCurrency(k.revenue)}, הוצאות ${formatCurrency(k.expenses)}, רווח ${formatCurrency(k.profit)}.`,
    `משימות: ${open.length} פתוחות, ${today.length} להיום. הצעות מחיר ממתינות: ${k.pendingQuotes}.`,
    `פרויקטים פעילים: ${projects.slice(0, 6).map((p) => `${p.name} (${p.clientName}, הפעולה הבאה: ${p.nextAction || '—'})`).join('; ') || 'אין'}.`,
  ];
  const inv = inventoryTotals(data.inventory || []);
  if (inv.count) {
    lines.push(`מלאי: ${inv.count} פריטים, ערך כולל ${formatCurrency(inv.totalValue)}. ${inv.low} במלאי נמוך, ${inv.out} אזלו.`);
    const itemsList = (data.inventory || []).slice(0, 25).map((i) => `${i.name}: ${Number(i.qty) || 0} ${i.unit || 'יח׳'}${i.unitPrice ? ` (₪${i.unitPrice})` : ''}`).join('; ');
    lines.push(`פריטי המלאי (שם: כמות): ${itemsList}.`);
  } else {
    lines.push('מלאי: ריק (אין פריטים עדיין).');
  }
  // Audit-log memory: real recorded history so ג'יק can answer "what changed /
  // what was X before" from facts instead of guessing.
  const acts = (data.activity || []).slice(0, 12);
  if (acts.length) {
    const fmt = (ts) => { try { return new Date(ts).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
    lines.push(`יומן פעילות (היסטוריה אמיתית — לשאלות "מה השתנה / מה היה קודם" שלוף מכאן ואל תנחש): ${acts.map((a) => `${fmt(a.ts)} ${a.summary}`).join(' | ')}.`);
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
  const open = tasks.filter((t) => t.status !== 'done');
  const overdue = open.filter((t) => t.deadline && new Date(t.deadline) < now && new Date(t.deadline).toDateString() !== todayStr);
  const dueToday = open.filter((t) => t.deadline && new Date(t.deadline).toDateString() === todayStr);
  // Money owed: work marked done / awaiting payment, value > 0, not yet paid.
  const owed = (data.clients || []).filter((c) => ['completed', 'await_payment'].includes(c.status) && Number(c.value) > 0);
  const owedSum = owed.reduce((s, c) => s + (Number(c.value) || 0), 0);
  const stuckLeads = (data.clients || []).filter((c) => c.status === 'lead' && !c.nextAction);
  const k = dashboardKpis(data);
  const names = (arr, key = 'name', n = 3) => arr.slice(0, n).map((x) => x[key]).filter(Boolean).join(', ') + (arr.length > n ? ` ועוד ${arr.length - n}` : '');

  const urgent = [];
  if (overdue.length) urgent.push(`🔴 ${overdue.length} משימות באיחור — ${names(overdue, 'title')}`);
  if (owed.length) urgent.push(`💸 ${formatCurrency(owedSum)} ממתין לתשלום מ-${owed.length} לקוחות — ${names(owed)}`);
  const todayList = [];
  if (dueToday.length) todayList.push(`📋 ${dueToday.length} משימות להיום — ${names(dueToday, 'title')}`);
  if (k.pendingQuotes) todayList.push(`📄 ${k.pendingQuotes} הצעות מחיר ממתינות לאישור`);
  if (stuckLeads.length) todayList.push(`👥 ${stuckLeads.length} לידים בלי פעולה הבאה — ${names(stuckLeads)}`);

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
  persona: `אתה ג׳יק — העוזר האישי של נתן, בעל הסטודיו הדיגיטלי Art Value (אתרים, CRM, מיתוג, קמפיינים).
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
- חתום בשם נתן / סטודיו Art Value כשמתאים.
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

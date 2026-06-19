// ===================================================================
// Jake "Business Pack" — everything that makes ג׳יק specific to ONE business.
//
// The ENGINE is generic and unchanged: the chat loop + agent loop (Assistant.jsx),
// the memory/audit log (store), and the action executor (jakeAgent.js). To retarget
// Jake to a NEW business (a charity fund, a clinic, a law office...), you COPY this
// file, change the persona / domain-rules / entity language and the action set, and
// point `activePack` at it. Build the engine once — configure per business.
// ===================================================================
import { ACTIONS_GUIDE } from './jakeAgent.js';

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
  // The action protocol/registry the executor understands (the "toolbox").
  actionsGuide: ACTIONS_GUIDE,
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

נתוני המערכת (זה מה שיש כרגע, עדכני לרגע זה):
${contextText}${noThink}`;
}

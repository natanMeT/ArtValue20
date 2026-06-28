// ===================================================================
// SYNTHETIC V1 outputs — the per-brief concepts used to build the committed
// baseline snapshot WHEN NO REAL LOCAL-MODEL RUN IS AVAILABLE. These are
// hand-authored to be realistic and to exercise every critic behavior (clean,
// generic-reject, near-duplicate, overload, strong-unusual, demote). They are
// NOT real model output — `meta.source` in v1Snapshots.json says `fixture-synthetic`,
// and the report marks the real run as INCOMPLETE until a candidate is promoted.
//
// Terse specs; buildBaseline.js fills the remaining canonical concept fields.
// Each concept: { id, name, strategicAngle, coreIdea, headlineDirection,
//   visualDirection, heroObject, whyItWorks, emotionalTone, originalityScore,
//   brandFitScore }. `rec` = the V1 recommendedConceptId (fit-driven, like V1).
// ===================================================================

const c = (id, name, strategicAngle, coreIdea, headlineDirection, visualDirection, heroObject, whyItWorks, emotionalTone, originalityScore, brandFitScore) =>
  ({ id, name, strategicAngle, coreIdea, headlineDirection, visualDirection, heroObject, whyItWorks, emotionalTone, originalityScore, brandFitScore });

export const SYNTHETIC_V1 = Object.freeze({
  b01: {
    rec: 'concept-1',
    strategy: { businessProblem: 'ניהול ידני מבולגן', campaignObjective: 'הגדלת מכירות', audienceInsight: 'בעלי עסקים עמוסים', strategicDirection: 'מוקד יחיד ופשטות', keyMessage: 'כל העסק במקום אחד' },
    concepts: [
      c('concept-1', 'מרכז שליטה', 'בידול דרך פשטות', 'מרכז שליטה אחד לעסק', 'הכול במקום אחד', 'מגדל בקרה זוהר מעל ערפל פתקים', 'glowing control tower', 'תחושת שליטה ושקט', 'רוגע', 9, 9),
      c('concept-2', 'מהבלגן לשקט', 'הוכחת טרנספורמציה', 'לפני כאוס אחרי סדר', 'מהבלגן לשקט', 'שולחן מפוצל כאוס מול סדר', 'split desk', 'ניגוד חזק שעוצר גלילה', 'הקלה', 8, 8),
      c('concept-3', 'הכול מתחבר', 'מטאפורת איחוד', 'פתקים מתאחדים למסך', 'הכול מתחבר', 'סופת פתקים נהיית מסך אחד', 'paper storm screen', 'סדר מתוך כאוס', 'התפעלות', 7, 7),
    ],
  },
  b02: {
    rec: 'concept-1',
    strategy: { businessProblem: 'מסעדה שכונתית לא מוכרת מספיק', campaignObjective: 'מודעות למותג', audienceInsight: 'משפחות מקומיות', strategicDirection: 'חמימות מקומית', keyMessage: 'המטבח של השכונה' },
    concepts: [
      c('concept-1', 'שולחן בוקר', 'תיאבון חזותי', 'בראנץ׳ שמתחיל את היום', 'בוקר טוב מתחיל כאן', 'שולחן עץ עמוס צלחות בוקר באור רך', 'rustic brunch table', 'חמימות מעוררת רעב', 'חמים', 8, 9),
      c('concept-2', 'השכן שלך', 'שייכות מקומית', 'המקום של השכונה', 'המטבח של השכונה', 'חלון מואר עם אנשים מבפנים בערב', 'glowing neighborhood window', 'תחושת שייכות', 'ביתי', 9, 8),
      c('concept-3', 'ריח של קפה', 'טריגר חושי', 'הריח שמושך פנימה', 'בוא להריח', 'אדי קפה עולים מספל על דלפק', 'steaming coffee cup', 'טריגר חושי מיידי', 'מזמין', 7, 7),
    ],
  },
  b03: {
    rec: 'concept-2',
    strategy: { businessProblem: 'תחרות גבוהה בתיווך יוקרה', campaignObjective: 'גיוס לידים', audienceInsight: 'משקיעים מחפשים ערך', strategicDirection: 'מכירת חוויה ולא קירות', keyMessage: 'הבית הבא שלך' },
    concepts: [
      c('concept-1', 'מפתח לבית', 'חלום הבעלות', 'הבית שחיכית לו', 'הבית הבא שלך', 'מפתח זהב מול חלון פנורמי לעיר', 'golden key', 'סמל הגשמה', 'יוקרתי', 8, 8),
      c('concept-2', 'נוף מהחלון', 'חוויית מגורים', 'הנוף ששווה השקעה', 'תתעורר לנוף הזה', 'חלון רצפה-תקרה מול קו רקיע בזריחה', 'floor to ceiling window', 'מכירת חוויה לא קירות', 'שאפתני', 9, 8),
      c('concept-3', 'הצלחה והשקעה', 'הכוח שלך', 'ההשקעה הטובה ביותר', 'גלה את הכוח של הצלחה', 'גרף עולה כללי', 'אובייקט מרכזי בקומפוזיציה', 'מקצועיות ואיכות מובילה', 'תאגידי', 3, 4),
    ],
  },
  b04: {
    rec: 'concept-1',
    strategy: { businessProblem: 'אנשים נמנעים מיישור שיניים', campaignObjective: 'קידום שירות', audienceInsight: 'מתביישים בחיוך', strategicDirection: 'דיסקרטיות וביטחון', keyMessage: 'יישור בלי שיראו' },
    concepts: [
      c('concept-1', 'חיוך ראשון', 'רגע אנושי', 'הביטחון שבחיוך', 'תחייך בלי לחשוב', 'קלוז-אפ חיוך טבעי באור יום', 'natural smile close-up', 'רגש אנושי ישיר', 'חם', 8, 8),
      c('concept-2', 'יישור שקוף', 'טכנולוגיה דיסקרטית', 'יישור בלי שיראו', 'אף אחד לא יבחין', 'קשתית שקופה מונחת על שיניים לבנות', 'clear aligner', 'דיסקרטיות', 'נקי', 8, 8),
      c('concept-3', 'יישור דיסקרטי', 'טכנולוגיה דיסקרטית', 'יישור בלי שיראו', 'אף אחד לא יבחין', 'קשתית שקופה מונחת על שיניים לבנות', 'clear aligner', 'דיסקרטיות', 'נקי', 6, 6),
    ],
  },
  b05: {
    rec: 'concept-1',
    strategy: { businessProblem: 'מלאי סוף עונה', campaignObjective: 'הגדלת מכירות', audienceInsight: 'רוכבי שטח נלהבים', strategicDirection: 'אנרגיה והרפתקה', keyMessage: 'תן לרוח להוביל' },
    concepts: [
      c('concept-1', 'מהיר כמו הרוח', 'תחושת מהירות', 'האופניים שמשחררים', 'תן לרוח להוביל', 'רוכב מטושטש בתנועה על שביל הרים', 'mountain bike in motion', 'אנרגיה ותנועה', 'אנרגטי', 7, 9),
      c('concept-2', 'השביל קורא', 'הרפתקה', 'כל שביל הוא הזמנה', 'השביל מחכה', 'שביל יחיד מתפתל אל הרים בשקיעה', 'winding trail', 'הזמנה להרפתקה', 'הרפתקני', 8, 8),
      c('concept-3', 'מכונת השטח', 'גאוות מוצר', 'הנדסה שמרגישים', 'בנוי לשטח', 'אופני שטח על סלע עם פרטי מתכת חדים', 'rugged bike on rock', 'גאוות בעלות', 'גאה', 9, 8),
    ],
  },
  b06: {
    rec: 'concept-1',
    strategy: { businessProblem: 'מחסנים מנהלים מלאי ידנית', campaignObjective: 'גיוס לידים', audienceInsight: 'מנהלי תפעול עמוסים', strategicDirection: 'שליטה תפעולית חכמה', keyMessage: 'תמיד יודעים מה יש' },
    concepts: [
      c('concept-1', 'מדף מסודר', 'סדר תפעולי', 'מלאי תמיד מדויק', 'תמיד יודעים מה יש', 'מדפי מחסן מסודרים עם תוויות', 'organized warehouse shelf', 'שליטה תפעולית', 'בטוח', 7, 8),
      c('concept-2', 'המלאי שנושם', 'האנשת נתונים', 'המחסן כיצור חי', 'המלאי שמדבר אליך', 'דופק אור יחיד נע על מדף אפל', 'single pulsing light', 'מטאפורה בלתי שגרתית שנדבקת', 'מסתורי', 9, 7),
      c('concept-3', 'אפס טעויות', 'הפחתת סיכון', 'סוף לחוסרים', 'בלי הפתעות במלאי', 'מדף עם פריט אחד מודגש בירוק', 'highlighted item', 'ביטחון מהפחתת טעות', 'רגוע', 7, 8),
    ],
  },
  b07: {
    rec: 'concept-1',
    strategy: { businessProblem: 'פסטיבל חדש ללא מודעות', campaignObjective: 'מודעות למותג', audienceInsight: 'משפחות וזוגות', strategicDirection: 'מיקוד חושי בודד', keyMessage: 'בוא לטעום' },
    concepts: [
      c('concept-1', 'צלחת אחת', 'מיקוד תיאבון', 'מנה שמספרת סיפור', 'בוא לטעום', 'מנת רחוב צבעונית אחת מצולמת מקרוב', 'single street food plate', 'מיקוד מעורר רעב', 'שמח', 8, 8),
      c('concept-2', 'יד שמגישה', 'חום אנושי', 'אוכל זה חיבור', 'נפגשים סביב אוכל', 'יד מגישה מנה מעל דוכן עץ', 'serving hand', 'חיבור אנושי', 'חמים', 8, 8),
      c('concept-3', 'הכול בפסטיבל', 'שפע', 'חוויה מכל החושים', 'הכול במקום אחד', 'בלונים, דוכנים, אורות וזיקוקים', 'דוכן אוכל', 'עומס חגיגי', 'ססגוני', 6, 6),
    ],
  },
  b08: {
    rec: 'concept-1',
    strategy: { businessProblem: 'עמותה זקוקה לתורמים', campaignObjective: 'מודעות למותג', audienceInsight: 'תורמים מונעי רגש', strategicDirection: 'רגע אנושי אחד', keyMessage: 'היד שלך עושה הבדל' },
    concepts: [
      c('concept-1', 'יד מושטת', 'אמפתיה', 'תרומה שמשנה חיים', 'היד שלך עושה הבדל', 'יד מבוגרת אוחזת יד ילד', 'two clasped hands', 'רגש אנושי ישיר', 'אנושי', 9, 9),
      c('concept-2', 'נר אחד', 'תקווה', 'אור קטן מאיר דרך', 'הדלק תקווה', 'נר יחיד מאיר בחושך', 'single candle', 'סמל תקווה', 'מרגש', 7, 8),
      c('concept-3', 'ספר פתוח', 'הזדמנות', 'חינוך הוא דלת', 'פתח דלת לילד', 'ספר פתוח שממנו בוקע אור', 'glowing open book', 'מטאפורת הזדמנות', 'מעורר השראה', 8, 8),
    ],
  },
  b09: {
    rec: 'concept-1',
    strategy: { businessProblem: 'שוק טיפוח רווי', campaignObjective: 'קידום מוצר', audienceInsight: 'נשים שרוצות טבעי', strategicDirection: 'טוהר טבעי נראה לעין', keyMessage: 'הטבע על העור' },
    concepts: [
      c('concept-1', 'טיפה אחת', 'מינימליזם טבעי', 'טבע בטיפה', 'הטבע על העור', 'טיפת סרום זוהרת על עלה ירוק', 'serum drop on leaf', 'טוהר נראה לעין', 'רך', 8, 8),
      c('concept-2', 'הסוד ליופי', 'הבטחה כללית', 'הטוב ביותר לעור', 'הסוד להצלחה של העור', 'אריזה כללית על רקע ורוד', 'אובייקט מרכזי בקומפוזיציה', 'תחושת איכות', 'כללי', 5, 5),
      c('concept-3', 'אור מבפנים', 'ביטחון עצמי', 'עור שקורן', 'תני לעור לזרוח', 'קלוז-אפ עור זוהר באור טבעי', 'glowing skin close-up', 'חיבור רגשי לתוצאה', 'בטוח', 8, 8),
    ],
  },
  b10: {
    rec: 'concept-1',
    strategy: { businessProblem: 'בעלי רכב דוחים טיפולים', campaignObjective: 'גיוס לידים', audienceInsight: 'בעלי רכב פרטי', strategicDirection: 'אמון מקצועי', keyMessage: 'בידיים טובות' },
    concepts: [
      c('concept-1', 'חורף בטוח', 'מניעת סיכון', 'מוכנים לכביש החורפי', 'אל תיתפס לא מוכן', 'רכב על כביש רטוב עם פנסים דולקים', 'car on wet road', 'הנעה דרך דאגה', 'אחראי', 7, 9),
      c('concept-2', 'מגע מקצועי', 'אמון במומחה', 'ידיים שמכירות רכב', 'בידיים טובות', 'יד מכונאי על מנוע נקי באור סדנה', 'mechanic hand on engine', 'אמון אישי', 'אמין', 8, 8),
      c('concept-3', 'בדיקה שקטה', 'שקט נפשי', 'בדיקה שמורידה דאגה', 'תנוח, בדקנו', 'מד דלק ירוק עם וי', 'green gauge check', 'הקלה', 'רגוע', 7, 7),
    ],
  },
});

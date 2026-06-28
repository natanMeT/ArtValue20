// ===================================================================
// Evaluation briefs — INPUTS ONLY (10 realistic campaigns across distinct
// business categories). Concepts are NOT here; they come from V1 (the snapshot).
// Format: { id, category, needText, data:{ business, brand, campaign } }.
//
// `needText` is the realistic Hebrew request a real-run uses via analyzeMarketingNeed;
// `data` carries the structured business/brand/campaign used to build the canonical
// request deterministically (so the synthetic baseline needs no model). Both paths
// converge on the same canonical request the critic reads.
// ===================================================================

export const BRIEFS = Object.freeze([
  {
    id: 'b01', category: 'studio',
    needText: 'תכין קמפיין להגדלת מכירות באינסטגרם לסטודיו דיגיטלי',
    data: {
      business: { name: 'Art Value', industry: 'סטודיו דיגיטלי', services: [{ id: 's1', name: 'מערכות CRM' }, { id: 's2', name: 'אתרים' }] },
      brand: { brandName: 'Art Value', audience: ['בעלי עסקים'], tone: ['פרימיום', 'חד'], colors: ['#d4ff3f'] },
      campaign: { objective: 'increase_sales', targetAudience: 'בעלי עסקים שמנהלים ידנית', offer: 'דמו חינם', channel: 'instagram_post', format: '4:5' },
    },
  },
  {
    id: 'b02', category: 'restaurant',
    needText: 'קמפיין מודעות למסעדה שכונתית בסטורי',
    data: {
      business: { name: 'בית קפה לבנה', industry: 'מסעדנות', products: [{ id: 'p1', name: 'בראנץ׳' }] },
      brand: { brandName: 'לבנה', audience: ['תושבי השכונה'], tone: ['חמים', 'ביתי'], colors: ['#e7d8b1'] },
      campaign: { objective: 'brand_awareness', targetAudience: 'משפחות שכונתיות', channel: 'instagram_story', format: '9:16' },
    },
  },
  {
    id: 'b03', category: 'real_estate',
    needText: 'קמפיין לידים לדירות יוקרה',
    data: {
      business: { name: 'נדל״ן אופק', industry: 'נדל״ן', services: [{ id: 's1', name: 'תיווך יוקרה' }] },
      brand: { brandName: 'אופק', audience: ['משקיעים'], tone: ['יוקרתי', 'מהוקצע'], colors: ['#1b1b1b'] },
      campaign: { objective: 'generate_leads', targetAudience: 'משקיעי נדל״ן', offer: 'ייעוץ ראשוני', channel: 'facebook_post', format: '1:1' },
    },
  },
  {
    id: 'b04', category: 'clinic',
    needText: 'קמפיין שירות למרפאת שיניים',
    data: {
      business: { name: 'מרפאת חיוך', industry: 'רפואת שיניים', services: [{ id: 's1', name: 'יישור שיניים' }] },
      brand: { brandName: 'חיוך', audience: ['מבוגרים צעירים'], tone: ['נקי', 'אמין'], colors: ['#bfe9ff'] },
      campaign: { objective: 'promote_service', targetAudience: 'אנשים שמתביישים בחיוך', channel: 'instagram_post', format: '4:5' },
    },
  },
  {
    id: 'b05', category: 'retail',
    needText: 'קמפיין מכירות לחנות אופניים',
    data: {
      business: { name: 'גלגל', industry: 'קמעונאות', products: [{ id: 'p1', name: 'אופני שטח' }] },
      brand: { brandName: 'גלגל', audience: ['רוכבים'], tone: ['אנרגטי', 'הרפתקני'], colors: ['#ff6a3d'] },
      campaign: { objective: 'increase_sales', targetAudience: 'רוכבי שטח', offer: 'מבצע סוף עונה', channel: 'instagram_post', format: '1:1' },
    },
  },
  {
    id: 'b06', category: 'b2b_saas',
    needText: 'קמפיין לידים לתוכנת ניהול מלאי',
    data: {
      business: { name: 'StockFlow', industry: 'תוכנה', services: [{ id: 's1', name: 'ניהול מלאי' }] },
      brand: { brandName: 'StockFlow', audience: ['מנהלי תפעול'], tone: ['חכם', 'מינימלי'], colors: ['#5b8def'] },
      campaign: { objective: 'generate_leads', targetAudience: 'מנהלי מחסנים', offer: 'תקופת ניסיון', channel: 'facebook_post', format: '16:9' },
    },
  },
  {
    id: 'b07', category: 'events',
    needText: 'קמפיין מודעות לפסטיבל אוכל',
    data: {
      business: { name: 'טעמים', industry: 'הפקת אירועים', services: [{ id: 's1', name: 'פסטיבל אוכל' }] },
      brand: { brandName: 'טעמים', audience: ['חובבי אוכל'], tone: ['ססגוני', 'שמח'], colors: ['#ffce3d'] },
      campaign: { objective: 'brand_awareness', targetAudience: 'משפחות וזוגות', channel: 'instagram_post', format: '4:5' },
    },
  },
  {
    id: 'b08', category: 'ngo',
    needText: 'קמפיין תרומות לעמותת חינוך',
    data: {
      business: { name: 'דרך', industry: 'עמותה', services: [{ id: 's1', name: 'מלגות' }] },
      brand: { brandName: 'דרך', audience: ['תורמים'], tone: ['אנושי', 'מעורר השראה'], colors: ['#4caf82'] },
      campaign: { objective: 'brand_awareness', targetAudience: 'תורמים פוטנציאליים', channel: 'facebook_post', format: '1:1' },
    },
  },
  {
    id: 'b09', category: 'beauty',
    needText: 'קמפיין מכירות לסדרת טיפוח',
    data: {
      business: { name: 'אורה', industry: 'קוסמטיקה', products: [{ id: 'p1', name: 'סרום פנים' }] },
      brand: { brandName: 'אורה', audience: ['נשים 25-45'], tone: ['רך', 'טבעי'], colors: ['#f3c6d3'] },
      campaign: { objective: 'promote_product', targetAudience: 'נשים שמחפשות טיפוח טבעי', offer: 'מארז היכרות', channel: 'instagram_post', format: '4:5' },
    },
  },
  {
    id: 'b10', category: 'automotive',
    needText: 'קמפיין לידים למוסך שירות',
    data: {
      business: { name: 'מוסך רן', industry: 'רכב', services: [{ id: 's1', name: 'טיפולי רכב' }] },
      brand: { brandName: 'רן', audience: ['בעלי רכב'], tone: ['אמין', 'מקצועי'], colors: ['#3a6ea5'] },
      campaign: { objective: 'generate_leads', targetAudience: 'בעלי רכב פרטי', offer: 'בדיקת חורף', channel: 'whatsapp', format: '1:1' },
    },
  },
]);

export const BRIEF_BY_ID = Object.freeze(Object.fromEntries(BRIEFS.map((b) => [b.id, b])));

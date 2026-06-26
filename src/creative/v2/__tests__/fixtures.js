// Shared test fixtures for the Creative V2 slice. The V1 output fixture is a
// PINNED, contract-relevant projection of a real runCreativeDirector result — it
// is the basis of the golden normalization test and the frozen-V1-contract test.

/** A valid canonical Creative V2 request. */
export const validRequest = {
  requestId: 'req_test_1',
  tenantId: 'artvalue',
  userId: 'נתן',
  business: {
    name: 'Art Value',
    industry: 'סטודיו דיגיטלי',
    description: 'אתרים, CRM, מיתוג וקמפיינים',
    services: [{ id: 'svc-crm', name: 'מערכות CRM' }],
    relevantInsights: ['הכנסות החודש: ₪40,000'],
  },
  brand: {
    brandName: 'Art Value',
    audience: ['בעלי עסקים'],
    tone: ['פרימיום', 'חד'],
    colors: ['#d4ff3f', '#c7bfff'],
    designRules: ['מוקד יחיד'],
    forbiddenStyles: ['סטוק גנרי'],
    language: 'he-IL',
  },
  campaign: {
    objective: 'increase_sales',
    targetAudience: 'בעלי עסקים שמנהלים ידנית',
    offer: 'דמו חינם',
    channel: 'instagram_post',
    format: '4:5',
    constraints: [],
  },
  requestedConceptCount: 3,
};

/** PINNED V1 output (the frozen runCreativeDirector contract projection). */
export const v1OutputFixture = Object.freeze({
  strategy: {
    core_message: 'הופכים בלגן לניהול אחד',
    emotional_message: 'ביטחון ושליטה',
    promise: 'כל העסק במקום אחד — בלי וואטסאפ ואקסל',
    triggers: { psychological: 'שייכות', curiosity: 'מה מסתתר?', trust: 'אמינות', luxury: 'יוקרה', fomo: 'כולם כבר שם' },
    visual_direction: 'קולנועי, עמוק, מינימלי-עשיר',
    dna: 'אמנות שמייצרת ערך',
  },
  note: { feel: 'שליטה', remember: 'מערכת אחת', one_image: 'מגדל בקרה', only_this: 'CRM כמרכז שליטה' },
  concepts: [
    {
      mechanism: 'visual-metaphor', hero_object: 'glowing control tower', useTypography: false, word: '',
      core_idea: 'מרכז שליטה אחד לכל העסק', psychological_principle: 'תחושת שליטה',
      visual_metaphor: 'מגדל בקרה זוהר מעל ערפל של פתקים', emotional_reaction: 'רוגע וביטחון',
      marketing_principle: 'בידול דרך פשטות',
      layout: { logo: 'תחתון-שמאל', text_zone: 'עליון', overlay: 'כהה', font_weight: '800' },
      copy: { headline: 'מרכז שליטה אחד', subline: '', cta: 'דברו איתנו' },
      image_prompt: 'a glowing control tower above a fog of sticky notes, cinematic', negative_prompt: '',
      idea: 'מרכז שליטה אחד לכל העסק', total: 8.6,
    },
    {
      mechanism: 'before-after', hero_object: 'split desk', useTypography: false, word: '',
      core_idea: 'לפני: כאוס. אחרי: שקט', psychological_principle: 'ניגוד',
      visual_metaphor: 'שולחן מפוצל — צד אחד כאוס פתקים, צד שני נקי ומסודר', emotional_reaction: 'הקלה',
      marketing_principle: 'הוכחת טרנספורמציה',
      layout: { logo: 'תחתון-שמאל', text_zone: 'מרכז', overlay: 'בהיר', font_weight: '700' },
      copy: { headline: 'מהבלגן לשקט', subline: '', cta: 'נתחיל' },
      image_prompt: 'a split desk, chaos of notes vs clean order', negative_prompt: '',
      idea: 'לפני אחרי', total: 8.1,
    },
    {
      mechanism: 'transformation', hero_object: 'paper storm forming a screen', useTypography: false, word: '',
      core_idea: 'הפתקים מתאחדים למסך אחד', psychological_principle: 'סדר מתוך כאוס',
      visual_metaphor: 'סופת פתקים שמתעצבת למסך CRM אחד', emotional_reaction: 'התפעלות',
      marketing_principle: 'מטאפורת איחוד',
      layout: { logo: 'תחתון-ימין', text_zone: 'תחתון', overlay: 'גראדיינט', font_weight: '900' },
      copy: { headline: 'הכול מתחבר', subline: '', cta: 'לפרטים' },
      image_prompt: 'a storm of papers coalescing into one glowing CRM screen', negative_prompt: '',
      idea: 'טרנספורמציה', total: 7.9,
    },
  ],
});

/** Fake V1 runner returning the fixture (no LLM). */
export const fakeRunV1 = async () => JSON.parse(JSON.stringify(v1OutputFixture));

/** Fake V1 runner that records its inputs (to assert exact request→V1 mapping). */
export function captureRunV1(output = v1OutputFixture) {
  const calls = [];
  const run = async (brand, opts) => { calls.push({ brand, opts }); return JSON.parse(JSON.stringify(output)); };
  run.calls = calls;
  return run;
}

/** Three genuinely-distinct canonical concepts (diversity should PASS). */
export const diverseConcepts = [
  { id: 'concept-1', name: 'מרכז שליטה', strategicAngle: 'בידול דרך פשטות', emotionalTone: 'רוגע', coreIdea: 'מרכז שליטה אחד', headlineDirection: 'מרכז שליטה אחד', visualDirection: 'מגדל בקרה זוהר', heroObject: 'glowing control tower', compositionDirection: 'עליון · overlay כהה', colorDirection: ['#d4ff3f'], whyItWorks: 'תחושת שליטה', risks: [], originalityScore: 8.6, brandFitScore: 8.6 },
  { id: 'concept-2', name: 'מהבלגן לשקט', strategicAngle: 'הוכחת טרנספורמציה', emotionalTone: 'הקלה', coreIdea: 'לפני כאוס אחרי שקט', headlineDirection: 'מהבלגן לשקט', visualDirection: 'שולחן מפוצל כאוס מול סדר', heroObject: 'split desk', compositionDirection: 'מרכז · overlay בהיר', colorDirection: ['#c7bfff'], whyItWorks: 'ניגוד חזק', risks: [], originalityScore: 8.1, brandFitScore: 8.1 },
  { id: 'concept-3', name: 'הכול מתחבר', strategicAngle: 'מטאפורת איחוד', emotionalTone: 'התפעלות', coreIdea: 'פתקים מתאחדים למסך', headlineDirection: 'הכול מתחבר', visualDirection: 'סופת פתקים נהיית מסך', heroObject: 'paper storm screen', compositionDirection: 'עליון ימין · משקל 800', colorDirection: ['#0e0e0e'], whyItWorks: 'סדר מתוך כאוס', risks: [], originalityScore: 7.9, brandFitScore: 7.9 },
];

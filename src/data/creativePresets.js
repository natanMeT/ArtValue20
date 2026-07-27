// ===================================================================
// ArtValue Creative Presets — business-first recipe pack for the Image
// Studio. PURE DATA: no functions with side effects, no network, no
// localStorage, no browser APIs, no engine imports. Each preset is a
// starting recipe the UI fills into the existing controls (prompt /
// aspect) plus copyable guidance — it never generates.
//
// PRODUCT BOUNDARY (2026-07-27): the Studio is cloud/Gateway only. The
// recipes that targeted retired local modes (photo restoration → smart
// edit, product motion → image→video) and the one that needed an external
// provider were REMOVED with those lanes. The `provider`,
// `recommendedModel` and `modelFamily` fields are gone too: the product
// chooses the image lane, never a preset, and no checkpoint is selectable.
//
// `promptScaffold` uses the placeholder {נושא} = the subject the user
// swaps in. Aspect ids match ImageStudio ASPECTS (square / portrait /
// landscape).
// ===================================================================

export const CREATIVE_PRESETS = [
  {
    id: 'premium_business_visual',
    // S0F.1: neutral product label — a preset title is shown to every signed-in
    // account and must not name one tenant's business. The id is UNCHANGED
    // (it is referenced by saved gallery metadata and by the UI).
    title: 'Premium Business Visual',
    titleHe: 'ויזואל עסקי פרימיום',
    category: 'brand',
    useCase: 'תמונת גיבור / ויזואל מותג פרימיום לעסק',
    aspectRatios: ['landscape', 'square'],
    targetTab: 'text',
    promptScaffold: 'premium business hero visual of {נושא}, cinematic business-tech aesthetic, deep black and navy background, graphite glass surfaces, electric lime accent lighting, dramatic rim light, high detail, photorealistic, sharp focus',
    negativePrompt: '',
    recommendedParams: { guidance: 3.2, steps: 28 },
    qualityNotes: 'תאר את הסצנה במשפט אחד ברור. שמור על פלטת שחור-נייבי עם אקסנט ליים אחד.',
    pitfalls: 'אל תסמוך על טקסט שנוצר בתוך התמונה — הוסף כותרות ולוגו בעיצוב אחרי היצירה.',
    recipeReady: true,
    requiresApi: false,
    futureProvider: null,
  },
  {
    id: 'dark_saas_dashboard',
    title: 'Dark SaaS Dashboard Mockup',
    titleHe: 'מוקאפ דשבורד SaaS כהה',
    category: 'dashboard',
    useCase: 'ויזואל אווירה של דשבורד / CRM / SaaS למצגות ולפרזנטציות',
    aspectRatios: ['landscape'],
    targetTab: 'text',
    promptScaffold: 'atmospheric photo of a dark SaaS analytics dashboard on a monitor, {נושא}, deep navy interface, lime-green accent charts, clean data grid, soft glowing panels, modern office bokeh, photorealistic, shallow depth of field',
    negativePrompt: '',
    recommendedParams: { guidance: 3.5, steps: 28 },
    qualityNotes: 'שימוש כוויזואל אווירה / קונספט — לא כמסך מדויק. הרקע והתחושה הם המטרה.',
    pitfalls: 'טקסט עברית בתוך ממשק לא ייווצר קריא — אל תצפה למסך אמיתי. השתמש בזה כוויזואל אווירה בלבד.',
    recipeReady: true,
    requiresApi: false,
    futureProvider: 'gpt-image-2',
  },
  {
    id: 'product_hero_shot',
    title: 'Product Hero Shot',
    titleHe: 'תמונת מוצר גיבור',
    category: 'product',
    useCase: 'תמונת מוצר נקייה לאיקומרס / קטלוג',
    aspectRatios: ['square', 'portrait'],
    targetTab: 'text',
    promptScaffold: 'professional product photography of {נושא}, clean seamless studio background, soft box lighting, subtle reflection, sharp commercial focus, high detail, e-commerce catalog style',
    negativePrompt: 'lowres, blurry, watermark, text, deformed, extra objects, hands, people, cluttered background',
    recommendedParams: { cfg: 5, steps: 30, hd: true },
    qualityNotes: 'רקע נקי ותאורה רכה נותנים את התוצאה הכי מסחרית. השתמש ב־Negative כדי להרחיק אלמנטים מיותרים.',
    pitfalls: 'טקסט על אריזות עלול להתעוות — נסח את התיאור כך שהאריזה תופיע ללא כיתוב, או תכנן חיתוך.',
    recipeReady: true,
    requiresApi: false,
    futureProvider: null,
  },
  {
    id: 'local_ad_creative',
    title: 'Local Ad Creative',
    titleHe: 'קריאייטיב פרסום לעסק מקומי',
    category: 'ad',
    useCase: 'ויזואל למודעה / פוסט סושיאל לעסק מקומי',
    aspectRatios: ['square', 'portrait', 'landscape'],
    targetTab: 'text',
    promptScaffold: 'eye-catching advertising visual for {נושא}, vibrant premium composition, strong focal subject, clean negative space for later text overlay, professional commercial lighting, photorealistic',
    negativePrompt: '',
    recommendedParams: { guidance: 3.0, steps: 26 },
    qualityNotes: 'השאר שטח נקי לכותרת — הטקסט נוסף בעיצוב אחרי היצירה.',
    pitfalls: 'הוסף את הטקסט של המודעה בעיצוב אחרי היצירה — אל תבקש מהיצירה לכתוב את הסלוגן.',
    recipeReady: true,
    requiresApi: false,
    futureProvider: null,
  },
];

// The subject placeholder inside every promptScaffold (UI can hint the user to replace it).
export const PRESET_SUBJECT_TOKEN = '{נושא}';

// Presets that fill the Text-to-Image controls directly (prompt + aspect).
// The model dimension is gone: the hosted Gateway lane owns provider and model,
// so a preset contributes a prompt recipe and nothing technical.
export const isTextImagePreset = (p) => Boolean(p) && p.targetTab === 'text' && p.recipeReady === true;

export const presetById = (id) => CREATIVE_PRESETS.find((p) => p.id === id) || null;

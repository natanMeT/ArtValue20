// ===================================================================
// Gemini client for the "AI Quote Diagnosis" feature.
// Calls the Generative Language REST API directly (no SDK dependency).
// Graceful fallback: with no VITE_GEMINI_API_KEY it returns a structured
// demo result so the feature works offline / before a key is added.
// ===================================================================

// Gateway-routed lanes in this file: draftWithJake → `jake.draft_message`
// (Slice B), chatJake → `jake.chat` and forceActionsJake →
// `jake.force_actions` (M2 J2), generateLeadIdeas → `crm.lead_ideas`
// (M2 J3A), and diagnoseQuote → `crm.diagnose_quote` (M2 J3B). These are
// the ONLY gateway-routed operations in this file. Everything else stays
// on its legacy path.
import { callAiGateway } from './aiGatewayClient.js';
import { userError, engineError } from './userFacingError.js';

// PRODUCT BOUNDARY (2026-07-27, owner decision): ArtValue is a CLOUD-ONLY
// product. The workstation-engine text lane that used to live here — an
// OpenAI-compatible local LLM (Ollama) plus the ComfyUI VRAM self-heal and
// model-unload calls it needed — was REMOVED, together with the gate module
// that resolved its URLs. This file now reads no engine URL, holds no model
// constant for a workstation engine, and cannot reach a local address: the
// only remote hosts it can contact are the server-owned AI Gateway and the
// Google Generative Language API.
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.0-flash';

export const isGeminiConfigured = Boolean(API_KEY);

// JSON chat against the managed Gemini API. Returns the parsed object. Used by
// the Creative Director text pipeline below; with no key configured every stage
// short-circuits to its demo stub before reaching here.
async function chatJson(sys, user, opts = {}) {
  const temperature = opts.temperature ?? 0.7;
  const maxTokens = opts.maxTokens ?? 2048;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: sys }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { responseMimeType: 'application/json', temperature, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-goog-api-key': API_KEY }, body: JSON.stringify(body) });
  if (!res.ok) {
    // The provider's raw text is captured for diagnostics ONLY — it never
    // becomes the thrown message, so it cannot reach any surface that renders
    // or logs `.message`. Same invariant as the AI Gateway image lane.
    let providerDetail = '';
    try { const e = await res.json(); providerDetail = String(e?.error?.message || ''); } catch { /* ignore */ }
    const err = userError('השירות אינו זמין כרגע. נסה/י שוב בעוד רגע.');
    err.httpStatus = res.status;
    err.providerDetail = providerDetail;
    throw err;
  }
  const json = await res.json();
  const text = (json?.candidates?.[0]?.content?.parts || []).map((p) => p.text).filter(Boolean).join('').trim();
  if (!text) throw userError('לא התקבלה תשובה מהשירות');
  return JSON.parse(text);
}

// ===================================================================
// Creative Director engine (staged — thinks before it generates):
//   fetchSiteText → analyzeBusiness (brand_profile) → buildStrategy →
//   generateConceptWave (×waves) → scoreConcepts (rubric + self-review).
//   Mechanisms rotate and never repeat across campaigns. Copy is kept
//   separate from the image (Hebrew text overlaid later, fully editable).
// ===================================================================

// r.jina.ai returns clean readable text for ANY url and sends CORS headers,
// so the browser can read foreign sites the normal fetch would block.
const READER_PROXY = (import.meta.env.VITE_READER_PROXY || 'https://r.jina.ai/').replace(/\/?$/, '/');

export async function fetchSiteText(rawUrl) {
  const clean = (rawUrl || '').trim();
  if (!clean) throw userError('הזן כתובת אתר');
  const full = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
  let res;
  try {
    res = await fetch(READER_PROXY + full, { headers: { Accept: 'text/plain' } });
  } catch {
    throw userError('לא ניתן לקרוא את האתר (בעיית רשת). בדוק את הכתובת ונסה שוב.');
  }
  if (!res.ok) { const e = userError('קריאת האתר נכשלה. ודא/י שהכתובת תקינה וציבורית.'); e.httpStatus = res.status; throw e; }
  const text = (await res.text()).trim();
  if (!text || text.length < 40) throw userError('האתר ריק או חוסם קריאה אוטומטית.');
  return cleanReaderText(text).slice(0, 6000); // strip nav/url noise + cap — keeps the analyzer on-task (KI-1)
}

// Reader output (r.jina.ai markdown) is heavy with nav links, URL-encoded hrefs
// and emoji image refs. That noise derailed the analyzer into echoing
// structural JSON (measured on elitcar.co.il: raw 14k → 0/3 valid; cleaned+trimmed
// → 2/2 valid), surfacing as "הניתוח נכשל" on noisy WordPress sites. Strip the
// noise, keep the prose.
function cleanReaderText(t) {
  return String(t || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')     // ![alt](img) image refs
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')   // [text](url) → text
    .replace(/https?:\/\/\S+/g, '')            // bare urls
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .split('\n').map((l) => l.trim()).filter((l) => l.length > 2)
    .join('\n')
    .trim();
}

// ---- Creative mechanisms (rotate; never repeat across campaigns) ----
export const CREATIVE_MECHANISMS = [
  { key: 'visual-metaphor', he: 'מטאפורה ויזואלית' },
  { key: 'transformation', he: 'טרנספורמציה' },
  { key: 'before-after', he: 'לפני / אחרי' },
  { key: 'symbolism', he: 'סימבוליזם' },
  { key: 'impossible-perspective', he: 'פרספקטיבה בלתי אפשרית' },
  { key: 'scale-manipulation', he: 'משחק גדלים' },
  { key: 'luxury-editorial', he: 'אדיטוריאל יוקרתי' },
  { key: 'documentary-realism', he: 'ריאליזם דוקומנטרי' },
  { key: 'surreal-realism', he: 'ריאליזם סוריאליסטי' },
  { key: 'emotional-storytelling', he: 'סיפור רגשי' },
  { key: 'psychological-tension', he: 'מתח פסיכולוגי' },
  { key: 'minimalism', he: 'מינימליזם' },
  { key: 'optical-illusion', he: 'אשליה אופטית' },
  { key: 'cinematic-storytelling', he: 'סיפור קולנועי' },
  { key: 'architectural-analogy', he: 'אנלוגיה אדריכלית' },
  { key: 'time-progression', he: 'התקדמות בזמן' },
  { key: 'hyper-closeup', he: 'תקריב-על' },
  { key: 'hidden-message', he: 'מסר נסתר' },
  { key: 'contrast', he: 'ניגוד' },
];
export const MECHANISM_HE = Object.fromEntries(CREATIVE_MECHANISMS.map((m) => [m.key, m.he]));

// Wild-only pool: drop the mechanisms that tend to produce clean/calm visuals.
// The brand wants maximalist, scroll-stopping, surreal designs only.
const TAME = ['minimalism', 'luxury-editorial', 'documentary-realism'];
export const WILD_MECHANISMS = CREATIVE_MECHANISMS.filter((m) => !TAME.includes(m.key));

// Map any model-returned mechanism string to a real key (handles Capitalization,
// spaces, and near-miss inventions via shared-token overlap). Returns null if no
// token overlaps any known mechanism.
export function normalizeMechanism(raw) {
  const k = String(raw || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z-]/g, '');
  const keys = CREATIVE_MECHANISMS.map((m) => m.key);
  if (keys.includes(k)) return k;
  const toks = k.split('-').filter(Boolean);
  let best = null; let bestScore = 0;
  for (const key of keys) {
    const kt = key.split('-');
    const score = toks.filter((t) => kt.includes(t)).length;
    if (score > bestScore) { bestScore = score; best = key; }
  }
  return bestScore > 0 ? best : null;
}

// Appended to every English image prompt right before it hits FLUX — guarantees
// a wild, maximalist look even if the concept text came out tame.
export const WILD_BOOST = 'surreal hyper-maximalist advertising art, impossible dreamlike scene, explosive vivid saturated colors, dramatic cinematic lighting, bold unexpected composition, psychedelic creative energy, ultra detailed, 8k';

// mechanism → render-style hint carried on the concept (presentational only:
// this file submits no render job of any kind)
export function mechanismStyle(mech) {
  if (['luxury-editorial', 'minimalism', 'architectural-analogy'].includes(mech)) return 'minimal';
  if (['surreal-realism', 'visual-metaphor', 'transformation', 'impossible-perspective', 'scale-manipulation', 'optical-illusion', 'hidden-message'].includes(mech)) return 'surreal';
  return 'cinematic'; // documentary, emotional, hyper-closeup, cinematic, tension, contrast, before-after, time
}

const CLICHE_AVOID = `הימנע לחלוטין מהקלישאות האלה: אנשים שמצביעים על לפטופ, לחיצות יד, דשבורדים גנריים, אייקונים מרחפים, עובדי משרד מחייכים, קומפוזיציות סטוק, וקלישאות שיווק-AI נדושות. במקום — סימבוליזם קולנועי, סיפור רגשי, סצנות בלתי-אפשריות-אך-אמינות, צילום אדיטוריאלי פרימיום, מטאפורות אדריכליות, וו ויזואלי חזק. התמונה חייבת לספר את הסיפור עוד לפני שקוראים טקסט.`;

// ===== STAGE 1 — deep brand analysis =====
export async function analyzeBusiness(siteText, url = '') {
  if (!isGeminiConfigured) return demoBusiness(url);
  const sys = `אתה אסטרטג מותג ואנליסט פרסום בכיר בסטודיו Art Value. קיבלת את תוכן האתר של עסק. נתח אותו לעומק כמו במאי קריאייטיב לפני קמפיין.
החזר JSON בעברית בלבד (פרט palette שהוא קודי hex) במבנה:
{"business":"שם/סוג העסק","positioning":"מיצוב במשפט","audience":"קהל יעד","industry":"תעשייה","differentiators":["מה מייחד"],"emotional_triggers":["טריגרים רגשיים"],"tone":["מילות טון"],"trust_signals":["אותות אמון"],"luxury_level":"low|mid|premium|luxury","weaknesses":["חולשה שאפשר להפוך להזדמנות פרסומית"],"do_not":["מה לא לעשות/להגיד"],"palette":["#hex"]}
היה חד, ספציפי ואמיתי לעסק הזה. עברית בלבד.`;
  const p = await chatJson(sys, `כתובת האתר: ${url}\n\nתוכן האתר:\n${siteText}`, { temperature: 0.5, maxTokens: 1600 });
  if (!p || !p.business) throw userError('הניתוח נכשל — נסה אתר אחר.');
  const arr = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
  const brand = {
    business: p.business, positioning: p.positioning || '', audience: p.audience || '', industry: p.industry || '',
    differentiators: arr(p.differentiators), emotional_triggers: arr(p.emotional_triggers), tone: arr(p.tone),
    trust_signals: arr(p.trust_signals), luxury_level: p.luxury_level || 'premium',
    weaknesses: arr(p.weaknesses), do_not: arr(p.do_not), palette: arr(p.palette).filter((h) => /^#?[0-9a-f]{3,8}$/i.test(h)),
  };
  // build the display board (deterministic, from the structured fields)
  const join = (a, f = '·') => a.filter(Boolean).join(` ${f} `);
  brand.cards = [
    { title: 'מי העסק', summary: brand.positioning || brand.business },
    { title: 'קהל יעד', summary: brand.audience || '—' },
    { title: 'יתרון תחרותי', summary: join(brand.differentiators) || '—' },
    { title: 'טון ואישיות', summary: `${join(brand.tone)}${brand.luxury_level ? ` · רמת יוקרה: ${brand.luxury_level}` : ''}` },
    { title: 'טריגרים רגשיים', summary: join(brand.emotional_triggers) || '—' },
    { title: 'הזדמנות פרסומית', summary: join(brand.weaknesses) || '—' },
  ].filter((c) => c.summary && c.summary !== '—');
  return brand;
}

// ===== STAGE 2 — campaign strategy =====
export async function buildStrategy(brand) {
  if (!isGeminiConfigured) return demoStrategy();
  const sys = `אתה אסטרטג קמפיינים בכיר. על בסיס פרופיל המותג, הגדר אסטרטגיה אחת ממוקדת (לא רעיונות חזותיים עדיין).
החזר JSON בעברית: {"core_message":"המסר הפרסומי המרכזי","emotional_message":"המסר הרגשי","promise":"ההבטחה המרכזית","triggers":{"psychological":"","curiosity":"","trust":"","luxury":"","fomo":""},"visual_direction":"כיוון ויזואלי כללי","dna":"ה-DNA הפרסומי הקבוע של הקמפיין"}
עברית בלבד, חד ומדויק.`;
  const ctx = `פרופיל המותג:\n${JSON.stringify(brand, null, 1)}`;
  const s = await chatJson(sys, ctx, { temperature: 0.7, maxTokens: 1200 });
  if (!s || !s.core_message) throw userError('בניית האסטרטגיה נכשלה — נסה שוב.');
  s.triggers = s.triggers || {};
  return s;
}

// ===== STAGE 3 — one WAVE of concepts (different mechanisms, no duplication) =====
export async function generateConceptWave(brand, strategy, opts = {}) {
  const { used = [], avoidSummaries = [], count = 5, waveNo = 1 } = opts;
  if (!isGeminiConfigured) return demoConcepts(count);
  const allowed = WILD_MECHANISMS.map((m) => m.key).filter((k) => !used.includes(k));
  const sys = `אתה מנהל קריאייטיב + ארט-דירקטור + פסיכולוג פרסום + במאי קולנוע, ברמת Cannes Lions, לסטודיו Art Value.
חשוב כמו במאי קריאייטיב — רעיונות בטוחים וצפויים = כישלון. המטרה: לעצור גלילה, לייצר רגש, ולגרום לתחושה של "לא ראיתי דבר כזה".
חוק ויזואלי מוחלט: כל סצנה חייבת להיות **משוגעת, סוריאליסטית ומקסימליסטית** — סצנות חלומיות בלתי-אפשריות, צבע מתפוצץ, תאורה דרמטית, אנרגיה פסיכדלית. **אסור** נקי, מינימלי, רגוע, או מוצר-פשוט-על-רקע-לבן. אם רעיון יוצא בטוח או נקי — הפוך אותו לסוריאליסטי ומתפוצץ.
${CLICHE_AVOID}
צור ${count} קונספטים, כל אחד עם מנגנון קריאייטיב *שונה* מתוך הרשימה המותרת בלבד: ${allowed.join(', ')}.
לכל קונספט הסבר קודם את החשיבה ורק אז את ה-prompt. החזר JSON:
{"concepts":[{"mechanism":"<מפתח מהרשימה>","core_idea":"הרעיון המרכזי בעברית","psychological_principle":"העיקרון הפסיכולוגי","visual_metaphor":"המטאפורה הויזואלית","emotional_reaction":"התגובה הרגשית הצפויה","copy":{"headline":"כותרת קצרה וזכירה","subline":"שורת משנה","cta":"קריאה לפעולה"},"image_prompt":"English only, rich cinematic scene, NO text in the image","negative_prompt":"English only"}]}
ערכי copy/הסברים בעברית; image_prompt ו-negative_prompt באנגלית בלבד וללא טקסט בתמונה. הכותרת (headline) עד 6 מילים, חדה וזכירה. אל תמציא עובדות ואל תשנה פרטים מהבריף (שמות מקום, מוצרים, אזור). השתמש אך ורק במפתחות mechanism מהרשימה המותרת — בדיוק כפי שנכתבו. כל קונספט שונה מהותית מהאחרים${avoidSummaries.length ? `, ובפרט שונה מאלה שכבר נוצרו: ${avoidSummaries.join(' | ')}` : ''}.`;
  const ctx = `מותג: ${brand.business}\nאסטרטגיה: ${JSON.stringify(strategy)}\nגל מספר ${waveNo}.`;
  let out;
  try { out = await chatJson(sys, ctx, { temperature: 1.0, maxTokens: 4096 }); }
  catch { return []; } // truncated/invalid JSON → skip this wave, the loop tries another
  // normalize the mechanism key — models sometimes Capitalize, add spaces, or
  // invent a near-miss key (e.g. "optimal-perspective"). Fuzzy-map to a real one.
  const list = (out.concepts || [])
    .filter((c) => c && c.image_prompt && c.mechanism)
    .map((c) => ({ ...c, mechanism: normalizeMechanism(c.mechanism) }))
    .filter((c) => c.mechanism);
  // keep only allowed mechanisms; de-dupe within the wave
  const seen = new Set();
  return list.filter((c) => {
    if (!allowed.includes(c.mechanism) || seen.has(c.mechanism)) return false;
    seen.add(c.mechanism); return true;
  });
}

// ===== STAGE 4 — score + self-review a wave (weighting computed in JS) =====
export async function scoreConcepts(concepts, brand, strategy) {
  if (!concepts.length) return [];
  if (!isGeminiConfigured) return concepts.map((c) => ({ ...c, score: { total: 8, pass: true, why: 'demo' } }));
  const sys = `אתה חבר מושבעים מנהלי קריאייטיב. נקד כל קונספט 1-10 בכל ציר, וענה על 4 שאלות הביקורת העצמית.
החזר JSON: {"scores":[{"i":<index>,"originality":n,"stop_scroll":n,"emotional":n,"luxury":n,"brand_fit":n,"conversion":n,"memorable":true/false,"standout":true/false,"director_stops":true/false,"communicates_visually":true/false,"why":"משפט הצדקה קצר בעברית"}]}
היה ביקורתי ומחמיר — קונספט צפוי/גנרי מקבל ציון נמוך.`;
  const ctx = `מותג: ${brand.business} | מיצוב: ${brand.positioning}\nקונספטים:\n${concepts.map((c, i) => `[${i}] מנגנון:${c.mechanism} | רעיון:${c.core_idea} | כותרת:${c.copy?.headline} | ויזואל:${c.visual_metaphor}`).join('\n')}`;
  let scores = [];
  try { scores = (await chatJson(sys, ctx, { temperature: 0.3, maxTokens: 2000 })).scores || []; } catch { scores = []; }
  return concepts.map((c, i) => {
    const s = scores.find((x) => x.i === i) || scores[i] || {};
    const n = (v) => Math.max(0, Math.min(10, Number(v) || 0));
    const total = (n(s.stop_scroll) * 3 + n(s.originality) * 3 + n(s.emotional) * 2 + n(s.brand_fit) * 2 + n(s.luxury) + n(s.conversion)) / 12;
    const selfReview = [s.memorable, s.standout, s.director_stops, s.communicates_visually];
    const reviewPass = selfReview.filter((b) => b === false).length <= 1; // allow one soft 'no'
    return { ...c, score: { ...s, total: Math.round(total * 10) / 10, pass: total >= 7 && reviewPass, why: s.why || '' } };
  });
}

// ===================================================================
// UPGRADE — agency-grade pipeline: brainstorm → score → diversity+memory →
// expand winners. Typography & creative-object libraries. Campaign memory.
// ===================================================================

// Hero objects the art director can build the metaphor around (English for FLUX).
export const CREATIVE_OBJECTS = [
  'ice cube', 'monolith', 'glowing portal', 'giant wave', 'fire', 'lightning', 'smoke',
  'crystal', 'mirror', 'puzzle pieces', 'staircase', 'black hole', 'magnet', 'threads',
  'balloons', 'chains', 'giant boulder', 'impossible architecture', 'stone walls', 'bridge',
  'doors', 'keys', 'melting clocks', 'ancient tree', 'starfield', 'DNA helix', 'glowing brain',
  'stacked boxes', 'neon tubes', 'liquid gold', 'shattering glass', 'floating islands',
];

// Physical-typography techniques — letters/words AS the artwork (English renders best).
export const TYPO_TECHNIQUES = [
  'giant 3D letters carved from stone', 'chrome metallic 3D letters', 'molten gold letters',
  'a single letter shattering into particles', 'a melting letter', 'letters growing from the ground',
  'buildings shaped like letters', 'a landscape shaped like a word', 'a word carved into a mountain',
  'a word reflected in still water', 'a word made of clouds', 'a glowing neon-tube word',
  'a word built from cables and wires', 'liquid-metal typography', 'ice typography slowly melting',
  'burning typography', 'smoke forming a word', 'crystal typography', 'transparent glass letters',
  'a word made from thousands of tiny objects', 'letters forming a bridge', 'a typographic portal',
];

// --- campaign memory (reject concepts >30% similar to the last 100 made) ---
const MEM_KEY = 'artvalue_campaign_memory';
const HEB_EN_TOK = /[a-z֐-׿]{3,}/g;
function tokenSet(c) {
  const txt = `${c.mechanism || ''} ${c.idea || ''} ${c.visual_metaphor || ''} ${c.copy?.headline || ''} ${c.object || ''} ${c.word || ''}`.toLowerCase();
  return new Set((txt.match(HEB_EN_TOK) || []));
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0; a.forEach((t) => { if (b.has(t)) inter += 1; });
  return inter / (a.size + b.size - inter);
}
function loadMemory() { try { return JSON.parse(localStorage.getItem(MEM_KEY) || '[]'); } catch { return []; } }
export function rememberConcepts(concepts) {
  try {
    const mem = loadMemory();
    concepts.forEach((c) => mem.push({ mech: c.mechanism, toks: [...tokenSet(c)] }));
    localStorage.setItem(MEM_KEY, JSON.stringify(mem.slice(-100)));
  } catch { /* noop */ }
}
// Injectable memory store — default is browser localStorage. An agent can pass its
// own { load, remember } (e.g. file-backed) so the engine isn't coupled to the DOM.
export const campaignMemory = { load: loadMemory, remember: rememberConcepts };

// Drop concepts too similar to memory OR to each other (diversity + history).
export function dedupeConcepts(concepts, threshold = 0.3, memory = campaignMemory) {
  const mem = memory.load().map((m) => new Set(m.toks));
  const kept = []; const keptToks = [];
  for (const c of concepts) {
    const t = tokenSet(c);
    const dupMem = mem.some((m) => jaccard(t, m) > threshold);
    const dupSelf = keptToks.some((k) => jaccard(t, k) > threshold);
    if (!dupMem && !dupSelf) { kept.push(c); keptToks.push(t); }
  }
  return kept;
}

// ===== STAGE 1.5 — DIRECTOR NOTE (internal — never shown to the user) =====
// Guides every downstream creative decision: the feeling, the 24h memory, the one
// unforgettable image, and what could exist ONLY for this business.
export async function directorNote(brand, strategy) {
  if (!isGeminiConfigured) return {};
  const sys = `אתה במאי קריאייטיב ראשי. כתוב פתק במאי פנימי קצר (לא יוצג ללקוח) שינחה את כל הקריאייטיב.
ענה חד ותמציתי בעברית: מה הצופה צריך להרגיש? מה יזכור אחרי 24 שעות? מהי התמונה הבלתי-נשכחת האחת שמסכמת את כל הקמפיין? איזה ויזואל יכול להתקיים רק לעסק הזה?
החזר JSON: {"feel":"","remember":"","one_image":"","only_this":""}`;
  try {
    return await chatJson(sys, `מותג: ${brand.business} | מיצוב: ${brand.positioning} | אסטרטגיה: ${strategy?.core_message || ''}`, { temperature: 0.85, maxTokens: 700 });
  } catch { return {}; }
}
function noteBlock(note) {
  if (!note || !(note.feel || note.one_image)) return '';
  return `פתק הבמאי (פנימי — הנחה את הקריאייטיב לפיו):\n- הרגשה: ${note.feel || ''}\n- לזכור אחרי 24ש: ${note.remember || ''}\n- התמונה האחת: ${note.one_image || ''}\n- ייחודי לעסק הזה: ${note.only_this || ''}`;
}

// ===== STAGE 2 — MASSIVE BRAINSTORM (30+ short, one-line, diverse concepts) =====
// Returns [{ mechanism, idea, useTypography, word, technique, object }]. Batched so
// the JSON never truncates. Each concept is a different advertising mechanism.
export async function brainstormConcepts(brand, strategy, opts = {}) {
  const total = opts.count || 30;
  if (!isGeminiConfigured) return demoBrainstorm(Math.min(total, 8));
  const keys = WILD_MECHANISMS.map((m) => m.key);
  // Split the mechanism pool into disjoint batches so the model is FORCED to cover
  // distinct mechanisms (otherwise a model tends to return all 'visual-metaphor').
  const sliceSize = Math.min(8, Math.ceil(keys.length / 2));
  const batches = Math.ceil(keys.length / sliceSize);
  const repeats = Math.max(1, Math.round(total / keys.length)); // ideas per mechanism
  const all = [];
  const objs = CREATIVE_OBJECTS.join(', ');
  const typo = TYPO_TECHNIQUES.slice(0, 14).join('; ');
  for (let b = 0; b < batches; b += 1) {
    const slice = keys.slice(b * sliceSize, (b + 1) * sliceSize);
    if (!slice.length) continue;
    const sys = `אתה מנהל קריאייטיב + ארט-דירקטור ברמת Cannes Lions לסטודיו Art Value.
לא להתחיל מ"איזו תמונה" — להתחיל מ"איזו מטאפורה ויזואלית תישאר לנצח בזיכרון הצופה".
${CLICHE_AVOID}
פסול מיד רעיונות בטוחים, צפויים, גנריים או דומים לפרסום-AI נפוץ. אל תשפר בינוניות — מחק וצור רעיון אמיץ יותר. המטרה אינה להיראות טוב, אלא להיות בלתי אפשרי להתעלם.
חשוב מעבר לצילום: כשזה מספר את הסיפור טוב יותר — העדף **טיפוגרפיה פיזית** (אותיות/מילה כאובייקט תלת-ממד בעולם). טכניקות: ${typo}.
חוק אובייקט-גיבור: לכל רעיון **אובייקט-גיבור אחד דומיננטי** (object — חובה, **באנגלית בלבד**) שיהפוך לעוגן הזיכרון הויזואלי. בלי מוקדים מתחרים. אובייקטים אפשריים: ${objs}.
טיפוגרפיה: השתמש רק במילה אנגלית **שלמה וחזקה עד 6 אותיות** (למשל VALUE, TRUST, GROW, FLOW, LEAD, BUILD, SALE, CRM, AI). אם אין מילה קצרה ומתאימה — useTypography=false ו-word ריק. אסור לחתוך מילים ארוכות.
צור ${repeats > 1 ? `${repeats} רעיונות` : 'רעיון אחד'} לכל אחד מהמנגנונים הבאים בלבד (חובה לכסות את כולם, מפתח מדויק): ${slice.join(', ')}.
החזר JSON תמציתי: {"ideas":[{"mechanism":"<אחד מהמנגנונים שלמעלה>","idea":"רעיון בעברית בשורה אחת עד 14 מילים","object":"אובייקט-גיבור אחד באנגלית","useTypography":true/false,"word":"מילה אנגלית שלמה עד 6 אותיות או ריק","technique":"טכניקת טיפוגרפיה באנגלית או ריק"}]}
כל רעיון שונה לחלוטין ומרגיש כאילו הגיע ממנהל קריאייטיב אחר. JSON קצר ותקין.`;
    const ctx = `מותג: ${brand.business} | מיצוב: ${brand.positioning}\nאסטרטגיה: ${strategy?.core_message || ''}\n${noteBlock(opts.note)}`;
    let out;
    try { out = await chatJson(sys, ctx, { temperature: 1.05, maxTokens: 2800 }); } catch { out = {}; } // eslint-disable-line no-await-in-loop
    for (const i of (out.ideas || [])) {
      const mech = normalizeMechanism(i.mechanism);
      if (mech && i.idea) {
        // FIX 4 — whole word only, ≤6 letters, never truncate; else drop typography.
        const raw = String(i.word || '').toUpperCase().replace(/[^A-Z]/g, '');
        const word = (raw.length >= 2 && raw.length <= 6) ? raw : '';
        all.push({
          mechanism: mech, idea: String(i.idea).trim(),
          useTypography: Boolean(i.useTypography && word),
          word,
          technique: String(i.technique || '').trim(),
          object: String(i.object || '').trim(),
        });
      }
    }
  }
  return all;
}

// Score short brainstorm ideas (cheap) — keep the strongest. Returns sorted w/ .total.
export async function scoreBrainstorm(ideas, brand) {
  if (!ideas.length) return [];
  if (!isGeminiConfigured) return ideas.map((c) => ({ ...c, total: 8 }));
  const sys = `נקד כל רעיון פרסומי 1-10: originality, stopping_power, emotional, luxury, uniqueness. היה מחמיר — קלישאה/צפוי = נמוך.
סמן "safe":true אם הרעיון בטוח, צפוי, גנרי או דומה לפרסום-AI נפוץ (אלה נפסלים).
החזר JSON: {"scores":[{"i":0,"originality":n,"stopping":n,"emotional":n,"luxury":n,"uniqueness":n,"safe":true/false}]}`;
  const ctx = `רעיונות:\n${ideas.map((c, i) => `[${i}] (${c.mechanism}) ${c.idea}${c.useTypography ? ` [טיפו:${c.word}]` : ''}`).join('\n')}`;
  let scores = [];
  try { scores = (await chatJson(sys, ctx, { temperature: 0.3, maxTokens: 2200 })).scores || []; } catch { scores = []; }
  const n = (v) => Math.max(0, Math.min(10, Number(v) || 0));
  return ideas.map((c, i) => {
    const s = scores.find((x) => x.i === i) || scores[i] || {};
    const total = (n(s.originality) * 3 + n(s.stopping) * 3 + n(s.uniqueness) * 2 + n(s.emotional) * 2 + n(s.luxury)) / 11;
    // kill-safe from the CALIBRATED numeric score only. The LLM's binary 'safe' flag
    // proved noisy (models over-flagged ~90%, contradicting their own praise) — so the
    // numeric spread is the reliable courage signal. Kills the weak bottom, keeps a full set.
    const safe = total < 5.0;
    return { ...c, total: Math.round(total * 10) / 10, safe };
  }).sort((a, b) => b.total - a.total);
}

// FIX 2 — hero objects must be ENGLISH. The Hebrew→English rescue call ran on
// the retired workstation LLM; with that lane gone a Hebrew hero object is
// simply dropped (expand still works without a hero) rather than translated.
function ensureEnglishObject(obj) {
  const o = (obj || '').trim();
  if (!o) return '';
  if (!HEBREW_RE.test(o)) return o.slice(0, 80);
  return '';
}
// FIX 1 — deterministic fallback so we NEVER ship an empty ad.
function shortHeadline(s) { const w = (s || '').split(/\s+/).filter(Boolean).slice(0, 6).join(' '); return w || 'Art Value'; }
function fallbackExpand(idea, hero, note, brand) {
  const word = (idea.useTypography && idea.word) ? idea.word : '';
  const heroTxt = hero || 'one single dominant symbolic object';
  const image = `cinematic surreal premium advertising poster, one dominant hero object: ${heroTxt}, single focal point, no competing focal points, dramatic lighting, rich materials, deep cinematic color${word ? `, the word "${word}" as bold legible 3D letters integrated into the scene` : ''}`;
  return {
    core_idea: idea.idea || '', psychological_principle: note?.feel || '', visual_metaphor: idea.idea || '',
    emotional_reaction: note?.remember || '', marketing_principle: brand?.positioning || '', hero_object: hero,
    layout: { logo: 'תחתון-שמאל', text_zone: 'עליון', overlay: 'כהה', font_weight: '800' },
    copy: { headline: shortHeadline(idea.idea), subline: (brand?.positioning || '').slice(0, 60), cta: 'דברו איתנו' },
    image_prompt: image, negative_prompt: '', _fallback: true,
  };
}

// ===== COPYWRITER / CREATIVE EDITOR — clean, premium Hebrew copy =====
// A dedicated copy pass: the IDEA and the visual come from the concept stage,
// and only the words are rewritten here.
export async function writeCopy(concept, brand, strategy) {
  if (!isGeminiConfigured) return null;
  const sys = `אתה קופירייטר ועורך קריאייטיב בכיר בעברית, ברמת קמפיין פרימיום (אפל/יוקרה). כתוב קופי חד, טבעי ויוקרתי למודעה אחת — בלי מליצות, בלי משפטים מסורבלים, בלי דו-נקודתיים מאולצים.
- headline: עד 5 מילים, חד, זכיר וטבעי בעברית.
- subline: שורה אחת קצרה שתומכת בכותרת.
- cta: 2-4 מילים, קריאה לפעולה.
החזר JSON בלבד: {"headline":"","subline":"","cta":""}`;
  const ctx = `מותג: ${brand.business} | מיצוב: ${brand.positioning}\nמסר הקמפיין: ${strategy?.core_message || ''}\nרעיון המודעה: ${concept.core_idea || ''}\nמטאפורה ויזואלית: ${concept.visual_metaphor || ''}\nמנגנון: ${concept.mechanism || ''}`;
  try {
    const c = await chatJson(sys, ctx, { temperature: 0.7, maxTokens: 300 });
    if (c && c.headline && String(c.headline).trim()) {
      return { headline: String(c.headline).trim(), subline: String(c.subline || '').trim(), cta: String(c.cta || 'דברו איתנו').trim() };
    }
  } catch { /* noop */ }
  return null;
}

// ===== STAGE 6+7+8 — expand ONE winning idea into a full production concept =====
export async function expandConcept(brand, strategy, idea, note) {
  if (!isGeminiConfigured) return { ...idea, ...demoExpand(idea) };
  const hero = await ensureEnglishObject(idea.object); // FIX 2
  const typoLine = idea.useTypography
    ? `הקונספט משתמש בטיפוגרפיה פיזית: שלב את המילה האנגלית "${idea.word}" כאובייקט תלת-ממד בעולם (${idea.technique || 'giant 3D letters'}). ה-image_prompt חייב לתאר את המילה כחלק פיזי מהסצנה, אותיות חדות וקריאות.`
    : `אל תטביע טקסט בתמונה (image_prompt ללא אותיות/מילים).`;
  const sys = `אתה ארט-דירקטור ראשי. הרחב רעיון פרסומי קצר לקונספט הפקה מלא לסטודיו Art Value.
${typoLine}
חוק אובייקט-גיבור: כל הקומפוזיציה סובבת סביב **אובייקט-גיבור אחד דומיננטי**${hero ? ` (${hero})` : ''} — עוגן הזיכרון. נקודת מוקד יחידה, בלי מוקדים מתחרים.
ה-image_prompt באנגלית בלבד, ויזואל בלבד: קומפוזיציה, תאורה, אווירה, מסגור, סימבוליזם, מצלמה, צבעים, עומק, שפה קולנועית, טקסטורות, חומרים, מוקד יחיד. כל מילה חשובה.
חובה למלא את כל השדות — אסור להחזיר שדות ריקים.
החזר JSON: {"image_prompt":"English only","core_idea":"","psychological_principle":"","visual_metaphor":"","emotional_reaction":"","marketing_principle":"","hero_object":"","copy":{"headline":"עד 6 מילים","subline":"","cta":""},"layout":{"logo":"","text_zone":"","overlay":"","font_weight":""},"negative_prompt":"English"}
ערכים בעברית פרט ל-image_prompt/negative_prompt/hero_object. JSON תקין ומלא.`;
  const ctx = `מותג: ${brand.business} | מיצוב: ${brand.positioning}\nאסטרטגיה: ${strategy?.core_message || ''}\n${noteBlock(note)}\nמנגנון: ${idea.mechanism}\nרעיון: ${idea.idea}${hero ? `\nאובייקט-גיבור: ${hero}` : ''}${idea.useTypography ? `\nמילה: ${idea.word}` : ''}`;
  const valid = (o) => o && o.image_prompt && o.image_prompt.trim().length > 15 && o.copy && o.copy.headline && o.copy.headline.trim();
  const attempt = async () => { try { return await chatJson(sys, ctx, { temperature: 0.85, maxTokens: 1500 }); } catch { return null; } };
  let out = await attempt();
  if (!valid(out)) out = await attempt();        // FIX 1 — retry once
  if (!valid(out)) out = fallbackExpand(idea, hero, note, brand); // FIX 1 — never empty
  const concept = {
    mechanism: idea.mechanism, useTypography: idea.useTypography, word: idea.word,
    hero_object: out.hero_object || hero || '', fallback: Boolean(out._fallback),
    core_idea: out.core_idea || idea.idea, psychological_principle: out.psychological_principle || '',
    visual_metaphor: out.visual_metaphor || idea.idea || '', emotional_reaction: out.emotional_reaction || '',
    marketing_principle: out.marketing_principle || '', layout: out.layout || {},
    image_prompt: out.image_prompt, negative_prompt: out.negative_prompt || '',
  };
  // COPY LAYER → the Creative Editor pass. The concept stage's copy is ignored.
  const polished = await writeCopy(concept, brand, strategy);
  concept.copy = polished || {
    headline: (out.copy && out.copy.headline) ? out.copy.headline : shortHeadline(idea.idea),
    subline: (out.copy && out.copy.subline) || '', cta: (out.copy && out.copy.cta) || 'דברו איתנו',
  };
  return concept;
}

// ===== CREATIVE CRITIC — a rival world-class agency brutally reviews a concept =====
export async function creativeCritic(concept, brand) {
  if (!isGeminiConfigured) return {};
  const sys = `אתה מנהל קריאייטיב במשרד פרסום יריב ברמה עולמית. תפקידך: לבקר **אך ורק את מודעת הפרסום שתתואר למטה** — באכזריות וביושר, בלי לרכך. אל תברח לנושאים אחרים ואל תדבר על "הבקשה" — בקר את המודעה עצמה. ענה קצר וחד בעברית, משפט לכל שדה.
החזר JSON: {"why_fail":"למה המודעה עלולה להיכשל","generic":"מה במודעה מרגיש גנרי","ai_feel":"מה מרגיש כמו AI","weakest":"הנקודה החלשה ביותר","apple":"איך אפל הייתה משפרת אותה","nike":"איך נייקי הייתה משפרת אותה","cannes":"איך חבר שופטים ב-Cannes Lions היה מבקר אותה","unforgettable":"מה היה הופך אותה לבלתי-נשכחת"}`;
  const ctx = `המודעה לביקורת —\nמותג: ${brand.business}\nמנגנון קריאייטיב: ${concept.mechanism}\nכותרת: ${concept.copy?.headline || ''}\nתת-כותרת: ${concept.copy?.subline || ''}\nרעיון מרכזי: ${concept.core_idea || ''}\nאובייקט-גיבור: ${concept.hero_object || ''}\nמטאפורה ויזואלית: ${concept.visual_metaphor || ''}\nתיאור הויזואל: ${concept.image_prompt || ''}`;
  try { return await chatJson(sys, ctx, { temperature: 0.6, maxTokens: 1300 }); } catch { return {}; }
}

// ===================================================================
// ORCHESTRATOR — Creative Director Engine v1 (FROZEN). Agent entry point.
//
// I/O schema (JSDoc — JS, not TS):
//   @typedef {Object} BrandProfile  { business, positioning, audience, industry?,
//     differentiators[], emotional_triggers[], tone[], trust_signals[],
//     luxury_level, weaknesses[], do_not[], palette[], cards[] }
//   @typedef {Object} Strategy      { core_message, emotional_message, promise,
//     triggers:{psychological,curiosity,trust?,luxury,fomo}, visual_direction, dna }
//   @typedef {Object} DirectorNote  { feel, remember, one_image, only_this }
//   @typedef {Object} Idea          { mechanism, idea, object, useTypography, word,
//     technique, total, safe }
//   @typedef {Object} Concept       { mechanism, hero_object, useTypography, word,
//     core_idea, psychological_principle, visual_metaphor, emotional_reaction,
//     marketing_principle, layout, copy:{headline,subline,cta}, image_prompt,
//     engPrompt, fallback, total, critique? }
//   @typedef {Object} Campaign      { strategy:Strategy, note:DirectorNote,
//     concepts:Concept[] }
//
// Stages (in order): strategy → directorNote → brainstorm(+kill-safe, retry round)
//   → dedupe(memory+diversity) → unique-mechanism select → expand(+copy pass)
//   → [optional critique] → toEnglish prompts.
// This canonicalizes the sequence so an agent can call ONE function. Rendering
// is NOT part of it and never was in this module.
// ===================================================================

// Structured, observable logging — default no-op (zero behavior change). An agent
// (or the UI) registers a sink to watch every stage boundary.
let _engineLogger = null;
export function setEngineLogger(fn) { _engineLogger = typeof fn === 'function' ? fn : null; }
function logStage(stage, data) { if (_engineLogger) { try { _engineLogger(stage, data || {}); } catch { /* noop */ } } }

/**
 * Run the full (frozen v1) Creative Director text pipeline for one brand.
 * @param {BrandProfile} brand  pre-analyzed profile (call analyzeBusiness first)
 * @param {Object} [opts] { target=6, brainstormSize=30, maxRounds=2, simThreshold=0.3,
 *   memory=campaignMemory, withCritique=false, onStage }
 * @returns {Promise<Campaign>} { strategy, note, concepts } — concepts are
 *   production-ready (English engPrompt + premium Hebrew copy). Rendering is the
 *   caller's concern. Throws an Error (Hebrew) on an unrecoverable stage failure.
 */
export async function runCreativeDirector(brand, opts = {}) {
  const {
    target = 6, brainstormSize = 30, maxRounds = 2, simThreshold = 0.3,
    memory = campaignMemory, withCritique = false, onStage = () => {},
  } = opts;
  const emit = (stage, payload = {}) => { logStage(stage, payload); try { onStage({ stage, ...payload }); } catch { /* noop */ } };
  if (!brand) throw userError('חסר פרופיל עסק');

  // Stage — campaign strategy
  emit('strategy', { phase: 'strategy', message: 'בונה אסטרטגיית קמפיין…' });
  const strategy = await buildStrategy(brand);
  emit('strategy:done', { strategy });

  // Stage — internal director note (guides the campaign; never user-facing)
  emit('note', { phase: 'concepts', message: 'פתק במאי פנימי…' });
  let note = {};
  try { note = await directorNote(brand, strategy); } catch { note = {}; }

  // Stage — massive brainstorm + kill-safe (extra round if too few qualified)
  const pool = []; const poolMechs = new Set();
  const uniqueCount = () => { const m = new Set(); pool.forEach((c) => m.add(c.mechanism)); return m.size; };
  for (let round = 0; round < maxRounds && uniqueCount() < target; round += 1) {
    emit('brainstorm', { round, message: round === 0 ? `סיעור מוחות — ${brainstormSize} רעיונות…` : 'רעיונות בטוחים נפסלו — סבב אמיץ נוסף…' });
    let ideas = [];
    try { ideas = await brainstormConcepts(brand, strategy, { count: brainstormSize, note }); } catch { ideas = []; } // eslint-disable-line no-await-in-loop
    if (!ideas.length) continue;
    emit('score', { generated: ideas.length, message: `מנקד ${ideas.length} רעיונות · פוסל בטוחים…` });
    const scored = await scoreBrainstorm(ideas, brand); // eslint-disable-line no-await-in-loop
    scored.filter((c) => !c.safe).forEach((c) => { if (!poolMechs.has(c.mechanism)) { poolMechs.add(c.mechanism); pool.push(c); } else pool.push(c); });
  }
  if (!pool.length) throw userError('כל הרעיונות נפסלו כבטוחים — נסה שוב או נסח אחרת.');

  // Stage — dedupe (memory + diversity) → unique-mechanism winners
  emit('select', { message: 'סינון גיוון · זיכרון קמפיינים…' });
  const ranked = dedupeConcepts(pool.sort((a, b) => b.total - a.total), simThreshold, memory);
  const seen = new Set();
  const diverse = ranked.filter((c) => (seen.has(c.mechanism) ? false : seen.add(c.mechanism)));
  const winners = (diverse.length >= target ? diverse : ranked).slice(0, target);
  if (!winners.length) throw userError('לא נותרו קונספטים ייחודיים מספיק — נסה שוב.');

  // Stage — expand each winner (concept + copy pass)
  const concepts = [];
  for (let i = 0; i < winners.length; i += 1) {
    emit('expand', { index: i, total: winners.length, mechanism: winners[i].mechanism, message: `מרחיב קונספט ${i + 1}/${winners.length} (${MECHANISM_HE[winners[i].mechanism] || winners[i].mechanism})…` });
    const full = await expandConcept(brand, strategy, winners[i], note); // eslint-disable-line no-await-in-loop
    if (full) concepts.push({ ...full, idea: winners[i].idea, total: winners[i].total });
  }
  if (!concepts.length) throw userError('הרחבת הקונספטים נכשלה — נסה שוב.');
  memory.remember(concepts);

  // Stage — optional Creative Critic (OFF by default to match frozen v1 behavior)
  if (withCritique) {
    for (let i = 0; i < concepts.length; i += 1) {
      emit('critic', { index: i });
      concepts[i].critique = await creativeCritic(concepts[i], brand).catch(() => ({})); // eslint-disable-line no-await-in-loop
    }
  }

  // Stage — normalize prompts to English (typography-aware). The workstation
  // model-unload step that used to follow went with the engine that needed it.
  emit('translate', { message: 'מכין פרומפטים…' });
  for (const c of concepts) {
    try { c.engPrompt = toEnglishImagePrompt(c.image_prompt, { typography: c.useTypography, word: c.word }); } catch { /* keep raw */ }
  }
  emit('done', { count: concepts.length });
  return { strategy, note, concepts };
}

function demoBrainstorm(n) {
  return new Promise((r) => setTimeout(() => r(Array.from({ length: n }, (_, i) => ({
    mechanism: WILD_MECHANISMS[i % WILD_MECHANISMS.length].key, idea: `רעיון הדגמה ${i + 1}`,
    useTypography: i % 3 === 0, word: i % 3 === 0 ? 'VALUE' : '', technique: 'giant 3D letters carved from stone', object: '',
  })), 400)));
}
function demoExpand(idea) {
  return {
    core_idea: idea.idea, psychological_principle: '—', visual_metaphor: '—', emotional_reaction: '—', marketing_principle: '—',
    layout: { logo: 'תחתון-שמאל', text_zone: 'עליון', overlay: 'כהה', font_weight: '800' },
    copy: { headline: 'הדגמה', subline: '', cta: 'דברו איתנו' },
    image_prompt: idea.useTypography ? `cinematic scene with the word "${idea.word}" as giant 3D letters` : 'surreal cinematic premium advertising scene',
    negative_prompt: 'low quality',
  };
}

function demoBusiness(url) {
  return new Promise((resolve) => setTimeout(() => resolve({
    business: 'עסק לדוגמה', positioning: 'מצב הדגמה — הנתונים אינם אמיתיים', audience: 'לקוחות פרימיום מקומיים',
    industry: '', differentiators: ['ייחוד'], emotional_triggers: ['אמון'], tone: ['פרימיום'], trust_signals: [],
    luxury_level: 'premium', weaknesses: ['נוכחות דיגיטלית'], do_not: [], palette: [],
    cards: [
      { title: 'מי העסק', summary: `אתר ${url || 'לדוגמה'} — לא נותח (המנוע כבוי).` },
      { title: 'קהל יעד', summary: 'לקוחות פרימיום מקומיים.' },
      { title: 'הזדמנות פרסומית', summary: 'מסר רגשי חזק.' },
    ],
  }), 600));
}
function demoStrategy() {
  return new Promise((resolve) => setTimeout(() => resolve({
    core_message: 'הופכים עסק לחוויה', emotional_message: 'גאווה', promise: 'נוכחות שמוכרת לבד',
    triggers: { psychological: 'שייכות', curiosity: 'מה מסתתר?', trust: 'איכות', luxury: 'יוקרה', fomo: 'כולם כבר שם' },
    visual_direction: 'קולנועי, עמוק, מינימלי', dna: 'אמנות שמייצרת ערך',
  }), 400));
}
function demoConcepts(count) {
  return new Promise((resolve) => setTimeout(() => resolve(
    Array.from({ length: Math.min(count, 3) }, (_, i) => ({
      mechanism: CREATIVE_MECHANISMS[i].key, core_idea: 'מצב הדגמה', psychological_principle: '—', visual_metaphor: '—', emotional_reaction: '—',
      copy: { headline: `רעיון ${i + 1}`, subline: 'הדגמה', cta: 'דברו איתנו' },
      image_prompt: 'surreal cinematic premium advertising scene, dramatic lighting, hyper detailed, 8k, no text',
      negative_prompt: 'text, watermark, low quality',
    })),
  ), 500));
}

// ===== ENFORCE ENGLISH on the image prompt =====
// The model-backed Hebrew→English rescue translation ran on the retired
// workstation LLM. What remains is DETERMINISTIC and synchronous: strip any
// Hebrew, apply the wild/typography shaping, and guarantee the "no text" suffix.
const HEBREW_RE = /[֐-׿]/;

export function toEnglishImagePrompt(text, opts = {}) {
  const wild = opts.wild !== false; // default: inject the wild/maximalist look
  const typo = !!opts.typography; // letters ARE the art → keep them, don't say "no text"
  const word = (opts.word || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 7);
  let t = (text || '').replace(/NO TEXT IN IMAGE/gi, '').trim();
  if (!t) t = 'premium cinematic advertising scene, dramatic lighting, hyper detailed';
  const finalize = (s) => {
    let out = s;
    if (wild) {
      // strip "clean"-anchoring words that fight the maximalist look, then boost
      out = out.replace(/\b(ultra[- ]?)?(minimalist|minimalism|minimal|clean|simple|plain|understated|subtle|calm|quiet|sparse|elegant restraint)\b/gi, '')
        .replace(/\bon a (plain |seamless |clean )?white background\b/gi, '')
        .replace(/\bwhite background\b/gi, '')
        .replace(/\bsoft (natural )?(light|lighting|shadows)\b/gi, 'dramatic lighting')
        .replace(/\s{2,}/g, ' ').replace(/\s+,/g, ',').replace(/,\s*,/g, ',').trim();
      out += `, ${WILD_BOOST}`;
    }
    if (typo) {
      // letters are the hero — ensure the word is present, keep them sharp; NO "no text"
      if (word && !out.toUpperCase().includes(word)) out += `, the word "${word}"`;
      out += ', sharp legible bold 3D typography physically integrated into the scene, correct spelling';
    } else if (!/no text/i.test(out)) {
      out += ', no text, no letters, no watermark, 8k';
    }
    return out;
  };
  if (HEBREW_RE.test(t)) {
    t = t.replace(/[֐-׿"']+/g, ' ').replace(/\s+/g, ' ').trim() || 'premium cinematic advertising scene, dramatic lighting';
  }
  return finalize(t);
}

// ===================================================================
// AI Quote Diagnosis — deep sales diagnosis for a client + offer.
// Returns the structured diagnosis object.
//
// M2 J3B: served EXCLUSIVELY by the AI Gateway action `crm.diagnose_quote`.
// The system instruction + JSON schema + user-message template are
// server-owned (action profile + pure contract builder); no browser Gemini
// key is read, no direct provider call is made, and a Gateway failure
// NEVER falls back to a local/browser provider. The unconfigured
// environment (no Supabase) keeps the calm demo diagnosis.
// ===================================================================

// Map the legacy diagnoseQuote(input) interface to the Gateway's strict
// payload: EXACTLY { clientName, field, audience, offer }. Values travel
// BYTE-EXACT — no trimming, no defaulting, no coercion, no repair: input
// the deployed crm.diagnose_quote contract considers invalid stays invalid
// and is rejected server-side (invalid_payload). Only the four contract
// fields are read from the input (UI-state keys never belong on the wire,
// where unknown keys are rejected). Carries ONLY the diagnosis data and
// no execution authority of any kind (the server action owns all of it).
function buildDiagnoseQuoteGatewayPayload(input) {
  const src = (input && typeof input === 'object') ? input : {};
  return { clientName: src.clientName, field: src.field, audience: src.audience, offer: src.offer };
}

export async function diagnoseQuote(input) {
  const res = await callAiGateway('crm.diagnose_quote', buildDiagnoseQuoteGatewayPayload(input));
  if (res && res.ok) {
    const json = (res.result && res.result.json && typeof res.result.json === 'object' && !Array.isArray(res.result.json))
      ? res.result.json
      : null;
    if (!json) throw engineError('diagnose: empty_response', 'שגיאה בהפקת האבחון — נסה/י שוב בעוד רגע.');
    return json;
  }
  if (res && res.error && res.error.code === 'supabase_not_configured') {
    return demoResult(input);
  }
  const code = (res && res.error && res.error.code) || 'no_brain';
  throw engineError(`diagnose: ${code}`, 'שגיאה בהפקת האבחון — נסה/י שוב בעוד רגע.');
}

// M2 J3C S2: the legacy pre-gateway Jake lanes (chatWithLocalModel, forceActions)
// were retired here — the production lanes are chatJake → `jake.chat` and
// forceActionsJake → `jake.force_actions` below (server-owned AI Gateway).

// ===================================================================
// JAKE BRAIN SELECTION — REMOVED (local-engine retirement, 2026-07-27).
// The persisted brain preference and the cloud/local badge label were the last
// provider-SELECTION surface in the frontend. They had no production consumer
// (the Jake lanes below have been Gateway-exclusive since M2 J2) and the "local"
// branch named a workstation model, so they went with the engine. There is now
// exactly one brain for every Jake lane: the account's server-owned AI Gateway.
// ===================================================================

// No context vs context: the legacy lanes treat null/undefined/'' contextText
// as "no context supplied"; anything else travels to the Gateway BYTE-EXACT in
// context.summary (even a whitespace-only or non-string value — the strict
// server contract, not the client, decides validity).
function hasJakeContext(contextText) {
  return contextText !== undefined && contextText !== null && contextText !== '';
}

// Map the legacy chatJake (history, contextText) interface to the Gateway's
// strict multi-turn payload: { messages: [{role,text}...], context?: {summary} }.
// EXACT mapping (M2 J2 correction): each history entry contributes one wire
// message whose `role` and `text` are copied VERBATIM — same count, same
// order, same role values, same text bytes. No trimming, no dropping of empty
// messages, no role coercion, no skipping assistant-first input, no repair of
// any kind: input the deployed jake.chat contract considers invalid stays
// invalid and is rejected server-side (invalid_payload). Only the two wire
// fields are read from each entry (the lane's semantic boundary — UI-state
// keys never belong on the wire, where unknown keys are rejected). Carries
// ONLY conversation + context data — never provider/model/system/options.
function buildJakeChatGatewayPayload(history, contextText) {
  const list = Array.isArray(history) ? history : [];
  const messages = list.map((m) => ({
    role: m ? m.role : undefined,
    text: m ? m.text : undefined,
  }));
  return hasJakeContext(contextText)
    ? { messages, context: { summary: contextText } }
    : { messages };
}

// PUBLIC — multi-turn Jake chat. Returns { text, brain }; throws on failure
// (the caller shows a calm message — never the raw error).
//
// M2 J2: served EXCLUSIVELY by the AI Gateway action `jake.chat`, which owns
// the FULL production chat authority server-side (persona + grounding rules +
// action protocol + confirm discipline). No browser Gemini key is read, no
// direct provider call is made, and a Gateway failure NEVER falls back
// to a local/browser provider. The unconfigured environment (no Supabase)
// keeps the calm demo behavior, like before.
export async function chatJake(history, contextText) {
  const res = await callAiGateway('jake.chat', buildJakeChatGatewayPayload(history, contextText));
  if (res && res.ok) {
    const text = (res.result && typeof res.result.text === 'string') ? res.result.text.trim() : '';
    if (!text) throw engineError('EMPTY_RESPONSE', 'לא הצלחתי לעבד את זה כרגע. נסה/י שוב בעוד רגע.');
    return { text, brain: 'gateway' };
  }
  if (res && res.error && res.error.code === 'supabase_not_configured') {
    return { text: await demoChat(history), brain: 'demo' };
  }
  throw engineError((res && res.error && res.error.code) || 'NO_BRAIN', 'לא הצלחתי לעבד את זה כרגע. נסה/י שוב בעוד רגע.');
}

// Map the force-actions interface to the Gateway's strict single-turn payload:
// EXACTLY one user message (the J1 contract), context as { summary } data only.
// EXACT mapping (M2 J2 correction): userText becomes the single message text
// VERBATIM — no trim, no normalization, no repair; invalid input is rejected
// by the server contract, never made valid client-side.
function buildJakeForceActionsPayload(userText, contextText) {
  const payload = { messages: [{ role: 'user', text: userText }] };
  if (hasJakeContext(contextText)) payload.context = { summary: contextText };
  return payload;
}

// PUBLIC — force ONLY an actions block (second pass). Returns the raw result
// text for the caller's extractActions, exactly as before.
//
// M2 J2: served EXCLUSIVELY by the AI Gateway action `jake.force_actions`.
// The server normalizes the raw provider output to ONE canonical fenced
// ```actions block or exactly "[]" — and it NEVER executes or interprets the
// ops; parsing, KNOWN_OPS validation, the confirm card, and execution stay
// entirely in the frontend flow. No browser provider call, no fallback. The
// unconfigured environment keeps the legacy calm no-op ('' → no actions).
export async function forceActionsJake(userText, contextText) {
  const res = await callAiGateway('jake.force_actions', buildJakeForceActionsPayload(userText, contextText));
  if (res && res.ok) {
    const text = (res.result && typeof res.result.text === 'string') ? res.result.text.trim() : '';
    if (!text) throw engineError('EMPTY_RESPONSE', 'לא הצלחתי לעבד את זה כרגע. נסה/י שוב בעוד רגע.');
    return text;
  }
  if (res && res.error && res.error.code === 'supabase_not_configured') return '';
  throw engineError((res && res.error && res.error.code) || 'NO_BRAIN', 'לא הצלחתי לעבד את זה כרגע. נסה/י שוב בעוד רגע.');
}

// Map the legacy (history, contextText) drafting interface to the Gateway's
// strict multi-turn payload: { messages: [{role,text}...], context?: {summary} }.
// Mirrors the retired legacy cloud path's own shaping: empty texts are
// skipped, non-assistant roles coerce to 'user', and the window opens on
// the first user turn. This shaping is the MERGED Slice B
// contract of the drafting lane ONLY — the J2 chat/force lanes deliberately
// do NOT share it (they map byte-exact; see buildJakeChatGatewayPayload).
// Carries ONLY conversation + context data — never provider/model/system/
// options (the server profile owns all instruction authority).
function buildJakeDraftGatewayPayload(history, contextText) {
  const list = Array.isArray(history) ? history : [];
  const messages = [];
  for (const m of list) {
    const text = (m && typeof m.text === 'string') ? m.text.trim() : '';
    if (!text) continue;
    messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', text });
  }
  while (messages.length && messages[0].role !== 'user') messages.shift();
  const summary = (typeof contextText === 'string') ? contextText.trim() : '';
  return summary ? { messages, context: { summary } } : { messages };
}

// PUBLIC — drafting lane: write a letter / WhatsApp / email / reply from real
// data. Prose ONLY (no actions block). Returns { text, brain }; throws on
// failure (the caller shows a calm message — never the raw error).
//
// Slice B: served EXCLUSIVELY by the AI Gateway action `jake.draft_message`.
// No browser Gemini key is read, no direct Google call is made, and a Gateway
// failure NEVER falls back to any legacy provider path. The unconfigured
// environment (no Supabase) keeps the calm demo behavior, like before.
export async function draftWithJake(history, contextText) {
  const res = await callAiGateway('jake.draft_message', buildJakeDraftGatewayPayload(history, contextText));
  if (res && res.ok) {
    const text = (res.result && typeof res.result.text === 'string') ? res.result.text.trim() : '';
    if (!text) throw engineError('EMPTY_RESPONSE', 'לא הצלחתי לעבד את זה כרגע. נסה/י שוב בעוד רגע.');
    return { text, brain: 'gateway' };
  }
  if (res && res.error && res.error.code === 'supabase_not_configured') {
    return { text: await demoChat(history), brain: 'demo' };
  }
  throw engineError((res && res.error && res.error.code) || 'NO_BRAIN', 'לא הצלחתי לעבד את זה כרגע. נסה/י שוב בעוד רגע.');
}

// ===================================================================
// Lead research — generate fresh lead ideas for a niche/area.
// Returns [{ name, category, need }].
//
// M2 J3A: served EXCLUSIVELY by the AI Gateway action `crm.lead_ideas`.
// The system instruction + JSON schema are server-owned (action profile);
// no browser Gemini key is read, no direct provider call is made,
// and a Gateway failure NEVER falls back to a local/browser provider.
// The unconfigured environment (no Supabase) keeps the calm demo list.
// ===================================================================

// Legacy default niche — EXPLICITLY APPROVED compatibility mapping (M2 J3A):
// the frozen Outreach.jsx may call generateLeadIdeas('', 6), and the legacy
// prompt resolved a falsy niche to this exact value. The CLIENT adapter
// resolves a missing/blank niche to it; the Gateway itself still rejects a
// direct blank niche payload.
const LEAD_IDEAS_DEFAULT_NICHE = 'עסקי בוטיק בישראל';

// Map the legacy (niche, count) interface to the Gateway's strict payload:
// { niche: string, count: integer }. Besides the approved blank-niche
// default above, values travel VERBATIM — no trimming, no clamping, no
// count coercion: input the deployed crm.lead_ideas contract considers
// invalid stays invalid and is rejected server-side (invalid_payload).
function buildLeadIdeasGatewayPayload(niche, count) {
  const resolved = (typeof niche === 'string' && niche.trim()) ? niche : LEAD_IDEAS_DEFAULT_NICHE;
  return { niche: resolved, count };
}

export async function generateLeadIdeas(niche, count = 6) {
  const res = await callAiGateway('crm.lead_ideas', buildLeadIdeasGatewayPayload(niche, count));
  if (res && res.ok) {
    const leads = (res.result && res.result.json && Array.isArray(res.result.json.leads))
      ? res.result.json.leads
      : null;
    if (!leads) throw engineError('lead_ideas: empty_response', 'שגיאה ביצירת רעיונות — נסה/י שוב בעוד רגע.');
    return leads;
  }
  if (res && res.error && res.error.code === 'supabase_not_configured') {
    return demoLeadIdeas(niche, count);
  }
  const code = (res && res.error && res.error.code) || 'no_brain';
  throw engineError(`lead_ideas: ${code}`, 'שגיאה ביצירת רעיונות — נסה/י שוב בעוד רגע.');
}

// M2 J3C S2: the legacy browser-side prompt enhancer (enhanceImagePrompt /
// demoEnhance) was retired here — ImageStudio's prompt enhancement is served
// by the authenticated Gateway action `studio.prompt_enhance`.

function demoLeadIdeas(niche, count) {
  const base = [
    { name: 'יקב בוטיק חדש', category: 'winery', need: 'אתר מותג + הזמנת טעימות אונליין' },
    { name: 'מסעדת שף עולה', category: 'food', need: 'תפריט דיגיטלי + הזמנת שולחן' },
    { name: 'גלריית אמנות עצמאית', category: 'art', need: 'תיק עבודות + חנות הדפסות' },
    { name: 'מכון יופי פרימיום', category: 'beauty', need: 'הזמנת תורים 24/7 + גלריית תוצאות' },
    { name: 'צימר יוקרה בצפון', category: 'hospitality', need: 'יומן זמינות + הזמנה ישירה' },
    { name: 'קליניקת אסתטיקה', category: 'clinic', need: 'אתר אמין + הזמנת התייעצות' },
  ];
  return new Promise((resolve) => setTimeout(() => resolve(base.slice(0, count)), 600));
}

// ---- demo fallback (public-safe copy) ----
// PUBLIC-PRODUCT COPY RULE: this message reaches end users on hosted production.
// It must never mention API keys, env files, or any technical configuration, and
// must never instruct the user to configure the system. Gateway drafting still
// works in this state, so it must not claim ALL AI features are unavailable.
function demoChat(history) {
  void history; // signature preserved (callers pass the chat history)
  return new Promise((resolve) =>
    setTimeout(() => resolve(
      'היי, אני ג׳ייק 🙂 כרגע השיחה החכמה המלאה אינה זמינה. אפשר להמשיך להשתמש בפעולות הניסוח והכלים הזמינים במערכת, או לנסות שוב מאוחר יותר.'
    ), 700)
  );
}

// ---- demo fallback (no API key) ----
function demoResult({ clientName, field, offer }) {
  const name = clientName?.trim() || 'הלקוח';
  return new Promise((resolve) =>
    setTimeout(() => resolve({
      _demo: true,
      personalityType: 'מקבל החלטות זהיר · מוכוון תוצאות וערך',
      psychProfile: `${name} פועל${field ? ` בתחום ${field}` : ''} ומעריך מקצועיות ואמינות לפני מחיר. סביר שכבר נכווה מספק שלא עמד בציפיות, ולכן מחפש שקט נפשי וביטחון שהפרויקט יסתיים בזמן ובאיכות. מדבר בשפת "כמה זה יחזיר לי", לא "כמה זה עולה".`,
      conversationStructure: [
        { step: 'פתיחה ואמון', detail: 'פתח בשאלה על העסק שלו, לא על ההצעה. תן לו לדבר 2 דקות — זה בונה אמון ומגלה את הכאב האמיתי.' },
        { step: 'מיקוד הכאב', detail: 'שקף לו את הבעיה במילים שלו ("אז אם הבנתי, היום אתה מאבד לידים כי…"). הוא צריך להרגיש שהבנת.' },
        { step: 'הצגת הפתרון כתוצאה', detail: `הצג את ${offer || 'ההצעה'} דרך התוצאה העסקית (יותר פניות, מראה מקצועי, פחות עבודה ידנית) — לא דרך רשימת פיצ'רים.` },
        { step: 'עיגון ערך לפני מחיר', detail: 'הזכר 1-2 דוגמאות/תוצאות לפני שאתה אומר מספר. כשתגיד מחיר — תשתוק ותן לו להגיב.' },
        { step: 'סגירה רכה', detail: 'הצע צעד קטן והפיך (מקדמה / שיחת אפיון) במקום "כן/לא" גדול.' },
      ],
      objections: [
        { objection: 'יקר לי / מעבר לתקציב', response: 'פרק לתשלומים והחזר לתוצאה: "כמה שווה לך לקוח אחד חדש בחודש? האתר מחזיר את עצמו תוך X."' },
        { objection: 'אני צריך לחשוב על זה', response: 'אל תלחץ. שאל "מה הדבר הספציפי שמעכב?" — בד"כ זה מחיר, זמן או אמון, וכל אחד מטופל אחרת.' },
        { objection: 'יש לי מישהו זול יותר', response: 'הסכם ("בטח שיש"), והפרד בין מחיר לעלות: ספק זול שמתעכב/לא נמסר עולה יותר. הצג אחריות ולוח זמנים ברור.' },
      ],
      valueAngles: ['חיסכון בזמן ובעבודה ידנית', 'מראה מקצועי שמייצר אמון', 'יותר לידים/פניות', 'ליווי אישי ואחריות'],
      closingTip: 'סיים בשאלת בחירה ולא בשאלת כן/לא: "מתחילים בשבוע הבא או בשבוע אחרי?" — זה מזיז את ההחלטה מ־"אם" ל־"מתי".',
    }), 1100)
  );
}

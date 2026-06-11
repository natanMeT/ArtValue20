// ===================================================================
// Gemini client for the "AI Quote Diagnosis" feature.
// Calls the Generative Language REST API directly (no SDK dependency).
// Graceful fallback: with no VITE_GEMINI_API_KEY it returns a structured
// demo result so the feature works offline / before a key is added.
// ===================================================================

import { ACTIONS_GUIDE } from './jakeAgent.js';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.0-flash';

// Local LLM (Ollama / any OpenAI-compatible server). When set, ALL text AI runs
// locally on the user's GPU — free, unlimited, private — instead of Gemini cloud.
const LOCAL_LLM_URL = (import.meta.env.VITE_LOCAL_LLM_URL || '').replace(/\/$/, '');
const LOCAL_LLM_MODEL = import.meta.env.VITE_LOCAL_LLM_MODEL || 'aya-expanse:8b';
// Separate model for the AdStudio Creative Director (DictaLM = wilder/more original).
// Jake & all other text AI keep using LOCAL_LLM_MODEL (aya — fast & coherent).
const CREATIVE_LLM_MODEL = import.meta.env.VITE_CREATIVE_LLM_MODEL || LOCAL_LLM_MODEL;
export const useLocalLLM = Boolean(LOCAL_LLM_URL);

// Qwen3 supports a "/no_think" soft switch that disables its reasoning trace. We
// want INSTRUCT / non-thinking mode (no <think> blocks polluting the agent output
// or breaking action parsing). Appended only for Qwen models so it doesn't affect
// the aya rollback (which would just see stray text). Empirically Ollama's qwen3
// already defaults to non-thinking here — this makes it deterministic.
const NO_THINK = /qwen3/i.test(LOCAL_LLM_MODEL) ? '\n\n/no_think' : '';

export const isGeminiConfigured = Boolean(API_KEY) || useLocalLLM;

// If the GPU is full (ComfyUI holding image models), free it so the LLM can load.
const COMFY_URL = (import.meta.env.VITE_COMFYUI_URL || '').replace(/\/$/, '');
async function freeImageVram() {
  if (!COMFY_URL) return;
  try {
    await fetch(`${COMFY_URL}/free`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"unload_models":true,"free_memory":true}' });
    await new Promise((r) => setTimeout(r, 1500));
  } catch { /* ignore */ }
}

// OpenAI-compatible chat completion against the local model (with VRAM self-heal).
async function localChat(messages, opts = {}) {
  const { json = false, temperature = 0.7, maxTokens = 1200, model = LOCAL_LLM_MODEL } = opts;
  const call = async () => {
    const body = { model, messages, temperature, max_tokens: maxTokens, stream: false };
    if (json) body.response_format = { type: 'json_object' };
    const res = await fetch(`${LOCAL_LLM_URL}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = new Error(res.status === 404 ? 'המודל המקומי לא זמין — ודא ש-Ollama רץ' : `שגיאת מודל מקומי (${res.status})`);
      err.status = res.status;
      throw err;
    }
    const j = await res.json();
    const text = j?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('לא התקבלה תשובה מהמודל המקומי');
    return text;
  };
  try {
    return await call();
  } catch (e) {
    // 500 usually = out of VRAM (image model resident). Free it and retry once.
    if (e.status === 500) { await freeImageVram(); return await call(); }
    // No HTTP status = network error → Ollama isn't reachable (often right after a reboot).
    if (!e.status) {
      throw new Error('המנוע המקומי (Ollama) לא פעיל או עדיין עולה אחרי הפעלת המחשב. ודא ש-Ollama רץ (אייקון בשורת המשימות) והמתן ~30 שניות, ואז נסה שוב.');
    }
    throw e;
  }
}

// Strip ```json fences a local model sometimes adds, then JSON.parse.
function parseJsonLoose(text) {
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const s = t.indexOf('{'); const e = t.lastIndexOf('}');
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  return JSON.parse(t);
}

// Generic JSON chat that works on BOTH back-ends (local Ollama or Gemini cloud).
// Returns the parsed object. Used by the business-scan / ad-concept engine below.
async function chatJson(sys, user, opts = {}) {
  const temperature = opts.temperature ?? 0.7;
  const maxTokens = opts.maxTokens ?? 2048;
  if (useLocalLLM) {
    const messages = [
      { role: 'system', content: `${sys}\n\nהחזר JSON תקין בלבד (ללא טקסט נוסף, ללא הסברים).${NO_THINK}` },
      { role: 'user', content: user },
    ];
    return parseJsonLoose(await localChat(messages, { json: true, temperature, maxTokens, model: opts.model }));
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: sys }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { responseMimeType: 'application/json', temperature, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-goog-api-key': API_KEY }, body: JSON.stringify(body) });
  if (!res.ok) {
    let msg = `שגיאת Gemini (${res.status})`;
    try { const e = await res.json(); msg = e?.error?.message || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const json = await res.json();
  const text = (json?.candidates?.[0]?.content?.parts || []).map((p) => p.text).filter(Boolean).join('').trim();
  if (!text) throw new Error('לא התקבלה תשובה מ-Gemini');
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
  if (!clean) throw new Error('הזן כתובת אתר');
  const full = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
  let res;
  try {
    res = await fetch(READER_PROXY + full, { headers: { Accept: 'text/plain' } });
  } catch {
    throw new Error('לא ניתן לקרוא את האתר (בעיית רשת). בדוק את הכתובת ונסה שוב.');
  }
  if (!res.ok) throw new Error(`קריאת האתר נכשלה (${res.status}). ודא שהכתובת תקינה וציבורית.`);
  const text = (await res.text()).trim();
  if (!text || text.length < 40) throw new Error('האתר ריק או חוסם קריאה אוטומטית.');
  return text.slice(0, 14000); // cap context for the LLM
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

// mechanism → ComfyUI render preset (style the FLUX render to fit the idea)
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
  const p = await chatJson(sys, `כתובת האתר: ${url}\n\nתוכן האתר:\n${siteText}`, { temperature: 0.5, maxTokens: 1600, model: CREATIVE_LLM_MODEL });
  if (!p || !p.business) throw new Error('הניתוח נכשל — נסה אתר אחר.');
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
  const s = await chatJson(sys, ctx, { temperature: 0.7, maxTokens: 1200, model: CREATIVE_LLM_MODEL });
  if (!s || !s.core_message) throw new Error('בניית האסטרטגיה נכשלה — נסה שוב.');
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
  try { out = await chatJson(sys, ctx, { temperature: 1.0, maxTokens: 4096, model: CREATIVE_LLM_MODEL }); }
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
  try { scores = (await chatJson(sys, ctx, { temperature: 0.3, maxTokens: 2000, model: CREATIVE_LLM_MODEL })).scores || []; } catch { scores = []; }
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
    return await chatJson(sys, `מותג: ${brand.business} | מיצוב: ${brand.positioning} | אסטרטגיה: ${strategy?.core_message || ''}`, { temperature: 0.85, maxTokens: 700, model: CREATIVE_LLM_MODEL });
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
  // distinct mechanisms (otherwise DictaLM tends to return all 'visual-metaphor').
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
    try { out = await chatJson(sys, ctx, { temperature: 1.05, maxTokens: 2800, model: CREATIVE_LLM_MODEL }); } catch { out = {}; } // eslint-disable-line no-await-in-loop
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
  // FIX 3 — score via aya (LOCAL_LLM_MODEL): wider, more discriminating spread than DictaLM,
  // whose 'stopping' axis collapses to 1-2 for everything.
  let scores = [];
  try { scores = (await chatJson(sys, ctx, { temperature: 0.3, maxTokens: 2200 })).scores || []; } catch { scores = []; }
  const n = (v) => Math.max(0, Math.min(10, Number(v) || 0));
  return ideas.map((c, i) => {
    const s = scores.find((x) => x.i === i) || scores[i] || {};
    const total = (n(s.originality) * 3 + n(s.stopping) * 3 + n(s.uniqueness) * 2 + n(s.emotional) * 2 + n(s.luxury)) / 11;
    // kill-safe from the CALIBRATED numeric score only. The LLM's binary 'safe' flag
    // proved noisy (aya over-flagged ~90%, contradicting its own praise) — so the
    // numeric spread is the reliable courage signal. Kills the weak bottom, keeps a full set.
    const safe = total < 5.0;
    return { ...c, total: Math.round(total * 10) / 10, safe };
  }).sort((a, b) => b.total - a.total);
}

// FIX 2 — hero objects must be ENGLISH. Translate Hebrew/garbage via aya, else drop.
async function ensureEnglishObject(obj) {
  const o = (obj || '').trim();
  if (!o) return '';
  if (!HEBREW_RE.test(o)) return o.slice(0, 80);
  if (!useLocalLLM) return '';
  try {
    const t = await localChat([
      { role: 'system', content: 'Translate to a short concrete English noun phrase (a physical object). English only, max 6 words, no quotes, no Hebrew.' },
      { role: 'user', content: o },
    ], { temperature: 0.1, maxTokens: 40 }); // default model = aya
    const clean = (t || '').replace(/^["'`]+|["'`]+$/g, '').trim();
    if (clean && !HEBREW_RE.test(clean)) return clean.slice(0, 80);
  } catch { /* noop */ }
  return ''; // give up — expand still works without a hero
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

// ===== COPYWRITER / CREATIVE EDITOR (aya) — clean, premium Hebrew copy =====
// DictaLM's Hebrew prose is flowery & convoluted; aya writes sharper, more natural
// headlines. The IDEA/visual stays DictaLM's; only the words are aya's.
export async function writeCopy(concept, brand, strategy) {
  if (!isGeminiConfigured) return null;
  const sys = `אתה קופירייטר ועורך קריאייטיב בכיר בעברית, ברמת קמפיין פרימיום (אפל/יוקרה). כתוב קופי חד, טבעי ויוקרתי למודעה אחת — בלי מליצות, בלי משפטים מסורבלים, בלי דו-נקודתיים מאולצים.
- headline: עד 5 מילים, חד, זכיר וטבעי בעברית.
- subline: שורה אחת קצרה שתומכת בכותרת.
- cta: 2-4 מילים, קריאה לפעולה.
החזר JSON בלבד: {"headline":"","subline":"","cta":""}`;
  const ctx = `מותג: ${brand.business} | מיצוב: ${brand.positioning}\nמסר הקמפיין: ${strategy?.core_message || ''}\nרעיון המודעה: ${concept.core_idea || ''}\nמטאפורה ויזואלית: ${concept.visual_metaphor || ''}\nמנגנון: ${concept.mechanism || ''}`;
  try {
    const c = await chatJson(sys, ctx, { temperature: 0.7, maxTokens: 300 }); // default model = aya
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
  const attempt = async () => { try { return await chatJson(sys, ctx, { temperature: 0.85, maxTokens: 1500, model: CREATIVE_LLM_MODEL }); } catch { return null; } };
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
  // COPY LAYER → aya (Creative Editor). DictaLM's copy is ignored; aya writes it.
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
  // FIX 5 — run on aya (LOCAL_LLM_MODEL): DictaLM hallucinated / went off-topic.
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
//   → dedupe(memory+diversity) → unique-mechanism select → expand(+aya copy)
//   → [optional critique] → toEnglish prompts → freeCreativeModel.
// Behavior is identical to the (now-frozen) AdStudio inline flow — this only
// canonicalizes the sequence so an agent can call ONE function.
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
  if (!brand) throw new Error('חסר פרופיל עסק');

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
  if (!pool.length) throw new Error('כל הרעיונות נפסלו כבטוחים — נסה שוב או נסח אחרת.');

  // Stage — dedupe (memory + diversity) → unique-mechanism winners
  emit('select', { message: 'סינון גיוון · זיכרון קמפיינים…' });
  const ranked = dedupeConcepts(pool.sort((a, b) => b.total - a.total), simThreshold, memory);
  const seen = new Set();
  const diverse = ranked.filter((c) => (seen.has(c.mechanism) ? false : seen.add(c.mechanism)));
  const winners = (diverse.length >= target ? diverse : ranked).slice(0, target);
  if (!winners.length) throw new Error('לא נותרו קונספטים ייחודיים מספיק — נסה שוב.');

  // Stage — expand each winner (DictaLM concept + aya copy)
  const concepts = [];
  for (let i = 0; i < winners.length; i += 1) {
    emit('expand', { index: i, total: winners.length, mechanism: winners[i].mechanism, message: `מרחיב קונספט ${i + 1}/${winners.length} (${MECHANISM_HE[winners[i].mechanism] || winners[i].mechanism})…` });
    const full = await expandConcept(brand, strategy, winners[i], note); // eslint-disable-line no-await-in-loop
    if (full) concepts.push({ ...full, idea: winners[i].idea, total: winners[i].total });
  }
  if (!concepts.length) throw new Error('הרחבת הקונספטים נכשלה — נסה שוב.');
  memory.remember(concepts);

  // Stage — optional Creative Critic (OFF by default to match frozen v1 behavior)
  if (withCritique) {
    for (let i = 0; i < concepts.length; i += 1) {
      emit('critic', { index: i });
      concepts[i].critique = await creativeCritic(concepts[i], brand).catch(() => ({})); // eslint-disable-line no-await-in-loop
    }
  }

  // Stage — translate prompts to English (typography-aware), then free DictaLM
  emit('translate', { message: 'מתרגם פרומפטים ומכין רינדור…' });
  for (const c of concepts) {
    try { c.engPrompt = await toEnglishImagePrompt(c.image_prompt, { typography: c.useTypography, word: c.word }); } catch { /* keep raw */ } // eslint-disable-line no-await-in-loop
  }
  await freeCreativeModel();
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
    business: 'עסק לדוגמה', positioning: 'מצב הדגמה — הפעל Ollama לניתוח אמיתי', audience: 'לקוחות פרימיום מקומיים',
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

// ===== ENFORCE ENGLISH on the image prompt before it reaches ComfyUI =====
// aya is Hebrew-dominant and often returns the image_prompt in Hebrew, which
// FLUX cannot understand. A one-shot translation (verified to comply) + a
// deterministic "no text" suffix guarantees a clean English prompt.
const HEBREW_RE = /[֐-׿]/;
const TRANSLATE_SHOTS = [
  { role: 'user', content: 'תרגם לאנגלית: כלב חום רץ על חוף בשקיעה' },
  { role: 'assistant', content: 'a brown dog running on a beach at sunset' },
];
// Unload the creative model (DictaLM) from Ollama so FLUX has room on a 16GB GPU.
// Call this AFTER all text stages and BEFORE image rendering. No-op if AdStudio
// shares Jake's model (nothing extra to free).
export async function freeCreativeModel() {
  if (!useLocalLLM || CREATIVE_LLM_MODEL === LOCAL_LLM_MODEL) return;
  try {
    const base = LOCAL_LLM_URL.replace(/\/v1\/?$/, '');
    await fetch(`${base}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: CREATIVE_LLM_MODEL, keep_alive: 0 }),
    });
    await new Promise((r) => setTimeout(r, 1000));
  } catch { /* ignore */ }
}

export async function toEnglishImagePrompt(text, opts = {}) {
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
  const ensureNoText = finalize;
  if (!useLocalLLM || !HEBREW_RE.test(t)) {
    return ensureNoText(HEBREW_RE.test(t) ? t.replace(/[֐-׿"']+/g, ' ').replace(/\s+/g, ' ').trim() : t);
  }
  const sys = 'You are a Hebrew-to-English translator for image-generation prompts. Output MUST be English only. Never output any Hebrew character. Keep every visual detail, scene, composition and lighting; do not add or remove content.';
  const ask = async () => {
    const out = await localChat([{ role: 'system', content: sys }, ...TRANSLATE_SHOTS, { role: 'user', content: `תרגם לאנגלית: ${t}` }], { temperature: 0.1, maxTokens: 340 });
    return (out || '').replace(/^["'`]+|["'`]+$/g, '').trim();
  };
  try {
    let eng = await ask();
    if (HEBREW_RE.test(eng) || eng.length < 8) eng = await ask(); // one retry
    if (eng && !HEBREW_RE.test(eng)) t = eng;
  } catch { /* keep original */ }
  if (HEBREW_RE.test(t)) t = t.replace(/[֐-׿"']+/g, ' ').replace(/\s+/g, ' ').trim() || 'premium cinematic advertising scene, dramatic lighting';
  return ensureNoText(t);
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    psychProfile: { type: 'string' },
    personalityType: { type: 'string' },
    conversationStructure: {
      type: 'array',
      items: { type: 'object', properties: { step: { type: 'string' }, detail: { type: 'string' } }, required: ['step', 'detail'] },
    },
    objections: {
      type: 'array',
      items: { type: 'object', properties: { objection: { type: 'string' }, response: { type: 'string' } }, required: ['objection', 'response'] },
    },
    valueAngles: { type: 'array', items: { type: 'string' } },
    closingTip: { type: 'string' },
  },
  required: ['psychProfile', 'conversationStructure', 'objections', 'closingTip'],
};

const SYSTEM = `אתה יועץ מכירות בכיר ופסיכולוג עסקי שמתמחה בסטודיו דיגיטלי (Art Value) שמוכר אתרים, מערכות CRM, מיתוג וקמפיינים.
המטרה: לעזור לבעל הסטודיו לסגור עסקה. נתח את הלקוח לפי המידע, בנה אסטרטגיית שיחה, וצפה התנגדויות.
כתוב בעברית בלבד, בגוף פונה ("תגיד ללקוח...", "שווה להדגיש..."), חד, מעשי וקצר. בלי קלישאות.`;

function buildPrompt({ clientName, field, audience, offer }) {
  return `נתוני הלקוח וההצעה:
- שם / עסק הלקוח: ${clientName || 'לא צוין'}
- מקצוע / תחום: ${field || 'לא צוין'}
- קהל יעד מרכזי של הלקוח: ${audience || 'לא צוין'}
- ההצעה שלי (מה אני רוצה למכור לו): ${offer || 'לא צוין'}

החזר אבחון מלא: פרופיל פסיכולוגי של הלקוח, סוג האישיות, מבנה שיחת מכירה מומלץ (שלבים), התנגדויות צפויות עם מענה לכל אחת, זוויות ערך מרכזיות, וטיפ סגירה אחד חזק.`;
}

export async function diagnoseQuote(input) {
  if (!isGeminiConfigured) return demoResult(input);

  if (useLocalLLM) {
    const messages = [
      { role: 'system', content: `${SYSTEM}\n\nהחזר JSON תקין בלבד (ללא טקסט נוסף) במבנה: {"psychProfile":"","personalityType":"","conversationStructure":[{"step":"","detail":""}],"objections":[{"objection":"","response":""}],"valueAngles":[""],"closingTip":""}.` },
      { role: 'user', content: buildPrompt(input) },
    ];
    return parseJsonLoose(await localChat(messages, { json: true, temperature: 0.7, maxTokens: 2048 }));
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: buildPrompt(input) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.75,
      maxOutputTokens: 4096,
      // disable hidden "thinking" so the JSON output isn't truncated on flash models
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-goog-api-key': API_KEY }, body: JSON.stringify(body) });
  if (!res.ok) {
    let msg = `שגיאת Gemini (${res.status})`;
    try { const e = await res.json(); msg = e?.error?.message || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text).filter(Boolean).join('').trim();
  if (!text) throw new Error('לא התקבלה תשובה מ-Gemini (ייתכן שהבקשה נחסמה)');
  return JSON.parse(text);
}

// ===================================================================
// Conversational assistant (multi-turn chat, context-aware)
// history: [{ role:'user'|'assistant', text }]
// contextText: a compact snapshot of the CRM data
// ===================================================================
export async function chatWithLocalModel(history, contextText) {
  if (!isGeminiConfigured) return demoChat(history);

  const sys = `אתה ג׳יק — העוזר האישי של נתן, בעל הסטודיו הדיגיטלי Art Value (אתרים, CRM, מיתוג, קמפיינים).
אם שואלים מי אתה — אתה ג׳יק. אל תזכיר שאתה מבוסס על מודל חיצוני.
ענה בעברית בלבד, קצר, חברי ותכליתי. עזור עם לקוחות, לידים (מחקר לידים), פרויקטים, משימות, הצעות מחיר, מלאי ופיננסים.

חוק דיוק (קריטי): "נתוני המערכת" שלמטה הם מקור האמת היחיד והמעודכן. כשנשאלת על כמות / מספר / רשימה / סטטוס — שלוף את התשובה ישירות מהנתונים האלה ואל תנחש ואל תמציא. אם נשאלת "כמה לקוחות?" החזר את המספר המדויק שמופיע בנתונים. אם משהו לא קיים — אמור זאת בכנות.

${ACTIONS_GUIDE}

נתוני המערכת (זה מה שיש כרגע, עדכני לרגע זה):
${contextText}${NO_THINK}`;

  // Local model path (OpenAI-style messages).
  if (useLocalLLM) {
    const messages = [{ role: 'system', content: sys }, ...history.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }))];
    return localChat(messages, { temperature: 0.7, maxTokens: 1600 });
  }

  // Gemini requires contents to start with a 'user' turn.
  const firstUser = history.findIndex((m) => m.role === 'user');
  const trimmed = firstUser >= 0 ? history.slice(firstUser) : [];
  const contents = trimmed.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: sys }] },
    contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 1800, thinkingConfig: { thinkingBudget: 0 } },
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-goog-api-key': API_KEY }, body: JSON.stringify(body) });
  if (!res.ok) {
    let msg = `שגיאת Gemini (${res.status})`;
    try { const e = await res.json(); msg = e?.error?.message || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text).filter(Boolean).join('').trim();
  if (!text) throw new Error('לא התקבלה תשובה מ-Gemini');
  return text;
}

// ===================================================================
// forceActions — second pass: when ג'יק claimed an action in prose but emitted
// no executable block, ask the model for ONLY the actions JSON (low temp, tight
// instruction). Converts "talked but didn't do" into a real action.
// Returns raw model text (an ```actions block or []).
// ===================================================================
export async function forceActions(userText, contextText) {
  if (!isGeminiConfigured) return '';
  const sys = `אתה מנוע ביצוע פעולות עבור מערכת Art Value. תפקידך היחיד: להמיר את בקשת המשתמש לבלוק פעולות JSON.
${ACTIONS_GUIDE}

נתוני המערכת (השתמש בהם לזיהוי שמות/ערכים מדויקים):
${contextText}

החזר אך ורק בלוק \`\`\`actions עם מערך JSON שמבצע את בקשת המשתמש — בלי שום טקסט, הסבר או מילה אחרת לפניו או אחריו. אם הבקשה דורשת לפעול על כמה פריטים (למשל "כל הלקוחות עם שווי 0") — כלול פעולה לכל אחד מהם לפי הנתונים. אם אין פעולה מתאימה החזר: []${NO_THINK}`;
  const messages = [{ role: 'system', content: sys }, { role: 'user', content: userText }];
  // NOTE: engine/network errors are allowed to PROPAGATE (localChat throws a clear
  // Hebrew message) so the caller can distinguish "engine unreachable" from
  // "model returned but didn't comply". Do not swallow them here.
  if (useLocalLLM) return localChat(messages, { temperature: 0.1, maxTokens: 1400 });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const body = { systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts: [{ text: userText }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 1400, thinkingConfig: { thinkingBudget: 0 } } };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-goog-api-key': API_KEY }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`שגיאת מודל (${res.status})`);
  const j = await res.json();
  return (j?.candidates?.[0]?.content?.parts || []).map((p) => p.text).filter(Boolean).join('').trim();
}

// ===================================================================
// Lead research — generate fresh lead ideas for a niche/area.
// Returns [{ name, category, need }].
// ===================================================================
const LEAD_CATEGORIES = ['winery', 'food', 'art', 'beauty', 'hospitality', 'judaica', 'clinic', 'other'];
const LEAD_SCHEMA = {
  type: 'object',
  properties: {
    leads: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          category: { type: 'string', enum: LEAD_CATEGORIES },
          need: { type: 'string' },
        },
        required: ['name', 'category', 'need'],
      },
    },
  },
  required: ['leads'],
};

export async function generateLeadIdeas(niche, count = 6) {
  if (!isGeminiConfigured) return demoLeadIdeas(niche, count);
  const sys = `אתה אנליסט מכירות לסטודיו דיגיטלי (Art Value) שמוכר אתרים, מערכות CRM, מיתוג וקמפיינים.
המשימה: לייצר רעיונות ללידים — עסקים פוטנציאליים שכדאי לפנות אליהם. עברית בלבד, קונקרטי ומעשי.
לכל ליד: שם/סוג עסק ספציפי, קטגוריה מהרשימה, והצורך הדיגיטלי המרכזי שלו (מה הכי כדאי למכור לו).
קטגוריות: winery=יקבים, food=מסעדות/קפה, art=גלריות/אמנים, beauty=יופי, hospitality=אירוח, judaica=תכשיטים/יודאיקה, clinic=קליניקות, other=אחר.`;
  const prompt = `תחום / אזור / סוג קהל לחיפוש לידים: "${niche || 'עסקי בוטיק בישראל'}".
החזר ${count} רעיונות ללידים מגוונים ורלוונטיים.`;

  if (useLocalLLM) {
    const messages = [
      { role: 'system', content: `${sys}\n\nהחזר JSON בלבד: {"leads":[{"name":"","category":"","need":""}]}. category חייב להיות אחד מ: ${LEAD_CATEGORIES.join(', ')}.` },
      { role: 'user', content: prompt },
    ];
    const parsed = parseJsonLoose(await localChat(messages, { json: true, temperature: 0.9, maxTokens: 1600 }));
    return (parsed.leads || []).filter((l) => l.name);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: sys }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: LEAD_SCHEMA, temperature: 0.9, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-goog-api-key': API_KEY }, body: JSON.stringify(body) });
  if (!res.ok) {
    let msg = `שגיאת Gemini (${res.status})`;
    try { const e = await res.json(); msg = e?.error?.message || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text).filter(Boolean).join('').trim();
  if (!text) throw new Error('לא התקבלה תשובה מ-Gemini');
  const parsed = JSON.parse(text);
  return (parsed.leads || []).filter((l) => l.name);
}

// ===================================================================
// Prompt enhancer — turn a short Hebrew idea into a rich English
// image-generation "mega prompt". kind: 'generate' | 'edit' | 'inpaint'.
// Returns a single prompt string.
// ===================================================================
export async function enhanceImagePrompt(idea, kind = 'generate') {
  const text = (idea || '').trim();
  if (!text) throw new Error('כתוב קודם בעברית מה אתה רוצה');
  if (!isGeminiConfigured) return demoEnhance(text, kind);

  const FAITHFUL = `You expand a short image description into a fuller prompt for an AI image generator.

STAY 100% FAITHFUL — most important rule:
- Keep EVERY element the user wrote: same subject, same colors, same background, same composition, same style.
- Do NOT add objects, people, rooms, settings, moods or details the user did not mention.
- Do NOT change anything. If they wrote "white background" keep a plain white background (do NOT turn it into a room). If they wrote "gold" keep it gold (never black-and-white). Never alter a stated color, count, or object.
- You may ONLY add neutral technical detail that does not change the content: lighting quality, sharpness, and — for photos only — a camera/lens and realistic texture.

ADAPT TO THE SUBJECT TYPE:
- Photo of people / products / places: add natural lighting, a real camera + lens, photorealistic skin/material texture, subtle film grain.
- Logo / icon / illustration / 3D render / graphic / text design: do NOT add camera, film, photo, skin, pores or grain words — keep it a clean crisp design in the style the user asked.

OUTPUT: one comma-separated prompt, ENGLISH ONLY (translate any Hebrew to English). Return ONLY the prompt text — no quotes, no notes, no Hebrew.`;

  const sys = kind === 'inpaint'
    ? 'The user marked a region of a photo to replace. Output a CONCISE English description of ONLY what fills that region (object / background / garment) — exactly what the user asked, nothing added. One short comma-separated line. English only, return only the text.'
    : kind === 'edit'
      ? 'The user wants to edit an existing photo. Output ONE clear English editing instruction that changes ONLY what they asked and nothing else, ending with ", keep the person, colors and composition unchanged". Do not invent new elements. English only, return only the text.'
      : FAITHFUL;

  // Strip quotes/fences and force English if the model slipped into Hebrew.
  const clean = (s) => (s || '').replace(/^```[a-z]*|```$/gi, '').replace(/^["']|["']$/g, '').trim();
  const ensureEnglish = async (s) => {
    if (!/[֐-׿]/.test(s)) return s;
    const t = await localChat([{ role: 'system', content: 'Translate the text to English literally. Do NOT add, remove, expand or change anything — same meaning, same length, same details. Return ONLY the English translation.' }, { role: 'user', content: s }], { temperature: 0.1, maxTokens: 400 });
    return clean(t);
  };

  if (useLocalLLM) {
    let out = clean(await localChat([{ role: 'system', content: sys }, { role: 'user', content: text }], { temperature: 0.35, maxTokens: 400 }));
    out = await ensureEnglish(out);
    return out;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: sys }] },
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 600, thinkingConfig: { thinkingBudget: 0 } },
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-goog-api-key': API_KEY }, body: JSON.stringify(body) });
  if (!res.ok) {
    let msg = `שגיאת Gemini (${res.status})`;
    try { const e = await res.json(); msg = e?.error?.message || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const out = parts.map((p) => p.text).filter(Boolean).join('').trim().replace(/^["']|["']$/g, '');
  if (!out) throw new Error('לא התקבלה תשובה מ-Gemini');
  return out;
}

function demoEnhance(text, kind) {
  const base = kind === 'inpaint'
    ? `${text}, photorealistic, matching lighting and perspective, seamless blend, high detail`
    : `${text}, professional photography, cinematic lighting, highly detailed, sharp focus, balanced composition, premium color grading, 8k`;
  return new Promise((resolve) => setTimeout(() => resolve(base), 500));
}

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

// ---- demo fallback (no API key) ----
function demoChat(history) {
  const last = [...history].reverse().find((m) => m.role === 'user')?.text || '';
  return new Promise((resolve) =>
    setTimeout(() => resolve(
      `היי, אני ג׳יק 🙂 כרגע אני במצב הדגמה (ללא מפתח AI) אז אני מוגבל.\nשאלת: «${last.slice(0, 60)}»\nכדי שאוכל לעזור באמת — הוסיפו מפתח AI ב-.env ואדע לנתח לקוחות, לידים, משימות והכנסות בזמן אמת.`
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

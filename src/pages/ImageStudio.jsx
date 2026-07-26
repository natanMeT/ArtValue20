import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { SectionHeader } from '../components/ui/atoms.jsx';
import Icon from '../components/ui/Icon.jsx';
import MaskCanvas from '../components/ui/MaskCanvas.jsx';
// Prompt ENHANCEMENT (text) now routes through the protected server-owned AI
// Gateway — no browser Gemini key, no direct Google call. Image generation is
// unchanged and stays on geminiImage.js (local ComfyUI / cloud fallback) below.
import { callAiGateway } from '../lib/aiGatewayClient.js';
import {
  generateImage, generateImg2Img, editImage, inpaintImage, animateImage, ltxVideo, flfVideo, montageFromImages, downloadImage,
  isImageAiConfigured, hasLocalComfy, hasVideoModel, hasLtxVideo, hasKontextModel,
  localEngineUrl, characterPack, characterPackPulid, hasPulidModel,
  generateModelAlbum, onComfyJob, markNextComfyJob, hasQwenEdit, qwenCompose, productLockBlend,
  liveStudioCapabilities,
} from '../lib/geminiImage.js';
import { watchJob, cancelJob } from '../lib/comfyProgress.js';
import { createGalleryStore, srcToBlob, GALLERY_MAX, filterGalleryItems } from '../lib/galleryStore.js';
import { activeBrandPalette, withBrandPalette } from '../lib/brandPalette.js';
import { AI_GATEWAY_INPUT_LIMITS } from '../lib/aiGatewayInput.js';
import { CREATIVE_PRESETS, isTextImagePreset } from '../data/creativePresets.js';
import { availablePresets, resolveStudioExecution, STUDIO_EXECUTOR_IDS } from '../lib/presetAvailability.js';
import PosterEditor from '../components/studio/PosterEditor.jsx';
import MockupStudio from '../components/studio/MockupStudio.jsx';
import ProductPlacer from '../components/studio/ProductPlacer.jsx';
import { readStudioHandoff } from '../lib/studioHandoff.js';
import { isStudioModeAvailable, resolveStudioMode, studioSubfeature } from '../lib/studioModes.js';
import { userFacingError, userError } from '../lib/userFacingError.js';

// ---- prompt enhancement (routed through the protected AI Gateway) ----
// The enhancement INSTRUCTION (per mode: generate / edit / inpaint) is assembled
// locally and sent as ordinary user input via callAiGateway('studio.prompt_enhance',
// { prompt }). No API key is read and no Google endpoint is called from this path;
// the server owns provider/model/system/generation config and the budget guard.
// Instruction text is preserved verbatim from the previous behavior.
const ENHANCE_INSTRUCTIONS = Object.freeze({
  generate: `You expand a short image description into a fuller prompt for an AI image generator.

STAY 100% FAITHFUL — most important rule:
- Keep EVERY element the user wrote: same subject, same colors, same background, same composition, same style.
- Do NOT add objects, people, rooms, settings, moods or details the user did not mention.
- Do NOT change anything. If they wrote "white background" keep a plain white background (do NOT turn it into a room). If they wrote "gold" keep it gold (never black-and-white). Never alter a stated color, count, or object.
- You may ONLY add neutral technical detail that does not change the content: lighting quality, sharpness, and — for photos only — a camera/lens and realistic texture.

ADAPT TO THE SUBJECT TYPE:
- Photo of people / products / places: add natural lighting, a real camera + lens, photorealistic skin/material texture, subtle film grain.
- Logo / icon / illustration / 3D render / graphic / text design: do NOT add camera, film, photo, skin, pores or grain words — keep it a clean crisp design in the style the user asked.

OUTPUT: one comma-separated prompt, ENGLISH ONLY (translate any Hebrew to English). Return ONLY the prompt text — no quotes, no notes, no Hebrew.`,
  edit: 'The user wants to edit an existing photo. Output ONE clear English editing instruction that changes ONLY what they asked and nothing else, ending with ", keep the person, colors and composition unchanged". Do not invent new elements. English only, return only the text.',
  inpaint: 'The user marked a region of a photo to replace. Output a CONCISE English description of ONLY what fills that region (object / background / garment) — exactly what the user asked, nothing added. One short comma-separated line. English only, return only the text.',
});

function studioEnhanceInstruction(kind) {
  return ENHANCE_INSTRUCTIONS[kind] || ENHANCE_INSTRUCTIONS.generate;
}

// Assemble one plain-text prompt: server-safe (no provider/model/system fields).
function buildStudioEnhancePrompt(idea, kind) {
  return `${studioEnhanceInstruction(kind)}\n\nUSER REQUEST:\n${String(idea || '').trim()}`;
}

// Extract the enhanced prompt from a callAiGateway result, or '' on ANY failure
// (never throws; callAiGateway returns a normalized { ok, result, error } object).
function studioEnhanceText(res) {
  if (!res || res.ok !== true || !res.result || typeof res.result.text !== 'string') return '';
  return res.result.text.trim().replace(/^["']|["']$/g, '');
}

// Safe, generic Hebrew message per failure — never exposes server/provider detail.
function studioEnhanceError(res) {
  const code = res && res.error && res.error.code;
  if (code === 'unauthenticated') return 'צריך להתחבר כדי לשדרג פרומפט';
  if (code === 'rate_limited' || code === 'budget_exceeded' || code === 'budget_guard_unavailable') {
    return 'שירות השדרוג עמוס כרגע — נסה שוב עוד רגע';
  }
  return 'שגיאה בשדרוג הפרומפט';
}

// Truthful download filename by result type — the Gateway returns JPEG, local
// video is animated WebP, everything else (local image) is PNG. Never transcodes;
// it only names the download so the bytes and their extension agree.
function studioDownloadName(r) {
  if (r && r.isVideo) return 'artvalue-animation.webp';
  if (r && (r.engine === 'gateway' || r.mimeType === 'image/jpeg')) return 'artvalue-image.jpg';
  return 'artvalue-image.png';
}

const PRESET_TAB_LABEL = { text: 'טקסט → תמונה', img2img: 'עריכה חכמה', video: 'תמונה → וידאו' };

const EDIT_IDEAS = [
  'שנה את הרקע לחוף ים בשקיעה',
  'הפוך את הרקע ללבן נקי (סטודיו)',
  'שנה את צבע הבגד לאדום',
  'הוסף אווירה קולנועית ותאורה דרמטית',
];

// Product Presenter composition templates — Hebrew labels, English prompt text
// (Qwen responds better to English). Each embeds identity/skin/anatomy
// preservation cues to reduce the arm-skin / hand artifacts seen in live QA.
const PRESENTER_IDEAS = [
  { label: 'שעון על פרק היד', prompt: "Place the watch from the second image naturally on the presenter's wrist. Keep the presenter's face, pose, lighting and natural skin texture unchanged. Realistic hand and wrist anatomy, no extra hair, professional product photography." },
  { label: 'מוצר ביד', prompt: 'The presenter holds the product from the second image, presenting it to the camera. Keep identity, pose and lighting unchanged. Natural fingers and grip, clean studio look.' },
  { label: 'תכשיט על הצוואר', prompt: "Place the jewelry from the second image naturally on the presenter's neck. Preserve the presenter's face, skin texture and lighting. Elegant campaign photography." },
  { label: 'ויזואל קמפיין נקי', prompt: 'Create a clean marketing visual: the presenter featured with the product from the second image, premium studio lighting, natural skin, professional campaign composition.' },
];

const IDEA_POOL = [
  // לוגואים ומיתוג
  'לוגו מודרני מטאלי לעסק דיגיטלי, צבעי ליים וכסף, רקע כהה',
  'לוגו מינימליסטי לסטודיו עיצוב, קווים נקיים, זהב על שחור',
  'אות מונוגרמה יוקרתית בסגנון אופנה, רקע שיש',
  'לוגו תלת מימד זוהר למותג טכנולוגיה, ניאון כחול-סגול',
  // רקעים ו-Wallpapers
  'רקע אבסטרקטי גיאומטרי בגווני ירוק-ליים וכרבון לאתר',
  'רקע גלי משי כהה עם נצנוצי זהב, יוקרתי',
  'רקע הדרגתי כהה עם חלקיקי אור מרחפים, אווירה עתידנית',
  'טקסטורת בטון מודרנית עם תאורת ניאון, מינימליסטי',
  // תלת מימד
  'איור תלת מימד מינימליסטי של מסך אתר על שולחן מנהלים',
  'דמות תלת מימד חמודה בסגנון פיקסאר מציגה מוצר',
  'אייקון תלת מימד מבריק של עגלת קניות, צבעים פסטל',
  'רינדר תלת מימד של סמארטפון מרחף עם אפליקציה על המסך',
  // דוגמניות / דוגמנים (אנשים אמיתיים)
  'דוגמנית אופנה מקצועית בסטודיו, תאורה רכה, צילום עריכה',
  'דוגמן גבר בחליפה יוקרתית, רקע אורבני מטושטש, שעת זהב',
  'דוגמנית מציגה שרשרת יהלומים, תקריב פנים, תאורה דרמטית',
  'אישה צעירה משתמשת בלפטופ בבית קפה מודרני, לייפסטייל',
  'דוגמנית עם תיק יד מעצבים, רחוב פריזאי, צילום אופנה',
  // תכשיטים
  'טבעת יהלום יוקרתית על בד קטיפה שחור, מקרו, ניצוצות',
  'שרשרת זהב מעוצבת על רקע שיש לבן, צילום מוצר נקי',
  'עגילי יהלום נוצצים בתאורת סטודיו, רקע כהה ואלגנטי',
  'שעון יוקרה זהב על משטח עץ כהה, צילום פרסומי',
  // מוצרים לקידום
  'בקבוק בושם זכוכית יוקרתי עם טיפות מים, תאורה קולנועית',
  'צנצנת קרם פנים פרימיום מוקפת פרחים, צילום קוסמטיקה',
  'אוזניות אלחוטיות מרחפות עם הילת אור, רקע מינימליסטי',
  'בקבוק יין אדום משובח עם כוס, אווירת מסעדה כהה',
  'נעלי ספורט יוקרתיות מרחפות, רקע צבעוני אנרגטי',
  'מארז שוקולד פרימיום פתוח, תאורה חמה, צילום אוכל',
  // אוכל ומסעדות
  'המבורגר גורמה עסיסי בתקריב, אדים, תאורה דרמטית',
  'צלחת סושי יוקרתית, צילום אוכל מלמעלה, מינימליסטי',
  'כוס קפה לאטה עם אמנות קצף, בוקר באור רך',
  // אופנה ולייפסטייל
  'באנר פרסומי יוקרתי לסטודיו עיצוב, תאורה קולנועית',
  'תצוגת אופנה על מתלה, בגדים בגווני אדמה, בוטיק מודרני',
  'פלאלייי אופנה — נעליים, תיק ומשקפיים על רקע פסטל',
  // נדל"ן ועיצוב פנים
  'סלון מעוצב מודרני עם תאורה חמה, צילום אדריכלות',
  'בית יוקרה עם בריכת אינסוף בשקיעה, צילום נדל"ן',
  'מטבח מודרני נקי בגווני שחור-זהב, עיצוב פנים',
  // רכב
  'מכונית ספורט יוקרתית בכביש לילי עם פסי ניאון, קולנועי',
  'רכב חשמלי מודרני בסטודיו לבן, צילום פרסומי נקי',
  // סושיאל ובאנרים
  'פוסט אינסטגרם למבצע מכירות, צבעוני ואנרגטי, מקום לטקסט',
  'באנר השקת מוצר עם אפקט אור דרמטי, מודרני',
  'תמונת נושא לאתר עסקי, אווירה מקצועית ונקייה',
  // אווירה ואמנות
  'נוף הרים ערפילי בזריחה, צבעים רכים, רוגע',
  'דיוקן אמנותי עם תאורת ניאון כפולה, סגנון סייברפאנק',
  'פריחת דובדבן יפנית עם פגודה, אווירה שלווה',
];

const MODES = [
  { id: 'text', label: 'טקסט → תמונה', sub: 'תיאור הופך לתמונה', icon: 'wand' },
  { id: 'img2img', label: hasKontextModel ? 'עריכה חכמה' : 'תמונה → תמונה', sub: 'עריכה עם AI', icon: 'image' },
  { id: 'inpaint', label: 'עריכת אזור', sub: 'החלפת אזור מסומן', icon: 'wand' },
  { id: 'video', label: 'תמונה → וידאו', sub: 'הנפשה מתמונה', icon: 'spark' },
  { id: 'flf', label: 'לפני / אחרי', sub: 'מעבר בין 2 פריימים', icon: 'spark' },
  { id: 'presenter', label: 'פרזנטור מוצר', sub: 'פרזנטור + מוצר → ויזואל', icon: 'image' },
  { id: 'lock', label: 'מוצר מדויק', sub: 'Product Lock · קומפוזיט', icon: 'edit' },
  { id: 'character', label: 'ערכת דמות', sub: 'דמות עקבית · וריאציות', icon: 'image' },
  { id: 'album', label: 'אלבום דוגמנית', sub: '8 זוויות מתמונה + בגד', icon: 'image' },
];

// Quick clothing/style presets for the model album.
const ALBUM_STYLES = [
  'הלבשה תחתונה מינימליסטית · רצועות דקות',
  'בגד ים ביקיני חוטיני',
  'שמלת ערב אלגנטית',
  'לוק סטריט קז׳ואל מודרני',
];

// How many consistent variations to generate.
const PACK_COUNTS = [4, 6, 10];

// Aspect-ratio presets (SDXL-optimal dimensions).
const ASPECTS = [
  { id: 'square', label: 'ריבוע', sub: 'לוגו · מוצר · פוסט', w: 1024, h: 1024 },
  { id: 'portrait', label: 'פורטרט', sub: 'דוגמנית · אופנה · סטורי', w: 832, h: 1216 },
  { id: 'landscape', label: 'לרוחב', sub: 'באנר · רקע · כיסוי', w: 1216, h: 832 },
];

// Video length presets (frames must be 8n+1 at 25fps).
const VID_LENGTHS = [
  { sec: 4, frames: 97 },
  { sec: 6, frames: 153 },
  { sec: 8, frames: 201 },
];

// ===================================================================
// Studio local-engine UI containment
// -------------------------------------------------------------------
// The former <EngineStatus /> panel lived here: a local-GPU availability +
// setup screen ("מנוע התמונות כבוי" / "איך מפעילים" / the ComfyUI
// start_engine.bat path) driven by a 15-second checkLocalEngine() poll
// against the local engine. It was an implementation-operations surface, not
// a business capability, so it is removed together with its polling loop.
// The engine's *availability* still governs which creative modes are offered
// — but only through configuration-derived flags (hasLocalComfy / hasLtxVideo
// / hasKontextModel / hasPulidModel / hasQwenEdit), never through a request
// made because the user opened the Studio.
// ===================================================================

// Elapsed-time readout for the live job card. Owns its own 1s interval and
// derives elapsed from the seam timestamp (robust to background-tab throttling).
function JobElapsed({ at }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const sec = Math.max(0, Math.floor((Date.now() - at) / 1000));
  return <span className="dim job-elapsed"><bdi>{Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')}</bdi></span>;
}

// ===================================================================
// S0F.1 review corrections - two pure, exported helpers so the behavior can
// be proven with real deferred promises instead of source pinning.
// ===================================================================

// P1 - account-switch commit gate. A gallery read started for account A must
// never call setGallery after the active namespace has moved to B. Guarded on
// BOTH request generation and store identity, so it never relies on promise
// ordering: start() captures the generation at request time, and any later
// setActiveStore() (an account switch) invalidates every in-flight read.
export function createGalleryCommitGate() {
  let activeStore = null;
  let generation = 0;
  return {
    // Called when the active account/namespace changes.
    setActiveStore(store) { activeStore = store; generation += 1; },
    // Captured at request time -> () => boolean 'this result may still commit'.
    start(store) {
      const at = generation;
      return () => store === activeStore && at === generation;
    },
  };
}

// Release the object URLs of a gallery batch we are about to DISCARD (a stale
// result, or the outgoing account's list). Each list() mints fresh URLs, so a
// discarded batch never shares URLs with the batch currently rendered - this
// can not revoke a URL still owned by active state. Pure + injectable revoker.
export function disposeGalleryItems(items, revoke) {
  const fn = revoke || (typeof URL !== 'undefined' && URL.revokeObjectURL
    ? (u) => URL.revokeObjectURL(u) : null);
  if (!fn) return 0;
  let n = 0;
  for (const it of Array.isArray(items) ? items : []) {
    if (it && typeof it.url === 'string' && it.url) { try { fn(it.url); n += 1; } catch { /* ignore */ } }
  }
  return n;
}

// P2 - the hosted Gateway validates the TRIMMED prompt against
// MAX_IMAGE_PROMPT_CHARS and REJECTS over-limit input (it never truncates), so
// appending the brand-palette block can push a previously-valid prompt over the
// line. We measure the FINAL composed prompt exactly as it will be sent and
// block locally BEFORE any request. Returns null when it fits (or when the
// request is not Gateway-bound), else { length, limit }. Never truncates and
// never alters an approved HEX value.
export function gatewayImagePromptOverflow(composedPrompt, opts = {}) {
  if (!opts.gatewayLane) return null;
  const limit = typeof opts.limit === 'number' ? opts.limit : AI_GATEWAY_INPUT_LIMITS.MAX_IMAGE_PROMPT_CHARS;
  const length = String(composedPrompt == null ? '' : composedPrompt).trim().length;
  return length > limit ? { length, limit } : null;
}

// Truthful Hebrew error: says nothing was sent, and names the palette as the
// lever ONLY when palette guidance actually contributed to the length.
export function imagePromptTooLongMessage({ length, limit }, paletteApplied) {
  const head = `הפרומפט ארוך מדי — ${length} תווים מתוך ${limit} המותרים.`;
  const how = paletteApplied
    ? ' הנחיית פלטת המותג מתווספת לפרומפט; קצר/י את התיאור או כבה/י את הנחיית הפלטה ליצירה הזו.'
    : ' קצר/י את התיאור ונסה/י שוב.';
  return `${head}${how} לא נשלחה בקשה ליצירה.`;
}

// The model FAMILY an applied preset was authored for, as a pure exported
// decision so it can be executed against the real generation seam rather than
// pinned as source text. This is the PRESET's own business metadata — the user
// picks "ויזואל עסקי פרימיום", not a checkpoint — so the routing survives the
// removal of the technical picker without exposing any engine detail.
// Returns undefined for no preset, a non-text preset, or a non-FLUX family,
// which lets the engine apply its own default (identical to today's behavior).
export function presetModelFamily(preset) {
  if (!preset || !isTextImagePreset(preset)) return undefined;
  return preset.modelFamily === 'flux' ? 'flux' : undefined;
}

// Business-facing refusal when the declared provider cannot execute. The user is
// never shown which engine was expected, and no other engine is substituted.
export const EXECUTION_REFUSED = 'המתכון הזה דורש יכולת שאינה זמינה בהגדרה הנוכחית, ולכן לא הופעל.';

// May the result card offer "create animation"? The action was gated on
// `hasVideoModel` — the SVD flag alone — so an LTX-only rig had a working video
// executor and an open video mode, yet no way to animate a generated result.
// Visibility and execution now come from the SAME authority: the action is
// offered exactly when the video chain resolves to something, and whatever it
// resolves to is what runs. Exported so all four capability configurations can
// be executed directly rather than pinned as source text.
export const resolveResultAnimation = (caps) => resolveStudioExecution('video', null, caps);
export const canAnimateResult = (caps) => resolveResultAnimation(caps).ok;

// THE EXECUTION MAP: execution-path id -> the function that actually runs it.
// Exported so routing can be proven by FUNCTION IDENTITY rather than by reading
// the source — e.g. that a Qwen-declared recipe reaches `qwenCompose` itself.
// A test pins that every id `resolveStudioExecution` can return is mapped here,
// so a new path cannot be added without a home.
export const STUDIO_EXECUTOR_FN = Object.freeze({
  'text-image': generateImage,
  'kontext-edit': editImage,
  'sdxl-img2img': generateImg2Img,
  'qwen-compose': qwenCompose,
  inpaint: inpaintImage,
  'ltx-video': ltxVideo,
  'svd-animate': animateImage,
  'flf-video': flfVideo,
  'character-pulid': characterPackPulid,
  'character-kontext': characterPack,
  'model-album': generateModelAlbum,
  'lock-composite': productLockBlend,
});

export default function ImageStudio() {
  const { toast, data, session } = useStore();
  const location = useLocation();
  // S0F.1 (D6) — per-account gallery: rebuilt when the account changes, so a
  // switch reloads the correct namespace and never the previous account's.
  const galleryStore = useMemo(() => createGalleryStore(session), [session]);
  // S0F.1 (D5) — the account's approved brand palette (S0D). null when the
  // account configured none, or when the stored value is malformed.
  const palette = useMemo(() => activeBrandPalette(data?.businessProfile), [data?.businessProfile]);
  const [paletteOn, setPaletteOn] = useState(true); // ON by default; per-generation only, never persisted

  const handoffKeyRef = useRef(null);              // one-shot guard per location entry
  const [handoffNotice, setHandoffNotice] = useState(''); // small "prompt came from Jake" hint
  const [mode, setMode] = useState('text');
  const studioCapsRef = useRef(liveStudioCapabilities()); // configuration-derived; constant for the session
  const [prompt, setPrompt] = useState('');
  const [quality, setQuality] = useState('fast');
  const [presenterQuality, setPresenterQuality] = useState('fast'); // Product Presenter: 'fast' | 'quality'
  const [lockBusy, setLockBusy] = useState(false); // Product Lock composite export in progress
  const [lockBlendBusy, setLockBlendBusy] = useState(false); // B2 AI seam/shadow blend in progress
  const placerRef = useRef(null);                  // ProductPlacer imperative handle
  const [packCount, setPackCount] = useState(6);  // consistent-character pack size
  const [pack, setPack] = useState([]);            // streamed character variations
  const [packBusy, setPackBusy] = useState(false);
  const [clothing, setClothing] = useState(''); // model-album clothing/style prompt
  const [aspect, setAspect] = useState('square');
  const [hd, setHd] = useState(false);
  const [vidSec, setVidSec] = useState(4);
  const [strength, setStrength] = useState(0.6);
  const [brush, setBrush] = useState(48);
  const [enhancing, setEnhancing] = useState(false);
  const [ideaSeed, setIdeaSeed] = useState(0);
  const [ideaOffset, setIdeaOffset] = useState(0);
  const shuffledIdeas = useMemo(() => {
    const a = [...IDEA_POOL];
    for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }, [ideaSeed]);
  useEffect(() => {
    const iv = setInterval(() => setIdeaOffset((o) => o + 3), 6000);
    return () => clearInterval(iv);
  }, []);
  const visibleIdeas = Array.from({ length: 4 }, (_, i) => shuffledIdeas[(ideaOffset + i) % shuffledIdeas.length]);
  const shuffleIdeas = () => { setIdeaSeed((s) => s + 1); setIdeaOffset(0); };
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState('');
  const [endFile, setEndFile] = useState(null);       // "after" frame for before/after mode
  const [endPreview, setEndPreview] = useState('');
  const [srcDims, setSrcDims] = useState(null);        // {w,h} of source image → LTX base-res orientation
  const endRef = useRef(null);
  const maskRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [imgReady, setImgReady] = useState(false);
  const [imgAttempt, setImgAttempt] = useState(0);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const [gallery, setGallery] = useState([]);
  const [galleryTab, setGalleryTab] = useState('all'); // all | image | video
  const [selectedIds, setSelectedIds] = useState([]);
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [clips, setClips] = useState([]);          // batch-animated videos (one per image)
  const [clipBusy, setClipBusy] = useState(false);
  const [clipProg, setClipProg] = useState(0);
  const [posterSrc, setPosterSrc] = useState(null);
  const [mockupOpen, setMockupOpen] = useState(false);
  const [activePresetId, setActivePresetId] = useState(null);
  // Live job status (single run() jobs only — pack/batch flows keep their own counters).
  const [job, setJob] = useState(null); // {promptId, clientId, graph, at, phase, node, value, max, position}
  const watchStopRef = useRef(null);
  const runTokenRef = useRef(0);       // stale-run guard: bumping it makes an in-flight run's settle a no-op
  const cancelledRef = useRef(false);

  // Attach the progress watcher to run()-tagged submissions for the component's
  // lifetime. Untagged submissions (packs, Assistant poster, montage) are ignored.
  useEffect(() => {
    const off = onComfyJob((ev) => {
      if (ev.tag !== 'studio-run') return;
      if (watchStopRef.current) watchStopRef.current();
      setJob({ ...ev, phase: 'queued', value: 0, max: 0, position: 0 });
      // Containment: the job card used to display the executing engine NODE
      // (its ComfyUI class_type, e.g. "KSampler") next to the progress bar.
      // Progress/queue position/elapsed time stay — the engine's internal graph
      // node names do not.
      watchStopRef.current = watchJob(localEngineUrl, ev.clientId, ev.promptId, (u) => {
        setJob((j) => {
          if (!j || j.promptId !== ev.promptId) return j;
          if (u.kind === 'progress') return { ...j, phase: 'running', value: u.value, max: u.max };
          if (u.kind === 'running') return { ...j, phase: 'running' };
          if (u.kind === 'queued') return { ...j, phase: 'queued', position: u.position || 0 };
          if (u.kind === 'interrupted') return { ...j, phase: 'cancelled' };
          if (u.kind === 'error') return { ...j, phase: 'failed' };
          return { ...j, phase: 'done' };
        });
      });
    });
    return () => { off(); if (watchStopRef.current) watchStopRef.current(); };
  }, []);

  // Cancel the current run() job. Running → targeted /interrupt (the bridge's
  // history poll then rejects within ~1.5s and run() maps it to "cancelled").
  // Pending → queue delete: the job will NEVER reach /history, so stop waiting
  // immediately and mark the in-flight run stale.
  const cancelCurrentJob = async () => {
    const target = job;
    if (!target?.promptId || cancelledRef.current) return;
    cancelledRef.current = true;
    const r = await cancelJob(localEngineUrl, target.promptId);
    if (r === 'deleted') {
      runTokenRef.current += 1;
      if (watchStopRef.current) { watchStopRef.current(); watchStopRef.current = null; }
      setJob(null);
      setLoading(false);
      setLockBlendBusy(false);
      toast('היצירה בוטלה');
    } else if (r === 'error') {
      cancelledRef.current = false;
      toast('הביטול נכשל — המנוע לא הגיב', 'error');
    }
  };

  // Containment: mounting the Studio previously fired three local-engine
  // discovery requests — listImageModels() (/object_info/CheckpointLoaderSimple,
  // to populate a checkpoint picker), hasPulidNode() and hasQwenEditNode().
  // All three are gone: the picker was removed and these two capability flags
  // are now configuration-derived (see geminiImage.js). Opening the Studio
  // therefore issues NO local-engine request at all.
  // NOTE: these MUST stay above `modes` below — it reads them during render.
  const pulidReady = hasPulidModel;
  const qwenReady = hasQwenEdit;

  // The capability-filtered set is AUTHORITATIVE for every entry path, not
  // just for the tiles we draw. `studioModes.js` owns the requirements.
  const studioCaps = liveStudioCapabilities();
  const modes = MODES.filter((m) => isStudioModeAvailable(m.id, studioCaps));
  // A preset declares a whole contract — destination mode, local readiness, an
  // API requirement and a provider. Filtering on the destination mode alone let
  // an API-only recipe through (its tab existed) and applying it fed the
  // scaffold into an unrelated generator. `presetAvailability.js` evaluates the
  // COMPLETE declared contract and fails closed.
  const presets = availablePresets(CREATIVE_PRESETS, studioCaps);
  // ONE decision for the gated Product Lock enhancement: the control, its help
  // text and its note all come from this record. Nothing here re-states the
  // requirement, so the action and the guidance cannot diverge again.
  const lockBlend = studioSubfeature('product-lock-blend', studioCaps);
  // ONE resolution drives both the result-card action's VISIBILITY and its
  // execution, so the button cannot be offered without a path or hidden when
  // one exists.
  const resultAnimation = resolveResultAnimation(studioCaps);

  // S0F.1 (P1) - every async gallery read passes through the commit gate, so a
  // read started for the previous account can never land in the new account's
  // state, no matter how the promises interleave. A stale batch is disposed
  // (its object URLs revoked) instead of being rendered.
  const galleryRef = useRef([]);
  galleryRef.current = gallery;
  const gateRef = useRef(null);
  if (!gateRef.current) gateRef.current = createGalleryCommitGate();

  const refreshGallery = async () => {
    const store = galleryStore;
    const mayCommit = gateRef.current.start(store);
    let items;
    try { items = await store.list(); } catch { return; }
    if (!mayCommit()) { disposeGalleryItems(items); return; } // account switched mid-flight
    setGallery(items);
  };
  // S0F.1: re-read when the account (and therefore the gallery namespace)
  // changes, so a switch never leaves the previous account's list on screen.
  // Registering the new store also invalidates every in-flight read.
  useEffect(() => {
    gateRef.current.setActiveStore(galleryStore);
    disposeGalleryItems(galleryRef.current); // outgoing account's URLs
    setGallery([]);
    refreshGallery();
  }, [galleryStore]); // eslint-disable-line react-hooks/exhaustive-deps

  // Jake handoff prefill (Phase 2): consume a router-state payload ONCE per
  // location entry — prefill the prompt (and mode, if the workflow maps to a
  // live Studio mode). This ONLY sets state; it never generates. Generation
  // stays behind the existing CTA click. Invalid/absent handoff → no-op.
  useEffect(() => {
    if (handoffKeyRef.current === location.key) return; // already consumed this entry
    const prefill = readStudioHandoff(location.state);
    if (!prefill) return;
    handoffKeyRef.current = location.key;
    setPrompt(prefill.prompt);
    // A hand-off is an INDIRECT entry path: it must be validated against the
    // authoritative available-mode set, or it can select a hidden local-only
    // mode and render its panel in a hosted build (proven in the DOM).
    let contained = false;
    if (prefill.mode) {
      const resolved = resolveStudioMode(prefill.mode, studioCapsRef.current);
      contained = resolved.contained;
      setMode(resolved.mode); setResult(null); setError('');
    }
    setHandoffNotice(contained
      ? 'הפרומפט הגיע מג׳ייק. סוג היצירה שביקשת אינו זמין כאן, אז פתחנו יצירת תמונה — אפשר ליצור עם הפרומפט הזה.'
      : 'הפרומפט הגיע מג׳ייק — לחץ Generate כדי ליצור.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  // Safety net for ANY other indirect input (restored state, deep link, a
  // future transition): if `mode` is not in the authoritative set, snap back
  // to a valid business-facing state. useLayoutEffect => before paint, so the
  // unavailable panel is never rendered to the user even for one frame.
  useLayoutEffect(() => {
    if (!isStudioModeAvailable(mode, studioCapsRef.current)) {
      setMode(resolveStudioMode(mode, studioCapsRef.current).mode);
      setResult(null); setError('');
    }
  }, [mode]);

  const activePreset = presets.find((p) => p.id === activePresetId) || null;

  // Family of the applied preset (pure decision, exported + execution-tested).
  // The hosted Gateway ignores it entirely — its payload is prompt + aspectRatio.
  const presetArch = presetModelFamily(activePreset);

  // Apply a business preset into the existing Text-to-Image controls. Explicit
  // user click only — NEVER generates. Always fills the prompt scaffold; for
  // text-image presets it also selects a compatible aspect. (Containment: the
  // preset no longer steers a local checkpoint — that picker was removed.)
  // Never touches uploaded images, HD, strength, gallery.
  const applyPreset = (p) => {
    setActivePresetId(p.id);
    setPrompt(p.promptScaffold);
    if (isTextImagePreset(p)) {
      const asp = (p.aspectRatios || []).find((id) => ASPECTS.some((a) => a.id === id));
      if (asp) setAspect(asp);
    }
  };

  // Copy recipe guidance (negative prompt / params) — guarded, non-fatal, no network.
  const copyText = (text) => {
    try {
      if (navigator?.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => toast('הועתק'), () => {});
    } catch { /* clipboard unavailable — non-fatal */ }
  };

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFile(f);
    const url = URL.createObjectURL(f);
    setFilePreview(url);
    setError('');
    // Capture natural dimensions → so video uses the matching LTX base resolution.
    const img = new Image();
    img.onload = () => setSrcDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
  };

  // LTX base resolution that matches the source orientation (prevents squ/stretch).
  const ltxRes = () => {
    const portrait = srcDims && srcDims.h > srcDims.w;
    return portrait ? { width: 512, height: 768 } : { width: 768, height: 512 };
  };

  const pickEndFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (endPreview) URL.revokeObjectURL(endPreview);
    setEndFile(f);
    setEndPreview(URL.createObjectURL(f));
    setError('');
  };

  // Map a studio mode to a render-history source label (simple, best-effort).
  const SOURCE_BY_MODE = {
    text: 'text-to-image', img2img: 'smart-edit', inpaint: 'area-edit',
    video: 'image-to-video', flf: 'before-after', presenter: 'product-presenter',
  };

  // Build the small metadata bag saved alongside a gallery asset. kind comes
  // from the result's isVideo flag; meta strings are sanitized in galleryStore.
  const galleryMeta = (r, source) => ({
    kind: r?.isVideo ? 'video' : 'image',
    source: source || 'unknown',
    prompt: prompt.trim() || undefined,
    preset: activePreset?.titleHe || activePresetId || undefined,
    engine: r?.engine || 'local',
  });

  // S0F.1 (P2) — will THIS request be served by the hosted AI Gateway (and so be
  // subject to the server's image-prompt limit)? generateImage prefers a local
  // ComfyUI engine and only falls through to the Gateway when none is resolved;
  // text-to-image is the sole mode with a Gateway lane (every other mode is
  // ComfyUI-only). Local-engine behavior is therefore left exactly as it was.
  const usesGatewayImageLane = mode === 'text' && !localEngineUrl && isImageAiConfigured;

  const run = async () => {
    if (mode === 'text' && !prompt.trim()) { setError('יש להזין תיאור לתמונה'); return; }
    if (mode !== 'text' && !file) { setError(mode === 'flf' ? 'העלה תמונת "לפני"' : mode === 'presenter' ? 'העלה תמונת פרזנטור' : 'יש להעלות תמונה תחילה'); return; }
    if (mode === 'flf' && !endFile) { setError('העלה גם תמונת "אחרי"'); return; }
    if (mode === 'presenter' && !endFile) { setError('העלה גם תמונת מוצר'); return; }
    if (mode === 'presenter' && !prompt.trim()) { setError('כתוב הוראת שילוב — מה לעשות עם המוצר'); return; }
    if (mode === 'inpaint' && !maskRef.current?.hasMask()) { setError('סמן עם המברשת את האזור לעריכה'); return; }
    // S0F.1 (D5) - brand-palette guidance. The account's EXACT stored HEX values
    // are appended as a delimited block; with the toggle OFF, no configured
    // palette, or a malformed one, `p` is byte-identical to the user's prompt.
    // The Gateway payload shape and action type are unchanged - this is prompt
    // text only. `prompt` itself stays untouched (UI + gallery metadata).
    const p = withBrandPalette(prompt, data?.businessProfile, paletteOn);
    // S0F.1 (P2) - the hosted Gateway REJECTS an over-limit prompt (it never
    // truncates), so the palette block could push a previously-valid prompt over
    // the line and surface only a generic failure. Validate the FINAL composed
    // prompt here, before any request: zero Gateway calls, a specific truthful
    // error, the user's input preserved, and no approved HEX value altered.
    const overflow = gatewayImagePromptOverflow(p, { gatewayLane: usesGatewayImageLane });
    if (overflow) { setError(imagePromptTooLongMessage(overflow, p !== prompt)); return; }
    // Resolve the execution path BEFORE any engine work. A recipe that declared
    // a provider runs on that provider or not at all — it is never substituted.
    const exec = resolveStudioExecution(mode, activePreset, studioCaps);
    if (!exec.ok) { setError(EXECUTION_REFUSED); return; }
    const token = ++runTokenRef.current;
    cancelledRef.current = false;
    setJob(null);
    setLoading(true); setError(''); setResult(null); setImgReady(false); setImgAttempt(0);
    try {
      markNextComfyJob('studio-run'); // claim the next engine submission for the job card
      let r;
      if (mode === 'text') {
        const asp = ASPECTS.find((a) => a.id === aspect) || ASPECTS[0];
        // `aspect` (the preset id) is the ONLY field the hosted Gateway path reads —
        // it maps to an exact ratio server-side; local engines keep using width/height.
        // Containment: no checkpoint FILENAME is ever sent from the UI (that picker
        // is gone). But an applied business preset still carries the model family it
        // was authored for, so that routing is preserved — the user expresses a
        // business goal ("ויזואל עסקי פרימיום") and the family follows from the
        // preset, not from a technical control. No preset → engine default.
        r = await generateImage(p, { arch: presetArch, width: asp.w, height: asp.h, hd, aspect });
      }
      // EXECUTION AUTHORITY: the path is resolved from the active preset's
      // DECLARED PROVIDER (never falling back) or, with nothing promised, from
      // the mode's capability chain. It is no longer read off a raw flag, which
      // is how a Qwen-declared recipe could be run by Kontext/SDXL and an
      // LTX-declared one by SVD. `exec.ok === false` refuses the run above.
      else if (mode === 'img2img') {
        if (exec.executor === 'kontext-edit') r = await editImage(file, p);
        else if (exec.executor === 'sdxl-img2img') r = await generateImg2Img(file, p, { strength });
        else throw userError(EXECUTION_REFUSED);
      }
      else if (mode === 'presenter') {
        if (exec.executor !== 'qwen-compose') throw userError(EXECUTION_REFUSED);
        r = await qwenCompose(file, endFile, p, presenterQuality === 'quality' ? { lightning: false } : {}); r = { ...r, presenterQuality };
      }
      else if (mode === 'inpaint') {
        if (exec.executor !== 'inpaint') throw userError(EXECUTION_REFUSED);
        const mask = await maskRef.current.exportMask(); r = await inpaintImage(file, mask, p);
      }
      else if (mode === 'flf') {
        if (exec.executor !== 'flf-video') throw userError(EXECUTION_REFUSED);
        const len = (VID_LENGTHS.find((v) => v.sec === vidSec) || VID_LENGTHS[0]).frames; r = await flfVideo(file, endFile, p, { length: len, ...ltxRes() });
      }
      else {
        const len = (VID_LENGTHS.find((v) => v.sec === vidSec) || VID_LENGTHS[0]).frames;
        if (exec.executor === 'ltx-video') r = await ltxVideo(file, p, { length: len, ...ltxRes() });
        else if (exec.executor === 'svd-animate') r = await animateImage(file, {});
        else throw userError(EXECUTION_REFUSED);
      }
      if (token !== runTokenRef.current) return; // cancelled (pending-delete) — ignore the orphan
      setResult(r);
      if (r.demo) toast('נוצר דרך המחולל החינמי');
      // collect the output (image OR animated-WebP video) into the gallery
      if (r && r.src) {
        try { await galleryStore.add(await srcToBlob(r.src), galleryMeta(r, SOURCE_BY_MODE[mode] || 'unknown')); await refreshGallery(); } catch { /* noop */ }
      }
    } catch (e) {
      if (token !== runTokenRef.current) return; // stale run — already handled by cancel
      if (cancelledRef.current) toast('היצירה בוטלה');
      else setError(userFacingError(e, 'שגיאה ביצירת התוכן'));
    } finally {
      if (token === runTokenRef.current) {
        setLoading(false);
        setJob(null);
        if (watchStopRef.current) { watchStopRef.current(); watchStopRef.current = null; }
      }
    }
  };

  // Consistent-character pack: one reference → N identity-locked variations,
  // streamed into a grid and auto-saved to the gallery (→ ready for video).
  const buildCharacterPack = async () => {
    if (!file) { setError('העלה תמונת ייחוס של הדמות'); return; }
    setError(''); setPack([]); setPackBusy(true);
    try {
      const onResult = async (r) => {
        setPack((p) => [...p, r]);
        try { await galleryStore.add(await srcToBlob(r.src), galleryMeta(r, 'pack')); } catch { /* noop */ }
      };
      // Containment: no engine toggle any more — prefer the stronger
      // identity-lock path when it is configured, else the edit path.
      if (pulidReady) await characterPackPulid(file, packCount, onResult, { portrait: true });
      else await characterPack(file, packCount, onResult);
      await refreshGallery();
      toast('ערכת הדמות מוכנה ✓ — נשמרה לגלריה');
    } catch (e) {
      setError(userFacingError(e, 'שגיאה ביצירת ערכת הדמות'));
    } finally {
      setPackBusy(false);
    }
  };

  // Model album: one face + a clothing prompt → 8 identity-locked angles (PuLID,
  // natural skin). Streams into the grid + gallery — the sellable "album" product.
  const buildAlbum = async () => {
    if (!file) { setError('העלה תמונת דוגמנית (פנים)'); return; }
    setError(''); setPack([]); setPackBusy(true);
    try {
      const onResult = async (r) => {
        setPack((p) => [...p, r]);
        try { await galleryStore.add(await srcToBlob(r.src), galleryMeta(r, 'album')); } catch { /* noop */ }
      };
      await generateModelAlbum(file, clothing, onResult, { count: 8 });
      await refreshGallery();
      toast('האלבום מוכן ✓ (8 זוויות) — נשמר בגלריה');
    } catch (e) {
      setError(userFacingError(e, 'שגיאה ביצירת האלבום'));
    } finally {
      setPackBusy(false);
    }
  };

  const toggleSelect = (id) => setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  // Load a gallery image into edit mode → make a variation of the SAME subject (Kontext).
  const makeVariation = async (item) => {
    try {
      const blob = await galleryStore.get(item.id);
      if (!blob) return;
      const f = new File([blob], 'base.png', { type: blob.type || 'image/png' });
      if (filePreview) URL.revokeObjectURL(filePreview);
      setFile(f); setFilePreview(URL.createObjectURL(f));
      setMode('img2img'); setResult(null); setError('');
      setPrompt('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast('התמונה נטענה לעריכה — כתוב שינוי (זווית/תנוחה) לאותה דמות');
    } catch { toast('שגיאה בטעינת התמונה', 'error'); }
  };

  // Product Lock (B1): exact browser composite — the product pixels are pasted,
  // never regenerated. No ComfyUI call; the PNG goes straight to the gallery.
  const buildLockComposite = async () => {
    if (!file) { setError('העלה תמונת בסיס / פרזנטור'); return; }
    if (!endFile) { setError('העלה גם תמונת מוצר'); return; }
    if (!placerRef.current?.isReady()) { setError('סביבת המיקום עדיין נטענת — נסה שוב בעוד רגע'); return; }
    setLockBusy(true); setError('');
    try {
      const blob = await placerRef.current.exportComposite();
      if (!blob) throw new Error('יצירת הקומפוזיט נכשלה');
      await galleryStore.add(blob, { kind: 'image', source: 'product-lock', engine: 'composite' });
      await refreshGallery();
      toast('הקומפוזיט המדויק נשמר בגלריה ✓');
    } catch (e) {
      setError(userFacingError(e, 'שגיאה ביצירת הקומפוזיט'));
    } finally {
      setLockBusy(false);
    }
  };

  // Product Lock (B2): AI seam/shadow blend. The browser exports the exact
  // composite + a pixel-aligned seam-ring mask; SDXL inpaints ONLY the ring and
  // the graph pastes the original composite back everywhere else. Fixed prompt —
  // product protection comes from mask geometry + paste-back, never wording.
  const LOCK_BLEND_PROMPT = 'Natural soft contact shadow, seamless edge blending, matched ambient lighting, realistic product contact with the surface or skin, photorealistic integration. Preserve the product exactly.';
  const runLockBlend = async () => {
    // Defense in depth: the control is only rendered when available, but the
    // ACTION must not depend on that being true. A gated capability is refused
    // at its own seam, not only where it happens to be drawn.
    if (!lockBlend.available) { setError('הפעולה אינה זמינה בהגדרה הנוכחית'); return; }
    if (!file) { setError('העלה תמונת בסיס / פרזנטור'); return; }
    if (!endFile) { setError('העלה גם תמונת מוצר'); return; }
    if (!placerRef.current?.isReady()) { setError('סביבת המיקום עדיין נטענת — נסה שוב בעוד רגע'); return; }
    const token = ++runTokenRef.current;
    cancelledRef.current = false;
    setJob(null);
    setLockBlendBusy(true); setError('');
    try {
      const exported = await placerRef.current.exportForBlend();
      if (!exported) throw new Error('יצירת הקומפוזיט ומסכת החיבור נכשלה');
      markNextComfyJob('studio-run'); // reuse the live job card + cancel
      const r = await productLockBlend(exported.composite, exported.ringMask, LOCK_BLEND_PROMPT);
      if (token !== runTokenRef.current) return; // cancelled (pending-delete)
      if (r?.src) {
        try { await galleryStore.add(await srcToBlob(r.src), { kind: 'image', source: 'product-lock-blend', engine: 'comfyui' }); await refreshGallery(); } catch { /* noop */ }
      }
      toast('שיפור החיבור נשמר בגלריה ✓');
    } catch (e) {
      if (token !== runTokenRef.current) return; // stale run — already handled by cancel
      if (cancelledRef.current) toast('היצירה בוטלה');
      else setError(userFacingError(e, 'שגיאה בשיפור החיבור'));
    } finally {
      if (token === runTokenRef.current) {
        setLockBlendBusy(false);
        setJob(null);
        if (watchStopRef.current) { watchStopRef.current(); watchStopRef.current = null; }
      }
    }
  };

  // Presenter Consistency Bridge: load a gallery image (e.g. a Character Series /
  // Model Album result) straight into the Product Presenter presenter slot.
  // Image-kind items only. Never touches the product slot or the prompt.
  const useGalleryAsPresenter = async (item) => {
    try {
      const blob = await galleryStore.get(item.id);
      if (!blob) return;
      const f = new File([blob], 'presenter.png', { type: blob.type || 'image/png' });
      if (filePreview) URL.revokeObjectURL(filePreview);
      setFile(f); setFilePreview(URL.createObjectURL(f));
      setMode('presenter'); setResult(null); setError('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast('התמונה נטענה כפרזנטור — העלה תמונת מוצר וכתוב הוראת שילוב');
    } catch { toast('שגיאה בטעינת התמונה', 'error'); }
  };

  const removeGalleryItem = async (id) => {
    await galleryStore.remove(id);
    setSelectedIds((s) => s.filter((x) => x !== id));
    refreshGallery();
  };

  // Assemble the selected gallery images into a montage video.
  const buildMontage = async () => {
    if (selectedIds.length < 1) { toast('בחר תמונות לסרטון', 'error'); return; }
    setGalleryBusy(true); setMode('video'); setError(''); setResult(null); setLoading(true); setImgReady(false);
    try {
      const ordered = gallery.filter((g) => selectedIds.includes(g.id));
      const blobs = [];
      for (const g of ordered) { const b = await galleryStore.get(g.id); if (b) blobs.push(b); } // eslint-disable-line no-await-in-loop
      const r = await montageFromImages(blobs, {});
      setResult(r);
      if (r?.src) { try { await galleryStore.add(await srcToBlob(r.src), galleryMeta(r, 'montage')); await refreshGallery(); } catch { /* noop */ } }
      toast('הסרטון הורכב!');
    } catch (e) {
      setError(userFacingError(e, 'שגיאה בהרכבת הסרטון'));
    } finally {
      setGalleryBusy(false); setLoading(false);
    }
  };

  // Read an image blob's natural dimensions (→ pick the matching LTX base resolution).
  const blobDims = (blob) => new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    img.src = url;
  });

  // Batch-animate: turn EACH selected image (e.g. a whole character pack) into its
  // own short video — one click, consistent set. Streams results in as they finish.
  const batchAnimate = async () => {
    if (selectedIds.length < 1) { toast('בחר תמונות להפוך לסרטונים', 'error'); return; }
    setClipBusy(true); setClips([]); setClipProg(0); setError('');
    const len = (VID_LENGTHS.find((v) => v.sec === vidSec) || VID_LENGTHS[0]).frames;
    try {
      const ordered = gallery.filter((g) => selectedIds.includes(g.id));
      for (let i = 0; i < ordered.length; i += 1) {
        const b = await galleryStore.get(ordered[i].id); // eslint-disable-line no-await-in-loop
        if (!b) continue;
        const f = new File([b], 'frame.png', { type: b.type || 'image/png' });
        const d = await blobDims(b); // eslint-disable-line no-await-in-loop
        const portrait = d && d.h > d.w;
        const res = portrait ? { width: 512, height: 768 } : { width: 768, height: 512 };
        const r = await ltxVideo(f, prompt, { length: len, ...res }); // eslint-disable-line no-await-in-loop
        setClips((c) => [...c, r]);
        setClipProg(i + 1);
        try { await galleryStore.add(await srcToBlob(r.src), galleryMeta(r, 'batch-animate')); } catch { /* noop */ } // eslint-disable-line no-await-in-loop
      }
      await refreshGallery();
      toast('כל הסרטונים מוכנים ✓');
    } catch (e) {
      setError(userFacingError(e, 'שגיאה ביצירת הסרטונים'));
    } finally {
      setClipBusy(false);
    }
  };

  const enhance = async () => {
    if (!prompt.trim()) { setError('כתוב קודם בעברית מה אתה רוצה'); return; }
    setEnhancing(true); setError('');
    try {
      const kind = mode === 'inpaint' ? 'inpaint' : mode === 'img2img' ? 'edit' : 'generate';
      // Sole remote transport for this operation: the protected AI Gateway.
      // No provider/model/key here; no fallback to the legacy browser Gemini path.
      const res = await callAiGateway('studio.prompt_enhance', { prompt: buildStudioEnhancePrompt(prompt, kind) });
      const better = studioEnhanceText(res);
      if (better) {
        setPrompt(better);           // replaces the same prompt field as before
      } else {
        setError(studioEnhanceError(res)); // preserve the user's prompt; safe message
      }
    } catch {
      // callAiGateway is designed not to throw; this only guards unexpected errors.
      setError('שגיאה בשדרוג הפרומפט');
    } finally {
      setEnhancing(false);
    }
  };

  // Take the current result image and send it straight to local animation (SVD).
  const animateResult = async () => {
    if (!result?.src || result.isVideo) return;
    setError('');
    try {
      const blob = await (await fetch(result.src)).blob();
      const f = new File([blob], 'frame.png', { type: blob.type || 'image/png' });
      if (filePreview) URL.revokeObjectURL(filePreview);
      setFile(f);
      setFilePreview(URL.createObjectURL(f));
      setMode('video');
      setLoading(true); setResult(null); setImgReady(false); setImgAttempt(0);
      const len = (VID_LENGTHS.find((v) => v.sec === vidSec) || VID_LENGTHS[0]).frames;
      // match the result image's orientation to the LTX base resolution
      const portrait = (ASPECTS.find((a) => a.id === aspect) || ASPECTS[0]).h > (ASPECTS.find((a) => a.id === aspect) || ASPECTS[0]).w;
      const res = portrait ? { width: 512, height: 768 } : { width: 768, height: 512 };
      // Second execution seam — the SAME resolution that decided whether this
      // action was offered at all, so visibility and execution cannot disagree.
      const vx = resultAnimation;
      let r;
      if (vx.executor === 'ltx-video') r = await ltxVideo(f, prompt, { length: len, ...res });
      else if (vx.executor === 'svd-animate') r = await animateImage(f, {});
      else throw userError(EXECUTION_REFUSED);
      setResult(r);
    } catch (e) {
      setError(userFacingError(e, 'שגיאה ביצירת האנימציה'));
    } finally {
      setLoading(false);
    }
  };

  const needsImage = mode !== 'text';
  const isVideoMode = mode === 'video' || mode === 'flf';
  const isAlbum = mode === 'album';
  const isCharacter = mode === 'character';
  const isLock = mode === 'lock';
  const isPack = isCharacter || isAlbum; // both stream into the pack grid
  const ctaLabel = isAlbum ? 'צור אלבום 8 זוויות' : isCharacter ? 'צור ערכת דמות' : isLock ? 'צור קומפוזיט מדויק' : mode === 'presenter' ? 'צור ויזואל מוצר' : mode === 'flf' ? 'צור סרטון לפני/אחרי' : mode === 'video' ? 'צור אנימציה' : mode === 'inpaint' ? 'ערוך אזור מסומן' : mode === 'img2img' ? (hasKontextModel ? 'ערוך תמונה' : 'שנה תמונה') : 'צור תמונה עם AI';
  const loadingLabel = isAlbum ? `יוצר אלבום… (${pack.length}/8)` : isCharacter ? `יוצר דמות… (${pack.length}/${packCount})` : isLock ? 'יוצר קומפוזיט…' : isVideoMode ? 'יוצר סרטון… (עד 2-3 דק׳)' : 'מחולל…';
  const ctaBusy = isPack ? packBusy : isLock ? lockBusy : loading;
  const onCta = isAlbum ? buildAlbum : isCharacter ? buildCharacterPack : isLock ? buildLockComposite : run;

  return (
    <div className="studio-hf">
      <SectionHeader
        title={<span className="row gap-2" style={{ display: 'inline-flex', alignItems: 'center' }}><Icon name="wand" size={22} style={{ color: 'var(--lime-deep)' }} /> סטודיו תמונות AI</span>}
        sub="צור תמונות לעסק, ערוך תמונות קיימות, והפוך תמונות לסרטון קצר."
        action={(
          <div className="row gap-2 wrap">
            <button className="btn btn-ghost btn-sm" onClick={() => setMockupOpen(true)}><Icon name="image" size={15} style={{ color: 'var(--lime-deep)' }} /> סטודיו מוקאפים</button>
            {!isImageAiConfigured && <span className="badge badge-neutral"><Icon name="spark" size={12} /> מצב הדגמה</span>}
          </div>
        )}
      />

      {/* Containment: the "מפת ה־Workflows" catalog was removed from the Studio.
          It presented the creative tools as engine-badged workflows (ComfyUI /
          Fooocus / Mixed) — a workflow-management surface. The mode tiles below
          are the single business-facing way to choose what to create. The
          underlying catalog DATA stays (creativeWorkflows.js) because Jake's
          decision engine, the business brain and the Studio hand-off read it. */}

      {/* Mode tiles (Higgsfield-style) */}
      <div className="hf-modes">
        {modes.map((m) => (
          <button
            key={m.id}
            className={`hf-mode ${mode === m.id ? 'active' : ''}`}
            onClick={() => { setMode(m.id); setResult(null); setError(''); }}
          >
            <span className="hf-mode-ico"><Icon name={m.icon} size={19} /></span>
            <span className="hf-mode-text">
              <span className="hf-mode-label">{m.label}</span>
              <span className="hf-mode-sub">{m.sub}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="diagnose-grid">
        {/* Controls */}
        <div className="card panel">
          <div className="panel-title row gap-2" style={{ marginBottom: 16 }}><Icon name="wand" size={18} style={{ color: 'var(--lime-deep)' }} /> {mode === 'video' ? 'הגדרות אנימציה' : 'הנחיית עיצוב'}</div>

          {/* Dual uploader — flf frames, presenter+product, or lock base+product */}
          {(mode === 'flf' || mode === 'presenter' || mode === 'lock') && (
            <div className="field">
              <label>{mode === 'lock' ? 'תמונת בסיס / פרזנטור + תמונת מוצר' : mode === 'presenter' ? 'תמונת פרזנטור + תמונת מוצר' : 'שתי תמונות — המעבר ביניהן יהפוך לסרטון'}</label>
              <div className="flf-slots">
                <div className="flf-slot">
                  <span className="flf-slot-tag">{mode === 'lock' ? 'בסיס' : mode === 'presenter' ? 'פרזנטור' : 'לפני'}</span>
                  <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} style={{ display: 'none' }} />
                  <button type="button" className="upload-zone flf-zone" onClick={() => fileRef.current?.click()}>
                    {filePreview ? <img src={filePreview} alt={mode === 'lock' ? 'בסיס' : mode === 'presenter' ? 'פרזנטור' : 'לפני'} className="upload-preview" /> : (
                      <div className="upload-placeholder"><Icon name="image" size={22} /><span>{mode === 'lock' ? 'תמונת בסיס' : mode === 'presenter' ? 'תמונת פרזנטור' : 'תמונת התחלה'}</span></div>
                    )}
                  </button>
                </div>
                <div className="flf-arrow"><Icon name="chevronL" size={20} style={{ color: 'var(--lime-deep)' }} /></div>
                <div className="flf-slot">
                  <span className="flf-slot-tag">{(mode === 'presenter' || mode === 'lock') ? 'מוצר' : 'אחרי'}</span>
                  <input ref={endRef} type="file" accept="image/*" onChange={pickEndFile} style={{ display: 'none' }} />
                  <button type="button" className="upload-zone flf-zone" onClick={() => endRef.current?.click()}>
                    {endPreview ? <img src={endPreview} alt={(mode === 'presenter' || mode === 'lock') ? 'מוצר' : 'אחרי'} className="upload-preview" /> : (
                      <div className="upload-placeholder"><Icon name="image" size={22} /><span>{mode === 'lock' ? 'תמונת מוצר (PNG שקוף מומלץ)' : mode === 'presenter' ? 'תמונת מוצר' : 'תמונת סיום'}</span></div>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Image uploader (single-image modes) */}
          {needsImage && mode !== 'flf' && mode !== 'presenter' && mode !== 'lock' && (
            <div className="field">
              <label>{mode === 'inpaint' ? 'סמן עם המברשת את האזור לעריכה' : mode === 'character' ? 'תמונת הדמות (ייחוס)' : mode === 'album' ? 'תמונת הדוגמנית (פנים)' : 'תמונת מקור'}</label>
              <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} style={{ display: 'none' }} />
              {mode === 'inpaint' && filePreview ? (
                <>
                  <MaskCanvas ref={maskRef} imageUrl={filePreview} brush={brush} />
                  <div className="row gap-2 wrap" style={{ marginTop: 10, alignItems: 'center' }}>
                    <span className="dim" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>מברשת</span>
                    <input type="range" min="16" max="120" step="4" value={brush} onChange={(e) => setBrush(parseInt(e.target.value, 10))} style={{ flex: 1, minWidth: 90, accentColor: 'var(--lime-deep)' }} />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => maskRef.current?.clear()}><Icon name="refresh" size={14} /> נקה</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}><Icon name="image" size={14} /> החלף</button>
                  </div>
                </>
              ) : (
                <button type="button" className="upload-zone" onClick={() => fileRef.current?.click()}>
                  {filePreview ? (
                    <img src={filePreview} alt="מקור" className="upload-preview" />
                  ) : (
                    <div className="upload-placeholder">
                      <Icon name="image" size={26} />
                      <span>לחץ להעלאת תמונה</span>
                      <span className="dim" style={{ fontSize: '0.78rem' }}>PNG · JPG · WEBP</span>
                    </div>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Business preset recipes (Text-to-Image only) — fills the prompt/aspect/model
              below on click; never generates. */}
          {mode === 'text' && (
            <div className="field" style={{ marginBottom: 4 }}>
              <label>מתכוני עסק · פריסטים</label>
              <div className="row gap-2 wrap" style={{ display: 'flex' }}>
                {presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`idea-chip ${activePresetId === p.id ? 'idea-chip-active' : ''}`}
                    style={{ width: 'auto', flex: '0 1 auto', fontSize: '0.78rem', padding: '6px 10px', lineHeight: 1.3 }}
                    onClick={() => applyPreset(p)}
                    title={p.useCase}
                  >
                    {p.titleHe}{!p.localReady && <span className="dim" style={{ fontSize: '0.66rem' }}> · עתידי</span>}
                  </button>
                ))}
              </div>
              {activePreset && (
                <div className="card" style={{ marginTop: 10, padding: 12, fontSize: '0.8rem', lineHeight: 1.7 }}>
                  <div className="row between wrap" style={{ gap: 8, alignItems: 'center' }}>
                    <b>{activePreset.title}</b>
                    {/* Containment: the badge used to name the engine/checkpoint
                        behind the preset ("FLUX מקומי" / "SDXL מקומי" / …), and a
                        line below printed the recommended checkpoint FILENAME.
                        Both are gone — a preset is now described by what it is
                        for, and readiness is stated in plain business terms. */}
                    <span className={`badge ${activePreset.localReady ? 'badge-active' : 'badge-neutral'}`}>
                      <span className="dot" /> {activePreset.localReady ? 'זמין' : 'בקרוב'}
                    </span>
                  </div>
                  <p className="dim" style={{ margin: '4px 0' }}>{activePreset.useCase}</p>
                  {activePreset.targetTab !== 'text' && (
                    <div className="muted" style={{ marginTop: 2 }}>↳ הרץ בלשונית: <b>{PRESET_TAB_LABEL[activePreset.targetTab] || activePreset.targetTab}</b></div>
                  )}
                  {activePreset.negativePrompt && (
                    <div className="row between wrap" style={{ gap: 8, marginTop: 4, alignItems: 'center' }}>
                      <span>Negative: <span className="dim">{activePreset.negativePrompt}</span></span>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyText(activePreset.negativePrompt)}><Icon name="copy" size={12} /> העתק</button>
                    </div>
                  )}
                  <p className="muted" style={{ marginTop: 4 }}><Icon name="spark" size={12} style={{ color: 'var(--lime-deep)' }} /> {activePreset.pitfalls}</p>
                </div>
              )}
            </div>
          )}

          {/* Prompt (text + img2img + inpaint + LTX video motion) */}
          {mode !== 'character' && mode !== 'album' && mode !== 'lock' && (mode !== 'video' || hasLtxVideo) && (
            <div className="field" style={needsImage ? { marginTop: 14 } : undefined}>
              <label>{mode === 'presenter' ? 'הוראת שילוב (מה לעשות עם המוצר?)' : mode === 'flf' ? 'תיאור המעבר (אופציונלי)' : mode === 'video' ? 'תיאור התנועה (אופציונלי)' : mode === 'inpaint' ? 'מה למלא באזור המסומן?' : mode === 'img2img' ? (hasKontextModel ? 'מה לשנות? (הוראת עריכה)' : 'תיאור היעד (סגנון מחדש)') : 'תיאור התמונה (עברית או אנגלית)'}</label>
              <textarea className="textarea" style={{ minHeight: needsImage ? 80 : 130 }} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={mode === 'presenter' ? 'למשל: הפרזנטורית מחזיקה את הבקבוק ביד ומציגה אותו למצלמה, תאורת סטודיו נקייה' : mode === 'flf' ? 'למשל: מעבר חלק, השיער גדל, הרקע משתנה לאט' : mode === 'video' ? 'למשל: המצלמה מתקרבת, השיער מתנופף ברוח, חיוך עדין' : mode === 'inpaint' ? 'כתוב בעברית פשוטה — למשל: רקע חוף ים טרופי' : mode === 'img2img' ? (hasKontextModel ? 'כתוב בעברית פשוטה — למשל: שנה את הרקע לחוף בשקיעה' : 'כתוב בעברית פשוטה — למשל: סגנון ציור שמן') : 'כתוב בעברית פשוטה — למשל: לוגו מודרני לעסק דיגיטלי'} />
              <button type="button" className="btn btn-ghost btn-sm enhance-btn" onClick={enhance} disabled={enhancing} style={{ marginTop: 8 }}>
                {enhancing ? <><span className="loader-ring" style={{ width: 14, height: 14, borderWidth: 2 }} /> משדרג…</> : <><Icon name="spark" size={14} style={{ color: 'var(--lime-deep)' }} /> שדרג לפרומפט מקצועי (עברית → AI)</>}
              </button>
            </div>
          )}

          {/* S0F.1 (D5) — brand palette. Shown ONLY when the signed-in account has a
              validated palette in its Business Context; nothing is displayed and
              nothing is injected otherwise (no invented colors). The toggle is
              per-generation UI state only — it never writes to business_profile,
              and it never changes the application theme. */}
          {palette && (
            <div className="field" style={{ marginTop: 12 }} data-testid="brand-palette-row">
              <label><Icon name="target" size={13} /> פלטת המותג שלך</label>
              <div className="row gap-2" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                {palette.map((c) => (
                  <span key={c.role} className="row gap-2" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} title={c.role}>
                    <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: 4, background: c.value, border: '1px solid rgba(255,255,255,0.25)', display: 'inline-block' }} />
                    <bdi className="dim" style={{ fontSize: '0.76rem' }}>{c.value}</bdi>
                  </span>
                ))}
                <div className="grow" />
                <button
                  type="button"
                  className={`btn btn-sm ${paletteOn ? 'btn-toggle-on' : 'btn-outline'}`}
                  onClick={() => setPaletteOn((v) => !v)}
                  aria-pressed={paletteOn}
                >
                  <Icon name={paletteOn ? 'check' : 'x'} size={14} /> {paletteOn ? 'הפלטה פעילה ביצירה' : 'הפלטה כבויה ליצירה'}
                </button>
              </div>
              <p className="muted" style={{ fontSize: '0.76rem', marginTop: 6 }}>
                {paletteOn
                  ? 'הצבעים המדויקים שאישרת יישלחו כהנחיה ליצירה. אפשר לכבות ליצירה הנוכחית — ההגדרות לא משתנות.'
                  : 'הפלטה לא תישלח ביצירה הנוכחית. ההגדרות שלך לא השתנו.'}
              </p>
            </div>
          )}

          {/* Video length selector (LTX) */}
          {isVideoMode && hasLtxVideo && (
            <div className="field" style={{ marginTop: 12 }}>
              <label>אורך הסרטון</label>
              <div className="row gap-2" style={{ display: 'flex' }}>
                {VID_LENGTHS.map((v) => (
                  <button key={v.sec} type="button" className={`idea-chip ${vidSec === v.sec ? 'idea-chip-active' : ''}`} style={{ flex: 1, textAlign: 'center' }} onClick={() => setVidSec(v.sec)}>{v.sec} שניות</button>
                ))}
              </div>
              <p className="muted" style={{ fontSize: '0.76rem', marginTop: 6 }}>סרטונים ארוכים יותר אורכים יותר זמן ליצירה.</p>
            </div>
          )}

          {/* Edit examples (Kontext) */}
          {mode === 'img2img' && hasKontextModel && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 4 }}>
              {EDIT_IDEAS.map((idea, i) => (
                <button key={i} type="button" className="idea-chip" style={{ width: 'auto', flex: '0 1 auto', fontSize: '0.78rem', padding: '6px 10px' }} onClick={() => setPrompt(idea)}>{idea}</button>
              ))}
            </div>
          )}

          {/* Strength slider (img2img — SDXL fallback only; Kontext doesn't use it) */}
          {mode === 'img2img' && !hasKontextModel && (
            <div className="field" style={{ marginTop: 6 }}>
              <label>עוצמת השינוי · {Math.round(strength * 100)}%</label>
              <input type="range" min="0.2" max="0.95" step="0.05" value={strength} onChange={(e) => setStrength(parseFloat(e.target.value))} style={{ width: '100%', accentColor: 'var(--lime-deep)' }} />
              <div className="row between dim" style={{ fontSize: '0.74rem', marginTop: 2 }}><span>עדין (נאמן למקור)</span><span>שינוי חזק</span></div>
            </div>
          )}

          {/* Aspect-ratio selector (text mode) */}
          {mode === 'text' && (
            <div className="field" style={{ marginTop: 14 }}>
              <label>יחס תמונה</label>
              <div className="row gap-2 wrap" style={{ display: 'flex' }}>
                {ASPECTS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={`idea-chip ${aspect === a.id ? 'idea-chip-active' : ''}`}
                    style={{ flex: 1, textAlign: 'center', minWidth: 90, lineHeight: 1.3 }}
                    onClick={() => setAspect(a.id)}
                    title={a.sub}
                  >
                    {a.id === 'portrait' ? '▯' : a.id === 'landscape' ? '▭' : '◻'} {a.label}
                    <span className="dim" style={{ display: 'block', fontSize: '0.68rem' }}>{a.sub}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Containment: the checkpoint picker ("מודל (N מקומיים)" — FLUX/SDXL
              chips whose tooltips were .safetensors filenames) was removed. It
              was technical model selection with no business meaning, and it was
              populated by a local-engine request fired on mount. */}

          {/* HD (hires) toggle — only meaningful on the local hires pass. It was
              previously rendered whenever no FLUX checkpoint was selected, which
              in a hosted build meant it was ALWAYS shown while doing nothing
              (the Gateway lane ignores it). Now it appears only where it acts. */}
          {mode === 'text' && hasLocalComfy && (
            <button
              type="button"
              className={`idea-chip ${hd ? 'idea-chip-active' : ''}`}
              style={{ marginTop: 10, width: '100%', textAlign: 'center' }}
              onClick={() => setHd((v) => !v)}
            >
              {hd ? '✓ ' : ''}🔍 רזולוציה גבוהה (HD ×1.5) <span className="dim" style={{ fontSize: '0.75rem' }}>(איטי יותר, חד יותר)</span>
            </button>
          )}

          {mode === 'img2img' && hasKontextModel && <p className="muted" style={{ fontSize: '0.82rem', lineHeight: 1.6, marginTop: 6 }}><Icon name="spark" size={13} style={{ color: 'var(--lime-deep)' }} /> עריכה חכמה — מבצעת רק את השינוי שתבקש ושומרת על הדמות, הפנים והקומפוזיציה המקוריים.</p>}

          {mode === 'presenter' && (
            <>
              {/* Fast / Quality — Quality passes { lightning:false } to qwenCompose */}
              <div className="field" style={{ marginTop: 6 }}>
                <label>איכות היצירה</label>
                <div className="row gap-2" style={{ display: 'flex' }}>
                  <button type="button" className={`idea-chip ${presenterQuality === 'fast' ? 'idea-chip-active' : ''}`} style={{ flex: 1, textAlign: 'center', lineHeight: 1.3 }} onClick={() => setPresenterQuality('fast')}>
                    מהיר<span className="dim" style={{ display: 'block', fontSize: '0.68rem' }}>ברירת מחדל · מהיר יותר</span>
                  </button>
                  <button type="button" className={`idea-chip ${presenterQuality === 'quality' ? 'idea-chip-active' : ''}`} style={{ flex: 1, textAlign: 'center', lineHeight: 1.3 }} onClick={() => setPresenterQuality('quality')}>
                    איכות<span className="dim" style={{ display: 'block', fontSize: '0.68rem' }}>ניסיוני · איטי משמעותית · עלול לחרוג מזמן ההמתנה</span>
                  </button>
                </div>
              </div>
              <p className="muted" style={{ fontSize: '0.82rem', lineHeight: 1.6, marginTop: 6 }}>
                <Icon name="spark" size={13} style={{ color: 'var(--lime-deep)' }} /> שלב תמונת מוצר עם פרזנטור ליצירת ויזואל שיווקי. הקומפוזיציה מבוססת AI ועשויה להיות מקורבת; לשמירה מדויקת של פרטי המוצר השתמש/י במצב «מוצר מדויק».
              </p>
              <p className="dim" style={{ fontSize: '0.74rem', lineHeight: 1.5, marginTop: 2 }}>המצב הנוכחי הוא יצירתי/מקורב: הוא עשוי לשפר את הנראות, אבל שימור מדויק של לוגו, טקסט, סימני מותג או פרטי מוצר קטנים אינו מובטח. מצב Product Lock לשימור מדויק — בהמשך.</p>
              <p className="dim" style={{ fontSize: '0.74rem', lineHeight: 1.5, marginTop: 2 }}>לשימוש בתמונות שיש לך הרשאה להשתמש בהן בלבד.</p>
              <p className="dim" style={{ fontSize: '0.74rem', lineHeight: 1.5, marginTop: 2 }}>הערה: היצירה הראשונה עשויה להימשך כמה דקות. זה תקין.</p>
              <p className="dim" style={{ fontSize: '0.74rem', lineHeight: 1.5, marginTop: 2 }}>טיפ: בחר תמונת פרזנטור שבה אזור היעד — פרק יד, יד או צוואר — גלוי וברור, ותמונת מוצר על רקע נקי. התוצאה הראשונה עשויה להיות מקורבת; אפשר לחדד את ההוראה וליצור שוב.</p>
              <p className="dim" style={{ fontSize: '0.74rem', lineHeight: 1.5, marginTop: 2 }}>אפשר ליצור קודם סדרת דמות או אלבום דוגמנית, לבחור מהגלריה את הזווית הטובה ביותר, ואז ללחוץ «השתמש כפרזנטור» כדי לחבר אותה למוצר.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {PRESENTER_IDEAS.map((p) => (
                  <button key={p.label} type="button" className="idea-chip" style={{ width: 'auto', flex: '0 1 auto', fontSize: '0.78rem', padding: '6px 10px' }} onClick={() => setPrompt(p.prompt)}>{p.label}</button>
                ))}
              </div>
            </>
          )}

          {mode === 'lock' && (
            <>
              <p className="muted" style={{ fontSize: '0.82rem', lineHeight: 1.6, marginTop: 6 }}>
                <Icon name="edit" size={13} style={{ color: 'var(--lime-deep)' }} /> <b>מוצר מדויק — Product Lock.</b> מצב זה שומר על פיקסלי המוצר המקורי וממקם אותו על גבי תמונת הפרזנטור. מתאים למוצרים עם לוגו, טקסט, שעון, אריזה או סימני מותג שצריכים להישאר מדויקים.
              </p>
              <p className="dim" style={{ fontSize: '0.74rem', lineHeight: 1.5, marginTop: 2 }}>המערכת שומרת על המוצר עצמו, ואתה יכול לדייק את המיקום, הגודל והזווית לפני יצירת הקומפוזיט.</p>
              <p className="dim" style={{ fontSize: '0.74rem', lineHeight: 1.5, marginTop: 2 }}>מומלץ להשתמש בתמונת מוצר PNG שקופה או בתמונת מוצר על רקע נקי.</p>
              {/* The sentence that TELLS the user to use the gated enhancement is
                  part of the enhancement, so it hangs off the SAME decision as
                  the button below — not off `mode === 'lock'`. */}
              {lockBlend.available && (
                <p className="dim" style={{ fontSize: '0.74rem', lineHeight: 1.5, marginTop: 2 }}>{lockBlend.guidance}</p>
              )}
              <p className="dim" style={{ fontSize: '0.74rem', lineHeight: 1.5, marginTop: 2 }}>לשימוש בתמונות שיש לך הרשאה להשתמש בהן בלבד.</p>
            </>
          )}

          {mode === 'inpaint' && <p className="muted" style={{ fontSize: '0.82rem', lineHeight: 1.6, marginTop: 6 }}><Icon name="spark" size={13} style={{ color: 'var(--lime-deep)' }} /> עריכה ריאליסטית — משנה רק את האזור שסימנת, השאר נשאר מדויק. מתאים לאופנה, בגדי ים והחלפת רקע.</p>}

          {mode === 'video' && <p className="muted" style={{ fontSize: '0.84rem', lineHeight: 1.6 }}>{hasLtxVideo ? 'סרטון ~4 שניות מהתמונה, עם תנועה לפי התיאור שתכתוב. (~1-2 דק׳ עיבוד)' : 'תיווצר תנועה קולנועית עדינה מהתמונה (~25 פריימים).'}</p>}

          {mode === 'flf' && <p className="muted" style={{ fontSize: '0.84rem', lineHeight: 1.6 }}><Icon name="spark" size={13} style={{ color: 'var(--lime-deep)' }} /> «לפני/אחרי» — הסרטון מתחיל בתמונה הראשונה ומסתיים בשנייה, עם מעבר חלק ביניהן. מושלם לסרטוני שינוי/טרנספורמציה. (~1-2 דק׳ עיבוד)</p>}

          {/* Model album — clothing/style prompt + 8-angle generator */}
          {mode === 'album' && (
            <>
              <div className="field" style={{ marginTop: 14 }}>
                <label>סגנון / בגד (כתוב מה ללבוש)</label>
                <textarea className="textarea" style={{ minHeight: 64 }} value={clothing} onChange={(e) => setClothing(e.target.value)} placeholder="למשל: הלבשה תחתונה מינימליסטית בצבע בז׳ · בגד ים חוטיני · שמלת ערב שחורה" />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {ALBUM_STYLES.map((s) => (
                    <button key={s} type="button" className="idea-chip" style={{ width: 'auto', flex: '0 1 auto', fontSize: '0.78rem', padding: '6px 10px' }} onClick={() => setClothing(s)}>{s}</button>
                  ))}
                </div>
              </div>
              <p className="muted" style={{ fontSize: '0.84rem', lineHeight: 1.6 }}>
                <Icon name="spark" size={13} style={{ color: 'var(--lime-deep)' }} />{' '}
                העלה תמונת פנים של דוגמנית וכתוב בגד → ייווצרו <b>8 זוויות עם אותה דמות בדיוק</b> (קדמי · גב · ימין · שמאל · מרחוק · תקריב · צוחקת · רצינית), עם עור טבעי. נשמר בגלריה כאלבום. כל זווית ~40-60 שניות.
              </p>
            </>
          )}

          {/* Character pack — engine toggle + count selector */}
          {mode === 'character' && (
            <>
              {/* Containment: the "מנוע עקביות" toggle (PuLID vs Kontext) was
                  removed — picking between two engine implementations is not a
                  business decision. The stronger identity-lock path is used
                  whenever it is available; otherwise the edit path is used. */}
              <div className="field" style={{ marginTop: 12 }}>
                <label>כמה וריאציות</label>
                <div className="row gap-2" style={{ display: 'flex' }}>
                  {PACK_COUNTS.map((n) => (
                    <button key={n} type="button" className={`idea-chip ${packCount === n ? 'idea-chip-active' : ''}`} style={{ flex: 1, textAlign: 'center' }} onClick={() => setPackCount(n)}>{n} תמונות</button>
                  ))}
                </div>
              </div>
              <p className="muted" style={{ fontSize: '0.84rem', lineHeight: 1.6 }}>
                <Icon name="spark" size={13} style={{ color: 'var(--lime-deep)' }} />{' '}
                {pulidReady
                  ? <>ייווצרו {packCount} סצנות חדשות עם <b>אותם הפנים בדיוק</b> (נעילת זהות חזקה) ויישמרו בגלריה — משם אפשר להפוך כל אחת לסרטון. כל תמונה ~30-60 שניות.</>
                  : <>ייווצרו {packCount} וריאציות של <b>אותה דמות</b> (זוויות, תנוחות, רקעים) ויישמרו בגלריה — משם אפשר להפוך כל אחת לסרטון. כל וריאציה ~30-60 שניות.</>}
              </p>
              {qwenReady && <p className="dim" style={{ fontSize: '0.74rem', lineHeight: 1.5, marginTop: 2 }}>טיפ: אחרי יצירת סדרה, בחר תמונה מוצלחת מהגלריה והשתמש בה כפרזנטור לקמפיין מוצר.</p>}
            </>
          )}

          {error && <div className="login-error" style={{ marginTop: 12 }}><Icon name="x" size={15} strokeWidth={2.4} /> {error}</div>}

          {handoffNotice && (
            <p className="muted" style={{ marginTop: 12, fontSize: '0.82rem', lineHeight: 1.6 }}>
              <Icon name="spark" size={13} style={{ color: 'var(--lime-deep)' }} /> {handoffNotice}
            </p>
          )}

          <button className="btn btn-primary btn-block" onClick={onCta} disabled={ctaBusy} style={ctaBusy ? { marginTop: 16, opacity: 0.85 } : { marginTop: 16, height: 50, fontSize: '0.98rem' }}>
            {ctaBusy ? <><span className="loader-ring" style={{ width: 18, height: 18, borderWidth: 2 }} /> {loadingLabel}</> : <><Icon name="spark" size={18} /> {ctaLabel}</>}
          </button>

          {/* Product Lock B2 — secondary action: AI blends ONLY the seam/shadow ring */}
          {isLock && lockBlend.available && (
            <>
              <button className="btn btn-ghost btn-block" onClick={runLockBlend} disabled={lockBlendBusy || lockBusy || !file || !endFile} style={{ marginTop: 8 }}>
                {lockBlendBusy ? <><span className="loader-ring" style={{ width: 16, height: 16, borderWidth: 2 }} /> {lockBlend.busyLabel}</> : <><Icon name="wand" size={16} /> {lockBlend.actionLabel}</>}
              </button>
              <p className="dim" style={{ fontSize: '0.74rem', lineHeight: 1.5, marginTop: 6 }}>{lockBlend.actionNote}</p>
            </>
          )}

          {/* Quick ideas (text mode only) */}
          {mode === 'text' && (
            <div className="diag-section" style={{ marginTop: 22 }}>
              <div className="diag-section-title row between" style={{ display: 'flex', alignItems: 'center' }}>
                <span className="row gap-2"><Icon name="spark" size={15} /> רעיונות מהירים</span>
                <button type="button" className="link-btn" onClick={shuffleIdeas}><Icon name="refresh" size={13} /> רעיונות חדשים</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visibleIdeas.map((idea, i) => (
                  <motion.button
                    key={`${ideaSeed}-${ideaOffset}-${i}`}
                    className="idea-chip"
                    onClick={() => setPrompt(idea)}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35, delay: i * 0.05 }}
                  >{idea}</motion.button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Result */}
        <div className="card panel diag-result">
          {/* Product Lock — the workspace IS the result area: exact composite preview */}
          {isLock && (filePreview && endPreview ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="panel-title row gap-2"><Icon name="edit" size={16} style={{ color: 'var(--lime-deep)' }} /> סביבת מיקום — מוצר מדויק</div>
              <ProductPlacer ref={placerRef} baseUrl={filePreview} productUrl={endPreview} />
              {lockBlendBusy && job && (
                <div className="job-card">
                  <div className="job-row">
                    <span className={`badge ${job.phase === 'running' ? 'badge-active' : 'badge-neutral'}`}>
                      <span className="dot" /> {job.phase === 'queued' ? (job.position > 1 ? `בתור (${job.position})` : 'בתור') : 'רץ'}
                    </span>
                    <JobElapsed at={job.at} />
                  </div>
                  {job.max > 0 && (
                    <div className="job-bar" role="progressbar" aria-valuenow={job.value} aria-valuemax={job.max}>
                      <span style={{ width: `${Math.min(100, Math.round((job.value / job.max) * 100))}%` }} />
                    </div>
                  )}
                  {job.max > 0 && <span className="dim job-pct"><bdi>{Math.min(100, Math.round((job.value / job.max) * 100))}%</bdi></span>}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={cancelCurrentJob} disabled={cancelledRef.current}>
                    <Icon name="x" size={14} /> ביטול
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="diag-empty">
              <div className="diag-empty-ico"><Icon name="edit" size={30} /></div>
              <h3>מוצר מדויק · Product Lock</h3>
              <p className="muted">העלה תמונת בסיס/פרזנטור ותמונת מוצר משמאל — המוצר יופיע כאן למיקום מדויק, ללא שינוי בפיקסלים שלו.</p>
            </div>
          ))}

          {/* Pack (character / album) — streaming grid of consistent variations */}
          {isPack && (pack.length === 0 && !packBusy) && (
            <div className="diag-empty">
              <div className="diag-empty-ico"><Icon name="image" size={30} /></div>
              <h3>{isAlbum ? 'אלבום דוגמנית · 8 זוויות' : 'ערכת דמות עקבית'}</h3>
              <p className="muted">{isAlbum ? 'העלה תמונת דוגמנית, כתוב בגד/סגנון, ולחץ «צור אלבום 8 זוויות». כל הזוויות יישמרו בגלריה.' : 'העלה תמונת דמות משמאל, בחר כמות, ולחץ «צור ערכת דמות». כל הוריאציות יישמרו בגלריה למטה.'}</p>
            </div>
          )}
          {isPack && (pack.length > 0 || packBusy) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="panel-title row gap-2"><Icon name="image" size={16} style={{ color: 'var(--lime-deep)' }} /> {isAlbum ? 'אלבום הדוגמנית' : 'ערכת הדמות'} ({pack.length}/{isAlbum ? 8 : packCount})</div>
              <div className="gallery-grid">
                {pack.map((r, i) => (
                  <div key={i} className="gallery-item">
                    <img src={r.src} alt="" loading="lazy" />
                    {r.label && <span className="album-tag">{r.label}</span>}
                  </div>
                ))}
                {packBusy && Array.from({ length: Math.max(0, (isAlbum ? 8 : packCount) - pack.length) }).map((_, i) => (
                  <div key={`ph${i}`} className="gallery-item" style={{ display: 'grid', placeItems: 'center', minHeight: 120 }}>
                    <span className="loader-ring" style={{ width: 24, height: 24 }} />
                  </div>
                ))}
              </div>
              {!packBusy && pack.length > 0 && <p className="muted" style={{ fontSize: '0.84rem', lineHeight: 1.6 }}><Icon name="check" size={13} style={{ color: 'var(--lime-deep)' }} /> נשמר בגלריה — גלול למטה, בחר תמונות והפוך אותן לסרטון (אנימציה / מונטאז').</p>}
            </div>
          )}

          {!isPack && !isLock && !result && !loading && (
            <div className="diag-empty">
              <div className="diag-empty-ico"><Icon name="image" size={30} /></div>
              <h3>{isVideoMode ? 'מוכן ליצירת סרטון' : 'מוכן ליצירת תמונה'}</h3>
              <p className="muted">{mode === 'flf' ? 'העלה תמונת «לפני» ו«אחרי» משמאל ולחץ על הכפתור.' : needsImage ? 'העלה תמונה משמאל ולחץ על הכפתור.' : 'הזן תיאור משמאל ולחץ «צור תמונה עם AI».'}</p>
            </div>
          )}

          {!isPack && !isLock && loading && (
            <div className="diag-empty">
              <span className="loader-ring" style={{ width: 40, height: 40 }} />
              <h3 style={{ marginTop: 14 }}>{isVideoMode ? 'יוצר סרטון…' : 'מחולל את התמונה…'}</h3>
              {job ? (
                <div className="job-card">
                  <div className="job-row">
                    <span className={`badge ${job.phase === 'running' ? 'badge-active' : 'badge-neutral'}`}>
                      <span className="dot" /> {job.phase === 'queued' ? (job.position > 1 ? `בתור (${job.position})` : 'בתור') : 'רץ'}
                    </span>
                    <JobElapsed at={job.at} />
                  </div>
                  {job.max > 0 && (
                    <div className="job-bar" role="progressbar" aria-valuenow={job.value} aria-valuemax={job.max}>
                      <span style={{ width: `${Math.min(100, Math.round((job.value / job.max) * 100))}%` }} />
                    </div>
                  )}
                  {job.max > 0 && <span className="dim job-pct"><bdi>{Math.min(100, Math.round((job.value / job.max) * 100))}%</bdi></span>}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={cancelCurrentJob} disabled={cancelledRef.current}>
                    <Icon name="x" size={14} /> ביטול
                  </button>
                </div>
              ) : (
                <p className="muted">{isVideoMode ? 'עיבוד וידאו כבד יותר — עד 2-3 דקות.' : 'זה עשוי לקחת כמה שניות.'}</p>
              )}
            </div>
          )}

          {!isPack && !isLock && result && !loading && (
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="studio-image">
                {!imgReady && (
                  <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <span className="loader-ring" style={{ width: 38, height: 38 }} />
                    {imgAttempt > 0 && <span className="dim" style={{ fontSize: '0.8rem' }}>מנסה שוב… ({imgAttempt}/3)</span>}
                  </div>
                )}
                <img
                  key={imgAttempt}
                  src={result.src}
                  alt={result.isVideo ? 'אנימציה שנוצרה' : 'תמונה שנוצרה'}
                  style={{ opacity: imgReady ? 1 : 0, transition: 'opacity 0.4s' }}
                  onLoad={() => setImgReady(true)}
                  onError={() => {
                    if (!result.isVideo && imgAttempt < 3) {
                      setTimeout(() => setImgAttempt((a) => a + 1), 2500);
                    } else {
                      setError('התוכן לא נטען. נסה שוב.');
                      setResult(null);
                    }
                  }}
                />
              </div>
              <div className="row between wrap" style={{ gap: 10 }}>
                {/* Containment: this badge used to name the engine and the model
                    that produced the result ("מקומי · FLUX.1", "מקומי · עריכה
                    (Kontext)", "Pollinations · Flux", …). It now states WHAT was
                    produced, plus the one distinction that is truthful and
                    meaningful to the user: demo output vs real output. */}
                <span className={`badge ${result.demo ? 'badge-neutral' : 'badge-active'}`}>
                  <span className="dot" />{result.demo ? 'מצב הדגמה' : result.isVideo ? (result.flf ? 'סרטון לפני/אחרי' : result.montage ? 'מונטאז׳' : 'סרטון') : result.presenter ? `ויזואל מוצר${result.presenterQuality === 'quality' ? ' · איכות' : ''}` : result.inpaint ? 'עריכת אזור' : result.kontext ? 'עריכה חכמה' : 'תמונה'}
                </span>
                <div className="row gap-2 wrap">
                  {!result.isVideo && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setPosterSrc(result.src)}><Icon name="edit" size={15} style={{ color: 'var(--lime-deep)' }} /> עורך פוסטר (טקסט)</button>
                  )}
                  {!result.isVideo && resultAnimation.ok && (
                    <button className="btn btn-ghost btn-sm" onClick={animateResult}><Icon name="spark" size={15} style={{ color: 'var(--lime-deep)' }} /> צור אנימציה</button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={run}><Icon name="refresh" size={15} /> צור שוב</button>
                  <button className="btn btn-primary btn-sm" onClick={() => downloadImage(result.src, studioDownloadName(result))}><Icon name="download" size={15} /> הורדה</button>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* ---- Gallery: collected images → same-subject variations → montage video ---- */}
      {gallery.length > 0 && (
        <div className="card panel" style={{ marginTop: 18 }}>
          <div className="panel-head">
            <div className="panel-title row gap-2"><Icon name="image" size={18} style={{ color: 'var(--lime-deep)' }} /> גלריה ({gallery.length})</div>
            <div className="row gap-2 wrap">
              {selectedIds.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIds([])}>נקה בחירה</button>}
              {hasLtxVideo && (
                <button className="btn btn-primary btn-sm" onClick={batchAnimate} disabled={selectedIds.length < 1 || clipBusy} title="כל תמונה נבחרת → סרטון נפרד">
                  <Icon name="spark" size={15} /> {clipBusy ? `יוצר… (${clipProg}/${selectedIds.length})` : `הפוך לסרטונים${selectedIds.length ? ` (${selectedIds.length})` : ''}`}
                </button>
              )}
              {hasVideoModel && (
                <button className="btn btn-ghost btn-sm" onClick={buildMontage} disabled={selectedIds.length < 1 || galleryBusy} title="כל התמונות → סרטון מונטאז' אחד">
                  <Icon name="spark" size={15} /> {galleryBusy ? 'מרכיב…' : `מונטאז'${selectedIds.length ? ` (${selectedIds.length})` : ''}`}
                </button>
              )}
            </div>
          </div>
          <p className="dim" style={{ fontSize: '0.8rem', margin: '0 0 10px' }}>
            לחץ תמונה לבחירה לסרטון{hasKontextModel ? ' · «↻» יוצר וריאציה של אותה דמות' : ''} · נשמרות עד {GALLERY_MAX} פריטים
          </p>
          {/* Render-history filter: all / images / videos (animated WebP) */}
          <div className="gallery-filters">
            {[
              { id: 'all', label: 'הכל' },
              { id: 'image', label: 'תמונות' },
              { id: 'video', label: 'וידאו' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                className={`gallery-filter ${galleryTab === t.id ? 'active' : ''}`}
                onClick={() => setGalleryTab(t.id)}
              >
                {t.label} ({filterGalleryItems(gallery, t.id).length})
              </button>
            ))}
          </div>
          <div className="gallery-grid">
            {filterGalleryItems(gallery, galleryTab).map((g) => (
              <div key={g.id} className={`gallery-item ${selectedIds.includes(g.id) ? 'selected' : ''}`} onClick={() => toggleSelect(g.id)}>
                <img src={g.url} alt="" loading="lazy" />
                {g.kind === 'video' && <span className="gallery-kind"><Icon name="spark" size={11} /> וידאו</span>}
                {selectedIds.includes(g.id) && <span className="gallery-check"><Icon name="check" size={14} strokeWidth={3} /></span>}
                <div className="gallery-actions" onClick={(e) => e.stopPropagation()}>
                  {qwenReady && g.kind !== 'video' && <button className="gallery-btn" title="השתמש כפרזנטור" onClick={() => useGalleryAsPresenter(g)}><Icon name="image" size={13} /></button>}
                  {hasKontextModel && g.kind !== 'video' && <button className="gallery-btn" title="וריאציה של אותה דמות" onClick={() => makeVariation(g)}><Icon name="refresh" size={13} /></button>}
                  <button className="gallery-btn del" title="מחיקה" onClick={() => removeGalleryItem(g.id)}><Icon name="trash" size={13} /></button>
                </div>
              </div>
            ))}
          </div>

          {/* Batch-animated clips — one video per selected image, streamed in */}
          {(clips.length > 0 || clipBusy) && (
            <div style={{ marginTop: 16 }}>
              <div className="panel-title row gap-2" style={{ marginBottom: 10 }}><Icon name="spark" size={16} style={{ color: 'var(--lime-deep)' }} /> סרטונים שנוצרו ({clips.length}{clipBusy ? `/${selectedIds.length}` : ''})</div>
              <div className="gallery-grid">
                {clips.map((c, i) => (
                  <div key={i} className="gallery-item">
                    <img src={c.src} alt="" loading="lazy" />
                    <div className="gallery-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="gallery-btn" title="הורדה" onClick={() => downloadImage(c.src, `artvalue-clip-${i + 1}.webp`)}><Icon name="download" size={13} /></button>
                    </div>
                  </div>
                ))}
                {clipBusy && (
                  <div className="gallery-item" style={{ display: 'grid', placeItems: 'center', minHeight: 120 }}>
                    <span className="loader-ring" style={{ width: 24, height: 24 }} />
                  </div>
                )}
              </div>
              {clipBusy && <p className="muted" style={{ fontSize: '0.8rem', marginTop: 8 }}>כל סרטון ~1-2 דק' — נוצרים בזה אחר זה, אל תסגור את העמוד.</p>}
            </div>
          )}
        </div>
      )}

      {posterSrc && (
        <PosterEditor
          src={posterSrc}
          onClose={() => setPosterSrc(null)}
          onApply={(dataUrl) => { setResult({ src: dataUrl, engine: result?.engine, quality: result?.quality, poster: true }); setImgReady(false); setImgAttempt(0); setPosterSrc(null); }}
        />
      )}

      {mockupOpen && <MockupStudio onClose={() => setMockupOpen(false)} />}
    </div>
  );
}

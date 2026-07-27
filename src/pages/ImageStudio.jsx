import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { SectionHeader } from '../components/ui/atoms.jsx';
import Icon from '../components/ui/Icon.jsx';
// PRODUCT BOUNDARY (2026-07-27, owner decision): the Studio is CLOUD/GATEWAY
// ONLY. Both remote operations it performs — prompt enhancement and image
// creation — go through the protected server-owned AI Gateway. There is no
// local-engine import here at all: no engine URL, no capability flag, no job
// watcher, no model constant.
import { callAiGateway } from '../lib/aiGatewayClient.js';
import { generateImage, downloadImage, isImageAiConfigured } from '../lib/hostedImage.js';
import { createGalleryStore, srcToBlob, GALLERY_MAX, filterGalleryItems } from '../lib/galleryStore.js';
import { activeBrandPalette, withBrandPalette } from '../lib/brandPalette.js';
import { AI_GATEWAY_INPUT_LIMITS } from '../lib/aiGatewayInput.js';
import { CREATIVE_PRESETS, isTextImagePreset } from '../data/creativePresets.js';
import { availablePresets } from '../lib/presetAvailability.js';
import PosterEditor from '../components/studio/PosterEditor.jsx';
import MockupStudio from '../components/studio/MockupStudio.jsx';
import { readStudioHandoff } from '../lib/studioHandoff.js';
import { isStudioModeAvailable, resolveStudioMode } from '../lib/studioModes.js';
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

// The complete Studio mode list. It matches STUDIO_MODE_REQUIREMENTS exactly —
// the retired local-engine modes were removed from both, not hidden in one.
const MODES = [
  { id: 'text', label: 'טקסט → תמונה', sub: 'תיאור הופך לתמונה', icon: 'wand' },
];

// Aspect-ratio presets.
const ASPECTS = [
  { id: 'square', label: 'ריבוע', sub: 'לוגו · מוצר · פוסט', w: 1024, h: 1024 },
  { id: 'portrait', label: 'פורטרט', sub: 'דוגמנית · אופנה · סטורי', w: 832, h: 1216 },
  { id: 'landscape', label: 'לרוחב', sub: 'באנר · רקע · כיסוי', w: 1216, h: 832 },
];

// ===================================================================
// Studio surface
// -------------------------------------------------------------------
// PRODUCT BOUNDARY (2026-07-27, owner decision): the Studio is cloud/Gateway
// only. The former local-GPU status/setup panel, its 15-second availability
// poll, the checkpoint picker, the engine job card and every engine-badged
// label were removed along with the engines themselves. Opening the Studio
// performs NO request of any kind.
// ===================================================================


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
// removal of the technical picker without exposing any engine detail.
// Returns undefined for no preset, a non-text preset, or a non-FLUX family,
// which lets the engine apply its own default (identical to today's behavior).
export function presetModelFamily(preset) {
  if (!preset || !isTextImagePreset(preset)) return undefined;
  return preset.modelFamily === 'flux' ? 'flux' : undefined;
}


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
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState('square');
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
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [imgReady, setImgReady] = useState(false);
  const [imgAttempt, setImgAttempt] = useState(0);
  const [error, setError] = useState('');
  const [gallery, setGallery] = useState([]);
  const [galleryTab, setGalleryTab] = useState('all'); // all | image | video
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [posterSrc, setPosterSrc] = useState(null);
  const [mockupOpen, setMockupOpen] = useState(false);
  const [activePresetId, setActivePresetId] = useState(null);
  const runTokenRef = useRef(0);       // stale-run guard: bumping it makes an in-flight run's settle a no-op
  const cancelledRef = useRef(false);

  // Opening the Studio issues NO request of any kind until the user asks for
  // something: there is no engine to probe, no capability to discover and no
  // job stream to subscribe to. The three local discovery calls this component
  // once made on mount were removed with the engine itself.

  // The available set is AUTHORITATIVE for every entry path, not just for the
  // tiles we draw. `studioModes.js` owns it, and a hand-off / restored state /
  // deep link naming a RETIRED mode resolves through the same seam.
  const modes = MODES.filter((m) => isStudioModeAvailable(m.id));
  // A preset ROUTES to a mode and advertises itself as runnable, so it is
  // offered only when that mode is part of the product and nothing external is
  // required. `presetAvailability.js` owns the decision.
  const presets = availablePresets(CREATIVE_PRESETS);

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
    // EVERY accepted hand-off resolves — including one whose workflow is retired
    // and therefore carries `mode: null`. Skipping resolution left the ALREADY
    // MOUNTED Studio on whatever mode it happened to be in, so a retired request
    // could keep a retired panel on screen with the new prompt hidden behind it.
    const resolved = resolveStudioMode(prefill.mode);
    const contained = resolved.contained && Boolean(prefill.mode);
    setMode(resolved.mode); setResult(null); setError('');
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
    if (!isStudioModeAvailable(mode)) {
      setMode(resolveStudioMode(mode).mode);
      setResult(null); setError('');
    }
  }, [mode]);

  const activePreset = presets.find((p) => p.id === activePresetId) || null;


  // Apply a business preset into the existing Text-to-Image controls. Explicit
  // user click only — NEVER generates. Always fills the prompt scaffold; for
  // text-image presets it also selects a compatible aspect. (Containment: the
  // Never touches uploaded images or the gallery.
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




  // Map a studio mode to a render-history source label (simple, best-effort).
  const SOURCE_BY_MODE = { text: 'text-to-image' };

  // Build the small metadata bag saved alongside a gallery asset. kind comes
  // from the result's isVideo flag; meta strings are sanitized in galleryStore.
  const galleryMeta = (r, source) => ({
    kind: r?.isVideo ? 'video' : 'image',
    source: source || 'unknown',
    prompt: prompt.trim() || undefined,
    preset: activePreset?.titleHe || activePresetId || undefined,
    engine: r?.engine || 'local',
  });

  // S0F.1 (P2) — will THIS request be served by the Gateway (and so be subject to
  // the server's image-prompt limit)? Text-to-image is the only generating mode,
  // and it has exactly one lane.
  const usesGatewayImageLane = mode === 'text' && isImageAiConfigured;

  const run = async () => {
    if (mode === 'text' && !prompt.trim()) { setError('יש להזין תיאור לתמונה'); return; }
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
    const token = ++runTokenRef.current;
    cancelledRef.current = false;
    setLoading(true); setError(''); setResult(null); setImgReady(false); setImgAttempt(0);
    try {
      // ONE lane. `aspect` (the preset id) is the only field the Gateway reads —
      // it maps to an exact ratio server-side. No width/height and no model or
      // provider choice is ever sent from the UI,
      // because the product owns the provider and the browser owns nothing.
      const r = await generateImage(p, { aspect });
      if (token !== runTokenRef.current) return; // cancelled (pending-delete) — ignore the orphan
      setResult(r);
      if (r.demo) toast('נוצר דרך המחולל החינמי');
      // collect the output into the gallery
      if (r && r.src) {
        try { await galleryStore.add(await srcToBlob(r.src), galleryMeta(r, SOURCE_BY_MODE[mode] || 'unknown')); await refreshGallery(); } catch { /* noop */ }
      }
    } catch (e) {
      if (token !== runTokenRef.current) return; // stale run — already handled by cancel
      if (cancelledRef.current) toast('היצירה בוטלה');
      else setError(userFacingError(e, 'שגיאה ביצירת התוכן'));
    } finally {
      if (token === runTokenRef.current) setLoading(false);
    }
  };






  const LOCK_BLEND_PROMPT = 'Natural soft contact shadow, seamless edge blending, matched ambient lighting, realistic product contact with the surface or skin, photorealistic integration. Preserve the product exactly.';

  // Presenter Consistency Bridge: load a gallery image (e.g. a Character Series /
  // Model Album result) straight into the Product Presenter presenter slot.
  // Image-kind items only. Never touches the product slot or the prompt.

  const removeGalleryItem = async (id) => {
    await galleryStore.remove(id);
    refreshGallery();
  };

  // Assemble the selected gallery images into a montage video.


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



  const ctaLabel = 'צור תמונה עם AI';
  const loadingLabel = 'מחולל…';
  const ctaBusy = loading;
  const onCta = run;

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
                    <span className={`badge ${activePreset.localReady ? 'badge-active' : 'badge-neutral'}`}>
                      <span className="dot" /> {activePreset.localReady ? 'זמין' : 'בקרוב'}
                    </span>
                  </div>
                  <p className="dim" style={{ margin: '4px 0' }}>{activePreset.useCase}</p>
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

          {/* Prompt */}
          {(
            <div className="field">
              <label>תיאור התמונה (עברית או אנגלית)</label>
              <textarea className="textarea" style={{ minHeight: 130 }} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="כתוב בעברית פשוטה — למשל: לוגו מודרני לעסק דיגיטלי" />
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







          {/* Model album — clothing/style prompt + 8-angle generator */}


          {error && <div className="login-error" style={{ marginTop: 12 }}><Icon name="x" size={15} strokeWidth={2.4} /> {error}</div>}

          {handoffNotice && (
            <p className="muted" style={{ marginTop: 12, fontSize: '0.82rem', lineHeight: 1.6 }}>
              <Icon name="spark" size={13} style={{ color: 'var(--lime-deep)' }} /> {handoffNotice}
            </p>
          )}

          <button className="btn btn-primary btn-block" onClick={onCta} disabled={ctaBusy} style={ctaBusy ? { marginTop: 16, opacity: 0.85 } : { marginTop: 16, height: 50, fontSize: '0.98rem' }}>
            {ctaBusy ? <><span className="loader-ring" style={{ width: 18, height: 18, borderWidth: 2 }} /> {loadingLabel}</> : <><Icon name="spark" size={18} /> {ctaLabel}</>}
          </button>


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


          {!result && !loading && (
            <div className="diag-empty">
              <div className="diag-empty-ico"><Icon name="image" size={30} /></div>
              <h3>מוכן ליצירת תמונה</h3>
              <p className="muted">הזן תיאור משמאל ולחץ «צור תמונה עם AI».</p>
            </div>
          )}

          {loading && (
            <div className="diag-empty">
              <span className="loader-ring" style={{ width: 40, height: 40 }} />
              <h3 style={{ marginTop: 14 }}>מחולל את התמונה…</h3>
            </div>
          )}

          {result && !loading && (
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
                {/* The badge states WHAT was produced, never which engine or
                    model produced it — plus the one distinction that is
                    truthful and meaningful: demo output vs real output. */}
                <span className={`badge ${result.demo ? 'badge-neutral' : 'badge-active'}`}>
                  <span className="dot" />{result.demo ? 'מצב הדגמה' : result.poster ? 'פוסטר' : 'תמונה'}
                </span>
                <div className="row gap-2 wrap">
                  {!result.isVideo && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setPosterSrc(result.src)}><Icon name="edit" size={15} style={{ color: 'var(--lime-deep)' }} /> עורך פוסטר (טקסט)</button>
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
            </div>
          </div>
          <p className="dim" style={{ fontSize: '0.8rem', margin: '0 0 10px' }}>
            נשמרות עד {GALLERY_MAX} פריטים
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
              <div key={g.id} className="gallery-item">
                <img src={g.url} alt="" loading="lazy" />
                {g.kind === 'video' && <span className="gallery-kind"><Icon name="spark" size={11} /> וידאו</span>}
                <div className="gallery-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="gallery-btn del" title="מחיקה" onClick={() => removeGalleryItem(g.id)}><Icon name="trash" size={13} /></button>
                </div>
              </div>
            ))}
          </div>

        </div>
      )}

      {posterSrc && (
        <PosterEditor
          src={posterSrc}
          onClose={() => setPosterSrc(null)}
          onApply={(dataUrl) => { setResult({ src: dataUrl, engine: result?.engine, poster: true }); setImgReady(false); setImgAttempt(0); setPosterSrc(null); }}
        />
      )}

      {mockupOpen && <MockupStudio onClose={() => setMockupOpen(false)} />}
    </div>
  );
}

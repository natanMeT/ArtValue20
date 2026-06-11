import { useState, useRef, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { SectionHeader } from '../components/ui/atoms.jsx';
import Icon from '../components/ui/Icon.jsx';
import MaskCanvas from '../components/ui/MaskCanvas.jsx';
import { enhanceImagePrompt } from '../lib/gemini.js';
import {
  generateImage, generateImg2Img, editImage, inpaintImage, animateImage, ltxVideo, flfVideo, montageFromImages, downloadImage,
  isImageAiConfigured, hasFluxModel, hasLocalComfy, hasVideoModel, hasLtxVideo, hasKontextModel,
  checkLocalEngine, localEngineUrl, listImageModels, characterPack, characterPackPulid, hasPulidNode,
  generateModelAlbum,
} from '../lib/geminiImage.js';
import { addImage as addToGallery, listImages as listGallery, getBlob as getGalleryBlob, removeImage as removeFromGallery, srcToBlob, GALLERY_MAX } from '../lib/galleryStore.js';
import PosterEditor from '../components/studio/PosterEditor.jsx';
import MockupStudio from '../components/studio/MockupStudio.jsx';

const EDIT_IDEAS = [
  'שנה את הרקע לחוף ים בשקיעה',
  'הפוך את הרקע ללבן נקי (סטודיו)',
  'שנה את צבע הבגד לאדום',
  'הוסף אווירה קולנועית ותאורה דרמטית',
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
  { id: 'img2img', label: hasKontextModel ? 'עריכה חכמה' : 'תמונה → תמונה', sub: 'עריכה עם AI', icon: 'image', needs: 'comfy' },
  { id: 'inpaint', label: 'עריכת אזור', sub: 'החלפת אזור מסומן', icon: 'wand', needs: 'comfy' },
  { id: 'video', label: 'תמונה → וידאו', sub: 'הנפשה מתמונה', icon: 'spark', needs: 'video' },
  { id: 'flf', label: 'לפני / אחרי', sub: 'מעבר בין 2 פריימים', icon: 'spark', needs: 'ltx' },
  { id: 'character', label: 'ערכת דמות', sub: 'דמות עקבית · וריאציות', icon: 'image', needs: 'character' },
  { id: 'album', label: 'אלבום דוגמנית', sub: '8 זוויות מתמונה + בגד', icon: 'image', needs: 'pulid' },
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

function EngineStatus() {
  const [status, setStatus] = useState('checking'); // checking | up | down
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  const ping = async () => {
    setChecking(true);
    const up = await checkLocalEngine();
    setStatus(up ? 'up' : 'down');
    setChecking(false);
    if (up) setOpen(false);
  };

  useEffect(() => {
    ping();
    const t = setInterval(ping, 15000);
    return () => clearInterval(t);
  }, []);

  if (!localEngineUrl) return null;

  return (
    <div className={`engine-status engine-${status}`}>
      <div className="engine-row">
        <span className="engine-dot" />
        <span className="engine-label">
          {status === 'up' ? 'מנוע התמונות פעיל' : status === 'checking' ? 'בודק מנוע…' : 'מנוע התמונות כבוי'}
        </span>
        {status === 'down' && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={ping} disabled={checking}>{checking ? 'בודק…' : 'בדוק שוב'}</button>
            <button className="btn btn-primary btn-sm" onClick={() => setOpen((o) => !o)}><Icon name="spark" size={14} /> איך מפעילים</button>
          </>
        )}
      </div>
      {open && status === 'down' && (
        <div className="engine-help">
          <p style={{ margin: '0 0 6px' }}>הפעל את המנוע באחת מהדרכים, והמתן ~30 שניות (האינדיקטור יתעדכן לבד):</p>
          <ol style={{ margin: 0, paddingInlineStart: 18, lineHeight: 1.8 }}>
            <li>לחיצה כפולה על <b>«Start ArtValue Image Engine»</b> בשולחן העבודה</li>
            <li>או: <code>C:\AI\ComfyUI_windows_portable\start_engine.bat</code></li>
          </ol>
        </div>
      )}
    </div>
  );
}

export default function ImageStudio() {
  const { toast } = useStore();
  const [mode, setMode] = useState('text');
  const [prompt, setPrompt] = useState('');
  const [quality, setQuality] = useState('fast');
  const [models, setModels] = useState([]);     // local image checkpoints (auto-detected)
  const [modelFile, setModelFile] = useState('');
  const [packCount, setPackCount] = useState(6);  // consistent-character pack size
  const [pack, setPack] = useState([]);            // streamed character variations
  const [packBusy, setPackBusy] = useState(false);
  const [pulidReady, setPulidReady] = useState(false); // PuLID-Flux node installed?
  const [packEngine, setPackEngine] = useState('kontext'); // 'kontext' | 'pulid'
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
  const [selectedIds, setSelectedIds] = useState([]);
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [clips, setClips] = useState([]);          // batch-animated videos (one per image)
  const [clipBusy, setClipBusy] = useState(false);
  const [clipProg, setClipProg] = useState(0);
  const [posterSrc, setPosterSrc] = useState(null);
  const [mockupOpen, setMockupOpen] = useState(false);

  const modes = MODES.filter((m) => !m.needs || (m.needs === 'comfy' && hasLocalComfy) || (m.needs === 'video' && (hasVideoModel || hasLtxVideo)) || (m.needs === 'ltx' && hasLtxVideo) || (m.needs === 'kontext' && hasKontextModel) || (m.needs === 'character' && (hasKontextModel || pulidReady)) || (m.needs === 'pulid' && pulidReady));

  const refreshGallery = async () => { try { setGallery(await listGallery()); } catch { /* noop */ } };
  useEffect(() => { refreshGallery(); }, []);

  // Load the local image models from ComfyUI (so the user can pick per need).
  useEffect(() => {
    let alive = true;
    listImageModels().then((m) => {
      if (!alive || !m.length) return;
      setModels(m);
      setModelFile((cur) => cur || (m.find((x) => /juggernaut/i.test(x.file)) || m.find((x) => x.arch === 'sdxl') || m[0]).file);
    });
    hasPulidNode().then((ok) => { if (alive && ok) { setPulidReady(true); setPackEngine('pulid'); } });
    return () => { alive = false; };
  }, []);

  const selModel = models.find((m) => m.file === modelFile) || null;
  const isFluxModel = Boolean(selModel?.flux);

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

  const run = async () => {
    if (mode === 'text' && !prompt.trim()) { setError('יש להזין תיאור לתמונה'); return; }
    if (mode !== 'text' && !file) { setError(mode === 'flf' ? 'העלה תמונת "לפני"' : 'יש להעלות תמונה תחילה'); return; }
    if (mode === 'flf' && !endFile) { setError('העלה גם תמונת "אחרי"'); return; }
    if (mode === 'inpaint' && !maskRef.current?.hasMask()) { setError('סמן עם המברשת את האזור לעריכה'); return; }
    setLoading(true); setError(''); setResult(null); setImgReady(false); setImgAttempt(0);
    try {
      let r;
      if (mode === 'text') {
        const asp = ASPECTS.find((a) => a.id === aspect) || ASPECTS[0];
        const arch = isFluxModel ? 'flux' : 'sdxl';
        r = await generateImage(prompt, { model: selModel?.file, arch, width: asp.w, height: asp.h, hd: !isFluxModel && hd });
        r = { ...r, quality: isFluxModel ? 'max' : 'fast', modelLabel: selModel?.label };
      }
      else if (mode === 'img2img') { r = hasKontextModel ? await editImage(file, prompt) : await generateImg2Img(file, prompt, { strength }); }
      else if (mode === 'inpaint') { const mask = await maskRef.current.exportMask(); r = await inpaintImage(file, mask, prompt); }
      else if (mode === 'flf') { const len = (VID_LENGTHS.find((v) => v.sec === vidSec) || VID_LENGTHS[0]).frames; r = await flfVideo(file, endFile, prompt, { length: len, ...ltxRes() }); }
      else { const len = (VID_LENGTHS.find((v) => v.sec === vidSec) || VID_LENGTHS[0]).frames; r = hasLtxVideo ? await ltxVideo(file, prompt, { length: len, ...ltxRes() }) : await animateImage(file, {}); }
      setResult(r);
      if (r.demo) toast('נוצר דרך המחולל החינמי');
      // collect still images into the gallery (not videos)
      if (r && !r.isVideo && r.src) {
        try { await addToGallery(await srcToBlob(r.src)); await refreshGallery(); } catch { /* noop */ }
      }
    } catch (e) {
      setError(e.message || 'שגיאה ביצירת התוכן');
    } finally {
      setLoading(false);
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
        try { await addToGallery(await srcToBlob(r.src)); } catch { /* noop */ }
      };
      const usePulid = pulidReady && packEngine === 'pulid';
      if (usePulid) await characterPackPulid(file, packCount, onResult, { portrait: true });
      else await characterPack(file, packCount, onResult);
      await refreshGallery();
      toast(`ערכת הדמות מוכנה ✓ (${usePulid ? 'PuLID' : 'Kontext'}) — נשמרה לגלריה`);
    } catch (e) {
      setError(e.message || 'שגיאה ביצירת ערכת הדמות');
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
        try { await addToGallery(await srcToBlob(r.src)); } catch { /* noop */ }
      };
      await generateModelAlbum(file, clothing, onResult, { count: 8 });
      await refreshGallery();
      toast('האלבום מוכן ✓ (8 זוויות) — נשמר בגלריה');
    } catch (e) {
      setError(e.message || 'שגיאה ביצירת האלבום');
    } finally {
      setPackBusy(false);
    }
  };

  const toggleSelect = (id) => setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  // Load a gallery image into edit mode → make a variation of the SAME subject (Kontext).
  const makeVariation = async (item) => {
    try {
      const blob = await getGalleryBlob(item.id);
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

  const removeGalleryItem = async (id) => {
    await removeFromGallery(id);
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
      for (const g of ordered) { const b = await getGalleryBlob(g.id); if (b) blobs.push(b); } // eslint-disable-line no-await-in-loop
      const r = await montageFromImages(blobs, {});
      setResult(r);
      toast('הסרטון הורכב!');
    } catch (e) {
      setError(e.message || 'שגיאה בהרכבת הסרטון');
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
        const b = await getGalleryBlob(ordered[i].id); // eslint-disable-line no-await-in-loop
        if (!b) continue;
        const f = new File([b], 'frame.png', { type: b.type || 'image/png' });
        const d = await blobDims(b); // eslint-disable-line no-await-in-loop
        const portrait = d && d.h > d.w;
        const res = portrait ? { width: 512, height: 768 } : { width: 768, height: 512 };
        const r = await ltxVideo(f, prompt, { length: len, ...res }); // eslint-disable-line no-await-in-loop
        setClips((c) => [...c, r]);
        setClipProg(i + 1);
      }
      toast('כל הסרטונים מוכנים ✓');
    } catch (e) {
      setError(e.message || 'שגיאה ביצירת הסרטונים');
    } finally {
      setClipBusy(false);
    }
  };

  const enhance = async () => {
    if (!prompt.trim()) { setError('כתוב קודם בעברית מה אתה רוצה'); return; }
    setEnhancing(true); setError('');
    try {
      const kind = mode === 'inpaint' ? 'inpaint' : mode === 'img2img' ? 'edit' : 'generate';
      const better = await enhanceImagePrompt(prompt, kind);
      setPrompt(better);
    } catch (e) {
      setError(e.message || 'שגיאה בשדרוג הפרומפט');
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
      const r = hasLtxVideo ? await ltxVideo(f, prompt, { length: len, ...res }) : await animateImage(f, {});
      setResult(r);
    } catch (e) {
      setError(e.message || 'שגיאה ביצירת האנימציה');
    } finally {
      setLoading(false);
    }
  };

  const needsImage = mode !== 'text';
  const isVideoMode = mode === 'video' || mode === 'flf';
  const isAlbum = mode === 'album';
  const isCharacter = mode === 'character';
  const isPack = isCharacter || isAlbum; // both stream into the pack grid
  const ctaLabel = isAlbum ? 'צור אלבום 8 זוויות' : isCharacter ? 'צור ערכת דמות' : mode === 'flf' ? 'צור סרטון לפני/אחרי' : mode === 'video' ? 'צור אנימציה' : mode === 'inpaint' ? 'ערוך אזור מסומן' : mode === 'img2img' ? (hasKontextModel ? 'ערוך תמונה' : 'שנה תמונה') : 'צור תמונה עם AI';
  const loadingLabel = isAlbum ? `יוצר אלבום… (${pack.length}/8)` : isCharacter ? `יוצר דמות… (${pack.length}/${packCount})` : isVideoMode ? 'יוצר סרטון… (עד 2-3 דק׳)' : 'מחולל…';
  const ctaBusy = isPack ? packBusy : loading;
  const onCta = isAlbum ? buildAlbum : isCharacter ? buildCharacterPack : run;

  return (
    <div className="studio-hf">
      <SectionHeader
        title={<span className="row gap-2" style={{ display: 'inline-flex', alignItems: 'center' }}><Icon name="wand" size={22} style={{ color: 'var(--lime-deep)' }} /> סטודיו תמונות AI</span>}
        sub="צור תמונות, ערוך תמונות קיימות, והפוך תמונות לאנימציה — מקומי על ה-GPU שלך."
        action={(
          <div className="row gap-2 wrap">
            <button className="btn btn-ghost btn-sm" onClick={() => setMockupOpen(true)}><Icon name="image" size={15} style={{ color: 'var(--lime-deep)' }} /> סטודיו מוקאפים</button>
            {!isImageAiConfigured && <span className="badge badge-neutral"><Icon name="spark" size={12} /> מצב הדגמה</span>}
          </div>
        )}
      />

      <EngineStatus />

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

          {/* Before/after dual uploader (start + end frame → morphing video) */}
          {mode === 'flf' && (
            <div className="field">
              <label>שתי תמונות — המעבר ביניהן יהפוך לסרטון</label>
              <div className="flf-slots">
                <div className="flf-slot">
                  <span className="flf-slot-tag">לפני</span>
                  <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} style={{ display: 'none' }} />
                  <button type="button" className="upload-zone flf-zone" onClick={() => fileRef.current?.click()}>
                    {filePreview ? <img src={filePreview} alt="לפני" className="upload-preview" /> : (
                      <div className="upload-placeholder"><Icon name="image" size={22} /><span>תמונת התחלה</span></div>
                    )}
                  </button>
                </div>
                <div className="flf-arrow"><Icon name="chevronL" size={20} style={{ color: 'var(--lime-deep)' }} /></div>
                <div className="flf-slot">
                  <span className="flf-slot-tag">אחרי</span>
                  <input ref={endRef} type="file" accept="image/*" onChange={pickEndFile} style={{ display: 'none' }} />
                  <button type="button" className="upload-zone flf-zone" onClick={() => endRef.current?.click()}>
                    {endPreview ? <img src={endPreview} alt="אחרי" className="upload-preview" /> : (
                      <div className="upload-placeholder"><Icon name="image" size={22} /><span>תמונת סיום</span></div>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Image uploader (single-image modes) */}
          {needsImage && mode !== 'flf' && (
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

          {/* Prompt (text + img2img + inpaint + LTX video motion) */}
          {mode !== 'character' && mode !== 'album' && (mode !== 'video' || hasLtxVideo) && (
            <div className="field" style={needsImage ? { marginTop: 14 } : undefined}>
              <label>{mode === 'flf' ? 'תיאור המעבר (אופציונלי)' : mode === 'video' ? 'תיאור התנועה (אופציונלי)' : mode === 'inpaint' ? 'מה למלא באזור המסומן?' : mode === 'img2img' ? (hasKontextModel ? 'מה לשנות? (הוראת עריכה)' : 'תיאור היעד (סגנון מחדש)') : 'תיאור התמונה (עברית או אנגלית)'}</label>
              <textarea className="textarea" style={{ minHeight: needsImage ? 80 : 130 }} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={mode === 'flf' ? 'למשל: מעבר חלק, השיער גדל, הרקע משתנה לאט' : mode === 'video' ? 'למשל: המצלמה מתקרבת, השיער מתנופף ברוח, חיוך עדין' : mode === 'inpaint' ? 'כתוב בעברית פשוטה — למשל: רקע חוף ים טרופי' : mode === 'img2img' ? (hasKontextModel ? 'כתוב בעברית פשוטה — למשל: שנה את הרקע לחוף בשקיעה' : 'כתוב בעברית פשוטה — למשל: סגנון ציור שמן') : 'כתוב בעברית פשוטה — למשל: לוגו מודרני לעסק דיגיטלי'} />
              <button type="button" className="btn btn-ghost btn-sm enhance-btn" onClick={enhance} disabled={enhancing} style={{ marginTop: 8 }}>
                {enhancing ? <><span className="loader-ring" style={{ width: 14, height: 14, borderWidth: 2 }} /> משדרג…</> : <><Icon name="spark" size={14} style={{ color: 'var(--lime-deep)' }} /> שדרג לפרומפט מקצועי (עברית → AI)</>}
              </button>
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

          {/* Model picker (text mode) — auto-detected local checkpoints */}
          {mode === 'text' && models.length > 0 && (
            <div className="field" style={{ marginTop: 14 }}>
              <label>מודל ({models.length} מקומיים)</label>
              <div className="row gap-2 wrap" style={{ display: 'flex' }}>
                {models.map((m) => (
                  <button
                    key={m.file}
                    type="button"
                    className={`idea-chip ${modelFile === m.file ? 'idea-chip-active' : ''}`}
                    style={{ flex: '1 1 132px', textAlign: 'center', lineHeight: 1.3, minWidth: 120 }}
                    onClick={() => setModelFile(m.file)}
                    title={m.file}
                  >
                    {m.flux ? '✨' : '⚡'} {m.label}
                    <span className="dim" style={{ display: 'block', fontSize: '0.68rem' }}>{m.flux ? 'FLUX · איכות מקס (~30ש\')' : 'SDXL · מהיר (~10ש\')'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* HD (hires) toggle — SDXL only; Flux is already high quality */}
          {mode === 'text' && !isFluxModel && (
            <button
              type="button"
              className={`idea-chip ${hd ? 'idea-chip-active' : ''}`}
              style={{ marginTop: 10, width: '100%', textAlign: 'center' }}
              onClick={() => setHd((v) => !v)}
            >
              {hd ? '✓ ' : ''}🔍 רזולוציה גבוהה (HD ×1.5) <span className="dim" style={{ fontSize: '0.75rem' }}>(איטי יותר, חד יותר)</span>
            </button>
          )}

          {mode === 'img2img' && hasKontextModel && <p className="muted" style={{ fontSize: '0.82rem', lineHeight: 1.6, marginTop: 6 }}><Icon name="spark" size={13} style={{ color: 'var(--lime-deep)' }} /> מודל עריכה חכם — מבצע רק את השינוי שתבקש ושומר על הדמות, הפנים והקומפוזיציה המקוריים.</p>}

          {mode === 'inpaint' && <p className="muted" style={{ fontSize: '0.82rem', lineHeight: 1.6, marginTop: 6 }}><Icon name="spark" size={13} style={{ color: 'var(--lime-deep)' }} /> מודל ריאליסטי לא-מוגבל (SDXL) — משנה רק את האזור שסימנת, השאר נשאר מדויק. מתאים לאופנה, בגדי ים והחלפת רקע.</p>}

          {mode === 'video' && <p className="muted" style={{ fontSize: '0.84rem', lineHeight: 1.6 }}>{hasLtxVideo ? 'מנוע LTX-Video — סרטון ~4 שניות מהתמונה, עם תנועה לפי התיאור שתכתוב. (~1-2 דק׳ עיבוד)' : 'המודל ייצור תנועה קולנועית עדינה מהתמונה (~25 פריימים).'}</p>}

          {mode === 'flf' && <p className="muted" style={{ fontSize: '0.84rem', lineHeight: 1.6 }}><Icon name="spark" size={13} style={{ color: 'var(--lime-deep)' }} /> מנוע LTX «לפני/אחרי» — הסרטון מתחיל בתמונה הראשונה ומסתיים בשנייה, עם מעבר חלק ביניהן. מושלם לסרטוני שינוי/טרנספורמציה. (~1-2 דק׳ עיבוד)</p>}

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
              {pulidReady && hasKontextModel && (
                <div className="field" style={{ marginTop: 12 }}>
                  <label>מנוע עקביות</label>
                  <div className="row gap-2" style={{ display: 'flex' }}>
                    <button type="button" className={`idea-chip ${packEngine === 'pulid' ? 'idea-chip-active' : ''}`} style={{ flex: 1, textAlign: 'center' }} onClick={() => setPackEngine('pulid')}>✨ PuLID · פנים מדויקות</button>
                    <button type="button" className={`idea-chip ${packEngine === 'kontext' ? 'idea-chip-active' : ''}`} style={{ flex: 1, textAlign: 'center' }} onClick={() => setPackEngine('kontext')}>🎨 Kontext · עריכה</button>
                  </div>
                </div>
              )}
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
                {(pulidReady && packEngine === 'pulid')
                  ? <>PuLID-Flux ייצר {packCount} סצנות חדשות עם <b>אותם הפנים בדיוק</b> (נעילת זהות חזקה) ויישמור בגלריה — משם אפשר להפוך כל אחת לסרטון. כל תמונה ~30-60 שניות.</>
                  : <>FLUX Kontext ייצר {packCount} וריאציות של <b>אותה דמות</b> (זוויות, תנוחות, רקעים) ויישמור אותן בגלריה — משם אפשר להפוך כל אחת לסרטון. כל וריאציה ~30-60 שניות.</>}
              </p>
            </>
          )}

          {error && <div className="login-error" style={{ marginTop: 12 }}><Icon name="x" size={15} strokeWidth={2.4} /> {error}</div>}

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

          {!isPack && !result && !loading && (
            <div className="diag-empty">
              <div className="diag-empty-ico"><Icon name="image" size={30} /></div>
              <h3>{isVideoMode ? 'מנוע הווידאו מוכן' : 'המעבד הגרפי מוכן לפעולה'}</h3>
              <p className="muted">{mode === 'flf' ? 'העלה תמונת «לפני» ו«אחרי» משמאל ולחץ על הכפתור.' : needsImage ? 'העלה תמונה משמאל ולחץ על הכפתור.' : 'הזן תיאור משמאל ולחץ «צור תמונה עם AI».'}</p>
            </div>
          )}

          {!isPack && loading && (
            <div className="diag-empty">
              <span className="loader-ring" style={{ width: 40, height: 40 }} />
              <h3 style={{ marginTop: 14 }}>{isVideoMode ? 'יוצר סרטון…' : 'מחולל את התמונה…'}</h3>
              <p className="muted">{isVideoMode ? 'עיבוד וידאו כבד יותר — עד 2-3 דקות.' : 'זה עשוי לקחת כמה שניות.'}</p>
            </div>
          )}

          {!isPack && result && !loading && (
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
                <span className={`badge ${result.demo ? 'badge-neutral' : 'badge-active'}`}>
                  <span className="dot" />{result.isVideo ? (result.flf ? 'מקומי · לפני/אחרי (LTX)' : result.montage ? 'מקומי · מונטאז׳' : result.ltx ? 'מקומי · וידאו (LTX)' : 'מקומי · אנימציה (SVD)') : result.inpaint ? 'מקומי · עריכת אזור' : result.kontext ? 'מקומי · עריכה (Kontext)' : result.engine === 'gemini' ? 'Nano Banana · Gemini' : result.engine === 'local' ? `מקומי · ${result.modelLabel || (result.quality === 'max' ? 'FLUX.1' : 'SDXL')}` : 'Pollinations · Flux'}
                </span>
                <div className="row gap-2 wrap">
                  {!result.isVideo && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setPosterSrc(result.src)}><Icon name="edit" size={15} style={{ color: 'var(--lime-deep)' }} /> עורך פוסטר (טקסט)</button>
                  )}
                  {!result.isVideo && hasVideoModel && (
                    <button className="btn btn-ghost btn-sm" onClick={animateResult}><Icon name="spark" size={15} style={{ color: 'var(--lime-deep)' }} /> צור אנימציה</button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={run}><Icon name="refresh" size={15} /> צור שוב</button>
                  <button className="btn btn-primary btn-sm" onClick={() => downloadImage(result.src, result.isVideo ? 'artvalue-animation.webp' : 'artvalue-image.png')}><Icon name="download" size={15} /> הורדה</button>
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
          <p className="dim" style={{ fontSize: '0.8rem', margin: '0 0 12px' }}>
            לחץ תמונה לבחירה לסרטון{hasKontextModel ? ' · «↻» יוצר וריאציה של אותה דמות' : ''} · נשמרות עד {GALLERY_MAX} תמונות
          </p>
          <div className="gallery-grid">
            {gallery.map((g) => (
              <div key={g.id} className={`gallery-item ${selectedIds.includes(g.id) ? 'selected' : ''}`} onClick={() => toggleSelect(g.id)}>
                <img src={g.url} alt="" loading="lazy" />
                {selectedIds.includes(g.id) && <span className="gallery-check"><Icon name="check" size={14} strokeWidth={3} /></span>}
                <div className="gallery-actions" onClick={(e) => e.stopPropagation()}>
                  {hasKontextModel && <button className="gallery-btn" title="וריאציה של אותה דמות" onClick={() => makeVariation(g)}><Icon name="refresh" size={13} /></button>}
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

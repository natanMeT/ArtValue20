import { useState } from 'react';
import { SectionHeader } from '../components/ui/atoms.jsx';
import Icon from '../components/ui/Icon.jsx';
import { useStore } from '../store/store.jsx';
import {
  fetchSiteText, analyzeBusiness, runCreativeDirector,
  isGeminiConfigured, MECHANISM_HE, mechanismStyle, toEnglishImagePrompt,
} from '../lib/gemini.js';
import { generateMaxRealism } from '../lib/geminiImage.js';
import { addImage as addToGallery, srcToBlob } from '../lib/galleryStore.js';

// ===================================================================
// סטודיו פרסום — Creative Director Engine (agency-grade, inside AdStudio):
//   אתר → מוח העסק → אסטרטגיה → סיעור מוחות (30 רעיונות) → ניקוד →
//   סינון מקוריות/גיוון/זיכרון → הרחבת זוכים (טיפוגרפיה/אובייקטים) → רנדר.
// ===================================================================
const TARGET = 6;        // final outstanding concepts to render
const BRAINSTORM = 30;   // short ideas generated before any image prompt
const ACCENTS = ['#d4ff3f', '#c7bfff', '#48cae4', '#ff9e7d', '#90e0ef', '#ffd166', '#a0e8af', '#f7a8c4'];
const BRAND = 'Art Value';

const styleOpts = (style) => (
  style === 'minimal' ? { width: 1024, height: 1280, guidance: 3.6, faceDetail: false }
    : style === 'surreal' ? { width: 1024, height: 1280, guidance: 4.2, faceDetail: false }
      : { width: 1024, height: 1280, guidance: 4.0, faceDetail: false }
);

// ---- poster compositor (bakes Hebrew headline + subline onto the PNG) ----
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function wrapLines(ctx, text, maxW, max = 3) {
  const words = (text || '').split(/\s+/).filter(Boolean); const lines = []; let line = '';
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); return lines.slice(0, max);
}
async function composePoster(src, headline, subline, accent) {
  try { await (document.fonts?.ready || Promise.resolve()); } catch { /* noop */ }
  const img = await loadImg(src);
  const W = img.naturalWidth || 1024; const H = img.naturalHeight || 1280;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H * 0.58);
  g.addColorStop(0, 'rgba(8,10,20,0.9)'); g.addColorStop(1, 'rgba(8,10,20,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.58);
  const margin = W * 0.07;
  ctx.direction = 'rtl'; ctx.textAlign = 'right';
  ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = W * 0.02; ctx.shadowOffsetY = W * 0.004;
  const fs = Math.round(W * 0.08);
  ctx.font = `800 ${fs}px "Heebo","Assistant","Arial Hebrew",sans-serif`;
  const lines = wrapLines(ctx, headline, W - margin * 2);
  let y = margin + fs;
  for (const ln of lines) { ctx.fillText(ln, W - margin, y); y += fs * 1.15; }
  // subline
  if (subline) {
    ctx.shadowBlur = W * 0.012; const sf = Math.round(W * 0.04);
    ctx.font = `500 ${sf}px "Heebo","Assistant",sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (const ln of wrapLines(ctx, subline, W - margin * 2, 2)) { ctx.fillText(ln, W - margin, y); y += sf * 1.3; }
  }
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.fillStyle = accent; roundRect(ctx, W - margin - W * 0.18, y - fs * 0.25, W * 0.18, Math.max(5, W * 0.012), W * 0.006); ctx.fill();
  // brand wordmark
  const bm = ctx.createLinearGradient(0, H * 0.82, 0, H); bm.addColorStop(0, 'rgba(8,10,20,0)'); bm.addColorStop(1, 'rgba(8,10,20,0.7)');
  ctx.fillStyle = bm; ctx.fillRect(0, H * 0.82, W, H * 0.18);
  ctx.direction = 'ltr'; ctx.textAlign = 'left';
  ctx.font = `700 ${Math.round(W * 0.034)}px "Heebo","Arial",sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(BRAND, margin, H - margin * 0.7);
  return c.toDataURL('image/png');
}
function triggerDownload(dataUrl, name) { const a = document.createElement('a'); a.href = dataUrl; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }

export default function AdStudio() {
  const { toast } = useStore();
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState('idle'); // idle|scanning|analyzed|strategy|concepts|imaging|done
  const [brand, setBrand] = useState(null);
  const [strategy, setStrategy] = useState(null);
  const [ads, setAds] = useState([]); // accepted concepts (+ src, imgBusy, expand)
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  const busy = ['scanning', 'strategy', 'concepts', 'imaging'].includes(phase);

  const render = async (concept) => {
    const eng = concept.engPrompt || await toEnglishImagePrompt(concept.image_prompt, { typography: concept.useTypography, word: concept.word });
    const r = await generateMaxRealism(eng, styleOpts(mechanismStyle(concept.mechanism)));
    try { await addToGallery(await srcToBlob(r.src)); } catch { /* noop */ }
    return r.src;
  };

  const scan = async () => {
    if (!url.trim()) { setError('הדבק קישור לאתר של העסק'); return; }
    setError(''); setBrand(null); setStrategy(null); setAds([]); setPhase('scanning'); setProgress('קורא את האתר…');
    try {
      const text = await fetchSiteText(url);
      setProgress('מנתח את העסק לעומק…');
      const b = await analyzeBusiness(text, url);
      setBrand(b); setPhase('analyzed'); setProgress('');
      toast('מוח העסק מוכן ✓');
    } catch (e) { setError(e.message || 'שגיאה בסריקת העסק'); setPhase('idle'); setProgress(''); }
  };

  const runDirector = async () => {
    if (!brand) return;
    setError(''); setAds([]); setPhase('strategy');
    // The whole TEXT pipeline (strategy → note → brainstorm → score → dedupe →
    // expand → copy → translate) is the frozen v1 engine. The page only renders.
    let result;
    try {
      result = await runCreativeDirector(brand, {
        target: TARGET, brainstormSize: BRAINSTORM,
        onStage: (ev) => {
          if (ev.phase) setPhase(ev.phase);
          if (ev.message) setProgress(ev.message);
          if (ev.stage === 'strategy:done' && ev.strategy) setStrategy(ev.strategy);
        },
      });
    } catch (e) { setError(e.message || 'שגיאה ביצירת הקמפיין'); setPhase('analyzed'); setProgress(''); return; }

    const top = result.concepts.map((c) => ({ ...c, src: null, imgBusy: false, imgError: '', expand: false }));
    setAds(top);

    // Render each concept (image engine — kept in the page, not the text engine).
    setPhase('imaging');
    for (let i = 0; i < top.length; i += 1) {
      setProgress(`מייצר פוסטר ${i + 1}/${top.length}… (${MECHANISM_HE[top[i].mechanism] || top[i].mechanism})`);
      setAds((p) => p.map((a, idx) => (idx === i ? { ...a, imgBusy: true } : a)));
      try {
        const src = await render(top[i]); // eslint-disable-line no-await-in-loop
        setAds((p) => p.map((a, idx) => (idx === i ? { ...a, src, imgBusy: false } : a)));
      } catch (e) {
        setAds((p) => p.map((a, idx) => (idx === i ? { ...a, imgBusy: false, imgError: e.message || 'נכשל' } : a)));
      }
    }
    setProgress(''); setPhase('done'); toast('הקמפיין מוכן ✓ — נשמר לגלריה');
  };

  const remakeOne = async (i) => {
    setAds((p) => p.map((a, idx) => (idx === i ? { ...a, imgBusy: true, imgError: '' } : a)));
    try { const src = await render(ads[i]); setAds((p) => p.map((a, idx) => (idx === i ? { ...a, src, imgBusy: false } : a))); }
    catch (e) { setAds((p) => p.map((a, idx) => (idx === i ? { ...a, imgBusy: false, imgError: e.message || 'נכשל' } : a))); }
  };
  const copyText = (a) => {
    const txt = `${a.copy?.headline || ''}\n${a.copy?.subline || ''}\n\n${a.copy?.cta || ''}`.trim();
    navigator.clipboard?.writeText(txt).then(() => toast('הטקסט הועתק ✓'), () => toast('ההעתקה נכשלה'));
  };
  const downloadPoster = async (a, i) => {
    if (!a.src) return;
    try { triggerDownload(await composePoster(a.src, a.copy?.headline, a.copy?.subline, ACCENTS[i % ACCENTS.length]), `artvalue-ad-${i + 1}.png`); }
    catch { triggerDownload(a.src, `artvalue-ad-${i + 1}.webp`); }
  };
  const toggleExpand = (i) => setAds((p) => p.map((a, idx) => (idx === i ? { ...a, expand: !a.expand } : a)));
  const reset = () => { setBrand(null); setStrategy(null); setAds([]); setPhase('idle'); setError(''); setProgress(''); };

  return (
    <div className="ad-studio">
      <SectionHeader
        title={<span className="row gap-2" style={{ display: 'inline-flex', alignItems: 'center' }}><Icon name="spark" size={22} style={{ color: 'var(--lime-deep)' }} /> סטודיו פרסום</span>}
        sub="במאי קריאייטיב מקומי: אתר → מוח העסק → אסטרטגיה → גלים של קונספטים מנוקדים → פוסטרים מוגמרים."
        action={brand && (<button className="btn btn-ghost btn-sm" onClick={reset} disabled={busy}><Icon name="refresh" size={14} /> עסק חדש</button>)}
      />

      {!isGeminiConfigured && (
        <div className="engine-status engine-down" style={{ marginBottom: 14 }}>
          <div className="engine-row"><span className="engine-dot" /><span className="engine-label">מנוע הטקסט כבוי — הפעל את Ollama (aya-expanse:8b). אחרת רץ מצב הדגמה.</span></div>
        </div>
      )}

      {/* Scan bar */}
      <div className="card panel ad-scan">
        <div className="ad-scan-row">
          <Icon name="link" size={18} className="muted" />
          <input className="input ad-url" type="url" dir="ltr" placeholder="https://example.com"
            value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !busy) scan(); }} disabled={busy} />
          <button className="btn btn-primary" onClick={scan} disabled={busy || !url.trim()}>
            <Icon name="spark" size={16} /> {phase === 'scanning' ? 'סורק…' : 'סרוק עסק'}
          </button>
        </div>
        {progress && <div className="ad-progress"><span className="spinner-sm" /> {progress}</div>}
        {error && <div className="ad-error">{error}</div>}
      </div>

      {/* מוח העסק */}
      {brand && (
        <div className="ad-analysis">
          <div className="ad-biz-head">
            <span className="ad-biz-kicker"><Icon name="spark" size={14} /> מוח העסק</span>
            <h3>{brand.business}</h3>
            {brand.positioning && <p className="muted">{brand.positioning}</p>}
          </div>
          <div className="ad-cards">
            {brand.cards.map((c, i) => (
              <div key={i} className="card panel ad-card-block" style={{ '--accent': ACCENTS[i % ACCENTS.length] }}>
                <div className="ad-card-title"><span className="ad-card-num">{i + 1}</span>{c.title}</div>
                <p className="ad-card-sum">{c.summary}</p>
              </div>
            ))}
          </div>
          {phase !== 'imaging' && phase !== 'done' && (
            <button className="btn btn-primary btn-lg ad-create-btn" onClick={runDirector} disabled={busy}>
              <Icon name="spark" size={18} /> {phase === 'strategy' || phase === 'concepts' ? 'במאי הקריאייטיב חושב…' : 'הפעל במאי קריאייטיב'}
            </button>
          )}
        </div>
      )}

      {/* אסטרטגיה */}
      {strategy && (
        <div className="card panel ad-strategy">
          <div className="ad-strategy-head"><Icon name="spark" size={15} /> אסטרטגיית קמפיין</div>
          <div className="ad-strategy-grid">
            <div><b>מסר מרכזי</b><span>{strategy.core_message}</span></div>
            <div><b>הבטחה</b><span>{strategy.promise}</span></div>
            <div><b>מסר רגשי</b><span>{strategy.emotional_message}</span></div>
            <div><b>DNA פרסומי</b><span>{strategy.dna}</span></div>
          </div>
          {strategy.triggers && (
            <div className="ad-triggers">
              {Object.entries({ psychological: 'פסיכולוגי', curiosity: 'סקרנות', trust: 'אמון', luxury: 'יוקרה', fomo: 'FOMO' }).map(([k, he]) => (
                strategy.triggers[k] ? <span key={k} className="ad-trigger"><b>{he}:</b> {strategy.triggers[k]}</span> : null
              ))}
            </div>
          )}
        </div>
      )}

      {/* פוסטרים */}
      {ads.length > 0 && (
        <div className="ad-grid">
          {ads.map((a, i) => (
            <div key={i} className="card panel ad-poster" style={{ '--accent': ACCENTS[i % ACCENTS.length] }}>
              <div className="ad-poster-canvas">
                {a.src ? <img src={a.src} alt={a.copy?.headline} loading="lazy" />
                  : a.imgBusy ? <div className="ad-img-ph"><span className="spinner-sm" /> מייצר גרפיקה…</div>
                    : a.imgError ? <div className="ad-img-ph err">⚠ {a.imgError}</div>
                      : <div className="ad-img-ph">בתור…</div>}
                {a.src && (
                  <div className="ad-overlay">
                    <div className="ad-headline">{a.copy?.headline}</div>
                    {a.copy?.subline && <div className="ad-subline">{a.copy.subline}</div>}
                    <span className="ad-underline" />
                    <div className="ad-brand">{BRAND}</div>
                  </div>
                )}
                <span className="ad-mech-badge">{MECHANISM_HE[a.mechanism] || a.mechanism}{a.useTypography ? ` · אות ${a.word}` : ''}</span>
                {a.total != null && <span className="ad-score-badge" title={a.marketing_principle}>{a.total}</span>}
              </div>

              <div className="ad-poster-foot">
                <div className="ad-cta-row">{a.copy?.cta && <span className="ad-cta">{a.copy.cta}</span>}</div>
                <button className={`ad-why ${a.expand ? 'open' : ''}`} onClick={() => toggleExpand(i)}>
                  <Icon name="chevron" size={13} /> {a.expand ? 'הסתר חשיבה' : 'למה זה עובד'}
                </button>
                {a.expand && (
                  <div className="ad-explain">
                    <p><b>הרעיון:</b> {a.core_idea}</p>
                    <p><b>פסיכולוגיה:</b> {a.psychological_principle}</p>
                    <p><b>מטאפורה:</b> {a.visual_metaphor}</p>
                    {a.hero_object && <p><b>אובייקט-גיבור:</b> {a.hero_object}</p>}
                    <p><b>תגובה רגשית:</b> {a.emotional_reaction}</p>
                    {a.marketing_principle && <p><b>עיקרון שיווקי:</b> {a.marketing_principle}</p>}
                    {a.useTypography && <p className="muted"><b>טיפוגרפיה:</b> המילה «{a.word}» כאובייקט פיזי בסצנה</p>}
                  </div>
                )}
                <div className="ad-actions">
                  <button className="ad-act" title="נוסח נוסף (רנדר מחדש)" onClick={() => remakeOne(i)} disabled={a.imgBusy}><Icon name="refresh" size={14} /> נוסח נוסף</button>
                  <button className="ad-act" title="העתק טקסט" onClick={() => copyText(a)}><Icon name="copy" size={14} /> טקסט</button>
                  <button className="ad-act primary" title="הורד פוסטר" onClick={() => downloadPoster(a, i)} disabled={!a.src}><Icon name="download" size={14} /> הורדה</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

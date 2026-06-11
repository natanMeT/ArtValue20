import { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import Icon from '../ui/Icon.jsx';

// Real-font text layers on top of an AI image → crisp, clean, perfect text
// (also in Hebrew). Preview is DOM; export rasterizes to a canvas at the
// image's native resolution so what you see is what you download.

const FONTS = {
  clean: "'Heebo','Assistant',Arial,sans-serif",
  display: "'Arial Black',Impact,'Heebo',sans-serif",
  serif: "Georgia,'Times New Roman',serif",
};
const FONT_LABEL = { clean: 'נקי', display: 'שמן', serif: 'אלגנטי' };

let _uid = 0;
const nid = () => `L${++_uid}`;

const PRESETS = {
  headline: () => ({ id: nid(), text: 'מבצע סוף עונה', nx: 0.5, ny: 0.74, fs: 0.085, color: '#ffffff', weight: 900, align: 'center', font: 'display', bg: null }),
  sub: () => ({ id: nid(), text: 'עד 50% הנחה על כל הקולקציה', nx: 0.5, ny: 0.84, fs: 0.042, color: '#ffffff', weight: 600, align: 'center', font: 'clean', bg: null }),
  cta: () => ({ id: nid(), text: 'לקנייה עכשיו', nx: 0.5, ny: 0.93, fs: 0.038, color: '#0e0e0e', weight: 800, align: 'center', font: 'clean', bg: '#D4FF3F' }),
};

export default function PosterEditor({ src, onClose, onApply }) {
  const [imgUrl, setImgUrl] = useState('');
  const [natural, setNatural] = useState({ w: 1024, h: 1024 });
  const [layers, setLayers] = useState([PRESETS.headline()]);
  const [selId, setSelId] = useState(null);
  const [stage, setStage] = useState({ w: 1, h: 1 });
  const [exporting, setExporting] = useState(false);
  const stageRef = useRef(null);
  const dragRef = useRef(null);

  const sel = layers.find((l) => l.id === selId) || null;

  // Load the source into a same-origin blob URL (avoids canvas taint on export).
  useEffect(() => {
    let revoke = '';
    let alive = true;
    (async () => {
      try {
        const blob = await (await fetch(src)).blob();
        const u = URL.createObjectURL(blob);
        revoke = u;
        if (!alive) return;
        setImgUrl(u);
        const im = new Image();
        im.onload = () => alive && setNatural({ w: im.naturalWidth || 1024, h: im.naturalHeight || 1024 });
        im.src = u;
      } catch {
        if (alive) setImgUrl(src); // fallback (may taint on export)
      }
    })();
    return () => { alive = false; if (revoke) URL.revokeObjectURL(revoke); };
  }, [src]);

  // Track displayed stage size (for px font-size in the preview).
  useEffect(() => {
    const measure = () => { const r = stageRef.current?.getBoundingClientRect(); if (r) setStage({ w: r.width, h: r.height }); };
    measure();
    const ro = new ResizeObserver(measure);
    if (stageRef.current) ro.observe(stageRef.current);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [imgUrl]);

  const patch = (id, p) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const add = (kind) => { const l = PRESETS[kind](); setLayers((ls) => [...ls, l]); setSelId(l.id); };
  const remove = (id) => { setLayers((ls) => ls.filter((l) => l.id !== id)); if (selId === id) setSelId(null); };

  // ---- drag a layer (pointer events, fraction-based) ----
  const onPointerDown = (e, id) => {
    e.stopPropagation();
    setSelId(id);
    const r = stageRef.current.getBoundingClientRect();
    dragRef.current = { id, r };
    e.target.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = dragRef.current; if (!d) return;
    const nx = Math.min(1, Math.max(0, (e.clientX - d.r.left) / d.r.width));
    const ny = Math.min(1, Math.max(0, (e.clientY - d.r.top) / d.r.height));
    patch(d.id, { nx, ny });
  };
  const onPointerUp = () => { dragRef.current = null; };

  // ---- export: draw image + layers onto a canvas at native resolution ----
  const exportPng = useCallback(async (apply) => {
    setExporting(true);
    try {
      const im = new Image();
      await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = imgUrl; });
      const W = im.naturalWidth || natural.w;
      const H = im.naturalHeight || natural.h;
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      ctx.drawImage(im, 0, 0, W, H);
      ctx.textBaseline = 'middle';
      for (const l of layers) {
        const fontPx = l.fs * H;
        ctx.font = `${l.weight} ${fontPx}px ${FONTS[l.font]}`;
        const lines = String(l.text).split('\n');
        const lineH = fontPx * 1.18;
        const cx = l.nx * W;
        const cy = l.ny * H;
        const totalH = lineH * lines.length;
        let widest = 0;
        for (const ln of lines) widest = Math.max(widest, ctx.measureText(ln).width);
        // CTA background pill
        if (l.bg) {
          const padX = fontPx * 0.6;
          const padY = fontPx * 0.34;
          const bw = widest + padX * 2;
          const bh = totalH + padY * 2;
          const bx = cx - bw / 2;
          const by = cy - bh / 2;
          const rad = bh / 2;
          ctx.fillStyle = l.bg;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, rad);
          else ctx.rect(bx, by, bw, bh);
          ctx.fill();
        }
        ctx.fillStyle = l.color;
        ctx.textAlign = l.align;
        const ax = l.align === 'center' ? cx : l.align === 'right' ? cx + widest / 2 : cx - widest / 2;
        let y = cy - totalH / 2 + lineH / 2;
        for (const ln of lines) { ctx.fillText(ln, ax, y); y += lineH; }
      }
      const dataUrl = cv.toDataURL('image/png');
      if (apply && onApply) { onApply(dataUrl); }
      else {
        const a = document.createElement('a');
        a.href = dataUrl; a.download = 'artvalue-poster.png';
        document.body.appendChild(a); a.click(); a.remove();
      }
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert('יצוא נכשל: ' + (e?.message || e));
    } finally {
      setExporting(false);
    }
  }, [imgUrl, layers, natural, onApply]);

  const layerStyle = (l) => {
    const fontPx = l.fs * stage.h;
    return {
      position: 'absolute',
      left: `${l.nx * 100}%`,
      top: `${l.ny * 100}%`,
      transform: 'translate(-50%, -50%)',
      fontFamily: FONTS[l.font],
      fontSize: `${fontPx}px`,
      fontWeight: l.weight,
      color: l.color,
      textAlign: l.align,
      lineHeight: 1.18,
      whiteSpace: 'pre',
      cursor: 'move',
      userSelect: 'none',
      padding: l.bg ? `${fontPx * 0.34}px ${fontPx * 0.6}px` : 0,
      background: l.bg || 'transparent',
      borderRadius: l.bg ? '999px' : 0,
      outline: selId === l.id ? '2px dashed var(--lime-deep)' : 'none',
      outlineOffset: '3px',
      textShadow: l.bg ? 'none' : '0 2px 10px rgba(0,0,0,0.35)',
    };
  };

  return (
    <motion.div className="poster-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="poster-editor card"
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="poster-head">
          <div className="row gap-2" style={{ fontWeight: 800 }}><Icon name="edit" size={18} style={{ color: 'var(--lime-deep)' }} /> עורך פוסטר — טקסט חד ומדויק</div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="סגירה"><Icon name="x" size={18} /></button>
        </div>

        <div className="poster-body">
          {/* ---- stage ---- */}
          <div className="poster-stage-wrap">
            <div className="poster-stage" ref={stageRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onClick={() => setSelId(null)}>
              {imgUrl && <img src={imgUrl} alt="" className="poster-img" draggable={false} />}
              {layers.map((l) => (
                <div
                  key={l.id}
                  style={layerStyle(l)}
                  onPointerDown={(e) => onPointerDown(e, l.id)}
                  onClick={(e) => { e.stopPropagation(); setSelId(l.id); }}
                >
                  {l.text || ' '}
                </div>
              ))}
            </div>
          </div>

          {/* ---- controls ---- */}
          <div className="poster-controls">
            <div className="pc-section">
              <div className="pc-label">הוסף שכבה</div>
              <div className="row gap-2 wrap">
                <button className="btn btn-ghost btn-sm" onClick={() => add('headline')}><Icon name="plus" size={13} /> כותרת</button>
                <button className="btn btn-ghost btn-sm" onClick={() => add('sub')}><Icon name="plus" size={13} /> תת-כותרת</button>
                <button className="btn btn-ghost btn-sm" onClick={() => add('cta')}><Icon name="plus" size={13} /> כפתור</button>
              </div>
            </div>

            {sel ? (
              <div className="pc-section pc-edit">
                <div className="pc-label">עריכת שכבה</div>
                <textarea className="input" rows={2} value={sel.text} onChange={(e) => patch(sel.id, { text: e.target.value })} placeholder="הקלד טקסט… (Enter לשורה חדשה)" />

                <div className="pc-row">
                  <span>גודל</span>
                  <input type="range" min="0.02" max="0.16" step="0.002" value={sel.fs} onChange={(e) => patch(sel.id, { fs: Number(e.target.value) })} />
                </div>

                <div className="pc-row">
                  <span>צבע</span>
                  <input type="color" value={sel.color} onChange={(e) => patch(sel.id, { color: e.target.value })} />
                  <span>רקע כפתור</span>
                  <input type="color" value={sel.bg || '#D4FF3F'} onChange={(e) => patch(sel.id, { bg: e.target.value })} />
                  <button className="btn btn-ghost btn-xs" onClick={() => patch(sel.id, { bg: sel.bg ? null : '#D4FF3F' })}>{sel.bg ? 'בטל רקע' : 'הוסף רקע'}</button>
                </div>

                <div className="pc-row">
                  <span>עובי</span>
                  <div className="seg">
                    {[400, 700, 900].map((w) => <button key={w} className={`seg-btn ${sel.weight === w ? 'on' : ''}`} onClick={() => patch(sel.id, { weight: w })}>{w === 400 ? 'רגיל' : w === 700 ? 'מודגש' : 'שמן'}</button>)}
                  </div>
                </div>

                <div className="pc-row">
                  <span>יישור</span>
                  <div className="seg">
                    {['right', 'center', 'left'].map((a) => <button key={a} className={`seg-btn ${sel.align === a ? 'on' : ''}`} onClick={() => patch(sel.id, { align: a })}>{a === 'right' ? 'ימין' : a === 'center' ? 'מרכז' : 'שמאל'}</button>)}
                  </div>
                </div>

                <div className="pc-row">
                  <span>פונט</span>
                  <div className="seg">
                    {Object.keys(FONTS).map((f) => <button key={f} className={`seg-btn ${sel.font === f ? 'on' : ''}`} onClick={() => patch(sel.id, { font: f })}>{FONT_LABEL[f]}</button>)}
                  </div>
                </div>

                <button className="btn btn-ghost btn-sm pc-del" onClick={() => remove(sel.id)}><Icon name="trash" size={14} /> מחק שכבה</button>
              </div>
            ) : (
              <div className="pc-hint dim">בחר שכבה כדי לערוך, או גרור אותה למיקום על התמונה.</div>
            )}

            <div className="pc-section pc-export">
              <button className="btn btn-primary" disabled={exporting} onClick={() => exportPng(false)}>
                <Icon name="download" size={16} /> {exporting ? 'מייצא…' : 'הורד פוסטר PNG'}
              </button>
              {onApply && <button className="btn btn-ghost" disabled={exporting} onClick={() => exportPng(true)}><Icon name="check" size={16} /> השתמש בתמונה</button>}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

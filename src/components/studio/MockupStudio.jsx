import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Icon from '../ui/Icon.jsx';
import { composeMockup, RATIOS, GRADIENTS } from '../../lib/mockup.js';

const FRAMES = [
  { id: 'browser', label: 'דפדפן' },
  { id: 'laptop', label: 'לפטופ' },
  { id: 'phone', label: 'טלפון' },
  { id: 'clean', label: 'נקי' },
];

export default function MockupStudio({ onClose }) {
  const [img, setImg] = useState(null);
  const [bgImg, setBgImg] = useState(null);
  const [frame, setFrame] = useState('browser');
  const [bg, setBg] = useState('dark');
  const [ratio, setRatio] = useState('wide');
  const [exporting, setExporting] = useState(false);
  const canvasRef = useRef(null);
  const shotInputRef = useRef(null);
  const bgInputRef = useRef(null);

  // redraw whenever any input changes
  useEffect(() => {
    if (canvasRef.current) composeMockup(canvasRef.current, { img, frame, bg, bgImg, ratio });
  }, [img, frame, bg, bgImg, ratio]);

  const loadFile = (file, setter) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { setter(im); };
    im.src = url;
  };

  const onShot = (e) => loadFile(e.target.files?.[0], setImg);
  const onBg = (e) => loadFile(e.target.files?.[0], setBgImg);

  const exportPng = () => {
    if (!img) return;
    setExporting(true);
    try {
      const url = canvasRef.current.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url; a.download = 'artvalue-mockup.png';
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert('יצוא נכשל: ' + (e?.message || e));
    } finally { setExporting(false); }
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
          <div className="row gap-2" style={{ fontWeight: 800 }}><Icon name="image" size={18} style={{ color: 'var(--lime-deep)' }} /> סטודיו מוקאפים — הצגת מסכים ללקוח</div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="סגירה"><Icon name="x" size={18} /></button>
        </div>

        <div className="poster-body">
          <div className="poster-stage-wrap">
            {img ? (
              <canvas ref={canvasRef} className="mockup-canvas" />
            ) : (
              <button className="mockup-drop" onClick={() => shotInputRef.current?.click()}>
                <Icon name="image" size={34} />
                <b>העלה צילום מסך של המערכת</b>
                <span className="dim">צלם מסך (Win+Shift+S), שמור, ובחר כאן — העברית תישאר חדה ב-100%</span>
              </button>
            )}
          </div>

          <div className="poster-controls">
            <div className="pc-section">
              <div className="pc-label">צילום המסך</div>
              <button className="btn btn-ghost btn-sm" onClick={() => shotInputRef.current?.click()}><Icon name="image" size={14} /> {img ? 'החלף צילום מסך' : 'העלה צילום מסך'}</button>
              <input ref={shotInputRef} type="file" accept="image/*" onChange={onShot} hidden />
            </div>

            <div className="pc-section">
              <div className="pc-label">מסגרת מכשיר</div>
              <div className="seg seg-wrap">
                {FRAMES.map((f) => <button key={f.id} className={`seg-btn ${frame === f.id ? 'on' : ''}`} onClick={() => setFrame(f.id)}>{f.label}</button>)}
              </div>
            </div>

            <div className="pc-section">
              <div className="pc-label">פורמט</div>
              <div className="seg seg-wrap">
                {Object.entries(RATIOS).map(([k, v]) => <button key={k} className={`seg-btn ${ratio === k ? 'on' : ''}`} onClick={() => setRatio(k)}>{v.label}</button>)}
              </div>
            </div>

            <div className="pc-section">
              <div className="pc-label">רקע</div>
              <div className="mockup-swatches">
                {Object.entries(GRADIENTS).map(([k, c]) => (
                  <button
                    key={k}
                    className={`mockup-sw ${bg === k && !bgImg ? 'on' : ''}`}
                    style={{ background: `linear-gradient(135deg, ${c[0]}, ${c[1]})` }}
                    onClick={() => { setBg(k); setBgImg(null); }}
                    aria-label={k}
                  />
                ))}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => bgInputRef.current?.click()}><Icon name="image" size={14} /> {bgImg ? 'החלף רקע מהמחשב' : 'רקע מהמחשב / AI'}</button>
              {bgImg && <button className="btn btn-ghost btn-xs" onClick={() => setBgImg(null)}>הסר רקע מותאם</button>}
              <input ref={bgInputRef} type="file" accept="image/*" onChange={onBg} hidden />
            </div>

            <div className="pc-section pc-export">
              <button className="btn btn-primary" disabled={!img || exporting} onClick={exportPng}>
                <Icon name="download" size={16} /> {exporting ? 'מייצא…' : 'הורד מוקאפ PNG'}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

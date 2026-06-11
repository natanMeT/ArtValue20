import { useState, useRef, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { SectionHeader } from '../components/ui/atoms.jsx';
import Icon from '../components/ui/Icon.jsx';
import {
  generateMaxRealism, generatePulidScene, qwenEdit, downloadImage,
  hasFluxModel, hasPulidNode, hasQwenEditNode, checkLocalEngine, localEngineUrl,
} from '../lib/geminiImage.js';
import { addImage as addToGallery, srcToBlob } from '../lib/galleryStore.js';

// ── Pipeline definitions ───────────────────────────────────────────────
// Each pipeline declares: the live node chain (rendered like a ComfyUI graph),
// the tunable knobs (sliders → wired straight into the ComfyUI prompt), and
// on/off toggles. Knob `node` ties a value to a node box so it updates live.

const ASPECTS = [
  { id: 'portrait', label: 'פורטרט', w: 1024, h: 1280 },
  { id: 'tall', label: 'גבוה', w: 1024, h: 1536 },
  { id: 'square', label: 'ריבוע', w: 1024, h: 1024 },
  { id: 'wide', label: 'לרוחב', w: 1280, h: 1024 },
];

const PIPELINES = {
  maxreal: {
    id: 'maxreal', label: 'Max-Realism', sub: 'FLUX · פורטרט ריאליסטי קיצוני', icon: 'wand',
    needsImage: false, hasAspect: true,
    promptLabel: 'תיאור הדמות / הסצנה',
    promptPh: 'למשל: אישה צעירה, תקריב, תאורת חלון רכה, נמשים, רקע בז׳ חמים',
    desc: 'יצירה מטקסט עם הפייפליין שמתאים לרמת תמונת-רפרנס אמיתית: נקבוביות, נמשים, שיער חד, אפס איפור.',
    knobs: [
      { key: 'guidance', label: 'FluxGuidance', min: 1.5, max: 4, step: 0.1, def: 2.5, node: 'guidance', hint: 'נמוך = עור טבעי יותר' },
      { key: 'loraStrength', label: 'Realism LoRA', min: 0, max: 1, step: 0.05, def: 0.55, node: 'lora', hint: 'נמוך = פחות "עריכה חלקה"' },
      { key: 'steps', label: 'Steps', min: 15, max: 40, step: 1, def: 28, node: 'ksampler' },
      { key: 'faceCycle', label: 'FaceDetailer cycle', min: 1, max: 3, step: 1, def: 2, node: 'face', hint: '2 = הכי הרבה טקסטורה' },
      { key: 'faceDenoise', label: 'Face denoise', min: 0.3, max: 0.6, step: 0.05, def: 0.5, node: 'face' },
    ],
    toggles: [
      { key: 'faceDetail', label: 'FaceDetailer (עור)', def: true, node: 'face' },
      { key: 'upscale', label: 'Upscale ×2 (UltraSharp)', def: true, node: 'upscale' },
    ],
    nodes: (p, t) => [
      { id: 'ckpt', title: 'Checkpoint', sub: 'flux1-dev-fp8' },
      { id: 'lora', title: 'Realism LoRA', sub: `strength ${p.loraStrength}`, on: true },
      { id: 'clip', title: 'CLIP Text Encode', sub: 'prompt + photoreal' },
      { id: 'guidance', title: 'FluxGuidance', sub: `${p.guidance}` },
      { id: 'ksampler', title: 'KSampler', sub: `${p.steps} · euler/beta · cfg 1` },
      { id: 'vae', title: 'VAE Decode', sub: '' },
      { id: 'face', title: 'FaceDetailer', sub: `cycle ${p.faceCycle} · denoise ${p.faceDenoise}`, on: t.faceDetail },
      { id: 'upscale', title: '4×-UltraSharp → ½', sub: 'crisp zoom ×2', on: t.upscale },
      { id: 'save', title: 'Save Image', sub: '' },
    ],
  },
  pulid: {
    id: 'pulid', label: 'PuLID', sub: 'דמות עקבית מפנים', icon: 'image',
    needsImage: true, hasAspect: true,
    promptLabel: 'תיאור הסצנה / הפוזה',
    promptPh: 'למשל: full body, סצנת רחוב שעת זהב, לבוש קז׳ואל מודרני',
    desc: 'הזרקת זהות הפנים מהתמונה שתעלה → סצנה חדשה לגמרי עם אותם הפנים בדיוק.',
    knobs: [
      { key: 'weight', label: 'PuLID weight', min: 0.4, max: 1.1, step: 0.05, def: 0.85, node: 'pulid', hint: 'גבוה = דמיון חזק יותר' },
      { key: 'guidance', label: 'FluxGuidance', min: 1.5, max: 4, step: 0.1, def: 3.0, node: 'guidance' },
      { key: 'loraStrength', label: 'Realism LoRA', min: 0, max: 1, step: 0.05, def: 0.6, node: 'lora' },
      { key: 'steps', label: 'Steps', min: 15, max: 40, step: 1, def: 24, node: 'ksampler' },
      { key: 'faceCycle', label: 'FaceDetailer cycle', min: 1, max: 3, step: 1, def: 1, node: 'face' },
      { key: 'faceDenoise', label: 'Face denoise', min: 0.3, max: 0.6, step: 0.05, def: 0.5, node: 'face' },
    ],
    toggles: [
      { key: 'faceDetail', label: 'FaceDetailer (עור)', def: true, node: 'face' },
      { key: 'upscale', label: 'Upscale ×2 (UltraSharp)', def: true, node: 'upscale' },
    ],
    nodes: (p, t) => [
      { id: 'ckpt', title: 'Checkpoint', sub: 'flux1-dev-fp8' },
      { id: 'lora', title: 'Realism LoRA', sub: `strength ${p.loraStrength}`, on: true },
      { id: 'loadface', title: 'Load Face Ref', sub: 'התמונה שהעלית' },
      { id: 'pulid', title: 'Apply PuLID-Flux', sub: `weight ${p.weight} · end 0.8`, on: true },
      { id: 'guidance', title: 'FluxGuidance', sub: `${p.guidance}` },
      { id: 'ksampler', title: 'KSampler', sub: `${p.steps} · euler/beta` },
      { id: 'face', title: 'FaceDetailer', sub: `cycle ${p.faceCycle} · denoise ${p.faceDenoise}`, on: t.faceDetail },
      { id: 'upscale', title: '4×-UltraSharp → ½', sub: 'crisp zoom ×2', on: t.upscale },
      { id: 'save', title: 'Save Image', sub: '' },
    ],
  },
  qwen: {
    id: 'qwen', label: 'Qwen-Edit', sub: 'עריכה בהוראת טקסט', icon: 'edit',
    needsImage: true, hasAspect: false,
    promptLabel: 'מה לשנות בתמונה? (הוראה)',
    promptPh: 'למשל: add a thin gold necklace · change expression to a soft smile · remove makeup',
    desc: 'עריכה לפי הוראת טקסט תוך שמירה מלאה על הזהות. רץ על GGUF Q8 (הגרסה שעובדת על המנוע שלך).',
    knobs: [
      { key: 'steps', label: 'Steps', min: 4, max: 30, step: 1, def: 8, node: 'ksampler', hint: '8 עם Lightning' },
      { key: 'cfg', label: 'CFG', min: 1, max: 6, step: 0.5, def: 1.0, node: 'ksampler' },
      { key: 'shift', label: 'AuraFlow shift', min: 1, max: 6, step: 0.25, def: 3.0, node: 'shift' },
      { key: 'denoise', label: 'Denoise', min: 0.5, max: 1, step: 0.05, def: 1.0, node: 'ksampler', hint: 'נמוך = קרוב למקור' },
    ],
    toggles: [
      { key: 'lightning', label: 'Lightning 8-step (מהיר)', def: true, node: 'lightning' },
    ],
    nodes: (p, t) => [
      { id: 'unet', title: 'UNet GGUF Q8', sub: 'Qwen-Edit-2509' },
      { id: 'lightning', title: 'Lightning-8 LoRA', sub: 'speed', on: t.lightning },
      { id: 'shift', title: 'AuraFlow shift', sub: `${p.shift}` },
      { id: 'cfgnorm', title: 'CFGNorm', sub: '' },
      { id: 'loadimg', title: 'Load Image', sub: 'התמונה שהעלית' },
      { id: 'qencode', title: 'Qwen Edit Encode', sub: 'prompt + source' },
      { id: 'vaeenc', title: 'VAE Encode', sub: 'latent מהמקור' },
      { id: 'ksampler', title: 'KSampler', sub: `${p.steps} · cfg ${p.cfg} · dn ${p.denoise}` },
      { id: 'save', title: 'VAE Decode → Save', sub: '' },
    ],
  },
};

function defaultsFor(pl) {
  const params = {};
  pl.knobs.forEach((k) => { params[k.key] = k.def; });
  const toggles = {};
  pl.toggles.forEach((t) => { toggles[t.key] = t.def; });
  return { params, toggles };
}

// One ComfyUI-style node box.
function NodeCard({ node, active }) {
  const off = node.on === false;
  return (
    <div className={`wf-node ${off ? 'wf-node-off' : ''} ${active ? 'wf-node-hot' : ''}`}>
      <div className="wf-node-bar">{node.title}{off && <span className="wf-node-skip">דילוג</span>}</div>
      {node.sub && <div className="wf-node-sub">{node.sub}</div>}
    </div>
  );
}

export default function WorkflowStudio() {
  const { toast } = useStore();
  const [avail, setAvail] = useState({ maxreal: hasFluxModel, pulid: false, qwen: false });
  const [pipeId, setPipeId] = useState('maxreal');
  const pl = PIPELINES[pipeId];

  const [params, setParams] = useState(() => defaultsFor(PIPELINES.maxreal).params);
  const [toggles, setToggles] = useState(() => defaultsFor(PIPELINES.maxreal).toggles);
  const [aspect, setAspect] = useState('portrait');
  const [prompt, setPrompt] = useState('');
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState('');
  const fileRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [imgReady, setImgReady] = useState(false);
  const [error, setError] = useState('');
  const [hotKnob, setHotKnob] = useState(null);   // which node to highlight while dragging
  const [engineUp, setEngineUp] = useState(null);

  // Detect which pipelines this ComfyUI supports.
  useEffect(() => {
    let alive = true;
    Promise.all([hasPulidNode(), hasQwenEditNode()]).then(([pulid, qwen]) => {
      if (!alive) return;
      setAvail({ maxreal: hasFluxModel, pulid, qwen });
    });
    return () => { alive = false; };
  }, []);

  // Engine status ping.
  useEffect(() => {
    let alive = true;
    const ping = () => checkLocalEngine().then((up) => { if (alive) setEngineUp(up); });
    ping();
    const t = setInterval(ping, 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const switchPipe = (id) => {
    setPipeId(id);
    const d = defaultsFor(PIPELINES[id]);
    setParams(d.params); setToggles(d.toggles);
    setResult(null); setError('');
  };

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFile(f); setFilePreview(URL.createObjectURL(f)); setError('');
  };

  const nodes = useMemo(() => pl.nodes(params, toggles), [pl, params, toggles]);
  const asp = ASPECTS.find((a) => a.id === aspect) || ASPECTS[0];

  const run = async () => {
    if (pl.needsImage && !file) { setError('יש להעלות תמונה תחילה'); return; }
    if (!prompt.trim()) { setError(pipeId === 'qwen' ? 'כתוב מה לשנות' : 'יש להזין תיאור'); return; }
    setLoading(true); setError(''); setResult(null); setImgReady(false);
    try {
      const opts = { ...params, ...toggles };
      if (pl.hasAspect) { opts.width = asp.w; opts.height = asp.h; }
      let r;
      if (pipeId === 'maxreal') r = await generateMaxRealism(prompt, opts);
      else if (pipeId === 'pulid') r = await generatePulidScene(file, prompt, opts);
      else r = await qwenEdit(file, prompt, opts);
      setResult(r);
      if (r?.src) { try { await addToGallery(await srcToBlob(r.src)); } catch { /* noop */ } }
      toast('נוצר ✓ ונשמר לגלריה');
    } catch (e) {
      setError(e.message || 'שגיאה ביצירה');
    } finally {
      setLoading(false);
    }
  };

  const resetKnobs = () => { const d = defaultsFor(pl); setParams(d.params); setToggles(d.toggles); };

  const pipeList = Object.values(PIPELINES).filter((p) => avail[p.id]);

  return (
    <div className="studio-hf wf-studio">
      <SectionHeader
        title={<span className="row gap-2" style={{ display: 'inline-flex', alignItems: 'center' }}><Icon name="wand" size={22} style={{ color: 'var(--lime-deep)' }} /> סטודיו Workflow</span>}
        sub="הפייפליינים של ComfyUI — עם כל הכפתורים — מתוך ה-CRM. כוונן, הרץ, נשמר לגלריה."
        action={(
          <span className={`badge ${engineUp ? 'badge-active' : 'badge-neutral'}`}>
            <span className="dot" /> {engineUp == null ? 'בודק מנוע…' : engineUp ? 'מנוע פעיל' : 'מנוע כבוי'}
          </span>
        )}
      />

      {/* Pipeline picker */}
      <div className="hf-modes">
        {pipeList.map((p) => (
          <button key={p.id} className={`hf-mode ${pipeId === p.id ? 'active' : ''}`} onClick={() => switchPipe(p.id)}>
            <span className="hf-mode-ico"><Icon name={p.icon} size={19} /></span>
            <span className="hf-mode-text">
              <span className="hf-mode-label">{p.label}</span>
              <span className="hf-mode-sub">{p.sub}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="diagnose-grid">
        {/* Controls + node graph */}
        <div className="card panel">
          <div className="panel-title row gap-2" style={{ marginBottom: 6 }}><Icon name={pl.icon} size={18} style={{ color: 'var(--lime-deep)' }} /> {pl.label}</div>
          <p className="muted" style={{ fontSize: '0.84rem', lineHeight: 1.6, marginTop: 0 }}>{pl.desc}</p>

          {/* Image uploader */}
          {pl.needsImage && (
            <div className="field" style={{ marginTop: 8 }}>
              <label>{pipeId === 'pulid' ? 'תמונת פנים (ייחוס)' : 'תמונת מקור'}</label>
              <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} style={{ display: 'none' }} />
              <button type="button" className="upload-zone" onClick={() => fileRef.current?.click()}>
                {filePreview ? <img src={filePreview} alt="מקור" className="upload-preview" /> : (
                  <div className="upload-placeholder"><Icon name="image" size={26} /><span>לחץ להעלאת תמונה</span></div>
                )}
              </button>
            </div>
          )}

          {/* Prompt */}
          <div className="field" style={{ marginTop: 12 }}>
            <label>{pl.promptLabel}</label>
            <textarea className="textarea" style={{ minHeight: 84 }} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={pl.promptPh} />
          </div>

          {/* Aspect */}
          {pl.hasAspect && (
            <div className="field" style={{ marginTop: 6 }}>
              <label>יחס תמונה</label>
              <div className="row gap-2 wrap" style={{ display: 'flex' }}>
                {ASPECTS.map((a) => (
                  <button key={a.id} type="button" className={`idea-chip ${aspect === a.id ? 'idea-chip-active' : ''}`} style={{ flex: 1, textAlign: 'center', minWidth: 70 }} onClick={() => setAspect(a.id)}>
                    {a.label}<span className="dim" style={{ display: 'block', fontSize: '0.66rem' }}>{a.w}×{a.h}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Knobs */}
          <div className="field" style={{ marginTop: 10 }}>
            <div className="row between" style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ margin: 0 }}>כפתורי בקרה</label>
              <button type="button" className="link-btn" onClick={resetKnobs}><Icon name="refresh" size={13} /> ברירת מחדל</button>
            </div>
            <div className="wf-knobs">
              {pl.knobs.map((k) => (
                <div key={k.key} className="wf-knob">
                  <div className="wf-knob-head">
                    <span>{k.label}</span>
                    <span className="wf-knob-val">{params[k.key]}</span>
                  </div>
                  <input
                    type="range" min={k.min} max={k.max} step={k.step} value={params[k.key]}
                    onChange={(e) => setParams((p) => ({ ...p, [k.key]: parseFloat(e.target.value) }))}
                    onMouseDown={() => setHotKnob(k.node)} onMouseUp={() => setHotKnob(null)} onBlur={() => setHotKnob(null)}
                    style={{ width: '100%', accentColor: 'var(--lime-deep)' }}
                  />
                  {k.hint && <span className="dim" style={{ fontSize: '0.7rem' }}>{k.hint}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="row gap-2 wrap" style={{ marginTop: 4 }}>
            {pl.toggles.map((t) => (
              <button key={t.key} type="button" className={`idea-chip ${toggles[t.key] ? 'idea-chip-active' : ''}`} style={{ flex: '1 1 auto', textAlign: 'center' }}
                onClick={() => setToggles((s) => ({ ...s, [t.key]: !s[t.key] }))}>
                {toggles[t.key] ? '✓ ' : ''}{t.label}
              </button>
            ))}
          </div>

          {error && <div className="login-error" style={{ marginTop: 12 }}><Icon name="x" size={15} strokeWidth={2.4} /> {error}</div>}

          <button className="btn btn-primary btn-block" onClick={run} disabled={loading} style={{ marginTop: 14, height: 50, fontSize: '0.98rem' }}>
            {loading ? <><span className="loader-ring" style={{ width: 18, height: 18, borderWidth: 2 }} /> מריץ workflow…</> : <><Icon name="spark" size={18} /> הרץ workflow</>}
          </button>

          {/* Live node graph */}
          <div className="diag-section" style={{ marginTop: 20 }}>
            <div className="diag-section-title row gap-2"><Icon name="filter" size={15} /> הגרף (ComfyUI)</div>
            <div className="wf-graph">
              {nodes.map((n, i) => (
                <div key={n.id} className="wf-graph-step">
                  <NodeCard node={n} active={hotKnob === n.id} />
                  {i < nodes.length - 1 && <span className="wf-arrow">↓</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Result */}
        <div className="card panel diag-result">
          {!result && !loading && (
            <div className="diag-empty">
              <div className="diag-empty-ico"><Icon name="image" size={30} /></div>
              <h3>תצוגת תוצאה</h3>
              <p className="muted">כוונן את הכפתורים משמאל ולחץ «הרץ workflow». התוצאה תיווצר על ה-GPU ותישמר לגלריה.</p>
            </div>
          )}
          {loading && (
            <div className="diag-empty">
              <span className="loader-ring" style={{ width: 40, height: 40 }} />
              <h3 style={{ marginTop: 14 }}>מריץ את ה-workflow…</h3>
              <p className="muted">FLUX/Qwen — בין ~30 שניות לכ-3 דקות, תלוי בהגדרות.</p>
            </div>
          )}
          {result && !loading && (
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="studio-image">
                {!imgReady && <span className="loader-ring" style={{ width: 38, height: 38, position: 'absolute' }} />}
                <img src={result.src} alt="תוצאה" style={{ opacity: imgReady ? 1 : 0, transition: 'opacity 0.4s' }} onLoad={() => setImgReady(true)} />
              </div>
              <div className="row between wrap" style={{ gap: 10 }}>
                <span className="badge badge-active"><span className="dot" /> מקומי · {pl.label}</span>
                <div className="row gap-2 wrap">
                  <button className="btn btn-ghost btn-sm" onClick={run}><Icon name="refresh" size={15} /> הרץ שוב</button>
                  <button className="btn btn-primary btn-sm" onClick={() => downloadImage(result.src, `artvalue-${pipeId}.png`)}><Icon name="download" size={15} /> הורדה</button>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

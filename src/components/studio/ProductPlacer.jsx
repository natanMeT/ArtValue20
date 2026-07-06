import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import Icon from '../ui/Icon.jsx';
import {
  defaultPlacement, clampPlacement, placementToPixels, hasTransparency, applyCleanCutout,
} from '../../lib/productLock.js';

// ===================================================================
// ProductPlacer — Product Lock assisted placement workspace (B1).
// Draws the base/presenter image on a canvas and the product image on
// top of it. The PRODUCT PIXELS ARE NEVER REGENERATED — this component
// only composites: preserve transparency (or apply a simple clean-
// background cutout), let the user drag/scale/rotate, and rasterize an
// exact PNG at the base image's native resolution via ref.exportComposite().
// No network, no ComfyUI, no dependencies. AI seam/shadow blending = B2.
// ===================================================================

const PREVIEW_MAX = 1400; // preview canvas cap; export always uses native resolution

const ProductPlacer = forwardRef(function ProductPlacer({ baseUrl, productUrl }, ref) {
  const canvasRef = useRef(null);
  const baseImgRef = useRef(null);
  const productSrcRef = useRef(null);   // raw product Image
  const productCanvasRef = useRef(null); // processed (cutout-applied) product source
  const dragRef = useRef(null);
  const [baseReady, setBaseReady] = useState(false);
  const [prodVersion, setProdVersion] = useState(0); // bump when processed product changes
  const [placement, setPlacement] = useState(() => defaultPlacement());
  const [cutout, setCutout] = useState(true);
  const [productAlpha, setProductAlpha] = useState(false); // source already transparent

  // Load the base/presenter image.
  useEffect(() => {
    let alive = true;
    setBaseReady(false);
    if (!baseUrl) return undefined;
    const im = new Image();
    im.onload = () => { if (!alive) return; baseImgRef.current = im; setBaseReady(true); };
    im.src = baseUrl;
    return () => { alive = false; };
  }, [baseUrl]);

  // New product image → reset placement to the assisted default.
  useEffect(() => { setPlacement(defaultPlacement()); }, [productUrl]);

  // Load + process the product image (preserve alpha, or clean-bg cutout).
  useEffect(() => {
    let alive = true;
    if (!productUrl) return undefined;
    const im = new Image();
    im.onload = () => {
      if (!alive) return;
      productSrcRef.current = im;
      const c = document.createElement('canvas');
      c.width = im.naturalWidth || 1;
      c.height = im.naturalHeight || 1;
      const ctx = c.getContext('2d');
      ctx.drawImage(im, 0, 0);
      try {
        const pixels = ctx.getImageData(0, 0, c.width, c.height);
        const transparent = hasTransparency(pixels);
        setProductAlpha(transparent);
        if (!transparent && cutout) {
          const cut = applyCleanCutout(pixels);
          pixels.data.set(cut.data);
          ctx.putImageData(pixels, 0, 0);
        }
      } catch { /* pixel access unavailable — keep the raw product as-is */ }
      productCanvasRef.current = c;
      setProdVersion((v) => v + 1);
    };
    im.src = productUrl;
    return () => { alive = false; };
  }, [productUrl, cutout]);

  // Draw base + transformed product at a given resolution onto a context.
  const drawComposite = useCallback((ctx, W, H) => {
    const base = baseImgRef.current;
    const prod = productCanvasRef.current;
    if (!base) return;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(base, 0, 0, W, H);
    if (prod) {
      const px = placementToPixels(placement, W, H, prod.width, prod.height);
      ctx.save();
      ctx.translate(px.cx, px.cy);
      ctx.rotate((px.rotation * Math.PI) / 180);
      ctx.drawImage(prod, -px.w / 2, -px.h / 2, px.w, px.h);
      ctx.restore();
    }
  }, [placement]);

  // Live preview (capped resolution; CSS scales to fit).
  useEffect(() => {
    const canvas = canvasRef.current;
    const base = baseImgRef.current;
    if (!canvas || !base || !baseReady) return;
    const down = Math.min(1, PREVIEW_MAX / Math.max(base.naturalWidth, base.naturalHeight));
    const W = Math.max(1, Math.round(base.naturalWidth * down));
    const H = Math.max(1, Math.round(base.naturalHeight * down));
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    drawComposite(canvas.getContext('2d'), W, H);
  }, [drawComposite, baseReady, prodVersion]);

  // Drag to move the product (canvas coords are LTR regardless of RTL page).
  const onPointerDown = (e) => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, nx: placement.nx, ny: placement.ny };
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    const canvas = canvasRef.current;
    if (!d || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    setPlacement((p) => clampPlacement({
      ...p,
      nx: d.nx + (e.clientX - d.x) / rect.width,
      ny: d.ny + (e.clientY - d.y) / rect.height,
    }));
  };
  const onPointerUp = () => { dragRef.current = null; };

  const nudge = (patch) => setPlacement((p) => clampPlacement({ ...p, ...patch(p) }));

  // Exact export at the base image's NATIVE resolution.
  useImperativeHandle(ref, () => ({
    isReady: () => Boolean(baseReady && productCanvasRef.current),
    exportComposite: () => new Promise((resolve) => {
      const base = baseImgRef.current;
      if (!base || !productCanvasRef.current) { resolve(null); return; }
      const c = document.createElement('canvas');
      c.width = base.naturalWidth || 1;
      c.height = base.naturalHeight || 1;
      drawComposite(c.getContext('2d'), c.width, c.height);
      c.toBlob((blob) => resolve(blob), 'image/png');
    }),
  }), [baseReady, drawComposite]);

  return (
    <div className="product-placer">
      <div className="pp-stage">
        <canvas
          ref={canvasRef}
          className="pp-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
      <div className="pp-controls">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => nudge((p) => ({ scale: p.scale * 1.1 }))} title="הגדל">＋ גודל</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => nudge((p) => ({ scale: p.scale / 1.1 }))} title="הקטן">－ גודל</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => nudge((p) => ({ rotation: p.rotation - 5 }))} title="סובב שמאלה">⟲ זווית</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => nudge((p) => ({ rotation: p.rotation + 5 }))} title="סובב ימינה">⟳ זווית</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPlacement(defaultPlacement())}><Icon name="refresh" size={13} /> איפוס</button>
        {!productAlpha && (
          <button
            type="button"
            className={`idea-chip ${cutout ? 'idea-chip-active' : ''}`}
            style={{ width: 'auto', flex: '0 1 auto', fontSize: '0.76rem', padding: '5px 10px' }}
            onClick={() => setCutout((v) => !v)}
          >
            {cutout ? '✓ ' : ''}הסרת רקע בהיר
          </button>
        )}
      </div>
      <p className="dim pp-hint">גרור את המוצר למיקום הרצוי · כפתורי גודל וזווית לכוונון עדין · המוצר עצמו נשמר ללא שינוי.</p>
    </div>
  );
});

export default ProductPlacer;

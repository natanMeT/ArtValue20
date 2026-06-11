import { forwardRef, useRef, useImperativeHandle, useEffect, useState, useCallback } from 'react';

/**
 * Paint a mask over an image. White strokes = the area to edit (inpaint).
 * Exposes via ref: exportMask() -> Promise<Blob|null>, clear(), hasMask().
 */
const MaskCanvas = forwardRef(function MaskCanvas({ imageUrl, brush = 44 }, ref) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const last = useRef(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    const c = canvasRef.current;
    if (c && dims.w) {
      c.width = dims.w; c.height = dims.h;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      dirty.current = false;
    }
  }, [dims, imageUrl]);

  const toCanvas = useCallback((e) => {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const scale = c.width / rect.width;
    return { x: (e.clientX - rect.left) * scale, y: (e.clientY - rect.top) * scale, r: (brush * scale) / 2 };
  }, [brush]);

  const dot = useCallback((p) => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    if (last.current) { ctx.lineWidth = p.r * 2; ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
    last.current = p; dirty.current = true;
  }, []);

  const down = (e) => { e.preventDefault(); drawing.current = true; last.current = null; canvasRef.current.setPointerCapture?.(e.pointerId); dot(toCanvas(e)); };
  const move = (e) => { if (drawing.current) dot(toCanvas(e)); };
  const up = () => { drawing.current = false; last.current = null; };

  useImperativeHandle(ref, () => ({
    clear() { const c = canvasRef.current; if (c) { c.getContext('2d').clearRect(0, 0, c.width, c.height); dirty.current = false; } },
    hasMask() { return dirty.current; },
    exportMask() {
      return new Promise((resolve) => {
        const c = canvasRef.current;
        if (!c || !dirty.current) { resolve(null); return; }
        const out = document.createElement('canvas');
        out.width = c.width; out.height = c.height;
        const octx = out.getContext('2d');
        octx.fillStyle = '#000000'; octx.fillRect(0, 0, out.width, out.height);
        octx.drawImage(c, 0, 0); // white strokes over black
        out.toBlob((b) => resolve(b), 'image/png');
      });
    },
  }), []);

  return (
    <div className="mask-canvas-wrap">
      <img src={imageUrl} alt="מקור" className="mask-canvas-img" draggable={false} />
      <canvas
        ref={canvasRef}
        className="mask-canvas-layer"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
      />
    </div>
  );
});

export default MaskCanvas;

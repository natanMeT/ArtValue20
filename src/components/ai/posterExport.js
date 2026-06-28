// ===================================================================
// posterExport — bake the VISIBLE final poster (ComfyUI image + Hebrew RTL overlay)
// into a single downloadable PNG, entirely client-side. Mirrors the on-screen
// PosterOverlay (gradient scrim + label / headline / subheadline / CTA) onto a canvas
// at the image's native resolution, then triggers a browser download.
//
// Self-contained: Canvas 2D API + fetch + <a download> only. No model, no provider,
// no store, no persistence. Never regenerates the image — it re-reads the already
// rendered ComfyUI /view PNG bytes (no new render is submitted).
//
// Contract: exportPosterPng({ src, overlay, service }) never throws and resolves to
//   { ok:true } on success, or { ok:false, reason } on failure. Reasons:
//   no_src | no_canvas | image_load_failed | encode_failed | unexpected
//
// Cross-origin: ComfyUI /view sends Access-Control-Allow-Origin:* and we draw a
// same-origin blob URL fetched from it, so the canvas is never tainted.
// ===================================================================

const FONT = '"Heebo","Assistant","Arial Hebrew","Arial",sans-serif';
const str = (v) => String(v == null ? '' : v).trim();

// ---- pure helpers (no DOM — unit-testable) ----

// Characters illegal in filenames on common filesystems (Windows-strict). Space and
// dash are intentionally excluded — whitespace becomes a dash next, dashes collapse.
const ILLEGAL_FILENAME_CHARS = new Set('<>:"/\\|?*'.split(''));

function stripIllegalFilenameChars(s) {
  let out = '';
  for (const ch of s) {
    if (ILLEGAL_FILENAME_CHARS.has(ch) || ch.charCodeAt(0) < 0x20) continue;
    out += ch;
  }
  return out;
}

/**
 * Sanitize a (Hebrew or Latin) service name into a safe PNG filename.
 * Strips filesystem-illegal characters, collapses whitespace to dashes, and
 * falls back to a generic name when nothing usable remains.
 * @returns {string} e.g. "artvalue-poster-מערכת-CRM-חכמה.png" or "artvalue-poster.png"
 */
export function posterPngFilename(service) {
  const clean = stripIllegalFilenameChars(str(service))
    .replace(/\s+/g, '-') // whitespace -> dash
    .replace(/-+/g, '-') // collapse repeats
    .replace(/^-+|-+$/g, '') // trim edge dashes
    .slice(0, 80);
  return clean ? `artvalue-poster-${clean}.png` : 'artvalue-poster.png';
}

/**
 * Greedy word-wrap `text` to `maxW`, clamped to `maxLines` (ellipsis on the last
 * line when truncated). `measure` is injected (text -> width) so this is testable
 * without a real canvas. Returns [] for empty/missing text.
 * @param {(t:string)=>number} measure
 */
export function wrapClamp(measure, text, maxW, maxLines) {
  const words = str(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (line && measure(t) > maxW) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  const cap = Math.max(1, maxLines);
  if (lines.length <= cap) return lines;

  const clamped = lines.slice(0, cap);
  const ell = '…';
  let last = clamped[clamped.length - 1];
  if (measure(last + ell) > maxW) {
    const parts = last.split(' ');
    while (parts.length > 1 && measure(`${parts.join(' ')}${ell}`) > maxW) parts.pop();
    last = parts.join(' ');
  }
  clamped[clamped.length - 1] = last + ell;
  return clamped;
}

// ---- canvas drawing (browser only) ----

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, rr); return; }
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Paint the gradient scrim + the four Hebrew overlay fields onto ctx. Mirrors the
// on-screen PosterOverlay layout (bottom-anchored, RTL, label pill top-end).
function drawOverlay(ctx, overlay, W, H) {
  const o = overlay && typeof overlay === 'object' ? overlay : {};
  const label = str(o.label);
  const headline = str(o.headline);
  const subheadline = str(o.subheadline);
  const cta = str(o.cta);

  // bottom-anchored scrim (mirror of `linear-gradient(to top, .78@0% .45@24% 0@52%)`)
  const g = ctx.createLinearGradient(0, H, 0, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.78)');
  g.addColorStop(0.24, 'rgba(0,0,0,0.45)');
  g.addColorStop(0.52, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';

  const margin = Math.round(W * 0.055);
  const maxTextW = W - margin * 2;
  const rightX = W - margin; // RTL anchor (line start)
  const measureWith = (font) => (t) => { ctx.font = font; return ctx.measureText(t).width; };

  // label pill — top, inline-end (right)
  if (label) {
    const fs = Math.round(W * 0.03);
    ctx.font = `600 ${fs}px ${FONT}`;
    const padX = Math.round(fs * 0.7);
    const padY = Math.round(fs * 0.4);
    const tw = Math.min(ctx.measureText(label).width, W * 0.7 - padX * 2);
    const pillW = tw + padX * 2;
    const pillH = fs + padY * 2;
    const x = rightX - pillW;
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    roundRect(ctx, x, margin, pillW, pillH, pillH / 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, rightX - padX, margin + padY, maxTextW);
  }

  // bottom block: headline -> subheadline -> CTA
  const hFs = Math.round(W * 0.072);
  const sFs = Math.round(W * 0.042);
  const cFs = Math.round(W * 0.038);
  const hFont = `800 ${hFs}px ${FONT}`;
  const sFont = `500 ${sFs}px ${FONT}`;
  const cFont = `700 ${cFs}px ${FONT}`;
  const hLineH = Math.round(hFs * 1.16);
  const sLineH = Math.round(sFs * 1.3);
  const gap = Math.round(W * 0.016);

  const hLines = headline ? wrapClamp(measureWith(hFont), headline, maxTextW, 3) : [];
  const sLines = subheadline ? wrapClamp(measureWith(sFont), subheadline, maxTextW, 2) : [];
  const ctaPadX = Math.round(cFs * 0.7);
  const ctaPadY = Math.round(cFs * 0.35);
  const ctaPillH = cta ? cFs + ctaPadY * 2 : 0;

  let blockH = hLines.length * hLineH;
  if (sLines.length) blockH += gap + sLines.length * sLineH;
  if (cta) blockH += gap + ctaPillH;

  let y = H - margin - blockH;

  // headline + subheadline (white, soft shadow)
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = Math.round(W * 0.006);
  ctx.shadowOffsetY = Math.round(W * 0.0015);
  ctx.fillStyle = '#fff';
  ctx.font = hFont;
  for (const ln of hLines) { ctx.fillText(ln, rightX, y, maxTextW); y += hLineH; }
  if (sLines.length) {
    y += gap;
    ctx.font = sFont;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    for (const ln of sLines) { ctx.fillText(ln, rightX, y, maxTextW); y += sLineH; }
  }

  // CTA pill (white bg, dark text, no shadow) — start-aligned (right in RTL)
  if (cta) {
    y += gap;
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.font = cFont;
    const tw = Math.min(ctx.measureText(cta).width, maxTextW - ctaPadX * 2);
    const pillW = tw + ctaPadX * 2;
    const x = rightX - pillW;
    ctx.fillStyle = '#fff';
    roundRect(ctx, x, y, pillW, ctaPillH, ctaPillH / 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.fillText(cta, rightX - ctaPadX, y + ctaPadY, maxTextW);
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image_load_failed'));
    img.src = url;
  });
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve) => {
    if (!canvas.toBlob) { resolve(null); return; }
    try { canvas.toBlob((b) => resolve(b), 'image/png'); } catch { resolve(null); }
  });
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* noop */ } }, 2000);
}

/**
 * Export the final poster (ComfyUI image + baked Hebrew overlay) as a downloaded PNG.
 * Never throws. Resolves { ok:true } or { ok:false, reason }.
 * @param {{ src:string, overlay?:object, service?:string }} args
 */
export async function exportPosterPng(args) {
  try {
    const { src, overlay, service } = args && typeof args === 'object' ? args : {};
    if (!src || typeof src !== 'string' || !src.trim()) return { ok: false, reason: 'no_src' };
    if (typeof document === 'undefined' || !document.createElement) return { ok: false, reason: 'no_canvas' };

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return { ok: false, reason: 'no_canvas' };

    // Make sure the Hebrew webfont is ready so measurements/lines match what's drawn.
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch { /* noop */ }

    // Primary path: fetch the already-rendered PNG bytes into a same-origin blob URL
    // (taint-proof). Fall back to the raw cross-origin src (ComfyUI sends ACAO:*).
    let blobUrl = '';
    let img;
    try {
      const resp = await fetch(src);
      const blob = await resp.blob();
      blobUrl = URL.createObjectURL(blob);
      img = await loadImage(blobUrl);
    } catch {
      try {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        blobUrl = '';
        img = await loadImage(src);
      } catch {
        return { ok: false, reason: 'image_load_failed' };
      }
    }

    const W = img.naturalWidth || 1024;
    const H = img.naturalHeight || 1280;
    canvas.width = W;
    canvas.height = H;
    ctx.drawImage(img, 0, 0, W, H);
    drawOverlay(ctx, overlay, W, H);
    if (blobUrl) URL.revokeObjectURL(blobUrl);

    const png = await canvasToPngBlob(canvas);
    if (!png) return { ok: false, reason: 'encode_failed' };

    triggerDownload(png, posterPngFilename(service));
    return { ok: true };
  } catch {
    return { ok: false, reason: 'unexpected' };
  }
}

export default exportPosterPng;

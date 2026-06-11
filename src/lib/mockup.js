// ===================================================================
// Mockup compositor — wraps a real screenshot in a device frame
// (browser / laptop / phone / clean) on a styled background, drawn
// entirely on a canvas so the preview IS the export (pixel-perfect,
// real Hebrew text since it's a real screenshot).
// ===================================================================

export const RATIOS = {
  wide: { w: 1600, h: 1000, label: 'מצגת' },
  square: { w: 1200, h: 1200, label: 'ריבוע' },
  story: { w: 1080, h: 1920, label: 'סטורי' },
};

export const GRADIENTS = {
  dark: ['#101014', '#202028'],
  lime: ['#0e0e0e', '#2f4400'],
  purple: ['#190b2e', '#5a2486'],
  blue: ['#06121f', '#0e4377'],
  warm: ['#2b1205', '#8a4416'],
  teal: ['#04201f', '#0c5e57'],
  light: ['#f2f3ed', '#dce0cf'],
};

function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, rad);
  else {
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }
}

function drawBackground(ctx, W, H, bg, bgImg) {
  if (bgImg) {
    const s = Math.max(W / bgImg.naturalWidth, H / bgImg.naturalHeight);
    const dw = bgImg.naturalWidth * s;
    const dh = bgImg.naturalHeight * s;
    ctx.drawImage(bgImg, (W - dw) / 2, (H - dh) / 2, dw, dh);
    return;
  }
  const cols = GRADIENTS[bg] || GRADIENTS.dark;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, cols[0]);
  g.addColorStop(1, cols[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function softShadow(ctx, blur, dy, alpha = 0.4) {
  ctx.shadowColor = `rgba(0,0,0,${alpha})`;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = dy;
}
function clearShadow(ctx) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }

// Draw an offscreen layer onto ctx warped into the quad TL→TR→BR→BL.
// Canvas2D has no perspective, so we subdivide into vertical strips and apply
// a per-strip affine (good approx of a Y-axis rotation). Screenshot stays sharp.
function drawPerspective(ctx, src, TL, TR, BL, BR, steps = 96) {
  const sw = src.width, sh = src.height;
  const lerp = (a, b, t) => a + (b - a) * t;
  for (let i = 0; i < steps; i++) {
    const s0 = i / steps, s1 = (i + 1) / steps;
    const tlx = lerp(TL.x, TR.x, s0), tly = lerp(TL.y, TR.y, s0);
    const trx = lerp(TL.x, TR.x, s1), try_ = lerp(TL.y, TR.y, s1);
    const blx = lerp(BL.x, BR.x, s0), bly = lerp(BL.y, BR.y, s0);
    const sx = s0 * sw;
    const sWidth = (s1 - s0) * sw;
    // sample a touch wider to hide seams between strips (not on the last one)
    const ov = i < steps - 1 ? sw / steps * 0.6 : 0;
    const a = (trx - tlx) / sWidth, b = (try_ - tly) / sWidth;
    const c = (blx - tlx) / sh, d = (bly - tly) / sh;
    ctx.save();
    ctx.setTransform(a, b, c, d, tlx, tly);
    ctx.drawImage(src, sx, 0, sWidth + ov, sh, 0, 0, sWidth + ov, sh);
    ctx.restore();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Y-axis rotation projection of a w×h rect centred at (cx,cy). Returns the
// four projected corners, then shrinks them to stay inside the avail area.
function tiltQuad(cx, cy, w, h, tilt, avail) {
  const hw = w / 2, hh = h / 2;
  const focal = w * 2.4;
  const sin = Math.sin(tilt), cos = Math.cos(tilt);
  const proj = (lx, ly) => {
    const z = lx * sin;
    const scale = focal / (focal + z);
    return { x: cx + lx * cos * scale, y: cy + ly * scale };
  };
  let c = [proj(-hw, -hh), proj(hw, -hh), proj(hw, hh), proj(-hw, hh)]; // TL TR BR BL
  const xs = c.map(p => p.x), ys = c.map(p => p.y);
  const bw = Math.max(...xs) - Math.min(...xs);
  const bh = Math.max(...ys) - Math.min(...ys);
  const fs = Math.min(avail.w / bw, avail.h / bh, 1);
  if (fs < 1) c = c.map(p => ({ x: cx + (p.x - cx) * fs, y: cy + (p.y - cy) * fs }));
  return c;
}

// Compose into `canvas`. opts: { img(HTMLImageElement), frame, bg, bgImg, ratio }
export function composeMockup(canvas, { img, frame = 'browser', bg = 'dark', bgImg = null, ratio = 'wide' }) {
  const R = RATIOS[ratio] || RATIOS.wide;
  const W = R.w; const H = R.h;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  drawBackground(ctx, W, H, bg, bgImg);
  if (!img) return;

  const aspect = (img.naturalWidth || 16) / (img.naturalHeight || 10);
  const pad = Math.min(W, H) * 0.08;
  const availW = W - pad * 2;
  const availH = H - pad * 2;

  // proportional insets (as fractions of content width)
  let cw = availW;
  let ch = cw / aspect;
  const fit = (frameW, frameH) => Math.min(availW / frameW, availH / frameH, 1);

  if (frame === 'clean') {
    let s = fit(cw, ch); cw *= s; ch *= s;
    const fx = (W - cw) / 2; const fy = (H - ch) / 2;
    softShadow(ctx, cw * 0.05, cw * 0.02, 0.45);
    ctx.fillStyle = '#0b0b0d';
    rr(ctx, fx, fy, cw, ch, cw * 0.022); ctx.fill();
    clearShadow(ctx);
    ctx.save(); rr(ctx, fx, fy, cw, ch, cw * 0.022); ctx.clip();
    ctx.drawImage(img, fx, fy, cw, ch); ctx.restore();
    return;
  }

  if (frame === 'browser') {
    const chrome = cw * 0.052;
    const side = cw * 0.0;
    let frameW = cw + side * 2;
    let frameH = ch + chrome;
    const s = fit(frameW, frameH);
    cw *= s; ch *= s;
    const chromeS = cw * 0.052;
    frameW = cw; frameH = ch + chromeS;
    const fx = (W - frameW) / 2; const fy = (H - frameH) / 2;
    const rad = cw * 0.016;
    // window body + shadow
    softShadow(ctx, cw * 0.05, cw * 0.022, 0.45);
    ctx.fillStyle = '#1b1b20';
    rr(ctx, fx, fy, frameW, frameH, rad); ctx.fill();
    clearShadow(ctx);
    ctx.save(); rr(ctx, fx, fy, frameW, frameH, rad); ctx.clip();
    // chrome bar
    ctx.fillStyle = '#2a2a32';
    ctx.fillRect(fx, fy, frameW, chromeS);
    // traffic lights
    const dotR = chromeS * 0.16;
    const cy = fy + chromeS / 2;
    const dcols = ['#ff5f57', '#febc2e', '#28c840'];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = dcols[i];
      ctx.beginPath(); ctx.arc(fx + chromeS * 0.5 + i * dotR * 3, cy, dotR, 0, Math.PI * 2); ctx.fill();
    }
    // url pill
    ctx.fillStyle = '#3a3a44';
    const pillW = frameW * 0.5; const pillH = chromeS * 0.5;
    rr(ctx, fx + (frameW - pillW) / 2, cy - pillH / 2, pillW, pillH, pillH / 2); ctx.fill();
    // screenshot
    ctx.drawImage(img, fx, fy + chromeS, cw, ch);
    ctx.restore();
    return;
  }

  if (frame === 'laptop') {
    const bezel0 = cw * 0.022;
    const baseH0 = cw * 0.055;
    const baseExtra0 = cw * 0.09;
    let frameW = cw + bezel0 * 2 + baseExtra0 * 2;
    let frameH = ch + bezel0 * 2 + baseH0;
    const s = fit(frameW, frameH);
    cw *= s; ch *= s;
    const bezel = cw * 0.022;
    const baseH = cw * 0.055;
    const baseExtra = cw * 0.09;
    const screenW = cw + bezel * 2;
    const screenH = ch + bezel * 2;
    frameW = screenW + baseExtra * 2;
    frameH = screenH + baseH;
    const fx = (W - frameW) / 2; const fy = (H - frameH) / 2;
    const sx = fx + baseExtra;
    // base/deck
    softShadow(ctx, cw * 0.04, cw * 0.02, 0.4);
    ctx.fillStyle = '#c9ced4';
    rr(ctx, fx, fy + screenH, frameW, baseH, baseH * 0.32); ctx.fill();
    clearShadow(ctx);
    // notch on deck
    ctx.fillStyle = '#aeb4ba';
    const nW = frameW * 0.14;
    rr(ctx, fx + (frameW - nW) / 2, fy + screenH, nW, baseH * 0.34, baseH * 0.17); ctx.fill();
    // screen body
    softShadow(ctx, cw * 0.05, cw * 0.02, 0.4);
    ctx.fillStyle = '#0b0b0d';
    rr(ctx, sx, fy, screenW, screenH, cw * 0.014); ctx.fill();
    clearShadow(ctx);
    // screenshot
    ctx.save(); rr(ctx, sx + bezel, fy + bezel, cw, ch, cw * 0.006); ctx.clip();
    ctx.drawImage(img, sx + bezel, fy + bezel, cw, ch); ctx.restore();
    return;
  }

  // phone (force portrait-ish content fit; still works for any aspect).
  // Rendered axis-aligned to an offscreen layer, then perspective-warped so the
  // phone sits at a realistic angle while the screenshot stays pixel-sharp.
  {
    const sideB0 = cw * 0.03;
    const topB0 = cw * 0.055;
    let frameW = cw + sideB0 * 2;
    let frameH = ch + topB0 * 2;
    // leave headroom so the tilt+shadow don't clip against the avail area
    const s = fit(frameW, frameH) * 0.9;
    cw *= s; ch *= s;
    const sideB = cw * 0.03;
    const topB = cw * 0.055;
    frameW = cw + sideB * 2;
    frameH = ch + topB * 2;
    const rad = cw * 0.085;

    // --- build the phone on an offscreen layer (axis-aligned, origin 0,0) ---
    const oc = document.createElement('canvas');
    oc.width = Math.round(frameW); oc.height = Math.round(frameH);
    const octx = oc.getContext('2d');
    octx.fillStyle = '#0b0b0d';
    rr(octx, 0, 0, frameW, frameH, rad); octx.fill();
    octx.save(); rr(octx, sideB, topB, cw, ch, cw * 0.05); octx.clip();
    octx.drawImage(img, sideB, topB, cw, ch); octx.restore();
    // notch
    octx.fillStyle = '#0b0b0d';
    const nW = frameW * 0.3; const nH = topB * 0.5;
    rr(octx, (frameW - nW) / 2, topB * 0.28, nW, nH, nH / 2); octx.fill();

    // --- warp it into a tilted quad on the main canvas ---
    const cx = W / 2, cy = H / 2;
    const corners = tiltQuad(cx, cy, frameW, frameH, 0.16, { w: availW, h: availH });
    const [TL, TR, BR, BL] = corners;
    // soft contact shadow that follows the tilted silhouette
    softShadow(ctx, cw * 0.07, cw * 0.03, 0.5);
    ctx.fillStyle = '#06060a';
    ctx.beginPath();
    ctx.moveTo(TL.x, TL.y); ctx.lineTo(TR.x, TR.y);
    ctx.lineTo(BR.x, BR.y); ctx.lineTo(BL.x, BL.y); ctx.closePath();
    ctx.fill();
    clearShadow(ctx);
    drawPerspective(ctx, oc, TL, TR, BL, BR);
  }
}

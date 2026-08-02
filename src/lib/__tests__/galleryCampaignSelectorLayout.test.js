import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ===================================================================
// Asset Library slice 3 — the campaign selector must be RENDERABLE, not merely
// rendered.
//
// THE DEFECT THIS EXISTS FOR (found in owner QA on Preview 49f3af73, after the
// slice had already been merged and its migration applied):
//
//   `.gallery-item` is `aspect-ratio: 3 / 4` with `overflow: hidden`, and
//   `.gallery-item img` is `height: 100%` — so the image alone consumes the
//   entire tile. Every other control inside the tile (.gallery-actions,
//   .gallery-check) is absolutely positioned for exactly that reason.
//
//   The campaign selector was added as a NORMAL IN-FLOW CHILD of the tile. It
//   began at y=220 inside a 196px box. Measured against the served stylesheet:
//
//       wrapper_top: 194   wrapper_visible_px: 2
//       select_top:  220   select_visible_px: 0
//
//   Present in the DOM, completely clipped, and therefore a feature nobody
//   could reach. The build passed, every unit test passed, and all nine live
//   database controls passed — none of them can see a pixel.
//
// WHAT THIS FILE CAN AND CANNOT DO. There is no DOM renderer in this repo
// (no @testing-library, no jsdom render tests), and adding one for this would
// be a dependency this slice did not ask for. So this file pins the STRUCTURAL
// invariant that makes the clipping impossible — the selector is a SIBLING of
// the tile, never a descendant — and pins the CSS facts that invariant depends
// on. The pixel-level proof is the browser measurement re-run against each new
// Preview; that measurement is the acceptance evidence, and this file is the
// regression guard.
// ===================================================================

const page = readFileSync(new URL('../../pages/ImageStudio.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../styles/app.css', import.meta.url), 'utf8');

const SELECTOR_MARKER = 'galleryStore.setCampaign && (() =>';
const TILE_OPEN = '<div className="gallery-item">';

/**
 * Walk `<div` / `</div>` from the tile's opening tag and return the index just
 * past the `</div>` that closes it. Real depth counting — a regex for
 * "</div>" would match the first inner one and prove nothing.
 */
function indexAfterTileCloses(src) {
  const start = src.indexOf(TILE_OPEN);
  if (start < 0) return -1;
  const tag = /<div\b|<\/div>/g;
  tag.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = tag.exec(src)) !== null) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  return -1;
}

describe('gallery campaign selector · must not live inside the clipped tile', () => {
  it('finds both the tile and the selector in the page', () => {
    // A positive control: if either marker is renamed this file must fail
    // loudly rather than silently pass by matching nothing.
    expect(page).toContain(TILE_OPEN);
    expect(page).toContain(SELECTOR_MARKER);
  });

  it('closes the .gallery-item tile BEFORE the campaign selector begins', () => {
    const tileEnd = indexAfterTileCloses(page);
    const selectorAt = page.indexOf(SELECTOR_MARKER);
    expect(tileEnd).toBeGreaterThan(0);
    expect(selectorAt).toBeGreaterThan(0);
    // THE ASSERTION. If the selector index were inside the tile's span, it
    // would be an in-flow child of an `overflow: hidden` fixed-aspect box and
    // would render with zero visible pixels — the exact QA failure.
    expect(
      selectorAt,
      'the campaign selector is nested INSIDE .gallery-item, which is `overflow: hidden` with a fixed aspect-ratio — it will be clipped to zero visible pixels',
    ).toBeGreaterThan(tileEnd);
  });

  it('wraps the tile and the selector together in one grid cell', () => {
    // Both must still belong to a single keyed cell, or the selector would
    // detach from its image in the grid.
    expect(page).toMatch(/<div key=\{g\.id\} style=\{\{ display: 'grid'/);
    // and the tile itself must no longer carry the React key
    expect(page).not.toContain('<div key={g.id} className="gallery-item">');
  });
});

describe('the CSS facts the structure depends on', () => {
  // Pinned so that if someone later removes the clipping, the reviewer sees
  // that this constraint changed rather than discovering it in QA again.
  const tileRule = (css.split('.gallery-item {')[1] || '').split('}')[0];

  it('.gallery-item still clips its overflow and has a fixed aspect ratio', () => {
    expect(tileRule).toMatch(/overflow:\s*hidden/);
    expect(tileRule).toMatch(/aspect-ratio:\s*3\s*\/\s*4/);
  });

  it('.gallery-item img still fills the whole tile — the reason nothing fits below it', () => {
    expect(css).toMatch(/\.gallery-item img \{[^}]*height:\s*100%/);
  });

  it('this slice did not modify the stylesheet to work around the layout', () => {
    // The fix is structural. If a `.gallery-campaign` rule ever appears here,
    // the approach changed and this file's reasoning no longer applies.
    expect(css).not.toContain('gallery-campaign');
  });
});

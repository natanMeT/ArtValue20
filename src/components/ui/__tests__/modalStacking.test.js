import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stripComments } from '../../../lib/__tests__/support/sourceScan.js';

// ===================================================================
// The dialog must paint ABOVE the app chrome.
//
// THE DEFECT (Production `4294aba9`, 2026-08-02): `.modal-overlay` carries
// `z-index: 100`, the topbar 30 and the sidebar 40 — and the dialog still
// rendered underneath both. z-index only ranks siblings inside a stacking
// context, and every page renders inside App.jsx's page-transition
// `motion.div`, which framer-motion gives `will-change: opacity` — creating a
// stacking context that traps the overlay.
//
// The user-visible symptom was a dialog "cropped at the top": nothing was
// clipped, the header simply sat behind the ~100px topbar. It showed up only
// when the viewport was short enough that `margin: auto` placed the card high;
// a taller window hid it. The bug was always there.
//
// This is a source pin. The real acceptance test is a browser hit-test:
// elementFromPoint over the topbar and the sidebar must return the overlay.
// ===================================================================

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const code = stripComments(read('../Modal.jsx'), 'Modal.jsx');
const css = read('../../../styles/app.css');

describe('the dialog escapes the page-transition stacking context', () => {
  it('renders through a portal to document.body', () => {
    expect(code).toMatch(/createPortal\(/);
    expect(code).toMatch(/document\.body,?\s*\)/);
    expect(code).toMatch(/import \{ createPortal \} from 'react-dom'/);
  });

  it('portals the OVERLAY itself, not something nested inside it', () => {
    // Portalling an inner node would leave the overlay — the thing that has to
    // cover the chrome — inside the trapped context.
    const portalAt = code.indexOf('createPortal(');
    const overlayAt = code.indexOf('className="modal-overlay"');
    expect(portalAt).toBeGreaterThan(-1);
    expect(portalAt).toBeLessThan(overlayAt);
  });
});

describe('the stacking assumptions this fix rests on', () => {
  it('the overlay still outranks the chrome by z-index', () => {
    // The portal only helps because 100 > 40 > 30 once they share a context.
    const z = (sel) => {
      const at = css.indexOf(sel);
      const block = css.slice(at, css.indexOf('}', at));
      const m = block.match(/z-index:\s*(\d+)/);
      return m ? Number(m[1]) : null;
    };
    const overlay = z('.modal-overlay {');
    const sidebar = z('.sidebar {');
    const topbar = z('.topbar {');
    expect(overlay).toBeGreaterThan(sidebar);
    expect(overlay).toBeGreaterThan(topbar);
  });

  it('App.jsx still has the page transition that created the trap', () => {
    // If this goes away the portal is no longer load-bearing — but removing it
    // then still needs the browser hit-test redone, not an assumption.
    expect(stripComments(read('../../../App.jsx'), 'App.jsx')).toMatch(/<AnimatePresence mode="wait"/);
  });
});

describe('nothing else about the dialog changed', () => {
  it('closing behaviour is untouched — the caller still owns it', () => {
    expect(code).toMatch(/onMouseDown=\{onClose\}/);
    expect(code).toMatch(/e\.key === 'Escape' && onClose/);
    expect(code).toMatch(/onMouseDown=\{\(e\) => e\.stopPropagation\(\)\}/);
    expect(code).not.toMatch(/onSave|saving|success/i);
  });

  it('no timer, and the overlay is not made click-through', () => {
    expect(code).not.toMatch(/setTimeout|setInterval/);
    expect(code).not.toMatch(/pointerEvents/);
  });

  it('the animations are exactly as they shipped', () => {
    expect(code).toMatch(/exit=\{\{ opacity: 0 \}\}/);
    expect(code).toMatch(/exit=\{\{ opacity: 0, y: 18, scale: 0\.98 \}\}/);
  });
});

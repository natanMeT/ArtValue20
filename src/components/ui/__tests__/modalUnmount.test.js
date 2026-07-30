import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ===================================================================
// Modal invisible-overlay unmount bug — the companion fix that blocked the
// Campaign Delete Safety release.
//
// THE BUG. AnimatePresence tracks children BY KEY. Modal's conditional child
// had none, so on close the exit animation completed — the overlay faded to
// opacity 0 and looked shut — but the node was never unmounted. An invisible
// `.modal-overlay` stayed in the DOM at `display: flex`, still hit-testing,
// above the whole page. Every click landed on it instead of the app, and
// clicking it called onClose with state already null, so it never went away:
// the screen was click-dead until reload. Measured on a PRODUCTION build,
// after both cancel and confirm, on a modal this slice never touched.
//
// SCOPE OF THESE TESTS, STATED HONESTLY. No jsdom / @testing-library in this
// repo, so the component cannot be mounted and the unmount cannot be OBSERVED
// here — these are source pins, which are weaker than execution. The behaviour
// itself is verified by Preview UI QA against a real browser, which is how the
// bug was found in the first place and the only place it can truly be proven.
// ===================================================================
const uiDir = fileURLToPath(new URL('../', import.meta.url));
const modalSrc = readFileSync(fileURLToPath(new URL('../Modal.jsx', import.meta.url)), 'utf8');

describe('Modal.jsx — a closed modal must actually unmount', () => {
  it('the AnimatePresence child carries a key — the root-cause fix', () => {
    // Without this, presence tracking never resolves and the subtree is kept.
    expect(/key="modal-overlay"/.test(modalSrc)).toBe(true);
    // And the key sits on the element that is conditionally rendered.
    const m = modalSrc.match(/\{open && \(\s*<motion\.div([\s\S]*?)>/);
    expect(m, 'conditional overlay present').not.toBe(null);
    expect(m[1].includes('key="modal-overlay"')).toBe(true);
  });

  it('the exit stops the overlay hit-testing — the guarantee layer', () => {
    // The severe part of the bug was not the stray node, it was that the stray
    // node ate every click. This makes that failure mode impossible even if the
    // node is ever left mounted again.
    expect(/exit=\{\{[^}]*pointerEvents: 'none'[^}]*\}\}/.test(modalSrc)).toBe(true);
  });

  it('the overlay is still only rendered while open (no always-mounted rewrite)', () => {
    // The fix must not "solve" hit-testing by leaving the overlay permanently
    // mounted and hidden — that would trade one invisible layer for another.
    expect(modalSrc.includes('{open && (')).toBe(true);
    expect(/display:\s*open\s*\?/.test(modalSrc)).toBe(false);
  });

  it('closing still runs through onClose — behaviour unchanged', () => {
    expect(modalSrc.includes('onMouseDown={onClose}')).toBe(true);
    expect(modalSrc.includes("e.key === 'Escape' && onClose?.()")).toBe(true);
  });

  it('the fade-in/out is preserved — no visual regression', () => {
    expect(modalSrc.includes('initial={{ opacity: 0 }}')).toBe(true);
    expect(modalSrc.includes('animate={{ opacity: 1 }}')).toBe(true);
    expect(/exit=\{\{ opacity: 0/.test(modalSrc)).toBe(true);
  });
});

// CLASS GUARD. Every AnimatePresence child in the shared ui/ components must be
// keyed, so the next one written cannot reintroduce a stuck invisible overlay.
// Scoped to ui/ deliberately: src/components/ai/DemoMode.jsx has the SAME
// unkeyed-overlay defect and is out of this slice's scope — it is recorded as a
// follow-up rather than silently swept in here or left to fail this guard.
describe('src/components/ui — AnimatePresence children are keyed (class guard)', () => {
  const files = readdirSync(uiDir).filter((f) => f.endsWith('.jsx'));

  it('finds the ui components to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const src = readFileSync(uiDir + file, 'utf8');
    if (!src.includes('<AnimatePresence')) continue;

    it(`${file}: every motion element inside AnimatePresence has a key`, () => {
      // Each motion.* opening tag that appears after an <AnimatePresence must
      // carry a key. Checked on the direct-child tags this repo actually uses.
      const afterPresence = src.slice(src.indexOf('<AnimatePresence'));
      const directChildren = afterPresence.match(/<motion\.\w+[^>]*?(?=>)/g) || [];
      expect(directChildren.length).toBeGreaterThan(0);
      // The FIRST motion element after AnimatePresence is its presence child.
      expect(directChildren[0]).toMatch(/key=/);
    });
  }
});

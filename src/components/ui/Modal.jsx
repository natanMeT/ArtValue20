import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

// ===================================================================
// THE OVERLAY IS PORTALLED TO document.body — READ THIS BEFORE REMOVING IT.
//
// THE DEFECT IT FIXES (measured on Production `4294aba9`, 2026-08-02): the
// dialog rendered UNDERNEATH the topbar and the sidebar. `.modal-overlay` has
// `z-index: 100`, the topbar has 30 and the sidebar 40 — and it still lost,
// because z-index only ranks siblings WITHIN a stacking context. Every page
// renders inside App.jsx's page-transition `motion.div`, which framer-motion
// gives `will-change: opacity`; that CREATES A STACKING CONTEXT. The overlay's
// 100 was therefore scoped to that context, and the whole context paints below
// the chrome, which lives in the root context.
//
// Proven by hit-testing rather than by reading CSS — with the dialog open,
// `document.elementFromPoint` over the topbar and over the sidebar returned
// `.topbar` and `.nav-item`, NOT the overlay, while the centre of the content
// area did return the overlay.
//
// WHY IT LOOKED LIKE THE DIALOG WAS "CROPPED AT THE TOP". Nothing was clipped:
// the header sat at y≈21-104 and the topbar is ~100px tall, so the title and
// the ✕ were simply covered. Measured internals were all correct — card top 20,
// height 723.3 against a 723.333px max-height, head/body/foot summing exactly
// to the card height, and the body scrolling properly. A taller viewport hides
// the symptom, because `margin: auto` then centres the card below the topbar —
// which is why full-screen "fixed" it and why it reproduced at 815x763. THE BUG
// IS ALWAYS PRESENT; only its visibility depends on the viewport.
//
// WHY A PORTAL IS THE RIGHT TOOL HERE. Stacking contexts are determined by the
// DOM tree, so moving the node to <body> takes the overlay out of the
// page-transition context and lets `z-index: 100` compete at document level.
// (A portal does NOT change the React tree, which is why it is useless against
// React-lifecycle problems — but painting order is not one of those.)
//
// ACCEPTANCE CRITERION, true at ANY viewport size and independent of animation:
// with the dialog open, elementFromPoint over the topbar and over the sidebar
// must return the overlay. If it returns `.topbar` or `.nav-item`, this fix has
// been undone.
// ===================================================================

export default function Modal({ open, onClose, title, subtitle, children, footer, maxWidth = 560 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          onMouseDown={onClose}
        >
          <motion.div
            className="modal-card card"
            style={{ maxWidth }}
            initial={{ opacity: 0, y: 26, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <h3 style={{ fontSize: '1.18rem' }}>{title}</h3>
                {subtitle && <p className="muted" style={{ fontSize: '0.85rem', marginTop: 3 }}>{subtitle}</p>}
              </div>
              <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="סגירה">
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-foot">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

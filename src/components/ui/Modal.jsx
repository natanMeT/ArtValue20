import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import Icon from './Icon.jsx';

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

  return (
    // ===================================================================
    // WHY THE key AND THE exit pointerEvents EXIST — do not remove either.
    //
    // THE BUG THEY FIX. AnimatePresence tracks its children BY KEY. This
    // conditional child had none, so on close the exit animation ran to
    // completion — the overlay faded to opacity 0 and looked shut — but the
    // node was NEVER UNMOUNTED. An invisible `.modal-overlay` stayed in the
    // DOM at `display: flex`, still hit-testing, on top of the whole page.
    // Every click then landed on the overlay instead of the app, and clicking
    // it called onClose with state already null, so nothing changed and it
    // never went away: THE SCREEN WAS CLICK-DEAD UNTIL RELOAD. It reproduced
    // on a production build, on every modal in the product, after both cancel
    // and confirm. `Toaster` never had it — it keys its children by id.
    //
    // TWO LAYERS, DELIBERATELY.
    //   1. `key` is the ROOT-CAUSE fix: presence tracking now resolves and the
    //      subtree actually unmounts.
    //   2. `pointerEvents: 'none'` in `exit` is the GUARANTEE: the instant a
    //      close begins, the overlay stops intercepting input — even if a
    //      future framer-motion change, a stalled child animation or a dropped
    //      exit callback ever leaves the node mounted again. The severe part of
    //      this bug was never the stray node; it was that the stray node ate
    //      every click. Layer 2 makes that specific failure impossible to
    //      reintroduce silently.
    // ===================================================================
    <AnimatePresence>
      {open && (
        <motion.div
          key="modal-overlay"
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, pointerEvents: 'none' }}
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
    </AnimatePresence>
  );
}

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
    </AnimatePresence>
  );
}

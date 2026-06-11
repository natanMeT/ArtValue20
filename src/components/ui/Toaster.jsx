import { AnimatePresence, motion } from 'framer-motion';
import { useToasts } from '../../store/store.jsx';
import Icon from './Icon.jsx';

export default function Toaster() {
  const { toasts, dismissToast } = useToasts();
  return (
    <div className="toaster">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className={`toast toast-${t.kind}`}
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => dismissToast(t.id)}
          >
            <span className="toast-ico">
              <Icon name={t.kind === 'error' ? 'x' : 'check'} size={15} strokeWidth={2.4} />
            </span>
            <span>{t.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

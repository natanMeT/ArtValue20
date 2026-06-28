import { motion } from 'framer-motion';

// Centralized animation settings — keep timings consistent everywhere.
// Tuned slow + soft for a luxurious, calm entrance (gentle ease-out, longer fades).
const SOFT = [0.16, 1, 0.3, 1]; // very gentle ease-out (easeOutExpo-like)

export const stagger = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05, delayChildren: 0 },
  },
};

export const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: SOFT },
  },
};

export const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 1.08, ease: SOFT } },
};

// Stagger container — children using <Reveal> enter in sequence.
export function StaggerGroup({ children, className, style }) {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className={className} style={style}>
      {children}
    </motion.div>
  );
}

// Single item inside a StaggerGroup.
export function Reveal({ children, className, style, ...rest }) {
  return (
    <motion.div variants={fadeUp} className={className} style={style} {...rest}>
      {children}
    </motion.div>
  );
}

// Scroll-triggered reveal using whileInView (built on useInView under the hood).
export function ScrollReveal({ children, className, style, delay = 0, y = 26 }) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 1.2, ease: SOFT, delay }}
    >
      {children}
    </motion.div>
  );
}

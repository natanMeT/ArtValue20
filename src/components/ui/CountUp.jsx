import { useEffect, useRef, useState } from 'react';
import { useMotionValue, animate, useInView } from 'framer-motion';

// Count-up number using useMotionValue + animate.
// `format` maps the raw number to a display string.
export default function CountUp({ value = 0, duration = 1.4, format = (n) => Math.round(n).toLocaleString('he-IL'), className }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(format(0));

  useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(format(v)),
    });
    return controls.stop;
  }, [inView, value, duration]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}

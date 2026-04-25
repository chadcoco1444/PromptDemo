'use client';

import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useRef, type ButtonHTMLAttributes } from 'react';

export interface MagneticButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Magnetic strength — fraction of cursor offset the button moves toward. 0.4 default. */
  strength?: number;
  /** Activation radius in px. Outside this, the button stays at rest. */
  radius?: number;
}

/**
 * v2.1 Phase 4 — Magnetic primary button. Tracks the cursor when it enters
 * the activation radius and translates toward it via a spring (no jitter,
 * no overshoot). On leave, springs back to (0,0). Keyboard users see a
 * normal button — no pointer translate is applied without a real pointer.
 *
 * Why framer-motion: useMotionValue + useSpring gives us interruptible
 * spring physics for free — clicking mid-translate doesn't snap, the
 * existing trajectory continues smoothly into the next state.
 */
export function MagneticButton({
  strength = 0.4,
  radius = 80,
  className = '',
  children,
  style,
  ...rest
}: MagneticButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 200, damping: 18, mass: 0.4 });
  const springY = useSpring(y, { stiffness: 200, damping: 18, mass: 0.4 });

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > radius) {
      x.set(0);
      y.set(0);
      return;
    }
    x.set(dx * strength);
    y.set(dy * strength);
  }

  function onPointerLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.button
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      style={style ? { ...style, x: springX, y: springY } as never : { x: springX, y: springY }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={className}
      {...(rest as Record<string, unknown>)}
    >
      {children}
    </motion.button>
  );
}

import type { ReactNode } from 'react';

/**
 * Reusable visual backdrop for landing-page sections. Layers two violet
 * radial blooms over a near-black base, with a subtle 40px grid pattern
 * overlay. Decorative only — children render above the gradient.
 */
export interface LandingBackdropProps {
  children?: ReactNode;
  className?: string;
}

export function LandingBackdrop({ children, className = '' }: LandingBackdropProps) {
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        background:
          'radial-gradient(circle at 25% 50%, rgba(109, 40, 217, 0.45), transparent 60%),' +
          ' radial-gradient(circle at 80% 30%, rgba(167, 139, 250, 0.25), transparent 50%),' +
          ' #0a0a0a',
      }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-70 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(167, 139, 250, 0.06) 1px, transparent 1px),' +
            ' linear-gradient(90deg, rgba(167, 139, 250, 0.06) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

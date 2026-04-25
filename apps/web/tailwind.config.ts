import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        // v2.1 Phase 4 — Inter via next/font, exposed as --font-inter on <html>
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#6d28d9',
          600: '#5b21b6',
          700: '#5b21b6',
          800: '#4c1d95',
          900: '#3b1684',
        },
      },
      keyframes: {
        'shake-x': {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-4px)' },
          '50%': { transform: 'translateX(4px)' },
          '75%': { transform: 'translateX(-2px)' },
        },
        'chip-pop': {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.06)' },
          '100%': { transform: 'scale(1)' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(2px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // v2.1 Phase 4 — breathing pulse for active StageRail node.
        // Glow halo expands + fades on a 1.6s loop, slow enough to read as
        // "alive" without pulling the eye away from the message.
        'breathe-glow': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgb(109 40 217 / 0.5)' },
          '50%': { boxShadow: '0 0 0 8px rgb(109 40 217 / 0)' },
        },
      },
      animation: {
        'shake-x': 'shake-x 220ms ease-in-out',
        'chip-pop': 'chip-pop 180ms ease-out',
        'fade-in': 'fade-in 200ms ease-out',
        'breathe-glow': 'breathe-glow 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;

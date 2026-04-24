import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
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
      },
      animation: {
        'shake-x': 'shake-x 220ms ease-in-out',
        'chip-pop': 'chip-pop 180ms ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;

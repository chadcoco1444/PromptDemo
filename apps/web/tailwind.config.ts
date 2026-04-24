import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f3ff',
          500: '#6d28d9',
          700: '#5b21b6',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;

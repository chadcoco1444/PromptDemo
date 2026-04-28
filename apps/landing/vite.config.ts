import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages D1: subpath under chadcoco1444.github.io/LumeSpec/.
  // Change to '/' when D2 custom domain wired (see spec D1→D2 migration).
  base: '/LumeSpec/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
  },
});

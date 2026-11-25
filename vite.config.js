// Vite builds the app into dist/. On GitHub Pages the site lives under /money-hq/, so assets use that base.
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/money-hq/' : '/',
  // Only variables starting with VITE_ reach the browser. The Supabase secret key must never be one of them.
  envPrefix: 'VITE_',
  server: { port: 5173, strictPort: true },
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
}));

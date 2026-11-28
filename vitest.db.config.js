// Real-database tests (tests/integration), run with `npm run test:db`. They use the separate TEST Supabase
// project from .env.test.local and skip themselves until it's set up. Never your real project.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.js'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});

// Browser tests for Money HQ: the real app in a real (Chromium) browser, at laptop and phone sizes, talking to a
// FAKE Supabase on this computer (tests/e2e/fake-supabase.mjs) that holds only made-up data.
// Safety: the app is started with the fake's address (never your real project), every request to supabase.co
// is blocked and fails the test, and the fake must answer with its marker before any test runs.
// Run: npm run test:e2e   (see TESTING.md)
import { defineConfig, devices } from '@playwright/test';

export const FAKE_PORT = 54329;
export const APP_PORT = 5175;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /.*\.spec\.js$/,
  timeout: 45_000,
  fullyParallel: false,
  workers: 1, // one fake database shared by the tests, reset before each one
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  globalSetup: './tests/e2e/global-setup.mjs',
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: `node tests/e2e/fake-supabase.mjs ${FAKE_PORT}`,
      url: `http://127.0.0.1:${FAKE_PORT}/__test/whoami`,
      reuseExistingServer: false,
    },
    {
      // The app with the fake's address. These values override .env.local for this run only.
      command: `npx vite --port ${APP_PORT} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${APP_PORT}`,
      reuseExistingServer: false,
      env: { VITE_SUPABASE_URL: `http://127.0.0.1:${FAKE_PORT}`, VITE_SUPABASE_PUBLISHABLE_KEY: 'fake-publishable-key-local-tests-only', MONEY_HQ_TEST: '1' },
    },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});

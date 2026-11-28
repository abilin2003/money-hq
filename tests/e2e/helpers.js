// Shared steps for the browser tests: a fixture that blocks any request to a real Supabase project (and fails
// the test if one is attempted), resets the fake database before each test, and signs in as the test user.
import { test as base, expect } from '@playwright/test';
import { TEST_USER, IDS } from './seed.mjs';

export const FAKE = 'http://127.0.0.1:54329';
export { expect, IDS };

export const test = base.extend({
  page: async ({ page }, use) => {
    const blocked = [];
    // Safety: nothing may reach a real Supabase project during tests.
    await page.route(/supabase\.(co|in)/, (route) => { blocked.push(route.request().url()); return route.abort(); });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await fetch(`${FAKE}/__test/reset`, { method: 'POST' });
    await use(page);
    expect(blocked, 'requests to a real Supabase project were attempted').toEqual([]);
    expect(errors, 'uncaught errors in the page').toEqual([]);
  },
});

export async function signIn(page) {
  await page.goto('/');
  await page.locator('#email').fill(TEST_USER.email);
  await page.locator('#password').fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('main .page')).toBeVisible({ timeout: 15_000 });
}

// What the fake database holds right now (the "is it really saved?" check).
export const fakeState = async () => (await fetch(`${FAKE}/__test/state`)).json();
export const failNext = (table, method) => fetch(`${FAKE}/__test/fail`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ table, method }) });

// Fill the Add form's common fields.
export async function fillSpend(page, { amount, where, category, account = 'Test Bank' }) {
  await page.goto('/#add');
  await page.getByLabel('Amount', { exact: true }).fill(amount);
  await page.getByLabel('Where', { exact: true }).fill(where);
  if (category) await page.getByLabel('Category', { exact: true }).selectOption({ label: category });
  await page.getByLabel('Paid with', { exact: true }).selectOption({ label: account });
}

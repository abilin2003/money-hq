// Browser tests for the app shell and the Data screen. Run with: npm test
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resetDb, file } from './helpers.js';

// Obviously fake test backup, made by version 1 of the app (restoring it also tests the migration).
const fakeBackup = {
  app: 'money-hq',
  schemaVersion: 1,
  exported: '2026-11-01T09:00:00.000Z',
  data: {
    schemaVersion: 1,
    settings: {},
    transactions: [
      { id: 'test-1', date: '2026-10-01', desc: 'Test shop A', amount: 1 },
      { id: 'test-2', date: '2026-10-02', desc: 'Test shop B', amount: 2 },
    ],
    closedMonths: [],
    pots: [],
  },
};

const VIEWS = ['home', 'add', 'transactions', 'import', 'data'];

test.beforeEach(async ({ page }) => {
  await resetDb(page);
});

test('every screen loads with no console errors and no sideways scrolling', async ({ page }, testInfo) => {
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Am I okay?' })).toBeVisible();
  for (const view of VIEWS) {
    await page.locator(`.tabs [data-view="${view}"]`).click();
    await expect(page.locator(`#view-${view}`)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${view} on ${testInfo.project.name} should not scroll sideways`).toBeLessThanOrEqual(0);
  }
  expect(errors).toEqual([]);
});

test('everything you can tap is at least 44px tall, on every screen', async ({ page }) => {
  for (const view of VIEWS) {
    await page.goto(`/#${view}`);
    await expect(page.locator(`#view-${view}`)).toBeVisible();
    const tooSmall = await page.evaluate(() => {
      const found = [];
      for (const el of document.querySelectorAll('button, select, label.btn, input:not([type=hidden]):not([type=file]):not([type=checkbox])')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.height < 43.5 || r.width < 43.5) found.push(`${el.tagName.toLowerCase()}#${el.id || el.className || el.textContent.trim().slice(0, 20)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return found;
    });
    expect(tooSmall, `small tap targets on ${view}`).toEqual([]);
  }
});

test('download backup gives a .json file that holds the saved data', async ({ page }) => {
  await page.goto('/#data');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download backup' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^money-hq-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const saved = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(saved.app).toBe('money-hq');
  expect(saved.schemaVersion).toBe(2);
  await expect(page.locator('#fact-backup')).not.toHaveText('Never');
});

test('restore asks twice before replacing data, then keeps the data after reload', async ({ page }) => {
  await page.goto('/#data');
  await page.locator('#file-restore').setInputFiles(file('money-hq-backup-test.json', JSON.stringify(fakeBackup), 'application/json'));

  const panel = page.locator('#restore-panel');
  await expect(panel).toBeVisible();
  await expect(page.locator('#restore-info')).toContainText('2 transactions');

  const confirm = page.locator('#btn-restore');
  await confirm.click();
  await expect(confirm).toHaveText('Tap again to replace my data');
  await expect(page.locator('#fact-tx')).toHaveText('0');

  await confirm.click();
  await expect(panel).toBeHidden();
  await expect(page.locator('#fact-tx')).toHaveText('2');

  await page.reload();
  await expect(page.locator('#fact-tx')).toHaveText('2');
  await expect(page.locator('#fact-schema')).toHaveText('2');
});

test('a file that is not a Money HQ backup is refused with a clear message', async ({ page }) => {
  await page.goto('/#data');
  await page.locator('#file-restore').setInputFiles(file('money-hq-backup-broken.json', '{"hello": "world"}', 'application/json'));
  await expect(page.locator('#status')).toHaveText("That file isn't a Money HQ backup.");
  await expect(page.locator('#restore-panel')).toBeHidden();
});

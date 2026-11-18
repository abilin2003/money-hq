// Browser tests for the Phase 0 screen. Run with: npm test
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Obviously fake test backup.
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

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('money-hq');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  }));
  await page.reload();
});

test('page loads with no console errors and no sideways scrolling', async ({ page }, testInfo) => {
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Am I okay?' })).toBeVisible();
  await expect(page.locator('#fact-tx')).toHaveText('0');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${testInfo.project.name} should not scroll sideways`).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('buttons are at least 44px tall', async ({ page }) => {
  await page.goto('/');
  const buttons = [page.locator('#btn-download'), page.locator('label[for="file-restore"]')];
  for (const button of buttons) {
    const box = await button.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test('download backup gives a .json file that holds the saved data', async ({ page }) => {
  await page.goto('/');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download backup' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^money-hq-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const saved = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(saved.app).toBe('money-hq');
  expect(saved.schemaVersion).toBe(1);
  await expect(page.locator('#fact-backup')).not.toHaveText('Never');
});

test('restore asks twice before replacing data, then keeps the data after reload', async ({ page }) => {
  await page.goto('/');
  await page.locator('#file-restore').setInputFiles({
    name: 'money-hq-backup-test.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fakeBackup)),
  });

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
});

test('a file that is not a Money HQ backup is refused with a clear message', async ({ page }) => {
  await page.goto('/');
  await page.locator('#file-restore').setInputFiles({
    name: 'money-hq-backup-broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello": "world"}'),
  });
  await expect(page.locator('#status')).toHaveText("That file isn't a Money HQ backup.");
  await expect(page.locator('#restore-panel')).toBeHidden();
});

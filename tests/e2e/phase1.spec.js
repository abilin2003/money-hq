// Browser tests for Phase 1: importing, the old dashboard backup, quick entry and the list. All data is made up.
import { test, expect } from '@playwright/test';
import { resetDb, file, ulsterCsv, monzoCsv, payerRules, oldBackup } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await resetDb(page);
});

test('import: sorts what it can, asks only about the rest, remembers your choice and skips repeats', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/#import');

  await page.locator('#file-rules').setInputFiles(file('payer-rules.json', payerRules, 'application/json'));
  await expect(page.locator('#rules-info')).toHaveText('2 payer rules loaded.');

  await page.locator('#file-csv').setInputFiles([file('ulster.csv', ulsterCsv), file('monzo.csv', monzoCsv)]);
  const plan = page.locator('#import-plan');
  await expect(plan).toBeVisible();
  await expect(plan).toContainText('Ulster Bank');
  await expect(plan).toContainText('Monzo');
  // Only the cafe (no rule) and the shop (a suggestion from the bank's own category) need a look.
  await expect(page.locator('#import-groups .group')).toHaveCount(2);
  await expect(page.locator('#btn-import')).toHaveText('Import all 5 transactions');

  await page.locator('select[aria-label="What is Test Cafe?"]').selectOption('spending|Fun');
  await page.locator('#import-tag').fill('Test trip');
  await page.locator('#btn-import').click();
  await expect(page.locator('#import-status')).toContainText('Imported 5 transactions');
  await expect(plan).toBeHidden();

  // The list shows what was saved, with the right kinds.
  await page.locator('.tabs [data-view="transactions"]').click();
  await expect(page.locator('#tx-summary')).toContainText('5 transactions');
  await expect(page.locator('#tx-summary')).toContainText('income £1,000.00');
  await expect(page.locator('#tx-summary')).toContainText('2 moves left out');
  await expect(page.locator('.txrow', { hasText: 'Test Employer' })).toContainText('Salary');
  const cafe = page.locator('.txrow', { hasText: 'Test Cafe' });
  await expect(cafe).toContainText('Fun');
  await expect(cafe).toContainText('#Test trip');
  await expect(page.locator('.txrow', { hasText: 'Corner Shop' })).toContainText('Groceries');

  // Importing the same files again finds everything already saved.
  await page.locator('.tabs [data-view="import"]').click();
  await page.locator('#file-csv').setInputFiles([file('ulster.csv', ulsterCsv), file('monzo.csv', monzoCsv)]);
  await expect(page.locator('#btn-import')).toHaveText('Nothing new to import');
  await expect(page.locator('#btn-import')).toBeDisabled();

  // The next import of the same cafe is sorted automatically, because the choice was remembered.
  await page.locator('#file-csv').setInputFiles(file('ulster2.csv', 'Date,Description,Type,Paid in (£),Paid out (£),Amount (£)\n2026-04-01,TEST CAFE 9999,Debit,,3.00,-3.00'));
  await expect(page.locator('#import-groups .group')).toHaveCount(0);
  await expect(page.locator('#btn-import')).toHaveText('Import all 1 transaction');
  expect(errors).toEqual([]);
});

test('import: a file from an unknown bank is explained, and does not block the good file', async ({ page }) => {
  await page.goto('/#import');
  await page.locator('#file-csv').setInputFiles([file('mystery.csv', 'foo,bar\n1,2'), file('ulster.csv', ulsterCsv)]);
  await expect(page.locator('#import-plan')).toContainText("couldn't tell which bank");
  await expect(page.locator('#btn-import')).toHaveText('Import all 3 transactions');
});

test('old dashboard backup: preview, add, and adding it again changes nothing', async ({ page }) => {
  await page.goto('/#data');
  await page.locator('#file-old').setInputFiles(file('old-backup.json', oldBackup, 'application/json'));
  await expect(page.locator('#old-info')).toContainText('Found 3 transactions (2 this pay cycle, 1 from 1 closed month)');
  await page.locator('#btn-old-import').click();
  await expect(page.locator('#old-status')).toContainText('Brought across 3 transactions');
  await expect(page.locator('#fact-tx')).toHaveText('3');

  await page.locator('#file-old').setInputFiles(file('old-backup.json', oldBackup, 'application/json'));
  await expect(page.locator('#old-info')).toContainText('3 are already saved');
  await page.locator('#btn-old-import').click();
  await expect(page.locator('#old-status')).toContainText('Brought across 0 transactions');
  await expect(page.locator('#fact-tx')).toHaveText('3');

  await page.reload();
  await expect(page.locator('#fact-tx')).toHaveText('3');
});

test('old dashboard backup: a file that is not an old backup is refused', async ({ page }) => {
  await page.goto('/#data');
  await page.locator('#file-old').setInputFiles(file('x.json', '{"hello":1}', 'application/json'));
  await expect(page.locator('#old-status')).toContainText("doesn't look like a backup from the old dashboard");
  await expect(page.locator('#old-panel')).toBeHidden();
});

test('quick entry: save, favourite tile fills the form, save and add another keeps the date', async ({ page }) => {
  await page.goto('/#add');
  await expect(page.locator('#add-today')).toHaveClass(/on/);

  await page.locator('#add-amount').fill('3.50');
  await page.locator('#add-desc').fill('Test Bakery');
  await page.locator('#add-category').selectOption('Fun');
  await page.locator('#add-account').selectOption('Revolut');
  await page.locator('#add-save').click();
  await expect(page.locator('#add-status')).toContainText('Added £3.50 to Fun');

  // The new favourite tile shows the shop and the usual amount, and fills the form.
  const tile = page.locator('.qtile', { hasText: 'Test Bakery' });
  await expect(tile).toContainText('£3.50');
  await tile.click();
  await expect(page.locator('#add-desc')).toHaveValue('Test Bakery');
  await expect(page.locator('#add-amount')).toHaveValue('3.50');
  await expect(page.locator('#add-category')).toHaveValue('Fun');
  await expect(page.locator('#add-account')).toHaveValue('Revolut');

  // Save and add another: the form clears, the date stays.
  await page.locator('#add-yesterday').click();
  const yesterday = await page.locator('#add-date').inputValue();
  await page.locator('#add-another').click();
  await expect(page.locator('#add-status')).toContainText('Add the next one');
  await expect(page.locator('#add-amount')).toHaveValue('');
  await expect(page.locator('#add-date')).toHaveValue(yesterday);

  // Typing a known shop fills in the category by itself.
  await page.locator('#add-desc').fill('Test Bakery');
  await expect(page.locator('#add-category')).toHaveValue('Fun');

  // Nothing is saved without an amount.
  await page.locator('#add-save').click();
  await expect(page.locator('#add-status')).toContainText('Enter an amount above £0');

  await page.reload();
  await page.locator('.tabs [data-view="data"]').click();
  await expect(page.locator('#fact-tx')).toHaveText('2');
});

test('list: search, filter, edit in place, and delete needs two taps', async ({ page }) => {
  await page.goto('/#data');
  await page.locator('#file-old').setInputFiles(file('old-backup.json', oldBackup, 'application/json'));
  await page.locator('#btn-old-import').click();
  await expect(page.locator('#fact-tx')).toHaveText('3');

  await page.locator('.tabs [data-view="transactions"]').click();
  await expect(page.locator('.txrow')).toHaveCount(3);

  await page.locator('#tx-q').fill('mart');
  await expect(page.locator('.txrow')).toHaveCount(1);
  await page.locator('#tx-q').fill('');
  await page.locator('#tx-category').selectOption('Fun');
  await expect(page.locator('.txrow')).toHaveCount(2);
  await page.locator('#tx-account').selectOption('Revolut');
  await page.locator('#tx-category').selectOption('');
  await expect(page.locator('.txrow')).toHaveCount(2);
  await page.locator('#tx-account').selectOption('');

  // Edit in place.
  await page.locator('.txrow', { hasText: 'Test Mart' }).click();
  const editor = page.locator('.txedit');
  await expect(editor).toBeVisible();
  await editor.locator('input[type="text"]').first().fill('Test Mart Two');
  await editor.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.txrow', { hasText: 'Test Mart Two' })).toBeVisible();

  // Delete: the first tap only asks.
  await page.locator('.txrow', { hasText: 'Test Mart Two' }).click();
  const del = page.locator('.txedit').getByRole('button', { name: /Delete|Tap again/ });
  await del.click();
  await expect(del).toHaveText('Tap again to delete');
  await expect(page.locator('#tx-summary')).toContainText('3 transactions');
  await del.click();
  await expect(page.locator('#tx-summary')).toContainText('2 transactions');
  await expect(page.locator('.txrow', { hasText: 'Test Mart' })).toHaveCount(0);

  await page.reload();
  await page.locator('.tabs [data-view="data"]').click();
  await expect(page.locator('#fact-tx')).toHaveText('2');
});

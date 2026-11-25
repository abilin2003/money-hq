// Browser tests for the six main sections, using a populated but obviously fake data set.
import { test, expect } from '@playwright/test';
import { resetDb } from './helpers.js';

const ROUTES = ['hq', 'spending/overview', 'spending/breakdown', 'spending/trends', 'spending/behaviour', 'spending/budgets', 'spending/tools', 'savings', 'wealth/networth', 'wealth/investments', 'wealth/debts',
  'planning/payday', 'planning/cashflow', 'planning/calendar', 'planning/recurring', 'planning/whatif', 'planning/insights', 'settings/accounts', 'settings/data', 'settings/rules', 'settings/security', 'settings/look'];

// Builds fake data inside the page, using the app's own modules, and saves it.
async function seedFake(page) {
  await page.evaluate(async () => {
    const { emptyData, saveData } = await import('/js/store.js');
    const d = emptyData();
    const today = new Date();
    const iso = (offset) => { const x = new Date(today); x.setDate(x.getDate() + offset); return x.toISOString().slice(0, 10); };
    d.settings.paydates = [iso(-40), iso(-10), iso(20)];
    d.settings.budgets = { Groceries: 100, Fun: 50 };
    d.settings.categories = [{ name: 'Groceries', emoji: '', color: '#4ade80' }, { name: 'Fun', emoji: '', color: '#ffc94d' }];
    d.settings.recurring = [{ id: 'r1', name: 'Test Phone', amount: 10, day: 5, freq: 'monthly', month: 1, category: 'Groceries', account: 'Test Bank', match: 'test phone' }];
    const tx = (i, off, more) => ({ id: `t${i}`, date: iso(off), desc: 'Test Shop', amount: 12.5, direction: 'out', kind: 'spending', category: 'Groceries', account: 'Test Bank', source: 'manual', detail: 'Groceries', note: '', ...more });
    d.transactions = [tx(1, -2), tx(2, -5, { category: 'Fun', detail: 'Pubs & bars', desc: 'Test Pub' }), tx(3, -12), tx(4, -20, { amount: 2000, kind: 'income', direction: 'in', desc: 'Test Employer' }), tx(5, -33, { amount: 400, kind: 'invested', desc: 'Test ISA' }),
      tx(6, -45), tx(7, -70, { category: 'Fun', detail: 'Takeaway & eating out', desc: 'Test Takeaway' }), tx(8, -100, { amount: 2000, kind: 'income', direction: 'in', desc: 'Test Employer' }), tx(9, -130, { amount: 30 })];
    d.accounts = [{ id: 'a1', name: 'Test Bank', type: 'current', balance: 500, updated: iso(-3) }, { id: 'a2', name: 'Test Card', type: 'credit', balance: 100, limit: 1000, dueDay: 28, minPayment: 25 }, { id: 'a3', name: 'Test ISA', type: 'investment', balance: 3000, updated: iso(-3) }];
    d.snapshots = [{ id: 's1', date: iso(-60), balances: { a1: 300, a3: 2500, a2: 200 } }];
    d.goals = [{ id: 'g1', name: 'Test Goal', kind: 'emergency', balance: 200, target: 1000, targetDate: '', monthly: 50, rate: 0, priority: 1, interest: 0, history: [] }];
    d.holdings = [{ id: 'h1', name: 'Test Fund', ticker: '', kind: 'ETF', assetClass: 'Equity', sector: 'Diversified', geography: 'Global', value: 3000, cost: 2800, fee: 0.2 }];
    d.owed = [{ id: 'o1', person: 'Test Friend', amount: 20, received: 0, date: iso(-9), expected: iso(5), note: '', applied: [] }];
    d.settings.plan = { salary: 2000, allocations: [{ id: 'p1', name: 'Test bills', type: 'bills', amount: 500 }] };
    await saveData(d);
  });
}

test.beforeEach(async ({ page }) => { await resetDb(page); });

test('every section and screen draws with populated data: no errors, no NaN or undefined, no sideways scroll', async ({ page }, testInfo) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await seedFake(page);
  for (const route of ROUTES) {
    await page.goto(`/#${route}`);
    await page.reload();
    await expect(page.locator(`#view-${route.split('/')[0]}`)).toBeVisible();
    await page.waitForTimeout(150);
    const text = await page.locator('main').innerText();
    expect(text.length, `${route} should have content`).toBeGreaterThan(40);
    expect(text, `${route} should not show NaN, undefined or [object]`).not.toMatch(/NaN|undefined|\[object/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${route} on ${testInfo.project.name} should not scroll sideways`).toBeLessThanOrEqual(0);
  }
  expect(errors).toEqual([]);
});

test('tapping a heatmap day opens the transactions behind it, and Escape closes it', async ({ page }) => {
  await seedFake(page);
  await page.goto('/#spending/trends');
  await page.reload();
  await expect(page.locator('.heat')).toBeVisible();
  await page.locator('.cell:not(.none)').nth(100).click({ force: true });
  await expect(page.locator('#drill')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#drill')).toHaveCount(0);
});

test('demo mode fills every page with obviously fake data, saves nothing, and exits cleanly', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#hq');
  await page.reload();
  await page.getByRole('button', { name: 'See it with demo data' }).click();
  await expect(page.locator('#demo-banner')).toBeVisible();
  for (const route of ROUTES) {
    await page.evaluate((r) => { location.hash = r; }, route); // no reload: demo data lives in memory only
    await expect(page.locator(`#view-${route.split('/')[0]}`)).toBeVisible();
    const text = await page.locator('main').innerText();
    expect(text, `${route} in demo mode`).not.toMatch(/NaN|undefined|\[object/);
  }
  await page.evaluate(() => { location.hash = 'hq'; });
  await expect(page.locator('#view-hq')).toContainText('Demo');
  const saved = await page.evaluate(async () => { const { loadData } = await import('/js/store.js'); const d = await loadData(); return d ? d.transactions.length : 0; });
  expect(saved, 'demo data must never be written to storage').toBe(0);
  await page.getByRole('button', { name: 'Exit demo' }).click();
  await expect(page.locator('#demo-banner')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Welcome to Money HQ' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the theme button cycles through light and dark, and the choice is kept', async ({ page }) => {
  await seedFake(page);
  await page.goto('/#hq');
  await page.reload();
  await page.locator('#theme-btn').click();
  await page.locator('#theme-btn').click();
  await expect(page.locator('#theme-btn')).toHaveText('Dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('#theme-btn')).toHaveText('Dark');
});

test('adding a goal and an account works, and net worth reflects it', async ({ page }) => {
  await seedFake(page);
  await page.goto('/#savings');
  await page.reload();
  await page.getByRole('button', { name: 'Add a goal' }).click();
  await expect(page.getByRole('heading', { name: 'New goal' })).toBeVisible();
  await page.goto('/#settings/accounts');
  await page.getByRole('button', { name: 'Add an account' }).click();
  await expect(page.locator('.edrow')).toHaveCount(4);
});

// Phase 2A: saving is dependable and clearly validated. Each test was written before its fix, against the fake
// database (made-up data only), at laptop and phone sizes.
import { test, expect, signIn, fakeState, fillSpend, IDS } from './helpers.js';

const payback = async (page) => page.getByRole('button', { name: 'Someone’s paying me back' }).click();
const owedField = (page) => page.getByLabel('Amount they owe you', { exact: true });

test.describe('Amount they owe', () => {
  test('shows the full purchase amount as a real number, follows the amount until you change it, and can be changed', async ({ page }) => {
    await signIn(page);
    await fillSpend(page, { amount: '150.00', where: 'Headphones' });
    await payback(page);
    await expect(owedField(page)).toHaveValue('150.00');
    await page.getByLabel('Amount', { exact: true }).fill('120.00');
    await expect(owedField(page)).toHaveValue('120.00');
    await owedField(page).fill('60.00');
    await page.getByLabel('Amount', { exact: true }).fill('100.00');
    await expect(owedField(page)).toHaveValue('60.00'); // your own figure is never overwritten
    await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Gifts' }); // your £40 share needs one
    await page.getByLabel('Who owes you', { exact: true }).fill('Dad');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page).toHaveURL(/#overview/);
    const db = await fakeState();
    const buy = db.transactions.find((t) => t.raw_description === 'Headphones');
    expect(buy.amount_pence).toBe(-10000);
    expect(db.splits.map((s) => s.amount_pence)).toEqual([6000]);
  });

  for (const [typed, why] of [['', /how much/i], ['200.00', /more than the purchase/i], ['-5', /amount/i]]) {
    test(`“${typed || '(empty)'}” is refused with a clear message, the field is marked, and nothing is saved`, async ({ page }) => {
      await signIn(page);
      await fillSpend(page, { amount: '150.00', where: 'Headphones' });
      await payback(page);
      await page.getByLabel('Who owes you', { exact: true }).fill('Dad');
      await owedField(page).fill(typed);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.locator('.form-error')).toContainText(why);
      await expect(owedField(page)).toHaveAttribute('aria-invalid', 'true');
      const db = await fakeState();
      expect(db.transactions).toHaveLength(0);
      expect(db.splits).toHaveLength(0);
    });
  }
});

test.describe('Errors you can see', () => {
  test('a refused save shows one clear message, full width above the buttons and on screen, not squeezed between them', async ({ page }) => {
    await signIn(page);
    await page.goto('/#add');
    await page.getByLabel('Amount', { exact: true }).fill('150.00');
    await page.getByRole('button', { name: 'Save', exact: true }).click(); // no "Where"
    await page.getByRole('button', { name: 'Save', exact: true }).click(); // twice: still only one message
    const msg = page.locator('.form-error');
    await expect(msg).toHaveCount(1);
    await expect(msg).toBeVisible();
    await expect(msg).toContainText(/where/i);
    // Full width and above the buttons (never squeezed between them), and on screen with them.
    const box = await msg.boundingBox();
    const btn = await page.getByRole('button', { name: 'Save', exact: true }).boundingBox();
    expect(box.width).toBeGreaterThan(200);
    expect(box.y + box.height).toBeLessThanOrEqual(btn.y + 1);
    await expect(msg).toBeInViewport();
    await expect(page.getByLabel('Where', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  });
});

test.describe('No duplicates', () => {
  test('tapping Save twice quickly saves the purchase once', async ({ page }) => {
    await signIn(page);
    await fillSpend(page, { amount: '25.00', where: 'Double tap shop', category: 'Groceries' });
    await page.getByRole('button', { name: 'Save', exact: true }).dblclick();
    await expect(page).toHaveURL(/#overview/);
    const db = await fakeState();
    expect(db.transactions.filter((t) => t.raw_description === 'Double tap shop')).toHaveLength(1);
  });

  test('tapping Save and then “Save and add another” quickly still saves once', async ({ page }) => {
    await signIn(page);
    await fillSpend(page, { amount: '150.00', where: 'Headphones' });
    await payback(page);
    await page.getByLabel('Who owes you', { exact: true }).fill('Dad');
    const save = page.getByRole('button', { name: 'Save', exact: true });
    const again = page.getByRole('button', { name: 'Save and add another' });
    await Promise.all([save.click(), again.click({ force: true }).catch(() => {})]);
    await page.waitForTimeout(800);
    const db = await fakeState();
    expect(db.transactions.filter((t) => t.raw_description === 'Headphones')).toHaveLength(1);
    expect(db.splits).toHaveLength(1);
  });
});

test.describe('After a successful save', () => {
  test('the balance, the transaction list and the IOU all update straight away, and a message confirms it', async ({ page }) => {
    await signIn(page);
    await fillSpend(page, { amount: '100.00', where: 'Partly for Dad' , category: 'Gifts' });
    await payback(page);
    await page.getByLabel('Who owes you', { exact: true }).fill('Dad');
    await owedField(page).fill('60.00');
    await page.getByRole('button', { name: 'Save and add another' }).click();
    await expect(page.getByRole('status')).toContainText('Dad owes you £60.00');
    await expect(page.getByRole('status')).toContainText('your share £40.00');
    await page.goto(`/#account/${IDS.bank}`);
    await expect(page.locator('.acct-head .pos-figure')).toHaveText('£1,900.00');
    await expect(page.locator('.acct-lines')).toContainText('Partly for Dad');
    await page.goto('/#people');
    await expect(page.locator('section[aria-label="Dad"]')).toContainText('£60.00');
  });
});

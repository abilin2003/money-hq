// Browser journeys for IOUs and invalid amounts, against the fake database (made-up data only).
import { test, expect, signIn, fakeState, FAKE, IDS } from './helpers.js';

const seed = (data) => fetch(`${FAKE}/__test/seed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

test.describe('IOUs', () => {
  test('Dad pays back £100 of £150 into the bank: £50 still owed, the bank goes up £100, and it isn’t income', async ({ page }) => {
    const buy = '60000000-0000-4000-8000-000000000001';
    const dad = '70000000-0000-4000-8000-000000000001';
    await seed({
      transactions: [{ id: buy, account_id: IDS.bank, date: today, amount_pence: -15000, raw_description: 'Headphones', kind: 'spend', status: 'reviewed', source: 'manual', fingerprint: `manual|${buy}` }],
      people: [{ id: dad, name: 'Dad' }],
      splits: [{ transaction_id: buy, person_id: dad, amount_pence: 15000 }],
    });
    await signIn(page);
    await page.goto('/#people');
    const card = page.locator('section[aria-label="Dad"]');
    await expect(card).toContainText('£150.00');
    await card.getByRole('button', { name: 'Record repayment' }).click();
    await card.getByLabel('Amount received', { exact: true }).fill('100.00');

    // Forgetting where it went is caught, and nothing is saved.
    await card.getByRole('button', { name: 'Confirm' }).click();
    await expect(card.locator('.error')).toContainText(/account/i);
    expect((await fakeState()).transactions.filter((t) => t.kind === 'repayment')).toHaveLength(0);

    await card.getByLabel('Account it went into', { exact: true }).selectOption({ label: 'Test Bank' });
    await card.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.locator('section[aria-label="Dad"]')).toContainText('£50.00');

    const db = await fakeState();
    const back = db.transactions.filter((t) => t.kind === 'repayment');
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ amount_pence: 10000, account_id: IDS.bank });
    const mine = db.splits.filter((s) => s.transaction_id === buy);
    expect(mine.map((s) => [s.amount_pence, Boolean(s.settled_by_transaction_id)]).sort()).toEqual([[10000, true], [5000, false]]);

    await page.goto(`/#account/${IDS.bank}`);
    await expect(page.locator('.acct-head .pos-figure')).toHaveText('£1,950.00'); // 2,000 − 150 + 100
    await page.reload();
    await page.goto('/#people');
    await expect(page.locator('section[aria-label="Dad"]')).toContainText('£50.00', { timeout: 15_000 });
  });
});

test.describe('Invalid amounts', () => {
  for (const bad of ['twenty five', '-25', '0']) {
    test(`“${bad}” as a purchase amount is refused and nothing is saved`, async ({ page }) => {
      await signIn(page);
      await page.goto('/#add');
      await page.getByLabel('Amount', { exact: true }).fill(bad);
      await page.getByLabel('Where', { exact: true }).fill('Test shop');
      await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Groceries' });
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.locator('.error')).toContainText(/amount/i);
      await expect(page).toHaveURL(/#add/);
      expect((await fakeState()).transactions).toHaveLength(0);
      await expect(page.getByLabel('Where', { exact: true })).toHaveValue('Test shop');
    });
  }
});

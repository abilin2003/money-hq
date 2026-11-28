// Browser journeys: recording purchases the way you do, against the fake database (made-up data only).
// Each test checks what's really saved (the fake database), what the app shows, and that it survives a reload.
import { test, expect, signIn, fakeState, failNext, fillSpend, IDS } from './helpers.js';

test.describe('Add a transaction', () => {
  test('an ordinary purchase is saved, shown, counted against the balance once, and still there after a reload', async ({ page }) => {
    await signIn(page);
    await fillSpend(page, { amount: '25.00', where: 'ASOS', category: 'Clothes & shopping' });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page).toHaveURL(/#overview/);

    // Saved once, exactly as entered.
    const db = await fakeState();
    const saved = db.transactions.filter((t) => t.raw_description === 'ASOS');
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ amount_pence: -2500, account_id: IDS.bank, category_id: IDS.catClothes, kind: 'spend', status: 'reviewed' });

    // The account went from £2,000.00 to £1,975.00.
    await page.goto(`/#account/${IDS.bank}`);
    await expect(page.locator('.acct-head .pos-figure')).toHaveText('£1,975.00');
    await expect(page.locator('.acct-lines')).toContainText('ASOS');

    // After a reload it comes back from the database, not from memory.
    await page.reload();
    await expect(page.locator('.acct-head .pos-figure')).toHaveText('£1,975.00', { timeout: 15_000 });
    await expect(page.locator('.acct-lines')).toContainText('ASOS');
  });

  test('a purchase someone pays you back: the purchase and the IOU are both saved, and the IOU shows', async ({ page }) => {
    await signIn(page);
    await fillSpend(page, { amount: '150.00', where: 'Headphones' });
    await page.getByRole('button', { name: 'Someone’s paying me back' }).click();
    await page.getByLabel('Who owes you', { exact: true }).fill('Dad');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page).toHaveURL(/#overview/);

    const db = await fakeState();
    const buy = db.transactions.filter((t) => t.raw_description === 'Headphones');
    expect(buy).toHaveLength(1);
    expect(buy[0]).toMatchObject({ amount_pence: -15000, account_id: IDS.bank });
    const dad = db.people.find((p) => p.name === 'Dad');
    expect(db.splits.filter((s) => s.transaction_id === buy[0].id)).toEqual([expect.objectContaining({ person_id: dad.id, amount_pence: 15000 })]);

    await page.goto(`/#account/${IDS.bank}`);
    await expect(page.locator('.acct-head .pos-figure')).toHaveText('£1,850.00');
    await page.goto('/#people');
    await expect(page.locator('main')).toContainText('Dad');
    await expect(page.locator('section[aria-label="Dad"]')).toContainText('£150.00');

    await page.reload();
    await expect(page.locator('section[aria-label="Dad"]')).toContainText('£150.00', { timeout: 15_000 });
  });

  // KNOWN ISSUE #2 (docs/KNOWN-ISSUES.md): words typed as the amount owed are taken as "the whole amount" and
  // saved, instead of being refused. This test describes the correct behaviour and is marked as expected to
  // fail until the bug is fixed; once it passes, Playwright reports it and the marker must be removed.
  test('words typed as the amount owed are refused, nothing is saved, and what you typed stays', async ({ page }) => {
    test.fail(true, 'Known issue #2: words in "Amount they owe" are treated as the whole amount');
    await signIn(page);
    await fillSpend(page, { amount: '150.00', where: 'Headphones' });
    await page.getByRole('button', { name: 'Someone’s paying me back' }).click();
    await page.getByLabel('Who owes you', { exact: true }).fill('Dad');
    await page.getByLabel('Amount they owe you', { exact: true }).fill('the full amount please');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.locator('.error')).toContainText(/amount/i);
    const db = await fakeState();
    expect(db.transactions.filter((t) => t.raw_description === 'Headphones')).toHaveLength(0);
    expect(db.splits).toHaveLength(0);
    await expect(page.getByLabel('Amount they owe you', { exact: true })).toHaveValue('the full amount please');
  });

  test('when the database fails, the app says so and never claims it saved; nothing half-saved is left', async ({ page }) => {
    await signIn(page);
    await fillSpend(page, { amount: '100.00', where: 'Group meal', category: 'Eating out & takeaway' });
    await page.getByRole('button', { name: 'Split with others' }).click();
    await page.getByLabel('My share', { exact: true }).fill('40.00');
    await page.getByLabel('Their name', { exact: true }).first().fill('Sam');
    await page.getByLabel('Amount they owe', { exact: true }).first().fill('60.00');
    await failNext('add_purchase_with_ious', 'POST');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.locator('.error')).toContainText(/Couldn’t save|Couldn't save/);
    await expect(page).toHaveURL(/#add/);
    await expect(page.getByRole('status')).toHaveCount(0); // no "Saved …" message
    const db = await fakeState();
    expect(db.transactions.filter((t) => t.raw_description === 'Group meal')).toHaveLength(0);
    expect(db.splits).toHaveLength(0);
    // What you typed is still there to try again.
    await expect(page.getByLabel('Where', { exact: true })).toHaveValue('Group meal');
  });
});

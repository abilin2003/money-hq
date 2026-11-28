// Wealth → Balance history shows the card's live balance (what you owe now), not just the typed-in £0.
// Regression test for the Capital One balance history showing £0. Made-up data.
import { test, expect, signIn, FAKE, IDS } from './helpers.js';

const seed = (data) => fetch(`${FAKE}/__test/seed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

test('a card typed in at £0 with a purchase since shows what you owe now in its history, and net worth drops by it', async ({ page }) => {
  const id = '60000000-0000-4000-8000-0000000000aa';
  await seed({ transactions: [{ id, account_id: IDS.card, date: today, amount_pence: -4720, raw_description: 'Fuel', kind: 'spend', status: 'reviewed', source: 'manual', fingerprint: `manual|${id}` }] });
  await signIn(page);
  await page.goto('/#wealth');
  const card = page.locator('section[aria-labelledby="wh"]');
  await card.getByLabel('Account', { exact: true }).selectOption({ label: 'Test Card' });
  await expect(card).toContainText('£47.20 owed');
  await expect(card).toContainText('Now');
  // the account's own page agrees
  await page.goto(`/#account/${IDS.card}`);
  await expect(page.locator('.acct-head .pos-figure')).toHaveText('£47.20');
  await expect(page.locator('section[aria-labelledby="bh-h"]')).toContainText('£47.20 owed');
  // net worth on Wealth: £2,000 + £300 + £6,000 − £47.20 = £8,252.80
  await page.goto('/#wealth');
  await expect(page.locator('.tiles')).toContainText('£8,252.80');
});

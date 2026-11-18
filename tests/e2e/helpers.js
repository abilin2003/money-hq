// Shared helpers for the browser tests. All data in these tests is made up.

// Start every test with an empty browser database.
export async function resetDb(page) {
  await page.goto('/');
  await page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('money-hq');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  }));
  await page.reload();
}

export const file = (name, text, mimeType = 'text/csv') => ({ name, mimeType, buffer: Buffer.from(text) });

export const ulsterCsv = [
  'Date,Description,Type,Paid in (£),Paid out (£),Amount (£)',
  '2026-03-02,TEST CAFE 1234,Debit Card Transaction,,4.50,-4.50',
  '2026-03-01,TEST EMPLOYER LTD,Automated Credit,1000.00,,1000.00',
  '2026-03-03,TO MY OWN NAME,Mobile/Online Transaction,,20.00,-20.00',
].join('\n');

const monzoHeader = ['Transaction ID', 'Date', 'Time', 'Type', 'Name', 'Emoji', 'Category', 'Amount', 'Currency', 'Local amount', 'Local currency', 'Notes and #tags', 'Address', 'Receipt', 'Description', 'Category split', 'Money Out', 'Money In'];
const monzoRow = (id, date, type, name, category, amount) =>
  [id, date, '10:00:00', type, name, '', category, amount, 'GBP', amount, 'GBP', '', '', '', '', '', amount < 0 ? -amount : '', amount > 0 ? amount : ''].join(',');
export const monzoCsv = [
  monzoHeader.join(','),
  monzoRow('tx_1', '02/03/2026', 'Card payment', 'Corner Shop', 'Groceries', -12.34),
  monzoRow('tx_2', '03/03/2026', 'Pot transfer', 'Test Pot', 'Savings', -20),
].join('\n');

export const payerRules = JSON.stringify({
  rules: [
    { match: 'TEST EMPLOYER', label: 'income', category: 'Salary' },
    { match: 'MY OWN NAME', label: 'internal', category: 'Own transfers' },
  ],
});

export const oldBackup = JSON.stringify({
  app: 'my-finance',
  version: 6,
  finS4: {
    cats: [{ n: 'Groceries', e: '🛒', c: '#4ade80' }, { n: 'Fun', e: '🎉', c: '#ffc94d' }],
    budgets: { Groceries: 100 },
    buffer: 0,
    paydates: ['2026-01-10', '2026-02-09'],
    rules: { tesco: { cat: 'Groceries' } },
    recurring: [],
    quick: { pinned: [], hidden: [] },
    pots: [],
  },
  finTXS4: [
    { date: '15/01/2026', desc: 'Test Mart', bucket: 'Groceries', amount: 10, bank: 'Ulster Bank' },
    { date: '16/01/2026', desc: 'Test Arcade', bucket: 'Fun', amount: 5, bank: 'Revolut' },
  ],
  finHist4: [{ id: 'h1', label: 'January', start: '2026-01-10', end: '2026-02-08', transactions: [{ date: '20/01/2026', desc: 'Old Cafe', bucket: 'Fun', amount: 6, bank: 'Revolut' }] }],
  finPots4: [],
});

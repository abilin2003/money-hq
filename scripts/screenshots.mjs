// Full-page screenshots of every Money HQ page, laptop (1440 wide) and phone (390 wide).
// Opens a visible browser window on the local app: you sign in there yourself, then it photographs each page.
// Images go to data/screenshots/ (private: data/ is never committed or uploaded).
//
//   npm run dev            (in another terminal, so http://localhost:5173 is running)
//   npm run screenshots
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.SHOTS_URL || 'http://localhost:5173/';
const OUT = 'data/screenshots';
const PAGES = [
  ['01-overview', 'overview'], ['02-overview-current-cycle', 'overview/current'],
  ['03-analytics-spending', 'spending'], ['03a-analytics-insights', 'insights'], ['03b-analytics-compare', 'compare'], ['04-analytics-trends', 'trends'], ['05-analytics-history', 'history'], ['06-analytics-transactions', 'transactions'],
  ['07-planning-payday-plan', 'plan'], ['08-planning-money-day', 'moneyday'], ['09-planning-budgets', 'budgets'], ['10-planning-goals', 'goals'], ['11-planning-manage', 'manage'], ['11b-planning-bills', 'bills'],
  ['12-wealth', 'wealth'], ['13-activity-inbox', 'inbox'], ['14-activity-ious', 'people'], ['15-activity-import', 'import'],
  ['16-add-transaction', 'add'], ['17-settings', 'settings'],
];
const VIEWS = [['laptop', { viewport: { width: 1440, height: 900 } }], ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]];

// Use a browser already on the computer (Edge, then Chrome), falling back to Playwright's own.
async function launch() {
  for (const channel of ['msedge', 'chrome', undefined]) {
    try { return await chromium.launch({ headless: false, ...(channel ? { channel } : {}) }); } catch (err) { console.log(`Couldn't open ${channel || 'the built-in browser'}: ${err.message.split('\n')[0]}`); }
  }
  throw new Error('No browser could be opened.');
}
const browser = await launch();
const login = await browser.newContext({ viewport: { width: 1200, height: 860 } });
const page = await login.newPage();
await page.goto(BASE);
mkdirSync(`${OUT}/laptop`, { recursive: true });
mkdirSync(`${OUT}/phone`, { recursive: true });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/laptop/00-sign-in.png`, fullPage: true });
console.log('\nA browser window has opened. Sign in there with your Money HQ email and password.');
console.log('Screenshots start by themselves once your Overview appears (waiting up to 5 minutes)...\n');
await page.waitForSelector('.sidebar', { timeout: 300000 });
const state = await login.storageState();
await login.close();

for (const [view, opts] of VIEWS) {
  const ctx = await browser.newContext({ ...opts, storageState: state });
  const p = await ctx.newPage();
  await p.goto(BASE);
  await p.waitForSelector('main h1', { timeout: 60000 });
  for (const [name, hash] of PAGES) {
    if (name === '16-more' && view === 'laptop') continue; // the More page is for the phone tab bar
    await p.evaluate((h) => { location.hash = h; }, hash);
    await p.waitForTimeout(900);
    if (hash === 'history') await p.evaluate(() => { const d = document.querySelector('details.period'); if (d) d.open = true; });
    if (hash === 'transactions') await p.evaluate(() => { const d = document.querySelector('details.txd'); if (d) d.open = true; });
    await p.waitForTimeout(400);
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.screenshot({ path: `${OUT}/${view}/${name}.png`, fullPage: true });
    process.stdout.write(`${view}: ${name}\n`);
  }
  await ctx.close();
}
await browser.close();
console.log(`\nDone. Saved in ${OUT}/laptop and ${OUT}/phone.`);

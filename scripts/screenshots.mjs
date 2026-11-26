// Screenshots of every Money HQ screen, laptop (1440 wide) and phone (390 wide), including the interactive moments
// (drill-down panels, the phone's bottom sheet, the chart readout, a comparison opened up).
// Opens a visible browser window on the local app: you sign in there yourself, then it photographs each screen.
// Images go to data/screenshots/<date>/ (private: data/ is never committed or uploaded).
//
//   npm run dev            (in another terminal, so http://localhost:5173 is running)
//   npm run screenshots
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.SHOTS_URL || 'http://localhost:5173/';
const OUT = `data/screenshots/${new Date().toISOString().slice(0, 10)}`;
const CYCLE = process.env.SHOTS_CYCLE || '2026-10-26'; // a finished cycle with plenty in it

// [file name, address, what to do first (runs in the page), whole page or just the screen]
const click = (sel) => `document.querySelector(${JSON.stringify(sel)})?.click()`;
const SHOTS = [
  ['01-overview', 'overview', null, 'full'],
  ['02-overview-current-cycle', 'overview/current', null, 'full'],
  ['03-overview-chart-readout', 'overview', `(() => { const z = document.querySelector('.pick-zone'); z.scrollIntoView({ block: 'center' }); const r = z.getBoundingClientRect(); z.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + r.width * 0.45, clientY: r.top + 20, bubbles: true, pointerType: 'mouse' })); })()`, 'screen'],
  ['04-spending', `spending/p=c.${CYCLE}`, null, 'full'],
  ['05-spending-drill-bucket', `spending/p=c.${CYCLE}&b=Fun`, null, 'screen'],
  ['06-spending-drill-category', `spending/p=c.${CYCLE}&b=Fun&c=Eating+out+%26+takeaway`, null, 'screen'],
  ['07-spending-drill-transaction', `spending/p=c.${CYCLE}&b=Fun&c=Eating+out+%26+takeaway`, click('.panel .pline'), 'screen'],
  ['08-insights', `insights/p=c.${CYCLE}`, null, 'full'],
  ['09-compare', 'compare', null, 'full'],
  ['10-compare-drill', 'compare', click('.page a.cmp-row'), 'screen'],
  ['11-cycle-review-report', `review/${CYCLE}`, null, 'full'],
  ['12-reports-archive', 'reports', null, 'full'],
  ['13-trends', 'trends', null, 'full'],
  ['14-history', 'history', `document.querySelector('details.period')?.setAttribute('open', '')`, 'full'],
  ['15-transactions', `transactions/p=c.${CYCLE}`, `document.querySelector('details.txd')?.setAttribute('open', '')`, 'full'],
  ['16-payday-plan', 'plan', null, 'full'],
  ['17-money-day', 'moneyday', null, 'full'],
  ['18-budgets', 'budgets', null, 'full'],
  ['19-goals', 'goals', null, 'full'],
  ['20-manage', 'manage', null, 'full'],
  ['21-bills', 'bills', null, 'full'],
  ['22-wealth', 'wealth', null, 'full'],
  ['23-review-inbox', 'inbox', null, 'full'],
  ['24-ious', 'people', null, 'full'],
  ['25-import', 'import', null, 'full'],
  ['26-add-transaction', 'add', null, 'full'],
  ['27-settings', 'settings', null, 'full'],
];
const VIEWS = [['laptop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 }], ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]];

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
await page.screenshot({ path: `${OUT}/laptop/00-sign-in.png` });
console.log('\nA browser window has opened. Sign in there with your Money HQ email and password.');
console.log('Screenshots start by themselves once your Overview appears (waiting up to 5 minutes)...\n');
await page.waitForSelector('.sidebar', { timeout: 300000 });
const state = await login.storageState(); // kept in memory only, never written to disk
await login.close();

for (const [view, opts] of VIEWS) {
  const ctx = await browser.newContext({ ...opts, storageState: state });
  const p = await ctx.newPage();
  await p.goto(BASE);
  await p.waitForSelector('main h1', { timeout: 60000 });
  for (const [name, hash, before, mode] of SHOTS) {
    // If the page reloads part-way (the dev server can do that), wait for the app again and retry once.
    for (let attempt = 1; ; attempt++) {
      try {
        await p.evaluate((h) => { location.hash = h; }, hash);
        await p.waitForTimeout(900);
        await p.evaluate(() => window.scrollTo(0, 0));
        if (before) { await p.evaluate(before); await p.waitForTimeout(700); }
        await p.screenshot({ path: `${OUT}/${view}/${name}.png`, fullPage: mode === 'full' });
        break;
      } catch (err) {
        if (attempt >= 2) { console.log(`${view}: ${name} skipped (${err.message.split('\n')[0]})`); break; }
        await p.waitForSelector('main h1', { timeout: 60000 }).catch(() => {});
      }
    }
    process.stdout.write(`${view}: ${name}\n`);
  }
  await ctx.close();
}
await browser.close();
console.log(`\nDone. Saved in ${OUT}/laptop and ${OUT}/phone.`);

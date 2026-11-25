// Demo mode: an obviously fake data set, so every page can be seen filled in. It is built in memory, is never saved,
// and never touches your real data. Every shop, person and account in it has "Demo" in the name.
import { emptyData } from './store.js';
import { DEFAULT_CATEGORIES } from './seed.js';
import { addDays, addMonths, r2 } from './money.js';

// A small repeatable random-number generator, so the demo looks the same every time.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const isDemoName = (s) => /demo/i.test(String(s));

export function makeDemoData(today) {
  const rand = rng(20261124);
  const between = (a, b) => r2(a + rand() * (b - a));
  const d = emptyData();
  const st = d.settings;

  // ---- pay dates: the 24th of each month, six back and one ahead
  // The demo always sits about two weeks into a pay cycle, so budgets are partly used and safe-to-spend is meaningful.
  const anchor = addDays(today, -13);
  st.paydates = [-6, -5, -4, -3, -2, -1, 0, 1].map((i) => addMonths(anchor, i));
  const start = st.paydates[0];

  st.categories = DEFAULT_CATEGORIES.map((c) => ({ ...c }));
  st.budgets = { Essentials: 1000, Groceries: 280, 'Personal Upkeep': 90, 'Life Fund': 120, Fun: 200 };
  st.buffer = 250;
  st.recurring = [
    { id: 'demo-r1', name: 'Demo Rent', amount: 650, day: 1, freq: 'monthly', month: 1, category: 'Essentials', account: 'Demo Current Account', match: 'demo rent' },
    { id: 'demo-r2', name: 'Demo Energy Co', amount: 85, day: 15, freq: 'monthly', month: 1, category: 'Essentials', account: 'Demo Current Account', match: 'demo energy' },
    { id: 'demo-r3', name: 'Demo Phone Plan', amount: 12, day: 22, freq: 'monthly', month: 1, category: 'Essentials', account: 'Demo Current Account', match: 'demo phone' },
    { id: 'demo-r4', name: 'Demo Gym', amount: 29.95, day: 1, freq: 'monthly', month: 1, category: 'Essentials', account: 'Demo Current Account', match: 'demo gym' },
    { id: 'demo-r5', name: 'Demo Streaming', amount: 9.99, day: 8, freq: 'monthly', month: 1, category: 'Essentials', account: 'Demo Current Account', match: 'demo streaming' },
    { id: 'demo-r6', name: 'Demo Cloud Storage', amount: 2.99, day: 9, freq: 'monthly', month: 1, category: 'Essentials', account: 'Demo Current Account', match: 'demo cloud' },
    { id: 'demo-r7', name: 'Demo Car Insurance', amount: 360, day: 10, freq: 'yearly', month: 3, category: 'Essentials', account: 'Demo Current Account', match: 'demo insurance' },
  ];
  st.legacy = { lt: { 'Demo Cash ISA': 400, 'Demo S&S ISA': 200 }, st: {}, income: 2400 };
  st.plan = {
    salary: 2400,
    allocations: [
      { id: 'demo-p1', name: 'Demo Rent', type: 'bills', amount: 650 }, { id: 'demo-p2', name: 'Utilities & subscriptions', type: 'bills', amount: 140 },
      { id: 'demo-p3', name: 'Groceries', type: 'spending', amount: 280 }, { id: 'demo-p4', name: 'Fun & eating out', type: 'spending', amount: 120 }, { id: 'demo-p5', name: 'Fuel & transport', type: 'spending', amount: 100 },
      { id: 'demo-p6', name: 'Emergency fund', type: 'savings', amount: 200 }, { id: 'demo-p7', name: 'Holiday pot', type: 'savings', amount: 100 },
      { id: 'demo-p8', name: 'Demo Cash ISA', type: 'investing', amount: 400 }, { id: 'demo-p9', name: 'Demo S&S ISA', type: 'investing', amount: 200 },
      { id: 'demo-p10', name: 'Credit card payment', type: 'debt', amount: 150 }, { id: 'demo-p11', name: 'Buffer', type: 'other', amount: 50 },
    ],
  };
  st.planTemplates = [];

  // ---- transactions
  let n = 0;
  const tx = (date, desc, amount, more = {}) => ({ id: `demo-tx-${++n}`, date, desc, amount: r2(amount), direction: 'out', kind: 'spending', category: 'Essentials', account: 'Demo Current Account', source: 'demo', detail: '', note: '', ...more });
  const list = [];
  const spend = (date, desc, amount, category, detail, more = {}) => list.push(tx(date, desc, amount, { category, detail, ...more }));
  for (let day = start; day <= today; day = addDays(day, 1)) {
    const dom = +day.slice(8, 10);
    if (st.paydates.includes(day)) {
      list.push(tx(day, 'Demo Employer Ltd', 2400, { direction: 'in', kind: 'income', category: '', detail: 'Salary' }));
      list.push(tx(addDays(day, 2), 'Demo Cash ISA deposit', 400, { kind: 'invested', category: '', detail: 'ISA deposit' }));
      list.push(tx(addDays(day, 2), 'Demo S&S ISA deposit', 200, { kind: 'invested', category: '', detail: 'ISA deposit' }));
      list.push(tx(addDays(day, 3), 'Demo Credit Card payment', 150, { kind: 'internal', category: 'Credit card repayment', detail: 'Credit card repayment' }));
    }
    if (rand() < 0.36) spend(day, 'Demo Supermarket', between(6, 46), 'Groceries', 'Groceries');
    if (rand() < 0.3) spend(day, 'Demo Corner Shop', between(1.5, 3.4), 'Essentials', 'Energy drink');
    if (rand() < 0.1) spend(day, 'Demo Corner Shop', between(3.5, 5.4), 'Essentials', 'Snacks & drinks');
    if (rand() < 0.12) spend(day, 'Demo Takeaway', between(8, 26), 'Fun', 'Takeaway & eating out');
    if (rand() < 0.1) spend(day, 'Demo Bakery', between(3, 9), 'Fun', 'Bakery');
    if (rand() < 0.04) spend(day, 'Demo Bar', between(10, 38), 'Fun', 'Pubs & bars');
    if (rand() < 0.05) spend(day, 'Demo Petrol Station', between(35, 62), 'Essentials', 'Fuel', { account: 'Demo Credit Card' });
    if (rand() < 0.06) spend(day, 'Demo Bus Co', between(3, 15), 'Essentials', 'Transport');
    if (rand() < 0.025) spend(day, 'Demo Online Store', between(18, 90), 'Personal Upkeep', 'Shopping', { account: 'Demo Credit Card' });
    if (rand() < 0.015) spend(day, 'Demo Clothing Shop', between(25, 85), 'Personal Upkeep', 'Clothing & shoes');
    if (rand() < 0.02) spend(day, 'Demo Cinema', between(8, 18), 'Fun', 'Entertainment');
    if (dom === 1) { spend(day, 'Demo Rent', 650, 'Essentials', 'Rent'); spend(day, 'Demo Gym', 29.95, 'Essentials', 'Gym membership'); }
    if (dom === 8) spend(day, 'Demo Streaming', 9.99, 'Essentials', 'Subscriptions');
    if (dom === 9) spend(day, 'Demo Cloud Storage', 2.99, 'Essentials', 'Subscriptions');
    if (dom === 15) spend(day, 'Demo Energy Co', 85, 'Essentials', 'Utilities');
    if (dom === 22) spend(day, 'Demo Phone Plan', 12, 'Essentials', 'Subscriptions');
    // a weekly sports night, with friends paying their share back
    const dow = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
    if (dow === 2) {
      spend(day, 'Demo Sports Court', 24, 'Fun', 'Sport & fitness');
      for (const f of ['Demo Friend A', 'Demo Friend B', 'Demo Friend C']) list.push(tx(addDays(day, 1), `Transfer from ${f}`, 6, { direction: 'in', kind: 'payback', category: 'Fun', detail: 'Friends', note: 'Sports night' }));
    }
    if (dow === 5) spend(day, 'Demo Partner', between(15, 40), 'Life Fund', 'Partner', { note: 'Treat' });
    if (rand() < 0.04) { const a = between(8, 30); spend(day, 'Transfer to Demo Friend B', a, 'Fun', 'Friends'); list.push(tx(addDays(day, 3), 'Transfer from Demo Friend B', a, { direction: 'in', kind: 'payback', category: 'Fun', detail: 'Friends' })); }
  }
  const trip = addDays(today, -52);
  spend(trip, 'Demo Airline', 320, 'Essentials', 'Travel', { tag: 'Demo trip', account: 'Demo Credit Card' });
  spend(addDays(trip, 3), 'Demo Hotel', 280, 'Essentials', 'Hotel', { tag: 'Demo trip' });
  spend(addDays(trip, 5), 'Demo Restaurant', 64, 'Fun', 'Takeaway & eating out', { tag: 'Demo trip' });
  d.transactions = list.filter((t) => t.date <= today).sort((a, b) => a.date.localeCompare(b.date));

  // ---- accounts and a monthly history for net worth
  d.accounts = [
    { id: 'demo-a1', name: 'Demo Current Account', type: 'current', balance: 1150, updated: addDays(today, -2) },
    { id: 'demo-a2', name: 'Demo Savings Pot', type: 'savings', balance: 2400, updated: addDays(today, -2) },
    { id: 'demo-a3', name: 'Demo Cash ISA', type: 'savings', balance: 6175, updated: addDays(today, -9) },
    { id: 'demo-a4', name: 'Demo S&S ISA', type: 'investment', balance: 5600, updated: addDays(today, -9) },
    { id: 'demo-a5', name: 'Demo Pension', type: 'pension', balance: 14200, updated: addDays(today, -30) },
    { id: 'demo-a6', name: 'Demo Credit Card', type: 'credit', balance: 420, limit: 2000, apr: 22.9, dueDay: 28, minPayment: 25, statementBalance: 150, updated: addDays(today, -4) },
    { id: 'demo-a7', name: 'Demo Opportunity Fund', type: 'other', balance: 500, opportunity: true, updated: addDays(today, -9) },
  ];
  d.snapshots = [5, 4, 3, 2, 1].map((back, i) => ({
    id: `demo-s${i}`, date: addDays(addMonths(`${today.slice(0, 7)}-01`, -back + 1), -1),
    balances: { 'demo-a1': 700 + i * 90, 'demo-a2': 1500 + i * 190, 'demo-a3': 4500 + i * 340, 'demo-a4': 3800 + i * 360, 'demo-a5': 12300 + i * 380, 'demo-a6': 900 - i * 100, 'demo-a7': 300 + i * 40 },
  }));

  // ---- goals, holdings, money owed, dividends
  const hist = (from, to) => [0, 1, 2, 3, 4, 5].map((i) => ({ date: addDays(today, -150 + i * 30), balance: Math.round(from + ((to - from) * i) / 5) }));
  d.goals = [
    { id: 'demo-g1', name: 'Demo Emergency Fund', kind: 'emergency', balance: 2400, target: 6000, targetDate: addMonths(today, 10), monthly: 200, rate: 3.5, priority: 1, interest: 41, history: hist(1400, 2400) },
    { id: 'demo-g2', name: 'Demo Holiday Pot', kind: 'holiday', balance: 450, target: 1200, targetDate: addMonths(today, 5), monthly: 100, rate: 0, priority: 2, interest: 0, history: hist(100, 450) },
    { id: 'demo-g3', name: 'Demo New Car', kind: 'purchase', balance: 1800, target: 8000, targetDate: '', monthly: 150, rate: 2, priority: 3, interest: 12, history: hist(900, 1800) },
  ];
  d.holdings = [
    { id: 'demo-h1', name: 'Demo Global ETF', ticker: 'DGE', kind: 'ETF', assetClass: 'Equity', sector: 'Diversified', geography: 'Global', value: 4200, cost: 3600, fee: 0.2 },
    { id: 'demo-h2', name: 'Demo Tech Stock', ticker: 'DTS', kind: 'stock', assetClass: 'Equity', sector: 'Technology', geography: 'US', value: 1100, cost: 900, fee: 0 },
    { id: 'demo-h3', name: 'Demo Bond Fund', ticker: 'DBF', kind: 'fund', assetClass: 'Bonds', sector: 'Government', geography: 'UK', value: 300, cost: 310, fee: 0.1 },
  ];
  d.owed = [
    { id: 'demo-o1', person: 'Demo Friend A', amount: 45, received: 15, date: addDays(today, -20), expected: addDays(today, 5), note: 'Concert tickets', applied: [] },
    { id: 'demo-o2', person: 'Demo Friend C', amount: 30, received: 0, date: addDays(today, -40), expected: addDays(today, -10), note: 'Dinner', applied: [] },
  ];
  d.dividends = [
    { id: 'demo-d1', date: addDays(today, -75), amount: 12.4, holding: 'Demo Global ETF' }, { id: 'demo-d2', date: addDays(today, -45), amount: 9.1, holding: 'Demo Global ETF' },
    { id: 'demo-d3', date: addDays(today, -15), amount: 14.2, holding: 'Demo Tech Stock' },
  ];
  // ---- history from a pretend earlier tracker (headline totals only)
  d.history = [10, 9, 8, 7].map((back, i) => {
    const s = addMonths(anchor, -back);
    const spent = { Essentials: 880 + i * 40, Groceries: 250 + i * 12, 'Personal Upkeep': 55 + i * 6, 'Life Fund': 90 + i * 5, Fun: 150 + i * 14 };
    return { id: `demo-hist-${i}`, source: 'old-dashboard', label: `Demo earlier cycle ${i + 1}`, start: s, end: addDays(addMonths(s, 1), -1), spent, spentTotal: r2(Object.values(spent).reduce((a, v) => a + v, 0)), invested: 600, saved: 150 + i * 10, withdrawn: 0, plannedIncome: 2400, txCount: 70 };
  });
  return d;
}

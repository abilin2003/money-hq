// The made-up starting point for browser tests: one test user, a few synthetic accounts with typed-in balances,
// a handful of categories and a current pay cycle. Nothing here is real data. Dates are worked out from today
// (Europe/London), so the balances are always "yesterday" and the cycle always contains today.

export const TEST_USER = { id: '00000000-0000-4000-8000-000000000001', email: 'tester@example.test', password: 'fake-local-test-password' };

const londonToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
const shift = (iso, days) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

export const IDS = {
  bank: '10000000-0000-4000-8000-000000000001', spend: '10000000-0000-4000-8000-000000000002', isa: '10000000-0000-4000-8000-000000000003',
  card: '10000000-0000-4000-8000-000000000004', pension: '10000000-0000-4000-8000-000000000005',
  essentials: '20000000-0000-4000-8000-000000000001', groceries: '20000000-0000-4000-8000-000000000002', fun: '20000000-0000-4000-8000-000000000003', upkeep: '20000000-0000-4000-8000-000000000004', fuel: '20000000-0000-4000-8000-000000000005',
  catGroceries: '30000000-0000-4000-8000-000000000001', catEating: '30000000-0000-4000-8000-000000000002', catClothes: '30000000-0000-4000-8000-000000000003', catFuel: '30000000-0000-4000-8000-000000000004', catBills: '30000000-0000-4000-8000-000000000005', catGifts: '30000000-0000-4000-8000-000000000006',
};

export function seedData() {
  const today = londonToday();
  const yesterday = shift(today, -1);
  const payday = shift(today, -10);
  const u = TEST_USER.id;
  const row = (r) => ({ user_id: u, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...r });
  return {
    settings: [row({ id: '40000000-0000-4000-8000-000000000001', reserve_pence: 0, payday_usual_day: Number(payday.slice(8, 10)), paydays: [shift(payday, -30), payday, shift(payday, 30)], extra: {} })],
    accounts: [
      row({ id: IDS.bank, name: 'Test Bank', type: 'current', institution: 'Test Bank', is_active: true, import_format: 'manual' }),
      row({ id: IDS.spend, name: 'Test Spending', type: 'current', institution: 'Test Spending', is_active: true, import_format: 'manual' }),
      row({ id: IDS.isa, name: 'Test Cash ISA', type: 'isa', institution: 'Test Invest', is_active: true, import_format: 'manual' }),
      row({ id: IDS.card, name: 'Test Card', type: 'credit_card', institution: 'Test Card', is_active: true, import_format: 'manual' }),
      row({ id: IDS.pension, name: 'Test Pension', type: 'pension', institution: null, is_active: true, import_format: 'manual' }),
    ],
    balance_snapshots: [
      row({ id: '50000000-0000-4000-8000-000000000001', account_id: IDS.bank, date: yesterday, balance_pence: 200000 }),
      row({ id: '50000000-0000-4000-8000-000000000002', account_id: IDS.spend, date: yesterday, balance_pence: 30000 }),
      row({ id: '50000000-0000-4000-8000-000000000003', account_id: IDS.isa, date: yesterday, balance_pence: 600000 }),
      row({ id: '50000000-0000-4000-8000-000000000004', account_id: IDS.card, date: yesterday, balance_pence: 0 }),
    ],
    buckets: [
      row({ id: IDS.essentials, name: 'Essentials', colour: '#7AA2FF', sort_order: 1 }),
      row({ id: IDS.groceries, name: 'Groceries', colour: '#5BD6A0', sort_order: 2 }),
      row({ id: IDS.upkeep, name: 'Personal Upkeep', colour: '#B79CFF', sort_order: 3 }),
      row({ id: IDS.fun, name: 'Fun', colour: '#F7B955', sort_order: 4 }),
      row({ id: IDS.fuel, name: 'Fuel', colour: '#4FC9E0', sort_order: 5 }),
    ],
    categories: [
      row({ id: IDS.catGroceries, name: 'Groceries', bucket_id: IDS.groceries, is_active: true }),
      row({ id: IDS.catEating, name: 'Eating out & takeaway', bucket_id: IDS.fun, is_active: true }),
      row({ id: IDS.catClothes, name: 'Clothes & shopping', bucket_id: IDS.upkeep, is_active: true }),
      row({ id: IDS.catFuel, name: 'Fuel', bucket_id: IDS.fuel, is_active: true }),
      row({ id: IDS.catBills, name: 'Bills & subscriptions', bucket_id: IDS.essentials, is_active: true }),
      row({ id: IDS.catGifts, name: 'Gifts', bucket_id: IDS.fun, is_active: true }),
    ],
    cycles: [], budgets: [], rules: [], transactions: [], recurring: [], sinking_funds: [], people: [], splits: [], goals: [], import_batches: [],
  };
}

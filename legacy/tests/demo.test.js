// Tests for demo mode's fake data. The demo must be valid, repeatable and obviously fake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoData, isDemoName } from '../js/demo.js';
import { migrate } from '../js/store.js';
import { cycleSummary } from '../js/insights.js';
import { dashboardSummary } from '../js/dashboard.js';
import { accountsSummary, budgetStatus, planSummary, cashflow, healthScore, scenario } from '../js/finance.js';
import { insights, monthlyReview } from '../js/advice.js';

const TODAY = '2026-11-24';

test('the demo data is a valid, complete data set', () => {
  const d = migrate(makeDemoData(TODAY));
  assert.ok(d.transactions.length > 300);
  for (const kind of ['spending', 'income', 'invested', 'payback', 'internal']) assert.ok(d.transactions.some((t) => t.kind === kind), kind);
  for (const list of ['accounts', 'snapshots', 'goals', 'holdings', 'owed', 'dividends']) assert.ok(d[list].length > 0, list);
  assert.ok(d.settings.plan.allocations.length >= 8);
  assert.equal(d.transactions.filter((t) => t.date > TODAY).length, 0, 'nothing in the future');
});

test('the demo is repeatable, and everything in it is obviously fake', () => {
  assert.deepEqual(makeDemoData(TODAY), makeDemoData(TODAY));
  const d = makeDemoData(TODAY);
  const names = [...d.accounts.map((a) => a.name), ...d.goals.map((g) => g.name), ...d.holdings.map((h) => h.name), ...d.owed.map((o) => o.person)];
  assert.ok(names.every(isDemoName), 'every account, goal, holding and person says Demo');
  const shops = new Set(d.transactions.map((t) => t.desc.replace(/^Transfer (to|from) /, '')));
  assert.ok([...shops].every(isDemoName), 'every shop and person in the transactions says Demo');
});

test('every page of numbers works on the demo with no NaN', () => {
  const d = makeDemoData(TODAY);
  const all = JSON.stringify([cycleSummary(d, TODAY), dashboardSummary(d, {}), accountsSummary(d.accounts), budgetStatus(d, TODAY), planSummary(d), cashflow(d, TODAY), healthScore(d, TODAY), scenario(d, TODAY, { newBill: 50 }), insights(d, TODAY), monthlyReview(d, TODAY)]);
  assert.ok(!/NaN|undefined/.test(all));
  assert.ok(healthScore(d, TODAY).score > 0);
  assert.ok(planSummary(d).unallocated >= 0, 'the demo plan fits within the salary');
});

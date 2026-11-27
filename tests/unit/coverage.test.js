// Statement coverage per account and each import's results. Made-up data.
import { describe, it, expect } from 'vitest';
import { accountCoverage, batchSummary } from '../../src/lib/coverage.js';

const accounts = [{ id: 'ul', name: 'Ulster Bank', type: 'current' }, { id: 'rv', name: 'Revolut', type: 'current' }, { id: 'pn', name: 'Pension', type: 'pension' }];
const batches = [
  { id: 'b1', imported_at: '2026-11-20T10:00:00Z', row_count: 10, duplicate_count: 2, details: { files: [{ account: 'Ulster Bank', from: '2026-11-01', to: '2026-11-18' }], counts: { possibleMatch: 1 } } },
  { id: 'b2', imported_at: '2026-11-27T09:00:00Z', row_count: 4, duplicate_count: 3, details: { files: [{ account: 'Ulster Bank', from: '2026-11-15', to: '2026-11-24' }] } },
];
const t = (account_id, date, more = {}) => ({ account_id, date, source: 'manual', status: 'reviewed', bank: null, archived: false, ...more });
const txs = [
  t('ul', '2026-11-24', { bank: { date: '2026-11-25', batch_id: 'b2' } }), // typed, then verified by the statement
  t('ul', '2026-11-26'), // typed after the statement: not checked yet
  t('ul', '2026-11-20', { source: 'import:ulster', import_batch_id: 'b1', status: 'needs_review' }), // waiting
  t('ul', '2026-11-10', { source: 'import:ulster', import_batch_id: 'b1' }),
  t('rv', '2026-11-25'), // Revolut: typed only, never imported
];

describe('statement coverage per account', () => {
  const cov = accountCoverage(accounts, batches, txs);
  it('keeps what statements reached apart from what you typed', () => {
    const ul = cov.find((r) => r.name === 'Ulster Bank');
    expect(ul).toMatchObject({ lastImport: '2026-11-27T09:00:00Z', importedFrom: '2026-11-01', importedTo: '2026-11-25', latestManual: '2026-11-26', unchecked: 1, pending: 1, status: '1 to review', periodKnown: false });
  });
  it('an account you only type into says it has never been imported; one with nothing is left out', () => {
    expect(cov.find((r) => r.name === 'Revolut')).toMatchObject({ status: 'never imported', importedTo: null, unchecked: 1 });
    expect(cov.some((r) => r.name === 'Pension')).toBe(false);
  });
  it('reconciled once nothing waits and every entry has been on a statement', () => {
    const done = accountCoverage(accounts, batches, [t('ul', '2026-11-24', { bank: { date: '2026-11-25', batch_id: 'b2' } })]);
    expect(done[0].status).toBe('reconciled');
  });
  it('uses the bank’s stated period when the export gives one', () => {
    const withPeriod = [{ id: 'b3', imported_at: '2026-11-28T09:00:00Z', details: { files: [{ account: 'Revolut', from: '2026-11-03', to: '2026-11-20', period_from: '2026-11-01', period_to: '2026-11-30' }] } }];
    expect(accountCoverage(accounts, withPeriod, [])[0]).toMatchObject({ name: 'Revolut', importedFrom: '2026-11-01', importedTo: '2026-11-30', periodKnown: true });
  });
});

describe('one import’s results', () => {
  it('matched, added, still pending, approved since, uncertain and duplicates', () => {
    expect(batchSummary(batches[0], txs)).toEqual({ matched: 0, added: 2, pending: 1, approved: 1, uncertain: 1, duplicates: 2, rows: 10 });
    expect(batchSummary(batches[1], txs)).toMatchObject({ matched: 1, added: 0, duplicates: 3 });
  });
});

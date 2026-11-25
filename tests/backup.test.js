// Unit tests for the data schema, its migrations and backup files. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_VERSION, migrate, emptyData } from '../js/store.js';
import { makeBackup, backupFileName, parseBackup } from '../js/backup.js';

// Obviously fake test data.
const fakeTx = { id: 'test-1', date: '2026-01-02', desc: 'Test shop', amount: 1, direction: 'out', kind: 'spending', category: 'Test', account: 'Ulster Bank', source: 'manual' };

test('an empty data object is valid and has every section', () => {
  const data = migrate(emptyData());
  assert.equal(data.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(data.transactions, []);
  assert.deepEqual(data.closedMonths, []);
  assert.deepEqual(data.pots, []);
  assert.equal(data.settings.categories.length, 5);
});

test('migrate keeps existing transactions untouched', () => {
  const input = { ...emptyData(), transactions: [fakeTx] };
  const snapshot = JSON.parse(JSON.stringify(input));
  const data = migrate(input);
  assert.deepEqual(data.transactions, [fakeTx]);
  assert.deepEqual(input, snapshot, 'input must not be modified');
});

test('migration 1 to 2: old loosely-shaped data gains the new fields and loses nothing', () => {
  const v1 = {
    schemaVersion: 1,
    settings: { someOldSetting: 'keep me' },
    transactions: [{ id: 'a', date: '2026-01-02', desc: 'Test shop', amount: 1, category: 'Test', tag: 'Trip' }, { date: '2026-01-03', desc: 'No id', amount: '2.5', bucket: 'Fun', bank: 'Revolut' }],
    closedMonths: [{ id: 'm1' }],
    pots: [{ id: 'p1' }],
  };
  const snapshot = JSON.parse(JSON.stringify(v1));
  const data = migrate(v1);
  assert.equal(data.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(data.transactions[0], { id: 'a', date: '2026-01-02', desc: 'Test shop', amount: 1, category: 'Test', tag: 'Trip', direction: 'out', kind: 'spending', account: '', source: 'manual', detail: '', note: '' });
  assert.equal(data.transactions[1].id, 'legacy-1');
  assert.equal(data.transactions[1].amount, 2.5);
  assert.equal(data.transactions[1].category, 'Fun');
  assert.equal(data.transactions[1].account, 'Revolut');
  assert.equal(data.settings.someOldSetting, 'keep me');
  assert.equal(data.settings.categories.length, 5, 'new settings get their defaults');
  assert.deepEqual(data.closedMonths, [{ id: 'm1' }]);
  assert.deepEqual(data.pots, [{ id: 'p1' }]);
  assert.deepEqual(v1, snapshot, 'input must not be modified');
});

test('migration 2 to 3: transactions gain detail and note, and nothing already there is replaced', () => {
  const v2 = {
    ...emptyData(),
    schemaVersion: 2,
    transactions: [fakeTx, { ...fakeTx, id: 'test-2', detail: 'Energy drink', note: 'before gym' }],
  };
  const snapshot = JSON.parse(JSON.stringify(v2));
  const data = migrate(v2);
  assert.equal(data.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(data.transactions[0], { ...fakeTx, detail: '', note: '' });
  assert.equal(data.transactions[1].detail, 'Energy drink', 'an existing value is never overwritten');
  assert.equal(data.transactions[1].note, 'before gym');
  assert.deepEqual(v2, snapshot, 'input must not be modified');
});

test('migrate rejects data from a newer version, with a plain message', () => {
  assert.throws(() => migrate({ schemaVersion: SCHEMA_VERSION + 1, transactions: [] }), /newer version/);
});

test('migrate rejects a missing or invalid version number', () => {
  assert.throws(() => migrate({ transactions: [] }), /no valid version/);
  assert.throws(() => migrate({ schemaVersion: 0, transactions: [] }), /no valid version/);
});

test('migrate rejects damaged sections instead of silently replacing them', () => {
  assert.throws(() => migrate({ schemaVersion: 2, transactions: 'oops' }), /"transactions" section is damaged/);
  assert.throws(() => migrate({ schemaVersion: 2, settings: [] }), /"settings" section is damaged/);
  assert.throws(() => migrate({ schemaVersion: 2, settings: { paydates: 'x' } }), /"paydates" setting is damaged/);
  assert.throws(() => migrate({ schemaVersion: 2, transactions: [{ ...fakeTx, kind: 'nonsense' }] }), /transaction in the data is damaged/);
});

test('a backup round-trips through JSON without losing anything', () => {
  const data = migrate({ ...emptyData(), transactions: [fakeTx], pots: [{ id: 'p', pot: 'Test pot', type: 'in', amount: 5, date: '2026-01-02' }] });
  const text = JSON.stringify(makeBackup(data, new Date('2026-11-18T10:00:00Z')));
  const parsed = parseBackup(text);
  assert.deepEqual(parsed.data.transactions, [fakeTx]);
  assert.equal(parsed.data.pots.length, 1);
  assert.equal(parsed.transactionCount, 1);
  assert.equal(parsed.exported, '2026-11-18T10:00:00.000Z');
});

test('a backup made by version 1 of the app can still be restored', () => {
  const text = JSON.stringify({ app: 'money-hq', schemaVersion: 1, exported: '2026-11-01T09:00:00.000Z', data: { schemaVersion: 1, settings: {}, transactions: [{ id: 't', date: '2026-10-01', desc: 'Test', amount: 1 }], closedMonths: [], pots: [] } });
  const parsed = parseBackup(text);
  assert.equal(parsed.data.schemaVersion, SCHEMA_VERSION);
  assert.equal(parsed.data.transactions[0].kind, 'spending');
});

test('backup file names contain "backup" so .gitignore keeps them private', () => {
  const name = backupFileName(new Date('2026-11-18T10:00:00Z'));
  assert.equal(name, 'money-hq-backup-2026-11-18.json');
  assert.match(name, /backup.*\.json$/);
});

test('parseBackup rejects text that is not JSON', () => {
  assert.throws(() => parseBackup('this is not json'), /can't be read as JSON/);
});

test('parseBackup rejects a JSON file that is not a Money HQ backup', () => {
  assert.throws(() => parseBackup(JSON.stringify({ hello: 'world' })), /isn't a Money HQ backup/);
});

test('parseBackup points old-dashboard backups to the old-dashboard importer', () => {
  const old = JSON.stringify({ app: 'my-finance', version: 6, finTXS4: [] });
  assert.throws(() => parseBackup(old), /old dashboard/);
});

test('migration 3 to 4: new lists and settings appear empty, and nothing already there changes', () => {
  const v3 = { schemaVersion: 3, settings: { budgets: { Test: 5 }, paydates: ['2026-01-01'] }, transactions: [{ ...fakeTx, detail: 'X', note: 'y' }], closedMonths: [], pots: [] };
  const snapshot = JSON.parse(JSON.stringify(v3));
  const data = migrate(v3);
  assert.equal(data.schemaVersion, SCHEMA_VERSION);
  for (const key of ['accounts', 'snapshots', 'goals', 'holdings', 'owed', 'dividends', 'audit']) assert.deepEqual(data[key], [], key);
  assert.deepEqual(data.settings.budgets, { Test: 5 });
  assert.deepEqual(data.settings.paydates, ['2026-01-01']);
  assert.equal(data.settings.theme, 'auto');
  assert.deepEqual(data.settings.essentialBuckets, ['Essentials', 'Groceries']);
  assert.deepEqual(data.settings.plan, { salary: 0, allocations: [] });
  assert.equal(data.transactions[0].detail, 'X');
  assert.deepEqual(v3, snapshot, 'input must not be modified');
});

test('migrate rejects a damaged new list', () => {
  assert.throws(() => migrate({ schemaVersion: 4, goals: 'oops' }), /"goals" section is damaged/);
});

test('migration 4 to 5: an empty history list appears, and nothing already there changes', () => {
  const v4 = { schemaVersion: 4, settings: { budgets: { Test: 5 } }, transactions: [fakeTx], closedMonths: [], pots: [], goals: [{ id: 'g' }] };
  const snapshot = JSON.parse(JSON.stringify(v4));
  const data = migrate(v4);
  assert.equal(data.schemaVersion, 5);
  assert.deepEqual(data.history, []);
  assert.deepEqual(data.goals, [{ id: 'g' }]);
  assert.deepEqual(data.settings.budgets, { Test: 5 });
  assert.deepEqual(v4, snapshot, 'input must not be modified');
  assert.throws(() => migrate({ schemaVersion: 5, history: 'oops' }), /"history" section is damaged/);
});

test('SCHEMA_VERSION is 5', () => {
  assert.equal(SCHEMA_VERSION, 5);
});

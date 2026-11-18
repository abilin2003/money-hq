// Unit tests for the data schema and backup files. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_VERSION, migrate, emptyData } from '../js/store.js';
import { makeBackup, backupFileName, parseBackup } from '../js/backup.js';

// Obviously fake test data.
const fakeTx = { id: 'test-1', date: '2026-01-02', desc: 'Test shop', amount: 1, category: 'Test' };

test('an empty data object is valid and has every section', () => {
  const data = migrate(emptyData());
  assert.equal(data.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(data.transactions, []);
  assert.deepEqual(data.closedMonths, []);
  assert.deepEqual(data.pots, []);
});

test('migrate keeps existing transactions untouched', () => {
  const input = { schemaVersion: 1, transactions: [fakeTx] };
  const data = migrate(input);
  assert.deepEqual(data.transactions, [fakeTx]);
  assert.deepEqual(input, { schemaVersion: 1, transactions: [fakeTx] }, 'input must not be modified');
});

test('migrate rejects data from a newer version, with a plain message', () => {
  assert.throws(() => migrate({ schemaVersion: SCHEMA_VERSION + 1, transactions: [] }), /newer version/);
});

test('migrate rejects a missing or invalid version number', () => {
  assert.throws(() => migrate({ transactions: [] }), /no valid version/);
  assert.throws(() => migrate({ schemaVersion: 0, transactions: [] }), /no valid version/);
});

test('migrate rejects damaged sections instead of silently replacing them', () => {
  assert.throws(() => migrate({ schemaVersion: 1, transactions: 'oops' }), /"transactions" section is damaged/);
  assert.throws(() => migrate({ schemaVersion: 1, settings: [] }), /"settings" section is damaged/);
});

test('a backup round-trips through JSON without losing anything', () => {
  const data = migrate({ schemaVersion: 1, transactions: [fakeTx], pots: [{ name: 'Test pot' }] });
  const text = JSON.stringify(makeBackup(data, new Date('2026-11-18T10:00:00Z')));
  const parsed = parseBackup(text);
  assert.deepEqual(parsed.data.transactions, [fakeTx]);
  assert.deepEqual(parsed.data.pots, [{ name: 'Test pot' }]);
  assert.equal(parsed.transactionCount, 1);
  assert.equal(parsed.exported, '2026-11-18T10:00:00.000Z');
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

test('parseBackup explains that old-dashboard backups are for Phase 1', () => {
  const old = JSON.stringify({ app: 'my-finance', version: 6, finTXS4: [] });
  assert.throws(() => parseBackup(old), /old dashboard/);
});

test('SCHEMA_VERSION is 1 at the start of the project', () => {
  assert.equal(SCHEMA_VERSION, 1);
});

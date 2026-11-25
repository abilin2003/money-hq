// Tests for password-protected backups. All data is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptText, decryptText, isEncryptedBackup, encryptedBackupName } from '../js/crypto.js';
import { makeBackup, parseBackup } from '../js/backup.js';
import { emptyData } from '../js/store.js';

test('an encrypted backup opens with the right password and gives back exactly what went in', async () => {
  const data = { ...emptyData(), transactions: [{ id: 't1', date: '2026-01-02', desc: 'Test shop', amount: 3.5, direction: 'out', kind: 'spending', category: 'Fun', account: 'Test', source: 'manual', detail: '', note: '' }] };
  const plain = JSON.stringify(makeBackup(data));
  const file = await encryptText(plain, 'correct horse battery');
  assert.equal(isEncryptedBackup(file), true);
  assert.ok(!JSON.stringify(file).includes('Test shop'), 'the shop name must not appear in the encrypted file');
  const back = await decryptText(file, 'correct horse battery');
  assert.equal(back, plain);
  assert.equal(parseBackup(back).transactionCount, 1);
});

test('the wrong password is refused with a plain message', async () => {
  const file = await encryptText('secret', 'right-password');
  await assert.rejects(() => decryptText(file, 'wrong-password'), /does not open this backup/);
});

test('short passwords are refused, and two encryptions of the same text differ', async () => {
  await assert.rejects(() => encryptText('x', 'short'), /at least 8/);
  const a = await encryptText('same text', 'password-123');
  const b = await encryptText('same text', 'password-123');
  assert.notEqual(a.data, b.data);
  assert.notEqual(a.salt, b.salt);
});

test('a big backup survives the round trip', async () => {
  const big = JSON.stringify(Array.from({ length: 20000 }, (_, i) => ({ id: i, text: 'x'.repeat(20) })));
  assert.equal(await decryptText(await encryptText(big, 'password-123'), 'password-123'), big);
});

test('only genuine encrypted Money HQ files are recognised; the file name says backup so Git ignores it', () => {
  assert.equal(isEncryptedBackup({ hello: 1 }), false);
  assert.equal(isEncryptedBackup(null), false);
  assert.match(encryptedBackupName(new Date('2026-11-24T10:00:00Z')), /^money-hq-backup-encrypted-2026-11-24\.json$/);
});

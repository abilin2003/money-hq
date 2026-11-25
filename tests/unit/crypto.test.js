// Password-protected backups (kept from the old app). All data here is made up.
import { describe, it, expect } from 'vitest';
import { encryptText, decryptText, isEncryptedBackup } from '../../src/lib/crypto.js';

describe('encrypted backups', () => {
  it('open with the right password and give back exactly what went in, with nothing readable inside', async () => {
    const plain = JSON.stringify({ app: 'money-hq', tables: { transactions: [{ raw_description: 'Test shop', amount_pence: -350 }] } });
    const file = await encryptText(plain, 'correct horse battery');
    expect(isEncryptedBackup(file)).toBe(true);
    expect(JSON.stringify(file)).not.toContain('Test shop');
    expect(await decryptText(file, 'correct horse battery')).toBe(plain);
  });
  it('refuse the wrong password with a plain message, and short passwords', async () => {
    const file = await encryptText('secret', 'right-password');
    await expect(decryptText(file, 'wrong-password')).rejects.toThrow(/does not open/);
    await expect(encryptText('x', 'short')).rejects.toThrow(/at least 8/);
  });
});

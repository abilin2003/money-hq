// Password-protected backups. Uses the browser's built-in Web Crypto (PBKDF2 to make a key from your password,
// AES-GCM to encrypt). Nothing is sent anywhere, and there is no way to recover a backup if you forget the password.

const ITERATIONS = 250000;
const te = new TextEncoder();
const td = new TextDecoder();

function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

// Returns a plain object you can JSON.stringify and save as a file.
export async function encryptText(text, password) {
  if (!password || password.length < 8) throw new Error('Use a password of at least 8 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(text));
  return { app: 'money-hq', encrypted: true, version: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: toB64(salt), iv: toB64(iv), data: toB64(data) };
}

export const isEncryptedBackup = (obj) => !!obj && obj.app === 'money-hq' && obj.encrypted === true && typeof obj.data === 'string';

export async function decryptText(obj, password) {
  if (!isEncryptedBackup(obj)) throw new Error("That file isn't an encrypted Money HQ backup.");
  try {
    const key = await deriveKey(password, fromB64(obj.salt), Number(obj.iterations) || ITERATIONS);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(obj.iv) }, key, fromB64(obj.data));
    return td.decode(plain);
  } catch {
    throw new Error('That password does not open this backup, or the file is damaged.');
  }
}

export const encryptedBackupName = (now = new Date()) => `money-hq-backup-encrypted-${now.toISOString().slice(0, 10)}.json`;

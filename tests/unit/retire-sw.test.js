// The old app's service worker must be retired when the new app is published (see public/sw.js).
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const sw = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');

describe('retiring the old service worker', () => {
  it('is published at the same address the old app registered (public/ is copied to the site root)', () => {
    expect(existsSync(new URL('../../public/sw.js', import.meta.url))).toBe(true);
  });
  it('takes over straight away, clears only the old file cache, then removes itself', () => {
    expect(sw).toMatch(/skipWaiting\(\)/);
    expect(sw).toMatch(/startsWith\('money-hq-shell'\)/);
    expect(sw).toMatch(/registration\.unregister\(\)/);
  });
  it('never touches saved data or answers from a cache', () => {
    expect(sw).not.toMatch(/indexedDB|deleteDatabase/);
    expect(sw).not.toMatch(/respondWith/);
  });
  it('the new app does not register a service worker of its own', () => {
    expect(readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8')).not.toMatch(/serviceWorker/);
  });
});

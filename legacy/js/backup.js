// Making and reading backup files. Pure functions, so they can be tested without a browser.
import { SCHEMA_VERSION, migrate } from './store.js';

export const BACKUP_APP = 'money-hq';

export function makeBackup(data, now = new Date()) {
  return {
    app: BACKUP_APP,
    schemaVersion: SCHEMA_VERSION,
    exported: now.toISOString(),
    data,
  };
}

// The name contains "backup" so the .gitignore keeps these files out of GitHub.
export function backupFileName(now = new Date()) {
  return `money-hq-backup-${now.toISOString().slice(0, 10)}.json`;
}

export function parseBackup(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a backup: it can't be read as JSON.");
  }
  if (obj && obj.app === 'my-finance') {
    throw new Error("That's a backup from the old dashboard. Importing it comes in Phase 1.");
  }
  if (!obj || obj.app !== BACKUP_APP || !obj.data) {
    throw new Error("That file isn't a Money HQ backup.");
  }
  const data = migrate(obj.data);
  return {
    data,
    exported: typeof obj.exported === 'string' ? obj.exported : null,
    transactionCount: data.transactions.length,
  };
}

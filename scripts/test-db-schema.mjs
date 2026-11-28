// Joins every migration in supabase/migrations (structure and security rules only: no data) into one file you can
// paste into the TEST project's SQL Editor: test-results/test-db-setup.sql (not committed).
// Usage: npm run test-db:schema
import fs from 'node:fs';
import path from 'node:path';

const dir = 'supabase/migrations';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const sql = files.map((f) => `-- ===== ${f} =====\n${fs.readFileSync(path.join(dir, f), 'utf8')}`).join('\n\n');
fs.mkdirSync('test-results', { recursive: true });
fs.writeFileSync('test-results/test-db-setup.sql', `-- Money HQ schema for the TEST project only. Generated from ${files.length} migrations.\n\n${sql}\n`);
console.log(`Wrote test-results/test-db-setup.sql (${files.length} migrations). Paste it into the TEST project's SQL Editor and run it.`);

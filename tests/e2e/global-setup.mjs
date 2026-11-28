// Runs once before any browser test: refuses to go on unless the database the app will use is the fake one on
// this computer. If anything points at a real Supabase project, every test stops here.
import { assertSafeTarget } from './guard.mjs';

export default async function globalSetup() {
  await assertSafeTarget(`http://127.0.0.1:54329`);
}

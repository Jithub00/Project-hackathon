import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { openDatabase } from './db';
import { createPaymentProvider } from './payments/provider';
import { seedDemoData } from './seed';
import { bootstrapStaffAccount } from './domain/staff';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const dbPath = path.resolve(root, env.DB_PATH ?? path.join('data', 'photoshoot.db'));
const uploadsDir = path.resolve(root, env.UPLOADS_DIR ?? 'uploads');
const distDir = path.resolve(root, env.DIST_DIR ?? 'dist');
const port = Number(env.PORT ?? 4000);

if (env.RESET_DB === '1') {
  for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) fs.rmSync(file, { force: true });
}

const db = openDatabase(dbPath);
const seeded = seedDemoData(db, { force: env.SEED_DEMO !== '0' });
const staffOutcome = bootstrapStaffAccount(db, env);
if (staffOutcome === 'skipped') {
  console.warn('[staff] STAFF_BOOTSTRAP_PASSWORD does not match the staff account. Reviewer access was not granted.');
}
const provider = createPaymentProvider(env);
const app = createApp({ db, provider, env, uploadsDir, distDir });

app.listen(port, () => {
  console.log(`Photo Shoot API listening on http://localhost:${port}`);
  console.log(`Payment mode: ${provider.mode === 'demo' ? 'DEMO (no real charges)' : 'STRIPE (live keys configured)'}`);
  console.log(`Database: ${dbPath}${seeded ? ' (demo data seeded)' : ''}`);
});

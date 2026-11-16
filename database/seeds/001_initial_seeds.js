// database/seeds/001_initial_seeds.js
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', '..', 'server', 'data', 'mit_uniform.db');

console.log('[SEED] Checking initial admin and vendor configuration...');
const db = new DatabaseSync(dbPath);

const adminCount = db.prepare('SELECT count(*) as c FROM admin_users').get().c;
console.log(`[SEED] Active admin accounts: ${adminCount}`);

const vendorCount = db.prepare('SELECT count(*) as c FROM vendors').get().c;
console.log(`[SEED] Active vendors: ${vendorCount}`);

const configCount = db.prepare('SELECT count(*) as c FROM payment_config').get().c;
console.log(`[SEED] Payment configurations: ${configCount}`);

console.log('[SEED] Verification complete.');
db.close();

// database/backups/backup_database.js
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', '..', 'server', 'data', 'mit_uniform.db');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(__dirname, `mit_uniform_backup_${timestamp}.db`);

console.log('[BACKUP] Starting atomic WAL checkpoint...');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
db.close();

fs.copyFileSync(dbPath, backupPath);
console.log(`[BACKUP] Successfully created database backup: ${backupPath}`);

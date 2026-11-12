import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '../data/mit_uniform.db');
const backupsDir = path.join(__dirname, '../data/backups');
const screenshotsDir = path.join(__dirname, '../uploads/payments/screenshots');

if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

// 1. Create a full physical database copy backup
const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
const dbBackupPath = path.join(backupsDir, `mit_uniform_backup_${timestamp}.db`);
const jsonBackupPath = path.join(backupsDir, `uniform_data_snapshot_${timestamp}.json`);

fs.copyFileSync(dbPath, dbBackupPath);
console.log(`[Backup] Physical DB snapshot saved to: ${dbBackupPath}`);

const db = new DatabaseSync(dbPath);

// 2. Export full JSON snapshot of all records to be erased
const snapshot = {
  timestamp: new Date().toISOString(),
  registrations: db.prepare('SELECT * FROM registrations').all(),
  trackingRecords: db.prepare('SELECT * FROM student_tracking_records').all(),
  uniformOrders: db.prepare('SELECT * FROM uniform_orders').all(),
  studentVendorAssignments: db.prepare('SELECT * FROM student_vendor_assignments').all(),
  paymentSubmissions: db.prepare('SELECT * FROM payment_submissions').all(),
  vendorTransactionHistory: db.prepare('SELECT * FROM vendor_transaction_history').all()
};

fs.writeFileSync(jsonBackupPath, JSON.stringify(snapshot, null, 2), 'utf8');
console.log(`[Backup] JSON records snapshot saved to: ${jsonBackupPath}`);

// 3. Atomically erase student uniform data
console.log('\n[Erase] Starting atomic transaction to erase uniform data...');

db.exec('BEGIN IMMEDIATE');
try {
  db.exec(`
    DELETE FROM registrations;
    DELETE FROM student_tracking_records;
    DELETE FROM uniform_orders;
    DELETE FROM student_vendor_assignments;
    DELETE FROM payment_submissions;
    DELETE FROM vendor_transaction_history;
    DELETE FROM payment_audit_logs;
    DELETE FROM vendor_audit_logs;
    DELETE FROM audit_logs;
    DELETE FROM payment_config_history;

    -- Reset sequences
    UPDATE application_sequences SET seq = 10000 WHERE id = 'MIT_APP_2026';
    UPDATE cash_ref_sequences SET seq = 10000 WHERE id = 'MIT_CASH_REF_2026';

    -- Trigger realtime sync update
    UPDATE system_sync_state SET sync_version = sync_version + 1, updated_at = CURRENT_TIMESTAMP;
  `);

  // Clear FTS index
  try {
    db.exec("INSERT INTO registrations_fts(registrations_fts) VALUES('delete-all');");
  } catch (_) {}

  db.exec('COMMIT');
  console.log('[Erase] Transaction COMMITTED successfully.');
} catch (err) {
  db.exec('ROLLBACK');
  console.error('[Erase] ERROR - Transaction ROLLED BACK:', err.message);
  process.exit(1);
}

// 4. Remove test payment screenshots
if (fs.existsSync(screenshotsDir)) {
  const files = fs.readdirSync(screenshotsDir);
  let removedCount = 0;
  for (const file of files) {
    if (file !== '.gitkeep') {
      try {
        fs.unlinkSync(path.join(screenshotsDir, file));
        removedCount++;
      } catch (_) {}
    }
  }
  console.log(`[Clean] Removed ${removedCount} test payment proof screenshots.`);
}

// 5. Optimize SQLite storage
try {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  console.log('[Optimize] WAL checkpoint completed.');
} catch (e) {
  console.warn('[Optimize] Checkpoint warning:', e.message);
}

// 6. Verify and output clean status
console.log('\n[Verification] Current database status:');
const tablesToVerify = [
  'registrations',
  'student_tracking_records',
  'uniform_orders',
  'student_vendor_assignments',
  'payment_submissions',
  'vendor_transaction_history',
  'admin_users',
  'vendors',
  'vendor_allocations',
  'payment_config',
  'distribution_schedules'
];

for (const table of tablesToVerify) {
  const count = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c;
  console.log(`  ${table.padEnd(30)}: ${count} rows`);
}
console.log('\n[Done] All uniform data has been erased cleanly. System is ready for fresh registrations.');


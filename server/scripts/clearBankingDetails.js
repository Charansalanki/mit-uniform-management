import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'mit_uniform.db');
const uploadsQrDir = path.join(__dirname, '..', 'uploads', 'payments', 'qrs');
const uploadsScreenshotDir = path.join(__dirname, '..', 'uploads', 'payments', 'screenshots');

console.log('[CLEAR-BANKING] Initializing database connection to:', dbPath);
const db = new DatabaseSync(dbPath);

db.exec('BEGIN TRANSACTION;');

try {
  // 1. Reset vendor payment configurations
  const resetVendorPayments = db.prepare(`
    UPDATE vendor_payment_configurations
    SET beneficiary_name = '',
        upi_id = '',
        gpay_qr_url = NULL,
        gpay_enabled = 0,
        gpay_updated_at = NULL,
        phonepe_qr_url = NULL,
        phonepe_enabled = 0,
        phonepe_updated_at = NULL,
        paytm_qr_url = NULL,
        paytm_enabled = 0,
        paytm_updated_at = NULL,
        payment_instructions = '',
        updated_at = datetime('now')
  `);
  const vendorRes = resetVendorPayments.run();
  console.log(`[CLEAR-BANKING] Reset vendor_payment_configurations: ${vendorRes.changes} rows updated.`);

  // 2. Clear all payment submissions
  const deleteSubmissions = db.prepare('DELETE FROM payment_submissions');
  const subRes = deleteSubmissions.run();
  console.log(`[CLEAR-BANKING] Cleared payment_submissions: ${subRes.changes} rows deleted.`);

  // 3. Clear vendor transaction history
  const deleteTxHistory = db.prepare('DELETE FROM vendor_transaction_history');
  const txRes = deleteTxHistory.run();
  console.log(`[CLEAR-BANKING] Cleared vendor_transaction_history: ${txRes.changes} rows deleted.`);

  // 4. Reset payment methods beneficiary info & QR URLs
  const resetPaymentMethods = db.prepare(`
    UPDATE payment_methods
    SET beneficiary_name = '',
        qr_image_url = NULL,
        updated_at = datetime('now')
  `);
  const methodsRes = resetPaymentMethods.run();
  console.log(`[CLEAR-BANKING] Reset payment_methods: ${methodsRes.changes} rows updated.`);

  // 5. Reset payment config default beneficiary name
  const resetPaymentConfig = db.prepare(`
    UPDATE payment_config
    SET beneficiary_name = '',
        updated_at = datetime('now')
  `);
  const configRes = resetPaymentConfig.run();
  console.log(`[CLEAR-BANKING] Reset payment_config: ${configRes.changes} rows updated.`);

  // Commit transaction
  db.exec('COMMIT;');
  console.log('[CLEAR-BANKING] Database transaction successfully committed.');

  // Flush WAL
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch (walErr) {
    console.warn('[CLEAR-BANKING] WAL checkpoint warning:', walErr.message);
  }
} catch (err) {
  db.exec('ROLLBACK;');
  console.error('[CLEAR-BANKING] Transaction rolled back due to error:', err);
  process.exit(1);
} finally {
  db.close();
}

// 6. Delete files in server/uploads/payments/qrs and server/uploads/payments/screenshots
const cleanDirectoryFiles = (dir) => {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  let deletedCount = 0;
  for (const file of files) {
    if (file === '.gitkeep') continue;
    const fullPath = path.join(dir, file);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        fs.unlinkSync(fullPath);
        deletedCount++;
      }
    } catch (e) {
      console.warn(`[CLEAR-BANKING] Could not delete ${fullPath}:`, e.message);
    }
  }
  console.log(`[CLEAR-BANKING] Removed ${deletedCount} files from ${dir}`);
};

cleanDirectoryFiles(uploadsQrDir);
cleanDirectoryFiles(uploadsScreenshotDir);

console.log('[CLEAR-BANKING] ALL banking data, payment submissions, transaction logs, and QR/screenshot uploads successfully removed.');

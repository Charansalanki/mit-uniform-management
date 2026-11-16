import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { db } from './db.js';
import { requireAdminJwt } from './jwtAuth.js';
import sseHub from './sseHub.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Ensure backup archive table exists in SQLite
db.exec(`
  CREATE TABLE IF NOT EXISTS student_data_clear_backups (
    id TEXT PRIMARY KEY,
    backup_id TEXT NOT NULL UNIQUE,
    executed_by_admin_id TEXT,
    executed_by_username TEXT NOT NULL,
    student_records_cleared INTEGER NOT NULL DEFAULT 0,
    tracking_records_cleared INTEGER NOT NULL DEFAULT 0,
    student_vendor_assignments_cleared INTEGER NOT NULL DEFAULT 0,
    payment_records_preserved INTEGER NOT NULL DEFAULT 0,
    utr_records_preserved INTEGER NOT NULL DEFAULT 0,
    vendor_history_preserved INTEGER NOT NULL DEFAULT 0,
    snapshot_data TEXT NOT NULL,
    backup_file_path TEXT NOT NULL DEFAULT '',
    executed_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Helper: Calculate exact live record counts across SQLite tables
export const getMaintenanceRecordCounts = () => {
  const getCount = (sql) => {
    try {
      const row = db.prepare(sql).get();
      return row ? Number(row.c || 0) : 0;
    } catch {
      return 0;
    }
  };

  const registrationDocsCount = getCount('SELECT COUNT(*) as c FROM registrations');
  const trackingDocsCount = getCount('SELECT COUNT(*) as c FROM student_tracking_records');
  const studentAssignmentsCount = getCount('SELECT COUNT(*) as c FROM student_vendor_assignments');
  const uniformOrdersCount = getCount('SELECT COUNT(*) as c FROM uniform_orders');
  const paymentSubmissionsCount = getCount('SELECT COUNT(*) as c FROM payment_submissions');
  const utrRecordsCount = getCount("SELECT COUNT(*) as c FROM payment_submissions WHERE utr_number IS NOT NULL AND trim(utr_number) != ''");
  const vendorHistoryCount = getCount('SELECT COUNT(*) as c FROM vendor_transaction_history');
  const activeVendorsCount = getCount('SELECT COUNT(*) as c FROM vendors');
  const vendorAllocationsCount = getCount('SELECT COUNT(*) as c FROM vendor_allocations');

  // Total student entities to be cleared (max of registrations or tracking records)
  const studentRecordsToClear = Math.max(registrationDocsCount, trackingDocsCount);

  return {
    studentRecordsToClear,
    registrationDocsCount,
    trackingDocsCount,
    studentAssignmentsCount,
    uniformOrdersCount,
    paymentRecordsPreserved: paymentSubmissionsCount,
    utrRecordsPreserved: utrRecordsCount,
    vendorHistoryPreserved: vendorHistoryCount,
    activeVendorsPreserved: activeVendorsCount,
    vendorAllocationsPreserved: vendorAllocationsCount
  };
};

// ============================================================================
// 1. GET /api/admin/maintenance/clear-student-data/preview
// Returns live counts for the confirmation modal before clearing
// ============================================================================
router.get(
  '/admin/maintenance/clear-student-data/preview',
  requireAdminJwt,
  (req, res) => {
    try {
      const counts = getMaintenanceRecordCounts();
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      return res.json({
        success: true,
        counts
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: `Failed to fetch record preview counts: ${err.message}`
      });
    }
  }
);

// ============================================================================
// 2. POST /api/admin/maintenance/clear-student-data/execute
// Safely backs up and clears ONLY student registration/operational records
// while strictly preserving all Payment, UTR, Vendor, and System records
// ============================================================================
router.post(
  '/admin/maintenance/clear-student-data/execute',
  requireAdminJwt,
  (req, res) => {
    const { confirmed, confirmationPhrase } = req.body;

    if (!confirmed || confirmationPhrase !== 'CLEAR STUDENT DATA') {
      return res.status(400).json({
        success: false,
        message:
          'Explicit confirmation is required. Please check the confirmation box and type "CLEAR STUDENT DATA" to proceed.'
      });
    }

    // 1. Capture pre-clear counts of protected financial & student records
    const preCounts = getMaintenanceRecordCounts();

    // 2. Load full student operational records to create a pre-clear backup
    let allRegistrations = [];
    let allTrackingRecords = [];
    let allStudentAssignments = [];
    let allUniformOrders = [];

    try {
      allRegistrations = db.prepare('SELECT * FROM registrations').all();
    } catch (_) {}

    try {
      allTrackingRecords = db.prepare('SELECT * FROM student_tracking_records').all();
    } catch (_) {}

    try {
      allStudentAssignments = db.prepare('SELECT * FROM student_vendor_assignments').all();
    } catch (_) {}

    try {
      allUniformOrders = db.prepare('SELECT * FROM uniform_orders').all();
    } catch (_) {}

    const backupId = `BKP-STU-${new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(0, 14)}`;

    // Write JSON backup file to server/data/backups/student_clears
    let backupFilePath = '';
    try {
      const backupDir = path.join(__dirname, 'data', 'backups', 'student_clears');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      backupFilePath = path.join(backupDir, `${backupId}.json`);
      fs.writeFileSync(
        backupFilePath,
        JSON.stringify(
          {
            backupId,
            createdAt: new Date().toISOString(),
            executedByUsername: req.admin?.username || req.admin?.name || 'MIT',
            executedByAdminId: req.admin?.adminId || req.adminId || 'SUPER_ADMIN',
            preCounts,
            registrations: allRegistrations,
            trackingRecords: allTrackingRecords,
            studentVendorAssignments: allStudentAssignments,
            uniformOrders: allUniformOrders
          },
          null,
          2
        ),
        'utf8'
      );
    } catch (fsErr) {
      console.warn('[DataMaintenance] Could not write backup file to disk:', fsErr.message);
      backupFilePath = `sqlite://student_data_clear_backups/${backupId}`;
    }

    const executedByUsername = req.admin?.username || req.admin?.name || 'MIT';
    const executedByAdminId = req.admin?.adminId || req.adminId || 'SUPER_ADMIN';

    // 3. Perform ACID transactional delete & verify
    try {
      db.exec('BEGIN IMMEDIATE');

      // Delete ONLY Student Operational Collections
      db.prepare('DELETE FROM student_vendor_assignments').run();
      db.prepare('DELETE FROM student_tracking_records').run();
      db.prepare('DELETE FROM uniform_orders').run();
      db.prepare('DELETE FROM registrations').run();

      // Decouple studentId reference on PaymentSubmission while preserving permanent
      // transaction references, UTR numbers, amounts, screenshots, statusHistory, and USN audit references
      db.prepare(`
        UPDATE payment_submissions
        SET student_id = NULL
      `).run();

      // 4. Verify inside transaction that ZERO Payment or UTR records were lost
      const postPaymentCount = db.prepare('SELECT COUNT(*) as c FROM payment_submissions').get().c;
      const postUtrCount = db.prepare("SELECT COUNT(*) as c FROM payment_submissions WHERE utr_number IS NOT NULL AND trim(utr_number) != ''").get().c;

      if (
        postPaymentCount !== preCounts.paymentRecordsPreserved ||
        postUtrCount !== preCounts.utrRecordsPreserved
      ) {
        throw new Error(
          `Safety Verification Failed: Expected ${preCounts.paymentRecordsPreserved} payments and ${preCounts.utrRecordsPreserved} UTRs to be preserved, but found ${postPaymentCount} payments and ${postUtrCount} UTRs. Rolling back immediately.`
        );
      }

      // 5. Save permanent backup audit record in student_data_clear_backups table
      db.prepare(`
        INSERT INTO student_data_clear_backups (
          id, backup_id, executed_by_admin_id, executed_by_username,
          student_records_cleared, tracking_records_cleared, student_vendor_assignments_cleared,
          payment_records_preserved, utr_records_preserved, vendor_history_preserved,
          snapshot_data, backup_file_path, executed_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        backupId,
        executedByAdminId,
        executedByUsername,
        preCounts.studentRecordsToClear,
        preCounts.trackingDocsCount,
        preCounts.studentAssignmentsCount,
        postPaymentCount,
        postUtrCount,
        preCounts.vendorHistoryPreserved,
        JSON.stringify({
          registrations: allRegistrations,
          trackingRecords: allTrackingRecords,
          studentVendorAssignments: allStudentAssignments,
          uniformOrders: allUniformOrders
        }),
        backupFilePath,
        new Date().toISOString(),
        new Date().toISOString()
      );

      // 6. Save permanent PaymentAuditLog entry
      try {
        db.prepare(`
          INSERT INTO payment_audit_logs (
            id, actor_type, actor_identifier, action,
            previous_state, new_state, ip_address, created_at
          ) VALUES (?, 'ADMIN', ?, 'STUDENT_DATA_CLEARED_PAYMENTS_PRESERVED', ?, ?, ?, ?)
        `).run(
          crypto.randomUUID(),
          executedByUsername,
          JSON.stringify({
            operation: 'CLEAR_STUDENT_DATA_START',
            studentRegistrationsCount: preCounts.studentRecordsToClear,
            paymentRecordsCount: preCounts.paymentRecordsPreserved,
            utrRecordsCount: preCounts.utrRecordsPreserved
          }),
          JSON.stringify({
            operation: 'CLEAR_STUDENT_DATA_COMPLETED',
            backupId,
            executedBy: executedByUsername,
            studentRegistrationsRemaining: 0,
            paymentRecordsPreserved: postPaymentCount,
            utrRecordsPreserved: postUtrCount,
            timestamp: new Date().toISOString()
          }),
          req.ip || '127.0.0.1',
          new Date().toISOString()
        );
      } catch (auditErr) {
        console.warn('[DataMaintenance] Could not write payment_audit_logs:', auditErr.message);
      }

      // 7. Bump global sync version so open portals refresh student counts immediately
      try {
        db.prepare(`
          INSERT INTO system_sync_state (id, sync_version, last_event, updated_at)
          VALUES ('MIT_GLOBAL_SYNC_STATE', 1, 'STUDENT_DATA_CLEARED_PAYMENTS_PRESERVED', datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            sync_version = sync_version + 1,
            last_event = 'STUDENT_DATA_CLEARED_PAYMENTS_PRESERVED',
            updated_at = datetime('now')
        `).run();
      } catch (_) {}

      // Commit transaction
      db.exec('COMMIT');

      // Broadcast real-time refresh signal to Admin and Vendor dashboards
      try {
        sseHub.notifyAdmins('GLOBAL_SYNC_UPDATE', {
          eventName: 'STUDENT_DATA_CLEARED_PAYMENTS_PRESERVED',
          backupId
        });
      } catch (_) {}

      return res.json({
        success: true,
        backupId,
        message:
          'Student registration and uniform measurement data cleared successfully. All payment transactions, UTR records, vendor accounts, and system settings have been safely preserved.',
        summary: {
          backupId,
          executedBy: executedByUsername,
          executedAt: new Date().toISOString(),
          studentRecordsCleared: preCounts.studentRecordsToClear,
          trackingRecordsCleared: preCounts.trackingDocsCount,
          registrationDocsCleared: preCounts.registrationDocsCount,
          paymentRecordsPreserved: postPaymentCount,
          utrRecordsPreserved: postUtrCount,
          vendorHistoryPreserved: preCounts.vendorHistoryPreserved
        }
      });
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      console.error('[DataMaintenance] Clear student data transaction error:', err);
      return res.status(500).json({
        success: false,
        rolledBack: true,
        message: `Clear Student Data operation failed and was safely rolled back: ${err.message}`
      });
    }
  }
);

export default router;


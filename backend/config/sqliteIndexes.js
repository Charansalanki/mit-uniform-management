/**
 * Creates non-blocking SQLite B-Tree indexes on existing tables
 * without altering or deleting any existing data.
 */
function ensureSqliteIndexes(db) {
  const indexStatements = [
    // Student Registrations & Tracking
    `CREATE INDEX IF NOT EXISTS idx_reg_usn ON registrations(usn)`,
    `CREATE INDEX IF NOT EXISTS idx_reg_app_id ON registrations(application_id)`,
    `CREATE INDEX IF NOT EXISTS idx_reg_dept_year_sec ON registrations(department, academic_year, section, gender)`,
    `CREATE INDEX IF NOT EXISTS idx_reg_payment_status ON registrations(payment_status, created_at DESC)`,

    `CREATE INDEX IF NOT EXISTS idx_reg_app_id_camel ON registrations(applicationId)`,
    `CREATE INDEX IF NOT EXISTS idx_reg_dept_year_sec_camel ON registrations(department, academicYear, section, gender)`,
    `CREATE INDEX IF NOT EXISTS idx_reg_payment_status_camel ON registrations(paymentStatus, createdAt DESC)`,

    // Vendor Allocations (Instant Student-to-Vendor Matching)
    `CREATE INDEX IF NOT EXISTS idx_alloc_active_match ON vendor_allocations(status, course, department, academic_year, section, gender)`,
    `CREATE INDEX IF NOT EXISTS idx_alloc_vendor_id ON vendor_allocations(vendor_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_alloc_active_match_camel ON vendor_allocations(status, course, department, academicYear, section, gender)`,
    `CREATE INDEX IF NOT EXISTS idx_alloc_vendor_id_camel ON vendor_allocations(vendorId, status)`,

    // Payments (UPI & Cash)
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_utr_not_null ON payment_submissions(utr_number) WHERE utr_number IS NOT NULL AND utr_number != ''`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_cash_ref_not_null ON payment_submissions(cash_payment_ref_id) WHERE cash_payment_ref_id IS NOT NULL AND cash_payment_ref_id != ''`,
    `CREATE INDEX IF NOT EXISTS idx_pay_reg_id ON payment_submissions(registration_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pay_vendor_status ON payment_submissions(vendor_id, payment_method, payment_status, created_at DESC)`,

    // Alternate table support
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_utr_payments ON payments(utrNumber) WHERE utrNumber IS NOT NULL AND utrNumber != ''`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_cash_ref_payments ON payments(cashPaymentRefId) WHERE cashPaymentRefId IS NOT NULL AND cashPaymentRefId != ''`,
    `CREATE INDEX IF NOT EXISTS idx_pay_reg_id_payments ON payments(registrationId)`,
    `CREATE INDEX IF NOT EXISTS idx_pay_vendor_status_payments ON payments(vendorId, paymentMethod, paymentStatus, createdAt DESC)`,

    // Student Tracking Records
    `CREATE INDEX IF NOT EXISTS idx_track_usn ON student_tracking_records(usn)`,
    `CREATE INDEX IF NOT EXISTS idx_track_app_id ON student_tracking_records(application_id)`,
    `CREATE INDEX IF NOT EXISTS idx_track_status ON student_tracking_records(payment_status, updated_at DESC)`
  ];

  for (const sql of indexStatements) {
    try {
      db.exec(sql);
    } catch (_) {
      // Safely ignore if a specific table name in your schema differs slightly
    }
  }

  // Run SQLite query planner optimizer so SQLite picks the new indexes immediately
  try {
    db.exec(`PRAGMA optimize;`);
  } catch (_) {}
}

module.exports = { ensureSqliteIndexes };


import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.SQLITE_DB_PATH || path.join(dataDir, 'mit_uniform.db');
export const db = new DatabaseSync(dbPath);

// Optimize performance for high throughput and concurrent reads
db.exec(`
  PRAGMA busy_timeout = 10000;
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA cache_size = -64000; -- 64MB cache
  PRAGMA temp_store = MEMORY;
`);

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}

export function generateToken(payload, secret = process.env.SESSION_SECRET || 'mit-secret-key-2026', expiresInMs = 7 * 24 * 3600 * 1000) {
  const exp = Date.now() + expiresInMs;
  const data = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyToken(token, secret = process.env.SESSION_SECRET || 'mit-secret-key-2026') {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length === 3) {
    const secrets = [
      process.env.JWT_SECRET,
      process.env.SESSION_SECRET,
      'mit_mysore_uniform_super_secret_2026',
      'mit_mysore_uniform_jwt_secret_2026',
      'mit-secret-key-2026'
    ].filter(Boolean);
    for (const sec of secrets) {
      try {
        const decoded = jwt.verify(token, sec);
        return decoded;
      } catch {}
    }
    return null;
  }
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      academic_year TEXT NOT NULL DEFAULT '2026-27',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS registrations (
      id TEXT PRIMARY KEY,
      registration_id TEXT UNIQUE NOT NULL,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      full_name TEXT NOT NULL,
      gender TEXT NOT NULL DEFAULT 'Male' CHECK (gender IN ('Male', 'Female')),
      usn TEXT NOT NULL,
      phone TEXT NOT NULL,
      college_email TEXT,
      department TEXT NOT NULL,
      semester INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 8),
      section TEXT NOT NULL CHECK (section IN ('A','B','C','D','E','F','G')),
      academic_year TEXT NOT NULL DEFAULT '2026-27',
      shirt_size TEXT NOT NULL CHECK (shirt_size IN ('XS','S','M','L','XL','XXL','XXXL')),
      trouser_size TEXT NOT NULL CHECK (trouser_size IN ('28','30','32','34','36','38','40','42','44')),
      submission_status TEXT NOT NULL DEFAULT 'submitted' CHECK (submission_status IN ('submitted','verified','cancelled')),
      production_status TEXT NOT NULL DEFAULT 'pending' CHECK (production_status IN ('pending','in_production','ready')),
      distribution_status TEXT NOT NULL DEFAULT 'pending' CHECK (distribution_status IN ('pending','ready','collected')),
      collection_room TEXT,
      collection_date TEXT,
      collection_instructions TEXT,
      submitted_at TEXT NOT NULL,
      editable_until TEXT NOT NULL,
      collected_at TEXT,
      collected_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(campaign_id, usn)
    );

    CREATE TABLE IF NOT EXISTS uniform_orders (
      id TEXT PRIMARY KEY,
      student_id TEXT UNIQUE NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
      uniform_items TEXT NOT NULL,
      production_status TEXT NOT NULL DEFAULT 'pending' CHECK (production_status IN ('pending','in_production','ready')),
      distribution_status TEXT NOT NULL DEFAULT 'pending' CHECK (distribution_status IN ('pending','ready','collected')),
      collection_room TEXT,
      collection_date TEXT,
      collection_instructions TEXT,
      distribution_batch_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS distribution_schedules (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      department TEXT NOT NULL,
      semester INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 8),
      section TEXT NOT NULL CHECK (section IN ('A','B','C','D','E','F','G')),
      gender TEXT NOT NULL DEFAULT 'All' CHECK (gender IN ('All', 'Male', 'Female')),
      academic_year TEXT NOT NULL DEFAULT '2026-27',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','scheduled','completed','postponed','cancelled')),
      distribution_date TEXT,
      start_time TEXT,
      end_time TEXT,
      building TEXT,
      room TEXT,
      instructions TEXT NOT NULL DEFAULT '',
      published INTEGER NOT NULL DEFAULT 0,
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(campaign_id, department, semester, section)
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('superadmin','admin','coordinator')),
      permissions TEXT NOT NULL DEFAULT '["read","write","publish"]',
      account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active','suspended')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_accounts (
      id TEXT PRIMARY KEY,
      admin_id TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      recovery_key_hash TEXT DEFAULT NULL,
      role TEXT NOT NULL DEFAULT 'SUPER_ADMIN' CHECK (role IN ('SUPER_ADMIN','COLLEGE_ADMIN')),
      account_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (account_status IN ('ACTIVE','LOCKED','SUSPENDED')),
      session_version INTEGER NOT NULL DEFAULT 1,
      failed_login_attempts INTEGER DEFAULT 0,
      locked_until TEXT DEFAULT NULL,
      last_password_update_date TEXT NOT NULL,
      last_successful_login TEXT DEFAULT NULL,
      last_login_ip TEXT DEFAULT '',
      account_creation_date TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT,
      admin_email TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      changes TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL
    );

    -- =========================================================================
    -- DIRECT INSTITUTION UPI PAYMENT CONTROLLER TABLES
    -- =========================================================================

    CREATE TABLE IF NOT EXISTS payment_config (
      id TEXT PRIMARY KEY,
      config_version INTEGER NOT NULL DEFAULT 1,
      is_collection_enabled INTEGER NOT NULL DEFAULT 1,
      unavailable_message TEXT DEFAULT 'Payment collection is temporarily unavailable. Please contact the Uniform Office.',
      payment_mode TEXT NOT NULL DEFAULT 'FIXED' CHECK (payment_mode IN ('FIXED', 'FLEXIBLE_RANGE')),
      uniform_amount NUMERIC(10, 2) NOT NULL DEFAULT 1500.00,
      min_amount NUMERIC(10, 2) NOT NULL DEFAULT 1.00,
      max_amount NUMERIC(10, 2) NOT NULL DEFAULT 10000.00,
      department_amounts TEXT DEFAULT '{}',
      semester_amounts TEXT DEFAULT '{}',
      package_amounts TEXT DEFAULT '{"standard":1500,"hosteler":1800,"lab_included":2100}',
      beneficiary_name TEXT NOT NULL DEFAULT 'Maharaja Institute of Technology Mysore',
      payment_instructions TEXT,
      reference_instructions TEXT,
      additional_instructions TEXT,
      updated_at TEXT,
      updated_by TEXT,
      updated_by_name TEXT DEFAULT 'System Administrator'
    );

    CREATE TABLE IF NOT EXISTS payment_config_history (
      id TEXT PRIMARY KEY,
      config_version INTEGER NOT NULL,
      previous_amount NUMERIC(10, 2) NOT NULL,
      new_amount NUMERIC(10, 2) NOT NULL,
      previous_min_amount NUMERIC(10, 2) NOT NULL,
      new_min_amount NUMERIC(10, 2) NOT NULL,
      previous_max_amount NUMERIC(10, 2) NOT NULL,
      new_max_amount NUMERIC(10, 2) NOT NULL,
      previous_mode TEXT NOT NULL,
      new_mode TEXT NOT NULL,
      previous_collection_status INTEGER NOT NULL,
      new_collection_status INTEGER NOT NULL,
      department_amounts_snapshot TEXT DEFAULT '{}',
      semester_amounts_snapshot TEXT DEFAULT '{}',
      package_amounts_snapshot TEXT DEFAULT '{}',
      change_summary TEXT DEFAULT '',
      modified_by TEXT,
      modified_by_name TEXT DEFAULT 'Administrator',
      modified_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pay_config_hist_time ON payment_config_history (modified_at DESC);

    CREATE TABLE IF NOT EXISTS payment_methods (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      method_type TEXT UNIQUE NOT NULL CHECK (method_type IN ('GPAY', 'PHONEPE', 'PAYTM')),
      qr_image_url TEXT,
      amount NUMERIC(10, 2) NOT NULL DEFAULT 1500.00,
      instructions TEXT,
      beneficiary_name TEXT DEFAULT 'Maharaja Institute of Technology Mysore',
      is_active INTEGER DEFAULT 0,
      updated_at TEXT,
      updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS payment_submissions (
      id TEXT PRIMARY KEY,
      registration_id TEXT NOT NULL,
      student_id TEXT,
      student_name TEXT NOT NULL,
      usn TEXT NOT NULL,
      department TEXT NOT NULL,
      year_semester TEXT NOT NULL,
      section TEXT NOT NULL,
      package_type TEXT DEFAULT 'standard',
      payment_method TEXT NOT NULL CHECK (payment_method IN ('GPAY', 'PHONEPE', 'PAYTM')),
      config_id_at_submission TEXT,
      config_version_at_submission INTEGER DEFAULT 1,
      payment_mode_at_submission TEXT DEFAULT 'FIXED',
      expected_amount NUMERIC(10, 2) NOT NULL,
      min_allowed_at_submission NUMERIC(10, 2) DEFAULT 1.00,
      max_allowed_at_submission NUMERIC(10, 2) DEFAULT 10000.00,
      amount NUMERIC(10, 2) NOT NULL,
      ocr_extracted_amount NUMERIC(10, 2),
      bank_verified_amount NUMERIC(10, 2),
      amount_mismatch_flag INTEGER DEFAULT 0,
      amount_validation_notes TEXT DEFAULT '',
      requirement_revision_history TEXT DEFAULT '[]',
      utr_number TEXT UNIQUE NOT NULL,
      payment_screenshot TEXT NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'Submitted' CHECK (payment_status IN (
        'Not Paid',
        'Submitted',
        'Payment Submitted',
        'Under Verification',
        'Verified',
        'Payment Verified',
        'Rejected',
        'Payment Rejected',
        'Payment Not Received'
      )),
      reconciliation_status TEXT DEFAULT 'Unchecked' CHECK (reconciliation_status IN ('Unchecked', 'Matched', 'Unmatched', 'Suspicious')),
      reconciliation_details TEXT,
      admin_remarks TEXT DEFAULT '',
      rejection_reason TEXT DEFAULT '',
      verified_by TEXT,
      verified_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_normalized_utr ON payment_submissions (UPPER(TRIM(utr_number)));
    CREATE INDEX IF NOT EXISTS idx_pay_reg_id ON payment_submissions (registration_id);
    CREATE INDEX IF NOT EXISTS idx_pay_usn ON payment_submissions (usn);
    CREATE INDEX IF NOT EXISTS idx_pay_status ON payment_submissions (payment_status);

    CREATE TABLE IF NOT EXISTS payment_audit_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT,
      actor_type TEXT NOT NULL DEFAULT 'ADMIN' CHECK (actor_type IN ('ADMIN', 'STUDENT', 'SYSTEM')),
      action TEXT NOT NULL,
      payment_submission_id TEXT,
      payment_method_id TEXT,
      previous_value TEXT,
      new_value TEXT,
      ip_address TEXT,
      timestamp TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pay_audit_time ON payment_audit_logs (timestamp DESC);

    -- =========================================================================
    -- Multi-Vendor Management, Isolated Scanners & Exclusive Group Allocations
    -- =========================================================================

    CREATE TABLE IF NOT EXISTS vendors (
      id TEXT PRIMARY KEY,
      vendor_id TEXT UNIQUE NOT NULL, -- e.g. MIT-VND-2026-001
      vendor_name TEXT NOT NULL,
      contact_person TEXT NOT NULL,
      mobile TEXT NOT NULL,
      email TEXT NOT NULL,
      address TEXT NOT NULL,
      gst_number TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vendors_vendor_id ON vendors(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status);

    CREATE TABLE IF NOT EXISTS vendor_allocations (
      id TEXT PRIMARY KEY,
      allocation_id TEXT UNIQUE NOT NULL, -- e.g. ALLOC-2026-89123
      vendor_ref TEXT NOT NULL,
      vendor_id TEXT NOT NULL,
      education_level TEXT NOT NULL CHECK (education_level IN ('UG', 'PG')),
      course TEXT NOT NULL,
      department TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      semester TEXT NOT NULL DEFAULT 'ALL',
      section TEXT NOT NULL,
      gender TEXT NOT NULL DEFAULT 'All',
      uniform_category TEXT NOT NULL DEFAULT 'STANDARD',
      academic_period TEXT NOT NULL DEFAULT '2026-2027',
      allocation_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RELEASED', 'REASSIGNED', 'INACTIVE')),
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_va_vendor_id ON vendor_allocations(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_va_alloc_id ON vendor_allocations(allocation_id);
    CREATE INDEX IF NOT EXISTS idx_va_status ON vendor_allocations(status);
    CREATE INDEX IF NOT EXISTS idx_va_alloc_key ON vendor_allocations(allocation_key);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_vendor_allocation ON vendor_allocations (
      education_level,
      course,
      department,
      academic_year,
      semester,
      section,
      gender,
      uniform_category,
      academic_period
    ) WHERE status = 'ACTIVE';

    CREATE TABLE IF NOT EXISTS vendor_payment_configurations (
      id TEXT PRIMARY KEY,
      vendor_ref TEXT NOT NULL,
      vendor_id TEXT UNIQUE NOT NULL,
      gpay_qr_url TEXT,
      gpay_enabled INTEGER NOT NULL DEFAULT 0,
      gpay_updated_at TEXT,
      phonepe_qr_url TEXT,
      phonepe_enabled INTEGER NOT NULL DEFAULT 0,
      phonepe_updated_at TEXT,
      paytm_qr_url TEXT,
      paytm_enabled INTEGER NOT NULL DEFAULT 0,
      paytm_updated_at TEXT,
      beneficiary_name TEXT NOT NULL,
      upi_id TEXT NOT NULL,
      payment_instructions TEXT DEFAULT 'Scan the assigned vendor QR code below, complete the exact uniform payment, and submit your 12-digit UPI UTR along with the payment screenshot.',
      payment_amount NUMERIC(10, 2),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vpc_vendor_id ON vendor_payment_configurations(vendor_id);

    CREATE TABLE IF NOT EXISTS student_vendor_assignments (
      id TEXT PRIMARY KEY,
      student_id TEXT,
      registration_id TEXT UNIQUE NOT NULL,
      usn TEXT NOT NULL,
      student_name TEXT DEFAULT '',
      education_level TEXT NOT NULL,
      course TEXT NOT NULL,
      department TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      semester TEXT NOT NULL DEFAULT 'ALL',
      section TEXT NOT NULL,
      gender TEXT NOT NULL DEFAULT 'All',
      uniform_category TEXT NOT NULL DEFAULT 'STANDARD',
      academic_period TEXT NOT NULL DEFAULT '2026-2027',
      vendor_ref TEXT NOT NULL,
      vendor_id TEXT NOT NULL,
      vendor_name TEXT NOT NULL,
      allocation_ref TEXT NOT NULL,
      allocation_id TEXT NOT NULL,
      has_paid_or_submitted INTEGER NOT NULL DEFAULT 0,
      assignment_status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK (assignment_status IN ('ASSIGNED', 'REASSIGNED', 'LOCKED_BY_PAYMENT')),
      assigned_at TEXT NOT NULL,
      reassignment_history TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sva_reg_id ON student_vendor_assignments(registration_id);
    CREATE INDEX IF NOT EXISTS idx_sva_usn ON student_vendor_assignments(usn);
    CREATE INDEX IF NOT EXISTS idx_sva_vendor_id ON student_vendor_assignments(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_sva_alloc_id ON student_vendor_assignments(allocation_id);

    CREATE TABLE IF NOT EXISTS vendor_audit_logs (
      id TEXT PRIMARY KEY,
      vendor_id TEXT,
      admin_id TEXT,
      action TEXT NOT NULL,
      previous_value TEXT,
      new_value TEXT,
      timestamp TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_val_vendor_id ON vendor_audit_logs(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_val_timestamp ON vendor_audit_logs(timestamp DESC);

    CREATE TABLE IF NOT EXISTS vendor_portal_access (
      id TEXT PRIMARY KEY,
      vendor_ref TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      vendor_id TEXT UNIQUE NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      encrypted_portal_url TEXT NOT NULL,
      session_version INTEGER NOT NULL DEFAULT 1,
      access_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (access_status IN ('ACTIVE', 'REVOKED', 'EXPIRED', 'SUSPENDED')),
      allow_csv_export INTEGER NOT NULL DEFAULT 1,
      link_created_at TEXT NOT NULL,
      expires_at TEXT,
      last_login_at TEXT,
      last_activity_at TEXT,
      failed_login_attempts INTEGER DEFAULT 0,
      locked_until TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_vpa_vendor_id ON vendor_portal_access(vendor_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_vpa_token_hash ON vendor_portal_access(token_hash);
    CREATE INDEX IF NOT EXISTS idx_vpa_access_status ON vendor_portal_access(access_status);

    -- =========================================================================
    -- Permanent, Append-Only Vendor Transaction Verification History (Immutable)
    -- =========================================================================
    CREATE TABLE IF NOT EXISTS vendor_transaction_history (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL,
      registration_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      usn TEXT NOT NULL,
      department TEXT NOT NULL,
      year_semester TEXT NOT NULL,
      section TEXT NOT NULL,
      vendor_ref TEXT,
      vendor_id TEXT NOT NULL,
      vendor_name TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      payment_amount NUMERIC(10, 2) NOT NULL,
      verified_bank_amount NUMERIC(10, 2),
      utr_number TEXT NOT NULL,
      payment_screenshot TEXT,
      previous_status TEXT NOT NULL,
      payment_status TEXT NOT NULL,
      verified_by_vendor_id TEXT NOT NULL,
      verified_by_vendor_name TEXT NOT NULL,
      verifier_role TEXT DEFAULT 'VENDOR',
      remarks TEXT DEFAULT '',
      action_timestamp TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vth_vendor_id ON vendor_transaction_history(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_vth_usn ON vendor_transaction_history(usn);
    CREATE INDEX IF NOT EXISTS idx_vth_utr ON vendor_transaction_history(utr_number);
    CREATE INDEX IF NOT EXISTS idx_vth_action_timestamp ON vendor_transaction_history(action_timestamp DESC);

    -- =========================================================================
    -- Student Unique Tracking Records & Atomic Application ID Sequence
    -- =========================================================================
    CREATE TABLE IF NOT EXISTS application_sequences (
      id TEXT PRIMARY KEY, -- e.g. 'MIT_APP_2026'
      seq INTEGER NOT NULL DEFAULT 10000
    );

    CREATE TABLE IF NOT EXISTS student_tracking_records (
      id TEXT PRIMARY KEY,
      application_id TEXT UNIQUE NOT NULL, -- e.g. MIT-2026-10001
      registration_id TEXT UNIQUE NOT NULL,
      usn TEXT UNIQUE NOT NULL,
      tracking_pin_hash TEXT NOT NULL,
      encrypted_tracking_pin TEXT NOT NULL,
      browser_resume_token_hash TEXT,
      failed_pin_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      last_checked_at TEXT,
      current_step INTEGER NOT NULL DEFAULT 4,
      registration_status TEXT NOT NULL DEFAULT 'Registration Completed',
      payment_status TEXT NOT NULL DEFAULT 'Payment Pending',
      expected_amount REAL NOT NULL DEFAULT 1500,
      is_registration_locked INTEGER NOT NULL DEFAULT 1,
      is_payment_locked INTEGER NOT NULL DEFAULT 0,
      student_profile TEXT NOT NULL,
      uniform_selection TEXT NOT NULL,
      assigned_vendor TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_str_app_id ON student_tracking_records(application_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_str_usn ON student_tracking_records(usn);
    CREATE INDEX IF NOT EXISTS idx_str_reg_id ON student_tracking_records(registration_id);
    CREATE INDEX IF NOT EXISTS idx_str_token_hash ON student_tracking_records(browser_resume_token_hash);

    -- Primary B-Tree & Compound Performance Indexes
    CREATE INDEX IF NOT EXISTS idx_reg_usn ON registrations(usn);
    CREATE INDEX IF NOT EXISTS idx_reg_id ON registrations(registration_id);
    CREATE INDEX IF NOT EXISTS idx_reg_dept_sem_sec ON registrations(department, semester, section);
    CREATE INDEX IF NOT EXISTS idx_reg_submitted_at ON registrations(submitted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reg_prod_dist_status ON registrations(production_status, distribution_status);
    CREATE INDEX IF NOT EXISTS idx_orders_student ON uniform_orders(student_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_lookup ON distribution_schedules(department, semester, section, published);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

    -- Full Text Search virtual table
    CREATE VIRTUAL TABLE IF NOT EXISTS registrations_fts USING fts5(
      registration_id,
      usn,
      full_name,
      phone,
      content='registrations',
      content_rowid='rowid'
    );
  `);

  // Migration: Ensure distribution_schedules has gender column
  try {
    db.exec("ALTER TABLE distribution_schedules ADD COLUMN gender TEXT NOT NULL DEFAULT 'All'");
  } catch (e) {
    // Column already exists
  }

  // Migration: Ensure vendor_allocations & student_vendor_assignments have gender column
  try { db.exec("ALTER TABLE vendor_allocations ADD COLUMN gender TEXT NOT NULL DEFAULT 'All'"); } catch (e) {}
  try { db.exec("ALTER TABLE student_vendor_assignments ADD COLUMN gender TEXT DEFAULT 'All'"); } catch (e) {}
  try { db.exec("ALTER TABLE vendor_allocations ADD COLUMN collection_room TEXT DEFAULT 'Main Uniform Distribution Hall'"); } catch (e) {}
  try { db.exec("ALTER TABLE vendor_allocations ADD COLUMN distribution_status TEXT DEFAULT 'Scheduled'"); } catch (e) {}
  try { db.exec("ALTER TABLE vendor_allocations ADD COLUMN distribution_date TEXT DEFAULT 'To Be Announced'"); } catch (e) {}
  try { db.exec("ALTER TABLE vendor_allocations ADD COLUMN uniform_availability TEXT DEFAULT 'In Stock'"); } catch (e) {}
  try { db.exec("ALTER TABLE vendor_allocations ADD COLUMN released_at TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE vendor_allocations ADD COLUMN released_by TEXT"); } catch (e) {}

  // System Sync State table (Real-time synchronization across instances)
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_sync_state (
      id TEXT PRIMARY KEY,
      sync_version INTEGER NOT NULL DEFAULT 1,
      last_event TEXT NOT NULL DEFAULT 'INIT',
      last_modified_entity_id TEXT DEFAULT '',
      updated_at TEXT NOT NULL
    );
    INSERT OR IGNORE INTO system_sync_state (id, sync_version, last_event, last_modified_entity_id, updated_at)
    VALUES ('MIT_GLOBAL_SYNC_STATE', 1, 'INIT', '', datetime('now'));
  `);
  try {
    db.exec(`
      DROP INDEX IF EXISTS idx_unique_active_vendor_allocation;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_vendor_allocation ON vendor_allocations (
        education_level,
        course,
        department,
        academic_year,
        semester,
        section,
        gender,
        uniform_category,
        academic_period
      ) WHERE status = 'ACTIVE';
    `);
  } catch (e) {}

  // Migration: Ensure registrations has payment tracking columns
  try { db.exec("ALTER TABLE registrations ADD COLUMN payment_status TEXT DEFAULT 'Not Paid'"); } catch (e) {}
  try { db.exec("ALTER TABLE registrations ADD COLUMN payment_verified INTEGER DEFAULT 0"); } catch (e) {}
  try { db.exec("ALTER TABLE registrations ADD COLUMN payment_submission_id TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE registrations ADD COLUMN assigned_vendor_id TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE registrations ADD COLUMN assigned_vendor_name TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE registrations ADD COLUMN vendor_allocation_id TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE registrations ADD COLUMN blazer_size TEXT DEFAULT ''"); } catch (e) {}
  try { db.exec("ALTER TABLE registrations ADD COLUMN uniform_measurements TEXT DEFAULT '{}'"); } catch (e) {}

  // Migration: Ensure student_tracking_records has explicit lifecycle statuses & expected amount
  try { db.exec("ALTER TABLE student_tracking_records ADD COLUMN registration_status TEXT DEFAULT 'Registration Completed'"); } catch (e) {}
  try { db.exec("ALTER TABLE student_tracking_records ADD COLUMN payment_status TEXT DEFAULT 'Payment Pending'"); } catch (e) {}
  try { db.exec("ALTER TABLE student_tracking_records ADD COLUMN expected_amount REAL DEFAULT 1500"); } catch (e) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_str_payment_status ON student_tracking_records(payment_status)"); } catch (e) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_str_reg_status ON student_tracking_records(registration_status)"); } catch (e) {}

  // Migration: Ensure payment_config has versioning, mode, range & overrides
  try { db.exec("ALTER TABLE payment_config ADD COLUMN config_version INTEGER NOT NULL DEFAULT 1"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_config ADD COLUMN is_collection_enabled INTEGER NOT NULL DEFAULT 1"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_config ADD COLUMN unavailable_message TEXT DEFAULT 'Payment collection is temporarily unavailable. Please contact the Uniform Office.'"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_config ADD COLUMN payment_mode TEXT NOT NULL DEFAULT 'FIXED'"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_config ADD COLUMN min_amount NUMERIC(10, 2) NOT NULL DEFAULT 1.00"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_config ADD COLUMN max_amount NUMERIC(10, 2) NOT NULL DEFAULT 10000.00"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_config ADD COLUMN department_amounts TEXT DEFAULT '{}'"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_config ADD COLUMN semester_amounts TEXT DEFAULT '{}'"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_config ADD COLUMN updated_by_name TEXT DEFAULT 'System Administrator'"); } catch (e) {}

  // Migration: Ensure payment_submissions has historical protection, range snapshots, OCR, bank & revisions
  try { db.exec("ALTER TABLE payment_submissions ADD COLUMN package_type TEXT DEFAULT 'standard'"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_submissions ADD COLUMN config_id_at_submission TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_submissions ADD COLUMN config_version_at_submission INTEGER DEFAULT 1"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_submissions ADD COLUMN payment_mode_at_submission TEXT DEFAULT 'FIXED'"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_submissions ADD COLUMN min_allowed_at_submission NUMERIC(10, 2) DEFAULT 1.00"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_submissions ADD COLUMN max_allowed_at_submission NUMERIC(10, 2) DEFAULT 10000.00"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_submissions ADD COLUMN ocr_extracted_amount NUMERIC(10, 2)"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_submissions ADD COLUMN bank_verified_amount NUMERIC(10, 2)"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_submissions ADD COLUMN amount_validation_notes TEXT DEFAULT ''"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_submissions ADD COLUMN requirement_revision_history TEXT DEFAULT '[]'"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_submissions ADD COLUMN vendor_id TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_submissions ADD COLUMN vendor_name TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_submissions ADD COLUMN vendor_allocation_id TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_submissions ADD COLUMN vendor_beneficiary_name TEXT DEFAULT ''"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_submissions ADD COLUMN vendor_upi_id TEXT DEFAULT ''"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_submissions ADD COLUMN screenshot_extracted_utr TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_submissions ADD COLUMN utr_ocr_mismatch_flag INTEGER DEFAULT 0"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_submissions ADD COLUMN verified_by_role TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_submissions ADD COLUMN verified_by_identifier TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_submissions ADD COLUMN verified_transaction_ref TEXT DEFAULT ''"); } catch (e) {}
  try { db.exec("ALTER TABLE payment_submissions ADD COLUMN status_history TEXT DEFAULT '[]'"); } catch (e) {}

  // Migration: Update payment_submissions CHECK constraint to support unified payment statuses
  try {
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='payment_submissions'").get();
    if (tableInfo && tableInfo.sql && !tableInfo.sql.includes("'Payment Not Received'")) {
      db.exec(`
        PRAGMA foreign_keys=off;
        ALTER TABLE payment_submissions RENAME TO payment_submissions_old;

        CREATE TABLE payment_submissions (
          id TEXT PRIMARY KEY,
          registration_id TEXT NOT NULL,
          student_id TEXT,
          student_name TEXT NOT NULL,
          usn TEXT NOT NULL,
          department TEXT NOT NULL,
          year_semester TEXT NOT NULL,
          section TEXT NOT NULL,
          package_type TEXT DEFAULT 'standard',
          payment_method TEXT NOT NULL CHECK (payment_method IN ('GPAY', 'PHONEPE', 'PAYTM')),
          config_id_at_submission TEXT,
          config_version_at_submission INTEGER DEFAULT 1,
          payment_mode_at_submission TEXT DEFAULT 'FIXED',
          expected_amount NUMERIC(10, 2) NOT NULL,
          min_allowed_at_submission NUMERIC(10, 2) DEFAULT 1.00,
          max_allowed_at_submission NUMERIC(10, 2) DEFAULT 10000.00,
          amount NUMERIC(10, 2) NOT NULL,
          ocr_extracted_amount NUMERIC(10, 2),
          bank_verified_amount NUMERIC(10, 2),
          amount_mismatch_flag INTEGER DEFAULT 0,
          amount_validation_notes TEXT DEFAULT '',
          requirement_revision_history TEXT DEFAULT '[]',
          utr_number TEXT UNIQUE NOT NULL,
          payment_screenshot TEXT NOT NULL,
          payment_status TEXT NOT NULL DEFAULT 'Submitted' CHECK (payment_status IN (
            'Not Paid',
            'Submitted',
            'Payment Submitted',
            'Under Verification',
            'Verified',
            'Payment Verified',
            'Rejected',
            'Payment Rejected',
            'Payment Not Received'
          )),
          reconciliation_status TEXT DEFAULT 'Unchecked' CHECK (reconciliation_status IN ('Unchecked', 'Matched', 'Unmatched', 'Suspicious')),
          reconciliation_details TEXT,
          admin_remarks TEXT DEFAULT '',
          rejection_reason TEXT DEFAULT '',
          verified_by TEXT,
          verified_at TEXT,
          vendor_id TEXT,
          vendor_name TEXT,
          vendor_allocation_id TEXT,
          vendor_beneficiary_name TEXT DEFAULT '',
          vendor_upi_id TEXT DEFAULT '',
          screenshot_extracted_utr TEXT,
          utr_ocr_mismatch_flag INTEGER DEFAULT 0,
          verified_by_role TEXT,
          verified_by_identifier TEXT,
          verified_transaction_ref TEXT DEFAULT '',
          status_history TEXT DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT INTO payment_submissions (
          id, registration_id, student_id, student_name, usn, department, year_semester, section,
          package_type, payment_method, config_id_at_submission, config_version_at_submission,
          payment_mode_at_submission, expected_amount, min_allowed_at_submission, max_allowed_at_submission,
          amount, ocr_extracted_amount, bank_verified_amount, amount_mismatch_flag, amount_validation_notes,
          requirement_revision_history, utr_number, payment_screenshot, payment_status, reconciliation_status,
          reconciliation_details, admin_remarks, rejection_reason, verified_by, verified_at,
          created_at, updated_at
        )
        SELECT
          id, registration_id, student_id, student_name, usn, department, year_semester, section,
          package_type, payment_method, config_id_at_submission, config_version_at_submission,
          payment_mode_at_submission, expected_amount, min_allowed_at_submission, max_allowed_at_submission,
          amount, ocr_extracted_amount, bank_verified_amount, amount_mismatch_flag, amount_validation_notes,
          requirement_revision_history, utr_number, payment_screenshot, payment_status, reconciliation_status,
          reconciliation_details, admin_remarks, rejection_reason, verified_by, verified_at,
          created_at, updated_at
        FROM payment_submissions_old;

        DROP TABLE payment_submissions_old;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_normalized_utr ON payment_submissions (UPPER(TRIM(utr_number)));
        CREATE INDEX IF NOT EXISTS idx_pay_reg_id ON payment_submissions (registration_id);
        CREATE INDEX IF NOT EXISTS idx_pay_usn ON payment_submissions (usn);
        CREATE INDEX IF NOT EXISTS idx_pay_status ON payment_submissions (payment_status);
        PRAGMA foreign_keys=on;
      `);
    }
  } catch (err) {
    console.error('Migration error for payment_submissions CHECK constraint:', err);
  }

  // Drop existing triggers if needed to ensure clean creation
  db.exec(`
    DROP TRIGGER IF EXISTS registrations_ai;
    DROP TRIGGER IF EXISTS registrations_ad;
    DROP TRIGGER IF EXISTS registrations_au;

    CREATE TRIGGER registrations_ai AFTER INSERT ON registrations BEGIN
      INSERT INTO registrations_fts(rowid, registration_id, usn, full_name, phone)
      VALUES (new.rowid, new.registration_id, new.usn, new.full_name, new.phone);
    END;

    CREATE TRIGGER registrations_ad AFTER DELETE ON registrations BEGIN
      INSERT INTO registrations_fts(registrations_fts, rowid, registration_id, usn, full_name, phone)
      VALUES('delete', old.rowid, old.registration_id, old.usn, old.full_name, old.phone);
    END;

    CREATE TRIGGER registrations_au AFTER UPDATE ON registrations BEGIN
      INSERT INTO registrations_fts(registrations_fts, rowid, registration_id, usn, full_name, phone)
      VALUES('delete', old.rowid, old.registration_id, old.usn, old.full_name, old.phone);
      INSERT INTO registrations_fts(rowid, registration_id, usn, full_name, phone)
      VALUES (new.rowid, new.registration_id, new.usn, new.full_name, new.phone);
    END;
  `);

  // Seed default active campaign if none exists
  const existingCamp = db.prepare('SELECT id FROM campaigns WHERE active = 1 LIMIT 1').get();
  let campaignId;
  if (!existingCamp) {
    campaignId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO campaigns (id, name, academic_year, active, created_at)
      VALUES (?, ?, ?, 1, ?)
    `).run(campaignId, 'Uniform Distribution 2026', '2026-27', now);
  } else {
    campaignId = existingCamp.id;
  }

  // Seed default admin user: admin@mitmysore.ac.in / Admin@MIT2026
  const existingAdmin = db.prepare('SELECT id FROM admin_users WHERE email = ?').get('admin@mitmysore.ac.in');
  if (!existingAdmin) {
    const adminId = crypto.randomUUID();
    const now = new Date().toISOString();
    const pHash = hashPassword('Admin@MIT2026');
    db.prepare(`
      INSERT INTO admin_users (id, name, email, password_hash, role, permissions, account_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'superadmin', '["read","write","publish","delete","admin"]', 'active', ?, ?)
    `).run(adminId, 'MIT System Administrator', 'admin@mitmysore.ac.in', pHash, now, now);
  }

  // Seed default payment config if none exists
  const existingConfig = db.prepare('SELECT id FROM payment_config LIMIT 1').get();
  if (!existingConfig) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO payment_config (
        id, config_version, is_collection_enabled, unavailable_message, payment_mode,
        uniform_amount, min_amount, max_amount, department_amounts, semester_amounts,
        package_amounts, beneficiary_name, payment_instructions, reference_instructions,
        additional_instructions, updated_at, updated_by_name
      ) VALUES (?, 1, 1, 'Payment collection is temporarily unavailable. Please contact the Uniform Office.', 'FIXED', 1500, 1, 10000, '{}', '{}', ?, ?, ?, ?, ?, ?, 'System Administrator')
    `).run(
      crypto.randomUUID(),
      JSON.stringify({ standard: 1500, hosteler: 1800, lab_included: 2100 }),
      'Maharaja Institute of Technology Mysore',
      'Scan any active UPI QR code below using your UPI app, complete the exact payment, and enter your 12-digit UPI UTR / Reference number along with the payment screenshot.',
      'Enter your USN in the UPI remarks field while making the payment.',
      'Payment verification is done manually against our official bank statement within 24-48 working hours.',
      now
    );
  }

  // Seed default 3 dynamic payment methods (GPAY, PHONEPE, PAYTM) with isActive = 0, qr_image_url = null
  const defaultScanners = [
    { name: 'Google Pay (GPay)', methodType: 'GPAY' },
    { name: 'PhonePe', methodType: 'PHONEPE' },
    { name: 'Paytm', methodType: 'PAYTM' }
  ];
  for (const s of defaultScanners) {
    const exists = db.prepare('SELECT id FROM payment_methods WHERE method_type = ?').get(s.methodType);
    if (!exists) {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO payment_methods (
          id, name, method_type, qr_image_url, amount, instructions, beneficiary_name, is_active, updated_at
        ) VALUES (?, ?, ?, NULL, 1500, ?, 'MIT Mysore Uniform Account', 0, ?)
      `).run(
        crypto.randomUUID(),
        s.name,
        s.methodType,
        'Scan using any UPI app to credit MIT Mysore Official Account',
        now
      );
    }
  }

  // Seed / Backfill existing vendor transaction history if empty
  try {
    const vthCountRow = db.prepare('SELECT COUNT(*) as cnt FROM vendor_transaction_history').get();
    if (!vthCountRow || vthCountRow.cnt === 0) {
      const subs = db.prepare(`
        SELECT * FROM payment_submissions 
        WHERE vendor_id IS NOT NULL AND vendor_id != ''
      `).all();
      const insertVth = db.prepare(`
        INSERT INTO vendor_transaction_history (
          id, submission_id, registration_id, student_name, usn, department, year_semester, section,
          vendor_ref, vendor_id, vendor_name, payment_method, payment_amount, verified_bank_amount,
          utr_number, payment_screenshot, previous_status, payment_status, verified_by_vendor_id,
          verified_by_vendor_name, verifier_role, remarks, action_timestamp, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const s of subs) {
        insertVth.run(
          crypto.randomUUID(),
          s.id,
          s.registration_id,
          s.student_name || 'Student',
          s.usn || '',
          s.department || '',
          s.year_semester || '',
          s.section || '',
          null,
          s.vendor_id,
          s.vendor_name || 'Assigned Vendor',
          s.payment_method || 'GPAY',
          Number(s.amount || 0),
          s.bank_verified_amount ? Number(s.bank_verified_amount) : Number(s.amount || 0),
          s.utr_number || '',
          s.payment_screenshot || '',
          'Submitted',
          s.payment_status || 'Submitted',
          s.vendor_id,
          s.verified_by_identifier || s.vendor_name || s.vendor_id,
          s.verified_by_role || 'VENDOR',
          s.admin_remarks || s.rejection_reason || '',
          s.verified_at || s.created_at || new Date().toISOString(),
          s.created_at || new Date().toISOString()
        );
      }
    }
  } catch (err) {
    console.warn('Vendor transaction history backfill skipped:', err.message);
  }

  // Seed / Backfill student tracking records for existing registrations without one
  try {
    const TRACKING_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'mit_mysore_tracking_secret_2026';
    const AES_KEY = crypto.createHash('sha256').update(TRACKING_SECRET).digest();
    const hashVal = (val) => crypto.createHmac('sha256', TRACKING_SECRET).update(String(val).trim()).digest('hex');
    const encryptP = (pin) => {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', AES_KEY, iv);
      let enc = cipher.update(String(pin), 'utf8', 'hex');
      enc += cipher.final('hex');
      return `${iv.toString('hex')}:${enc}`;
    };

    const unlinkedRegs = db.prepare(`
      SELECT r.* FROM registrations r
      LEFT JOIN student_tracking_records str ON str.usn = r.usn
      WHERE str.id IS NULL
    `).all();

    if (unlinkedRegs.length > 0) {
      const year = new Date().getFullYear();
      const counterId = `MIT_APP_${year}`;
      let seqRow = db.prepare('SELECT seq FROM application_sequences WHERE id = ?').get(counterId);
      let curSeq = seqRow ? seqRow.seq : 10000;

      const insertSeq = db.prepare(`
        INSERT INTO application_sequences (id, seq) VALUES (?, ?)
        ON CONFLICT(id) DO UPDATE SET seq = ?
      `);

      const insertStr = db.prepare(`
        INSERT INTO student_tracking_records (
          id, application_id, registration_id, usn, tracking_pin_hash, encrypted_tracking_pin,
          browser_resume_token_hash, failed_pin_attempts, locked_until, last_checked_at,
          current_step, registration_status, payment_status, expected_amount,
          is_registration_locked, is_payment_locked, student_profile,
          uniform_selection, assigned_vendor, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const reg of unlinkedRegs) {
        curSeq += 1;
        const candidateAppId = `MIT-${year}-${curSeq}`;
        const pin = String(crypto.randomInt(100000, 1000000));
        const resumeToken = crypto.randomBytes(32).toString('hex');

        // Look up assigned vendor if available
        const sva = db.prepare('SELECT * FROM student_vendor_assignments WHERE usn = ?').get(reg.usn);

        insertStr.run(
          crypto.randomUUID(),
          candidateAppId,
          reg.id || reg.registration_id,
          reg.usn,
          hashVal(pin),
          encryptP(pin),
          hashVal(resumeToken),
          0,
          null,
          null,
          4,
          'Registration Completed',
          'Payment Pending',
          1500,
          1,
          0,
          JSON.stringify({
            studentName: reg.full_name,
            usn: reg.usn,
            email: reg.college_email || '',
            mobile: reg.phone || '',
            educationLevel: 'UG',
            course: 'B.E.',
            department: reg.department,
            academicYear: reg.academic_year || '2026-27',
            semester: reg.semester || 1,
            section: reg.section,
            gender: reg.gender || 'Male'
          }),
          JSON.stringify({
            shirtSize: reg.shirt_size || 'M',
            trouserSize: reg.trouser_size || '32',
            blazerSize: '',
            shoeSize: '',
            packageType: 'standard',
            selectedOptions: {}
          }),
          JSON.stringify({
            vendorId: sva?.vendor_id || '',
            vendorName: sva?.vendor_name || 'Assigned Uniform Vendor',
            allocationId: sva?.allocation_id || ''
          }),
          reg.submitted_at || new Date().toISOString(),
          new Date().toISOString()
        );
      }
      insertSeq.run(counterId, curSeq, curSeq);
    }
  } catch (err) {
    console.warn('Student tracking records backfill skipped:', err.message);
  }

  return { campaignId };
}

// Log audit helper
export function logAudit(adminId, adminEmail, action, entityType, entityId, changes, ipAddress) {
  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const changesStr = typeof changes === 'string' ? changes : JSON.stringify(changes || {});
    db.prepare(`
      INSERT INTO audit_logs (id, admin_id, admin_email, action, entity_type, entity_id, changes, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, adminId || null, adminEmail || 'system', action, entityType, entityId, changesStr, ipAddress || '127.0.0.1', now);
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
  }
}

// Global real-time sync version bump helper
export function bumpGlobalSyncState(eventName, payload = {}) {
  try {
    const now = new Date().toISOString();
    const entityId = String(payload.vendorId || payload.allocationId || '');
    db.prepare(`
      UPDATE system_sync_state
      SET sync_version = sync_version + 1,
          last_event = ?,
          last_modified_entity_id = ?,
          updated_at = ?
      WHERE id = 'MIT_GLOBAL_SYNC_STATE'
    `).run(eventName, entityId, now);

    const row = db.prepare("SELECT sync_version, last_event, updated_at FROM system_sync_state WHERE id = 'MIT_GLOBAL_SYNC_STATE'").get();
    const syncVersion = row ? row.sync_version : Date.now();

    const syncPacket = {
      ...payload,
      syncVersion,
      eventName,
      updatedAt: now
    };

    try {
      import('./sseHub.js').then(({ default: sseHub }) => {
        sseHub.notifyConfigSubscribers('GLOBAL_SYNC_UPDATE', syncPacket);
        sseHub.notifyAdmins('GLOBAL_SYNC_UPDATE', syncPacket);
        if (payload.vendorId) {
          sseHub.notifyVendor(payload.vendorId, 'GLOBAL_SYNC_UPDATE', syncPacket);
        }
      });
    } catch {}

    return syncVersion;
  } catch (err) {
    console.error('Sync state update error:', err.message);
    return Date.now();
  }
}



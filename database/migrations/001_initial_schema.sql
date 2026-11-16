-- INDEX: idx_alloc_active_match
CREATE INDEX idx_alloc_active_match ON vendor_allocations(status, course, department, academic_year, section, gender);

-- INDEX: idx_alloc_vendor_id
CREATE INDEX idx_alloc_vendor_id ON vendor_allocations(vendor_id, status);

-- INDEX: idx_audit_created
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- INDEX: idx_orders_student
CREATE INDEX idx_orders_student ON uniform_orders(student_id);

-- INDEX: idx_pay_audit_time
CREATE INDEX idx_pay_audit_time ON payment_audit_logs (timestamp DESC);

-- INDEX: idx_pay_cash_ref
CREATE INDEX idx_pay_cash_ref ON payment_submissions (cash_payment_ref_id);

-- INDEX: idx_pay_config_hist_time
CREATE INDEX idx_pay_config_hist_time ON payment_config_history (modified_at DESC);

-- INDEX: idx_pay_reg_id
CREATE INDEX idx_pay_reg_id ON payment_submissions (registration_id);

-- INDEX: idx_pay_status
CREATE INDEX idx_pay_status ON payment_submissions (payment_status);

-- INDEX: idx_pay_usn
CREATE INDEX idx_pay_usn ON payment_submissions (usn);

-- INDEX: idx_pay_vendor_status
CREATE INDEX idx_pay_vendor_status ON payment_submissions(vendor_id, payment_method, payment_status, created_at DESC);

-- INDEX: idx_reg_dept_sem_sec
CREATE INDEX idx_reg_dept_sem_sec ON registrations(department, semester, section);

-- INDEX: idx_reg_dept_year_sec
CREATE INDEX idx_reg_dept_year_sec ON registrations(department, academic_year, section, gender);

-- INDEX: idx_reg_id
CREATE INDEX idx_reg_id ON registrations(registration_id);

-- INDEX: idx_reg_payment_status
CREATE INDEX idx_reg_payment_status ON registrations(payment_status, created_at DESC);

-- INDEX: idx_reg_prod_dist_status
CREATE INDEX idx_reg_prod_dist_status ON registrations(production_status, distribution_status);

-- INDEX: idx_reg_submitted_at
CREATE INDEX idx_reg_submitted_at ON registrations(submitted_at DESC);

-- INDEX: idx_reg_usn
CREATE INDEX idx_reg_usn ON registrations(usn);

-- INDEX: idx_schedules_lookup
CREATE INDEX idx_schedules_lookup ON distribution_schedules(department, semester, section, published);

-- INDEX: idx_str_app_id
CREATE UNIQUE INDEX idx_str_app_id ON student_tracking_records(application_id);

-- INDEX: idx_str_payment_status
CREATE INDEX idx_str_payment_status ON student_tracking_records(payment_status);

-- INDEX: idx_str_reg_id
CREATE INDEX idx_str_reg_id ON student_tracking_records(registration_id);

-- INDEX: idx_str_reg_status
CREATE INDEX idx_str_reg_status ON student_tracking_records(registration_status);

-- INDEX: idx_str_token_hash
CREATE INDEX idx_str_token_hash ON student_tracking_records(browser_resume_token_hash);

-- INDEX: idx_str_usn
CREATE UNIQUE INDEX idx_str_usn ON student_tracking_records(usn);

-- INDEX: idx_sva_alloc_id
CREATE INDEX idx_sva_alloc_id ON student_vendor_assignments(allocation_id);

-- INDEX: idx_sva_reg_id
CREATE INDEX idx_sva_reg_id ON student_vendor_assignments(registration_id);

-- INDEX: idx_sva_usn
CREATE INDEX idx_sva_usn ON student_vendor_assignments(usn);

-- INDEX: idx_sva_vendor_id
CREATE INDEX idx_sva_vendor_id ON student_vendor_assignments(vendor_id);

-- INDEX: idx_track_app_id
CREATE INDEX idx_track_app_id ON student_tracking_records(application_id);

-- INDEX: idx_track_status
CREATE INDEX idx_track_status ON student_tracking_records(payment_status, updated_at DESC);

-- INDEX: idx_track_usn
CREATE INDEX idx_track_usn ON student_tracking_records(usn);

-- INDEX: idx_unique_active_vendor_allocation
CREATE UNIQUE INDEX idx_unique_active_vendor_allocation ON vendor_allocations (
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

-- INDEX: idx_unique_cash_ref_id
CREATE UNIQUE INDEX idx_unique_cash_ref_id ON payment_submissions (cash_payment_ref_id) WHERE cash_payment_ref_id IS NOT NULL AND cash_payment_ref_id != '';

-- INDEX: idx_unique_cash_ref_not_null
CREATE UNIQUE INDEX idx_unique_cash_ref_not_null ON payment_submissions(cash_payment_ref_id) WHERE cash_payment_ref_id IS NOT NULL AND cash_payment_ref_id != '';

-- INDEX: idx_unique_normalized_utr
CREATE UNIQUE INDEX idx_unique_normalized_utr ON payment_submissions (UPPER(TRIM(utr_number))) WHERE utr_number IS NOT NULL AND utr_number != '';

-- INDEX: idx_unique_utr_not_null
CREATE UNIQUE INDEX idx_unique_utr_not_null ON payment_submissions(utr_number) WHERE utr_number IS NOT NULL AND utr_number != '';

-- INDEX: idx_va_alloc_id
CREATE INDEX idx_va_alloc_id ON vendor_allocations(allocation_id);

-- INDEX: idx_va_alloc_key
CREATE INDEX idx_va_alloc_key ON vendor_allocations(allocation_key);

-- INDEX: idx_va_status
CREATE INDEX idx_va_status ON vendor_allocations(status);

-- INDEX: idx_va_vendor_id
CREATE INDEX idx_va_vendor_id ON vendor_allocations(vendor_id);

-- INDEX: idx_val_timestamp
CREATE INDEX idx_val_timestamp ON vendor_audit_logs(timestamp DESC);

-- INDEX: idx_val_vendor_id
CREATE INDEX idx_val_vendor_id ON vendor_audit_logs(vendor_id);

-- INDEX: idx_vendors_status
CREATE INDEX idx_vendors_status ON vendors(status);

-- INDEX: idx_vendors_vendor_id
CREATE INDEX idx_vendors_vendor_id ON vendors(vendor_id);

-- INDEX: idx_vpa_access_status
CREATE INDEX idx_vpa_access_status ON vendor_portal_access(access_status);

-- INDEX: idx_vpa_token_hash
CREATE UNIQUE INDEX idx_vpa_token_hash ON vendor_portal_access(token_hash);

-- INDEX: idx_vpa_vendor_id
CREATE UNIQUE INDEX idx_vpa_vendor_id ON vendor_portal_access(vendor_id);

-- INDEX: idx_vpc_vendor_id
CREATE INDEX idx_vpc_vendor_id ON vendor_payment_configurations(vendor_id);

-- INDEX: idx_vth_action_timestamp
CREATE INDEX idx_vth_action_timestamp ON vendor_transaction_history(action_timestamp DESC);

-- INDEX: idx_vth_cash_ref
CREATE INDEX idx_vth_cash_ref ON vendor_transaction_history(cash_payment_ref_id);

-- INDEX: idx_vth_usn
CREATE INDEX idx_vth_usn ON vendor_transaction_history(usn);

-- INDEX: idx_vth_utr
CREATE INDEX idx_vth_utr ON vendor_transaction_history(utr_number);

-- INDEX: idx_vth_vendor_id
CREATE INDEX idx_vth_vendor_id ON vendor_transaction_history(vendor_id);

-- TABLE: admin_accounts
CREATE TABLE admin_accounts (
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

-- TABLE: admin_users
CREATE TABLE admin_users (
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

-- TABLE: application_category_controls
CREATE TABLE application_category_controls (
      id TEXT PRIMARY KEY DEFAULT 'MIT_UG_PG_MASTER_CONTROL',
      ug_open INTEGER NOT NULL DEFAULT 1,
      pg_open INTEGER NOT NULL DEFAULT 1,
      ug_closed_message TEXT NOT NULL DEFAULT 'Undergraduate (B.E. / B.Tech.) uniform registration and new payment submissions are currently closed.',
      pg_closed_message TEXT NOT NULL DEFAULT 'Postgraduate (MBA / MCA / M.Tech.) uniform registration and new payment submissions are currently closed.',
      video_url TEXT NOT NULL DEFAULT '/assets/video/application-closed.mp4',
      ug_updated_by TEXT NOT NULL DEFAULT 'System Initializer',
      ug_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      pg_updated_by TEXT NOT NULL DEFAULT 'System Initializer',
      pg_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by TEXT NOT NULL DEFAULT 'System Initializer',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

-- TABLE: application_control_audit_logs
CREATE TABLE application_control_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL, -- 'UG', 'PG', or 'BOTH'
      previous_ug_open INTEGER NOT NULL,
      new_ug_open INTEGER NOT NULL,
      previous_pg_open INTEGER NOT NULL,
      new_pg_open INTEGER NOT NULL,
      changed_by TEXT NOT NULL,
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

-- TABLE: application_sequences
CREATE TABLE application_sequences (
      id TEXT PRIMARY KEY, -- e.g. 'MIT_APP_2026'
      seq INTEGER NOT NULL DEFAULT 10000
    );

-- TABLE: application_settings
CREATE TABLE application_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      ug_application_open INTEGER NOT NULL DEFAULT 1,
      pg_application_open INTEGER NOT NULL DEFAULT 1,
      closed_video_url TEXT NOT NULL DEFAULT '/assets/video/application-closed.mp4',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

-- TABLE: audit_logs
CREATE TABLE audit_logs (
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

-- TABLE: campaigns
CREATE TABLE campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      academic_year TEXT NOT NULL DEFAULT '2026-27',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

-- TABLE: cash_ref_sequences
CREATE TABLE cash_ref_sequences (
      id TEXT PRIMARY KEY, -- e.g. 'MIT_CASH_REF_2026'
      seq INTEGER NOT NULL DEFAULT 10000
    );

-- TABLE: distribution_schedules
CREATE TABLE distribution_schedules (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      department TEXT NOT NULL,
      semester INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 8),
      section TEXT NOT NULL CHECK (section IN ('A','B','C','D','E','F','G')),
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
      updated_at TEXT NOT NULL, gender TEXT NOT NULL DEFAULT 'All',
      UNIQUE(campaign_id, department, semester, section)
    );

-- TABLE: payment_audit_logs
CREATE TABLE payment_audit_logs (
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

-- TABLE: payment_config
CREATE TABLE payment_config (
      id TEXT PRIMARY KEY,
      uniform_amount NUMERIC(10, 2) NOT NULL DEFAULT 1500.00,
      package_amounts TEXT,
      beneficiary_name TEXT NOT NULL DEFAULT 'Maharaja Institute of Technology Mysore',
      payment_instructions TEXT,
      reference_instructions TEXT,
      additional_instructions TEXT,
      updated_at TEXT,
      updated_by TEXT
    , config_version INTEGER NOT NULL DEFAULT 1, is_collection_enabled INTEGER NOT NULL DEFAULT 1, unavailable_message TEXT DEFAULT 'Payment collection is temporarily unavailable. Please contact the Uniform Office.', payment_mode TEXT NOT NULL DEFAULT 'FIXED', min_amount NUMERIC(10, 2) NOT NULL DEFAULT 1.00, max_amount NUMERIC(10, 2) NOT NULL DEFAULT 10000.00, department_amounts TEXT DEFAULT '{}', semester_amounts TEXT DEFAULT '{}', updated_by_name TEXT DEFAULT 'System Administrator');

-- TABLE: payment_config_history
CREATE TABLE payment_config_history (
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

-- TABLE: payment_methods
CREATE TABLE payment_methods (
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

-- TABLE: payment_submissions
CREATE TABLE payment_submissions (
          id TEXT PRIMARY KEY,
          registration_id TEXT NOT NULL,
          application_id TEXT DEFAULT '',
          student_id TEXT,
          student_name TEXT NOT NULL,
          usn TEXT NOT NULL,
          course TEXT DEFAULT 'B.E.',
          department TEXT NOT NULL,
          year_semester TEXT NOT NULL,
          section TEXT NOT NULL,
          gender TEXT DEFAULT '',
          package_type TEXT DEFAULT 'standard',
          payment_mode_type TEXT DEFAULT 'UPI' CHECK (payment_mode_type IN ('UPI', 'CASH')),
          payment_method TEXT NOT NULL CHECK (payment_method IN ('GPAY', 'PHONEPE', 'PAYTM', 'CASH')),
          cash_payment_ref_id TEXT,
          actual_amount_received NUMERIC(10, 2),
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
          utr_number TEXT,
          payment_screenshot TEXT,
          payment_status TEXT NOT NULL DEFAULT 'Submitted' CHECK (payment_status IN (
            'Not Paid',
            'Payment Pending',
            'Submitted',
            'Payment Submitted',
            'Under Verification',
            'Verified',
            'Payment Verified',
            'Payment Successful',
            'Rejected',
            'Payment Rejected',
            'Payment Not Received',
            'CASH PAYMENT PENDING',
            'CASH RECEIVED',
            'CASH PAYMENT REJECTED'
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

-- TABLE: registrations
CREATE TABLE registrations (
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
      updated_at TEXT NOT NULL, payment_status TEXT DEFAULT 'Not Paid', payment_verified INTEGER DEFAULT 0, payment_submission_id TEXT, assigned_vendor_id TEXT, assigned_vendor_name TEXT, vendor_allocation_id TEXT, blazer_size TEXT DEFAULT '', uniform_measurements TEXT DEFAULT '{}',
      UNIQUE(campaign_id, usn)
    );

-- TABLE: registrations_fts
CREATE VIRTUAL TABLE registrations_fts USING fts5(
      registration_id,
      usn,
      full_name,
      phone,
      content='registrations',
      content_rowid='rowid'
    );

-- TABLE: registrations_fts_config
CREATE TABLE 'registrations_fts_config'(k PRIMARY KEY, v) WITHOUT ROWID;

-- TABLE: registrations_fts_data
CREATE TABLE 'registrations_fts_data'(id INTEGER PRIMARY KEY, block BLOB);

-- TABLE: registrations_fts_docsize
CREATE TABLE 'registrations_fts_docsize'(id INTEGER PRIMARY KEY, sz BLOB);

-- TABLE: registrations_fts_idx
CREATE TABLE 'registrations_fts_idx'(segid, term, pgno, PRIMARY KEY(segid, term)) WITHOUT ROWID;

-- TABLE: sqlite_sequence
CREATE TABLE sqlite_sequence(name,seq);

-- TABLE: sqlite_stat1
CREATE TABLE sqlite_stat1(tbl,idx,stat);

-- TABLE: student_application_status
CREATE TABLE student_application_status (
    id TEXT PRIMARY KEY,
    is_application_open INTEGER NOT NULL DEFAULT 1,
    status_label TEXT NOT NULL DEFAULT 'Application ON',
    video_url TEXT NOT NULL DEFAULT '/assets/video/application-closed.mp4',
    fallback_message TEXT NOT NULL DEFAULT 'The application is temporarily unavailable. Please check back later.',
    updated_by_admin_id TEXT DEFAULT NULL,
    updated_by_username TEXT DEFAULT 'System Initializer',
    toggle_history TEXT DEFAULT '[]',
    updated_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now'))
  );

-- TABLE: student_data_clear_backups
CREATE TABLE student_data_clear_backups (
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

-- TABLE: student_tracking_records
CREATE TABLE student_tracking_records (
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
      is_registration_locked INTEGER NOT NULL DEFAULT 1,
      is_payment_locked INTEGER NOT NULL DEFAULT 0,
      student_profile TEXT NOT NULL,
      uniform_selection TEXT NOT NULL,
      assigned_vendor TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    , registration_status TEXT DEFAULT 'Registration Completed', payment_status TEXT DEFAULT 'Payment Pending', expected_amount REAL DEFAULT 1500);

-- TABLE: student_vendor_assignments
CREATE TABLE student_vendor_assignments (
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
    , gender TEXT DEFAULT 'All');

-- TABLE: system_sync_state
CREATE TABLE system_sync_state (
      id TEXT PRIMARY KEY,
      sync_version INTEGER NOT NULL DEFAULT 1,
      last_event TEXT NOT NULL DEFAULT 'INIT',
      last_modified_entity_id TEXT DEFAULT '',
      updated_at TEXT NOT NULL
    );

-- TABLE: uniform_orders
CREATE TABLE uniform_orders (
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

-- TABLE: vendor_allocations
CREATE TABLE vendor_allocations (
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
      uniform_category TEXT NOT NULL DEFAULT 'STANDARD',
      academic_period TEXT NOT NULL DEFAULT '2026-2027',
      allocation_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RELEASED', 'REASSIGNED', 'INACTIVE')),
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    , gender TEXT NOT NULL DEFAULT 'All', collection_room TEXT DEFAULT 'Main Uniform Distribution Hall', distribution_status TEXT DEFAULT 'Scheduled', distribution_date TEXT DEFAULT 'To Be Announced', uniform_availability TEXT DEFAULT 'In Stock', released_at TEXT, released_by TEXT);

-- TABLE: vendor_audit_logs
CREATE TABLE vendor_audit_logs (
      id TEXT PRIMARY KEY,
      vendor_id TEXT,
      admin_id TEXT,
      action TEXT NOT NULL,
      previous_value TEXT,
      new_value TEXT,
      timestamp TEXT NOT NULL
    );

-- TABLE: vendor_payment_configurations
CREATE TABLE vendor_payment_configurations (
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

-- TABLE: vendor_portal_access
CREATE TABLE vendor_portal_access (
      id TEXT PRIMARY KEY,
      vendor_ref TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      vendor_id TEXT UNIQUE NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      encrypted_portal_url TEXT NOT NULL,
      session_version INTEGER NOT NULL DEFAULT 1,
      access_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (access_status IN ('ACTIVE', 'REVOKED', 'EXPIRED', 'SUSPENDED')),
      allow_csv_export INTEGER NOT NULL DEFAULT 1,
      link_created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_login_at TEXT,
      last_activity_at TEXT,
      failed_login_attempts INTEGER DEFAULT 0,
      locked_until TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

-- TABLE: vendor_transaction_history
CREATE TABLE vendor_transaction_history (
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
          actual_amount_received NUMERIC(10, 2),
          cash_payment_ref_id TEXT,
          utr_number TEXT,
          payment_screenshot TEXT,
          previous_status TEXT NOT NULL,
          payment_status TEXT NOT NULL,
          verified_by_vendor_id TEXT NOT NULL,
          verified_by_vendor_name TEXT NOT NULL,
          verifier_role TEXT DEFAULT 'VENDOR',
          remarks TEXT DEFAULT '',
          rejection_reason TEXT DEFAULT '',
          action_timestamp TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

-- TABLE: vendors
CREATE TABLE vendors (
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
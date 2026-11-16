# MIT Uniform Management System — Database Documentation

## 1. Engine & Configuration

- **Database Engine**: Embedded SQLite 3 via Node.js 24 (`node:sqlite` `DatabaseSync`).
- **File Location**: `server/data/mit_uniform.db`
- **Concurrency Mode**: Write-Ahead Logging (`PRAGMA journal_mode = wal;`).
- **Integrity Pragmas**:
  - `PRAGMA synchronous = NORMAL;`
  - `PRAGMA foreign_keys = ON;`
  - `PRAGMA busy_timeout = 10000;`

## 2. Table Specifications

### A. Academic Registrations & Sizing
- `registrations`: Stores student uniform applications, department, semester, section, shirt size, trouser size, blazer size, detailed tailor measurements, and payment linkage.
  - Primary Key: `id` (UUID / TEXT)
  - Key Indexes: `idx_reg_usn`, `idx_reg_id`, `idx_reg_dept_sem_sec`, `idx_reg_payment_status`.
- `uniform_orders`: Fulfillment records linked to registrations.
- `distribution_schedules`: Room, building, date, and time allocations for uniform collection.

### B. Vendor Routing & Allocations
- `vendors`: Vendor registration details, mobile, email, status (`ACTIVE` / `INACTIVE`).
- `vendor_allocations`: Department, semester, section, and gender rules routing students to specific tailoring vendors.
- `vendor_payment_configurations`: Vendor-specific UPI IDs, beneficiary names, and dynamic QR code assets.
- `vendor_portal_access`: Magic token hashes and session states for passwordless vendor login.

### C. Financials & Payment Reconciliation
- `payment_config`: Uniform fee structure, min/max limits, department-specific overrides.
- `payment_methods`: Configured payment modes (GPAY, PHONEPE, PAYTM, CASH).
- `payment_submissions`: Student payment submissions containing UTR, amount, OCR extracted text, bank-verified amount, verification status.
  - Unique Constraint: `idx_unique_normalized_utr` prevents duplicate UTR reuse across students.
- `vendor_transaction_history`: Immutable ledger of verified uniform transactions.

### D. Governance & Auditing
- `admin_users`: Administrator credentials with bcrypt password hashing.
- `application_category_controls`: Independent master toggles for UG and PG registrations.
- `application_control_audit_logs`: Audit trail of every ON/OFF toggle change.
- `audit_logs`: Detailed administrative activity audit log with IP address tracking.

## 3. Automated Backup Procedure

To take an atomic, lock-free backup in production:
```bash
node database/backups/backup_database.js
```
This triggers `PRAGMA wal_checkpoint(TRUNCATE)` before copying the `.db` file to ensure 100% data consistency.

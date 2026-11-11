import express from 'express';
import crypto from 'node:crypto';
import { db, bumpGlobalSyncState } from './db.js';
import { requireAdminJwt, requireVendorJwt } from './jwtAuth.js';
import { requireStudentAppOpen } from './middleware/requireStudentAppOpen.js';
import { resolveOrCreateStudentVendorAssignment } from './vendorRoutes.js';
import { cleanRegId, isValidRegistrationId } from './utils/registrationIdUtils.js';
import { broadcastPaymentUpdate } from './vendorPortalRoutes.js';
import sseHub from './sseHub.js';

const router = express.Router();

// ============================================================================
// ATOMIC UNIQUE CASH REFERENCE ID GENERATOR (e.g. CASH-MIT-2026-10001)
// ============================================================================
export const generateUniqueCashReferenceId = () => {
  const year = new Date().getFullYear();
  const counterKey = `MIT_CASH_REF_${year}`;

  db.exec('BEGIN IMMEDIATE');
  try {
    let row = db.prepare('SELECT seq FROM cash_ref_sequences WHERE id = ?').get(counterKey);
    let curSeq = row ? row.seq + 1 : 10001;

    db.prepare(`
      INSERT INTO cash_ref_sequences (id, seq) VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET seq = ?
    `).run(counterKey, curSeq, curSeq);

    db.exec('COMMIT');
    return `CASH-MIT-${year}-${curSeq}`;
  } catch (err) {
    if (db.inTransaction) {
      try { db.exec('ROLLBACK'); } catch (_) {}
    }
    throw err;
  }
};

// Helper: Resolve Authoritative Student Record
const resolveStudentRecordForCash = (rawRegId, rawUsn = '') => {
  const cleanedId = cleanRegId(rawRegId);
  const cleanedUsn = String(rawUsn || '').toUpperCase().trim();

  let trackingRecord = null;
  let registrationDoc = null;

  if (cleanedId) {
    trackingRecord = db.prepare(`
      SELECT * FROM student_tracking_records
      WHERE registration_id = ? OR id = ? OR application_id = ?
    `).get(cleanedId, cleanedId, cleanedId.toUpperCase());

    registrationDoc = db.prepare(`
      SELECT * FROM registrations
      WHERE registration_id = ? OR id = ?
    `).get(cleanedId, cleanedId);
  }

  if (!trackingRecord && cleanedUsn) {
    trackingRecord = db.prepare(`
      SELECT * FROM student_tracking_records WHERE usn = ?
    `).get(cleanedUsn);
  }

  if (!registrationDoc && cleanedUsn) {
    registrationDoc = db.prepare(`
      SELECT * FROM registrations WHERE usn = ?
    `).get(cleanedUsn);
  }

  const canonicalRegId =
    trackingRecord?.registration_id ||
    registrationDoc?.registration_id ||
    registrationDoc?.id ||
    cleanedId;

  return { canonicalRegId, trackingRecord, registrationDoc };
};

// ============================================================================
// 1. STUDENT PORTAL: CREATE CASH PAYMENT REQUEST
// ============================================================================

// POST /api/payments/cash/request
router.post('/payments/cash/request', requireStudentAppOpen, (req, res) => {
  try {
    // 1. Check Master Collection Toggle
    const config = db.prepare('SELECT * FROM payment_config LIMIT 1').get();
    if (config && config.is_collection_enabled === 0) {
      return res.status(503).json({
        success: false,
        collectionDisabled: true,
        message:
          config.unavailable_message ||
          'Payment collection is temporarily unavailable. Please contact the Uniform Office.'
      });
    }

    const incomingRegId = cleanRegId(req.body.registrationId || req.body.applicationId);
    const cleanUsn = String(req.body.usn || '').toUpperCase().trim();

    if (!isValidRegistrationId(incomingRegId) && !cleanUsn) {
      return res.status(400).json({
        success: false,
        message: 'Valid Registration ID or USN is required to initiate a cash payment request.'
      });
    }

    const { canonicalRegId, trackingRecord, registrationDoc } = resolveStudentRecordForCash(incomingRegId, cleanUsn);

    if (!canonicalRegId && !registrationDoc) {
      return res.status(404).json({
        success: false,
        message: 'Student registration record not found. Please complete registration first.'
      });
    }

    const finalRegId = canonicalRegId || registrationDoc.registration_id || registrationDoc.id;
    const finalUsn = cleanUsn || registrationDoc?.usn || trackingRecord?.usn || '';

    // 2. Prevent duplicate payment requests
    const existingSubmission = db.prepare(`
      SELECT * FROM payment_submissions
      WHERE registration_id = ? OR (usn = ? AND ? != '')
      ORDER BY created_at DESC LIMIT 1
    `).get(finalRegId, finalUsn, finalUsn);

    if (existingSubmission) {
      const st = existingSubmission.payment_status;
      if (
        st === 'Verified' ||
        st === 'Payment Verified' ||
        st === 'Payment Successful' ||
        st === 'CASH RECEIVED'
      ) {
        return res.status(400).json({
          success: false,
          alreadyConfirmed: true,
          message: 'Your uniform payment is already confirmed. Duplicate payment requests are blocked.'
        });
      }

      if (st === 'CASH PAYMENT PENDING') {
        let assignedVendor = null;
        if (existingSubmission.vendor_id) {
          assignedVendor = {
            vendorId: existingSubmission.vendor_id,
            vendorName: existingSubmission.vendor_name,
            allocationId: existingSubmission.vendor_allocation_id
          };
        }
        return res.status(409).json({
          success: false,
          alreadyPending: true,
          message: 'You already have an active Cash Payment request pending vendor verification.',
          cashPaymentRefId: existingSubmission.cash_payment_ref_id,
          paymentStatus: 'CASH PAYMENT PENDING',
          assignedVendor
        });
      }
    }

    // 3. Resolve student details and Assigned Uniform Vendor
    const profile = trackingRecord?.student_profile
      ? (typeof trackingRecord.student_profile === 'string' ? JSON.parse(trackingRecord.student_profile) : trackingRecord.student_profile)
      : {};

    const studentRaw = {
      registrationId: finalRegId,
      studentId: registrationDoc?.id || trackingRecord?.id || finalRegId,
      studentName: registrationDoc?.full_name || profile.studentName || req.body.studentName || 'Student',
      usn: finalUsn,
      course: req.body.course || profile.course || registrationDoc?.course || 'B.E.',
      educationLevel: req.body.educationLevel || profile.educationLevel || 'UG',
      department: req.body.department || profile.department || registrationDoc?.department || '',
      departmentShortName: req.body.department || profile.departmentCode || '',
      academicYear: req.body.academicYear || profile.academicYear || registrationDoc?.academic_year || '1st Year',
      semester: req.body.semester || profile.semester || registrationDoc?.semester || 'ALL',
      section: req.body.section || profile.section || registrationDoc?.section || '',
      gender: req.body.gender || profile.gender || registrationDoc?.gender || ''
    };

    const vendorMatch = resolveOrCreateStudentVendorAssignment(studentRaw);
    if (!vendorMatch || vendorMatch.genderRequired) {
      return res.status(400).json({
        success: false,
        genderRequired: Boolean(vendorMatch?.genderRequired),
        message: vendorMatch?.message || 'No uniform vendor currently allocated for your academic group.'
      });
    }

    // 4. Resolve Expected Uniform Fee Amount
    let expectedAmount = 1500;
    if (vendorMatch.paymentAmount && Number(vendorMatch.paymentAmount) > 0) {
      expectedAmount = Number(vendorMatch.paymentAmount);
    } else if (config && config.uniform_amount) {
      expectedAmount = Number(config.uniform_amount);
    } else if (trackingRecord && trackingRecord.expected_amount) {
      expectedAmount = Number(trackingRecord.expected_amount);
    }

    // 5. Generate collision-free Cash Reference ID
    const cashRefId = generateUniqueCashReferenceId();
    const submissionId = crypto.randomUUID();
    const now = new Date().toISOString();

    // 6. Insert new Cash Payment Submission record (or update previous rejected one)
    if (existingSubmission && (existingSubmission.payment_status === 'Rejected' || existingSubmission.payment_status === 'Payment Rejected' || existingSubmission.payment_status === 'CASH PAYMENT REJECTED')) {
      // Re-use or update
      db.prepare(`
        UPDATE payment_submissions
        SET payment_mode_type = 'CASH',
            payment_method = 'CASH',
            cash_payment_ref_id = ?,
            expected_amount = ?,
            amount = ?,
            actual_amount_received = NULL,
            utr_number = NULL,
            payment_screenshot = NULL,
            payment_status = 'CASH PAYMENT PENDING',
            rejection_reason = '',
            admin_remarks = 'Student re-initiated payment via Cash',
            vendor_id = ?,
            vendor_name = ?,
            vendor_allocation_id = ?,
            vendor_beneficiary_name = ?,
            vendor_upi_id = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        cashRefId,
        expectedAmount,
        expectedAmount,
        vendorMatch.vendorId,
        vendorMatch.vendorName,
        vendorMatch.allocationId,
        vendorMatch.beneficiaryName || '',
        vendorMatch.upiId || '',
        now,
        existingSubmission.id
      );
    } else {
      db.prepare(`
        INSERT INTO payment_submissions (
          id, registration_id, application_id, student_id, student_name, usn, course, department,
          year_semester, section, gender, package_type, payment_mode_type, payment_method,
          cash_payment_ref_id, actual_amount_received, expected_amount, amount,
          utr_number, payment_screenshot, payment_status, reconciliation_status,
          admin_remarks, rejection_reason, vendor_id, vendor_name, vendor_allocation_id,
          vendor_beneficiary_name, vendor_upi_id, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, 'standard', 'CASH', 'CASH',
          ?, NULL, ?, ?,
          NULL, NULL, 'CASH PAYMENT PENDING', 'Unchecked',
          'Cash payment request initiated by student', '', ?, ?, ?,
          ?, ?, ?, ?
        )
      `).run(
        submissionId,
        finalRegId,
        trackingRecord?.application_id || '',
        studentRaw.studentId,
        studentRaw.studentName,
        finalUsn,
        studentRaw.course,
        studentRaw.department,
        studentRaw.academicYear,
        studentRaw.section,
        studentRaw.gender,
        cashRefId,
        expectedAmount,
        expectedAmount,
        vendorMatch.vendorId,
        vendorMatch.vendorName,
        vendorMatch.allocationId,
        vendorMatch.beneficiaryName || '',
        vendorMatch.upiId || '',
        now,
        now
      );
    }

    // 7. Update Student Tracking Record
    try {
      db.prepare(`
        UPDATE student_tracking_records
        SET payment_status = 'CASH PAYMENT PENDING',
            is_payment_locked = 1,
            updated_at = ?
        WHERE registration_id = ? OR id = ? OR (usn = ? AND ? != '')
      `).run(now, finalRegId, finalRegId, finalUsn, finalUsn);
    } catch (_) {}

    // 8. Update Registration record
    try {
      db.prepare(`
        UPDATE registrations
        SET payment_status = 'CASH PAYMENT PENDING',
            payment_verified = 0,
            assigned_vendor_id = ?,
            assigned_vendor_name = ?,
            vendor_allocation_id = ?,
            updated_at = ?
        WHERE registration_id = ? OR id = ?
      `).run(vendorMatch.vendorId, vendorMatch.vendorName, vendorMatch.allocationId, now, finalRegId, finalRegId);
    } catch (_) {}

    // 9. Write Security & Audit Log
    try {
      db.prepare(`
        INSERT INTO payment_audit_logs (id, admin_id, actor_type, action, payment_submission_id, previous_value, new_value, ip_address, timestamp)
        VALUES (?, NULL, 'STUDENT', 'CASH_PAYMENT_REQUEST_CREATED', ?, NULL, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        existingSubmission ? existingSubmission.id : submissionId,
        JSON.stringify({
          cashPaymentRefId: cashRefId,
          usn: finalUsn,
          expectedAmount,
          vendorId: vendorMatch.vendorId
        }),
        req.ip || '127.0.0.1',
        now
      );
    } catch (_) {}

    // 10. Real-time broadcasting via SSE & Sync State
    bumpGlobalSyncState('CASH_PAYMENT_REQUEST_CREATED', finalRegId);

    const broadcastPayload = {
      type: 'PAYMENT_STATUS_UPDATED',
      registrationId: finalRegId,
      usn: finalUsn,
      paymentStatus: 'CASH PAYMENT PENDING',
      paymentModeType: 'CASH',
      paymentMethod: 'CASH',
      cashPaymentRefId: cashRefId,
      expectedAmount,
      vendorId: vendorMatch.vendorId,
      vendorName: vendorMatch.vendorName
    };
    broadcastPaymentUpdate(broadcastPayload);

    return res.status(201).json({
      success: true,
      message:
        'Cash payment selected. Please pay the amount directly to your assigned uniform vendor. Your payment will be confirmed after the vendor receives the cash.',
      cashPaymentRefId: cashRefId,
      paymentStatus: 'CASH PAYMENT PENDING',
      expectedAmount,
      assignedVendor: {
        vendorId: vendorMatch.vendorId,
        vendorName: vendorMatch.vendorName,
        allocationId: vendorMatch.allocationId,
        collectionRoom: vendorMatch.collectionRoom || 'Main Distribution Hall'
      }
    });
  } catch (err) {
    console.error('Cash Payment Request Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 2. VENDOR PORTAL: CASH COLLECTION, CONFIRMATION & REJECTION
// ============================================================================

// GET /api/vendor-portal/cash-payments
router.get('/vendor-portal/cash-payments', requireVendorJwt, (req, res) => {
  try {
    const vendorId = req.vendorId || req.vendor.vendor_id;
    const { status, search } = req.query;

    let query = `
      SELECT ps.*, str.application_id as student_application_id, str.student_profile
      FROM payment_submissions ps
      LEFT JOIN student_tracking_records str ON (ps.registration_id = str.registration_id OR ps.usn = str.usn)
      WHERE ps.vendor_id = ?
        AND (ps.payment_method = 'CASH' OR ps.payment_mode_type = 'CASH' OR ps.cash_payment_ref_id IS NOT NULL)
    `;
    const params = [vendorId];

    if (status && status !== 'ALL') {
      query += ' AND ps.payment_status = ?';
      params.push(status);
    }

    if (search && String(search).trim()) {
      const term = `%${String(search).trim()}%`;
      query += ' AND (ps.usn LIKE ? OR ps.student_name LIKE ? OR ps.cash_payment_ref_id LIKE ? OR ps.department LIKE ?)';
      params.push(term, term, term, term);
    }

    query += ' ORDER BY ps.created_at DESC';

    const rows = db.prepare(query).all(...params);

    // Compute Summary statistics for this vendor
    const summaryRows = db.prepare(`
      SELECT
        COUNT(*) as total_requests,
        SUM(CASE WHEN payment_status = 'CASH PAYMENT PENDING' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN payment_status = 'CASH RECEIVED' THEN 1 ELSE 0 END) as received_count,
        SUM(CASE WHEN payment_status = 'CASH PAYMENT REJECTED' THEN 1 ELSE 0 END) as rejected_count,
        SUM(CASE WHEN payment_status = 'CASH RECEIVED' THEN COALESCE(actual_amount_received, amount, expected_amount) ELSE 0 END) as total_cash_collected
      FROM payment_submissions
      WHERE vendor_id = ?
        AND (payment_method = 'CASH' OR payment_mode_type = 'CASH' OR cash_payment_ref_id IS NOT NULL)
    `).get(vendorId);

    const formattedRequests = rows.map((r) => ({
      id: r.id,
      _id: r.id,
      registrationId: r.registration_id,
      applicationId: r.application_id || r.student_application_id || '',
      studentName: r.student_name,
      usn: r.usn,
      course: r.course || 'B.E.',
      department: r.department,
      yearSemester: r.year_semester,
      section: r.section,
      gender: r.gender || '',
      paymentModeType: r.payment_mode_type || 'CASH',
      paymentMethod: r.payment_method || 'CASH',
      cashPaymentRefId: r.cash_payment_ref_id,
      expectedAmount: Number(r.expected_amount || 0),
      actualAmountReceived: r.actual_amount_received !== null && r.actual_amount_received !== undefined ? Number(r.actual_amount_received) : null,
      paymentStatus: r.payment_status,
      adminRemarks: r.admin_remarks || '',
      rejectionReason: r.rejection_reason || '',
      verifiedBy: r.verified_by || '',
      verifiedAt: r.verified_at || null,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));

    return res.json({
      success: true,
      summary: {
        totalRequests: Number(summaryRows?.total_requests || 0),
        pendingCount: Number(summaryRows?.pending_count || 0),
        receivedCount: Number(summaryRows?.received_count || 0),
        rejectedCount: Number(summaryRows?.rejected_count || 0),
        totalCashCollected: Number(summaryRows?.total_cash_collected || 0)
      },
      requests: formattedRequests
    });
  } catch (err) {
    console.error('Vendor Cash Payments List Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/vendor-portal/cash-payments/:submissionId/confirm
router.patch('/vendor-portal/cash-payments/:submissionId/confirm', requireVendorJwt, (req, res) => {
  try {
    const { submissionId } = req.params;
    const vendorId = req.vendorId || req.vendor.vendor_id;
    const { actualAmountReceived, remarks } = req.body;

    const submission = db.prepare('SELECT * FROM payment_submissions WHERE id = ?').get(submissionId);
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Cash payment submission not found.' });
    }

    // Verify vendor ownership (Never allow vendor to confirm another vendor's student)
    if (submission.vendor_id && submission.vendor_id !== vendorId) {
      return res.status(403).json({
        success: false,
        message: 'Security Violation: You are not authorized to confirm cash payments for another vendor.'
      });
    }

    const enteredAmount = Number(actualAmountReceived);
    const expectedAmount = Number(submission.expected_amount);

    // Strict Amount Validation: Block if actualAmountReceived does not equal expectedAmount
    if (!enteredAmount || enteredAmount !== expectedAmount) {
      try {
        db.prepare(`
          INSERT INTO payment_audit_logs (id, admin_id, actor_type, action, payment_submission_id, previous_value, new_value, ip_address, timestamp)
          VALUES (?, ?, 'VENDOR', 'CASH_AMOUNT_MISMATCH_BLOCKED', ?, ?, ?, ?, ?)
        `).run(
          crypto.randomUUID(),
          vendorId,
          submission.id,
          String(expectedAmount),
          String(enteredAmount),
          req.ip || '127.0.0.1',
          new Date().toISOString()
        );
      } catch (_) {}

      return res.status(400).json({
        success: false,
        amountMismatch: true,
        message: `Amount Mismatch Warning: Entered ₹${enteredAmount} does not match expected uniform amount ₹${expectedAmount}. Vendor confirmation blocked.`
      });
    }

    const now = new Date().toISOString();
    const verifierName = req.vendor.vendor_name || vendorId;

    // 1. Update Payment Submission
    db.prepare(`
      UPDATE payment_submissions
      SET payment_status = 'CASH RECEIVED',
          actual_amount_received = ?,
          amount = ?,
          verified_by = ?,
          verified_at = ?,
          admin_remarks = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      enteredAmount,
      enteredAmount,
      verifierName,
      now,
      remarks || 'Cash verified & received by assigned uniform vendor',
      now,
      submissionId
    );

    // 2. Update Student Tracking Record
    try {
      db.prepare(`
        UPDATE student_tracking_records
        SET payment_status = 'CASH RECEIVED',
            is_payment_locked = 1,
            updated_at = ?
        WHERE registration_id = ? OR id = ? OR (usn = ? AND ? != '')
      `).run(now, submission.registration_id, submission.registration_id, submission.usn, submission.usn);
    } catch (_) {}

    // 3. Update Registrations Table
    try {
      db.prepare(`
        UPDATE registrations
        SET payment_status = 'Paid',
            payment_verified = 1,
            updated_at = ?
        WHERE registration_id = ? OR id = ?
      `).run(now, submission.registration_id, submission.registration_id);
    } catch (_) {}

    // 4. Update Student Vendor Assignment
    try {
      db.prepare(`
        UPDATE student_vendor_assignments
        SET has_paid_or_submitted = 1,
            assignment_status = 'LOCKED_BY_PAYMENT',
            updated_at = ?
        WHERE registration_id = ? OR usn = ?
      `).run(now, submission.registration_id, submission.usn);
    } catch (_) {}

    // 5. Append-only Immutable Vendor Transaction History
    try {
      db.prepare(`
        INSERT INTO vendor_transaction_history (
          id, submission_id, registration_id, student_name, usn, department, year_semester, section,
          vendor_ref, vendor_id, vendor_name, payment_method, payment_amount, verified_bank_amount,
          actual_amount_received, cash_payment_ref_id, utr_number, payment_screenshot,
          previous_status, payment_status, verified_by_vendor_id, verified_by_vendor_name,
          verifier_role, remarks, action_timestamp, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          NULL, ?, ?, 'CASH', ?, NULL,
          ?, ?, NULL, NULL,
          ?, 'CASH RECEIVED', ?, ?,
          'VENDOR', ?, ?, ?
        )
      `).run(
        crypto.randomUUID(),
        submission.id,
        submission.registration_id,
        submission.student_name,
        submission.usn,
        submission.department,
        submission.year_semester,
        submission.section,
        vendorId,
        verifierName,
        expectedAmount,
        enteredAmount,
        submission.cash_payment_ref_id,
        submission.payment_status,
        vendorId,
        verifierName,
        remarks || 'Cash payment confirmed and uniform issued',
        now,
        now
      );
    } catch (vthErr) {
      console.warn('Vendor Transaction History Log Error:', vthErr.message);
    }

    // 6. Payment Audit Log
    try {
      db.prepare(`
        INSERT INTO payment_audit_logs (id, admin_id, actor_type, action, payment_submission_id, previous_value, new_value, ip_address, timestamp)
        VALUES (?, ?, 'VENDOR', 'CASH_PAYMENT_RECEIVED', ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        vendorId,
        submission.id,
        JSON.stringify({ paymentStatus: submission.payment_status }),
        JSON.stringify({ paymentStatus: 'CASH RECEIVED', actualAmountReceived: enteredAmount }),
        req.ip || '127.0.0.1',
        now
      );
    } catch (_) {}

    // 7. System Sync State & Real-Time Broadcast
    bumpGlobalSyncState('CASH_PAYMENT_RECEIVED', submission.registration_id);

    const broadcastPayload = {
      type: 'PAYMENT_STATUS_UPDATED',
      registrationId: submission.registration_id,
      usn: submission.usn,
      paymentStatus: 'CASH RECEIVED',
      paymentModeType: 'CASH',
      paymentMethod: 'CASH',
      cashPaymentRefId: submission.cash_payment_ref_id,
      actualAmountReceived: enteredAmount,
      vendorId,
      vendorName: verifierName
    };
    broadcastPaymentUpdate(broadcastPayload);

    return res.json({
      success: true,
      message: 'Cash payment confirmed and recorded successfully.',
      submission: {
        id: submission.id,
        cashPaymentRefId: submission.cash_payment_ref_id,
        paymentStatus: 'CASH RECEIVED',
        actualAmountReceived: enteredAmount,
        verifiedBy: verifierName,
        verifiedAt: now
      }
    });
  } catch (err) {
    console.error('Vendor Confirm Cash Payment Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/vendor-portal/cash-payments/:submissionId/reject
router.patch('/vendor-portal/cash-payments/:submissionId/reject', requireVendorJwt, (req, res) => {
  try {
    const { submissionId } = req.params;
    const vendorId = req.vendorId || req.vendor.vendor_id;
    const { rejectionReason, remarks } = req.body;

    if (!rejectionReason || !String(rejectionReason).trim()) {
      return res.status(400).json({
        success: false,
        message: 'A mandatory rejection reason is required to reject a cash payment.'
      });
    }

    const submission = db.prepare('SELECT * FROM payment_submissions WHERE id = ?').get(submissionId);
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Cash payment submission not found.' });
    }

    if (submission.vendor_id && submission.vendor_id !== vendorId) {
      return res.status(403).json({
        success: false,
        message: 'Security Violation: You are not authorized to modify cash payments for another vendor.'
      });
    }

    const now = new Date().toISOString();
    const verifierName = req.vendor.vendor_name || vendorId;
    const reasonClean = String(rejectionReason).trim();

    // 1. Update Payment Submission
    db.prepare(`
      UPDATE payment_submissions
      SET payment_status = 'CASH PAYMENT REJECTED',
          rejection_reason = ?,
          admin_remarks = ?,
          verified_by = ?,
          verified_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      reasonClean,
      remarks || reasonClean,
      verifierName,
      now,
      now,
      submissionId
    );

    // 2. Update Student Tracking Record
    try {
      db.prepare(`
        UPDATE student_tracking_records
        SET payment_status = 'CASH PAYMENT REJECTED',
            is_payment_locked = 0,
            updated_at = ?
        WHERE registration_id = ? OR id = ? OR (usn = ? AND ? != '')
      `).run(now, submission.registration_id, submission.registration_id, submission.usn, submission.usn);
    } catch (_) {}

    // 3. Update Registrations Table
    try {
      db.prepare(`
        UPDATE registrations
        SET payment_status = 'Payment Rejected',
            payment_verified = 0,
            updated_at = ?
        WHERE registration_id = ? OR id = ?
      `).run(now, submission.registration_id, submission.registration_id);
    } catch (_) {}

    // 4. Append-only Immutable Vendor Transaction History
    try {
      db.prepare(`
        INSERT INTO vendor_transaction_history (
          id, submission_id, registration_id, student_name, usn, department, year_semester, section,
          vendor_ref, vendor_id, vendor_name, payment_method, payment_amount, verified_bank_amount,
          actual_amount_received, cash_payment_ref_id, utr_number, payment_screenshot,
          previous_status, payment_status, verified_by_vendor_id, verified_by_vendor_name,
          verifier_role, remarks, rejection_reason, action_timestamp, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          NULL, ?, ?, 'CASH', ?, NULL,
          NULL, ?, NULL, NULL,
          ?, 'CASH PAYMENT REJECTED', ?, ?,
          'VENDOR', ?, ?, ?, ?
        )
      `).run(
        crypto.randomUUID(),
        submission.id,
        submission.registration_id,
        submission.student_name,
        submission.usn,
        submission.department,
        submission.year_semester,
        submission.section,
        vendorId,
        verifierName,
        Number(submission.expected_amount || 0),
        submission.cash_payment_ref_id,
        submission.payment_status,
        vendorId,
        verifierName,
        remarks || reasonClean,
        reasonClean,
        now,
        now
      );
    } catch (vthErr) {
      console.warn('Vendor Transaction History Log Error:', vthErr.message);
    }

    // 5. Payment Audit Log
    try {
      db.prepare(`
        INSERT INTO payment_audit_logs (id, admin_id, actor_type, action, payment_submission_id, previous_value, new_value, ip_address, timestamp)
        VALUES (?, ?, 'VENDOR', 'CASH_PAYMENT_REJECTED', ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        vendorId,
        submission.id,
        JSON.stringify({ paymentStatus: submission.payment_status }),
        JSON.stringify({ paymentStatus: 'CASH PAYMENT REJECTED', rejectionReason: reasonClean }),
        req.ip || '127.0.0.1',
        now
      );
    } catch (_) {}

    // 6. Real-time broadcasting
    bumpGlobalSyncState('CASH_PAYMENT_REJECTED', submission.registration_id);

    const broadcastPayload = {
      type: 'PAYMENT_STATUS_UPDATED',
      registrationId: submission.registration_id,
      usn: submission.usn,
      paymentStatus: 'CASH PAYMENT REJECTED',
      paymentModeType: 'CASH',
      paymentMethod: 'CASH',
      cashPaymentRefId: submission.cash_payment_ref_id,
      rejectionReason: reasonClean,
      vendorId,
      vendorName: verifierName
    };
    broadcastPaymentUpdate(broadcastPayload);

    return res.json({
      success: true,
      message: 'Cash payment marked as rejected.',
      submission: {
        id: submission.id,
        cashPaymentRefId: submission.cash_payment_ref_id,
        paymentStatus: 'CASH PAYMENT REJECTED',
        rejectionReason: reasonClean,
        verifiedBy: verifierName,
        verifiedAt: now
      }
    });
  } catch (err) {
    console.error('Vendor Reject Cash Payment Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 3. ADMIN PANEL: CASH CONTROLLER & SEPARATE UPI VS. CASH FINANCIAL REPORTS
// ============================================================================

// GET /api/admin/payments/cash
router.get('/admin/payments/cash', requireAdminJwt, (req, res) => {
  try {
    const { status, vendorId, search } = req.query;

    let query = `
      SELECT ps.*, str.application_id as student_application_id
      FROM payment_submissions ps
      LEFT JOIN student_tracking_records str ON (ps.registration_id = str.registration_id OR ps.usn = str.usn)
      WHERE (ps.payment_method = 'CASH' OR ps.payment_mode_type = 'CASH' OR ps.cash_payment_ref_id IS NOT NULL)
    `;
    const params = [];

    if (status && status !== 'ALL') {
      query += ' AND ps.payment_status = ?';
      params.push(status);
    }

    if (vendorId && vendorId !== 'ALL') {
      query += ' AND ps.vendor_id = ?';
      params.push(vendorId);
    }

    if (search && String(search).trim()) {
      const term = `%${String(search).trim()}%`;
      query += ' AND (ps.usn LIKE ? OR ps.student_name LIKE ? OR ps.cash_payment_ref_id LIKE ? OR ps.department LIKE ?)';
      params.push(term, term, term, term);
    }

    query += ' ORDER BY ps.created_at DESC';

    const rows = db.prepare(query).all(...params);

    // Summary Metrics for Cash Payments
    const metricsRow = db.prepare(`
      SELECT
        COUNT(*) as total_cash_requests,
        SUM(CASE WHEN payment_status = 'CASH PAYMENT PENDING' THEN 1 ELSE 0 END) as pending_cash_requests,
        SUM(CASE WHEN payment_status = 'CASH RECEIVED' THEN 1 ELSE 0 END) as confirmed_cash_received,
        SUM(CASE WHEN payment_status = 'CASH PAYMENT REJECTED' THEN 1 ELSE 0 END) as rejected_cash_requests,
        SUM(CASE WHEN payment_status = 'CASH RECEIVED' THEN COALESCE(actual_amount_received, amount, expected_amount) ELSE 0 END) as total_cash_revenue_collected,
        SUM(CASE WHEN payment_status = 'CASH PAYMENT PENDING' THEN expected_amount ELSE 0 END) as pending_cash_amount
      FROM payment_submissions
      WHERE (payment_method = 'CASH' OR payment_mode_type = 'CASH' OR cash_payment_ref_id IS NOT NULL)
    `).get();

    // Separate UPI Financial Metrics
    const upiMetricsRow = db.prepare(`
      SELECT
        COUNT(*) as total_upi_submissions,
        SUM(CASE WHEN payment_status IN ('Verified', 'Payment Verified', 'Payment Successful') THEN 1 ELSE 0 END) as verified_upi_count,
        SUM(CASE WHEN payment_status IN ('Verified', 'Payment Verified', 'Payment Successful') THEN COALESCE(bank_verified_amount, amount, expected_amount) ELSE 0 END) as verified_upi_revenue
      FROM payment_submissions
      WHERE payment_method != 'CASH' AND payment_mode_type != 'CASH' AND cash_payment_ref_id IS NULL
    `).get();

    const cashRevenue = Number(metricsRow?.total_cash_revenue_collected || 0);
    const upiRevenue = Number(upiMetricsRow?.verified_upi_revenue || 0);
    const totalCollected = cashRevenue + upiRevenue;

    const formatted = rows.map((r) => ({
      id: r.id,
      _id: r.id,
      registrationId: r.registration_id,
      applicationId: r.application_id || r.student_application_id || '',
      studentName: r.student_name,
      usn: r.usn,
      course: r.course || 'B.E.',
      department: r.department,
      yearSemester: r.year_semester,
      section: r.section,
      gender: r.gender || '',
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      vendorAllocationId: r.vendor_allocation_id,
      paymentModeType: r.payment_mode_type || 'CASH',
      paymentMethod: r.payment_method || 'CASH',
      cashPaymentRefId: r.cash_payment_ref_id,
      expectedAmount: Number(r.expected_amount || 0),
      actualAmountReceived: r.actual_amount_received !== null && r.actual_amount_received !== undefined ? Number(r.actual_amount_received) : null,
      paymentStatus: r.payment_status,
      adminRemarks: r.admin_remarks || '',
      rejectionReason: r.rejection_reason || '',
      verifiedBy: r.verified_by || '',
      verifiedAt: r.verified_at || null,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));

    return res.json({
      success: true,
      metrics: {
        totalCashRequests: Number(metricsRow?.total_cash_requests || 0),
        pendingCashRequests: Number(metricsRow?.pending_cash_requests || 0),
        confirmedCashReceived: Number(metricsRow?.confirmed_cash_received || 0),
        rejectedCashRequests: Number(metricsRow?.rejected_cash_requests || 0),
        totalCashRevenueCollected: cashRevenue,
        pendingCashAmount: Number(metricsRow?.pending_cash_amount || 0)
      },
      financialBreakdown: {
        upiRevenue,
        cashRevenue,
        totalCollectedRevenue: totalCollected,
        pendingCashAmount: Number(metricsRow?.pending_cash_amount || 0),
        verifiedUpiCount: Number(upiMetricsRow?.verified_upi_count || 0),
        confirmedCashCount: Number(metricsRow?.confirmed_cash_received || 0)
      },
      submissions: formatted
    });
  } catch (err) {
    console.error('Admin Cash Payments Controller Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;

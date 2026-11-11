import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db } from './db.js';
import { requireAdminAuth } from './paymentUpload.js';
import {
  JWT_SECRET,
  hashPortalToken,
  decryptPortalUrl,
  issueVendorPortalLink,
  requireVendorAuth,
  cleanPhoneDigits
} from './vendorPortalAuth.js';
import sseHub from './sseHub.js';
import { SIZE_GUIDE_CHARTS } from './utils/uniformGarmentConfig.js';
import { syncWaitingStudentsForVendor } from './vendorRoutes.js';

const router = express.Router();

// In-memory SSE client registry for instant Student & Admin UI updates
const liveStudentStreams = new Map(); // registrationId -> Set(res)
const liveAdminStreams = new Set();   // Set(res)

export const broadcastPaymentUpdate = (payload) => {
  const regKey = String(payload.registrationId);
  const message = `data: ${JSON.stringify(payload)}\n\n`;

  if (liveStudentStreams.has(regKey)) {
    for (const clientRes of liveStudentStreams.get(regKey)) {
      try { clientRes.write(message); } catch {}
    }
  }
  for (const adminRes of liveAdminStreams) {
    try { adminRes.write(message); } catch {}
  }

  // Also broadcast via centralized SSE Hub
  try {
    sseHub.broadcastPaymentLifecycleEvent({
      eventName: payload.type || 'PAYMENT_STATUS_UPDATED',
      registrationId: payload.registrationId,
      vendorId: payload.vendorId,
      payload
    });
    sseHub.broadcast('GLOBAL_SYNC_UPDATE', {
      event: payload.type || 'PAYMENT_STATUS_UPDATED',
      registrationId: payload.registrationId,
      vendorId: payload.vendorId,
      paymentStatus: payload.paymentStatus,
      syncVersion: Date.now()
    });
    sseHub.notifyConfigSubscribers('PAYMENT_STATUS_UPDATED', payload);
    sseHub.notifyConfigSubscribers('PAYMENT_VERIFIED', payload);
  } catch {}
};

// GET /api/payments/live-stream/:registrationId (SSE Stream)
router.get('/payments/live-stream/:registrationId', (req, res) => {
  const regKey = String(req.params.registrationId);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (res.flushHeaders) res.flushHeaders();

  if (!liveStudentStreams.has(regKey)) {
    liveStudentStreams.set(regKey, new Set());
  }
  liveStudentStreams.get(regKey).add(res);

  // Send initial ping
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', registrationId: regKey })}\n\n`);

  req.on('close', () => {
    liveStudentStreams.get(regKey)?.delete(res);
    if (liveStudentStreams.get(regKey)?.size === 0) {
      liveStudentStreams.delete(regKey);
    }
  });
});

// Helper to format submission for frontend
const formatSubmission = (sub) => {
  if (!sub) return null;
  let history = [];
  try {
    history = typeof sub.status_history === 'string' ? JSON.parse(sub.status_history) : (sub.status_history || []);
  } catch {}

  return {
    _id: sub.id,
    id: sub.id,
    registrationId: sub.registration_id,
    studentId: sub.student_id,
    studentName: sub.student_name,
    usn: sub.usn,
    department: sub.department,
    yearSemester: sub.year_semester,
    academicYear: sub.year_semester,
    section: sub.section,
    packageType: sub.package_type,
    paymentModeType: sub.payment_mode_type || (sub.payment_method === 'CASH' ? 'CASH' : 'UPI'),
    paymentMethod: sub.payment_method,
    cashPaymentRefId: sub.cash_payment_ref_id || null,
    actualAmountReceived: sub.actual_amount_received !== null && sub.actual_amount_received !== undefined ? Number(sub.actual_amount_received) : null,
    expectedAmount: Number(sub.expected_amount || 0),
    amount: Number(sub.amount || 0),
    bankVerifiedAmount: sub.bank_verified_amount !== null && sub.bank_verified_amount !== undefined ? Number(sub.bank_verified_amount) : null,
    amountMismatchFlag: Boolean(sub.amount_mismatch_flag),
    amountValidationNotes: sub.amount_validation_notes || '',
    utrNumber: sub.utr_number,
    paymentScreenshot: sub.payment_screenshot,
    paymentStatus: sub.payment_status,
    reconciliationStatus: sub.reconciliation_status,
    adminRemarks: sub.admin_remarks || '',
    rejectionReason: sub.rejection_reason || '',
    vendorId: sub.vendor_id || '',
    vendorName: sub.vendor_name || '',
    vendorAllocationId: sub.vendor_allocation_id || '',
    verifiedByRole: sub.verified_by_role || null,
    verifiedByIdentifier: sub.verified_by_identifier || null,
    verifiedTransactionRef: sub.verified_transaction_ref || '',
    verifiedAt: sub.verified_at || null,
    statusHistory: history,
    createdAt: sub.created_at,
    updatedAt: sub.updated_at
  };
};

// ============================================================================
// PART A: ADMIN PANEL — VENDOR PORTAL ACCESS CONTROLS & OVERRIDES
// ============================================================================

// GET /api/admin/vendors/:vendorId/portal-access
router.get('/admin/vendors/:vendorId/portal-access', requireAdminAuth, async (req, res) => {
  try {
    const { vendorId } = req.params;
    const vendor = db.prepare('SELECT * FROM vendors WHERE vendor_id = ?').get(vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found.' });

    let accessDoc = db.prepare('SELECT * FROM vendor_portal_access WHERE vendor_id = ?').get(vendorId);
    let portalUrl = '';

    // Auto-generate portal link if active vendor does not have one yet
    if (!accessDoc && vendor.status === 'ACTIVE') {
      const issued = await issueVendorPortalLink({
        vendor,
        req,
        adminId: req.adminId,
        isRegeneration: false
      });
      accessDoc = issued.accessDoc;
      portalUrl = issued.portalUrl;
    } else if (accessDoc) {
      portalUrl = decryptPortalUrl(accessDoc.encrypted_portal_url);
    }

    const activityLogs = db.prepare(`
      SELECT * FROM vendor_audit_logs
      WHERE vendor_id = ?
      ORDER BY timestamp DESC
      LIMIT 50
    `).all(vendorId);

    const verificationHistoryRows = db.prepare(`
      SELECT * FROM payment_submissions
      WHERE vendor_id = ? AND verified_by_role IN ('VENDOR', 'COLLEGE_ADMIN', 'SUPER_ADMIN')
      ORDER BY verified_at DESC
      LIMIT 50
    `).all(vendorId);

    const cleanMobile = cleanPhoneDigits(vendor.mobile);
    const first4Digits = cleanMobile.slice(0, 4);

    return res.json({
      success: true,
      portalAccess: {
        vendorName: vendor.vendor_name,
        vendorId: vendor.vendor_id,
        vendorStatus: vendor.status,
        registeredMobile: vendor.mobile,
        firstFourDigitsPinHint: `${first4Digits}••••••`,
        portalLink: portalUrl,
        accessStatus: accessDoc ? accessDoc.access_status : 'NOT_GENERATED',
        allowCsvExport: accessDoc ? Boolean(accessDoc.allow_csv_export) : true,
        linkCreatedAt: accessDoc ? accessDoc.link_created_at : null,
        expiresAt: accessDoc ? accessDoc.expires_at : null,
        lastLoginAt: accessDoc ? accessDoc.last_login_at : null,
        lastActivityAt: accessDoc ? accessDoc.last_activity_at : null
      },
      activityLogs: activityLogs.map((l) => ({
        _id: l.id,
        id: l.id,
        vendorId: l.vendor_id,
        adminId: l.admin_id,
        action: l.action,
        timestamp: l.timestamp,
        newValue: l.new_value
      })),
      verificationHistory: verificationHistoryRows.map(formatSubmission)
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/vendors/:vendorId/portal-access/generate (Generate or Regenerate Link)
router.post('/admin/vendors/:vendorId/portal-access/generate', requireAdminAuth, async (req, res) => {
  try {
    const vendor = db.prepare('SELECT * FROM vendors WHERE vendor_id = ?').get(req.params.vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found.' });

    const existing = db.prepare('SELECT * FROM vendor_portal_access WHERE vendor_id = ?').get(vendor.vendor_id);
    const { portalUrl, accessDoc } = await issueVendorPortalLink({
      vendor,
      req,
      adminId: req.adminId,
      isRegeneration: Boolean(existing)
    });

    return res.json({
      success: true,
      message: existing
        ? 'New Vendor Portal Link regenerated. Previous link and active sessions have been invalidated.'
        : 'Unique Vendor Portal Link generated successfully.',
      portalLink: portalUrl,
      accessStatus: accessDoc.access_status,
      linkCreatedAt: accessDoc.link_created_at
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/vendors/:vendorId/portal-access/revoke (Revoke Link Immediately)
router.patch('/admin/vendors/:vendorId/portal-access/revoke', requireAdminAuth, async (req, res) => {
  try {
    const accessDoc = db.prepare('SELECT * FROM vendor_portal_access WHERE vendor_id = ?').get(req.params.vendorId);
    if (!accessDoc) {
      return res.status(404).json({ success: false, message: 'Portal access record not found.' });
    }

    const nextSession = (accessDoc.session_version || 1) + 1;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE vendor_portal_access
      SET access_status = 'REVOKED',
          session_version = ?,
          updated_at = ?
      WHERE id = ?
    `).run(nextSession, now, accessDoc.id);

    try {
      db.prepare(`
        INSERT INTO vendor_audit_logs (id, vendor_id, admin_id, action, new_value, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        req.params.vendorId,
        req.adminId,
        'PORTAL_ACCESS_REVOKED',
        JSON.stringify({ accessStatus: 'REVOKED', sessionVersion: nextSession }),
        now
      );
    } catch {}

    // Force-disconnect all live vendor SSE streams immediately
    try {
      sseHub.disconnectVendorStreams(
        req.params.vendorId,
        'Your vendor portal access has been revoked by the administrator.'
      );
    } catch {}

    return res.json({
      success: true,
      message: 'Vendor portal link revoked and all active vendor sessions terminated immediately.'
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/payments/submissions/:id/admin-override
router.patch('/admin/payments/submissions/:id/admin-override', requireAdminAuth, async (req, res) => {
  try {
    const { newStatus, overrideReason, verifiedAmount } = req.body;
    const validStatuses = [
      'Submitted',
      'Under Verification',
      'Verified',
      'Rejected',
      'Payment Not Received'
    ];
    if (!validStatuses.includes(newStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid target payment status.' });
    }
    if (!overrideReason || !overrideReason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'A mandatory audit reason is required for an Administrator Payment Status Override.'
      });
    }

    const submission = db.prepare('SELECT * FROM payment_submissions WHERE id = ?').get(req.params.id);
    if (!submission) return res.status(404).json({ success: false, message: 'Submission not found.' });

    const prevStatus = submission.payment_status;
    const now = new Date().toISOString();
    const finalRemarks = `[ADMIN OVERRIDE]: ${overrideReason.trim()}`;
    const rejectionReason = (newStatus === 'Rejected' || newStatus === 'Payment Not Received') ? overrideReason.trim() : '';
    const finalVerifiedAmount = (verifiedAmount !== undefined && Number(verifiedAmount) > 0)
      ? Number(verifiedAmount)
      : (submission.bank_verified_amount || submission.amount);

    let history = [];
    try {
      history = typeof submission.status_history === 'string' ? JSON.parse(submission.status_history) : (submission.status_history || []);
    } catch {}

    history.push({
      previousStatus: prevStatus,
      newStatus,
      changedBy: String(req.adminId),
      changedByName: 'College Administrator',
      userRole: 'COLLEGE_ADMIN',
      verifiedAmount: finalVerifiedAmount,
      remarks: overrideReason.trim(),
      timestamp: now
    });

    db.prepare(`
      UPDATE payment_submissions
      SET payment_status = ?,
          admin_remarks = ?,
          rejection_reason = ?,
          bank_verified_amount = ?,
          verified_by_role = 'COLLEGE_ADMIN',
          verified_by_identifier = ?,
          verified_at = ?,
          status_history = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      newStatus,
      finalRemarks,
      rejectionReason,
      finalVerifiedAmount,
      `College Admin (${req.adminId})`,
      now,
      JSON.stringify(history),
      now,
      submission.id
    );

    // Sync to registrations table
    try {
      db.prepare(`
        UPDATE registrations
        SET payment_status = ?,
            payment_verified = ?
        WHERE id = ? OR registration_id = ?
      `).run(
        newStatus,
        (newStatus === 'Verified' || newStatus === 'Payment Verified') ? 1 : 0,
        submission.registration_id,
        submission.registration_id
      );
    } catch {}

    try {
      db.prepare(`
        INSERT INTO vendor_audit_logs (id, vendor_id, admin_id, action, previous_value, new_value, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        submission.vendor_id || '',
        req.adminId,
        'ADMIN_PAYMENT_STATUS_OVERRIDE',
        JSON.stringify({ paymentStatus: prevStatus }),
        JSON.stringify({
          submissionId: submission.id,
          usn: submission.usn,
          newStatus,
          overrideReason: overrideReason.trim()
        }),
        now
      );
    } catch {}

    // Append permanent, non-deletable entry to Admin Master VendorTransactionHistory
    try {
      db.prepare(`
        INSERT INTO vendor_transaction_history (
          id, submission_id, registration_id, student_name, usn, department, year_semester, section,
          vendor_ref, vendor_id, vendor_name, payment_method, payment_amount, verified_bank_amount,
          actual_amount_received, cash_payment_ref_id, utr_number, payment_screenshot,
          previous_status, payment_status, verified_by_vendor_id, verified_by_vendor_name,
          verifier_role, remarks, action_timestamp, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        submission.id,
        submission.registration_id,
        submission.student_name,
        submission.usn,
        submission.department,
        submission.year_semester,
        submission.section,
        req.vendor?.id || null,
        vendorId,
        req.vendor?.vendor_name || vendorId,
        submission.payment_method,
        Number(submission.amount),
        actualBankAmt,
        submission.payment_method === 'CASH' ? actualBankAmt : null,
        submission.cash_payment_ref_id || null,
        submission.utr_number || null,
        submission.payment_screenshot || null,
        prevStatus,
        targetStatus,
        vendorId,
        `${req.vendor?.vendor_name || vendorId} (${vendorId})`,
        'VENDOR',
        finalRemarks,
        now,
        now
      );
    } catch (e) {
      console.warn('Vendor transaction history insert failed:', e.message);
    }

    // Broadcast instant real-time event to Student Portal & Admin Panel
    broadcastPaymentUpdate({
      type: 'PAYMENT_STATUS_UPDATED',
      registrationId: submission.registration_id,
      submissionId: submission.id,
      usn: submission.usn,
      paymentStatus: targetStatus,
      studentDisplayStatus: (targetStatus === 'Verified' || targetStatus === 'Payment Successful') ? 'Payment Successful' : targetStatus,
      vendorId,
      vendorName: req.vendor?.vendor_name || vendorId,
      verifiedAt: now,
      utrNumber: submission.utr_number,
      amount: actualBankAmt
    });

    const updated = db.prepare('SELECT * FROM payment_submissions WHERE id = ?').get(submission.id);

    return res.json({
      success: true,
      message: `Payment status overridden to "${newStatus}" and synchronized across Vendor, Student, and Admin portals.`,
      submission: formatSubmission(updated)
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// PART B: VENDOR PORTAL AUTHENTICATION (TOKEN + MOBILE + FIRST 4 DIGITS PIN)
// ============================================================================

// GET /api/vendor-portal/verify-link/:rawToken
router.get('/vendor-portal/verify-link/:rawToken', async (req, res) => {
  try {
    const tokenHash = hashPortalToken(req.params.rawToken);
    const accessDoc = db.prepare('SELECT * FROM vendor_portal_access WHERE token_hash = ?').get(tokenHash);

    if (!accessDoc || accessDoc.access_status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: 'This vendor portal link is invalid or has been revoked by the administrator.'
      });
    }

    const vendor = db.prepare('SELECT * FROM vendors WHERE vendor_id = ?').get(accessDoc.vendor_id);
    if (!vendor || vendor.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: 'This vendor account is currently inactive.'
      });
    }

    const cleanMobile = cleanPhoneDigits(vendor.mobile);
    const maskedMobile =
      cleanMobile.length >= 10
        ? `••••••${cleanMobile.slice(-4)}`
        : 'Registered Mobile';

    return res.json({
      success: true,
      vendorSummary: {
        vendorName: vendor.vendor_name,
        vendorId: vendor.vendor_id,
        maskedMobile
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/vendor-portal/login
router.post('/vendor-portal/login', async (req, res) => {
  try {
    const { rawToken, mobileNumber, firstFourDigitsPin } = req.body;
    if (!rawToken || !mobileNumber || !firstFourDigitsPin) {
      return res.status(400).json({
        success: false,
        message: 'Please enter your registered mobile number and the first 4 digits of your registered phone number.'
      });
    }

    const tokenHash = hashPortalToken(rawToken);
    const accessDoc = db.prepare('SELECT * FROM vendor_portal_access WHERE token_hash = ?').get(tokenHash);
    if (!accessDoc || accessDoc.access_status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: 'Portal access link is invalid or revoked.'
      });
    }

    // Brute-force lock check
    if (accessDoc.locked_until && new Date() < new Date(accessDoc.locked_until)) {
      return res.status(429).json({
        success: false,
        message: 'Too many failed authentication attempts. Please try again in 15 minutes.'
      });
    }

    const vendor = db.prepare('SELECT * FROM vendors WHERE vendor_id = ?').get(accessDoc.vendor_id);
    if (!vendor || vendor.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: 'Vendor account is deactivated.'
      });
    }

    const registeredDigits = cleanPhoneDigits(vendor.mobile);
    const enteredDigits = cleanPhoneDigits(mobileNumber);
    const expectedFirstFour = registeredDigits.slice(0, 4);
    const enteredFirstFour = String(firstFourDigitsPin).trim();

    if (enteredDigits !== registeredDigits || enteredFirstFour !== expectedFirstFour) {
      const nextFailed = (accessDoc.failed_login_attempts || 0) + 1;
      let lockedUntil = null;
      if (nextFailed >= 5) {
        lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }

      db.prepare(`
        UPDATE vendor_portal_access
        SET failed_login_attempts = ?,
            locked_until = ?,
            updated_at = ?
        WHERE id = ?
      `).run(nextFailed, lockedUntil, new Date().toISOString(), accessDoc.id);

      try {
        db.prepare(`
          INSERT INTO vendor_audit_logs (id, vendor_id, action, new_value, timestamp)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          crypto.randomUUID(),
          vendor.vendor_id,
          'VENDOR_LOGIN_FAILED',
          JSON.stringify({
            enteredMobile: mobileNumber,
            failedAttempts: nextFailed
          }),
          new Date().toISOString()
        );
      } catch {}

      return res.status(401).json({
        success: false,
        message: 'Authentication failed: Mobile number or first 4 digits passcode did not match the registered vendor number.'
      });
    }

    // Reset failed attempts & record login
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE vendor_portal_access
      SET failed_login_attempts = 0,
          locked_until = NULL,
          last_login_at = ?,
          last_activity_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(now, now, now, accessDoc.id);

    const sessionToken = jwt.sign(
      {
        role: 'VENDOR',
        vendorId: vendor.vendor_id,
        vendorName: vendor.vendor_name,
        sessionVersion: accessDoc.session_version
      },
      JWT_SECRET,
      { expiresIn: '365d' }
    );

    try {
      db.prepare(`
        INSERT INTO vendor_audit_logs (id, vendor_id, action, new_value, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        vendor.vendor_id,
        'VENDOR_LOGIN_SUCCESS',
        JSON.stringify({ loginAt: now }),
        now
      );
    } catch {}

    return res.json({
      success: true,
      message: `Welcome, ${vendor.vendor_name}`,
      token: sessionToken,
      vendor: {
        vendorId: vendor.vendor_id,
        vendorName: vendor.vendor_name,
        contactPerson: vendor.contact_person,
        status: vendor.status,
        allowCsvExport: Boolean(accessDoc.allow_csv_export)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// PART C: AUTHENTICATED VENDOR PORTAL ENDPOINTS (STRICT OWNERSHIP ISOLATION)
// ============================================================================

// GET /api/vendor-portal/dashboard
router.get('/vendor-portal/dashboard', requireVendorAuth, async (req, res) => {
  try {
    const vendorId = req.vendorId;
    try { syncWaitingStudentsForVendor(vendorId); } catch (_) {}

    const assignedStudents = db.prepare('SELECT * FROM student_vendor_assignments WHERE vendor_id = ?').all(vendorId);
    const allocations = db.prepare("SELECT * FROM vendor_allocations WHERE vendor_id = ? AND status = 'ACTIVE'").all(vendorId);

    const totalPaymentsSubmittedRow = db.prepare(`
      SELECT COUNT(*) as cnt FROM payment_submissions
      WHERE vendor_id = ? OR usn IN (SELECT usn FROM student_vendor_assignments WHERE vendor_id = ?)
    `).get(vendorId, vendorId);
    const totalPaymentsSubmitted = totalPaymentsSubmittedRow?.cnt || 0;

    const totalPaymentsVerifiedRow = db.prepare(`
      SELECT COUNT(*) as cnt FROM payment_submissions
      WHERE (vendor_id = ? OR usn IN (SELECT usn FROM student_vendor_assignments WHERE vendor_id = ?))
        AND payment_status IN ('Verified', 'Payment Verified')
    `).get(vendorId, vendorId);
    const totalPaymentsVerified = totalPaymentsVerifiedRow?.cnt || 0;

    const totalPaymentsPendingRow = db.prepare(`
      SELECT COUNT(*) as cnt FROM payment_submissions
      WHERE (vendor_id = ? OR usn IN (SELECT usn FROM student_vendor_assignments WHERE vendor_id = ?))
        AND payment_status IN ('Submitted', 'Payment Submitted', 'Under Verification')
    `).get(vendorId, vendorId);
    const totalPaymentsPending = totalPaymentsPendingRow?.cnt || 0;

    const totalPaymentsRejectedRow = db.prepare(`
      SELECT COUNT(*) as cnt FROM payment_submissions
      WHERE (vendor_id = ? OR usn IN (SELECT usn FROM student_vendor_assignments WHERE vendor_id = ?))
        AND payment_status IN ('Rejected', 'Payment Rejected')
    `).get(vendorId, vendorId);
    const totalPaymentsRejected = totalPaymentsRejectedRow?.cnt || 0;

    const totalPaymentNotReceivedRow = db.prepare(`
      SELECT COUNT(*) as cnt FROM payment_submissions
      WHERE (vendor_id = ? OR usn IN (SELECT usn FROM student_vendor_assignments WHERE vendor_id = ?))
        AND payment_status = 'Payment Not Received'
    `).get(vendorId, vendorId);
    const totalPaymentNotReceived = totalPaymentNotReceivedRow?.cnt || 0;

    const verifiedAmountAgg = db.prepare(`
      SELECT SUM(COALESCE(bank_verified_amount, amount)) as total FROM payment_submissions
      WHERE (vendor_id = ? OR usn IN (SELECT usn FROM student_vendor_assignments WHERE vendor_id = ?))
        AND payment_status IN ('Verified', 'Payment Verified')
    `).get(vendorId, vendorId);

    const pendingAmountAgg = db.prepare(`
      SELECT SUM(amount) as total FROM payment_submissions
      WHERE (vendor_id = ? OR usn IN (SELECT usn FROM student_vendor_assignments WHERE vendor_id = ?))
        AND payment_status IN ('Submitted', 'Payment Submitted', 'Under Verification')
    `).get(vendorId, vendorId);

    // Check how many assigned students have submitted their uniform sizes
    let studentsWithSizesCount = 0;
    if (assignedStudents.length > 0) {
      const regIds = assignedStudents.map((s) => s.registration_id).filter(Boolean);
      const usns = assignedStudents.map((s) => s.usn).filter(Boolean);
      const regPlaceholders = regIds.map(() => '?').join(',');
      const usnPlaceholders = usns.map(() => '?').join(',');
      const sizesCountRow = db.prepare(`
        SELECT COUNT(DISTINCT usn) as cnt FROM registrations
        WHERE (registration_id IN (${regPlaceholders}) OR id IN (${regPlaceholders}) OR usn IN (${usnPlaceholders}))
          AND (shirt_size IS NOT NULL AND shirt_size != '')
      `).get(...regIds, ...regIds, ...usns);
      studentsWithSizesCount = sizesCountRow?.cnt || 0;
    }

    return res.json({
      success: true,
      vendor: {
        vendorName: req.vendor.vendor_name,
        vendorId: req.vendor.vendor_id,
        status: req.vendor.status,
        allowCsvExport: Boolean(req.vendorPortalAccess.allow_csv_export)
      },
      stats: {
        totalRegisteredStudents: assignedStudents.length,
        totalStudentsSubmittedSizes: studentsWithSizesCount,
        totalPaymentsSubmitted,
        totalPaymentsVerified,
        totalPaymentsPending,
        totalPaymentsRejected: totalPaymentsRejected + totalPaymentNotReceived,
        totalPaymentNotReceived,
        totalUniformOrders: totalPaymentsVerified,
        totalAmountReceived: Number(verifiedAmountAgg?.total || 0),
        totalPendingAmount: Number(pendingAmountAgg?.total || 0)
      },
      allocations: allocations.map((a) => ({
        allocationId: a.allocation_id,
        educationLevel: a.education_level,
        course: a.course,
        department: a.department,
        academicYear: a.academic_year,
        semester: a.semester,
        section: a.section,
        gender: a.gender
      }))
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/vendor-portal/students (Assigned Students with Shirt/Trouser Sizes & Filters)
router.get('/vendor-portal/students', requireVendorAuth, async (req, res) => {
  try {
    const vendorId = req.vendorId;
    try { syncWaitingStudentsForVendor(vendorId); } catch (_) {}
    const {
      search,
      department,
      academicYear,
      section,
      paymentStatus,
      startDate,
      endDate
    } = req.query;

    let sql = 'SELECT * FROM student_vendor_assignments WHERE vendor_id = ?';
    const params = [vendorId];

    if (department && department !== 'ALL') {
      sql += ' AND UPPER(department) = ?';
      params.push(department.toUpperCase());
    }
    if (academicYear && academicYear !== 'ALL') {
      const cleanYear = String(academicYear).trim();
      const numOnly = cleanYear.replace(/\s*year$/i, '').trim();
      sql += ' AND (academic_year = ? OR academic_year = ?)';
      params.push(cleanYear, numOnly);
    }
    if (section && section !== 'ALL') {
      const cleanSec = String(section).replace(/^section\s+/i, '').trim().toUpperCase();
      sql += ' AND (UPPER(section) = ? OR UPPER(section) = ?)';
      params.push(cleanSec, `SECTION ${cleanSec}`);
    }
    if (startDate) {
      sql += ' AND assigned_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND assigned_at <= ?';
      params.push(endDate + 'T23:59:59.999Z');
    }

    sql += ' ORDER BY assigned_at DESC';

    const assignments = db.prepare(sql).all(...params);
    const regIds = assignments.map((a) => a.registration_id).filter(Boolean);
    const usns = assignments.map((a) => a.usn).filter(Boolean);

    let regMap = {};
    let payMap = {};

    if (assignments.length > 0) {
      const regPlaceholders = regIds.map(() => '?').join(',');
      const usnPlaceholders = usns.map(() => '?').join(',');

      const regRows = db.prepare(`
        SELECT * FROM registrations
        WHERE id IN (${regPlaceholders})
           OR registration_id IN (${regPlaceholders})
           OR usn IN (${usnPlaceholders})
      `).all(...regIds, ...regIds, ...usns);

      regRows.forEach((r) => {
        if (r.id) regMap[r.id] = r;
        if (r.registration_id) regMap[r.registration_id] = r;
        if (r.usn) regMap[r.usn] = r;
      });

      const payRows = db.prepare(`
        SELECT * FROM payment_submissions
        WHERE (vendor_id = ? OR vendor_id IS NULL OR usn IN (${usnPlaceholders}))
          AND (registration_id IN (${regPlaceholders}) OR usn IN (${usnPlaceholders}))
        ORDER BY created_at DESC
      `).all(vendorId, ...usns, ...regIds, ...usns);

      payRows.forEach((p) => {
        if (p.registration_id && !payMap[p.registration_id]) payMap[p.registration_id] = p;
        if (p.usn && !payMap[p.usn]) payMap[p.usn] = p;
      });
    }

    const vPaymentCfg = db.prepare('SELECT payment_amount FROM vendor_payment_configurations WHERE vendor_id = ?').get(vendorId);
    const vendorConfiguredAmount = vPaymentCfg?.payment_amount ? Number(vPaymentCfg.payment_amount) : 0;

    let rows = assignments.map((a) => {
      const reg = regMap[a.registration_id] || regMap[a.student_id] || regMap[a.usn] || {};
      const pay = payMap[a.registration_id] || payMap[a.usn] || null;

      let normalizedStatus = pay ? pay.payment_status : (reg.payment_status || 'Not Paid');
      if (normalizedStatus === 'Payment Submitted') normalizedStatus = 'Submitted';
      if (normalizedStatus === 'Payment Verified') normalizedStatus = 'Verified';
      if (normalizedStatus === 'Payment Rejected') normalizedStatus = 'Rejected';

      return {
        registrationId: a.registration_id,
        studentName: a.student_name || reg.full_name || 'Student',
        usn: a.usn || reg.usn,
        course: a.course || reg.course || 'B.E.',
        gender: reg.gender || a.gender || null,
        department: a.department || reg.department,
        academicYear: a.academic_year || reg.academic_year,
        semester: a.semester || reg.semester || 'ALL',
        section: a.section || reg.section,
        shirtSize: reg.shirt_size || 'M',
        trouserSize: reg.trouser_size || '32',
        blazerSize: reg.blazer_size || null,
        uniform_measurements: reg.uniform_measurements || null,
        paymentAmount: pay ? Number(pay.amount) : vendorConfiguredAmount,
        paymentStatus: normalizedStatus,
        registrationDate: reg.created_at || a.assigned_at
      };
    });

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.studentName || '').toLowerCase().includes(q) ||
          (r.usn || '').toLowerCase().includes(q) ||
          String(r.registrationId).toLowerCase().includes(q)
      );
    }

    if (paymentStatus && paymentStatus !== 'ALL') {
      rows = rows.filter((r) => r.paymentStatus === paymentStatus);
    }

    return res.json({ success: true, students: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/vendor-portal/export-measurements
// Dedicated endpoint for vendor to download all assigned student tailor measurements
router.get('/vendor-portal/export-measurements', requireVendorAuth, async (req, res) => {
  try {
    const vendorId = req.vendorId;
    try { syncWaitingStudentsForVendor(vendorId); } catch (_) {}

    const assignments = db.prepare('SELECT * FROM student_vendor_assignments WHERE vendor_id = ? ORDER BY assigned_at DESC').all(vendorId);
    const regIds = assignments.map((a) => a.registration_id).filter(Boolean);
    const usns = assignments.map((a) => a.usn).filter(Boolean);

    let regMap = {};
    if (assignments.length > 0) {
      const regPlaceholders = regIds.map(() => '?').join(',');
      const usnPlaceholders = usns.map(() => '?').join(',');

      const regRows = db.prepare(`
        SELECT * FROM registrations
        WHERE id IN (${regPlaceholders})
           OR registration_id IN (${regPlaceholders})
           OR usn IN (${usnPlaceholders})
      `).all(...regIds, ...regIds, ...usns);

      regRows.forEach((r) => {
        if (r.id) regMap[r.id] = r;
        if (r.registration_id) regMap[r.registration_id] = r;
        if (r.usn) regMap[r.usn] = r;
      });
    }

    const students = assignments.map((a) => {
      const reg = regMap[a.registration_id] || regMap[a.student_id] || regMap[a.usn] || {};
      return {
        id: a.id,
        studentId: a.student_id,
        registrationId: a.registration_id,
        usn: a.usn,
        studentName: a.student_name,
        gender: a.gender || reg.gender || 'Male',
        educationLevel: a.education_level,
        course: a.course,
        department: a.department,
        academicYear: a.academic_year,
        semester: a.semester,
        section: a.section,
        shirtSize: reg.shirt_size || 'M',
        trouserSize: reg.trouser_size || '32',
        blazerSize: reg.blazer_size || null,
        uniform_measurements: reg.uniform_measurements || null,
        paymentStatus: reg.payment_status || 'Not Paid',
        registrationDate: reg.created_at || a.assigned_at
      };
    });

    return res.json({ success: true, count: students.length, students });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/vendor-portal/payments (Payment Verification Center & Date-Filtered Payment Logs)
router.get('/vendor-portal/payments', requireVendorAuth, async (req, res) => {
  try {
    const vendorId = req.vendorId;
    try { syncWaitingStudentsForVendor(vendorId); } catch (_) {}
    const {
      search,
      department,
      academicYear,
      section,
      paymentStatus,
      datePreset,
      startDate,
      endDate
    } = req.query;

    let sql = `
      SELECT * FROM payment_submissions
      WHERE (
        vendor_id = ?
        OR usn IN (SELECT usn FROM student_vendor_assignments WHERE vendor_id = ?)
        OR registration_id IN (SELECT registration_id FROM student_vendor_assignments WHERE vendor_id = ?)
      )
    `;
    const params = [vendorId, vendorId, vendorId];

    if (department && department !== 'ALL') {
      sql += ' AND UPPER(department) = ?';
      params.push(department.toUpperCase());
    }
    if (academicYear && academicYear !== 'ALL') {
      sql += ' AND year_semester = ?';
      params.push(academicYear);
    }
    if (section && section !== 'ALL') {
      sql += ' AND UPPER(section) = ?';
      params.push(section.toUpperCase());
    }

    if (paymentStatus && paymentStatus !== 'ALL') {
      if (paymentStatus === 'Submitted') {
        sql += " AND payment_status IN ('Submitted', 'Payment Submitted')";
      } else if (paymentStatus === 'Verified') {
        sql += " AND payment_status IN ('Verified', 'Payment Verified')";
      } else if (paymentStatus === 'Rejected') {
        sql += " AND payment_status IN ('Rejected', 'Payment Rejected')";
      } else {
        sql += ' AND payment_status = ?';
        params.push(paymentStatus);
      }
    }

    const now = new Date();
    if (datePreset === 'TODAY') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      sql += ' AND created_at >= ?';
      params.push(start);
    } else if (datePreset === 'YESTERDAY') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999).toISOString();
      sql += ' AND created_at >= ? AND created_at <= ?';
      params.push(start, end);
    } else if (datePreset === 'LAST_7_DAYS') {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      sql += ' AND created_at >= ?';
      params.push(start);
    } else if (datePreset === 'LAST_30_DAYS') {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      sql += ' AND created_at >= ?';
      params.push(start);
    } else if (startDate || endDate) {
      if (startDate) {
        sql += ' AND created_at >= ?';
        params.push(startDate);
      }
      if (endDate) {
        sql += ' AND created_at <= ?';
        params.push(endDate + 'T23:59:59.999Z');
      }
    }

    if (search && search.trim()) {
      sql += ' AND (LOWER(student_name) LIKE ? OR LOWER(usn) LIKE ? OR LOWER(utr_number) LIKE ?)';
      const s = `%${search.trim().toLowerCase()}%`;
      params.push(s, s, s);
    }

    sql += ' ORDER BY created_at DESC';

    const payments = db.prepare(sql).all(...params);
    return res.json({ success: true, payments: payments.map(formatSubmission) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/vendor-portal/payments/:submissionId/status
router.patch('/vendor-portal/payments/:submissionId/status', requireVendorAuth, async (req, res) => {
  try {
    const vendorId = req.vendorId;
    try { syncWaitingStudentsForVendor(vendorId); } catch (_) {}
    const {
      targetStatus,
      verifiedAmount,
      transactionRef,
      remarks,
      bankCreditConfirmed
    } = req.body;

    const allowedStatuses = [
      'Verified',
      'Payment Successful',
      'Under Verification',
      'Payment Not Received',
      'Rejected'
    ];
    if (!allowedStatuses.includes(targetStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment status action.'
      });
    }

    // Strict ownership lookup: submission MUST belong to req.vendorId
    const submission = db.prepare('SELECT * FROM payment_submissions WHERE id = ? AND vendor_id = ?').get(
      req.params.submissionId,
      vendorId
    );

    if (!submission) {
      try {
        db.prepare(`
          INSERT INTO vendor_audit_logs (id, vendor_id, action, new_value, timestamp)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          crypto.randomUUID(),
          vendorId,
          'UNAUTHORIZED_VENDOR_ACCESS_BLOCKED',
          JSON.stringify({ attemptedSubmissionId: req.params.submissionId }),
          new Date().toISOString()
        );
      } catch {}

      return res.status(403).json({
        success: false,
        message: 'Access Denied: This payment submission does not belong to your assigned students.'
      });
    }

    let actualBankAmt = submission.bank_verified_amount || submission.amount;

    if (targetStatus === 'Verified') {
      if (!bankCreditConfirmed) {
        return res.status(400).json({
          success: false,
          message: submission.payment_method === 'CASH'
            ? 'Please confirm that you have physically collected the cash at the uniform counter.'
            : 'Please confirm that you have verified the actual incoming credit in your designated bank account.'
        });
      }

      actualBankAmt =
        verifiedAmount !== undefined && verifiedAmount !== ''
          ? Number(verifiedAmount)
          : Number(submission.amount);

      if (isNaN(actualBankAmt) || actualBankAmt <= 0) {
        return res.status(400).json({
          success: false,
          message: submission.payment_method === 'CASH'
            ? 'Please enter a valid cash amount collected.'
            : 'Please enter a valid verified bank credit amount.'
        });
      }

      // Flag if actual bank credit does not match expected amount
      if (actualBankAmt !== Number(submission.expected_amount)) {
        const notes = submission.payment_method === 'CASH'
          ? `Vendor reported counter cash ₹${actualBankAmt} vs Expected ₹${submission.expected_amount}. Flagged for review.`
          : `Vendor reported bank credit ₹${actualBankAmt} vs Expected ₹${submission.expected_amount}. Flagged for review.`;
        db.prepare(`
          UPDATE payment_submissions
          SET amount_mismatch_flag = 1,
              amount_validation_notes = ?,
              bank_verified_amount = ?,
              actual_amount_received = ?,
              payment_status = 'Under Verification',
              updated_at = ?
          WHERE id = ?
        `).run(notes, actualBankAmt, actualBankAmt, new Date().toISOString(), submission.id);

        return res.status(400).json({
          success: false,
          mismatchFlagged: true,
          message: `Amount Mismatch Detected: Expected ₹${submission.expected_amount}, but entered ₹${actualBankAmt}. Transaction has been flagged for review and cannot be marked as Verified.`
        });
      }
    }

    if (
      (targetStatus === 'Rejected' || targetStatus === 'Payment Not Received') &&
      (!remarks || !remarks.trim())
    ) {
      return res.status(400).json({
        success: false,
        message: 'Please provide verification remarks explaining why the payment was marked as Rejected / Not Received.'
      });
    }

    const prevStatus = submission.payment_status;
    const now = new Date().toISOString();
    const finalRemarks = remarks ? remarks.trim() : (submission.admin_remarks || '');
    const rejectionReason = (targetStatus === 'Rejected' || targetStatus === 'Payment Not Received') ? finalRemarks : '';
    const txRef = transactionRef ? String(transactionRef).trim() : (submission.verified_transaction_ref || '');

    let history = [];
    try {
      history = typeof submission.status_history === 'string' ? JSON.parse(submission.status_history) : (submission.status_history || []);
    } catch {}

    history.push({
      previousStatus: prevStatus,
      newStatus: targetStatus,
      changedBy: vendorId,
      changedByName: req.vendor.vendor_name,
      userRole: 'VENDOR',
      verifiedAmount: actualBankAmt,
      remarks: finalRemarks,
      timestamp: now
    });

    db.prepare(`
      UPDATE payment_submissions
      SET payment_status = ?,
          admin_remarks = ?,
          rejection_reason = ?,
          verified_transaction_ref = ?,
          bank_verified_amount = ?,
          actual_amount_received = ?,
          amount_mismatch_flag = ?,
          verified_by_role = 'VENDOR',
          verified_by_identifier = ?,
          verified_at = ?,
          status_history = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      targetStatus,
      finalRemarks,
      rejectionReason,
      txRef,
      actualBankAmt,
      actualBankAmt,
      0,
      `${req.vendor.vendor_name} (${vendorId})`,
      now,
      JSON.stringify(history),
      now,
      submission.id
    );

    // Immediately synchronize with Student Registration record
    try {
      const isSuccessful = targetStatus === 'Verified' || targetStatus === 'Payment Successful';
      db.prepare(`
        UPDATE registrations
        SET payment_status = ?,
            payment_verified = ?
        WHERE id = ? OR registration_id = ?
      `).run(
        isSuccessful ? 'Payment Verified' : targetStatus,
        isSuccessful ? 1 : 0,
        submission.registration_id,
        submission.registration_id
      );
    } catch {}

    // Lock student-vendor assignment by payment
    if (targetStatus === 'Verified' || targetStatus === 'Payment Successful') {
      try {
        db.prepare(`
          UPDATE student_vendor_assignments
          SET has_paid_or_submitted = 1, assignment_status = 'LOCKED_BY_PAYMENT', updated_at = ?
          WHERE registration_id = ?
        `).run(now, submission.registration_id);
      } catch {}
    }

    // Immediately synchronize with Student Tracking Record
    try {
      const isSuccessful = targetStatus === 'Verified' || targetStatus === 'Payment Successful';
      const isRejected = targetStatus === 'Rejected' || targetStatus === 'Payment Not Received' || targetStatus === 'Payment Rejected';
      const finalDbStatus = isSuccessful ? 'Payment Successful' : isRejected ? 'Payment Rejected' : targetStatus;

      db.prepare(`
        UPDATE student_tracking_records
        SET payment_status = ?,
            is_payment_locked = ?,
            updated_at = ?
        WHERE registration_id = ? OR usn = ?
      `).run(
        finalDbStatus,
        isSuccessful ? 1 : 0,
        now,
        submission.registration_id,
        submission.usn
      );
    } catch {}

    try {
      db.prepare(`
        INSERT INTO vendor_audit_logs (id, vendor_id, action, previous_value, new_value, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        vendorId,
        'VENDOR_PAYMENT_STATUS_UPDATED',
        JSON.stringify({ paymentStatus: prevStatus }),
        JSON.stringify({
          submissionId: submission.id,
          usn: submission.usn,
          utrNumber: submission.utr_number,
          newStatus: targetStatus,
          verifiedAmount: actualBankAmt,
          remarks: finalRemarks
        }),
        now
      );
    } catch {}

    // Append permanent, non-deletable entry to Admin Master VendorTransactionHistory
    try {
      db.prepare(`
        INSERT INTO vendor_transaction_history (
          id, submission_id, registration_id, student_name, usn, department, year_semester, section,
          vendor_ref, vendor_id, vendor_name, payment_method, payment_amount, verified_bank_amount,
          actual_amount_received, cash_payment_ref_id, utr_number, payment_screenshot,
          previous_status, payment_status, verified_by_vendor_id, verified_by_vendor_name,
          verifier_role, remarks, action_timestamp, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        submission.id,
        submission.registration_id,
        submission.student_name,
        submission.usn,
        submission.department,
        submission.year_semester,
        submission.section,
        req.vendor?.id || null,
        vendorId,
        req.vendor?.vendor_name || vendorId,
        submission.payment_method,
        Number(submission.amount),
        actualBankAmt,
        submission.payment_method === 'CASH' ? actualBankAmt : null,
        submission.cash_payment_ref_id || null,
        submission.utr_number || null,
        submission.payment_screenshot || null,
        prevStatus,
        targetStatus,
        vendorId,
        `${req.vendor?.vendor_name || vendorId} (${vendorId})`,
        'VENDOR',
        finalRemarks,
        now,
        now
      );
    } catch (e) {
      console.warn('Vendor transaction history insert failed:', e.message);
    }

    // Broadcast instant real-time event to Student Portal & Admin Panel
    broadcastPaymentUpdate({
      type: 'PAYMENT_STATUS_UPDATED',
      registrationId: submission.registration_id,
      submissionId: submission.id,
      usn: submission.usn,
      paymentStatus: targetStatus,
      studentDisplayStatus: (targetStatus === 'Verified' || targetStatus === 'Payment Successful') ? 'Payment Successful' : targetStatus,
      vendorId,
      vendorName: req.vendor?.vendor_name || vendorId,
      verifiedAt: now,
      utrNumber: submission.utr_number,
      amount: actualBankAmt
    });

    const updated = db.prepare('SELECT * FROM payment_submissions WHERE id = ?').get(submission.id);

    return res.json({
      success: true,
      message: `Payment status for USN ${submission.usn} updated to "${targetStatus}". Student Portal and Admin Panel synchronized immediately.`,
      submission: formatSubmission(updated)
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/vendor-portal/measurements/download (Direct CSV Export of All Student Measurements)
router.get('/vendor-portal/measurements/download', requireVendorAuth, async (req, res) => {
  try {
    const vendorId = req.vendorId;
    try { syncWaitingStudentsForVendor(vendorId); } catch (_) {}
    if (req.vendorPortalAccess.allow_csv_export === 0) {
      return res.status(403).json({ success: false, message: 'CSV export permission has been disabled by the administrator.' });
    }

    const assignments = db.prepare('SELECT * FROM student_vendor_assignments WHERE vendor_id = ? ORDER BY assigned_at DESC').all(vendorId);
    const regIds = assignments.map(a => a.registration_id).filter(Boolean);
    const usns = assignments.map(a => a.usn).filter(Boolean);

    let regMap = {};
    let payMap = {};

    if (assignments.length > 0) {
      const regPlaceholders = regIds.map(() => '?').join(',');
      const usnPlaceholders = usns.map(() => '?').join(',');

      const regRows = db.prepare(`
        SELECT * FROM registrations
        WHERE id IN (${regPlaceholders})
           OR registration_id IN (${regPlaceholders})
           OR usn IN (${usnPlaceholders})
      `).all(...regIds, ...regIds, ...usns);

      regRows.forEach((r) => {
        if (r.id) regMap[r.id] = r;
        if (r.registration_id) regMap[r.registration_id] = r;
        if (r.usn) regMap[r.usn] = r;
      });

      const payRows = db.prepare(`
        SELECT * FROM payment_submissions
        WHERE (vendor_id = ? OR vendor_id IS NULL OR usn IN (${usnPlaceholders}))
          AND (registration_id IN (${regPlaceholders}) OR usn IN (${usnPlaceholders}))
        ORDER BY created_at DESC
      `).all(vendorId, ...usns, ...regIds, ...usns);

      payRows.forEach((p) => {
        if (p.registration_id && !payMap[p.registration_id]) payMap[p.registration_id] = p;
        if (p.usn && !payMap[p.usn]) payMap[p.usn] = p;
      });
    }

    const headers = [
      'Student Name', 'USN', 'Registration ID', 'Gender', 'Course', 'Department',
      'Academic Year', 'Semester', 'Section', 'Sizing Spec Type',
      'Shirt/Top Size', 'Chest / Bust (in)', 'Shoulder (in)', 'Sleeve Length (in)', 'Collar (in)', 'Shirt/Top Length (in)',
      'Trouser/Pant Size', 'Waist (in)', 'Hip (in)', 'Pant Length (in)', 'Inseam (in)',
      'Blazer/Coat Size', 'Coat Chest (in)', 'Coat Shoulder (in)', 'Coat Sleeve (in)', 'Coat Length (in)', 'Coat Waist (in)',
      'Special Tailor Remarks', 'Payment Status', 'Registration Date'
    ];

    const escapeCell = (val) => {
      let str = String(val ?? '').replace(/"/g, '""');
      if (/^[=\+\-@\t\r]/.test(str)) str = `'${str}`;
      return `"${str}"`;
    };

    const cleanSize = (sz) => String(sz || '').replace(/"/g, '').trim().toUpperCase();

    const rows = assignments.map(a => {
      const reg = regMap[a.registration_id] || regMap[a.student_id] || regMap[a.usn] || {};
      const pay = payMap[a.registration_id] || payMap[a.usn] || null;

      let mObj = null;
      if (reg.uniform_measurements) {
        if (typeof reg.uniform_measurements === 'string') {
          try { mObj = JSON.parse(reg.uniform_measurements); } catch (_) {}
        } else if (typeof reg.uniform_measurements === 'object') {
          mObj = reg.uniform_measurements;
        }
      }

      const isFemale = String(reg.gender || a.gender || '').toUpperCase().startsWith('F');
      const shirtChart = isFemale ? SIZE_GUIDE_CHARTS.ALPHA_FEMALE_TOP : SIZE_GUIDE_CHARTS.ALPHA_MALE_SHIRT;
      const pantChart = SIZE_GUIDE_CHARTS.WAIST_BOTTOM;
      const coatChart = SIZE_GUIDE_CHARTS.ALPHA_COAT;

      const shirtStd = shirtChart?.find(r => cleanSize(r.size) === cleanSize(reg.shirt_size || 'M')) || {};
      const pantStd = pantChart?.find(r => cleanSize(r.size) === cleanSize(reg.trouser_size || '32')) || {};
      const coatStd = coatChart?.find(r => cleanSize(r.size) === cleanSize(reg.blazer_size || 'M')) || {};

      const shirtCustom = mObj?.shirt?.measurements || mObj?.top?.measurements || {};
      const pantCustom = mObj?.pant?.measurements || mObj?.trouser?.measurements || mObj?.bottom?.measurements || {};
      const coatCustom = mObj?.coat?.measurements || mObj?.blazer?.measurements || {};

      const hasCustom = Object.keys(shirtCustom).length > 0 || Object.keys(pantCustom).length > 0 || Object.keys(coatCustom).length > 0;

      let paymentStatus = pay ? pay.payment_status : (reg.payment_status || 'Not Paid');
      if (paymentStatus === 'Payment Submitted') paymentStatus = 'Submitted';
      if (paymentStatus === 'Payment Verified') paymentStatus = 'Verified';
      if (paymentStatus === 'Payment Rejected') paymentStatus = 'Rejected';

      return [
        a.student_name || reg.full_name || 'Student',
        a.usn || reg.usn,
        a.registration_id,
        reg.gender || a.gender || 'Male',
        a.course || reg.course || 'B.E.',
        a.department || reg.department,
        a.academic_year || reg.academic_year,
        a.semester || reg.semester || 'ALL',
        a.section || reg.section,
        hasCustom ? 'Custom Tailor Measurements' : 'Standard Sizing Guide Spec',
        reg.shirt_size || 'M',
        shirtCustom.chest || shirtCustom.bust || shirtStd.chest || shirtStd.bust || '',
        shirtCustom.shoulder || shirtStd.shoulder || '',
        shirtCustom.sleeveLength || shirtStd.sleeve || '',
        shirtCustom.collar || shirtStd.collar || '',
        shirtCustom.shirtLength || shirtCustom.topLength || shirtStd.length || '',
        reg.trouser_size || '32',
        pantCustom.waist || pantStd.waist || '',
        pantCustom.hip || pantStd.hip || '',
        pantCustom.pantLength || pantCustom.bottomLength || pantStd.length || '',
        pantCustom.inseam || pantStd.inseam || '',
        reg.blazer_size || (a.department === 'MBA' || a.department === 'MCA' ? 'M' : 'N/A'),
        coatCustom.chest || coatCustom.chestOrBust || coatStd.chestOrBust || '',
        coatCustom.shoulder || coatStd.shoulder || '',
        coatCustom.sleeveLength || coatStd.sleeve || '',
        coatCustom.coatLength || coatStd.length || '',
        coatCustom.waist || coatStd.waist || '',
        mObj?.remarks || reg.remarks || '',
        paymentStatus,
        reg.created_at ? new Date(reg.created_at).toISOString().slice(0, 10) : ''
      ];
    });

    const csvContent = '\uFEFF' + [
      headers.map(escapeCell).join(','),
      ...rows.map(r => r.map(escapeCell).join(','))
    ].join('\n');

    try {
      db.prepare(`
        INSERT INTO vendor_audit_logs (id, vendor_id, action, new_value, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        vendorId,
        'VENDOR_MEASUREMENTS_EXPORTED',
        JSON.stringify({ rowCount: rows.length, downloadedAt: new Date().toISOString() }),
        new Date().toISOString()
      );
    } catch (_) {}

    const filename = `${vendorId}_All_Student_Measurements_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csvContent);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/vendor-portal/audit-export (Log Report Download)
router.post('/vendor-portal/audit-export', requireVendorAuth, async (req, res) => {
  try {
    db.prepare(`
      INSERT INTO vendor_audit_logs (id, vendor_id, action, new_value, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      req.vendorId,
      'VENDOR_REPORT_DOWNLOADED',
      JSON.stringify({ reportType: req.body?.reportType || 'CSV_EXPORT', downloadedAt: new Date().toISOString() }),
      new Date().toISOString()
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false });
  }
});

// ============================================================================
// PART D: ADMIN VENDOR-WISE SUMMARY, MASTER TRANSACTION HISTORY & DRILL-DOWN
// ============================================================================

// GET /api/admin/vendors/payment-summary
// Requirement 5: Vendor-Wise Summary (Total vendors, students per vendor, successful, rejected, pending, collected amount)
router.get('/admin/vendors/payment-summary', requireAdminAuth, async (req, res) => {
  try {
    const vendors = db.prepare('SELECT * FROM vendors ORDER BY created_at DESC').all();

    const studentCounts = db.prepare(`
      SELECT vendor_id, COUNT(*) as cnt 
      FROM student_vendor_assignments 
      GROUP BY vendor_id
    `).all();
    const studentMap = {};
    studentCounts.forEach((r) => {
      studentMap[r.vendor_id] = r.cnt;
    });

    const payStats = db.prepare(`
      SELECT 
        vendor_id,
        COUNT(*) as totalSubmissions,
        SUM(CASE WHEN payment_status IN ('Payment Successful', 'Verified', 'Payment Verified') THEN 1 ELSE 0 END) as successfulPayments,
        SUM(CASE WHEN payment_status IN ('Rejected', 'Payment Rejected', 'Payment Not Received') THEN 1 ELSE 0 END) as rejectedPayments,
        SUM(CASE WHEN payment_status IN ('Submitted', 'Payment Submitted', 'Under Verification') THEN 1 ELSE 0 END) as pendingPayments,
        SUM(CASE WHEN payment_status IN ('Payment Successful', 'Verified', 'Payment Verified') THEN COALESCE(bank_verified_amount, amount) ELSE 0 END) as totalCollectedAmount
      FROM payment_submissions
      WHERE vendor_id IS NOT NULL AND vendor_id != ''
      GROUP BY vendor_id
    `).all();
    const payMap = {};
    payStats.forEach((r) => {
      payMap[r.vendor_id] = r;
    });

    const vendorSummaries = vendors.map((v) => {
      const p = payMap[v.vendor_id] || {
        totalSubmissions: 0,
        successfulPayments: 0,
        rejectedPayments: 0,
        pendingPayments: 0,
        totalCollectedAmount: 0
      };
      return {
        vendorId: v.vendor_id,
        vendorName: v.vendor_name,
        contactPerson: v.contact_person,
        mobile: v.mobile,
        status: v.status,
        studentsHandled: studentMap[v.vendor_id] || 0,
        totalSubmissions: Number(p.totalSubmissions || 0),
        successfulPayments: Number(p.successfulPayments || 0),
        rejectedPayments: Number(p.rejectedPayments || 0),
        pendingPayments: Number(p.pendingPayments || 0),
        totalCollectedAmount: Number(p.totalCollectedAmount || 0)
      };
    });

    const overallTotals = vendorSummaries.reduce(
      (acc, curr) => {
        acc.totalVendors += 1;
        acc.totalStudentsHandled += curr.studentsHandled;
        acc.totalSuccessfulPayments += curr.successfulPayments;
        acc.totalRejectedPayments += curr.rejectedPayments;
        acc.totalPendingPayments += curr.pendingPayments;
        acc.grandTotalCollected += curr.totalCollectedAmount;
        return acc;
      },
      {
        totalVendors: 0,
        totalStudentsHandled: 0,
        totalSuccessfulPayments: 0,
        totalRejectedPayments: 0,
        totalPendingPayments: 0,
        grandTotalCollected: 0
      }
    );

    return res.json({
      success: true,
      overallTotals,
      vendorSummaries
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/vendors/:vendorId/transaction-history
// Requirement 4: Separate Vendor History (Displays ONLY that selected vendor's complete transaction history & metrics)
router.get('/admin/vendors/:vendorId/transaction-history', requireAdminAuth, async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { status, search } = req.query;

    const vendor = db.prepare('SELECT * FROM vendors WHERE vendor_id = ?').get(vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }

    const studentsHandledRow = db.prepare('SELECT COUNT(*) as cnt FROM student_vendor_assignments WHERE vendor_id = ?').get(vendorId);
    const studentsHandledCount = studentsHandledRow?.cnt || 0;

    const allVendorSubmissions = db.prepare('SELECT * FROM payment_submissions WHERE vendor_id = ?').all(vendorId);

    let querySql = 'SELECT * FROM payment_submissions WHERE vendor_id = ?';
    const queryParams = [vendorId];

    if (status && status !== 'ALL') {
      if (status === 'Payment Successful' || status === 'Verified') {
        querySql += " AND payment_status IN ('Payment Successful', 'Verified', 'Payment Verified')";
      } else if (status === 'Pending') {
        querySql += " AND payment_status IN ('Submitted', 'Payment Submitted', 'Under Verification')";
      } else if (status === 'Rejected') {
        querySql += " AND payment_status IN ('Rejected', 'Payment Rejected', 'Payment Not Received')";
      } else {
        querySql += ' AND payment_status = ?';
        queryParams.push(status);
      }
    }

    if (search && search.trim()) {
      querySql += ' AND (LOWER(student_name) LIKE ? OR LOWER(usn) LIKE ? OR LOWER(utr_number) LIKE ?)';
      const term = `%${search.trim().toLowerCase()}%`;
      queryParams.push(term, term, term);
    }

    querySql += ' ORDER BY updated_at DESC';
    const filteredSubmissions = db.prepare(querySql).all(...queryParams);

    const permanentAuditTrail = db.prepare('SELECT * FROM vendor_transaction_history WHERE vendor_id = ? ORDER BY action_timestamp DESC LIMIT 300').all(vendorId);

    let verifiedCount = 0;
    let rejectedCount = 0;
    let pendingCount = 0;
    let totalCollectedAmount = 0;

    allVendorSubmissions.forEach((sub) => {
      if (['Payment Successful', 'Verified', 'Payment Verified'].includes(sub.payment_status)) {
        verifiedCount++;
        totalCollectedAmount += Number(sub.bank_verified_amount || sub.amount || 0);
      } else if (['Rejected', 'Payment Rejected', 'Payment Not Received'].includes(sub.payment_status)) {
        rejectedCount++;
      } else {
        pendingCount++;
      }
    });

    return res.json({
      success: true,
      vendor: {
        vendorId: vendor.vendor_id,
        vendorName: vendor.vendor_name,
        contactPerson: vendor.contact_person,
        mobile: vendor.mobile,
        email: vendor.email,
        status: vendor.status
      },
      vendorMetrics: {
        studentsHandledCount,
        totalTransactions: allVendorSubmissions.length,
        verifiedPayments: verifiedCount,
        rejectedPayments: rejectedCount,
        pendingPayments: pendingCount,
        totalCollectedAmount
      },
      transactions: filteredSubmissions.map(formatSubmission),
      permanentAuditTrail: permanentAuditTrail.map((h) => ({
        _id: h.id,
        id: h.id,
        submissionId: h.submission_id,
        registrationId: h.registration_id,
        studentName: h.student_name,
        usn: h.usn,
        department: h.department,
        yearSemester: h.year_semester,
        section: h.section,
        vendorId: h.vendor_id,
        vendorName: h.vendor_name,
        paymentMethod: h.payment_method,
        paymentAmount: Number(h.payment_amount),
        verifiedBankAmount: h.verified_bank_amount !== null ? Number(h.verified_bank_amount) : null,
        utrNumber: h.utr_number,
        paymentStatus: h.payment_status,
        verifiedByVendorId: h.verified_by_vendor_id,
        verifiedByVendorName: h.verified_by_vendor_name,
        verifierRole: h.verifier_role,
        remarks: h.remarks,
        actionTimestamp: h.action_timestamp,
        createdAt: h.created_at
      }))
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/transactions/all-history
// Requirement 3: Admin Master Transaction & Verification History Across All Vendors
router.get('/admin/transactions/all-history', requireAdminAuth, async (req, res) => {
  try {
    const { vendorId, status, search } = req.query;
    let sql = 'SELECT * FROM vendor_transaction_history WHERE 1=1';
    const params = [];

    if (vendorId && vendorId !== 'ALL') {
      sql += ' AND vendor_id = ?';
      params.push(vendorId);
    }
    if (status && status !== 'ALL') {
      if (status === 'Payment Successful' || status === 'Verified') {
        sql += " AND payment_status IN ('Payment Successful', 'Verified', 'Payment Verified')";
      } else if (status === 'Pending') {
        sql += " AND payment_status IN ('Submitted', 'Payment Submitted', 'Under Verification')";
      } else if (status === 'Rejected') {
        sql += " AND payment_status IN ('Rejected', 'Payment Rejected', 'Payment Not Received')";
      } else {
        sql += ' AND payment_status = ?';
        params.push(status);
      }
    }
    if (search && search.trim()) {
      sql += ' AND (LOWER(student_name) LIKE ? OR LOWER(usn) LIKE ? OR LOWER(vendor_name) LIKE ? OR LOWER(utr_number) LIKE ?)';
      const s = `%${search.trim().toLowerCase()}%`;
      params.push(s, s, s, s);
    }

    sql += ' ORDER BY action_timestamp DESC LIMIT 500';
    const history = db.prepare(sql).all(...params);

    return res.json({
      success: true,
      history: history.map((item) => ({
        _id: item.id,
        id: item.id,
        submissionId: item.submission_id,
        registrationId: item.registration_id,
        studentName: item.student_name,
        usn: item.usn,
        department: item.department,
        yearSemester: item.year_semester,
        section: item.section,
        vendorId: item.vendor_id,
        vendorName: item.vendor_name,
        paymentMethod: item.payment_method,
        paymentAmount: Number(item.payment_amount),
        verifiedBankAmount: item.verified_bank_amount !== null ? Number(item.verified_bank_amount) : null,
        utrNumber: item.utr_number,
        paymentStatus: item.payment_status,
        verifiedByVendorId: item.verified_by_vendor_id,
        verifiedByVendorName: item.verified_by_vendor_name,
        verifierRole: item.verifier_role,
        remarks: item.remarks,
        actionTimestamp: item.action_timestamp,
        createdAt: item.created_at
      }))
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;


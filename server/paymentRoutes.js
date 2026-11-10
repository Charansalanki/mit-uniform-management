import express from 'express';
import crypto from 'node:crypto';
import { db } from './db.js';
import {
  uploadQrScanner,
  uploadPaymentScreenshot,
  uploadBankCsv,
  requireAdminAuth
} from './paymentUpload.js';
import { resolveOrCreateStudentVendorAssignment } from './vendorRoutes.js';
import sseHub from './sseHub.js';
import { validateUsnAndDepartmentOnBackend } from './middleware/validateUsnDepartment.js';
import { cleanRegId, isValidRegistrationId, resolveCanonicalRegistrationRecord } from './utils/registrationIdUtils.js';

const router = express.Router();

// Helper: Normalize UTR (strip spaces, hyphens, special chars, uppercase)
const normalizeUtr = (rawUtr) => {
  if (!rawUtr) return '';
  return String(rawUtr).replace(/[^a-zA-Z0-9]/g, '').toUpperCase().trim();
};

// Helper: Write Security Audit Log
const logAudit = ({
  adminId = null,
  actorType = 'ADMIN',
  action,
  paymentSubmissionId = null,
  paymentMethodId = null,
  previousValue = null,
  newValue = null,
  req = null
}) => {
  try {
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const ipAddress = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '') : '';
    db.prepare(`
      INSERT INTO payment_audit_logs (
        id, admin_id, actor_type, action,
        payment_submission_id, payment_method_id,
        previous_value, new_value, ip_address, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      adminId,
      actorType,
      action,
      paymentSubmissionId,
      paymentMethodId,
      previousValue ? JSON.stringify(previousValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      String(ipAddress),
      timestamp
    );
  } catch (err) {
    console.error('Audit Log Error:', err.message);
  }
};

// Helper: Authoritative Backend Amount Resolver (Priority: Package -> Semester -> Department -> Base Amount)
const resolveExpectedAmount = (configRow, { department, yearSemester, packageType } = {}) => {
  if (!configRow) return 1500;
  const baseAmount = Number(configRow.uniform_amount || 1500);
  let pkgMap = {};
  let semMap = {};
  let deptMap = {};
  try { pkgMap = typeof configRow.package_amounts === 'string' ? JSON.parse(configRow.package_amounts) : (configRow.package_amounts || {}); } catch {}
  try { semMap = typeof configRow.semester_amounts === 'string' ? JSON.parse(configRow.semester_amounts) : (configRow.semester_amounts || {}); } catch {}
  try { deptMap = typeof configRow.department_amounts === 'string' ? JSON.parse(configRow.department_amounts) : (configRow.department_amounts || {}); } catch {}

  // 1. Package Override (Only for specific packages other than standard default, e.g. hosteler or lab_included)
  if (packageType && packageType !== 'standard' && pkgMap[packageType] && Number(pkgMap[packageType]) > 0) {
    return Number(pkgMap[packageType]);
  }

  // 2. Semester Override
  if (yearSemester) {
    const cleanSem = String(yearSemester).trim();
    if (semMap[cleanSem] && Number(semMap[cleanSem]) > 0) {
      return Number(semMap[cleanSem]);
    }
    const cleanNum = cleanSem.replace(/[^0-9]/g, '');
    for (const [key, val] of Object.entries(semMap)) {
      if (cleanNum && key.replace(/[^0-9]/g, '') === cleanNum && Number(val) > 0) {
        return Number(val);
      }
    }
  }
  // 3. Department Override
  if (department && deptMap[department] && Number(deptMap[department]) > 0) {
    return Number(deptMap[department]);
  }
  // 4. Base Amount
  return baseAmount;
};

// Helper: Evaluate Amount Compliance against submission's mode & thresholds
const evaluateAmountCompliance = ({
  mode,
  expectedAmount,
  minAmount,
  maxAmount,
  submittedAmount,
  ocrAmount,
  bankAmount
}) => {
  const issues = [];
  const checkValue = (val, label) => {
    if (val === null || val === undefined || val === '') return;
    const num = Number(val);
    if (isNaN(num) || num <= 0) {
      issues.push(`${label} (₹${val}) is not a valid positive amount.`);
      return;
    }
    if (mode === 'FIXED') {
      if (num !== Number(expectedAmount)) {
        issues.push(`${label} (₹${num}) does not match Fixed Expected Amount (₹${expectedAmount}).`);
      }
    } else if (mode === 'FLEXIBLE_RANGE') {
      if (num < Number(minAmount) || num > Number(maxAmount)) {
        issues.push(`${label} (₹${num}) is outside the allowed range (₹${minAmount} – ₹${maxAmount}).`);
      }
    }
  };

  checkValue(submittedAmount, 'Student Submitted Amount');
  if (ocrAmount !== null && ocrAmount !== undefined && ocrAmount !== '') {
    checkValue(ocrAmount, 'OCR Screenshot Amount');
    if (submittedAmount && Number(ocrAmount) !== Number(submittedAmount)) {
      issues.push(`OCR Screenshot Amount (₹${ocrAmount}) differs from Student Entered Amount (₹${submittedAmount}).`);
    }
  }
  if (bankAmount !== null && bankAmount !== undefined && bankAmount !== '') {
    checkValue(bankAmount, 'Bank Verified Credit');
  }

  return {
    isCompliant: issues.length === 0,
    mismatchFlag: issues.length > 0,
    notes: issues.join(' | ')
  };
};

// Helper: Format Submission Row from SQLite
const formatSubmission = (row) => {
  if (!row) return null;
  let revisions = [];
  try { if (row.requirement_revision_history) revisions = JSON.parse(row.requirement_revision_history); } catch {}

  let reconDetails = null;
  try { if (row.reconciliation_details) reconDetails = JSON.parse(row.reconciliation_details); } catch {}

  return {
    _id: row.id,
    id: row.id,
    registrationId: row.registration_id,
    studentId: row.student_id,
    studentName: row.student_name,
    usn: row.usn,
    department: row.department,
    yearSemester: row.year_semester,
    section: row.section,
    packageType: row.package_type || 'standard',
    paymentMethod: row.payment_method,
    configIdAtSubmission: row.config_id_at_submission,
    configVersionAtSubmission: Number(row.config_version_at_submission || 1),
    paymentModeAtSubmission: row.payment_mode_at_submission || 'FIXED',
    minAllowedAtSubmission: Number(row.min_allowed_at_submission || 1),
    maxAllowedAtSubmission: Number(row.max_allowed_at_submission || 10000),
    expectedAmount: Number(row.expected_amount),
    amount: Number(row.amount),
    ocrExtractedAmount: row.ocr_extracted_amount !== null && row.ocr_extracted_amount !== undefined ? Number(row.ocr_extracted_amount) : null,
    bankVerifiedAmount: row.bank_verified_amount !== null && row.bank_verified_amount !== undefined ? Number(row.bank_verified_amount) : null,
    amountMismatchFlag: Boolean(row.amount_mismatch_flag),
    amountValidationNotes: row.amount_validation_notes || '',
    requirementRevisionHistory: revisions,
    utrNumber: row.utr_number,
    paymentScreenshot: row.payment_screenshot,
    paymentStatus: row.payment_status,
    reconciliationStatus: row.reconciliation_status || 'Unchecked',
    reconciliationDetails: reconDetails,
    adminRemarks: row.admin_remarks || '',
    rejectionReason: row.rejection_reason || '',
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at,
    vendorId: row.vendor_id || null,
    vendorName: row.vendor_name || null,
    vendorAllocationId: row.vendor_allocation_id || null,
    vendorBeneficiaryName: row.vendor_beneficiary_name || '',
    vendorUpiId: row.vendor_upi_id || '',
    screenshotExtractedUtr: row.screenshot_extracted_utr || null,
    utrOcrMismatchFlag: Boolean(row.utr_ocr_mismatch_flag),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

// Helper: Format Config Row from SQLite
const formatConfig = (row) => {
  if (!row) return null;
  let pkg = { standard: 1500, hosteler: 1800, lab_included: 2100 };
  let dept = {};
  let sem = {};
  try { if (row.package_amounts) pkg = JSON.parse(row.package_amounts); } catch {}
  try { if (row.department_amounts) dept = JSON.parse(row.department_amounts); } catch {}
  try { if (row.semester_amounts) sem = JSON.parse(row.semester_amounts); } catch {}

  return {
    configId: row.id,
    configVersion: Number(row.config_version || 1),
    isCollectionEnabled: row.is_collection_enabled !== undefined ? Boolean(row.is_collection_enabled) : true,
    unavailableMessage: row.unavailable_message || 'Payment collection is temporarily unavailable. Please contact the Uniform Office.',
    paymentMode: row.payment_mode || 'FIXED',
    uniformAmount: Number(row.uniform_amount || 1500),
    minAmount: Number(row.min_amount || 1),
    maxAmount: Number(row.max_amount || 10000),
    departmentAmounts: dept,
    semesterAmounts: sem,
    packageAmounts: pkg,
    beneficiaryName: row.beneficiary_name || 'Maharaja Institute of Technology Mysore',
    paymentInstructions: row.payment_instructions || 'Scan any active UPI QR code below using your UPI app, complete the payment, and enter your 12-digit UPI UTR / Reference number along with the payment screenshot.',
    referenceInstructions: row.reference_instructions || 'Enter your USN in the UPI remarks field while making the payment.',
    additionalInstructions: row.additional_instructions || 'Payment verification is done manually against our official bank statement within 24-48 working hours.',
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    updatedByName: row.updated_by_name || 'System Administrator'
  };
};

// Helper: Format Config History Row from SQLite
const formatHistory = (row) => {
  if (!row) return null;
  let dept = {};
  let sem = {};
  let pkg = {};
  try { if (row.department_amounts_snapshot) dept = JSON.parse(row.department_amounts_snapshot); } catch {}
  try { if (row.semester_amounts_snapshot) sem = JSON.parse(row.semester_amounts_snapshot); } catch {}
  try { if (row.package_amounts_snapshot) pkg = JSON.parse(row.package_amounts_snapshot); } catch {}

  return {
    id: row.id,
    _id: row.id,
    configVersion: Number(row.config_version),
    previousAmount: Number(row.previous_amount),
    newAmount: Number(row.new_amount),
    previousMinAmount: Number(row.previous_min_amount),
    newMinAmount: Number(row.new_min_amount),
    previousMaxAmount: Number(row.previous_max_amount),
    newMaxAmount: Number(row.new_max_amount),
    previousMode: row.previous_mode,
    newMode: row.new_mode,
    previousCollectionStatus: Boolean(row.previous_collection_status),
    newCollectionStatus: Boolean(row.new_collection_status),
    departmentAmountsSnapshot: dept,
    semesterAmountsSnapshot: sem,
    packageAmountsSnapshot: pkg,
    changeSummary: row.change_summary || '',
    modifiedBy: row.modified_by,
    modifiedByName: row.modified_by_name || 'Administrator',
    modifiedAt: row.modified_at
  };
};

// Helper: Format Method Row from SQLite
const formatMethod = (row) => {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    name: row.name,
    methodType: row.method_type,
    qrImageUrl: row.qr_image_url,
    amount: Number(row.amount),
    instructions: row.instructions,
    beneficiaryName: row.beneficiary_name,
    isActive: Boolean(row.is_active),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by
  };
};

// ============================================================================
// 1. PUBLIC / STUDENT PAYMENT CONFIGURATION ROUTES
// ============================================================================

// GET /api/payments/config
router.get('/payments/config', (req, res) => {
  try {
    const configRow = db.prepare('SELECT * FROM payment_config LIMIT 1').get();
    const config = formatConfig(configRow) || {
      configId: 'default',
      configVersion: 1,
      isCollectionEnabled: true,
      unavailableMessage: 'Payment collection is temporarily unavailable. Please contact the Uniform Office.',
      paymentMode: 'FIXED',
      uniformAmount: 1500,
      resolvedAmount: 1500,
      minAmount: 1,
      maxAmount: 10000,
      departmentAmounts: {},
      semesterAmounts: {},
      packageAmounts: { standard: 1500, hosteler: 1800, lab_included: 2100 },
      beneficiaryName: 'Maharaja Institute of Technology Mysore',
      paymentInstructions: 'Scan any active UPI QR code below using your UPI app, complete the payment, and enter your 12-digit UPI UTR / Reference number along with the payment screenshot.',
      referenceInstructions: 'Enter your USN in the UPI remarks field while making the payment.',
      additionalInstructions: 'Payment verification is done manually against our official bank statement within 24-48 working hours.',
      updatedAt: new Date().toISOString(),
      updatedByName: 'System Administrator'
    };

    const resolvedAmount = resolveExpectedAmount(configRow, req.query);
    config.resolvedAmount = resolvedAmount;

    const methodRows = db.prepare(`
      SELECT * FROM payment_methods
      WHERE is_active = 1 AND qr_image_url IS NOT NULL
      ORDER BY method_type ASC
    `).all();

    const activeMethods = methodRows.map(formatMethod);

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.json({
      success: true,
      config,
      methods: activeMethods
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/payments/methods
router.get('/payments/methods', (_req, res) => {
  try {
    const methodRows = db.prepare(`
      SELECT * FROM payment_methods
      WHERE is_active = 1 AND qr_image_url IS NOT NULL
      ORDER BY method_type ASC
    `).all();

    res.set('Cache-Control', 'no-store');
    return res.json({ success: true, methods: methodRows.map(formatMethod) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/payments/status/:registrationId
router.get('/payments/status/:registrationId', (req, res) => {
  try {
    const cleanedParamId = cleanRegId(req.params.registrationId);
    if (!isValidRegistrationId(cleanedParamId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Registration ID format.'
      });
    }

    const { canonicalRegId, registrationDoc } = resolveCanonicalRegistrationRecord(
      cleanedParamId,
      req.query.usn
    );

    // Look up submission strictly matching registration ID or student UUID first
    let submissionRow = db.prepare(`
      SELECT * FROM payment_submissions
      WHERE registration_id = ? OR student_id = ? OR registration_id = ? OR student_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(
      canonicalRegId,
      canonicalRegId,
      cleanedParamId,
      cleanedParamId
    );

    // Only fallback to USN if no submission for this registration exists AND candidate submission has no conflicting registration_id
    if (!submissionRow && (req.query.usn || registrationDoc?.usn)) {
      const targetUsn = (req.query.usn || registrationDoc?.usn).trim().toUpperCase();
      const usnCandidate = db.prepare(`
        SELECT * FROM payment_submissions
        WHERE UPPER(TRIM(usn)) = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(targetUsn);

      if (usnCandidate) {
        const subReg = usnCandidate.registration_id;
        if (!subReg || subReg === canonicalRegId || subReg === cleanedParamId || subReg === registrationDoc?.id || subReg === registrationDoc?.registration_id) {
          submissionRow = usnCandidate;
        }
      }
    }

    if (!submissionRow) {
      return res.json({
        success: true,
        paymentStatus: 'Not Paid',
        submission: null
      });
    }

    const sub = formatSubmission(submissionRow);
    return res.json({
      success: true,
      paymentStatus: sub.paymentStatus,
      submission: sub
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/payments/submit
router.post('/payments/submit', uploadPaymentScreenshot.single('paymentScreenshot'), validateUsnAndDepartmentOnBackend, (req, res) => {
  try {
    const configRow = db.prepare('SELECT * FROM payment_config LIMIT 1').get();

    // 1. Enforce Master Payment Collection Toggle
    const isCollectionEnabled = configRow && configRow.is_collection_enabled !== undefined
      ? Boolean(configRow.is_collection_enabled)
      : true;

    if (!isCollectionEnabled) {
      const unavail = (configRow && configRow.unavailable_message) ||
        'Payment collection is temporarily unavailable. Please contact the Uniform Office.';
      return res.status(503).json({
        success: false,
        collectionDisabled: true,
        error: unavail,
        message: unavail
      });
    }

    // Normalize Registration ID & USN safely using cleanRegId
    const incomingRegId = cleanRegId(
      req.body.registrationId || req.body.applicationId
    );
    const cleanUsn = String(req.body.usn || '').toUpperCase().trim();

    if (!isValidRegistrationId(incomingRegId) && !cleanUsn) {
      return res.status(400).json({
        success: false,
        message: 'A valid Registration ID and USN are required to submit payment proof.'
      });
    }

    const {
      canonicalRegId,
      trackingRecord,
      registrationDoc
    } = resolveCanonicalRegistrationRecord(incomingRegId, cleanUsn);

    if (!canonicalRegId && !registrationDoc) {
      return res.status(404).json({
        success: false,
        message:
          'Student registration record not found in the database. Please complete registration before submitting payment.'
      });
    }

    // Auto-populate authoritative student fields from registrationDoc / trackingRecord
    const regRecord = registrationDoc;
    let registrationId = canonicalRegId;
    let studentId = req.body.studentId || registrationDoc?.id || canonicalRegId;
    let studentName = (req.body.studentName || registrationDoc?.full_name || trackingRecord?.studentProfile?.studentName || 'Student').trim();
    let usn = cleanUsn || registrationDoc?.usn || trackingRecord?.usn;
    let department = req.body.department || registrationDoc?.department || trackingRecord?.studentProfile?.department;
    let yearSemester = req.body.academicYear || req.body.yearSemester || registrationDoc?.academic_year || registrationDoc?.year_semester || (registrationDoc?.semester ? `${registrationDoc.semester}th Sem` : '1st Year');
    let section = req.body.section || registrationDoc?.section || trackingRecord?.studentProfile?.section || '';
    let packageType = req.body.packageType || 'standard';
    let paymentMethod = req.body.paymentMethod;
    let utrNumber = req.body.utrNumber;
    let studentEnteredAmount = req.body.studentEnteredAmount;
    let amount = req.body.amount;
    let ocrExtractedAmount = req.body.ocrExtractedAmount;

    if (!paymentMethod || !utrNumber) {
      return res.status(400).json({
        success: false,
        message: 'Selected UPI method and UTR number are required.'
      });
    }

    if (!usn) {
      return res.status(400).json({
        success: false,
        message: 'Student USN is required or registration ID was not found.'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a valid payment screenshot (PNG, JPG, or JPEG).'
      });
    }

    // Multi-Vendor Assignment & Scanner Validation
    let vendorAssignment = null;
    let vendorPayCfg = null;
    const hasVendors = db.prepare('SELECT 1 FROM vendors LIMIT 1').get();
    if (hasVendors) {
      const deptUpper = String(department || '').toUpperCase().trim();
      const isPg = deptUpper === 'MBA' || deptUpper === 'MCA';
      const derivedCourse = isPg ? deptUpper : 'B.E.';
      const derivedEduLevel = isPg ? 'PG' : 'UG';

      vendorAssignment = resolveOrCreateStudentVendorAssignment({
        registrationId,
        studentId,
        usn,
        studentName,
        educationLevel: req.body.educationLevel || regRecord?.education_level || derivedEduLevel,
        course: req.body.course || regRecord?.course || derivedCourse,
        department,
        academicYear: req.body.academicYear || yearSemester,
        semester: req.body.semester || 'ALL',
        section,
        gender: regRecord ? regRecord.gender : (req.body.gender || 'All')
      });

      if (!vendorAssignment) {
        return res.status(400).json({
          success: false,
          message: 'Cannot submit payment: No active uniform vendor is assigned to your academic branch/section.'
        });
      }

      vendorPayCfg = db.prepare('SELECT * FROM vendor_payment_configurations WHERE vendor_id = ? AND is_active = 1').get(vendorAssignment.vendorId);
      const slotMap = {
        GPAY: { isEnabled: Boolean(vendorPayCfg?.gpay_enabled), qrImageUrl: vendorPayCfg?.gpay_qr_url },
        PHONEPE: { isEnabled: Boolean(vendorPayCfg?.phonepe_enabled), qrImageUrl: vendorPayCfg?.phonepe_qr_url },
        PAYTM: { isEnabled: Boolean(vendorPayCfg?.paytm_enabled), qrImageUrl: vendorPayCfg?.paytm_qr_url }
      };
      const selectedSlot = slotMap[paymentMethod.toUpperCase()];
      if (!selectedSlot || !selectedSlot.isEnabled || !selectedSlot.qrImageUrl) {
        return res.status(400).json({
          success: false,
          message: `Selected ${paymentMethod} scanner is not enabled for your assigned vendor (${vendorAssignment.vendorName}).`
        });
      }
    } else {
      // Fallback to legacy global payment_methods
      const methodRow = db.prepare(`
        SELECT * FROM payment_methods
        WHERE method_type = ? AND is_active = 1 AND qr_image_url IS NOT NULL
      `).get(paymentMethod.toUpperCase());

      if (!methodRow) {
        return res.status(400).json({
          success: false,
          message: 'Selected payment method is currently disabled or unavailable. Please refresh and choose an active scanner.'
        });
      }
    }

    // Normalize and validate UTR format (10-22 alphanumeric)
    const cleanUtr = normalizeUtr(utrNumber);
    if (cleanUtr.length < 10 || cleanUtr.length > 22) {
      return res.status(400).json({
        success: false,
        message: 'Invalid UTR / UPI Reference Number. Please enter the valid 12-digit UPI transaction ID.'
      });
    }

    const cleanOcrUtr = req.body.screenshotExtractedUtr ? normalizeUtr(req.body.screenshotExtractedUtr) : null;
    const utrOcrMismatchFlag = Boolean(cleanOcrUtr && cleanOcrUtr !== cleanUtr);

    // Check duplicate UTR across all submissions
    const existingUtr = db.prepare(`
      SELECT * FROM payment_submissions
      WHERE UPPER(TRIM(utr_number)) = ? AND registration_id != ?
    `).get(cleanUtr, registrationId);

    if (existingUtr) {
      logAudit({
        actorType: 'STUDENT',
        action: 'DUPLICATE_UTR_BLOCKED',
        paymentSubmissionId: existingUtr.id,
        previousValue: { existingUsn: existingUtr.usn, utrNumber: cleanUtr },
        newValue: { attemptedUsn: usn, registrationId },
        req
      });
      return res.status(409).json({
        success: false,
        message: `Duplicate UTR detected (${cleanUtr}). This transaction reference has already been submitted. Duplicate attempt logged for admin review.`
      });
    }

    // Prevent duplicate payment submissions:
    // If student's payment is already Payment Successful, or already Payment Submitted / Under Verification, strictly block.
    let existingRegPayment = db.prepare(`
      SELECT * FROM payment_submissions
      WHERE registration_id = ? OR student_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(registrationId, studentId);

    if (!existingRegPayment && usn) {
      const usnCandidate = db.prepare(`
        SELECT * FROM payment_submissions
        WHERE UPPER(TRIM(usn)) = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(usn.toUpperCase().trim());
      if (usnCandidate && (!usnCandidate.registration_id || usnCandidate.registration_id === registrationId)) {
        existingRegPayment = usnCandidate;
      }
    }

    if (existingRegPayment) {
      const st = existingRegPayment.payment_status;
      if (['Payment Successful', 'Verified', 'Payment Verified'].includes(st)) {
        return res.status(400).json({
          success: false,
          alreadySuccessful: true,
          message: 'Payment Successful: Your uniform payment has already been verified. Duplicate payment submissions are disabled.'
        });
      }

      if (['Submitted', 'Payment Submitted', 'Under Verification'].includes(st)) {
        return res.status(400).json({
          success: false,
          alreadySubmitted: true,
          message: 'You have already submitted payment details for this registration. Your payment is currently awaiting verification.'
        });
      }
    }

    // 2. Authoritative Expected Amount & Mode Calculation (Preserve original locked requirement if resubmitting)
    let authoritativeExpected = existingRegPayment && existingRegPayment.expected_amount
      ? Number(existingRegPayment.expected_amount)
      : null;

    if (!authoritativeExpected) {
      // Check if student has an assigned vendor with configured price
      const vId = vendorAssignment?.vendorId || regRecord?.assigned_vendor_id;
      if (vId) {
        const vCfg = vendorPayCfg || db.prepare('SELECT payment_amount FROM vendor_payment_configurations WHERE vendor_id = ?').get(vId);
        if (vCfg && vCfg.payment_amount && Number(vCfg.payment_amount) > 0) {
          authoritativeExpected = Number(vCfg.payment_amount);
        }
      }
    }

    if (!authoritativeExpected) {
      if (req.body.amount && !isNaN(Number(req.body.amount)) && Number(req.body.amount) > 0) {
        authoritativeExpected = Number(req.body.amount);
      } else {
        authoritativeExpected = resolveExpectedAmount(configRow, { department, yearSemester, packageType: packageType || 'standard' });
      }
    }

    const lockedMode = existingRegPayment && existingRegPayment.payment_mode_at_submission
      ? existingRegPayment.payment_mode_at_submission
      : (configRow ? configRow.payment_mode || 'FIXED' : 'FIXED');

    const lockedMin = existingRegPayment && existingRegPayment.min_allowed_at_submission !== null && existingRegPayment.min_allowed_at_submission !== undefined
      ? Number(existingRegPayment.min_allowed_at_submission)
      : (configRow ? Number(configRow.min_amount || 1) : 1);

    const lockedMax = existingRegPayment && existingRegPayment.max_allowed_at_submission !== null && existingRegPayment.max_allowed_at_submission !== undefined
      ? Number(existingRegPayment.max_allowed_at_submission)
      : (configRow ? Number(configRow.max_amount || 10000) : 10000);

    const configVersionAtSub = existingRegPayment && existingRegPayment.config_version_at_submission
      ? existingRegPayment.config_version_at_submission
      : (configRow ? Number(configRow.config_version || 1) : 1);

    const configIdAtSub = existingRegPayment && existingRegPayment.config_id_at_submission
      ? existingRegPayment.config_id_at_submission
      : (configRow ? configRow.id : null);

    // 3. Determine Actual Submitted Amount & Validate Mode Rules
    let parsedSubmittedAmount = authoritativeExpected;
    const inputAmt = studentEnteredAmount !== undefined && studentEnteredAmount !== ''
      ? studentEnteredAmount
      : (amount !== undefined && amount !== '' ? amount : undefined);

    if (inputAmt !== undefined) {
      parsedSubmittedAmount = Number(inputAmt);
      if (isNaN(parsedSubmittedAmount) || parsedSubmittedAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Please enter a valid positive payment amount.'
        });
      }
    }

    // In Flexible Range Mode, block out-of-range student input at submission time
    if (lockedMode === 'FLEXIBLE_RANGE') {
      if (parsedSubmittedAmount < lockedMin || parsedSubmittedAmount > lockedMax) {
        return res.status(400).json({
          success: false,
          message: `Payment amount must be between ₹${lockedMin.toLocaleString('en-IN')} and ₹${lockedMax.toLocaleString('en-IN')}.`
        });
      }
    }

    const parsedOcrAmount = (ocrExtractedAmount !== undefined && ocrExtractedAmount !== '' && ocrExtractedAmount !== null)
      ? Number(ocrExtractedAmount)
      : null;

    const compliance = evaluateAmountCompliance({
      mode: lockedMode,
      expectedAmount: authoritativeExpected,
      minAmount: lockedMin,
      maxAmount: lockedMax,
      submittedAmount: parsedSubmittedAmount,
      ocrAmount: parsedOcrAmount,
      bankAmount: null
    });

    const screenshotUrl = `/uploads/payments/screenshots/${req.file.filename}`;
    const now = new Date().toISOString();
    let submissionId;

    const vendorIdVal = vendorAssignment ? vendorAssignment.vendorId : (existingRegPayment?.vendor_id || null);
    const vendorNameVal = vendorAssignment ? vendorAssignment.vendorName : (existingRegPayment?.vendor_name || null);
    const vendorAllocIdVal = vendorAssignment ? vendorAssignment.allocationId : (existingRegPayment?.vendor_allocation_id || null);
    const vendorBeneficiaryVal = vendorPayCfg ? vendorPayCfg.beneficiary_name : (existingRegPayment?.vendor_beneficiary_name || '');
    const vendorUpiVal = vendorPayCfg ? vendorPayCfg.upi_id : (existingRegPayment?.vendor_upi_id || '');

    if (existingRegPayment) {
      submissionId = existingRegPayment.id;
      db.prepare(`
        UPDATE payment_submissions
        SET payment_method = ?,
            package_type = ?,
            amount = ?,
            ocr_extracted_amount = ?,
            amount_mismatch_flag = ?,
            amount_validation_notes = ?,
            utr_number = ?,
            payment_screenshot = ?,
            payment_status = 'Payment Submitted',
            rejection_reason = '',
            reconciliation_status = 'Unchecked',
            vendor_id = ?,
            vendor_name = ?,
            vendor_allocation_id = ?,
            vendor_beneficiary_name = ?,
            vendor_upi_id = ?,
            screenshot_extracted_utr = ?,
            utr_ocr_mismatch_flag = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        paymentMethod.toUpperCase(),
        packageType || 'standard',
        parsedSubmittedAmount,
        parsedOcrAmount,
        compliance.mismatchFlag ? 1 : 0,
        compliance.notes,
        cleanUtr,
        screenshotUrl,
        vendorIdVal,
        vendorNameVal,
        vendorAllocIdVal,
        vendorBeneficiaryVal,
        vendorUpiVal,
        cleanOcrUtr,
        utrOcrMismatchFlag ? 1 : 0,
        now,
        submissionId
      );
    } else {
      submissionId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO payment_submissions (
          id, registration_id, student_id, student_name, usn,
          department, year_semester, section, package_type, payment_method,
          config_id_at_submission, config_version_at_submission, payment_mode_at_submission,
          expected_amount, min_allowed_at_submission, max_allowed_at_submission,
          amount, ocr_extracted_amount, amount_mismatch_flag, amount_validation_notes,
          requirement_revision_history, utr_number, payment_screenshot,
          payment_status, reconciliation_status,
          vendor_id, vendor_name, vendor_allocation_id, vendor_beneficiary_name, vendor_upi_id,
          screenshot_extracted_utr, utr_ocr_mismatch_flag,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          '[]', ?, ?,
          'Payment Submitted', 'Unchecked',
          ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?
        )
      `).run(
        submissionId,
        registrationId,
        studentId || null,
        studentName || 'Student',
        usn.toUpperCase().trim(),
        department || 'N/A',
        yearSemester || 'N/A',
        section || 'N/A',
        packageType || 'standard',
        paymentMethod.toUpperCase(),
        configIdAtSub,
        configVersionAtSub,
        lockedMode,
        authoritativeExpected,
        lockedMin,
        lockedMax,
        parsedSubmittedAmount,
        parsedOcrAmount,
        compliance.mismatchFlag ? 1 : 0,
        compliance.notes,
        cleanUtr,
        screenshotUrl,
        vendorIdVal,
        vendorNameVal,
        vendorAllocIdVal,
        vendorBeneficiaryVal,
        vendorUpiVal,
        cleanOcrUtr,
        utrOcrMismatchFlag ? 1 : 0,
        now,
        now
      );
    }

    if (vendorAssignment) {
      db.prepare(`
        UPDATE student_vendor_assignments
        SET has_paid_or_submitted = 1, assignment_status = 'LOCKED_BY_PAYMENT', updated_at = ?
        WHERE id = ?
      `).run(now, vendorAssignment.id);
    }

    logAudit({
      actorType: 'STUDENT',
      action: compliance.mismatchFlag ? 'AMOUNT_MISMATCH_FLAGGED' : 'PAYMENT_SUBMITTED',
      paymentSubmissionId: submissionId,
      newValue: {
        usn: usn.toUpperCase().trim(),
        utrNumber: cleanUtr,
        paymentMode: lockedMode,
        expectedAmount: authoritativeExpected,
        submittedAmount: parsedSubmittedAmount,
        ocrExtractedAmount: parsedOcrAmount,
        mismatchFlag: compliance.mismatchFlag,
        validationNotes: compliance.notes
      },
      req
    });

    // Sync status to existing registrations record
    try {
      db.prepare(`
        UPDATE registrations
        SET payment_status = 'Payment Submitted', payment_verified = 0, payment_submission_id = ?
        WHERE id = ? OR registration_id = ?
      `).run(submissionId, registrationId, registrationId);
    } catch {}

    // Sync ONLY this student's StudentTrackingRecord (registrationId + usn)
    try {
      db.prepare(`
        UPDATE student_tracking_records
        SET payment_status = 'Payment Submitted', is_payment_locked = 1, updated_at = ?
        WHERE registration_id = ? OR usn = ?
      `).run(now, registrationId, usn.toUpperCase().trim());
    } catch (e) {}

    const savedRow = db.prepare('SELECT * FROM payment_submissions WHERE id = ?').get(submissionId);

    // Broadcast real-time SSE payment lifecycle event across all 3 portals
    try {
      sseHub.broadcastPaymentLifecycleEvent({
        eventName: 'NEW_PAYMENT_SUBMITTED',
        registrationId: savedRow.registration_id,
        vendorId: savedRow.vendor_id,
        payload: {
          submissionId: savedRow.id,
          registrationId: savedRow.registration_id,
          studentName: savedRow.student_name,
          usn: savedRow.usn,
          vendorId: savedRow.vendor_id,
          amount: savedRow.amount,
          utrNumber: savedRow.utr_number,
          paymentStatus: 'Payment Submitted'
        }
      });
      if (savedRow.vendor_id) {
        sseHub.notifyVendor(savedRow.vendor_id, 'NEW_PAYMENT_SUBMITTED', {
          submissionId: savedRow.id,
          usn: savedRow.usn,
          studentName: savedRow.student_name,
          amount: savedRow.amount
        });
        sseHub.notifyVendor(savedRow.vendor_id, 'GLOBAL_SYNC_UPDATE', {
          event: 'NEW_PAYMENT_SUBMITTED',
          vendorId: savedRow.vendor_id
        });
      }
      sseHub.broadcast('GLOBAL_SYNC_UPDATE', { event: 'NEW_PAYMENT_SUBMITTED', vendorId: savedRow.vendor_id });
    } catch {}

    return res.status(201).json({
      success: true,
      message: 'Payment submitted successfully. Your payment is awaiting verification.',
      submission: formatSubmission(savedRow)
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate UTR number detected. Each UPI transaction reference can only be used once.'
      });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 2. ADMIN PAYMENT CONTROLLER & SCANNER MANAGEMENT ROUTES
// ============================================================================

// GET /api/admin/payments/config
router.get('/admin/payments/config', requireAdminAuth, (_req, res) => {
  try {
    const configRow = db.prepare('SELECT * FROM payment_config LIMIT 1').get();
    const config = formatConfig(configRow);
    const scannerRows = db.prepare('SELECT * FROM payment_methods ORDER BY method_type ASC').all();
    const scanners = scannerRows.map(formatMethod);

    // Compute live 7 Payment Controller statistics
    const totalSubmissions = db.prepare('SELECT COUNT(*) as count FROM payment_submissions').get().count;
    const verifiedPayments = db.prepare("SELECT COUNT(*) as count FROM payment_submissions WHERE payment_status = 'Payment Verified'").get().count;
    const pendingVerification = db.prepare("SELECT COUNT(*) as count FROM payment_submissions WHERE payment_status IN ('Payment Submitted', 'Under Verification')").get().count;
    const rejectedPayments = db.prepare("SELECT COUNT(*) as count FROM payment_submissions WHERE payment_status = 'Payment Rejected'").get().count;
    const flaggedMismatches = db.prepare("SELECT COUNT(*) as count FROM payment_submissions WHERE amount_mismatch_flag = 1").get().count;
    const verifiedTotalRow = db.prepare("SELECT SUM(COALESCE(bank_verified_amount, amount)) as total FROM payment_submissions WHERE payment_status = 'Payment Verified'").get();
    const totalVerifiedCollection = verifiedTotalRow?.total || 0;
    const activePaymentMethods = scanners.filter(s => s.isActive && s.qrImageUrl).length;

    // Count pending payments per method
    const pendingByMethodRows = db.prepare(`
      SELECT payment_method, COUNT(*) as count
      FROM payment_submissions
      WHERE payment_status IN ('Payment Submitted', 'Under Verification')
      GROUP BY payment_method
    `).all();
    const pendingByMethod = {};
    pendingByMethodRows.forEach(r => {
      pendingByMethod[r.payment_method] = r.count;
    });

    // History: 50 most recent changes
    const historyRows = db.prepare('SELECT * FROM payment_config_history ORDER BY modified_at DESC LIMIT 50').all();
    const history = historyRows.map(formatHistory);

    return res.json({
      success: true,
      stats: {
        totalSubmissions,
        verifiedPayments,
        pendingVerification,
        rejectedPayments,
        flaggedMismatches,
        totalVerifiedCollection,
        activePaymentMethods,
        pendingByMethod
      },
      config,
      scanners,
      history
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/payments/config (Update Amount, Range, Mode, Granular Overrides & Record History)
router.put('/admin/payments/config', requireAdminAuth, (req, res) => {
  try {
    const configRow = db.prepare('SELECT * FROM payment_config LIMIT 1').get();
    if (!configRow) {
      return res.status(404).json({ success: false, message: 'Payment config not initialized.' });
    }

    const prevSnapshot = {
      uniformAmount: Number(configRow.uniform_amount || 1500),
      minAmount: Number(configRow.min_amount || 1),
      maxAmount: Number(configRow.max_amount || 10000),
      paymentMode: configRow.payment_mode || 'FIXED',
      isCollectionEnabled: configRow.is_collection_enabled !== undefined ? Boolean(configRow.is_collection_enabled) : true
    };

    const {
      paymentMode,
      uniformAmount,
      minAmount,
      maxAmount,
      isCollectionEnabled,
      unavailableMessage,
      departmentAmounts,
      semesterAmounts,
      packageAmounts,
      beneficiaryName,
      paymentInstructions,
      referenceInstructions,
      additionalInstructions,
      changeSummary
    } = req.body;

    const nextMode = paymentMode !== undefined ? paymentMode : prevSnapshot.paymentMode;
    const nextFixed = uniformAmount !== undefined ? Number(uniformAmount) : prevSnapshot.uniformAmount;
    const nextMin = minAmount !== undefined ? Number(minAmount) : prevSnapshot.minAmount;
    const nextMax = maxAmount !== undefined ? Number(maxAmount) : prevSnapshot.maxAmount;
    const nextCollection = isCollectionEnabled !== undefined ? Boolean(isCollectionEnabled) : prevSnapshot.isCollectionEnabled;

    // Strict Backend Validation Rules
    if (!['FIXED', 'FLEXIBLE_RANGE'].includes(nextMode)) {
      return res.status(400).json({ success: false, message: 'Invalid payment configuration mode. Must be FIXED or FLEXIBLE_RANGE.' });
    }
    if (isNaN(nextFixed) || nextFixed <= 0) {
      return res.status(400).json({ success: false, message: 'Fixed payment amount must be a positive number greater than ₹0.' });
    }
    if (isNaN(nextMin) || nextMin <= 0 || isNaN(nextMax) || nextMax <= 0) {
      return res.status(400).json({ success: false, message: 'Minimum and maximum amounts must be positive numbers greater than ₹0.' });
    }
    if (nextMin > nextMax) {
      return res.status(400).json({
        success: false,
        message: `Invalid range: Minimum amount (₹${nextMin}) cannot be greater than Maximum amount (₹${nextMax}).`
      });
    }
    if (nextMode === 'FIXED' && (nextFixed < nextMin || nextFixed > nextMax)) {
      return res.status(400).json({
        success: false,
        message: `Fixed amount (₹${nextFixed}) must fall within the configured Minimum (₹${nextMin}) and Maximum (₹${nextMax}) limits.`
      });
    }

    // Validate maps for negative or zero amounts
    const validateMap = (obj, label) => {
      if (!obj || typeof obj !== 'object') return null;
      for (const [key, val] of Object.entries(obj)) {
        const num = Number(val);
        if (isNaN(num) || num <= 0) {
          return `${label} amount for "${key}" must be greater than ₹0.`;
        }
      }
      return null;
    };
    const deptErr = validateMap(departmentAmounts, 'Department');
    if (deptErr) return res.status(400).json({ success: false, message: deptErr });
    const semErr = validateMap(semesterAmounts, 'Semester');
    if (semErr) return res.status(400).json({ success: false, message: semErr });
    const pkgErr = validateMap(packageAmounts, 'Package');
    if (pkgErr) return res.status(400).json({ success: false, message: pkgErr });

    const now = new Date().toISOString();
    const newVersion = Number(configRow.config_version || 1) + 1;
    const adminName = req.adminEmail || 'Administrator';

    const nextDeptAmounts = departmentAmounts !== undefined ? JSON.stringify(departmentAmounts) : (configRow.department_amounts || '{}');
    const nextSemAmounts = semesterAmounts !== undefined ? JSON.stringify(semesterAmounts) : (configRow.semester_amounts || '{}');
    let parsedPkg = {};
    try {
      parsedPkg = packageAmounts !== undefined
        ? (typeof packageAmounts === 'string' ? JSON.parse(packageAmounts) : packageAmounts)
        : (typeof configRow.package_amounts === 'string' ? JSON.parse(configRow.package_amounts) : (configRow.package_amounts || {}));
    } catch {}
    parsedPkg.standard = nextFixed;
    const nextPkgAmounts = JSON.stringify(parsedPkg);
    const nextUnavailMsg = unavailableMessage !== undefined ? unavailableMessage : (configRow.unavailable_message || 'Payment collection is temporarily unavailable. Please contact the Uniform Office.');
    const nextBeneficiary = beneficiaryName !== undefined ? beneficiaryName : (configRow.beneficiary_name || 'Maharaja Institute of Technology Mysore');
    const nextPayInst = paymentInstructions !== undefined ? paymentInstructions : (configRow.payment_instructions || '');
    const nextRefInst = referenceInstructions !== undefined ? referenceInstructions : (configRow.reference_instructions || '');
    const nextAddInst = additionalInstructions !== undefined ? additionalInstructions : (configRow.additional_instructions || '');

    // Update config table
    db.prepare(`
      UPDATE payment_config
      SET config_version = ?,
          is_collection_enabled = ?,
          unavailable_message = ?,
          payment_mode = ?,
          uniform_amount = ?,
          min_amount = ?,
          max_amount = ?,
          department_amounts = ?,
          semester_amounts = ?,
          package_amounts = ?,
          beneficiary_name = ?,
          payment_instructions = ?,
          reference_instructions = ?,
          additional_instructions = ?,
          updated_at = ?,
          updated_by = ?,
          updated_by_name = ?
      WHERE id = ?
    `).run(
      newVersion,
      nextCollection ? 1 : 0,
      nextUnavailMsg,
      nextMode,
      nextFixed,
      nextMin,
      nextMax,
      nextDeptAmounts,
      nextSemAmounts,
      nextPkgAmounts,
      nextBeneficiary,
      nextPayInst,
      nextRefInst,
      nextAddInst,
      now,
      req.adminId,
      adminName,
      configRow.id
    );

    // Sync display amount on scanner cards without touching existing submissions
    db.prepare('UPDATE payment_methods SET amount = ?, beneficiary_name = ?, updated_at = ?').run(nextFixed, nextBeneficiary, now);

    // Record immutable entry in payment_config_history
    const historyId = crypto.randomUUID();
    const resolvedSummary = changeSummary ||
      `Mode: ${prevSnapshot.paymentMode} → ${nextMode}, Fixed: ₹${prevSnapshot.uniformAmount} → ₹${nextFixed}, Range: ₹${nextMin}–₹${nextMax}`;

    db.prepare(`
      INSERT INTO payment_config_history (
        id, config_version, previous_amount, new_amount,
        previous_min_amount, new_min_amount, previous_max_amount, new_max_amount,
        previous_mode, new_mode, previous_collection_status, new_collection_status,
        department_amounts_snapshot, semester_amounts_snapshot, package_amounts_snapshot,
        change_summary, modified_by, modified_by_name, modified_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?
      )
    `).run(
      historyId,
      newVersion,
      prevSnapshot.uniformAmount,
      nextFixed,
      prevSnapshot.minAmount,
      nextMin,
      prevSnapshot.maxAmount,
      nextMax,
      prevSnapshot.paymentMode,
      nextMode,
      prevSnapshot.isCollectionEnabled ? 1 : 0,
      nextCollection ? 1 : 0,
      nextDeptAmounts,
      nextSemAmounts,
      nextPkgAmounts,
      resolvedSummary,
      req.adminId,
      adminName,
      now
    );

    logAudit({
      adminId: req.adminId,
      action: prevSnapshot.paymentMode !== nextMode ? 'PAYMENT_MODE_SWITCHED' : 'PAYMENT_AMOUNT_MODIFIED',
      previousValue: prevSnapshot,
      newValue: {
        configVersion: newVersion,
        paymentMode: nextMode,
        uniformAmount: nextFixed,
        minAmount: nextMin,
        maxAmount: nextMax,
        isCollectionEnabled: nextCollection
      },
      req
    });

    const updatedConfigRow = db.prepare('SELECT * FROM payment_config LIMIT 1').get();
    const latestHistoryRow = db.prepare('SELECT * FROM payment_config_history WHERE id = ?').get(historyId);

    try {
      sseHub.notifyConfigSubscribers('PAYMENT_CONFIG_CHANGED', { updatedAt: now });
      sseHub.notifyAdmins('PAYMENT_CONFIG_CHANGED', { updatedAt: now });
    } catch {}

    return res.json({
      success: true,
      message: `Configuration v${newVersion} saved. Student portal updated; all historical submissions remain locked at their original amounts.`,
      config: formatConfig(updatedConfigRow),
      latestHistory: formatHistory(latestHistoryRow)
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/payments/collection-status (Instant Master Toggle ON / OFF)
router.patch('/admin/payments/collection-status', requireAdminAuth, (req, res) => {
  try {
    const { isCollectionEnabled, unavailableMessage } = req.body;
    const configRow = db.prepare('SELECT * FROM payment_config LIMIT 1').get();
    if (!configRow) {
      return res.status(404).json({ success: false, message: 'Payment config not found.' });
    }

    const prevStatus = configRow.is_collection_enabled !== undefined ? Boolean(configRow.is_collection_enabled) : true;
    const nextStatus = Boolean(isCollectionEnabled);
    const now = new Date().toISOString();
    const newVersion = Number(configRow.config_version || 1) + 1;
    const adminName = req.adminEmail || 'Administrator';
    const nextUnavailMsg = unavailableMessage !== undefined ? unavailableMessage : (configRow.unavailable_message || 'Payment collection is temporarily unavailable. Please contact the Uniform Office.');

    db.prepare(`
      UPDATE payment_config
      SET is_collection_enabled = ?,
          unavailable_message = ?,
          config_version = ?,
          updated_at = ?,
          updated_by = ?,
          updated_by_name = ?
      WHERE id = ?
    `).run(nextStatus ? 1 : 0, nextUnavailMsg, newVersion, now, req.adminId, adminName, configRow.id);

    const historyId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO payment_config_history (
        id, config_version, previous_amount, new_amount,
        previous_min_amount, new_min_amount, previous_max_amount, new_max_amount,
        previous_mode, new_mode, previous_collection_status, new_collection_status,
        department_amounts_snapshot, semester_amounts_snapshot, package_amounts_snapshot,
        change_summary, modified_by, modified_by_name, modified_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?
      )
    `).run(
      historyId,
      newVersion,
      Number(configRow.uniform_amount || 1500),
      Number(configRow.uniform_amount || 1500),
      Number(configRow.min_amount || 1),
      Number(configRow.min_amount || 1),
      Number(configRow.max_amount || 10000),
      Number(configRow.max_amount || 10000),
      configRow.payment_mode || 'FIXED',
      configRow.payment_mode || 'FIXED',
      prevStatus ? 1 : 0,
      nextStatus ? 1 : 0,
      configRow.department_amounts || '{}',
      configRow.semester_amounts || '{}',
      configRow.package_amounts || '{}',
      `Payment Collection switched ${nextStatus ? 'ON' : 'OFF'}`,
      req.adminId,
      adminName,
      now
    );

    logAudit({
      adminId: req.adminId,
      action: 'PAYMENT_COLLECTION_TOGGLED',
      previousValue: { isCollectionEnabled: prevStatus },
      newValue: { isCollectionEnabled: nextStatus },
      req
    });

    const updated = db.prepare('SELECT * FROM payment_config LIMIT 1').get();

    try {
      sseHub.notifyConfigSubscribers('PAYMENT_CONFIG_CHANGED', { updatedAt: now, isCollectionEnabled: nextStatus });
      sseHub.notifyAdmins('PAYMENT_CONFIG_CHANGED', { updatedAt: now, isCollectionEnabled: nextStatus });
    } catch {}

    return res.json({
      success: true,
      message: `Payment Collection is now ${nextStatus ? 'ON (Active)' : 'OFF (Paused)'}.`,
      config: formatConfig(updated)
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/payments/config/history
router.get('/admin/payments/config/history', requireAdminAuth, (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM payment_config_history ORDER BY modified_at DESC LIMIT 100').all();
    return res.json({ success: true, history: rows.map(formatHistory) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/payments/scanners (Upload New QR Scanner)
router.post('/admin/payments/scanners', requireAdminAuth, uploadQrScanner.single('qrImage'), (req, res) => {
  try {
    const { methodType } = req.body;
    if (!methodType || !['GPAY', 'PHONEPE', 'PAYTM'].includes(methodType.toUpperCase())) {
      return res.status(400).json({ success: false, message: 'Valid methodType (GPAY, PHONEPE, PAYTM) is required.' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please select a valid PNG, JPG, or JPEG QR image.' });
    }

    const scannerRow = db.prepare('SELECT * FROM payment_methods WHERE method_type = ?').get(methodType.toUpperCase());
    if (!scannerRow) {
      return res.status(404).json({ success: false, message: 'Payment method slot not found.' });
    }

    const prevQr = scannerRow.qr_image_url;
    const newQrUrl = `/uploads/payments/qrs/${req.file.filename}`;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE payment_methods
      SET qr_image_url = ?, is_active = 1, updated_at = ?, updated_by = ?
      WHERE id = ?
    `).run(newQrUrl, now, req.adminId, scannerRow.id);

    logAudit({
      adminId: req.adminId,
      action: prevQr ? 'SCANNER_REPLACED' : 'SCANNER_UPLOADED',
      paymentMethodId: scannerRow.id,
      previousValue: { qrImageUrl: prevQr },
      newValue: { qrImageUrl: newQrUrl, methodType: scannerRow.method_type },
      req
    });

    const updated = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(scannerRow.id);
    return res.json({
      success: true,
      message: `${scannerRow.name} QR Scanner uploaded and activated successfully.`,
      scanner: formatMethod(updated)
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/payments/scanners/:id (Replace Existing QR Scanner)
router.put('/admin/payments/scanners/:id', requireAdminAuth, uploadQrScanner.single('qrImage'), (req, res) => {
  try {
    const scannerRow = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(req.params.id);
    if (!scannerRow) {
      return res.status(404).json({ success: false, message: 'Scanner record not found.' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a replacement PNG/JPG/JPEG QR image.' });
    }

    const previousUrl = scannerRow.qr_image_url;
    const newQrUrl = `/uploads/payments/qrs/${req.file.filename}`;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE payment_methods
      SET qr_image_url = ?, updated_at = ?, updated_by = ?
      WHERE id = ?
    `).run(newQrUrl, now, req.adminId, scannerRow.id);

    logAudit({
      adminId: req.adminId,
      action: 'SCANNER_REPLACED',
      paymentMethodId: scannerRow.id,
      previousValue: { qrImageUrl: previousUrl },
      newValue: { qrImageUrl: newQrUrl },
      req
    });

    const updated = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(scannerRow.id);
    return res.json({
      success: true,
      message: `${scannerRow.name} QR replaced. Student portal automatically updated.`,
      scanner: formatMethod(updated)
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/payments/scanners/:id/status (Enable / Disable Scanner)
router.patch('/admin/payments/scanners/:id/status', requireAdminAuth, (req, res) => {
  try {
    const { isActive } = req.body;
    const scannerRow = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(req.params.id);
    if (!scannerRow) {
      return res.status(404).json({ success: false, message: 'Scanner not found.' });
    }

    if (isActive && !scannerRow.qr_image_url) {
      return res.status(400).json({
        success: false,
        message: `Cannot enable ${scannerRow.name} without an uploaded QR scanner image.`
      });
    }

    const prevStatus = Boolean(scannerRow.is_active);
    const newStatus = Boolean(isActive) ? 1 : 0;
    const now = new Date().toISOString();

    db.prepare('UPDATE payment_methods SET is_active = ?, updated_at = ?, updated_by = ? WHERE id = ?')
      .run(newStatus, now, req.adminId, scannerRow.id);

    logAudit({
      adminId: req.adminId,
      action: newStatus === 1 ? 'PAYMENT_METHOD_ENABLED' : 'PAYMENT_METHOD_DISABLED',
      paymentMethodId: scannerRow.id,
      previousValue: { isActive: prevStatus },
      newValue: { isActive: Boolean(newStatus), methodType: scannerRow.method_type },
      req
    });

    const updated = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(scannerRow.id);
    return res.json({
      success: true,
      message: `${scannerRow.name} is now ${newStatus === 1 ? 'Enabled' : 'Disabled'}.`,
      scanner: formatMethod(updated)
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/payments/scanners/:id (Delete QR Image, Preserve Historical Submissions)
router.delete('/admin/payments/scanners/:id', requireAdminAuth, (req, res) => {
  try {
    const scannerRow = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(req.params.id);
    if (!scannerRow) {
      return res.status(404).json({ success: false, message: 'Scanner not found.' });
    }

    const pendingRow = db.prepare(`
      SELECT COUNT(*) as count FROM payment_submissions
      WHERE payment_method = ? AND payment_status IN ('Payment Submitted', 'Under Verification')
    `).get(scannerRow.method_type);
    const pendingCount = pendingRow?.count || 0;

    const previousUrl = scannerRow.qr_image_url;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE payment_methods
      SET qr_image_url = NULL, is_active = 0, updated_at = ?, updated_by = ?
      WHERE id = ?
    `).run(now, req.adminId, scannerRow.id);

    logAudit({
      adminId: req.adminId,
      action: 'SCANNER_DELETED',
      paymentMethodId: scannerRow.id,
      previousValue: { qrImageUrl: previousUrl, isActive: true },
      newValue: { qrImageUrl: null, isActive: false, pendingSubmissionsPreserved: pendingCount },
      req
    });

    const updated = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(scannerRow.id);
    return res.json({
      success: true,
      message: `${scannerRow.name} QR scanner deleted and hidden from students. All ${pendingCount} pending and historical payment records are safely preserved.`,
      scanner: formatMethod(updated)
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 3. ADMIN MANUAL BANK VERIFICATION ROUTES
// ============================================================================

// GET /api/admin/payments/submissions (Search & Filter Verification Table)
router.get('/admin/payments/submissions', requireAdminAuth, (req, res) => {
  try {
    const {
      search,
      department,
      paymentMethod,
      paymentStatus,
      reconciliationStatus,
      startDate,
      endDate
    } = req.query;

    const conditions = [];
    const params = [];

    if (search && search.trim()) {
      const q = `%${search.trim().toUpperCase()}%`;
      conditions.push('(UPPER(usn) LIKE ? OR UPPER(utr_number) LIKE ? OR UPPER(student_name) LIKE ? OR UPPER(registration_id) LIKE ?)');
      params.push(q, q, q, q);
    }

    if (department && department !== 'ALL') {
      conditions.push('department = ?');
      params.push(department);
    }

    if (paymentMethod && paymentMethod !== 'ALL') {
      conditions.push('payment_method = ?');
      params.push(paymentMethod);
    }

    if (paymentStatus && paymentStatus !== 'ALL') {
      conditions.push('payment_status = ?');
      params.push(paymentStatus);
    }

    if (reconciliationStatus && reconciliationStatus !== 'ALL') {
      conditions.push('reconciliation_status = ?');
      params.push(reconciliationStatus);
    }

    if (startDate) {
      conditions.push('created_at >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('created_at <= ?');
      params.push(`${endDate}T23:59:59.999Z`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM payment_submissions ${whereClause} ORDER BY created_at DESC`;
    const rows = db.prepare(sql).all(...params);

    return res.json({
      success: true,
      submissions: rows.map(formatSubmission)
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/payments/submissions/:id
router.get('/admin/payments/submissions/:id', requireAdminAuth, (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM payment_submissions WHERE id = ?').get(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Payment submission not found.' });
    }
    return res.json({ success: true, submission: formatSubmission(row) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/payments/submissions/:id/revise-requirement
// Allows an authorized admin to revise a specific student's expected payment requirement and/or recorded paid amount
router.patch('/admin/payments/submissions/:id/revise-requirement', requireAdminAuth, (req, res) => {
  try {
    const { newExpectedAmount, newPaidAmount, reason } = req.body;
    const parsedAmount = Number(newExpectedAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Revised expected amount must be a positive number greater than ₹0.'
      });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'A reason is required to revise an individual student payment requirement.'
      });
    }

    const sub = db.prepare('SELECT * FROM payment_submissions WHERE id = ?').get(req.params.id);
    if (!sub) {
      return res.status(404).json({ success: false, message: 'Submission not found.' });
    }

    const prevExpected = Number(sub.expected_amount);
    const prevAmount = Number(sub.amount);
    const parsedPaid = (newPaidAmount !== undefined && newPaidAmount !== '' && !isNaN(Number(newPaidAmount)) && Number(newPaidAmount) > 0)
      ? Number(newPaidAmount)
      : prevAmount;

    let revisions = [];
    try { if (sub.requirement_revision_history) revisions = JSON.parse(sub.requirement_revision_history); } catch {}

    revisions.push({
      previousExpectedAmount: prevExpected,
      newExpectedAmount: parsedAmount,
      previousPaidAmount: prevAmount,
      newPaidAmount: parsedPaid,
      reason: reason.trim(),
      revisedBy: req.adminId,
      revisedByName: req.adminEmail || 'Administrator',
      revisedAt: new Date().toISOString()
    });

    // Re-evaluate mismatch flag against revised expected amount & paid amount
    const compliance = evaluateAmountCompliance({
      mode: sub.payment_mode_at_submission || 'FIXED',
      expectedAmount: parsedAmount,
      minAmount: sub.min_allowed_at_submission !== null ? Number(sub.min_allowed_at_submission) : 1,
      maxAmount: sub.max_allowed_at_submission !== null ? Number(sub.max_allowed_at_submission) : 10000,
      submittedAmount: parsedPaid,
      ocrAmount: sub.ocr_extracted_amount !== null ? Number(sub.ocr_extracted_amount) : null,
      bankAmount: sub.bank_verified_amount !== null ? Number(sub.bank_verified_amount) : null
    });

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE payment_submissions
      SET expected_amount = ?,
          amount = ?,
          requirement_revision_history = ?,
          amount_mismatch_flag = ?,
          amount_validation_notes = ?,
          updated_at = ?
      WHERE id = ?
    `).run(parsedAmount, parsedPaid, JSON.stringify(revisions), compliance.mismatchFlag ? 1 : 0, compliance.notes, now, sub.id);

    logAudit({
      adminId: req.adminId,
      action: 'STUDENT_REQUIREMENT_REVISED',
      paymentSubmissionId: sub.id,
      previousValue: { expectedAmount: prevExpected, amount: prevAmount },
      newValue: { expectedAmount: parsedAmount, amount: parsedPaid, reason: reason.trim() },
      req
    });

    const updated = db.prepare('SELECT * FROM payment_submissions WHERE id = ?').get(sub.id);
    return res.json({
      success: true,
      message: `Student ${sub.usn} payment requirement revised from ₹${prevExpected} to ₹${parsedAmount} with full audit trail.`,
      submission: formatSubmission(updated)
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/payments/submissions/:id/verify (Enhanced with Bank Amount & Mode Validation)
router.patch('/admin/payments/submissions/:id/verify', requireAdminAuth, (req, res) => {
  try {
    const { adminRemarks, bankConfirmed, bankVerifiedAmount } = req.body;
    if (!bankConfirmed) {
      return res.status(400).json({
        success: false,
        message: 'You must confirm that the incoming UPI credit, exact amount, and UTR were verified in the official bank statement.'
      });
    }

    const sub = db.prepare('SELECT * FROM payment_submissions WHERE id = ?').get(req.params.id);
    if (!sub) {
      return res.status(404).json({ success: false, message: 'Submission not found.' });
    }

    const actualBankCredit = (bankVerifiedAmount !== undefined && bankVerifiedAmount !== '' && bankVerifiedAmount !== null)
      ? Number(bankVerifiedAmount)
      : Number(sub.amount);

    if (isNaN(actualBankCredit) || actualBankCredit <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please enter the valid actual amount credited in the bank account.'
      });
    }

    // Validate actual bank credit against submission's locked mode (Fixed vs Flexible Range)
    const compliance = evaluateAmountCompliance({
      mode: sub.payment_mode_at_submission || 'FIXED',
      expectedAmount: Number(sub.expected_amount),
      minAmount: sub.min_allowed_at_submission !== null ? Number(sub.min_allowed_at_submission) : 1,
      maxAmount: sub.max_allowed_at_submission !== null ? Number(sub.max_allowed_at_submission) : 10000,
      submittedAmount: Number(sub.amount),
      ocrAmount: sub.ocr_extracted_amount !== null ? Number(sub.ocr_extracted_amount) : null,
      bankAmount: actualBankCredit
    });

    const prevStatus = sub.payment_status;
    const now = new Date().toISOString();
    const finalRemarks = adminRemarks !== undefined && String(adminRemarks).trim() !== ''
      ? String(adminRemarks).trim()
      : (sub.admin_remarks || '');

    const validationNotes = compliance.isCompliant
      ? 'Verified: Exact match with mode rules'
      : `Admin Approved & Verified: Bank credit ₹${actualBankCredit} confirmed (Original expected: ₹${sub.expected_amount}). ${compliance.notes}`;

    db.prepare(`
      UPDATE payment_submissions
      SET payment_status = 'Payment Verified',
          bank_verified_amount = ?,
          amount_mismatch_flag = 0,
          amount_validation_notes = ?,
          admin_remarks = ?,
          rejection_reason = '',
          verified_by = ?,
          verified_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(actualBankCredit, validationNotes, finalRemarks, req.adminId, now, now, sub.id);

    // Sync to registrations table
    try {
      db.prepare(`
        UPDATE registrations
        SET payment_status = 'Payment Verified', payment_verified = 1
        WHERE id = ? OR registration_id = ?
      `).run(sub.registration_id, sub.registration_id);
    } catch {}

    // Lock student-vendor assignment by payment
    try {
      db.prepare(`
        UPDATE student_vendor_assignments
        SET has_paid_or_submitted = 1, assignment_status = 'LOCKED_BY_PAYMENT', updated_at = ?
        WHERE registration_id = ?
      `).run(now, sub.registration_id);
    } catch {}

    // Immediately synchronize with Student Tracking Record
    try {
      db.prepare(`
        UPDATE student_tracking_records
        SET payment_status = 'Payment Successful',
            is_payment_locked = 1,
            updated_at = ?
        WHERE registration_id = ? OR usn = ?
      `).run(now, sub.registration_id, sub.usn);
    } catch {}

    // Append entry to Vendor Transaction History so the assigned Vendor sees it in their portal
    try {
      db.prepare(`
        INSERT INTO vendor_transaction_history (
          id, submission_id, registration_id, student_name, usn, department, year_semester, section,
          vendor_ref, vendor_id, vendor_name, payment_method, payment_amount, verified_bank_amount,
          utr_number, payment_screenshot, previous_status, payment_status, verified_by_vendor_id,
          verified_by_vendor_name, verifier_role, remarks, action_timestamp, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        sub.id,
        sub.registration_id,
        sub.student_name,
        sub.usn,
        sub.department,
        sub.year_semester,
        sub.section,
        null,
        sub.vendor_id,
        sub.vendor_name || 'Assigned Vendor',
        sub.payment_method,
        Number(sub.amount),
        actualBankCredit,
        sub.utr_number,
        sub.payment_screenshot,
        prevStatus,
        'Payment Verified',
        req.adminId,
        'Administrator',
        'ADMIN',
        finalRemarks,
        now,
        now
      );
    } catch (e) {
      console.warn('Vendor transaction history insert failed:', e.message);
    }

    // Broadcast real-time SSE payment lifecycle event across all 3 portals (Student, Vendor, Admin)
    try {
      sseHub.broadcastPaymentLifecycleEvent({
        eventName: 'PAYMENT_VERIFIED',
        registrationId: sub.registration_id,
        vendorId: sub.vendor_id,
        payload: {
          submissionId: sub.id,
          registrationId: sub.registration_id,
          studentName: sub.student_name,
          usn: sub.usn,
          vendorId: sub.vendor_id,
          amount: actualBankCredit,
          utrNumber: sub.utr_number,
          paymentStatus: 'Payment Verified',
          studentDisplayStatus: 'Payment Successful',
          verifiedByRole: 'ADMIN'
        }
      });
      sseHub.broadcast('GLOBAL_SYNC_UPDATE', { event: 'PAYMENT_VERIFIED', registrationId: sub.registration_id, vendorId: sub.vendor_id });
    } catch {}

    logAudit({
      adminId: req.adminId,
      action: compliance.isCompliant ? 'PAYMENT_VERIFIED' : 'PAYMENT_VERIFIED_WITH_AMOUNT_OVERRIDE',
      paymentSubmissionId: sub.id,
      previousValue: { paymentStatus: prevStatus, expectedAmount: sub.expected_amount, amount: sub.amount },
      newValue: {
        paymentStatus: 'Payment Verified',
        utrNumber: sub.utr_number,
        expectedAmount: sub.expected_amount,
        bankVerifiedAmount: actualBankCredit,
        paymentMode: sub.payment_mode_at_submission || 'FIXED',
        adminRemarks: finalRemarks,
        validationNotes
      },
      req
    });

    const updated = db.prepare('SELECT * FROM payment_submissions WHERE id = ?').get(sub.id);
    return res.json({
      success: true,
      message: `Payment for USN ${sub.usn} (₹${actualBankCredit}) marked as PAYMENT VERIFIED.`,
      submission: formatSubmission(updated)
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/payments/submissions/:id/reject (Manual Rejection with Mandatory Reason)
router.patch('/admin/payments/submissions/:id/reject', requireAdminAuth, (req, res) => {
  try {
    const { rejectionReason, adminRemarks } = req.body;
    if (!rejectionReason || !rejectionReason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'A rejection reason is mandatory when rejecting a payment submission.'
      });
    }

    const sub = db.prepare('SELECT * FROM payment_submissions WHERE id = ?').get(req.params.id);
    if (!sub) {
      return res.status(404).json({ success: false, message: 'Submission not found.' });
    }

    const prevStatus = sub.payment_status;
    const now = new Date().toISOString();
    const finalRemarks = adminRemarks !== undefined ? adminRemarks.trim() : (sub.admin_remarks || '');

    db.prepare(`
      UPDATE payment_submissions
      SET payment_status = 'Payment Rejected',
          rejection_reason = ?,
          admin_remarks = ?,
          verified_by = ?,
          verified_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(rejectionReason.trim(), finalRemarks, req.adminId, now, now, sub.id);

    // Sync to registrations table
    try {
      db.prepare(`
        UPDATE registrations
        SET payment_status = 'Payment Rejected', payment_verified = 0
        WHERE id = ? OR registration_id = ?
      `).run(sub.registration_id, sub.registration_id);
    } catch {}

    logAudit({
      adminId: req.adminId,
      action: 'PAYMENT_REJECTED',
      paymentSubmissionId: sub.id,
      previousValue: { paymentStatus: prevStatus },
      newValue: {
        paymentStatus: 'Payment Rejected',
        rejectionReason: rejectionReason.trim(),
        adminRemarks: finalRemarks
      },
      req
    });

    const updated = db.prepare('SELECT * FROM payment_submissions WHERE id = ?').get(sub.id);
    return res.json({
      success: true,
      message: `Payment for USN ${sub.usn} marked as PAYMENT REJECTED.`,
      submission: formatSubmission(updated)
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/payments/submissions/:id/remarks (Update Remarks / Mark Under Verification)
router.patch('/admin/payments/submissions/:id/remarks', requireAdminAuth, (req, res) => {
  try {
    const { adminRemarks, markUnderVerification } = req.body;
    const sub = db.prepare('SELECT * FROM payment_submissions WHERE id = ?').get(req.params.id);
    if (!sub) {
      return res.status(404).json({ success: false, message: 'Submission not found.' });
    }

    const prevRemarks = sub.admin_remarks;
    const prevStatus = sub.payment_status;
    let newStatus = sub.payment_status;

    if (markUnderVerification && sub.payment_status === 'Payment Submitted') {
      newStatus = 'Under Verification';
    }

    const finalRemarks = adminRemarks !== undefined ? adminRemarks : (sub.admin_remarks || '');
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE payment_submissions
      SET admin_remarks = ?, payment_status = ?, updated_at = ?
      WHERE id = ?
    `).run(finalRemarks, newStatus, now, sub.id);

    logAudit({
      adminId: req.adminId,
      action: 'ADMIN_REMARKS_MODIFIED',
      paymentSubmissionId: sub.id,
      previousValue: { adminRemarks: prevRemarks, paymentStatus: prevStatus },
      newValue: { adminRemarks: finalRemarks, paymentStatus: newStatus },
      req
    });

    const updated = db.prepare('SELECT * FROM payment_submissions WHERE id = ?').get(sub.id);
    return res.json({ success: true, message: 'Remarks updated.', submission: formatSubmission(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 4. BANK STATEMENT CSV RECONCILIATION ASSISTANCE TOOL
// ============================================================================

let latestReconciliationReport = {
  lastRunAt: null,
  totalBankCreditsParsed: 0,
  matched: [],
  unmatchedSubmissions: [],
  suspicious: [],
  unclaimedBankCredits: []
};

// POST /api/admin/payments/reconciliation/upload
router.post(
  '/admin/payments/reconciliation/upload',
  requireAdminAuth,
  uploadBankCsv.single('statementCsv'),
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Please upload a bank statement CSV file.' });
      }

      const csvText = req.file.buffer.toString('utf-8');
      const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
      if (lines.length < 2) {
        return res.status(400).json({ success: false, message: 'CSV file contains no transaction rows.' });
      }

      const parseCsvLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            inQuotes = !inQuotes;
          } else if (ch === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += ch;
          }
        }
        result.push(current.trim());
        return result;
      };

      const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
      const findIdx = (keywords) => headers.findIndex((h) => keywords.some((k) => h.includes(k)));

      const dateIdx = findIdx(['date', 'txn date', 'value date']);
      const descIdx = findIdx(['description', 'narration', 'particulars', 'remarks']);
      const refIdx = findIdx(['utr', 'ref', 'chq', 'reference', 'transaction id']);
      const creditIdx = findIdx(['credit', 'deposit', 'cr amount']);
      const amountIdx = findIdx(['amount', 'txn amount']);
      const typeIdx = findIdx(['type', 'cr/dr', 'dr/cr']);

      const bankCredits = [];
      const utrCountsInBank = {};

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        if (cols.length < 2) continue;

        const dateVal = dateIdx >= 0 ? cols[dateIdx] : cols[0];
        const descVal = descIdx >= 0 ? cols[descIdx] : cols.join(' ');
        const rawRef = refIdx >= 0 ? cols[refIdx] : '';

        let creditAmount = 0;
        if (creditIdx >= 0 && cols[creditIdx]) {
          creditAmount = parseFloat(cols[creditIdx].replace(/[^0-9.-]/g, '')) || 0;
        } else if (amountIdx >= 0 && cols[amountIdx]) {
          const rawAmt = parseFloat(cols[amountIdx].replace(/[^0-9.-]/g, '')) || 0;
          const drCr = typeIdx >= 0 ? (cols[typeIdx] || '').toUpperCase() : 'CR';
          if (!drCr.includes('DR') && !drCr.includes('DEBIT')) {
            creditAmount = rawAmt;
          }
        }

        if (creditAmount <= 0) continue;

        let extractedUtr = normalizeUtr(rawRef);
        if (!extractedUtr || extractedUtr.length < 10) {
          const match12 = descVal.match(/\b(\d{12})\b/);
          if (match12) extractedUtr = match12[1];
        }

        if (extractedUtr) {
          utrCountsInBank[extractedUtr] = (utrCountsInBank[extractedUtr] || 0) + 1;
        }

        bankCredits.push({
          rowNumber: i + 1,
          date: dateVal,
          description: descVal,
          utrNumber: extractedUtr,
          creditAmount
        });
      }

      const submissionRows = db.prepare('SELECT * FROM payment_submissions ORDER BY created_at DESC').all();
      const matched = [];
      const unmatchedSubmissions = [];
      const suspicious = [];
      const matchedBankUtrs = new Set();
      const now = new Date().toISOString();

      for (const row of submissionRows) {
        const subUtr = normalizeUtr(row.utr_number);
        const matchingRows = bankCredits.filter((b) => b.utrNumber && b.utrNumber === subUtr);

        if (matchingRows.length === 0) {
          db.prepare("UPDATE payment_submissions SET reconciliation_status = 'Unmatched', updated_at = ? WHERE id = ?")
            .run(now, row.id);
          unmatchedSubmissions.push({
            submissionId: row.id,
            usn: row.usn,
            studentName: row.student_name,
            paymentMethod: row.payment_method,
            submittedAmount: Number(row.amount),
            utrNumber: row.utr_number,
            paymentStatus: row.payment_status,
            reason: 'No incoming UPI credit with this UTR found in uploaded statement'
          });
        } else if (matchingRows.length > 1 || (utrCountsInBank[subUtr] && utrCountsInBank[subUtr] > 1)) {
          matchedBankUtrs.add(subUtr);
          db.prepare("UPDATE payment_submissions SET reconciliation_status = 'Suspicious', updated_at = ? WHERE id = ?")
            .run(now, row.id);
          suspicious.push({
            submissionId: row.id,
            usn: row.usn,
            studentName: row.student_name,
            submittedAmount: Number(row.amount),
            bankAmount: matchingRows[0].creditAmount,
            utrNumber: row.utr_number,
            paymentStatus: row.payment_status,
            reason: 'Duplicate UTR entries found in bank statement'
          });
        } else {
          const bankRow = matchingRows[0];
          matchedBankUtrs.add(subUtr);

          if (Number(bankRow.creditAmount) !== Number(row.expected_amount)) {
            db.prepare("UPDATE payment_submissions SET reconciliation_status = 'Suspicious', amount_mismatch_flag = 1, updated_at = ? WHERE id = ?")
              .run(now, row.id);
            suspicious.push({
              submissionId: row.id,
              usn: row.usn,
              studentName: row.student_name,
              submittedAmount: Number(row.expected_amount),
              bankAmount: bankRow.creditAmount,
              utrNumber: row.utr_number,
              paymentStatus: row.payment_status,
              reason: `Amount Mismatch: Expected ₹${row.expected_amount}, Bank Credited ₹${bankRow.creditAmount}`
            });
          } else {
            // Assistance status only: Does NOT auto-verify!
            const reconDetails = JSON.stringify({
              bankDate: bankRow.date,
              bankAmount: bankRow.creditAmount,
              bankDescription: bankRow.description,
              matchedAt: now
            });
            db.prepare("UPDATE payment_submissions SET reconciliation_status = 'Matched', reconciliation_details = ?, updated_at = ? WHERE id = ?")
              .run(reconDetails, now, row.id);

            matched.push({
              submissionId: row.id,
              usn: row.usn,
              studentName: row.student_name,
              paymentMethod: row.payment_method,
              submittedAmount: Number(row.amount),
              bankAmount: bankRow.creditAmount,
              utrNumber: row.utr_number,
              bankDate: bankRow.date,
              bankDescription: bankRow.description,
              paymentStatus: row.payment_status
            });
          }
        }
      }

      const unclaimedBankCredits = bankCredits.filter(
        (b) => !b.utrNumber || !matchedBankUtrs.has(b.utrNumber)
      );

      latestReconciliationReport = {
        lastRunAt: new Date().toISOString(),
        totalBankCreditsParsed: bankCredits.length,
        matched,
        unmatchedSubmissions,
        suspicious,
        unclaimedBankCredits
      };

      logAudit({
        adminId: req.adminId,
        action: 'CSV_RECONCILIATION_RUN',
        newValue: {
          matchedCount: matched.length,
          unmatchedCount: unmatchedSubmissions.length,
          suspiciousCount: suspicious.length
        },
        req
      });

      return res.json({
        success: true,
        message: 'Bank statement CSV parsed. Review the assistance report below and manually verify confirmed credits.',
        report: latestReconciliationReport
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
);

// GET /api/admin/payments/reconciliation/results
router.get('/admin/payments/reconciliation/results', requireAdminAuth, (_req, res) => {
  return res.json({
    success: true,
    report: latestReconciliationReport
  });
});

// GET /api/admin/payments/audit-logs
router.get('/admin/payments/audit-logs', requireAdminAuth, (_req, res) => {
  try {
    const logs = db.prepare(`
      SELECT * FROM payment_audit_logs
      ORDER BY timestamp DESC
      LIMIT 150
    `).all();

    const formatted = logs.map(l => ({
      _id: l.id,
      id: l.id,
      adminId: l.admin_id,
      actorType: l.actor_type,
      action: l.action,
      paymentSubmissionId: l.payment_submission_id,
      paymentMethodId: l.payment_method_id,
      previousValue: l.previous_value ? JSON.parse(l.previous_value) : null,
      newValue: l.new_value ? JSON.parse(l.new_value) : null,
      ipAddress: l.ip_address,
      timestamp: l.timestamp
    }));

    return res.json({ success: true, logs: formatted });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;


import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { db } from './db.js';
import { resolveOrCreateStudentVendorAssignment } from './vendorRoutes.js';
import sseHub from './sseHub.js';
import { signStudentTrackingToken, requireAdminJwt, extractJwtToken, JWT_SECRET } from './jwtAuth.js';
import { validateUsnAndDepartmentOnBackend } from './middleware/validateUsnDepartment.js';
import { validateTailorMeasurementsOnBackend } from './utils/validateUniformMeasurements.js';

const router = express.Router();

// IP-based Rate Limiter for Student Tracking Endpoints (Max 60 requests per 15 minutes per IP)
const trackingRateLimitMap = new Map();
const trackingRateLimiter = (req, res, next) => {
  const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 60;

  const record = trackingRateLimitMap.get(clientIp);
  if (!record || now > record.resetAt) {
    trackingRateLimitMap.set(clientIp, { count: 1, resetAt: now + windowMs });
    return next();
  }

  if (record.count >= maxAttempts) {
    const waitMinutes = Math.ceil((record.resetAt - now) / 60000);
    return res.status(429).json({
      success: false,
      message: `Too many requests from your network. Please wait ${waitMinutes} minute(s) before trying again.`
    });
  }

  record.count += 1;
  next();
};

const TRACKING_SECRETS = [
  process.env.TRACKING_SECRET,
  'mit_mysore_tracking_secret_2026',
  process.env.JWT_SECRET,
  process.env.SESSION_SECRET,
  'mit_mysore_uniform_super_secret_2026'
].filter(Boolean);

const PRIMARY_TRACKING_SECRET = process.env.TRACKING_SECRET || 'mit_mysore_tracking_secret_2026';
const AES_KEY = crypto.createHash('sha256').update(PRIMARY_TRACKING_SECRET).digest();

const hashValue = (val, secret = PRIMARY_TRACKING_SECRET) =>
  crypto.createHmac('sha256', secret).update(String(val).trim()).digest('hex');

const verifyHashMatch = (val, storedHash) => {
  if (!val || !storedHash) return false;
  const cleanVal = String(val).trim();
  for (const secret of TRACKING_SECRETS) {
    const candidate = crypto.createHmac('sha256', secret).update(cleanVal).digest('hex');
    if (candidate === storedHash) return true;
  }
  return false;
};

const encryptPin = (pin) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', AES_KEY, iv);
  let encrypted = cipher.update(String(pin), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
};

const decryptPin = (cipherText) => {
  if (!cipherText || typeof cipherText !== 'string' || !cipherText.includes(':')) {
    return null;
  }
  try {
    const [ivHex, encryptedHex] = String(cipherText).split(':');
    const iv = Buffer.from(ivHex, 'hex');
    for (const secret of TRACKING_SECRETS) {
      try {
        const key = crypto.createHash('sha256').update(secret).digest();
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        if (/^\d{6}$/.test(decrypted)) {
          return decrypted;
        }
      } catch (_) {
        // try next candidate secret
      }
    }
  } catch (e) {
    return null;
  }
  return null;
};

// Generate collision-free unique Application ID using SQLite atomic sequence
const generateUniqueApplicationId = () => {
  const year = new Date().getFullYear();
  const counterId = `MIT_APP_${year}`;

  db.exec('BEGIN IMMEDIATE');
  try {
    let row = db.prepare('SELECT seq FROM application_sequences WHERE id = ?').get(counterId);
    let curSeq = row ? row.seq + 1 : 10001;

    db.prepare(`
      INSERT INTO application_sequences (id, seq) VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET seq = ?
    `).run(counterId, curSeq, curSeq);

    db.exec('COMMIT');
    return `MIT-${year}-${curSeq}`;
  } catch (err) {
    if (db.inTransaction) {
      try { db.exec('ROLLBACK'); } catch (_) {}
    }
    throw err;
  }
};

// Generate cryptographically random 6-digit numeric PIN (100000 - 999999)
const generateSixDigitPin = () => {
  return String(crypto.randomInt(100000, 1000000));
};

// Helper: Map database statuses cleanly for Student & Admin views
export const resolveUnifiedPaymentStatus = (submission, trackingRecord) => {
  if (typeof submission === 'string') {
    submission = { payment_status: submission };
  }
  if (!submission) {
    const fallback = trackingRecord?.payment_status || trackingRecord?.paymentStatus || 'Payment Pending';
    if (fallback === 'CASH PAYMENT PENDING' || fallback === 'CASH RECEIVED' || fallback === 'CASH PAYMENT REJECTED') {
      return fallback;
    }
    return trackingRecord?.payment_status === 'Payment Successful' || trackingRecord?.paymentStatus === 'Payment Successful'
      ? 'Payment Successful'
      : fallback;
  }
  const st = submission.payment_status || submission.paymentStatus;
  if (st === 'CASH PAYMENT PENDING' || st === 'CASH RECEIVED' || st === 'CASH PAYMENT REJECTED') {
    return st;
  }
  if (st === 'Verified' || st === 'Payment Verified' || st === 'Payment Successful') {
    return 'Payment Successful';
  }
  if (st === 'Rejected' || st === 'Payment Rejected' || st === 'Payment Not Received') {
    return 'Payment Rejected';
  }
  if (st === 'Under Verification') {
    return 'Under Verification';
  }
  if (st === 'Submitted' || st === 'Payment Submitted') {
    return 'Payment Submitted';
  }
  return 'Payment Pending';
};

// Normalize any DB payment status into the required Student Live Statuses
export const normalizeStudentPaymentStatus = (rawStatus) => {
  if (rawStatus === 'CASH PAYMENT PENDING' || rawStatus === 'CASH RECEIVED' || rawStatus === 'CASH PAYMENT REJECTED') {
    return rawStatus;
  }
  return resolveUnifiedPaymentStatus({ payment_status: rawStatus });
};

// Helper: Assemble complete read-only student & payment status payload from DB
const buildTrackingStatusPayload = (trackingRecord, includePinForOwner = false) => {
  const regId = trackingRecord.registration_id;
  const usn = trackingRecord.usn;

  // Query latest submission from payment_submissions
  let submission = db.prepare(`
    SELECT * FROM payment_submissions
    WHERE registration_id = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(regId);

  if (!submission && usn) {
    const usnCandidate = db.prepare(`
      SELECT * FROM payment_submissions
      WHERE UPPER(TRIM(usn)) = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(usn.toUpperCase().trim());
    if (usnCandidate && (!usnCandidate.registration_id || usnCandidate.registration_id === regId)) {
      submission = usnCandidate;
    }
  }

  const livePaymentStatus = resolveUnifiedPaymentStatus(submission, trackingRecord);

  const profile = typeof trackingRecord.student_profile === 'string'
    ? JSON.parse(trackingRecord.student_profile)
    : (trackingRecord.student_profile || {});

  const uniformSel = typeof trackingRecord.uniform_selection === 'string'
    ? JSON.parse(trackingRecord.uniform_selection)
    : (trackingRecord.uniform_selection || {});

  const assignedVnd = typeof trackingRecord.assigned_vendor === 'string'
    ? JSON.parse(trackingRecord.assigned_vendor)
    : (trackingRecord.assigned_vendor || {});

  const isCashPayment = submission?.payment_method === 'CASH' ||
    submission?.payment_mode_type === 'CASH' ||
    livePaymentStatus.includes('CASH');

  const payload = {
    applicationId: trackingRecord.application_id,
    registrationId: trackingRecord.registration_id,
    currentStep: trackingRecord.current_step,
    isRegistrationLocked: Boolean(trackingRecord.is_registration_locked),
    isPaymentLocked:
      livePaymentStatus === 'Payment Submitted' ||
      livePaymentStatus === 'Under Verification' ||
      livePaymentStatus === 'Payment Successful' ||
      livePaymentStatus === 'CASH PAYMENT PENDING' ||
      livePaymentStatus === 'CASH RECEIVED',
    studentProfile: profile,
    uniformSelection: uniformSel,
    assignedVendor: assignedVnd,
    registeredAt: trackingRecord.created_at,
    payment: {
      paymentStatus: livePaymentStatus,
      paymentModeType: isCashPayment ? 'CASH' : 'UPI',
      hasSubmittedPayment: Boolean(submission),
      paymentMethod: submission?.payment_method || (isCashPayment ? 'CASH' : null),
      cashPaymentRefId: submission?.cash_payment_ref_id || null,
      actualAmountReceived: submission?.actual_amount_received !== null && submission?.actual_amount_received !== undefined ? Number(submission.actual_amount_received) : null,
      expectedAmount: submission?.expected_amount || null,
      paidAmount: submission?.actual_amount_received || submission?.bank_verified_amount || submission?.amount || null,
      utrNumber: submission?.utr_number || null,
      paymentScreenshot: submission?.payment_screenshot || null,
      submittedAt: submission?.created_at || null,
      verifiedAt:
        (livePaymentStatus === 'Payment Successful' || livePaymentStatus === 'CASH RECEIVED') ? submission?.verified_at : null,
      rejectedAt:
        (livePaymentStatus === 'Payment Rejected' || livePaymentStatus === 'CASH PAYMENT REJECTED') ? (submission?.verified_at || submission?.updated_at) : null,
      verifiedByVendor: submission?.verified_by || assignedVnd?.vendorName || null,
      rejectionReason:
        (livePaymentStatus === 'Payment Rejected' || livePaymentStatus === 'CASH PAYMENT REJECTED')
          ? (submission?.rejection_reason ||
             submission?.admin_remarks ||
             (isCashPayment ? 'Cash payment request rejected by vendor.' : 'Payment could not be verified in the designated bank statement.'))
          : null
    }
  };

  if (includePinForOwner) {
    payload.trackingPin = decryptPin(trackingRecord.encrypted_tracking_pin);
  }

  return payload;
};

// ============================================================================
// 1. GENERATE CREDENTIALS & SAVE REGISTRATION PROGRESS AUTOMATICALLY
// ============================================================================

// POST /api/tracking/register-or-sync
router.post('/tracking/register-or-sync', trackingRateLimiter, validateUsnAndDepartmentOnBackend, (req, res) => {
  try {
    const {
      registrationId,
      studentName,
      fullName,
      usn,
      email,
      collegeEmail,
      mobile,
      phone,
      educationLevel = 'UG',
      course = 'B.E.',
      department,
      academicYear = '2026-27',
      semester = 1,
      section,
      gender = 'Male',
      shirtSize = 'M',
      trouserSize = '32',
      blazerSize = '',
      shoeSize = '',
      packageType = 'standard',
      selectedOptions = {},
      uniformMeasurements = null,
      browserResumeToken: incomingResumeToken
    } = req.body;

    const resolvedName = (studentName || fullName || '').trim();
    const cleanUsn = String(usn || '').toUpperCase().trim();
    const resolvedEmail = (email || collegeEmail || '').trim();
    const resolvedPhone = (mobile || phone || '').trim();
    const cleanTrouserSize = String(trouserSize || '32').replace(/"/g, '').trim();

    if (!cleanUsn || !resolvedName || !department || !section) {
      return res.status(400).json({
        success: false,
        message: 'Student Name, USN, Department, and Section are required.'
      });
    }

    // 1. Prevent Duplicate Registrations: Check if this USN already has a Tracking Record
    let existingRecord = db.prepare('SELECT * FROM student_tracking_records WHERE usn = ?').get(cleanUsn);
    if (existingRecord) {
      const isOwner = Boolean(
        incomingResumeToken &&
        existingRecord.browser_resume_token_hash &&
        verifyHashMatch(incomingResumeToken, existingRecord.browser_resume_token_hash)
      );

      let browserResumeToken = incomingResumeToken;
      if (isOwner) {
        browserResumeToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = hashValue(browserResumeToken);
        db.prepare(`
          UPDATE student_tracking_records
          SET browser_resume_token_hash = ?, updated_at = ?
          WHERE usn = ?
        `).run(tokenHash, new Date().toISOString(), cleanUsn);
        existingRecord.browser_resume_token_hash = tokenHash;
      }

      const statusPayload = buildTrackingStatusPayload(existingRecord, isOwner);
      const readOnlyViewToken = signStudentTrackingToken({
        applicationId: existingRecord.application_id,
        registrationId: existingRecord.registration_id,
        usn: existingRecord.usn
      });

      return res.status(200).json({
        success: true,
        alreadyRegistered: true,
        message:
          'Your uniform registration is already saved in our database. Restoring your saved progress and credentials.',
        browserResumeToken: isOwner ? browserResumeToken : null,
        readOnlyViewToken,
        trackingData: statusPayload
      });
    }

    // 2. Ensure Registration document exists in registrations table
    let resolvedRegId = registrationId;
    let existingReg = db.prepare('SELECT * FROM registrations WHERE usn = ?').get(cleanUsn);

    let validatedMeasurements = null;
    if (uniformMeasurements && uniformMeasurements.garments) {
      const vResult = validateTailorMeasurementsOnBackend({ course, gender, uniformMeasurements });
      if (vResult.isValid) {
        validatedMeasurements = vResult;
      }
    }

    const remarksVal = String(uniformMeasurements?.remarks || req.body.remarks || '').trim();
    const garmentsData = validatedMeasurements?.sanitizedGarments || uniformMeasurements?.garments || {};
    const measurementsJson = JSON.stringify({
      garments: garmentsData,
      remarks: remarksVal
    });

    if (existingReg) {
      resolvedRegId = existingReg.registration_id || existingReg.id;
      try {
        db.prepare(`
          UPDATE registrations
          SET blazer_size = COALESCE(NULLIF(?, ''), blazer_size),
              uniform_measurements = COALESCE(NULLIF(?, ''), uniform_measurements)
          WHERE id = ? OR usn = ?
        `).run(blazerSize || '', measurementsJson, existingReg.id, cleanUsn);
      } catch {}
    } else {
      const now = new Date();
      const submittedAt = now.toISOString();
      const editableUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      const studentId = crypto.randomUUID();
      const countRow = db.prepare('SELECT COUNT(*) as count FROM registrations').get();
      const count = (countRow?.count || 0) + 1;
      resolvedRegId = resolvedRegId || `${cleanUsn}-${count}`;

      // Find active campaign
      const activeCamp = db.prepare('SELECT id, academic_year FROM campaigns WHERE active = 1 ORDER BY created_at DESC LIMIT 1').get();
      const campId = activeCamp?.id || 'default-camp-2026';

      db.prepare(`
        INSERT INTO registrations (
          id, registration_id, campaign_id, full_name, gender, usn, phone, college_email,
          department, semester, section, academic_year, shirt_size, trouser_size, blazer_size, uniform_measurements,
          submission_status, production_status, distribution_status,
          submitted_at, editable_until, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?,
          'submitted', 'pending', 'pending',
          ?, ?, ?, ?
        )
      `).run(
        studentId, resolvedRegId, campId, resolvedName, gender || 'Male', cleanUsn, resolvedPhone, resolvedEmail || null,
        department, Number(semester) || 1, section, academicYear || '2026-27', shirtSize || 'M', cleanTrouserSize || '32', blazerSize || '', measurementsJson,
        submittedAt, editableUntil, submittedAt, submittedAt
      );
    }

    // 3. Auto-assign student to their exclusive vendor
    let vendorAssignment = null;
    try {
      vendorAssignment = resolveOrCreateStudentVendorAssignment({
        registrationId: resolvedRegId,
        usn: cleanUsn,
        studentName: resolvedName,
        educationLevel,
        course,
        department,
        academicYear,
        semester,
        section,
        gender
      });
    } catch (e) {
      // Vendor assignment fallback
    }

    // 4. Generate Unique Application ID & Secure 6-Digit PIN
    const applicationId = generateUniqueApplicationId();
    const rawPin = generateSixDigitPin();
    const browserResumeToken = crypto.randomBytes(32).toString('hex');
    const nowIso = new Date().toISOString();

    const studentProfile = {
      studentName: resolvedName,
      usn: cleanUsn,
      email: resolvedEmail,
      mobile: resolvedPhone,
      educationLevel,
      course,
      department: department.toUpperCase().trim(),
      academicYear,
      semester,
      section: section.toUpperCase().trim(),
      gender: gender || 'Male'
    };

    const courseClean = String(course || 'B.E.').toUpperCase().replace(/[^A-Z]/g, '');
    const isPg = courseClean === 'MBA' || courseClean === 'MCA';
    const isFemale = ['FEMALE', 'F', 'GIRL', 'GIRLS'].includes(String(gender || 'Male').toUpperCase().trim());

    const uniformSelection = {
      shirtSize: shirtSize || 'M',
      trouserSize: cleanTrouserSize || '32',
      blazerSize: blazerSize || '',
      shoeSize: shoeSize || '',
      layoutKey: validatedMeasurements?.layoutKey || `${isPg ? 'PG' : 'BE'}_${isFemale ? 'FEMALE' : 'MALE'}`,
      measurementUnit: 'inches',
      garments: validatedMeasurements?.sanitizedGarments || uniformMeasurements?.garments || {},
      remarks: remarksVal,
      packageType,
      selectedOptions
    };

    const assignedVendor = vendorAssignment
      ? {
          vendorId: vendorAssignment.vendorId,
          vendorName: vendorAssignment.vendorName,
          allocationId: vendorAssignment.allocationId
        }
      : {
          vendorId: '',
          vendorName: 'Uniform Vendor Assignment In Progress',
          allocationId: ''
        };

    let trackingExpectedAmount = null;
    if (vendorAssignment?.vendorId) {
      const vCfg = db.prepare('SELECT payment_amount FROM vendor_payment_configurations WHERE vendor_id = ?').get(vendorAssignment.vendorId);
      if (vCfg && vCfg.payment_amount && Number(vCfg.payment_amount) > 0) {
        trackingExpectedAmount = Number(vCfg.payment_amount);
      }
    }

    db.prepare(`
      INSERT INTO student_tracking_records (
        id, application_id, registration_id, usn, tracking_pin_hash, encrypted_tracking_pin,
        browser_resume_token_hash, failed_pin_attempts, locked_until, last_checked_at,
        current_step, registration_status, payment_status, expected_amount,
        is_registration_locked, is_payment_locked, student_profile,
        uniform_selection, assigned_vendor, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      applicationId,
      resolvedRegId,
      cleanUsn,
      hashValue(rawPin),
      encryptPin(rawPin),
      hashValue(browserResumeToken),
      0,
      null,
      null,
      4,
      'Registration Completed',
      'Payment Pending',
      trackingExpectedAmount,
      1,
      0,
      JSON.stringify(studentProfile),
      JSON.stringify(uniformSelection),
      JSON.stringify(assignedVendor),
      nowIso,
      nowIso
    );

    const insertedRecord = db.prepare('SELECT * FROM student_tracking_records WHERE application_id = ?').get(applicationId);
    const statusPayload = buildTrackingStatusPayload(insertedRecord, true);

    const readOnlyViewToken = signStudentTrackingToken({
      applicationId: insertedRecord.application_id,
      registrationId: insertedRecord.registration_id,
      usn: insertedRecord.usn
    });

    if (assignedVendor?.vendorId) {
      sseHub.notifyVendor(assignedVendor.vendorId, 'NEW_STUDENT_ASSIGNED', {
        registrationId: resolvedRegId,
        applicationId: applicationId,
        studentName: resolvedName,
        usn: cleanUsn,
        department: studentProfile.department,
        academicYear: studentProfile.academicYear,
        section: studentProfile.section,
        shirtSize: uniformSelection.shirtSize,
        trouserSize: uniformSelection.trouserSize
      });
    }
    sseHub.notifyAdmins('NEW_STUDENT_REGISTERED', {
      applicationId,
      usn: cleanUsn,
      vendorId: assignedVendor?.vendorId
    });

    return res.status(201).json({
      success: true,
      alreadyRegistered: false,
      message: 'Registration saved! Your unique Application ID and 6-Digit Tracking PIN have been generated.',
      browserResumeToken,
      readOnlyViewToken,
      trackingData: statusPayload
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({
        success: false,
        message: 'A uniform registration with this USN already exists. Please use Check Payment Status with your Application ID and PIN.'
      });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 2. RESTORE SAVED PROGRESS WHEN REOPENING BROWSER
// ============================================================================

// POST /api/tracking/resume-session
router.post('/tracking/resume-session', (req, res) => {
  try {
    const { browserResumeToken, applicationId } = req.body;
    if (!browserResumeToken && !applicationId) {
      return res.json({ success: false, restored: false });
    }

    let record = null;
    if (browserResumeToken) {
      const tokenHash = hashValue(browserResumeToken);
      record = db.prepare('SELECT * FROM student_tracking_records WHERE browser_resume_token_hash = ?').get(tokenHash);
    }

    if (!record && applicationId) {
      const cleanAppId = String(applicationId).toUpperCase().trim();
      record = db.prepare('SELECT * FROM student_tracking_records WHERE application_id = ?').get(cleanAppId);
    }

    if (!record) {
      return res.json({ success: false, restored: false });
    }

    const statusPayload = buildTrackingStatusPayload(record, true);
    res.set('Cache-Control', 'no-store');
    return res.json({
      success: true,
      restored: true,
      trackingData: statusPayload
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 3. CHECK PAYMENT STATUS FROM ANY DEVICE (APPLICATION ID + 6-DIGIT PIN)
// ============================================================================

// POST /api/tracking/check-status
router.post('/tracking/check-status', trackingRateLimiter, (req, res) => {
  try {
    const { applicationId, trackingPin } = req.body;

    if (!applicationId || !trackingPin) {
      return res.status(400).json({
        success: false,
        message: 'Both Application ID and 6-digit Tracking PIN are required.'
      });
    }

    const cleanAppId = String(applicationId).toUpperCase().trim();
    const cleanPin = String(trackingPin).replace(/\D/g, '').trim();

    if (cleanPin.length !== 6) {
      return res.status(400).json({
        success: false,
        message: 'Tracking PIN must be exactly 6 digits.'
      });
    }

    const record = db.prepare('SELECT * FROM student_tracking_records WHERE application_id = ?').get(cleanAppId);

    // Generic error message prevents enumerating valid Application IDs
    if (!record) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Application ID or Tracking PIN. Please check your credentials and try again.'
      });
    }

    // Brute-force lockout check (5 failed attempts -> 15-minute lock)
    if (record.locked_until && new Date() < new Date(record.locked_until)) {
      const waitMins = Math.ceil((new Date(record.locked_until).getTime() - Date.now()) / 60000);
      return res.status(429).json({
        success: false,
        message: `Too many incorrect PIN attempts for this Application ID. Please wait ${waitMins} minute(s) before trying again.`
      });
    }

    if (!verifyHashMatch(cleanPin, record.tracking_pin_hash)) {
      const newFailed = (record.failed_pin_attempts || 0) + 1;
      let newLockUntil = record.locked_until;
      if (newFailed >= 5) {
        newLockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }

      db.prepare(`
        UPDATE student_tracking_records
        SET failed_pin_attempts = ?, locked_until = ?, updated_at = ?
        WHERE id = ?
      `).run(newFailed, newLockUntil, new Date().toISOString(), record.id);

      const remaining = Math.max(0, 5 - newFailed);
      return res.status(401).json({
        success: false,
        message:
          remaining > 0
            ? `Incorrect Application ID or Tracking PIN. (${remaining} attempt(s) remaining before temporary lockout).`
            : 'Account temporarily locked for 15 minutes due to repeated incorrect PIN attempts.'
      });
    }

    // Successful verification — reset failed attempts and issue short-lived read-only tracking token
    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE student_tracking_records
      SET failed_pin_attempts = 0, locked_until = NULL, last_checked_at = ?, updated_at = ?
      WHERE id = ?
    `).run(nowIso, nowIso, record.id);

    const readOnlyViewToken = signStudentTrackingToken({
      applicationId: record.application_id,
      registrationId: record.registration_id,
      usn: record.usn
    });

    const statusPayload = buildTrackingStatusPayload(record, true);

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.json({
      success: true,
      readOnlyViewToken,
      trackingData: statusPayload
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/tracking/live-poll
// Used by the Read-Only Tracking Page on any device (including Vercel Serverless) to poll live status
router.get('/tracking/live-poll', (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Tracking token required.' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, TRACKING_SECRET);
    } catch {
      return res.status(401).json({
        success: false,
        message: 'Tracking session expired. Please re-enter your Application ID and PIN.'
      });
    }

    if (!decoded || decoded.scope !== 'STUDENT_READONLY_TRACKING') {
      return res.status(403).json({ success: false, message: 'Invalid tracking token.' });
    }

    const record = db.prepare('SELECT * FROM student_tracking_records WHERE application_id = ?').get(decoded.applicationId);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Record not found.' });
    }

    const statusPayload = buildTrackingStatusPayload(record, false);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.json({
      success: true,
      trackingData: statusPayload
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 4. COMPLETE PENDING PAYMENT RECOVERY ENDPOINT (ANY DEVICE / BROWSER)
// ============================================================================

// POST /api/tracking/recover-pending-payment
// Authenticates Application ID + 6-Digit PIN and loads exact registration for Step 4 Payment
router.post('/tracking/recover-pending-payment', async (req, res) => {
  try {
    const { applicationId, trackingPin } = req.body;

    if (!applicationId || !trackingPin) {
      return res.status(400).json({
        success: false,
        message: 'Please enter both your Application ID and 6-digit Tracking PIN.'
      });
    }

    const cleanAppId = String(applicationId).toUpperCase().trim();
    const cleanPin = String(trackingPin).replace(/\D/g, '').trim();

    if (cleanPin.length !== 6) {
      return res.status(400).json({
        success: false,
        message: 'Tracking PIN must be exactly 6 digits.'
      });
    }

    const record = db.prepare('SELECT * FROM student_tracking_records WHERE application_id = ?').get(cleanAppId);
    if (!record) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Application ID or Tracking PIN.'
      });
    }

    // Brute-force PIN lockout guard
    if (record.locked_until && new Date() < new Date(record.locked_until)) {
      const waitMins = Math.ceil((new Date(record.locked_until).getTime() - Date.now()) / 60000);
      return res.status(429).json({
        success: false,
        message: `Too many incorrect PIN attempts. Please try again in ${waitMins} minute(s).`
      });
    }

    if (!verifyHashMatch(cleanPin, record.tracking_pin_hash)) {
      const newFailed = (record.failed_pin_attempts || 0) + 1;
      let newLockUntil = record.locked_until;
      if (newFailed >= 5) {
        newLockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }

      db.prepare(`
        UPDATE student_tracking_records
        SET failed_pin_attempts = ?, locked_until = ?, updated_at = ?
        WHERE id = ?
      `).run(newFailed, newLockUntil, new Date().toISOString(), record.id);

      return res.status(401).json({
        success: false,
        message: 'Incorrect Application ID or Tracking PIN.'
      });
    }

    // Reset failed attempts
    const nowIso = new Date().toISOString();
    let existingSubmission = db.prepare(`
      SELECT * FROM payment_submissions
      WHERE registration_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(record.registration_id);

    if (!existingSubmission && record.usn) {
      const usnCandidate = db.prepare(`
        SELECT * FROM payment_submissions
        WHERE UPPER(TRIM(usn)) = ?
        ORDER BY created_at DESC LIMIT 1
      `).get(record.usn.toUpperCase().trim());
      if (usnCandidate && (!usnCandidate.registration_id || usnCandidate.registration_id === record.registration_id)) {
        existingSubmission = usnCandidate;
      }
    }

    const currentPaymentStatus = resolveUnifiedPaymentStatus(existingSubmission, record);

    db.prepare(`
      UPDATE student_tracking_records
      SET failed_pin_attempts = 0, locked_until = NULL, last_checked_at = ?, payment_status = ?, updated_at = ?
      WHERE id = ?
    `).run(nowIso, currentPaymentStatus, nowIso, record.id);

    // Issue scoped JWT for Payment Recovery + Live SSE Status Stream
    const paymentRecoveryToken = jwt.sign(
      {
        role: 'STUDENT_TRACKING',
        scope: 'STUDENT_PAYMENT_RECOVERY',
        applicationId: record.application_id,
        registrationId: String(record.registration_id),
        usn: record.usn
      },
      JWT_SECRET,
      { expiresIn: '4h' }
    );

    const statusPayload = buildTrackingStatusPayload(record, true);
    statusPayload.payment.paymentStatus = currentPaymentStatus;

    // Determine whether this student is allowed to submit a payment right now
    const canProceedToPay =
      currentPaymentStatus === 'Payment Pending' ||
      currentPaymentStatus === 'Payment Rejected';

    return res.json({
      success: true,
      canProceedToPay,
      alreadyPaid: currentPaymentStatus === 'Payment Successful',
      awaitingVerification:
        currentPaymentStatus === 'Payment Submitted' ||
        currentPaymentStatus === 'Under Verification',
      paymentRecoveryToken,
      trackingData: statusPayload
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 5. MULTI-STUDENT BROWSER SESSION LIST (RESTORE MULTIPLE STUDENTS ON 1 PHONE)
// ============================================================================

// POST /api/tracking/resume-multiple-sessions
router.post('/tracking/resume-multiple-sessions', async (req, res) => {
  try {
    const { resumeTokens = [] } = req.body;
    if (!Array.isArray(resumeTokens) || resumeTokens.length === 0) {
      return res.json({ success: true, students: [] });
    }

    const tokenHashes = [];
    for (const t of resumeTokens.filter(Boolean).slice(0, 50)) {
      for (const secret of TRACKING_SECRETS) {
        tokenHashes.push(hashValue(t, secret));
      }
    }

    if (tokenHashes.length === 0) {
      return res.json({ success: true, students: [] });
    }

    const placeholders = tokenHashes.map(() => '?').join(',');
    const records = db.prepare(`
      SELECT * FROM student_tracking_records
      WHERE browser_resume_token_hash IN (${placeholders})
      ORDER BY created_at DESC
    `).all(...tokenHashes);

    const submissions = db.prepare('SELECT * FROM payment_submissions ORDER BY created_at DESC').all();
    const subMap = {};
    submissions.forEach((s) => {
      if (s.registration_id && !subMap[String(s.registration_id)]) {
        subMap[String(s.registration_id)] = s;
      }
      if (s.usn && !subMap[String(s.usn).toUpperCase()]) {
        subMap[String(s.usn).toUpperCase()] = s;
      }
    });

    const studentsList = records.map((rec) => {
      const sub = subMap[String(rec.registration_id)] || subMap[String(rec.usn).toUpperCase()] || null;
      const liveStatus = resolveUnifiedPaymentStatus(sub, rec);

      let profile = {};
      try { profile = typeof rec.student_profile === 'string' ? JSON.parse(rec.student_profile) : rec.student_profile || {}; } catch {}

      let uniform = {};
      try { uniform = typeof rec.uniform_selection === 'string' ? JSON.parse(rec.uniform_selection) : rec.uniform_selection || {}; } catch {}

      return {
        applicationId: rec.application_id,
        registrationId: rec.registration_id,
        trackingPin: decryptPin(rec.encrypted_tracking_pin),
        studentName: profile?.studentName || 'Student',
        usn: rec.usn,
        department: profile?.department,
        academicYear: profile?.academicYear,
        section: profile?.section,
        shirtSize: uniform?.shirtSize,
        trouserSize: uniform?.trouserSize,
        expectedAmount: sub?.amount || rec.expected_amount || null,
        registrationStatus: rec.registration_status || 'Registration Completed',
        paymentStatus: liveStatus,
        registeredAt: rec.created_at
      };
    });

    res.set('Cache-Control', 'no-store');
    return res.json({
      success: true,
      students: studentsList
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 6. ADMIN PANEL: ALL STUDENT REGISTRATIONS & PENDING/SUCCESSFUL/REJECTED FILTER
// ============================================================================

// GET /api/admin/registrations/all
router.get('/admin/registrations/all', requireAdminJwt, async (req, res) => {
  try {
    const { paymentFilter = 'ALL', department = 'ALL', search = '' } = req.query;

    const records = db.prepare('SELECT * FROM student_tracking_records ORDER BY created_at DESC').all();
    const submissions = db.prepare('SELECT * FROM payment_submissions ORDER BY created_at DESC').all();

    const subMap = {};
    submissions.forEach((s) => {
      if (s.registration_id && !subMap[String(s.registration_id)]) {
        subMap[String(s.registration_id)] = s;
      }
      if (s.usn && !subMap[String(s.usn).toUpperCase()]) {
        subMap[String(s.usn).toUpperCase()] = s;
      }
    });

    let rows = records.map((rec) => {
      const sub = subMap[String(rec.registration_id)] || subMap[String(rec.usn).toUpperCase()] || null;
      const livePaymentStatus = resolveUnifiedPaymentStatus(sub, rec);

      let profile = {};
      try { profile = typeof rec.student_profile === 'string' ? JSON.parse(rec.student_profile) : rec.student_profile || {}; } catch {}

      let uniform = {};
      try { uniform = typeof rec.uniform_selection === 'string' ? JSON.parse(rec.uniform_selection) : rec.uniform_selection || {}; } catch {}

      let assignedVnd = {};
      try { assignedVnd = typeof rec.assigned_vendor === 'string' ? JSON.parse(rec.assigned_vendor) : rec.assigned_vendor || {}; } catch {}

      return {
        applicationId: rec.application_id,
        registrationId: rec.registration_id,
        studentName: profile?.studentName || 'Student',
        usn: rec.usn,
        course: profile?.course || 'B.E.',
        department: profile?.department || 'N/A',
        academicYear: profile?.academicYear || 'N/A',
        section: profile?.section || 'N/A',
        shirtSize: uniform?.shirtSize || '—',
        trouserSize: uniform?.trouserSize || '—',
        vendorName: assignedVnd?.vendorName || sub?.vendor_name || 'Assigned',
        vendorId: assignedVnd?.vendorId || sub?.vendor_id || '',
        registrationStatus: rec.registration_status || 'Registration Completed',
        paymentStatus: livePaymentStatus,
        paymentAmount: sub?.bank_verified_amount || sub?.amount || rec.expected_amount || null,
        utrNumber: sub?.utr_number || null,
        registrationDate: rec.created_at,
        verifiedAt: sub?.verified_at || null
      };
    });

    // Filter by Department
    if (department && department !== 'ALL') {
      rows = rows.filter(
        (r) =>
          r.department.toUpperCase() === department.toUpperCase() ||
          r.department.toLowerCase().includes(department.toLowerCase())
      );
    }

    // Filter by Payment Status Category (Pending / Successful / Rejected)
    if (paymentFilter && paymentFilter !== 'ALL') {
      if (paymentFilter === 'PENDING') {
        rows = rows.filter((r) =>
          ['Payment Pending', 'Payment Submitted', 'Under Verification'].includes(r.paymentStatus)
        );
      } else if (paymentFilter === 'PAYMENT_PENDING_ONLY') {
        rows = rows.filter((r) => r.paymentStatus === 'Payment Pending');
      } else if (paymentFilter === 'SUCCESSFUL') {
        rows = rows.filter((r) => r.paymentStatus === 'Payment Successful');
      } else if (paymentFilter === 'REJECTED') {
        rows = rows.filter((r) => r.paymentStatus === 'Payment Rejected');
      }
    }

    // Search by Application ID, Student Name, USN, or UTR
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.applicationId.toLowerCase().includes(q) ||
          r.studentName.toLowerCase().includes(q) ||
          r.usn.toLowerCase().includes(q) ||
          (r.utrNumber && r.utrNumber.toLowerCase().includes(q))
      );
    }

    // Calculate Summary Counts across ALL records
    const allLiveStatuses = records.map((rec) => {
      const sub = subMap[String(rec.registration_id)] || subMap[String(rec.usn).toUpperCase()] || null;
      return resolveUnifiedPaymentStatus(sub, rec);
    });

    const summaryCounts = {
      totalRegistrations: records.length,
      paymentPendingCount: allLiveStatuses.filter((s) => s === 'Payment Pending').length,
      awaitingVerificationCount: allLiveStatuses.filter((s) =>
        ['Payment Submitted', 'Under Verification'].includes(s)
      ).length,
      paymentSuccessfulCount: allLiveStatuses.filter((s) => s === 'Payment Successful').length,
      paymentRejectedCount: allLiveStatuses.filter((s) => s === 'Payment Rejected').length
    };

    return res.json({
      success: true,
      summaryCounts,
      registrations: rows
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/tracking/pin/:identifier (Admin Authorized OR Verified Student Token)
router.get('/tracking/pin/:identifier', (req, res) => {
  try {
    const id = req.params.identifier;
    const rec = db.prepare('SELECT encrypted_tracking_pin, browser_resume_token_hash FROM student_tracking_records WHERE registration_id = ? OR application_id = ? OR usn = ?').get(id, id, id.toUpperCase().trim());
    if (!rec) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    // Check authorization:
    // 1. Admin JWT
    let isAuthorized = false;
    const rawToken = extractJwtToken(req);
    if (rawToken) {
      try {
        const decoded = jwt.verify(rawToken, JWT_SECRET);
        if (decoded && (decoded.role === 'ADMIN' || decoded.role === 'SUPER_ADMIN')) {
          isAuthorized = true;
        }
      } catch (_) {}
    }

    // 2. Verified Student Browser Resume Token
    const resumeToken = req.headers['x-resume-token'] || req.query.resumeToken || req.query.token;
    if (!isAuthorized && resumeToken && rec.browser_resume_token_hash) {
      if (verifyHashMatch(resumeToken, rec.browser_resume_token_hash)) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return res.status(401).json({ success: false, message: 'Unauthorized. Admin credentials or student session token required.' });
    }

    if (rec.encrypted_tracking_pin) {
      const pin = decryptPin(rec.encrypted_tracking_pin);
      if (pin) {
        return res.json({ success: true, trackingPin: pin });
      }
    }
    return res.status(404).json({ success: false, message: 'PIN not found' });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

export { decryptPin };
export default router;


const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const {
  PaymentConfig,
  PaymentSubmission,
  PaymentAuditLog,
  VendorTransactionHistory,
  CashRefSequence
} = require('../models/PaymentModels');
const {
  Vendor,
  VendorPaymentConfiguration,
  StudentVendorAssignment,
  VendorAuditLog,
  SystemSyncState
} = require('../models/VendorModels');
const { StudentTrackingRecord } = require('../models/StudentTrackingModels');

let Registration;
try {
  Registration = require('../models/Registration');
} catch (e) {
  Registration = null;
}

// Generate collision-free unique Cash Payment Reference ID (e.g., CASH-MIT-2026-10001)
const generateUniqueCashReferenceId = async () => {
  const year = new Date().getFullYear();
  const counterKey = `MIT_CASH_REF_${year}`;

  while (true) {
    const counter = await CashRefSequence.findOneAndUpdate(
      { _id: counterKey },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    const seqNum = counter.seq < 10000 ? 10000 + counter.seq : counter.seq;
    const candidate = `CASH-MIT-${year}-${seqNum}`;
    const exists = await PaymentSubmission.exists({ cashPaymentRefId: candidate });
    if (!exists) return candidate;
  }
};

// Resolve authoritative registration record
const resolveStudentRecordForCash = async (rawRegId, rawUsn = '') => {
  const cleanedId = String(rawRegId || '').replace(/^#/, '').trim();
  const cleanedUsn = String(rawUsn || '').toUpperCase().trim();

  let trackingRecord = null;
  let registrationDoc = null;

  if (mongoose.Types.ObjectId.isValid(cleanedId)) {
    trackingRecord = await StudentTrackingRecord.findOne({
      $or: [{ registrationId: cleanedId }, { _id: cleanedId }]
    });
    if (Registration) {
      registrationDoc = await Registration.findById(cleanedId).catch(() => null);
    }
  }

  if (!trackingRecord && cleanedId) {
    trackingRecord = await StudentTrackingRecord.findOne({
      applicationId: cleanedId.toUpperCase()
    });
  }

  if (!trackingRecord && cleanedUsn) {
    trackingRecord = await StudentTrackingRecord.findOne({ usn: cleanedUsn });
  }

  const canonicalRegId =
    trackingRecord?.registrationId ||
    registrationDoc?._id ||
    (mongoose.Types.ObjectId.isValid(cleanedId)
      ? new mongoose.Types.ObjectId(cleanedId)
      : null);

  return { canonicalRegId, trackingRecord, registrationDoc };
};

// ============================================================================
// 1. STUDENT PORTAL: CREATE CASH PAYMENT REQUEST
// ============================================================================

// POST /api/payments/cash/request
router.post('/payments/cash/request', async (req, res) => {
  try {
    const config = await PaymentConfig.findOne().lean();
    if (config && !config.isCollectionEnabled) {
      return res.status(503).json({
        success: false,
        collectionDisabled: true,
        message:
          config.unavailableMessage ||
          'Payment collection is temporarily unavailable. Please contact the Uniform Office.'
      });
    }

    const incomingRegId = String(req.body.registrationId || req.body.applicationId || '').trim();
    const cleanUsn = String(req.body.usn || '').toUpperCase().trim();

    const { canonicalRegId, trackingRecord, registrationDoc } =
      await resolveStudentRecordForCash(incomingRegId, cleanUsn);

    if (!canonicalRegId) {
      return res.status(404).json({
        success: false,
        message: 'Student registration record not found. Please complete registration first.'
      });
    }

    // 1. Prevent duplicate payment requests for the same registration
    const existingSubmission = await PaymentSubmission.findOne({
      registrationId: canonicalRegId
    });

    if (existingSubmission) {
      if (
        [
          'Verified',
          'Payment Verified',
          'Payment Successful',
          'CASH RECEIVED'
        ].includes(existingSubmission.paymentStatus)
      ) {
        return res.status(400).json({
          success: false,
          alreadyConfirmed: true,
          message: 'Your uniform payment is already confirmed. Duplicate payment requests are blocked.'
        });
      }

      if (existingSubmission.paymentStatus === 'CASH PAYMENT PENDING') {
        return res.status(409).json({
          success: false,
          alreadyPending: true,
          message: 'You already have an active Cash Payment request pending vendor verification.',
          cashPaymentRefId: existingSubmission.cashPaymentRefId,
          paymentStatus: 'CASH PAYMENT PENDING'
        });
      }
    }

    const cashPaymentRefId = await generateUniqueCashReferenceId();
    const expectedAmount = Number(trackingRecord?.expectedAmount || config?.uniformAmount || 1500);

    const submissionData = {
      registrationId: canonicalRegId,
      studentName: trackingRecord?.studentProfile?.studentName || registrationDoc?.fullName || 'Student',
      usn: cleanUsn || trackingRecord?.usn || registrationDoc?.usn || '',
      department: trackingRecord?.studentProfile?.department || registrationDoc?.department || '',
      yearSemester: trackingRecord?.studentProfile?.academicYear || registrationDoc?.academicYear || '1st Year',
      section: trackingRecord?.studentProfile?.section || registrationDoc?.section || '',
      paymentModeType: 'CASH',
      paymentMethod: 'CASH',
      cashPaymentRefId,
      expectedAmount,
      amount: expectedAmount,
      paymentStatus: 'CASH PAYMENT PENDING',
      vendorId: req.body.vendorId || 'MIT-VND-001',
      vendorName: req.body.vendorName || 'Assigned Uniform Vendor',
      vendorAllocationId: req.body.allocationId || 'ALLOC-001'
    };

    let savedSubmission;
    if (existingSubmission) {
      Object.assign(existingSubmission, submissionData);
      savedSubmission = await existingSubmission.save();
    } else {
      savedSubmission = await PaymentSubmission.create(submissionData);
    }

    if (trackingRecord) {
      trackingRecord.paymentStatus = 'CASH PAYMENT PENDING';
      trackingRecord.isPaymentLocked = true;
      await trackingRecord.save();
    }

    return res.status(201).json({
      success: true,
      message:
        'Cash payment selected. Please pay the amount directly to your assigned uniform vendor. Your payment will be confirmed after the vendor receives the cash.',
      cashPaymentRefId,
      paymentStatus: 'CASH PAYMENT PENDING',
      expectedAmount
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 2. VENDOR PORTAL: CASH LIST, CONFIRMATION & REJECTION
// ============================================================================

// GET /api/vendor-portal/cash-payments
router.get('/vendor-portal/cash-payments', async (req, res) => {
  try {
    const vendorId = req.vendorId || req.query.vendorId;
    const filter = {
      $or: [
        { paymentMethod: 'CASH' },
        { paymentModeType: 'CASH' },
        { cashPaymentRefId: { $ne: null } }
      ]
    };
    if (vendorId) filter.vendorId = vendorId;

    const requests = await PaymentSubmission.find(filter).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, requests });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/vendor-portal/cash-payments/:submissionId/confirm
router.patch('/vendor-portal/cash-payments/:submissionId/confirm', async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { actualAmountReceived, remarks } = req.body;

    const submission = await PaymentSubmission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found.' });
    }

    const entered = Number(actualAmountReceived);
    if (entered !== Number(submission.expectedAmount)) {
      return res.status(400).json({
        success: false,
        amountMismatch: true,
        message: `Amount Mismatch Warning: Entered ₹${entered} does not match expected uniform amount ₹${submission.expectedAmount}. Vendor confirmation blocked.`
      });
    }

    submission.paymentStatus = 'CASH RECEIVED';
    submission.actualAmountReceived = entered;
    submission.adminRemarks = remarks || 'Cash verified & received by vendor';
    submission.verifiedAt = new Date();
    await submission.save();

    await StudentTrackingRecord.updateOne(
      { registrationId: submission.registrationId },
      { $set: { paymentStatus: 'CASH RECEIVED' } }
    );

    return res.json({ success: true, message: 'Cash payment confirmed successfully.', submission });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/vendor-portal/cash-payments/:submissionId/reject
router.patch('/vendor-portal/cash-payments/:submissionId/reject', async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { rejectionReason } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
    }

    const submission = await PaymentSubmission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found.' });
    }

    submission.paymentStatus = 'CASH PAYMENT REJECTED';
    submission.rejectionReason = rejectionReason;
    submission.verifiedAt = new Date();
    await submission.save();

    await StudentTrackingRecord.updateOne(
      { registrationId: submission.registrationId },
      { $set: { paymentStatus: 'CASH PAYMENT REJECTED' } }
    );

    return res.json({ success: true, message: 'Cash payment marked as rejected.', submission });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

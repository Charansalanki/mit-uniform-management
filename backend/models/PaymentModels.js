const mongoose = require('mongoose');

// 0. Atomic Sequence Counter for Unique Cash Payment Reference IDs (e.g. CASH-MIT-2026-10001)
const CashRefSequenceSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g., 'MIT_CASH_REF_2026'
  seq: { type: Number, default: 10000 }
});

// 1. Extended Global Payment Configuration (Supports Fixed & Flexible Range + Granular Overrides)
const PaymentConfigSchema = new mongoose.Schema({
  configVersion: { type: Number, required: true, default: 1 },

  // Master Collection Toggle (ON / OFF)
  isCollectionEnabled: { type: Boolean, required: true, default: true },
  unavailableMessage: {
    type: String,
    default: 'Payment collection is temporarily unavailable. Please contact the Uniform Office.'
  },

  // Mode A ('FIXED') or Mode B ('FLEXIBLE_RANGE')
  paymentMode: {
    type: String,
    required: true,
    enum: ['FIXED', 'FLEXIBLE_RANGE'],
    default: 'FIXED'
  },

  // Core Amount Controls
  uniformAmount: { type: Number, required: true, default: 1500, min: 1 },
  minAmount: { type: Number, required: true, default: 1, min: 1 },
  maxAmount: { type: Number, required: true, default: 10000, min: 1 },

  // Granular Amount Overrides (Department, Semester, Uniform Package)
  departmentAmounts: {
    type: Map,
    of: Number,
    default: {}
  },
  semesterAmounts: {
    type: Map,
    of: Number,
    default: {}
  },
  packageAmounts: {
    type: Map,
    of: Number,
    default: { standard: 1500, hosteler: 1800, lab_included: 2100 }
  },

  beneficiaryName: {
    type: String,
    required: true,
    default: 'Maharaja Institute of Technology Mysore'
  },
  paymentInstructions: {
    type: String,
    default: 'Scan any active UPI QR code below using your UPI app, complete the payment, and enter your 12-digit UPI UTR / Reference number along with the payment screenshot.'
  },
  referenceInstructions: {
    type: String,
    default: 'Enter your USN in the UPI remarks field while making the payment.'
  },
  additionalInstructions: {
    type: String,
    default: 'Payment verification is done manually against our official bank statement within 24-48 working hours.'
  },

  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  updatedByName: { type: String, default: 'System Administrator' }
}, { timestamps: true });

// 2. Dedicated Payment Configuration History Model
const PaymentConfigHistorySchema = new mongoose.Schema({
  configVersion: { type: Number, required: true },
  previousAmount: { type: Number, required: true },
  newAmount: { type: Number, required: true },
  previousMinAmount: { type: Number, required: true },
  newMinAmount: { type: Number, required: true },
  previousMaxAmount: { type: Number, required: true },
  newMaxAmount: { type: Number, required: true },
  previousMode: { type: String, enum: ['FIXED', 'FLEXIBLE_RANGE'], required: true },
  newMode: { type: String, enum: ['FIXED', 'FLEXIBLE_RANGE'], required: true },
  previousCollectionStatus: { type: Boolean, required: true },
  newCollectionStatus: { type: Boolean, required: true },
  reason: { type: String, default: 'Manual Configuration Update' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  updatedByName: { type: String, default: 'System Administrator' }
}, { timestamps: true });

// 3. Three Dynamic UPI QR Scanners
const PaymentMethodSchema = new mongoose.Schema({
  name: { type: String, required: true },
  methodType: {
    type: String,
    required: true,
    unique: true,
    enum: ['GPAY', 'PHONEPE', 'PAYTM']
  },
  qrImageUrl: { type: String, default: null },
  amount: { type: Number, required: true, default: 1500 },
  instructions: { type: String, default: 'Scan using any UPI app to credit MIT Mysore Official Account' },
  beneficiaryName: { type: String, default: 'MIT Mysore Uniform Account' },
  isActive: { type: Boolean, default: false },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
}, { timestamps: true });

// 4. Extended Student Payment Submissions (Linked to Existing Registration & Multi-Vendor Tracking)
const PaymentSubmissionSchema = new mongoose.Schema({
  registrationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Registration',
    required: true,
    index: true
  },
  applicationId: { type: String, default: '', uppercase: true, trim: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  studentName: { type: String, required: true },
  usn: { type: String, required: true, uppercase: true, trim: true, index: true },
  course: { type: String, default: 'B.E.', uppercase: true, trim: true },
  department: { type: String, required: true },
  yearSemester: { type: String, required: true },
  section: { type: String, required: true },
  gender: { type: String, default: '', uppercase: true, trim: true },
  packageType: { type: String, default: 'standard' },

  // Broad category: 'UPI' or 'CASH'
  paymentModeType: {
    type: String,
    enum: ['UPI', 'CASH'],
    default: 'UPI',
    index: true
  },

  // Specific method: 'GPAY', 'PHONEPE', 'PAYTM', or 'CASH'
  paymentMethod: {
    type: String,
    required: true,
    enum: ['GPAY', 'PHONEPE', 'PAYTM', 'CASH'],
    index: true
  },

  // Unique Reference ID for Cash Payments (Null for UPI payments)
  cashPaymentRefId: {
    type: String,
    default: null,
    uppercase: true,
    trim: true
  },

  // Required ONLY for UPI payments; strictly null for CASH payments (Never generate fake UTRs)
  utrNumber: {
    type: String,
    default: null,
    trim: true,
    uppercase: true
  },

  // Required ONLY for UPI payments; null for CASH payments
  paymentScreenshot: {
    type: String,
    default: null
  },

  // Actual amount received by vendor (for Cash or Bank verification)
  actualAmountReceived: {
    type: Number,
    default: null
  },

  // Immutable snapshots taken at the exact millisecond of submission
  configIdAtSubmission: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentConfig' },
  configVersionAtSubmission: { type: Number, default: 1 },
  paymentModeAtSubmission: { type: String, enum: ['FIXED', 'FLEXIBLE_RANGE'], default: 'FIXED' },
  expectedAmount: { type: Number, required: true },
  minAllowedAtSubmission: { type: Number, default: 1 },
  maxAllowedAtSubmission: { type: Number, default: 10000 },
  amount: { type: Number, required: true },

  // Verification & Audit trail
  ocrExtractedAmount: { type: Number, default: null },
  bankVerifiedAmount: { type: Number, default: null },
  amountMismatchFlag: { type: Boolean, default: false },
  amountValidationNotes: { type: String, default: '' },
  requirementRevisionHistory: [{
    revisedAt: { type: Date, default: Date.now },
    previousExpectedAmount: Number,
    newExpectedAmount: Number,
    reason: String,
    revisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
  }],

  paymentStatus: {
    type: String,
    required: true,
    enum: [
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
    ],
    default: 'Payment Submitted',
    index: true
  },

  reconciliationStatus: {
    type: String,
    enum: ['Unchecked', 'Matched', 'Unmatched', 'Suspicious'],
    default: 'Unchecked'
  },
  reconciliationDetails: { type: mongoose.Schema.Types.Mixed },
  adminRemarks: { type: String, default: '' },
  rejectionReason: { type: String, default: '' },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  verifiedAt: { type: Date },

  // Multi-Vendor Tracking & Validation Fields
  vendorRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true },
  vendorId: { type: String, required: true, index: true },
  vendorName: { type: String, required: true },
  vendorAllocationId: { type: String, required: true, index: true },
  vendorBeneficiaryName: { type: String, default: '' },
  vendorUpiId: { type: String, default: '' },
  screenshotExtractedUtr: { type: String, default: null, uppercase: true, trim: true },
  utrOcrMismatchFlag: { type: Boolean, default: false }
}, { timestamps: true });

// Partial Unique Indexes so null values on CASH or UPI never collide
PaymentSubmissionSchema.index(
  { utrNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { utrNumber: { $type: 'string' } },
    name: 'unique_upi_utr_number'
  }
);

PaymentSubmissionSchema.index(
  { cashPaymentRefId: 1 },
  {
    unique: true,
    partialFilterExpression: { cashPaymentRefId: { $type: 'string' } },
    name: 'unique_cash_payment_ref_id'
  }
);

PaymentSubmissionSchema.index({ registrationId: 1, paymentStatus: 1 });
PaymentSubmissionSchema.index({ usn: 1, paymentStatus: 1 });

// 5. Vendor Transaction History Model (Permanent, Append-Only Verification Ledger)
const VendorTransactionHistorySchema = new mongoose.Schema({
  submissionId: { type: String, required: true, index: true },
  registrationId: { type: String, required: true, index: true },
  studentName: { type: String, required: true },
  usn: { type: String, required: true, uppercase: true, trim: true, index: true },
  department: { type: String, required: true },
  yearSemester: { type: String, required: true },
  section: { type: String, required: true },
  vendorRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
  vendorId: { type: String, required: true, index: true },
  vendorName: { type: String, required: true },
  paymentMethod: { type: String, required: true },
  paymentAmount: { type: Number, required: true },
  verifiedBankAmount: { type: Number, default: null },
  actualAmountReceived: { type: Number, default: null },
  cashPaymentRefId: { type: String, default: null, index: true },
  utrNumber: { type: String, default: null },
  paymentScreenshot: { type: String, default: null },
  previousStatus: { type: String, default: '' },
  paymentStatus: {
    type: String,
    required: true,
    enum: [
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
    ]
  },
  verifiedByVendorId: { type: String, default: '' },
  verifiedByVendorName: { type: String, default: '' },
  verifierRole: { type: String, default: 'VENDOR' },
  remarks: { type: String, default: '' },
  rejectionReason: { type: String, default: '' },
  actionTimestamp: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

// 6. Payment Audit Log Model
const PaymentAuditLogSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  actorType: { type: String, enum: ['ADMIN', 'STUDENT', 'SYSTEM'], default: 'ADMIN' },
  action: {
    type: String,
    required: true,
    enum: [
      'CONFIG_UPDATED',
      'METHOD_UPDATED',
      'PAYMENT_SUBMITTED',
      'PAYMENT_VERIFIED',
      'PAYMENT_REJECTED',
      'PAYMENT_RESET',
      'CASH_PAYMENT_REQUEST_CREATED',
      'CASH_PAYMENT_RECEIVED',
      'CASH_PAYMENT_REJECTED',
      'CASH_AMOUNT_MISMATCH_BLOCKED'
    ]
  },
  paymentSubmissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentSubmission' },
  paymentMethodId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentMethod' },
  previousValue: { type: mongoose.Schema.Types.Mixed },
  newValue: { type: mongoose.Schema.Types.Mixed },
  ipAddress: { type: String },
  timestamp: { type: Date, default: Date.now }
});

module.exports = {
  PaymentConfig: mongoose.models?.PaymentConfig || mongoose.model('PaymentConfig', PaymentConfigSchema),
  PaymentConfigHistory: mongoose.models?.PaymentConfigHistory || mongoose.model('PaymentConfigHistory', PaymentConfigHistorySchema),
  PaymentMethod: mongoose.models?.PaymentMethod || mongoose.model('PaymentMethod', PaymentMethodSchema),
  PaymentSubmission: mongoose.models?.PaymentSubmission || mongoose.model('PaymentSubmission', PaymentSubmissionSchema),
  VendorTransactionHistory: mongoose.models?.VendorTransactionHistory || mongoose.model('VendorTransactionHistory', VendorTransactionHistorySchema),
  PaymentAuditLog: mongoose.models?.PaymentAuditLog || mongoose.model('PaymentAuditLog', PaymentAuditLogSchema),
  CashRefSequence: mongoose.models?.CashRefSequence || mongoose.model('CashRefSequence', CashRefSequenceSchema)
};


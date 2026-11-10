const mongoose = require('mongoose');

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
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  studentName: { type: String, required: true },
  usn: { type: String, required: true, uppercase: true, trim: true, index: true },
  department: { type: String, required: true },
  yearSemester: { type: String, required: true },
  section: { type: String, required: true },
  packageType: { type: String, default: 'standard' },

  paymentMethod: {
    type: String,
    required: true,
    enum: ['GPAY', 'PHONEPE', 'PAYTM']
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

  utrNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  paymentScreenshot: { type: String, required: true },

  paymentStatus: {
    type: String,
    required: true,
    enum: [
      'Not Paid',
      'Payment Submitted',
      'Under Verification',
      'Payment Verified',
      'Payment Rejected'
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

PaymentSubmissionSchema.index({ registrationId: 1, paymentStatus: 1 });
PaymentSubmissionSchema.index({ usn: 1, paymentStatus: 1 });

// 5. Payment Audit Log Model
const PaymentAuditLogSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  actorType: { type: String, enum: ['ADMIN', 'STUDENT', 'SYSTEM'], default: 'ADMIN' },
  action: { type: String, required: true },
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
  PaymentAuditLog: mongoose.models?.PaymentAuditLog || mongoose.model('PaymentAuditLog', PaymentAuditLogSchema)
};


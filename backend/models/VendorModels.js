const mongoose = require('mongoose');

// 1. Vendor Master Profile
const VendorSchema = new mongoose.Schema({
  vendorId: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true
  }, // e.g. MIT-VND-2026-001
  vendorName: { type: String, required: true, trim: true },
  contactPerson: { type: String, required: true, trim: true },
  mobile: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  address: { type: String, required: true, trim: true },
  gstNumber: { type: String, default: '', uppercase: true, trim: true },
  notes: { type: String, default: '' },
  status: {
    type: String,
    required: true,
    enum: ['ACTIVE', 'INACTIVE'],
    default: 'ACTIVE',
    index: true
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }
}, { timestamps: true });

// 2. Exclusive Academic Group Allocation
const VendorAllocationSchema = new mongoose.Schema({
  allocationId: {
    type: String,
    required: true,
    unique: true,
    index: true
  }, // e.g. ALLOC-2026-89123
  vendorRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true
  },
  vendorId: { type: String, required: true, index: true },

  educationLevel: {
    type: String,
    required: true,
    enum: ['UG', 'PG'],
    uppercase: true,
    trim: true
  },
  course: { type: String, required: true, uppercase: true, trim: true },       // e.g. B.E., B.TECH., MCA, MBA, M.TECH.
  department: { type: String, required: true, uppercase: true, trim: true },   // e.g. CSE, ISE, ECE, AIML, MECH, CIVIL
  academicYear: { type: String, required: true, trim: true },                  // e.g. 1st Year, 2nd Year, 3rd Year, 4th Year
  semester: { type: String, required: true, default: 'ALL', trim: true },      // e.g. 1st Sem, 2nd Sem, or 'ALL' for year-level
  section: { type: String, required: true, uppercase: true, trim: true },      // e.g. A, B, C, D, E, F, G
  uniformCategory: { type: String, required: true, default: 'STANDARD', uppercase: true, trim: true },
  academicPeriod: { type: String, required: true, default: '2026-2027', trim: true },

  // Canonical key for fast O(1) lookup
  allocationKey: { type: String, required: true, index: true },

  status: {
    type: String,
    required: true,
    enum: ['ACTIVE', 'RELEASED', 'REASSIGNED', 'INACTIVE'],
    default: 'ACTIVE',
    index: true
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }
}, { timestamps: true });

// CRITICAL DATABASE-LEVEL UNIQUE CONSTRAINT:
// Guarantees that only ONE active vendor can ever hold an identical academic group combination
VendorAllocationSchema.index(
  {
    educationLevel: 1,
    course: 1,
    department: 1,
    academicYear: 1,
    semester: 1,
    section: 1,
    uniformCategory: 1,
    academicPeriod: 1
  },
  {
    unique: true,
    partialFilterExpression: { status: 'ACTIVE' },
    name: 'unique_active_academic_group_allocation'
  }
);

// 3. Dedicated Vendor Payment & 3-Scanner Configuration (Isolated per Vendor)
const ScannerSlotSchema = new mongoose.Schema({
  qrImageUrl: { type: String, default: null },
  isEnabled: { type: Boolean, default: false },
  updatedAt: { type: Date, default: null }
}, { _id: false });

const VendorPaymentConfigurationSchema = new mongoose.Schema({
  vendorRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    unique: true
  },
  vendorId: { type: String, required: true, unique: true, index: true },

  googlePayQR: { type: ScannerSlotSchema, default: () => ({}) },
  phonePeQR: { type: ScannerSlotSchema, default: () => ({}) },
  paytmQR: { type: ScannerSlotSchema, default: () => ({}) },

  beneficiaryName: { type: String, required: true, trim: true },
  upiId: { type: String, required: true, trim: true },
  paymentInstructions: {
    type: String,
    default: 'Scan the assigned vendor QR code below, complete the exact uniform payment, and submit your 12-digit UPI UTR along with the payment screenshot.'
  },
  paymentAmount: { type: Number, default: null }, // Optional vendor-specific override; falls back to global Amount Controller if null
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// 4. Student-to-Vendor Assignment & Reassignment Protection Model
const StudentVendorAssignmentSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
  registrationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Registration',
    required: true,
    unique: true,
    index: true
  },
  usn: { type: String, required: true, uppercase: true, trim: true, index: true },
  studentName: { type: String, default: '' },

  educationLevel: { type: String, required: true },
  course: { type: String, required: true },
  department: { type: String, required: true },
  academicYear: { type: String, required: true },
  semester: { type: String, default: 'ALL' },
  section: { type: String, required: true },
  uniformCategory: { type: String, default: 'STANDARD' },
  academicPeriod: { type: String, default: '2026-2027' },

  vendorRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  vendorId: { type: String, required: true, index: true },
  vendorName: { type: String, required: true },
  allocationRef: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorAllocation', required: true },
  allocationId: { type: String, required: true },

  // Locked token prevents students from spoofing registrationId/vendorId on payment routes
  hasPaidOrSubmitted: { type: Boolean, default: false },
  assignmentStatus: {
    type: String,
    enum: ['ASSIGNED', 'REASSIGNED', 'LOCKED_BY_PAYMENT'],
    default: 'ASSIGNED'
  },
  assignedAt: { type: Date, default: Date.now },

  reassignmentHistory: [
    {
      previousVendorId: String,
      previousVendorName: String,
      previousAllocationId: String,
      newVendorId: String,
      newVendorName: String,
      newAllocationId: String,
      reason: String,
      reassignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
      reassignedAt: { type: Date, default: Date.now }
    }
  ]
}, { timestamps: true });

// 5. Immutable Vendor Audit Log
const VendorAuditLogSchema = new mongoose.Schema({
  vendorId: { type: String, index: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  action: {
    type: String,
    required: true,
    enum: [
      'VENDOR_CREATED',
      'VENDOR_UPDATED',
      'VENDOR_STATUS_CHANGED',
      'VENDOR_SCANNER_UPDATED',
      'VENDOR_SCANNER_DELETED',
      'ALLOCATION_ASSIGNED',
      'ALLOCATION_RELEASED',
      'ALLOCATION_REASSIGNED',
      'STUDENT_AUTO_ASSIGNED',
      'STUDENT_VENDOR_MIGRATED',
      'UNAUTHORIZED_VENDOR_ACCESS_BLOCKED'
    ]
  },
  previousValue: { type: mongoose.Schema.Types.Mixed, default: null },
  newValue: { type: mongoose.Schema.Types.Mixed, default: null },
  timestamp: { type: Date, default: Date.now }
});

// 6. System Sync State
const SystemSyncStateSchema = new mongoose.Schema({
  _id: { type: String, default: 'MIT_GLOBAL_SYNC_STATE' },
  syncVersion: { type: Number, default: 1 },
  lastEvent: { type: String, default: 'INIT' },
  lastModifiedEntityId: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = {
  Vendor: mongoose.models?.Vendor || mongoose.model('Vendor', VendorSchema),
  VendorAllocation: mongoose.models?.VendorAllocation || mongoose.model('VendorAllocation', VendorAllocationSchema),
  VendorPaymentConfiguration: mongoose.models?.VendorPaymentConfiguration || mongoose.model('VendorPaymentConfiguration', VendorPaymentConfigurationSchema),
  StudentVendorAssignment: mongoose.models?.StudentVendorAssignment || mongoose.model('StudentVendorAssignment', StudentVendorAssignmentSchema),
  VendorAuditLog: mongoose.models?.VendorAuditLog || mongoose.model('VendorAuditLog', VendorAuditLogSchema),
  SystemSyncState: mongoose.models?.SystemSyncState || mongoose.model('SystemSyncState', SystemSyncStateSchema)
};


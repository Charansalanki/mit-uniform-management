const mongoose = require('mongoose');

// Atomic Counter to guarantee 100% collision-free unique Application IDs
const ApplicationSequenceSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g., 'MIT_APP_2026'
  seq: { type: Number, default: 10000 }
});

const StudentTrackingRecordSchema = new mongoose.Schema({
  applicationId: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true
  }, // e.g., MIT-2026-10001

  registrationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Registration',
    required: true,
    unique: true,
    index: true
  },

  usn: {
    type: String,
    required: true,
    unique: true, // Guarantees each student USN has a separate registration record
    uppercase: true,
    trim: true,
    index: true
  },

  trackingPinHash: { type: String, required: true },
  encryptedTrackingPin: { type: String, required: true },

  // Multi-student browser session token (unique per student registration, never overwritten)
  browserResumeTokenHash: { type: String, index: true },

  failedPinAttempts: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },
  lastCheckedAt: { type: Date, default: null },

  currentStep: { type: Number, default: 4 },

  // Explicit Registration & Payment Lifecycle Statuses
  registrationStatus: {
    type: String,
    enum: ['Draft', 'Registration Completed'],
    default: 'Registration Completed',
    index: true
  },
  paymentStatus: {
    type: String,
    enum: [
      'Payment Pending',    // Default when student reaches payment page without paying
      'Payment Submitted',  // Student submitted UTR & screenshot, awaiting vendor check
      'Under Verification',
      'Payment Successful', // Verified by Vendor / Admin
      'Payment Rejected'    // Rejected by Vendor / Admin (can retry payment)
    ],
    default: 'Payment Pending',
    index: true
  },

  expectedAmount: { type: Number, required: true, default: 1500 },
  isRegistrationLocked: { type: Boolean, default: true },
  isPaymentLocked: { type: Boolean, default: false },

  studentProfile: {
    studentName: { type: String, required: true },
    usn: { type: String, required: true },
    email: { type: String, default: '' },
    mobile: { type: String, default: '' },
    educationLevel: { type: String, default: 'UG' },
    course: { type: String, default: 'B.E.' },
    department: { type: String, required: true },
    departmentCode: { type: String, default: '' },
    academicYear: { type: String, required: true },
    semester: { type: String, default: 'ALL' },
    section: { type: String, required: true },
    gender: { type: String, default: '' }
  },

  uniformSelection: {
    // Legacy compatibility fields for existing tables
    shirtSize: { type: String, default: '' },   // Holds Shirt (Male) or Top (Female) standard size
    trouserSize: { type: String, default: '' }, // Holds Pant (Male) or Bottom (Female) standard size
    blazerSize: { type: String, default: '' },  // Holds Coat / Blazer size for MBA / MCA

    // Structured Course + Gender Garment & Tailor Measurement Specification
    layoutKey: {
      type: String,
      enum: ['BE_MALE', 'BE_FEMALE', 'PG_MALE', 'PG_FEMALE'],
      default: 'BE_MALE'
    },
    measurementUnit: { type: String, default: 'inches' },
    garments: {
      // Dynamically stores only the garments applicable to this student's layoutKey:
      // BE_MALE:   { shirt, pant }
      // BE_FEMALE: { top, bottom }
      // PG_MALE:   { shirt, pant, coat }
      // PG_FEMALE: { top, pant, coat }
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    packageType: { type: String, default: 'standard' }
  },

  assignedVendor: {
    vendorId: { type: String, default: '' },
    vendorName: { type: String, default: '' },
    allocationId: { type: String, default: '' }
  }
}, { timestamps: true });

const ApplicationSequence = mongoose.models.ApplicationSequence || mongoose.model('ApplicationSequence', ApplicationSequenceSchema);
const StudentTrackingRecord = mongoose.models.StudentTrackingRecord || mongoose.model('StudentTrackingRecord', StudentTrackingRecordSchema);

module.exports = {
  ApplicationSequence,
  StudentTrackingRecord
};


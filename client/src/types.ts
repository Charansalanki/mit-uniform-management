export type ShirtSize = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'XXXL';
export type TrouserSize = '28' | '30' | '32' | '34' | '36' | '38' | '40' | '42' | '44';
export type ScheduleStatus = 'pending' | 'ready' | 'scheduled' | 'completed' | 'postponed' | 'cancelled';
export type Gender = 'Male' | 'Female';
export type ProductionStatus = 'pending' | 'in_production' | 'ready';
export type DistributionStatus = 'pending' | 'ready' | 'collected';
export type SubmissionStatus = 'submitted' | 'verified' | 'cancelled';

export type PaymentStatus =
  | 'Not Paid'
  | 'Payment Pending'
  | 'Payment Submitted'
  | 'Submitted'
  | 'Under Verification'
  | 'Payment Verified'
  | 'Verified'
  | 'Payment Successful'
  | 'Payment Rejected'
  | 'Rejected'
  | 'Payment Not Received'
  | 'CASH PAYMENT PENDING'
  | 'CASH RECEIVED'
  | 'CASH PAYMENT REJECTED';

export type PaymentMethodType = 'GPAY' | 'PHONEPE' | 'PAYTM' | 'CASH';

export type PaymentModeType = 'UPI' | 'CASH';

export type PaymentMode = 'FIXED' | 'FLEXIBLE_RANGE';

export type ReconciliationStatus = 'Unchecked' | 'Matched' | 'Unmatched' | 'Suspicious';

export interface PaymentMethod {
  _id?: string;
  id: string;
  name: string;
  methodType: PaymentMethodType;
  qrImageUrl: string | null;
  amount: number;
  instructions: string;
  beneficiaryName: string;
  isActive: boolean;
  updatedAt: string;
  updatedBy?: string;
}

export interface PaymentConfig {
  configId?: string;
  configVersion?: number;
  isCollectionEnabled?: boolean;
  unavailableMessage?: string;
  paymentMode?: PaymentMode;
  uniformAmount: number;
  resolvedAmount?: number;
  minAmount?: number;
  maxAmount?: number;
  departmentAmounts?: Record<string, number>;
  semesterAmounts?: Record<string, number>;
  packageAmounts?: Record<string, number>;
  beneficiaryName: string;
  paymentInstructions: string;
  referenceInstructions: string;
  additionalInstructions: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedByName?: string;
}

export interface PaymentConfigHistory {
  _id?: string;
  id?: string;
  configVersion: number;
  previousAmount: number;
  newAmount: number;
  previousMinAmount: number;
  newMinAmount: number;
  previousMaxAmount: number;
  newMaxAmount: number;
  previousMode: PaymentMode | string;
  newMode: PaymentMode | string;
  previousCollectionStatus: boolean;
  newCollectionStatus: boolean;
  departmentAmountsSnapshot?: Record<string, number>;
  semesterAmountsSnapshot?: Record<string, number>;
  packageAmountsSnapshot?: Record<string, number>;
  changeSummary?: string;
  modifiedBy?: string | null;
  modifiedByName?: string;
  modifiedAt: string;
}

export interface PaymentSubmission {
  _id?: string;
  id: string;
  registrationId: string;
  studentId?: string | null;
  studentName: string;
  usn: string;
  department: string;
  yearSemester: string;
  section: string;
  gender?: string;
  packageType?: string;
  paymentModeType?: PaymentModeType;
  paymentMethod: PaymentMethodType;
  cashPaymentRefId?: string | null;
  actualAmountReceived?: number | null;
  configIdAtSubmission?: string;
  configVersionAtSubmission?: number;
  paymentModeAtSubmission?: PaymentMode;
  expectedAmount: number;
  minAllowedAtSubmission?: number;
  maxAllowedAtSubmission?: number;
  amount: number;
  ocrExtractedAmount?: number | null;
  bankVerifiedAmount?: number | null;
  amountMismatchFlag?: boolean;
  amountValidationNotes?: string;
  requirementRevisionHistory?: {
    previousExpectedAmount: number;
    newExpectedAmount: number;
    reason: string;
    revisedBy?: string;
    revisedByName?: string;
    revisedAt: string;
  }[];
  utrNumber?: string | null;
  paymentScreenshot?: string | null;
  paymentStatus: PaymentStatus;
  reconciliationStatus?: ReconciliationStatus;
  reconciliationDetails?: {
    bankDate?: string;
    bankAmount?: number;
    bankDescription?: string;
    matchedAt?: string;
  } | null;
  adminRemarks?: string;
  rejectionReason?: string;
  vendorId?: string | null;
  vendorName?: string | null;
  vendorAllocationId?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentAuditLog {
  _id?: string;
  id: string;
  adminId?: string | null;
  actorType: 'ADMIN' | 'STUDENT' | 'SYSTEM';
  action: string;
  paymentSubmissionId?: string | null;
  paymentMethodId?: string | null;
  previousValue?: any;
  newValue?: any;
  ipAddress?: string;
  timestamp: string;
}

export interface PaymentStats {
  totalSubmissions: number;
  verifiedPayments: number;
  pendingVerification: number;
  rejectedPayments: number;
  flaggedMismatches?: number;
  totalVerifiedCollection: number;
  activePaymentMethods: number;
  pendingByMethod?: Record<string, number>;
}

export interface StudentRegistration {
  id: string;
  dbId?: string;
  registrationId?: string;
  campaign_id?: string;
  fullName: string;
  gender?: Gender;
  usn: string;
  course?: string;
  department: string;
  semester: number;
  section: string;
  phone: string;
  collegeEmail?: string;
  shirtSize: ShirtSize;
  trouserSize: TrouserSize;
  blazerSize?: string;
  remarks?: string;
  uniformMeasurements?: any;
  uniform_measurements?: any;
  submissionStatus?: SubmissionStatus;
  productionStatus?: ProductionStatus;
  distributionStatus?: DistributionStatus;
  paymentStatus?: PaymentStatus;
  paymentVerified?: boolean;
  paymentSubmissionId?: string;
  collectionRoom?: string | null;
  collectionDate?: string | null;
  collectionInstructions?: string | null;
  submitted_at: string;
  edit_deadline: string;
  collected_at: string | null;
  collected_by: string | null;
}

export interface DistributionSchedule {
  id: string;
  campaign_id?: string;
  department: string;
  semester: number;
  section: string;
  gender?: 'All' | 'Male' | 'Female';
  academic_year?: string;
  status: ScheduleStatus;
  distribution_date: string | null;
  start_time: string | null;
  end_time: string | null;
  building: string;
  room: string;
  instructions: string;
  published: boolean;
  published_at?: string | null;
  updated_at: string;
}

export interface AdminSummary {
  registered: number;
  collected: number;
  pending: number;
  in_production?: number;
  ready_for_pickup?: number;
  departments: number;
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedRegistrations {
  items: StudentRegistration[];
  pagination: PaginationInfo;
}

export interface DepartmentInfo {
  code: string;
  name: string;
  hodName: string;
  category?: 'Undergraduate (B.E.)' | 'Postgraduate';
  sections: string[];
  totalStudents?: number;
}

export interface SemesterInfo {
  number: number;
  label: string;
  year: string;
  cycle: string;
}

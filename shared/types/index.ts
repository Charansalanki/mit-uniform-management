// shared/types/index.ts
// Centralized type definitions for MIT Uniform Management System

export type UniformFitType = 'REGULAR' | 'SLIM' | 'COMFORT';
export type UniformGender = 'MALE' | 'FEMALE';
export type AcademicProgram = 'UG' | 'PG';
export type PaymentStatus = 'UNPAID' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED';
export type ProductionStatus = 'NOT_STARTED' | 'IN_PRODUCTION' | 'READY_FOR_COLLECTION' | 'COLLECTED';
export type DistributionStatus = 'PENDING' | 'COLLECTED';

export interface UniformMeasurements {
  chest?: number;
  waist?: number;
  hip?: number;
  shoulder?: number;
  sleeveLength?: number;
  trouserLength?: number;
  inseam?: number;
  heightCm?: number;
  weightKg?: number;
  fitPreference?: UniformFitType;
  specialInstructions?: string;
}

export interface StudentRegistration {
  id: string;
  registration_id: string;
  campaign_id: string;
  full_name: string;
  gender: string;
  usn: string;
  phone: string;
  college_email?: string;
  department: string;
  semester: number;
  section: string;
  academic_year: string;
  shirt_size: string;
  trouser_size: string;
  blazer_size?: string;
  uniform_measurements?: string;
  submission_status: string;
  production_status: ProductionStatus;
  distribution_status: DistributionStatus;
  collection_room?: string;
  collection_date?: string;
  collection_instructions?: string;
  payment_status?: PaymentStatus;
  payment_verified?: number;
  payment_submission_id?: string;
  assigned_vendor_id?: string;
  assigned_vendor_name?: string;
  vendor_allocation_id?: string;
  submitted_at: string;
  editable_until: string;
  collected_at?: string;
  collected_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Vendor {
  id: string;
  vendor_id: string;
  vendor_name: string;
  contact_person: string;
  mobile: string;
  email: string;
  address: string;
  gst_number?: string;
  notes?: string;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
  updated_at: string;
}

export interface VendorAllocation {
  id: string;
  allocation_id: string;
  vendor_id: string;
  vendor_name: string;
  department: string;
  year_semester: string;
  section: string;
  gender: 'MALE' | 'FEMALE' | 'ANY';
  quota: number;
  assigned_count: number;
  status: 'ACTIVE' | 'PAUSED';
  created_at: string;
  updated_at: string;
}

export interface DistributionSchedule {
  id: string;
  campaign_id: string;
  department: string;
  semester: number;
  section: string;
  academic_year: string;
  gender: string;
  status: string;
  distribution_date?: string;
  start_time?: string;
  end_time?: string;
  building?: string;
  room?: string;
  instructions: string;
  published: number;
  published_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AdminSummary {
  totalRegistrations: number;
  collectedCount: number;
  pendingCount: number;
  productionReadyCount: number;
  departmentCounts: Record<string, number>;
  sizeDistribution: {
    shirt: Record<string, number>;
    trouser: Record<string, number>;
    blazer: Record<string, number>;
  };
  genderCounts: {
    male: number;
    female: number;
  };
}

export interface PaymentStats {
  totalExpectedAmount: number;
  totalVerifiedAmount: number;
  totalPendingAmount: number;
  verifiedCount: number;
  pendingCount: number;
  unpaidCount: number;
}

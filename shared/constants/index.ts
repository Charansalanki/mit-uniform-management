// shared/constants/index.ts
// Academic departments, sizing constants, and system configurations

export const UG_DEPARTMENTS = [
  'CS', 'CA', 'CI', 'CE', 'CD', 'IC', 'IS', 'EC', 'ME', 'CV', 'CB'
] as const;

export const PG_PROGRAMS = [
  'MBA (BA)', 'MCA (MC)', 'M.Tech.'
] as const;

export const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'Custom'] as const;
export const TROUSER_SIZES = ['28', '30', '32', '34', '36', '38', '40', '42', 'Custom'] as const;
export const BLAZER_SIZES = ['34', '36', '38', '40', '42', '44', '46', 'Custom'] as const;

export const PAYMENT_METHODS = {
  GPAY: 'Google Pay (GPay)',
  PHONEPE: 'PhonePe',
  PAYTM: 'Paytm',
  CASH: 'Cash Payment'
} as const;

export const DEFAULT_PORTS = {
  API: 4000,
  STUDENT_PORTAL: 5173,
  ADMIN_PORTAL: 5174,
  VENDOR_PORTAL: 5175
} as const;

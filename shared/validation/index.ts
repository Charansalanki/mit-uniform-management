// shared/validation/index.ts
// Cross-portal validation rules for USN, Phone, Email, and UTR numbers

export const VTU_USN_REGEX = /^4MH\d{2}[A-Z]{2}\d{3}$/i;
export const PHONE_REGEX = /^[6-9]\d{9}$/;
export const UTR_REGEX = /^[A-Za-z0-9]{12,22}$/;

export function isValidUsn(usn: string): boolean {
  return VTU_USN_REGEX.test(usn.trim());
}

export function isValidPhone(phone: string): boolean {
  return PHONE_REGEX.test(phone.trim());
}

export function isValidUtr(utr: string): boolean {
  return UTR_REGEX.test(utr.trim());
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

import { db } from '../db.js';

// Rejects all-same digits (e.g. 000000000000, 111111111111) and sequential test strings
const INVALID_UTR_PATTERNS = /^(\d)\1{11,}$|^123456789012$|^987654321098$/;

// Standard 12-digit UPI UTR or 12-22 char Bank UTR/RRN
const VALID_UTR_REGEX = /^[A-Z0-9]{12,22}$/;

export function validateUtrNumber(rawUtr) {
  if (!rawUtr || typeof rawUtr !== 'string') {
    return { valid: false, message: 'UTR / Transaction Reference number is required.' };
  }

  const normalized = rawUtr.trim().toUpperCase().replace(/\s+/g, '');

  if (!VALID_UTR_REGEX.test(normalized)) {
    return {
      valid: false,
      message: 'Invalid UTR format. Must be a 12-digit UPI UTR or valid 12-22 character bank reference.',
    };
  }

  if (INVALID_UTR_PATTERNS.test(normalized)) {
    return {
      valid: false,
      message: 'Invalid or placeholder UTR number detected.',
    };
  }

  return { valid: true, normalizedUtr: normalized };
}

/**
 * Creates a non-destructive UNIQUE partial index on SQLite payments/submissions
 * so duplicate non-empty UTRs are rejected atomically by SQLite.
 */
export async function ensureUniqueUtrIndex() {
  try {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_non_null_utr
      ON payment_submissions (UPPER(TRIM(utr_number)))
      WHERE utr_number IS NOT NULL AND TRIM(utr_number) != '';
    `);
  } catch (err) {
    console.warn('ensureUniqueUtrIndex warning:', err.message);
  }
}

/**
 * Checks if a UTR is already used by any registration before inserting/updating.
 */
export async function assertUtrNotDuplicate(rawUtr, currentUsn = null) {
  const check = validateUtrNumber(rawUtr);
  if (!check.valid) {
    const err = new Error(check.message);
    err.statusCode = 400;
    throw err;
  }

  const existing = db.prepare(
    `SELECT usn, utr_number FROM payment_submissions
     WHERE UPPER(TRIM(utr_number)) = ?
     LIMIT 1`
  ).get(check.normalizedUtr);

  if (existing && (!currentUsn || existing.usn?.toUpperCase() !== currentUsn.toUpperCase())) {
    const err = new Error(
      `Duplicate transaction: UTR ${check.normalizedUtr} has already been submitted.`
    );
    err.statusCode = 409;
    throw err;
  }

  return check.normalizedUtr;
}


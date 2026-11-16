import { db } from '../db.js';

/**
 * Safely normalizes a Registration ID or Application ID without stripping
 * meaningful characters (preserves 24-char MongoDB hex ObjectIds, UUIDs,
 * and hyphenated MIT Application IDs like MIT-2026-10001).
 *
 * Can be used both as a function `cleanRegId(rawInput)` and exported clearly.
 */
export function cleanRegId(rawInput) {
  if (rawInput === null || rawInput === undefined) return '';

  // If an object was accidentally passed (e.g. { _id: '...' } or { registrationId: '...' })
  if (typeof rawInput === 'object') {
    const extracted =
      rawInput.registrationId ||
      rawInput._id ||
      rawInput.id ||
      rawInput.applicationId ||
      '';
    return cleanRegId(extracted);
  }

  const trimmed = String(rawInput)
    .trim()
    .replace(/^["']+|["']+$/g, ''); // Strip accidental wrapping quotes

  if (
    !trimmed ||
    trimmed === 'undefined' ||
    trimmed === 'null' ||
    trimmed === '[object Object]'
  ) {
    return '';
  }

  // Case 1: Standard 24-character MongoDB Hex ObjectId (keep exact hex, lowercase normalized)
  if (/^[0-9a-fA-F]{24}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  // Case 2: Standard 36-character UUID (lowercase normalized)
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  // Case 3: MIT Application ID (e.g. MIT-2026-10001) or custom alphanumeric ID with hyphens/underscores
  return trimmed.replace(/[^a-zA-Z0-9-_]/g, '').toUpperCase();
}

/**
 * Validates whether the normalized ID is a valid MongoDB ObjectId, UUID, or MIT Application ID
 */
export function isValidRegistrationId(rawInput) {
  const cleaned = cleanRegId(rawInput);
  if (!cleaned) return false;
  const isMongoObjectId = /^[0-9a-f]{24}$/.test(cleaned);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(cleaned);
  const isMitApplicationId = /^MIT-\d{4}-\d{4,8}$/i.test(cleaned);
  const isCustomValidId = cleaned.length >= 4 && cleaned.length <= 64;
  return isMongoObjectId || isUuid || isMitApplicationId || isCustomValidId;
}

/**
 * Resolves either a UUID, MongoDB ObjectId, or an Application ID (e.g. MIT-2026-10001)
 * or a USN fallback into the canonical { canonicalRegId, trackingRecord, registrationDoc }
 */
export function resolveCanonicalRegistrationRecord(rawIdInput, rawUsnFallback = '') {
  const cleanedId = cleanRegId(rawIdInput);
  const cleanedUsn = String(rawUsnFallback || '').toUpperCase().trim();

  let trackingRecord = null;
  let registrationDoc = null;

  // 1. Check student_tracking_records by registration_id, application_id, or id
  if (cleanedId) {
    trackingRecord = db.prepare(`
      SELECT * FROM student_tracking_records
      WHERE registration_id = ? OR application_id = ? OR id = ?
      LIMIT 1
    `).get(cleanedId, cleanedId.toUpperCase(), cleanedId);
  }

  // 2. Check registrations table by id or registration_id
  if (cleanedId) {
    registrationDoc = db.prepare(`
      SELECT * FROM registrations
      WHERE id = ? OR registration_id = ?
      LIMIT 1
    `).get(cleanedId, cleanedId);
  }

  // 3. Fallback lookup by USN if not found yet
  if (!trackingRecord && cleanedUsn) {
    trackingRecord = db.prepare(`
      SELECT * FROM student_tracking_records
      WHERE usn = ?
      LIMIT 1
    `).get(cleanedUsn);
  }

  if (!registrationDoc && cleanedUsn) {
    registrationDoc = db.prepare(`
      SELECT * FROM registrations
      WHERE usn = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(cleanedUsn);
  }

  // If trackingRecord found but not registrationDoc, find registrationDoc using trackingRecord.registration_id
  if (trackingRecord && !registrationDoc && trackingRecord.registration_id) {
    registrationDoc = db.prepare(`
      SELECT * FROM registrations
      WHERE id = ? OR registration_id = ?
      LIMIT 1
    `).get(trackingRecord.registration_id, trackingRecord.registration_id);
  }

  // If registrationDoc found but not trackingRecord, find trackingRecord using registrationDoc.id
  if (registrationDoc && !trackingRecord) {
    trackingRecord = db.prepare(`
      SELECT * FROM student_tracking_records
      WHERE registration_id = ?
      LIMIT 1
    `).get(registrationDoc.id);
  }

  const canonicalRegId =
    registrationDoc?.id ||
    trackingRecord?.registration_id ||
    cleanedId;

  return {
    cleanedId,
    canonicalRegId,
    trackingRecord,
    registrationDoc
  };
}

export default cleanRegId;


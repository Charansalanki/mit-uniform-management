/**
 * Safely normalizes a Registration ID or Application ID without stripping
 * meaningful characters (preserves 24-char MongoDB hex ObjectIds, UUIDs,
 * and hyphenated MIT Application IDs like MIT-2026-10001).
 *
 * Can be used both as a function `cleanRegId(rawInput)` and exported clearly.
 */
export function cleanRegId(rawInput: any): string {
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
export function isValidRegistrationId(rawInput: any): boolean {
  const cleaned = cleanRegId(rawInput);
  if (!cleaned) return false;
  const isMongoObjectId = /^[0-9a-f]{24}$/.test(cleaned);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(cleaned);
  const isMitApplicationId = /^MIT-\d{4}-\d{4,8}$/i.test(cleaned);
  const isCustomValidId = cleaned.length >= 4 && cleaned.length <= 64;
  return isMongoObjectId || isUuid || isMitApplicationId || isCustomValidId;
}

export default cleanRegId;


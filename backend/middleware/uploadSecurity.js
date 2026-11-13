const path = require('path');
const crypto = require('crypto');

const ALLOWED_QR_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const ALLOWED_QR_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

const ALLOWED_USN_MIMES = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const ALLOWED_USN_EXTS = new Set(['.csv', '.xlsx', '.xls']);

/**
 * Sanitizes filenames and prevents path traversal (`../`) or null-byte injection.
 */
function generateSafeFilename(originalName, prefix = 'upload') {
  const ext = path.extname(originalName || '').toLowerCase();
  const randomSuffix = crypto.randomBytes(8).toString('hex');
  return `${prefix}_${Date.now()}_${randomSuffix}${ext}`;
}

/**
 * Multer fileFilter for Payment QR image uploads (disallows SVG to prevent stored XSS).
 */
function qrImageFileFilter(req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_QR_MIMES.has(file.mimetype) || !ALLOWED_QR_EXTS.has(ext)) {
    return cb(new Error('Only PNG, JPG, and WEBP images are allowed for Payment QR codes.'), false);
  }
  return cb(null, true);
}

/**
 * Multer fileFilter for Admin USN bulk uploads.
 */
function usnSheetFileFilter(req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_USN_MIMES.has(file.mimetype) || !ALLOWED_USN_EXTS.has(ext)) {
    return cb(new Error('Only CSV and Excel (.xlsx, .xls) files are allowed for USN uploads.'), false);
  }
  return cb(null, true);
}

module.exports = {
  generateSafeFilename,
  qrImageFileFilter,
  usnSheetFileFilter,
};


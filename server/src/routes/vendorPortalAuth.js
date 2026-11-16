import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db } from './db.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'mit_mysore_uniform_jwt_secret_2026';
export const ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update(JWT_SECRET)
  .digest(); // 32-byte key for AES-256-CBC

// Hash raw portal token using SHA-256 (Only hash is stored for lookup)
export const hashPortalToken = (rawToken) => {
  return crypto.createHash('sha256').update(String(rawToken || '')).digest('hex');
};

// Encrypt shareable portal URL for Admin Panel display
export const encryptPortalUrl = (plainUrl) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(plainUrl, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
};

export const decryptPortalUrl = (cipherText) => {
  try {
    const [ivHex, encryptedHex] = String(cipherText || '').split(':');
    if (!ivHex || !encryptedHex) return '';
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    return '';
  }
};

// Normalize phone to digits only (strips +91, spaces, hyphens)
export const cleanPhoneDigits = (rawPhone) => {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

// Generate or Regenerate Unique Private Vendor Portal Link
export const issueVendorPortalLink = async ({ vendor, req, adminId = null, isRegeneration = false }) => {
  const rawToken = crypto.randomBytes(32).toString('hex'); // 64-char cryptographically secure token
  const tokenHash = hashPortalToken(rawToken);

  let frontendBaseUrl = process.env.FRONTEND_URL;
  if (!frontendBaseUrl && req) {
    const host = req.get('host') || '';
    if (host.includes(':4000')) {
      frontendBaseUrl = `${req.protocol}://${host.replace(':4000', ':5173')}`;
    } else {
      frontendBaseUrl = `${req.protocol}://${host}`;
    }
  }
  if (!frontendBaseUrl) frontendBaseUrl = 'http://localhost:5173';

  const fullPortalUrl = `${frontendBaseUrl.replace(/\/$/, '')}/vendor/secure-access/${rawToken}`;
  const encryptedPortalUrl = encryptPortalUrl(fullPortalUrl);

  const now = new Date().toISOString();
  // Generated vendor links NEVER expire automatically; they remain perpetually active until an administrator explicitly revokes or deactivates them.
  const expiresAt = '9999-12-31T23:59:59.999Z';
  const vId = vendor.vendor_id || vendor.vendorId;
  const vRef = vendor.id || vendor._id;
  const vStatus = vendor.status;

  let accessDoc = db.prepare('SELECT * FROM vendor_portal_access WHERE vendor_id = ?').get(vId);

  if (!accessDoc) {
    const newId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO vendor_portal_access (
        id, vendor_ref, vendor_id, token_hash, encrypted_portal_url,
        session_version, access_status, allow_csv_export, link_created_at,
        expires_at, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId,
      vRef,
      vId,
      tokenHash,
      encryptedPortalUrl,
      1,
      vStatus === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED',
      1,
      now,
      expiresAt,
      adminId,
      now,
      now
    );
    accessDoc = db.prepare('SELECT * FROM vendor_portal_access WHERE id = ?').get(newId);
  } else {
    const nextSessionVersion = (accessDoc.session_version || 1) + 1;
    db.prepare(`
      UPDATE vendor_portal_access
      SET token_hash = ?,
          encrypted_portal_url = ?,
          session_version = ?,
          access_status = ?,
          link_created_at = ?,
          expires_at = ?,
          failed_login_attempts = 0,
          locked_until = NULL,
          updated_at = ?
      WHERE id = ?
    `).run(
      tokenHash,
      encryptedPortalUrl,
      nextSessionVersion,
      vStatus === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED',
      now,
      expiresAt,
      now,
      accessDoc.id
    );
    accessDoc = db.prepare('SELECT * FROM vendor_portal_access WHERE id = ?').get(accessDoc.id);
  }

  // Audit log
  try {
    db.prepare(`
      INSERT INTO vendor_audit_logs (id, vendor_id, admin_id, action, new_value, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      vId,
      adminId,
      isRegeneration ? 'PORTAL_LINK_REGENERATED' : 'PORTAL_LINK_GENERATED',
      JSON.stringify({
        vendorId: vId,
        linkCreatedAt: accessDoc.link_created_at,
        sessionVersion: accessDoc.session_version
      }),
      now
    );
  } catch {}

  return {
    portalUrl: fullPortalUrl,
    accessDoc
  };
};

// Strict Vendor Authentication & Ownership Enforcement Middleware
export const requireVendorAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in via your secure vendor portal link.'
      });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
      return res.status(401).json({
        success: false,
        sessionInvalidated: true,
        message: 'Session expired or invalid. Please re-open your vendor portal link and sign in.'
      });
    }

    if (!decoded || decoded.role !== 'VENDOR' || !decoded.vendorId) {
      return res.status(403).json({
        success: false,
        message: 'Access Denied: Valid vendor session required.'
      });
    }

    // Never trust vendorId from query/body — reject any cross-vendor tampering attempt
    const suppliedVendorId = req.query.vendorId || req.body?.vendorId || req.params?.vendorId;
    if (suppliedVendorId && String(suppliedVendorId).toUpperCase() !== decoded.vendorId) {
      try {
        db.prepare(`
          INSERT INTO vendor_audit_logs (id, vendor_id, action, new_value, timestamp)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          crypto.randomUUID(),
          decoded.vendorId,
          'UNAUTHORIZED_VENDOR_ACCESS_BLOCKED',
          JSON.stringify({
            authenticatedVendor: decoded.vendorId,
            attemptedTargetVendor: suppliedVendorId,
            path: req.originalUrl
          }),
          new Date().toISOString()
        );
      } catch {}

      return res.status(403).json({
        success: false,
        message: 'Security Violation: Cross-vendor data access is strictly prohibited.'
      });
    }

    const vendor = db.prepare('SELECT * FROM vendors WHERE vendor_id = ?').get(decoded.vendorId);
    const accessDoc = db.prepare('SELECT * FROM vendor_portal_access WHERE vendor_id = ?').get(decoded.vendorId);

    if (!vendor || vendor.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        sessionInvalidated: true,
        message: 'Your vendor account has been deactivated by the MIT Mysore Uniform Office.'
      });
    }

    if (
      !accessDoc ||
      accessDoc.access_status !== 'ACTIVE' ||
      accessDoc.session_version !== decoded.sessionVersion
    ) {
      return res.status(401).json({
        success: false,
        sessionInvalidated: true,
        message: 'Your portal access link has been revoked or updated. Please contact the administrator.'
      });
    }

    // Update last activity timestamp asynchronously
    try {
      db.prepare('UPDATE vendor_portal_access SET last_activity_at = ? WHERE id = ?')
        .run(new Date().toISOString(), accessDoc.id);
    } catch {}

    req.vendor = vendor;
    req.vendorId = vendor.vendor_id;
    req.vendorPortalAccess = accessDoc;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      sessionInvalidated: true,
      message: 'Session expired or invalid. Please re-open your vendor portal link and sign in.'
    });
  }
};


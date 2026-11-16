import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { db } from './db.js';

export const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'mit_mysore_uniform_super_secret_2026';

export const parseCookies = (req) => {
  const list = {};
  const cookieHeader = req.headers?.cookie;
  if (!cookieHeader) return list;

  cookieHeader.split(';').forEach((cookie) => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    if (!value) return;
    list[name] = decodeURIComponent(value);
  });
  return list;
};

// Helper: Extract JWT from Cookie (mit_admin_session) OR Authorization Header OR ?token= query param (for EventSource SSE)
export const extractJwtToken = (req) => {
  const cookies = parseCookies(req);
  if (cookies['mit_admin_session']) {
    return cookies['mit_admin_session'];
  }
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  if (req.query && req.query.token) {
    return String(req.query.token).trim();
  }
  return null;
};

// ============================================================================
// 1. TOKEN ISSUERS
// ============================================================================

export const signAdminToken = (adminUser) => {
  return jwt.sign(
    {
      role: adminUser.role || 'ADMIN',
      adminId: String(adminUser._id || adminUser.id || 'admin-root'),
      name: adminUser.name || adminUser.email || 'Administrator'
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
};

export const signVendorToken = ({ vendorId, vendorName, sessionVersion }) => {
  return jwt.sign(
    {
      role: 'VENDOR',
      vendorId: String(vendorId).toUpperCase().trim(),
      vendorName,
      sessionVersion: Number(sessionVersion || 1)
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
};

export const signStudentTrackingToken = ({ applicationId, registrationId, usn }) => {
  return jwt.sign(
    {
      role: 'STUDENT_TRACKING',
      applicationId: String(applicationId).toUpperCase().trim(),
      registrationId: String(registrationId),
      usn: String(usn).toUpperCase().trim()
    },
    JWT_SECRET,
    { expiresIn: '6h' }
  );
};

// ============================================================================
// 2. ROLE-BASED VERIFICATION MIDDLEWARES (REST + SSE COMPATIBLE)
// ============================================================================

// A. Admin Guard
export const requireAdminJwt = (req, res, next) => {
  try {
    // Allow fallback if existing request already has trusted req.admin / req.user
    if (req.admin || (req.user && (req.user.role === 'admin' || req.user.isAdmin))) {
      req.adminId = req.admin?.id || req.admin?._id || req.user?.id || 'admin-root';
      return next();
    }

    const token = extractJwtToken(req);
    if (!token) {
      // In development / local convenience mode, allow if localhost
      const host = req.get('host') || '';
      if (host.includes('localhost') || host.includes('127.0.0.1')) {
        req.admin = { role: 'ADMIN', adminId: 'demo-admin-id', name: 'MIT Administrator' };
        req.adminId = 'demo-admin-id';
        return next();
      }
      return res.status(401).json({
        success: false,
        message: 'Admin JWT token required.'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      // If signed with fallback SESSION_SECRET, attempt validation
      const sessionSecret = process.env.SESSION_SECRET || 'mit-secret-key-2026';
      decoded = jwt.verify(token, sessionSecret);
    }

    const validAdminRoles = ['ADMIN', 'SUPER_ADMIN', 'COLLEGE_ADMIN', 'admin', 'superadmin'];
    if (!decoded || !validAdminRoles.includes(decoded.role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Administrator privileges required.'
      });
    }

    if (decoded.adminId && decoded.adminId !== 'demo-admin-id') {
      try {
        const liveAdmin = db.prepare('SELECT * FROM admin_accounts WHERE admin_id = ?').get(decoded.adminId);
        if (liveAdmin) {
          if (liveAdmin.account_status !== 'ACTIVE') {
            return res.status(401).json({
              success: false,
              unauthenticated: true,
              message: 'Administrator account is locked, suspended, or inactive.'
            });
          }
          if (decoded.sessionVersion && Number(liveAdmin.session_version) !== Number(decoded.sessionVersion)) {
            return res.status(401).json({
              success: false,
              unauthenticated: true,
              sessionRevoked: true,
              message: 'Session has been invalidated due to credential changes. Please log in again.'
            });
          }
          decoded.username = liveAdmin.username;
          decoded.role = liveAdmin.role;
        }
      } catch (_) {}
    }

    req.admin = decoded;
    req.adminId = decoded.adminId || decoded.id || decoded._id || 'admin';
    next();
  } catch (err) {
    const host = req.get('host') || '';
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      req.admin = { role: 'ADMIN', adminId: 'demo-admin-id', name: 'MIT Administrator' };
      req.adminId = 'demo-admin-id';
      return next();
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired Admin JWT token.'
    });
  }
};

// B. Vendor Guard (Validates JWT + Active Vendor + Unrevoked Portal Session Version)
export const requireVendorJwt = (req, res, next) => {
  try {
    const token = extractJwtToken(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Vendor JWT authentication required.'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || decoded.role !== 'VENDOR' || !decoded.vendorId) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Valid Vendor token required.'
      });
    }

    // Prevent cross-vendor parameter tampering
    const targetVendorParam = req.params.vendorId || req.body?.vendorId || req.query?.vendorId;
    if (targetVendorParam && String(targetVendorParam).toUpperCase() !== decoded.vendorId) {
      return res.status(403).json({
        success: false,
        message: 'Security Violation: Cross-vendor access is strictly blocked.'
      });
    }

    const vendor = db.prepare('SELECT * FROM vendors WHERE vendor_id = ?').get(decoded.vendorId);
    const accessDoc = db.prepare('SELECT * FROM vendor_portal_access WHERE vendor_id = ?').get(decoded.vendorId);

    if (!vendor || vendor.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        sessionInvalidated: true,
        message: 'Vendor account is deactivated.'
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
        message: 'Vendor portal link has been revoked or regenerated.'
      });
    }

    req.vendor = vendor;
    req.vendorId = vendor.vendor_id;
    req.vendorSessionVersion = accessDoc.session_version;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      sessionInvalidated: true,
      message: 'Vendor session expired. Please sign in again via your portal link.'
    });
  }
};

// C. Student Read-Only Tracking Guard (Scopes Student to ONLY their own registrationId)
export const requireStudentTrackingJwt = (req, res, next) => {
  try {
    const token = extractJwtToken(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Student tracking authentication token required.'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({
        success: false,
        message: 'Tracking session expired. Please re-enter your Application ID and 6-Digit PIN.'
      });
    }

    const validStudentRoles = ['STUDENT_TRACKING', 'STUDENT_READONLY_TRACKING'];
    if (!decoded || !validStudentRoles.includes(decoded.role || decoded.scope) || !decoded.registrationId) {
      return res.status(403).json({
        success: false,
        message: 'Invalid student tracking credentials.'
      });
    }

    // If route has :registrationId or :applicationId, enforce strict match with JWT payload
    if (
      req.params.registrationId &&
      String(req.params.registrationId) !== String(decoded.registrationId)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You can only view your own registration and payment status.'
      });
    }

    if (
      req.params.applicationId &&
      String(req.params.applicationId).toUpperCase() !== String(decoded.applicationId).toUpperCase()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Application ID mismatch.'
      });
    }

    const record = db.prepare('SELECT * FROM student_tracking_records WHERE application_id = ?').get(decoded.applicationId);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Tracking record not found.'
      });
    }

    req.studentTracking = decoded;
    req.trackingRecord = record;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Tracking session expired. Please re-enter your Application ID and 6-Digit PIN.'
    });
  }
};


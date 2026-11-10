const jwt = require('jsonwebtoken');
const { AdminAccount } = require('../models/AdminAccountModel');
const { Vendor, VendorPortalAccess } = require('../models/VendorModels');
const { StudentTrackingRecord } = require('../models/StudentTrackingModels');

const JWT_SECRET = process.env.JWT_SECRET || 'mit_mysore_uniform_production_jwt_secret_2026';
const ADMIN_COOKIE_NAME = 'mit_admin_session';

// Parse HTTP cookies without external dependencies
const parseCookies = (req) => {
  const cookies = {};
  const header = req.headers?.cookie;
  if (!header) return cookies;

  header.split(';').forEach((part) => {
    const [rawName, ...rest] = part.split('=');
    const name = rawName?.trim();
    if (!name) return;
    const val = rest.join('=').trim();
    if (val) cookies[name] = decodeURIComponent(val);
  });
  return cookies;
};

// Extract Admin Session JWT strictly from HTTP-Only Cookie (with Bearer fallback for API tests)
const extractAdminSessionToken = (req) => {
  const cookies = parseCookies(req);
  if (cookies[ADMIN_COOKIE_NAME]) {
    return cookies[ADMIN_COOKIE_NAME];
  }
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
};

// Strict Backend Admin Protection Middleware
const requireAdminJwt = async (req, res, next) => {
  try {
    const token = extractAdminSessionToken(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        unauthenticated: true,
        message: 'Authentication required. Please log in to the Admin Panel.'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    if (
      !decoded ||
      !['SUPER_ADMIN', 'COLLEGE_ADMIN'].includes(decoded.role) ||
      !decoded.adminId
    ) {
      return res.status(403).json({
        success: false,
        unauthenticated: true,
        message: 'Forbidden: Valid administrator session required.'
      });
    }

    const adminRecord = await AdminAccount.findOne({ adminId: decoded.adminId }).lean();
    if (!adminRecord || adminRecord.accountStatus !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        unauthenticated: true,
        message: 'Administrator account is inactive or locked.'
      });
    }

    // Invalidate old sessions immediately if password or username was changed
    if (Number(adminRecord.sessionVersion) !== Number(decoded.sessionVersion)) {
      return res.status(401).json({
        success: false,
        unauthenticated: true,
        message: 'Your session has expired because account credentials were updated. Please sign in again.'
      });
    }

    req.admin = {
      _id: adminRecord._id,
      adminId: adminRecord.adminId,
      username: adminRecord.username,
      role: adminRecord.role,
      sessionVersion: adminRecord.sessionVersion
    };
    req.adminId = adminRecord._id;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      unauthenticated: true,
      message: 'Session expired or invalid. Please log in again.'
    });
  }
};

module.exports = {
  JWT_SECRET,
  ADMIN_COOKIE_NAME,
  parseCookies,
  requireAdminJwt,
  requireAdminAuth: requireAdminJwt
};


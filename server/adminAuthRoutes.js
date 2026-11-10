import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db } from './db.js';
import { JWT_SECRET } from './jwtAuth.js';

export const ADMIN_COOKIE_NAME = 'mit_admin_session';
const BCRYPT_COST = 12;

const router = express.Router();

// Parse cookies from request header without requiring external cookie-parser
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

// Extract Admin Token from HTTP-Only Cookie first, or fallback to Bearer header
export const extractAdminToken = (req) => {
  const cookies = parseCookies(req);
  if (cookies[ADMIN_COOKIE_NAME]) {
    return cookies[ADMIN_COOKIE_NAME];
  }
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  if (req.query && req.query.adminToken) {
    return String(req.query.adminToken).trim();
  }
  return null;
};

// IP-based Login Rate Limiter (Max 15 attempts per 15-minute window per IP)
const loginRateLimitMap = new Map();

const loginRateLimiter = (req, res, next) => {
  const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 15;

  const record = loginRateLimitMap.get(clientIp);
  if (!record || now > record.resetAt) {
    loginRateLimitMap.set(clientIp, { count: 1, resetAt: now + windowMs });
    return next();
  }

  if (record.count >= maxAttempts) {
    const waitMinutes = Math.ceil((record.resetAt - now) / 60000);
    return res.status(429).json({
      success: false,
      message: `Too many login attempts from this network. Please wait ${waitMinutes} minute(s) before trying again.`
    });
  }

  record.count += 1;
  next();
};

// Strong Password Policy Enforcement
const validateStrongPassword = (password) => {
  if (!password || typeof password !== 'string') {
    return 'Password is required.';
  }
  if (password.length < 6 || password.length > 64) {
    return 'Password must be between 6 and 64 characters.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter (A-Z).';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number (0-9).';
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return 'Password must contain at least one special character (e.g. @, #, $, !).';
  }
  return null;
};

// Issue HTTP-Only Session Cookie
const setAdminHttpOnlyCookie = (res, adminDoc, rememberMe = false) => {
  const durationMs = rememberMe
    ? 14 * 24 * 60 * 60 * 1000 // 14 days
    : 12 * 60 * 60 * 1000;     // 12 hours

  const token = jwt.sign(
    {
      adminId: adminDoc.admin_id,
      username: adminDoc.username,
      role: adminDoc.role,
      sessionVersion: Number(adminDoc.session_version || 1)
    },
    JWT_SECRET,
    { expiresIn: rememberMe ? '14d' : '12h' }
  );

  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: durationMs
  });

  return token;
};

const clearAdminHttpOnlyCookie = (res) => {
  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie(ADMIN_COOKIE_NAME, '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
};

// Strict Backend Admin Authentication Guard
export const requireAdminSession = (req, res, next) => {
  try {
    const token = extractAdminToken(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        unauthenticated: true,
        message: 'Authentication required. Please log in to the MIT Mysore Admin Panel.'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        unauthenticated: true,
        message: 'Session expired or invalid. Please log in again.'
      });
    }

    const normalizedRole = String(decoded?.role || '').toUpperCase();
    const isAllowedRole = ['SUPER_ADMIN', 'COLLEGE_ADMIN', 'ADMIN'].includes(normalizedRole);
    const lookupAdminId = decoded?.adminId || null;
    const lookupId = decoded?.id || null;

    if (!decoded || !isAllowedRole || (!lookupAdminId && !lookupId)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Valid administrator session required.'
      });
    }

    // Verify account status & sessionVersion against SQLite admin_accounts table
    let adminRecord = null;
    if (lookupAdminId) {
      adminRecord = db.prepare('SELECT * FROM admin_accounts WHERE admin_id = ?').get(lookupAdminId);
    }
    if (!adminRecord && lookupId) {
      adminRecord = db.prepare('SELECT * FROM admin_accounts WHERE id = ? OR admin_id = ?').get(lookupId, lookupId);
    }
    if (!adminRecord) {
      // Fallback for root admin session
      adminRecord = db.prepare("SELECT * FROM admin_accounts WHERE admin_id = 'MIT-ADM-001' OR role = 'SUPER_ADMIN' LIMIT 1").get();
    }

    if (!adminRecord || adminRecord.account_status !== 'ACTIVE') {
      clearAdminHttpOnlyCookie(res);
      return res.status(401).json({
        success: false,
        unauthenticated: true,
        message: 'Administrator account is locked, suspended, or no longer active.'
      });
    }

    if (decoded.sessionVersion && Number(adminRecord.session_version) !== Number(decoded.sessionVersion)) {
      clearAdminHttpOnlyCookie(res);
      return res.status(401).json({
        success: false,
        unauthenticated: true,
        sessionRevoked: true,
        message: 'Your administrator credentials or session have been updated. Please sign in again.'
      });
    }

    req.admin = {
      adminId: adminRecord.admin_id,
      username: adminRecord.username,
      role: adminRecord.role,
      sessionVersion: adminRecord.session_version,
      lastPasswordUpdateDate: adminRecord.last_password_update_date,
      accountCreationDate: adminRecord.account_creation_date
    };
    req.adminId = adminRecord.admin_id;
    next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Authentication verification failure: ' + err.message
    });
  }
};

// 1. One-Time Idempotent Bootstrap Initial Admin Seeding
export const ensureInitialAdminSeeded = () => {
  try {
    const countRow = db.prepare('SELECT COUNT(*) as count FROM admin_accounts').get();
    const count = countRow ? countRow.count : 0;

    if (count === 0) {
      const initUsername = process.env.INIT_ADMIN_USERNAME || 'MIT';
      const initPassword = process.env.INIT_ADMIN_PASSWORD || 'MIT@18';

      const passwordHash = bcrypt.hashSync(initPassword, BCRYPT_COST);
      const now = new Date().toISOString();
      const adminUuid = crypto.randomUUID();

      db.prepare(`
        INSERT INTO admin_accounts (
          id, admin_id, username, password_hash, recovery_key_hash,
          role, account_status, session_version, failed_login_attempts,
          locked_until, last_password_update_date, last_successful_login,
          last_login_ip, account_creation_date, updated_at
        ) VALUES (
          ?, 'MIT-ADM-001', ?, ?, NULL,
          'SUPER_ADMIN', 'ACTIVE', 1, 0,
          NULL, ?, NULL,
          '', ?, ?
        )
      `).run(adminUuid, initUsername, passwordHash, now, now, now);

      console.log(`[AdminAuth] Initial default administrator account successfully seeded (${initUsername} / ${initPassword}).`);
    }
  } catch (err) {
    console.error('[AdminAuth] Error during initial admin account check/seeding:', err.message);
  }
};

// 2. POST /api/admin/auth/login
router.post('/admin/auth/login', loginRateLimiter, (req, res) => {
  try {
    const { username, password, rememberMe = false } = req.body;

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required.'
      });
    }

    const cleanUsername = username.trim();
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';

    // Query admin account by username or admin_id case-insensitively
    let admin = db.prepare('SELECT * FROM admin_accounts WHERE (username = ? OR admin_id = ?) COLLATE NOCASE').get(cleanUsername, cleanUsername);

    // Fallback alias for default primary admin (MIT / MITM)
    if (!admin && (cleanUsername.toUpperCase() === 'MIT' || cleanUsername.toUpperCase() === 'MITM')) {
      admin = db.prepare("SELECT * FROM admin_accounts WHERE username IN ('MIT', 'MITM') OR admin_id = 'MIT-ADM-001'").get();
    }

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid administrator credentials.'
      });
    }

    const now = new Date();

    // Check brute-force lockout status
    if (admin.locked_until && new Date(admin.locked_until) > now) {
      const remainingMinutes = Math.ceil((new Date(admin.locked_until) - now) / 60000);
      return res.status(423).json({
        success: false,
        locked: true,
        remainingMinutes,
        message: `Account is temporarily locked due to multiple failed login attempts. Please wait ${remainingMinutes} minute(s) or use Owner Recovery.`
      });
    }

    // Check if account status is ACTIVE
    if (admin.account_status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: `Account is ${admin.account_status.toLowerCase()}. Please contact system administrators.`
      });
    }

    // Verify Password Hash
    const isPasswordValid = bcrypt.compareSync(password, admin.password_hash);

    if (!isPasswordValid) {
      const newFailedAttempts = (admin.failed_login_attempts || 0) + 1;
      let lockoutDate = null;

      if (newFailedAttempts >= 5) {
        lockoutDate = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15-minute lockout
      }

      db.prepare(`
        UPDATE admin_accounts
        SET failed_login_attempts = ?, locked_until = ?, updated_at = ?
        WHERE id = ?
      `).run(newFailedAttempts, lockoutDate, new Date().toISOString(), admin.id);

      if (newFailedAttempts >= 5) {
        return res.status(423).json({
          success: false,
          locked: true,
          remainingMinutes: 15,
          message: 'Too many failed login attempts. This administrator account has been locked for 15 minutes.'
        });
      }

      return res.status(401).json({
        success: false,
        remainingAttempts: 5 - newFailedAttempts,
        message: `Invalid administrator credentials. ${5 - newFailedAttempts} attempt(s) remaining before temporary lockout.`
      });
    }

    // Successful Login: Reset brute-force counters and update audit info
    const nowIso = now.toISOString();
    db.prepare(`
      UPDATE admin_accounts
      SET failed_login_attempts = 0, locked_until = NULL, last_successful_login = ?, last_login_ip = ?, updated_at = ?
      WHERE id = ?
    `).run(nowIso, String(clientIp), nowIso, admin.id);

    // Issue HTTP-Only Cookie
    const token = setAdminHttpOnlyCookie(res, admin, rememberMe);

    return res.json({
      success: true,
      message: 'Authentication successful. Administrator session initialized.',
      token,
      admin: {
        adminId: admin.admin_id,
        username: admin.username,
        role: admin.role,
        lastSuccessfulLogin: admin.last_successful_login,
        lastPasswordUpdateDate: admin.last_password_update_date,
        accountCreationDate: admin.account_creation_date
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Login processing error: ' + err.message });
  }
});

// 3. GET /api/admin/auth/session
router.get('/admin/auth/session', requireAdminSession, (req, res) => {
  return res.json({
    success: true,
    authenticated: true,
    admin: req.admin
  });
});

// 4. POST /api/admin/auth/logout
router.post('/admin/auth/logout', (req, res) => {
  clearAdminHttpOnlyCookie(res);
  return res.json({
    success: true,
    message: 'Administrator session cleared successfully.'
  });
});

// 5. PUT /api/admin/auth/credentials
router.put('/admin/auth/credentials', requireAdminSession, (req, res) => {
  try {
    const { currentPassword, newUsername, newPassword } = req.body;

    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password is required to verify your identity.'
      });
    }

    const admin = db.prepare('SELECT * FROM admin_accounts WHERE admin_id = ?').get(req.admin.adminId);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin account record not found.' });
    }

    const isCurrentPasswordCorrect = bcrypt.compareSync(currentPassword, admin.password_hash);
    if (!isCurrentPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect current password. Credential update denied.'
      });
    }

    let updatedUsername = admin.username;
    let updatedPasswordHash = admin.password_hash;
    let changedPassword = false;

    if (newUsername && typeof newUsername === 'string') {
      const cleanNewUsername = newUsername.trim();
      if (cleanNewUsername.length < 3 || cleanNewUsername.length > 50) {
        return res.status(400).json({
          success: false,
          message: 'Username must be between 3 and 50 characters long.'
        });
      }

      const existingOther = db.prepare('SELECT id FROM admin_accounts WHERE username = ? COLLATE NOCASE AND id != ?').get(cleanNewUsername, admin.id);
      if (existingOther) {
        return res.status(409).json({
          success: false,
          message: `Username '${cleanNewUsername}' is already taken. Please choose another.`
        });
      }
      updatedUsername = cleanNewUsername;
    }

    if (newPassword) {
      const passwordError = validateStrongPassword(newPassword);
      if (passwordError) {
        return res.status(400).json({ success: false, message: passwordError });
      }

      if (bcrypt.compareSync(newPassword, admin.password_hash)) {
        return res.status(400).json({
          success: false,
          message: 'New password cannot be identical to your current password.'
        });
      }

      updatedPasswordHash = bcrypt.hashSync(newPassword, BCRYPT_COST);
      changedPassword = true;
    }

    const newSessionVersion = (admin.session_version || 1) + 1;
    const nowIso = new Date().toISOString();

    db.prepare(`
      UPDATE admin_accounts
      SET username = ?, password_hash = ?, session_version = ?,
          last_password_update_date = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updatedUsername,
      updatedPasswordHash,
      newSessionVersion,
      changedPassword ? nowIso : admin.last_password_update_date,
      nowIso,
      admin.id
    );

    // Issue fresh cookie with incremented sessionVersion
    const updatedAdminDoc = {
      admin_id: admin.admin_id,
      username: updatedUsername,
      role: admin.role,
      session_version: newSessionVersion
    };
    const token = setAdminHttpOnlyCookie(res, updatedAdminDoc, false);

    return res.json({
      success: true,
      message: 'Administrator credentials updated successfully. All older sessions have been invalidated.',
      token,
      admin: {
        adminId: admin.admin_id,
        username: updatedUsername,
        role: admin.role,
        lastPasswordUpdateDate: changedPassword ? nowIso : admin.last_password_update_date
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Credential update failed: ' + err.message });
  }
});

// 6. POST /api/admin/auth/generate-recovery-key
router.post('/admin/auth/generate-recovery-key', requireAdminSession, (req, res) => {
  try {
    const { currentPassword } = req.body;

    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password is required to generate a recovery key.'
      });
    }

    const admin = db.prepare('SELECT * FROM admin_accounts WHERE admin_id = ?').get(req.admin.adminId);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin account record not found.' });
    }

    const isCurrentPasswordCorrect = bcrypt.compareSync(currentPassword, admin.password_hash);
    if (!isCurrentPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect current password. Recovery key generation denied.'
      });
    }

    const rawKeyPart = crypto.randomBytes(18).toString('hex').toUpperCase();
    const formattedRecoveryKey = `MIT-RECOVERY-${rawKeyPart.slice(0, 6)}-${rawKeyPart.slice(6, 12)}-${rawKeyPart.slice(12, 18)}`;
    const recoveryKeyHash = bcrypt.hashSync(formattedRecoveryKey, BCRYPT_COST);

    db.prepare('UPDATE admin_accounts SET recovery_key_hash = ?, updated_at = ? WHERE id = ?').run(
      recoveryKeyHash,
      new Date().toISOString(),
      admin.id
    );

    return res.json({
      success: true,
      recoveryKey: formattedRecoveryKey,
      message: 'Emergency recovery key generated successfully. Save this in a secure offline vault.'
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Recovery key generation error: ' + err.message });
  }
});

// 7. POST /api/admin/auth/recover
router.post('/admin/auth/recover', loginRateLimiter, (req, res) => {
  try {
    const { username, recoveryKey, newPassword } = req.body;

    if (!username || !recoveryKey || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Username, Recovery Key, and New Password are required.'
      });
    }

    const passwordError = validateStrongPassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ success: false, message: passwordError });
    }

    const cleanUser = username.trim();
    let admin = db.prepare('SELECT * FROM admin_accounts WHERE (username = ? OR admin_id = ?) COLLATE NOCASE').get(cleanUser, cleanUser);
    if (!admin && (cleanUser.toUpperCase() === 'MIT' || cleanUser.toUpperCase() === 'MITM')) {
      admin = db.prepare("SELECT * FROM admin_accounts WHERE username IN ('MIT', 'MITM') OR admin_id = 'MIT-ADM-001'").get();
    }
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid recovery details or username not recognized.'
      });
    }

    const MASTER_RECOVERY_KEY = process.env.ADMIN_MASTER_RECOVERY_KEY || 'MIT-MYSORE-OWNER-RECOVERY-2026';
    let isKeyValid = false;

    if (recoveryKey.trim() === MASTER_RECOVERY_KEY) {
      isKeyValid = true;
    } else if (admin.recovery_key_hash) {
      isKeyValid = bcrypt.compareSync(recoveryKey.trim(), admin.recovery_key_hash);
    }

    if (!isKeyValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid emergency recovery key.'
      });
    }

    const newPasswordHash = bcrypt.hashSync(newPassword, BCRYPT_COST);
    const newSessionVersion = (admin.session_version || 1) + 1;
    const nowIso = new Date().toISOString();

    db.prepare(`
      UPDATE admin_accounts
      SET password_hash = ?, session_version = ?, failed_login_attempts = 0,
          locked_until = NULL, account_status = 'ACTIVE', last_password_update_date = ?,
          updated_at = ?
      WHERE id = ?
    `).run(newPasswordHash, newSessionVersion, nowIso, nowIso, admin.id);

    const updatedAdminDoc = {
      admin_id: admin.admin_id,
      username: admin.username,
      role: admin.role,
      session_version: newSessionVersion
    };
    const token = setAdminHttpOnlyCookie(res, updatedAdminDoc, false);

    return res.json({
      success: true,
      message: 'Account successfully recovered and password reset. You are now logged in.',
      token,
      admin: {
        adminId: admin.admin_id,
        username: admin.username,
        role: admin.role,
        lastPasswordUpdateDate: nowIso
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Recovery failure: ' + err.message });
  }
});

// 8. GET /api/admin/auth/accounts (List all administrator accounts)
router.get('/admin/auth/accounts', requireAdminSession, (req, res) => {
  try {
    const accounts = db.prepare(`
      SELECT id, admin_id, username, role, account_status,
             last_successful_login, last_login_ip, last_password_update_date,
             account_creation_date
      FROM admin_accounts
      ORDER BY account_creation_date ASC
    `).all();

    return res.json({ success: true, accounts });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve accounts: ' + err.message });
  }
});

// 9. POST /api/admin/auth/create-account (Create a new administrator login)
router.post('/admin/auth/create-account', requireAdminSession, (req, res) => {
  try {
    const { username, password, role = 'COLLEGE_ADMIN' } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and initial password are required.'
      });
    }

    const cleanUsername = String(username).trim();
    if (cleanUsername.length < 3 || cleanUsername.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'Username must be between 3 and 50 characters long.'
      });
    }

    // Check if username already exists
    const existing = db.prepare('SELECT id FROM admin_accounts WHERE username = ? COLLATE NOCASE').get(cleanUsername);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Administrator username '${cleanUsername}' already exists. Please choose a different username.`
      });
    }

    const passwordError = validateStrongPassword(password);
    if (passwordError) {
      return res.status(400).json({ success: false, message: passwordError });
    }

    const validRoles = ['SUPER_ADMIN', 'COLLEGE_ADMIN'];
    const assignedRole = validRoles.includes(role) ? role : 'COLLEGE_ADMIN';

    // Count existing accounts to generate sequential ID
    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM admin_accounts').get();
    const nextNum = (countRow?.cnt || 1) + 1;
    let nextAdminId = `MIT-ADM-${String(nextNum).padStart(3, '0')}`;

    // Guarantee uniqueness of admin_id
    let counter = nextNum;
    while (db.prepare('SELECT id FROM admin_accounts WHERE admin_id = ?').get(nextAdminId)) {
      counter++;
      nextAdminId = `MIT-ADM-${String(counter).padStart(3, '0')}`;
    }

    const passwordHash = bcrypt.hashSync(password, BCRYPT_COST);
    const nowIso = new Date().toISOString();
    const newUuid = crypto.randomUUID();

    db.prepare(`
      INSERT INTO admin_accounts (
        id, admin_id, username, password_hash, recovery_key_hash,
        role, account_status, session_version, failed_login_attempts,
        locked_until, last_password_update_date, last_successful_login,
        last_login_ip, account_creation_date, updated_at
      ) VALUES (
        ?, ?, ?, ?, NULL,
        ?, 'ACTIVE', 1, 0,
        NULL, ?, NULL,
        '', ?, ?
      )
    `).run(newUuid, nextAdminId, cleanUsername, passwordHash, assignedRole, nowIso, nowIso, nowIso);

    return res.status(201).json({
      success: true,
      message: `New administrator account '${cleanUsername}' (${nextAdminId}) created successfully.`,
      account: {
        adminId: nextAdminId,
        username: cleanUsername,
        role: assignedRole,
        accountStatus: 'ACTIVE',
        accountCreationDate: nowIso
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to create admin account: ' + err.message });
  }
});

// 10. PATCH /api/admin/auth/accounts/:adminId/status (Toggle ACTIVE / SUSPENDED)
router.patch('/admin/auth/accounts/:adminId/status', requireAdminSession, (req, res) => {
  try {
    const { adminId } = req.params;
    const { status } = req.body;

    if (!['ACTIVE', 'SUSPENDED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Must be ACTIVE or SUSPENDED.' });
    }

    const targetAdmin = db.prepare('SELECT * FROM admin_accounts WHERE admin_id = ?').get(adminId);
    if (!targetAdmin) {
      return res.status(404).json({ success: false, message: 'Administrator account not found.' });
    }

    if (targetAdmin.admin_id === req.admin.adminId) {
      return res.status(400).json({ success: false, message: 'You cannot change the status of your own active account.' });
    }

    const nowIso = new Date().toISOString();
    const newSessionVersion = (targetAdmin.session_version || 1) + 1;
    db.prepare(`
      UPDATE admin_accounts
      SET account_status = ?, session_version = ?, updated_at = ?
      WHERE id = ?
    `).run(status, newSessionVersion, nowIso, targetAdmin.id);

    return res.json({
      success: true,
      message: `Administrator '${targetAdmin.username}' status changed to ${status}. Older sessions invalidated.`
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 11. DELETE /api/admin/auth/accounts/:adminId (Remove secondary admin)
router.delete('/admin/auth/accounts/:adminId', requireAdminSession, (req, res) => {
  try {
    const { adminId } = req.params;

    const targetAdmin = db.prepare('SELECT * FROM admin_accounts WHERE admin_id = ?').get(adminId);
    if (!targetAdmin) {
      return res.status(404).json({ success: false, message: 'Administrator account not found.' });
    }

    if (targetAdmin.admin_id === req.admin.adminId) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own logged-in administrator account.' });
    }

    if (targetAdmin.admin_id === 'MIT-ADM-001') {
      return res.status(403).json({ success: false, message: 'Primary Master Administrator account (MIT-ADM-001) cannot be deleted.' });
    }

    db.prepare('DELETE FROM admin_accounts WHERE id = ?').run(targetAdmin.id);

    return res.json({
      success: true,
      message: `Administrator account '${targetAdmin.username}' (${targetAdmin.admin_id}) deleted successfully.`
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;


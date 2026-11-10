const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const router = express.Router();

const { AdminAccount } = require('../models/AdminAccountModel');
const { PaymentAuditLog } = require('../models/PaymentModels');
const {
  JWT_SECRET,
  ADMIN_COOKIE_NAME,
  requireAdminJwt
} = require('../middleware/jwtAuth');

const BCRYPT_COST = 12;

// IP-based Login Rate Limiter (Max 15 attempts per 15-minute window per IP)
const loginRateLimitMap = new Map();

const loginRateLimiter = (req, res, next) => {
  const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
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
      adminId: adminDoc.adminId,
      username: adminDoc.username,
      role: adminDoc.role,
      sessionVersion: adminDoc.sessionVersion
    },
    JWT_SECRET,
    { expiresIn: rememberMe ? '14d' : '12h' }
  );

  const isProduction =
    process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

  res.cookie(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: durationMs
  });
};

const clearAdminHttpOnlyCookie = (res) => {
  const isProduction =
    process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

  res.cookie(ADMIN_COOKIE_NAME, '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    expires: new Date(0)
  });
};

/**
 * ONE-TIME DATABASE SEED INITIALIZER
 * Runs only when the AdminAccount collection has 0 documents.
 * Reads initial setup credentials from environment variables (INIT_ADMIN_USERNAME / INIT_ADMIN_PASSWORD)
 * and stores only the bcrypt hash in MongoDB. Never overwrites existing credentials on restart/redeploy.
 */
let isSeedVerified = false;
const ensureInitialAdminSeeded = async () => {
  if (isSeedVerified) return;

  const count = await AdminAccount.countDocuments();
  if (count === 0) {
    const initUser = process.env.INIT_ADMIN_USERNAME;
    const initPass = process.env.INIT_ADMIN_PASSWORD;
    const masterRecovery = process.env.ADMIN_MASTER_RECOVERY_KEY;

    if (!initUser || !initPass) {
      throw new Error(
        'Initial setup requires INIT_ADMIN_USERNAME and INIT_ADMIN_PASSWORD in environment variables.'
      );
    }

    const passwordHash = await bcrypt.hash(String(initPass), BCRYPT_COST);
    const recoveryKeyHash = masterRecovery
      ? await bcrypt.hash(String(masterRecovery), BCRYPT_COST)
      : null;

    await AdminAccount.create({
      adminId: 'MIT-ADM-001',
      username: String(initUser).trim(),
      passwordHash,
      recoveryKeyHash,
      role: 'SUPER_ADMIN',
      accountStatus: 'ACTIVE',
      sessionVersion: 1,
      lastPasswordUpdateDate: new Date()
    });
  }

  isSeedVerified = true;
};

// ============================================================================
// 1. POST /api/admin/auth/login
// ============================================================================
router.post('/admin/auth/login', loginRateLimiter, async (req, res) => {
  try {
    await ensureInitialAdminSeeded();

    const { username, password, rememberMe = false } = req.body;
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required.'
      });
    }

    const cleanUsername = String(username).trim();
    const escapedUsername = cleanUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const admin = await AdminAccount.findOne({
      username: { $regex: new RegExp(`^${escapedUsername}$`, 'i') }
    }).select('+passwordHash');

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.'
      });
    }

    if (admin.accountStatus === 'SUSPENDED') {
      return res.status(403).json({
        success: false,
        message: 'Administrator account is suspended.'
      });
    }

    // Check temporary lockout from repeated failed attempts
    if (admin.lockedUntil && new Date() < new Date(admin.lockedUntil)) {
      const waitMins = Math.ceil((new Date(admin.lockedUntil) - new Date()) / 60000);
      return res.status(429).json({
        success: false,
        message: `Account is temporarily locked due to failed login attempts. Try again in ${waitMins} minute(s).`
      });
    }

    const passwordMatched = await bcrypt.compare(String(password), admin.passwordHash);
    if (!passwordMatched) {
      admin.failedLoginAttempts = (admin.failedLoginAttempts || 0) + 1;
      if (admin.failedLoginAttempts >= 5) {
        admin.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      await admin.save();

      const remaining = Math.max(0, 5 - admin.failedLoginAttempts);
      return res.status(401).json({
        success: false,
        message:
          remaining > 0
            ? `Invalid username or password. (${remaining} attempt(s) remaining before lockout).`
            : 'Account locked for 15 minutes due to 5 consecutive failed password attempts.'
      });
    }

    // Reset lockout & record successful login timestamp
    admin.failedLoginAttempts = 0;
    admin.lockedUntil = null;
    admin.lastSuccessfulLogin = new Date();
    admin.lastLoginIp = req.ip || '';
    await admin.save();

    setAdminHttpOnlyCookie(res, admin, Boolean(rememberMe));

    return res.json({
      success: true,
      message: 'Logged in successfully.',
      admin: {
        adminId: admin.adminId,
        username: admin.username,
        role: admin.role,
        accountStatus: admin.accountStatus,
        accountCreationDate: admin.accountCreationDate,
        lastPasswordUpdateDate: admin.lastPasswordUpdateDate,
        lastSuccessfulLogin: admin.lastSuccessfulLogin
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 2. GET /api/admin/auth/session (Check Active Session on Browser Refresh)
// ============================================================================
router.get('/admin/auth/session', requireAdminJwt, async (req, res) => {
  try {
    const admin = await AdminAccount.findOne({ adminId: req.admin.adminId }).lean();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.json({
      success: true,
      authenticated: true,
      admin: {
        adminId: admin.adminId,
        username: admin.username,
        role: admin.role,
        accountStatus: admin.accountStatus,
        accountCreationDate: admin.accountCreationDate,
        lastPasswordUpdateDate: admin.lastPasswordUpdateDate,
        lastSuccessfulLogin: admin.lastSuccessfulLogin
      }
    });
  } catch (err) {
    return res.status(401).json({ success: false, authenticated: false });
  }
});

// ============================================================================
// 3. POST /api/admin/auth/logout
// ============================================================================
router.post('/admin/auth/logout', (req, res) => {
  clearAdminHttpOnlyCookie(res);
  return res.json({
    success: true,
    message: 'Logged out successfully.'
  });
});

// ============================================================================
// 4. PUT /api/admin/auth/credentials (Change Username &/or Password)
// ============================================================================
router.put('/admin/auth/credentials', requireAdminJwt, async (req, res) => {
  try {
    const {
      currentPassword,
      newUsername,
      newPassword,
      confirmNewPassword
    } = req.body;

    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        message: 'Your current password is required to save account changes.'
      });
    }

    const admin = await AdminAccount.findOne({ adminId: req.admin.adminId }).select(
      '+passwordHash'
    );
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin account not found.' });
    }

    // 1. Verify current password
    const isCurrentPasswordCorrect = await bcrypt.compare(
      String(currentPassword),
      admin.passwordHash
    );
    if (!isCurrentPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect.'
      });
    }

    let isUsernameUpdated = false;
    let isPasswordUpdated = false;
    const oldUsername = admin.username;

    // 2. Validate & update username if changed
    if (newUsername !== undefined && String(newUsername).trim() !== '') {
      const targetUsername = String(newUsername).trim();
      if (targetUsername.length < 3 || targetUsername.length > 32) {
        return res.status(400).json({
          success: false,
          message: 'Username must be between 3 and 32 characters.'
        });
      }
      if (!/^[a-zA-Z0-9_.-]+$/.test(targetUsername)) {
        return res.status(400).json({
          success: false,
          message: 'Username can only contain letters, numbers, underscores, dots, and hyphens.'
        });
      }

      if (targetUsername !== admin.username) {
        const escapedTarget = targetUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const conflict = await AdminAccount.findOne({
          _id: { $ne: admin._id },
          username: { $regex: new RegExp(`^${escapedTarget}$`, 'i') }
        });
        if (conflict) {
          return res.status(409).json({
            success: false,
            message: 'That username is already taken.'
          });
        }
        admin.username = targetUsername;
        isUsernameUpdated = true;
      }
    }

    // 3. Validate & hash new password if provided
    if (newPassword !== undefined && String(newPassword) !== '') {
      if (newPassword !== confirmNewPassword) {
        return res.status(400).json({
          success: false,
          message: 'New password and confirmation password do not match.'
        });
      }

      const policyError = validateStrongPassword(newPassword);
      if (policyError) {
        return res.status(400).json({ success: false, message: policyError });
      }

      const sameAsCurrent = await bcrypt.compare(String(newPassword), admin.passwordHash);
      if (sameAsCurrent && !isUsernameUpdated) {
        return res.status(400).json({
          success: false,
          message: 'New password must be different from your current password.'
        });
      }

      admin.passwordHash = await bcrypt.hash(String(newPassword), BCRYPT_COST);
      admin.lastPasswordUpdateDate = new Date();
      isPasswordUpdated = true;
    }

    if (!isUsernameUpdated && !isPasswordUpdated) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a new username or a new password to update.'
      });
    }

    // 4. Rotate sessionVersion so all old cookies/sessions are invalidated, and issue a new cookie for this session
    admin.sessionVersion = (admin.sessionVersion || 1) + 1;
    await admin.save();

    setAdminHttpOnlyCookie(res, admin, false);

    await PaymentAuditLog.create({
      adminId: admin._id,
      actorType: 'ADMIN',
      action: 'ADMIN_REMARKS_MODIFIED',
      previousValue: { username: oldUsername },
      newValue: {
        username: admin.username,
        isUsernameUpdated,
        isPasswordUpdated,
        updatedAt: new Date()
      }
    }).catch(() => {});

    return res.json({
      success: true,
      message: 'Admin credentials updated successfully. New credentials are now active.',
      admin: {
        adminId: admin.adminId,
        username: admin.username,
        role: admin.role,
        accountStatus: admin.accountStatus,
        accountCreationDate: admin.accountCreationDate,
        lastPasswordUpdateDate: admin.lastPasswordUpdateDate,
        lastSuccessfulLogin: admin.lastSuccessfulLogin
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 5. POST /api/admin/auth/generate-recovery-key (Generate Owner Backup Key)
// ============================================================================
router.post('/admin/auth/generate-recovery-key', requireAdminJwt, async (req, res) => {
  try {
    const { currentPassword } = req.body;
    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        message: 'Enter your current password to generate a backup recovery key.'
      });
    }

    const admin = await AdminAccount.findOne({ adminId: req.admin.adminId }).select(
      '+passwordHash'
    );
    const matched = await bcrypt.compare(String(currentPassword), admin.passwordHash);
    if (!matched) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect.'
      });
    }

    const generatedKey = `MIT-RECOVERY-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    admin.recoveryKeyHash = await bcrypt.hash(generatedKey, BCRYPT_COST);
    await admin.save();

    return res.json({
      success: true,
      recoveryKey: generatedKey,
      message: 'Save this Backup Recovery Key offline. It is shown only once.'
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 6. POST /api/admin/auth/recover (Owner-Controlled Password Recovery)
// ============================================================================
router.post('/admin/auth/recover', loginRateLimiter, async (req, res) => {
  try {
    await ensureInitialAdminSeeded();
    const { recoveryKey, newUsername, newPassword, confirmNewPassword } = req.body;

    if (!recoveryKey || !newPassword || !confirmNewPassword) {
      return res.status(400).json({
        success: false,
        message: 'Owner Recovery Key, new password, and confirmation password are required.'
      });
    }

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password and confirmation password do not match.'
      });
    }

    const policyError = validateStrongPassword(newPassword);
    if (policyError) {
      return res.status(400).json({ success: false, message: policyError });
    }

    const admin = await AdminAccount.findOne().select('+passwordHash +recoveryKeyHash');
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin account not found.' });
    }

    const envMasterKey = process.env.ADMIN_MASTER_RECOVERY_KEY;
    const isEnvKeyMatch =
      Boolean(envMasterKey) &&
      envMasterKey.length >= 8 &&
      crypto.timingSafeEqual(
        Buffer.from(String(recoveryKey).trim()),
        Buffer.from(String(envMasterKey).trim())
      );

    const isDbKeyMatch = admin.recoveryKeyHash
      ? await bcrypt.compare(String(recoveryKey).trim(), admin.recoveryKeyHash)
      : false;

    if (!isEnvKeyMatch && !isDbKeyMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Owner Recovery Key.'
      });
    }

    if (newUsername && String(newUsername).trim().length >= 3) {
      admin.username = String(newUsername).trim();
    }

    admin.passwordHash = await bcrypt.hash(String(newPassword), BCRYPT_COST);
    admin.lastPasswordUpdateDate = new Date();
    admin.failedLoginAttempts = 0;
    admin.lockedUntil = null;
    admin.sessionVersion = (admin.sessionVersion || 1) + 1;
    await admin.save();

    clearAdminHttpOnlyCookie(res);

    return res.json({
      success: true,
      message: 'Account recovered successfully. You may now sign in with your new credentials.'
    });
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid Owner Recovery Key or recovery request.'
    });
  }
});

module.exports = {
  router,
  ensureInitialAdminSeeded
};


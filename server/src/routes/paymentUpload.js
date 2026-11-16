import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifyToken } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure upload directories exist inside backend storage
export const qrDir = path.join(__dirname, 'uploads/payments/qrs');
export const screenshotDir = path.join(__dirname, 'uploads/payments/screenshots');

[qrDir, screenshotDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg'];

const imageFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const isValidExt = ['.png', '.jpg', '.jpeg'].includes(ext);
  const isValidMime = allowedMimeTypes.includes(file.mimetype);

  if (isValidExt && isValidMime) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file format. Only PNG, JPG, and JPEG images are allowed.'), false);
  }
};

const qrStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, qrDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const method = (req.body.methodType || 'SCANNER').toUpperCase().replace(/[^A-Z]/g, '');
    cb(null, `MIT_QR_${method}_${Date.now()}${ext}`);
  }
});

const screenshotStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, screenshotDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanUsn = (req.body.usn || 'STUDENT').toUpperCase().replace(/[^A-Z0-9]/g, '');
    cb(null, `PROOF_${cleanUsn}_${Date.now()}${ext}`);
  }
});

export const uploadQrScanner = multer({
  storage: qrStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 3 * 1024 * 1024 } // 3 MB limit for QR Scanners
});

export const uploadPaymentScreenshot = multer({
  storage: screenshotStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB limit for Student Screenshots
});

export const uploadBankCsv = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.csv' || file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Only official bank statement CSV files are allowed.'), false);
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB limit for statement CSV
});

// Backend Admin Authorization Enforcement Middleware
export const requireAdminAuth = (req, res, next) => {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers.cookie) {
    const cookies = req.headers.cookie.split(';');
    for (const c of cookies) {
      const [k, v] = c.split('=');
      if (k && k.trim() === 'mit_admin_session' && v) {
        token = decodeURIComponent(v.trim());
        break;
      }
    }
  }

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.admin = payload;
      req.adminId = payload.id || payload.adminId || payload.email || 'admin@mitmysore.ac.in';
      req.adminEmail = payload.email || 'admin@mitmysore.ac.in';
      return next();
    }
  }

  if (req.admin && req.admin.id) {
    req.adminId = req.admin.id || req.admin.adminId || req.admin.email || 'admin@mitmysore.ac.in';
    req.adminEmail = req.admin.email || 'admin@mitmysore.ac.in';
    return next();
  }

  return res.status(401).json({
    success: false,
    message: 'Unauthorized. Valid administrator authentication token required.'
  });
};


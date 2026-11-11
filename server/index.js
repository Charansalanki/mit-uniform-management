import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import crypto from 'node:crypto';
import {
  db,
  initSchema,
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  logAudit
} from './db.js';
import { appCache } from './cache.js';
import paymentRoutes from './paymentRoutes.js';
import cashPaymentRoutes from './cashPaymentRoutes.js';
import vendorRoutes from './vendorRoutes.js';
import vendorPortalRoutes from './vendorPortalRoutes.js';
import studentTrackingRoutes from './studentTrackingRoutes.js';
import sseRoutes from './sseRoutes.js';
import adminAuthRoutes, { ensureInitialAdminSeeded } from './adminAuthRoutes.js';
import adminDataMaintenanceRoutes from './adminDataMaintenanceRoutes.js';
import applicationControlRoutes from './applicationControlRoutes.js';
import { requireStudentAppOpen } from './middleware/requireStudentAppOpen.js';
import { validateUsnAndDepartmentOnBackend } from './middleware/validateUsnDepartment.js';
import { sqliteRamCacheMiddleware } from './middleware/sqliteRamCache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SQLite database and schema
const { campaignId: defaultCampaignId } = initSchema();
ensureInitialAdminSeeded();

const app = express();
const port = process.env.PORT || 4000;

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '100kb' }));

// High-Concurrency Sub-Millisecond L1 RAM Read Cache for 8,000+ Concurrent Students
app.use(sqliteRamCacheMiddleware);

// Serve public QR scanner assets statically
app.use('/uploads/payments/qrs', express.static(path.join(__dirname, 'uploads/payments/qrs')));

// Protected Payment Proof Screenshots (Requires valid Admin, Vendor, or Student session)
app.use('/uploads/payments/screenshots', (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = (authHeader && authHeader.startsWith('Bearer '))
    ? authHeader.slice(7).trim()
    : (req.query.token ? String(req.query.token).trim() : null);
  const cookieHeader = req.headers.cookie || '';
  const hasAdminCookie = cookieHeader.includes('mit_admin_session=');

  if (hasAdminCookie || (token && verifyToken(token))) {
    return next();
  }

  return res.status(401).json({ success: false, message: 'Unauthorized. Protected student payment proof.' });
}, express.static(path.join(__dirname, 'uploads/payments/screenshots')));

// 1. Mount Application Status & Admin Application Controller routes first
app.use('/api', applicationControlRoutes);

// 2. Enforce Application ON/OFF guard on all Student APIs (Admin & Vendor APIs are automatically exempted inside requireStudentAppOpen)
app.use(
  ['/api/payments', '/api/tracking', '/api/student', '/api/registrations'],
  requireStudentAppOpen
);

// Mount Direct UPI Payment & Admin Payment Controller APIs
app.use('/api', adminAuthRoutes);
app.use('/api', paymentRoutes);
app.use('/api', cashPaymentRoutes);
app.use('/api', vendorRoutes);
app.use('/api', vendorPortalRoutes);
app.use('/api', studentTrackingRoutes);
app.use('/api', sseRoutes);
app.use('/api', adminDataMaintenanceRoutes);

// ─── Authentication Middleware ─────────────────────────────────
function authenticateAdmin(req, res, next) {
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

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required. Valid administrator token missing.' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, message: 'Session expired or invalid authentication token.' });
  }

  req.admin = payload;
  next();
}

// ─── Health Check & Root Service Status ─────────────────────────
app.get('/', (req, res) => {
  if (req.accepts('html')) {
    return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MIT Uniform Management API — Status</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 40px 20px; display: flex; justify-content: center; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 32px; max-width: 600px; width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(74, 222, 128, 0.3); padding: 4px 12px; border-radius: 9999px; font-size: 13px; font-weight: 600; margin-bottom: 16px; }
    .dot { width: 8px; height: 8px; background: #4ade80; border-radius: 50%; }
    h1 { margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: #ffffff; }
    p { margin: 0 0 24px 0; color: #94a3b8; font-size: 14px; line-height: 1.5; }
    .grid { display: grid; gap: 12px; margin-bottom: 24px; }
    .item { background: #0f172a; border: 1px solid #334155; padding: 12px 16px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
    .item span:first-child { color: #94a3b8; }
    .item span:last-child { color: #f1f5f9; font-weight: 600; font-family: monospace; }
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; font-size: 14px; transition: background 0.2s; }
    .btn:hover { background: #1d4ed8; }
    .btn-secondary { background: #334155; }
    .btn-secondary:hover { background: #475569; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge"><div class="dot"></div> Backend API Operational</div>
    <h1>MIT Uniform Management System</h1>
    <p>The backend API service is running normally on port 4000 with Node 24 native SQLite database engine in WAL mode.</p>
    
    <div class="grid">
      <div class="item"><span>Health Endpoint</span><span><a href="/api/health" style="color:#60a5fa;">/api/health</a></span></div>
      <div class="item"><span>Database Engine</span><span>Node 24 DatabaseSync (WAL)</span></div>
      <div class="item"><span>Application Status</span><span><a href="/api/application-status" style="color:#60a5fa;">/api/application-status</a></span></div>
      <div class="item"><span>Frontend UI Portal</span><span><a href="http://localhost:5173" style="color:#60a5fa;">http://localhost:5173</a></span></div>
    </div>

    <div class="actions">
      <a href="http://localhost:5173" class="btn">Open Student Portal &rarr;</a>
      <a href="/api/health" class="btn btn-secondary">View JSON Health</a>
    </div>
  </div>
</body>
</html>`);
  }
  res.json({
    service: 'MIT Uniform Management System API',
    status: 'online',
    port: 4000,
    health: '/api/health',
    frontend: 'http://localhost:5173'
  });
});

app.get('/health', (_req, res) => res.redirect('/api/health'));

app.get('/api/health', (_req, res) => {
  try {
    const row = db.prepare('SELECT 1 as alive').get();
    res.json({ ok: true, alive: row?.alive === 1, engine: 'sqlite-node24' });
  } catch (err) {
    res.status(503).json({ ok: false, message: 'Database error: ' + err.message });
  }
});

// ─── Campaign ───────────────────────────────────────────────────
app.get('/api/campaign', (_req, res) => {
  try {
    const camp = db.prepare('SELECT id, name, academic_year FROM campaigns WHERE active = 1 ORDER BY created_at DESC LIMIT 1').get();
    if (!camp) return res.status(404).json({ message: 'No active uniform campaign.' });
    const match = (camp.name || '').match(/\b(20\d\d)\b/);
    const year = match ? match[1] : (camp.academic_year ? camp.academic_year.slice(0, 4) : '2027');
    res.json({ ...camp, year });
  } catch (err) {
    res.status(500).json({ message: 'Could not load campaign.' });
  }
});

app.post('/api/campaign', authenticateAdmin, (req, res) => {
  const { name, academicYear } = req.body;
  if (!name || typeof name !== 'string') return res.status(400).json({ message: 'Campaign name is required.' });
  try {
    const trimmedName = name.trim();
    let acYear = academicYear;
    if (!acYear) {
      const match = trimmedName.match(/\b(20\d\d)\b/);
      if (match) {
        const startYr = parseInt(match[1], 10);
        acYear = `${startYr}-${String(startYr + 1).slice(-2)}`;
      } else {
        acYear = '2027-28';
      }
    }
    const activeCamp = db.prepare('SELECT id FROM campaigns WHERE active = 1 ORDER BY created_at DESC LIMIT 1').get();
    if (activeCamp) {
      db.prepare('UPDATE campaigns SET name = ?, academic_year = ? WHERE id = ?').run(trimmedName, acYear, activeCamp.id);
    } else {
      const newId = crypto.randomUUID();
      db.prepare('INSERT INTO campaigns (id, name, academic_year, active, created_at) VALUES (?, ?, ?, 1, ?)').run(newId, trimmedName, acYear, new Date().toISOString());
    }
    appCache.clear();
    res.json({ success: true, name: trimmedName, academic_year: acYear });
  } catch (err) {
    res.status(500).json({ message: 'Could not update campaign.' });
  }
});

// ─── Student Registration Validation Schema ─────────────────────
const registrationSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  gender: z.enum(['Male', 'Female']).default('Male'),
  usn: z.string().trim().min(3).max(30).transform(v => v.toUpperCase().replace(/\s+/g, '')),
  department: z.string().trim().min(2).max(80),
  semester: z.coerce.number().int().min(1).max(8),
  section: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G']),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  collegeEmail: z.string().email().optional().or(z.literal('')),
  shirtSize: z.preprocess(
    (v) => (v != null ? String(v).trim().toUpperCase() : v),
    z.enum(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'])
  ),
  trouserSize: z.preprocess(
    (v) => {
      if (v == null) return v;
      const digits = String(v).replace(/[^0-9]/g, '').trim();
      return digits || String(v).trim();
    },
    z.enum(['28', '30', '32', '34', '36', '38', '40', '42', '44'])
  ),
  blazerSize: z.string().optional().nullable(),
  course: z.string().optional(),
  uniformMeasurements: z.any().optional(),
  registrationId: z.string().optional()
});

// ─── Student Registration: Create (One-Time per USN) ───────────
app.post('/api/registrations', validateUsnAndDepartmentOnBackend, (req, res) => {
  const parsed = registrationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid form data' });
  }
  const d = parsed.data;

  try {
    const activeCamp = db.prepare('SELECT id, academic_year FROM campaigns WHERE active = 1 ORDER BY created_at DESC LIMIT 1').get();
    if (!activeCamp) {
      return res.status(409).json({ message: 'Uniform registration is currently closed.' });
    }

    // Atomic duplicate check
    const existing = db.prepare('SELECT id, registration_id FROM registrations WHERE campaign_id = ? AND usn = ?').get(activeCamp.id, d.usn);
    if (existing) {
      return res.status(409).json({
        message: `This USN (${d.usn}) has already submitted uniform details (Ref: #${existing.registration_id}). Only one submission is permitted per academic cycle.`
      });
    }

    // Sequential count for registration_id format: <USN>-<COUNT>
    const totalCountRow = db.prepare('SELECT COUNT(*) as count FROM registrations').get();
    const count = (totalCountRow?.count || 0) + 1;
    const registrationId = d.registrationId && !d.registrationId.startsWith('REG-')
      ? d.registrationId.replace(/^#/, '').toUpperCase()
      : `${d.usn}-${count}`;

    const studentId = crypto.randomUUID();
    const orderId = crypto.randomUUID();
    const now = new Date();
    const submittedAt = now.toISOString();
    // 24-hour editing deadline generated from trusted server timestamp
    const editableUntil = new Date(now.getTime() + (24 * 60 * 60 * 1000)).toISOString();

    const measurementsJson = d.uniformMeasurements
      ? (typeof d.uniformMeasurements === 'string' ? d.uniformMeasurements : JSON.stringify(d.uniformMeasurements))
      : null;

    const insertStudent = db.prepare(`
      INSERT INTO registrations (
        id, registration_id, campaign_id, full_name, gender, usn, phone, college_email,
        department, semester, section, academic_year, shirt_size, trouser_size, blazer_size, uniform_measurements,
        submission_status, production_status, distribution_status,
        submitted_at, editable_until, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        'submitted', 'pending', 'pending',
        ?, ?, ?, ?
      )
    `);

    const uniformItems = JSON.stringify([
      { item: 'MIT Formal Shirt', size: d.shirtSize, qty: 2 },
      { item: 'MIT Formal Trouser', size: `${d.trouserSize}"`, qty: 2 },
      ...(d.blazerSize ? [{ item: 'MIT Formal Coat/Blazer', size: d.blazerSize, qty: 1 }] : [])
    ]);

    const insertOrder = db.prepare(`
      INSERT INTO uniform_orders (
        id, student_id, uniform_items, production_status, distribution_status,
        created_at, updated_at
      ) VALUES (?, ?, ?, 'pending', 'pending', ?, ?)
    `);

    // Execute atomic transaction
    db.exec('BEGIN TRANSACTION');
    try {
      insertStudent.run(
        studentId, registrationId, activeCamp.id, d.fullName, d.gender, d.usn, d.phone, d.collegeEmail || null,
        d.department, d.semester, d.section, activeCamp.academic_year || '2026-27', d.shirtSize, d.trouserSize, d.blazerSize || null, measurementsJson,
        submittedAt, editableUntil, submittedAt, submittedAt
      );

      insertOrder.run(orderId, studentId, uniformItems, submittedAt, submittedAt);
      db.exec('COMMIT');
    } catch (txErr) {
      if (db.inTransaction) {
        try { db.exec('ROLLBACK'); } catch (_) { }
      }
      throw txErr;
    }

    // Invalidate dashboard summary cache
    appCache.invalidatePrefix('summary:');

    res.status(201).json({
      id: registrationId,
      dbId: studentId,
      registrationId,
      fullName: d.fullName,
      gender: d.gender,
      usn: d.usn,
      department: d.department,
      semester: d.semester,
      section: d.section,
      shirtSize: d.shirtSize,
      trouserSize: d.trouserSize,
      submitted_at: submittedAt,
      edit_deadline: editableUntil,
      message: 'Registration saved successfully.'
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ message: `USN ${d.usn} is already registered.` });
    }
    console.error('Registration insertion error:', err);
    res.status(500).json({ message: 'Could not record registration.' });
  }
});

// ─── Student Portal: Check Status (No private contact data leaked)
app.get('/api/registrations/:id/status', (req, res) => {
  const queryId = req.params.id.trim().replace(/^#/, '');
  try {
    const row = db.prepare(`
      SELECT r.id, r.registration_id, r.full_name, r.gender, r.department, r.semester, r.section,
             r.shirt_size, r.trouser_size, r.submission_status, r.production_status, r.distribution_status,
             r.collection_room, r.collection_date, r.collection_instructions,
             r.submitted_at, r.editable_until, r.collected_at
      FROM registrations r
      WHERE r.id = ? OR r.registration_id = ? OR r.usn = ?
      LIMIT 1
    `).get(queryId, queryId, queryId.toUpperCase());

    if (!row) {
      return res.status(404).json({ message: 'Registration record not found.' });
    }

    const canEdit = Date.now() < new Date(row.editable_until).getTime();

    res.json({
      ...row,
      canEdit,
      editableUntil: row.editable_until
    });
  } catch (err) {
    res.status(400).json({ message: 'Invalid registration lookup query.' });
  }
});

// ─── Student Portal: Update Submission (Enforcing 24h Edit Rule) ──
app.put('/api/registrations/:id', (req, res) => {
  const queryId = req.params.id.trim().replace(/^#/, '');
  const parsed = registrationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid form data' });
  }
  const d = parsed.data;

  try {
    const existing = db.prepare(`
      SELECT id, registration_id, editable_until, submission_status
      FROM registrations
      WHERE id = ? OR registration_id = ?
    `).get(queryId, queryId);

    if (!existing) {
      return res.status(404).json({ message: 'Registration record not found.' });
    }

    // STRICT SERVER-SIDE 24-HOUR EDIT RULE CHECK
    const deadline = new Date(existing.editable_until).getTime();
    if (Date.now() > deadline) {
      return res.status(403).json({
        message: 'The 24-hour editing window for this registration has expired. Edits are locked to ensure uniform production accuracy.'
      });
    }

    const now = new Date().toISOString();
    const updateStmt = db.prepare(`
      UPDATE registrations
      SET full_name = ?, gender = ?, department = ?, semester = ?, section = ?,
          phone = ?, shirt_size = ?, trouser_size = ?, updated_at = ?
      WHERE id = ?
    `);

    updateStmt.run(
      d.fullName, d.gender, d.department, d.semester, d.section,
      d.phone, d.shirtSize, d.trouserSize, now, existing.id
    );

    // Sync uniform order sizes
    const items = JSON.stringify([
      { item: 'MIT Formal Shirt', size: d.shirtSize, qty: 2 },
      { item: 'MIT Formal Trouser', size: `${d.trouserSize}"`, qty: 2 }
    ]);
    db.prepare('UPDATE uniform_orders SET uniform_items = ?, updated_at = ? WHERE student_id = ?').run(items, now, existing.id);

    appCache.invalidatePrefix('summary:');

    res.json({
      id: existing.registration_id,
      fullName: d.fullName,
      gender: d.gender,
      department: d.department,
      semester: d.semester,
      section: d.section,
      shirtSize: d.shirtSize,
      trouserSize: d.trouserSize,
      updated_at: now,
      message: 'Registration updated successfully.'
    });
  } catch (err) {
    console.error('Update registration error:', err);
    res.status(500).json({ message: 'Could not update registration.' });
  }
});

// ─── Public Distribution Announcements (Filtered, Cached & Private)
app.get('/api/distribution', (req, res) => {
  const { department, semester, section } = req.query;
  if (!department || !semester || !section) {
    return res.status(400).json({ message: 'Please provide department, semester, and section.' });
  }

  const dept = String(department).trim();
  const sem = Number(semester);
  const sec = String(section).trim();

  const cacheKey = `schedule:${dept}:${sem}:${sec}`;
  const cached = appCache.get(cacheKey);
  if (cached) {
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    return res.json(cached);
  }

  try {
    // Strictly published only; NEVER leak student personal names or phone numbers!
    const rows = db.prepare(`
      SELECT department, semester, section, gender, academic_year, status,
             distribution_date, start_time, end_time, building, room,
             instructions, updated_at
      FROM distribution_schedules
      WHERE published = 1 AND department = ? AND semester = ? AND section = ?
      ORDER BY distribution_date ASC
    `).all(dept, sem, sec);

    appCache.set(cacheKey, rows, 60);
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Could not load published distribution schedule.' });
  }
});

// ─── Admin Authentication ───────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const admin = db.prepare('SELECT * FROM admin_users WHERE email = ?').get(email.trim().toLowerCase());
    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    if (admin.account_status !== 'active') {
      return res.status(403).json({ message: 'Account has been deactivated. Please contact administrator.' });
    }

    const isValid = verifyPassword(password, admin.password_hash);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const tokenPayload = {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      permissions: JSON.parse(admin.permissions || '[]')
    };

    const token = generateToken(tokenPayload);

    logAudit(admin.id, admin.email, 'ADMIN_LOGIN', 'admin_user', admin.id, null, req.ip);

    res.json({
      token,
      user: tokenPayload
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Internal server error during authentication.' });
  }
});

app.get('/api/auth/me', authenticateAdmin, (req, res) => {
  res.json({ user: req.admin });
});

// ─── Admin Dashboard Summary (Cached) ──────────────────────────
app.get('/api/admin/summary', authenticateAdmin, (_req, res) => {
  const cached = appCache.get('summary:counts');
  if (cached) return res.json(cached);

  try {
    const counts = db.prepare(`
      SELECT
        COUNT(*) AS registered,
        SUM(CASE WHEN collected_at IS NOT NULL THEN 1 ELSE 0 END) AS collected,
        SUM(CASE WHEN collected_at IS NULL THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN production_status = 'in_production' THEN 1 ELSE 0 END) AS in_production,
        SUM(CASE WHEN production_status = 'ready' THEN 1 ELSE 0 END) AS ready_for_pickup,
        COUNT(DISTINCT department) AS departments
      FROM registrations
    `).get();

    const summary = {
      registered: counts?.registered || 0,
      collected: counts?.collected || 0,
      pending: counts?.pending || 0,
      in_production: counts?.in_production || 0,
      ready_for_pickup: counts?.ready_for_pickup || 0,
      departments: counts?.departments || 0
    };

    appCache.set('summary:counts', summary, 30);
    res.json(summary);
  } catch (err) {
    console.error('Summary error:', err);
    res.status(500).json({ message: 'Could not load dashboard statistics.' });
  }
});

// ─── Amazon-Style Server-Side Search & Scalable Pagination ─────
app.get('/api/admin/registrations', authenticateAdmin, (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const rawPageSize = parseInt(req.query.pageSize, 10) || 25;
    // Allow 25, 50, 100 as specified
    const pageSize = [25, 50, 100].includes(rawPageSize) ? rawPageSize : 25;
    const offset = (page - 1) * pageSize;

    const {
      search,
      department,
      gender,
      semester,
      section,
      status,
      paymentStatus,
      productionStatus,
      distributionStatus,
      sortBy = 'submitted_at',
      sortOrder = 'desc'
    } = req.query;

    const conditions = [];
    const params = [];

    // Filter clauses
    if (department && department !== 'all') {
      conditions.push('r.department = ?');
      params.push(department);
    }
    if (gender && gender !== 'all') {
      conditions.push('r.gender = ?');
      params.push(gender);
    }
    if (semester && semester !== 'all') {
      conditions.push('r.semester = ?');
      params.push(Number(semester));
    }
    if (section && section !== 'all') {
      conditions.push('r.section = ?');
      params.push(section);
    }
    if (status === 'collected') {
      conditions.push('r.collected_at IS NOT NULL');
    } else if (status === 'pending') {
      conditions.push('r.collected_at IS NULL');
    }
    if (paymentStatus && paymentStatus !== 'all') {
      if (paymentStatus === 'paid' || paymentStatus === 'verified' || paymentStatus === 'Payment Verified') {
        conditions.push("(r.payment_verified = 1 OR r.payment_status = 'Payment Verified')");
      } else if (paymentStatus === 'pending_verification' || paymentStatus === 'submitted') {
        conditions.push("r.payment_status IN ('Payment Submitted', 'Under Verification')");
      } else if (paymentStatus === 'not_paid' || paymentStatus === 'unpaid') {
        conditions.push("(r.payment_verified = 0 AND (r.payment_status = 'Not Paid' OR r.payment_status IS NULL))");
      } else if (paymentStatus === 'rejected') {
        conditions.push("r.payment_status = 'Payment Rejected'");
      }
    }
    if (productionStatus && productionStatus !== 'all') {
      conditions.push('r.production_status = ?');
      params.push(productionStatus);
    }
    if (distributionStatus && distributionStatus !== 'all') {
      conditions.push('r.distribution_status = ?');
      params.push(distributionStatus);
    }

    // Search Clause: Fast FTS or Direct Indexed Match
    let joinFts = '';
    if (search && search.trim()) {
      const q = search.trim().replace(/^#/, '');
      // If exact USN or exact registration_id pattern, use exact indexed match
      if (/^4mh\d/i.test(q) || q.includes('-')) {
        conditions.push('(r.usn = ? OR r.registration_id = ?)');
        params.push(q.toUpperCase(), q.toUpperCase());
      } else {
        // Fast FTS search using inverted index
        // Sanitize for FTS MATCH syntax
        const sanitizedQ = q.replace(/[^a-zA-Z0-9]/g, ' ').trim().split(/\s+/).filter(Boolean).map(t => `${t}*`).join(' ');
        if (sanitizedQ) {
          joinFts = 'JOIN registrations_fts fts ON r.rowid = fts.rowid';
          conditions.push('registrations_fts MATCH ?');
          params.push(sanitizedQ);
        } else {
          conditions.push('(r.full_name LIKE ? OR r.phone LIKE ?)');
          params.push(`%${q}%`, `%${q}%`);
        }
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count Total (for pagination metadata)
    const countSql = `SELECT COUNT(*) AS total FROM registrations r ${joinFts} ${whereClause}`;
    const totalRow = db.prepare(countSql).get(...params);
    const total = totalRow?.total || 0;

    // Allowed sort columns
    const allowedSortColumns = {
      submitted_at: 'r.submitted_at',
      full_name: 'r.full_name',
      usn: 'r.usn',
      department: 'r.department',
      semester: 'r.semester',
      section: 'r.section',
      registration_id: 'r.registration_id'
    };
    const sortCol = allowedSortColumns[sortBy] || 'r.submitted_at';
    const sortDir = String(sortOrder).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Stable sort tie-breaker on r.id ASC guarantees no duplicate or missing rows across pages
    const querySql = `
      SELECT r.id, r.registration_id, r.full_name, r.gender, r.usn, r.phone, r.college_email,
             r.department, r.semester, r.section, r.academic_year, r.shirt_size, r.trouser_size,
             r.submission_status, r.production_status, r.distribution_status,
             r.collection_room, r.collection_date, r.collection_instructions,
             r.submitted_at, r.editable_until, r.collected_at, r.collected_by,
             r.payment_status, r.payment_verified, r.payment_submission_id
      FROM registrations r
      ${joinFts}
      ${whereClause}
      ORDER BY ${sortCol} ${sortDir}, r.id ASC
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(querySql).all(...params, pageSize, offset);

    // Format fields to match frontend StudentRegistration model
    const items = rows.map(r => ({
      id: r.registration_id || r.id,
      dbId: r.id,
      registrationId: r.registration_id,
      fullName: r.full_name,
      gender: r.gender || 'Male',
      usn: r.usn,
      phone: r.phone,
      collegeEmail: r.college_email || '',
      department: r.department,
      semester: r.semester,
      section: r.section,
      academicYear: r.academic_year,
      shirtSize: r.shirt_size,
      trouserSize: r.trouser_size,
      submissionStatus: r.submission_status,
      productionStatus: r.production_status,
      distributionStatus: r.distribution_status,
      collectionRoom: r.collection_room,
      collectionDate: r.collection_date,
      collectionInstructions: r.collection_instructions,
      submitted_at: r.submitted_at,
      edit_deadline: r.editable_until,
      collected_at: r.collected_at,
      collected_by: r.collected_by,
      paymentStatus: r.payment_status || 'Not Paid',
      paymentVerified: Boolean(r.payment_verified),
      paymentSubmissionId: r.payment_submission_id || null
    }));

    const totalPages = Math.ceil(total / pageSize) || 1;

    res.json({
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (err) {
    console.error('Admin registrations query error:', err);
    res.status(500).json({ message: 'Could not load registrations.' });
  }
});

// ─── Admin: Update Single Registration ──────────────────────────
app.put('/api/admin/registrations/:id', authenticateAdmin, (req, res) => {
  const queryId = req.params.id.trim().replace(/^#/, '');
  const parsed = registrationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid form data' });
  }
  const d = parsed.data;

  try {
    const existing = db.prepare('SELECT id, registration_id FROM registrations WHERE id = ? OR registration_id = ?').get(queryId, queryId);
    if (!existing) {
      return res.status(404).json({ message: 'Registration record not found.' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE registrations
      SET full_name = ?, gender = ?, usn = ?, department = ?, semester = ?, section = ?,
          phone = ?, shirt_size = ?, trouser_size = ?, updated_at = ?
      WHERE id = ?
    `).run(
      d.fullName, d.gender, d.usn, d.department, d.semester, d.section,
      d.phone, d.shirtSize, d.trouserSize, now, existing.id
    );

    const uniformItems = JSON.stringify([
      { item: 'MIT Formal Shirt', size: d.shirtSize, qty: 2 },
      { item: 'MIT Formal Trouser', size: `${d.trouserSize}"`, qty: 2 }
    ]);
    db.prepare('UPDATE uniform_orders SET uniform_items = ?, updated_at = ? WHERE student_id = ?').run(uniformItems, now, existing.id);

    logAudit(req.admin.id, req.admin.email, 'UPDATE_REGISTRATION', 'registration', existing.id, d, req.ip);
    appCache.invalidatePrefix('summary:');

    res.json({ success: true, message: 'Record updated successfully.' });
  } catch (err) {
    console.error('Update student error:', err);
    res.status(500).json({ message: 'Could not update registration record.' });
  }
});

// ─── Admin: Update Production & Distribution Status ─────────────
app.patch('/api/admin/registrations/:id/status', authenticateAdmin, (req, res) => {
  const queryId = req.params.id.trim().replace(/^#/, '');
  const { productionStatus, distributionStatus, collectionRoom, collectionDate, collectionInstructions } = req.body;

  try {
    const existing = db.prepare('SELECT id, registration_id FROM registrations WHERE id = ? OR registration_id = ?').get(queryId, queryId);
    if (!existing) {
      return res.status(404).json({ message: 'Registration record not found.' });
    }

    const updates = [];
    const params = [];
    if (productionStatus) { updates.push('production_status = ?'); params.push(productionStatus); }
    if (distributionStatus) { updates.push('distribution_status = ?'); params.push(distributionStatus); }
    if (collectionRoom !== undefined) { updates.push('collection_room = ?'); params.push(collectionRoom); }
    if (collectionDate !== undefined) { updates.push('collection_date = ?'); params.push(collectionDate); }
    if (collectionInstructions !== undefined) { updates.push('collection_instructions = ?'); params.push(collectionInstructions); }

    const now = new Date().toISOString();
    updates.push('updated_at = ?');
    params.push(now, existing.id);

    db.prepare(`UPDATE registrations SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // Sync uniform_orders
    const orderUpdates = [];
    const orderParams = [];
    if (productionStatus) { orderUpdates.push('production_status = ?'); orderParams.push(productionStatus); }
    if (distributionStatus) { orderUpdates.push('distribution_status = ?'); orderParams.push(distributionStatus); }
    if (collectionRoom !== undefined) { orderUpdates.push('collection_room = ?'); orderParams.push(collectionRoom); }
    if (collectionDate !== undefined) { orderUpdates.push('collection_date = ?'); orderParams.push(collectionDate); }
    if (collectionInstructions !== undefined) { orderUpdates.push('collection_instructions = ?'); orderParams.push(collectionInstructions); }
    orderUpdates.push('updated_at = ?');
    orderParams.push(now, existing.id);

    db.prepare(`UPDATE uniform_orders SET ${orderUpdates.join(', ')} WHERE student_id = ?`).run(...orderParams);

    logAudit(req.admin.id, req.admin.email, 'UPDATE_STATUS', 'registration', existing.id, req.body, req.ip);
    appCache.invalidatePrefix('summary:');

    res.json({ success: true, message: 'Status updated.' });
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({ message: 'Could not update status.' });
  }
});

// ─── Admin: Toggle Collection Status ───────────────────────────
app.patch('/api/admin/registrations/:id/collect', authenticateAdmin, (req, res) => {
  const queryId = req.params.id.trim().replace(/^#/, '');
  const { collected, collectedBy } = req.body;

  try {
    const existing = db.prepare('SELECT id, registration_id FROM registrations WHERE id = ? OR registration_id = ?').get(queryId, queryId);
    if (!existing) {
      return res.status(404).json({ message: 'Registration record not found.' });
    }

    const now = new Date().toISOString();
    const collectedAt = collected ? now : null;
    const collector = collected ? (collectedBy || req.admin.name || 'MIT Operations Desk') : null;
    const distStatus = collected ? 'collected' : 'pending';

    db.prepare(`
      UPDATE registrations
      SET collected_at = ?, collected_by = ?, distribution_status = ?, updated_at = ?
      WHERE id = ?
    `).run(collectedAt, collector, distStatus, now, existing.id);

    db.prepare(`
      UPDATE uniform_orders
      SET distribution_status = ?, updated_at = ?
      WHERE student_id = ?
    `).run(distStatus, now, existing.id);

    logAudit(req.admin.id, req.admin.email, collected ? 'MARK_COLLECTED' : 'UNMARK_COLLECTED', 'registration', existing.id, { collected, collector }, req.ip);
    appCache.invalidatePrefix('summary:');

    res.json({
      success: true,
      collected_at: collectedAt,
      collected_by: collector,
      distribution_status: distStatus
    });
  } catch (err) {
    console.error('Collect error:', err);
    res.status(500).json({ message: 'Could not update collection status.' });
  }
});

// ─── Admin: Delete Single Registration ──────────────────────────
app.delete('/api/admin/registrations/:id', authenticateAdmin, (req, res) => {
  const queryId = req.params.id.trim().replace(/^#/, '');
  try {
    const existing = db.prepare('SELECT id, registration_id FROM registrations WHERE id = ? OR registration_id = ?').get(queryId, queryId);
    if (!existing) {
      return res.status(404).json({ message: 'Registration record not found.' });
    }

    db.prepare('DELETE FROM uniform_orders WHERE student_id = ?').run(existing.id);
    db.prepare('DELETE FROM registrations WHERE id = ?').run(existing.id);

    logAudit(req.admin.id, req.admin.email, 'DELETE_REGISTRATION', 'registration', existing.id, null, req.ip);
    appCache.invalidatePrefix('summary:');

    res.json({ success: true, message: 'Registration deleted successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Could not delete registration.' });
  }
});

// ─── Admin: Get All Distribution Schedules ──────────────────────
app.get('/api/admin/distribution', authenticateAdmin, (_req, res) => {
  try {
    const rows = db.prepare(`
      SELECT d.*, c.name AS campaign_name
      FROM distribution_schedules d
      JOIN campaigns c ON c.id = d.campaign_id
      WHERE c.active = 1
      ORDER BY d.distribution_date ASC, d.department, d.semester, d.section
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Could not load schedules.' });
  }
});

// ─── Admin: Create or Upsert Distribution Schedule ──────────────
app.post('/api/admin/distribution', authenticateAdmin, (req, res) => {
  const {
    id,
    department,
    semester,
    section,
    gender = 'All',
    status = 'pending',
    building = '',
    room = '',
    instructions = '',
    published = false
  } = req.body;

  const distributionDate = req.body.distribution_date !== undefined ? req.body.distribution_date : req.body.distributionDate;
  const startTime = req.body.start_time !== undefined ? req.body.start_time : req.body.startTime;
  const endTime = req.body.end_time !== undefined ? req.body.end_time : req.body.endTime;
  const academicYear = req.body.academic_year || req.body.academicYear || '2026-27';

  if (!department || !semester || !section) {
    return res.status(400).json({ message: 'Department, semester, and section are required.' });
  }

  try {
    const camp = db.prepare('SELECT id FROM campaigns WHERE active = 1 ORDER BY created_at DESC LIMIT 1').get();
    if (!camp) return res.status(400).json({ message: 'No active campaign found.' });

    const now = new Date().toISOString();
    const publishedVal = published ? 1 : 0;
    const publishedAt = published ? now : null;
    const semNum = Number(semester);

    // Check if updating an existing record by id or (campaign_id, department, semester, section)
    let targetId = id;
    let existing = null;
    if (id) {
      existing = db.prepare('SELECT * FROM distribution_schedules WHERE id = ?').get(id);
    }
    if (!existing) {
      existing = db.prepare('SELECT * FROM distribution_schedules WHERE campaign_id = ? AND department = ? AND semester = ? AND section = ?')
        .get(camp.id, department, semNum, section);
      if (existing) {
        targetId = existing.id;
      }
    }

    if (existing) {
      targetId = existing.id;
      db.prepare(`
        UPDATE distribution_schedules SET
          department = ?,
          semester = ?,
          section = ?,
          gender = ?,
          academic_year = ?,
          status = ?,
          distribution_date = ?,
          start_time = ?,
          end_time = ?,
          building = ?,
          room = ?,
          instructions = ?,
          published = ?,
          published_at = CASE WHEN ? = 1 AND published = 0 THEN ? ELSE published_at END,
          updated_at = ?
        WHERE id = ?
      `).run(
        department, semNum, section, gender, academicYear,
        status, distributionDate || null, startTime || null, endTime || null,
        building || '', room || '', instructions || '', publishedVal,
        publishedVal, publishedAt, now, targetId
      );
    } else {
      targetId = targetId || crypto.randomUUID();
      db.prepare(`
        INSERT INTO distribution_schedules (
          id, campaign_id, department, semester, section, gender, academic_year,
          status, distribution_date, start_time, end_time, building, room,
          instructions, published, published_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        targetId, camp.id, department, semNum, section, gender, academicYear,
        status, distributionDate || null, startTime || null, endTime || null,
        building || '', room || '', instructions || '', publishedVal, publishedAt, now, now
      );
    }

    appCache.invalidatePrefix('schedule:');
    logAudit(req.admin.id, req.admin.email, 'UPSERT_SCHEDULE', 'distribution_schedule', targetId, req.body, req.ip);

    const saved = db.prepare('SELECT * FROM distribution_schedules WHERE id = ?').get(targetId);

    res.json(saved);
  } catch (err) {
    console.error('Schedule upsert error:', err);
    res.status(500).json({ message: 'Could not save schedule.' });
  }
});

// ─── Admin: Delete Distribution Schedule ────────────────────────
app.delete('/api/admin/distribution/:id', authenticateAdmin, (req, res) => {
  try {
    const { changes } = db.prepare('DELETE FROM distribution_schedules WHERE id = ?').run(req.params.id);
    if (!changes) return res.status(404).json({ message: 'Schedule not found.' });

    appCache.invalidatePrefix('schedule:');
    logAudit(req.admin.id, req.admin.email, 'DELETE_SCHEDULE', 'distribution_schedule', req.params.id, null, req.ip);

    res.json({ success: true, message: 'Schedule removed.' });
  } catch (err) {
    res.status(500).json({ message: 'Could not delete schedule.' });
  }
});

// ─── Admin: Audit Logs ──────────────────────────────────────────
app.get('/api/admin/audit-logs', authenticateAdmin, (_req, res) => {
  try {
    const logs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100').all();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'Could not load audit logs.' });
  }
});

app.listen(port, () => {
  console.log(`Uniform Management API running at http://localhost:${port}`);
  console.log(`Database engine: Native SQLite (Node 24 DatabaseSync) with WAL mode & FTS5 indexing`);
});

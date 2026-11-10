import express from 'express';
import crypto from 'node:crypto';
import { db, bumpGlobalSyncState } from './db.js';
import { uploadQrScanner, requireAdminAuth } from './paymentUpload.js';
import { issueVendorPortalLink } from './vendorPortalAuth.js';
import sseHub from './sseHub.js';
import { cleanRegId, isValidRegistrationId, resolveCanonicalRegistrationRecord } from './utils/registrationIdUtils.js';
import { decryptPin } from './studentTrackingRoutes.js';
import {
  CANONICAL_DEPARTMENTS,
  normalizeDepartment,
  normalizeCourse,
  normalizeEducationLevel,
  normalizeAcademicYear,
  normalizeSemester,
  normalizeSection,
  normalizeGender,
  normalizeAcademicGroupInput,
  pickMostSpecificAllocation
} from './utils/academicGroupMatcher.js';

const router = express.Router();

// Helper: Build deterministic allocation key
export const buildAllocationKey = ({
  educationLevel,
  course,
  department,
  academicYear,
  semester = 'ALL',
  section,
  gender = 'All',
  uniformCategory = 'STANDARD',
  academicPeriod = '2026-2027'
}) => {
  return [
    String(educationLevel || 'UG').toUpperCase().trim(),
    String(course || 'B.E.').toUpperCase().trim(),
    String(department || '').toUpperCase().trim(),
    String(academicYear || '').trim(),
    String(semester || 'ALL').trim(),
    String(section || '').toUpperCase().trim(),
    String(gender || 'All').trim(),
    String(uniformCategory || 'STANDARD').toUpperCase().trim(),
    String(academicPeriod || '2026-2027').trim()
  ].join('__');
};

// Helper: Generate sequential Vendor ID (e.g. MIT-VND-2026-001)
export const generateUniqueVendorId = () => {
  const row = db.prepare('SELECT COUNT(*) as count FROM vendors').get();
  const year = new Date().getFullYear();
  let seq = (row?.count || 0) + 1;
  while (true) {
    const candidate = `MIT-VND-${year}-${String(seq).padStart(3, '0')}`;
    const exists = db.prepare('SELECT 1 FROM vendors WHERE vendor_id = ?').get(candidate);
    if (!exists) return candidate;
    seq++;
  }
};

// Helper: Audit Logger
export const writeVendorAudit = ({ vendorId, adminId = null, action, previousValue = null, newValue = null }) => {
  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const prevStr = previousValue ? JSON.stringify(previousValue) : null;
    const newStr = newValue ? JSON.stringify(newValue) : null;
    db.prepare(`
      INSERT INTO vendor_audit_logs (id, vendor_id, admin_id, action, previous_value, new_value, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, vendorId || 'SYSTEM', adminId, action, prevStr, newStr, now);
  } catch (err) {
    console.error('Vendor Audit Error:', err.message);
  }
};

// Base Academic Structure (Original MIT Mysore Courses & Departments)
export const DEFAULT_ACADEMIC_CATALOG = {
  UG: {
    courses: ['B.E.'],
    departmentsByCourse: {
      'B.E.': [
        'CSE',
        'CSE (AI)',
        'CSE (AIML)',
        'CSE (Data Science)',
        'CSE (IoT & Cyber Security)',
        'CSBS',
        'CE',
        'ISE',
        'ECE',
        'CV',
        'ME'
      ]
    },
    years: ['1st Year', '2nd Year', '3rd Year', '4th Year'],
    semestersByYear: {
      '1st Year': ['ALL', '1st Sem', '2nd Sem'],
      '2nd Year': ['ALL', '3rd Sem', '4th Sem'],
      '3rd Year': ['ALL', '5th Sem', '6th Sem'],
      '4th Year': ['ALL', '7th Sem', '8th Sem']
    },
    sections: ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  },
  PG: {
    courses: ['MCA', 'MBA', 'M.Tech'],
    departmentsByCourse: {
      'MCA': ['MCA'],
      'MBA': ['MBA'],
      'M.Tech': [
        'M.Tech (CSE)',
        'M.Tech (Civil)',
        'M.Tech (Thermal Power)',
        'M.Tech (LSP/Signal Processing)',
        'M.Tech (Electronics)',
        'M.Tech'
      ]
    },
    years: ['1st Year', '2nd Year'],
    semestersByYear: {
      '1st Year': ['ALL', '1st Sem', '2nd Sem'],
      '2nd Year': ['ALL', '3rd Sem', '4th Sem']
    },
    sections: ['A', 'B', 'C', 'D']
  }
};

// Helper: Check Exclusive Allocation Conflicts (canonical normalization, wildcard ALL section & gender handling)
export const findConflictingAllocations = (candidateGroups, excludeVendorId = null) => {
  const conflicts = [];
  const activeAllocs = db.prepare(`
    SELECT va.*, v.vendor_name
    FROM vendor_allocations va
    JOIN vendors v ON va.vendor_id = v.vendor_id
    WHERE va.status = 'ACTIVE' AND v.status = 'ACTIVE'
      ${excludeVendorId ? 'AND va.vendor_id != ?' : ''}
  `).all(...(excludeVendorId ? [excludeVendorId] : []));

  for (const rawGrp of candidateGroups) {
    const grp = normalizeAcademicGroupInput(rawGrp);
    for (const ex of activeAllocs) {
      const exDept = normalizeDepartment(ex.department);
      const exCourse = normalizeCourse(ex.course, exDept);
      const exEdu = normalizeEducationLevel(ex.education_level, exCourse);
      const exYear = normalizeAcademicYear(ex.academic_year, ex.semester);
      const exSem = normalizeSemester(ex.semester);
      const exSec = normalizeSection(ex.section);
      const exGnd = normalizeGender(ex.gender);
      const exPeriod = String(ex.academic_period || '2026-2027').trim();
      const exCat = String(ex.uniform_category || 'STANDARD').toUpperCase().trim();

      // Check period and category
      if (exPeriod !== grp.academicPeriod || exCat !== grp.uniformCategory) continue;

      // Must match edu, course, dept, year
      if (exEdu !== grp.educationLevel || exCourse !== grp.course || exDept !== grp.department || exYear !== grp.academicYear) {
        continue;
      }

      // Check semester overlap
      const semConflict = (grp.semester === 'ALL' || exSem === 'ALL' || grp.semester === exSem);
      if (!semConflict) continue;

      // Check section overlap: Wildcard ALL conflicts with specific, and specific conflicts with same or ALL
      const secConflict = (grp.section === 'ALL' || exSec === 'ALL' || grp.section === exSec);
      if (!secConflict) continue;

      // Check gender overlap:
      // If either is ALL, they conflict!
      // If both are specific (e.g. BOYS vs GIRLS), they DO NOT conflict!
      const gndConflict = (grp.gender === 'ALL' || exGnd === 'ALL' || grp.gender === exGnd);
      if (!gndConflict) continue;

      conflicts.push({
        requestedGroup: `${grp.course} • ${grp.department} • ${grp.academicYear} • Sec ${grp.section} • ${grp.gender}`,
        ownedByVendorId: ex.vendor_id,
        ownedByVendorName: ex.vendor_name,
        conflictingAllocationId: ex.allocation_id
      });
      break;
    }
  }
  return conflicts;
};

// ============================================================================
// SYSTEM REAL-TIME SYNC STATE ROUTE
// ============================================================================

// GET /api/sync/version
router.get('/sync/version', (_req, res) => {
  try {
    const row = db.prepare("SELECT sync_version, last_event, last_modified_entity_id, updated_at FROM system_sync_state WHERE id = 'MIT_GLOBAL_SYNC_STATE'").get();
    return res.json({
      success: true,
      syncVersion: row?.sync_version || 1,
      lastEvent: row?.last_event || 'INIT',
      lastModifiedEntityId: row?.last_modified_entity_id || '',
      updatedAt: row?.updated_at || new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 1. ADMIN VENDOR DASHBOARD & AVAILABLE GROUPS DISCOVERY ROUTES
// ============================================================================

// GET /api/admin/vendors/dashboard
router.get('/admin/vendors/dashboard', requireAdminAuth, (req, res) => {
  try {
    const { search, department, academicYear, status } = req.query;

    let vendorSql = 'SELECT * FROM vendors WHERE 1=1';
    const vendorParams = [];

    if (status && status !== 'ALL') {
      vendorSql += ' AND status = ?';
      vendorParams.push(status);
    }

    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      vendorSql += ' AND (LOWER(vendor_name) LIKE ? OR LOWER(vendor_id) LIKE ? OR LOWER(contact_person) LIKE ? OR LOWER(mobile) LIKE ?)';
      vendorParams.push(q, q, q, q);
    }

    vendorSql += ' ORDER BY created_at DESC';
    const allVendors = db.prepare(vendorSql).all(...vendorParams);

    const activeAllocations = db.prepare("SELECT * FROM vendor_allocations WHERE status = 'ACTIVE'").all();
    const paymentConfigs = db.prepare('SELECT * FROM vendor_payment_configurations').all();
    const studentCountsAgg = db.prepare(`
      SELECT vendor_id, COUNT(*) as count
      FROM student_vendor_assignments
      GROUP BY vendor_id
    `).all();

    const studentCountByVendor = {};
    let totalAllocatedStudents = 0;
    studentCountsAgg.forEach((row) => {
      studentCountByVendor[row.vendor_id] = row.count;
      totalAllocatedStudents += row.count;
    });

    const configByVendor = {};
    paymentConfigs.forEach((cfg) => {
      configByVendor[cfg.vendor_id] = {
        vendorId: cfg.vendor_id,
        beneficiaryName: cfg.beneficiary_name,
        upiId: cfg.upi_id,
        paymentInstructions: cfg.payment_instructions,
        paymentAmount: cfg.payment_amount,
        isActive: Boolean(cfg.is_active),
        googlePayQR: { qrImageUrl: cfg.gpay_qr_url, isEnabled: Boolean(cfg.gpay_enabled), updatedAt: cfg.gpay_updated_at },
        phonePeQR: { qrImageUrl: cfg.phonepe_qr_url, isEnabled: Boolean(cfg.phonepe_enabled), updatedAt: cfg.phonepe_updated_at },
        paytmQR: { qrImageUrl: cfg.paytm_qr_url, isEnabled: Boolean(cfg.paytm_enabled), updatedAt: cfg.paytm_updated_at }
      };
    });

    const allocationsByVendor = {};
    const assignedDeptSet = new Set();
    activeAllocations.forEach((alloc) => {
      assignedDeptSet.add(`${alloc.course}-${alloc.department}`);
      if (!allocationsByVendor[alloc.vendor_id]) allocationsByVendor[alloc.vendor_id] = [];
      allocationsByVendor[alloc.vendor_id].push({
        allocationId: alloc.allocation_id,
        vendorId: alloc.vendor_id,
        educationLevel: alloc.education_level,
        course: alloc.course,
        department: alloc.department,
        academicYear: alloc.academic_year,
        semester: alloc.semester,
        section: alloc.section,
        uniformCategory: alloc.uniform_category,
        academicPeriod: alloc.academic_period,
        allocationKey: alloc.allocation_key,
        status: alloc.status
      });
    });

    // Enrich vendor list & apply department / year filters
    let enrichedVendors = allVendors.map((v) => {
      const vAllocs = allocationsByVendor[v.vendor_id] || [];
      const pCfg = configByVendor[v.vendor_id] || null;
      const activeScannersCount = pCfg
        ? [pCfg.googlePayQR, pCfg.phonePeQR, pCfg.paytmQR].filter(
          (s) => s && s.qrImageUrl && s.isEnabled
        ).length
        : 0;

      return {
        _id: v.id,
        id: v.id,
        vendorId: v.vendor_id,
        vendorName: v.vendor_name,
        contactPerson: v.contact_person,
        mobile: v.mobile,
        email: v.email,
        address: v.address,
        gstNumber: v.gst_number || '',
        notes: v.notes || '',
        status: v.status,
        allocations: vAllocs,
        assignedDepartments: [...new Set(vAllocs.map((a) => a.department))],
        assignedYears: [...new Set(vAllocs.map((a) => a.academicYear))],
        assignedSections: [...new Set(vAllocs.map((a) => `Sec ${a.section}`))],
        allocatedStudentsCount: studentCountByVendor[v.vendor_id] || 0,
        paymentConfig: pCfg,
        activeScannersCount,
        createdAt: v.created_at,
        updatedAt: v.updated_at
      };
    });

    if (department && department !== 'ALL') {
      const deptUpper = department.toUpperCase().trim();
      enrichedVendors = enrichedVendors.filter((v) =>
        v.allocations.some((a) => {
          const aDept = a.department.toUpperCase().trim();
          return (
            aDept === deptUpper ||
            (deptUpper === 'CV' && aDept === 'CIVIL') ||
            (deptUpper === 'CIVIL' && aDept === 'CV') ||
            (deptUpper === 'ME' && aDept === 'MECH') ||
            (deptUpper === 'MECH' && aDept === 'ME') ||
            (deptUpper === 'CSE (AIML)' && aDept === 'AIML') ||
            (deptUpper === 'AIML' && aDept === 'CSE (AIML)')
          );
        })
      );
    }
    if (academicYear && academicYear !== 'ALL') {
      enrichedVendors = enrichedVendors.filter((v) =>
        v.allocations.some((a) => a.academicYear === academicYear)
      );
    }

    const regCountRow = db.prepare('SELECT COUNT(*) as count FROM registrations').get();
    const totalRegs = regCountRow?.count || 0;
    const pendingVendorAllocations = Math.max(0, totalRegs - totalAllocatedStudents);

    const totalAssignedGroups = activeAllocations.length;
    const estimatedTotalGroups = 196;
    const unassignedAcademicGroups = Math.max(0, estimatedTotalGroups - totalAssignedGroups);

    const totalVendorsRow = db.prepare('SELECT COUNT(*) as count FROM vendors').get();
    const activeVendorsRow = db.prepare("SELECT COUNT(*) as count FROM vendors WHERE status = 'ACTIVE'").get();
    const inactiveVendorsRow = db.prepare("SELECT COUNT(*) as count FROM vendors WHERE status = 'INACTIVE'").get();

    return res.json({
      success: true,
      stats: {
        totalVendors: totalVendorsRow?.count || 0,
        activeVendors: activeVendorsRow?.count || 0,
        inactiveVendors: inactiveVendorsRow?.count || 0,
        totalAssignedDepartments: assignedDeptSet.size,
        totalAllocatedStudents,
        unassignedAcademicGroups,
        pendingVendorAllocations
      },
      vendors: enrichedVendors
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/vendors/next-id
router.get('/admin/vendors/next-id', requireAdminAuth, (_req, res) => {
  try {
    const nextVendorId = generateUniqueVendorId();
    return res.json({ success: true, nextVendorId });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/vendors/available-groups
router.get('/admin/vendors/available-groups', requireAdminAuth, (req, res) => {
  try {
    const { excludeVendorId, academicPeriod = '2026-2027', uniformCategory = 'STANDARD' } = req.query;

    let sql = `
      SELECT vendor_id as vendorId, education_level as educationLevel, course, department,
             academic_year as academicYear, semester, section, gender, uniform_category as uniformCategory,
             academic_period as academicPeriod, allocation_key as allocationKey
      FROM vendor_allocations
      WHERE status = 'ACTIVE'
        AND academic_period = ?
        AND UPPER(uniform_category) = ?
    `;
    const params = [academicPeriod, uniformCategory.toUpperCase()];
    if (excludeVendorId) {
      sql += ' AND vendor_id != ?';
      params.push(excludeVendorId);
    }

    const activeAllocations = db.prepare(sql).all(...params);

    const catalog = JSON.parse(JSON.stringify(DEFAULT_ACADEMIC_CATALOG));
    const distinctSections = db.prepare('SELECT DISTINCT section FROM registrations WHERE section IS NOT NULL').all();
    distinctSections.forEach((row) => {
      const cleanSec = String(row.section || '').replace(/section/i, '').trim().toUpperCase();
      if (cleanSec && !catalog.UG.sections.includes(cleanSec)) {
        catalog.UG.sections.push(cleanSec);
      }
    });

    return res.json({
      success: true,
      catalog,
      assignedGroups: activeAllocations
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 2. CREATE VENDOR, UPLOAD 3 SCANNERS & SAVE EXCLUSIVE ALLOCATIONS
// ============================================================================

const vendorScannerUpload = uploadQrScanner.fields([
  { name: 'googlePayQR', maxCount: 1 },
  { name: 'phonePeQR', maxCount: 1 },
  { name: 'paytmQR', maxCount: 1 }
]);

// POST /api/admin/vendors
router.post('/admin/vendors', requireAdminAuth, vendorScannerUpload, async (req, res) => {
  try {
    const {
      vendorName,
      contactPerson,
      mobile,
      email,
      address,
      gstNumber,
      status = 'ACTIVE',
      notes,
      beneficiaryName,
      upiId,
      paymentInstructions,
      paymentAmount,
      googlePayEnabled = 'true',
      phonePeEnabled = 'true',
      paytmEnabled = 'true',
      allocationsJson
    } = req.body;

    if (!vendorName || !contactPerson || !mobile || !email || !address) {
      return res.status(400).json({
        success: false,
        message: 'Vendor Name, Contact Person, Mobile, Email, and Address are required.'
      });
    }
    if (!beneficiaryName || !upiId) {
      return res.status(400).json({
        success: false,
        message: 'Vendor Beneficiary Name and UPI ID are required for payment routing.'
      });
    }

    let parsedAllocations = [];
    try {
      parsedAllocations = typeof allocationsJson === 'string' ? JSON.parse(allocationsJson) : allocationsJson;
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Invalid academic group allocation format.' });
    }

    if (!Array.isArray(parsedAllocations) || parsedAllocations.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please assign at least one unassigned Department, Year, and Section to this vendor.'
      });
    }

    // Deduplicate within the same request payload
    const seenKeys = new Set();
    const normalizedAllocations = [];
    for (const item of parsedAllocations) {
      const key = buildAllocationKey(item);
      if (seenKeys.has(key)) {
        return res.status(400).json({
          success: false,
          message: `Duplicate selection in form: ${key.replace(/__/g, ' • ')}`
        });
      }
      seenKeys.add(key);
      normalizedAllocations.push({
        educationLevel: String(item.educationLevel || 'UG').toUpperCase().trim(),
        course: String(item.course || 'B.E.').toUpperCase().trim(),
        department: String(item.department).toUpperCase().trim(),
        academicYear: String(item.academicYear).trim(),
        semester: String(item.semester || 'ALL').trim(),
        section: String(item.section).toUpperCase().trim(),
        gender: String(item.gender || 'All').trim(),
        uniformCategory: String(item.uniformCategory || 'STANDARD').toUpperCase().trim(),
        academicPeriod: String(item.academicPeriod || '2026-2027').trim(),
        allocationKey: key
      });
    }

    // Re-verify Exclusive Allocation on Backend Before Saving
    if (status === 'ACTIVE') {
      const conflicts = findConflictingAllocations(normalizedAllocations);
      if (conflicts.length > 0) {
        const conflictSummary = conflicts
          .map((c) => `${c.requestedGroup} (Already assigned to ${c.ownedByVendorId})`)
          .join('; ');
        return res.status(409).json({
          success: false,
          conflictDetected: true,
          conflicts,
          message: `Allocation Conflict: One or more selected academic groups became unavailable: ${conflictSummary}`
        });
      }
    }

    const vendorId = generateUniqueVendorId();
    const vendorRowId = crypto.randomUUID();
    const now = new Date().toISOString();

    const files = req.files || {};
    const gpayFile = files.googlePayQR?.[0];
    const phonepeFile = files.phonePeQR?.[0];
    const paytmFile = files.paytmQR?.[0];

    const gpayUrl = gpayFile ? `/uploads/payments/qrs/${gpayFile.filename}` : null;
    const phonepeUrl = phonepeFile ? `/uploads/payments/qrs/${phonepeFile.filename}` : null;
    const paytmUrl = paytmFile ? `/uploads/payments/qrs/${paytmFile.filename}` : null;

    const gpayActive = Boolean(gpayFile) && String(googlePayEnabled) === 'true' ? 1 : 0;
    const phonepeActive = Boolean(phonepeFile) && String(phonePeEnabled) === 'true' ? 1 : 0;
    const paytmActive = Boolean(paytmFile) && String(paytmEnabled) === 'true' ? 1 : 0;

    const parsedAmount = paymentAmount !== undefined && paymentAmount !== '' && Number(paymentAmount) > 0
      ? Number(paymentAmount)
      : 1500;

    // Atomic SQLite transaction
    const insertVendor = db.prepare(`
      INSERT INTO vendors (id, vendor_id, vendor_name, contact_person, mobile, email, address, gst_number, notes, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertPaymentCfg = db.prepare(`
      INSERT INTO vendor_payment_configurations (
        id, vendor_ref, vendor_id, gpay_qr_url, gpay_enabled, gpay_updated_at,
        phonepe_qr_url, phonepe_enabled, phonepe_updated_at,
        paytm_qr_url, paytm_enabled, paytm_updated_at,
        beneficiary_name, upi_id, payment_instructions, payment_amount, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAlloc = db.prepare(`
      INSERT INTO vendor_allocations (
        id, allocation_id, vendor_ref, vendor_id, education_level, course, department, academic_year, semester, section,
        gender, uniform_category, academic_period, allocation_key, status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const allocationDocs = [];

    db.exec('BEGIN TRANSACTION;');
    try {
      insertVendor.run(
        vendorRowId,
        vendorId,
        vendorName.trim(),
        contactPerson.trim(),
        mobile.trim(),
        email.trim(),
        address.trim(),
        (gstNumber || '').trim(),
        (notes || '').trim(),
        status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        req.adminId || null,
        now,
        now
      );

      insertPaymentCfg.run(
        crypto.randomUUID(),
        vendorRowId,
        vendorId,
        gpayUrl,
        gpayActive,
        gpayFile ? now : null,
        phonepeUrl,
        phonepeActive,
        phonepeFile ? now : null,
        paytmUrl,
        paytmActive,
        paytmFile ? now : null,
        beneficiaryName.trim(),
        upiId.trim(),
        paymentInstructions || 'Scan the assigned vendor QR code below, complete the exact uniform payment, and submit your 12-digit UPI UTR along with the payment screenshot.',
        parsedAmount,
        status === 'ACTIVE' ? 1 : 0,
        now,
        now
      );

      normalizedAllocations.forEach((grp, idx) => {
        const allocId = `ALLOC-${Date.now()}-${idx + 1}`;
        const rowId = crypto.randomUUID();
        insertAlloc.run(
          rowId,
          allocId,
          vendorRowId,
          vendorId,
          grp.educationLevel,
          grp.course,
          grp.department,
          grp.academicYear,
          grp.semester,
          grp.section,
          grp.gender || 'All',
          grp.uniformCategory,
          grp.academicPeriod,
          grp.allocationKey,
          status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
          req.adminId || null,
          now,
          now
        );
        allocationDocs.push({
          _id: rowId,
          allocationId: allocId,
          vendorId,
          ...grp,
          status: status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'
        });
      });

      db.exec('COMMIT;');
    } catch (txErr) {
      if (db.inTransaction) {
        try { db.exec('ROLLBACK;'); } catch (_) { }
      }
      if (txErr.message && (txErr.message.includes('UNIQUE constraint failed') || txErr.message.includes('constraint failed'))) {
        return res.status(409).json({
          success: false,
          conflictDetected: true,
          message: 'Conflict: One of the selected groups is already assigned to another active vendor.'
        });
      }
      throw txErr;
    }

    try {
      bumpGlobalSyncState('ALLOCATION_ASSIGNED', { vendorId });
      sseHub.broadcast('GLOBAL_SYNC_UPDATE', { event: 'ALLOCATION_ASSIGNED', vendorId });
      sseHub.broadcast('PAYMENT_CONFIG_CHANGED', { event: 'ALLOCATION_ASSIGNED', vendorId });

      syncWaitingStudentsForVendor(vendorId);
    } catch (postErr) {
      console.warn('Post-vendor creation sync warning:', postErr.message);
    }

    writeVendorAudit({
      vendorId,
      adminId: req.adminId,
      action: 'VENDOR_CREATED',
      newValue: {
        vendorName: vendorName.trim(),
        allocatedGroupsCount: allocationDocs.length,
        beneficiaryName: beneficiaryName.trim(),
        upiId: upiId.trim()
      }
    });

    let generatedPortalLink = null;
    if (status !== 'INACTIVE') {
      try {
        const issued = await issueVendorPortalLink({
          vendor: { id: vendorRowId, vendor_id: vendorId, status: 'ACTIVE' },
          req,
          adminId: req.adminId,
          isRegeneration: false
        });
        generatedPortalLink = issued.portalUrl;
      } catch (linkErr) {
        console.error('Failed to auto-issue portal link on vendor creation:', linkErr);
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Vendor Successfully Created',
      portalLink: generatedPortalLink,
      vendor: {
        _id: vendorRowId,
        vendorId,
        vendorName: vendorName.trim(),
        contactPerson: contactPerson.trim(),
        status: status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE'
      },
      paymentConfig: {
        vendorId,
        beneficiaryName: beneficiaryName.trim(),
        upiId: upiId.trim(),
        googlePayQR: { qrImageUrl: gpayUrl, isEnabled: Boolean(gpayActive) },
        phonePeQR: { qrImageUrl: phonepeUrl, isEnabled: Boolean(phonepeActive) },
        paytmQR: { qrImageUrl: paytmUrl, isEnabled: Boolean(paytmActive) }
      },
      allocations: allocationDocs
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({
        success: false,
        conflictDetected: true,
        message: 'Exclusive Allocation Conflict: One of the selected academic groups was simultaneously assigned to another active vendor. Please refresh available groups.'
      });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 3. EDIT VENDOR, MANAGE SCANNERS, DEACTIVATE & REASSIGN GROUPS
// ============================================================================

// PUT /api/admin/vendors/:vendorId
// Full Edit for Created Vendors: updates master profile, payment config, QR scanners, and allocations
router.put('/admin/vendors/:vendorId', requireAdminAuth, vendorScannerUpload, (req, res) => {
  try {
    const { vendorId } = req.params;
    const vendor = db.prepare('SELECT * FROM vendors WHERE vendor_id = ?').get(vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }

    const {
      vendorName,
      contactPerson,
      mobile,
      email,
      address,
      gstNumber,
      status,
      notes,
      beneficiaryName,
      upiId,
      paymentInstructions,
      paymentAmount,
      googlePayEnabled,
      phonePeEnabled,
      paytmEnabled,
      deleteGooglePay,
      deletePhonePe,
      deletePaytm,
      newAllocationsJson,
      releasedAllocationIdsJson
    } = req.body;

    const files = req.files || {};
    const now = new Date().toISOString();

    const nextVendorName = vendorName !== undefined ? vendorName.trim() : vendor.vendor_name;
    const nextContactPerson = contactPerson !== undefined ? contactPerson.trim() : vendor.contact_person;
    const nextMobile = mobile !== undefined ? mobile.trim() : vendor.mobile;
    const nextEmail = email !== undefined ? email.trim() : vendor.email;
    const nextAddress = address !== undefined ? address.trim() : vendor.address;
    const nextGst = gstNumber !== undefined ? gstNumber.trim() : (vendor.gst_number || '');
    const nextNotes = notes !== undefined ? notes.trim() : (vendor.notes || '');
    const nextStatus = status === 'INACTIVE' ? 'INACTIVE' : (status === 'ACTIVE' ? 'ACTIVE' : vendor.status);

    if (!nextVendorName || !nextContactPerson || !nextMobile || !nextEmail || !nextAddress) {
      return res.status(400).json({
        success: false,
        message: 'Vendor Name, Contact Person, Mobile, Email, and Address cannot be empty.'
      });
    }

    const pCfg = db.prepare('SELECT * FROM vendor_payment_configurations WHERE vendor_id = ?').get(vendorId);
    let gpayUrl = pCfg ? pCfg.gpay_qr_url : null;
    let gpayActive = pCfg ? pCfg.gpay_enabled : 0;
    let gpayUpdated = pCfg ? pCfg.gpay_updated_at : null;

    if (deleteGooglePay === 'true') {
      gpayUrl = null;
      gpayActive = 0;
      gpayUpdated = now;
    } else if (files.googlePayQR?.[0]) {
      gpayUrl = `/uploads/payments/qrs/${files.googlePayQR[0].filename}`;
      gpayActive = 1;
      gpayUpdated = now;
    } else if (googlePayEnabled !== undefined) {
      gpayActive = Boolean(gpayUrl) && String(googlePayEnabled) === 'true' ? 1 : 0;
    }

    let phonepeUrl = pCfg ? pCfg.phonepe_qr_url : null;
    let phonepeActive = pCfg ? pCfg.phonepe_enabled : 0;
    let phonepeUpdated = pCfg ? pCfg.phonepe_updated_at : null;

    if (deletePhonePe === 'true') {
      phonepeUrl = null;
      phonepeActive = 0;
      phonepeUpdated = now;
    } else if (files.phonePeQR?.[0]) {
      phonepeUrl = `/uploads/payments/qrs/${files.phonePeQR[0].filename}`;
      phonepeActive = 1;
      phonepeUpdated = now;
    } else if (phonePeEnabled !== undefined) {
      phonepeActive = Boolean(phonepeUrl) && String(phonePeEnabled) === 'true' ? 1 : 0;
    }

    let paytmUrl = pCfg ? pCfg.paytm_qr_url : null;
    let paytmActive = pCfg ? pCfg.paytm_enabled : 0;
    let paytmUpdated = pCfg ? pCfg.paytm_updated_at : null;

    if (deletePaytm === 'true') {
      paytmUrl = null;
      paytmActive = 0;
      paytmUpdated = now;
    } else if (files.paytmQR?.[0]) {
      paytmUrl = `/uploads/payments/qrs/${files.paytmQR[0].filename}`;
      paytmActive = 1;
      paytmUpdated = now;
    } else if (paytmEnabled !== undefined) {
      paytmActive = Boolean(paytmUrl) && String(paytmEnabled) === 'true' ? 1 : 0;
    }

    const bName = beneficiaryName !== undefined ? beneficiaryName.trim() : (pCfg?.beneficiary_name || '');
    const uId = upiId !== undefined ? upiId.trim() : (pCfg?.upi_id || '');
    const pInst = paymentInstructions !== undefined ? paymentInstructions : (pCfg?.payment_instructions || 'Scan the assigned vendor QR code below, complete the exact uniform payment, and submit your 12-digit UPI UTR along with the payment screenshot.');
    const pAmt = paymentAmount !== undefined
      ? (paymentAmount !== '' && Number(paymentAmount) > 0 ? Number(paymentAmount) : (pCfg?.payment_amount ?? 1500))
      : (pCfg?.payment_amount ?? 1500);

    let newAllocations = [];
    if (newAllocationsJson) {
      try {
        newAllocations = typeof newAllocationsJson === 'string' ? JSON.parse(newAllocationsJson) : newAllocationsJson;
      } catch { }
    }

    if (Array.isArray(newAllocations) && newAllocations.length > 0) {
      const conflicts = findConflictingAllocations(newAllocations, vendor.vendor_id);
      if (conflicts.length > 0) {
        return res.status(409).json({
          success: false,
          conflictDetected: true,
          conflicts,
          message: 'One or more of the selected new groups are already assigned to another active vendor.'
        });
      }
    }

    let releasedAllocationIds = [];
    if (releasedAllocationIdsJson) {
      try {
        releasedAllocationIds = typeof releasedAllocationIdsJson === 'string' ? JSON.parse(releasedAllocationIdsJson) : releasedAllocationIdsJson;
      } catch { }
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      db.prepare(`
        UPDATE vendors
        SET vendor_name = ?, contact_person = ?, mobile = ?, email = ?, address = ?,
            gst_number = ?, notes = ?, status = ?, updated_at = ?
        WHERE vendor_id = ?
      `).run(nextVendorName, nextContactPerson, nextMobile, nextEmail, nextAddress, nextGst, nextNotes, nextStatus, now, vendorId);

      if (pCfg) {
        db.prepare(`
          UPDATE vendor_payment_configurations
          SET gpay_qr_url = ?, gpay_enabled = ?, gpay_updated_at = ?,
              phonepe_qr_url = ?, phonepe_enabled = ?, phonepe_updated_at = ?,
              paytm_qr_url = ?, paytm_enabled = ?, paytm_updated_at = ?,
              beneficiary_name = ?, upi_id = ?, payment_instructions = ?, payment_amount = ?,
              is_active = ?, updated_at = ?
          WHERE vendor_id = ?
        `).run(
          gpayUrl, gpayActive, gpayUpdated,
          phonepeUrl, phonepeActive, phonepeUpdated,
          paytmUrl, paytmActive, paytmUpdated,
          bName, uId, pInst, pAmt,
          nextStatus === 'ACTIVE' ? 1 : 0, now,
          vendorId
        );
      } else {
        db.prepare(`
          INSERT INTO vendor_payment_configurations (
            id, vendor_ref, vendor_id, gpay_qr_url, gpay_enabled, gpay_updated_at,
            phonepe_qr_url, phonepe_enabled, phonepe_updated_at,
            paytm_qr_url, paytm_enabled, paytm_updated_at,
            beneficiary_name, upi_id, payment_instructions, payment_amount, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          crypto.randomUUID(), vendor.id, vendor.vendor_id,
          gpayUrl, gpayActive, gpayUpdated,
          phonepeUrl, phonepeActive, phonepeUpdated,
          paytmUrl, paytmActive, paytmUpdated,
          bName, uId, pInst, pAmt, nextStatus === 'ACTIVE' ? 1 : 0, now, now
        );
      }

      if (nextStatus === 'INACTIVE' && vendor.status === 'ACTIVE') {
        db.prepare("UPDATE vendor_allocations SET status = 'INACTIVE', updated_at = ? WHERE vendor_id = ? AND status = 'ACTIVE'").run(now, vendorId);
      } else if (nextStatus === 'ACTIVE' && vendor.status === 'INACTIVE') {
        db.prepare("UPDATE vendor_allocations SET status = 'ACTIVE', updated_at = ? WHERE vendor_id = ? AND status = 'INACTIVE'").run(now, vendorId);
      }

      const affectedUnpaidStudents = [];
      if (Array.isArray(releasedAllocationIds) && releasedAllocationIds.length > 0) {
        for (const rAllocId of releasedAllocationIds) {
          const stuList = db.prepare(`
            SELECT * FROM student_vendor_assignments
            WHERE allocation_id = ? AND (has_paid_or_submitted = 0 OR has_paid_or_submitted IS NULL)
          `).all(rAllocId);
          affectedUnpaidStudents.push(...stuList);

          db.prepare("UPDATE vendor_allocations SET status = 'RELEASED', updated_at = ? WHERE allocation_id = ? AND vendor_id = ?").run(now, rAllocId, vendorId);
          db.prepare("DELETE FROM student_vendor_assignments WHERE allocation_id = ? AND (has_paid_or_submitted = 0 OR has_paid_or_submitted IS NULL)").run(rAllocId);
          db.prepare("UPDATE registrations SET assigned_vendor_id = NULL, assigned_vendor_name = NULL, vendor_allocation_id = NULL WHERE vendor_allocation_id = ? AND (payment_verified = 0 OR payment_status NOT IN ('Paid', 'Payment Verified', 'Payment Successful'))").run(rAllocId);
        }

        for (const s of affectedUnpaidStudents) {
          try {
            db.prepare(`
              UPDATE student_tracking_records
              SET assigned_vendor = '{"vendorId":"","vendorName":"Assigned Uniform Vendor","allocationId":""}', updated_at = ?
              WHERE (registration_id = ? OR id = ? OR usn = ?)
            `).run(now, s.registration_id, s.student_id, s.usn);
          } catch (_) { }
        }
      }

      if (Array.isArray(newAllocations) && newAllocations.length > 0) {
        const insertAlloc = db.prepare(`
          INSERT INTO vendor_allocations (
            id, allocation_id, vendor_ref, vendor_id, education_level, course, department, academic_year, semester, section,
            gender, uniform_category, academic_period, allocation_key, status, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        newAllocations.forEach((rawItem, idx) => {
          const grp = normalizeAcademicGroupInput(rawItem);
          const edu = grp.educationLevel;
          const crs = grp.course;
          const dept = grp.department;
          const yr = grp.academicYear;
          const sem = grp.semester;
          const sec = grp.section;
          const gnd = grp.gender || 'BOYS';
          const cat = grp.uniformCategory;
          const per = grp.academicPeriod;

          // Check if allocation for this exact vendor and group already exists (including RELEASED ones to reactivate)
          const existingSameVendor = db.prepare(`
            SELECT id, allocation_id FROM vendor_allocations
            WHERE vendor_id = ?
              AND department = ?
              AND academic_year = ?
              AND section = ?
              AND (gender = ? OR gender = ?)
          `).get(vendor.vendor_id, dept, yr, sec, gnd, gnd === 'BOYS' ? 'Boys' : 'Girls');

          if (existingSameVendor) {
            db.prepare(`
              UPDATE vendor_allocations
              SET status = ?,
                  collection_room = COALESCE(?, collection_room),
                  distribution_status = COALESCE(?, distribution_status),
                  distribution_date = COALESCE(?, distribution_date),
                  uniform_availability = COALESCE(?, uniform_availability),
                  updated_at = ?
              WHERE id = ?
            `).run(
              nextStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
              rawItem.collectionRoom || null,
              rawItem.distributionStatus || null,
              rawItem.distributionDate || null,
              rawItem.uniformAvailability || null,
              now,
              existingSameVendor.id
            );
            return;
          }

          const allocId = `ALLOC-${Date.now()}-${idx + 1}`;
          const rowId = crypto.randomUUID();
          const key = grp.allocationKey;
          insertAlloc.run(
            rowId,
            allocId,
            vendor.id,
            vendor.vendor_id,
            edu,
            crs,
            dept,
            yr,
            sem,
            sec,
            gnd,
            cat,
            per,
            key,
            nextStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
            req.adminId || null,
            now,
            now
          );
        });
      }

      db.exec('COMMIT;');
    } catch (txErr) {
      if (db.inTransaction) {
        try { db.exec('ROLLBACK;'); } catch (_) { }
      }
      if (txErr.message && (txErr.message.includes('UNIQUE constraint failed') || txErr.message.includes('constraint failed'))) {
        return res.status(409).json({
          success: false,
          conflictDetected: true,
          message: 'Conflict: One of the selected groups is already assigned to another active vendor.'
        });
      }
      throw txErr;
    }

    try {
      bumpGlobalSyncState('VENDOR_UPDATED', { vendorId });
      sseHub.broadcast('GLOBAL_SYNC_UPDATE', { event: 'VENDOR_UPDATED', vendorId });
      sseHub.broadcast('PAYMENT_CONFIG_CHANGED', { event: 'VENDOR_UPDATED', vendorId });

      syncWaitingStudentsForVendor(null);
    } catch (postErr) {
      console.warn('Post-vendor update sync warning:', postErr.message);
    }

    writeVendorAudit({
      vendorId,
      adminId: req.adminId,
      action: 'VENDOR_UPDATED',
      previousValue: { vendorName: vendor.vendor_name, status: vendor.status },
      newValue: { vendorName: nextVendorName, status: nextStatus, beneficiaryName: bName, upiId: uId }
    });

    return res.json({
      success: true,
      message: `Vendor ${nextVendorName} (${vendorId}) updated successfully.`,
      vendor: {
        vendorId,
        vendorName: nextVendorName,
        contactPerson: nextContactPerson,
        mobile: nextMobile,
        email: nextEmail,
        address: nextAddress,
        gstNumber: nextGst,
        notes: nextNotes,
        status: nextStatus
      }
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({
        success: false,
        conflictDetected: true,
        message: 'Conflict: One of the selected groups is already assigned to another active vendor.'
      });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Common helper: Execute allocation release
const executeReleaseAllocation = (allocationId, adminId = null) => {
  const alloc = db.prepare('SELECT * FROM vendor_allocations WHERE allocation_id = ?').get(allocationId);
  if (!alloc) return { success: false, notFound: true, message: 'Allocation not found.' };

  const now = new Date().toISOString();
  db.prepare("UPDATE vendor_allocations SET status = 'RELEASED', released_at = ?, released_by = ?, updated_at = ? WHERE allocation_id = ?").run(now, adminId || 'ADMIN', now, allocationId);

  // 1. Find all student assignments that were tied to this released allocation
  const affectedAssignments = db.prepare(`
    SELECT * FROM student_vendor_assignments
    WHERE allocation_id = ?
  `).all(allocationId);

  // 2. Delete assignments tied to released allocation
  db.prepare("DELETE FROM student_vendor_assignments WHERE allocation_id = ?").run(allocationId);

  // 3. Clear vendor in registrations for affected students
  db.prepare(`
    UPDATE registrations
    SET assigned_vendor_id = NULL, assigned_vendor_name = NULL, vendor_allocation_id = NULL
    WHERE vendor_allocation_id = ?
  `).run(allocationId);

  // 4. Clear in student_tracking_records & payment_submissions
  for (const s of affectedAssignments) {
    try {
      db.prepare(`
        UPDATE student_tracking_records
        SET assigned_vendor = '{"vendorId":"","vendorName":"Assigned Uniform Vendor","allocationId":""}', updated_at = ?
        WHERE (registration_id = ? OR id = ? OR usn = ?)
      `).run(now, s.registration_id, s.student_id, s.usn);

      db.prepare(`
        UPDATE payment_submissions
        SET vendor_id = NULL, vendor_name = NULL, vendor_allocation_id = NULL, updated_at = ?
        WHERE (registration_id = ? OR student_id = ? OR usn = ?)
          AND payment_status NOT IN ('Verified', 'Payment Verified')
      `).run(now, s.registration_id, s.student_id, s.usn);
    } catch (_) { }
  }

  // 5. Instantly re-evaluate all affected students: if another active vendor is available for this group, assign immediately!
  try {
    syncWaitingStudentsForVendor(null);
  } catch (_) { }

  // 6. Notify each affected student specifically via SSE
  for (const s of affectedAssignments) {
    try {
      sseHub.notifyStudent(s.registration_id, 'ALLOCATION_RELEASED', { allocationId, noVendorAssigned: true });
      sseHub.notifyStudent(s.student_id, 'ALLOCATION_RELEASED', { allocationId, noVendorAssigned: true });
      sseHub.notifyStudent(s.usn, 'ALLOCATION_RELEASED', { allocationId, noVendorAssigned: true });
    } catch (_) { }
  }

  // 7. Bump real-time sync state & broadcast to all connected clients & vendors
  try {
    bumpGlobalSyncState('ALLOCATION_RELEASED', { allocationId, vendorId: alloc.vendor_id });
    sseHub.broadcast('GLOBAL_SYNC_UPDATE', { event: 'ALLOCATION_RELEASED', allocationId, vendorId: alloc.vendor_id });
    sseHub.broadcast('PAYMENT_CONFIG_CHANGED', { event: 'ALLOCATION_RELEASED', allocationId, vendorId: alloc.vendor_id });
    sseHub.broadcast('ALLOCATION_RELEASED', { allocationId, vendorId: alloc.vendor_id });
    sseHub.notifyVendor(alloc.vendor_id, 'ALLOCATION_RELEASED', { allocationId, vendorId: alloc.vendor_id });
    sseHub.notifyVendor(alloc.vendor_id, 'GLOBAL_SYNC_UPDATE', { event: 'ALLOCATION_RELEASED', allocationId, vendorId: alloc.vendor_id });
  } catch (syncErr) {
    console.warn('Sync broadcast warning on release:', syncErr.message);
  }

  writeVendorAudit({
    vendorId: alloc.vendor_id,
    adminId,
    action: 'ALLOCATION_RELEASED',
    previousValue: { allocationId, group: `${alloc.course} ${alloc.department} ${alloc.academic_year} Sec ${alloc.section} (${alloc.gender || 'All'})` }
  });

  return { success: true, message: 'Academic group released successfully.', allocationId, vendorId: alloc.vendor_id };
};

// PATCH /api/admin/vendors/allocations/:allocationId/release
router.patch('/admin/vendors/allocations/:allocationId/release', requireAdminAuth, (req, res) => {
  try {
    const { allocationId } = req.params;
    const result = executeReleaseAllocation(allocationId, req.adminId);
    if (!result.success && result.notFound) return res.status(404).json(result);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/vendors/:vendorId/allocations/:allocationId
router.delete('/admin/vendors/:vendorId/allocations/:allocationId', requireAdminAuth, (req, res) => {
  try {
    const { allocationId } = req.params;
    const result = executeReleaseAllocation(allocationId, req.adminId);
    if (!result.success && result.notFound) return res.status(404).json(result);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/vendors/allocations/:allocationId
router.delete('/admin/vendors/allocations/:allocationId', requireAdminAuth, (req, res) => {
  try {
    const { allocationId } = req.params;
    const result = executeReleaseAllocation(allocationId, req.adminId);
    if (!result.success && result.notFound) return res.status(404).json(result);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/vendors/allocations/:allocationId/distribution
router.patch('/admin/vendors/allocations/:allocationId/distribution', requireAdminAuth, (req, res) => {
  try {
    const { allocationId } = req.params;
    const { collectionRoom, distributionStatus, distributionDate, uniformAvailability } = req.body;

    const alloc = db.prepare('SELECT * FROM vendor_allocations WHERE allocation_id = ?').get(allocationId);
    if (!alloc) return res.status(404).json({ success: false, message: 'Allocation not found.' });

    const now = new Date().toISOString();
    const nextRoom = collectionRoom !== undefined ? String(collectionRoom).trim() : (alloc.collection_room || '');
    const nextStatus = distributionStatus !== undefined ? String(distributionStatus).trim() : (alloc.distribution_status || 'Ready for Allocation');
    const nextDate = distributionDate !== undefined ? String(distributionDate).trim() : (alloc.distribution_date || '');
    const nextAvail = uniformAvailability !== undefined ? String(uniformAvailability).trim() : (alloc.uniform_availability || 'In Stock');

    db.prepare(`
      UPDATE vendor_allocations
      SET collection_room = ?, distribution_status = ?, distribution_date = ?, uniform_availability = ?, updated_at = ?
      WHERE allocation_id = ?
    `).run(nextRoom, nextStatus, nextDate, nextAvail, now, allocationId);

    // Also update matching registered students if room was set
    if (nextRoom) {
      db.prepare(`
        UPDATE registrations
        SET collection_room = ?, distribution_status = ?
        WHERE vendor_allocation_id = ?
      `).run(nextRoom, nextStatus, allocationId);
    }

    try {
      bumpGlobalSyncState('DISTRIBUTION_UPDATED', { allocationId, vendorId: alloc.vendor_id });
      sseHub.broadcast('GLOBAL_SYNC_UPDATE', { event: 'DISTRIBUTION_UPDATED', allocationId });
      sseHub.broadcast('PAYMENT_CONFIG_CHANGED', { event: 'DISTRIBUTION_UPDATED', allocationId });
    } catch (syncErr) {
      console.warn('Sync broadcast warning on distribution update:', syncErr.message);
    }

    writeVendorAudit({
      vendorId: alloc.vendor_id,
      adminId: req.adminId,
      action: 'DISTRIBUTION_UPDATED',
      newValue: { allocationId, collectionRoom: nextRoom, distributionStatus: nextStatus, distributionDate: nextDate, uniformAvailability: nextAvail }
    });

    return res.json({
      success: true,
      message: 'Distribution details updated successfully.',
      allocation: {
        allocationId,
        collectionRoom: nextRoom,
        distributionStatus: nextStatus,
        distributionDate: nextDate,
        uniformAvailability: nextAvail
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/vendors/:vendorId/scanners
router.put('/admin/vendors/:vendorId/scanners', requireAdminAuth, vendorScannerUpload, (req, res) => {
  try {
    const { vendorId } = req.params;
    const pCfg = db.prepare('SELECT * FROM vendor_payment_configurations WHERE vendor_id = ?').get(vendorId);
    if (!pCfg) {
      return res.status(404).json({ success: false, message: 'Vendor payment config not found.' });
    }

    const {
      beneficiaryName,
      upiId,
      paymentInstructions,
      paymentAmount,
      googlePayEnabled,
      phonePeEnabled,
      paytmEnabled,
      deleteGooglePay,
      deletePhonePe,
      deletePaytm
    } = req.body;

    const files = req.files || {};
    const now = new Date().toISOString();

    let gpayUrl = pCfg.gpay_qr_url;
    let gpayActive = pCfg.gpay_enabled;
    let gpayUpdated = pCfg.gpay_updated_at;

    if (deleteGooglePay === 'true') {
      gpayUrl = null;
      gpayActive = 0;
      gpayUpdated = now;
    } else if (files.googlePayQR?.[0]) {
      gpayUrl = `/uploads/payments/qrs/${files.googlePayQR[0].filename}`;
      gpayActive = 1;
      gpayUpdated = now;
    } else if (googlePayEnabled !== undefined) {
      gpayActive = Boolean(gpayUrl) && String(googlePayEnabled) === 'true' ? 1 : 0;
    }

    let phonepeUrl = pCfg.phonepe_qr_url;
    let phonepeActive = pCfg.phonepe_enabled;
    let phonepeUpdated = pCfg.phonepe_updated_at;

    if (deletePhonePe === 'true') {
      phonepeUrl = null;
      phonepeActive = 0;
      phonepeUpdated = now;
    } else if (files.phonePeQR?.[0]) {
      phonepeUrl = `/uploads/payments/qrs/${files.phonePeQR[0].filename}`;
      phonepeActive = 1;
      phonepeUpdated = now;
    } else if (phonePeEnabled !== undefined) {
      phonepeActive = Boolean(phonepeUrl) && String(phonePeEnabled) === 'true' ? 1 : 0;
    }

    let paytmUrl = pCfg.paytm_qr_url;
    let paytmActive = pCfg.paytm_enabled;
    let paytmUpdated = pCfg.paytm_updated_at;

    if (deletePaytm === 'true') {
      paytmUrl = null;
      paytmActive = 0;
      paytmUpdated = now;
    } else if (files.paytmQR?.[0]) {
      paytmUrl = `/uploads/payments/qrs/${files.paytmQR[0].filename}`;
      paytmActive = 1;
      paytmUpdated = now;
    } else if (paytmEnabled !== undefined) {
      paytmActive = Boolean(paytmUrl) && String(paytmEnabled) === 'true' ? 1 : 0;
    }

    const bName = beneficiaryName ? beneficiaryName.trim() : pCfg.beneficiary_name;
    const uId = upiId ? upiId.trim() : pCfg.upi_id;
    const pInst = paymentInstructions !== undefined ? paymentInstructions : pCfg.payment_instructions;
    const pAmt = paymentAmount !== undefined
      ? (paymentAmount !== '' && Number(paymentAmount) > 0 ? Number(paymentAmount) : (pCfg?.payment_amount ?? 1500))
      : (pCfg?.payment_amount ?? 1500);

    const vendorRow = db.prepare('SELECT status FROM vendors WHERE vendor_id = ?').get(vendorId);
    const vendorIsActive = vendorRow && vendorRow.status === 'ACTIVE' ? 1 : (pCfg.is_active ? 1 : 0);

    db.prepare(`
      UPDATE vendor_payment_configurations
      SET gpay_qr_url = ?, gpay_enabled = ?, gpay_updated_at = ?,
          phonepe_qr_url = ?, phonepe_enabled = ?, phonepe_updated_at = ?,
          paytm_qr_url = ?, paytm_enabled = ?, paytm_updated_at = ?,
          beneficiary_name = ?, upi_id = ?, payment_instructions = ?, payment_amount = ?, is_active = ?, updated_at = ?
      WHERE vendor_id = ?
    `).run(
      gpayUrl, gpayActive, gpayUpdated,
      phonepeUrl, phonepeActive, phonepeUpdated,
      paytmUrl, paytmActive, paytmUpdated,
      bName, uId, pInst, pAmt, vendorIsActive, now,
      vendorId
    );

    writeVendorAudit({
      vendorId,
      adminId: req.adminId,
      action: 'VENDOR_SCANNER_UPDATED',
      newValue: { beneficiaryName: bName, upiId: uId, paymentAmount: pAmt }
    });

    return res.json({
      success: true,
      message: `Payment scanners and configuration updated for ${vendorId}.`,
      paymentConfig: {
        vendorId,
        beneficiaryName: bName,
        upiId: uId,
        paymentInstructions: pInst,
        paymentAmount: pAmt,
        googlePayQR: { qrImageUrl: gpayUrl, isEnabled: Boolean(gpayActive), updatedAt: gpayUpdated },
        phonePeQR: { qrImageUrl: phonepeUrl, isEnabled: Boolean(phonepeActive), updatedAt: phonepeUpdated },
        paytmQR: { qrImageUrl: paytmUrl, isEnabled: Boolean(paytmActive), updatedAt: paytmUpdated }
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/vendors/:vendorId/allocations
router.post('/admin/vendors/:vendorId/allocations', requireAdminAuth, (req, res) => {
  try {
    const { vendorId } = req.params;
    const { newAllocations } = req.body;
    const vendor = db.prepare('SELECT * FROM vendors WHERE vendor_id = ?').get(vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found.' });

    if (!Array.isArray(newAllocations) || newAllocations.length === 0) {
      return res.status(400).json({ success: false, message: 'No academic groups selected.' });
    }

    const conflicts = findConflictingAllocations(newAllocations);
    if (conflicts.length > 0) {
      return res.status(409).json({
        success: false,
        conflictDetected: true,
        conflicts,
        message: 'One or more selected groups are already assigned to an active vendor.'
      });
    }

    const insertAlloc = db.prepare(`
      INSERT INTO vendor_allocations (
        id, allocation_id, vendor_ref, vendor_id, education_level, course, department, academic_year, semester, section,
        gender, uniform_category, academic_period, allocation_key, status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    const docs = [];

    db.exec('BEGIN TRANSACTION;');
    try {
      newAllocations.forEach((grp, idx) => {
        const allocId = `ALLOC-${Date.now()}-${idx + 1}`;
        const rowId = crypto.randomUUID();
        const key = buildAllocationKey(grp);
        insertAlloc.run(
          rowId,
          allocId,
          vendor.id,
          vendor.vendor_id,
          String(grp.educationLevel || 'UG').toUpperCase().trim(),
          String(grp.course || 'B.E.').toUpperCase().trim(),
          String(grp.department).toUpperCase().trim(),
          String(grp.academicYear).trim(),
          String(grp.semester || 'ALL').trim(),
          String(grp.section).toUpperCase().trim(),
          String(grp.gender || 'All').trim(),
          String(grp.uniformCategory || 'STANDARD').toUpperCase().trim(),
          String(grp.academicPeriod || '2026-2027').trim(),
          key,
          vendor.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
          req.adminId || null,
          now,
          now
        );
        docs.push({ allocationId: allocId, vendorId: vendor.vendor_id, ...grp });
      });
      db.exec('COMMIT;');
    } catch (e) {
      if (db.inTransaction) {
        try { db.exec('ROLLBACK;'); } catch (_) { }
      }
      if (e.message && (e.message.includes('UNIQUE constraint failed') || e.message.includes('constraint failed'))) {
        return res.status(409).json({
          success: false,
          conflictDetected: true,
          message: 'Conflict: One of the selected groups is already assigned to another active vendor.'
        });
      }
      throw e;
    }

    try {
      bumpGlobalSyncState('ALLOCATION_ASSIGNED', { vendorId });
      sseHub.broadcast('GLOBAL_SYNC_UPDATE', { event: 'ALLOCATION_ASSIGNED', vendorId });
      sseHub.broadcast('PAYMENT_CONFIG_CHANGED', { event: 'ALLOCATION_ASSIGNED', vendorId });

      syncWaitingStudentsForVendor(vendorId);
    } catch (postErr) {
      console.warn('Post-allocation sync warning:', postErr.message);
    }

    writeVendorAudit({
      vendorId,
      adminId: req.adminId,
      action: 'ALLOCATION_ASSIGNED',
      newValue: { addedGroupsCount: docs.length }
    });

    return res.json({
      success: true,
      message: `${docs.length} new academic group(s) exclusively assigned to ${vendor.vendor_name}.`,
      allocations: docs
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/admin/vendors/reassign-group
// Explicit Reassignment Workflow: Reassigns an academic group while protecting students who have already paid
router.post('/admin/vendors/reassign-group', requireAdminAuth, (req, res) => {
  try {
    const { allocationId, targetVendorId, reason, migrateUnpaidStudents = true } = req.body;
    if (!allocationId || !targetVendorId || !reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Allocation ID, Target Vendor, and Reassignment Reason are mandatory.'
      });
    }

    const currentAlloc = db.prepare("SELECT * FROM vendor_allocations WHERE allocation_id = ? AND status = 'ACTIVE'").get(allocationId);
    if (!currentAlloc) {
      return res.status(404).json({ success: false, message: 'Active allocation not found.' });
    }

    const targetVendor = db.prepare("SELECT * FROM vendors WHERE vendor_id = ? AND status = 'ACTIVE'").get(targetVendorId);
    if (!targetVendor) {
      return res.status(400).json({
        success: false,
        message: 'Target vendor must exist and have an ACTIVE status.'
      });
    }

    if (currentAlloc.vendor_id === targetVendor.vendor_id) {
      return res.status(400).json({
        success: false,
        message: 'This academic group is already assigned to the selected vendor.'
      });
    }

    const oldVendorId = currentAlloc.vendor_id;
    const now = new Date().toISOString();
    const newAllocId = `ALLOC-${Date.now()}-R`;
    const newAllocRowId = crypto.randomUUID();

    db.exec('BEGIN TRANSACTION;');
    let migratedStudentsCount = 0;
    let protectedPaidStudentsCount = 0;

    try {
      // Mark old allocation as REASSIGNED
      db.prepare("UPDATE vendor_allocations SET status = 'REASSIGNED', updated_at = ? WHERE allocation_id = ?").run(now, allocationId);

      // Create new allocation for targetVendor
      db.prepare(`
        INSERT INTO vendor_allocations (
          id, allocation_id, vendor_ref, vendor_id, education_level, course, department, academic_year, semester, section,
          gender, uniform_category, academic_period, allocation_key, status, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
      `).run(
        newAllocRowId,
        newAllocId,
        targetVendor.id,
        targetVendor.vendor_id,
        currentAlloc.education_level,
        currentAlloc.course,
        currentAlloc.department,
        currentAlloc.academic_year,
        currentAlloc.semester,
        currentAlloc.section,
        currentAlloc.gender || 'All',
        currentAlloc.uniform_category,
        currentAlloc.academic_period,
        currentAlloc.allocation_key,
        req.adminId || null,
        now,
        now
      );

      // Protect students who have already submitted or verified payment!
      if (migrateUnpaidStudents) {
        const assignedStudents = db.prepare('SELECT * FROM student_vendor_assignments WHERE allocation_id = ?').all(currentAlloc.allocation_id);

        for (const stu of assignedStudents) {
          const existingPayment = db.prepare('SELECT 1 FROM payment_submissions WHERE registration_id = ?').get(stu.registration_id);

          if (existingPayment || stu.has_paid_or_submitted === 1) {
            protectedPaidStudentsCount++;
            continue; // Never silently change vendor for students who have already paid/submitted!
          }

          let history = [];
          try {
            history = JSON.parse(stu.reassignment_history || '[]');
          } catch { }

          history.push({
            previousVendorId: stu.vendor_id,
            previousVendorName: stu.vendor_name,
            previousAllocationId: stu.allocation_id,
            newVendorId: targetVendor.vendor_id,
            newVendorName: targetVendor.vendor_name,
            newAllocationId: newAllocId,
            reason: reason.trim(),
            reassignedBy: req.adminId || 'admin',
            reassignedAt: now
          });

          db.prepare(`
            UPDATE student_vendor_assignments
            SET vendor_ref = ?, vendor_id = ?, vendor_name = ?, allocation_ref = ?, allocation_id = ?,
                assignment_status = 'REASSIGNED', reassignment_history = ?, updated_at = ?
            WHERE id = ?
          `).run(
            targetVendor.id,
            targetVendor.vendor_id,
            targetVendor.vendor_name,
            newAllocRowId,
            newAllocId,
            JSON.stringify(history),
            now,
            stu.id
          );

          // Sync registration record
          db.prepare(`
            UPDATE registrations
            SET assigned_vendor_id = ?, assigned_vendor_name = ?, vendor_allocation_id = ?
            WHERE registration_id = ? OR id = ?
          `).run(targetVendor.vendor_id, targetVendor.vendor_name, newAllocId, stu.registration_id, stu.registration_id);

          try {
            const assignedVendorJson = JSON.stringify({
              vendorId: targetVendor.vendor_id,
              vendorName: targetVendor.vendor_name,
              allocationId: newAllocId
            });
            db.prepare(`
              UPDATE student_tracking_records
              SET assigned_vendor = ?, updated_at = ?
              WHERE (registration_id = ? OR id = ? OR usn = ?)
            `).run(assignedVendorJson, now, stu.registration_id, stu.student_id, stu.usn);

            db.prepare(`
              UPDATE payment_submissions
              SET vendor_id = ?, vendor_name = ?, vendor_allocation_id = ?, updated_at = ?
              WHERE (registration_id = ? OR student_id = ? OR usn = ?)
                AND payment_status NOT IN ('Verified', 'Payment Verified')
            `).run(targetVendor.vendor_id, targetVendor.vendor_name, newAllocId, now, stu.registration_id, stu.student_id, stu.usn);
          } catch (_) { }

          sseHub.notifyStudent(stu.registration_id, 'VENDOR_ASSIGNMENT_CHANGED', {
            vendorId: targetVendor.vendor_id,
            vendorName: targetVendor.vendor_name,
            allocationId: newAllocId
          });
          sseHub.notifyStudent(stu.student_id, 'VENDOR_ASSIGNMENT_CHANGED', {
            vendorId: targetVendor.vendor_id,
            vendorName: targetVendor.vendor_name,
            allocationId: newAllocId
          });
          sseHub.notifyStudent(stu.usn, 'VENDOR_ASSIGNMENT_CHANGED', {
            vendorId: targetVendor.vendor_id,
            vendorName: targetVendor.vendor_name,
            allocationId: newAllocId
          });

          migratedStudentsCount++;
        }
      }

      db.exec('COMMIT;');
    } catch (e) {
      if (db.inTransaction) {
        try { db.exec('ROLLBACK;'); } catch (_) { }
      }
      if (e.message && (e.message.includes('UNIQUE constraint failed') || e.message.includes('constraint failed'))) {
        return res.status(409).json({
          success: false,
          conflictDetected: true,
          message: 'Conflict: One of the selected groups is already assigned to another active vendor.'
        });
      }
      throw e;
    }

    try {
      bumpGlobalSyncState('VENDOR_REASSIGNED', { vendorId: targetVendor.vendor_id, oldVendorId });
      sseHub.broadcast('GLOBAL_SYNC_UPDATE', { event: 'VENDOR_REASSIGNED', vendorId: targetVendor.vendor_id, oldVendorId });
      sseHub.broadcast('VENDOR_REASSIGNED', { vendorId: targetVendor.vendor_id, oldVendorId });
      sseHub.broadcast('STUDENTS_REASSIGNED', { vendorId: targetVendor.vendor_id, count: migratedStudentsCount });
      sseHub.broadcast('PAYMENT_CONFIG_CHANGED', { event: 'VENDOR_REASSIGNED', vendorId: targetVendor.vendor_id });

      if (oldVendorId) {
        sseHub.notifyVendor(oldVendorId, 'ALLOCATION_RELEASED', { vendorId: oldVendorId });
        sseHub.notifyVendor(oldVendorId, 'GLOBAL_SYNC_UPDATE', { event: 'VENDOR_REASSIGNED', vendorId: oldVendorId });
      }
      sseHub.notifyVendor(targetVendor.vendor_id, 'STUDENTS_REASSIGNED', { count: migratedStudentsCount });
      sseHub.notifyVendor(targetVendor.vendor_id, 'GLOBAL_SYNC_UPDATE', { event: 'VENDOR_REASSIGNED', vendorId: targetVendor.vendor_id });

      syncWaitingStudentsForVendor(targetVendor.vendor_id);
    } catch (postErr) {
      console.warn('Post-allocation sync warning:', postErr.message);
    }

    writeVendorAudit({
      vendorId: targetVendor.vendor_id,
      adminId: req.adminId,
      action: 'ALLOCATION_REASSIGNED',
      previousValue: { previousVendorId: oldVendorId, allocationId: currentAlloc.allocation_id },
      newValue: {
        newVendorId: targetVendor.vendor_id,
        newAllocationId: newAllocId,
        reason: reason.trim(),
        migratedStudentsCount,
        protectedPaidStudentsCount
      }
    });

    return res.json({
      success: true,
      message: `Group reassigned from ${oldVendorId} to ${targetVendor.vendor_name}. ${migratedStudentsCount} unpaid student(s) migrated; ${protectedPaidStudentsCount} already-paid student record(s) preserved under ${oldVendorId}.`,
      newAllocation: {
        allocationId: newAllocId,
        vendorId: targetVendor.vendor_id,
        course: currentAlloc.course,
        department: currentAlloc.department,
        academicYear: currentAlloc.academic_year,
        section: currentAlloc.section
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/vendors/:vendorId/status
router.patch('/admin/vendors/:vendorId/status', requireAdminAuth, (req, res) => {
  try {
    const { status } = req.body;
    const vendor = db.prepare('SELECT * FROM vendors WHERE vendor_id = ?').get(req.params.vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found.' });

    const nextStatus = status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';
    const now = new Date().toISOString();

    if (nextStatus === 'ACTIVE') {
      const vendorAllocs = db.prepare("SELECT * FROM vendor_allocations WHERE vendor_id = ? AND status = 'INACTIVE'").all(vendor.vendor_id);
      const conflicts = findConflictingAllocations(vendorAllocs.map(a => ({
        educationLevel: a.education_level,
        course: a.course,
        department: a.department,
        academicYear: a.academic_year,
        semester: a.semester,
        section: a.section,
        uniformCategory: a.uniform_category,
        academicPeriod: a.academic_period
      })), vendor.vendor_id);

      if (conflicts.length > 0) {
        return res.status(409).json({
          success: false,
          conflicts,
          message: 'Cannot reactivate vendor directly because some of its previous groups are now assigned to another active vendor.'
        });
      }

      db.prepare("UPDATE vendor_allocations SET status = 'ACTIVE', updated_at = ? WHERE vendor_id = ? AND status = 'INACTIVE'").run(now, vendor.vendor_id);
    } else {
      db.prepare("UPDATE vendor_allocations SET status = 'INACTIVE', updated_at = ? WHERE vendor_id = ? AND status = 'ACTIVE'").run(now, vendor.vendor_id);
    }

    db.prepare('UPDATE vendors SET status = ?, updated_at = ? WHERE vendor_id = ?').run(nextStatus, now, vendor.vendor_id);
    db.prepare('UPDATE vendor_payment_configurations SET is_active = ?, updated_at = ? WHERE vendor_id = ?').run(nextStatus === 'ACTIVE' ? 1 : 0, now, vendor.vendor_id);

    if (nextStatus === 'ACTIVE') {
      syncWaitingStudentsForVendor(vendor.vendor_id);
    }

    if (nextStatus === 'INACTIVE') {
      try {
        sseHub.disconnectVendorStreams(
          vendor.vendor_id,
          'Your vendor account has been deactivated by the administrator.'
        );
      } catch { }
    }

    writeVendorAudit({
      vendorId: vendor.vendor_id,
      adminId: req.adminId,
      action: 'VENDOR_STATUS_CHANGED',
      previousValue: { status: vendor.status },
      newValue: { status: nextStatus }
    });

    return res.json({
      success: true,
      message: `${vendor.vendor_name} status updated to ${nextStatus}.`,
      vendor: { ...vendor, status: nextStatus }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/vendors/:vendorId/details
router.get('/admin/vendors/:vendorId/details', requireAdminAuth, (req, res) => {
  try {
    const { vendorId } = req.params;
    const vendor = db.prepare('SELECT * FROM vendors WHERE vendor_id = ?').get(vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found.' });

    const allocations = db.prepare("SELECT * FROM vendor_allocations WHERE vendor_id = ? AND status = 'ACTIVE' ORDER BY created_at DESC").all(vendorId);
    const releasedAllocations = db.prepare("SELECT * FROM vendor_allocations WHERE vendor_id = ? AND status = 'RELEASED' ORDER BY updated_at DESC").all(vendorId);
    const pCfg = db.prepare('SELECT * FROM vendor_payment_configurations WHERE vendor_id = ?').get(vendorId);
    const assignedStudents = db.prepare('SELECT * FROM student_vendor_assignments WHERE vendor_id = ? ORDER BY assigned_at DESC LIMIT 500').all(vendorId);
    const paymentRecords = db.prepare('SELECT * FROM payment_submissions WHERE vendor_id = ? ORDER BY created_at DESC LIMIT 500').all(vendorId);

    const paymentConfig = pCfg ? {
      vendorId: pCfg.vendor_id,
      beneficiaryName: pCfg.beneficiary_name,
      upiId: pCfg.upi_id,
      paymentInstructions: pCfg.payment_instructions,
      paymentAmount: pCfg.payment_amount,
      isActive: Boolean(pCfg.is_active),
      googlePayQR: { qrImageUrl: pCfg.gpay_qr_url, isEnabled: Boolean(pCfg.gpay_enabled), updatedAt: pCfg.gpay_updated_at },
      phonePeQR: { qrImageUrl: pCfg.phonepe_qr_url, isEnabled: Boolean(pCfg.phonepe_enabled), updatedAt: pCfg.phonepe_updated_at },
      paytmQR: { qrImageUrl: pCfg.paytm_qr_url, isEnabled: Boolean(pCfg.paytm_enabled), updatedAt: pCfg.paytm_updated_at }
    } : null;

    return res.json({
      success: true,
      vendor: {
        _id: vendor.id,
        id: vendor.id,
        vendorId: vendor.vendor_id,
        vendorName: vendor.vendor_name,
        contactPerson: vendor.contact_person,
        mobile: vendor.mobile,
        email: vendor.email,
        address: vendor.address,
        gstNumber: vendor.gst_number || '',
        status: vendor.status
      },
      allocations: allocations.map(a => ({
        allocationId: a.allocation_id,
        educationLevel: a.education_level,
        course: a.course,
        department: a.department,
        academicYear: a.academic_year,
        semester: a.semester,
        section: a.section,
        gender: a.gender || 'All',
        collectionRoom: a.collection_room || '',
        distributionStatus: a.distribution_status || 'Ready for Allocation',
        distributionDate: a.distribution_date || '',
        uniformAvailability: a.uniform_availability || 'In Stock',
        status: a.status
      })),
      releasedAllocations: releasedAllocations.map(a => ({
        allocationId: a.allocation_id,
        educationLevel: a.education_level,
        course: a.course,
        department: a.department,
        academicYear: a.academic_year,
        semester: a.semester,
        section: a.section,
        gender: a.gender || 'All',
        status: a.status
      })),
      paymentConfig,
      assignedStudents: assignedStudents.map(s => ({
        _id: s.id,
        registrationId: s.registration_id,
        usn: s.usn,
        studentName: s.student_name,
        course: s.course,
        department: s.department,
        academicYear: s.academic_year,
        section: s.section,
        assignmentStatus: s.assignment_status,
        assignedAt: s.assigned_at
      })),
      paymentRecords
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});



// ============================================================================
// 4. AUTOMATIC STUDENT-TO-VENDOR IDENTIFICATION & ISOLATED PAYMENT ROUTING
// ============================================================================

export function resolveOrCreateStudentVendorAssignment(studentRaw = {}) {
  const normStudent = normalizeAcademicGroupInput(studentRaw, { isStudent: true });
  const registrationId = studentRaw.registrationId;

  // 1. If already assigned, check whether the assignment is still valid & active
  if (registrationId) {
    const cleanUsnParam = String(studentRaw.usn || '').toUpperCase().trim();
    const existing = db.prepare(`
      SELECT * FROM student_vendor_assignments
      WHERE registration_id = ? OR student_id = ? OR (usn = ? AND ? != '')
      ORDER BY updated_at DESC LIMIT 1
    `).get(registrationId, registrationId, cleanUsnParam, cleanUsnParam);

    if (existing) {
      // Check if the assigned allocation and vendor are still ACTIVE!
      const alloc = db.prepare("SELECT * FROM vendor_allocations WHERE allocation_id = ? AND status = 'ACTIVE'").get(existing.allocation_id);
      const vendor = db.prepare("SELECT * FROM vendors WHERE vendor_id = ? AND status = 'ACTIVE'").get(existing.vendor_id);

      if (alloc && vendor) {
        // Sync assigned_vendor to student_tracking_records if not yet updated
        try {
          const assignedVendorJson = JSON.stringify({
            vendorId: existing.vendor_id,
            vendorName: existing.vendor_name,
            allocationId: existing.allocation_id
          });
          const cleanUsn = String(studentRaw.usn || existing.usn || '').toUpperCase().trim();
          db.prepare(`
            UPDATE student_tracking_records
            SET assigned_vendor = ?
            WHERE (registration_id = ? OR id = ? OR (usn = ? AND ? != ''))
              AND (assigned_vendor IS NULL OR assigned_vendor LIKE '%"vendorId":""%')
          `).run(assignedVendorJson, registrationId, registrationId, cleanUsn, cleanUsn);
        } catch (_) { }

        return {
          id: existing.id,
          _id: existing.id,
          registrationId: existing.registration_id,
          usn: existing.usn,
          studentName: existing.student_name,
          educationLevel: existing.education_level,
          course: existing.course,
          department: existing.department,
          academicYear: existing.academic_year,
          semester: existing.semester,
          section: existing.section,
          gender: existing.gender || 'BOYS',
          uniformCategory: existing.uniform_category,
          academicPeriod: existing.academic_period,
          vendorRef: existing.vendor_ref,
          vendorId: existing.vendor_id,
          vendorName: existing.vendor_name,
          allocationRef: existing.allocation_ref,
          allocationId: existing.allocation_id,
          collectionRoom: alloc.collection_room || '',
          distributionStatus: alloc.distribution_status || 'Ready for Allocation',
          distributionDate: alloc.distribution_date || '',
          uniformAvailability: alloc.uniform_availability || 'In Stock',
          hasPaidOrSubmitted: Boolean(existing.has_paid_or_submitted),
          assignmentStatus: existing.assignment_status
        };
      }

      // The allocation was RELEASED or vendor deactivated! Delete stale assignment so it re-evaluates
      db.prepare('DELETE FROM student_vendor_assignments WHERE id = ?').run(existing.id);
    }
  }

  // 2. Query all ACTIVE allocations with active vendors
  const activeAllocs = db.prepare(`
    SELECT va.*, v.vendor_name, v.status as vendor_status
    FROM vendor_allocations va
    JOIN vendors v ON va.vendor_id = v.vendor_id
    WHERE va.status = 'ACTIVE' AND v.status = 'ACTIVE'
  `).all();

  // Filter candidates matching department, course, year, period, category
  const candidates = activeAllocs.filter((a) => {
    const aDept = normalizeDepartment(a.department);
    const aCourse = normalizeCourse(a.course, aDept);
    const aEdu = normalizeEducationLevel(a.education_level, aCourse);
    const aYear = normalizeAcademicYear(a.academic_year, a.semester);
    const aPeriod = String(a.academic_period || '2026-2027').trim();
    const aCat = String(a.uniform_category || 'STANDARD').toUpperCase().trim();

    if (aPeriod !== normStudent.academicPeriod || aCat !== normStudent.uniformCategory) return false;
    if (aEdu !== normStudent.educationLevel || aCourse !== normStudent.course || aDept !== normStudent.department || aYear !== normStudent.academicYear) {
      return false;
    }

    // Section matching: 'ALL' or exact match
    const aSec = normalizeSection(a.section);
    if (aSec !== 'ALL' && aSec !== normStudent.section) return false;

    // Semester matching: 'ALL' or exact match
    const aSem = normalizeSemester(a.semester);
    if (aSem !== 'ALL' && normStudent.semester !== 'ALL' && aSem !== normStudent.semester) return false;

    // Gender matching
    const aGnd = normalizeGender(a.gender);
    if (normStudent.gender) {
      if (aGnd !== 'ALL' && aGnd !== normStudent.gender) return false;
    }

    return true;
  });

  if (candidates.length === 0) {
    if (registrationId) {
      db.prepare(`
        UPDATE registrations
        SET assigned_vendor_id = NULL, assigned_vendor_name = NULL, vendor_allocation_id = NULL
        WHERE (registration_id = ? OR id = ?) AND (payment_verified = 0 OR payment_status != 'Paid')
      `).run(registrationId, registrationId);
    }
    return null;
  }

  // Check if student gender is missing but allocations require specific gender
  if (!normStudent.gender) {
    const hasSpecificGender = candidates.some((c) => normalizeGender(c.gender) !== 'ALL');
    if (hasSpecificGender) {
      return {
        genderRequired: true,
        code: 'GENDER_REQUIRED_FOR_MATCH',
        message: 'Please select whether you are a Boy or Girl student so we can match your assigned vendor.'
      };
    }
  }

  // Pick most specific allocation
  const bestAllocation = pickMostSpecificAllocation(candidates, normStudent) || candidates[0];

  const rowId = crypto.randomUUID();
  const now = new Date().toISOString();

  if (registrationId) {
    db.prepare(`
      INSERT INTO student_vendor_assignments (
        id, student_id, registration_id, usn, student_name, education_level, course, department, academic_year, semester,
        section, gender, uniform_category, academic_period, vendor_ref, vendor_id, vendor_name, allocation_ref, allocation_id,
        has_paid_or_submitted, assignment_status, assigned_at, reassignment_history, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'ASSIGNED', ?, '[]', ?, ?)
    `).run(
      rowId,
      studentRaw.studentId || null,
      registrationId,
      String(studentRaw.usn || '').toUpperCase().trim(),
      studentRaw.studentName || '',
      normStudent.educationLevel,
      normStudent.course,
      normStudent.department,
      normStudent.academicYear,
      normStudent.semester,
      normStudent.section,
      normStudent.gender || 'BOYS',
      normStudent.uniformCategory,
      normStudent.academicPeriod,
      bestAllocation.vendor_ref,
      bestAllocation.vendor_id,
      bestAllocation.vendor_name,
      bestAllocation.id,
      bestAllocation.allocation_id,
      now,
      now,
      now
    );

    db.prepare(`
      UPDATE registrations
      SET assigned_vendor_id = ?, assigned_vendor_name = ?, vendor_allocation_id = ?
      WHERE registration_id = ? OR id = ?
    `).run(bestAllocation.vendor_id, bestAllocation.vendor_name, bestAllocation.allocation_id, registrationId, registrationId);

    try {
      const assignedVendorJson = JSON.stringify({
        vendorId: bestAllocation.vendor_id,
        vendorName: bestAllocation.vendor_name,
        allocationId: bestAllocation.allocation_id
      });
      const cleanUsn = String(studentRaw.usn || '').toUpperCase().trim();
      db.prepare(`
        UPDATE student_tracking_records
        SET assigned_vendor = ?, updated_at = ?
        WHERE (registration_id = ? OR id = ? OR (usn = ? AND ? != ''))
      `).run(assignedVendorJson, now, registrationId, registrationId, cleanUsn, cleanUsn);
    } catch (_) { }

    writeVendorAudit({
      vendorId: bestAllocation.vendor_id,
      action: 'STUDENT_AUTO_ASSIGNED',
      newValue: {
        usn: String(studentRaw.usn || '').toUpperCase().trim(),
        registrationId,
        group: `${normStudent.course} ${normStudent.department} ${normStudent.academicYear} Sec ${normStudent.section} (${normStudent.gender || 'BOYS'})`,
        allocationId: bestAllocation.allocation_id
      }
    });
  }

  return {
    id: rowId,
    _id: rowId,
    registrationId,
    usn: String(studentRaw.usn || '').toUpperCase().trim(),
    studentName: studentRaw.studentName || '',
    educationLevel: normStudent.educationLevel,
    course: normStudent.course,
    department: normStudent.department,
    academicYear: normStudent.academicYear,
    semester: normStudent.semester,
    section: normStudent.section,
    gender: normStudent.gender || 'BOYS',
    uniformCategory: normStudent.uniformCategory,
    academicPeriod: normStudent.academicPeriod,
    vendorRef: bestAllocation.vendor_ref,
    vendorId: bestAllocation.vendor_id,
    vendorName: bestAllocation.vendor_name,
    allocationRef: bestAllocation.id,
    allocationId: bestAllocation.allocation_id,
    collectionRoom: bestAllocation.collection_room || '',
    distributionStatus: bestAllocation.distribution_status || 'Ready for Allocation',
    distributionDate: bestAllocation.distribution_date || '',
    uniformAvailability: bestAllocation.uniform_availability || 'In Stock',
    hasPaidOrSubmitted: false,
    assignmentStatus: 'ASSIGNED'
  };
}

export function syncWaitingStudentsForVendor(vendorId = null) {
  try {
    if (vendorId) {
      const vendor = db.prepare("SELECT * FROM vendors WHERE vendor_id = ? AND status = 'ACTIVE'").get(vendorId);
      if (!vendor) return 0;

      const activeAllocs = db.prepare("SELECT * FROM vendor_allocations WHERE vendor_id = ? AND status = 'ACTIVE'").all(vendorId);
      if (activeAllocs.length === 0) return 0;
    }

    // Find all registrations that either have no active vendor assigned,
    // or were tied to an allocation/vendor that is no longer active, or belong to vendorId
    const waitingStudents = db.prepare(`
      SELECT r.* FROM registrations r
      LEFT JOIN vendor_allocations va ON r.vendor_allocation_id = va.allocation_id
      LEFT JOIN vendors v ON r.assigned_vendor_id = v.vendor_id
      WHERE (
          r.assigned_vendor_id IS NULL
          OR r.assigned_vendor_id = ''
          OR (? IS NOT NULL AND r.assigned_vendor_id = ?)
          OR va.status != 'ACTIVE'
          OR va.status IS NULL
          OR v.status != 'ACTIVE'
          OR v.status IS NULL
          OR ? IS NULL
        )
    `).all(vendorId, vendorId, vendorId);

    let assignedCount = 0;
    for (const s of waitingStudents) {
      const deptClean = String(s.department || '').toUpperCase().trim();
      const isPg = deptClean.includes('MBA') || deptClean.includes('MCA');
      const course = s.course || (isPg ? (deptClean.includes('MBA') ? 'MBA' : 'MCA') : 'B.E.');
      const educationLevel = s.education_level || (isPg ? 'PG' : 'UG');

      const res = resolveOrCreateStudentVendorAssignment({
        registrationId: s.id,
        studentId: s.id,
        usn: s.usn,
        studentName: s.full_name,
        educationLevel,
        course,
        department: s.department,
        academicYear: s.academic_year,
        semester: s.semester ? String(s.semester) : 'ALL',
        section: s.section,
        gender: s.gender || ''
      });

      if (res && !res.genderRequired) {
        assignedCount++;
        try {
          db.prepare(`
            UPDATE payment_submissions
            SET vendor_id = ?, vendor_name = ?, vendor_allocation_id = ?
            WHERE (usn = ? OR registration_id = ? OR student_id = ?)
              AND payment_status NOT IN ('Verified', 'Payment Verified')
          `).run(res.vendorId, res.vendorName, res.allocationId, s.usn, s.registration_id, s.id);
        } catch (_) { }

        // Notify student's live SSE streams across all identifier variants
        sseHub.notifyStudent(s.registration_id, 'VENDOR_ASSIGNMENT_CHANGED', res);
        sseHub.notifyStudent(s.id, 'VENDOR_ASSIGNMENT_CHANGED', res);
        sseHub.notifyStudent(s.usn, 'VENDOR_ASSIGNMENT_CHANGED', res);

        // Notify vendor of new student assignment
        if (res.vendorId) {
          sseHub.notifyVendor(res.vendorId, 'NEW_STUDENT_ASSIGNED', {
            registrationId: s.registration_id,
            usn: s.usn,
            studentName: s.full_name
          });
        }
      }
    }

    if (assignedCount > 0) {
      bumpGlobalSyncState('STUDENTS_REASSIGNED', { assignedCount, vendorId });
      sseHub.broadcast('GLOBAL_SYNC_UPDATE', { event: 'STUDENTS_REASSIGNED', assignedCount, vendorId });
      sseHub.broadcast('STUDENTS_REASSIGNED', { assignedCount, vendorId });
      sseHub.broadcast('PAYMENT_CONFIG_CHANGED', { event: 'STUDENTS_REASSIGNED', assignedCount, vendorId });
      if (vendorId) {
        sseHub.notifyVendor(vendorId, 'STUDENTS_REASSIGNED', { count: assignedCount });
        sseHub.notifyVendor(vendorId, 'GLOBAL_SYNC_UPDATE', { event: 'STUDENTS_REASSIGNED', count: assignedCount });
      }
    }

    return assignedCount;
  } catch (err) {
    console.warn('syncWaitingStudentsForVendor error:', err.message);
    return 0;
  }
}

// GET /api/student/vendor-payment/:registrationId
router.get('/student/vendor-payment/:registrationId', (req, res) => {
  try {
    const cleanedRegId = cleanRegId(req.params.registrationId);
    if (!isValidRegistrationId(cleanedRegId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Registration ID format.'
      });
    }

    // Strict Anti-Tampering Check: Never allow query string overrides of vendorId!
    if (req.query.vendorId || req.query.forceVendor) {
      writeVendorAudit({
        vendorId: String(req.query.vendorId || 'UNKNOWN'),
        action: 'UNAUTHORIZED_VENDOR_ACCESS_BLOCKED',
        newValue: { registrationId: cleanedRegId, attemptedQuery: req.query }
      });
      return res.status(403).json({
        success: false,
        message: 'Security Violation: Manual vendor selection or parameter tampering is strictly prohibited.'
      });
    }

    // Look up student from registrations table and tracking records
    const { canonicalRegId, registrationDoc, trackingRecord } = resolveCanonicalRegistrationRecord(cleanedRegId, req.query.usn);
    let dbReg = registrationDoc || db.prepare('SELECT * FROM registrations WHERE registration_id = ? OR id = ? OR usn = ?').get(canonicalRegId, canonicalRegId, cleanedRegId);

    if (dbReg) {
      if (req.query.usn && dbReg.usn && dbReg.usn.toUpperCase() !== req.query.usn.toUpperCase()) {
        writeVendorAudit({
          vendorId: 'SECURITY_GUARD',
          action: 'UNAUTHORIZED_VENDOR_ACCESS_BLOCKED',
          newValue: { registrationId: cleanedRegId, requestedUsn: req.query.usn, actualUsn: dbReg.usn }
        });
        return res.status(403).json({
          success: false,
          message: 'Unauthorized access: USN does not match this Registration ID.'
        });
      }
    }

    const yrVal = normalizeAcademicYear(req.query.academicYear || dbReg?.academic_year || dbReg?.semester || trackingRecord?.studentProfile?.academicYear, dbReg?.semester);
    const semVal = req.query.semester || (dbReg?.semester ? String(dbReg.semester) : (trackingRecord?.studentProfile?.semester || 'ALL'));
    const genderVal = req.query.gender || dbReg?.gender || trackingRecord?.studentProfile?.gender || '';

    const studentProfile = {
      registrationId: dbReg ? dbReg.id : canonicalRegId,
      studentId: dbReg ? dbReg.id : canonicalRegId,
      usn: dbReg ? dbReg.usn : (req.query.usn || trackingRecord?.usn),
      studentName: dbReg ? dbReg.full_name : (req.query.studentName || trackingRecord?.studentProfile?.studentName),
      educationLevel: req.query.educationLevel || dbReg?.education_level || trackingRecord?.studentProfile?.educationLevel || 'UG',
      course: req.query.course || dbReg?.course || trackingRecord?.studentProfile?.course || 'B.E.',
      department: dbReg ? dbReg.department : (req.query.department || trackingRecord?.studentProfile?.department),
      academicYear: yrVal,
      semester: semVal,
      section: dbReg ? dbReg.section : (req.query.section || trackingRecord?.studentProfile?.section),
      gender: genderVal
    };

    const assignment = resolveOrCreateStudentVendorAssignment(studentProfile);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        noVendorAssigned: true,
        message: 'No active uniform vendor has been assigned to your Department, Year, and Section yet. Please contact the MIT Mysore Uniform Office.'
      });
    }

    if (assignment.genderRequired) {
      return res.status(200).json({
        success: false,
        genderRequired: true,
        code: 'GENDER_REQUIRED_FOR_MATCH',
        message: assignment.message
      });
    }

    // Retrieve vendor payment configuration & auto-heal active status if vendor is active
    let vendorPaymentCfg = db.prepare('SELECT * FROM vendor_payment_configurations WHERE vendor_id = ?').get(assignment.vendorId);
    if (vendorPaymentCfg && !vendorPaymentCfg.is_active) {
      const vRec = db.prepare('SELECT status FROM vendors WHERE vendor_id = ?').get(assignment.vendorId);
      if (vRec && vRec.status === 'ACTIVE') {
        db.prepare('UPDATE vendor_payment_configurations SET is_active = 1 WHERE vendor_id = ?').run(assignment.vendorId);
        vendorPaymentCfg.is_active = 1;
      }
    }

    const globalPaymentCfg = db.prepare('SELECT * FROM payment_config LIMIT 1').get();

    if (!vendorPaymentCfg || !vendorPaymentCfg.is_active) {
      return res.status(503).json({
        success: false,
        message: 'Your assigned vendor payment scanners are currently being configured. Please check back shortly.'
      });
    }

    const isolatedMethods = [];
    if (vendorPaymentCfg.gpay_enabled && vendorPaymentCfg.gpay_qr_url) {
      isolatedMethods.push({
        methodType: 'GPAY',
        name: `${assignment.vendorName} – Google Pay (GPay)`,
        qrImageUrl: vendorPaymentCfg.gpay_qr_url,
        updatedAt: vendorPaymentCfg.gpay_updated_at
      });
    }
    if (vendorPaymentCfg.phonepe_enabled && vendorPaymentCfg.phonepe_qr_url) {
      isolatedMethods.push({
        methodType: 'PHONEPE',
        name: `${assignment.vendorName} – PhonePe`,
        qrImageUrl: vendorPaymentCfg.phonepe_qr_url,
        updatedAt: vendorPaymentCfg.phonepe_updated_at
      });
    }
    if (vendorPaymentCfg.paytm_enabled && vendorPaymentCfg.paytm_qr_url) {
      isolatedMethods.push({
        methodType: 'PAYTM',
        name: `${assignment.vendorName} – Paytm`,
        qrImageUrl: vendorPaymentCfg.paytm_qr_url,
        updatedAt: vendorPaymentCfg.paytm_updated_at
      });
    }

    const resolvedAmount =
      vendorPaymentCfg.payment_amount !== null && vendorPaymentCfg.payment_amount !== undefined && Number(vendorPaymentCfg.payment_amount) > 0
        ? Number(vendorPaymentCfg.payment_amount)
        : null;

    const syncState = db.prepare("SELECT sync_version FROM system_sync_state WHERE id = 'MIT_GLOBAL_SYNC_STATE'").get();
    const resolvedTrackingPin = trackingRecord?.encrypted_tracking_pin
      ? decryptPin(trackingRecord.encrypted_tracking_pin)
      : null;

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.json({
      success: true,
      syncVersion: syncState?.sync_version || 1,
      trackingPin: resolvedTrackingPin,
      applicationId: trackingRecord?.application_id || null,
      assignedVendor: {
        vendorId: assignment.vendorId,
        vendorName: assignment.vendorName,
        paymentAmount: resolvedAmount,
        allocationId: assignment.allocationId,
        matchedGroup: `${assignment.course} • ${assignment.department} • ${assignment.academicYear} • Section ${assignment.section}`,
        beneficiaryName: vendorPaymentCfg.beneficiary_name || assignment.vendorName,
        upiId: vendorPaymentCfg.upi_id,
        paymentInstructions: vendorPaymentCfg.payment_instructions,
        collectionRoom: assignment.collectionRoom || '',
        distributionStatus: assignment.distributionStatus || 'Ready for Allocation',
        distributionDate: assignment.distributionDate || '',
        uniformAvailability: assignment.uniformAvailability || 'In Stock'
      },
      paymentConfig: {
        isCollectionEnabled: globalPaymentCfg ? Boolean(globalPaymentCfg.is_collection_enabled) : true,
        unavailableMessage: globalPaymentCfg?.unavailable_message || 'Payment collection is temporarily unavailable. Please contact the Uniform Office.',
        paymentMode: globalPaymentCfg?.payment_mode || 'FIXED',
        resolvedAmount,
        uniformAmount: resolvedAmount,
        minAmount: globalPaymentCfg?.min_amount || 1,
        maxAmount: globalPaymentCfg?.max_amount || 10000,
        beneficiaryName: vendorPaymentCfg.beneficiary_name || assignment.vendorName
      },
      methods: isolatedMethods
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;

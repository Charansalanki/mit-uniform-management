import { parseAndValidateMitUsn } from '../utils/usnDepartmentValidator.js';
import { normalizeCourse, normalizeEducationLevel } from '../utils/academicGroupMatcher.js';
import { getUgPgControlState } from '../config/ugPgApplicationStatusDb.js';

/**
 * Authoritatively determines whether a student request belongs to 'UG' or 'PG'
 * by checking:
 *   1. Existing SQLite Registration Record (if registrationId / applicationId is passed)
 *   2. Verified USN Department Code (CS/IS/ME -> UG, BA/MC -> PG) [Anti-Tampering]
 *   3. Normalized Course / Department (B.E./B.Tech. -> UG, MBA/MCA/M.Tech. -> PG)
 *   4. Fallback to normalized educationLevel
 */
export function detectAuthoritativeEducationCategory(db, req) {
  const body = req.body || {};
  const query = req.query || {};
  const params = req.params || {};

  let rawUsn = body.usn || query.usn || '';
  let rawCourse = body.course || query.course || '';
  let rawDept = body.department || query.department || '';
  let rawEduLevel = body.educationLevel || query.educationLevel || '';
  const regOrAppId =
    body.registrationId ||
    body.applicationId ||
    params.registrationId ||
    query.registrationId ||
    '';

  // 1. If a registrationId or applicationId is provided, look up the saved record in SQLite
  if (regOrAppId && db) {
    try {
      const savedStudent = db
        .prepare(
          `SELECT usn, course, department, educationLevel
           FROM registrations
           WHERE id = ? OR registrationId = ? OR applicationId = ?
           LIMIT 1`
        )
        .get(String(regOrAppId), String(regOrAppId), String(regOrAppId));

      if (savedStudent) {
        rawUsn = savedStudent.usn || rawUsn;
        rawCourse = savedStudent.course || rawCourse;
        rawDept = savedStudent.department || rawDept;
        rawEduLevel = savedStudent.educationLevel || rawEduLevel;
      }
    } catch (_) {
      // Fallback to USN / Course inspection if table columns vary
    }
  }

  // 2. Highest Priority: Parse the USN directly (Cannot be spoofed by changing dropdowns)
  if (rawUsn) {
    const parsedUsn = parseAndValidateMitUsn(rawUsn);
    if (parsedUsn.isValid) {
      return {
        category: parsedUsn.educationLevel, // 'UG' or 'PG'
        detectedFrom: 'USN',
        course: parsedUsn.course,
        department: parsedUsn.departmentFullName
      };
    }
  }

  // 3. Second Priority: Check Department / Course code
  const normCourse = normalizeCourse(rawCourse, rawDept);
  if (['MBA', 'MCA', 'M.TECH.'].includes(normCourse)) {
    return {
      category: 'PG',
      detectedFrom: 'COURSE_OR_DEPARTMENT',
      course: normCourse,
      department: rawDept
    };
  }
  if (['B.E.', 'B.TECH.'].includes(normCourse) && (rawCourse || rawDept)) {
    return {
      category: 'UG',
      detectedFrom: 'COURSE_OR_DEPARTMENT',
      course: normCourse,
      department: rawDept
    };
  }

  // 4. Fallback to normalized educationLevel
  const normLevel = normalizeEducationLevel(rawEduLevel, normCourse);
  return {
    category: normLevel, // 'UG' or 'PG'
    detectedFrom: 'EDUCATION_LEVEL',
    course: normCourse,
    department: rawDept
  };
}

/**
 * Backend Middleware: Blocks NEW Registrations and NEW Payment Submissions
 * for UG when UG is OFF, and for PG when PG is OFF.
 * Never blocks Check Payment Status, Vendor Portal, or Admin Panel.
 */
export function createUgPgEnforcementMiddleware(getDbInstance) {
  return (req, res, next) => {
    try {
      const path = req.originalUrl || req.url || '';

      // 1. Always allow Admin Panel, Vendor Portal, SSE streams, and Read-Only Status Checks
      if (
        path.startsWith('/api/admin') ||
        path.startsWith('/api/vendor-portal') ||
        path.startsWith('/api/application-status') ||
        path.startsWith('/api/sync/version') ||
        path.startsWith('/api/sse') ||
        path.startsWith('/api/tracking/check-status') ||
        path.startsWith('/api/tracking/live-poll') ||
        path.startsWith('/uploads') ||
        (req.method === 'GET' && path.startsWith('/api/payments/status/')) ||
        (req.method === 'GET' && path.startsWith('/api/payments/methods')) ||
        (req.method === 'GET' && path.startsWith('/api/payments/config'))
      ) {
        return next();
      }

      const db = typeof getDbInstance === 'function' ? getDbInstance() : getDbInstance;
      const controlState = getUgPgControlState(db);

      // 2. If BOTH UG and PG are ON, allow immediately
      if (controlState.ugApplicationOpen && controlState.pgApplicationOpen) {
        return next();
      }

      // 3. If BOTH UG and PG are OFF, block all new registration / payment write/routing requests
      if (!controlState.ugApplicationOpen && !controlState.pgApplicationOpen) {
        res.set('Cache-Control', 'no-store');
        return res.status(503).json({
          success: false,
          applicationClosed: true,
          closedCategory: 'BOTH',
          ugApplicationOpen: false,
          pgApplicationOpen: false,
          videoUrl: controlState.videoUrl,
          message:
            'Both Undergraduate (UG) and Postgraduate (PG) uniform applications are currently closed. Existing students can still check their payment status.'
        });
      }

      // 4. Identify whether this student request belongs to UG or PG
      const detected = detectAuthoritativeEducationCategory(db, req);

      if (detected.category === 'UG' && !controlState.ugApplicationOpen) {
        res.set('Cache-Control', 'no-store');
        return res.status(403).json({
          success: false,
          applicationClosed: true,
          closedCategory: 'UG',
          ugApplicationOpen: false,
          pgApplicationOpen: controlState.pgApplicationOpen,
          message: controlState.ugClosedMessage
        });
      }

      if (detected.category === 'PG' && !controlState.pgApplicationOpen) {
        res.set('Cache-Control', 'no-store');
        return res.status(403).json({
          success: false,
          applicationClosed: true,
          closedCategory: 'PG',
          ugApplicationOpen: controlState.ugApplicationOpen,
          pgApplicationOpen: false,
          message: controlState.pgClosedMessage
        });
      }

      next();
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: 'Failed to verify UG/PG application availability.'
      });
    }
  };
}

export default {
  detectAuthoritativeEducationCategory,
  createUgPgEnforcementMiddleware
};


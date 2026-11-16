import { parseAndValidateMitUsn } from '../utils/usnDepartmentValidator.js';
import { normalizeCourse, normalizeEducationLevel } from '../utils/academicGroupMatcher.js';
import { getUgPgControlState } from '../config/ugPgApplicationStatusDb.js';

export const UG_DEPT_CODES = ['CS', 'CA', 'CI', 'CE', 'CD', 'IC', 'EC', 'CV', 'ME', 'IS', 'CB'];
export const PG_DEPT_CODES = ['BA', 'MC'];

/**
 * Classifies any USN record or Course/Department into 'UG' or 'PG'
 */
export function classifyUsnOrCourseCategory({ usn = '', course = '', department = '', educationLevel = '' } = {}) {
  if (usn) {
    const parsed = parseAndValidateMitUsn(usn);
    if (parsed.isValid && parsed.educationLevel) {
      return parsed.educationLevel; // Strictly 'UG' or 'PG' from official USN code
    }
    const upperUsn = String(usn).toUpperCase();
    if (PG_DEPT_CODES.some((code) => upperUsn.includes(code))) return 'PG';
    if (UG_DEPT_CODES.some((code) => upperUsn.includes(code))) return 'UG';
  }

  const normCourse = normalizeCourse(course, department);
  if (['MBA', 'MCA', 'M.TECH.'].includes(normCourse)) return 'PG';
  if (['B.E.', 'B.TECH.'].includes(normCourse) && (course || department)) return 'UG';

  return normalizeEducationLevel(educationLevel, normCourse);
}

/**
 * Filters any student-facing USN list or USN lookup query so that:
 * - When UG is OFF, UG USNs are never returned to the student portal.
 * - When PG is OFF, PG USNs are never returned to the student portal.
 * Underlying database records are never deleted or modified.
 */
export function filterStudentFacingUsnRecords(usnRecords = [], { ugApplicationOpen, pgApplicationOpen } = {}) {
  if (!ugApplicationOpen && !pgApplicationOpen) return [];
  if (ugApplicationOpen && pgApplicationOpen) return usnRecords;

  return (usnRecords || []).filter((record) => {
    const category = classifyUsnOrCourseCategory({
      usn: record.usn || record.studentUsn || '',
      course: record.course || '',
      department: record.department || '',
      educationLevel: record.educationLevel || ''
    });

    if (category === 'UG') return Boolean(ugApplicationOpen);
    if (category === 'PG') return Boolean(pgApplicationOpen);
    return false;
  });
}

/**
 * Authoritatively determines whether a student request belongs to 'UG' or 'PG'
 */
export function detectAuthoritativeEducationCategory(db, req) {
  const body = req.body || {};
  const query = req.query || {};
  const params = req.params || {};

  let rawUsn = body.usn || query.usn || params.usn || '';
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
      // Fallback
    }
  }

  // 2. Highest Priority: Parse the USN directly
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
      const state = getUgPgControlState(db);

      // Attach live UG/PG state to req so downstream USN lookup routes can filter records
      req.ugPgState = state;

      // 2. If BOTH UG and PG are OFF -> Block all student portal operations
      if (!state.ugApplicationOpen && !state.pgApplicationOpen) {
        res.set('Cache-Control', 'no-store');
        return res.status(503).json({
          success: false,
          bothClosed: true,
          applicationClosed: true,
          closedCategory: 'BOTH',
          ugApplicationOpen: false,
          pgApplicationOpen: false,
          videoUrl: state.videoUrl,
          message:
            'Both Undergraduate (UG) and Postgraduate (PG) uniform applications are currently closed. Existing students can still check their payment status.'
        });
      }

      // 3. Inspect incoming student USN / Course / Registration ID
      const body = req.body || {};
      const query = req.query || {};
      const params = req.params || {};

      let rawUsn = body.usn || query.usn || params.usn || '';
      let rawCourse = body.course || query.course || '';
      let rawDept = body.department || query.department || '';
      let rawEduLevel = body.educationLevel || query.educationLevel || '';

      const regOrAppId =
        body.registrationId ||
        body.applicationId ||
        params.registrationId ||
        query.registrationId ||
        '';

      if (regOrAppId && db && !rawUsn) {
        try {
          const saved = db
            .prepare(
              `SELECT usn, course, department, educationLevel
               FROM registrations
               WHERE id = ? OR registrationId = ? OR applicationId = ?
               LIMIT 1`
            )
            .get(String(regOrAppId), String(regOrAppId), String(regOrAppId));

          if (saved) {
            rawUsn = saved.usn || rawUsn;
            rawCourse = saved.course || rawCourse;
            rawDept = saved.department || rawDept;
            rawEduLevel = saved.educationLevel || rawEduLevel;
          }
        } catch (_) {}
      }

      // If request specifies a USN, Course, Department, or Education Level, enforce category lock
      if (rawUsn || rawCourse || rawDept || rawEduLevel) {
        const category = classifyUsnOrCourseCategory({
          usn: rawUsn,
          course: rawCourse,
          department: rawDept,
          educationLevel: rawEduLevel
        });

        if (category === 'UG' && !state.ugApplicationOpen) {
          res.set('Cache-Control', 'no-store');
          return res.status(403).json({
            success: false,
            categoryBlocked: 'UG',
            applicationClosed: true,
            closedCategory: 'UG',
            ugApplicationOpen: false,
            pgApplicationOpen: state.pgApplicationOpen,
            message: state.ugClosedMessage || 'Undergraduate (UG) application and UG USN registration are currently disabled.'
          });
        }

        if (category === 'PG' && !state.pgApplicationOpen) {
          res.set('Cache-Control', 'no-store');
          return res.status(403).json({
            success: false,
            categoryBlocked: 'PG',
            applicationClosed: true,
            closedCategory: 'PG',
            ugApplicationOpen: state.ugApplicationOpen,
            pgApplicationOpen: false,
            message: state.pgClosedMessage || 'Postgraduate (PG) application and PG USN registration are currently disabled.'
          });
        }
      }

      next();
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: 'Unable to validate application status.'
      });
    }
  };
}

export default {
  UG_DEPT_CODES,
  PG_DEPT_CODES,
  classifyUsnOrCourseCategory,
  filterStudentFacingUsnRecords,
  detectAuthoritativeEducationCategory,
  createUgPgEnforcementMiddleware
};

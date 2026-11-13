const { getSettingsFromDb } = require('../db/applicationSettingsDb');
const { resolveProgramCategory } = require('../utils/usnCategoryHelper');

/**
 * Enforces UG/PG open/closed rules on student-facing API routes.
 * Explicitly bypasses /api/admin/* so admin toggles are NEVER blocked.
 */
async function enforceStudentApplicationAccess(req, res, next) {
  try {
    // 1. NEVER block Admin, Auth, or Application Status endpoints
    if (
      req.originalUrl.startsWith('/api/admin') ||
      req.originalUrl.startsWith('/api/auth') ||
      req.originalUrl.startsWith('/api/application-status')
    ) {
      return next();
    }

    const status = await getSettingsFromDb();
    req.applicationStatus = status;

    // 2. Both UG and PG OFF -> Reject all student-facing lookups and submissions
    if (status.bothClosed) {
      return res.status(403).json({
        success: false,
        code: 'APPLICATIONS_CLOSED',
        ugApplicationOpen: false,
        pgApplicationOpen: false,
        bothClosed: true,
        closedVideoUrl: status.closedVideoUrl,
        message: 'Uniform applications for both UG and PG are currently closed.',
      });
    }

    // 3. If request carries a USN or category in params/query/body, validate it before controller runs
    const candidateUsn =
      req.params?.usn || req.query?.usn || req.body?.usn || req.body?.student_usn;
    const candidateCategory =
      req.body?.category || req.body?.program_type || req.query?.category;

    if (candidateUsn || candidateCategory) {
      const category = resolveProgramCategory({
        usn: candidateUsn,
        category: candidateCategory,
      });

      if (category === 'UG' && !status.ugApplicationOpen) {
        return res.status(403).json({
          success: false,
          code: 'UG_APPLICATION_CLOSED',
          ugApplicationOpen: status.ugApplicationOpen,
          pgApplicationOpen: status.pgApplicationOpen,
          message: 'UG uniform applications are currently closed. Only PG USNs are accepted.',
        });
      }

      if (category === 'PG' && !status.pgApplicationOpen) {
        return res.status(403).json({
          success: false,
          code: 'PG_APPLICATION_CLOSED',
          ugApplicationOpen: status.ugApplicationOpen,
          pgApplicationOpen: status.pgApplicationOpen,
          message: 'PG uniform applications are currently closed. Only UG USNs are accepted.',
        });
      }
    }

    return next();
  } catch (error) {
    console.error('[SQLite EnforceMiddleware] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to validate application status.',
    });
  }
}

module.exports = { enforceStudentApplicationAccess };


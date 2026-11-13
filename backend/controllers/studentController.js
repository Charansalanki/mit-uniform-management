const { db, getSettingsFromDb } = require('../db/applicationSettingsDb');
const {
  resolveProgramCategory,
  isStudentRecordAllowed,
} = require('../utils/usnCategoryHelper');

/**
 * GET /api/students/lookup/:usn
 * Looks up an uploaded USN in SQLite and hides it if its category (UG or PG) is switched OFF.
 * Never deletes any uploaded USN rows.
 */
exports.lookupStudentUsn = async (req, res) => {
  try {
    const rawUsn = (req.params.usn || req.query.usn || '').trim().toUpperCase();
    if (!rawUsn) {
      return res.status(400).json({ success: false, message: 'Please enter a valid USN.' });
    }

    const status = req.applicationStatus || (await getSettingsFromDb());

    if (status.bothClosed) {
      return res.status(403).json({
        success: false,
        code: 'APPLICATIONS_CLOSED',
        bothClosed: true,
        message: 'Uniform applications are currently closed.',
      });
    }

    // Query existing uploaded USNs table (e.g., `uploaded_usns` or `student_usns` or `students`)
    let studentRow = null;
    try {
      studentRow = await db.get(
        `SELECT * FROM student_usns WHERE UPPER(usn) = ? LIMIT 1`,
        [rawUsn]
      );
    } catch (_) {
      try {
        studentRow = await db.get(
          `SELECT * FROM uploaded_usns WHERE UPPER(usn) = ? LIMIT 1`,
          [rawUsn]
        );
      } catch (__) {
        studentRow = null;
      }
    }

    if (!studentRow) {
      return res.status(404).json({
        success: false,
        message: 'USN not found in uploaded student records.',
      });
    }

    const category = resolveProgramCategory(studentRow);

    // Hide UG USNs when UG is OFF; Hide PG USNs when PG is OFF
    if (!isStudentRecordAllowed(studentRow, status.ugApplicationOpen, status.pgApplicationOpen)) {
      return res.status(403).json({
        success: false,
        code: `${category}_APPLICATION_CLOSED`,
        message: `${category} uniform applications are currently closed.`,
      });
    }

    return res.status(200).json({
      success: true,
      student: {
        ...studentRow,
        category,
      },
    });
  } catch (error) {
    console.error('[SQLite StudentLookup] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Database error during USN lookup.',
    });
  }
};

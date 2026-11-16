import { verifyUsnDepartmentMatch } from '../utils/usnDepartmentValidator.js';
import { db } from '../db.js';

export const validateUsnAndDepartmentOnBackend = (req, res, next) => {
  let rawUsn = req.body.usn || req.body.studentUsn;
  let submittedDept = req.body.department;

  // If missing in body but registrationId is provided, pull from registrations table
  if ((!rawUsn || !submittedDept) && (req.body.registrationId || req.body.registration_id)) {
    try {
      const regId = req.body.registrationId || req.body.registration_id;
      const regRecord = db.prepare('SELECT * FROM registrations WHERE id = ? OR registration_id = ?').get(regId, regId);
      if (regRecord) {
        rawUsn = rawUsn || regRecord.usn;
        submittedDept = submittedDept || regRecord.department;
        req.body.usn = rawUsn;
        req.body.department = submittedDept;
      }
    } catch (e) {
      // fallback to direct check
    }
  }

  const check = verifyUsnDepartmentMatch(rawUsn, submittedDept);

  if (!check.isValid) {
    return res.status(400).json({
      success: false,
      errorCode: check.isMismatch ? 'DEPARTMENT_USN_MISMATCH' : check.parsed?.errorCode,
      detectedDepartment: check.parsed?.departmentFullName || null,
      detectedDepartmentCode: check.parsed?.departmentCode || null,
      message: check.errorMessage
    });
  }

  // Overwrite request body with canonical normalized values from the USN parser
  req.body.usn = check.parsed.normalizedUsn;
  req.body.departmentCode = check.parsed.departmentCode;
  req.body.department = check.parsed.departmentFullName;
  req.body.departmentShortName = check.parsed.departmentShortName;
  req.body.usnFormatType = check.parsed.formatType;
  req.body.isTemporaryUsn = check.parsed.isTemporaryUsn;
  req.usnMetadata = check.parsed;

  next();
};

export default { validateUsnAndDepartmentOnBackend };

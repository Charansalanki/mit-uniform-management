/**
 * MIT MYSORE OFFICIAL USN DEPARTMENT MAPPING & VALIDATION ENGINE
 * Configurable registry of all 13 official MIT Mysore Department Codes
 */
export const MIT_DEPARTMENT_REGISTRY = {
  CS: {
    code: 'CS',
    shortName: 'CSE',
    fullName: 'Computer Science & Engineering',
    educationLevel: 'UG',
    course: 'B.E.'
  },
  CA: {
    code: 'CA',
    shortName: 'CSE-AI',
    fullName: 'Computer Science & Engineering – AI',
    educationLevel: 'UG',
    course: 'B.E.'
  },
  CI: {
    code: 'CI',
    shortName: 'CSE-AIML',
    fullName: 'Computer Science & Engineering – AIML',
    educationLevel: 'UG',
    course: 'B.E.'
  },
  CE: {
    code: 'CE',
    shortName: 'CSE-CE',
    fullName: 'Computer Science & Engineering – CE',
    educationLevel: 'UG',
    course: 'B.E.'
  },
  CD: {
    code: 'CD',
    shortName: 'CSE-DS',
    fullName: 'Computer Science & Engineering – DS',
    educationLevel: 'UG',
    course: 'B.E.'
  },
  IC: {
    code: 'IC',
    shortName: 'CSE-IoT',
    fullName: 'Computer Science & Engineering – IoT',
    educationLevel: 'UG',
    course: 'B.E.'
  },
  EC: {
    code: 'EC',
    shortName: 'ECE',
    fullName: 'Electronics & Communication Engineering',
    educationLevel: 'UG',
    course: 'B.E.'
  },
  CV: {
    code: 'CV',
    shortName: 'CIVIL',
    fullName: 'Civil Engineering',
    educationLevel: 'UG',
    course: 'B.E.'
  },
  ME: {
    code: 'ME',
    shortName: 'MECH',
    fullName: 'Mechanical Engineering',
    educationLevel: 'UG',
    course: 'B.E.'
  },
  IS: {
    code: 'IS',
    shortName: 'ISE',
    fullName: 'Information Science & Engineering',
    educationLevel: 'UG',
    course: 'B.E.'
  },
  CB: {
    code: 'CB',
    shortName: 'CSBS',
    fullName: 'Computer Science & Engineering – BS',
    educationLevel: 'UG',
    course: 'B.E.'
  },
  BA: {
    code: 'BA',
    shortName: 'MBA',
    fullName: 'MBA',
    educationLevel: 'PG',
    course: 'MBA'
  },
  MC: {
    code: 'MC',
    shortName: 'MCA',
    fullName: 'MCA',
    educationLevel: 'PG',
    course: 'MCA'
  }
};

/**
 * Dual-Format Regex Breakdown:
 * - Prefix Group 1: (4MH | T-MIT)
 *     - 4MH   = Permanent VTU/College USN (including Lateral Entry 400+ series)
 *     - T-MIT = Temporary MIT USN for newly admitted / lateral entry students
 * - Group 2: (\d{2})        -> 2-digit Admission Year (e.g., 21 to 29)
 * - Group 3: ([A-Z]{2})     -> 2-letter Department Code (validated against MIT_DEPARTMENT_REGISTRY)
 * - Group 4: (\d{3})        -> 3-digit Student Serial Number (001 to 999)
 */
export const MIT_STRUCTURAL_USN_REGEX = /^(4MH|T-MIT)(\d{2})([A-Z]{2})(\d{3})$/;

/**
 * Parses and validates any student USN input
 * @param {string} rawUsn
 * @returns {object} Validation result with detected department details
 */
export function parseAndValidateMitUsn(rawUsn) {
  const normalizedUsn = String(rawUsn || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .trim();

  if (!normalizedUsn) {
    return {
      isValid: false,
      isComplete: false,
      normalizedUsn: '',
      errorCode: 'EMPTY_USN',
      errorMessage: 'USN / Student ID is required.'
    };
  }

  // Check if starts with a valid MIT Mysore prefix
  if (!normalizedUsn.startsWith('4MH') && !normalizedUsn.startsWith('T-MIT')) {
    return {
      isValid: false,
      isComplete: false,
      normalizedUsn,
      errorCode: 'INVALID_COLLEGE_PREFIX',
      errorMessage: 'Invalid USN prefix. Must start with "4MH" (Permanent USN) or "T-MIT" (Temporary MIT USN).'
    };
  }

  const match = normalizedUsn.match(MIT_STRUCTURAL_USN_REGEX);
  if (!match) {
    return {
      isValid: false,
      isComplete: normalizedUsn.length >= 10,
      normalizedUsn,
      errorCode: 'INVALID_USN_FORMAT',
      errorMessage:
        'Invalid or incomplete USN format. Expected format: 4MH24CS001 or T-MIT26CS412 (Prefix + 2-digit Year + 2-letter Dept Code + 3-digit Roll No).'
    };
  }

  const [, collegePrefix, admissionYearTwoDigit, deptCode, studentSerial] = match;
  const serialNum = parseInt(studentSerial, 10);

  if (serialNum < 1) {
    return {
      isValid: false,
      isComplete: true,
      normalizedUsn,
      errorCode: 'INVALID_SERIAL_NUMBER',
      errorMessage: 'Student serial number cannot be 000. Must be between 001 and 999.'
    };
  }

  // Look up department code in official MIT Mysore registry
  const deptInfo = MIT_DEPARTMENT_REGISTRY[deptCode];
  if (!deptInfo) {
    const validCodesList = Object.keys(MIT_DEPARTMENT_REGISTRY).join(', ');
    return {
      isValid: false,
      isComplete: true,
      normalizedUsn,
      extractedDeptCode: deptCode,
      errorCode: 'UNKNOWN_DEPARTMENT_CODE',
      errorMessage: `Unknown department code "${deptCode}" in USN. Valid MIT Mysore department codes are: ${validCodesList}.`
    };
  }

  const isTemporaryLateralOrNew = collegePrefix === 'T-MIT';
  const isLateralEntrySeries = serialNum >= 400 && serialNum < 500;

  return {
    isValid: true,
    isComplete: true,
    normalizedUsn,
    formatType: isTemporaryLateralOrNew ? 'FORMAT_2_TEMP_MIT' : 'FORMAT_1_COLLEGE_USN',
    isTemporaryUsn: isTemporaryLateralOrNew,
    isLateralEntry: isTemporaryLateralOrNew || isLateralEntrySeries,
    collegePrefix,
    admissionYear: `20${admissionYearTwoDigit}`,
    admissionYearShort: admissionYearTwoDigit,
    departmentCode: deptInfo.code,
    departmentShortName: deptInfo.shortName,
    departmentFullName: deptInfo.fullName,
    educationLevel: deptInfo.educationLevel,
    course: deptInfo.course,
    studentNumber: studentSerial,
    errorCode: null,
    errorMessage: null
  };
}

/**
 * Validates that a student's selected department matches their USN's detected department
 */
export function verifyUsnDepartmentMatch(rawUsn, selectedDepartmentValue) {
  const parsed = parseAndValidateMitUsn(rawUsn);
  if (!parsed.isValid) {
    return {
      isValid: false,
      isMismatch: false,
      parsed,
      errorMessage: parsed.errorMessage
    };
  }

  const cleanSelected = String(selectedDepartmentValue || '').trim();
  const cleanNorm = cleanSelected.toUpperCase().replace(/[\s-–()]/g, '');
  const deptCodeNorm = parsed.departmentCode.toUpperCase();
  const shortNameNorm = parsed.departmentShortName.toUpperCase().replace(/[\s-–()]/g, '');
  const fullNameNorm = parsed.departmentFullName.toUpperCase().replace(/[\s-–()]/g, '');

  const matchesCode = cleanNorm === deptCodeNorm;
  const matchesShort = cleanNorm === shortNameNorm;
  const matchesFull = cleanNorm === fullNameNorm;

  if (!cleanSelected || (!matchesCode && !matchesShort && !matchesFull)) {
    return {
      isValid: false,
      isMismatch: true,
      parsed,
      errorMessage: `Your USN belongs to ${parsed.departmentFullName}. Please select the correct department.`
    };
  }

  return {
    isValid: true,
    isMismatch: false,
    parsed,
    errorMessage: null
  };
}

export const DEPARTMENT_DROPDOWN_OPTIONS = Object.values(MIT_DEPARTMENT_REGISTRY);

export default {
  MIT_DEPARTMENT_REGISTRY,
  DEPARTMENT_DROPDOWN_OPTIONS,
  parseAndValidateMitUsn,
  verifyUsnDepartmentMatch
};


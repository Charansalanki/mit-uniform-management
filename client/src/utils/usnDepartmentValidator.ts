/**
 * MIT MYSORE OFFICIAL USN DEPARTMENT MAPPING & VALIDATION ENGINE (Frontend Client TypeScript)
 * Configurable registry of all 13 official MIT Mysore Department Codes
 */

export interface MitDepartmentDetail {
  code: string;
  shortName: string;
  fullName: string;
  educationLevel: 'UG' | 'PG';
  course: string;
}

export const MIT_DEPARTMENT_REGISTRY: Record<string, MitDepartmentDetail> = {
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

export const MIT_STRUCTURAL_USN_REGEX = /^(4MH|T-MIT)(\d{2})([A-Z]{2})(\d{3})$/;

export interface ParsedMitUsnResult {
  isValid: boolean;
  isComplete: boolean;
  normalizedUsn: string;
  formatType?: 'FORMAT_1_COLLEGE_USN' | 'FORMAT_2_TEMP_MIT';
  isTemporaryUsn?: boolean;
  isLateralEntry?: boolean;
  collegePrefix?: string;
  admissionYear?: string;
  admissionYearShort?: string;
  departmentCode?: string;
  departmentShortName?: string;
  departmentFullName?: string;
  educationLevel?: 'UG' | 'PG';
  course?: string;
  studentNumber?: string;
  extractedDeptCode?: string;
  errorCode: string | null;
  errorMessage: string | null;
}

export function parseAndValidateMitUsn(rawUsn: string): ParsedMitUsnResult {
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

export interface UsnDepartmentMatchResult {
  isValid: boolean;
  isMismatch: boolean;
  parsed: ParsedMitUsnResult;
  errorMessage: string | null;
}

export function verifyUsnDepartmentMatch(
  rawUsn: string,
  selectedDepartmentValue: string
): UsnDepartmentMatchResult {
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
  const deptCodeNorm = (parsed.departmentCode || '').toUpperCase();
  const shortNameNorm = (parsed.departmentShortName || '').toUpperCase().replace(/[\s-–()]/g, '');
  const fullNameNorm = (parsed.departmentFullName || '').toUpperCase().replace(/[\s-–()]/g, '');

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

export const DEPARTMENT_DROPDOWN_OPTIONS: MitDepartmentDetail[] = Object.values(MIT_DEPARTMENT_REGISTRY);

export default {
  MIT_DEPARTMENT_REGISTRY,
  DEPARTMENT_DROPDOWN_OPTIONS,
  parseAndValidateMitUsn,
  verifyUsnDepartmentMatch
};


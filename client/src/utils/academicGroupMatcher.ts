/**
 * SINGLE SOURCE OF TRUTH FOR ACADEMIC GROUP NORMALIZATION & MATCHING (FRONTEND)
 * Used identically across Admin Panel, Student Portal, and Vendor Portal.
 */

export const CANONICAL_DEPARTMENTS: Record<string, string> = {
  // CSE
  CS: 'CSE',
  CSE: 'CSE',
  'COMPUTER SCIENCE': 'CSE',
  'COMPUTER SCIENCE & ENGINEERING': 'CSE',
  'COMPUTER SCIENCE AND ENGINEERING': 'CSE',
  // CSE - AI
  CA: 'CSE-AI',
  'CSE-AI': 'CSE-AI',
  'COMPUTER SCIENCE & ENGINEERING – AI': 'CSE-AI',
  'COMPUTER SCIENCE & ENGINEERING - AI': 'CSE-AI',
  // CSE - AIML
  CI: 'CSE-AIML',
  AIML: 'CSE-AIML',
  'AI & ML': 'CSE-AIML',
  'CSE-AIML': 'CSE-AIML',
  'COMPUTER SCIENCE & ENGINEERING – AIML': 'CSE-AIML',
  'COMPUTER SCIENCE & ENGINEERING - AIML': 'CSE-AIML',
  // CSE - CE
  CE: 'CSE-CE',
  'CSE-CE': 'CSE-CE',
  'COMPUTER SCIENCE & ENGINEERING – CE': 'CSE-CE',
  'COMPUTER SCIENCE & ENGINEERING - CE': 'CSE-CE',
  // CSE - DS
  CD: 'CSE-DS',
  'CSE-DS': 'CSE-DS',
  'DATA SCIENCE': 'CSE-DS',
  'CSE (DATA SCIENCE)': 'CSE-DS',
  'COMPUTER SCIENCE & ENGINEERING (DATA SCIENCE)': 'CSE-DS',
  'COMPUTER SCIENCE & ENGINEERING – DS': 'CSE-DS',
  'COMPUTER SCIENCE & ENGINEERING - DS': 'CSE-DS',
  // CSE - IoT
  IC: 'CSE-IOT',
  'CSE-IOT': 'CSE-IOT',
  'COMPUTER SCIENCE & ENGINEERING – IOT': 'CSE-IOT',
  'COMPUTER SCIENCE & ENGINEERING - IOT': 'CSE-IOT',
  // CSE - BS
  CB: 'CSBS',
  CSBS: 'CSBS',
  'CS&BS': 'CSBS',
  'COMPUTER SCIENCE & ENGINEERING – BS': 'CSBS',
  'COMPUTER SCIENCE & ENGINEERING - BS': 'CSBS',
  // ISE
  IS: 'ISE',
  ISE: 'ISE',
  'INFORMATION SCIENCE': 'ISE',
  'INFORMATION SCIENCE & ENGINEERING': 'ISE',
  'INFORMATION SCIENCE AND ENGINEERING': 'ISE',
  // ECE
  EC: 'ECE',
  ECE: 'ECE',
  'ELECTRONICS & COMMUNICATION': 'ECE',
  'ELECTRONICS & COMMUNICATION ENGINEERING': 'ECE',
  'ELECTRONICS AND COMMUNICATION ENGINEERING': 'ECE',
  // EEE
  EE: 'EEE',
  EEE: 'EEE',
  'ELECTRICAL & ELECTRONICS ENGINEERING': 'EEE',
  // MECH
  ME: 'MECH',
  MECH: 'MECH',
  MECHANICAL: 'MECH',
  'MECHANICAL ENGINEERING': 'MECH',
  // CIVIL
  CV: 'CIVIL',
  CIVIL: 'CIVIL',
  'CIVIL ENGINEERING': 'CIVIL',
  // PG
  BA: 'MBA',
  MBA: 'MBA',
  'MBA - MASTER OF BUSINESS ADMINISTRATION': 'MBA',
  'MBA – MASTER OF BUSINESS ADMINISTRATION': 'MBA',
  'MASTER OF BUSINESS ADMINISTRATION': 'MBA',
  MC: 'MCA',
  MCA: 'MCA',
  'MCA - MASTER OF COMPUTER APPLICATIONS': 'MCA',
  'MCA – MASTER OF COMPUTER APPLICATIONS': 'MCA',
  'MASTER OF COMPUTER APPLICATIONS': 'MCA',
  MTECH: 'M.TECH.',
  'M.TECH': 'M.TECH.',
  'M.TECH.': 'M.TECH.'
};

export function normalizeDepartment(rawDept?: string): string {
  if (!rawDept) return '';
  const cleaned = String(rawDept)
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\([A-Z0-9-]+\)$/i, '')
    .trim();

  if (CANONICAL_DEPARTMENTS[cleaned]) {
    return CANONICAL_DEPARTMENTS[cleaned];
  }

  // Robust fuzzy matching for long names with en-dashes / hyphens
  if (cleaned.includes('MBA') || cleaned.includes('BUSINESS ADMINISTRATION')) {
    return 'MBA';
  }
  if (cleaned.includes('MCA') || cleaned.includes('COMPUTER APPLICATIONS')) {
    return 'MCA';
  }
  if (cleaned.includes('AIML') || (cleaned.includes('ARTIFICIAL') && cleaned.includes('MACHINE'))) {
    return 'CSE-AIML';
  }
  if (cleaned.includes('DATA SCIENCE') || cleaned.includes('DS')) {
    return 'CSE-DS';
  }
  if (cleaned.includes('CYBER') || cleaned.includes('SECURITY')) {
    return 'CSE-CE';
  }
  if (cleaned.includes('BUSINESS SYSTEMS') || cleaned.includes('CSBS')) {
    return 'CSBS';
  }
  if (cleaned.includes('IOT') || cleaned.includes('INTERNET OF THINGS')) {
    return 'CSE-IOT';
  }
  if (cleaned.includes('COMPUTER SCIENCE')) {
    return 'CSE';
  }
  if (cleaned.includes('INFORMATION SCIENCE')) {
    return 'ISE';
  }
  if (cleaned.includes('ELECTRONICS & COMMUNICATION') || cleaned.includes('ELECTRONICS AND COMMUNICATION')) {
    return 'ECE';
  }
  if (cleaned.includes('ELECTRICAL')) {
    return 'EEE';
  }
  if (cleaned.includes('MECHANICAL')) {
    return 'MECH';
  }
  if (cleaned.includes('CIVIL')) {
    return 'CIVIL';
  }

  return cleaned;
}

export function normalizeCourse(rawCourse?: string, canonicalDept = ''): string {
  if (!rawCourse) {
    if (canonicalDept === 'MBA') return 'MBA';
    if (canonicalDept === 'MCA') return 'MCA';
    return 'B.E.';
  }
  const cleaned = String(rawCourse).toUpperCase().replace(/\s+/g, '').trim();
  if (cleaned === 'BE' || cleaned === 'B.E' || cleaned === 'B.E.') return 'B.E.';
  if (cleaned === 'BTECH' || cleaned === 'B.TECH' || cleaned === 'B.TECH.') return 'B.TECH.';
  if (cleaned === 'MTECH' || cleaned === 'M.TECH' || cleaned === 'M.TECH.') return 'M.TECH.';
  if (cleaned === 'MBA') return 'MBA';
  if (cleaned === 'MCA') return 'MCA';
  return cleaned;
}

export function normalizeEducationLevel(rawLevel?: string, canonicalCourse = 'B.E.'): string {
  if (['MCA', 'MBA', 'M.TECH.'].includes(canonicalCourse)) return 'PG';
  if (!rawLevel) return 'UG';
  const cleaned = String(rawLevel).toUpperCase().trim();
  if (cleaned.startsWith('PG') || cleaned.includes('POST')) return 'PG';
  return 'UG';
}

export function normalizeAcademicYear(rawYear?: string | number, rawSem: any = null): string {
  // If year is missing but semester is provided, derive directly from semester
  if (!rawYear && rawSem) {
    const semNum = parseInt(String(rawSem).replace(/[^0-9]/g, ''), 10);
    if (semNum >= 1 && semNum <= 2) return '1st Year';
    if (semNum >= 3 && semNum <= 4) return '2nd Year';
    if (semNum >= 5 && semNum <= 6) return '3rd Year';
    if (semNum >= 7 && semNum <= 8) return '4th Year';
  }
  if (!rawYear) return '1st Year';

  const cleaned = String(rawYear).toUpperCase().trim();

  // 1. If year is passed as a calendar academic cycle (e.g. "2026-27", "2026-2027", "2026"), derive from semester
  if (/20\d{2}/.test(cleaned)) {
    if (rawSem) {
      const semNum = parseInt(String(rawSem).replace(/[^0-9]/g, ''), 10);
      if (semNum >= 1 && semNum <= 2) return '1st Year';
      if (semNum >= 3 && semNum <= 4) return '2nd Year';
      if (semNum >= 5 && semNum <= 6) return '3rd Year';
      if (semNum >= 7 && semNum <= 8) return '4th Year';
    }
    return '1st Year';
  }

  // 2. Exact word or ordinal match
  if (
    cleaned.includes('1ST') ||
    cleaned.startsWith('FIRST') ||
    cleaned === 'I' ||
    cleaned === 'YEAR 1' ||
    /\b1ST\b/.test(cleaned) ||
    /\b1\b/.test(cleaned)
  ) {
    return '1st Year';
  }

  if (
    cleaned.includes('2ND') ||
    cleaned.startsWith('SECOND') ||
    cleaned === 'II' ||
    cleaned === 'YEAR 2' ||
    /\b2ND\b/.test(cleaned) ||
    /\b2\b/.test(cleaned)
  ) {
    return '2nd Year';
  }

  if (
    cleaned.includes('3RD') ||
    cleaned.startsWith('THIRD') ||
    cleaned === 'III' ||
    cleaned === 'YEAR 3' ||
    /\b3RD\b/.test(cleaned) ||
    /\b3\b/.test(cleaned)
  ) {
    return '3rd Year';
  }

  if (
    cleaned.includes('4TH') ||
    cleaned.startsWith('FOURTH') ||
    cleaned === 'IV' ||
    cleaned === 'YEAR 4' ||
    /\b4TH\b/.test(cleaned) ||
    /\b4\b/.test(cleaned)
  ) {
    return '4th Year';
  }

  // 3. Fallback to semester if available
  if (rawSem) {
    const semNum = parseInt(String(rawSem).replace(/[^0-9]/g, ''), 10);
    if (semNum >= 1 && semNum <= 2) return '1st Year';
    if (semNum >= 3 && semNum <= 4) return '2nd Year';
    if (semNum >= 5 && semNum <= 6) return '3rd Year';
    if (semNum >= 7 && semNum <= 8) return '4th Year';
  }

  return '1st Year';
}

export function normalizeSemester(rawSem?: string | number): string {
  if (!rawSem) return 'ALL';
  const cleaned = String(rawSem).toUpperCase().trim();
  if (cleaned === 'ALL' || cleaned.includes('ENTIRE') || cleaned.includes('YEAR')) return 'ALL';
  const match = cleaned.match(/([1-8])/);
  if (match) {
    const num = match[1];
    const suffix = num === '1' ? 'st' : num === '2' ? 'nd' : num === '3' ? 'rd' : 'th';
    return `${num}${suffix} Sem`;
  }
  return 'ALL';
}

export function normalizeSection(rawSection?: string): string {
  if (!rawSection) return '';
  const cleaned = String(rawSection)
    .replace(/^sec(tion)?\s*[-:]?\s*/i, '')
    .toUpperCase()
    .trim();
  if (cleaned === 'ALL' || cleaned === '*' || cleaned === 'ALL SECTIONS') return 'ALL';
  return cleaned;
}

export function normalizeGender(rawGender?: string, allowWildcard = true): string {
  if (!rawGender) return allowWildcard ? 'ALL' : '';
  const cleaned = String(rawGender).toUpperCase().trim();
  if (['ALL', 'BOTH', 'UNISEX', 'ANY'].includes(cleaned)) return 'ALL';
  if (['M', 'MALE', 'BOY', 'BOYS', 'GENTS', 'MEN'].includes(cleaned)) return 'BOYS';
  if (['F', 'FEMALE', 'GIRL', 'GIRLS', 'LADIES', 'WOMEN'].includes(cleaned)) return 'GIRLS';
  return allowWildcard ? 'ALL' : '';
}

export interface AcademicGroupInput {
  educationLevel?: string;
  course?: string;
  department?: string;
  departmentShortName?: string;
  departmentCode?: string;
  academicYear?: string | number;
  year?: string | number;
  yearSemester?: string | number;
  semester?: string | number;
  section?: string;
  gender?: string;
  uniformCategory?: string;
  academicPeriod?: string;
}

export interface NormalizedAcademicGroup {
  educationLevel: string;
  course: string;
  department: string;
  academicYear: string;
  semester: string;
  section: string;
  gender: string;
  uniformCategory: string;
  academicPeriod: string;
  allocationKey: string;
}

export function normalizeAcademicGroupInput(
  input: AcademicGroupInput = {},
  { isStudent = false }: { isStudent?: boolean } = {}
): NormalizedAcademicGroup {
  const department = normalizeDepartment(input.department || input.departmentShortName || input.departmentCode);
  const course = normalizeCourse(input.course, department);
  const educationLevel = normalizeEducationLevel(input.educationLevel, course);
  const academicYear = normalizeAcademicYear(input.academicYear || input.year || input.yearSemester, input.semester);
  const semester = normalizeSemester(input.semester);
  const section = normalizeSection(input.section);
  const gender = normalizeGender(input.gender, !isStudent);
  const uniformCategory = String(input.uniformCategory || 'STANDARD').toUpperCase().trim();
  const academicPeriod = String(input.academicPeriod || '2026-2027').trim();

  const allocationKey = [
    educationLevel,
    course,
    department,
    academicYear,
    semester,
    section,
    gender || 'ALL',
    uniformCategory,
    academicPeriod
  ].join('__');

  return {
    educationLevel,
    course,
    department,
    academicYear,
    semester,
    section,
    gender,
    uniformCategory,
    academicPeriod,
    allocationKey
  };
}

export function pickMostSpecificAllocation<T extends { section?: string; gender?: string; semester?: string }>(
  allocations: T[] = [],
  normalizedStudent: { section: string; gender: string; semester: string }
): T | null {
  if (!allocations || allocations.length === 0) return null;

  const scored = allocations.map((alloc) => {
    let score = 0;
    const allocSec = normalizeSection(alloc.section);
    const allocGnd = normalizeGender(alloc.gender);
    const allocSem = normalizeSemester(alloc.semester);

    if (allocSec === normalizedStudent.section && allocSec !== 'ALL') score += 4;
    if (allocGnd === normalizedStudent.gender && allocGnd !== 'ALL') score += 4;
    if (allocSem === normalizedStudent.semester && allocSem !== 'ALL') score += 2;
    return { alloc, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].alloc;
}

export default {
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
};


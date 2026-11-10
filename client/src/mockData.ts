import { StudentRegistration, DistributionSchedule, DepartmentInfo, SemesterInfo } from './types';

export const ALL_SECTIONS: string[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

export const SEMESTERS: SemesterInfo[] = [
  { number: 1, label: '1st Year', year: '1st Year', cycle: '1 Year' },
  { number: 2, label: '2nd Year', year: '2nd Year', cycle: '2 Year' },
  { number: 3, label: '3rd Year', year: '3rd Year', cycle: '3 Year' },
  { number: 4, label: '4th Year', year: '4th Year', cycle: '4 Year' },
];

export const SEMESTER_NUMBERS: number[] = [1, 2, 3, 4];

/**
 * Helper to display academic year cleanly across all views
 * e.g. 1 -> "1st Year", 2 -> "2nd Year", 3 -> "3rd Year", 4 -> "4th Year"
 */
export function formatAcademicYear(sem: number | string | undefined | null): string {
  const n = Number(sem);
  if (n === 1) return '1st Year';
  if (n === 2) return '2nd Year';
  if (n === 3) return '3rd Year';
  if (n === 4) return '4th Year';
  if (n > 4) return `Year ${n}`;
  return '–';
}

export const DEPARTMENTS: DepartmentInfo[] = [
  // Undergraduate Engineering (B.E. Branches)
  {
    code: 'CSE',
    name: 'Computer Science & Engineering',
    category: 'Undergraduate (B.E.)',
    hodName: 'Dr. Ramesh K.',
    sections: ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  },
  {
    code: 'CSE (AI)',
    name: 'Artificial Intelligence',
    category: 'Undergraduate (B.E.)',
    hodName: 'Dr. Anand Kumar',
    sections: ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  },
  {
    code: 'CSE (AIML)',
    name: 'Artificial Intelligence & Machine Learning',
    category: 'Undergraduate (B.E.)',
    hodName: 'Dr. Shwetha N.',
    sections: ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  },
  {
    code: 'CSE (Data Science)',
    name: 'Data Science',
    category: 'Undergraduate (B.E.)',
    hodName: 'Dr. Keshava Murthy',
    sections: ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  },
  {
    code: 'CSE (IoT & Cyber Security)',
    name: 'IoT & Cyber Security including Blockchain',
    category: 'Undergraduate (B.E.)',
    hodName: 'Dr. Srinivas Rao',
    sections: ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  },
  {
    code: 'CSBS',
    name: 'Computer Science & Business Systems',
    category: 'Undergraduate (B.E.)',
    hodName: 'Dr. Deepa S.',
    sections: ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  },
  {
    code: 'CE',
    name: 'Computer Engineering',
    category: 'Undergraduate (B.E.)',
    hodName: 'Dr. Venkatesh P.',
    sections: ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  },
  {
    code: 'ISE',
    name: 'Information Science & Engineering',
    category: 'Undergraduate (B.E.)',
    hodName: 'Dr. Shobha M.',
    sections: ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  },
  {
    code: 'ECE',
    name: 'Electronics & Communication Engineering',
    category: 'Undergraduate (B.E.)',
    hodName: 'Dr. Suresh Babu',
    sections: ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  },
  {
    code: 'CV',
    name: 'Civil Engineering',
    category: 'Undergraduate (B.E.)',
    hodName: 'Dr. Manjunath R.',
    sections: ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  },
  {
    code: 'ME',
    name: 'Mechanical Engineering',
    category: 'Undergraduate (B.E.)',
    hodName: 'Dr. Chandrashekar P.',
    sections: ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  },

  // Postgraduate Programs
  {
    code: 'MCA',
    name: 'Master of Computer Applications',
    category: 'Postgraduate',
    hodName: 'Dr. Rashmi H.',
    sections: ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  },
  {
    code: 'MBA',
    name: 'Master of Business Administration',
    category: 'Postgraduate',
    hodName: 'Dr. Madhusudhan B.',
    sections: ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  },
  {
    code: 'M.Tech (CSE)',
    name: 'M.Tech (Computer Science & Engineering)',
    category: 'Postgraduate',
    hodName: 'Dr. Ramesh K.',
    sections: ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  },
  {
    code: 'M.Tech (Civil)',
    name: 'M.Tech (Civil Engineering)',
    category: 'Postgraduate',
    hodName: 'Dr. Manjunath R.',
    sections: ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  },
  {
    code: 'M.Tech (Thermal Power)',
    name: 'M.Tech (Thermal Power Engineering)',
    category: 'Postgraduate',
    hodName: 'Dr. Chandrashekar P.',
    sections: ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  },
  {
    code: 'M.Tech (LSP/Signal Processing)',
    name: 'M.Tech (LSP / Signal Processing)',
    category: 'Postgraduate',
    hodName: 'Dr. Suresh Babu',
    sections: ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  },
  {
    code: 'M.Tech (Electronics)',
    name: 'M.Tech (Electronics)',
    category: 'Postgraduate',
    hodName: 'Dr. Suresh Babu',
    sections: ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  },
  {
    code: 'M.Tech',
    name: 'M.Tech (CSE, Civil, Thermal Power, LSP/Signal Processing, Electronics)',
    category: 'Postgraduate',
    hodName: 'Dr. PG Coordinator',
    sections: ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  },
];

// Production empty datasets
export const INITIAL_REGISTRATIONS: StudentRegistration[] = [];
export const INITIAL_SCHEDULES: DistributionSchedule[] = [];

/**
 * Utility to extract calendar year and academic year span from campaign title
 * e.g. "Uniform Distribution 2027" -> { currentYear: '2027', academicYear: '2027–28' }
 */
export function parseCampaignYears(campaignName?: string, explicitAcademicYear?: string) {
  const match = (campaignName || '').match(/\b(20\d\d)\b/);
  const currentYear = match ? match[1] : (explicitAcademicYear ? explicitAcademicYear.slice(0, 4) : '2027');
  const nextYearShort = String(Number(currentYear) + 1).slice(-2);
  const academicYear = explicitAcademicYear ? explicitAcademicYear.replace('-', '–') : `${currentYear}–${nextYearShort}`;
  return { currentYear, academicYear };
}


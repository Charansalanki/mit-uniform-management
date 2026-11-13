/**
 * Detects whether a student SQLite row or USN string is 'UG' or 'PG'.
 */
function resolveProgramCategory(rowOrUsn = '') {
  if (rowOrUsn && typeof rowOrUsn === 'object') {
    const explicit = (
      rowOrUsn.category ||
      rowOrUsn.program_type ||
      rowOrUsn.programType ||
      rowOrUsn.course_type ||
      rowOrUsn.degree ||
      ''
    )
      .toString()
      .trim()
      .toUpperCase();

    if (['UG', 'B.E', 'BE', 'B.TECH', 'BTECH'].includes(explicit)) {
      return 'UG';
    }
    if (['PG', 'MCA', 'MBA', 'M.TECH', 'MTECH'].includes(explicit)) {
      return 'PG';
    }
  }

  const usn = (typeof rowOrUsn === 'string' ? rowOrUsn : rowOrUsn?.usn || '')
    .trim()
    .toUpperCase();

  // MIT Mysore / VTU PG branch codes (MCA, MBA, M.Tech specializations)
  const pgRegex = /^[0-9][A-Z]{2}[0-9]{2}(MC|MB|BA|SCS|SCN|LVS|MDE|MSE|MTH|PG)/i;
  if (pgRegex.test(usn)) {
    return 'PG';
  }

  return 'UG';
}

/**
 * Filters an array of SQLite USN rows or checks a single SQLite USN row against current UG/PG status.
 */
function isStudentRecordAllowed(rowOrUsn, ugOpen, pgOpen) {
  if (!ugOpen && !pgOpen) return false;
  if (ugOpen && pgOpen) return true;

  const category = resolveProgramCategory(rowOrUsn);
  if (category === 'UG') return Boolean(ugOpen);
  if (category === 'PG') return Boolean(pgOpen);
  return false;
}

module.exports = {
  resolveProgramCategory,
  isStudentRecordAllowed,
};

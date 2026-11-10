import React, { useState, useEffect } from 'react';
import {
  DEPARTMENT_DROPDOWN_OPTIONS,
  parseAndValidateMitUsn,
  verifyUsnDepartmentMatch,
  ParsedMitUsnResult
} from '../../utils/usnDepartmentValidator';

export interface UsnDetectedPayload {
  usn: string;
  department: string;
  departmentCode?: string;
  departmentShortName?: string;
  course?: string;
  educationLevel?: 'UG' | 'PG';
  admissionYear?: string;
  isTemporaryUsn?: boolean;
  isValid: boolean;
}

interface Props {
  usnValue: string;
  departmentValue: string;
  onUsnAndDepartmentChange?: (detected: UsnDetectedPayload) => void;
  disabled?: boolean;
  errorMessage?: string;
}

export default function UsnDepartmentAutoSelector({
  usnValue,
  departmentValue,
  onUsnAndDepartmentChange,
  disabled = false,
  errorMessage = ''
}: Props) {
  const [usnInput, setUsnInput] = useState(usnValue || '');
  const [selectedDept, setSelectedDept] = useState(departmentValue || '');
  const [parsedUsn, setParsedUsn] = useState<ParsedMitUsnResult>(() => parseAndValidateMitUsn(usnValue || ''));
  const [mismatchWarning, setMismatchWarning] = useState('');
  const [touched, setTouched] = useState(false);

  // Sync when prop value changes from outside (e.g. Draft restoration)
  useEffect(() => {
    if (usnValue && usnValue !== usnInput) {
      setUsnInput(usnValue);
    }
  }, [usnValue]);

  // Automatically re-detect department whenever USN input changes
  useEffect(() => {
    const result = parseAndValidateMitUsn(usnInput);
    setParsedUsn(result);

    if (result.isValid && result.departmentFullName) {
      // Automatically select the matching department
      setSelectedDept(result.departmentFullName);
      setMismatchWarning('');

      onUsnAndDepartmentChange?.({
        usn: result.normalizedUsn,
        department: result.departmentFullName,
        departmentCode: result.departmentCode,
        departmentShortName: result.departmentShortName,
        course: result.course,
        educationLevel: result.educationLevel,
        admissionYear: result.admissionYear,
        isTemporaryUsn: result.isTemporaryUsn,
        isValid: true
      });
    } else {
      // Clear auto-assigned department if USN is incomplete or unrecognized
      setSelectedDept('');
      setMismatchWarning('');

      onUsnAndDepartmentChange?.({
        usn: result.normalizedUsn || usnInput,
        department: '',
        departmentCode: '',
        departmentShortName: '',
        isValid: false
      });
    }
  }, [usnInput]);

  // Handle any attempt by the student to manually change the Department dropdown
  const handleDepartmentChangeAttempt = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const attemptedValue = e.target.value;

    if (!parsedUsn.isValid || !parsedUsn.departmentFullName) {
      setTouched(true);
      return;
    }

    const check = verifyUsnDepartmentMatch(usnInput, attemptedValue);
    if (!check.isValid && check.isMismatch) {
      // Show the exact required mismatch message and keep the correct department locked
      setMismatchWarning(
        `Your USN belongs to ${parsedUsn.departmentFullName}. Please select the correct department.`
      );
      setSelectedDept(parsedUsn.departmentFullName);
      return;
    }

    setMismatchWarning('');
    setSelectedDept(parsedUsn.departmentFullName);
  };

  // Calculate whether USN is wrong or unmatched
  const trimmed = usnInput.trim();

  // 1. Prefix is wrong if user typed at least 3 characters and it doesn't match '4MH' or 'T-MIT'
  const isPrefixWrong = Boolean(
    touched &&
    trimmed.length >= 3 &&
    !trimmed.startsWith('4MH') &&
    !'4MH'.startsWith(trimmed) &&
    !trimmed.startsWith('T-MIT') &&
    !'T-MIT'.startsWith(trimmed)
  );

  // 2. Department code is unknown (e.g. 4MH24ZZ001)
  const isUnknownDept = Boolean(touched && trimmed && parsedUsn.errorCode === 'UNKNOWN_DEPARTMENT_CODE');

  // 3. User finished typing full USN (or blurred input) and format is wrong
  const isFormatWrong = Boolean(
    touched &&
    trimmed &&
    trimmed.length >= (trimmed.startsWith('T-MIT') ? 12 : 10) &&
    !parsedUsn.isValid
  );

  const isUsnWrong = isPrefixWrong || isUnknownDept || isFormatWrong;

  // Active error to display (ONLY show if USN is actually wrong or unmatched)
  let activeError: string | null = null;
  if (mismatchWarning) {
    activeError = mismatchWarning;
  } else if (trimmed && isUsnWrong) {
    // Only show validator error if it's not the generic empty placeholder message
    const msg = parsedUsn.errorMessage;
    if (msg && !msg.includes('Please enter your College USN') && msg !== 'USN / Student ID is required.') {
      activeError = msg;
    }
  } else if (
    trimmed &&
    errorMessage &&
    errorMessage !== 'USN / Student ID is required.' &&
    !errorMessage.includes('Please enter your College USN')
  ) {
    activeError = errorMessage;
  } else if (!trimmed && touched && errorMessage && errorMessage !== 'Please enter your College USN (e.g., 4MH24CS001) or Temporary MIT USN (e.g., T-MIT26CS412).') {
    activeError = 'USN / Student ID is required';
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ marginBottom: '1rem' }}>
      {/* 1. USN / Student ID Input Field */}
      <div>
        <label
          htmlFor="sp-usn-auto"
          className="block text-xs font-bold text-slate-700 mb-1"
          style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}
        >
          USN / Student ID <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <input
          id="sp-usn-auto"
          type="text"
          required
          disabled={disabled}
          value={usnInput}
          onBlur={() => {
            if (usnInput.trim()) setTouched(true);
          }}
          onChange={(e) => {
            const val = e.target.value.toUpperCase();
            setUsnInput(val);
            if (!val.trim()) {
              setTouched(false);
            } else if (val.length >= 3) {
              setTouched(true);
            }
          }}
          placeholder="e.g. 4MH24CS001 or T-MIT26CS412"
          maxLength={14}
          autoComplete="off"
          autoCapitalize="characters"
          className={`w-full px-3.5 py-2.5 text-sm font-mono uppercase rounded-lg border focus:outline-none focus:ring-2 transition ${
            parsedUsn.isValid
              ? 'border-emerald-500 bg-emerald-50/20 focus:ring-emerald-500 text-slate-900 font-bold'
              : activeError
              ? 'border-red-400 bg-red-50/30 focus:ring-red-500 text-red-900'
              : 'border-slate-300 bg-white focus:ring-blue-600 text-slate-900'
          }`}
          style={{
            width: '100%',
            padding: '10px 14px',
            fontSize: '13px',
            fontFamily: 'monospace',
            borderRadius: '8px',
            border: parsedUsn.isValid
              ? '1.5px solid #10b981'
              : activeError
              ? '1.5px solid #ef4444'
              : '1.5px solid #cbd5e1',
            background: parsedUsn.isValid
              ? '#f0fdf4'
              : activeError
              ? '#fef2f2'
              : '#ffffff',
            color: '#0f172a',
            outline: 'none',
            boxSizing: 'border-box'
          }}
        />

        {/* Format helper or Invalid USN Error Message */}
        {activeError ? (
          <p
            className="mt-1.5 text-xs font-semibold text-red-600"
            style={{ fontSize: '11.5px', color: '#dc2626', fontWeight: 600, marginTop: '5px' }}
          >
            ✕ {activeError}
          </p>
        ) : (
          <p
            className="mt-1 text-[11px] text-slate-500"
            style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}
          >
            Supports Permanent USN (<span style={{ fontFamily: 'monospace' }}>4MH24CS001</span>) & Temporary Lateral/MIT ID (<span style={{ fontFamily: 'monospace' }}>T-MIT26CS412</span>).
          </p>
        )}
      </div>

      {/* 2. Automatically Detected & Locked Department Dropdown */}
      <div>
        <div
          className="flex items-center justify-between mb-1"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}
        >
          <label
            htmlFor="sp-dept-auto"
            className="block text-xs font-bold text-slate-700"
            style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}
          >
            Department (Auto-Detected from USN) <span style={{ color: '#ef4444' }}>*</span>
          </label>
          {parsedUsn.isValid && (
            <span
              className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200"
              style={{
                fontSize: '10px',
                fontWeight: 800,
                textTransform: 'uppercase',
                padding: '2px 8px',
                borderRadius: '4px',
                background: '#dbeafe',
                color: '#1e40af',
                border: '1px solid #bfdbfe'
              }}
            >
              Auto-Locked ({parsedUsn.departmentCode})
            </span>
          )}
        </div>

        <select
          id="sp-dept-auto"
          required
          disabled={disabled || !parsedUsn.isValid}
          value={selectedDept}
          onChange={handleDepartmentChangeAttempt}
          className={`w-full px-3.5 py-2.5 text-sm rounded-lg border transition ${
            parsedUsn.isValid
              ? 'bg-slate-100 border-slate-300 text-slate-900 font-bold cursor-not-allowed'
              : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
          }`}
          style={{
            width: '100%',
            padding: '10px 14px',
            fontSize: '13px',
            borderRadius: '8px',
            border: '1.5px solid #cbd5e1',
            background: parsedUsn.isValid ? '#f8fafc' : '#f1f5f9',
            color: parsedUsn.isValid ? '#0f172a' : '#94a3b8',
            fontWeight: parsedUsn.isValid ? 700 : 400,
            cursor: parsedUsn.isValid ? 'not-allowed' : 'not-allowed',
            outline: 'none',
            boxSizing: 'border-box'
          }}
        >
          <option value="">
            {parsedUsn.isValid
              ? parsedUsn.departmentFullName
              : '-- Enter a valid USN above to auto-detect department --'}
          </option>
          {DEPARTMENT_DROPDOWN_OPTIONS.map((dept) => (
            <option
              key={dept.code}
              value={dept.fullName}
              disabled={parsedUsn.isValid && dept.code !== parsedUsn.departmentCode}
            >
              {dept.fullName} ({dept.code})
            </option>
          ))}
        </select>

        {/* Display Detected Department Name Below Dropdown */}
        {parsedUsn.isValid && (
          <div
            className="mt-1.5 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex flex-wrap items-center justify-between gap-2"
            style={{
              marginTop: '6px',
              padding: '8px 12px',
              borderRadius: '8px',
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              fontSize: '11.5px',
              color: '#064e3b',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '6px'
            }}
          >
            <div>
              <span style={{ color: '#047857', fontWeight: 600 }}>Detected Department: </span>
              <strong style={{ fontWeight: 800 }}>{parsedUsn.departmentFullName}</strong>
            </div>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '4px',
                background: '#ffffff',
                border: '1px solid #6ee7b7',
                color: '#047857'
              }}
            >
              {parsedUsn.isTemporaryUsn ? 'Temporary MIT ID' : 'Permanent VTU USN'} • Batch{' '}
              {parsedUsn.admissionYear}
            </span>
          </div>
        )}

        {/* Mismatch Error Alert (If student attempts to override department) */}
        {mismatchWarning && (
          <div
            className="mt-1.5 p-2.5 rounded-lg bg-red-50 border border-red-300 text-xs font-bold text-red-800"
            style={{
              marginTop: '6px',
              padding: '8px 12px',
              borderRadius: '8px',
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              fontSize: '11.5px',
              fontWeight: 700,
              color: '#991b1b'
            }}
          >
            ⚠ {mismatchWarning}
          </div>
        )}
      </div>
    </div>
  );
}

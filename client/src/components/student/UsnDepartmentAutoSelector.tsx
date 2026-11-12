import React, { useState, useEffect, useMemo } from 'react';
import {
  DEPARTMENT_DROPDOWN_OPTIONS,
  parseAndValidateMitUsn,
  verifyUsnDepartmentMatch,
  ParsedMitUsnResult
} from '../../utils/usnDepartmentValidator';
import { useApplicationVisibility } from './StudentApplicationGate';

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
  const { ugApplicationOpen, pgApplicationOpen } = useApplicationVisibility();

  const [usnInput, setUsnInput] = useState(usnValue || '');
  const [selectedDept, setSelectedDept] = useState(departmentValue || '');
  const [parsedUsn, setParsedUsn] = useState<ParsedMitUsnResult>(() =>
    parseAndValidateMitUsn(usnValue || '')
  );
  const [categoryRestrictionError, setCategoryRestrictionError] = useState('');
  const [mismatchWarning, setMismatchWarning] = useState('');
  const [touched, setTouched] = useState(false);

  // Filter visible departments strictly by active UG / PG switch
  const visibleDepartments = useMemo(() => {
    return DEPARTMENT_DROPDOWN_OPTIONS.filter((dept) => {
      if (dept.educationLevel === 'UG') return ugApplicationOpen;
      if (dept.educationLevel === 'PG') return pgApplicationOpen;
      return false;
    });
  }, [ugApplicationOpen, pgApplicationOpen]);

  // Sync when prop value changes from outside (e.g. Draft restoration)
  useEffect(() => {
    if (usnValue && usnValue !== usnInput) {
      setUsnInput(usnValue);
    }
  }, [usnValue]);

  // If an admin turns OFF the category of the currently typed USN in real time, clear it immediately
  useEffect(() => {
    const result = parseAndValidateMitUsn(usnInput);

    if (result.isValid) {
      // Check if the detected USN belongs to a currently disabled category
      if (result.educationLevel === 'UG' && !ugApplicationOpen) {
        setParsedUsn({ ...result, isValid: false });
        setSelectedDept('');
        setCategoryRestrictionError(
          'Undergraduate (UG) application is currently closed. Only Postgraduate (MBA / MCA) USN registration is open.'
        );
        onUsnAndDepartmentChange?.({
          usn: result.normalizedUsn,
          department: '',
          departmentCode: '',
          departmentShortName: '',
          isValid: false
        });
        return;
      }

      if (result.educationLevel === 'PG' && !pgApplicationOpen) {
        setParsedUsn({ ...result, isValid: false });
        setSelectedDept('');
        setCategoryRestrictionError(
          'Postgraduate (PG) application is currently closed. Only Undergraduate (B.E.) USN registration is open.'
        );
        onUsnAndDepartmentChange?.({
          usn: result.normalizedUsn,
          department: '',
          departmentCode: '',
          departmentShortName: '',
          isValid: false
        });
        return;
      }

      // USN is valid AND belongs to an active (ON) category
      setParsedUsn(result);
      setCategoryRestrictionError('');
      setSelectedDept(result.departmentFullName || '');
      setMismatchWarning('');

      onUsnAndDepartmentChange?.({
        usn: result.normalizedUsn,
        department: result.departmentFullName || '',
        departmentCode: result.departmentCode,
        departmentShortName: result.departmentShortName,
        course: result.course,
        educationLevel: result.educationLevel,
        admissionYear: result.admissionYear,
        isTemporaryUsn: result.isTemporaryUsn,
        isValid: true
      });
    } else {
      setParsedUsn(result);
      setCategoryRestrictionError('');
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
  }, [usnInput, ugApplicationOpen, pgApplicationOpen]);

  const handleDepartmentChangeAttempt = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const attemptedValue = e.target.value;
    if (!parsedUsn.isValid) {
      setTouched(true);
      return;
    }

    const check = verifyUsnDepartmentMatch(usnInput, attemptedValue);
    if (!check.isValid && check.isMismatch) {
      setMismatchWarning(
        `Your USN belongs to ${parsedUsn.departmentFullName || ''}. Please select the correct department.`
      );
      setSelectedDept(parsedUsn.departmentFullName || '');
      return;
    }

    setMismatchWarning('');
    setSelectedDept(parsedUsn.departmentFullName || '');
  };

  // Dynamic placeholder and helper text based on which application is ON
  const usnPlaceholder =
    ugApplicationOpen && pgApplicationOpen
      ? 'e.g. 4MH24CS001 or 4MH26BA001'
      : ugApplicationOpen
      ? 'e.g. 4MH24CS001 or T-MIT26CS412 (UG Only)'
      : 'e.g. 4MH26BA001 or T-MIT26MC015 (PG Only)';

  const sectionLabel =
    ugApplicationOpen && pgApplicationOpen
      ? 'UG & PG USN / Student ID *'
      : ugApplicationOpen
      ? 'Undergraduate (UG) USN / Student ID *'
      : 'Postgraduate (PG) USN / Student ID *';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ marginBottom: '1rem' }}>
      {/* 1. Category-Filtered USN Registration Field */}
      <div>
        <label
          htmlFor="sp-usn-auto"
          className="block text-xs font-bold text-slate-700 mb-1"
        >
          {sectionLabel}
        </label>
        <input
          id="sp-usn-auto"
          type="text"
          required
          disabled={disabled}
          value={usnInput}
          onBlur={() => setTouched(true)}
          onChange={(e) => {
            setUsnInput(e.target.value.toUpperCase());
            if (!touched && e.target.value.length >= 3) setTouched(true);
          }}
          placeholder={usnPlaceholder}
          maxLength={14}
          autoComplete="off"
          autoCapitalize="characters"
          className={`w-full px-3.5 py-2.5 text-sm font-mono uppercase rounded-lg border focus:outline-none focus:ring-2 transition ${
            parsedUsn.isValid
              ? 'border-emerald-500 bg-emerald-50/20 focus:ring-emerald-500 text-slate-900 font-bold'
              : categoryRestrictionError || (touched && (errorMessage || !parsedUsn.isValid && usnInput))
              ? 'border-red-400 bg-red-50/30 focus:ring-red-500 text-red-900'
              : 'border-slate-300 bg-white focus:ring-blue-600 text-slate-900'
          }`}
        />

        {categoryRestrictionError ? (
          <p className="mt-1.5 text-xs font-bold text-red-600">
            ✕ {categoryRestrictionError}
          </p>
        ) : !parsedUsn.isValid && (touched || usnInput.length >= 5) ? (
          <p className="mt-1.5 text-xs font-semibold text-red-600">
            ✕ {parsedUsn.errorMessage || errorMessage}
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-slate-500">
            {ugApplicationOpen && !pgApplicationOpen && (
              <span>Undergraduate (B.E.) USN Registration Active</span>
            )}
            {!ugApplicationOpen && pgApplicationOpen && (
              <span>Postgraduate (MBA / MCA) USN Registration Active</span>
            )}
            {ugApplicationOpen && pgApplicationOpen && (
              <span>UG (B.E.) & PG (MBA / MCA) USN Registration Active</span>
            )}
          </p>
        )}
      </div>

      {/* 2. Category-Filtered Department Dropdown */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label htmlFor="sp-dept-auto" className="block text-xs font-bold text-slate-700">
            Department (Auto-Detected from USN) *
          </label>
          {parsedUsn.isValid && (
            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
              {parsedUsn.educationLevel} • {parsedUsn.departmentCode}
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
        >
          <option value="">
            {parsedUsn.isValid
              ? parsedUsn.departmentFullName
              : '-- Enter a valid USN above to auto-detect department --'}
          </option>
          {visibleDepartments.map((dept) => (
            <option
              key={dept.code}
              value={dept.fullName}
              disabled={parsedUsn.isValid && dept.code !== parsedUsn.departmentCode}
            >
              {dept.fullName} ({dept.code})
            </option>
          ))}
        </select>

        {parsedUsn.isValid && (
          <div className="mt-1.5 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-emerald-700 font-semibold">Detected: </span>
              <strong className="font-extrabold">
                {parsedUsn.departmentFullName} ({parsedUsn.course})
              </strong>
            </div>
            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-white border border-emerald-300 text-emerald-800">
              {parsedUsn.educationLevel} Batch {parsedUsn.admissionYear}
            </span>
          </div>
        )}

        {mismatchWarning && (
          <div className="mt-1.5 p-2.5 rounded-lg bg-red-50 border border-red-300 text-xs font-bold text-red-800">
            ⚠ {mismatchWarning}
          </div>
        )}
      </div>
    </div>
  );
}

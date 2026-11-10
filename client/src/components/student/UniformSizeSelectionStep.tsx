import React, { useState, useEffect, useMemo } from 'react';
import {
  getGarmentSectionsForStudent,
  SIZE_GUIDE_CHARTS,
  GarmentSection
} from '../../utils/uniformGarmentConfig';

const GARMENT_ICONS: Record<string, React.ReactNode> = {
  SHIRT: (
    <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 3l5 4-3 4-2-2v12H8V9l-2 2-3-4 5-4 2 2h4l2-2z" />
    </svg>
  ),
  TOP: (
    <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 3l4 3-2 4-2-1v12H9V9L7 10 5 6l4-3c1 1.5 5 1.5 6 0z" />
    </svg>
  ),
  PANT: (
    <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h10l1 18h-4l-2-11-2 11H6L7 3z" />
    </svg>
  ),
  COAT: (
    <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 3l5 3-2 5-2-1v11H8V10l-2 1-2-5 5-3 3 5 3-5z" />
    </svg>
  )
};

export interface GarmentSelectionItem {
  garmentId: string;
  garmentTitle: string;
  selectedSize: string;
  measurements: Record<string, string>;
}

export interface UniformSizeSelectionStepProps {
  registrationData: {
    studentName?: string;
    fullName?: string;
    usn?: string;
    course?: string;
    department?: string;
    gender?: string;
    academicYear?: string;
    semester?: string | number;
    section?: string;
    remarks?: string;
    sizingRemarks?: string;
    uniformMeasurements?: {
      layoutKey?: string;
      course?: string;
      gender?: string;
      unit?: string;
      garments?: Record<string, GarmentSelectionItem>;
      remarks?: string;
    };
    shirtSize?: string;
    trouserSize?: string;
    blazerSize?: string;
  };
  onUpdateMeasurements?: (updates: {
    shirtSize: string;
    trouserSize: string;
    blazerSize: string;
    remarks?: string;
    uniformMeasurements: {
      layoutKey: string;
      course: string;
      gender: string;
      unit: string;
      garments: Record<string, GarmentSelectionItem>;
      remarks?: string;
    };
  }) => void;
  onBack: () => void;
  onProceedToReview: () => void;
}

export default function UniformSizeSelectionStep({
  registrationData,
  onUpdateMeasurements,
  onBack,
  onProceedToReview
}: UniformSizeSelectionStepProps) {
  const layoutConfig = useMemo(
    () =>
      getGarmentSectionsForStudent(
        registrationData?.course || 'B.E.',
        registrationData?.gender || 'Male'
      ),
    [registrationData?.course, registrationData?.gender]
  );

  // Initialize or restore saved garment selections & tailor measurements
  const [garmentState, setGarmentState] = useState<Record<string, GarmentSelectionItem>>(() => {
    const existing = registrationData?.uniformMeasurements?.garments || {};
    const initial: Record<string, GarmentSelectionItem> = {};
    layoutConfig.garments.forEach((g: GarmentSection) => {
      const savedGarment = existing[g.id] || {};
      const initialFields: Record<string, string> = {};
      g.fields.forEach((f) => {
        initialFields[f.key] =
          savedGarment.measurements?.[f.key] !== undefined
            ? String(savedGarment.measurements[f.key])
            : '';
      });
      initial[g.id] = {
        garmentId: g.id,
        garmentTitle: g.title,
        selectedSize: savedGarment.selectedSize || (g.id === 'shirt' || g.id === 'top' ? (registrationData?.shirtSize || '') : g.id === 'pant' || g.id === 'bottom' ? (registrationData?.trouserSize || '') : (registrationData?.blazerSize || '')),
        measurements: initialFields
      };
    });
    return initial;
  });

  // Track which garment's "Size Guide – Click to View Measurements" panel is expanded
  const [expandedGuides, setExpandedGuides] = useState<Record<string, boolean>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [topBannerError, setTopBannerError] = useState('');

  // Remarks / custom tailoring instructions
  const [remarks, setRemarks] = useState<string>(
    registrationData?.remarks ||
    registrationData?.sizingRemarks ||
    registrationData?.uniformMeasurements?.remarks ||
    ''
  );

  // Keep parent form state & draft storage continuously synced so Back/Next never loses data
  useEffect(() => {
    const topOrShirtSize =
      garmentState.shirt?.selectedSize || garmentState.top?.selectedSize || '';
    const pantOrBottomSize =
      garmentState.pant?.selectedSize || garmentState.bottom?.selectedSize || '';
    const coatSize = garmentState.coat?.selectedSize || '';
    const cleanTrouserSize = String(pantOrBottomSize).replace(/"/g, '').trim();

    onUpdateMeasurements?.({
      shirtSize: topOrShirtSize,
      trouserSize: (cleanTrouserSize as any),
      blazerSize: coatSize,
      remarks: remarks.trim(),
      uniformMeasurements: {
        layoutKey: layoutConfig.layoutKey,
        course: layoutConfig.normalizedCourse,
        gender: layoutConfig.normalizedGender,
        unit: 'inches',
        garments: garmentState,
        remarks: remarks.trim()
      }
    });
  }, [garmentState, remarks, layoutConfig, onUpdateMeasurements]);

  // Select standard size button WITHOUT wiping out already-entered tailor measurements
  const handleSelectStandardSize = (garmentId: string, sizeValue: string) => {
    setGarmentState((prev) => ({
      ...prev,
      [garmentId]: {
        ...prev[garmentId],
        selectedSize: sizeValue
        // Notice: prev[garmentId].measurements is strictly preserved!
      }
    }));

    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[`${garmentId}_size`];
      return next;
    });
  };

  // Update individual numeric tailor measurement input
  const handleMeasurementInputChange = (garmentId: string, fieldKey: string, rawValue: string) => {
    // Allow empty string or positive decimal numbers (e.g. 38, 17.5)
    if (rawValue !== '' && !/^\d*\.?\d*$/.test(rawValue)) return;

    setGarmentState((prev) => ({
      ...prev,
      [garmentId]: {
        ...prev[garmentId],
        measurements: {
          ...prev[garmentId].measurements,
          [fieldKey]: rawValue
        }
      }
    }));

    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[`${garmentId}_${fieldKey}`];
      return next;
    });
  };

  const toggleSizeGuide = (garmentId: string) => {
    setExpandedGuides((prev) => ({
      ...prev,
      [garmentId]: !prev[garmentId]
    }));
  };

  // Validate all required standard sizes & positive numeric measurements before Review & Submit
  const handleValidateAndContinue = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    layoutConfig.garments.forEach((g: GarmentSection) => {
      const current = garmentState[g.id];
      if (!current?.selectedSize) {
        errors[`${g.id}_size`] = `Please select a standard size for ${g.title}.`;
      }

      g.fields.forEach((f) => {
        const rawVal = current?.measurements?.[f.key];
        const numVal = parseFloat(rawVal);

        if (rawVal === '' || rawVal === undefined || isNaN(numVal)) {
          errors[`${g.id}_${f.key}`] = `${f.label} measurement is required.`;
        } else if (numVal <= 0) {
          errors[`${g.id}_${f.key}`] = `${f.label} must be greater than 0 inches.`;
        } else if (numVal < f.min || numVal > f.max) {
          errors[`${g.id}_${f.key}`] = `Enter a valid ${f.label} between ${f.min}" and ${f.max}".`;
        }
      });
    });

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      setTopBannerError(
        'Please select a standard size and enter valid positive measurements (in inches) for all required garment fields below.'
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setValidationErrors({});
    setTopBannerError('');
    onProceedToReview?.();
  };

  const studentDisplayName = registrationData?.studentName || registrationData?.fullName || 'Student';

  return (
    <form onSubmit={handleValidateAndContinue} className="max-w-4xl mx-auto my-6 space-y-6">
      {/* Top Student Profile & Auto-Detected Layout Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-900 text-white px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-400">
              Step 2 of 4 • Dynamic Course & Gender Garment Configuration
            </span>
            <h2 className="text-xl font-bold mt-0.5">{layoutConfig.displayTitle}</h2>
            <p className="text-xs text-slate-300 mt-1">
              Automatically configured from your registration details • All tailor measurements in{' '}
              <strong className="text-white">inches (in)</strong>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-400/30 text-blue-300 text-xs font-bold">
              Course: {layoutConfig.normalizedCourse}
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-bold">
              Gender: {layoutConfig.normalizedGender}
            </span>
          </div>
        </div>

        {/* Read-Only Student Registration Strip (Never asks for Course or Gender again) */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-slate-500 block">Student Name</span>
            <strong className="text-slate-900">{studentDisplayName}</strong>
          </div>
          <div>
            <span className="text-slate-500 block">USN</span>
            <strong className="font-mono text-blue-700">{registrationData?.usn || '—'}</strong>
          </div>
          <div>
            <span className="text-slate-500 block">Department</span>
            <strong className="text-slate-900 truncate block">
              {registrationData?.department || '—'}
            </strong>
          </div>
          <div>
            <span className="text-slate-500 block">Year & Section</span>
            <strong className="text-slate-900">
              {registrationData?.academicYear || '2026-27'} • Section {registrationData?.section || 'A'}
            </strong>
          </div>
        </div>
      </div>

      {/* Validation Alert Banner */}
      {topBannerError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-300 text-red-900 text-xs font-bold flex items-center justify-between">
          <span>⚠ {topBannerError}</span>
          <button
            type="button"
            onClick={() => setTopBannerError('')}
            className="underline ml-3 shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Dynamic Garment Cards (2 Cards for B.E., 3 Cards for MBA/MCA) */}
      <div className="space-y-6">
        {layoutConfig.garments.map((garment: GarmentSection) => {
          const currentGarment = garmentState[garment.id] || {
            garmentId: garment.id,
            garmentTitle: garment.title,
            selectedSize: '',
            measurements: {}
          };
          const isGuideOpen = Boolean(expandedGuides[garment.id]);
          const sizeError = validationErrors[`${garment.id}_size`];
          const guideRows = SIZE_GUIDE_CHARTS[garment.guideType] || [];

          return (
            <div
              key={garment.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
            >
              {/* Card Header */}
              <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/60">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
                    {GARMENT_ICONS[garment.iconType]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold uppercase px-2 py-0.5 rounded bg-slate-900 text-white">
                        Section {garment.sectionCode}
                      </span>
                      <h3 className="text-lg font-extrabold text-slate-900">
                        {garment.title}
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{garment.subtitle}</p>
                  </div>
                </div>

                {currentGarment.selectedSize && (
                  <div className="self-start sm:self-center px-3.5 py-1.5 rounded-full bg-blue-600 text-white text-xs font-extrabold shadow-sm">
                    Selected Size: {currentGarment.selectedSize}
                  </div>
                )}
              </div>

              <div className="p-6 space-y-6">
                {/* 1. Standard Size Buttons Row */}
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      1. Select Standard {garment.title} Size *
                    </label>
                    <span className="text-[11px] text-slate-500">
                      Click a size button below
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2.5">
                    {garment.sizeOptions.map((sz) => {
                      const isSelected = currentGarment.selectedSize === sz;
                      return (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => handleSelectStandardSize(garment.id, sz)}
                          className={`min-w-[60px] px-4 py-2.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-100 shadow-sm'
                              : 'bg-white text-slate-800 border-slate-300 hover:border-blue-400 hover:bg-blue-50/40'
                          }`}
                        >
                          {sz}
                        </button>
                      );
                    })}
                  </div>

                  {sizeError && (
                    <p className="mt-2 text-xs font-bold text-red-600">✕ {sizeError}</p>
                  )}
                </div>

                {/* 2. Expandable Blue Measurement Guide Panel */}
                <div className="rounded-xl border border-blue-200 bg-blue-50/60 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleSizeGuide(garment.id)}
                    className="w-full px-4 py-3 text-left flex items-center justify-between text-xs font-bold text-blue-900 hover:bg-blue-100/60 transition cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px]">
                        i
                      </span>
                      Size Guide – Click to View Measurements ({garment.title} Reference Chart in Inches)
                    </span>
                    <span className="text-blue-700 font-extrabold">
                      {isGuideOpen ? '▲ Hide Guide' : '▼ View Guide'}
                    </span>
                  </button>

                  {isGuideOpen && (
                    <div className="p-4 bg-white border-t border-blue-200 overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-blue-50 text-blue-950 font-bold border-b border-blue-200">
                            {Object.keys(guideRows[0] || {}).map((colKey) => (
                              <th key={colKey} className="p-2.5 uppercase">
                                {colKey === 'chestOrBust' ? 'Chest / Bust' : colKey}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {guideRows.map((row) => (
                            <tr
                              key={row.size}
                              className={
                                currentGarment.selectedSize === row.size
                                  ? 'bg-blue-50/80 font-bold text-blue-900'
                                  : 'hover:bg-slate-50'
                              }
                            >
                              {Object.values(row).map((val, i) => (
                                <td key={i} className="p-2.5">
                                  {val}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 3. Individual Tailor Measurement Inputs (in inches) */}
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      2. Individual Tailor Measurements ({garment.title}) *
                    </label>
                    <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200">
                      Changing standard size buttons above preserves your custom entries below
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {garment.fields.map((field) => {
                      const val = currentGarment.measurements?.[field.key] ?? '';
                      const fieldErr = validationErrors[`${garment.id}_${field.key}`];

                      return (
                        <div key={field.key}>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            {field.label}{' '}
                            <span className="text-slate-400 font-normal">
                              ({field.min}"–{field.max}")
                            </span>{' '}
                            *
                          </label>
                          <div className="relative flex items-center">
                            <input
                              type="number"
                              step="0.25"
                              min={field.min}
                              max={field.max}
                              required
                              value={val}
                              onChange={(e) =>
                                handleMeasurementInputChange(
                                  garment.id,
                                  field.key,
                                  e.target.value
                                )
                              }
                              placeholder={field.placeholder}
                              className={`w-full pr-14 pl-3.5 py-2.5 text-sm font-bold rounded-xl border focus:outline-none focus:ring-2 transition ${
                                fieldErr
                                  ? 'border-red-400 bg-red-50/30 focus:ring-red-500 text-red-900'
                                  : val !== ''
                                  ? 'border-blue-500 bg-blue-50/10 focus:ring-blue-600 text-slate-900'
                                  : 'border-slate-300 bg-white focus:ring-blue-600 text-slate-900'
                              }`}
                            />
                            <span className="absolute right-3 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[11px] font-bold text-slate-600 pointer-events-none">
                              inches
                            </span>
                          </div>
                          {fieldErr && (
                            <p className="mt-1 text-[11px] font-semibold text-red-600">
                              {fieldErr}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. Special Tailoring Remarks & Fit Notes (Optional) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 sm:p-6 mb-6">
        <div className="flex items-start gap-3 mb-3">
          <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <label htmlFor="sizing-remarks" className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                Special Tailoring Remarks & Fit Notes <span className="text-[11px] font-normal text-slate-500 lowercase">(optional)</span>
              </label>
              <span className="text-[11px] font-semibold text-slate-400">
                {remarks.length} / 500
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Specify any custom length adjustments, looser/tighter fit preferences, or special tailor notes.
            </p>
          </div>
        </div>

        <textarea
          id="sizing-remarks"
          maxLength={500}
          rows={3}
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="e.g. Extra 2 inches length required for trousers; prefer looser fit around chest; sleeve length should be 1 inch longer; etc."
          className="w-full p-3.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 bg-slate-50/50 hover:bg-white focus:bg-white transition text-slate-900 placeholder:text-slate-400 resize-y min-h-[75px]"
        />

        <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-500">
          <span>💡</span>
          <span>Your remarks will be forwarded directly to the assigned uniform vendor and master tailor.</span>
        </div>
      </div>

      {/* Navigation Footer: Back & Review & Submit Buttons */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-extrabold border border-slate-300 transition cursor-pointer"
        >
          ← Back to Personal Information
        </button>

        <button
          type="submit"
          className="w-full sm:w-auto px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-sm transition cursor-pointer"
        >
          Review & Submit Measurements →
        </button>
      </div>
    </form>
  );
}


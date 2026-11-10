import React, { useState, useEffect, useMemo } from 'react';
import {
  getGarmentSectionsForStudent,
  SIZE_GUIDE_CHARTS
} from '../../utils/uniformGarmentConfig';

const GARMENT_ICONS = {
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

export default function UniformSizeSelectionStep({
  registrationData, // Contains { studentName, usn, course, department, gender, academicYear, section, uniformMeasurements }
  onUpdateMeasurements, // Persists live changes in parent state + localStorage draft
  onBack,
  onProceedToReview
}) {
  const layoutConfig = useMemo(
    () =>
      getGarmentSectionsForStudent(
        registrationData?.course || 'B.E.',
        registrationData?.gender || 'Male'
      ),
    [registrationData?.course, registrationData?.gender]
  );

  // Initialize or restore saved garment selections & tailor measurements
  const [garmentState, setGarmentState] = useState(() => {
    const existing = registrationData?.uniformMeasurements?.garments || {};
    const initial = {};
    layoutConfig.garments.forEach((g) => {
      const savedGarment = existing[g.id] || {};
      const initialFields = {};
      g.fields.forEach((f) => {
        initialFields[f.key] =
          savedGarment.measurements?.[f.key] !== undefined
            ? String(savedGarment.measurements[f.key])
            : '';
      });
      initial[g.id] = {
        garmentId: g.id,
        garmentTitle: g.title,
        selectedSize: savedGarment.selectedSize || '',
        measurements: initialFields
      };
    });
    return initial;
  });

  // Track which garment's "Size Guide – Click to View Measurements" panel is expanded
  const [expandedGuides, setExpandedGuides] = useState({});
  const [validationErrors, setValidationErrors] = useState({});
  const [topBannerError, setTopBannerError] = useState('');

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
      trouserSize: cleanTrouserSize,
      blazerSize: coatSize,
      uniformMeasurements: {
        layoutKey: layoutConfig.layoutKey,
        course: layoutConfig.normalizedCourse,
        gender: layoutConfig.normalizedGender,
        unit: 'inches',
        garments: garmentState
      }
    });
  }, [garmentState, layoutConfig]);

  // Select standard size button WITHOUT wiping out already-entered tailor measurements
  const handleSelectStandardSize = (garmentId, sizeValue) => {
    setGarmentState((prev) => ({
      ...prev,
      [garmentId]: {
        ...prev[garmentId],
        selectedSize: sizeValue
      }
    }));

    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[`${garmentId}_size`];
      return next;
    });
  };

  // Update individual numeric tailor measurement input
  const handleMeasurementInputChange = (garmentId, fieldKey, rawValue) => {
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

  const toggleSizeGuide = (garmentId) => {
    setExpandedGuides((prev) => ({
      ...prev,
      [garmentId]: !prev[garmentId]
    }));
  };

  // Validate all required standard sizes & positive numeric measurements before Review & Submit
  const handleValidateAndContinue = (e) => {
    e.preventDefault();
    const errors = {};

    layoutConfig.garments.forEach((g) => {
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
            <strong className="text-slate-900">{registrationData?.studentName || 'Student'}</strong>
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
              {registrationData?.academicYear} • Section {registrationData?.section}
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
            className="underline ml-3 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Dynamic Garment Cards (2 Cards for B.E., 3 Cards for MBA/MCA) */}
      <div className="space-y-6">
        {layoutConfig.garments.map((garment) => {
          const currentGarment = garmentState[garment.id] || {
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
                          className={`min-w-[60px] px-4 py-2.5 rounded-xl text-xs font-extrabold border transition-all ${
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
                    className="w-full px-4 py-3 text-left flex items-center justify-between text-xs font-bold text-blue-900 hover:bg-blue-100/60 transition"
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

      {/* Navigation Footer: Back & Review & Submit Buttons */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-extrabold border border-slate-300 transition"
        >
          ← Back to Personal Information
        </button>

        <button
          type="submit"
          className="w-full sm:w-auto px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-sm transition"
        >
          Review & Submit Measurements →
        </button>
      </div>
    </form>
  );
}


import React from 'react';

const FIELD_LABELS = {
  chest: 'Chest',
  bust: 'Bust',
  shoulder: 'Shoulder',
  sleeveLength: 'Sleeve Length',
  collar: 'Collar',
  shirtLength: 'Shirt Length',
  topLength: 'Top Length',
  waist: 'Waist',
  hip: 'Hip',
  pantLength: 'Pant Length',
  bottomLength: 'Bottom Length',
  inseam: 'Inseam',
  coatLength: 'Coat Length'
};

export default function TailorMeasurementReportModal({ studentRecord, onClose }) {
  if (!studentRecord) return null;

  let garmentsObj = {};
  if (studentRecord.uniformSelection?.garments) {
    garmentsObj = studentRecord.uniformSelection.garments;
  } else if (studentRecord.uniformMeasurements?.garments) {
    garmentsObj = studentRecord.uniformMeasurements.garments;
  } else if (studentRecord.uniform_measurements) {
    if (typeof studentRecord.uniform_measurements === 'string') {
      try {
        garmentsObj = JSON.parse(studentRecord.uniform_measurements);
      } catch {
        garmentsObj = {};
      }
    } else {
      garmentsObj = studentRecord.uniform_measurements;
    }
  }

  const garmentList = Object.values(garmentsObj);
  const studentName = studentRecord.studentName || studentRecord.fullName || 'Student';

  const handlePrintJobCard = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200 my-8">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-400">
              Official MIT Mysore Tailor Measurement Job Card
            </span>
            <h3 className="text-lg font-bold mt-0.5">
              {studentName} ({studentRecord.usn || '—'})
            </h3>
            <p className="text-xs text-slate-300">
              Application ID: <strong className="font-mono text-white">{studentRecord.applicationId || 'N/A'}</strong> • Course:{' '}
              <strong className="text-white">{studentRecord.course || 'B.E.'}</strong> • Gender:{' '}
              <strong className="text-white">{studentRecord.gender || 'Male'}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white font-bold text-base print:hidden cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Garment Measurement Cards */}
        <div className="p-6 space-y-4">
          {garmentList.length === 0 ? (
            <div className="p-4 bg-slate-50 rounded-xl border text-xs text-slate-600">
              Standard Sizes: Shirt/Top: <strong>{studentRecord.shirtSize || '—'}</strong> •
              Trouser/Bottom: <strong>{studentRecord.trouserSize || '—'}</strong>
              {studentRecord.blazerSize ? ` • Coat: ${studentRecord.blazerSize}` : ''}
            </div>
          ) : (
            garmentList.map((g) => (
              <div
                key={g.garmentId || g.garmentTitle}
                className="rounded-xl border border-slate-200 overflow-hidden"
              >
                <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <strong className="text-sm font-extrabold text-slate-900">
                    {g.garmentTitle || g.title}
                  </strong>
                  <span className="px-3 py-0.5 rounded-full bg-blue-600 text-white text-xs font-extrabold">
                    Standard Size: {g.selectedSize || '—'}
                  </span>
                </div>
                <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 bg-white text-xs">
                  {Object.entries(g.measurements || {}).map(([fKey, fVal]) => (
                    <div
                      key={fKey}
                      className="p-2.5 rounded-lg bg-slate-50 border border-slate-200"
                    >
                      <span className="text-slate-500 block">
                        {FIELD_LABELS[fKey] || fKey}
                      </span>
                      <strong className="text-sm font-extrabold text-slate-900">
                        {fVal}" <span className="text-[10px] font-normal text-slate-500">in</span>
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2 print:hidden">
            <button
              type="button"
              onClick={handlePrintJobCard}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg cursor-pointer"
            >
              🖨 Print Tailor Report
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


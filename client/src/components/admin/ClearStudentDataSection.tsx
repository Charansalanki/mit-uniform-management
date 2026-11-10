import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface ClearStudentDataSectionProps {
  apiBaseUrl?: string;
  onDataCleared?: (summary: any) => void;
}

export default function ClearStudentDataSection({
  apiBaseUrl = '',
  onDataCleared
}: ClearStudentDataSectionProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [executing, setExecuting] = useState(false);

  const [previewCounts, setPreviewCounts] = useState({
    studentRecordsToClear: 0,
    registrationDocsCount: 0,
    trackingDocsCount: 0,
    studentAssignmentsCount: 0,
    paymentRecordsPreserved: 0,
    utrRecordsPreserved: 0,
    vendorHistoryPreserved: 0,
    activeVendorsPreserved: 0,
    vendorAllocationsPreserved: 0
  });

  const [explicitCheck, setExplicitCheck] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [resultSummary, setResultSummary] = useState<any>(null);

  const buildHeaders = useCallback(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = typeof localStorage !== 'undefined'
      ? (localStorage.getItem('mit_admin_token') || localStorage.getItem('adminToken') || localStorage.getItem('token'))
      : null;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }, []);

  // Open Confirmation Modal & Fetch Live Database Counts
  const handleOpenConfirmationModal = async () => {
    setErrorMsg('');
    setResultSummary(null);
    setExplicitCheck(false);
    setConfirmPhrase('');
    setModalOpen(true);

    try {
      setLoadingPreview(true);
      const res = await fetch(
        `${apiBaseUrl}/api/admin/maintenance/clear-student-data/preview?t=${Date.now()}`,
        {
          method: 'GET',
          credentials: 'include',
          headers: buildHeaders(),
          cache: 'no-store'
        }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        setPreviewCounts(data.counts);
      } else {
        setErrorMsg(data.message || 'Unable to load record counts.');
      }
    } catch (err: any) {
      setErrorMsg('Network error while loading database preview counts.');
    } finally {
      setLoadingPreview(false);
    }
  };

  // Execute Transactional Student Data Clear
  const handleExecuteClearStudentData = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!explicitCheck || confirmPhrase.trim().toUpperCase() !== 'CLEAR STUDENT DATA') {
      setErrorMsg(
        'Please check the confirmation box and type "CLEAR STUDENT DATA" to proceed.'
      );
      return;
    }

    try {
      setExecuting(true);
      const res = await fetch(
        `${apiBaseUrl}/api/admin/maintenance/clear-student-data/execute`,
        {
          method: 'POST',
          credentials: 'include',
          headers: buildHeaders(),
          body: JSON.stringify({
            confirmed: true,
            confirmationPhrase: confirmPhrase.trim().toUpperCase()
          })
        }
      );
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'Operation failed and was safely rolled back.');
        return;
      }

      setResultSummary(data.summary);
      setModalOpen(false);
      onDataCleared?.(data.summary);
    } catch (err: any) {
      setErrorMsg('Network error during operation. No records were deleted.');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-red-200 shadow-xs p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-amber-100 text-amber-900 border border-amber-300">
              Financial & UTR Records Protected
            </span>
          </div>

          {/* 1. Renamed Heading */}
          <h3 className="text-base font-extrabold text-slate-900">
            Clear Student Data (Keep Payments & Records)
          </h3>

          {/* 1. Exact Required Description */}
          <p className="text-xs text-slate-600 leading-relaxed">
            Clear student registration information and student-specific uniform data while preserving all payment transactions, UTR records, financial information, vendor records and important system data.
          </p>
        </div>

        {/* 1. Renamed Button Text */}
        <button
          type="button"
          onClick={handleOpenConfirmationModal}
          className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold rounded-xl shadow-xs shrink-0 cursor-pointer transition"
        >
          Clear Student Data
        </button>
      </div>

      {/* Post-Execution Verification Summary Banner */}
      {resultSummary && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs space-y-2 animate-in fade-in">
          <div className="font-extrabold text-sm flex items-center justify-between">
            <span>✓ Student Data Cleared Safely (Backup ID: {resultSummary.backupId})</span>
            <span className="font-mono text-[11px]">
              {new Date(resultSummary.executedAt).toLocaleString('en-IN')}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="bg-white p-2.5 rounded border border-emerald-200">
              <span className="text-slate-500 block">Student Records Cleared</span>
              <strong className="text-base font-extrabold text-slate-900">
                {resultSummary.studentRecordsCleared}
              </strong>
            </div>
            <div className="bg-white p-2.5 rounded border border-emerald-200">
              <span className="text-slate-500 block">Payment Records Preserved</span>
              <strong className="text-base font-extrabold text-emerald-700">
                {resultSummary.paymentRecordsPreserved} (100% Intact)
              </strong>
            </div>
            <div className="bg-white p-2.5 rounded border border-emerald-200">
              <span className="text-slate-500 block">UTR Records Preserved</span>
              <strong className="text-base font-extrabold text-blue-700">
                {resultSummary.utrRecordsPreserved} (100% Intact)
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* 5. CONFIRMATION MODAL BEFORE CLEARING (Rendered via React Portal onto document.body) */}
      {modalOpen && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[999999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            margin: 0,
            zIndex: 999999
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !executing) {
              setModalOpen(false);
            }
          }}
        >
          <div
            className="bg-white rounded-2xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-200 relative my-auto animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                  Database Safety Confirmation
                </span>
                <h4 className="text-base font-bold mt-0.5 text-white">
                  Clear Student Data (Keep Payments & Records)
                </h4>
              </div>
              <button
                type="button"
                disabled={executing}
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white font-bold p-1 cursor-pointer transition disabled:opacity-40"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleExecuteClearStudentData} className="p-6 space-y-4">
              {/* Exact Required Confirmation Message */}
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-semibold leading-relaxed">
                Are you sure you want to clear student registration data? Payment transactions, UTR records, vendor information and important system records will remain safe and unchanged. This action cannot be easily reversed.
              </div>

              {errorMsg && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 text-xs font-bold">
                  ✕ {errorMsg}
                </div>
              )}

              {/* Live Impact Counters */}
              {loadingPreview ? (
                <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border">
                  Inspecting database collections and counting records...
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3.5 rounded-xl bg-red-50 border border-red-200">
                    <span className="text-red-800 font-semibold block">
                      Student Records to Be Cleared
                    </span>
                    <strong className="text-2xl font-extrabold text-red-700 mt-1 block">
                      {previewCounts.studentRecordsToClear}
                    </strong>
                    <span className="text-[11px] text-red-600">
                      Registrations, Sizes & PINs
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                    <span className="text-emerald-800 font-semibold block">
                      Payment Records Preserved
                    </span>
                    <strong className="text-2xl font-extrabold text-emerald-700 mt-1 block">
                      {previewCounts.paymentRecordsPreserved}
                    </strong>
                    <span className="text-[11px] text-emerald-700">
                      Amounts, Proofs & Statuses
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200">
                    <span className="text-blue-800 font-semibold block">
                      UTR Records Preserved
                    </span>
                    <strong className="text-2xl font-extrabold text-blue-700 mt-1 block">
                      {previewCounts.utrRecordsPreserved}
                    </strong>
                    <span className="text-[11px] text-blue-700">
                      12-Digit Bank References
                    </span>
                  </div>
                </div>
              )}

              {/* Protected vs Deleted Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <strong className="text-red-700 block mb-1">Will Be Cleared:</strong>
                  <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                    <li>Student registration profiles</li>
                    <li>Submitted uniform sizes & measurements</li>
                    <li>Application IDs & 6-digit Tracking PINs</li>
                    <li>Temporary registration progress</li>
                  </ul>
                </div>
                <div>
                  <strong className="text-emerald-700 block mb-1">Strictly Preserved:</strong>
                  <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                    <li>All UTR numbers & payment screenshots</li>
                    <li>Verified, pending & rejected payments</li>
                    <li>Vendors, assignments & QR scanners</li>
                    <li>Admin accounts, schedules & audit logs</li>
                  </ul>
                </div>
              </div>

              {/* Explicit Admin Confirmation Controls */}
              <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-800 font-semibold pt-1">
                <input
                  type="checkbox"
                  checked={explicitCheck}
                  onChange={(e) => setExplicitCheck(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer"
                />
                <span>
                  I confirm that an automatic pre-clear backup will be saved and only student registration/uniform data will be cleared.
                </span>
              </label>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Type <span className="font-mono text-red-600 font-bold">CLEAR STUDENT DATA</span> to confirm *
                </label>
                <input
                  type="text"
                  required
                  value={confirmPhrase}
                  onChange={(e) => setConfirmPhrase(e.target.value)}
                  placeholder="CLEAR STUDENT DATA"
                  className="w-full px-3.5 py-2 text-xs font-mono uppercase border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  disabled={executing}
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl cursor-pointer transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    executing ||
                    loadingPreview ||
                    !explicitCheck ||
                    confirmPhrase.trim().toUpperCase() !== 'CLEAR STUDENT DATA'
                  }
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-xs font-extrabold rounded-xl shadow-xs transition cursor-pointer flex items-center gap-2"
                >
                  {executing && (
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  <span>{executing ? 'Backing Up & Clearing...' : 'Confirm & Clear Student Data'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}


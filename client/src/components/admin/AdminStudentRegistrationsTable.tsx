import React, { useState, useEffect, useCallback } from 'react';
import { useAuthenticatedSse } from '../../hooks/useAuthenticatedSse';

const PAYMENT_PILL: Record<string, string> = {
  'Payment Pending': 'bg-amber-100 text-amber-800 border-amber-300',
  'Payment Submitted': 'bg-blue-100 text-blue-800 border-blue-300',
  'Under Verification': 'bg-indigo-100 text-indigo-800 border-indigo-300',
  'Payment Successful': 'bg-emerald-100 text-emerald-800 border-emerald-300',
  'Payment Rejected': 'bg-red-100 text-red-800 border-red-300'
};

interface RegistrationRow {
  applicationId: string;
  registrationId: string;
  studentName: string;
  usn: string;
  course: string;
  department: string;
  academicYear: string;
  section: string;
  shirtSize: string;
  trouserSize: string;
  vendorName: string;
  vendorId: string;
  registrationStatus: string;
  paymentStatus: string;
  paymentAmount: number;
  utrNumber: string | null;
  registrationDate: string;
  verifiedAt: string | null;
}

interface SummaryCounts {
  totalRegistrations: number;
  paymentPendingCount: number;
  awaitingVerificationCount: number;
  paymentSuccessfulCount: number;
  paymentRejectedCount: number;
}

interface Props {
  apiBaseUrl?: string;
  authToken?: string | null;
}

export default function AdminStudentRegistrationsTable({
  apiBaseUrl = '',
  authToken = localStorage.getItem('adminToken') || localStorage.getItem('token')
}: Props) {
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [summary, setSummary] = useState<SummaryCounts>({
    totalRegistrations: 0,
    paymentPendingCount: 0,
    awaitingVerificationCount: 0,
    paymentSuccessfulCount: 0,
    paymentRejectedCount: 0
  });
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'PENDING' | 'PAYMENT_PENDING_ONLY' | 'SUCCESSFUL' | 'REJECTED'>('ALL');
  const [search, setSearch] = useState('');

  const loadRegistrations = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ paymentFilter, search }).toString();
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      const res = await fetch(`${apiBaseUrl}/api/admin/registrations/all?${qs}`, { headers });
      const data = await res.json();
      if (data.success) {
        setRegistrations(data.registrations || []);
        setSummary(data.summaryCounts || {
          totalRegistrations: 0,
          paymentPendingCount: 0,
          awaitingVerificationCount: 0,
          paymentSuccessfulCount: 0,
          paymentRejectedCount: 0
        });
      }
    } catch (err) {
      console.error('Failed to load admin registrations:', err);
    }
  }, [apiBaseUrl, authToken, paymentFilter, search]);

  useEffect(() => {
    loadRegistrations();
  }, [loadRegistrations]);

  // Real-time SSE updates whenever a new student registers or a vendor verifies a payment
  useAuthenticatedSse({
    streamPath: '/api/sse/admin',
    jwtToken: authToken || undefined,
    apiBaseUrl,
    eventHandlers: {
      NEW_STUDENT_REGISTERED: loadRegistrations,
      NEW_PAYMENT_SUBMITTED: loadRegistrations,
      PAYMENT_STATUS_UPDATED: loadRegistrations
    }
  });

  return (
    <div className="space-y-4">
      {/* Summary Filter Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <button
          type="button"
          onClick={() => setPaymentFilter('ALL')}
          className={`p-4 rounded-xl border text-left transition shadow-sm ${
            paymentFilter === 'ALL'
              ? 'bg-slate-900 text-white border-slate-900 ring-2 ring-slate-400'
              : 'bg-white text-slate-900 border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-semibold opacity-75 uppercase tracking-wider">Total Registrations</div>
          <div className="text-2xl font-extrabold mt-1">{summary.totalRegistrations}</div>
        </button>

        <button
          type="button"
          onClick={() => setPaymentFilter('PAYMENT_PENDING_ONLY')}
          className={`p-4 rounded-xl border text-left transition shadow-sm ${
            paymentFilter === 'PAYMENT_PENDING_ONLY'
              ? 'bg-amber-600 text-white border-amber-600 ring-2 ring-amber-400'
              : 'bg-white text-amber-900 border-amber-200 hover:border-amber-300'
          }`}
        >
          <div className="text-[11px] font-semibold opacity-80 uppercase tracking-wider">Unpaid (Pending)</div>
          <div className="text-2xl font-extrabold mt-1">{summary.paymentPendingCount}</div>
        </button>

        <button
          type="button"
          onClick={() => setPaymentFilter('PENDING')}
          className={`p-4 rounded-xl border text-left transition shadow-sm ${
            paymentFilter === 'PENDING'
              ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-400'
              : 'bg-white text-blue-900 border-blue-200 hover:border-blue-300'
          }`}
        >
          <div className="text-[11px] font-semibold opacity-80 uppercase tracking-wider">All Pending / Check</div>
          <div className="text-2xl font-extrabold mt-1">
            {(summary.paymentPendingCount || 0) + (summary.awaitingVerificationCount || 0)}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setPaymentFilter('SUCCESSFUL')}
          className={`p-4 rounded-xl border text-left transition shadow-sm ${
            paymentFilter === 'SUCCESSFUL'
              ? 'bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-400'
              : 'bg-white text-emerald-900 border-emerald-200 hover:border-emerald-300'
          }`}
        >
          <div className="text-[11px] font-semibold opacity-80 uppercase tracking-wider">Payment Successful</div>
          <div className="text-2xl font-extrabold mt-1">{summary.paymentSuccessfulCount}</div>
        </button>

        <button
          type="button"
          onClick={() => setPaymentFilter('REJECTED')}
          className={`p-4 rounded-xl border text-left transition shadow-sm ${
            paymentFilter === 'REJECTED'
              ? 'bg-red-600 text-white border-red-600 ring-2 ring-red-400'
              : 'bg-white text-red-900 border-red-200 hover:border-red-300'
          }`}
        >
          <div className="text-[11px] font-semibold opacity-80 uppercase tracking-wider">Payment Rejected</div>
          <div className="text-2xl font-extrabold mt-1">{summary.paymentRejectedCount}</div>
        </button>
      </div>

      {/* Registrations Table Container */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-900 text-sm">
              All Student Registrations ({registrations.length})
            </h3>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold border border-slate-200">
              Filter: {paymentFilter}
            </span>
          </div>
          <input
            type="text"
            placeholder="Search Application ID, Name, USN, UTR..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-72 px-3.5 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 uppercase font-bold border-b border-slate-200">
                <th className="p-3.5">Application ID</th>
                <th className="p-3.5">Student Name & USN</th>
                <th className="p-3.5">Department / Sec</th>
                <th className="p-3.5">Sizes</th>
                <th className="p-3.5">Assigned Vendor</th>
                <th className="p-3.5">Registration Status</th>
                <th className="p-3.5">Payment Status</th>
                <th className="p-3.5">Payment Amount</th>
                <th className="p-3.5">Registration Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {registrations.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    No student registrations match the selected filter.
                  </td>
                </tr>
              ) : (
                registrations.map((r) => (
                  <tr key={r.applicationId} className="hover:bg-slate-50 transition">
                    <td className="p-3.5 font-mono font-extrabold text-blue-700">
                      {r.applicationId}
                    </td>
                    <td className="p-3.5">
                      <div className="font-bold text-slate-900">{r.studentName}</div>
                      <div className="font-mono text-slate-600">{r.usn}</div>
                    </td>
                    <td className="p-3.5">
                      <div className="font-medium text-slate-800">{r.department}</div>
                      <div className="text-[11px] text-slate-500">{r.academicYear} • Sec {r.section}</div>
                    </td>
                    <td className="p-3.5">
                      S: <strong>{r.shirtSize}</strong> / T: <strong>{r.trouserSize}</strong>
                    </td>
                    <td className="p-3.5 font-semibold text-slate-800">{r.vendorName}</td>
                    <td className="p-3.5">
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[11px]">
                        {r.registrationStatus}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-full border font-bold text-[11px] ${
                          PAYMENT_PILL[r.paymentStatus] || PAYMENT_PILL['Payment Pending']
                        }`}
                      >
                        {r.paymentStatus}
                      </span>
                    </td>
                    <td className="p-3.5 font-extrabold text-slate-900">
                      ₹{Number(r.paymentAmount).toLocaleString('en-IN')}
                    </td>
                    <td className="p-3.5 text-slate-500">
                      {new Date(r.registrationDate).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


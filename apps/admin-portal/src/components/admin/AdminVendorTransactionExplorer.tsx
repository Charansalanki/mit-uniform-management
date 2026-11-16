import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  CheckCircle2,
  Clock3,
  XCircle,
  TrendingUp,
  Search,
  Filter,
  Eye,
  ArrowRight,
  ShieldAlert,
  Building2,
  Calendar,
  FileSpreadsheet,
  Download
} from 'lucide-react';

const STATUS_BADGE: Record<string, string> = {
  'Payment Successful': 'bg-emerald-100 text-emerald-800 border-emerald-300',
  Verified: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  'Payment Verified': 'bg-emerald-100 text-emerald-800 border-emerald-300',
  Submitted: 'bg-amber-100 text-amber-800 border-amber-300',
  'Payment Submitted': 'bg-amber-100 text-amber-800 border-amber-300',
  'Under Verification': 'bg-blue-100 text-blue-800 border-blue-300',
  Rejected: 'bg-red-100 text-red-800 border-red-300',
  'Payment Rejected': 'bg-red-100 text-red-800 border-red-300',
  'Payment Not Received': 'bg-orange-100 text-orange-900 border-orange-300'
};

interface OverallTotals {
  totalVendors: number;
  totalStudentsHandled: number;
  totalSuccessfulPayments: number;
  totalRejectedPayments: number;
  totalPendingPayments: number;
  grandTotalCollected: number;
}

interface VendorSummary {
  vendorId: string;
  vendorName: string;
  contactPerson: string;
  mobile: string;
  status: string;
  studentsHandled: number;
  totalSubmissions: number;
  successfulPayments: number;
  rejectedPayments: number;
  pendingPayments: number;
  totalCollectedAmount: number;
}

interface TransactionItem {
  _id?: string;
  id?: string;
  submissionId?: string;
  registrationId?: string;
  studentName: string;
  usn: string;
  department: string;
  yearSemester: string;
  section: string;
  vendorId: string;
  vendorName: string;
  paymentMethod: string;
  paymentAmount: number;
  amount?: number;
  bankVerifiedAmount?: number | null;
  utrNumber: string;
  paymentStatus: string;
  verifiedByVendorId?: string;
  verifiedByVendorName?: string;
  verifiedByIdentifier?: string;
  verifierRole?: string;
  remarks?: string;
  adminRemarks?: string;
  rejectionReason?: string;
  actionTimestamp?: string;
  verifiedAt?: string | null;
  createdAt?: string;
}

interface SingleVendorData {
  vendor: {
    vendorId: string;
    vendorName: string;
    contactPerson: string;
    mobile: string;
    email: string;
    status: string;
  };
  vendorMetrics: {
    studentsHandledCount: number;
    totalTransactions: number;
    verifiedPayments: number;
    rejectedPayments: number;
    pendingPayments: number;
    totalCollectedAmount: number;
  };
  transactions: TransactionItem[];
  permanentAuditTrail: TransactionItem[];
}

interface AdminVendorTransactionExplorerProps {
  apiBaseUrl?: string;
  authToken?: string;
}

export default function AdminVendorTransactionExplorer({
  apiBaseUrl = '',
  authToken = localStorage.getItem('mit_uniform_admin_token_v1') || localStorage.getItem('adminToken') || localStorage.getItem('token') || ''
}: AdminVendorTransactionExplorerProps) {
  const [subTab, setSubTab] = useState<'VENDOR_SUMMARY' | 'SEPARATE_VENDOR' | 'MASTER_HISTORY'>('VENDOR_SUMMARY');
  const [overallTotals, setOverallTotals] = useState<OverallTotals>({
    totalVendors: 0,
    totalStudentsHandled: 0,
    totalSuccessfulPayments: 0,
    totalRejectedPayments: 0,
    totalPendingPayments: 0,
    grandTotalCollected: 0
  });
  const [vendorSummaries, setVendorSummaries] = useState<VendorSummary[]>([]);
  const [loading, setLoading] = useState(false);

  // Separate Single-Vendor Drilldown State
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [singleVendorData, setSingleVendorData] = useState<SingleVendorData | null>(null);
  const [vendorStatusFilter, setVendorStatusFilter] = useState('ALL');
  const [vendorSearch, setVendorSearch] = useState('');

  // Master Transaction History State
  const [masterHistory, setMasterHistory] = useState<TransactionItem[]>([]);
  const [masterFilters, setMasterFilters] = useState({
    vendorId: 'ALL',
    status: 'ALL',
    search: ''
  });

  const authHeaders = useCallback(() => {
    const h: Record<string, string> = {};
    if (authToken) h['Authorization'] = `Bearer ${authToken}`;
    return h;
  }, [authToken]);

  // 1. Load Vendor-Wise Summary
  const loadVendorSummary = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${apiBaseUrl}/api/admin/vendors/payment-summary`, {
        headers: authHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setOverallTotals(data.overallTotals);
        setVendorSummaries(data.vendorSummaries || []);
        if (!selectedVendorId && data.vendorSummaries && data.vendorSummaries.length > 0) {
          setSelectedVendorId(data.vendorSummaries[0].vendorId);
        }
      }
    } catch (err) {
      console.error('Error loading vendor summary:', err);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, authHeaders, selectedVendorId]);

  // 2. Load Separate History for One Specific Vendor
  const loadSingleVendorHistory = useCallback(
    async (vendorIdToLoad?: string) => {
      const targetId = vendorIdToLoad || selectedVendorId;
      if (!targetId) return;
      try {
        const qs = new URLSearchParams({
          status: vendorStatusFilter,
          search: vendorSearch
        }).toString();
        const res = await fetch(
          `${apiBaseUrl}/api/admin/vendors/${targetId}/transaction-history?${qs}`,
          { headers: authHeaders() }
        );
        const data = await res.json();
        if (data.success) {
          setSingleVendorData(data);
        }
      } catch (err) {
        console.error('Error loading single vendor history:', err);
      }
    },
    [apiBaseUrl, authHeaders, selectedVendorId, vendorStatusFilter, vendorSearch]
  );

  // 3. Load Admin Master Transaction & Verification Audit History
  const loadMasterHistory = useCallback(async () => {
    try {
      const qs = new URLSearchParams(masterFilters).toString();
      const res = await fetch(`${apiBaseUrl}/api/admin/transactions/all-history?${qs}`, {
        headers: authHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setMasterHistory(data.history || []);
      }
    } catch (err) {
      console.error('Error loading master transaction history:', err);
    }
  }, [apiBaseUrl, authHeaders, masterFilters]);

  useEffect(() => {
    loadVendorSummary();
    loadMasterHistory();
  }, [loadVendorSummary, loadMasterHistory]);

  useEffect(() => {
    if (subTab === 'SEPARATE_VENDOR' && selectedVendorId) {
      loadSingleVendorHistory(selectedVendorId);
    }
  }, [subTab, selectedVendorId, vendorStatusFilter, vendorSearch, loadSingleVendorHistory]);

  const handleOpenVendorHistory = (vendorId: string) => {
    setSelectedVendorId(vendorId);
    setVendorStatusFilter('ALL');
    setVendorSearch('');
    setSubTab('SEPARATE_VENDOR');
    loadSingleVendorHistory(vendorId);
  };

  // CSV Export utility
  const handleExportCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.map((val) => `"${String(val ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6" style={{ marginTop: '12px' }}>
      {/* Navigation Switcher Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold text-slate-900 m-0">
              Vendor-Wise Payment Summary & Permanent Transaction History
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
              Read-Only Audit Ledger
            </span>
          </div>
          <p className="text-xs text-slate-500 m-0 mt-1">
            Real-time synchronization with Vendor Portal verifications • Permanent non-deletable historical audit records
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSubTab('VENDOR_SUMMARY')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              subTab === 'VENDOR_SUMMARY'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            1. Vendor-Wise Summary
          </button>
          <button
            type="button"
            onClick={() => {
              if (!selectedVendorId && vendorSummaries[0]) {
                setSelectedVendorId(vendorSummaries[0].vendorId);
              }
              setSubTab('SEPARATE_VENDOR');
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              subTab === 'SEPARATE_VENDOR'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            2. Separate Vendor History
          </button>
          <button
            type="button"
            onClick={() => setSubTab('MASTER_HISTORY')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              subTab === 'MASTER_HISTORY'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            3. All Transactions Audit Log
          </button>
        </div>
      </div>

      {/* Global Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Vendors</div>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {overallTotals.totalVendors}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-indigo-200 shadow-sm">
          <div className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Students Handled</div>
          <div className="text-2xl font-black text-indigo-600 mt-1">
            {overallTotals.totalStudentsHandled}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm">
          <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Successful Payments</div>
          <div className="text-2xl font-black text-emerald-600 mt-1">
            {overallTotals.totalSuccessfulPayments}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-orange-200 shadow-sm">
          <div className="text-[11px] font-bold text-orange-700 uppercase tracking-wider">Pending Payments</div>
          <div className="text-2xl font-black text-orange-500 mt-1">
            {overallTotals.totalPendingPayments}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-red-200 shadow-sm">
          <div className="text-[11px] font-bold text-red-700 uppercase tracking-wider">Rejected Payments</div>
          <div className="text-2xl font-black text-red-600 mt-1">
            {overallTotals.totalRejectedPayments}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-sm">
          <div className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Verified Collection</div>
          <div className="text-xl font-black text-blue-600 mt-1">
            ₹{Number(overallTotals.grandTotalCollected).toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* TAB 1: VENDOR-WISE SUMMARY TABLE (Requirement 5)                    */}
      {/* =================================================================== */}
      {subTab === 'VENDOR_SUMMARY' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
            <div>
              <h3 className="font-bold text-slate-900 text-sm m-0">
                Vendor-Wise Performance Breakdown
              </h3>
              <p className="text-xs text-slate-500 m-0 mt-0.5">
                Click "Open Vendor History →" on any vendor to review its isolated transaction ledger.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                handleExportCSV(
                  'Vendors_Payment_Summary.csv',
                  ['Vendor ID', 'Vendor Name', 'Contact Person', 'Mobile', 'Status', 'Students Handled', 'Total Submissions', 'Successful Payments', 'Pending Payments', 'Rejected Payments', 'Total Collected Amount'],
                  vendorSummaries.map((v) => [
                    v.vendorId,
                    v.vendorName,
                    v.contactPerson,
                    v.mobile,
                    v.status,
                    v.studentsHandled,
                    v.totalSubmissions,
                    v.successfulPayments,
                    v.pendingPayments,
                    v.rejectedPayments,
                    v.totalCollectedAmount
                  ])
                )
              }
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1.5"
            >
              <Download size={13} /> Export Summary (CSV)
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 uppercase font-bold border-b border-slate-200">
                  <th className="p-3.5">Vendor Name & ID</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Students Handled</th>
                  <th className="p-3.5">Successful</th>
                  <th className="p-3.5">Pending</th>
                  <th className="p-3.5">Rejected</th>
                  <th className="p-3.5">Total Collected</th>
                  <th className="p-3.5 text-right">Separate History</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {vendorSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      No active vendors registered yet.
                    </td>
                  </tr>
                ) : (
                  vendorSummaries.map((v) => (
                    <tr key={v.vendorId} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900 text-sm">{v.vendorName}</div>
                        <div className="font-mono text-blue-700 text-[11px] font-semibold">{v.vendorId}</div>
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] border ${
                            v.status === 'ACTIVE'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-slate-200 text-slate-700 border-slate-300'
                          }`}
                        >
                          {v.status}
                        </span>
                      </td>
                      <td className="p-3.5 font-extrabold text-slate-900 text-sm">
                        {v.studentsHandled}
                      </td>
                      <td className="p-3.5 font-bold text-emerald-700 text-sm">
                        {v.successfulPayments}
                      </td>
                      <td className="p-3.5 font-bold text-orange-600 text-sm">
                        {v.pendingPayments}
                      </td>
                      <td className="p-3.5 font-bold text-red-600 text-sm">
                        {v.rejectedPayments}
                      </td>
                      <td className="p-3.5 font-black text-blue-700 text-sm">
                        ₹{Number(v.totalCollectedAmount).toLocaleString('en-IN')}
                      </td>
                      <td className="p-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenVendorHistory(v.vendorId)}
                          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg cursor-pointer text-xs inline-flex items-center gap-1 shadow-sm"
                        >
                          Open Vendor History <ArrowRight size={13} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: SEPARATE VENDOR TRANSACTION HISTORY (Requirement 4)          */}
      {/* =================================================================== */}
      {subTab === 'SEPARATE_VENDOR' && (
        <div className="space-y-4">
          {/* Vendor Selector & Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-700">Select Vendor:</label>
              <select
                value={selectedVendorId}
                onChange={(e) => {
                  setSelectedVendorId(e.target.value);
                  loadSingleVendorHistory(e.target.value);
                }}
                className="px-3 py-2 text-xs font-bold border border-slate-300 rounded-lg bg-white"
              >
                {vendorSummaries.map((v) => (
                  <option key={v.vendorId} value={v.vendorId}>
                    {v.vendorName} ({v.vendorId})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              {['ALL', 'Payment Successful', 'Pending', 'Rejected'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setVendorStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition ${
                    vendorStatusFilter === st
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {st === 'ALL' ? 'All Records' : st}
                </button>
              ))}
              <input
                type="text"
                placeholder="Search USN, Name, UTR..."
                value={vendorSearch}
                onChange={(e) => setVendorSearch(e.target.value)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
              {singleVendorData && singleVendorData.transactions.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    handleExportCSV(
                      `${singleVendorData.vendor.vendorId}_Transactions.csv`,
                      ['Student Name', 'USN', 'Department', 'Year/Sem', 'Section', 'Payment Method', 'Amount', 'UTR', 'Status', 'Verified At', 'Verified By', 'Remarks'],
                      singleVendorData.transactions.map((tx) => [
                        tx.studentName,
                        tx.usn,
                        tx.department,
                        tx.yearSemester,
                        tx.section,
                        tx.paymentMethod,
                        tx.bankVerifiedAmount || tx.amount || tx.paymentAmount,
                        tx.utrNumber,
                        tx.paymentStatus,
                        tx.verifiedAt || tx.actionTimestamp || '',
                        tx.verifiedByIdentifier || singleVendorData.vendor.vendorName,
                        tx.rejectionReason || tx.adminRemarks || tx.remarks || ''
                      ])
                    )
                  }
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1"
                >
                  <Download size={12} /> Export CSV
                </button>
              )}
            </div>
          </div>

          {singleVendorData && (
            <>
              {/* Selected Vendor Isolated Metrics Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-bold text-slate-500 uppercase">Students Handled</div>
                  <div className="text-2xl font-black text-slate-900 mt-1">
                    {singleVendorData.vendorMetrics.studentsHandledCount}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm">
                  <div className="text-[11px] font-bold text-emerald-700 uppercase">Verified Payments</div>
                  <div className="text-2xl font-black text-emerald-600 mt-1">
                    {singleVendorData.vendorMetrics.verifiedPayments}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-orange-200 shadow-sm">
                  <div className="text-[11px] font-bold text-orange-700 uppercase">Pending Payments</div>
                  <div className="text-2xl font-black text-orange-500 mt-1">
                    {singleVendorData.vendorMetrics.pendingPayments}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-red-200 shadow-sm">
                  <div className="text-[11px] font-bold text-red-700 uppercase">Rejected Payments</div>
                  <div className="text-2xl font-black text-red-600 mt-1">
                    {singleVendorData.vendorMetrics.rejectedPayments}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-sm">
                  <div className="text-[11px] font-bold text-blue-700 uppercase">Vendor Collection</div>
                  <div className="text-xl font-black text-blue-700 mt-1">
                    ₹{Number(singleVendorData.vendorMetrics.totalCollectedAmount).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              {/* Isolated Transactions Table for Selected Vendor */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 text-sm m-0">
                    {singleVendorData.vendor.vendorName} ({singleVendorData.vendor.vendorId}) — Isolated Transaction History ({singleVendorData.transactions.length})
                  </h3>
                  <span className="text-xs text-slate-500">Contact: {singleVendorData.vendor.mobile}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 uppercase font-bold border-b border-slate-200">
                        <th className="p-3">Student Name & USN</th>
                        <th className="p-3">Dept / Year / Sec</th>
                        <th className="p-3">Amount</th>
                        <th className="p-3">UTR Reference</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Verified / Action Date & Time</th>
                        <th className="p-3">Verified By</th>
                        <th className="p-3">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {singleVendorData.transactions.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-slate-400">
                            No transactions match the selected filter for this vendor.
                          </td>
                        </tr>
                      ) : (
                        singleVendorData.transactions.map((tx, idx) => (
                          <tr key={tx._id || tx.id || idx} className="hover:bg-slate-50">
                            <td className="p-3">
                              <div className="font-bold text-slate-900">{tx.studentName}</div>
                              <div className="font-mono text-blue-700 font-semibold">{tx.usn}</div>
                            </td>
                            <td className="p-3 text-slate-700">
                              {tx.department} • {tx.yearSemester} (Sec {tx.section})
                            </td>
                            <td className="p-3 font-black text-slate-900">
                              ₹{Number(tx.bankVerifiedAmount || tx.amount || tx.paymentAmount || 0).toLocaleString('en-IN')}
                            </td>
                            <td className="p-3 font-mono font-bold text-blue-700">
                              {tx.utrNumber}
                            </td>
                            <td className="p-3">
                              <span
                                className={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${
                                  STATUS_BADGE[tx.paymentStatus] || STATUS_BADGE.Submitted
                                }`}
                              >
                                {tx.paymentStatus}
                              </span>
                            </td>
                            <td className="p-3 font-mono text-[11px] text-slate-700">
                              {tx.verifiedAt || tx.actionTimestamp
                                ? new Date(tx.verifiedAt || tx.actionTimestamp || '').toLocaleString('en-IN', {
                                    dateStyle: 'medium',
                                    timeStyle: 'medium'
                                  })
                                : 'Awaiting Action'}
                            </td>
                            <td className="p-3 font-semibold text-slate-800">
                              {tx.verifiedByIdentifier || tx.verifiedByVendorName || singleVendorData.vendor.vendorName}
                            </td>
                            <td className="p-3 text-slate-600">
                              {tx.rejectionReason || tx.adminRemarks || tx.remarks || '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: ADMIN MASTER TRANSACTION & VERIFICATION AUDIT LOG (Req 3)    */}
      {/* =================================================================== */}
      {subTab === 'MASTER_HISTORY' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
            <div>
              <h3 className="font-bold text-slate-900 text-sm m-0">
                Permanent Master Transaction Verification History (All Vendors)
              </h3>
              <p className="text-xs text-slate-500 m-0 mt-0.5">
                Immutable audit log of all vendor verification and rejection actions with exact timestamp and verifier identity.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={masterFilters.vendorId}
                onChange={(e) =>
                  setMasterFilters({ ...masterFilters, vendorId: e.target.value })
                }
                className="px-3 py-1.5 text-xs font-bold border border-slate-300 rounded-lg bg-white"
              >
                <option value="ALL">All Vendors</option>
                {vendorSummaries.map((v) => (
                  <option key={v.vendorId} value={v.vendorId}>
                    {v.vendorName} ({v.vendorId})
                  </option>
                ))}
              </select>
              <select
                value={masterFilters.status}
                onChange={(e) =>
                  setMasterFilters({ ...masterFilters, status: e.target.value })
                }
                className="px-3 py-1.5 text-xs font-bold border border-slate-300 rounded-lg bg-white"
              >
                <option value="ALL">All Statuses</option>
                <option value="Payment Successful">Verified / Successful</option>
                <option value="Pending">Pending Verification</option>
                <option value="Rejected">Rejected</option>
              </select>
              <input
                type="text"
                placeholder="Search Student, USN, UTR, Vendor..."
                value={masterFilters.search}
                onChange={(e) =>
                  setMasterFilters({ ...masterFilters, search: e.target.value })
                }
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
              {masterHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    handleExportCSV(
                      'All_Vendors_Transaction_Audit_History.csv',
                      ['Student Name', 'USN', 'Vendor Name', 'Vendor ID', 'Department', 'Year/Sem', 'Amount', 'UTR', 'Status', 'Action Timestamp', 'Verified By'],
                      masterHistory.map((item) => [
                        item.studentName,
                        item.usn,
                        item.vendorName,
                        item.vendorId,
                        item.department,
                        item.yearSemester,
                        item.paymentAmount,
                        item.utrNumber,
                        item.paymentStatus,
                        item.actionTimestamp || '',
                        item.verifiedByVendorName || item.vendorName
                      ])
                    )
                  }
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1"
                >
                  <Download size={12} /> Export CSV
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 uppercase font-bold border-b border-slate-200">
                  <th className="p-3">Student Name & USN</th>
                  <th className="p-3">Vendor Name</th>
                  <th className="p-3">Payment Amount</th>
                  <th className="p-3">UTR Reference</th>
                  <th className="p-3">Payment Status</th>
                  <th className="p-3">Verified Date & Exact Time</th>
                  <th className="p-3">Verified By Vendor</th>
                  <th className="p-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {masterHistory.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      No verification history records logged yet.
                    </td>
                  </tr>
                ) : (
                  masterHistory.map((item, index) => (
                    <tr key={item._id || item.id || index} className="hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{item.studentName}</div>
                        <div className="font-mono text-blue-700 font-semibold">{item.usn}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{item.vendorName}</div>
                        <div className="font-mono text-[11px] text-slate-500 font-semibold">
                          {item.vendorId}
                        </div>
                      </td>
                      <td className="p-3 font-black text-slate-900">
                        ₹{Number(item.paymentAmount).toLocaleString('en-IN')}
                      </td>
                      <td className="p-3 font-mono font-bold text-blue-700">
                        {item.utrNumber}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${
                            STATUS_BADGE[item.paymentStatus] || STATUS_BADGE.Submitted
                          }`}
                        >
                          {item.paymentStatus}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-[11px] text-slate-800">
                        {item.actionTimestamp
                          ? new Date(item.actionTimestamp).toLocaleString('en-IN', {
                              dateStyle: 'medium',
                              timeStyle: 'medium'
                            })
                          : '—'}
                      </td>
                      <td className="p-3 font-bold text-emerald-800">
                        {item.verifiedByVendorName || item.vendorName}
                      </td>
                      <td className="p-3 text-slate-600">
                        {item.remarks || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


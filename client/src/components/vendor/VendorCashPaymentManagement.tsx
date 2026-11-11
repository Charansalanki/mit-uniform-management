import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../api';
import {
  Banknote,
  CheckCircle2,
  Clock3,
  XCircle,
  Search,
  Filter,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  Receipt,
  User,
  ShieldCheck,
  Building
} from 'lucide-react';

interface Props {
  vendorJwt: string;
  apiBaseUrl?: string;
}

export default function VendorCashPaymentManagement({ vendorJwt }: Props) {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<any[]>([]);
  const [summary, setSummary] = useState({
    totalRequests: 0,
    pendingCount: 0,
    receivedCount: 0,
    rejectedCount: 0,
    totalCashCollected: 0
  });

  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modals state
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [modalMode, setModalMode] = useState<'CONFIRM' | 'REJECT' | null>(null);
  const [actionAmount, setActionAmount] = useState('');
  const [actionRemarks, setActionRemarks] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [cashCountedConfirm, setCashCountedConfirm] = useState(false);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const loadCashPayments = useCallback(async () => {
    if (!vendorJwt) return;
    try {
      setLoading(true);
      setActionError('');
      const data = await api.getVendorCashPayments(vendorJwt, {
        status: statusFilter,
        search: searchQuery
      });
      if (data.success) {
        setRequests(data.requests || []);
        setSummary(data.summary || {
          totalRequests: 0,
          pendingCount: 0,
          receivedCount: 0,
          rejectedCount: 0,
          totalCashCollected: 0
        });
      }
    } catch (err: any) {
      console.error('Failed to load cash payments:', err);
      setActionError(err.message || 'Failed to load cash payments.');
    } finally {
      setLoading(false);
    }
  }, [vendorJwt, statusFilter, searchQuery]);

  useEffect(() => {
    loadCashPayments();
  }, [loadCashPayments]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openConfirmModal = (req: any) => {
    setSelectedRequest(req);
    setActionAmount(String(req.expectedAmount || 1500));
    setActionRemarks('');
    setCashCountedConfirm(false);
    setActionError('');
    setModalMode('CONFIRM');
  };

  const openRejectModal = (req: any) => {
    setSelectedRequest(req);
    setRejectionReason('');
    setActionRemarks('');
    setActionError('');
    setModalMode('REJECT');
  };

  const closeModal = () => {
    setSelectedRequest(null);
    setModalMode(null);
    setActionError('');
  };

  const handleConfirmCashReceived = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest || !vendorJwt) return;

    setActionError('');
    const amt = Number(actionAmount);
    if (!amt || isNaN(amt) || amt <= 0) {
      setActionError('Please enter a valid cash amount received.');
      return;
    }

    if (amt !== Number(selectedRequest.expectedAmount)) {
      setActionError(
        `Amount Mismatch Warning: Entered ₹${amt.toLocaleString('en-IN')} does not match required fee ₹${Number(selectedRequest.expectedAmount).toLocaleString('en-IN')}. Vendor confirmation blocked.`
      );
      return;
    }

    if (!cashCountedConfirm) {
      setActionError('Please verify and confirm that you have physically counted the cash.');
      return;
    }

    try {
      setSubmittingAction(true);
      await api.confirmVendorCashPayment(
        selectedRequest.id || selectedRequest._id,
        vendorJwt,
        amt,
        actionRemarks
      );
      setActionSuccess(`Cash payment for ${selectedRequest.studentName} confirmed successfully.`);
      setTimeout(() => setActionSuccess(''), 4000);
      closeModal();
      loadCashPayments();
    } catch (err: any) {
      setActionError(err.message || 'Failed to confirm cash payment.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleRejectCashPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest || !vendorJwt) return;

    setActionError('');
    if (!rejectionReason.trim()) {
      setActionError('Please select or specify a reason for rejection.');
      return;
    }

    try {
      setSubmittingAction(true);
      await api.rejectVendorCashPayment(
        selectedRequest.id || selectedRequest._id,
        vendorJwt,
        rejectionReason.trim(),
        actionRemarks.trim()
      );
      setActionSuccess(`Cash payment request for ${selectedRequest.studentName} marked as rejected.`);
      setTimeout(() => setActionSuccess(''), 4000);
      closeModal();
      loadCashPayments();
    } catch (err: any) {
      setActionError(err.message || 'Failed to reject cash payment.');
    } finally {
      setSubmittingAction(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Top Header Strip ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-emerald-100 text-emerald-800">
              <Banknote size={22} />
            </span>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Direct Vendor Cash Payment Desk</h2>
              <p className="text-xs text-slate-500">
                Collect, count, and confirm direct cash payments for assigned students with strict zero-mismatch enforcement.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => loadCashPayments()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm cursor-pointer"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh Desk
        </button>
      </div>

      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* ── 5 Metric Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Total Requests</span>
          <div className="text-2xl font-black text-slate-900 mt-1">{summary.totalRequests}</div>
        </div>

        <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wide">Pending Collection</span>
            <Clock3 size={15} className="text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-900 mt-1">{summary.pendingCount}</div>
        </div>

        <div className="bg-emerald-50/70 p-4 rounded-xl border border-emerald-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide">Cash Received</span>
            <CheckCircle2 size={15} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-900 mt-1">{summary.receivedCount}</div>
        </div>

        <div className="bg-rose-50/70 p-4 rounded-xl border border-rose-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wide">Rejected</span>
            <XCircle size={15} className="text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-900 mt-1">{summary.rejectedCount}</div>
        </div>

        <div className="bg-slate-900 text-white p-4 rounded-xl border border-slate-800 shadow-sm col-span-2 sm:col-span-1">
          <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wide">Cash Collected</span>
          <div className="text-2xl font-black text-white mt-1">
            ₹{summary.totalCashCollected.toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto">
          {[
            { id: 'ALL', label: 'All Requests' },
            { id: 'CASH PAYMENT PENDING', label: `Pending (${summary.pendingCount})` },
            { id: 'CASH RECEIVED', label: `Received (${summary.receivedCount})` },
            { id: 'CASH PAYMENT REJECTED', label: `Rejected (${summary.rejectedCount})` }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search USN, name, cash ref..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* ── Cash Requests Table ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-extrabold uppercase text-[11px] tracking-wide whitespace-nowrap">
                <th className="p-3.5">Cash Ref ID</th>
                <th className="p-3.5">Student & USN</th>
                <th className="p-3.5">Academic Group</th>
                <th className="p-3.5 text-right">Uniform Fee</th>
                <th className="p-3.5 text-center">Status</th>
                <th className="p-3.5">Date Initiated</th>
                <th className="p-3.5 text-right">Desk Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-slate-400" />
                    Loading cash payments ledger...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    <Banknote size={24} className="mx-auto mb-2 text-slate-300" />
                    No cash payment requests found for the selected filter.
                  </td>
                </tr>
              ) : (
                requests.map((r) => {
                  const isPending = r.paymentStatus === 'CASH PAYMENT PENDING';
                  const isReceived = r.paymentStatus === 'CASH RECEIVED';
                  const isRejected = r.paymentStatus === 'CASH PAYMENT REJECTED';

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition">
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {r.cashPaymentRefId || 'N/A'}
                          </span>
                          {r.cashPaymentRefId && (
                            <button
                              type="button"
                              onClick={() => handleCopy(r.cashPaymentRefId)}
                              title="Copy Cash Ref ID"
                              className="text-slate-400 hover:text-slate-700 p-0.5"
                            >
                              {copiedId === r.cashPaymentRefId ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="p-3.5 whitespace-nowrap">
                        <div className="font-bold text-slate-900">{r.studentName}</div>
                        <div className="font-mono text-slate-500 text-[11px]">{r.usn}</div>
                      </td>

                      <td className="p-3.5 whitespace-nowrap text-slate-600">
                        <div>
                          <strong>{r.department}</strong> · {r.yearSemester}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Sec {r.section} {r.gender ? `(${r.gender})` : ''}
                        </div>
                      </td>

                      <td className="p-3.5 text-right whitespace-nowrap">
                        <span className="font-bold text-slate-900 text-sm">
                          ₹{Number(r.expectedAmount || 0).toLocaleString('en-IN')}
                        </span>
                        {isReceived && r.actualAmountReceived && (
                          <div className="text-[10px] text-emerald-600 font-bold">
                            Received: ₹{Number(r.actualAmountReceived).toLocaleString('en-IN')}
                          </div>
                        )}
                      </td>

                      <td className="p-3.5 text-center whitespace-nowrap">
                        {isPending && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            <Clock3 size={11} /> Pending Collection
                          </span>
                        )}
                        {isReceived && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 size={11} /> Cash Received
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                            <XCircle size={11} /> Rejected
                          </span>
                        )}
                      </td>

                      <td className="p-3.5 text-slate-500 whitespace-nowrap text-[11px]">
                        {r.createdAt ? new Date(r.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'N/A'}
                      </td>

                      <td className="p-3.5 text-right whitespace-nowrap">
                        {isPending ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openConfirmModal(r)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 shadow-sm cursor-pointer"
                            >
                              Receive Cash
                            </button>
                            <button
                              type="button"
                              onClick={() => openRejectModal(r)}
                              className="px-2.5 py-1.5 rounded-lg bg-white border border-rose-300 text-rose-700 font-bold text-xs hover:bg-rose-50 cursor-pointer"
                            >
                              Reject
                            </button>
                          </div>
                        ) : isReceived ? (
                          <div className="text-right">
                            <span className="text-[11px] text-slate-500 block">Verified by: {r.verifiedBy || 'Vendor'}</span>
                            <span className="text-[10px] text-slate-400">
                              {r.verifiedAt ? new Date(r.verifiedAt).toLocaleDateString('en-IN') : ''}
                            </span>
                          </div>
                        ) : (
                          <div className="text-right">
                            <span className="text-[11px] text-rose-600 block truncate max-w-[160px]" title={r.rejectionReason}>
                              {r.rejectionReason || 'Rejected'}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── MODAL 1: CONFIRM CASH RECEIVED (WITH STRICT MISMATCH CHECK) ── */}
      {modalMode === 'CONFIRM' && selectedRequest && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-lg bg-emerald-100 text-emerald-800">
                  <Receipt size={20} />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Confirm Cash Receipt</h3>
                  <span className="font-mono text-xs text-blue-700">{selectedRequest.cashPaymentRefId}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Student Info Box */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs grid grid-cols-2 gap-2">
              <div>
                <span className="text-slate-500 block">Student Name</span>
                <strong className="text-slate-900">{selectedRequest.studentName}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">USN</span>
                <strong className="font-mono text-blue-700">{selectedRequest.usn}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Academic Group</span>
                <span className="text-slate-800">
                  {selectedRequest.department} · {selectedRequest.yearSemester} (Sec {selectedRequest.section})
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Required Uniform Fee</span>
                <strong className="text-base text-slate-900">
                  ₹{Number(selectedRequest.expectedAmount).toLocaleString('en-IN')}
                </strong>
              </div>
            </div>

            {actionError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold flex items-start gap-2">
                <AlertTriangle size={16} className="shrink-0 mt-0.5 text-rose-600" />
                <span>{actionError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmCashReceived} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Actual Cash Amount Received (₹) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  value={actionAmount}
                  onChange={(e) => {
                    setActionAmount(e.target.value);
                    setActionError('');
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-base focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                />
                <span className="text-[11px] text-slate-500 block mt-1">
                  Enforces strict amount checking: Must be exact ₹{Number(selectedRequest.expectedAmount).toLocaleString('en-IN')}.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Receipt / Desk Remarks (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g., Uniform bundle handed over to student"
                  value={actionRemarks}
                  onChange={(e) => setActionRemarks(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={cashCountedConfirm}
                  onChange={(e) => setCashCountedConfirm(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <span>
                  I confirm that I have physically counted and received <strong>₹{actionAmount || selectedRequest.expectedAmount}</strong> cash directly from this student.
                </span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 shadow-md cursor-pointer disabled:opacity-50"
                >
                  {submittingAction ? 'Recording...' : 'Confirm Cash Received'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 2: REJECT CASH PAYMENT ── */}
      {modalMode === 'REJECT' && selectedRequest && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-lg bg-rose-100 text-rose-800">
                  <XCircle size={20} />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Reject Cash Payment Request</h3>
                  <span className="font-mono text-xs text-blue-700">{selectedRequest.cashPaymentRefId}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
              Student: <strong>{selectedRequest.studentName}</strong> ({selectedRequest.usn}) · Fee: ₹{selectedRequest.expectedAmount}
            </div>

            {actionError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold">
                {actionError}
              </div>
            )}

            <form onSubmit={handleRejectCashPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mandatory Rejection Reason <span className="text-rose-500">*</span>
                </label>
                <select
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none mb-2"
                  required
                >
                  <option value="">Select reason...</option>
                  <option value="Student did not bring required cash amount">Student did not bring required cash amount</option>
                  <option value="Student requested payment mode cancellation">Student requested payment mode cancellation</option>
                  <option value="Assigned academic group or section mismatch">Assigned academic group or section mismatch</option>
                  <option value="Uniform out of stock for requested size">Uniform out of stock for requested size</option>
                  <option value="Other (specify below)">Other (specify below)</option>
                </select>

                <textarea
                  placeholder="Provide detailed explanation or custom reason..."
                  value={actionRemarks}
                  onChange={(e) => setActionRemarks(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-5 py-2 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 shadow-md cursor-pointer disabled:opacity-50"
                >
                  {submittingAction ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


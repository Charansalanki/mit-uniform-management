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
  TrendingUp,
  CreditCard,
  Building,
  ShieldCheck,
  ArrowUpRight
} from 'lucide-react';

interface Props {
  apiBaseUrl?: string;
}

export default function AdminCashPaymentController({ apiBaseUrl }: Props) {
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [metrics, setMetrics] = useState({
    totalCashRequests: 0,
    pendingCashRequests: 0,
    confirmedCashReceived: 0,
    rejectedCashRequests: 0,
    totalCashRevenueCollected: 0,
    pendingCashAmount: 0
  });

  const [financialBreakdown, setFinancialBreakdown] = useState({
    upiRevenue: 0,
    cashRevenue: 0,
    totalCollectedRevenue: 0,
    pendingCashAmount: 0,
    verifiedUpiCount: 0,
    confirmedCashCount: 0
  });

  const [statusFilter, setStatusFilter] = useState('ALL');
  const [vendorFilter, setVendorFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getAdminCashPayments({
        status: statusFilter,
        vendorId: vendorFilter,
        search: searchQuery
      });
      if (data.success) {
        setSubmissions(data.submissions || []);
        setMetrics(data.metrics || {
          totalCashRequests: 0,
          pendingCashRequests: 0,
          confirmedCashReceived: 0,
          rejectedCashRequests: 0,
          totalCashRevenueCollected: 0,
          pendingCashAmount: 0
        });
        setFinancialBreakdown(data.financialBreakdown || {
          upiRevenue: 0,
          cashRevenue: 0,
          totalCollectedRevenue: 0,
          pendingCashAmount: 0,
          verifiedUpiCount: 0,
          confirmedCashCount: 0
        });
      }
    } catch (err) {
      console.error('Failed to load admin cash payments:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, vendorFilter, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const totalCollected = financialBreakdown.totalCollectedRevenue || 1;
  const upiPercent = Math.round((financialBreakdown.upiRevenue / totalCollected) * 100) || 0;
  const cashPercent = Math.round((financialBreakdown.cashRevenue / totalCollected) * 100) || 0;

  // Extract unique vendors for filter dropdown
  const uniqueVendors = Array.from(
    new Map(
      submissions
        .filter((s) => s.vendorId)
        .map((s) => [s.vendorId, { id: s.vendorId, name: s.vendorName || s.vendorId }])
    ).values()
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── Top Header Strip ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ padding: '6px', borderRadius: '8px', background: '#dcfce7', color: '#166534', display: 'flex' }}>
              <Banknote size={20} />
            </span>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Direct Cash Payment Controller & Audit Ledger
            </h2>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
            Official administration ledger for vendor cash collections, mismatch prevention, and separate UPI vs Cash financial audit.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadData()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 700,
            color: '#334155',
            cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
          }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* ── 5 Metric Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Total Cash Requests
          </span>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>
            {metrics.totalCashRequests}
          </div>
        </div>

        <div style={{ background: '#fffbeb', padding: '16px', borderRadius: '12px', border: '1px solid #fde68a', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Pending Collection
            </span>
            <Clock3 size={15} color="#d97706" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#78350f', marginTop: '4px' }}>
            {metrics.pendingCashRequests}
          </div>
          <div style={{ fontSize: '11px', color: '#b45309', marginTop: '2px' }}>
            ₹{metrics.pendingCashAmount.toLocaleString('en-IN')} pending
          </div>
        </div>

        <div style={{ background: '#ecfdf5', padding: '16px', borderRadius: '12px', border: '1px solid #a7f3d0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Confirmed Received
            </span>
            <CheckCircle2 size={15} color="#059669" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#064e3b', marginTop: '4px' }}>
            {metrics.confirmedCashReceived}
          </div>
          <div style={{ fontSize: '11px', color: '#047857', marginTop: '2px' }}>
            Verified by Vendors
          </div>
        </div>

        <div style={{ background: '#fef2f2', padding: '16px', borderRadius: '12px', border: '1px solid #fecaca', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Rejected Requests
            </span>
            <XCircle size={15} color="#dc2626" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#7f1d1d', marginTop: '4px' }}>
            {metrics.rejectedCashRequests}
          </div>
          <div style={{ fontSize: '11px', color: '#b91c1c', marginTop: '2px' }}>
            Cancelled / Wrong Desk
          </div>
        </div>

        <div style={{ background: '#0f172a', color: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #1e293b', boxShadow: '0 2px 6px rgba(0,0,0,0.08)' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Cash Revenue Collected
          </span>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', marginTop: '4px' }}>
            ₹{metrics.totalCashRevenueCollected.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
            Pending excluded
          </div>
        </div>
      </div>

      {/* ── SEPARATE FINANCIAL REVENUE REPORT (UPI VS. CASH COMPARISON) ── */}
      <div style={{ background: '#f8fafc', padding: '18px 22px', borderRadius: '14px', border: '1.5px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={16} color="#2563eb" />
              Unified Institutional Uniform Revenue Reconciliation (UPI vs. Cash)
            </h3>
            <span style={{ fontSize: '11.5px', color: '#64748b' }}>
              Official comparison of direct digital collections (UPI) versus vendor-collected physical cash.
            </span>
          </div>

          <div style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
            Total Collected: ₹{financialBreakdown.totalCollectedRevenue.toLocaleString('en-IN')}
          </div>
        </div>

        {/* Visual Progress Bar Split */}
        <div style={{ height: '14px', borderRadius: '7px', background: '#e2e8f0', display: 'flex', overflow: 'hidden', marginBottom: '14px' }}>
          <div
            style={{ width: `${upiPercent}%`, background: '#2563eb', transition: 'width 0.4s ease' }}
            title={`Online UPI: ${upiPercent}% (₹${financialBreakdown.upiRevenue})`}
          />
          <div
            style={{ width: `${cashPercent}%`, background: '#10b981', transition: 'width 0.4s ease' }}
            title={`Physical Cash: ${cashPercent}% (₹${financialBreakdown.cashRevenue})`}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', fontSize: '12px' }}>
          <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1e40af', fontWeight: 800 }}>
              <CreditCard size={14} /> Online UPI Revenue ({upiPercent}%)
            </div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#1e3a8a', marginTop: '4px' }}>
              ₹{financialBreakdown.upiRevenue.toLocaleString('en-IN')}
            </div>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              {financialBreakdown.verifiedUpiCount} verified bank credits
            </span>
          </div>

          <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '10px', border: '1px solid #a7f3d0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#065f46', fontWeight: 800 }}>
              <Banknote size={14} /> Direct Cash Revenue ({cashPercent}%)
            </div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#064e3b', marginTop: '4px' }}>
              ₹{financialBreakdown.cashRevenue.toLocaleString('en-IN')}
            </div>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              {financialBreakdown.confirmedCashCount} confirmed cash payments
            </span>
          </div>

          <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '10px', border: '1px solid #fde68a' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#92400e', fontWeight: 800 }}>
              <Clock3 size={14} /> Uncollected Cash Pipeline
            </div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#78350f', marginTop: '4px' }}>
              ₹{financialBreakdown.pendingCashAmount.toLocaleString('en-IN')}
            </div>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              {metrics.pendingCashRequests} students with pending cash slips
            </span>
          </div>
        </div>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', background: '#ffffff', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Status Buttons */}
          {[
            { id: 'ALL', label: 'All Requests' },
            { id: 'CASH PAYMENT PENDING', label: 'Pending' },
            { id: 'CASH RECEIVED', label: 'Received' },
            { id: 'CASH PAYMENT REJECTED', label: 'Rejected' }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                background: statusFilter === tab.id ? '#0f172a' : '#f1f5f9',
                color: statusFilter === tab.id ? '#ffffff' : '#475569',
                border: 'none'
              }}
            >
              {tab.label}
            </button>
          ))}

          {/* Vendor Filter */}
          {uniqueVendors.length > 0 && (
            <select
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155'
              }}
            >
              <option value="ALL">All Vendors</option>
              {uniqueVendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', width: '260px' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search USN, name, cash ref..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 10px 6px 30px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '12px',
              boxSizing: 'border-box'
            }}
          />
        </div>
      </div>

      {/* ── Cash Requests Ledger Table ── */}
      <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 800, textTransform: 'uppercase', fontSize: '11px', whiteSpace: 'nowrap' }}>
                <th style={{ padding: '12px 14px' }}>Cash Ref ID</th>
                <th style={{ padding: '12px 14px' }}>Student & USN</th>
                <th style={{ padding: '12px 14px' }}>Academic Group</th>
                <th style={{ padding: '12px 14px' }}>Assigned Vendor</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Fee Amount</th>
                <th style={{ padding: '12px 14px', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '12px 14px' }}>Initiated At</th>
                <th style={{ padding: '12px 14px' }}>Verification Audit</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                    Loading cash payments records...
                  </td>
                </tr>
              ) : submissions.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                    No cash payment records found matching criteria.
                  </td>
                </tr>
              ) : (
                submissions.map((sub) => {
                  const isPending = sub.paymentStatus === 'CASH PAYMENT PENDING';
                  const isReceived = sub.paymentStatus === 'CASH RECEIVED';
                  const isRejected = sub.paymentStatus === 'CASH PAYMENT REJECTED';

                  return (
                    <tr key={sub.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#1d4ed8', background: '#eff6ff', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
                            {sub.cashPaymentRefId || 'N/A'}
                          </span>
                          {sub.cashPaymentRefId && (
                            <button
                              type="button"
                              onClick={() => handleCopy(sub.cashPaymentRefId)}
                              title="Copy ID"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#64748b' }}
                            >
                              {copiedId === sub.cashPaymentRefId ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                            </button>
                          )}
                        </div>
                      </td>

                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <strong style={{ color: '#0f172a', display: 'block' }}>{sub.studentName}</strong>
                        <span style={{ fontFamily: 'monospace', color: '#64748b', fontSize: '11px' }}>{sub.usn}</span>
                      </td>

                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: '#334155' }}>
                        <div>{sub.course} · <strong>{sub.department}</strong></div>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>{sub.yearSemester} (Sec {sub.section}) {sub.gender ? `• ${sub.gender}` : ''}</span>
                      </td>

                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <strong style={{ color: '#0f172a', display: 'block' }}>{sub.vendorName || 'Assigned Vendor'}</strong>
                        <span style={{ fontFamily: 'monospace', color: '#2563eb', fontSize: '11px' }}>{sub.vendorId || ''}</span>
                      </td>

                      <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '13px' }}>
                          ₹{Number(sub.expectedAmount || 0).toLocaleString('en-IN')}
                        </span>
                        {isReceived && sub.actualAmountReceived && (
                          <div style={{ fontSize: '10.5px', color: '#16a34a', fontWeight: 700 }}>
                            Rec: ₹{Number(sub.actualAmountReceived).toLocaleString('en-IN')}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {isPending && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, background: '#fef3c7', color: '#92400e', border: '1px solid #fde047' }}>
                            <Clock3 size={11} /> Pending Collection
                          </span>
                        )}
                        {isReceived && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}>
                            <CheckCircle2 size={11} /> Cash Received
                          </span>
                        )}
                        {isRejected && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}>
                            <XCircle size={11} /> Rejected
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '12px 14px', color: '#64748b', whiteSpace: 'nowrap', fontSize: '11px' }}>
                        {sub.createdAt ? new Date(sub.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                      </td>

                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', fontSize: '11px' }}>
                        {isReceived ? (
                          <div>
                            <span style={{ color: '#065f46', fontWeight: 700, display: 'block' }}>
                              Verified by: {sub.verifiedBy || sub.vendorName}
                            </span>
                            <span style={{ color: '#64748b', fontSize: '10.5px' }}>
                              {sub.verifiedAt ? new Date(sub.verifiedAt).toLocaleDateString('en-IN') : ''}
                            </span>
                          </div>
                        ) : isRejected ? (
                          <div>
                            <span style={{ color: '#991b1b', fontWeight: 700, display: 'block' }}>
                              Rejected
                            </span>
                            <span style={{ color: '#64748b', fontSize: '10.5px' }} title={sub.rejectionReason}>
                              {sub.rejectionReason || 'Reason not logged'}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: '#b45309', fontWeight: 600 }}>Awaiting Student at Vendor Desk</span>
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
    </div>
  );
}

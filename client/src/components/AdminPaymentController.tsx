import React, { useState, useEffect, useCallback } from 'react';
import { useAuthenticatedSse } from '../hooks/useAuthenticatedSse';
import { DEPARTMENTS } from '../mockData';
import {
  PaymentConfig,
  PaymentConfigHistory,
  PaymentMethod,
  PaymentSubmission,
  PaymentAuditLog,
  PaymentStats,
  PaymentStatus,
  ReconciliationStatus
} from '../types';
import { api } from '../api';
import { AdminVendorManagement } from './AdminVendorManagement';
import AdminVendorTransactionExplorer from './admin/AdminVendorTransactionExplorer';
import {
  CreditCard,
  QrCode,
  CheckCircle2,
  Clock3,
  AlertCircle,
  FileSpreadsheet,
  ShieldAlert,
  Search,
  Filter,
  Eye,
  Edit3,
  Trash2,
  Upload,
  RefreshCw,
  X,
  Check,
  TrendingUp,
  ExternalLink,
  ShieldCheck,
  Download,
  Store,
  History
} from 'lucide-react';

const STATUS_PILL: Record<string, { bg: string; text: string; border: string }> = {
  'Payment Verified': { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
  'Verified': { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
  'Payment Submitted': { bg: '#ffedd5', text: '#9a3412', border: '#fdba74' },
  'Submitted': { bg: '#ffedd5', text: '#9a3412', border: '#fdba74' },
  'Under Verification': { bg: '#fef3c7', text: '#854d0e', border: '#fde047' },
  'Payment Rejected': { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' },
  'Rejected': { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' },
  'Payment Not Received': { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  'Not Paid': { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' }
};

const RECON_PILL: Record<ReconciliationStatus, { bg: string; text: string; border: string }> = {
  Matched: { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
  Unmatched: { bg: '#f8fafc', text: '#475569', border: '#cbd5e1' },
  Suspicious: { bg: '#fef2f2', text: '#b91c1c', border: '#fca5a5' },
  Unchecked: { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' }
};

export type PaymentControllerTab =
  | 'VENDOR_MANAGEMENT'
  | 'VERIFICATION'
  | 'RECONCILIATION'
  | 'AUDIT'
  | 'VENDOR_TRANSACTIONS';

interface AdminPaymentControllerProps {
  initialTab?: PaymentControllerTab;
  activeTab?: PaymentControllerTab;
  onTabChange?: (tab: PaymentControllerTab) => void;
  onStatsLoaded?: (stats: PaymentStats) => void;
}

export function AdminPaymentController({
  initialTab = 'VENDOR_MANAGEMENT',
  activeTab: controlledTab,
  onTabChange,
  onStatsLoaded
}: AdminPaymentControllerProps) {
  const [internalTab, setInternalTab] = useState<PaymentControllerTab>(initialTab);
  const activeTab = controlledTab !== undefined ? controlledTab : internalTab;

  const setActiveTab = (tab: PaymentControllerTab) => {
    setInternalTab(tab);
    if (onTabChange) onTabChange(tab);
    if (tab === 'AUDIT') loadAuditLogs();
  };

  useEffect(() => {
    if (initialTab) {
      setInternalTab(initialTab);
    }
  }, [initialTab]);
  const [stats, setStats] = useState<PaymentStats>({
    totalSubmissions: 0,
    verifiedPayments: 0,
    pendingVerification: 0,
    rejectedPayments: 0,
    totalVerifiedCollection: 0,
    activePaymentMethods: 0,
    pendingByMethod: {},
    flaggedMismatches: 0
  });
  const [config, setConfig] = useState<PaymentConfig>({
    uniformAmount: 1500,
    beneficiaryName: 'Maharaja Institute of Technology Mysore',
    paymentInstructions: '',
    referenceInstructions: '',
    additionalInstructions: ''
  });
  const [configHistory, setConfigHistory] = useState<PaymentConfigHistory[]>([]);
  const [scanners, setScanners] = useState<PaymentMethod[]>([]);

  // Submissions & Filters
  const [submissions, setSubmissions] = useState<PaymentSubmission[]>([]);
  const [filters, setFilters] = useState({
    search: '',
    department: 'ALL',
    paymentMethod: 'ALL',
    paymentStatus: 'ALL',
    reconciliationStatus: 'ALL',
    startDate: '',
    endDate: ''
  });

  // Verification Modal
  const [inspectModal, setInspectModal] = useState<PaymentSubmission | null>(null);
  const [bankVerifiedAmount, setBankVerifiedAmount] = useState<number | ''>('');
  const [bankChecklist, setBankChecklist] = useState({
    checkedBankApp: false,
    matchedAmountAndUtr: false,
    confirmedCreditStatus: false
  });
  const [modalRemarks, setModalRemarks] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  // Revise Requirement Modal
  const [reviseModal, setReviseModal] = useState<{
    submission: PaymentSubmission;
    newExpectedAmount: number;
    newPaidAmount: number;
    reason: string;
  } | null>(null);

  // Reconciliation & Audit Logs
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [reconReport, setReconReport] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<PaymentAuditLog[]>([]);

  const [banner, setBanner] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const showNotice = (type: 'error' | 'success', text: string) => {
    setBanner({ type, text });
    setTimeout(() => setBanner(null), 5000);
  };

  const loadControllerDashboard = useCallback(async () => {
    try {
      await api.ensureAdminToken();
      const data = await api.getAdminPaymentConfig();
      if (data.success) {
        setStats(data.stats);
        if (onStatsLoaded) onStatsLoaded(data.stats);
        setConfig(data.config);
        setScanners(data.scanners || []);
        setConfigHistory(data.history || []);
      }
    } catch (err: any) {
      console.warn('Failed to load payment controller:', err);
    }
  }, [onStatsLoaded]);

  const loadSubmissions = useCallback(async () => {
    try {
      const data = await api.getPaymentSubmissions(filters);
      if (data.success) {
        setSubmissions(data.submissions || []);
      }
    } catch (err: any) {
      console.warn('Failed to load submissions:', err);
    }
  }, [filters]);

  const loadAuditLogs = useCallback(async () => {
    try {
      const data = await api.getPaymentAuditLogs();
      if (data.success) setAuditLogs(data.logs || []);
    } catch (err: any) {
      console.warn('Failed to load audit logs:', err);
    }
  }, []);

  useEffect(() => {
    loadControllerDashboard();
    loadSubmissions();
  }, [loadControllerDashboard, loadSubmissions]);

  useEffect(() => {
    if (activeTab === 'AUDIT') {
      loadAuditLogs();
    }
  }, [activeTab, loadAuditLogs]);

  // Real-time Admin Server-Sent Events (SSE) Stream
  useAuthenticatedSse({
    streamPath: '/api/sse/admin',
    jwtToken: localStorage.getItem('mit_uniform_admin_token_v1') || localStorage.getItem('adminToken') || '',
    eventHandlers: {
      NEW_STUDENT_REGISTERED: () => {
        loadSubmissions();
        loadControllerDashboard();
      },
      NEW_PAYMENT_SUBMITTED: () => {
        loadSubmissions();
        loadControllerDashboard();
      },
      PAYMENT_STATUS_UPDATED: () => {
        loadSubmissions();
        loadControllerDashboard();
      },
      PAYMENT_CONFIG_CHANGED: () => {
        loadControllerDashboard();
      }
    }
  });

  const handleSaveAmountConfig = async (payload: Partial<PaymentConfig> & { changeSummary?: string }) => {
    try {
      setBusy(true);
      await api.updatePaymentConfig({
        ...config,
        ...payload
      });
      showNotice('success', 'Payment configuration updated successfully and versioned in audit history.');
      await loadControllerDashboard();
    } catch (err: any) {
      showNotice('error', err.message || 'Failed to update payment configuration.');
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const handleToggleCollection = async (isCollectionEnabled: boolean, unavailableMessage?: string) => {
    try {
      setBusy(true);
      await api.toggleCollectionStatus(isCollectionEnabled, unavailableMessage);
      showNotice(
        'success',
        `Payment collection is now ${isCollectionEnabled ? 'ACTIVE (Accepting Submissions)' : 'PAUSED (All Submissions Blocked with 503)'}.`
      );
      await loadControllerDashboard();
    } catch (err: any) {
      showNotice('error', err.message || 'Failed to update collection status.');
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const handleReviseRequirement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviseModal) return;
    if (!reviseModal.reason.trim()) {
      showNotice('error', 'A mandatory revision reason is required.');
      return;
    }
    if (!reviseModal.newExpectedAmount || reviseModal.newExpectedAmount <= 0) {
      showNotice('error', 'New expected amount must be greater than ₹0.');
      return;
    }

    try {
      setBusy(true);
      await api.revisePaymentRequirement(
        reviseModal.submission.id,
        reviseModal.newExpectedAmount,
        reviseModal.reason.trim(),
        reviseModal.newPaidAmount
      );
      showNotice('success', `Payment requirement and recorded amount updated for USN ${reviseModal.submission.usn}.`);
      setReviseModal(null);
      loadSubmissions();
      loadControllerDashboard();
    } catch (err: any) {
      showNotice('error', err.message || 'Failed to revise requirement.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifySubmission = async () => {
    if (!inspectModal) return;
    setModalError(null);
    if (
      !bankChecklist.checkedBankApp ||
      !bankChecklist.matchedAmountAndUtr ||
      !bankChecklist.confirmedCreditStatus
    ) {
      const msg = 'Please complete all 3 manual bank verification checklist items before marking the payment as verified.';
      setModalError(msg);
      showNotice('error', msg);
      return;
    }

    if (bankVerifiedAmount === '' || isNaN(Number(bankVerifiedAmount)) || Number(bankVerifiedAmount) <= 0) {
      const msg = 'Please enter a valid positive credited amount confirmed in the bank statement.';
      setModalError(msg);
      showNotice('error', msg);
      return;
    }

    try {
      setBusy(true);
      await api.verifyPaymentSubmission(
        inspectModal.id,
        modalRemarks,
        Number(bankVerifiedAmount)
      );
      showNotice('success', `Payment for USN ${inspectModal.usn} (₹${bankVerifiedAmount}) marked as PAYMENT VERIFIED.`);
      setInspectModal(null);
      setModalError(null);
      loadControllerDashboard();
      loadSubmissions();
    } catch (err: any) {
      const msg = err.message || 'Verification failed.';
      setModalError(msg);
      showNotice('error', msg);
    } finally {
      setBusy(false);
    }
  };

  const handleRejectSubmission = async () => {
    if (!inspectModal) return;
    setModalError(null);
    if (!rejectionReason.trim()) {
      const msg = 'A rejection reason is mandatory when rejecting a payment.';
      setModalError(msg);
      showNotice('error', msg);
      return;
    }

    try {
      setBusy(true);
      await api.rejectPaymentSubmission(inspectModal.id, rejectionReason.trim(), modalRemarks.trim());
      showNotice('success', `Payment for USN ${inspectModal.usn} marked as PAYMENT REJECTED.`);
      setInspectModal(null);
      setModalError(null);
      loadControllerDashboard();
      loadSubmissions();
    } catch (err: any) {
      const msg = err.message || 'Rejection failed.';
      setModalError(msg);
      showNotice('error', msg);
    } finally {
      setBusy(false);
    }
  };

  const handleRunCsvReconciliation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) {
      showNotice('error', 'Please select an official bank statement CSV file first.');
      return;
    }

    try {
      setBusy(true);
      const formData = new FormData();
      formData.append('statementCsv', csvFile);
      const data = await api.uploadReconciliationCsv(formData);
      setReconReport(data.report);
      showNotice('success', 'Bank statement CSV parsed. Review categorized records below.');
      loadSubmissions();
    } catch (err: any) {
      showNotice('error', err.message || 'Failed to process CSV file.');
    } finally {
      setBusy(false);
    }
  };

  const openVerificationModal = (sub: PaymentSubmission) => {
    setInspectModal(sub);
    setBankVerifiedAmount(sub.amount);
    setModalRemarks(sub.adminRemarks || '');
    setRejectionReason(sub.rejectionReason || '');
    setBankChecklist({
      checkedBankApp: false,
      matchedAmountAndUtr: false,
      confirmedCreditStatus: false
    });
    setModalError(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* ── Top Header Bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', background: '#ffffff', padding: '20px 24px', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CreditCard size={22} style={{ color: '#2563eb' }} /> PAYMENT CONTROLLER
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
            Direct UPI QR Management · Manual Bank Statement Verification · Fraud Prevention · CSV Reconciliation
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: '#eff6ff',
              border: '1.5px solid #bfdbfe',
              borderRadius: '10px',
              color: '#1e40af',
              fontSize: '12px',
              fontWeight: 800
            }}
          >
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Active Module:
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              {activeTab === 'VENDOR_MANAGEMENT' && <Store size={14} />}
              {activeTab === 'VERIFICATION' && <CheckCircle2 size={14} />}
              {activeTab === 'RECONCILIATION' && <FileSpreadsheet size={14} />}
              {activeTab === 'AUDIT' && <ShieldAlert size={14} />}
              {activeTab === 'VENDOR_TRANSACTIONS' && <History size={14} />}
              {activeTab === 'VENDOR_MANAGEMENT' && 'Vendor Management & Allocations'}
              {activeTab === 'VERIFICATION' && `Bank Verification (${stats.pendingVerification})`}
              {activeTab === 'RECONCILIATION' && 'Bank CSV Reconciliation'}
              {activeTab === 'AUDIT' && 'Security Audit Logs'}
              {activeTab === 'VENDOR_TRANSACTIONS' && 'Vendor Transaction History'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Alert Banner ── */}
      {banner && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: banner.type === 'error' ? '#fef2f2' : '#ecfdf5',
            color: banner.type === 'error' ? '#991b1b' : '#065f46',
            border: `1px solid ${banner.type === 'error' ? '#fca5a5' : '#a7f3d0'}`
          }}
        >
          <span>{banner.text}</span>
          <button onClick={() => setBanner(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 800 }}>✕</button>
        </div>
      )}

      {/* ── 7 Real-Time Statistics Cards (Hidden when in Vendor Management or Vendor Transactions to allow dedicated explorer stats to shine) ── */}
      {activeTab !== 'VENDOR_MANAGEMENT' && activeTab !== 'VENDOR_TRANSACTIONS' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px' }}>
          <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Submissions</div>
            <div style={{ fontSize: '26px', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>{stats.totalSubmissions}</div>
          </div>

          <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #bbf7d0', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase' }}>Verified Payments</div>
            <div style={{ fontSize: '26px', fontWeight: 900, color: '#16a34a', marginTop: '4px' }}>{stats.verifiedPayments}</div>
          </div>

          <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #fed7aa', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#ea580c', textTransform: 'uppercase' }}>Pending Verification</div>
            <div style={{ fontSize: '26px', fontWeight: 900, color: '#ea580c', marginTop: '4px' }}>{stats.pendingVerification}</div>
          </div>

          <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #fecaca', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase' }}>Rejected Payments</div>
            <div style={{ fontSize: '26px', fontWeight: 900, color: '#dc2626', marginTop: '4px' }}>{stats.rejectedPayments}</div>
          </div>

          <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #bfdbfe', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' }}>Verified Collection</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#2563eb', marginTop: '4px' }}>
              ₹{Number(stats.totalVerifiedCollection).toLocaleString('en-IN')}
            </div>
          </div>

          <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #fed7aa', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#c2410c', textTransform: 'uppercase' }}>Flagged Mismatches</div>
            <div style={{ fontSize: '26px', fontWeight: 900, color: '#c2410c', marginTop: '4px' }}>
              {stats.flaggedMismatches || 0}
            </div>
          </div>

          <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Active Methods</div>
            <div style={{ fontSize: '26px', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>
              {stats.activePaymentMethods} / 3
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB: VENDOR MANAGEMENT & EXCLUSIVE GROUP ALLOCATIONS        */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'VENDOR_MANAGEMENT' && (
        <AdminVendorManagement />
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB 2: MANUAL BANK TRANSACTION VERIFICATION TABLE          */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'VERIFICATION' && (
        <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          {/* Filters Bar */}
          <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <input
              type="text"
              placeholder="Search USN, UTR, Reg ID, Name..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              style={{ gridColumn: 'span 2', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#fff' }}
            />
            <select
              value={filters.department}
              onChange={(e) => setFilters({ ...filters, department: e.target.value })}
              style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#fff' }}
            >
              <option value="ALL">All Departments</option>
              <optgroup label="Undergraduate Engineering (B.E.)">
                {DEPARTMENTS.filter((d) => d.category === 'Undergraduate (B.E.)').map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code} – {d.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Postgraduate Programs">
                {DEPARTMENTS.filter((d) => d.category === 'Postgraduate').map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code} – {d.name}
                  </option>
                ))}
              </optgroup>
            </select>
            <select
              value={filters.paymentMethod}
              onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}
              style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#fff' }}
            >
              <option value="ALL">All UPI Methods</option>
              <option value="GPAY">Google Pay</option>
              <option value="PHONEPE">PhonePe</option>
              <option value="PAYTM">Paytm</option>
            </select>
            <select
              value={filters.paymentStatus}
              onChange={(e) => setFilters({ ...filters, paymentStatus: e.target.value })}
              style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#fff' }}
            >
              <option value="ALL">All Payment Statuses</option>
              <option value="Payment Submitted">Payment Submitted</option>
              <option value="Under Verification">Under Verification</option>
              <option value="Payment Verified">Payment Verified</option>
              <option value="Payment Rejected">Payment Rejected</option>
            </select>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#fff' }}
            />
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', color: '#475569', fontWeight: 800, textTransform: 'uppercase', fontSize: '11px', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 16px' }}>Student / USN</th>
                  <th style={{ padding: '12px 16px' }}>Reg ID</th>
                  <th style={{ padding: '12px 16px' }}>Dept / Year / Sec</th>
                  <th style={{ padding: '12px 16px' }}>Method</th>
                  <th style={{ padding: '12px 16px' }}>Amount</th>
                  <th style={{ padding: '12px 16px' }}>UTR Reference</th>
                  <th style={{ padding: '12px 16px' }}>Proof</th>
                  <th style={{ padding: '12px 16px' }}>Submitted</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px' }}>CSV Match</th>
                  <th style={{ padding: '12px 16px' }}>Remarks</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {submissions.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                      No payment submissions match the current filters.
                    </td>
                  </tr>
                ) : (
                  submissions.map((sub) => {
                    const statusSt = STATUS_PILL[sub.paymentStatus] || STATUS_PILL['Not Paid'];
                    const reconSt = RECON_PILL[sub.reconciliationStatus || 'Unchecked'];
                    return (
                      <tr key={sub.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <strong style={{ color: '#0f172a', display: 'block' }}>{sub.studentName}</strong>
                          <span style={{ fontFamily: 'monospace', color: '#64748b' }}>{sub.usn}</span>
                        </td>
                        <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#64748b' }}>
                          #{sub.registrationId.slice(-8).toUpperCase()}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#334155' }}>
                          {sub.department} · {sub.yearSemester} ({sub.section})
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0f172a' }}>{sub.paymentMethod}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 800, color: '#0f172a' }}>
                          <div>₹{Number(sub.amount).toLocaleString('en-IN')}</div>
                          {sub.expectedAmount !== undefined && sub.expectedAmount !== sub.amount && (
                            <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 500 }}>
                              Req: ₹{Number(sub.expectedAmount).toLocaleString('en-IN')}
                            </div>
                          )}
                          {sub.amountMismatchFlag && (
                            <span style={{ display: 'inline-block', marginTop: '2px', padding: '1px 6px', borderRadius: '4px', background: '#fee2e2', color: '#b91c1c', fontSize: '9px', fontWeight: 800 }}>
                              MISMATCH
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 800, color: '#2563eb' }}>
                          {sub.utrNumber}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <button
                            type="button"
                            onClick={() => openVerificationModal(sub)}
                            style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                          >
                            View Proof
                          </button>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#64748b' }}>
                          {new Date(sub.createdAt).toLocaleDateString('en-IN')}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, background: statusSt.bg, color: statusSt.text, border: `1px solid ${statusSt.border}` }}>
                            {sub.paymentStatus}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: reconSt.bg, color: reconSt.text, border: `1px solid ${reconSt.border}` }}>
                            {sub.reconciliationStatus || 'Unchecked'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#64748b' }}>
                          {sub.rejectionReason || sub.adminRemarks || '—'}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => openVerificationModal(sub)}
                              style={{ padding: '6px 10px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '11px', cursor: 'pointer' }}
                            >
                              Verify
                            </button>
                            <button
                              type="button"
                              onClick={() => setReviseModal({ submission: sub, newExpectedAmount: sub.expectedAmount || sub.amount, newPaidAmount: sub.amount, reason: '' })}
                              style={{ padding: '6px 10px', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: 700, fontSize: '11px', cursor: 'pointer' }}
                            >
                              Revise / Adjust
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB 3: BANK STATEMENT CSV RECONCILIATION ASSISTANCE TOOL   */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'RECONCILIATION' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ background: '#ffffff', padding: '24px', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                BANK STATEMENT RECONCILIATION (ASSISTANCE TOOL)
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.6 }}>
                Upload the official MIT Mysore bank account transaction statement CSV. This tool flags <strong>Matched</strong>, <strong>Unmatched</strong>, and <strong>Suspicious</strong> transactions to assist verification. <strong>It never auto-approves payments</strong> — an administrator must still manually confirm each payment.
              </p>
            </div>

            <form onSubmit={handleRunCsvReconciliation} style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <label
                htmlFor="admin-csv-file-input"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 16px',
                  background: '#eff6ff',
                  border: '1.5px solid #3b82f6',
                  borderRadius: '8px',
                  color: '#1d4ed8',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(37, 99, 235, 0.1)',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#dbeafe')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#eff6ff')}
              >
                <FileSpreadsheet size={15} color="#2563eb" />
                <span>{csvFile ? `Selected: ${csvFile.name}` : 'Choose Bank Statement CSV'}</span>
              </label>
              <input
                id="admin-csv-file-input"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                style={{ display: 'none' }}
              />
              <button
                type="submit"
                disabled={busy || !csvFile}
                style={{
                  padding: '9px 18px',
                  background: busy || !csvFile ? '#94a3b8' : '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: busy || !csvFile ? 'not-allowed' : 'pointer'
                }}
              >
                {busy ? 'Analyzing Statement...' : 'Upload & Compare CSV'}
              </button>
            </form>
          </div>

          {reconReport && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              {/* Category 1: Matched */}
              <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #bbf7d0', padding: '18px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 800, color: '#166534' }}>
                  1. Matched ({reconReport.matched?.length || 0})
                </h4>
                <p style={{ margin: '0 0 12px 0', fontSize: '11px', color: '#64748b' }}>
                  UTR and exact amount found in bank CSV. Click Inspect in the Verification tab to manually confirm.
                </p>
                <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(reconReport.matched || []).map((item: any) => (
                    <div key={item.submissionId} style={{ padding: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '11px' }}>
                      <strong style={{ color: '#0f172a' }}>{item.usn} — ₹{item.bankAmount}</strong>
                      <div style={{ fontFamily: 'monospace', color: '#15803d', fontWeight: 700 }}>UTR: {item.utrNumber}</div>
                      <div style={{ color: '#64748b', marginTop: '2px' }}>Bank Date: {item.bankDate} · Status: {item.paymentStatus}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Category 2: Unmatched */}
              <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '18px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 800, color: '#334155' }}>
                  2. Unmatched ({reconReport.unmatchedSubmissions?.length || 0})
                </h4>
                <p style={{ margin: '0 0 12px 0', fontSize: '11px', color: '#64748b' }}>
                  Student submissions with no matching UTR credit in the uploaded statement.
                </p>
                <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(reconReport.unmatchedSubmissions || []).map((item: any) => (
                    <div key={item.submissionId} style={{ padding: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '11px' }}>
                      <strong style={{ color: '#0f172a' }}>{item.usn} — ₹{item.submittedAmount}</strong>
                      <div style={{ fontFamily: 'monospace', color: '#475569', fontWeight: 700 }}>UTR: {item.utrNumber}</div>
                      <div style={{ color: '#ea580c', marginTop: '2px' }}>{item.reason}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Category 3: Suspicious */}
              <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #fecaca', padding: '18px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 800, color: '#991b1b' }}>
                  3. Suspicious ({reconReport.suspicious?.length || 0})
                </h4>
                <p style={{ margin: '0 0 12px 0', fontSize: '11px', color: '#64748b' }}>
                  Duplicate UTRs or mismatched credit amounts requiring strict scrutiny.
                </p>
                <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(reconReport.suspicious || []).map((item: any) => (
                    <div key={item.submissionId} style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '11px' }}>
                      <strong style={{ color: '#991b1b' }}>{item.usn}</strong>
                      <div style={{ fontFamily: 'monospace', color: '#b91c1c', fontWeight: 700 }}>UTR: {item.utrNumber}</div>
                      <div style={{ color: '#dc2626', marginTop: '2px', fontWeight: 700 }}>{item.reason}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB 4: IMMUTABLE SECURITY AUDIT LOGS                        */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'AUDIT' && (
        <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
              Payment Security & Administrator Audit History
            </h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', color: '#475569', fontWeight: 800, textTransform: 'uppercase', fontSize: '11px', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 16px' }}>Timestamp</th>
                  <th style={{ padding: '12px 16px' }}>Actor</th>
                  <th style={{ padding: '12px 16px' }}>Action</th>
                  <th style={{ padding: '12px 16px' }}>Previous Value</th>
                  <th style={{ padding: '12px 16px' }}>New Value</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px', color: '#64748b' }}>
                      {new Date(log.timestamp).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>
                      {log.actorType} ({log.adminId || 'Student'})
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 800, color: '#0f172a' }}>{log.action}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '11px', color: '#64748b' }}>
                      {log.previousValue ? JSON.stringify(log.previousValue) : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '11px', color: '#0f172a' }}>
                      {log.newValue ? JSON.stringify(log.newValue) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB 5: VENDOR TRANSACTION HISTORY & AUDIT LEDGER          */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'VENDOR_TRANSACTIONS' && (
        <AdminVendorTransactionExplorer />
      )}

      {/* ── MODAL 3: Manual Bank Verification & Evidence Inspector ── */}
      {inspectModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(8px, 2vw, 16px)', overflowY: 'auto' }}>
          <div style={{ background: '#ffffff', borderRadius: '14px', maxWidth: '860px', width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: 'clamp(14px, 3vw, 24px)', boxShadow: '0 20px 40px rgba(0,0,0,0.25)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 'clamp(14px, 2vw, 24px)', margin: 'auto' }}>
            {/* Left Column: Screenshot Evidence */}
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#475569', marginBottom: '8px' }}>
                Supporting Screenshot Evidence
              </span>
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '8px 12px', borderRadius: '6px', fontSize: '11px', textAlign: 'center', marginBottom: '12px' }}>
                A screenshot or student-entered UTR is NOT proof of payment. Verify against the official bank statement.
              </div>
              <a
                href={inspectModal.paymentScreenshot.startsWith('http') ? inspectModal.paymentScreenshot : `http://localhost:4000${inspectModal.paymentScreenshot}`}
                target="_blank"
                rel="noreferrer"
                style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
              >
                <img
                  src={inspectModal.paymentScreenshot.startsWith('http') ? inspectModal.paymentScreenshot : `http://localhost:4000${inspectModal.paymentScreenshot}`}
                  alt="Student Payment Screenshot"
                  style={{ maxHeight: '340px', maxWidth: '100%', objectFit: 'contain', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff', padding: '4px' }}
                />
              </a>
            </div>

            {/* Right Column: Verification Workflow */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                  <div>
                    <h3 style={{ margin: '0 0 2px 0', fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                      Manual Bank Transaction Verification
                    </h3>
                    <small style={{ color: '#64748b' }}>
                      Student: <strong>{inspectModal.studentName}</strong> ({inspectModal.usn})
                    </small>
                  </div>
                  <button
                    onClick={() => { setInspectModal(null); setModalError(null); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#94a3b8', fontWeight: 800 }}
                  >
                    ✕
                  </button>
                </div>

                {/* Key Metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 110px), 1fr))', gap: '10px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px' }}>
                  <div>
                    <span style={{ color: '#64748b', display: 'block' }}>Expected</span>
                    <strong style={{ fontSize: '14px', color: '#0f172a' }}>₹{Number(inspectModal.expectedAmount || inspectModal.amount).toLocaleString('en-IN')}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block' }}>Submitted</span>
                    <strong style={{ fontSize: '14px', color: inspectModal.amountMismatchFlag ? '#dc2626' : '#0f172a' }}>
                      ₹{Number(inspectModal.amount).toLocaleString('en-IN')}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block' }}>Submitted UTR</span>
                    <strong style={{ fontSize: '13px', fontFamily: 'monospace', color: '#2563eb' }}>{inspectModal.utrNumber}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block' }}>UPI App</span>
                    <strong style={{ color: '#0f172a' }}>{inspectModal.paymentMethod}</strong>
                  </div>
                </div>

                {inspectModal.amountMismatchFlag && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: '8px', color: '#991b1b', fontSize: '12px', fontWeight: 600 }}>
                    ⚠️ <strong>Amount Mismatch Warning:</strong> Student submitted ₹{inspectModal.amount}, but the expected requirement was ₹{inspectModal.expectedAmount}.
                    {inspectModal.amountValidationNotes && (
                      <div style={{ fontSize: '11px', marginTop: '4px', fontWeight: 400 }}>{inspectModal.amountValidationNotes}</div>
                    )}
                  </div>
                )}

                {/* Mandatory 3-Point Checklist */}
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '14px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 800, color: '#1e3a8a', textTransform: 'uppercase', fontSize: '11px' }}>
                      Mandatory Official Bank Verification Steps:
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setBankChecklist({
                          checkedBankApp: true,
                          matchedAmountAndUtr: true,
                          confirmedCreditStatus: true
                        })
                      }
                      style={{
                        background: '#dbeafe',
                        border: '1px solid #bfdbfe',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        color: '#1d4ed8',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      ✓ Select All Steps
                    </button>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', color: '#1e293b' }}>
                    <input
                      type="checkbox"
                      checked={bankChecklist.checkedBankApp}
                      onChange={(e) => setBankChecklist({ ...bankChecklist, checkedBankApp: e.target.checked })}
                      style={{ marginTop: '2px' }}
                    />
                    <span>1. I have opened the institution's official bank application / statement and located this incoming UPI transaction.</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', color: '#1e293b' }}>
                    <input
                      type="checkbox"
                      checked={bankChecklist.matchedAmountAndUtr}
                      onChange={(e) => setBankChecklist({ ...bankChecklist, matchedAmountAndUtr: e.target.checked })}
                      style={{ marginTop: '2px' }}
                    />
                    <span>2. I have matched the exact UTR (<strong>{inspectModal.utrNumber}</strong>), exact amount (<strong>₹{inspectModal.amount}</strong>), and transaction date.</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', color: '#1e293b' }}>
                    <input
                      type="checkbox"
                      checked={bankChecklist.confirmedCreditStatus}
                      onChange={(e) => setBankChecklist({ ...bankChecklist, confirmedCreditStatus: e.target.checked })}
                      style={{ marginTop: '2px' }}
                    />
                    <span>3. I confirm the transaction is a successful settled credit in MIT Mysore's account (not pending/failed).</span>
                  </label>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Bank Statement Credited Amount (₹) <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={bankVerifiedAmount}
                    onChange={(e) => setBankVerifiedAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 700, boxSizing: 'border-box' }}
                    placeholder="Exact credited amount in institution bank"
                  />
                  {bankVerifiedAmount !== '' && Number(bankVerifiedAmount) !== (inspectModal.expectedAmount || inspectModal.amount) && (
                    <span style={{ display: 'block', fontSize: '11px', color: '#b45309', marginTop: '4px' }}>
                      Note: Credited amount (₹{bankVerifiedAmount}) does not match expected requirement (₹{inspectModal.expectedAmount || inspectModal.amount}).
                    </span>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Internal Admin Remarks
                  </label>
                  <input
                    type="text"
                    value={modalRemarks}
                    onChange={(e) => setModalRemarks(e.target.value)}
                    placeholder="Optional internal audit note..."
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#dc2626', marginBottom: '4px' }}>
                    Rejection Reason (Required if rejecting payment)
                  </label>
                  <input
                    type="text"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="e.g. UTR not found in bank statement / Incorrect amount credited"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #fca5a5', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>
                {modalError && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: '8px', color: '#991b1b', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>⚠️</span>
                    <span>{modalError}</span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => { setInspectModal(null); setModalError(null); }}
                  style={{ padding: '8px 14px', background: '#f1f5f9', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleRejectSubmission}
                  style={{ padding: '8px 14px', background: busy ? '#94a3b8' : '#dc2626', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, color: '#ffffff', cursor: busy ? 'not-allowed' : 'pointer' }}
                >
                  {busy ? 'Processing...' : 'Reject Payment'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleVerifySubmission}
                  style={{ padding: '8px 18px', background: busy ? '#94a3b8' : '#16a34a', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, color: '#ffffff', cursor: busy ? 'not-allowed' : 'pointer' }}
                >
                  {busy ? 'Verifying...' : '✓ Verify Payment (Confirmed in Bank)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 4: Revise Student Payment Requirement ── */}
      {reviseModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(8px, 2vw, 16px)' }}>
          <div style={{ background: '#ffffff', borderRadius: '14px', maxWidth: '440px', width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: 'clamp(14px, 3vw, 24px)', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                Revise Student Payment Requirement
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                Adjust the required uniform payment amount for <strong>{reviseModal.submission.studentName}</strong> ({reviseModal.submission.usn}).
              </p>
            </div>

            <form onSubmit={handleReviseRequirement} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Current Expected Requirement
                </label>
                <div style={{ padding: '8px 12px', background: '#f1f5f9', borderRadius: '6px', fontSize: '13px', fontWeight: 700, color: '#475569' }}>
                  ₹{reviseModal.submission.expectedAmount} (Submitted: ₹{reviseModal.submission.amount})
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    New Required Amount (₹) <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={reviseModal.newExpectedAmount}
                    onChange={(e) => setReviseModal({ ...reviseModal, newExpectedAmount: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 700, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Adjust Recorded Paid Amount (₹)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={reviseModal.newPaidAmount}
                    onChange={(e) => setReviseModal({ ...reviseModal, newPaidAmount: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 700, boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Mandatory Revision Reason <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={reviseModal.reason}
                  onChange={(e) => setReviseModal({ ...reviseModal, reason: e.target.value })}
                  placeholder="e.g. Granted approved uniform discount; or hostel lab apron package upgrade."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setReviseModal(null)}
                  style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || !reviseModal.reason.trim()}
                  style={{ padding: '8px 18px', background: '#2563eb', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#ffffff', cursor: 'pointer' }}
                >
                  {busy ? 'Saving...' : 'Confirm Revision & Log Audit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


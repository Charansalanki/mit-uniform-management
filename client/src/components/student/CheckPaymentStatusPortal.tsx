import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  CheckCircle2,
  Clock3,
  XCircle,
  RefreshCw,
  ArrowLeft,
  ShieldCheck,
  Building2,
  Shirt,
  Store,
  Hash,
  KeyRound,
  FileText,
  Lock,
  Download,
  Printer
} from 'lucide-react';
import { TrackingDataPayload } from '../../hooks/useStudentProgressPersistence';
import { useAuthenticatedSse } from '../../hooks/useAuthenticatedSse';
import StudentUniformSlipModal from './StudentUniformSlipModal';
import { StudentSlipData, printStudentSlip } from '../../utils/studentSlipGenerator';

interface Props {
  apiBaseUrl?: string;
  onBackToHome?: () => void;
}

const LIVE_STATUS_STYLES: Record<string, {
  badge: { bg: string; text: string; border: string };
  banner: { bg: string; border: string; text: string; subText: string };
  icon: React.ReactNode;
}> = {
  'Not Paid': {
    badge: { bg: '#f1f5f9', text: '#334155', border: '#cbd5e1' },
    banner: { bg: '#f8fafc', border: '#cbd5e1', text: '#0f172a', subText: '#475569' },
    icon: <Clock3 size={20} color="#64748b" />
  },
  'Payment Submitted': {
    badge: { bg: '#fef3c7', text: '#92400e', border: '#fde047' },
    banner: { bg: '#fffbeb', border: '#fde047', text: '#78350f', subText: '#92400e' },
    icon: <Clock3 size={20} color="#d97706" />
  },
  'Under Verification': {
    badge: { bg: '#eff6ff', text: '#1e40af', border: '#93c5fd' },
    banner: { bg: '#eff6ff', border: '#93c5fd', text: '#1e3a8a', subText: '#1e40af' },
    icon: <Search size={20} color="#2563eb" />
  },
  'Payment Successful': {
    badge: { bg: '#059669', text: '#ffffff', border: '#059669' },
    banner: { bg: '#ecfdf5', border: '#10b981', text: '#064e3b', subText: '#065f46' },
    icon: <CheckCircle2 size={20} color="#059669" />
  },
  'Payment Rejected': {
    badge: { bg: '#dc2626', text: '#ffffff', border: '#dc2626' },
    banner: { bg: '#fef2f2', border: '#f87171', text: '#7f1d1d', subText: '#991b1b' },
    icon: <XCircle size={20} color="#dc2626" />
  }
};

export default function CheckPaymentStatusPortal({ apiBaseUrl = '', onBackToHome }: Props) {
  const [applicationId, setApplicationId] = useState('');
  const [trackingPin, setTrackingPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [viewToken, setViewToken] = useState('');
  const [trackingData, setTrackingData] = useState<TrackingDataPayload | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const handleLookupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanApp = applicationId.trim().toUpperCase();
    const cleanPin = trackingPin.replace(/\D/g, '').trim();

    if (!cleanApp || cleanPin.length !== 6) {
      setErrorMsg('Please enter your valid Application ID (e.g. MIT-2026-10001) and 6-digit Tracking PIN.');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${apiBaseUrl}/api/tracking/check-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: cleanApp,
          trackingPin: cleanPin
        })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'Unable to verify credentials.');
        return;
      }

      setViewToken(data.readOnlyViewToken);
      setTrackingData(data.trackingData);
      setLastRefreshedAt(new Date());
    } catch {
      setErrorMsg('Network error. Please check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Poll latest database status every 6 seconds
  const fetchLatestFromDatabase = useCallback(async () => {
    if (!viewToken) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/tracking/live-poll?t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${viewToken}` },
        cache: 'no-store'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTrackingData(data.trackingData);
        setLastRefreshedAt(new Date());
      }
    } catch (e) {
      console.error('Status poll error:', e);
    }
  }, [apiBaseUrl, viewToken]);

  // Authenticated Student Status Stream (Updates to "Payment Successful" the instant Vendor clicks Verify)
  useAuthenticatedSse({
    streamPath: trackingData?.registrationId
      ? `/api/sse/student/${trackingData.registrationId}`
      : null,
    jwtToken: viewToken,
    apiBaseUrl,
    eventHandlers: {
      PAYMENT_STATUS_UPDATED: (liveEvent: any) => {
        setTrackingData((prev) =>
          prev
            ? {
                ...prev,
                payment: {
                  ...prev.payment,
                  paymentStatus: liveEvent.paymentStatus,
                  verifiedAt: liveEvent.verifiedAt,
                  verifiedByVendor: liveEvent.verifiedByVendor,
                  rejectionReason: liveEvent.rejectionReason
                }
              }
            : prev
        );
        setLastRefreshedAt(new Date());
      }
    }
  });

  useEffect(() => {
    if (!viewToken || !trackingData?.registrationId) return;
    const pollTimer = setInterval(fetchLatestFromDatabase, 6000);
    return () => clearInterval(pollTimer);
  }, [viewToken, trackingData?.registrationId, fetchLatestFromDatabase]);

  const [showSlipModal, setShowSlipModal] = useState(false);

  const payment = trackingData?.payment || { paymentStatus: 'Not Paid', hasSubmittedPayment: false };
  const currentStatus = payment.paymentStatus || 'Not Paid';
  const statusStyle = LIVE_STATUS_STYLES[currentStatus] || LIVE_STATUS_STYLES['Not Paid'];
  const isVerified = currentStatus === 'Payment Successful' || currentStatus === 'Verified' || currentStatus === 'Payment Verified';

  const slipData: StudentSlipData | null = trackingData
    ? {
        applicationId: trackingData.applicationId,
        trackingPin: trackingPin || trackingData.trackingPin || '',
        registrationId: trackingData.registrationId || (trackingData.applicationId ? `REG-${trackingData.applicationId.replace(/^MIT-2026-|^MIT-/, '')}` : 'REG-001'),
        studentName: trackingData.studentProfile?.studentName || '',
        usn: trackingData.studentProfile?.usn || '',
        course: trackingData.studentProfile?.course || 'B.E.',
        department: trackingData.studentProfile?.department || '',
        academicYear: trackingData.studentProfile?.academicYear || '2026–27',
        section: trackingData.studentProfile?.section || '',
        gender: trackingData.studentProfile?.gender || '',
        shirtSize: trackingData.uniformSelection?.shirtSize || 'Standard',
        trouserSize: trackingData.uniformSelection?.trouserSize || 'Standard',
        packageType: trackingData.uniformSelection?.packageType || 'Standard',
        vendorName: trackingData.assignedVendor?.vendorName || 'Assigned Uniform Vendor',
        vendorId: trackingData.assignedVendor?.vendorId || 'N/A',
        isPaymentVerified: isVerified,
        paymentStatus: currentStatus,
        paidAmount: payment.paidAmount ?? payment.expectedAmount ?? 0,
        utrNumber: payment.utrNumber ?? '',
        verifiedAt: payment.verifiedAt ?? '',
        verifiedBy: payment.verifiedByVendor ?? trackingData.assignedVendor?.vendorName ?? ''
      }
    : null;

  return (
    <div style={{ maxWidth: '860px', margin: '32px auto', padding: '0 16px', fontFamily: 'inherit' }}>
      {/* Top Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px'
        }}
      >
        <div>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 800,
              textTransform: 'uppercase',
              color: '#2563eb',
              letterSpacing: '0.05em'
            }}
          >
            MIT Mysore Uniform Management System
          </span>
          <h1 style={{ margin: '4px 0 0 0', fontSize: '24px', fontWeight: 900, color: '#0f172a' }}>
            Check Application & Payment Status
          </h1>
        </div>

        {onBackToHome && (
          <button
            type="button"
            onClick={onBackToHome}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              color: '#334155',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <ArrowLeft size={14} /> Back to Registration Portal
          </button>
        )}
      </div>

      {/* STEP 1: CREDENTIAL ENTRY FORM (SHOWN WHEN NOT LOGGED IN) */}
      {!trackingData ? (
        <div
          style={{
            maxWidth: '520px',
            margin: '24px auto',
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.06)',
            overflow: 'hidden'
          }}
        >
          <div style={{ background: '#0f172a', color: '#ffffff', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <ShieldCheck size={20} color="#38bdf8" />
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Check Status From Any Device</h2>
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
              Enter the Application ID and 6-Digit Tracking PIN generated when you submitted your uniform registration.
            </p>
          </div>

          <form onSubmit={handleLookupSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {errorMsg && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  fontSize: '12px',
                  fontWeight: 600
                }}
              >
                {errorMsg}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Application ID *
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                  <Hash size={14} />
                </span>
                <input
                  type="text"
                  required
                  value={applicationId}
                  onChange={(e) => setApplicationId(e.target.value.toUpperCase())}
                  placeholder="e.g. MIT-2026-10001"
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 36px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                6-Digit Tracking PIN *
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                  <KeyRound size={14} />
                </span>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={trackingPin}
                  onChange={(e) => setTrackingPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 36px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    letterSpacing: '0.25em',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                background: loading ? '#93c5fd' : '#2563eb',
                color: '#ffffff',
                border: 'none',
                fontSize: '13px',
                fontWeight: 800,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
              }}
            >
              {loading ? <RefreshCw size={15} className="p-spinner" /> : <Search size={15} />}
              {loading ? 'Checking Database...' : 'Check Live Payment Status'}
            </button>
          </form>
        </div>
      ) : (
        /* STEP 2: READ-ONLY STUDENT REGISTRATION & LIVE PAYMENT STATUS VIEW */
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
            overflow: 'hidden'
          }}
        >
          {/* Header Strip */}
          <div
            style={{
              background: '#0f172a',
              color: '#ffffff',
              padding: '20px 24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '16px'
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 900, color: '#60a5fa' }}>
                  {trackingData.applicationId}
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: '#1e293b',
                    color: '#94a3b8',
                    border: '1px solid #334155'
                  }}
                >
                  Read-Only Status View
                </span>
              </div>
              <h2 style={{ margin: '6px 0 2px 0', fontSize: '20px', fontWeight: 800 }}>
                {trackingData.studentProfile?.studentName} ({trackingData.studentProfile?.usn})
              </h2>
              <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                Live Sync Active • Last checked:{' '}
                {lastRefreshedAt ? lastRefreshedAt.toLocaleTimeString('en-IN') : 'Just now'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={fetchLatestFromDatabase}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={13} /> Refresh
              </button>
              <button
                type="button"
                onClick={() => {
                  setTrackingData(null);
                  setViewToken('');
                  setTrackingPin('');
                }}
                style={{
                  padding: '8px 14px',
                  background: '#dc2626',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Close Session
              </button>
            </div>
          </div>

          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* LIVE PAYMENT STATUS HERO BANNER */}
            <div
              style={{
                background: statusStyle.banner.bg,
                border: `2px solid ${statusStyle.banner.border}`,
                borderRadius: '14px',
                padding: '20px',
                color: statusStyle.banner.text
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                    }}
                  >
                    {statusStyle.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', opacity: 0.75 }}>
                      Latest Payment Verification Status
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 900 }}>
                      {currentStatus}
                    </div>
                  </div>
                </div>

                <span
                  style={{
                    padding: '6px 14px',
                    borderRadius: '9999px',
                    fontSize: '12px',
                    fontWeight: 800,
                    background: statusStyle.badge.bg,
                    color: statusStyle.badge.text,
                    border: `1.5px solid ${statusStyle.badge.border}`
                  }}
                >
                  {currentStatus}
                </span>
              </div>

              {/* Verified Details */}
              {currentStatus === 'Payment Successful' && (
                <>
                  <div
                    style={{
                      marginTop: '16px',
                      paddingTop: '14px',
                      borderTop: '1px solid rgba(16, 185, 129, 0.3)',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '12px',
                      fontSize: '12px'
                    }}
                  >
                    <div>
                      <span style={{ opacity: 0.75, display: 'block' }}>Verified Date & Exact Time</span>
                      <strong style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                        {payment.verifiedAt
                          ? new Date(payment.verifiedAt).toLocaleString('en-IN')
                          : 'Confirmed'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ opacity: 0.75, display: 'block' }}>Confirmed Amount & UTR</span>
                      <strong>
                        ₹{Number(payment.paidAmount || payment.expectedAmount || 0).toLocaleString('en-IN')} • UTR:{' '}
                        <span style={{ fontFamily: 'monospace' }}>{payment.utrNumber || 'Verified'}</span>
                      </strong>
                    </div>
                    <div>
                      <span style={{ opacity: 0.75, display: 'block' }}>Verified By Vendor</span>
                      <strong>{payment.verifiedByVendor || trackingData.assignedVendor?.vendorName || 'Assigned Vendor'}</strong>
                    </div>
                  </div>

                  {/* Single-Page Official Verified Slip Action Buttons */}
                  <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setShowSlipModal(true)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 18px',
                        background: '#16a34a',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)',
                        transition: 'background 0.15s ease'
                      }}
                    >
                      <Download size={15} /> Download Official Verified Slip (1-Page A4)
                    </button>

                    <button
                      type="button"
                      onClick={() => slipData && printStudentSlip(slipData)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 16px',
                        background: '#0f172a',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      <Printer size={15} /> Print / Save PDF
                    </button>
                  </div>
                </>
              )}

              {/* Rejected Details */}
              {currentStatus === 'Payment Rejected' && (
                <div
                  style={{
                    marginTop: '16px',
                    paddingTop: '14px',
                    borderTop: '1px solid rgba(239, 68, 68, 0.3)',
                    fontSize: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}
                >
                  <div>
                    <strong>Rejection Reason:</strong> {payment.rejectionReason}
                  </div>
                  {payment.rejectedAt && (
                    <div style={{ opacity: 0.8 }}>
                      Updated on: {new Date(payment.rejectedAt).toLocaleString('en-IN')}
                    </div>
                  )}
                </div>
              )}

              {/* Pending / Under Verification Details (Slip Locked) */}
              {(currentStatus === 'Payment Submitted' || currentStatus === 'Under Verification') && (
                <div style={{ marginTop: '14px', padding: '12px 14px', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: '8px' }}>
                  <p style={{ margin: '0 0 8px 0', fontSize: '12px', opacity: 0.95 }}>
                    Your payment of{' '}
                    <strong>₹{Number(payment.paidAmount || payment.expectedAmount || 0).toLocaleString('en-IN')}</strong> (UTR:{' '}
                    <span style={{ fontFamily: 'monospace', fontWeight: 800 }}>{payment.utrNumber}</span>) has been recorded and is currently awaiting bank verification by{' '}
                    <strong>{trackingData.assignedVendor?.vendorName || 'your assigned uniform vendor'}</strong>. This page will automatically update to{' '}
                    <strong>Payment Successful</strong> as soon as the vendor verifies it.
                  </p>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#b45309', fontWeight: 700, fontSize: '11.5px' }}>
                    <Lock size={13} /> Official Verified Slip is locked and will become available to download the moment verification completes.
                  </div>
                </div>
              )}

              {currentStatus === 'Not Paid' && (
                <p style={{ margin: '14px 0 0 0', fontSize: '12px', opacity: 0.9 }}>
                  No payment record has been submitted for this registration yet. Please complete fee payment on the uniform portal.
                </p>
              )}
            </div>

            {/* Read-Only Student Registration & Uniform Sizes Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#475569', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileText size={13} /> Submitted Student Information (Read-Only)
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Student Name</span>
                    <strong style={{ color: '#0f172a' }}>{trackingData.studentProfile?.studentName}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>USN</span>
                    <strong style={{ fontFamily: 'monospace', color: '#0f172a' }}>{trackingData.studentProfile?.usn}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Course & Department</span>
                    <strong style={{ color: '#0f172a' }}>{trackingData.studentProfile?.course || 'B.E.'} • {trackingData.studentProfile?.department}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Academic Year & Section</span>
                    <strong style={{ color: '#0f172a' }}>{trackingData.studentProfile?.academicYear} • Sec {trackingData.studentProfile?.section}</strong>
                  </div>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#475569', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Shirt size={13} /> Submitted Uniform Sizes & Vendor (Read-Only)
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Shirt Size</span>
                    <strong style={{ color: '#0f172a' }}>{trackingData.uniformSelection?.shirtSize || 'Standard'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Trouser Size</span>
                    <strong style={{ color: '#0f172a' }}>{trackingData.uniformSelection?.trouserSize || 'Standard'}"</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Assigned Uniform Vendor</span>
                    <strong style={{ color: '#0f172a' }}>{trackingData.assignedVendor?.vendorName || 'Assigned by MIT Mysore'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Submitted UTR</span>
                    <strong style={{ fontFamily: 'monospace', color: payment.utrNumber ? '#2563eb' : '#94a3b8' }}>
                      {payment.utrNumber || 'Not Submitted Yet'}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Official Single-Page Slip Modal & Print Preview */}
      <StudentUniformSlipModal
        isOpen={showSlipModal}
        onClose={() => setShowSlipModal(false)}
        slipData={slipData}
      />
    </div>
  );
}


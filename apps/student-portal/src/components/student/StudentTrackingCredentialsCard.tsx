import { useState } from 'react';
import { Copy, Download, Printer, Check, ShieldCheck, KeyRound, Hash, Lock } from 'lucide-react';
import { TrackingDataPayload } from '../../hooks/useStudentProgressPersistence';
import StudentUniformSlipModal from './StudentUniformSlipModal';
import { StudentSlipData, printStudentSlip } from '../../utils/studentSlipGenerator';

interface Props {
  trackingData: TrackingDataPayload | null;
  livePaymentStatus?: string;
  livePaymentSubmission?: any;
}

export default function StudentTrackingCredentialsCard({ trackingData, livePaymentStatus, livePaymentSubmission }: Props) {
  const [copied, setCopied] = useState(false);
  const [showSlipModal, setShowSlipModal] = useState(false);

  if (!trackingData?.applicationId) return null;

  const {
    applicationId,
    trackingPin,
    studentProfile,
    uniformSelection,
    assignedVendor
  } = trackingData;

  const effectiveStatus = livePaymentStatus || trackingData.payment?.paymentStatus || 'Not Paid';
  const hasSubmittedPayment = Boolean(
    trackingData.payment?.hasSubmittedPayment ||
    (effectiveStatus !== 'Not Paid')
  );
  const isVerified =
    effectiveStatus === 'Payment Successful' ||
    effectiveStatus === 'Verified' ||
    effectiveStatus === 'Payment Verified';

  // Rule: Do not show the download slip after payment until it is verified / payment successful
  const canDownloadSlip = !hasSubmittedPayment || isVerified;

  const displayRegId = trackingData.registrationId || (applicationId ? `REG-${applicationId.replace(/^MIT-2026-|^MIT-/, '')}` : 'REG-001');

  const slipData: StudentSlipData = {
    applicationId,
    trackingPin: trackingPin || '',
    registrationId: displayRegId,
    studentName: studentProfile?.studentName || '',
    usn: studentProfile?.usn || '',
    course: studentProfile?.course || 'B.E.',
    department: studentProfile?.department || '',
    academicYear: studentProfile?.academicYear || '2026–27',
    section: studentProfile?.section || '',
    gender: studentProfile?.gender || '',
    shirtSize: uniformSelection?.shirtSize || 'Standard',
    trouserSize: uniformSelection?.trouserSize || 'Standard',
    blazerSize: uniformSelection?.blazerSize || '',
    remarks: uniformSelection?.remarks || '',
    packageType: uniformSelection?.packageType || 'Standard',
    vendorName: assignedVendor?.vendorName || 'Assigned Uniform Vendor',
    vendorId: assignedVendor?.vendorId || 'N/A',
    isPaymentVerified: isVerified,
    paymentStatus: effectiveStatus,
    paidAmount: livePaymentSubmission?.amount ?? trackingData.payment?.paidAmount ?? livePaymentSubmission?.expectedAmount ?? trackingData.payment?.expectedAmount ?? 0,
    utrNumber: livePaymentSubmission?.utrNumber ?? trackingData.payment?.utrNumber ?? '',
    verifiedAt: trackingData.payment?.verifiedAt ?? '',
    verifiedBy: trackingData.payment?.verifiedByVendor ?? ''
  };

  const handleCopyCredentials = () => {
    const text = `MIT Mysore Uniform Registration\nRegistration ID: ${displayRegId}\nApplication ID: ${applicationId}\n6-Digit Tracking PIN: ${trackingPin || 'Saved'}\nUSN: ${studentProfile?.usn}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handlePrintSlipDirect = () => {
    printStudentSlip(slipData);
  };

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        color: '#ffffff',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.3)',
        border: '1.5px solid rgba(59, 130, 246, 0.3)',
        marginBottom: '20px'
      }}
      className="student-tracking-credentials-card"
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          paddingBottom: '16px'
        }}
      >
        <div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 10px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              background: 'rgba(16, 185, 129, 0.2)',
              color: '#6ee7b7',
              border: '1px solid rgba(52, 211, 153, 0.3)'
            }}
          >
            <ShieldCheck size={13} /> Registration Saved Permanently
          </span>
          <h3 style={{ margin: '8px 0 2px 0', fontSize: '18px', fontWeight: 800, color: '#f8fafc' }}>
            Save Your Student Tracking Credentials
          </h3>
          <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
            Use this Application ID and 6-Digit PIN to check your live payment verification status anytime from any phone or laptop.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }} className="print-hidden">
          <button
            type="button"
            onClick={handleCopyCredentials}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              background: '#334155',
              border: '1px solid #475569',
              borderRadius: '8px',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            {copied ? <Check size={14} style={{ color: '#4ade80' }} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy Details'}
          </button>

          {canDownloadSlip ? (
            <button
              type="button"
              onClick={() => setShowSlipModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                background: isVerified ? '#16a34a' : '#2563eb',
                border: 'none',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
              }}
            >
              <Download size={14} /> {isVerified ? 'Download Verified Slip' : 'Download Slip'}
            </button>
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: '8px',
                color: '#fbbf24',
                fontSize: '11.5px',
                fontWeight: 700
              }}
              title="Official verified slip will be unlocked immediately once payment verification is completed by the vendor."
            >
              <Lock size={13} /> Official Slip Locked (Awaiting Verification)
            </span>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
          gap: '16px',
          paddingTop: '16px'
        }}
      >
        <div
          style={{
            background: 'rgba(30, 41, 59, 0.9)',
            border: '1px solid rgba(71, 85, 105, 0.6)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          <div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <Hash size={12} /> Registration ID
            </span>
            <span
              style={{
                fontSize: '20px',
                fontWeight: 900,
                fontFamily: 'monospace',
                color: '#38bdf8',
                letterSpacing: '0.05em',
                display: 'block',
                marginTop: '4px'
              }}
            >
              {displayRegId}
            </span>
          </div>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '4px 8px',
              borderRadius: '6px',
              background: 'rgba(14, 165, 233, 0.15)',
              color: '#7dd3fc',
              border: '1px solid rgba(14, 165, 233, 0.3)',
              textAlign: 'right'
            }}
          >
            Uniform Slip ID
          </span>
        </div>

        <div
          style={{
            background: 'rgba(30, 41, 59, 0.9)',
            border: '1px solid rgba(71, 85, 105, 0.6)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          <div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <Hash size={12} /> Unique Application ID
            </span>
            <span
              style={{
                fontSize: '20px',
                fontWeight: 900,
                fontFamily: 'monospace',
                color: '#60a5fa',
                letterSpacing: '0.05em',
                display: 'block',
                marginTop: '4px'
              }}
            >
              {applicationId}
            </span>
          </div>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '4px 8px',
              borderRadius: '6px',
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#93c5fd',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              textAlign: 'right'
            }}
          >
            Required for Lookup
          </span>
        </div>

        <div
          style={{
            background: 'rgba(30, 41, 59, 0.9)',
            border: '1px solid rgba(71, 85, 105, 0.6)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          <div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <KeyRound size={12} /> 6-Digit Tracking PIN
            </span>
            <span
              style={{
                fontSize: '22px',
                fontWeight: 900,
                fontFamily: 'monospace',
                color: '#4ade80',
                letterSpacing: '0.2em',
                display: 'block',
                marginTop: '4px'
              }}
            >
              {trackingPin || '••••••'}
            </span>
          </div>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '4px 8px',
              borderRadius: '6px',
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#86efac',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              textAlign: 'right'
            }}
          >
            Keep Confidential
          </span>
        </div>
      </div>

      {/* Official Single-Page Slip Modal & Print Preview */}
      <StudentUniformSlipModal
        isOpen={showSlipModal}
        onClose={() => setShowSlipModal(false)}
        slipData={slipData}
      />
    </div>
  );
}


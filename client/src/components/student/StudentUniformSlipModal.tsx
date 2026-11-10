import React, { useState } from 'react';
import { X, Printer, Download, ShieldCheck, Check } from 'lucide-react';
import { StudentSlipData, printStudentSlip, downloadStudentSlip } from '../../utils/studentSlipGenerator';
import { MIT_LOGO_BASE64 } from '../../utils/mitLogoBase64';

interface Props {
  slipData: StudentSlipData | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function StudentUniformSlipModal({ slipData, isOpen, onClose }: Props) {
  const [downloaded, setDownloaded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [activePin, setActivePin] = useState(slipData?.trackingPin || '');

  React.useEffect(() => {
    if (slipData?.trackingPin && slipData.trackingPin !== '••••••') {
      setActivePin(slipData.trackingPin);
      return;
    }
    const u = (slipData?.usn || '').toUpperCase().trim();
    const r = (slipData?.registrationId || '').trim();
    const app = (slipData?.applicationId || '').trim();
    try {
      const stored =
        (r && sessionStorage.getItem(`mit_pin_${r}`)) ||
        (app && sessionStorage.getItem(`mit_pin_${app}`)) ||
        (u && sessionStorage.getItem(`mit_pin_${u}`)) ||
        (r && localStorage.getItem(`mit_pin_${r}`)) ||
        (app && localStorage.getItem(`mit_pin_${app}`)) ||
        (u && localStorage.getItem(`mit_pin_${u}`));
      if (stored && stored.trim()) {
        setActivePin(stored.trim());
        return;
      }
    } catch {}

    const lookupId = r || app || u;
    if (lookupId) {
      const headers: Record<string, string> = {};
      try {
        const resumeToken =
          localStorage.getItem('mit_uniform_browser_resume_token_v1') ||
          sessionStorage.getItem('mit_uniform_browser_resume_token_v1');
        if (resumeToken) {
          headers['x-resume-token'] = resumeToken;
        }
      } catch {}
      fetch(`/api/tracking/pin/${encodeURIComponent(lookupId)}`, { headers })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.trackingPin) {
            setActivePin(data.trackingPin);
          }
        })
        .catch(() => {});
    }
  }, [slipData]);

  if (!isOpen || !slipData) return null;

  const isVerified =
    slipData.isPaymentVerified ||
    slipData.paymentStatus === 'Payment Successful' ||
    slipData.paymentStatus === 'Verified' ||
    slipData.paymentStatus === 'Payment Verified';

  const displayRegId = slipData.registrationId || (slipData.applicationId ? `REG-${slipData.applicationId.replace(/^MIT-2026-|^MIT-/, '')}` : 'REG-001');
  const academicYearFormatted = slipData.academicYear || '2026–27';
  const docRef = `MITM / UNIFORM / ${academicYearFormatted} / ${displayRegId}`;
  const slipTitle = isVerified ? 'Uniform Registration & Payment Receipt' : 'Uniform Registration Slip';
  const subtitle = isVerified ? 'OFFICIAL VERIFIED STUDENT PAYMENT & UNIFORM COPY' : 'OFFICIAL STUDENT REGISTRATION & TRACKING COPY';

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      const effectivePin = activePin || slipData.trackingPin || '';
      await downloadStudentSlip(
        { ...slipData, trackingPin: effectivePin },
        document.getElementById('mit-official-slip-content')
      );
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 3000);
    } catch (err) {
      console.error('Error generating PDF:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '780px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Bar */}
        <div
          style={{
            padding: '12px 20px',
            background: '#0f172a',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            borderBottom: '1px solid #334155'
          }}
          className="no-print"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={18} color="#38bdf8" />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>
                {slipTitle} (Official 1-Page Document)
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                Pre-formatted for single-page A4 printing & PDF export
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => printStudentSlip(slipData)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <Printer size={14} /> Print / Save PDF
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                background: downloaded ? '#15803d' : isDownloading ? '#0d9488' : '#059669',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: isDownloading ? 'wait' : 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 5px rgba(5, 150, 105, 0.25)',
                opacity: isDownloading ? 0.85 : 1
              }}
            >
              {downloaded ? <Check size={14} /> : <Download size={14} />}
              <span>
                {isDownloading
                  ? 'Generating PDF...'
                  : downloaded
                  ? 'PDF Downloaded!'
                  : (isVerified ? 'Download Verified Slip (PDF)' : 'Download Slip (PDF)')}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px'
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Document Preview Area */}
        <div style={{ padding: '24px', overflowY: 'auto', background: '#f1f5f9' }}>
          <div
            id="mit-official-slip-content"
            style={{
              background: '#ffffff',
              padding: '28px 32px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
              color: '#0f172a',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
              fontSize: '11px',
              lineHeight: 1.35
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '14px',
                paddingBottom: '8px',
                borderBottom: '1.5px solid #0f172a'
              }}
            >
              <div style={{ width: '60px', height: '60px', flexShrink: 0 }}>
                <img
                  src={MIT_LOGO_BASE64}
                  alt="MIT Mysore Logo"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: '9.5px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: '#475569',
                    textAlign: 'right',
                    marginBottom: '2px'
                  }}
                >
                  MAHARAJA EDUCATION TRUST (R), MYSURU
                </div>
                <div
                  style={{
                    fontSize: '19px',
                    fontWeight: 900,
                    color: '#c2410c',
                    letterSpacing: '-0.01em',
                    lineHeight: 1.15,
                    marginBottom: '3px'
                  }}
                >
                  Maharaja Institute of Technology Mysore
                </div>
                <div style={{ fontSize: '9.5px', color: '#334155', fontWeight: 500 }}>
                  An Autonomous Institution affiliated to VTU, Belagavi
                </div>
                <div style={{ fontSize: '9.5px', color: '#334155', fontWeight: 500 }}>
                  Approved by AICTE, New Delhi | Recognized by Government of Karnataka
                </div>
                <div style={{ fontSize: '9.5px', color: '#334155', fontWeight: 500 }}>
                  Belawadi, Srirangapatna Taluk, Mandya District – 571477
                </div>
              </div>
            </div>

            {/* Doc Ref */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '6px 0 4px 0',
                fontSize: '10.5px',
                fontWeight: 700,
                color: '#334155'
              }}
            >
              <div>{docRef}</div>
              <div>Academic Year: {academicYearFormatted}</div>
            </div>

            {/* Title */}
            <div style={{ textAlign: 'center', margin: '4px 0 6px 0' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a', margin: 0 }}>
                {slipTitle}
              </h2>
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: '#c2410c',
                  marginTop: '2px'
                }}
              >
                {subtitle}
              </div>
            </div>

            {/* Intro */}
            <p style={{ fontSize: '10px', color: '#334155', lineHeight: 1.35, marginBottom: '8px' }}>
              This slip confirms the uniform registration details submitted by the student through the MIT Mysore Uniform Management Portal. Keep the tracking credentials safely to check the payment verification and uniform collection status.
            </p>

            {/* Credentials Callout Box */}
            <div
              style={{
                border: '1.5px solid #ea580c',
                borderRadius: '4px',
                padding: '6px 14px 8px 14px',
                marginBottom: '8px',
                background: '#ffffff'
              }}
            >
              <div
                style={{
                  fontSize: '10.5px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#c2410c',
                  textAlign: 'center',
                  marginBottom: '4px'
                }}
              >
                STUDENT TRACKING CREDENTIALS
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', color: '#475569', letterSpacing: '0.04em', marginBottom: '2px' }}>
                    REGISTRATION ID
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 900, fontFamily: 'monospace', color: '#0284c7' }}>
                    {displayRegId}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', color: '#475569', letterSpacing: '0.04em', marginBottom: '2px' }}>
                    APPLICATION ID
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 900, fontFamily: 'monospace', color: '#0f172a' }}>
                    {slipData.applicationId}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', color: '#475569', letterSpacing: '0.04em', marginBottom: '2px' }}>
                    6-DIGIT TRACKING PIN
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 900, fontFamily: 'monospace', color: '#0f172a' }}>
                    {activePin || slipData.trackingPin || '••••••'}
                  </div>
                </div>
              </div>
            </div>

            {/* 1. Student Details */}
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', margin: '6px 0 3px 0' }}>
              1. Student Details
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #94a3b8', marginBottom: '6px', fontSize: '10.5px' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                  <td style={{ width: '34%', padding: '3.5px 8px', fontWeight: 700, color: '#334155', background: '#f8fafc', borderRight: '1px solid #cbd5e1' }}>Registration ID</td>
                  <td style={{ width: '66%', padding: '3.5px 8px', fontWeight: 700, fontFamily: 'monospace', color: '#0284c7' }}>{displayRegId}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                  <td style={{ padding: '3.5px 8px', fontWeight: 700, color: '#334155', background: '#f8fafc', borderRight: '1px solid #cbd5e1' }}>Application ID</td>
                  <td style={{ padding: '3.5px 8px', fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>{slipData.applicationId}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                  <td style={{ padding: '3.5px 8px', fontWeight: 700, color: '#334155', background: '#f8fafc', borderRight: '1px solid #cbd5e1' }}>Student Name</td>
                  <td style={{ padding: '3.5px 8px', fontWeight: 600, color: '#0f172a' }}>{slipData.studentName}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                  <td style={{ padding: '3.5px 8px', fontWeight: 700, color: '#334155', background: '#f8fafc', borderRight: '1px solid #cbd5e1' }}>USN</td>
                  <td style={{ padding: '3.5px 8px', fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>{slipData.usn}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                  <td style={{ padding: '3.5px 8px', fontWeight: 700, color: '#334155', background: '#f8fafc', borderRight: '1px solid #cbd5e1' }}>Course & Department</td>
                  <td style={{ padding: '3.5px 8px', fontWeight: 600, color: '#0f172a' }}>{slipData.course || 'B.E.'} – {slipData.department}</td>
                </tr>
                <tr>
                  <td style={{ padding: '3.5px 8px', fontWeight: 700, color: '#334155', background: '#f8fafc', borderRight: '1px solid #cbd5e1' }}>Academic Year & Section</td>
                  <td style={{ padding: '3.5px 8px', fontWeight: 600, color: '#0f172a' }}>{academicYearFormatted} (Section {slipData.section})</td>
                </tr>
                {slipData.gender && (
                  <tr style={{ borderTop: '1px solid #cbd5e1' }}>
                    <td style={{ padding: '3.5px 8px', fontWeight: 700, color: '#334155', background: '#f8fafc', borderRight: '1px solid #cbd5e1' }}>Gender</td>
                    <td style={{ padding: '3.5px 8px', fontWeight: 600, color: '#0f172a' }}>{slipData.gender}</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* 2. Submitted Uniform Sizes */}
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', margin: '6px 0 3px 0' }}>
              2. Submitted Uniform Sizes
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #94a3b8', marginBottom: '6px', fontSize: '10.5px' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                  <td style={{ width: '34%', padding: '3.5px 8px', fontWeight: 700, color: '#334155', background: '#f8fafc', borderRight: '1px solid #cbd5e1' }}>Shirt Size</td>
                  <td style={{ width: '66%', padding: '3.5px 8px', fontWeight: 600, color: '#0f172a' }}>{slipData.shirtSize || 'Standard'}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                  <td style={{ padding: '3.5px 8px', fontWeight: 700, color: '#334155', background: '#f8fafc', borderRight: '1px solid #cbd5e1' }}>Trouser Size</td>
                  <td style={{ padding: '3.5px 8px', fontWeight: 600, color: '#0f172a' }}>{slipData.trouserSize || 'Standard'}"</td>
                </tr>
                {slipData.blazerSize && (
                  <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                    <td style={{ padding: '3.5px 8px', fontWeight: 700, color: '#334155', background: '#f8fafc', borderRight: '1px solid #cbd5e1' }}>Coat / Blazer Size</td>
                    <td style={{ padding: '3.5px 8px', fontWeight: 600, color: '#0f172a' }}>{slipData.blazerSize}</td>
                  </tr>
                )}
                <tr style={{ borderBottom: slipData.remarks && slipData.remarks.trim() ? '1px solid #cbd5e1' : 'none' }}>
                  <td style={{ padding: '3.5px 8px', fontWeight: 700, color: '#334155', background: '#f8fafc', borderRight: '1px solid #cbd5e1' }}>Package Type</td>
                  <td style={{ padding: '3.5px 8px', fontWeight: 600, color: '#0f172a' }}>{slipData.packageType || 'Standard'}</td>
                </tr>
                {slipData.remarks && slipData.remarks.trim() && (
                  <tr>
                    <td style={{ padding: '3.5px 8px', fontWeight: 700, color: '#334155', background: '#f8fafc', borderRight: '1px solid #cbd5e1' }}>Special Fit Remarks</td>
                    <td style={{ padding: '3.5px 8px', fontWeight: 600, color: '#0f172a', fontStyle: 'italic' }}>{slipData.remarks.trim()}</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* 3. Assigned Uniform Vendor */}
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', margin: '6px 0 3px 0' }}>
              3. Assigned Uniform Vendor
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #94a3b8', marginBottom: '6px', fontSize: '10.5px' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                  <td style={{ width: '34%', padding: '3.5px 8px', fontWeight: 700, color: '#334155', background: '#f8fafc', borderRight: '1px solid #cbd5e1' }}>Vendor Name</td>
                  <td style={{ width: '66%', padding: '3.5px 8px', fontWeight: 600, color: '#0f172a' }}>{slipData.vendorName || 'Assigned Uniform Vendor'}</td>
                </tr>
                <tr>
                  <td style={{ padding: '3.5px 8px', fontWeight: 700, color: '#334155', background: '#f8fafc', borderRight: '1px solid #cbd5e1' }}>Vendor ID</td>
                  <td style={{ padding: '3.5px 8px', fontWeight: 600, color: '#0f172a' }}>{slipData.vendorId || 'N/A'}</td>
                </tr>
              </tbody>
            </table>

            {/* 4. Payment & Verification Details (Shown when Verified) */}
            {isVerified && (
              <>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', margin: '6px 0 3px 0' }}>
                  4. Fee Payment & Institutional Verification Details
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #94a3b8', marginBottom: '6px', fontSize: '10.5px' }}>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                      <td style={{ width: '34%', padding: '3.5px 8px', fontWeight: 700, color: '#334155', background: '#f8fafc', borderRight: '1px solid #cbd5e1' }}>Payment Status</td>
                      <td style={{ width: '66%', padding: '3.5px 8px', fontWeight: 700, color: '#047857' }}>✓ {slipData.paymentStatus || 'Payment Successful'}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                      <td style={{ padding: '3.5px 8px', fontWeight: 700, color: '#334155', background: '#f8fafc', borderRight: '1px solid #cbd5e1' }}>Verified Amount</td>
                      <td style={{ padding: '3.5px 8px', fontWeight: 800, color: '#166534' }}>₹{Number(slipData.paidAmount || 0).toLocaleString('en-IN')}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                      <td style={{ padding: '3.5px 8px', fontWeight: 700, color: '#334155', background: '#f8fafc', borderRight: '1px solid #cbd5e1' }}>Bank UTR / Transaction No.</td>
                      <td style={{ padding: '3.5px 8px', fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>{slipData.utrNumber || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '3.5px 8px', fontWeight: 700, color: '#334155', background: '#f8fafc', borderRight: '1px solid #cbd5e1' }}>Verification Timestamp</td>
                      <td style={{ padding: '3.5px 8px', fontWeight: 600, color: '#0f172a' }}>
                        {slipData.verifiedAt ? new Date(slipData.verifiedAt).toLocaleString('en-IN') : 'Verified'} {slipData.verifiedBy ? `(by ${slipData.verifiedBy})` : ''}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}

            {/* Important Notice */}
            <div
              style={{
                border: '1.5px solid #ea580c',
                background: '#fff7ed',
                borderRadius: '4px',
                padding: '6px 10px',
                margin: '6px 0',
                fontSize: '9.5px',
                lineHeight: 1.35,
                color: '#9a3412'
              }}
            >
              <strong>IMPORTANT:</strong> Keep this Application ID and 6-Digit PIN safe. You can check your live payment verification status from any phone, laptop, or a friend’s device by selecting “Check Payment Status” on the MIT Mysore Uniform website.
            </div>

            {/* Footer */}
            <div
              style={{
                borderTop: '1.5px solid #0f172a',
                paddingTop: '4px',
                marginTop: '4px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end'
              }}
            >
              <div style={{ fontSize: '8.5px', color: '#64748b' }}>
                <div>Generated on: {new Date().toLocaleDateString('en-IN')}</div>
                <div>System Verified Electronic Document</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '9.5px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  MAHARAJA INSTITUTE OF TECHNOLOGY MYSORE
                </div>
                <div style={{ fontSize: '8.5px', color: '#475569' }}>
                  Belawadi, Srirangapatna Taluk, Mandya, Karnataka – 571477
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

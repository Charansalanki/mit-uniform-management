import React, { useState, useEffect, useCallback } from 'react';
import {
  PaymentConfig,
  PaymentMethod,
  PaymentSubmission,
  PaymentStatus,
  PaymentMethodType
} from '../types';
import { api } from '../api';
import { formatAcademicYear } from '../mockData';
import { useAuthenticatedSse } from '../hooks/useAuthenticatedSse';
import { useRealtimeSystemSync } from '../hooks/useRealtimeSystemSync';
import { API_BASE_URL } from '../utils/apiConfig';
import { cleanRegId, isValidRegistrationId } from '../utils/registrationIdUtils';
import {
  CheckCircle2,
  Clock3,
  AlertCircle,
  Download,
  FileCheck,
  ShieldCheck,
  Copy,
  Check,
  QrCode,
  Store,
  Upload,
  Lock,
  Printer,
  Banknote,
  ArrowRight,
  ChevronRight
} from 'lucide-react';
import StudentUniformSlipModal from './student/StudentUniformSlipModal';
import { StudentSlipData, printStudentSlip } from '../utils/studentSlipGenerator';

interface Props {
  registrationData: {
    id?: string;
    _id?: string;
    registrationId?: string;
    applicationId?: string;
    trackingPin?: string;
    studentId?: string;
    fullName?: string;
    studentName?: string;
    usn: string;
    department: string;
    departmentShortName?: string;
    educationLevel?: string;
    course?: string;
    semester?: number;
    yearSemester?: string;
    academicYear?: string;
    section: string;
    gender?: string;
    packageType?: string;
  };
  onPaymentComplete?: () => void;
  apiBaseUrl?: string;
}

const METHOD_META: Record<PaymentMethodType, {
  label: string;
  badgeBg: string;
  accentBorder: string;
  logo: React.ReactNode;
}> = {
  GPAY: {
    label: 'Google Pay (GPay)',
    badgeBg: '#eff6ff',
    accentBorder: '#2563eb',
    logo: (
      <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: '#fff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <span style={{ color: '#2563eb' }}>G</span>
        <span style={{ color: '#dc2626' }}>P</span>
        <span style={{ color: '#d97706' }}>a</span>
        <span style={{ color: '#16a34a' }}>y</span>
      </div>
    )
  },
  PHONEPE: {
    label: 'PhonePe',
    badgeBg: '#faf5ff',
    accentBorder: '#7e22ce',
    logo: (
      <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: '#7e22ce', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '17px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        पे
      </div>
    )
  },
  PAYTM: {
    label: 'Paytm',
    badgeBg: '#f0f9ff',
    accentBorder: '#0284c7',
    logo: (
      <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: '#0284c7', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '11px', letterSpacing: '-0.5px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        Paytm
      </div>
    )
  },
  CASH: {
    label: 'Direct Cash Payment',
    badgeBg: '#fef3c7',
    accentBorder: '#d97706',
    logo: (
      <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: '#fffbeb', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', color: '#b45309' }}>
        ₹
      </div>
    )
  }
};

const STATUS_STYLE: Record<PaymentStatus, { bg: string; text: string; border: string }> = {
  'Not Paid': { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
  'Payment Pending': { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
  'Payment Submitted': { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  'Submitted': { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  'Under Verification': { bg: '#ffedd5', text: '#9a3412', border: '#fdba74' },
  'Payment Verified': { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  'Verified': { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  'Payment Successful': { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  'Payment Rejected': { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  'Rejected': { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  'Payment Not Received': { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  'CASH PAYMENT PENDING': { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  'CASH RECEIVED': { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  'CASH PAYMENT REJECTED': { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' }
};

export default function StudentPaymentSection({ registrationData }: Props) {
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [submission, setSubmission] = useState<PaymentSubmission | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('Not Paid');
  const [assignedVendor, setAssignedVendor] = useState<{
    vendorId: string;
    vendorName: string;
    allocationId: string;
    matchedGroup: string;
    beneficiaryName: string;
    upiId: string;
    paymentAmount?: number | null;
    paymentInstructions?: string;
    collectionRoom?: string;
    distributionStatus?: string;
    distributionDate?: string;
    uniformAvailability?: string;
  } | null>(null);

  const [selectedGenderOverride, setSelectedGenderOverride] = useState<string>(registrationData.gender || '');
  const [genderRequiredPrompt, setGenderRequiredPrompt] = useState(false);

  const [utrNumber, setUtrNumber] = useState('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [noVendorAssigned, setNoVendorAssigned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successBanner, setSuccessBanner] = useState('');
  const [copiedUtr, setCopiedUtr] = useState(false);
  const [showSlipModal, setShowSlipModal] = useState(false);
  const [fetchedPin, setFetchedPin] = useState<string>('');

  // Swiggy-style Checkout Selection state
  const [checkoutMode, setCheckoutMode] = useState<'UPI' | 'CASH'>('UPI');
  const [confirmedMode, setConfirmedMode] = useState<'UPI' | 'CASH' | null>(null);
  const [cashSubmitting, setCashSubmitting] = useState(false);
  const [cashPaymentRefId, setCashPaymentRefId] = useState<string>('');

  // 1. Resolve and normalize the registration ID once at the top of the component scope
  const rawRegistrationId =
    registrationData?.registrationId ||
    registrationData?._id ||
    registrationData?.id ||
    (registrationData as any)?.applicationId ||
    '';

  const normalizedRegId = cleanRegId(rawRegistrationId);
  const regId = normalizedRegId;
  const studentName = registrationData.studentName || registrationData.fullName || 'Student';
  const yearSemDisplay = registrationData.yearSemester || formatAcademicYear(registrationData.semester) || '1st Year';

  const isVerified =
    (paymentStatus as string) === 'Payment Verified' ||
    (paymentStatus as string) === 'Payment Successful' ||
    (paymentStatus as string) === 'Verified' ||
    (paymentStatus as string) === 'CASH RECEIVED';

  const isCashPending = paymentStatus === 'CASH PAYMENT PENDING';
  const isCashReceived = paymentStatus === 'CASH RECEIVED';
  const isCashRejected = paymentStatus === 'CASH PAYMENT REJECTED';

  // Uniform Fee is strictly vendor-based: only display the assigned vendor's configured price money.
  // If no vendor is assigned or vendor price is not configured, it must NOT show an amount (it must be blank).
  const assignedVendorFee: number | null = (submission?.amount || submission?.expectedAmount)
    ? Number(submission?.amount || submission?.expectedAmount)
    : (assignedVendor && (assignedVendor.paymentAmount ?? config?.resolvedAmount) && Number(assignedVendor.paymentAmount ?? config?.resolvedAmount) > 0)
      ? Number(assignedVendor.paymentAmount ?? config?.resolvedAmount)
      : null;

  // Active amounts strictly bound to assigned vendor fee (or null if unassigned)
  const displayExpectedAmount = assignedVendorFee;
  const requiredAmount = assignedVendorFee;

  // Resolve trackingPin from registrationData, API, or local storage fallback
  const resolvedPin =
    (registrationData as any)?.trackingPin ||
    fetchedPin ||
    (() => {
      try {
        const u = (registrationData?.usn || '').toUpperCase().trim();
        const r = regId;
        const app = (registrationData as any)?.applicationId || '';
        return (
          sessionStorage.getItem(`mit_pin_${r}`) ||
          sessionStorage.getItem(`mit_pin_${app}`) ||
          sessionStorage.getItem(`mit_pin_${u}`) ||
          localStorage.getItem(`mit_pin_${r}`) ||
          localStorage.getItem(`mit_pin_${app}`) ||
          localStorage.getItem(`mit_pin_${u}`) ||
          ''
        );
      } catch {
        return '';
      }
    })();

  const slipData: StudentSlipData = {
    applicationId:
      (registrationData as any)?.applicationId ||
      (regId.startsWith('MIT-') ? regId : `MIT-2026-${regId.replace(/\D/g, '').slice(-4).padStart(4, '0')}`),
    registrationId:
      (registrationData as any).registration_id ||
      (registrationData as any).registrationId ||
      (regId.startsWith('MIT-') ? `REG-${regId.replace('MIT-2026-', '')}` : regId),
    trackingPin: resolvedPin,
    studentName,
    usn: registrationData.usn || '',
    course: 'B.E.',
    department: registrationData.department || '',
    academicYear: '2026–27',
    section: registrationData.section || '',
    gender: selectedGenderOverride || registrationData.gender || '',
    shirtSize: (registrationData as any).shirtSize || 'Standard',
    trouserSize: (registrationData as any).trouserSize || 'Standard',
    blazerSize: (registrationData as any).blazerSize || '',
    remarks: (registrationData as any).remarks || (registrationData as any).uniformMeasurements?.remarks || '',
    packageType: registrationData.packageType || 'Standard',
    vendorName: assignedVendor?.vendorName || 'Assigned Uniform Vendor',
    vendorId: assignedVendor?.vendorId || 'N/A',
    isPaymentVerified: isVerified,
    paymentStatus,
    paidAmount: submission?.actualAmountReceived ?? submission?.amount ?? (assignedVendorFee || 0),
    utrNumber: submission?.utrNumber ?? submission?.cashPaymentRefId ?? cashPaymentRefId ?? utrNumber ?? (isCashReceived ? 'CASH PAYMENT' : ''),
    verifiedAt: submission?.verifiedAt ?? '',
    verifiedBy: assignedVendor?.vendorName ?? ''
  };

  // Fetch live QR scanners & config from backend (with automatic vendor routing)
  const fetchLivePaymentConfig = useCallback(async () => {
    const validRegId = cleanRegId(rawRegistrationId);
    if (!isValidRegistrationId(validRegId)) {
      setLoadingConfig(false);
      setNoVendorAssigned(true);
      return;
    }

    try {
      setLoadingConfig(true);
      setErrorMsg('');

      const courseClean = String((registrationData as any)?.course || registrationData?.department || '').toUpperCase().trim();
      const isPg = courseClean.includes('MBA') || courseClean.includes('MCA');
      const derivedCourse = isPg ? (courseClean.includes('MBA') ? 'MBA' : 'MCA') : 'B.E.';
      const derivedEduLevel = isPg ? 'PG' : 'UG';

      const query = new URLSearchParams({
        usn: (registrationData?.usn || '').trim().toUpperCase(),
        educationLevel: (registrationData as any)?.educationLevel || derivedEduLevel,
        course: (registrationData as any)?.course || derivedCourse,
        department: (registrationData as any)?.departmentShortName || registrationData?.department || '',
        academicYear: registrationData?.academicYear || registrationData?.yearSemester || yearSemDisplay,
        semester: registrationData?.semester ? String(registrationData.semester) : 'ALL',
        section: registrationData?.section || '',
        gender: selectedGenderOverride || registrationData?.gender || '',
        t: String(Date.now())
      }).toString();

      const vRes = await fetch(`${API_BASE_URL}/api/student/vendor-payment/${encodeURIComponent(validRegId)}?${query}`, {
        cache: 'no-store'
      });
      if (vRes.ok) {
        const vData = await vRes.json();
        if (vData.genderRequired || vData.code === 'GENDER_REQUIRED_FOR_MATCH') {
          setGenderRequiredPrompt(true);
          setAssignedVendor(null);
          setNoVendorAssigned(true);
          setMethods([]);
          setConfig(null);
          setLoadingConfig(false);
          return;
        }
        if (vData.success && vData.assignedVendor) {
          if (vData.trackingPin) {
            setFetchedPin(vData.trackingPin);
          }
          setAssignedVendor(vData.assignedVendor);
          setNoVendorAssigned(false);
          setGenderRequiredPrompt(false);
          setConfig(vData.paymentConfig);
          const activeList = vData.methods || [];
          setMethods(activeList);
          setSelectedMethod((prevSelected) => {
            if (prevSelected) {
              const updatedCurrent = activeList.find((m: any) => m.methodType === prevSelected.methodType);
              if (updatedCurrent) return updatedCurrent;
            }
            return activeList.length > 0 ? activeList[0] : null;
          });
          setLoadingConfig(false);
          return;
        }
      } else {
        const errData = await vRes.json().catch(() => ({}));
        if (errData.genderRequired || errData.code === 'GENDER_REQUIRED_FOR_MATCH') {
          setGenderRequiredPrompt(true);
          setAssignedVendor(null);
          setNoVendorAssigned(true);
          setMethods([]);
          setConfig(null);
          setLoadingConfig(false);
          return;
        }
        // No vendor allocated or vendor released: strictly wait for vendor assignment
        setAssignedVendor(null);
        setNoVendorAssigned(true);
        setMethods([]);
        setConfig(null);
        setLoadingConfig(false);
        return;
      }
    } catch (err) {
      console.warn('Error loading payment config:', err);
      setAssignedVendor(null);
      setNoVendorAssigned(true);
      setMethods([]);
      setConfig(null);
    } finally {
      setLoadingConfig(false);
    }
  }, [rawRegistrationId, registrationData, yearSemDisplay, selectedGenderOverride]);

  // Fetch existing payment status for this student
  const fetchPaymentStatus = useCallback(async () => {
    const validRegId = cleanRegId(rawRegistrationId);
    if (!isValidRegistrationId(validRegId)) return;
    try {
      const data = await api.getPaymentStatus(validRegId);
      if (data.success) {
        setPaymentStatus(data.paymentStatus || 'Not Paid');
        if (data.submission) {
          setSubmission(data.submission);
          if (data.submission.cashPaymentRefId) {
            setCashPaymentRefId(data.submission.cashPaymentRefId);
          }
        }
        if (
          data.paymentStatus === 'CASH PAYMENT PENDING' ||
          data.paymentStatus === 'CASH RECEIVED' ||
          data.paymentStatus === 'CASH PAYMENT REJECTED' ||
          data.submission?.paymentMethod === 'CASH' ||
          data.submission?.paymentModeType === 'CASH'
        ) {
          setCheckoutMode('CASH');
          setConfirmedMode('CASH');
        } else if (
          data.paymentStatus === 'Payment Submitted' ||
          data.paymentStatus === 'Under Verification' ||
          data.paymentStatus === 'Payment Successful' ||
          data.paymentStatus === 'Payment Verified'
        ) {
          setCheckoutMode('UPI');
          setConfirmedMode('UPI');
        }
      }
    } catch (err) {
      console.warn('Error checking payment status:', err);
    }
  }, [rawRegistrationId]);

  const handleContinueCashPayment = async () => {
    setErrorMsg('');
    setSuccessBanner('');
    const verifiedRegId = cleanRegId(rawRegistrationId);
    if (!isValidRegistrationId(verifiedRegId)) {
      setErrorMsg('Valid Student Registration ID is missing.');
      return;
    }

    try {
      setCashSubmitting(true);
      const res = await api.requestCashPayment({
        registrationId: verifiedRegId,
        applicationId: cleanRegId((registrationData as any)?.applicationId || ''),
        usn: (registrationData.usn || '').toUpperCase().trim(),
        studentName: (registrationData.studentName || registrationData.fullName || studentName || '').trim(),
        course: (registrationData as any)?.course || 'B.E.',
        department: (registrationData as any)?.departmentShortName || registrationData.department || '',
        academicYear: registrationData.academicYear || registrationData.yearSemester || yearSemDisplay,
        section: registrationData.section || '',
        gender: selectedGenderOverride || registrationData.gender || '',
        packageType: registrationData.packageType || 'standard'
      });

      if (res.success) {
        setCashPaymentRefId(res.cashPaymentRefId);
        setPaymentStatus(res.paymentStatus);
        setConfirmedMode('CASH');
        setSuccessBanner(res.message);
        if (res.assignedVendor) {
          setAssignedVendor((prev: any) => ({
            ...prev,
            ...res.assignedVendor
          }));
        }
      }
    } catch (err: any) {
      if (err.data?.alreadyPending) {
        setCashPaymentRefId(err.data.cashPaymentRefId);
        setPaymentStatus('CASH PAYMENT PENDING');
        setConfirmedMode('CASH');
      } else {
        setErrorMsg(err.message || 'Failed to initiate cash payment request.');
      }
    } finally {
      setCashSubmitting(false);
    }
  };

  // Real-Time SSE & Sync Polling hook for immediate system updates
  useRealtimeSystemSync({
    apiBaseUrl: API_BASE_URL,
    onSyncInvalidate: () => {
      fetchLivePaymentConfig();
      fetchPaymentStatus();
    }
  });

  useEffect(() => {
    fetchLivePaymentConfig();
    fetchPaymentStatus();
  }, [fetchLivePaymentConfig, fetchPaymentStatus]);

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg('');
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      setErrorMsg('Only PNG, JPG, and JPEG payment screenshots are allowed.');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Screenshot file size must be under 5 MB.');
      e.target.value = '';
      return;
    }

    setScreenshotFile(file);
    setScreenshotPreview(URL.createObjectURL(file));
  };

  const handleDownloadQr = (qrUrl: string, methodName: string) => {
    const fullUrl = qrUrl.startsWith('http') ? qrUrl : `http://localhost:4000${qrUrl}`;
    const link = document.createElement('a');
    link.href = fullUrl;
    link.download = `MIT_Mysore_${methodName.replace(/\s+/g, '_')}_QR.png`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessBanner('');

    const verifiedRegId = cleanRegId(rawRegistrationId);
    if (!isValidRegistrationId(verifiedRegId)) {
      setErrorMsg(
        'Valid Student Registration ID is missing. Please refresh the page or retrieve your registration using your Application ID and Tracking PIN.'
      );
      return;
    }

    if (!selectedMethod) {
      setErrorMsg('Please select an active UPI payment method.');
      return;
    }

    const cleanUtr = String(utrNumber || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().trim();
    if (cleanUtr.length < 10 || cleanUtr.length > 22) {
      setErrorMsg('Please enter a valid 12-digit UPI UTR / Transaction Reference Number.');
      return;
    }

    if (!screenshotFile) {
      setErrorMsg('Please upload your UPI payment screenshot (PNG, JPG, or JPEG).');
      return;
    }

    if (!assignedVendorFee || assignedVendorFee <= 0) {
      setErrorMsg('No uniform fee amount is configured for this assigned vendor. Please contact the administrator.');
      return;
    }

    try {
      setSubmitting(true);
      const formData = new FormData();
      formData.append('registrationId', verifiedRegId);
      formData.append('applicationId', cleanRegId((registrationData as any)?.applicationId || ''));
      formData.append('studentId', registrationData.id || (registrationData as any)?.studentId || verifiedRegId);
      formData.append('studentName', (registrationData.studentName || registrationData.fullName || studentName || '').trim());
      formData.append('usn', (registrationData.usn || '').toUpperCase().trim());
      formData.append('educationLevel', (registrationData as any)?.educationLevel || 'UG');
      formData.append('course', (registrationData as any)?.course || 'B.E.');
      formData.append('department', (registrationData as any)?.departmentShortName || registrationData.department || '');
      formData.append('yearSemester', registrationData.academicYear || registrationData.yearSemester || yearSemDisplay);
      formData.append('academicYear', registrationData.academicYear || registrationData.yearSemester || yearSemDisplay);
      formData.append('semester', registrationData.semester ? String(registrationData.semester) : 'ALL');
      formData.append('section', registrationData.section || '');
      formData.append('gender', selectedGenderOverride || registrationData.gender || '');
      formData.append('paymentMethod', selectedMethod.methodType);
      formData.append('utrNumber', cleanUtr);
      formData.append('amount', String(assignedVendorFee));
      if (registrationData.packageType) {
        formData.append('packageType', registrationData.packageType);
      }
      formData.append('paymentScreenshot', screenshotFile);

      const data = await api.submitPayment(formData);
      setSuccessBanner('Payment submitted successfully. Your payment is awaiting verification.');
      setSubmission(data.submission);
      setPaymentStatus(data.submission.paymentStatus);
      setUtrNumber('');
      setScreenshotFile(null);
      setScreenshotPreview(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Payment submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmitForm =
    paymentStatus === 'Not Paid' ||
    paymentStatus === 'Payment Pending' ||
    paymentStatus === 'Payment Rejected' ||
    paymentStatus === 'Rejected' ||
    paymentStatus === 'Payment Not Received' ||
    paymentStatus === 'CASH PAYMENT REJECTED';
  const currentStatusStyle = STATUS_STYLE[paymentStatus] || STATUS_STYLE['Not Paid'];

  return (
    <>
      <div style={{ maxWidth: '960px', width: '100%', margin: '0 auto', background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 4px 18px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        {/* ── Top Header Banner ── */}
      <div style={{ background: '#0f172a', color: '#ffffff', padding: 'clamp(16px, 3vw, 22px) clamp(16px, 3.5vw, 26px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ flex: '1 1 280px' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={14} /> Step 4 of 4 · {assignedVendor ? 'Assigned Vendor UPI Payment' : 'Uniform Vendor UPI Payment'}
          </span>
          <h2 style={{ fontSize: 'clamp(18px, 4vw, 22px)', fontWeight: 800, margin: '4px 0 2px 0' }}>
            {assignedVendor ? `${assignedVendor.vendorName} Uniform Fee Payment` : 'Uniform Fee Payment'}
          </h2>
          <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
            Beneficiary: <strong style={{ color: '#ffffff' }}>
              {assignedVendor?.beneficiaryName || (noVendorAssigned ? 'Pending Vendor Assignment' : 'Assigned Uniform Vendor')}
            </strong>
          </p>
        </div>

        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '12px 18px', textAlign: 'left', minWidth: '150px' }}>
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>Total Uniform Fee</div>
          <div style={{ fontSize: 'clamp(20px, 4vw, 24px)', fontWeight: 900, color: '#ffffff', minHeight: '32px', display: 'flex', alignItems: 'center' }}>
            {assignedVendorFee !== null && assignedVendorFee > 0 ? `₹${assignedVendorFee.toLocaleString('en-IN')}` : ''}
          </div>
          <div style={{ marginTop: '4px' }}>
            <span
              style={{
                display: 'inline-block',
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 10px',
                borderRadius: '12px',
                background: currentStatusStyle.bg,
                color: currentStatusStyle.text,
                border: `1px solid ${currentStatusStyle.border}`
              }}
            >
              Status: {isVerified ? 'Paid' : paymentStatus}
            </span>
          </div>
        </div>
      </div>

      <div style={{ padding: 'clamp(14px, 3vw, 24px)', display: 'flex', flexDirection: 'column', gap: '22px' }}>
        {/* ── Student Summary Strip ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: '12px', background: '#f8fafc', padding: '14px 18px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px' }}>
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Student Name</span>
            <strong style={{ color: '#0f172a' }}>{studentName}</strong>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>USN</span>
            <strong style={{ color: '#0f172a', fontFamily: 'monospace' }}>{registrationData.usn}</strong>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Dept / Year / Sec</span>
            <strong style={{ color: '#0f172a' }}>{registrationData.department} · {yearSemDisplay} (Sec {registrationData.section})</strong>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Registration ID</span>
            <strong style={{ color: '#2563eb', fontFamily: 'monospace' }}>#{regId.toUpperCase().replace(/^#/, '')}</strong>
          </div>
        </div>

        {/* ── Assigned Uniform Vendor Card ── */}
        {assignedVendor && (
          <div style={{
            background: '#f0f9ff',
            border: '1.5px solid #bae6fd',
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap'
          }}>
            <div>
              <span style={{
                fontSize: '11px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <Store size={14} /> YOUR ASSIGNED UNIFORM VENDOR
              </span>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: '4px 0 2px 0' }}>
                {assignedVendor.vendorName}{' '}
                <span style={{ fontFamily: 'monospace', color: '#2563eb', fontSize: '13px' }}>
                  ({assignedVendor.vendorId})
                </span>
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: '#475569' }}>
                Academic Group: <strong>{assignedVendor.matchedGroup}</strong>
              </p>
              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {assignedVendor.collectionRoom && (
                  <span style={{ fontSize: '11px', background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}>
                    📍 Collection: {assignedVendor.collectionRoom}
                  </span>
                )}
                {assignedVendor.distributionStatus && (
                  <span style={{ fontSize: '11px', background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}>
                    📦 Distribution: {assignedVendor.distributionStatus}
                  </span>
                )}
                {assignedVendor.uniformAvailability && (
                  <span style={{ fontSize: '11px', background: '#fef3c7', color: '#b45309', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}>
                    🏷️ {assignedVendor.uniformAvailability}
                  </span>
                )}
              </div>
            </div>
            <div style={{
              background: '#ffffff',
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid #e0f2fe',
              fontSize: '12px',
              minWidth: '220px'
            }}>
              <div style={{ marginBottom: '3px' }}>
                <span style={{ color: '#64748b' }}>Beneficiary: </span>
                <strong style={{ color: '#0f172a' }}>{assignedVendor.beneficiaryName}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Official UPI ID: </span>
                <strong style={{ fontFamily: 'monospace', color: '#0284c7' }}>{assignedVendor.upiId}</strong>
              </div>
            </div>
          </div>
        )}

        {/* ── Status Notification Banners ── */}
        {successBanner && !isVerified && (
          <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: '14px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={18} />
            <span>{successBanner}</span>
          </div>
        )}

        {isVerified && (
          <div style={{ background: '#ecfdf5', border: '2px solid #34d399', borderRadius: '12px', padding: '18px 22px', color: '#064e3b' }}>
            <h3 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#16a34a', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>✓</span>
              PAYMENT SUCCESSFUL
            </h3>
            <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.6 }}>
              Your uniform payment of <strong>₹{Number(submission?.actualAmountReceived || submission?.bankVerifiedAmount || submission?.amount || assignedVendorFee || 0).toLocaleString('en-IN')}</strong>
              {submission?.paymentMethod === 'CASH'
                ? <> (Cash Ref: <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{submission?.cashPaymentRefId || cashPaymentRefId}</span>)</>
                : (submission?.utrNumber ? <> (UTR: <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{submission.utrNumber}</span>)</> : null)}
              {' '}has been officially verified. Your uniform order has been sent to production!
            </p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setShowSlipModal(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 16px',
                  background: '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(22, 163, 74, 0.2)'
                }}
              >
                <Download size={14} /> Download Verified Slip (1-Page A4)
              </button>
            </div>
          </div>
        )}

        {isCashPending && (
          <div style={{ background: '#fffbeb', border: '2px solid #fde047', borderRadius: '14px', padding: '20px 24px', color: '#78350f' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#92400e' }}>
                <Banknote size={20} color="#d97706" /> Cash Payment Selected · Pending Counter Collection
              </h3>
              <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 10px', borderRadius: '12px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde047' }}>
                CASH PAYMENT PENDING
              </span>
            </div>

            <p style={{ margin: '0 0 14px 0', fontSize: '13px', lineHeight: 1.6, color: '#78350f' }}>
              Cash payment selected. Please pay the amount directly to your assigned uniform vendor. Your payment will be confirmed after the vendor receives the cash.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', background: 'rgba(255,255,255,0.9)', padding: '14px', borderRadius: '10px', border: '1px solid #fde68a', fontSize: '12px', marginBottom: '14px' }}>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Cash Reference ID</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                  <strong style={{ color: '#1d4ed8', fontFamily: 'monospace', fontSize: '14px' }}>
                    {cashPaymentRefId || submission?.cashPaymentRefId || 'N/A'}
                  </strong>
                  {(cashPaymentRefId || submission?.cashPaymentRefId) && (
                    <button
                      type="button"
                      onClick={() => {
                        const id = cashPaymentRefId || submission?.cashPaymentRefId || '';
                        navigator.clipboard.writeText(id);
                        setCopiedUtr(true);
                        setTimeout(() => setCopiedUtr(false), 2000);
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#2563eb' }}
                      title="Copy Reference ID"
                    >
                      {copiedUtr ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                    </button>
                  )}
                </div>
              </div>

              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Payable Amount</span>
                <strong style={{ color: '#0f172a', fontSize: '14px' }}>
                  ₹{Number(submission?.amount || submission?.expectedAmount || assignedVendorFee || 1500).toLocaleString('en-IN')}
                </strong>
              </div>

              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Assigned Vendor Desk</span>
                <strong style={{ color: '#0f172a' }}>
                  {assignedVendor?.vendorName || submission?.vendorName || 'Assigned Vendor'}
                </strong>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>
                  📍 {assignedVendor?.collectionRoom || 'Main Distribution Hall'}
                </span>
              </div>
            </div>

            <div style={{ padding: '10px 14px', background: 'rgba(245, 158, 11, 0.12)', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.3)', fontSize: '12px', color: '#92400e', marginBottom: '12px' }}>
              <strong>Counter Instructions:</strong> Visit the vendor counter on campus, quote your Cash Reference ID <strong>#{cashPaymentRefId || submission?.cashPaymentRefId}</strong>, and hand over the exact fee of ₹{Number(submission?.amount || submission?.expectedAmount || assignedVendorFee || 1500).toLocaleString('en-IN')}. Once the vendor confirms receipt on their terminal, your official Uniform Distribution Slip will unlock immediately.
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ fontSize: '11.5px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={13} /> Official Slip Locked: Will unlock as soon as vendor marks "Cash Received".
              </div>

              <button
                type="button"
                onClick={() => {
                  setConfirmedMode('UPI');
                  setCheckoutMode('UPI');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563eb',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Changed your mind? Pay Online via UPI instead →
              </button>
            </div>
          </div>
        )}

        {isCashRejected && (
          <div style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: '12px', padding: '18px 22px', color: '#7f1d1d' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={18} /> Cash Payment Request Rejected by Vendor
            </h3>
            <p style={{ margin: '0 0 8px 0', fontSize: '13px' }}>
              Your cash payment request (Ref: <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{submission?.cashPaymentRefId || cashPaymentRefId}</span>) was rejected by the vendor.
            </p>
            {submission?.rejectionReason && (
              <div style={{ background: 'rgba(255,255,255,0.7)', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', color: '#991b1b', marginBottom: '12px', border: '1px solid #fecaca' }}>
                <strong>Reason given:</strong> {submission.rejectionReason}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  setConfirmedMode(null);
                  setCheckoutMode('CASH');
                }}
                style={{ padding: '8px 14px', borderRadius: '8px', background: '#16a34a', color: '#fff', fontSize: '12px', fontWeight: 800, border: 'none', cursor: 'pointer' }}
              >
                Re-request Cash Payment
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmedMode('UPI');
                  setCheckoutMode('UPI');
                }}
                style={{ padding: '8px 14px', borderRadius: '8px', background: '#2563eb', color: '#fff', fontSize: '12px', fontWeight: 800, border: 'none', cursor: 'pointer' }}
              >
                Pay via Online UPI Instead
              </button>
            </div>
          </div>
        )}

        {(paymentStatus === 'Payment Submitted' || paymentStatus === 'Under Verification') && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '18px 22px', color: '#78350f' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock3 size={18} /> Payment Submitted – Awaiting Official Bank Verification
            </h3>
            <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.6 }}>
              Payment submitted successfully. Your payment is awaiting verification by the MIT Mysore accounts administrator against the official bank statement.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '12px', background: 'rgba(255,255,255,0.85)', padding: '12px', borderRadius: '8px', border: '1px solid #fef3c7', fontSize: '12px' }}>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Submitted Method</span>
                <strong style={{ color: '#1e293b' }}>{submission?.paymentMethod}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>UTR / Reference No.</span>
                <strong style={{ color: '#1d4ed8', fontFamily: 'monospace' }}>{submission?.utrNumber}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Locked Amount</span>
                <strong style={{ color: '#1e293b' }}>₹{Number(submission?.amount).toLocaleString('en-IN')}</strong>
              </div>
            </div>
            <div style={{ marginTop: '12px', padding: '8px 12px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '6px', fontSize: '11.5px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
              <Lock size={13} /> Official Slip Locked: The official verified slip will be unlocked immediately once verified by the vendor.
            </div>
          </div>
        )}

        {(paymentStatus === 'Payment Rejected' || paymentStatus === 'Rejected' || paymentStatus === 'Payment Not Received') && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '12px', padding: '18px 22px', color: '#7f1d1d' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={18} /> Payment Verification Notice
            </h3>
            <p style={{ margin: '0 0 6px 0', fontSize: '13px' }}>
              <strong>Status:</strong> {paymentStatus === 'Payment Not Received' ? 'Payment Not Received in Bank Statement' : 'Payment Rejected'}
            </p>
            {submission?.adminRemarks && (
              <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#991b1b' }}>Admin Note: {submission.adminRemarks}</p>
            )}
            <p style={{ margin: 0, fontSize: '12px', fontWeight: 600 }}>
              Please check your 12-digit UPI UTR number and re-upload valid payment proof below.
            </p>
          </div>
        )}

        {/* ── No Active Vendor Assigned Banner ── */}
        {canSubmitForm && noVendorAssigned && !loadingConfig && (
          <div style={{
            background: '#fff7ed',
            border: '2px solid #fdba74',
            borderRadius: '12px',
            padding: '28px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: '#ffedd5',
              color: '#ea580c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <AlertCircle size={26} />
            </div>
            <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#9a3412', margin: 0 }}>
              {genderRequiredPrompt ? 'Student Gender Required for Vendor Routing' : 'Uniform Vendor Assignment In Progress'}
            </h3>
            <p style={{ margin: 0, fontSize: '13.5px', color: '#7c2d12', maxWidth: '560px', lineHeight: 1.6 }}>
              {genderRequiredPrompt
                ? 'Your department has separate uniform vendors for Boys and Girls. Please select your gender below:'
                : <>Your academic group (<strong>{registrationData.department} • {yearSemDisplay} • Section {registrationData.section}</strong>) is currently not linked to an active uniform vendor.</>}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#9a3412' }}>Gender:</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedGenderOverride('Boys');
                  setGenderRequiredPrompt(false);
                }}
                style={{
                  padding: '7px 18px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  background: selectedGenderOverride.toLowerCase().includes('boy') || selectedGenderOverride.toLowerCase().includes('male') ? '#2563eb' : '#ffffff',
                  color: selectedGenderOverride.toLowerCase().includes('boy') || selectedGenderOverride.toLowerCase().includes('male') ? '#ffffff' : '#1e40af',
                  border: '1.5px solid #2563eb',
                  transition: 'all 0.15s ease'
                }}
              >
                👦 Boys Uniform
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedGenderOverride('Girls');
                  setGenderRequiredPrompt(false);
                }}
                style={{
                  padding: '7px 18px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  background: selectedGenderOverride.toLowerCase().includes('girl') || selectedGenderOverride.toLowerCase().includes('female') ? '#db2777' : '#ffffff',
                  color: selectedGenderOverride.toLowerCase().includes('girl') || selectedGenderOverride.toLowerCase().includes('female') ? '#ffffff' : '#be185d',
                  border: '1.5px solid #db2777',
                  transition: 'all 0.15s ease'
                }}
              >
                👧 Girls Uniform
              </button>
            </div>
            {!genderRequiredPrompt && (
              <p style={{ margin: 0, fontSize: '12.5px', color: '#c2410c', maxWidth: '520px', lineHeight: 1.5 }}>
                The college administration has released this group or is currently re-assigning a uniform vendor. Official payment QR scanners will automatically unlock here as soon as the vendor assignment is completed.
              </p>
            )}
          </div>
        )}

        {/* ── Collection Disabled Notice (Rendered when config.isCollectionEnabled === false) ── */}
        {!config?.isCollectionEnabled && canSubmitForm && !noVendorAssigned && (
          <div style={{ background: '#fffbeb', border: '2px solid #f59e0b', padding: '24px', borderRadius: '12px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#92400e', margin: 0 }}>
              {config?.unavailableMessage || 'Payment collection is temporarily unavailable. Please contact the Uniform Office.'}
            </h3>
            <p style={{ fontSize: '12.5px', color: '#b45309', margin: 0 }}>
              New payment submissions are currently paused by the administrator. If you have already submitted a payment, your verification status is displayed above.
            </p>
          </div>
        )}

        {/* ── Active Payment Flow (when student needs to pay / resubmit and collection is enabled) ── */}
        {canSubmitForm && !noVendorAssigned && config?.isCollectionEnabled && !isCashPending && (
          <>
            {confirmedMode !== 'UPI' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Select Payment Method
                  </label>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#64748b' }}>
                    Choose your preferred payment method below. Both options route to your assigned uniform vendor ({assignedVendor?.vendorName}).
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                  {/* Option 1: UPI */}
                  <div
                    onClick={() => setCheckoutMode('UPI')}
                    style={{
                      padding: '18px 20px',
                      borderRadius: '14px',
                      cursor: 'pointer',
                      border: checkoutMode === 'UPI' ? '2.5px solid #2563eb' : '1.5px solid #cbd5e1',
                      background: checkoutMode === 'UPI' ? '#eff6ff' : '#ffffff',
                      boxShadow: checkoutMode === 'UPI' ? '0 4px 14px rgba(37, 99, 235, 0.12)' : '0 1px 3px rgba(0,0,0,0.03)',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ padding: '6px', borderRadius: '8px', background: '#dbeafe', color: '#1d4ed8' }}>
                            <QrCode size={20} />
                          </span>
                          <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                            Online UPI Payment
                          </span>
                        </div>

                        <div
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            border: checkoutMode === 'UPI' ? '2px solid #2563eb' : '2px solid #cbd5e1',
                            background: checkoutMode === 'UPI' ? '#2563eb' : '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          {checkoutMode === 'UPI' && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fff' }} />}
                        </div>
                      </div>

                      <p style={{ margin: '0 0 12px 0', fontSize: '12.5px', color: '#64748b', lineHeight: 1.5 }}>
                        Pay instantly via Google Pay, PhonePe, or Paytm. Scan vendor QR code, enter your 12-digit UTR, and upload screenshot.
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '10px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', background: '#dbeafe', padding: '2px 8px', borderRadius: '4px' }}>Instant Online</span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>GPay · PhonePe · Paytm</span>
                    </div>
                  </div>

                  {/* Option 2: Cash */}
                  <div
                    onClick={() => setCheckoutMode('CASH')}
                    style={{
                      padding: '18px 20px',
                      borderRadius: '14px',
                      cursor: 'pointer',
                      border: checkoutMode === 'CASH' ? '2.5px solid #16a34a' : '1.5px solid #cbd5e1',
                      background: checkoutMode === 'CASH' ? '#f0fdf4' : '#ffffff',
                      boxShadow: checkoutMode === 'CASH' ? '0 4px 14px rgba(22, 163, 74, 0.12)' : '0 1px 3px rgba(0,0,0,0.03)',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ padding: '6px', borderRadius: '8px', background: '#dcfce7', color: '#15803d' }}>
                            <Banknote size={20} />
                          </span>
                          <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                            Cash Payment (Pay at Desk)
                          </span>
                        </div>

                        <div
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            border: checkoutMode === 'CASH' ? '2px solid #16a34a' : '2px solid #cbd5e1',
                            background: checkoutMode === 'CASH' ? '#16a34a' : '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          {checkoutMode === 'CASH' && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fff' }} />}
                        </div>
                      </div>

                      <p style={{ margin: '0 0 12px 0', fontSize: '12.5px', color: '#64748b', lineHeight: 1.5 }}>
                        Generate your unique Cash Reference ID and pay ₹{assignedVendorFee ? assignedVendorFee.toLocaleString('en-IN') : '1,500'} directly in cash at your assigned vendor counter on campus.
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '10px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: '4px' }}>Counter Payment</span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>No QR scan or UTR needed</span>
                    </div>
                  </div>
                </div>

                {/* Continue CTA Button */}
                <div style={{ marginTop: '4px' }}>
                  {checkoutMode === 'UPI' ? (
                    <button
                      type="button"
                      onClick={() => setConfirmedMode('UPI')}
                      style={{
                        width: '100%',
                        padding: '13px 20px',
                        background: '#2563eb',
                        color: '#ffffff',
                        borderRadius: '10px',
                        fontWeight: 800,
                        fontSize: '14px',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: '0 2px 8px rgba(37,99,235,0.25)'
                      }}
                    >
                      <span>Continue with Online UPI Payment</span>
                      <ArrowRight size={16} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleContinueCashPayment}
                      disabled={cashSubmitting}
                      style={{
                        width: '100%',
                        padding: '13px 20px',
                        background: '#16a34a',
                        color: '#ffffff',
                        borderRadius: '10px',
                        fontWeight: 800,
                        fontSize: '14px',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: '0 2px 8px rgba(22,163,74,0.25)',
                        opacity: cashSubmitting ? 0.6 : 1
                      }}
                    >
                      <span>{cashSubmitting ? 'Generating Cash Reference ID...' : 'Continue with Cash Payment'}</span>
                      <ArrowRight size={16} />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setConfirmedMode(null)}
                    style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
                  >
                    ← Switch payment method (Pay Cash at Vendor Desk)
                  </button>
                </div>

                {/* 1. UPI Payment Option Cards */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                    1. Select UPI Payment App
                  </label>

              {loadingConfig ? (
                <div style={{ padding: '28px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                  Loading active UPI scanners...
                </div>
              ) : methods.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', color: '#92400e', fontSize: '13px' }}>
                  UPI QR scanners are currently being updated by the MIT Mysore administration. Please check back shortly or visit the counter.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                  {methods.map((method) => {
                    const meta = METHOD_META[method.methodType] || METHOD_META.GPAY;
                    const isSelected = selectedMethod?.methodType === method.methodType;
                    return (
                      <button
                        key={method.methodType}
                        type="button"
                        onClick={() => setSelectedMethod(method)}
                        style={{
                          textAlign: 'left',
                          padding: '14px 16px',
                          borderRadius: '12px',
                          border: isSelected ? `2px solid ${meta.accentBorder}` : '1px solid #cbd5e1',
                          background: isSelected ? meta.badgeBg : '#ffffff',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          transition: 'all 0.15s ease',
                          boxShadow: isSelected ? '0 4px 12px rgba(37,99,235,0.1)' : 'none'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {meta.logo}
                          <div>
                            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '14px' }}>
                              {method.name}
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>
                              {assignedVendorFee !== null && assignedVendorFee > 0
                                ? `Scan to Pay ₹${assignedVendorFee.toLocaleString('en-IN')}`
                                : 'Scan to Pay'}
                            </div>
                          </div>
                        </div>

                        <div
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            border: isSelected ? '2px solid #2563eb' : '2px solid #cbd5e1',
                            background: isSelected ? '#2563eb' : '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          {isSelected && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff' }} />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. QR Scanner Preview and Transaction Proof Form */}
            {selectedMethod && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '20px', background: '#f8fafc', padding: 'clamp(14px, 3vw, 22px)', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                {/* QR Scanner Display */}
                <div style={{ background: '#ffffff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#1d4ed8', background: '#eff6ff', padding: '4px 12px', borderRadius: '14px', border: '1px solid #bfdbfe', marginBottom: '14px' }}>
                    {selectedMethod.name} Official Scanner
                  </span>

                  <div style={{ width: '240px', minHeight: '260px', background: '#ffffff', border: '2px solid #cbd5e1', borderRadius: '12px', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {selectedMethod.qrImageUrl ? (
                      <img
                        src={
                          selectedMethod.qrImageUrl.startsWith('http')
                            ? selectedMethod.qrImageUrl
                            : `${selectedMethod.qrImageUrl}?v=${new Date(selectedMethod.updatedAt || Date.now()).getTime()}`
                        }
                        alt={`${selectedMethod.name} QR Code`}
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px' }}
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (selectedMethod.qrImageUrl && !target.src.includes(':4000')) {
                            target.src = `http://localhost:4000${selectedMethod.qrImageUrl}?v=${new Date(selectedMethod.updatedAt || Date.now()).getTime()}`;
                          }
                        }}
                      />
                    ) : (
                      <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '13px', padding: '20px' }}>
                        <QrCode size={48} style={{ opacity: 0.3, margin: '0 auto 8px auto', display: 'block' }} />
                        No QR Code Uploaded
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: '12px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Pay Exact Amount</div>
                    <div style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a', minHeight: '28px' }}>
                      {assignedVendorFee !== null && assignedVendorFee > 0 ? `₹${assignedVendorFee.toLocaleString('en-IN')}` : ''}
                    </div>
                  </div>

                  {selectedMethod.qrImageUrl && (
                    <button
                      type="button"
                      onClick={() => handleDownloadQr(selectedMethod.qrImageUrl!, selectedMethod.name)}
                      style={{ marginTop: '12px', width: '100%', padding: '8px 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#334155', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <Download size={14} /> Download QR Code
                    </button>
                  )}
                </div>

                {/* Instructions & Submission Form */}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                      Scan & Pay Instructions
                    </h4>
                    <p style={{ margin: 0, fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
                      {config?.paymentInstructions || 'Scan the active QR code above, make the uniform payment, and record your 12-digit transaction UTR number.'}
                    </p>

                    <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px', color: '#334155' }}>
                      <div>
                        <strong style={{ color: '#0f172a' }}>Beneficiary:</strong> {config?.beneficiaryName}
                      </div>
                      <div>
                        <strong style={{ color: '#0f172a' }}>UPI Remarks:</strong> {config?.referenceInstructions}
                      </div>
                      <div>
                        <strong style={{ color: '#0f172a' }}>Verification Note:</strong> {config?.additionalInstructions}
                      </div>
                    </div>
                  </div>

                  {/* Submission Form */}
                  <form onSubmit={handleSubmitPayment} style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      2. Submit Transaction Proof for Bank Verification
                    </label>

                    {errorMsg && (
                      <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: '8px', fontSize: '12px', fontWeight: 600 }}>
                        {errorMsg}
                      </div>
                    )}

                    {/* Mandatory Uniform Amount Display (Configured by Assigned Vendor) */}
                    <div style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block' }}>
                          Uniform Fee Payable
                        </span>
                        <div style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a', marginTop: '2px', minHeight: '28px' }}>
                          {assignedVendorFee !== null && assignedVendorFee > 0 ? `₹${assignedVendorFee.toLocaleString('en-IN')}` : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: '20px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', fontSize: '11px', fontWeight: 800 }}>
                          Exact Amount Required
                        </span>
                        <small style={{ display: 'block', color: '#64748b', fontSize: '11px', marginTop: '3px' }}>
                          Configured by Assigned Vendor
                        </small>
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                        UPI UTR / 12-Digit Transaction Reference Number *
                      </label>
                      <input
                        type="text"
                        required
                        value={utrNumber}
                        onChange={(e) => setUtrNumber(e.target.value)}
                        placeholder="e.g. 412345678901"
                        maxLength={22}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontFamily: 'monospace', fontWeight: 700, outline: 'none', boxSizing: 'border-box' }}
                      />
                      <small style={{ display: 'block', color: '#64748b', marginTop: '4px', fontSize: '11px' }}>
                        Must match the exact 12-digit UTR in your GPay / PhonePe / Paytm payment receipt.
                      </small>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                        Upload Payment Screenshot (PNG, JPG, JPEG · Max 5MB) *
                      </label>
                      <label
                        htmlFor="student-payment-screenshot-input"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          padding: '10px 16px',
                          background: '#eff6ff',
                          border: '1.5px dashed #3b82f6',
                          borderRadius: '8px',
                          color: '#1d4ed8',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          textAlign: 'center'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#dbeafe')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#eff6ff')}
                      >
                        <Upload size={15} />
                        <span>{screenshotFile ? `Change Screenshot (${screenshotFile.name})` : 'Choose Payment Screenshot File'}</span>
                      </label>
                      <input
                        id="student-payment-screenshot-input"
                        type="file"
                        accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                        required={!screenshotPreview}
                        onChange={handleScreenshotChange}
                        style={{ display: 'none' }}
                      />
                      {screenshotPreview && (
                        <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px', background: '#ffffff', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                          <img
                            src={screenshotPreview}
                            alt="Payment Proof Preview"
                            style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #e2e8f0' }}
                          />
                          <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>
                            Screenshot ready for upload
                          </span>
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="p-btn p-btn-primary"
                      style={{ padding: '12px', fontSize: '14px', fontWeight: 700, borderRadius: '8px', width: '100%', cursor: submitting ? 'not-allowed' : 'pointer' }}
                    >
                      {submitting ? 'Submitting Payment Proof...' : 'Submit Payment Details'}
                    </button>
                  </form>
                </div>
              </div>
            )}
            </>
          )}
          </>
        )}
      </div>
    </div>

      {/* Official Single-Page Slip Modal & Print Preview */}
      <StudentUniformSlipModal
        isOpen={showSlipModal}
        onClose={() => setShowSlipModal(false)}
        slipData={slipData}
      />
    </>
  );
}


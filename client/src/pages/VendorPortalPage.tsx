import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Banknote } from 'lucide-react';
import { useAuthenticatedSse } from '../hooks/useAuthenticatedSse';
import TailorMeasurementReportModal from '../components/shared/TailorMeasurementReportModal';
import VendorCashPaymentManagement from '../components/vendor/VendorCashPaymentManagement';
import { SIZE_GUIDE_CHARTS } from '../utils/uniformGarmentConfig';

const STATUS_BADGE: Record<string, string> = {
  Verified: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  'Payment Verified': 'bg-emerald-100 text-emerald-800 border-emerald-300',
  'Payment Successful': 'bg-emerald-100 text-emerald-800 border-emerald-300',
  Submitted: 'bg-amber-100 text-amber-800 border-amber-300',
  'Payment Submitted': 'bg-amber-100 text-amber-800 border-amber-300',
  'Under Verification': 'bg-blue-100 text-blue-800 border-blue-300',
  'Payment Not Received': 'bg-orange-100 text-orange-900 border-orange-300',
  Rejected: 'bg-red-100 text-red-800 border-red-300',
  'Payment Rejected': 'bg-red-100 text-red-800 border-red-300',
  'Not Paid': 'bg-slate-100 text-slate-600 border-slate-300',
  'CASH PAYMENT PENDING': 'bg-amber-100 text-amber-900 border-amber-300',
  'CASH RECEIVED': 'bg-emerald-100 text-emerald-900 border-emerald-300',
  'CASH PAYMENT REJECTED': 'bg-red-100 text-red-900 border-red-300'
};

interface VendorSummary {
  vendorId: string;
  vendorName: string;
  maskedMobile: string;
}

interface VendorProfile {
  vendorId: string;
  vendorName: string;
  contactPerson?: string;
  mobile?: string;
  email?: string;
  allowCsvExport?: boolean;
}

interface AllocationItem {
  allocationId: string;
  course: string;
  department: string;
  academicYear: string;
  semester: string;
  section: string;
}

interface StudentItem {
  registrationId: string;
  studentName: string;
  usn: string;
  course: string;
  department: string;
  academicYear: string;
  semester: string;
  section: string;
  gender?: string;
  shirtSize: string;
  trouserSize: string;
  blazerSize?: string;
  remarks?: string;
  uniform_measurements?: any;
  paymentAmount: number;
  paymentStatus: string;
  registrationDate: string;
}

interface PaymentItem {
  _id?: string;
  id?: string;
  registrationId: string;
  studentName: string;
  usn: string;
  course?: string;
  gender?: string;
  department: string;
  yearSemester: string;
  section: string;
  shirtSize?: string;
  trouserSize?: string;
  blazerSize?: string;
  uniform_measurements?: any;
  paymentModeType?: string;
  paymentMethod: string;
  cashPaymentRefId?: string | null;
  actualAmountReceived?: number | null;
  expectedAmount: number;
  amount: number;
  bankVerifiedAmount?: number | null;
  utrNumber: string;
  paymentScreenshot: string;
  paymentStatus: string;
  verifiedByIdentifier?: string | null;
  verifiedAt?: string | null;
  adminRemarks?: string;
  rejectionReason?: string;
  createdAt: string;
}

interface StatsData {
  totalRegisteredStudents: number;
  totalStudentsSubmittedSizes: number;
  totalPaymentsSubmitted: number;
  totalPaymentsVerified: number;
  totalPaymentsPending: number;
  totalPaymentsRejected: number;
  totalPaymentNotReceived: number;
  totalUniformOrders: number;
  totalAmountReceived: number;
  totalPendingAmount: number;
}

interface VendorPortalPageProps {
  apiBaseUrl?: string;
  token?: string;
}

const formatSectionLabel = (sec: string) => {
  if (!sec) return '';
  const trimmed = sec.trim();
  if (/^section\s+/i.test(trimmed)) return trimmed;
  return `Section ${trimmed}`;
};

const formatYearLabel = (yr: string) => {
  if (!yr) return '';
  const trimmed = yr.trim();
  if (/year/i.test(trimmed)) return trimmed;
  if (/^1/i.test(trimmed)) return '1st Year';
  if (/^2/i.test(trimmed)) return '2nd Year';
  if (/^3/i.test(trimmed)) return '3rd Year';
  if (/^4/i.test(trimmed)) return '4th Year';
  return `${trimmed} Year`;
};

export default function VendorPortalPage({ apiBaseUrl = '', token: tokenProp }: VendorPortalPageProps) {
  // Extract token from prop, URL pathname (/vendor/secure-access/:token), or URL query (?token=...)
  const getRawToken = (): string => {
    if (tokenProp) return tokenProp;
    const match = window.location.pathname.match(/\/vendor\/secure-access\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) return match[1];
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('token') || '';
  };

  const rawToken = getRawToken();

  // Link & Auth State
  const [linkChecking, setLinkChecking] = useState(true);
  const [linkError, setLinkError] = useState('');
  const [vendorSummary, setVendorSummary] = useState<VendorSummary | null>(null);
  const [vendorJwt, setVendorJwt] = useState<string>(
    () => sessionStorage.getItem(`mit_vendor_jwt_${rawToken}`) || ''
  );

  // Login Form State (Mobile + First 4 Digits of Registered Phone)
  const [mobileNumber, setMobileNumber] = useState('');
  const [firstFourDigitsPin, setFirstFourDigitsPin] = useState('');
  const [authError, setAuthError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Portal Navigation State
  const [activeNav, setActiveNav] = useState<'DASHBOARD' | 'STUDENTS' | 'VERIFICATION' | 'CASH_PAYMENTS' | 'LOGS' | 'REPORTS'>('DASHBOARD');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [vendorProfile, setVendorProfile] = useState<VendorProfile | null>(null);
  const [stats, setStats] = useState<StatsData>({
    totalRegisteredStudents: 0,
    totalStudentsSubmittedSizes: 0,
    totalPaymentsSubmitted: 0,
    totalPaymentsVerified: 0,
    totalPaymentsPending: 0,
    totalPaymentsRejected: 0,
    totalPaymentNotReceived: 0,
    totalUniformOrders: 0,
    totalAmountReceived: 0,
    totalPendingAmount: 0
  });
  const [allocations, setAllocations] = useState<AllocationItem[]>([]);

  // Registered Students State
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [studentFilters, setStudentFilters] = useState({
    search: '',
    department: 'ALL',
    academicYear: 'ALL',
    section: 'ALL',
    paymentStatus: 'ALL',
    startDate: ''
  });

  // Dynamically compute assigned departments from this vendor's allocated groups
  const assignedDepartments = useMemo(() => {
    const depts = new Set<string>();
    allocations.forEach((a) => {
      if (a.department) depts.add(a.department.trim());
    });
    if (depts.size === 0) {
      students.forEach((s) => {
        if (s.department) depts.add(s.department.trim());
      });
    }
    return Array.from(depts).sort();
  }, [allocations, students]);

  // Dynamically compute assigned years ONLY from this vendor's allocated groups
  const assignedYears = useMemo(() => {
    const years = new Set<string>();
    allocations.forEach((a) => {
      const matchDept =
        studentFilters.department === 'ALL' ||
        a.department?.toUpperCase() === studentFilters.department.toUpperCase();
      if (matchDept && a.academicYear) {
        years.add(a.academicYear.trim());
      }
    });
    if (years.size === 0) {
      students.forEach((s) => {
        const matchDept =
          studentFilters.department === 'ALL' ||
          s.department?.toUpperCase() === studentFilters.department.toUpperCase();
        if (matchDept && s.academicYear) {
          years.add(s.academicYear.trim());
        }
      });
    }
    return Array.from(years).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [allocations, students, studentFilters.department]);

  // Dynamically compute assigned sections ONLY from this vendor's allocated groups
  const assignedSections = useMemo(() => {
    const secs = new Set<string>();
    allocations.forEach((a) => {
      const matchDept =
        studentFilters.department === 'ALL' ||
        a.department?.toUpperCase() === studentFilters.department.toUpperCase();
      const matchYear =
        studentFilters.academicYear === 'ALL' ||
        a.academicYear?.toUpperCase() === studentFilters.academicYear.toUpperCase();
      if (matchDept && matchYear && a.section) {
        secs.add(a.section.trim());
      }
    });
    if (secs.size === 0) {
      students.forEach((s) => {
        const matchDept =
          studentFilters.department === 'ALL' ||
          s.department?.toUpperCase() === studentFilters.department.toUpperCase();
        const matchYear =
          studentFilters.academicYear === 'ALL' ||
          s.academicYear?.toUpperCase() === studentFilters.academicYear.toUpperCase();
        if (matchDept && matchYear && s.section) {
          secs.add(s.section.trim());
        }
      });
    }
    return Array.from(secs).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [allocations, students, studentFilters.department, studentFilters.academicYear]);

  // Auto-reset filters if selected year or section is no longer in the assigned list
  useEffect(() => {
    if (studentFilters.academicYear !== 'ALL' && !assignedYears.includes(studentFilters.academicYear)) {
      setStudentFilters((prev) => ({ ...prev, academicYear: 'ALL' }));
    }
  }, [assignedYears, studentFilters.academicYear]);

  useEffect(() => {
    if (studentFilters.section !== 'ALL' && !assignedSections.includes(studentFilters.section)) {
      setStudentFilters((prev) => ({ ...prev, section: 'ALL' }));
    }
  }, [assignedSections, studentFilters.section]);

  // Payment Verification & Payment Logs State
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [paymentFilters, setPaymentFilters] = useState({
    search: '',
    department: 'ALL',
    academicYear: 'ALL',
    section: 'ALL',
    paymentStatus: 'ALL',
    datePreset: 'ALL',
    startDate: '',
    endDate: ''
  });

  // Verification Modal State
  const [inspectPayment, setInspectPayment] = useState<PaymentItem | null>(null);
  const [verifiedAmountInput, setVerifiedAmountInput] = useState('');
  const [transactionRefInput, setTransactionRefInput] = useState('');
  const [remarksInput, setRemarksInput] = useState('');
  const [bankCreditConfirmed, setBankCreditConfirmed] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const [banner, setBanner] = useState({ type: '', text: '' });
  const [selectedTailorStudent, setSelectedTailorStudent] = useState<any>(null);
  const [availableVendors, setAvailableVendors] = useState<any[]>([]);

  // 1. Validate the unique portal link on mount (or load authorized vendor directory if token is absent)
  useEffect(() => {
    if (!rawToken) {
      fetch(`${apiBaseUrl}/api/vendor-portal/authorized-vendors-preview`)
        .then((r) => r.json())
        .then((d) => {
          if (d.success && Array.isArray(d.vendors)) {
            setAvailableVendors(d.vendors);
          }
        })
        .catch(() => {});
    }
  }, [apiBaseUrl, rawToken]);

  useEffect(() => {
    const verifyPortalLink = async () => {
      if (!rawToken) {
        setLinkError('Missing secure access token in URL. Please use your official vendor portal link or choose an authorized vendor below.');
        setLinkChecking(false);
        return;
      }
      try {
        setLinkChecking(true);
        const res = await fetch(`${apiBaseUrl}/api/vendor-portal/verify-link/${rawToken}`);
        const data = await res.json();
        if (!res.ok || !data.success) {
          setLinkError(data.message || 'Invalid or revoked vendor portal link.');
          setVendorJwt('');
          sessionStorage.removeItem(`mit_vendor_jwt_${rawToken}`);
        } else {
          setVendorSummary(data.vendorSummary);
        }
      } catch (err) {
        setLinkError('Unable to reach server to validate portal link.');
      } finally {
        setLinkChecking(false);
      }
    };
    verifyPortalLink();
  }, [apiBaseUrl, rawToken]);

  const handleLogout = useCallback((reason = '') => {
    sessionStorage.removeItem(`mit_vendor_jwt_${rawToken}`);
    setVendorJwt('');
    if (reason) setAuthError(reason);
  }, [rawToken]);

  const vendorFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const res = await fetch(`${apiBaseUrl}${url}`, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${vendorJwt}`
        }
      });
      const data = await res.json();
      if (res.status === 401 || res.status === 403) {
        if (data.sessionInvalidated) {
          handleLogout(data.message);
        }
      }
      return { res, data };
    },
    [apiBaseUrl, vendorJwt, handleLogout]
  );

  // Load Dashboard Summary
  const loadDashboard = useCallback(async () => {
    if (!vendorJwt) return;
    const { data } = await vendorFetch('/api/vendor-portal/dashboard');
    if (data?.success) {
      setVendorProfile(data.vendor);
      setStats(data.stats);
      setAllocations(data.allocations || []);
    }
  }, [vendorJwt, vendorFetch]);

  // Load Assigned Students
  const loadStudents = useCallback(async () => {
    if (!vendorJwt) return;
    const qs = new URLSearchParams(studentFilters as any).toString();
    const { data } = await vendorFetch(`/api/vendor-portal/students?${qs}`);
    if (data?.success) {
      setStudents(data.students || []);
    }
  }, [vendorJwt, vendorFetch, studentFilters]);

  // Load Assigned Payments
  const loadPayments = useCallback(async () => {
    if (!vendorJwt) return;
    const qs = new URLSearchParams(paymentFilters as any).toString();
    const { data } = await vendorFetch(`/api/vendor-portal/payments?${qs}`);
    if (data?.success) {
      setPayments(data.payments || []);
    }
  }, [vendorJwt, vendorFetch, paymentFilters]);

  // Auto-refresh polling every 10 seconds for real-time synchronization
  useEffect(() => {
    if (!vendorJwt) return;
    loadDashboard();
    loadStudents();
    loadPayments();

    const interval = setInterval(() => {
      loadDashboard();
      if (activeNav === 'STUDENTS') loadStudents();
      if (activeNav === 'VERIFICATION' || activeNav === 'LOGS') loadPayments();
    }, 5000);

    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        loadDashboard();
        loadStudents();
        loadPayments();
      }
    };
    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
    };
  }, [vendorJwt, activeNav, loadDashboard, loadStudents, loadPayments]);

  // Real-time Server-Sent Events (SSE) live updates
  useAuthenticatedSse({
    streamPath: '/api/sse/vendor',
    jwtToken: vendorJwt,
    apiBaseUrl,
    eventHandlers: {
      NEW_STUDENT_ASSIGNED: () => {
        loadDashboard();
        loadStudents();
      },
      NEW_PAYMENT_SUBMITTED: () => {
        loadDashboard();
        loadPayments();
      },
      PAYMENT_STATUS_UPDATED: () => {
        loadDashboard();
        loadPayments();
        loadStudents();
      },
      PAYMENT_VERIFIED: () => {
        loadDashboard();
        loadPayments();
        loadStudents();
      },
      GLOBAL_SYNC_UPDATE: () => {
        loadDashboard();
        loadStudents();
        loadPayments();
      },
      STUDENTS_REASSIGNED: () => {
        loadDashboard();
        loadStudents();
        loadPayments();
      },
      ALLOCATION_ASSIGNED: () => {
        loadDashboard();
        loadStudents();
        loadPayments();
      },
      ALLOCATION_RELEASED: () => {
        loadDashboard();
        loadStudents();
        loadPayments();
      },
      VENDOR_REASSIGNED: () => {
        loadDashboard();
        loadStudents();
        loadPayments();
      },
      VENDOR_ASSIGNMENT_CHANGED: () => {
        loadDashboard();
        loadStudents();
        loadPayments();
      },
      PAYMENT_CONFIG_CHANGED: () => {
        loadDashboard();
        loadStudents();
        loadPayments();
      },
      DISTRIBUTION_DETAILS_UPDATED: () => {
        loadDashboard();
        loadStudents();
      },
      VENDOR_SESSION_REVOKED: (data: any) => {
        handleLogout(data?.message || 'Your portal access was revoked by the administrator.');
      }
    }
  });

  // Handle Vendor Login (Mobile + First 4 Digits of Registered Phone)
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      setLoggingIn(true);
      const res = await fetch(`${apiBaseUrl}/api/vendor-portal/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawToken,
          mobileNumber,
          firstFourDigitsPin
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setAuthError(data.message || 'Authentication failed.');
        return;
      }
      sessionStorage.setItem(`mit_vendor_jwt_${rawToken}`, data.token);
      setVendorJwt(data.token);
      setVendorProfile(data.vendor);
    } catch (err) {
      setAuthError('Network error during sign-in.');
    } finally {
      setLoggingIn(false);
    }
  };

  // Handle Manual Payment Status Update by Vendor
  const handleVendorStatusUpdate = async (targetStatus: string) => {
    if (!inspectPayment) return;

    if (targetStatus === 'Verified') {
      const isCash = inspectPayment.paymentMethod === 'CASH' || inspectPayment.paymentModeType === 'CASH';
      if (!bankCreditConfirmed) {
        setBanner({
          type: 'error',
          text: isCash
            ? 'You must confirm that you have physically collected the cash at the uniform counter before marking as Payment Received.'
            : 'You must confirm that the money was actually credited into your bank account before marking as Payment Received.'
        });
        return;
      }
      if (
        !window.confirm(
          `Confirm marking payment of ₹${verifiedAmountInput} for ${inspectPayment.studentName} (${inspectPayment.usn}) as PAYMENT RECEIVED (Verified)?`
        )
      ) {
        return;
      }
    }

    try {
      setUpdatingStatus(true);
      const submissionId = inspectPayment._id || inspectPayment.id;
      const { res, data } = await vendorFetch(
        `/api/vendor-portal/payments/${submissionId}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetStatus,
            verifiedAmount: verifiedAmountInput,
            transactionRef: transactionRefInput,
            remarks: remarksInput,
            bankCreditConfirmed
          })
        }
      );

      if (!res.ok || !data.success) {
        setBanner({ type: 'error', text: data.message || 'Failed to update status.' });
        loadPayments();
        return;
      }

      setBanner({ type: 'success', text: data.message });
      setInspectPayment(null);
      loadDashboard();
      loadPayments();
      loadStudents();
    } catch (err) {
      setBanner({ type: 'error', text: 'Network error updating payment status.' });
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Handle Vendor Direct Cash Payment Verification & Rejection
  const handleVendorCashAction = async (action: 'CONFIRM' | 'REJECT') => {
    if (!inspectPayment) return;
    const submissionId = inspectPayment._id || inspectPayment.id;
    if (!submissionId) return;

    if (action === 'CONFIRM') {
      const enteredAmount = Number(verifiedAmountInput);
      const expectedAmount = Number(inspectPayment.expectedAmount || inspectPayment.amount);

      if (isNaN(enteredAmount) || enteredAmount <= 0) {
        setBanner({ type: 'error', text: 'Please enter a valid numeric cash amount received.' });
        return;
      }

      if (enteredAmount !== expectedAmount) {
        setBanner({
          type: 'error',
          text: `Amount Mismatch Warning: Entered ₹${enteredAmount.toLocaleString('en-IN')} does not match expected uniform fee ₹${expectedAmount.toLocaleString('en-IN')}. Vendor confirmation is strictly blocked.`
        });
        return;
      }

      if (
        !window.confirm(
          `Confirm receipt of exact cash ₹${enteredAmount.toLocaleString('en-IN')} for ${inspectPayment.studentName} (${inspectPayment.usn})? This will immediately mark the status as CASH RECEIVED and unlock the student's official slip.`
        )
      ) {
        return;
      }

      try {
        setUpdatingStatus(true);
        const { res, data } = await vendorFetch(`/api/vendor-portal/cash-payments/${submissionId}/confirm`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actualAmountReceived: enteredAmount,
            remarks: remarksInput || 'Cash collected and verified at uniform counter'
          })
        });

        if (!res.ok || !data?.success) {
          setBanner({ type: 'error', text: data?.message || 'Failed to confirm cash payment.' });
          return;
        }

        setBanner({
          type: 'success',
          text: `Cash payment of ₹${enteredAmount.toLocaleString('en-IN')} confirmed successfully! Status updated to CASH RECEIVED.`
        });
        setInspectPayment(null);
        loadDashboard();
        loadPayments();
        loadStudents();
      } catch (err: any) {
        setBanner({ type: 'error', text: err?.message || 'Error confirming cash payment.' });
      } finally {
        setUpdatingStatus(false);
      }
    } else {
      // REJECT
      const reason = remarksInput?.trim() || prompt('Enter mandatory rejection reason for cash payment:') || '';
      if (!reason.trim()) {
        setBanner({ type: 'error', text: 'Rejection reason is required.' });
        return;
      }

      try {
        setUpdatingStatus(true);
        const { res, data } = await vendorFetch(`/api/vendor-portal/cash-payments/${submissionId}/reject`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason })
        });

        if (!res.ok || !data?.success) {
          setBanner({ type: 'error', text: data?.message || 'Failed to reject cash payment.' });
          return;
        }

        setBanner({ type: 'success', text: 'Cash payment request rejected.' });
        setInspectPayment(null);
        loadDashboard();
        loadPayments();
        loadStudents();
      } catch (err: any) {
        setBanner({ type: 'error', text: err?.message || 'Error rejecting cash payment.' });
      } finally {
        setUpdatingStatus(false);
      }
    }
  };

  // Excel (.xls) Formatted Spreadsheet Export Utility
  const exportToExcel = async (
    filename: string,
    sheetName: string,
    columns: { header: string; width: number; align?: 'left' | 'center' | 'right' }[],
    rows: any[][],
    reportType: string
  ) => {
    try {
      await vendorFetch('/api/vendor-portal/audit-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportType })
      });
    } catch (_) {}

    const colgroup = columns.map(c => `<col style="width: ${c.width || 100}pt;" />`).join('\n    ');
    const headerCells = columns.map(c => `<th>${c.header}</th>`).join('\n    ');
    const dataRows = rows.map(r => {
      const cells = r.map((cell, idx) => {
        const col = columns[idx] || { align: 'left' };
        const align = col.align || 'left';
        const cls = align === 'center' ? 'center' : align === 'right' ? 'num' : 'text';
        const val = cell !== null && cell !== undefined ? String(cell) : '';
        return `<td class="${cls}">${val.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>`;
      }).join('\n    ');
      return `<tr>\n    ${cells}\n  </tr>`;
    }).join('\n  ');

    const htmlContent = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>${sheetName || 'Sheet1'}</x:Name>
          <x:WorksheetOptions>
            <x:DisplayGridlines/>
          </x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
  <style>
    body { font-family: Calibri, 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #0f172a; margin: 0; padding: 0; }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; }
    th {
      background-color: #0f172a;
      color: #ffffff;
      font-weight: bold;
      font-size: 10.5pt;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      text-align: center;
      vertical-align: middle;
      height: 36pt;
      padding: 6pt 10pt;
      border: 0.5pt solid #cbd5e1;
      mso-pattern: black none;
      white-space: nowrap;
    }
    td {
      height: 24pt;
      padding: 5pt 8pt;
      vertical-align: middle;
      border: 0.5pt solid #e2e8f0;
      font-size: 10pt;
    }
    tr:nth-child(even) td { background-color: #f8fafc; }
    .text { mso-number-format: "\\@"; text-align: left; }
    .center { mso-number-format: "\\@"; text-align: center; }
    .num { text-align: right; }
    .amount { mso-number-format: "\\₹\\ #\\,##0"; text-align: right; font-weight: bold; }
  </style>
</head>
<body>
  <table>
    <colgroup>
      ${colgroup}
    </colgroup>
    <thead>
      <tr>
        ${headerCells}
      </tr>
    </thead>
    <tbody>
      ${dataRows}
    </tbody>
  </table>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // CSV Export Utility for Assigned Students or Payment Logs
  const exportToCsv = async (filename: string, headers: string[], rows: any[][], reportType: string) => {
    await vendorFetch('/api/vendor-portal/audit-export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportType })
    });

    const escapeCell = (cell: any) => {
      let str = String(cell ?? '').replace(/"/g, '""');
      if (/^[=\+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }
      return `"${str}"`;
    };

    const csvContent = [
      headers.map(escapeCell).join(','),
      ...rows.map((r) => r.map(escapeCell).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Download Complete Student Measurements Sheet (CSV) directly to device
  const handleDownloadAllMeasurementsCsv = async () => {
    let studentList = students;
    if (studentList.length === 0) {
      try {
        const { data } = await vendorFetch('/api/vendor-portal/export-measurements');
        if (data?.success && Array.isArray(data.students) && data.students.length > 0) {
          studentList = data.students;
        }
      } catch (_) {}
    }

    if (studentList.length === 0) {
      setBanner({ type: 'error', text: 'No student measurements available to download for your assigned academic groups.' });
      return;
    }

    const columns = [
      { header: 'Student Name', width: 160, align: 'left' as const },
      { header: 'USN', width: 110, align: 'center' as const },
      { header: 'Registration ID', width: 130, align: 'center' as const },
      { header: 'Gender', width: 65, align: 'center' as const },
      { header: 'Course', width: 65, align: 'center' as const },
      { header: 'Department', width: 160, align: 'left' as const },
      { header: 'Academic Year', width: 90, align: 'center' as const },
      { header: 'Semester', width: 65, align: 'center' as const },
      { header: 'Section', width: 55, align: 'center' as const },
      { header: 'Sizing Spec Type', width: 150, align: 'center' as const },
      { header: 'Shirt / Top Size', width: 85, align: 'center' as const },
      { header: 'Chest / Bust (in)', width: 85, align: 'center' as const },
      { header: 'Shoulder (in)', width: 80, align: 'center' as const },
      { header: 'Sleeve Length (in)', width: 90, align: 'center' as const },
      { header: 'Collar (in)', width: 75, align: 'center' as const },
      { header: 'Shirt / Top Length (in)', width: 105, align: 'center' as const },
      { header: 'Trouser / Pant Size', width: 95, align: 'center' as const },
      { header: 'Waist (in)', width: 75, align: 'center' as const },
      { header: 'Hip (in)', width: 75, align: 'center' as const },
      { header: 'Pant Length (in)', width: 85, align: 'center' as const },
      { header: 'Inseam (in)', width: 75, align: 'center' as const },
      { header: 'Blazer / Coat Size', width: 100, align: 'center' as const },
      { header: 'Coat Chest (in)', width: 85, align: 'center' as const },
      { header: 'Coat Shoulder (in)', width: 85, align: 'center' as const },
      { header: 'Coat Sleeve (in)', width: 85, align: 'center' as const },
      { header: 'Coat Length (in)', width: 85, align: 'center' as const },
      { header: 'Coat Waist (in)', width: 85, align: 'center' as const },
      { header: 'Special Tailor Remarks', width: 220, align: 'left' as const },
      { header: 'Payment Status', width: 100, align: 'center' as const },
      { header: 'Payment Amount', width: 90, align: 'right' as const },
      { header: 'Registration Date', width: 90, align: 'center' as const }
    ];

    const cleanSize = (sz: any) => String(sz || '').replace(/"/g, '').trim().toUpperCase();

    const rows = studentList.map((s) => {
      let mObj: any = null;
      if (s.uniform_measurements) {
        if (typeof s.uniform_measurements === 'string') {
          try { mObj = JSON.parse(s.uniform_measurements); } catch (_) {}
        } else if (typeof s.uniform_measurements === 'object') {
          mObj = s.uniform_measurements;
        }
      }

      const isFemale = String(s.gender || '').toUpperCase().startsWith('F');
      const shirtChart = isFemale ? SIZE_GUIDE_CHARTS.ALPHA_FEMALE_TOP : SIZE_GUIDE_CHARTS.ALPHA_MALE_SHIRT;
      const pantChart = SIZE_GUIDE_CHARTS.WAIST_BOTTOM;
      const coatChart = SIZE_GUIDE_CHARTS.ALPHA_COAT;

      const shirtStd = shirtChart?.find((r) => cleanSize(r.size) === cleanSize(s.shirtSize)) || ({} as any);
      const pantStd = pantChart?.find((r) => cleanSize(r.size) === cleanSize(s.trouserSize)) || ({} as any);
      const coatStd = coatChart?.find((r) => cleanSize(r.size) === cleanSize(s.blazerSize)) || ({} as any);

      const shirtCustom = mObj?.shirt?.measurements || mObj?.top?.measurements || {};
      const pantCustom = mObj?.pant?.measurements || mObj?.trouser?.measurements || mObj?.bottom?.measurements || {};
      const coatCustom = mObj?.coat?.measurements || mObj?.blazer?.measurements || {};

      const hasCustom =
        Object.keys(shirtCustom).length > 0 ||
        Object.keys(pantCustom).length > 0 ||
        Object.keys(coatCustom).length > 0;

      const remarks = mObj?.remarks || s.remarks || '';

      return [
        s.studentName,
        s.usn,
        s.registrationId,
        s.gender || 'Male',
        s.course,
        s.department,
        s.academicYear,
        s.semester,
        s.section,
        hasCustom ? 'Custom Tailor Measurements' : 'Standard Sizing Guide Spec',
        s.shirtSize || 'M',
        shirtCustom.chest || shirtCustom.bust || shirtStd.chest || shirtStd.bust || '',
        shirtCustom.shoulder || shirtStd.shoulder || '',
        shirtCustom.sleeveLength || shirtStd.sleeve || '',
        shirtCustom.collar || shirtStd.collar || '',
        shirtCustom.shirtLength || shirtCustom.topLength || shirtStd.length || '',
        s.trouserSize || '32',
        pantCustom.waist || pantStd.waist || '',
        pantCustom.hip || pantStd.hip || '',
        pantCustom.pantLength || pantCustom.bottomLength || pantStd.length || '',
        pantCustom.inseam || pantStd.inseam || '',
        s.blazerSize || (s.department === 'MBA' || s.department === 'MCA' ? 'M' : 'N/A'),
        coatCustom.chest || coatCustom.chestOrBust || coatStd.chestOrBust || '',
        coatCustom.shoulder || coatStd.shoulder || '',
        coatCustom.sleeveLength || coatStd.sleeve || '',
        coatCustom.coatLength || coatStd.length || '',
        coatCustom.waist || coatStd.waist || '',
        remarks,
        s.paymentStatus,
        s.paymentAmount ? `₹${s.paymentAmount}` : '',
        s.registrationDate ? new Date(s.registrationDate).toLocaleDateString('en-IN') : ''
      ];
    });

    const vendorTag = (vendorProfile?.vendorId || 'Vendor').replace(/[^a-zA-Z0-9_-]/g, '_');
    const dateTag = new Date().toISOString().slice(0, 10);
    const headers = columns.map(c => c.header);
    await exportToCsv(
      `${vendorTag}_All_Student_Measurements_${dateTag}.csv`,
      headers,
      rows,
      'ALL_STUDENT_MEASUREMENTS_CSV'
    );
    setBanner({
      type: 'success',
      text: `All student measurements sheet (${rows.length} students) downloaded successfully to your device.`
    });
  };

  // Download Complete Student Measurements Sheet (Formatted Excel .xls with Auto Column Widths)
  const handleDownloadAllMeasurementsExcel = async () => {
    let studentList = students;
    if (studentList.length === 0) {
      try {
        const { data } = await vendorFetch('/api/vendor-portal/export-measurements');
        if (data?.success && Array.isArray(data.students) && data.students.length > 0) {
          studentList = data.students;
        }
      } catch (_) {}
    }

    if (studentList.length === 0) {
      setBanner({ type: 'error', text: 'No student measurements available to download for your assigned academic groups.' });
      return;
    }

    const columns = [
      { header: 'Student Name', width: 160, align: 'left' as const },
      { header: 'USN', width: 110, align: 'center' as const },
      { header: 'Registration ID', width: 130, align: 'center' as const },
      { header: 'Gender', width: 65, align: 'center' as const },
      { header: 'Course', width: 65, align: 'center' as const },
      { header: 'Department', width: 160, align: 'left' as const },
      { header: 'Academic Year', width: 90, align: 'center' as const },
      { header: 'Semester', width: 65, align: 'center' as const },
      { header: 'Section', width: 55, align: 'center' as const },
      { header: 'Sizing Spec Type', width: 150, align: 'center' as const },
      { header: 'Shirt / Top Size', width: 85, align: 'center' as const },
      { header: 'Chest / Bust (in)', width: 85, align: 'center' as const },
      { header: 'Shoulder (in)', width: 80, align: 'center' as const },
      { header: 'Sleeve Length (in)', width: 90, align: 'center' as const },
      { header: 'Collar (in)', width: 75, align: 'center' as const },
      { header: 'Shirt / Top Length (in)', width: 105, align: 'center' as const },
      { header: 'Trouser / Pant Size', width: 95, align: 'center' as const },
      { header: 'Waist (in)', width: 75, align: 'center' as const },
      { header: 'Hip (in)', width: 75, align: 'center' as const },
      { header: 'Pant Length (in)', width: 85, align: 'center' as const },
      { header: 'Inseam (in)', width: 75, align: 'center' as const },
      { header: 'Blazer / Coat Size', width: 100, align: 'center' as const },
      { header: 'Coat Chest (in)', width: 85, align: 'center' as const },
      { header: 'Coat Shoulder (in)', width: 85, align: 'center' as const },
      { header: 'Coat Sleeve (in)', width: 85, align: 'center' as const },
      { header: 'Coat Length (in)', width: 85, align: 'center' as const },
      { header: 'Coat Waist (in)', width: 85, align: 'center' as const },
      { header: 'Special Tailor Remarks', width: 220, align: 'left' as const },
      { header: 'Payment Status', width: 100, align: 'center' as const },
      { header: 'Payment Amount', width: 90, align: 'right' as const },
      { header: 'Registration Date', width: 90, align: 'center' as const }
    ];

    const cleanSize = (sz: any) => String(sz || '').replace(/"/g, '').trim().toUpperCase();

    const rows = studentList.map((s) => {
      let mObj: any = null;
      if (s.uniform_measurements) {
        if (typeof s.uniform_measurements === 'string') {
          try { mObj = JSON.parse(s.uniform_measurements); } catch (_) {}
        } else if (typeof s.uniform_measurements === 'object') {
          mObj = s.uniform_measurements;
        }
      }

      const isFemale = String(s.gender || '').toUpperCase().startsWith('F');
      const shirtChart = isFemale ? SIZE_GUIDE_CHARTS.ALPHA_FEMALE_TOP : SIZE_GUIDE_CHARTS.ALPHA_MALE_SHIRT;
      const pantChart = SIZE_GUIDE_CHARTS.WAIST_BOTTOM;
      const coatChart = SIZE_GUIDE_CHARTS.ALPHA_COAT;

      const shirtStd = shirtChart?.find((r) => cleanSize(r.size) === cleanSize(s.shirtSize)) || ({} as any);
      const pantStd = pantChart?.find((r) => cleanSize(r.size) === cleanSize(s.trouserSize)) || ({} as any);
      const coatStd = coatChart?.find((r) => cleanSize(r.size) === cleanSize(s.blazerSize)) || ({} as any);

      const shirtCustom = mObj?.shirt?.measurements || mObj?.top?.measurements || {};
      const pantCustom = mObj?.pant?.measurements || mObj?.trouser?.measurements || mObj?.bottom?.measurements || {};
      const coatCustom = mObj?.coat?.measurements || mObj?.blazer?.measurements || {};

      const hasCustom =
        Object.keys(shirtCustom).length > 0 ||
        Object.keys(pantCustom).length > 0 ||
        Object.keys(coatCustom).length > 0;

      const remarks = mObj?.remarks || s.remarks || '';

      return [
        s.studentName,
        s.usn,
        s.registrationId,
        s.gender || 'Male',
        s.course,
        s.department,
        s.academicYear,
        s.semester,
        s.section,
        hasCustom ? 'Custom Tailor Measurements' : 'Standard Sizing Guide Spec',
        s.shirtSize || 'M',
        shirtCustom.chest || shirtCustom.bust || shirtStd.chest || shirtStd.bust || '',
        shirtCustom.shoulder || shirtStd.shoulder || '',
        shirtCustom.sleeveLength || shirtStd.sleeve || '',
        shirtCustom.collar || shirtStd.collar || '',
        shirtCustom.shirtLength || shirtCustom.topLength || shirtStd.length || '',
        s.trouserSize || '32',
        pantCustom.waist || pantStd.waist || '',
        pantCustom.hip || pantStd.hip || '',
        pantCustom.pantLength || pantCustom.bottomLength || pantStd.length || '',
        pantCustom.inseam || pantStd.inseam || '',
        s.blazerSize || (s.department === 'MBA' || s.department === 'MCA' ? 'M' : 'N/A'),
        coatCustom.chest || coatCustom.chestOrBust || coatStd.chestOrBust || '',
        coatCustom.shoulder || coatStd.shoulder || '',
        coatCustom.sleeveLength || coatStd.sleeve || '',
        coatCustom.coatLength || coatStd.length || '',
        coatCustom.waist || coatStd.waist || '',
        remarks,
        s.paymentStatus,
        s.paymentAmount ? `₹${s.paymentAmount}` : '',
        s.registrationDate ? new Date(s.registrationDate).toLocaleDateString('en-IN') : ''
      ];
    });

    const vendorTag = (vendorProfile?.vendorId || 'Vendor').replace(/[^a-zA-Z0-9_-]/g, '_');
    const dateTag = new Date().toISOString().slice(0, 10);
    await exportToExcel(
      `${vendorTag}_All_Student_Measurements_${dateTag}.xls`,
      'Student Measurements',
      columns,
      rows,
      'ALL_STUDENT_MEASUREMENTS_EXCEL'
    );
    setBanner({
      type: 'success',
      text: `Formatted Excel measurements sheet (${rows.length} students) downloaded successfully with custom column widths.`
    });
  };

  if (linkChecking) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white text-sm">
        Verifying Secure MIT Mysore Vendor Portal Access Link...
      </div>
    );
  }

  if (linkError) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto font-bold text-xl">
              🏢
            </div>
            <h2 className="text-lg font-bold text-slate-900">MIT Mysore Vendor Portal Access</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              {availableVendors.length > 0
                ? 'Select an authorized uniform vendor below to access their secure portal:'
                : linkError}
            </p>
          </div>

          {availableVendors.length > 0 && (
            <div className="space-y-2.5 pt-2">
              {availableVendors.map((v) => (
                <div
                  key={v.vendorId}
                  className="p-3.5 border border-slate-200 rounded-xl hover:border-blue-500 hover:bg-blue-50/50 transition-all flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-slate-900 truncate">{v.vendorName}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      ID: <span className="font-mono text-slate-700 font-semibold">{v.vendorId}</span> • {v.contactPerson}
                    </div>
                    <div className="text-[11px] text-blue-700 font-medium mt-1">
                      Login Mobile: <span className="font-mono font-bold">{v.mobile}</span> (PIN: <span className="font-mono font-bold">{v.firstFourPin}</span>)
                    </div>
                  </div>
                  <a
                    href={v.portalUrl}
                    className="shrink-0 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all text-center shadow-sm"
                  >
                    Open Portal &rarr;
                  </a>
                </div>
              ))}
            </div>
          )}

          <div className="text-center pt-2 border-t border-slate-100">
            <a href="/" className="text-xs text-slate-500 hover:text-slate-800 font-medium">
              &larr; Return to Student Portal
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // STEP 1: VENDOR LOGIN GATE (MOBILE + FIRST 4 DIGITS OF REGISTERED PHONE)
  // ============================================================================
  if (!vendorJwt) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200">
          <div className="bg-slate-800 text-white p-6">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400">
              MIT Mysore Uniform Management System
            </span>
            <h1 className="text-xl font-bold mt-1">Vendor Portal Secure Sign-In</h1>
            {vendorSummary && (
              <p className="text-xs text-slate-300 mt-1">
                Account: <strong className="text-white">{vendorSummary.vendorName}</strong> ({vendorSummary.vendorId})
              </p>
            )}
          </div>

          <form onSubmit={handleLoginSubmit} className="p-6 space-y-4">
            {authError && (
              <div className="p-3 bg-red-50 border border-red-300 text-red-800 rounded-lg text-xs font-semibold">
                {authError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Registered Mobile Number ({vendorSummary?.maskedMobile}) *
              </label>
              <input
                type="tel"
                required
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                placeholder="Enter full 10-digit registered mobile number"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Access Passcode (First 4 Digits of Registered Phone Number) *
              </label>
              <input
                type="password"
                required
                maxLength={4}
                value={firstFourDigitsPin}
                onChange={(e) => setFirstFourDigitsPin(e.target.value.replace(/\D/g, ''))}
                placeholder="•••• (First 4 digits of your phone)"
                className="w-full px-3.5 py-2.5 text-sm font-mono tracking-widest border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600"
              />
              <span className="text-[11px] text-slate-500">
                Security Check: Enter the first 4 digits of the mobile number registered with MIT Mysore.
              </span>
            </div>

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-lg shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              {loggingIn ? 'Verifying Vendor Identity...' : 'Verify & Open Vendor Portal'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ============================================================================
  // STEP 2: AUTHENTICATED VENDOR PORTAL LAYOUT
  // ============================================================================
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row w-full max-w-full overflow-x-hidden">
      {/* ── Mobile Top Header Bar (< md) ── */}
      <div className="md:hidden bg-slate-900 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-40 border-b border-slate-800 shadow-md">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-extrabold text-white text-xs shrink-0 shadow-sm">
            MIT
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-blue-400 block tracking-wider leading-none">
              Vendor Portal
            </span>
            <div className="text-xs font-bold truncate text-slate-100 mt-0.5">
              {vendorProfile?.vendorName || vendorSummary?.vendorName}
            </div>
          </div>
        </div>

        <button
          type="button"
          aria-label="Toggle navigation menu"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer shrink-0"
        >
          {mobileMenuOpen ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* ── Mobile Off-Canvas / Drawer Menu ── */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col">
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-4/5 max-w-xs bg-slate-900 text-white h-full flex flex-col justify-between p-5 shadow-2xl z-10 border-r border-slate-800 overflow-y-auto">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-400 block">
                    MIT Mysore Uniforms
                  </span>
                  <h2 className="text-sm font-bold truncate mt-1">
                    {vendorProfile?.vendorName || vendorSummary?.vendorName}
                  </h2>
                  <span className="text-[11px] font-mono text-slate-400 block mt-0.5">
                    ID: {vendorProfile?.vendorId || vendorSummary?.vendorId}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <nav className="py-4 space-y-1.5">
                {[
                  { id: 'DASHBOARD' as const, label: 'Dashboard' },
                  { id: 'STUDENTS' as const, label: `Registered Students (${stats.totalRegisteredStudents})` },
                  { id: 'VERIFICATION' as const, label: `Payment Verification (${stats.totalPaymentsPending})` },
                  { id: 'CASH_PAYMENTS' as const, label: 'Cash Payments' },
                  { id: 'LOGS' as const, label: 'Payment Logs' },
                  { id: 'REPORTS' as const, label: 'Reports & Exports' }
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveNav(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-between ${
                      activeNav === item.id
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <span>{item.label}</span>
                    {activeNav === item.id && <span>•</span>}
                  </button>
                ))}
              </nav>
            </div>

            <div className="pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="w-full py-2.5 px-3 bg-red-600/90 hover:bg-red-600 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-sm text-center"
              >
                Logout from Vendor Portal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dedicated Desktop Dark Navy Sidebar (hidden on mobile, visible md+) ── */}
      <aside className="hidden md:flex w-64 bg-slate-900 text-white flex-col justify-between shrink-0 min-h-screen sticky top-0 h-screen overflow-y-auto">
        <div>
          <div className="p-5 border-b border-slate-800">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-400 block">
              MIT Mysore Uniforms
            </span>
            <h2 className="text-base font-bold mt-0.5 truncate">
              {vendorProfile?.vendorName || vendorSummary?.vendorName}
            </h2>
            <span className="inline-block mt-1 font-mono text-xs text-slate-400">
              ID: {vendorProfile?.vendorId || vendorSummary?.vendorId}
            </span>
          </div>

          <nav className="p-3 space-y-1">
            {[
              { id: 'DASHBOARD' as const, label: 'Dashboard' },
              { id: 'STUDENTS' as const, label: `Registered Students (${stats.totalRegisteredStudents})` },
              { id: 'VERIFICATION' as const, label: `Payment Verification (${stats.totalPaymentsPending})` },
              { id: 'CASH_PAYMENTS' as const, label: 'Cash Payments' },
              { id: 'LOGS' as const, label: 'Payment Logs' },
              { id: 'REPORTS' as const, label: 'Reports & Exports' }
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveNav(item.id)}
                className={`w-full text-left px-3.5 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeNav === item.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800">
          <button
            type="button"
            onClick={() => handleLogout()}
            className="w-full py-2 px-3 bg-slate-800 hover:bg-red-600 text-slate-200 hover:text-white text-xs font-bold rounded-lg transition cursor-pointer"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <main className="flex-1 min-w-0 p-3 sm:p-5 md:p-6 space-y-4 md:space-y-6 overflow-y-auto max-w-full">
        {/* Top Header */}
        <header className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
              Vendor Portal – MIT Mysore Uniform Management
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Vendor: <strong>{vendorProfile?.vendorName}</strong> ({vendorProfile?.vendorId}) • Read-Only Profile & Remote Bank Verification
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {vendorProfile?.allowCsvExport !== false && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleDownloadAllMeasurementsExcel}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                  title="Download complete tailoring sheet with all student custom measurements and size specifications formatted for Microsoft Excel (.xls)"
                >
                  <span>📊</span> Download Measurements (Excel)
                </button>
                <button
                  type="button"
                  onClick={handleDownloadAllMeasurementsCsv}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 shadow-xs flex items-center gap-1 transition cursor-pointer"
                  title="Download as raw CSV"
                >
                  <span>⬇</span> CSV
                </button>
              </div>
            )}
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              Account: ACTIVE
            </span>
            {stats.totalPaymentsPending > 0 && (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800 border border-orange-300">
                {stats.totalPaymentsPending} Pending
              </span>
            )}
          </div>
        </header>

        {banner.text && (
          <div
            className={`p-4 rounded-xl border text-xs font-bold flex items-center justify-between ${
              banner.type === 'error'
                ? 'bg-red-50 border-red-300 text-red-900'
                : 'bg-emerald-50 border-emerald-300 text-emerald-900'
            }`}
          >
            <span>{banner.text}</span>
            <button onClick={() => setBanner({ type: '', text: '' })} className="underline cursor-pointer">
              Dismiss
            </button>
          </div>
        )}

        {/* 7 Summary Cards (Always Visible on Dashboard) */}
        {activeNav === 'DASHBOARD' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 min-[440px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-2.5 sm:gap-3">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="text-[11px] text-slate-500">Registered Students</div>
                <div className="text-2xl font-extrabold text-slate-900 mt-1">
                  {stats.totalRegisteredStudents}
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-indigo-200 shadow-sm">
                <div className="text-[11px] text-indigo-700">Submitted Sizes</div>
                <div className="text-2xl font-extrabold text-indigo-600 mt-1">
                  {stats.totalStudentsSubmittedSizes}
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-sm">
                <div className="text-[11px] text-blue-700">Payments Submitted</div>
                <div className="text-2xl font-extrabold text-blue-600 mt-1">
                  {stats.totalPaymentsSubmitted}
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm">
                <div className="text-[11px] text-emerald-700">Payments Verified</div>
                <div className="text-2xl font-extrabold text-emerald-600 mt-1">
                  {stats.totalPaymentsVerified}
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-orange-200 shadow-sm">
                <div className="text-[11px] text-orange-700">Payments Pending</div>
                <div className="text-2xl font-extrabold text-orange-500 mt-1">
                  {stats.totalPaymentsPending}
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-red-200 shadow-sm">
                <div className="text-[11px] text-red-700">Rejected / Not Rcvd</div>
                <div className="text-2xl font-extrabold text-red-600 mt-1">
                  {stats.totalPaymentsRejected}
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-emerald-300 shadow-sm">
                <div className="text-[11px] text-emerald-800">Confirmed Orders</div>
                <div className="text-2xl font-extrabold text-emerald-700 mt-1">
                  {stats.totalUniformOrders}
                </div>
              </div>
            </div>

            {/* Assigned Academic Groups Reference Card (Read-Only for Vendor) */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm">
                  Your Assigned Academic Groups (Configured by MIT Mysore Admin)
                </h3>
                <span className="text-[11px] text-slate-400">Read-Only Allocation</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {allocations.length === 0 ? (
                  <span className="text-xs text-slate-500">No active academic groups allocated yet.</span>
                ) : (
                  allocations.map((a) => (
                    <span
                      key={a.allocationId}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold"
                    >
                      {a.course} • {a.department} • {a.academicYear} • Section {a.section}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* SECTION: REGISTERED STUDENTS (ASSIGNED TO THIS VENDOR ONLY)       */}
        {/* ================================================================= */}
        {(activeNav === 'STUDENTS' || activeNav === 'DASHBOARD') && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Assigned Students & Submitted Uniform Sizes ({students.length})
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Complete cutting specifications and individual tailor measurements for all assigned students.
                </p>
              </div>
              {vendorProfile?.allowCsvExport !== false && (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleDownloadAllMeasurementsExcel}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer transition"
                    title="Download complete tailoring sheet with all student custom measurements and size specifications formatted for Microsoft Excel (.xls)"
                  >
                    <span>📊</span> Download All Measurements (Excel)
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadAllMeasurementsCsv}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-semibold rounded-lg cursor-pointer transition"
                    title="Download complete tailoring sheet as raw CSV"
                  >
                    ⬇ CSV
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      exportToCsv(
                        `${vendorProfile?.vendorId || 'Vendor'}_Assigned_Students_Summary.csv`,
                        [
                          'Student Name',
                          'USN',
                          'Registration ID',
                          'Course',
                          'Department',
                          'Academic Year',
                          'Semester',
                          'Section',
                          'Shirt Size',
                          'Trouser Size',
                          'Payment Amount',
                          'Payment Status',
                          'Registration Date'
                        ],
                        students.map((s) => [
                          s.studentName,
                          s.usn,
                          s.registrationId,
                          s.course,
                          s.department,
                          s.academicYear,
                          s.semester,
                          s.section,
                          s.shirtSize,
                          s.trouserSize,
                          s.paymentAmount,
                          s.paymentStatus,
                          new Date(s.registrationDate).toLocaleDateString('en-IN')
                        ]),
                        'ASSIGNED_STUDENTS_CSV'
                      )
                    }
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-semibold rounded-lg cursor-pointer transition"
                  >
                    ⬇ Summary (CSV)
                  </button>
                </div>
              )}
            </div>

            {/* Search & Filters */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
              <input
                type="text"
                placeholder="Search Name, USN, Reg ID..."
                value={studentFilters.search}
                onChange={(e) =>
                  setStudentFilters({ ...studentFilters, search: e.target.value })
                }
                className="lg:col-span-2 px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              />
              <select
                value={studentFilters.department}
                onChange={(e) =>
                  setStudentFilters({ ...studentFilters, department: e.target.value })
                }
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="ALL">All Assigned Depts</option>
                {assignedDepartments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <select
                value={studentFilters.academicYear}
                onChange={(e) =>
                  setStudentFilters({ ...studentFilters, academicYear: e.target.value })
                }
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="ALL">All Years</option>
                {assignedYears.map((y) => (
                  <option key={y} value={y}>
                    {formatYearLabel(y)}
                  </option>
                ))}
              </select>
              <select
                value={studentFilters.section}
                onChange={(e) =>
                  setStudentFilters({ ...studentFilters, section: e.target.value })
                }
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="ALL">All Sections</option>
                {assignedSections.map((s) => (
                  <option key={s} value={s}>
                    {formatSectionLabel(s)}
                  </option>
                ))}
              </select>
              <select
                value={studentFilters.paymentStatus}
                onChange={(e) =>
                  setStudentFilters({ ...studentFilters, paymentStatus: e.target.value })
                }
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="ALL">All Payment Statuses</option>
                <option value="Not Paid">Not Paid</option>
                <option value="Submitted">Submitted</option>
                <option value="Under Verification">Under Verification</option>
                <option value="Verified">Verified</option>
                <option value="Payment Not Received">Payment Not Received</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 uppercase font-bold border-b border-slate-200 text-[11px] whitespace-nowrap">
                    <th className="p-3">Student Name</th>
                    <th className="p-3">USN</th>
                    <th className="p-3">Reg ID</th>
                    <th className="p-3">Course / Dept</th>
                    <th className="p-3">Year / Sem / Sec</th>
                    <th className="p-3 text-center">Shirt Size</th>
                    <th className="p-3 text-center">Trouser Size</th>
                    <th className="p-3 text-center">Tailor Spec</th>
                    <th className="p-3 text-right">Amount</th>
                    <th className="p-3 text-center">Payment Status</th>
                    <th className="p-3 text-center">Reg Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {students.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-6 text-center text-slate-400">
                        No assigned students match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    students.map((s) => (
                      <tr key={s.registrationId} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-900 whitespace-nowrap">{s.studentName}</td>
                        <td className="p-3 font-mono font-semibold text-blue-700 whitespace-nowrap">{s.usn}</td>
                        <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                          {String(s.registrationId).slice(-8)}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {s.course} • <strong>{s.department}</strong>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {s.academicYear} ({s.semester}) • <strong>Sec {s.section}</strong>
                        </td>
                        <td className="p-3 font-bold text-slate-900 text-center whitespace-nowrap">{s.shirtSize}</td>
                        <td className="p-3 font-bold text-slate-900 text-center whitespace-nowrap">
                          {s.trouserSize}"{s.blazerSize ? ` • Coat: ${s.blazerSize}` : ''}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setSelectedTailorStudent(s)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold hover:bg-blue-100 cursor-pointer"
                            title="View & print full tailor measurement job card"
                          >
                            📐 Spec Card
                          </button>
                        </td>
                        <td className="p-3 font-bold text-right whitespace-nowrap">
                          ₹{Number(s.paymentAmount).toLocaleString('en-IN')}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${
                              STATUS_BADGE[s.paymentStatus] || STATUS_BADGE['Not Paid']
                            }`}
                          >
                            {s.paymentStatus}
                          </span>
                        </td>
                        <td className="p-3 text-slate-500 text-center whitespace-nowrap">
                          {new Date(s.registrationDate).toLocaleDateString('en-IN')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* SECTION: PAYMENT VERIFICATION CENTER & PAYMENT LOGS               */}
        {/* ================================================================= */}
        {(activeNav === 'VERIFICATION' || activeNav === 'LOGS' || activeNav === 'REPORTS') && (
          <div className="space-y-4">
            {/* Summary Strip for Payment Logs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white p-4 rounded-xl border border-emerald-200">
                <div className="text-xs text-emerald-700 font-semibold">Total Amount Received</div>
                <div className="text-xl font-extrabold text-emerald-700 mt-0.5">
                  ₹{Number(stats.totalAmountReceived).toLocaleString('en-IN')}
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-orange-200">
                <div className="text-xs text-orange-700 font-semibold">Total Pending Amount</div>
                <div className="text-xl font-extrabold text-orange-600 mt-0.5">
                  ₹{Number(stats.totalPendingAmount).toLocaleString('en-IN')}
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <div className="text-xs text-slate-500 font-semibold">Verified Submissions</div>
                <div className="text-xl font-extrabold text-slate-900 mt-0.5">
                  {stats.totalPaymentsVerified}
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-red-200">
                <div className="text-xs text-red-700 font-semibold">
                  Not Received / Rejected
                </div>
                <div className="text-xl font-extrabold text-red-600 mt-0.5">
                  {stats.totalPaymentsRejected}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Date Preset Pills & Export Button */}
              <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'ALL', label: 'All Dates' },
                    { id: 'TODAY', label: 'Today' },
                    { id: 'YESTERDAY', label: 'Yesterday' },
                    { id: 'LAST_7_DAYS', label: 'Last 7 Days' },
                    { id: 'LAST_30_DAYS', label: 'Last 30 Days' }
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setPaymentFilters({ ...paymentFilters, datePreset: p.id })
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                        paymentFilters.datePreset === p.id
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-50 text-slate-700 border-slate-300'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {vendorProfile?.allowCsvExport !== false && (
                  <button
                    type="button"
                    onClick={() =>
                      exportToCsv(
                        `${vendorProfile?.vendorId || 'Vendor'}_Payment_Logs.csv`,
                        [
                          'Student Name',
                          'USN',
                          'Registration ID',
                          'Department',
                          'Year',
                          'Section',
                          'Method',
                          'Expected Amount',
                          'Submitted Amount',
                          'Verified Amount',
                          'UTR Number',
                          'Status',
                          'Verified By',
                          'Verification Date',
                          'Remarks'
                        ],
                        payments.map((p) => [
                          p.studentName,
                          p.usn,
                          p.registrationId,
                          p.department,
                          p.yearSemester,
                          p.section,
                          p.paymentMethod,
                          p.expectedAmount,
                          p.amount,
                          p.bankVerifiedAmount || '',
                          p.utrNumber,
                          p.paymentStatus,
                          p.verifiedByIdentifier || '',
                          p.verifiedAt ? new Date(p.verifiedAt).toLocaleString('en-IN') : '',
                          p.adminRemarks || p.rejectionReason || ''
                        ]),
                        'PAYMENT_LOGS_CSV'
                      )
                    }
                    className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg cursor-pointer"
                  >
                    ⬇ Download Payment Logs (CSV)
                  </button>
                )}
              </div>

              {/* Filter Controls */}
              <div className="p-3 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                <input
                  type="text"
                  placeholder="Search Student, USN, or 12-Digit UTR..."
                  value={paymentFilters.search}
                  onChange={(e) =>
                    setPaymentFilters({ ...paymentFilters, search: e.target.value })
                  }
                  className="lg:col-span-2 px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                />
                <select
                  value={paymentFilters.paymentStatus}
                  onChange={(e) =>
                    setPaymentFilters({ ...paymentFilters, paymentStatus: e.target.value })
                  }
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="ALL">All Payment Statuses</option>
                  <option value="Submitted">Submitted (Awaiting Check)</option>
                  <option value="Under Verification">Under Verification</option>
                  <option value="Verified">Verified (Payment Received)</option>
                  <option value="Payment Not Received">Payment Not Received</option>
                  <option value="Rejected">Rejected</option>
                </select>
                <input
                  type="date"
                  value={paymentFilters.startDate}
                  onChange={(e) =>
                    setPaymentFilters({
                      ...paymentFilters,
                      datePreset: 'CUSTOM',
                      startDate: e.target.value
                    })
                  }
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                />
                <input
                  type="date"
                  value={paymentFilters.endDate}
                  onChange={(e) =>
                    setPaymentFilters({
                      ...paymentFilters,
                      datePreset: 'CUSTOM',
                      endDate: e.target.value
                    })
                  }
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>

              {/* Payment Submissions Table */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 uppercase font-bold border-b border-slate-200 text-[11px] whitespace-nowrap">
                      <th className="p-3">Student / USN</th>
                      <th className="p-3">Dept / Year / Sec</th>
                      <th className="p-3">Expected vs Submitted</th>
                      <th className="p-3">UTR Reference</th>
                      <th className="p-3">Method</th>
                      <th className="p-3">Screenshot</th>
                      <th className="p-3">Submitted Date</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Verified By</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-slate-400">
                          No payment records found for the selected filter criteria.
                        </td>
                      </tr>
                    ) : (
                      payments.map((pay) => (
                        <tr key={pay._id || pay.id} className="hover:bg-slate-50">
                          <td className="p-3">
                            <div className="font-bold text-slate-900">{pay.studentName}</div>
                            <div className="font-mono text-blue-700">{pay.usn}</div>
                          </td>
                          <td className="p-3">
                            {pay.department} • {pay.yearSemester} (Sec {pay.section})
                          </td>
                          <td className="p-3">
                            <span className="text-slate-500">Exp: ₹{pay.expectedAmount}</span>
                            <div className="font-bold text-slate-900">
                              Sub: ₹{Number(pay.amount).toLocaleString('en-IN')}
                            </div>
                          </td>
                          <td className="p-3 font-mono font-bold whitespace-nowrap">
                            {pay.paymentMethod === 'CASH' || pay.paymentModeType === 'CASH' ? (
                              <div className="flex flex-col">
                                <span className="text-amber-800 text-[11px] font-mono font-bold">
                                  {pay.cashPaymentRefId || 'Cash Payment'}
                                </span>
                                <span className="text-[9px] text-amber-700 font-sans font-extrabold uppercase tracking-wide">
                                  CASH REF
                                </span>
                              </div>
                            ) : (
                              <span className="text-blue-700">{pay.utrNumber || '—'}</span>
                            )}
                          </td>
                          <td className="p-3 font-semibold whitespace-nowrap">
                            {pay.paymentMethod === 'CASH' ? (
                              <span className="inline-flex items-center gap-1 text-amber-800 font-bold">
                                <Banknote size={14} className="text-amber-600" />
                                CASH
                              </span>
                            ) : (
                              pay.paymentMethod
                            )}
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            {pay.paymentMethod === 'CASH' || pay.paymentModeType === 'CASH' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-medium">
                                Direct Cash Desk
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setInspectPayment(pay);
                                  setVerifiedAmountInput(String(pay.expectedAmount || pay.amount));
                                  setTransactionRefInput(pay.utrNumber);
                                  setRemarksInput(pay.adminRemarks || '');
                                  setBankCreditConfirmed(false);
                                }}
                                className="text-blue-600 hover:underline font-bold cursor-pointer"
                              >
                                Inspect Proof
                              </button>
                            )}
                          </td>
                          <td className="p-3 text-slate-500 whitespace-nowrap">
                            {new Date(pay.createdAt).toLocaleString('en-IN')}
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <span
                              className={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold whitespace-nowrap inline-block ${
                                STATUS_BADGE[pay.paymentStatus] || STATUS_BADGE.Submitted
                              }`}
                            >
                              {pay.paymentStatus}
                            </span>
                          </td>
                          <td className="p-3 text-[11px] text-slate-600 whitespace-nowrap">
                            {pay.verifiedByIdentifier || '—'}
                          </td>
                          <td className="p-3 text-right whitespace-nowrap">
                            {pay.paymentMethod === 'CASH' || pay.paymentModeType === 'CASH' ? (
                              pay.paymentStatus === 'CASH PAYMENT PENDING' ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setInspectPayment(pay);
                                    setVerifiedAmountInput(String(pay.expectedAmount || pay.amount));
                                    setTransactionRefInput(pay.cashPaymentRefId || '');
                                    setRemarksInput('');
                                    setBankCreditConfirmed(false);
                                  }}
                                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg cursor-pointer text-xs shadow-xs"
                                >
                                  Verify Cash
                                </button>
                              ) : pay.paymentStatus === 'CASH RECEIVED' ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-xs bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                                  ✓ Cash Received
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-red-700 font-bold text-xs bg-red-50 px-2 py-1 rounded border border-red-200">
                                  ✕ Cash Rejected
                                </span>
                              )
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setInspectPayment(pay);
                                  setVerifiedAmountInput(String(pay.expectedAmount || pay.amount));
                                  setTransactionRefInput(pay.utrNumber);
                                  setRemarksInput(pay.adminRemarks || '');
                                  setBankCreditConfirmed(false);
                                }}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg cursor-pointer text-xs"
                              >
                                Update Status
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* SECTION: VENDOR DIRECT CASH PAYMENTS MANAGEMENT                   */}
        {/* ================================================================= */}
        {activeNav === 'CASH_PAYMENTS' && (
          <VendorCashPaymentManagement vendorJwt={vendorJwt} apiBaseUrl={apiBaseUrl} />
        )}

        {/* MODAL: VENDOR SCREENSHOT INSPECTOR & MANUAL BANK VERIFICATION */}
        {inspectPayment && (
          <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-4xl w-full p-4 sm:p-6 shadow-2xl grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-6 my-auto max-h-[94vh] overflow-y-auto border border-slate-200">
              {/* Left Column: Proof Inspection / Cash Card */}
              <div className="md:col-span-5 bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col items-center">
                {inspectPayment.paymentMethod === 'CASH' || inspectPayment.paymentModeType === 'CASH' ? (
                  <div className="w-full flex flex-col items-center text-center p-2">
                    <div className="w-16 h-16 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 mb-3 shadow-xs">
                      <Banknote size={32} />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-900 mb-1">
                      Direct Campus Cash Payment
                    </span>
                    <p className="text-xs text-slate-500 mb-4">
                      Physical cash collection at uniform distribution counter. No online screenshot proof required.
                    </p>

                    <div className="w-full bg-white border border-amber-200 rounded-lg p-3 text-left space-y-2 mb-3">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Cash Reference ID</span>
                        <strong className="font-mono text-base text-amber-900 tracking-tight">
                          {inspectPayment.cashPaymentRefId || 'Pending'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Expected Cash Fee</span>
                        <strong className="text-sm text-slate-900">
                          ₹{Number(inspectPayment.expectedAmount).toLocaleString('en-IN')}
                        </strong>
                      </div>
                    </div>

                    <div className="w-full bg-amber-50 border border-amber-200 text-amber-900 p-2.5 rounded text-[11px] text-left">
                      ⚠️ <strong>Cash Verification Rule:</strong> Verify you have counted the exact cash amount of <strong>₹{Number(inspectPayment.expectedAmount).toLocaleString('en-IN')}</strong> from the student before confirming.
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="text-xs font-bold uppercase text-slate-700 mb-2">
                      Submitted Payment Screenshot
                    </span>
                    <div className="w-full bg-amber-50 border border-amber-200 text-amber-900 p-2 rounded text-[11px] mb-3 text-center">
                      Important: Never rely on the screenshot alone. Check your actual bank statement for UTR <strong>{inspectPayment.utrNumber}</strong>.
                    </div>
                    {inspectPayment.paymentScreenshot ? (
                      <img
                        src={
                          inspectPayment.paymentScreenshot.startsWith('http')
                            ? inspectPayment.paymentScreenshot
                            : `${apiBaseUrl}${inspectPayment.paymentScreenshot}`
                        }
                        alt="Payment Screenshot"
                        className="max-h-96 object-contain bg-white border p-1 rounded"
                      />
                    ) : (
                      <div className="p-8 text-center text-slate-400 text-xs">
                        No payment screenshot uploaded
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Right Column: Status Controls */}
              <div className="md:col-span-7 flex flex-col justify-between space-y-4">
                <div className="space-y-4">
                  <div className="flex items-start justify-between border-b pb-3">
                    <div>
                      <h3 className="font-bold text-slate-900 text-base">
                        {inspectPayment.paymentMethod === 'CASH' || inspectPayment.paymentModeType === 'CASH'
                          ? 'Verify Direct Cash Receipt'
                          : 'Verify Student Payment Record'}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {inspectPayment.studentName} • USN: <strong>{inspectPayment.usn}</strong> •{' '}
                        {inspectPayment.department} ({inspectPayment.yearSemester}, Sec{' '}
                        {inspectPayment.section})
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const matched = students.find((s) => s.registrationId === inspectPayment.registrationId || s.usn === inspectPayment.usn);
                            setSelectedTailorStudent(matched || {
                              studentName: inspectPayment.studentName,
                              usn: inspectPayment.usn,
                              registrationId: inspectPayment.registrationId,
                              department: inspectPayment.department,
                              course: (inspectPayment as any).course || 'B.E.',
                              gender: (inspectPayment as any).gender || 'Male'
                            });
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold hover:bg-blue-100 cursor-pointer"
                        >
                          📐 View Tailor Measurement Card
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInspectPayment(null)}
                      className="text-slate-400 hover:text-slate-700 font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Read-only Student Reference & Expected Amount */}
                  <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3 rounded-lg border text-xs">
                    <div>
                      <span className="text-slate-500 block">Expected Amount</span>
                      <strong className="text-sm text-slate-900">
                        ₹{Number(inspectPayment.expectedAmount).toLocaleString('en-IN')}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">
                        {inspectPayment.paymentMethod === 'CASH' ? 'Cash Ref (Locked)' : 'Student UTR (Locked)'}
                      </span>
                      <strong className="font-mono text-blue-700">
                        {inspectPayment.cashPaymentRefId || inspectPayment.utrNumber || '—'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Current Status</span>
                      <strong className="text-slate-900">{inspectPayment.paymentStatus}</strong>
                    </div>
                  </div>

                  {/* CASH SPECIFIC INPUTS & CONFIRMATION */}
                  {inspectPayment.paymentMethod === 'CASH' || inspectPayment.paymentModeType === 'CASH' ? (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Actual Cash Received at Uniform Counter (₹) *
                        </label>
                        <input
                          type="number"
                          value={verifiedAmountInput}
                          onChange={(e) => setVerifiedAmountInput(e.target.value)}
                          className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-lg text-slate-900"
                        />
                        <span className="text-[11px] text-slate-500 mt-1 block">
                          Must match expected fee exactly (₹{Number(inspectPayment.expectedAmount).toLocaleString('en-IN')})
                        </span>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Verification Remarks (Mandatory for Not Received / Rejected)
                        </label>
                        <input
                          type="text"
                          value={remarksInput}
                          onChange={(e) => setRemarksInput(e.target.value)}
                          placeholder="e.g. Received exact cash at campus counter"
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                        />
                      </div>

                      <label className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bankCreditConfirmed}
                          onChange={(e) => setBankCreditConfirmed(e.target.checked)}
                          className="mt-0.5 cursor-pointer"
                        />
                        <span>
                          <strong>Cash Collection Confirmation:</strong> I have physically verified and collected ₹{verifiedAmountInput || inspectPayment.expectedAmount} in cash from student{' '}
                          <strong>{inspectPayment.studentName}</strong> ({inspectPayment.usn}) for Cash Ref{' '}
                          <span className="font-mono font-bold">{inspectPayment.cashPaymentRefId || 'Cash Payment'}</span> at the uniform counter.
                        </span>
                      </label>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Actual Bank Credit Amount (₹) *
                          </label>
                          <input
                            type="number"
                            value={verifiedAmountInput}
                            onChange={(e) => setVerifiedAmountInput(e.target.value)}
                            className="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Bank Statement Reference (Optional)
                          </label>
                          <input
                            type="text"
                            value={transactionRefInput}
                            onChange={(e) => setTransactionRefInput(e.target.value)}
                            className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Verification Remarks (Mandatory for Not Received / Rejected)
                        </label>
                        <input
                          type="text"
                          value={remarksInput}
                          onChange={(e) => setRemarksInput(e.target.value)}
                          placeholder="e.g., Confirmed credit in bank account / UTR not found in statement"
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                        />
                      </div>

                      <label className="flex items-start gap-2.5 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-950 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bankCreditConfirmed}
                          onChange={(e) => setBankCreditConfirmed(e.target.checked)}
                          className="mt-0.5 cursor-pointer"
                        />
                        <span>
                          <strong>Bank Credit Confirmation:</strong> I have checked our designated vendor bank statement and confirmed that ₹{verifiedAmountInput} with UTR{' '}
                          <span className="font-mono font-bold">{inspectPayment.utrNumber}</span> has been credited.
                        </span>
                      </label>
                    </>
                  )}
                </div>

                {/* 4 Required Status Action Buttons (Identical for UPI & Cash) */}
                <div className="pt-3 border-t flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    disabled={updatingStatus}
                    onClick={() => handleVendorStatusUpdate('Under Verification')}
                    className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 text-xs font-bold rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    Mark Under Verification
                  </button>
                  <button
                    type="button"
                    disabled={updatingStatus}
                    onClick={() => handleVendorStatusUpdate('Payment Not Received')}
                    className="px-3.5 py-2 bg-orange-50 hover:bg-orange-100 text-orange-900 border border-orange-300 text-xs font-bold rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    Mark Payment Not Received
                  </button>
                  <button
                    type="button"
                    disabled={updatingStatus}
                    onClick={() => handleVendorStatusUpdate('Rejected')}
                    className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    Mark Rejected
                  </button>
                  <button
                    type="button"
                    disabled={updatingStatus}
                    onClick={() => handleVendorStatusUpdate('Verified')}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    ✓ Mark as Payment Received
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedTailorStudent && (
          <TailorMeasurementReportModal
            studentRecord={{
              studentName: selectedTailorStudent.studentName || selectedTailorStudent.fullName,
              fullName: selectedTailorStudent.studentName || selectedTailorStudent.fullName,
              usn: selectedTailorStudent.usn,
              applicationId: selectedTailorStudent.registrationId,
              course: selectedTailorStudent.course || (selectedTailorStudent.department === 'MBA' ? 'MBA' : selectedTailorStudent.department === 'MCA' ? 'MCA' : 'B.E.'),
              gender: selectedTailorStudent.gender || 'Male',
              shirtSize: selectedTailorStudent.shirtSize,
              trouserSize: selectedTailorStudent.trouserSize,
              blazerSize: selectedTailorStudent.blazerSize,
              uniform_measurements: selectedTailorStudent.uniform_measurements || selectedTailorStudent.uniformMeasurements
            }}
            onClose={() => setSelectedTailorStudent(null)}
          />
        )}
      </main>
    </div>
  );
}


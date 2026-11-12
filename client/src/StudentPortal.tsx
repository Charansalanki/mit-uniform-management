import { useState, useEffect, useMemo } from 'react';
import {
  GraduationCap,
  Calendar,
  User,
  Building2,
  Shirt,
  Scissors,
  CheckCircle2,
  Info,
  Compass,
  Search
} from 'lucide-react';
import { api } from './api';
import { ShirtSize, TrouserSize, DistributionSchedule, Gender } from './types';
import { DEPARTMENTS, SEMESTERS, ALL_SECTIONS, parseCampaignYears, formatAcademicYear } from './mockData';
import StudentPaymentSection from './components/StudentPaymentSection';
import StudentTrackingCredentialsCard from './components/student/StudentTrackingCredentialsCard';
import CheckPaymentStatusPortal from './components/student/CheckPaymentStatusPortal';
import UsnDepartmentAutoSelector from './components/student/UsnDepartmentAutoSelector';
import CompletePendingPaymentPortal from './components/student/CompletePendingPaymentModal';
import { verifyUsnDepartmentMatch } from './utils/usnDepartmentValidator';
import { useStudentProgressPersistence, SavedDeviceStudent } from './hooks/useStudentProgressPersistence';
import UniformSizeSelectionStep from './components/student/UniformSizeSelectionStep';
import TailorMeasurementReportModal from './components/shared/TailorMeasurementReportModal';
import { MIT_SEAL_LOGO_BASE64 } from './utils/mitLogoBase64';
import { useUgPgApplicationStatus } from './components/student/StudentApplicationGate';

/* ─── Constants ─────────────────────────────────────────────── */
const SHIRT_SIZES: ShirtSize[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const TROUSER_SIZES: TrouserSize[] = ['28', '30', '32', '34', '36', '38', '40', '42', '44'];
const SECTIONS = ALL_SECTIONS;

const SHIRT_GUIDE = [
  { size: 'XS',   chest: '32–33"', shoulder: '14.5"', length: '26"' },
  { size: 'S',    chest: '34–35"', shoulder: '15"',   length: '27"' },
  { size: 'M',    chest: '36–37"', shoulder: '15.5"', length: '28"' },
  { size: 'L',    chest: '38–40"', shoulder: '16"',   length: '29"' },
  { size: 'XL',   chest: '41–43"', shoulder: '17"',   length: '30"' },
  { size: 'XXL',  chest: '44–46"', shoulder: '18"',   length: '31"' },
  { size: 'XXXL', chest: '47–50"', shoulder: '19"',   length: '32"' },
];

/* ─── Validation ─────────────────────────────────────────────── */
function validateUSN(usn: string): string {
  const clean = usn.trim();
  if (!clean) return 'USN / Student ID is required';
  return '';
}

function validatePhone(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (!clean) return 'Phone number is required';
  if (clean.length !== 10) return 'Enter a valid 10-digit mobile number';
  return '';
}

type Step = 'personal' | 'sizes' | 'review' | 'payment';

interface FormState {
  fullName: string;
  gender: Gender;
  usn: string;
  department: string;
  departmentCode?: string;
  departmentShortName?: string;
  course?: string;
  educationLevel?: 'UG' | 'PG';
  isUsnValid?: boolean;
  semester: number;
  section: string;
  phone: string;
  shirtSize: ShirtSize;
  trouserSize: TrouserSize;
  blazerSize?: string;
  remarks?: string;
  uniformMeasurements?: any;
}

interface SubmittedData extends FormState {
  id: string;
  submitted_at: string;
  registrationId?: string;
  applicationId?: string;
  trackingPin?: string;
}

/* ─── Component ───────────────────────────────────────────────── */
export default function StudentPortal() {
  const [step, setStep] = useState<Step>('personal');
  const [form, setForm] = useState<FormState>({
    fullName: '',
    gender: 'Male',
    usn: '',
    department: '',
    departmentCode: '',
    departmentShortName: '',
    semester: 1,
    section: 'A',
    phone: '',
    shirtSize: 'M',
    trouserSize: '32',
    remarks: '',
    isUsnValid: false
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [consent, setConsent] = useState(false);
  const [livePaymentStatus, setLivePaymentStatus] = useState<string>('Not Paid');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<SubmittedData | null>(null);
  const [schedules, setSchedules] = useState<DistributionSchedule[]>([]);
  const [campaign, setCampaign] = useState('Uniform Distribution 2027');
  const [toast, setToast] = useState<{ msg: string; type?: 'error' | 'info' } | null>(null);
  const [showTailorModal, setShowTailorModal] = useState(false);
  const [activePortalView, setActivePortalView] = useState<'REGISTRATION' | 'COMPLETE_PAYMENT' | 'CHECK_STATUS'>(() => {
    if (typeof window !== 'undefined') {
      if (window.location.search.includes('recover-payment') || window.location.pathname === '/complete-payment') {
        return 'COMPLETE_PAYMENT';
      }
      if (window.location.pathname === '/check-status' || window.location.search.includes('check-status')) {
        return 'CHECK_STATUS';
      }
    }
    return 'REGISTRATION';
  });

  const {
    ugApplicationOpen,
    pgApplicationOpen,
    isCategoryOpenForStudent,
    openStatusCheck
  } = useUgPgApplicationStatus();

  const categoryCheck = isCategoryOpenForStudent({
    usn: form.usn,
    course: form.course,
    educationLevel: form.educationLevel
  });

  const {
    restoringFromDb,
    trackingRecord,
    savedDeviceStudents,
    appendNewStudentSession,
    startNewStudentRegistration,
    refreshAllDeviceStudentsFromDb,
    loadLocalDraft,
    saveLocalDraft,
    persistSubmittedCredentials,
    clearSession
  } = useStudentProgressPersistence();

  // Restore saved registration from DB when available
  useEffect(() => {
    if (trackingRecord) {
      const pinVal = trackingRecord.trackingPin;
      if (pinVal) {
        try {
          sessionStorage.setItem(`mit_pin_${trackingRecord.registrationId}`, pinVal);
          sessionStorage.setItem(`mit_pin_${trackingRecord.applicationId}`, pinVal);
          sessionStorage.setItem(`mit_pin_${trackingRecord.studentProfile.usn}`, pinVal);
          localStorage.setItem(`mit_pin_${trackingRecord.studentProfile.usn}`, pinVal);
          localStorage.setItem(`mit_pin_${trackingRecord.registrationId}`, pinVal);
        } catch {}
      }
      setSubmitted({
        id: trackingRecord.registrationId,
        registrationId: trackingRecord.registrationId,
        applicationId: trackingRecord.applicationId,
        trackingPin: pinVal,
        fullName: trackingRecord.studentProfile.studentName,
        usn: trackingRecord.studentProfile.usn,
        department: trackingRecord.studentProfile.department,
        semester: Number(trackingRecord.studentProfile.semester) || 1,
        section: trackingRecord.studentProfile.section,
        phone: trackingRecord.studentProfile.mobile || '',
        gender: (trackingRecord.studentProfile.gender as Gender) || 'Male',
        shirtSize: (trackingRecord.uniformSelection?.shirtSize as ShirtSize) || 'M',
        trouserSize: (trackingRecord.uniformSelection?.trouserSize as TrouserSize) || '32',
        blazerSize: trackingRecord.uniformSelection?.blazerSize || '',
        remarks: trackingRecord.uniformSelection?.remarks || '',
        uniformMeasurements: trackingRecord.uniformSelection || null,
        submitted_at: trackingRecord.registeredAt
      });
      setLivePaymentStatus(trackingRecord.payment?.paymentStatus || 'Not Paid');
      setStep('payment');
    }
  }, [trackingRecord]);

  // Ensure fresh, blank form state on page load (clear any stale drafts)
  useEffect(() => {
    try {
      localStorage.removeItem('mit_student_registration_draft_v2');
      localStorage.removeItem('mit_student_registration_draft');
    } catch {
      // Ignore
    }
  }, []);

  const { currentYear, academicYear } = useMemo(() => parseCampaignYears(campaign), [campaign]);

  useEffect(() => {
    api.getCampaignName().then(setCampaign).catch(() => {});
    api.getSchedules().then(setSchedules).catch(() => {});
  }, []);

  const showToast = (msg: string, type: 'error' | 'info' = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const setField = <K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => ({ ...e, [key]: undefined }));
  };

  const deptInfo = DEPARTMENTS.find(
    d => d.code === form.department || d.name === form.department || d.code === form.departmentCode
  );
  const availableSections = deptInfo?.sections ?? SECTIONS;

  // Matching distribution slot for submitted student
  const studentSchedule = useMemo(() => {
    if (!submitted) return null;
    const sList = schedules;
    const subDept = submitted.department || '';
    const subDeptCode = submitted.departmentCode || '';
    const subDeptShort = submitted.departmentShortName || '';

    // 1. Exact match by dept, sem, sec
    const exact = sList.find(
      s => (s.department === subDept || s.department === subDeptCode || s.department === subDeptShort) &&
           Number(s.semester) === Number(submitted.semester) &&
           s.section.toUpperCase() === submitted.section.toUpperCase()
    );
    if (exact) return exact;

    // 2. Dept and sem match
    const semMatch = sList.find(
      s => (s.department === subDept || s.department === subDeptCode || s.department === subDeptShort) &&
           Number(s.semester) === Number(submitted.semester)
    );
    if (semMatch) return semMatch;

    // 3. Dept match
    const deptMatch = sList.find(
      s => (s.department === subDept || s.department === subDeptCode || s.department === subDeptShort)
    );
    if (deptMatch) return deptMatch;

    return sList[0] || null;
  }, [submitted, schedules]);

  /* ─── Validation ─── */
  const validatePersonal = (): boolean => {
    const errs: typeof errors = {};
    if (!form.fullName.trim()) errs.fullName = 'Full name is required';
    else if (form.fullName.trim().length < 3) errs.fullName = 'Enter your full legal name';

    if (!form.usn.trim()) {
      errs.usn = 'USN / Student ID is required';
    } else {
      const validation = verifyUsnDepartmentMatch(form.usn, form.department);
      if (!validation.isValid) {
        errs.usn = validation.errorMessage || 'Invalid USN or Department mismatch';
      }
    }

    const phoneErr = validatePhone(form.phone);
    if (phoneErr) errs.phone = phoneErr;

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const goToSizes = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!categoryCheck.isOpen) {
      showToast(categoryCheck.message, 'error');
      return;
    }
    if (!form.usn.trim()) {
      setErrors(prev => ({ ...prev, usn: 'USN / Student ID is required' }));
      validatePersonal();
      return;
    }
    const validation = verifyUsnDepartmentMatch(form.usn, form.department);
    if (!validation.isValid) {
      setErrors(prev => ({ ...prev, usn: validation.errorMessage || 'Invalid USN or Department mismatch' }));
      return;
    }
    if (validatePersonal()) {
      setStep('sizes');
    }
  };
  const goToReview = () => setStep('review');
  const goBack     = () => { if (step === 'review') setStep('sizes'); else if (step === 'sizes') setStep('personal'); };

  /* ─── Submit ─── */
  const handleSubmit = async () => {
    if (!categoryCheck.isOpen) {
      showToast(categoryCheck.message, 'error');
      return;
    }
    if (!consent) { showToast('Please accept the terms before submitting.', 'error'); return; }
    setSubmitting(true);
    try {
      // 1. Register or sync with tracking backend to generate Application ID + PIN
      const derivedCourse = form.course || (form.department?.includes('MBA') ? 'MBA' : form.department?.includes('MCA') ? 'MCA' : 'B.E.');
      const syncRes = await fetch('/api/tracking/register-or-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: form.fullName.trim(),
          usn: form.usn.toUpperCase().trim(),
          mobile: form.phone.trim(),
          phone: form.phone.trim(),
          gender: form.gender,
          course: derivedCourse,
          educationLevel: (derivedCourse === 'MBA' || derivedCourse === 'MCA') ? 'PG' : 'UG',
          department: form.department,
          departmentCode: form.departmentCode,
          departmentShortName: form.departmentShortName,
          semester: form.semester,
          section: form.section,
          shirtSize: form.shirtSize,
          trouserSize: String(form.trouserSize || '32').replace(/"/g, '').trim(),
          blazerSize: form.blazerSize || '',
          remarks: form.remarks || form.uniformMeasurements?.remarks || '',
          uniformMeasurements: {
            ...(form.uniformMeasurements || {}),
            remarks: form.remarks || form.uniformMeasurements?.remarks || ''
          }
        })
      });
      const syncData = await syncRes.json();

      let submittedData: SubmittedData;
      if (syncData.success && syncData.trackingData) {
        const pinVal = syncData.trackingData.trackingPin || syncData.trackingPin;
        const appIdVal = syncData.trackingData.applicationId || syncData.applicationId;
        persistSubmittedCredentials(syncData.browserResumeToken, syncData.trackingData);
        if (pinVal) {
          try {
            sessionStorage.setItem(`mit_pin_${syncData.trackingData.registrationId}`, pinVal);
            sessionStorage.setItem(`mit_pin_${appIdVal}`, pinVal);
            sessionStorage.setItem(`mit_pin_${syncData.trackingData.studentProfile.usn}`, pinVal);
            localStorage.setItem(`mit_pin_${syncData.trackingData.studentProfile.usn}`, pinVal);
            localStorage.setItem(`mit_pin_${syncData.trackingData.registrationId}`, pinVal);
          } catch {}
        }
        submittedData = {
          id: syncData.trackingData.registrationId,
          registrationId: syncData.trackingData.registrationId,
          applicationId: appIdVal,
          trackingPin: pinVal,
          fullName: syncData.trackingData.studentProfile.studentName,
          usn: syncData.trackingData.studentProfile.usn,
          department: syncData.trackingData.studentProfile.department,
          semester: Number(syncData.trackingData.studentProfile.semester) || 1,
          section: syncData.trackingData.studentProfile.section,
          phone: syncData.trackingData.studentProfile.mobile || form.phone,
          gender: (syncData.trackingData.studentProfile.gender as Gender) || form.gender,
          course: syncData.trackingData.studentProfile.course || derivedCourse,
          shirtSize: (syncData.trackingData.uniformSelection?.shirtSize as ShirtSize) || form.shirtSize,
          trouserSize: ((syncData.trackingData.uniformSelection?.trouserSize || form.trouserSize || '32').replace(/"/g, '').trim() as TrouserSize),
          blazerSize: syncData.trackingData.uniformSelection?.blazerSize || form.blazerSize,
          remarks: syncData.trackingData.uniformSelection?.remarks || form.remarks || '',
          uniformMeasurements: syncData.trackingData.uniformSelection || form.uniformMeasurements,
          submitted_at: syncData.trackingData.registeredAt
        };
      } else {
        // Fallback to primary registration endpoint
        const cleanTrouser = String(form.trouserSize || '32').replace(/"/g, '').trim() as TrouserSize;
        const saved = await api.addRegistration({
          ...form,
          fullName: form.fullName.trim(),
          usn: form.usn.toUpperCase().trim(),
          course: derivedCourse,
          trouserSize: cleanTrouser,
          blazerSize: form.blazerSize,
          remarks: form.remarks || form.uniformMeasurements?.remarks || '',
          uniformMeasurements: {
            ...(form.uniformMeasurements || {}),
            remarks: form.remarks || form.uniformMeasurements?.remarks || ''
          }
        });
        submittedData = { ...saved, gender: saved.gender || form.gender, course: derivedCourse };
      }

      api.getSchedules().then(setSchedules).catch(() => {});
      setSubmitted(submittedData);
      setStep('payment');
      showToast(syncData.alreadyRegistered
        ? 'Restored your existing saved uniform registration and credentials.'
        : 'Registration recorded! Application ID & Tracking PIN generated.');
    } catch (err: any) {
      showToast(err?.message || 'Submission failed. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterAnotherStudentClick = () => {
    // Reset local stepper to Step 1 with blank fields (without touching saved records in DB)
    startNewStudentRegistration();
    setForm({
      fullName: '',
      gender: 'Male',
      usn: '',
      department: '',
      departmentCode: '',
      departmentShortName: '',
      course: 'B.E.',
      educationLevel: 'UG',
      semester: 1,
      section: 'A',
      phone: '',
      shirtSize: 'M',
      trouserSize: '32',
      remarks: '',
      isUsnValid: false
    });
    setSubmitted(null);
    setConsent(false);
    setErrors({});
    setStep('personal');
    setActivePortalView('REGISTRATION');
  };

  const handleSelectStudentToPayOrView = (student: SavedDeviceStudent) => {
    if (student.trackingPin) {
      try {
        sessionStorage.setItem(`mit_pin_${student.registrationId}`, student.trackingPin);
        sessionStorage.setItem(`mit_pin_${student.applicationId}`, student.trackingPin);
        sessionStorage.setItem(`mit_pin_${student.usn}`, student.trackingPin);
        localStorage.setItem(`mit_pin_${student.usn}`, student.trackingPin);
        localStorage.setItem(`mit_pin_${student.registrationId}`, student.trackingPin);
      } catch {}
    }
    setSubmitted({
      id: student.registrationId,
      registrationId: student.registrationId,
      applicationId: student.applicationId,
      trackingPin: student.trackingPin,
      fullName: student.studentName,
      usn: student.usn,
      department: student.department,
      semester: 1,
      section: student.section,
      phone: '',
      gender: 'Male',
      shirtSize: (student.shirtSize as ShirtSize) || 'M',
      trouserSize: (student.trouserSize as TrouserSize) || '32',
      submitted_at: student.registeredAt
    });
    setLivePaymentStatus(student.paymentStatus);
    setStep('payment');
    setActivePortalView('REGISTRATION');
  };

  const resetForm = () => {
    clearSession();
    handleRegisterAnotherStudentClick();
  };

  const stepIdx = step === 'personal' ? 0 : step === 'sizes' ? 1 : step === 'review' ? 2 : 3;

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <div className="portal-page">

      {/* ── Toast ── */}
      {toast && (
        <div className={`p-toast ${toast.type ?? ''}`}>
          <span>{toast.type === 'error' ? '⚠️' : 'ℹ️'}</span>
          <span>{toast.msg}</span>
        </div>
      )}

      {/* ── Navbar ── */}
      <nav className="portal-navbar">
        <div className="nav-brand">
          <div className="nav-logo">
            <img
              src="/logo.png"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.src.startsWith('data:')) {
                  target.src = MIT_SEAL_LOGO_BASE64;
                }
              }}
              alt="MIT Mysore Logo"
              className="mit-official-logo"
            />
          </div>
          <div className="nav-title">
            <b>MIT MYSORE</b>
            <small>Uniform Registration Portal</small>
          </div>
        </div>
        <div className="nav-right">
          <button
            type="button"
            onClick={() => setActivePortalView('COMPLETE_PAYMENT')}
            className="nav-sched-btn"
            style={{
              background: '#d97706',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700
            }}
            title="Complete Pending Uniform Payment"
          >
            💳 Complete Payment
          </button>
          <button
            type="button"
            onClick={() => setActivePortalView('CHECK_STATUS')}
            className="nav-sched-btn"
            style={{
              background: '#2563eb',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700
            }}
            title="Check Payment & Application Status"
          >
            <Search size={13} /> Check Status
          </button>
          <span className="nav-badge"><Calendar size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />{campaign}</span>
          <a
            href="/navigation.html"
            className="nav-sched-btn"
            style={{ background: '#16a34a', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '5px', textDecoration: 'none' }}
            title="Find the Room"
          >
            <Compass size={13} /> Find the Room
          </a>
          <a
            href="/schedules.html"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-sched-btn"
            title="View Published Distribution Schedules"
          >
            Schedules
          </a>
        </div>
      </nav>

      {activePortalView === 'CHECK_STATUS' ? (
        <CheckPaymentStatusPortal onBackToHome={() => setActivePortalView('REGISTRATION')} />
      ) : activePortalView === 'COMPLETE_PAYMENT' ? (
        <CompletePendingPaymentPortal
          onBackToMain={() => setActivePortalView('REGISTRATION')}
          onStartAnotherStudent={handleRegisterAnotherStudentClick}
        />
      ) : (
        <>
          {/* ── Hero ── */}
          <div className="portal-hero">
        <h1>Uniform Registration Portal</h1>
        <p className="hero-sub">
          Register for your official MIT Mysore campus uniform.
          Select your sizes, confirm details, and submit — done in minutes.
        </p>
        <div className="hero-chips">
          <span className="hero-chip">Secure Form</span>
          <span className="hero-chip">3-min process</span>
          <span className="hero-chip">Instant Confirmation</span>
        </div>
      </div>

      {/* ── Form Card ── */}
      <div className="portal-wrap">
        <div className="portal-form-card">

          {/* ── Step Indicator ── */}
          <div className="portal-steps">
            <div className={`ps-item ${stepIdx === 0 ? 'active' : stepIdx > 0 ? 'done' : ''}`}>
              <div className={`ps-dot ${stepIdx > 0 ? 'done' : stepIdx === 0 ? 'active' : 'pending'}`}>
                {stepIdx > 0 ? '✓' : '1'}
              </div>
              <span className="ps-label">Personal Info</span>
            </div>
            <div className={`ps-line ${stepIdx > 0 ? 'filled' : ''}`} />
            <div className={`ps-item ${stepIdx === 1 ? 'active' : stepIdx > 1 ? 'done' : ''}`}>
              <div className={`ps-dot ${stepIdx > 1 ? 'done' : stepIdx === 1 ? 'active' : 'pending'}`}>
                {stepIdx > 1 ? '✓' : '2'}
              </div>
              <span className="ps-label">Sizes</span>
            </div>
            <div className={`ps-line ${stepIdx > 1 ? 'filled' : ''}`} />
            <div className={`ps-item ${stepIdx === 2 ? 'active' : stepIdx > 2 ? 'done' : ''}`}>
              <div className={`ps-dot ${stepIdx > 2 ? 'done' : stepIdx === 2 ? 'active' : 'pending'}`}>
                {stepIdx > 2 ? '✓' : '3'}
              </div>
              <span className="ps-label">Review & Submit</span>
            </div>
            <div className={`ps-line ${stepIdx > 2 ? 'filled' : ''}`} />
            <div className={`ps-item ${stepIdx === 3 ? 'active' : ''}`}>
              <div className={`ps-dot ${stepIdx === 3 ? 'active' : 'pending'}`}>4</div>
              <span className="ps-label">Fee Payment</span>
            </div>
          </div>

          <div className="portal-body">
            {!categoryCheck.isOpen ? (
              <div className="max-w-2xl mx-auto my-6 bg-white rounded-2xl border-2 border-rose-300 shadow-md overflow-hidden text-left">
                <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-400">
                      {categoryCheck.category === 'UG'
                        ? 'Undergraduate (UG) Portal Notice'
                        : 'Postgraduate (PG) Portal Notice'}
                    </span>
                    <h2 className="text-xl font-black mt-0.5">
                      {categoryCheck.category} Uniform Application Is Currently Closed
                    </h2>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-black bg-rose-600 text-white shadow-xs">
                    {categoryCheck.category}: CLOSED
                  </span>
                </div>

                <div className="p-6 space-y-4">
                  <p className="text-sm text-slate-700 font-medium leading-relaxed">
                    {categoryCheck.message}
                  </p>

                  {form.usn && (
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-center justify-between">
                      <span>
                        Entered USN <strong className="font-mono">{form.usn}</strong> belongs to{' '}
                        <strong>{categoryCheck.category} ({form.course || form.department})</strong>.
                      </span>
                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, usn: '', department: '' }))}
                        className="text-blue-600 hover:underline font-bold cursor-pointer"
                      >
                        Clear USN
                      </button>
                    </div>
                  )}

                  <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-slate-500 font-medium">
                      Already registered earlier? Check your live payment status:
                    </span>
                    <button
                      type="button"
                      onClick={openStatusCheck}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Search size={14} />
                      <span>Check Application & Payment Status</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* ════ STEP 1: Personal Info ════ */}
                {step === 'personal' && (
                  <div>
                    <div className="p-section-title">
                      <span className="p-section-icon"><User size={16} /></span>
                      Personal Information
                    </div>

                    <div className="p-grid p-grid-2">
                      <div className="p-field">
                        <label htmlFor="sp-name">Full Name <span className="req">*</span></label>
                        <input
                          id="sp-name"
                          type="text"
                          placeholder="e.g. Rahul Kumar Sharma"
                          value={form.fullName}
                          onChange={e => setField('fullName', e.target.value)}
                          className={errors.fullName ? 'err' : ''}
                          autoComplete="name"
                        />
                        {errors.fullName
                          ? <span className="p-err">⚠ {errors.fullName}</span>
                          : <span className="p-hint">Enter your name exactly as in college records</span>
                        }
                      </div>

                      <div className="p-field">
                        <label htmlFor="sp-phone">Mobile Number <span className="req">*</span></label>
                        <input
                          id="sp-phone"
                          type="tel"
                          placeholder="9876543210"
                          value={form.phone}
                          onChange={e => setField('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                          className={errors.phone ? 'err' : ''}
                          autoComplete="tel"
                        />
                        {errors.phone
                          ? <span className="p-err">⚠ {errors.phone}</span>
                          : <span className="p-hint">For collection notifications</span>
                        }
                      </div>
                    </div>

                    <div className="p-grid p-grid-2" style={{ marginTop: '1rem' }}>
                      <div className="p-field">
                        <label>Gender <span className="req">*</span></label>
                        <div className="p-gender-picker">
                          <button
                            type="button"
                            className={`p-gender-btn ${form.gender === 'Male' ? 'sel' : ''}`}
                            onClick={() => setField('gender', 'Male')}
                          >
                            Male
                          </button>
                          <button
                            type="button"
                            className={`p-gender-btn ${form.gender === 'Female' ? 'sel' : ''}`}
                            onClick={() => setField('gender', 'Female')}
                          >
                            Female
                          </button>
                        </div>
                        <span className="p-hint">For uniform cut & tailoring specification</span>
                      </div>
                    </div>

                    <div className="p-divider" />

                    <div className="p-section-title">
                      <span className="p-section-icon"><Building2 size={16} /></span>
                      Academic Details
                    </div>

                    {/* Real-time USN Department Auto-Selector */}
                    <UsnDepartmentAutoSelector
                      usnValue={form.usn}
                      departmentValue={form.department}
                      errorMessage={errors.usn}
                      onUsnAndDepartmentChange={(detected) => {
                        setForm((prev) => ({
                          ...prev,
                          usn: detected.usn,
                          department: detected.department,
                          departmentCode: detected.departmentCode || '',
                          departmentShortName: detected.departmentShortName || '',
                          course: detected.course || prev.course,
                          educationLevel: detected.educationLevel || prev.educationLevel,
                          isUsnValid: detected.isValid
                        }));
                        if (errors.usn) {
                          setErrors((prev) => ({ ...prev, usn: undefined }));
                        }
                      }}
                    />

                    <div className="p-grid p-grid-2" style={{ marginTop: '0.75rem' }}>
                      <div className="p-field">
                        <label htmlFor="sp-sem">Year <span className="req">*</span></label>
                        <div className="p-sel-wrap">
                          <select
                            id="sp-sem"
                            value={form.semester}
                            onChange={e => setField('semester', parseInt(e.target.value))}
                          >
                            {SEMESTERS.map(s => (
                              <option key={s.number} value={s.number}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="p-field">
                        <label htmlFor="sp-sec">Section <span className="req">*</span></label>
                        <div className="p-sel-wrap">
                          <select
                            id="sp-sec"
                            value={form.section}
                            onChange={e => setField('section', e.target.value)}
                          >
                            {availableSections.map(s => (
                              <option key={s} value={s}>Section {s}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="p-btn-row">
                      <button id="sp-next-sizes" className="p-btn p-btn-primary" onClick={goToSizes}>
                        Next: Choose Sizes →
                      </button>
                    </div>
                  </div>
                )}

                {/* ════ STEP 2: Sizes ════ */}
                {step === 'sizes' && (
                  <UniformSizeSelectionStep
                    registrationData={{
                      studentName: form.fullName,
                      fullName: form.fullName,
                      usn: form.usn,
                      course: form.course || (form.department?.includes('MBA') ? 'MBA' : form.department?.includes('MCA') ? 'MCA' : 'B.E.'),
                      department: form.department,
                      gender: form.gender,
                      academicYear: formatAcademicYear(form.semester),
                      semester: form.semester,
                      section: form.section,
                      shirtSize: form.shirtSize,
                      trouserSize: form.trouserSize,
                      blazerSize: form.blazerSize,
                      remarks: form.remarks || form.uniformMeasurements?.remarks || '',
                      uniformMeasurements: form.uniformMeasurements
                    }}
                    onUpdateMeasurements={(updates) => {
                      setForm(prev => ({
                        ...prev,
                        shirtSize: (updates.shirtSize as ShirtSize) || prev.shirtSize,
                        trouserSize: (updates.trouserSize as TrouserSize) || prev.trouserSize,
                        blazerSize: updates.blazerSize || prev.blazerSize,
                        remarks: updates.remarks !== undefined ? updates.remarks : prev.remarks,
                        uniformMeasurements: updates.uniformMeasurements
                      }));
                      saveLocalDraft('sizes', {
                        ...form,
                        shirtSize: (updates.shirtSize as ShirtSize) || form.shirtSize,
                        trouserSize: (updates.trouserSize as TrouserSize) || form.trouserSize,
                        blazerSize: updates.blazerSize,
                        remarks: updates.remarks !== undefined ? updates.remarks : form.remarks,
                        uniformMeasurements: updates.uniformMeasurements
                      });
                    }}
                    onBack={goBack}
                    onProceedToReview={goToReview}
                  />
                )}

                {/* ════ STEP 3: Review & Submit ════ */}
                {step === 'review' && (
                  <div>
                    <div className="p-section-title">
                      <span className="p-section-icon"><CheckCircle2 size={16} /></span>
                      Review Your Details
                    </div>

                    <div className="p-review-box">
                      <h3>Personal Information</h3>
                      <div className="p-review-grid">
                        <div className="p-review-item"><span className="rl">Full Name</span><span className="rv">{form.fullName}</span></div>
                        <div className="p-review-item"><span className="rl">Gender</span><span className="rv">{form.gender}</span></div>
                        <div className="p-review-item"><span className="rl">USN</span><span className="rv">{form.usn.toUpperCase()}</span></div>
                        <div className="p-review-item"><span className="rl">Mobile</span><span className="rv">{form.phone}</span></div>
                        <div className="p-review-item"><span className="rl">Department</span><span className="rv">{form.department}</span></div>
                        <div className="p-review-item"><span className="rl">Year</span><span className="rv">{formatAcademicYear(form.semester)}</span></div>
                        <div className="p-review-item"><span className="rl">Section</span><span className="rv">Section {form.section}</span></div>
                      </div>
                    </div>

                    <div className="p-review-box">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        <h3 style={{ margin: 0 }}>Uniform Sizes & Tailor Specifications</h3>
                        {form.uniformMeasurements?.garments && (
                          <button
                            type="button"
                            onClick={() => setShowTailorModal(true)}
                            style={{
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              border: '1px solid #bfdbfe',
                              padding: '5px 12px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            🔍 View Tailor Job Card
                          </button>
                        )}
                      </div>
                      <div className="p-size-tags" style={{ marginTop: '10px' }}>
                        {form.uniformMeasurements?.garments ? (
                          Object.values(form.uniformMeasurements.garments).map((g: any) => (
                            <span key={g.garmentId || g.garmentTitle} className="p-size-tag">
                              {g.garmentTitle}: <strong>{g.selectedSize}</strong>
                            </span>
                          ))
                        ) : (
                          <>
                            <span className="p-size-tag">Shirt/Top: {form.shirtSize}</span>
                            <span className="p-size-tag">Pant/Bottom: {form.trouserSize}"</span>
                            {form.blazerSize ? <span className="p-size-tag">Coat: {form.blazerSize}</span> : null}
                          </>
                        )}
                      </div>

                      {((form.remarks && form.remarks.trim()) || (form.uniformMeasurements?.remarks && form.uniformMeasurements.remarks.trim())) && (
                        <div style={{
                          marginTop: '12px',
                          padding: '12px 14px',
                          background: '#f8fafc',
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                          borderLeft: '4px solid #3b82f6'
                        }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '3px' }}>
                            Special Tailoring Remarks / Fit Notes:
                          </span>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', fontStyle: 'italic', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                            "{form.remarks || form.uniformMeasurements?.remarks}"
                          </span>
                        </div>
                      )}

                      <p style={{ fontSize: '0.73rem', color: 'var(--text-light)', marginTop: '0.5rem' }}>
                        Sizes & tailor measurements are final and cannot be changed after submission.
                      </p>
                    </div>

                    <label className="p-consent" htmlFor="sp-consent">
                      <input
                        id="sp-consent"
                        type="checkbox"
                        checked={consent}
                        onChange={e => setConsent(e.target.checked)}
                      />
                      <p>
                        I confirm the information above is <strong>accurate</strong> and matches my college records.
                        I understand that <strong>sizes cannot be changed</strong> after submission.
                        I agree to receive notifications at the phone number provided.
                      </p>
                    </label>

                    <div className="p-btn-row">
                      <button className="p-btn p-btn-secondary" onClick={goBack} disabled={submitting}>
                        ← Edit
                      </button>
                      <button
                        id="sp-submit"
                        className="p-btn p-btn-success"
                        onClick={handleSubmit}
                        disabled={submitting || !consent}
                      >
                        {submitting
                          ? <><div className="p-spinner" /> Submitting…</>
                          : 'Submit Registration'}
                      </button>
                    </div>
                  </div>
                )}

                {/* ════ STEP 4: Fee Payment ════ */}
                {step === 'payment' && submitted && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Student Tracking Credentials Card (Download, Print, Copy) */}
                    <StudentTrackingCredentialsCard
                      trackingData={trackingRecord}
                      livePaymentStatus={livePaymentStatus}
                    />

                    {/* Registration Confirmation Card */}
                    <div style={{
                      background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                      border: '1.5px solid #86efac',
                      borderRadius: '14px',
                      padding: '20px 24px',
                      boxShadow: '0 2px 10px rgba(16, 185, 129, 0.08)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', borderBottom: '1px solid #bbf7d0', paddingBottom: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#16a34a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '18px' }}>✓</div>
                          <div>
                            <div style={{ fontWeight: 800, color: '#166534', fontSize: '1.1rem' }}>Registration Form Recorded</div>
                            <div style={{ fontSize: '0.82rem', color: '#15803d' }}>Step 4 of 4: Complete institutional UPI payment below to finalize verification</div>
                          </div>
                        </div>
                        <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: '8px', padding: '6px 14px', textAlign: 'right' }}>
                          <div style={{ fontSize: '0.68rem', color: '#166534', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Registration ID</div>
                          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#15803d', fontFamily: 'monospace' }}>#{submitted.id.toUpperCase().replace(/^#/, '')}</div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginTop: '14px' }}>
                        <div><div style={{ fontSize: '0.72rem', color: '#64748b' }}>Student Name</div><div style={{ fontWeight: 700, color: '#1e293b' }}>{submitted.fullName}</div></div>
                        <div><div style={{ fontSize: '0.72rem', color: '#64748b' }}>USN</div><div style={{ fontWeight: 700, color: '#1e293b', fontFamily: 'monospace' }}>{submitted.usn}</div></div>
                        <div><div style={{ fontSize: '0.72rem', color: '#64748b' }}>Dept / Year / Sec</div><div style={{ fontWeight: 700, color: '#1e293b' }}>{submitted.department} · {formatAcademicYear(submitted.semester)} · Sec {submitted.section}</div></div>
                        <div><div style={{ fontSize: '0.72rem', color: '#64748b' }}>Uniform Sizes</div><div style={{ fontWeight: 700, color: '#1e293b' }}>Shirt: {submitted.shirtSize} | Trouser: {submitted.trouserSize}"</div></div>
                      </div>

                      <div style={{ display: 'flex', gap: '10px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #bbf7d0', flexWrap: 'wrap' }}>
                        <a
                          href={`/navigation.html?room=${encodeURIComponent((studentSchedule?.room || '114').replace(/^Room\s*/i, '').trim())}`}
                          className="p-btn p-btn-secondary"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '6px 14px', textDecoration: 'none' }}
                          title="Find the Room"
                        >
                          <Compass size={14} /> Find Room (Room {(studentSchedule?.room || '114').replace(/^Room\s*/i, '').trim()})
                        </a>
                        <button
                          type="button"
                          className="p-btn p-btn-secondary"
                          onClick={resetForm}
                          style={{ fontSize: '0.82rem', padding: '6px 14px' }}
                        >
                          ← Register Another Student
                        </button>
                      </div>
                    </div>

                    {/* Interactive Payment Section with 3 Dynamic UPI Scanners */}
                    <StudentPaymentSection
                      registrationData={submitted}
                      onPaymentComplete={() => {
                        setLivePaymentStatus('Payment Submitted');
                        showToast('Payment submitted for institution verification!');
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

            {/* ── Footer ── */}
            <footer className="portal-footer" style={{ marginTop: '1.5rem', borderRadius: '12px' }}>
              © {currentYear} Maharaja Institute of Technology Mysore · Uniform Registration Portal
              <br />
              <span style={{ display: 'block', marginTop: '0.3rem' }}>
                Academic Year {academicYear} · Campus Management System
              </span>
            </footer>
          </div>
        </>
      )}

      {showTailorModal && (
        <TailorMeasurementReportModal
          studentRecord={
            submitted
              ? {
                  studentName: submitted.fullName,
                  fullName: submitted.fullName,
                  usn: submitted.usn,
                  applicationId: submitted.id || (submitted as any).applicationId,
                  course: (submitted as any).course || 'B.E.',
                  gender: submitted.gender,
                  shirtSize: submitted.shirtSize,
                  trouserSize: submitted.trouserSize,
                  blazerSize: (submitted as any).blazerSize,
                  uniformMeasurements: (submitted as any).uniformMeasurements || (submitted as any).uniform_measurements
                }
              : {
                  studentName: form.fullName,
                  fullName: form.fullName,
                  usn: form.usn,
                  applicationId: form.usn,
                  course: form.course || 'B.E.',
                  gender: form.gender,
                  shirtSize: form.shirtSize,
                  trouserSize: form.trouserSize,
                  blazerSize: form.blazerSize,
                  uniformMeasurements: form.uniformMeasurements
                }
          }
          onClose={() => setShowTailorModal(false)}
        />
      )}
    </div>
  );
}

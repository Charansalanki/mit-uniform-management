import React, { useState } from 'react';
import StudentPaymentSection from '../StudentPaymentSection';
import { useAuthenticatedSse } from '../../hooks/useAuthenticatedSse';

interface Props {
  apiBaseUrl?: string;
  onBackToMain?: () => void;
  onStartAnotherStudent?: () => void;
}

export default function CompletePendingPaymentPortal({
  apiBaseUrl = '',
  onBackToMain,
  onStartAnotherStudent
}: Props) {
  const [applicationId, setApplicationId] = useState('');
  const [trackingPin, setTrackingPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [recoverySession, setRecoverySession] = useState<{
    canProceedToPay?: boolean;
    alreadyPaid?: boolean;
    awaitingVerification?: boolean;
    paymentRecoveryToken?: string;
    trackingData?: any;
  } | null>(null);

  const handleRetrieveRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanApp = applicationId.trim().toUpperCase();
    const cleanPin = trackingPin.replace(/\D/g, '').trim();

    if (!cleanApp || cleanPin.length !== 6) {
      setErrorMsg('Please enter your valid Application ID and 6-digit Tracking PIN.');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${apiBaseUrl}/api/tracking/recover-pending-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: cleanApp,
          trackingPin: cleanPin
        })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'Could not retrieve registration.');
        return;
      }

      setRecoverySession(data);
    } catch {
      setErrorMsg('Network error while retrieving your registration.');
    } finally {
      setLoading(false);
    }
  };

  // Live SSE updates while viewing the recovered registration
  useAuthenticatedSse({
    streamPath: recoverySession?.trackingData?.registrationId
      ? `/api/sse/student/${recoverySession.trackingData.registrationId}`
      : null,
    jwtToken: recoverySession?.paymentRecoveryToken,
    apiBaseUrl,
    eventHandlers: {
      PAYMENT_STATUS_UPDATED: (liveEvent: any) => {
        setRecoverySession((prev) =>
          prev
            ? {
                ...prev,
                alreadyPaid: liveEvent.paymentStatus === 'Payment Successful',
                canProceedToPay: liveEvent.paymentStatus === 'Payment Rejected',
                trackingData: {
                  ...prev.trackingData,
                  payment: {
                    ...prev.trackingData.payment,
                    paymentStatus: liveEvent.paymentStatus,
                    verifiedAt: liveEvent.verifiedAt,
                    verifiedByVendor: liveEvent.verifiedByVendor,
                    rejectionReason: liveEvent.rejectionReason
                  }
                }
              }
            : prev
        );
      }
    }
  });

  const trackingData = recoverySession?.trackingData;
  const profile = trackingData?.studentProfile || {};
  const sizes = trackingData?.uniformSelection || {};
  const payment = trackingData?.payment || {};

  return (
    <div className="max-w-4xl mx-auto my-6 px-4 space-y-6">
      {/* Top Navigation Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
            Pending Payment Recovery Portal
          </span>
          <h1 className="text-xl font-extrabold text-slate-900">
            Complete Pending Uniform Payment
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {onStartAnotherStudent && (
            <button
              type="button"
              onClick={onStartAnotherStudent}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm"
            >
              + Register Another Student
            </button>
          )}
          {onBackToMain && (
            <button
              type="button"
              onClick={onBackToMain}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg border border-slate-300"
            >
              ← Back to Home
            </button>
          )}
        </div>
      </div>

      {/* STEP 1: ENTER APPLICATION ID & 6-DIGIT PIN */}
      {!trackingData ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 max-w-lg mx-auto overflow-hidden">
          <div className="bg-slate-900 text-white p-6">
            <h2 className="text-lg font-bold">Retrieve Saved Registration</h2>
            <p className="text-xs text-slate-300 mt-1">
              Registered earlier without completing payment? Enter your Application ID and 6-Digit PIN below to resume from the payment step.
            </p>
          </div>

          <form onSubmit={handleRetrieveRegistration} className="p-6 space-y-4">
            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-300 text-red-800 rounded-lg text-xs font-semibold">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Application ID *
              </label>
              <input
                type="text"
                required
                value={applicationId}
                onChange={(e) => setApplicationId(e.target.value.toUpperCase())}
                placeholder="e.g. MIT-2026-10001"
                className="w-full px-3.5 py-2.5 text-sm font-mono uppercase border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                6-Digit Tracking PIN *
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                required
                value={trackingPin}
                onChange={(e) => setTrackingPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••"
                className="w-full px-3.5 py-2.5 text-sm font-mono tracking-widest border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-lg shadow-sm transition"
            >
              {loading ? 'Retrieving Saved Registration...' : 'Retrieve Registration & Continue to Payment'}
            </button>
          </form>
        </div>
      ) : (
        /* STEP 2: DISPLAY RETRIEVED STUDENT DETAILS & CONTINUE PAYMENT */
        <div className="space-y-6">
          {/* Retrieved Registration Summary Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <span className="font-mono text-xs font-extrabold text-blue-600">
                  Application ID: {trackingData.applicationId}
                </span>
                <h2 className="text-lg font-bold text-slate-900">
                  {profile.studentName} ({profile.usn})
                </h2>
                <p className="text-xs text-slate-500">
                  Saved Registration Retrieved • No duplicate registration will be created
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
                    payment.paymentStatus === 'Payment Successful'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : payment.paymentStatus === 'Payment Rejected'
                      ? 'bg-red-100 text-red-800 border-red-300'
                      : 'bg-amber-100 text-amber-800 border-amber-300'
                  }`}
                >
                  {payment.paymentStatus || 'Payment Pending'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setRecoverySession(null);
                    setTrackingPin('');
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg"
                >
                  Switch Student
                </button>
              </div>
            </div>

            {/* Required Summary Fields: Name, USN, Department, Selected Uniform Sizes, Payment Amount */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500 block">Student Name</span>
                <strong className="text-slate-900">{profile.studentName}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">USN</span>
                <strong className="font-mono text-blue-700">{profile.usn}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Department & Year</span>
                <strong className="text-slate-900">
                  {profile.department} ({profile.academicYear}, Sec {profile.section})
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">Selected Uniform Sizes</span>
                <strong className="text-slate-900">
                  Shirt: {sizes.shirtSize || 'Standard'} • Trouser: {sizes.trouserSize || 'Standard'}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">Assigned Vendor</span>
                <strong className="text-slate-900">
                  {trackingData.assignedVendor?.vendorName || 'Assigned'}
                </strong>
              </div>
            </div>
          </div>

          {/* SAFETY GUARD: If Already Paid, Block Duplicate Payment & Show Payment Successful */}
          {payment.paymentStatus === 'Payment Successful' ? (
            <div className="bg-emerald-50 border-2 border-emerald-500 rounded-2xl p-6 text-emerald-950 space-y-2 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-extrabold flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-sm">
                    ✓
                  </span>
                  Payment Successful
                </h3>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white">
                  Verified & Locked
                </span>
              </div>
              <p className="text-sm">
                Payment of <strong>₹{Number(payment.paidAmount || payment.expectedAmount || 0).toLocaleString('en-IN')}</strong> (UTR:{' '}
                <span className="font-mono font-bold">{payment.utrNumber || 'N/A'}</span>) for{' '}
                <strong>{profile.studentName}</strong> ({profile.usn}) is already verified. No further payment is required.
              </p>
            </div>
          ) : (
            /* Mount Existing Step 4 Payment Component Linked to This Exact Saved Registration */
            <StudentPaymentSection
              registrationData={{
                id: trackingData.registrationId,
                _id: trackingData.registrationId,
                registrationId: trackingData.registrationId,
                fullName: profile.studentName,
                studentName: profile.studentName,
                usn: profile.usn,
                department: profile.department,
                yearSemester: profile.academicYear,
                section: profile.section,
                gender: profile.gender,
                packageType: sizes.packageType
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}


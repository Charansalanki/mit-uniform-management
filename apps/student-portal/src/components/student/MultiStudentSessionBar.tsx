import React from 'react';
import { SavedDeviceStudent } from '../../hooks/useStudentProgressPersistence';

const BADGE_MAP: Record<string, string> = {
  'Payment Pending': 'bg-amber-100 text-amber-800 border-amber-300',
  'Payment Submitted': 'bg-blue-100 text-blue-800 border-blue-300',
  'Under Verification': 'bg-blue-100 text-blue-800 border-blue-300',
  'Payment Successful': 'bg-emerald-100 text-emerald-800 border-emerald-300',
  'Payment Rejected': 'bg-red-100 text-red-800 border-red-300'
};

interface Props {
  savedDeviceStudents?: SavedDeviceStudent[];
  activeApplicationId?: string;
  onSelectStudentToPayOrView?: (student: SavedDeviceStudent) => void;
  onRegisterAnotherStudent?: () => void;
  onOpenCompletePendingPayment?: () => void;
  onOpenCheckStatus?: () => void;
}

export default function MultiStudentSessionBar({
  savedDeviceStudents = [],
  activeApplicationId,
  onSelectStudentToPayOrView,
  onRegisterAnotherStudent,
  onOpenCompletePendingPayment,
  onOpenCheckStatus
}: Props) {
  return (
    <div className="max-w-4xl mx-auto my-4 space-y-3">
      {/* Main Quick Action Header */}
      <div className="bg-white px-5 py-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenCompletePendingPayment}
            className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold rounded-lg shadow-sm transition flex items-center gap-1.5"
          >
            <span>💳</span> Complete Pending Payment
          </button>
          <button
            type="button"
            onClick={onOpenCheckStatus}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg border border-slate-300 transition flex items-center gap-1.5"
          >
            <span>🔍</span> Check Payment Status
          </button>
        </div>

        {onRegisterAnotherStudent && (
          <button
            type="button"
            onClick={onRegisterAnotherStudent}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-lg shadow-sm transition"
          >
            + Register Another Student
          </button>
        )}
      </div>

      {/* Multi-Student Switcher Strip (Shown when 1 or more students have been registered on this phone/browser) */}
      {savedDeviceStudents.length > 0 && (
        <div className="bg-slate-900 text-white p-4 rounded-xl border border-slate-800 space-y-2.5 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
            <span className="font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
              Students Registered on This Device ({savedDeviceStudents.length})
            </span>
            <span className="text-[11px] text-slate-400">
              Each student is saved separately with unique Application ID & PIN
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
            {savedDeviceStudents.map((stu) => {
              const isCurrent = stu.applicationId === activeApplicationId;
              return (
                <div
                  key={stu.applicationId}
                  onClick={() => onSelectStudentToPayOrView?.(stu)}
                  className={`p-3 rounded-lg border cursor-pointer transition flex flex-col justify-between gap-2 ${
                    isCurrent
                      ? 'bg-slate-800 border-blue-500 ring-2 ring-blue-400/50 shadow-sm'
                      : 'bg-slate-800/70 border-slate-700 hover:border-slate-500 hover:bg-slate-800'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-[11px] font-bold text-blue-400">
                        {stu.applicationId}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          BADGE_MAP[stu.paymentStatus] || BADGE_MAP['Payment Pending']
                        }`}
                      >
                        {stu.paymentStatus || 'Payment Pending'}
                      </span>
                    </div>
                    <div className="font-bold text-xs text-white mt-1 truncate">
                      {stu.studentName} ({stu.usn})
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      PIN: <strong className="font-mono text-emerald-400">{stu.trackingPin}</strong>
                      {stu.expectedAmount ? ` • ₹${Number(stu.expectedAmount).toLocaleString('en-IN')}` : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


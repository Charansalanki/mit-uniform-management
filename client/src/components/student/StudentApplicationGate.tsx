import React, { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
import { useRealtimeSystemSync } from '../../hooks/useRealtimeSystemSync';
import { parseAndValidateMitUsn } from '../../utils/usnDepartmentValidator';
import CheckPaymentStatusPortal from './CheckPaymentStatusPortal';
import { MIT_SEAL_LOGO_BASE64 } from '../../utils/mitLogoBase64';
import { Search, ShieldCheck, AlertCircle, Volume2, VolumeX, RotateCcw } from 'lucide-react';

export interface CategoryCheckResult {
  isOpen: boolean;
  category: 'UG' | 'PG';
  message: string;
}

export interface UgPgStatusContextType {
  ugApplicationOpen: boolean;
  pgApplicationOpen: boolean;
  bothClosed: boolean;
  bothOpen: boolean;
  isApplicationOpen: boolean;
  ugClosedMessage: string;
  pgClosedMessage: string;
  videoUrl: string;
  isCategoryOpenForStudent: (params: { usn?: string; course?: string; educationLevel?: string }) => CategoryCheckResult;
  openStatusCheck: () => void;
}

const UgPgStatusContext = createContext<UgPgStatusContextType>({
  ugApplicationOpen: true,
  pgApplicationOpen: true,
  bothClosed: false,
  bothOpen: true,
  isApplicationOpen: true,
  ugClosedMessage: 'Undergraduate (B.E. / B.Tech.) uniform registration and new payment submissions are currently closed.',
  pgClosedMessage: 'Postgraduate (MBA / MCA / M.Tech.) uniform registration and new payment submissions are currently closed.',
  videoUrl: '/assets/video/application-closed.mp4',
  isCategoryOpenForStudent: () => ({ isOpen: true, category: 'UG', message: '' }),
  openStatusCheck: () => {}
});

export const useUgPgApplicationStatus = () => useContext(UgPgStatusContext);

export interface StudentApplicationGateProps {
  apiBaseUrl?: string;
  children: React.ReactNode;
}

export default function StudentApplicationGate({
  apiBaseUrl = '',
  children
}: StudentApplicationGateProps) {
  const [loading, setLoading] = useState(true);
  const [showStatusCheckModal, setShowStatusCheckModal] = useState(false);

  const [statusState, setStatusState] = useState({
    ugApplicationOpen: true,
    pgApplicationOpen: true,
    ugClosedMessage:
      'Undergraduate (B.E. / B.Tech.) uniform registration and new payment submissions are currently closed.',
    pgClosedMessage:
      'Postgraduate (MBA / MCA / M.Tech.) uniform registration and new payment submissions are currently closed.',
    videoUrl: '/assets/video/application-closed.mp4'
  });

  const [isMuted, setIsMuted] = useState(true);
  const [videoLoadError, setVideoLoadError] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const fetchUgPgStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/application-status?t=${Date.now()}`,
        { cache: 'no-store' }
      );
      const data = await res.json();
      if (data && data.success) {
        setStatusState({
          ugApplicationOpen: Boolean(data.ugApplicationOpen),
          pgApplicationOpen: Boolean(data.pgApplicationOpen),
          ugClosedMessage:
            data.ugClosedMessage ||
            'Undergraduate (B.E. / B.Tech.) uniform registration is currently closed.',
          pgClosedMessage:
            data.pgClosedMessage ||
            'Postgraduate (MBA / MCA / M.Tech.) uniform registration is currently closed.',
          videoUrl: data.videoUrl || '/assets/video/application-closed.mp4'
        });
      }
    } catch (err) {
      console.error('Error fetching UG/PG application status:', err);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    fetchUgPgStatus();
  }, [fetchUgPgStatus]);

  useRealtimeSystemSync({
    apiBaseUrl,
    pollIntervalMs: 4000,
    onSyncTrigger: fetchUgPgStatus
  });

  // Helper exposed to child registration forms to check if the student's detected USN/Course category is open
  const isCategoryOpenForStudent = useCallback(
    ({ usn = '', course = '', educationLevel = '' }: { usn?: string; course?: string; educationLevel?: string } = {}): CategoryCheckResult => {
      let category: 'UG' | 'PG' = 'UG';

      if (usn) {
        const parsed = parseAndValidateMitUsn(usn);
        if (parsed.isValid && parsed.educationLevel) {
          category = parsed.educationLevel as 'UG' | 'PG';
        }
      } else if (
        ['MBA', 'MCA', 'M.TECH.'].includes(String(course).toUpperCase().trim()) ||
        String(educationLevel).toUpperCase().trim() === 'PG'
      ) {
        category = 'PG';
      }

      if (category === 'UG' && !statusState.ugApplicationOpen) {
        return {
          isOpen: false,
          category: 'UG',
          message: statusState.ugClosedMessage
        };
      }
      if (category === 'PG' && !statusState.pgApplicationOpen) {
        return {
          isOpen: false,
          category: 'PG',
          message: statusState.pgClosedMessage
        };
      }
      return { isOpen: true, category, message: '' };
    },
    [statusState]
  );

  const bothClosed = !statusState.ugApplicationOpen && !statusState.pgApplicationOpen;
  const bothOpen = statusState.ugApplicationOpen && statusState.pgApplicationOpen;
  const isApplicationOpen = statusState.ugApplicationOpen || statusState.pgApplicationOpen;

  const handleToggleSound = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!videoRef.current) return;
    const nextMuted = !videoRef.current.muted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
    if (!nextMuted && videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    }
  };

  const handleReplayVideo = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!videoRef.current) return;
    videoRef.current.currentTime = 0;
    videoRef.current.play().catch(() => {});
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-300 text-xs font-bold">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
          <span>Loading MIT Mysore Uniform Portal...</span>
        </div>
      </div>
    );
  }

  // Always allow existing registered students to check their application & payment status
  if (showStatusCheckModal) {
    return (
      <div className="min-h-screen bg-slate-50 py-6 px-4">
        <div className="max-w-4xl mx-auto mb-4">
          <button
            type="button"
            onClick={() => setShowStatusCheckModal(false)}
            className="px-4 py-2 bg-white text-slate-700 text-xs font-black rounded-xl border border-slate-200 shadow-xs hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
          >
            ← Back to Uniform Portal Home
          </button>
        </div>
        <CheckPaymentStatusPortal
          apiBaseUrl={apiBaseUrl}
          onBackToHome={() => setShowStatusCheckModal(false)}
        />
      </div>
    );
  }

  // ==========================================================================
  // CASE 1: BOTH UG AND PG ARE OFF -> Professional Closed Page + Status Lookup Button
  // ==========================================================================
  if (bothClosed) {
    const resolvedVideoSrc = statusState.videoUrl?.startsWith('http')
      ? statusState.videoUrl
      : statusState.videoUrl?.startsWith('/uploads/')
      ? `${apiBaseUrl}${statusState.videoUrl}`
      : statusState.videoUrl || '/assets/video/application-closed.mp4';

    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
        <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-6 shadow-2xl relative overflow-hidden">
          {/* Top Brand Pill */}
          <div className="flex items-center justify-center gap-2.5">
            <img
              src="/logo.png"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.src.startsWith('data:')) {
                  target.src = MIT_SEAL_LOGO_BASE64;
                }
              }}
              alt="MIT Mysore"
              className="w-8 h-8 rounded-full object-contain bg-white/10 p-1"
            />
            <div className="text-left">
              <div className="text-xs font-black tracking-wide text-white uppercase">
                Maharaja Institute of Technology Mysore
              </div>
              <div className="text-[10px] text-slate-400 font-medium">
                Official Uniform Management Portal
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <span className="inline-block px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
              UG: CLOSED • PG: CLOSED
            </span>
            <h1 className="text-2xl font-black text-white tracking-tight">
              Uniform Registration Is Currently Closed
            </h1>
            <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
              Both Undergraduate (B.E. / B.Tech.) and Postgraduate (MBA / MCA / M.Tech.) uniform registrations and new payment submissions are currently closed by the college administration.
            </p>
          </div>

          {/* Optional notice video */}
          {!videoLoadError && statusState.videoUrl && (
            <div className="rounded-2xl overflow-hidden border border-slate-800 bg-black relative max-h-56">
              <video
                ref={videoRef}
                src={resolvedVideoSrc}
                autoPlay
                muted={isMuted}
                loop
                playsInline
                onError={() => setVideoLoadError(true)}
                className="w-full h-full object-cover max-h-56 cursor-pointer"
                onClick={handleToggleSound}
              />
              <div className="absolute bottom-2 right-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleSound}
                  className="px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md text-white text-[10px] font-bold border border-white/20 flex items-center gap-1 cursor-pointer"
                >
                  {isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                  <span>{isMuted ? 'Unmute' : 'Mute'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleReplayVideo}
                  className="p-1 rounded-lg bg-black/70 backdrop-blur-md text-white text-[10px] font-bold border border-white/20 cursor-pointer"
                >
                  <RotateCcw size={12} />
                </button>
              </div>
            </div>
          )}

          {/* Existing Student Status Lookup Card */}
          <div className="p-5 rounded-2xl bg-slate-850 border border-slate-800 text-xs text-slate-300 space-y-3.5 text-left">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-emerald-400 shrink-0" />
              <div className="font-bold text-white text-sm">
                Already Registered? Check Your Application & Payment Status
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Existing students can check their registration details, selected sizes, and live payment verification status anytime using their Application ID and 6-Digit PIN. No data has been erased.
            </p>
            <button
              type="button"
              onClick={() => setShowStatusCheckModal(true)}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Search size={14} />
              <span>Check Application & Payment Status</span>
            </button>
          </div>

          <div className="text-[11px] text-slate-500">
            For urgent uniform inquiries, contact the MIT Mysore Administration Desk.
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // CASE 2: AT LEAST ONE CATEGORY (UG OR PG) IS ON
  // ==========================================================================
  return (
    <UgPgStatusContext.Provider
      value={{
        ...statusState,
        bothClosed,
        bothOpen,
        isApplicationOpen,
        isCategoryOpenForStudent,
        openStatusCheck: () => setShowStatusCheckModal(true)
      }}
    >
      {children}
    </UgPgStatusContext.Provider>
  );
}

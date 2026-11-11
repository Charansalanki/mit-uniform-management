import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRealtimeSystemSync } from '../../hooks/useRealtimeSystemSync';
import { MIT_SEAL_LOGO_BASE64 } from '../../utils/mitLogoBase64';

const DEFAULT_FALLBACK_TEXT =
  'The application is temporarily unavailable. Please check back later.';

export interface StudentApplicationGateProps {
  apiBaseUrl?: string;
  children: React.ReactNode;
}

export default function StudentApplicationGate({
  apiBaseUrl = '',
  children
}: StudentApplicationGateProps) {
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [appStatus, setAppStatus] = useState({
    isApplicationOpen: true,
    statusLabel: 'Application ON',
    videoUrl: '/assets/video/application-closed.mp4',
    fallbackMessage: DEFAULT_FALLBACK_TEXT
  });

  const [isMuted, setIsMuted] = useState(true);
  const [videoLoadError, setVideoLoadError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Fetch authoritative ON/OFF state from database
  const fetchApplicationStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/application-status?t=${Date.now()}`,
        { cache: 'no-store' }
      );
      const data = await res.json();
      if (data && typeof data.isApplicationOpen === 'boolean') {
        setAppStatus((prev) => {
          if (prev.videoUrl !== data.videoUrl) {
            setVideoLoadError(false);
          }
          return {
            isApplicationOpen: data.isApplicationOpen,
            statusLabel: data.statusLabel || (data.isApplicationOpen ? 'Application ON' : 'Application OFF'),
            videoUrl: data.videoUrl || '/assets/video/application-closed.mp4',
            fallbackMessage: data.fallbackMessage || DEFAULT_FALLBACK_TEXT
          };
        });
      }
    } catch (err) {
      console.error('Error checking student application status:', err);
    } finally {
      setLoadingStatus(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    fetchApplicationStatus();
  }, [fetchApplicationStatus]);

  // Real-time synchronization via SSE & database syncVersion polling
  useRealtimeSystemSync({
    apiBaseUrl,
    pollIntervalMs: 4000,
    onSyncTrigger: () => {
      fetchApplicationStatus();
    }
  });

  // Trigger continuous autoplay loop whenever application is OFF
  useEffect(() => {
    if (!appStatus.isApplicationOpen && videoRef.current && !videoLoadError) {
      videoRef.current.muted = true;
      videoRef.current.loop = true;
      setIsMuted(true);
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch(() => setIsPlaying(false));
      }
    }
  }, [appStatus.isApplicationOpen, appStatus.videoUrl, videoLoadError]);

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
    videoRef.current
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => {});
  };

  if (loadingStatus) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-300 text-xs font-semibold">
        Loading MIT Mysore Uniform Portal...
      </div>
    );
  }

  // ==========================================================================
  // STATE A: APPLICATION ON -> Render Normal Student Application Unchanged
  // ==========================================================================
  if (appStatus.isApplicationOpen) {
    return <>{children}</>;
  }

  // Resolve full video source URL
  const resolvedVideoSrc = appStatus.videoUrl?.startsWith('http')
    ? appStatus.videoUrl
    : appStatus.videoUrl?.startsWith('/uploads/')
    ? `${apiBaseUrl}${appStatus.videoUrl}`
    : appStatus.videoUrl || '/assets/video/application-closed.mp4';

  // ==========================================================================
  // STATE B: APPLICATION OFF -> Unified Immersive Full-Screen Looping Video
  // ==========================================================================
  return (
    <div
      className="fixed inset-0 w-screen h-screen bg-black text-white overflow-hidden flex items-center justify-center select-none z-[999999]"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: '#000000',
        zIndex: 999999
      }}
    >
      {!videoLoadError ? (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-black">
          {/* Main Full-Stage Looping Video */}
          <video
            ref={videoRef}
            src={resolvedVideoSrc}
            autoPlay
            muted
            loop
            playsInline
            onPlay={() => setIsPlaying(true)}
            onEnded={() => {
              // Redundant loop safety for older mobile browsers
              if (videoRef.current) {
                videoRef.current.currentTime = 0;
                videoRef.current.play().catch(() => {});
              }
            }}
            onError={() => setVideoLoadError(true)}
            onClick={() => handleToggleSound()}
            className="w-full h-full object-contain max-h-screen cursor-pointer"
            title="Click video to toggle sound"
          />

          {/* Top Floating Institutional Badge (Integrated Glass Pill) */}
          <div className="absolute top-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 px-4 py-2 rounded-full bg-slate-950/80 backdrop-blur-md border border-white/10 shadow-2xl pointer-events-none">
            <img
              src="/logo.png"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.src.startsWith('data:')) {
                  target.src = MIT_SEAL_LOGO_BASE64;
                }
              }}
              alt="MIT Mysore"
              className="w-5 h-5 rounded-full object-contain bg-white/10 p-0.5"
            />
            <span className="text-xs font-extrabold text-white tracking-wide">
              MIT Mysore Uniform Portal
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[11px] font-bold text-amber-300">
              Notice Active
            </span>
          </div>

          {/* Bottom Floating Glass Controls (Seamless Floating Bar) */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center justify-center gap-3 px-5 py-2.5 rounded-2xl bg-slate-950/85 backdrop-blur-md border border-white/15 shadow-2xl">
            {/* Visible Sound Control Button */}
            <button
              type="button"
              onClick={(e) => handleToggleSound(e)}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition shadow-md cursor-pointer ${
                isMuted
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 ring-2 ring-amber-400/50'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white ring-2 ring-emerald-400/50'
              }`}
            >
              <span className="text-sm">{isMuted ? '🔇' : '🔊'}</span>
              <span>{isMuted ? 'Tap to Unmute Audio' : 'Sound ON (Mute)'}</span>
            </button>

            {/* Visible Replay Button */}
            <button
              type="button"
              onClick={(e) => handleReplayVideo(e)}
              className="px-4 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-white text-xs font-bold border border-white/15 flex items-center gap-1.5 transition cursor-pointer shadow-md"
            >
              <span>↻</span>
              <span>Replay</span>
            </button>

            {/* Live Continuous Loop Pill */}
            <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-white/15 text-[11px] text-slate-300 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Continuous Loop</span>
            </div>
          </div>
        </div>
      ) : (
        /* Professional Fallback Message if Video Fails to Load */
        <div className="w-full max-w-lg mx-4 bg-slate-900/95 border border-slate-800 rounded-2xl p-8 text-center space-y-4 shadow-2xl backdrop-blur-md">
          <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-400/30 text-amber-400 flex items-center justify-center mx-auto text-2xl font-bold">
            !
          </div>
          <h2 className="text-lg font-bold text-white">
            {appStatus.fallbackMessage || DEFAULT_FALLBACK_TEXT}
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Please contact the Maharaja Institute of Technology Mysore Uniform Administration Desk for assistance.
          </p>
        </div>
      )}
    </div>
  );
}

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  createContext,
  useContext
} from 'react';
import { useRealtimeSystemSync } from '../../hooks/useRealtimeSystemSync';

export interface ApplicationVisibilityContextType {
  ugApplicationOpen: boolean;
  pgApplicationOpen: boolean;
  allowedEducationLevels: ('UG' | 'PG')[];
  allowedCourses: string[];
  defaultEducationLevel: 'UG' | 'PG';
  defaultCourse: string;
}

const ApplicationVisibilityContext = createContext<ApplicationVisibilityContextType>({
  ugApplicationOpen: true,
  pgApplicationOpen: true,
  allowedEducationLevels: ['UG', 'PG'],
  allowedCourses: ['B.E.', 'MBA', 'MCA'],
  defaultEducationLevel: 'UG',
  defaultCourse: 'B.E.'
});

export const useApplicationVisibility = () =>
  useContext(ApplicationVisibilityContext);

export const useUgPgApplicationStatus = useApplicationVisibility;

export interface StudentApplicationGateProps {
  apiBaseUrl?: string;
  children: React.ReactNode;
}

export default function StudentApplicationGate({
  apiBaseUrl = '',
  children
}: StudentApplicationGateProps) {
  const [loading, setLoading] = useState(true);
  const [appState, setAppState] = useState({
    ugApplicationOpen: true,
    pgApplicationOpen: true,
    videoUrl: '/assets/video/application-closed.mp4'
  });

  const [isMuted, setIsMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const fetchApplicationStatus = useCallback(async () => {
    try {
      const urlPrefix = apiBaseUrl || '';

      const res = await fetch(
        `${urlPrefix}/api/application-status?t=${Date.now()}`,
        { cache: 'no-store' }
      );
      const data = await res.json();
      if (data && data.success) {
        setAppState({
          ugApplicationOpen: Boolean(data.ugApplicationOpen),
          pgApplicationOpen: Boolean(data.pgApplicationOpen),
          videoUrl: data.videoUrl || data.closedVideoUrl || '/assets/video/application-closed.mp4'
        });
      }
    } catch (err) {
      console.error('Error fetching UG/PG status:', err);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    fetchApplicationStatus();
  }, [fetchApplicationStatus]);

  useRealtimeSystemSync({
    apiBaseUrl,
    onSyncTrigger: fetchApplicationStatus
  });

  const bothClosed =
    !appState.ugApplicationOpen && !appState.pgApplicationOpen;

  // When BOTH UG and PG are OFF -> Play video with sound enabled
  useEffect(() => {
    if (!bothClosed || !videoRef.current) return;

    const videoEl = videoRef.current;
    videoEl.muted = false;
    setIsMuted(false);

    const playWithSound = videoEl.play();
    if (playWithSound !== undefined) {
      playWithSound.catch(() => {
        // If browser autoplay policy requires muted start first, start playback and unmute on first tap
        videoEl.muted = true;
        setIsMuted(true);
        videoEl.play().catch(() => { });

        const unlockAudio = () => {
          if (videoRef.current) {
            videoRef.current.muted = false;
            setIsMuted(false);
            videoRef.current.play().catch(() => { });
          }
          window.removeEventListener('click', unlockAudio);
          window.removeEventListener('touchstart', unlockAudio);
        };
        window.addEventListener('click', unlockAudio, { once: true });
        window.addEventListener('touchstart', unlockAudio, { once: true });
      });
    }
  }, [bothClosed, appState.videoUrl]);

  const handleToggleSound = () => {
    if (!videoRef.current) return;
    const nextMuted = !videoRef.current.muted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
    if (!nextMuted && videoRef.current.paused) {
      videoRef.current.play().catch(() => { });
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-black" />;
  }

  // ==========================================================================
  // CONDITION 4: UG OFF + PG OFF
  // Hide both UG and PG sections and display ONLY the application-closed video
  // with sound enabled and zero unnecessary text/notices over the video.
  // ==========================================================================
  if (bothClosed) {
    const resolvedVideoSrc = appState.videoUrl?.startsWith('http')
      ? appState.videoUrl
      : appState.videoUrl?.startsWith('/uploads/')
        ? `${apiBaseUrl}${appState.videoUrl}`
        : appState.videoUrl || '/assets/video/application-closed.mp4';

    return (
      <div className="fixed inset-0 w-screen h-screen bg-black flex items-center justify-center overflow-hidden select-none z-[999999]">
        <div className="relative w-full h-full flex items-center justify-center bg-black">
          <video
            ref={videoRef}
            src={resolvedVideoSrc}
            autoPlay
            loop
            playsInline
            onEnded={() => {
              if (videoRef.current) {
                videoRef.current.currentTime = 0;
                videoRef.current.play().catch(() => { });
              }
            }}
            className="w-full h-full object-contain"
          />

          {/* Minimal Icon-Only Sound Toggle at Bottom-Right Corner */}
          <button
            type="button"
            onClick={handleToggleSound}
            aria-label={isMuted ? 'Unmute video' : 'Mute video'}
            className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 z-10 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-sm border border-white/15 flex items-center justify-center text-base sm:text-lg text-white transition duration-200 focus:outline-none cursor-pointer"
          >
            <span>{isMuted ? '🔇' : '🔊'}</span>
          </button>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // CONDITIONS 1, 2 & 3: AT LEAST ONE APPLICATION (UG OR PG) IS ON
  // Never show the closed video. Expose only the enabled category/courses.
  // ==========================================================================
  const allowedEducationLevels: ('UG' | 'PG')[] = [];
  const allowedCourses: string[] = [];

  if (appState.ugApplicationOpen) {
    allowedEducationLevels.push('UG');
    allowedCourses.push('B.E.');
  }
  if (appState.pgApplicationOpen) {
    allowedEducationLevels.push('PG');
    allowedCourses.push('MBA', 'MCA');
  }

  const defaultEducationLevel: 'UG' | 'PG' = appState.ugApplicationOpen ? 'UG' : 'PG';
  const defaultCourse = appState.ugApplicationOpen ? 'B.E.' : 'MBA';

  return (
    <ApplicationVisibilityContext.Provider
      value={{
        ugApplicationOpen: appState.ugApplicationOpen,
        pgApplicationOpen: appState.pgApplicationOpen,
        allowedEducationLevels,
        allowedCourses,
        defaultEducationLevel,
        defaultCourse
      }}
    >
      {children}
    </ApplicationVisibilityContext.Provider>
  );
}

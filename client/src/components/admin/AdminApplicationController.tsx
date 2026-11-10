import React, { useState, useEffect, useCallback } from 'react';

export interface AdminApplicationControllerProps {
  apiBaseUrl?: string;
  authToken?: string | null;
}

export default function AdminApplicationController({
  apiBaseUrl = '',
  authToken = typeof localStorage !== 'undefined'
    ? (localStorage.getItem('mit_admin_token') || localStorage.getItem('adminToken') || localStorage.getItem('token'))
    : null
}: AdminApplicationControllerProps) {
  const [controller, setController] = useState<{
    isApplicationOpen: boolean;
    statusLabel: string;
    videoUrl: string;
    fallbackMessage: string;
    updatedByUsername: string;
    updatedAt: string | null;
    toggleHistory: Array<{
      previousState: boolean;
      newState: boolean;
      changedByUsername: string;
      changedAt: string;
    }>;
  }>({
    isApplicationOpen: true,
    statusLabel: 'Application ON',
    videoUrl: '/assets/video/application-closed.mp4',
    fallbackMessage: 'The application is temporarily unavailable. Please check back later.',
    updatedByUsername: 'Administrator',
    updatedAt: null,
    toggleHistory: []
  });

  const [videoUrlInput, setVideoUrlInput] = useState('/assets/video/application-closed.mp4');
  const [fallbackInput, setFallbackInput] = useState(
    'The application is temporarily unavailable. Please check back later.'
  );
  const [busy, setBusy] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [banner, setBanner] = useState<{ type: string; text: string }>({ type: '', text: '' });

  const buildHeaders = useCallback(
    (isJson = true) => {
      const h: Record<string, string> = {};
      if (isJson) h['Content-Type'] = 'application/json';
      const token = typeof localStorage !== 'undefined'
        ? (localStorage.getItem('mit_admin_token') || authToken)
        : authToken;
      if (token) h['Authorization'] = `Bearer ${token}`;
      return h;
    },
    [authToken]
  );

  const loadControllerState = useCallback(async () => {
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/admin/application-controller?t=${Date.now()}`,
        {
          method: 'GET',
          credentials: 'include',
          headers: buildHeaders(false),
          cache: 'no-store'
        }
      );
      const data = await res.json();
      if (res.ok && data.success && data.controller) {
        setController(data.controller);
        setVideoUrlInput(data.controller.videoUrl || '/assets/video/application-closed.mp4');
        setFallbackInput(
          data.controller.fallbackMessage ||
            'The application is temporarily unavailable. Please check back later.'
        );
      }
    } catch (err) {
      console.error('Failed to load Application Controller state:', err);
    }
  }, [apiBaseUrl, buildHeaders]);

  useEffect(() => {
    loadControllerState();
  }, [loadControllerState]);

  const handleToggleSwitch = async (targetOpenState: boolean) => {
    setBanner({ type: '', text: '' });
    try {
      setBusy(true);
      const res = await fetch(
        `${apiBaseUrl}/api/admin/application-controller/status`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: buildHeaders(true),
          body: JSON.stringify({
            isApplicationOpen: targetOpenState,
            videoUrl: videoUrlInput.trim(),
            fallbackMessage: fallbackInput.trim()
          })
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        setBanner({
          type: 'error',
          text: data.message || 'Failed to update application status.'
        });
        return;
      }

      setController(data.controller);
      setBanner({ type: 'success', text: data.message });
    } catch (err) {
      setBanner({
        type: 'error',
        text: 'Network error while updating application status.'
      });
    } finally {
      setBusy(false);
    }
  };

  const handleVideoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBanner({ type: '', text: '' });

    try {
      setUploadingVideo(true);
      const formData = new FormData();
      formData.append('videoFile', file);

      const res = await fetch(
        `${apiBaseUrl}/api/admin/application-controller/upload-video`,
        {
          method: 'POST',
          credentials: 'include',
          headers: buildHeaders(false),
          body: formData
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        setBanner({
          type: 'error',
          text: data.message || 'Video upload failed.'
        });
        return;
      }

      setVideoUrlInput(data.videoUrl);
      setBanner({ type: 'success', text: data.message });
      loadControllerState();
    } catch (err) {
      setBanner({ type: 'error', text: 'Error uploading video file.' });
    } finally {
      setUploadingVideo(false);
    }
  };

  const isOn = controller.isApplicationOpen;

  return (
    <div className="space-y-6">
      {/* Main Application Controller Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-blue-600">
              Admin Panel → Application Controller
            </span>
            <h2 className="text-xl font-extrabold text-slate-900 mt-0.5">
              Application Controller
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 max-w-2xl leading-relaxed">
              Master switch controlling student access to the MIT Mysore Uniform Registration Portal. All existing registrations, UTRs, and payments remain preserved in both states.
            </p>
          </div>

          {/* Current Status Badge & Toggle Switch */}
          <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <div className="text-[11px] font-bold uppercase text-slate-500">
                Current Status
              </div>
              <div
                className={`text-base font-extrabold flex items-center gap-2 mt-0.5 ${
                  isOn ? 'text-emerald-700' : 'text-red-600'
                }`}
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    isOn ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
                  }`}
                />
                <span>{isOn ? 'Application ON' : 'Application OFF'}</span>
              </div>
            </div>

            {/* Explicit Two-State Toggle Switch */}
            <div className="flex rounded-xl bg-slate-200 p-1 border border-slate-300">
              <button
                type="button"
                disabled={busy}
                onClick={() => handleToggleSwitch(true)}
                className={`px-4 py-2 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                  isOn
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Application ON
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleToggleSwitch(false)}
                className={`px-4 py-2 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                  !isOn
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Application OFF
              </button>
            </div>
          </div>
        </div>

        {banner.text && (
          <div
            className={`p-4 rounded-xl border text-xs font-bold ${
              banner.type === 'error'
                ? 'bg-red-50 border-red-300 text-red-900'
                : 'bg-emerald-50 border-emerald-300 text-emerald-900'
            }`}
          >
            {banner.text}
          </div>
        )}

        {/* Video & Fallback Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Production Video Asset Path / URL (Displayed When Application Is OFF)
            </label>
            <input
              type="text"
              value={videoUrlInput}
              onChange={(e) => setVideoUrlInput(e.target.value)}
              placeholder="/assets/video/application-closed.mp4"
              className="w-full px-3.5 py-2 text-xs font-mono border border-slate-300 rounded-lg"
            />
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <label className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg border border-slate-300 text-[11px] font-bold cursor-pointer transition">
                {uploadingVideo ? 'Uploading Video...' : '⬆ Upload / Replace Video File'}
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  onChange={handleVideoFileUpload}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleToggleSwitch(isOn)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold transition cursor-pointer disabled:opacity-50"
              >
                Save Video & Fallback Settings
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Fallback Message (If Video Fails to Load)
            </label>
            <input
              type="text"
              value={fallbackInput}
              onChange={(e) => setFallbackInput(e.target.value)}
              className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-lg"
            />
            <p className="text-[11px] text-slate-500 mt-1.5">
              Last modified by <strong>{controller.updatedByUsername}</strong> on{' '}
              {controller.updatedAt
                ? new Date(controller.updatedAt).toLocaleString('en-IN')
                : 'Initial Setup'}
            </p>
          </div>
        </div>
      </div>

      {/* Audit History of Application ON/OFF Toggles */}
      {controller.toggleHistory && controller.toggleHistory.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Application Status Change History
            </h3>
          </div>
          <div className="divide-y divide-slate-100 text-xs max-h-48 overflow-y-auto">
            {controller.toggleHistory.map((item, idx) => (
              <div
                key={idx}
                className="px-4 py-2.5 flex items-center justify-between"
              >
                <div>
                  <span className="font-semibold text-slate-700">
                    {item.previousState ? 'Application ON' : 'Application OFF'} →{' '}
                  </span>
                  <strong
                    className={
                      item.newState ? 'text-emerald-700 font-bold' : 'text-red-600 font-bold'
                    }
                  >
                    {item.newState ? 'Application ON' : 'Application OFF'}
                  </strong>
                  <span className="text-slate-500 ml-2">
                    by {item.changedByUsername}
                  </span>
                </div>
                <span className="text-slate-400 font-mono text-[11px]">
                  {new Date(item.changedAt).toLocaleString('en-IN')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


import React, { useState, useEffect, useCallback } from 'react';
import {
  Power,
  Check,
  X,
  Loader2,
  Video,
  Upload,
  Save,
  History,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';

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
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 border-b border-slate-100 pb-6">
          <div className="space-y-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-200/60">
              Admin Panel → Application Controller
            </span>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Application Controller
            </h2>
            <p className="text-xs text-slate-500 max-w-xl leading-relaxed">
              Master switch controlling student access to the MIT Mysore Uniform Registration Portal. All existing registrations, UTRs, and payments remain preserved in both states.
            </p>
          </div>

          {/* Master Control Card */}
          <div className="flex items-center gap-3.5 bg-slate-50 p-2.5 sm:p-3 rounded-2xl border border-slate-200/80 shadow-xs shrink-0">
            {/* Status indicator with beacon */}
            <div className="flex items-center gap-2.5 px-2">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                  isOn
                    ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                }`}
              >
                <Power size={18} className={isOn ? 'text-emerald-600' : 'text-rose-600'} />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Current Status
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 whitespace-nowrap">
                  <span className="relative flex h-2 w-2">
                    {isOn && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    )}
                    <span
                      className={`relative inline-flex rounded-full h-2 w-2 ${
                        isOn ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}
                    />
                  </span>
                  <span
                    className={`text-xs font-extrabold ${
                      isOn ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {isOn ? 'Active (Open)' : 'Inactive (Closed)'}
                  </span>
                </div>
              </div>
            </div>

            <div className="h-8 w-px bg-slate-200 hidden sm:block" />

            {/* Segmented Controller */}
            <div className="inline-flex p-1 bg-slate-200/80 rounded-xl border border-slate-300/60 shadow-inner">
              <button
                type="button"
                disabled={busy}
                onClick={() => handleToggleSwitch(true)}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  isOn
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                } disabled:opacity-50`}
              >
                {busy && isOn ? (
                  <Loader2 size={13} className="animate-spin text-white" />
                ) : (
                  <Check size={13} className={isOn ? 'text-white' : 'text-slate-400'} />
                )}
                <span>Portal ON</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => handleToggleSwitch(false)}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  !isOn
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                } disabled:opacity-50`}
              >
                {busy && !isOn ? (
                  <Loader2 size={13} className="animate-spin text-white" />
                ) : (
                  <X size={13} className={!isOn ? 'text-white' : 'text-slate-400'} />
                )}
                <span>Portal OFF</span>
              </button>
            </div>
          </div>
        </div>

        {banner.text && (
          <div
            className={`p-4 rounded-xl border text-xs font-bold flex items-center gap-2 ${
              banner.type === 'error'
                ? 'bg-red-50 border-red-300 text-red-900'
                : 'bg-emerald-50 border-emerald-300 text-emerald-900'
            }`}
          >
            {banner.type === 'error' ? <AlertCircle size={16} /> : <Check size={16} />}
            <span>{banner.text}</span>
          </div>
        )}

        {/* Video & Fallback Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
          <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-200/70">
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Video size={14} className="text-blue-600" />
              <span>Broadcast Video Path / URL (Displayed When Closed)</span>
            </label>
            <input
              type="text"
              value={videoUrlInput}
              onChange={(e) => setVideoUrlInput(e.target.value)}
              placeholder="/assets/video/application-closed.mp4"
              className="w-full px-3.5 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 rounded-lg border border-slate-300 text-[11px] font-bold cursor-pointer transition flex items-center gap-1.5 shadow-2xs">
                {uploadingVideo ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    <span>Uploading Video...</span>
                  </>
                ) : (
                  <>
                    <Upload size={12} className="text-slate-600" />
                    <span>Upload Video File</span>
                  </>
                )}
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
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-2xs"
              >
                <Save size={12} />
                <span>Save Settings</span>
              </button>
            </div>
          </div>

          <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-200/70 flex flex-col justify-between">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-blue-600" />
                <span>Fallback Message (If Video Fails to Load)</span>
              </label>
              <input
                type="text"
                value={fallbackInput}
                onChange={(e) => setFallbackInput(e.target.value)}
                className="w-full px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-2.5 pt-2 border-t border-slate-200/60 flex items-center gap-1.5">
              <span>Last updated by <strong>{controller.updatedByUsername}</strong></span>
              <span>•</span>
              <span>{controller.updatedAt ? new Date(controller.updatedAt).toLocaleString('en-IN') : 'Initial Setup'}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Audit History of Application ON/OFF Toggles */}
      {controller.toggleHistory && controller.toggleHistory.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center gap-2 bg-slate-50/50">
            <History size={15} className="text-slate-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Application Status Audit Log
            </h3>
          </div>
          <div className="divide-y divide-slate-100 text-xs max-h-48 overflow-y-auto">
            {controller.toggleHistory.map((item, idx) => (
              <div
                key={idx}
                className="px-4 py-2.5 flex items-center justify-between hover:bg-slate-50/60 transition"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-600">
                    {item.previousState ? 'Portal ON' : 'Portal OFF'} →{' '}
                  </span>
                  <strong
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                      item.newState
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70'
                        : 'bg-rose-50 text-rose-700 border border-rose-200/70'
                    }`}
                  >
                    {item.newState ? <Check size={11} /> : <X size={11} />}
                    {item.newState ? 'Portal ON' : 'Portal OFF'}
                  </strong>
                  <span className="text-slate-500 ml-1">
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


import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  AlertCircle,
  GraduationCap,
  BookOpen,
  ArrowRight,
  Clock
} from 'lucide-react';
import { useAuthenticatedSse } from '../../hooks/useAuthenticatedSse';

export interface AdminApplicationControllerProps {
  apiBaseUrl?: string;
  authToken?: string | null;
}

interface AuditLogEntry {
  id: number;
  category: string;
  previousUgOpen: boolean;
  newUgOpen: boolean;
  previousPgOpen: boolean;
  newPgOpen: boolean;
  changedBy: string;
  changedAt: string;
}

interface UgPgControllerState {
  ugApplicationOpen: boolean;
  pgApplicationOpen: boolean;
  ugStatusLabel: string;
  pgStatusLabel: string;
  bothClosed?: boolean;
  bothOpen?: boolean;
  isApplicationOpen?: boolean;
  ugClosedMessage: string;
  pgClosedMessage: string;
  videoUrl: string;
  ugUpdatedBy: string;
  ugUpdatedAt: string | null;
  pgUpdatedBy: string;
  pgUpdatedAt: string | null;
  lastUpdatedBy: string;
  lastUpdatedAt: string | null;
  history: AuditLogEntry[];
}

export default function AdminApplicationController({
  apiBaseUrl = '',
  authToken = typeof localStorage !== 'undefined'
    ? (localStorage.getItem('mit_uniform_admin_token_v1') ||
       localStorage.getItem('mit_admin_token') ||
       localStorage.getItem('adminToken') ||
       localStorage.getItem('token'))
    : null
}: AdminApplicationControllerProps) {
  const [controller, setController] = useState<UgPgControllerState>({
    ugApplicationOpen: true,
    pgApplicationOpen: true,
    ugStatusLabel: 'ON',
    pgStatusLabel: 'ON',
    ugClosedMessage:
      'Undergraduate (B.E. / B.Tech.) uniform registration and new payment submissions are currently closed.',
    pgClosedMessage:
      'Postgraduate (MBA / MCA / M.Tech.) uniform registration and new payment submissions are currently closed.',
    videoUrl: '/assets/video/application-closed.mp4',
    ugUpdatedBy: 'System Initializer',
    ugUpdatedAt: null,
    pgUpdatedBy: 'System Initializer',
    pgUpdatedAt: null,
    lastUpdatedBy: 'System Initializer',
    lastUpdatedAt: null,
    history: []
  });

  const [ugMsgInput, setUgMsgInput] = useState('');
  const [pgMsgInput, setPgMsgInput] = useState('');
  const [videoUrlInput, setVideoUrlInput] = useState('/assets/video/application-closed.mp4');
  const [busyAction, setBusyAction] = useState<string>(''); // 'UG_ON' | 'UG_OFF' | 'PG_ON' | 'PG_OFF' | 'MESSAGES' | 'VIDEO' | ''
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [banner, setBanner] = useState<{ type: string; text: string }>({ type: '', text: '' });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const getEffectiveToken = useCallback(() => {
    if (typeof localStorage === 'undefined') return authToken;
    return (
      localStorage.getItem('mit_uniform_admin_token_v1') ||
      localStorage.getItem('mit_admin_token') ||
      localStorage.getItem('adminToken') ||
      localStorage.getItem('token') ||
      authToken
    );
  }, [authToken]);

  const buildHeaders = useCallback(
    (isJson = true) => {
      const h: Record<string, string> = {};
      if (isJson) h['Content-Type'] = 'application/json';
      const token = getEffectiveToken();
      if (token) h['Authorization'] = `Bearer ${token}`;
      return h;
    },
    [getEffectiveToken]
  );

  const getApiEndpoint = useCallback((path: string) => {
    if (apiBaseUrl) return `${apiBaseUrl}${path}`;
    if (typeof window !== 'undefined' && window.location.port === '5173') {
      return `http://localhost:4000${path}`;
    }
    return path;
  }, [apiBaseUrl]);

  const loadControllerState = useCallback(async () => {
    try {
      const res = await fetch(
        getApiEndpoint(`/api/admin/application-controller?t=${Date.now()}`),
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
        setUgMsgInput(data.controller.ugClosedMessage || '');
        setPgMsgInput(data.controller.pgClosedMessage || '');
        setVideoUrlInput(data.controller.videoUrl || '/assets/video/application-closed.mp4');
      }
    } catch (err) {
      console.error('Failed to load UG/PG Application Controller state:', err);
    }
  }, [getApiEndpoint, buildHeaders]);

  useEffect(() => {
    loadControllerState();
  }, [loadControllerState]);

  useEffect(() => {
    if (banner.text) {
      const timer = setTimeout(() => {
        setBanner({ type: '', text: '' });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [banner.text]);

  // Real-time SSE updates for live multi-admin synchronization
  useAuthenticatedSse({
    streamPath: '/api/sse/admin',
    jwtToken: getEffectiveToken(),
    apiBaseUrl,
    eventHandlers: {
      APPLICATION_STATUS_CHANGED: (data) => {
        if (data && typeof data.ugApplicationOpen === 'boolean') {
          setController((prev) => ({
            ...prev,
            ...data,
            history: data.history || prev.history
          }));
        } else {
          loadControllerState();
        }
      },
      GLOBAL_SYNC_UPDATE: loadControllerState
    }
  });

  const handleUpdateCategoryStatus = async (
    updates: Partial<UgPgControllerState>,
    actionTag: 'UG_ON' | 'UG_OFF' | 'PG_ON' | 'PG_OFF' | 'MESSAGES' | 'VIDEO' | ''
  ) => {
    setBanner({ type: '', text: '' });
    const previousState = { ...controller };

    // 1. INSTANT OPTIMISTIC UI UPDATE (< 1ms)
    setController((prev) => {
      const nextUg = typeof updates.ugApplicationOpen === 'boolean' ? updates.ugApplicationOpen : prev.ugApplicationOpen;
      const nextPg = typeof updates.pgApplicationOpen === 'boolean' ? updates.pgApplicationOpen : prev.pgApplicationOpen;
      return {
        ...prev,
        ...updates,
        ugApplicationOpen: nextUg,
        pgApplicationOpen: nextPg,
        ugStatusLabel: nextUg ? 'ON' : 'OFF',
        pgStatusLabel: nextPg ? 'ON' : 'OFF',
        bothClosed: !nextUg && !nextPg,
        bothOpen: nextUg && nextPg,
        isApplicationOpen: nextUg || nextPg,
        lastUpdatedAt: new Date().toISOString()
      };
    });

    setBusyAction(actionTag);

    // Auto-clear busy action after at most 800ms so the button is NEVER stuck spinning
    const autoClearBusyTimer = setTimeout(() => {
      setBusyAction('');
    }, 800);

    const abortCtrl = new AbortController();
    const timeoutTimer = setTimeout(() => abortCtrl.abort(), 6000);

    try {
      const res = await fetch(
        getApiEndpoint('/api/admin/application-controller/status'),
        {
          method: 'PATCH',
          credentials: 'include',
          headers: buildHeaders(true),
          body: JSON.stringify(updates),
          signal: abortCtrl.signal
        }
      );
      clearTimeout(timeoutTimer);
      clearTimeout(autoClearBusyTimer);

      const data = await res.json();
      if (!res.ok || !data.success) {
        setController(previousState);
        setBanner({
          type: 'error',
          text: data.message || 'Failed to update application status.'
        });
        return;
      }

      setController(data.controller);
      setUgMsgInput(data.controller.ugClosedMessage || '');
      setPgMsgInput(data.controller.pgClosedMessage || '');
      setBanner({ type: 'success', text: data.message });
    } catch (err: any) {
      clearTimeout(timeoutTimer);
      clearTimeout(autoClearBusyTimer);
      setController(previousState);
      const isAbort = err?.name === 'AbortError';
      setBanner({
        type: 'error',
        text: isAbort
          ? 'Network request timed out. Please check server connectivity.'
          : (err?.message || 'Network error while updating application status.')
      });
    } finally {
      setBusyAction('');
    }
  };

  const handleToggleUg = (requestedState?: boolean) => {
    let nextState: boolean;
    if (typeof requestedState === 'boolean') {
      if (requestedState === controller.ugApplicationOpen) {
        // Clicking the currently active button toggles it!
        nextState = !controller.ugApplicationOpen;
      } else {
        nextState = requestedState;
      }
    } else {
      nextState = !controller.ugApplicationOpen;
    }

    const actionTag = nextState ? 'UG_ON' : 'UG_OFF';
    handleUpdateCategoryStatus({ ugApplicationOpen: nextState }, actionTag);
  };

  const handleTogglePg = (requestedState?: boolean) => {
    let nextState: boolean;
    if (typeof requestedState === 'boolean') {
      if (requestedState === controller.pgApplicationOpen) {
        // Clicking the currently active button toggles it!
        nextState = !controller.pgApplicationOpen;
      } else {
        nextState = requestedState;
      }
    } else {
      nextState = !controller.pgApplicationOpen;
    }

    const actionTag = nextState ? 'PG_ON' : 'PG_OFF';
    handleUpdateCategoryStatus({ pgApplicationOpen: nextState }, actionTag);
  };

  const handleUploadVideoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBanner({ type: '', text: '' });
    setUploadingVideo(true);

    try {
      const formData = new FormData();
      formData.append('videoFile', file);

      const headers = buildHeaders(false);
      const res = await fetch(
        getApiEndpoint('/api/admin/application-controller/upload-video'),
        {
          method: 'POST',
          credentials: 'include',
          headers,
          body: formData
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        setBanner({
          type: 'error',
          text: data.message || 'Failed to upload video file.'
        });
        return;
      }

      if (data.controller) {
        setController(data.controller);
      }
      setVideoUrlInput(data.videoUrl);
      setBanner({
        type: 'success',
        text: 'New closed screen notice video uploaded and activated successfully.'
      });
    } catch (err: any) {
      setBanner({
        type: 'error',
        text: err?.message || 'Error uploading video file.'
      });
    } finally {
      setUploadingVideo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const { ugApplicationOpen, pgApplicationOpen } = controller;

  const getCombinationSummary = () => {
    if (ugApplicationOpen && pgApplicationOpen) {
      return {
        badge: 'bg-emerald-50 text-emerald-900 border-emerald-300',
        pillUg: 'bg-emerald-600 text-white',
        pillPg: 'bg-emerald-600 text-white',
        title: 'UG ON + PG ON = Both Applications Open',
        desc: 'All eligible Undergraduate (B.E./B.Tech.) and Postgraduate (MBA/MCA/M.Tech.) students can register and submit payments.'
      };
    }
    if (ugApplicationOpen && !pgApplicationOpen) {
      return {
        badge: 'bg-blue-50 text-blue-900 border-blue-300',
        pillUg: 'bg-emerald-600 text-white',
        pillPg: 'bg-red-600 text-white',
        title: 'UG ON + PG OFF = Only UG Applications Open',
        desc: 'Undergraduate students can register and pay. Postgraduate (MBA/MCA) new registrations and payments are closed.'
      };
    }
    if (!ugApplicationOpen && pgApplicationOpen) {
      return {
        badge: 'bg-indigo-50 text-indigo-900 border-indigo-300',
        pillUg: 'bg-red-600 text-white',
        pillPg: 'bg-emerald-600 text-white',
        title: 'UG OFF + PG ON = Only PG Applications Open',
        desc: 'Postgraduate (MBA/MCA) students can register and pay. Undergraduate (B.E.) new registrations and payments are closed.'
      };
    }
    return {
      badge: 'bg-rose-50 text-rose-900 border-rose-300',
      pillUg: 'bg-red-600 text-white',
      pillPg: 'bg-red-600 text-white',
      title: 'UG OFF + PG OFF = Both Applications Closed',
      desc: 'New registrations and payments are completely closed. Existing registered students can still check their payment status.'
    };
  };

  const combo = getCombinationSummary();

  return (
    <div className="space-y-6">
      {/* Top Header & Active Combination Matrix Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-200">
                ADMIN PANEL → APPLICATION CONTROLLER
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                <ShieldCheck size={13} className="text-emerald-600" />
                Zero-Data-Loss Architecture
              </span>
              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                v2.5 · Instant Switch
              </span>
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Independent UG & PG Application Controller
            </h2>
            <p className="text-xs text-slate-500 max-w-3xl leading-relaxed">
              Control Undergraduate (UG) and Postgraduate (PG) student portal availability independently. Existing student registrations, UTRs, and payment records remain 100% preserved and accessible in both states.
            </p>
          </div>

          <div className="text-xs bg-slate-50/90 px-4 py-3 rounded-xl border border-slate-200/80 shrink-0 shadow-xs">
            <span className="text-slate-500 font-medium block">Last Modified</span>
            <strong className="text-slate-900 block font-bold mt-0.5">
              {controller.lastUpdatedAt
                ? new Date(controller.lastUpdatedAt).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  })
                : 'Initial Setup'}
            </strong>
            <span className="text-slate-500 block text-[11px] mt-0.5">
              by <strong className="text-slate-700">{controller.lastUpdatedBy}</strong>
            </span>
          </div>
        </div>

        {/* Live Combination State Banner */}
        <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${combo.badge} transition-all`}>
          <div className="space-y-0.5">
            <div className="font-black text-sm flex items-center gap-2">
              <span>{combo.title}</span>
            </div>
            <div className="text-xs font-medium opacity-90">{combo.desc}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`px-3 py-1 rounded-full text-xs font-black shadow-xs ${combo.pillUg}`}>
              UG: {ugApplicationOpen ? 'ON' : 'OFF'}
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-black shadow-xs ${combo.pillPg}`}>
              PG: {pgApplicationOpen ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>

        {banner.text && (
          <div
            className={`p-4 rounded-xl border text-xs font-bold flex items-center justify-between gap-3 ${
              banner.type === 'error'
                ? 'bg-rose-50 border-rose-300 text-rose-900'
                : 'bg-emerald-50 border-emerald-300 text-emerald-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {banner.type === 'error' ? (
                <AlertCircle size={16} className="shrink-0 text-rose-600" />
              ) : (
                <Check size={16} className="shrink-0 text-emerald-600" />
              )}
              <span>{banner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setBanner({ type: '', text: '' })}
              className="text-slate-500 hover:text-slate-900 text-xs font-bold px-2 py-0.5"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* TWO INDEPENDENT CONTROL CARDS: 1. UG APPLICATION | 2. PG APPLICATION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* CARD 1: UG APPLICATION CONTROL */}
        <div
          className={`bg-white rounded-2xl border-2 shadow-sm p-6 flex flex-col justify-between space-y-5 transition-all ${
            ugApplicationOpen ? 'border-emerald-500/80 ring-1 ring-emerald-500/20' : 'border-rose-400 ring-1 ring-rose-400/20'
          }`}
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-200">
                  <GraduationCap size={13} className="text-blue-600" />
                  Undergraduate (B.E. / B.Tech.)
                </span>
                <h3 className="text-xl font-black text-slate-900 mt-1 tracking-tight">
                  UG Application
                </h3>
              </div>

              <button
                type="button"
                onClick={() => handleToggleUg(!ugApplicationOpen)}
                title="Click to toggle UG Application status"
                className={`px-3 py-1 rounded-full text-xs font-black border shadow-xs cursor-pointer transition-transform hover:scale-105 ${
                  ugApplicationOpen
                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200'
                    : 'bg-rose-100 text-rose-900 border-rose-300 hover:bg-rose-200'
                }`}
              >
                Status: {ugApplicationOpen ? 'ON (Open)' : 'OFF (Closed)'}
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed font-normal">
              Controls uniform registration and payment submission for all 11 Undergraduate departments:
            </p>

            <div className="flex flex-wrap gap-1.5">
              {['CS', 'CA', 'CI', 'CE', 'CD', 'IC', 'IS', 'EC', 'ME', 'CV', 'CB'].map((code) => (
                <span
                  key={code}
                  className="px-2 py-0.5 text-[10px] font-extrabold rounded-md bg-slate-100 text-slate-700 border border-slate-200"
                >
                  {code}
                </span>
              ))}
            </div>

            {/* Independent UG ON / OFF Toggle Buttons */}
            <div className="space-y-1.5">
              <div className="bg-slate-100/90 p-1.5 rounded-xl border border-slate-200 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleUg(true)}
                  className={`py-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 ${
                    ugApplicationOpen
                      ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-500/40'
                      : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {busyAction === 'UG_ON' ? (
                    <Loader2 size={14} className="animate-spin text-white" />
                  ) : (
                    <Power size={14} />
                  )}
                  <span>UG Application: ON</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleUg(false)}
                  className={`py-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 ${
                    !ugApplicationOpen
                      ? 'bg-rose-600 text-white shadow-md ring-2 ring-rose-500/40'
                      : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {busyAction === 'UG_OFF' ? (
                    <Loader2 size={14} className="animate-spin text-white" />
                  ) : (
                    <Power size={14} />
                  )}
                  <span>UG Application: OFF</span>
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px] font-semibold px-1">
                <span className={`flex items-center gap-1.5 ${ugApplicationOpen ? 'text-emerald-700' : 'text-rose-600'}`}>
                  <span className={`w-2 h-2 rounded-full ${ugApplicationOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                  {ugApplicationOpen
                    ? 'UG registrations and payments active'
                    : 'UG registration closed'}
                </span>
                {busyAction === 'UG_ON' || busyAction === 'UG_OFF' ? (
                  <span className="text-blue-600 font-bold animate-pulse text-[10px]">Instant Saved</span>
                ) : null}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                UG Closed Notice Message
              </label>
              <textarea
                rows={3}
                value={ugMsgInput}
                onChange={(e) => setUgMsgInput(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="Undergraduate (B.E. / B.Tech.) uniform registration is currently closed."
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span>
              Changed by: <strong className="text-slate-800 font-bold">{controller.ugUpdatedBy}</strong>
            </span>
            <span>
              {controller.ugUpdatedAt
                ? new Date(controller.ugUpdatedAt).toLocaleString('en-IN', {
                    dateStyle: 'short',
                    timeStyle: 'short'
                  })
                : '—'}
            </span>
          </div>
        </div>

        {/* CARD 2: PG APPLICATION CONTROL */}
        <div
          className={`bg-white rounded-2xl border-2 shadow-sm p-6 flex flex-col justify-between space-y-5 transition-all ${
            pgApplicationOpen ? 'border-emerald-500/80 ring-1 ring-emerald-500/20' : 'border-rose-400 ring-1 ring-rose-400/20'
          }`}
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-md border border-purple-200">
                  <BookOpen size={13} className="text-purple-600" />
                  Postgraduate (MBA / MCA / M.Tech.)
                </span>
                <h3 className="text-xl font-black text-slate-900 mt-1 tracking-tight">
                  PG Application
                </h3>
              </div>

              <button
                type="button"
                onClick={() => handleTogglePg(!pgApplicationOpen)}
                title="Click to toggle PG Application status"
                className={`px-3 py-1 rounded-full text-xs font-black border shadow-xs cursor-pointer transition-transform hover:scale-105 ${
                  pgApplicationOpen
                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200'
                    : 'bg-rose-100 text-rose-900 border-rose-300 hover:bg-rose-200'
                }`}
              >
                Status: {pgApplicationOpen ? 'ON (Open)' : 'OFF (Closed)'}
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed font-normal">
              Controls uniform registration and payment submission for all Postgraduate programs:
            </p>

            <div className="flex flex-wrap gap-1.5">
              {['MBA (BA)', 'MCA (MC)', 'M.Tech.'].map((code) => (
                <span
                  key={code}
                  className="px-2 py-0.5 text-[10px] font-extrabold rounded-md bg-purple-50 text-purple-800 border border-purple-200"
                >
                  {code}
                </span>
              ))}
            </div>

            {/* Independent PG ON / OFF Toggle Buttons */}
            <div className="space-y-1.5">
              <div className="bg-slate-100/90 p-1.5 rounded-xl border border-slate-200 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleTogglePg(true)}
                  className={`py-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 ${
                    pgApplicationOpen
                      ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-500/40'
                      : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {busyAction === 'PG_ON' ? (
                    <Loader2 size={14} className="animate-spin text-white" />
                  ) : (
                    <Power size={14} />
                  )}
                  <span>PG Application: ON</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTogglePg(false)}
                  className={`py-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 ${
                    !pgApplicationOpen
                      ? 'bg-rose-600 text-white shadow-md ring-2 ring-rose-500/40'
                      : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {busyAction === 'PG_OFF' ? (
                    <Loader2 size={14} className="animate-spin text-white" />
                  ) : (
                    <Power size={14} />
                  )}
                  <span>PG Application: OFF</span>
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px] font-semibold px-1">
                <span className={`flex items-center gap-1.5 ${pgApplicationOpen ? 'text-emerald-700' : 'text-rose-600'}`}>
                  <span className={`w-2 h-2 rounded-full ${pgApplicationOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                  {pgApplicationOpen
                    ? 'PG registrations and payments active'
                    : 'PG registration closed'}
                </span>
                {busyAction === 'PG_ON' || busyAction === 'PG_OFF' ? (
                  <span className="text-purple-600 font-bold animate-pulse text-[10px]">Instant Saved</span>
                ) : null}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                PG Closed Notice Message
              </label>
              <textarea
                rows={3}
                value={pgMsgInput}
                onChange={(e) => setPgMsgInput(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none"
                placeholder="Postgraduate (MBA / MCA / M.Tech.) uniform registration is currently closed."
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span>
              Changed by: <strong className="text-slate-800 font-bold">{controller.pgUpdatedBy}</strong>
            </span>
            <span>
              {controller.pgUpdatedAt
                ? new Date(controller.pgUpdatedAt).toLocaleString('en-IN', {
                    dateStyle: 'short',
                    timeStyle: 'short'
                  })
                : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Save Custom Notice Messages Button & Video Configuration */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h4 className="text-sm font-extrabold text-slate-900">
              Notice Messages & Closed-Screen Media Configuration
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Update the prompt texts shown to students when UG or PG is closed, or configure the looping notice video.
            </p>
          </div>

          <button
            type="button"
            disabled={busyAction === 'MESSAGES'}
            onClick={() =>
              handleUpdateCategoryStatus(
                {
                  ugClosedMessage: ugMsgInput,
                  pgClosedMessage: pgMsgInput,
                  videoUrl: videoUrlInput
                },
                'MESSAGES'
              )
            }
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            {busyAction === 'MESSAGES' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            <span>Save Closed Notice Messages</span>
          </button>
        </div>

        {/* Video Notice Section */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
          <div className="flex items-center gap-2">
            <Video size={16} className="text-slate-700" />
            <span className="text-xs font-extrabold text-slate-800">
              Closed Screen Video URL or MP4 File Upload
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <input
                type="text"
                value={videoUrlInput}
                onChange={(e) => setVideoUrlInput(e.target.value)}
                placeholder="/assets/video/application-closed.mp4"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Current active video: <strong className="font-mono">{controller.videoUrl}</strong>
              </span>
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/ogg,video/quicktime"
                onChange={handleUploadVideoFile}
                className="hidden"
                id="mit-video-file-input"
              />
              <button
                type="button"
                disabled={uploadingVideo}
                onClick={() => fileInputRef.current?.click()}
                className="w-full px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {uploadingVideo ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Upload size={14} />
                )}
                <span>{uploadingVideo ? 'Uploading...' : 'Upload Video File'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Audit History Table */}
      {controller.history && controller.history.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
          <div className="p-4 sm:px-6 border-b border-slate-200 flex items-center gap-2 bg-slate-50/70">
            <History size={16} className="text-slate-700" />
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
              UG & PG Application Status Change History
            </h4>
          </div>
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 uppercase font-black border-b border-slate-200 text-[11px]">
                  <th className="p-3.5">Category Modified</th>
                  <th className="p-3.5">UG Status Change</th>
                  <th className="p-3.5">PG Status Change</th>
                  <th className="p-3.5">Changed By Admin</th>
                  <th className="p-3.5">Date & Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {controller.history.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3.5 font-black text-blue-700">
                      <span className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200">
                        {h.category}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span className="text-slate-500">{h.previousUgOpen ? 'ON' : 'OFF'}</span>{' '}
                      <ArrowRight size={12} className="inline text-slate-400 mx-1" />{' '}
                      <strong
                        className={`font-black ${
                          h.newUgOpen ? 'text-emerald-700' : 'text-rose-600'
                        }`}
                      >
                        {h.newUgOpen ? 'ON' : 'OFF'}
                      </strong>
                    </td>
                    <td className="p-3.5">
                      <span className="text-slate-500">{h.previousPgOpen ? 'ON' : 'OFF'}</span>{' '}
                      <ArrowRight size={12} className="inline text-slate-400 mx-1" />{' '}
                      <strong
                        className={`font-black ${
                          h.newPgOpen ? 'text-emerald-700' : 'text-rose-600'
                        }`}
                      >
                        {h.newPgOpen ? 'ON' : 'OFF'}
                      </strong>
                    </td>
                    <td className="p-3.5 font-bold text-slate-800">{h.changedBy}</td>
                    <td className="p-3.5 font-mono text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock size={12} className="text-slate-400" />
                        {new Date(h.changedAt).toLocaleString('en-IN', {
                          dateStyle: 'medium',
                          timeStyle: 'short'
                        })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

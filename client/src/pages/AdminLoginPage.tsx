import React, { useState } from 'react';

interface AdminLoginPageProps {
  apiBaseUrl?: string;
  onLoginSuccess?: (admin: any) => void;
}

export default function AdminLoginPage({ apiBaseUrl = '', onLoginSuccess }: AdminLoginPageProps) {
  const [view, setView] = useState<'LOGIN' | 'RECOVERY'>('LOGIN');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Account Recovery State
  const [recoveryKey, setRecoveryKey] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    try {
      setSubmitting(true);
      const res = await fetch(`${apiBaseUrl}/api/admin/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          rememberMe
        })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'Invalid username or password.');
        return;
      }

      setPassword('');
      if (data.token) {
        try { localStorage.setItem('mit_admin_token', data.token); } catch (_) {}
      }
      onLoginSuccess?.(data.admin);
    } catch (err: any) {
      setErrorMsg('Unable to reach server. Please check your connection.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (newPassword !== confirmNewPassword) {
      setErrorMsg('New password and confirmation password do not match.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`${apiBaseUrl}/api/admin/auth/recover`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: (newUsername.trim() || username.trim()),
          recoveryKey: recoveryKey.trim(),
          newPassword
        })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'Account recovery failed.');
        return;
      }

      setSuccessMsg(data.message);
      setRecoveryKey('');
      setNewPassword('');
      setConfirmNewPassword('');
      setView('LOGIN');
    } catch (err: any) {
      setErrorMsg('Network error during account recovery.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200">
        <div className="bg-slate-800 text-white px-6 py-6 border-b border-slate-700">
          <span className="text-[11px] font-extrabold uppercase tracking-widest text-blue-400 block">
            MIT Mysore Uniform Management System
          </span>
          <h1 className="text-xl font-bold mt-1 text-white">Administrator Secure Sign-In</h1>
          <p className="text-xs text-slate-300 mt-1">
            Protected Institution Console • Strict Brute-Force & Session Auditing
          </p>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-5 p-3.5 bg-red-50 border border-red-300 text-red-800 rounded-xl text-xs font-semibold flex items-start gap-2">
            <span className="text-base leading-none">⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mx-6 mt-5 p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-semibold flex items-start gap-2">
            <span className="text-base leading-none">✓</span>
            <span>{successMsg}</span>
          </div>
        )}

        {view === 'LOGIN' ? (
          <form onSubmit={handleLogin} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Admin Username / ID *
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter admin username (e.g. MIT)"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Password *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter administrator password"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none pr-10"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-xs text-slate-500 hover:text-slate-800 font-semibold"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                Remember Me (14 Days)
              </label>

              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setSuccessMsg('');
                  setView('RECOVERY');
                }}
                className="text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer"
              >
                Forgot Password?
              </button>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-lg shadow-sm transition disabled:opacity-50 cursor-pointer mt-2"
            >
              {submitting ? 'Verifying Identity...' : 'Sign In to Admin Console'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRecovery} className="p-6 space-y-4">
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-xs text-amber-900 leading-relaxed">
              <strong>Emergency Account Recovery:</strong> Enter your Owner Master Recovery Key or
              Offline Generated Backup Key to reset administrator credentials.
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Admin Username to Recover *
              </label>
              <input
                type="text"
                required
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Enter administrator username (e.g. MIT)"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Owner Recovery Key / Backup Key *
              </label>
              <input
                type="password"
                required
                value={recoveryKey}
                onChange={(e) => setRecoveryKey(e.target.value)}
                placeholder="Enter Master Recovery Key or MIT-RECOVERY-..."
                className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                New Password *
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 6 chars, uppercase, number, symbol"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-2.5 text-xs text-slate-500 hover:text-slate-800 font-semibold"
                >
                  {showNewPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Confirm New Password *
              </label>
              <input
                type="password"
                required
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Re-type new password"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setSuccessMsg('');
                  setView('LOGIN');
                }}
                className="w-1/3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition cursor-pointer"
              >
                Back to Sign In
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="w-2/3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm transition disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Recovering Account...' : 'Reset Password & Sign In'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}


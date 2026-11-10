import React, { useState, useEffect } from 'react';

export default function AdminAccountSettings({
  adminProfile,
  apiBaseUrl = '',
  onProfileUpdated,
  onLogout
}) {
  const [newUsername, setNewUsername] = useState(adminProfile?.username || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [backupRecoveryKey, setBackupRecoveryKey] = useState('');

  useEffect(() => {
    if (adminProfile?.username) {
      setNewUsername(adminProfile.username);
    }
  }, [adminProfile?.username]);

  const handleUpdateCredentials = async (e) => {
    e.preventDefault();
    setNotice({ type: '', text: '' });

    if (!currentPassword) {
      setNotice({
        type: 'error',
        text: 'Please enter your current password before saving changes.'
      });
      return;
    }

    if (newPassword && newPassword !== confirmNewPassword) {
      setNotice({
        type: 'error',
        text: 'New password and confirmation password do not match.'
      });
      return;
    }

    try {
      setBusy(true);
      const res = await fetch(`${apiBaseUrl}/api/admin/auth/credentials`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newUsername: newUsername.trim(),
          newPassword: newPassword || undefined,
          confirmNewPassword: confirmNewPassword || undefined
        })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setNotice({ type: 'error', text: data.message || 'Failed to update credentials.' });
        return;
      }

      setNotice({ type: 'success', text: data.message });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      onProfileUpdated?.(data.admin);
    } catch (err) {
      setNotice({ type: 'error', text: 'Network error while saving changes.' });
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateRecoveryKey = async () => {
    if (!currentPassword) {
      setNotice({
        type: 'error',
        text: 'Please enter your current password below to generate a backup recovery key.'
      });
      return;
    }

    try {
      setBusy(true);
      const res = await fetch(`${apiBaseUrl}/api/admin/auth/generate-recovery-key`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotice({ type: 'error', text: data.message });
        return;
      }
      setBackupRecoveryKey(data.recoveryKey);
      setNotice({ type: 'success', text: data.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
              Admin Panel → Settings → Admin Account Settings
            </span>
            <h2 className="text-lg font-bold text-slate-900 mt-0.5">
              Admin Username & Password Management
            </h2>
          </div>

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-sm"
            >
              Logout
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 text-xs">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block">Current Username</span>
            <strong className="text-base font-extrabold text-blue-700 font-mono">
              {adminProfile?.username}
            </strong>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block">Admin ID & Status</span>
            <strong className="text-slate-900 block">
              {adminProfile?.adminId} ({adminProfile?.accountStatus || 'ACTIVE'})
            </strong>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block">Last Password Update</span>
            <strong className="text-slate-900 block">
              {adminProfile?.lastPasswordUpdateDate
                ? new Date(adminProfile.lastPasswordUpdateDate).toLocaleString('en-IN')
                : '—'}
            </strong>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block">Last Successful Login</span>
            <strong className="text-slate-900 block">
              {adminProfile?.lastSuccessfulLogin
                ? new Date(adminProfile.lastSuccessfulLogin).toLocaleString('en-IN')
                : 'Active'}
            </strong>
          </div>
        </div>
      </div>

      {notice.text && (
        <div
          className={`p-4 rounded-xl border text-xs font-bold ${
            notice.type === 'error'
              ? 'bg-red-50 border-red-300 text-red-900'
              : 'bg-emerald-50 border-emerald-300 text-emerald-900'
          }`}
        >
          {notice.text}
        </div>
      )}

      <form
        onSubmit={handleUpdateCredentials}
        className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-bold text-slate-900 text-sm">
            Update Administrator Credentials
          </h3>
          <button
            type="button"
            onClick={() => setShowPasswords((prev) => !prev)}
            className="text-xs font-bold text-blue-600 hover:underline"
          >
            {showPasswords ? 'Hide Passwords' : 'Show Passwords'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Username *
            </label>
            <input
              type="text"
              required
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              New Password (leave blank to keep current password)
            </label>
            <input
              type={showPasswords ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 6 chars (Uppercase, Number, Special char)"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Confirm New Password
            </label>
            <input
              type={showPasswords ? 'text' : 'password'}
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              placeholder="Confirm new password"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="md:col-span-2 pt-2 border-t border-slate-100">
            <label className="block text-xs font-bold text-slate-900 mb-1">
              Current Password (Required to Authorize Changes) *
            </label>
            <input
              type={showPasswords ? 'text' : 'password'}
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className="w-full px-3.5 py-2.5 text-sm border-2 border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={handleGenerateRecoveryKey}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg border border-slate-300"
          >
            Generate New Backup Recovery Key
          </button>

          <button
            type="submit"
            disabled={busy}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm"
          >
            {busy ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {backupRecoveryKey && (
          <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 space-y-1">
            <div className="font-bold">
              New Backup Recovery Key (Save Offline Now — Displayed Only Once):
            </div>
            <div className="font-mono text-base font-extrabold text-blue-900 select-all">
              {backupRecoveryKey}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}


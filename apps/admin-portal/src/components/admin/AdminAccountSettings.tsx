import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface AdminAccountSettingsProps {
  adminProfile?: {
    adminId?: string;
    username?: string;
    role?: string;
    accountCreationDate?: string;
    lastPasswordUpdateDate?: string;
    lastSuccessfulLogin?: string;
  };
  apiBaseUrl?: string;
  onProfileUpdated?: (admin: any) => void;
  onLogout?: () => void;
}

interface AdminAccountItem {
  id: string;
  admin_id: string;
  username: string;
  role: string;
  account_status: string;
  last_successful_login: string | null;
  last_login_ip: string;
  last_password_update_date: string;
  account_creation_date: string;
}

export default function AdminAccountSettings({
  adminProfile,
  apiBaseUrl = '',
  onProfileUpdated,
  onLogout
}: AdminAccountSettingsProps) {
  // My Credentials State
  const [newUsername, setNewUsername] = useState(adminProfile?.username || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  // Create New Admin Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createUsername, setCreateUsername] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createConfirmPassword, setCreateConfirmPassword] = useState('');
  const [createRole, setCreateRole] = useState<'COLLEGE_ADMIN' | 'SUPER_ADMIN'>('COLLEGE_ADMIN');
  const [showModalPassword, setShowModalPassword] = useState(false);
  const [modalError, setModalError] = useState('');
  const [modalSuccess, setModalSuccess] = useState('');
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  // Accounts List State
  const [accounts, setAccounts] = useState<AdminAccountItem[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: string; text: string }>({ type: '', text: '' });
  const [backupRecoveryKey, setBackupRecoveryKey] = useState('');

  // Password rules validation helpers
  const passMinLength = createPassword.length >= 6;
  const passHasUpper = /[A-Z]/.test(createPassword);
  const passHasNumber = /[0-9]/.test(createPassword);
  const passHasSymbol = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(createPassword);
  const passAllValid = passMinLength && passHasUpper && passHasNumber && passHasSymbol;
  const passMatches = Boolean(createPassword && createConfirmPassword && createPassword === createConfirmPassword);

  const getAuthHeaders = (contentTypeJson = false) => {
    const headers: Record<string, string> = {};
    if (contentTypeJson) {
      headers['Content-Type'] = 'application/json';
    }
    const token = typeof localStorage !== 'undefined'
      ? (localStorage.getItem('mit_admin_token') || localStorage.getItem('adminToken') || localStorage.getItem('token'))
      : null;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const handleGenerateSuggestedPassword = () => {
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    const suggested = `MitAdmin@${randomDigits}`;
    setCreatePassword(suggested);
    setCreateConfirmPassword(suggested);
    setShowModalPassword(true);
    setModalError('');
  };

  useEffect(() => {
    if (adminProfile?.username) {
      setNewUsername(adminProfile.username);
    }
  }, [adminProfile?.username]);

  // Fetch list of all administrator accounts
  const fetchAccounts = useCallback(async () => {
    try {
      setLoadingAccounts(true);
      const res = await fetch(`${apiBaseUrl}/api/admin/auth/accounts`, {
        credentials: 'include',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.accounts)) {
        setAccounts(data.accounts);
      }
    } catch (_) {}
    finally {
      setLoadingAccounts(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Save changes to current logged in admin credentials
  const handleUpdateCredentials = async (e: React.FormEvent) => {
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
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          currentPassword,
          newUsername: newUsername.trim(),
          newPassword: newPassword || undefined
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
      fetchAccounts();
    } catch (err: any) {
      setNotice({ type: 'error', text: 'Network error while saving changes.' });
    } finally {
      setBusy(false);
    }
  };

  // Open modal reset helper
  const handleOpenCreateModal = () => {
    setModalError('');
    setModalSuccess('');
    setCreateUsername('');
    setCreatePassword('');
    setCreateConfirmPassword('');
    setCreateRole('COLLEGE_ADMIN');
    setShowModalPassword(false);
    setShowCreateModal(true);
  };

  // Create a brand new administrator account
  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    setModalSuccess('');

    const cleanUsername = createUsername.trim();
    if (!cleanUsername) {
      setModalError('Please enter an administrator username.');
      return;
    }

    if (cleanUsername.length < 3 || cleanUsername.length > 50) {
      setModalError('Username must be between 3 and 50 characters.');
      return;
    }

    if (!createPassword) {
      setModalError('Please enter an initial password.');
      return;
    }

    if (!passMinLength) {
      setModalError('Password must be at least 6 characters long.');
      return;
    }

    if (!passHasUpper) {
      setModalError('Password must contain at least one uppercase letter (A-Z).');
      return;
    }

    if (!passHasNumber) {
      setModalError('Password must contain at least one number (0-9).');
      return;
    }

    if (!passHasSymbol) {
      setModalError('Password must contain at least one special character (@, #, $, !, etc.).');
      return;
    }

    if (createPassword !== createConfirmPassword) {
      setModalError('Initial password and confirmation password do not match.');
      return;
    }

    try {
      setCreatingAdmin(true);
      const res = await fetch(`${apiBaseUrl}/api/admin/auth/create-account`, {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          username: cleanUsername,
          password: createPassword,
          role: createRole
        })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setModalError(data.message || 'Failed to create admin account.');
        return;
      }

      setModalSuccess(data.message || `Administrator account '${cleanUsername}' created successfully!`);
      
      // Instantly refresh the accounts list
      await fetchAccounts();

      // Gracefully close modal after confirmation
      setTimeout(() => {
        setShowCreateModal(false);
        setCreateUsername('');
        setCreatePassword('');
        setCreateConfirmPassword('');
        setModalError('');
        setModalSuccess('');
        setNotice({
          type: 'success',
          text: `Administrator '${cleanUsername}' (${data.account?.adminId || 'Enrolled'}) successfully created.`
        });
      }, 1100);
    } catch (err: any) {
      setModalError('Network error while creating account. Please check server connection.');
    } finally {
      setCreatingAdmin(false);
    }
  };

  // Toggle status of a secondary admin
  const handleToggleStatus = async (account: AdminAccountItem) => {
    const nextStatus = account.account_status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/auth/accounts/${encodeURIComponent(account.admin_id)}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json();
      if (data.success) {
        setNotice({ type: 'success', text: data.message });
        fetchAccounts();
      } else {
        setNotice({ type: 'error', text: data.message });
      }
    } catch (_) {}
  };

  // Delete secondary admin
  const handleDeleteAccount = async (account: AdminAccountItem) => {
    if (!window.confirm(`Are you sure you want to delete administrator account '${account.username}' (${account.admin_id})?`)) {
      return;
    }
    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/auth/accounts/${encodeURIComponent(account.admin_id)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setNotice({ type: 'success', text: data.message });
        fetchAccounts();
      } else {
        setNotice({ type: 'error', text: data.message });
      }
    } catch (_) {}
  };

  // Generate offline emergency recovery key
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
        headers: getAuthHeaders(true),
        body: JSON.stringify({ currentPassword })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotice({ type: 'error', text: data.message });
        return;
      }
      setBackupRecoveryKey(data.recoveryKey);
      setNotice({ type: 'success', text: data.message });
    } catch (err: any) {
      setNotice({ type: 'error', text: 'Failed to generate backup recovery key.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-8 max-w-5xl">
      {/* Header */}
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Administrator Security & Accounts Management</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage your credentials, add new administrators, and review institution access logs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer transition"
          >
            <span>➕</span> Create New Admin Login
          </button>
          <span className="px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-bold rounded-full">
            {adminProfile?.role || 'SUPER_ADMIN'}
          </span>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="px-3 py-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-bold rounded-lg cursor-pointer transition"
            >
              Sign Out
            </button>
          )}
        </div>
      </div>

      {/* Global Notification Banner */}
      {notice.text && (
        <div
          className={`p-3.5 rounded-lg text-xs font-semibold flex items-start gap-2 ${
            notice.type === 'error'
              ? 'bg-red-50 border border-red-300 text-red-800'
              : 'bg-emerald-50 border border-emerald-300 text-emerald-800'
          }`}
        >
          <span>{notice.type === 'error' ? '⚠️' : '✓'}</span>
          <span>{notice.text}</span>
        </div>
      )}

      {/* ── SECTION 1: All Administrator Accounts ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
              Active Administrator Accounts ({accounts.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Authorized personnel who can sign in to the MIT Mysore Uniform Administration Panel.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchAccounts}
            disabled={loadingAccounts}
            className="text-xs text-blue-600 hover:text-blue-800 font-bold cursor-pointer disabled:opacity-50"
          >
            {loadingAccounts ? 'Loading...' : '↻ Refresh Accounts'}
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[11px]">
                <th className="p-3">Admin ID</th>
                <th className="p-3">Username</th>
                <th className="p-3">Role</th>
                <th className="p-3">Status</th>
                <th className="p-3">Last Login</th>
                <th className="p-3">Created On</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {accounts.map((acc) => {
                const isCurrent = acc.admin_id === adminProfile?.adminId;
                const isMaster = acc.admin_id === 'MIT-ADM-001';
                return (
                  <tr key={acc.id} className={isCurrent ? 'bg-blue-50/40' : 'hover:bg-slate-50'}>
                    <td className="p-3 font-mono font-bold text-slate-900">
                      {acc.admin_id}
                      {isMaster && (
                        <span className="ml-1.5 px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-bold">
                          Primary
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-bold text-slate-900">
                      {acc.username}
                      {isCurrent && (
                        <span className="ml-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] font-bold">
                          You
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-semibold border">
                        {acc.role}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          acc.account_status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {acc.account_status}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500">
                      {acc.last_successful_login
                        ? new Date(acc.last_successful_login).toLocaleString('en-IN', {
                            dateStyle: 'short',
                            timeStyle: 'short'
                          })
                        : 'Never logged in'}
                    </td>
                    <td className="p-3 text-slate-500">
                      {acc.account_creation_date
                        ? new Date(acc.account_creation_date).toLocaleDateString('en-IN')
                        : '—'}
                    </td>
                    <td className="p-3 text-right">
                      {!isCurrent && !isMaster && (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(acc)}
                            className="px-2 py-1 text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border cursor-pointer"
                          >
                            {acc.account_status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAccount(acc)}
                            className="px-2 py-1 text-[11px] font-bold text-red-700 bg-red-50 hover:bg-red-100 rounded border border-red-200 cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                      {(isCurrent || isMaster) && (
                        <span className="text-[11px] text-slate-400 italic">Protected</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SECTION 2: Modify Current Logged-in Admin Credentials ── */}
      <form onSubmit={handleUpdateCredentials} className="border-t border-slate-200 pt-6 space-y-4">
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
            Modify My Account Credentials ({adminProfile?.username || 'MIT'})
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Update your own username or rotate your password.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Username *</label>
            <input
              type="text"
              required
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Current Password (Identity Verification) *
            </label>
            <input
              type={showPasswords ? 'text' : 'password'}
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              New Password (Optional)
            </label>
            <input
              type={showPasswords ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Leave blank to keep unchanged"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
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
              placeholder="Re-enter new password"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showPasswords}
              onChange={(e) => setShowPasswords(e.target.checked)}
              className="rounded"
            />
            Show Password Characters
          </label>

          <button
            type="submit"
            disabled={busy}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition disabled:opacity-50 cursor-pointer"
          >
            {busy ? 'Saving Changes...' : 'Save Updated Credentials'}
          </button>
        </div>
      </form>

      {/* ── SECTION 3: Emergency Recovery Key ── */}
      <div className="border-t border-slate-200 pt-6 space-y-3">
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
            Offline Emergency Recovery Token
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Generate an offline emergency backup key to regain access in case passwords are forgotten or credentials are lost.
          </p>
        </div>

        {backupRecoveryKey ? (
          <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl space-y-2">
            <span className="text-xs font-bold text-emerald-950 block">
              ✓ Offline Emergency Recovery Token Generated:
            </span>
            <div className="p-3 bg-white border border-emerald-300 rounded-lg font-mono text-sm font-bold text-slate-900 tracking-wider select-all break-all">
              {backupRecoveryKey}
            </div>
            <p className="text-[11px] text-emerald-800">
              Store this token in a secure password manager or offline vault. It can be used anytime via <strong>Forgot Password</strong>.
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleGenerateRecoveryKey}
            disabled={busy}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition disabled:opacity-50 cursor-pointer"
          >
            Generate New Emergency Recovery Key
          </button>
        )}
      </div>

      {/* ── FULL VIEWPORT DEDICATED OVERLAY: Create New Admin Account (Completely Covers Screen) ── */}
      {showCreateModal && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[9999999] flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            minHeight: '100vh',
            backgroundColor: '#090d16',
            zIndex: 9999999
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !creatingAdmin) {
              setShowCreateModal(false);
              setModalError('');
              setModalSuccess('');
            }
          }}
        >
          {/* Top Breadcrumb / Return Navigation */}
          <div className="w-full max-w-xl flex items-center justify-between mb-4 px-1">
            <button
              type="button"
              disabled={creatingAdmin}
              onClick={() => {
                setShowCreateModal(false);
                setModalError('');
                setModalSuccess('');
              }}
              className="text-slate-400 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <span>←</span>
              <span>Back to Dashboard</span>
            </button>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
              MIT Admin Desk · Enrollment
            </span>
          </div>

          <div
            className="bg-white rounded-2xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-700/50 relative my-auto animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Top Header */}
            <div className="bg-slate-900 text-white p-5 flex items-start justify-between border-b border-slate-800">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-400 block">
                  New Administrator Enrollment
                </span>
                <h3 className="text-base font-bold mt-0.5 text-white">Create New Admin Login</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Enroll an authorized staff or faculty administrator account with isolated credentials.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!creatingAdmin) {
                    setShowCreateModal(false);
                    setModalError('');
                    setModalSuccess('');
                  }
                }}
                disabled={creatingAdmin}
                className="text-slate-400 hover:text-white text-xl font-bold p-1 cursor-pointer transition disabled:opacity-40"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {/* Error Notification Alert inside Modal */}
            {modalError && (
              <div className="mx-6 mt-4 p-3.5 bg-red-50 border border-red-300 rounded-xl text-xs text-red-900 flex items-start gap-2.5 animate-in fade-in">
                <span className="text-base leading-none">⚠️</span>
                <div className="font-semibold leading-relaxed">{modalError}</div>
              </div>
            )}

            {/* Success Notification Alert inside Modal */}
            {modalSuccess && (
              <div className="mx-6 mt-4 p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 flex items-start gap-2.5 animate-in fade-in">
                <span className="text-base leading-none">✓</span>
                <div className="font-semibold leading-relaxed">{modalSuccess}</div>
              </div>
            )}

            {/* Modal Form */}
            <form onSubmit={handleCreateAdmin} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Administrator Username *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  disabled={creatingAdmin || Boolean(modalSuccess)}
                  value={createUsername}
                  onChange={(e) => {
                    setCreateUsername(e.target.value);
                    if (modalError) setModalError('');
                  }}
                  placeholder="e.g. ADMIN_CS, PRINCIPAL, STAFF_01"
                  className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none uppercase font-mono tracking-wide"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Must be between 3 and 50 characters (case-insensitive unique login ID).
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Administrative Role *
                </label>
                <select
                  value={createRole}
                  disabled={creatingAdmin || Boolean(modalSuccess)}
                  onChange={(e) => setCreateRole(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none bg-white text-slate-900 font-medium cursor-pointer"
                >
                  <option value="COLLEGE_ADMIN">COLLEGE_ADMIN – Standard Administrator (Operations, Uniforms & Registrations)</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN – Full Administrative Control (Security & Accounts Management)</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-800">
                    Initial Password *
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleGenerateSuggestedPassword}
                      className="text-[11px] text-emerald-700 hover:text-emerald-900 font-bold cursor-pointer underline"
                      title="Click to automatically fill a strong, secure password"
                    >
                      ⚡ Auto-Generate Strong Password
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowModalPassword(!showModalPassword)}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-bold cursor-pointer"
                    >
                      {showModalPassword ? 'Hide Password' : 'Show Password'}
                    </button>
                  </div>
                </div>
                <input
                  type={showModalPassword ? 'text' : 'password'}
                  required
                  disabled={creatingAdmin || Boolean(modalSuccess)}
                  value={createPassword}
                  onChange={(e) => {
                    setCreatePassword(e.target.value);
                    if (modalError) setModalError('');
                  }}
                  placeholder="Min 6 characters, uppercase, number, symbol"
                  className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />

                {/* Password Strength Requirements Checklist */}
                <div className="grid grid-cols-2 gap-1.5 mt-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[11px]">
                  <div className={`flex items-center gap-1.5 ${passMinLength ? 'text-emerald-700 font-bold' : 'text-slate-500'}`}>
                    <span>{passMinLength ? '✓' : '○'}</span> Min 6 characters
                  </div>
                  <div className={`flex items-center gap-1.5 ${passHasUpper ? 'text-emerald-700 font-bold' : 'text-slate-500'}`}>
                    <span>{passHasUpper ? '✓' : '○'}</span> Uppercase letter (A-Z)
                  </div>
                  <div className={`flex items-center gap-1.5 ${passHasNumber ? 'text-emerald-700 font-bold' : 'text-slate-500'}`}>
                    <span>{passHasNumber ? '✓' : '○'}</span> Number (0-9)
                  </div>
                  <div className={`flex items-center gap-1.5 ${passHasSymbol ? 'text-emerald-700 font-bold' : 'text-slate-500'}`}>
                    <span>{passHasSymbol ? '✓' : '○'}</span> Special symbol (@, #, $...)
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Confirm Initial Password *
                </label>
                <input
                  type={showModalPassword ? 'text' : 'password'}
                  required
                  disabled={creatingAdmin || Boolean(modalSuccess)}
                  value={createConfirmPassword}
                  onChange={(e) => {
                    setCreateConfirmPassword(e.target.value);
                    if (modalError) setModalError('');
                  }}
                  placeholder="Re-type initial password"
                  className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
                {createConfirmPassword && (
                  <span className={`text-[11px] font-bold mt-1 block ${passMatches ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {passMatches ? '✓ Passwords match' : '⚠️ Passwords do not match'}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  disabled={creatingAdmin}
                  onClick={() => {
                    setShowCreateModal(false);
                    setModalError('');
                    setModalSuccess('');
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg cursor-pointer transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingAdmin || Boolean(modalSuccess)}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer transition disabled:opacity-50 flex items-center gap-2"
                >
                  {creatingAdmin && (
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  <span>{creatingAdmin ? 'Creating Account...' : 'Create Admin Login'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

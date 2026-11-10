import React, { useState, useEffect, useCallback } from 'react';
import AdminLoginPage from '../../pages/AdminLoginPage';

export default function ProtectedAdminRoute({ apiBaseUrl = '', children }) {
  const [loading, setLoading] = useState(true);
  const [adminProfile, setAdminProfile] = useState(null);

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/auth/session`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store'
      });
      const data = await res.json();
      if (res.ok && data.success && data.authenticated) {
        setAdminProfile(data.admin);
      } else {
        setAdminProfile(null);
      }
    } catch (e) {
      setAdminProfile(null);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const handleLogout = async () => {
    await fetch(`${apiBaseUrl}/api/admin/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    }).catch(() => {});
    setAdminProfile(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white text-xs font-bold">
        Verifying Admin Session...
      </div>
    );
  }

  if (!adminProfile) {
    return (
      <AdminLoginPage
        apiBaseUrl={apiBaseUrl}
        onLoginSuccess={(admin) => setAdminProfile(admin)}
      />
    );
  }

  return typeof children === 'function'
    ? children({ adminProfile, setAdminProfile, handleLogout })
    : React.cloneElement(children, {
        adminProfile,
        onProfileUpdated: setAdminProfile,
        onLogout: handleLogout
      });
}


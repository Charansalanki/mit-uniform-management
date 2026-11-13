import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ProtectedAdminRoute from './components/admin/ProtectedAdminRoute';
import './style.css';

// Immediately evict any stale service workers in the browser to prevent network request stalling
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister().catch(() => {});
    }
  }).catch(() => {});
  if (typeof caches !== 'undefined') {
    caches.keys().then((names) => {
      for (const name of names) {
        caches.delete(name).catch(() => {});
      }
    }).catch(() => {});
  }
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ProtectedAdminRoute>
      {({ adminProfile, handleLogout }) => (
        <App adminProfile={adminProfile} onLogout={handleLogout} />
      )}
    </ProtectedAdminRoute>
  </React.StrictMode>
);

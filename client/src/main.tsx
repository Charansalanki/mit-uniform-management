import React from 'react';
import { createRoot } from 'react-dom/client';
import StudentPortal from './StudentPortal';
import VendorPortalPage from './pages/VendorPortalPage';
import StudentApplicationGate from './components/student/StudentApplicationGate';
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

const isVendorPortal = typeof window !== 'undefined' && (
  window.location.pathname.startsWith('/vendor/secure-access') ||
  window.location.pathname.includes('vendor-portal')
);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isVendorPortal ? (
      <VendorPortalPage />
    ) : (
      <StudentApplicationGate>
        <StudentPortal />
      </StudentApplicationGate>
    )}
  </React.StrictMode>
);

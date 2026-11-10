import React from 'react';
import { createRoot } from 'react-dom/client';
import StudentPortal from './StudentPortal';
import VendorPortalPage from './pages/VendorPortalPage';
import StudentApplicationGate from './components/student/StudentApplicationGate';
import './style.css';

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

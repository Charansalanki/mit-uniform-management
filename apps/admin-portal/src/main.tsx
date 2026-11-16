import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ProtectedAdminRoute from './components/admin/ProtectedAdminRoute';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ProtectedAdminRoute>
      {({ adminProfile, handleLogout }) => (
        <App adminProfile={adminProfile} onLogout={handleLogout} />
      )}
    </ProtectedAdminRoute>
  </React.StrictMode>
);

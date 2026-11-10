import React from 'react';
import { createRoot } from 'react-dom/client';
import VendorPortalPage from './pages/VendorPortalPage';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <VendorPortalPage />
  </React.StrictMode>
);


import React from 'react';
import { createRoot } from 'react-dom/client';
import SchedulesPage from './SchedulesPage';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SchedulesPage />
  </React.StrictMode>
);

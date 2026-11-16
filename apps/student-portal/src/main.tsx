import React from 'react';
import { createRoot } from 'react-dom/client';
import StudentPortal from './StudentPortal';
import StudentApplicationGate from './components/student/StudentApplicationGate';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StudentApplicationGate>
      <StudentPortal />
    </StudentApplicationGate>
  </React.StrictMode>
);

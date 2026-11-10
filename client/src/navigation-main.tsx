import React from 'react';
import { createRoot } from 'react-dom/client';
import NavigationPage from './NavigationPage';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <NavigationPage />
  </React.StrictMode>
);


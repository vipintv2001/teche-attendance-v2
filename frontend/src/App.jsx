import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import EmployeePortal from './pages/EmployeePortal';
import AdminLedger from './pages/AdminLedger';
import { registerServiceWorker } from './utils/pushUtils';

export default function App() {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<EmployeePortal />} />
        <Route path="/admin" element={<AdminLedger />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}


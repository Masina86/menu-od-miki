import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminPanel from './components/AdminPanel';
import MenuView from './components/MenuView';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Default to a demo restaurant for the landing page */}
        <Route path="/" element={<Navigate to="/demo-restaurant/admin" replace />} />
        
        {/* Admin Route */}
        <Route path="/:slug/admin" element={<AdminPanel />} />
        
        {/* Customer Route */}
        <Route path="/:slug" element={<MenuView />} />
      </Routes>
    </BrowserRouter>
  );
}

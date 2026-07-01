import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminPanel from './components/AdminPanel';
import MenuView from './components/MenuView';
import ReviewsPage from './components/ReviewsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Default to a demo restaurant for the landing page */}
        <Route path="/" element={<Navigate to="/dismak-oil/admin" replace />} />
        
        {/* Admin Route */}
        <Route path="/:slug/admin" element={<AdminPanel />} />
        
        {/* Reviews Route */}
        <Route path="/:slug/reviews" element={<ReviewsPage />} />
        
        {/* Customer Route */}
        <Route path="/:slug" element={<MenuView />} />
      </Routes>
    </BrowserRouter>
  );
}

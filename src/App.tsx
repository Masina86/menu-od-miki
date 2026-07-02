import React, { Component, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminPanel from './components/AdminPanel';
import MenuView from './components/MenuView';
import ReviewsPage from './components/ReviewsPage';

class AdminErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  private readonly childrenNode: ReactNode;

  constructor(props: { children: ReactNode }) {
    super(props);
    this.childrenNode = props.children;
  }

  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Admin page crashed:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-stone-50 p-6 text-stone-900">
          <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-white p-5 shadow-sm">
            <h1 className="mb-2 text-lg font-bold text-red-700">
              Admin page could not load
            </h1>
            <p className="mb-4 text-sm text-stone-600">
              The page hit a display error instead of staying white.
            </p>
            <pre className="overflow-auto rounded bg-stone-100 p-3 text-xs text-stone-800">
              {this.state.error.message}
            </pre>
          </div>
        </div>
      );
    }

    return this.childrenNode;
  }
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Default to a demo restaurant for the landing page */}
        <Route path="/" element={<Navigate to="/dismak-oil/admin" replace />} />
        <Route path="/admin" element={<Navigate to="/dismak-oil/admin" replace />} />
        
        {/* Admin Route */}
        <Route
          path="/:slug/admin"
          element={
            <AdminErrorBoundary>
              <AdminPanel />
            </AdminErrorBoundary>
          }
        />
        
        {/* Reviews Route */}
        <Route path="/:slug/reviews" element={<ReviewsPage />} />
        
        {/* Customer Route */}
        <Route path="/:slug" element={<MenuView />} />
      </Routes>
    </BrowserRouter>
  );
}

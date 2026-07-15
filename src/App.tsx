import { Component, lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

const AdminPage = lazy(() => import("./features/admin/AdminPage"));
const ScanStatisticsPage = lazy(
  () => import("./features/admin/ScanStatisticsPage"),
);
const MenuPage = lazy(() => import("./features/menu/MenuPage"));
const ReviewsPage = lazy(() => import("./features/reviews/ReviewsPage"));

function RouteLoading({ dark }: { dark: boolean }) {
  return (
    <div
      className={
        "min-h-screen flex items-center justify-center " +
        (dark
          ? "bg-stone-900 text-stone-100"
          : "bg-stone-50 text-stone-900")
      }
    >
      Loading...
    </div>
  );
}

class AdminErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

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
              Please refresh the page and try again. If the problem continues, contact support.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800"
            >
              Refresh
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dismak-oil/admin" replace />} />
        <Route
          path="/admin"
          element={<Navigate to="/dismak-oil/admin" replace />}
        />
        <Route
          path="/:slug/admin/statistics"
          element={
            <AdminErrorBoundary>
              <Suspense fallback={<RouteLoading dark={false} />}>
                <ScanStatisticsPage />
              </Suspense>
            </AdminErrorBoundary>
          }
        />
        <Route
          path="/:slug/admin"
          element={
            <AdminErrorBoundary>
              <Suspense fallback={<RouteLoading dark={false} />}>
                <AdminPage />
              </Suspense>
            </AdminErrorBoundary>
          }
        />
        <Route
          path="/:slug/reviews"
          element={
            <Suspense fallback={<RouteLoading dark />}>
              <ReviewsPage />
            </Suspense>
          }
        />
        <Route
          path="/:slug"
          element={
            <Suspense fallback={<RouteLoading dark />}>
              <MenuPage />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

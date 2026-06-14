import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Groups from './pages/Groups';
import GroupDashboard from './pages/GroupDashboard';
import GroupExpenses from './pages/GroupExpenses';
import GroupImport from './pages/GroupImport';
import ImportReport from './pages/ImportReport';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-sm font-semibold text-slate-500 animate-pulse">
          Loading session...
        </div>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <Layout>{children}</Layout>;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-sm font-semibold text-slate-500 animate-pulse">
          Loading...
        </div>
      </div>
    );
  }
  if (user) {
    return <Navigate to="/groups" replace />;
  }
  return children;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Authentication routes */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <Register />
              </PublicRoute>
            }
          />

          {/* Protected Application routes wrapped in Layout */}
          <Route
            path="/groups"
            element={
              <ProtectedRoute>
                <Groups />
              </ProtectedRoute>
            }
          />
          <Route
            path="/groups/:id"
            element={
              <ProtectedRoute>
                <GroupDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/groups/:id/expenses"
            element={
              <ProtectedRoute>
                <GroupExpenses />
              </ProtectedRoute>
            }
          />
          <Route
            path="/groups/:id/import"
            element={
              <ProtectedRoute>
                <GroupImport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/groups/:id/import/:batchId/report"
            element={
              <ProtectedRoute>
                <ImportReport />
              </ProtectedRoute>
            }
          />

          {/* Default fallbacks */}
          <Route path="/" element={<Navigate to="/groups" replace />} />
          <Route
            path="*"
            element={
              <div className="flex h-screen flex-col items-center justify-center bg-slate-50">
                <h2 className="text-xl font-bold text-slate-800">Page Not Found</h2>
                <p className="text-xs text-slate-500 mt-1">The page you are looking for does not exist.</p>
              </div>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

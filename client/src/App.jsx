import React from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Groups from './pages/Groups';
import GroupDashboard from './pages/GroupDashboard';
import GroupExpenses from './pages/GroupExpenses';
import GroupImport from './pages/GroupImport';
import ImportReport from './pages/ImportReport';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        {/* Navigation Bar */}
        <header className="bg-slate-900 text-white p-4 shadow-md">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <h1 className="text-xl font-bold tracking-tight">
              <Link to="/groups" className="hover:text-slate-300">Shared Expenses App</Link>
            </h1>
            <nav className="flex space-x-6 text-sm">
              <Link to="/groups" className="hover:text-slate-300">Groups</Link>
              <Link to="/login" className="hover:text-slate-300">Login</Link>
              <Link to="/register" className="hover:text-slate-300 font-medium text-emerald-400">Register</Link>
            </nav>
          </div>
        </header>

        {/* Main Workspace Area */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-6">
          <Routes>
            <Route path="/" element={<Navigate to="/groups" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/groups" element={<Groups />} />
            <Route path="/groups/:id" element={<GroupDashboard />} />
            <Route path="/groups/:id/expenses" element={<GroupExpenses />} />
            <Route path="/groups/:id/import" element={<GroupImport />} />
            <Route path="/groups/:id/import/:batchId/report" element={<ImportReport />} />
            {/* Fallback route */}
            <Route path="*" element={<div className="p-8 text-center"><h2 className="text-xl font-bold">Page Not Found</h2><p className="text-gray-500">The page you are looking for does not exist.</p></div>} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;

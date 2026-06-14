import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import API from '../services/api';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);

  useEffect(() => {
    if (user) {
      fetchGroups();
    }
  }, [user, id]);

  const fetchGroups = async () => {
    try {
      const res = await API.get('groups/');
      setGroups(res.data);
      if (id) {
        const found = res.data.find(g => g.id === parseInt(id));
        if (found) {
          setActiveGroup(found);
        }
      } else {
        setActiveGroup(null);
      }
    } catch (err) {
      console.error("Failed to fetch groups", err);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Sidebar - Deep Navy */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col flex-shrink-0 z-10 shadow-xl">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-white shadow-md">
              SE
            </div>
            <span className="font-bold text-lg tracking-wide bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              Splitwise Mini
            </span>
          </div>
        </div>

        {/* Group Selector List */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          <div>
            <h3 className="px-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              My Groups
            </h3>
            {groups.length === 0 ? (
              <p className="text-slate-500 text-sm px-2">No groups yet.</p>
            ) : (
              <nav className="space-y-1">
                {groups.map((group) => {
                  const isActive = parseInt(id) === group.id;
                  return (
                    <Link
                      key={group.id}
                      to={`/groups/${group.id}`}
                      className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                        isActive
                          ? 'bg-slate-800 text-emerald-400 shadow-inner'
                          : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                      }`}
                    >
                      <span className="truncate">{group.name}</span>
                    </Link>
                  );
                })}
              </nav>
            )}
          </div>

          {/* Active Group Context Navigation */}
          {activeGroup && (
            <div>
              <h3 className="px-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                {activeGroup.name}
              </h3>
              <nav className="space-y-1">
                <Link
                  to={`/groups/${id}`}
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    location.pathname === `/groups/${id}`
                      ? 'bg-slate-800 text-emerald-400'
                      : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                  }`}
                >
                  Dashboard
                </Link>
                <Link
                  to={`/groups/${id}/expenses`}
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    location.pathname === `/groups/${id}/expenses`
                      ? 'bg-slate-800 text-emerald-400'
                      : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                  }`}
                >
                  Expenses & Splits
                </Link>
                <Link
                  to={`/groups/${id}/import`}
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    location.pathname.includes('/import')
                      ? 'bg-slate-800 text-emerald-400'
                      : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                  }`}
                >
                  Import CSV
                </Link>
              </nav>
            </div>
          )}
        </div>

        {/* User Footer Profile & Action */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-200 border border-slate-700">
                {user?.display_name?.slice(0, 2).toUpperCase() || 'U'}
              </div>
              <div className="flex flex-col truncate w-32">
                <span className="text-sm font-semibold text-white truncate">
                  {user?.display_name || user?.username}
                </span>
                <span className="text-xs text-slate-400 truncate">
                  @{user?.username}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full py-1.5 px-3 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-red-950 hover:text-red-200 hover:border-red-900 border border-slate-700 transition-all duration-200"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-8 justify-between flex-shrink-0">
          <h2 className="text-xl font-bold text-slate-800 truncate">
            {activeGroup ? activeGroup.name : 'Welcome to Splitwise Mini'}
          </h2>
          <div className="text-sm text-slate-500">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-slate-50">
          <div className="p-8 max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../services/api';

export default function Groups() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const res = await API.get('groups/');
      setGroups(res.data);
    } catch (err) {
      console.error(err);
      setError("Failed to fetch groups.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!groupName.strip()) return;
    setCreating(true);
    try {
      const res = await API.post('groups/', { name: groupName });
      setGroupName('');
      setIsModalOpen(false);
      // Redirect to the newly created group dashboard
      navigate(`/groups/${res.data.id}`);
    } catch (err) {
      console.error(err);
      alert("Failed to create group.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">My Expense Groups</h1>
          <p className="text-sm text-slate-500 mt-1">Select a group to view details, balances, and add expenses</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-slate-900 text-white font-semibold text-sm py-2.5 px-4 rounded-lg hover:bg-slate-800 transition-colors shadow-md flex items-center space-x-2"
        >
          <span>Create Group</span>
        </button>
      </div>

      {/* Grid of groups */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 h-36 animate-pulse" />
          <div className="bg-white p-6 rounded-xl border border-slate-200 h-36 animate-pulse" />
          <div className="bg-white p-6 rounded-xl border border-slate-200 h-36 animate-pulse" />
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">
          {error}
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-white text-center py-16 px-4 rounded-xl border border-slate-200 shadow-sm max-w-xl mx-auto mt-8">
          <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center font-bold text-slate-400 text-2xl mx-auto mb-4 border border-slate-200 border-dashed">
            +
          </div>
          <h3 className="text-lg font-bold text-slate-800">No Groups Found</h3>
          <p className="text-slate-500 text-sm mt-1 max-w-xs mx-auto">
            You are not part of any group yet. Click the button below to create your first flatmate expense group!
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="mt-6 inline-flex py-2 px-4 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-lg shadow-md transition-colors"
          >
            Create First Group
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map((group) => {
            const numMembers = group.memberships?.length || 0;
            return (
              <div
                key={group.id}
                onClick={() => navigate(`/groups/${group.id}`)}
                className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <h3 className="font-bold text-slate-800 text-lg group-hover:text-emerald-500 transition-colors">
                    {group.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Created on {new Date(group.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="border-t border-slate-100 mt-6 pt-4 flex items-center justify-between text-xs text-slate-500">
                  <span>{numMembers} Group {numMembers === 1 ? 'member' : 'members'}</span>
                  <span className="text-emerald-500 font-semibold flex items-center space-x-1">
                    <span>View Dashboard</span>
                    <span>?</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Group Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="bg-white rounded-xl shadow-2xl relative w-full max-w-sm p-6 z-10 animate-zoom-in">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Create New Group</h3>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Group Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Flat 202b Expenses"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-sm"
                />
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="py-2 px-4 text-xs font-semibold rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !groupName.trim()}
                  className="py-2 px-5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-lg shadow-md transition-all duration-200"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

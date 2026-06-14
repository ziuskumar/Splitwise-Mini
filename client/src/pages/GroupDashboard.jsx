import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ReferenceLine } from 'recharts';
import API from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import AddExpenseModal from '../components/AddExpenseModal';
import RecordSettlementModal from '../components/RecordSettlementModal';
import BalanceDetailDrawer from '../components/BalanceDetailDrawer';

export default function GroupDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  
  const [group, setGroup] = useState(null);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals / Drawers states
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  
  // Add Member State
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [memberUsername, setMemberUsername] = useState('');
  const [memberJoinDate, setMemberJoinDate] = useState(new Date().toISOString().split('T')[0]);
  const [addingMember, setAddingMember] = useState(false);

  useEffect(() => {
    if (id) {
      fetchDashboardData();
    }
  }, [id]);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const groupRes = await API.get(`groups/${id}/`);
      setGroup(groupRes.data);

      const balRes = await API.get(`groups/${id}/balances/`);
      setBalances(balRes.data);
    } catch (err) {
      console.error(err);
      setError("Failed to load group details or balances.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddMemberSubmit = async (e) => {
    e.preventDefault();
    if (!memberUsername.trim()) return;
    setAddingMember(true);
    try {
      // Find matching user from users endpoint
      const usersRes = await API.get('users/');
      const allUsers = usersRes.data;
      
      const targetUser = allUsers.find(
        u => u.username.toLowerCase() === memberUsername.trim().toLowerCase()
      );
      
      if (!targetUser) {
        alert(`User '${memberUsername}' not found in the system. They must register first.`);
        setAddingMember(false);
        return;
      }
      
      // Post to group members endpoint
      await API.post(`groups/${id}/members/`, {
        user_id: targetUser.id,
        joined_at: memberJoinDate
      });
      
      setMemberUsername('');
      setIsAddMemberOpen(false);
      fetchDashboardData();
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.detail || "Failed to add member to the group.";
      alert(errMsg);
    } finally {
      setAddingMember(false);
    }
  };

  const handleMarkAsLeft = async (membershipId) => {
    const confirm = window.confirm("Are you sure you want to mark this member as left?");
    if (!confirm) return;
    
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      await API.patch(`groups/${id}/members/${membershipId}/`, {
        left_at: todayStr
      });
      fetchDashboardData();
    } catch (err) {
      console.error(err);
      alert("Failed to update membership.");
    }
  };

  const handleOpenDetailDrawer = (userId) => {
    setSelectedMemberId(userId);
    setIsDetailDrawerOpen(true);
  };

  if (loading && !group) {
    return (
      <div className="space-y-6">
        <div className="h-40 bg-white border border-slate-200 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse md:col-span-2" />
          <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">
        {error}
      </div>
    );
  }

  // Find current user's balance
  const userBalanceObj = balances.find(b => b.user.id === currentUser?.id);
  const userNetBalance = userBalanceObj ? userBalanceObj.net_balance : 0.0;

  // Prepare chart data
  const chartData = balances.map(b => ({
    name: b.user.display_name || b.user.username,
    balance: b.net_balance,
  }));

  return (
    <div className="space-y-8">
      {/* 1. HERO BALANCE CARD */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-lg md:col-span-2 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-4 translate-y-4">
            <svg className="w-48 h-48" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z" />
            </svg>
          </div>
          
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Your Net Balance
            </span>
            <div className="mt-2 flex items-baseline space-x-2">
              <span className={`text-4xl font-black tabular-nums ${
                userNetBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {userNetBalance >= 0 ? '+' : ''}
                ₹{userNetBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-2">
              {userNetBalance >= 0 
                ? "You are owed money overall by group members"
                : "You owe money overall to group members"}
            </p>
          </div>

          <div className="mt-6 border-t border-slate-800 pt-4 flex space-x-3 z-10">
            <button
              onClick={() => handleOpenDetailDrawer(currentUser?.id)}
              className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg transition-colors border border-slate-700"
            >
              Show Math (Itemized)
            </button>
          </div>
        </div>

        {/* QUICK ACTION BUTTONS */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <h3 className="font-bold text-slate-800 text-sm">Quick Actions</h3>
          <div className="grid grid-cols-1 gap-2.5 mt-4">
            <button
              onClick={() => setIsExpenseModalOpen(true)}
              className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-600 font-bold text-sm text-white rounded-lg transition-colors shadow-md flex items-center justify-center space-x-2"
            >
              <span>Add Expense</span>
            </button>
            <button
              onClick={() => setIsSettlementModalOpen(true)}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 font-bold text-sm text-white rounded-lg transition-colors shadow-md flex items-center justify-center space-x-2"
            >
              <span>Record Settlement</span>
            </button>
            <button
              onClick={() => navigate(`/groups/${id}/import`)}
              className="w-full py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-50 font-bold text-sm text-slate-700 rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              <span>Import CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. CHART VISUALIZATION */}
      {chartData.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4">Balance Distribution (INR)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <XAxis dataKey="name" tick={{ fill: '#64748B', fontSize: 12 }} />
                <YAxis tick={{ fill: '#64748B', fontSize: 12 }} />
                <Tooltip
                  cursor={{ fill: 'transparent' }}
                  formatter={(value) => [`₹${value.toFixed(2)}`, 'Net Balance']}
                  contentStyle={{ backgroundColor: '#1E293B', border: 'none', borderRadius: '8px', color: '#fff' }}
                />
                <ReferenceLine y={0} stroke="#94A3B8" />
                <Bar dataKey="balance" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.balance >= 0 ? '#10B981' : '#F43F5E'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 3. GROUP MEMBERS NET BALANCES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Balances List */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <h3 className="font-bold text-slate-800">Group Balances</h3>
            <span className="text-xs text-slate-400 italic">Click member to audit</span>
          </div>

          <div className="divide-y divide-slate-100">
            {balances.map((b) => {
              const isMe = b.user.id === currentUser?.id;
              return (
                <div
                  key={b.user.id}
                  onClick={() => handleOpenDetailDrawer(b.user.id)}
                  className="py-3 flex items-center justify-between hover:bg-slate-50 rounded-lg px-2 cursor-pointer transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-700 text-sm">
                      {b.user.display_name?.slice(0, 2).toUpperCase() || 'U'}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-800 text-sm">
                        {b.user.display_name || b.user.username} {isMe && '(You)'}
                      </span>
                      <span className="text-xs text-slate-400 block">@{b.user.username}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`font-black text-sm tabular-nums ${
                      b.net_balance >= 0 ? 'text-emerald-500' : 'text-rose-500'
                    }`}>
                      {b.net_balance >= 0 ? '+' : ''}
                      ₹{b.net_balance.toLocaleString(undefined, {minimumFractionDigits: 2})}
                    </span>
                    <span className="text-slate-400 text-[10px] block uppercase tracking-wide">
                      {b.net_balance >= 0 ? 'is owed' : 'owes'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Group Members Administration */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <h3 className="font-bold text-slate-800">Members List</h3>
            <button
              onClick={() => setIsAddMemberOpen(true)}
              className="text-xs font-bold text-emerald-500 hover:text-emerald-600 transition-colors"
            >
              + Add
            </button>
          </div>

          <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
            {group?.memberships?.map((m) => {
              const isPast = !!m.left_at;
              return (
                <div key={m.id} className={`flex items-center justify-between text-sm ${isPast ? 'opacity-40' : ''}`}>
                  <div className="flex items-center space-x-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                      isPast ? 'bg-slate-100 text-slate-400' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {m.user.display_name?.slice(0, 2).toUpperCase() || 'U'}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-800">{m.user.display_name || m.user.username}</span>
                      <span className="text-xs text-slate-400 block">
                        Joined {m.joined_at}
                        {isPast && ` · Left ${m.left_at}`}
                      </span>
                    </div>
                  </div>
                  {!isPast && m.user.id !== currentUser?.id && (
                    <button
                      onClick={() => handleMarkAsLeft(m.id)}
                      className="text-xs text-rose-500 hover:text-rose-600 font-semibold transition-colors"
                    >
                      Leave
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. ADD MEMBER POPUP MODAL */}
      {isAddMemberOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsAddMemberOpen(false)} />
          <div className="bg-white rounded-xl shadow-2xl relative w-full max-w-sm p-6 z-10 animate-zoom-in">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Add Group Member</h3>
            <form onSubmit={handleAddMemberSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Username
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. priya"
                  value={memberUsername}
                  onChange={(e) => setMemberUsername(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Joined At Date
                </label>
                <input
                  type="date"
                  required
                  value={memberJoinDate}
                  onChange={(e) => setMemberJoinDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-sm"
                />
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsAddMemberOpen(false)}
                  className="py-2 px-4 text-xs font-semibold rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingMember || !memberUsername.trim()}
                  className="py-2 px-5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-lg shadow-md transition-all"
                >
                  {addingMember ? 'Adding...' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. MODALS & SLIDE-OVERS */}
      {group && (
        <>
          <AddExpenseModal
            isOpen={isExpenseModalOpen}
            onClose={() => setIsExpenseModalOpen(false)}
            groupId={id}
            memberships={group.memberships}
            onExpenseAdded={fetchDashboardData}
          />
          <RecordSettlementModal
            isOpen={isSettlementModalOpen}
            onClose={() => setIsSettlementModalOpen(false)}
            groupId={id}
            memberships={group.memberships}
            onSettlementAdded={fetchDashboardData}
          />
          <BalanceDetailDrawer
            isOpen={isDetailDrawerOpen}
            onClose={() => setIsDetailDrawerOpen(false)}
            groupId={id}
            userId={selectedMemberId}
          />
        </>
      )}
    </div>
  );
}

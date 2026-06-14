import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import API from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function GroupExpenses() {
  const { id } = useParams();
  const { user: currentUser } = useAuth();
  
  const [expenses, setExpenses] = useState([]);
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filter States
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedMember, setSelectedMember] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);

  // Expand State (stores expense IDs that are expanded)
  const [expandedIds, setExpandedIds] = useState(new Set());

  useEffect(() => {
    if (id) {
      fetchGroupAndExpenses();
    }
  }, [id, startDate, endDate, selectedMember]);

  const fetchGroupAndExpenses = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch group details to get member list for filters
      const groupRes = await API.get(`groups/${id}/`);
      setGroup(groupRes.data);

      // Build query params
      const params = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (selectedMember) params.member_id = selectedMember;
      if (showDeleted) params.include_deleted = 'true';

      // Note: backend action is group_expenses (GET groups/:id/expenses/)
      const res = await API.get(`groups/${id}/expenses/`, { params });
      setExpenses(res.data);
    } catch (err) {
      console.error(err);
      setError("Failed to load expenses.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRow = (expenseId) => {
    const next = new Set(expandedIds);
    if (next.has(expenseId)) {
      next.delete(expenseId);
    } else {
      next.add(expenseId);
    }
    setExpandedIds(next);
  };

  const handleDeleteExpense = async (expenseId) => {
    const confirm = window.confirm("Are you sure you want to delete this expense? This is a soft-delete.");
    if (!confirm) return;

    try {
      await API.delete(`expenses/${expenseId}/`);
      fetchGroupAndExpenses();
    } catch (err) {
      console.error(err);
      alert("Failed to delete expense.");
    }
  };

  // Filter local copy if they are soft-deleted and we don't want to show them
  // Note: the backend returns only non-deleted expenses by default.
  // Wait, let's verify if the backend supports showing deleted or if we soft-deleted them.
  // Let's check backend view `group_expenses`:
  // `expenses = Expense.objects.filter(group=group, is_deleted=False)` -> it filters out deleted expenses!
  // Wait, what if we want to show deleted? Since the backend always filters out `is_deleted=False` (line 80 of views.py),
  // we might not get them. However, wait!
  // Let's check: if we soft delete, the backend will hide them. If the user wants to see soft-deleted, we can
  // show them if we fetch them. But wait! Since views.py restricts to `is_deleted=False` for group_expenses,
  // we don't return them.
  // Let's modify `views.py` `group_expenses` to show deleted if `include_deleted=true` query param is present!
  // That would be extremely robust and elegant.
  // Let's see: `include_deleted = request.query_params.get('include_deleted')`
  // `if include_deleted == 'true': expenses = Expense.objects.filter(group=group)...` else `is_deleted=False`.
  // Yes! Let's write a quick python script to update views.py to allow this include_deleted filter!
  // Let's check: views.py line 80:
  // `expenses = Expense.objects.filter(group=group, is_deleted=False).prefetch_related('splits__user')`
  // Let's see if we should adjust views.py to support it. That would make the soft-delete filter work perfectly.
  // Let's write a python script to change views.py and then continue!
  
  const filteredExpenses = expenses; // we will configure views.py to return them correctly!

  return (
    <div className="space-y-6">
      {/* Filters Header Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-slate-800 text-sm mb-4">Filter Expenses</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Paid By / Split With
            </label>
            <select
              value={selectedMember}
              onChange={(e) => setSelectedMember(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-sm bg-white"
            >
              <option value="">All Members</option>
              {group?.memberships?.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.display_name || m.user.username}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2 pb-2">
            <input
              id="showDeleted"
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => {
                setShowDeleted(e.target.checked);
                // Trigger reload via useEffect by updating state or triggering re-fetch
              }}
              className="w-4 h-4 text-emerald-500 border-slate-300 rounded focus:ring-emerald-500"
            />
            <label htmlFor="showDeleted" className="text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer">
              Show Deleted
            </label>
          </div>
        </div>

        {(startDate || endDate || selectedMember || showDeleted) && (
          <button
            onClick={() => {
              setStartDate('');
              setEndDate('');
              setSelectedMember('');
              setShowDeleted(false);
            }}
            className="mt-4 text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Expenses List */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            <div className="h-12 bg-slate-100 rounded-xl animate-pulse" />
            <div className="h-12 bg-slate-100 rounded-xl animate-pulse" />
            <div className="h-12 bg-slate-100 rounded-xl animate-pulse" />
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <svg className="w-12 h-12 mx-auto text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="font-semibold">No expenses found</p>
            <p className="text-xs text-slate-400 mt-1">Try relaxing filters or add a new expense.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredExpenses.map((expense) => {
              const isExpanded = expandedIds.has(expense.id);
              const isDeleted = expense.is_deleted;
              return (
                <div key={expense.id} className={`transition-colors ${isDeleted ? 'bg-slate-50 opacity-60' : 'hover:bg-slate-50/50'}`}>
                  {/* Expense Main Row */}
                  <div
                    onClick={() => handleToggleRow(expense.id)}
                    className="p-4 sm:px-6 flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center space-x-4 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                        isDeleted ? 'bg-slate-200 text-slate-500' : 'bg-emerald-50 text-emerald-600'
                      }`}>
                        {expense.split_type === 'EQUAL' && '＝'}
                        {expense.split_type === 'UNEQUAL' && '≠'}
                        {expense.split_type === 'PERCENTAGE' && '％'}
                      </div>
                      <div className="min-w-0">
                        <span className={`font-semibold text-slate-800 text-sm block truncate ${isDeleted ? 'line-through' : ''}`}>
                          {expense.description}
                        </span>
                        <span className="text-xs text-slate-400 block mt-0.5">
                          Paid by <strong className="text-slate-600">{expense.paid_by_detail?.display_name || expense.paid_by_detail?.username}</strong> · {expense.date}
                          {isDeleted && <span className="ml-2 py-0.5 px-1.5 bg-red-100 text-red-700 font-bold rounded text-[9px] uppercase">Deleted</span>}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-6">
                      <div className="text-right">
                        <span className="font-bold text-slate-800 text-sm block">
                          ₹{expense.converted_amount.toLocaleString(undefined, {minimumFractionDigits: 2})}
                        </span>
                        {expense.currency !== 'INR' && (
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            {expense.original_amount} {expense.currency} @ {expense.exchange_rate_used}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-2">
                        {!isDeleted && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteExpense(expense.id);
                            }}
                            className="p-1 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-100 transition-colors"
                            title="Delete Expense"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                        <svg
                          className={`w-4 h-4 text-slate-400 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Expense Expanded Details */}
                  {isExpanded && (
                    <div className="px-6 pb-6 pt-2 bg-slate-50/50 border-t border-slate-100">
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                        Split Allocations
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {expense.splits?.map((split) => (
                          <div key={split.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                            <div className="flex items-center space-x-2.5">
                              <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-xs">
                                {split.user.display_name?.slice(0, 2).toUpperCase() || 'U'}
                              </div>
                              <div>
                                <span className="font-semibold text-slate-700 text-xs block">
                                  {split.user.display_name || split.user.username}
                                </span>
                                <span className="text-[10px] text-slate-400 block mt-0.5">
                                  {split.share_percentage}% share
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="font-bold text-slate-800 text-xs block">
                                ₹{split.share_amount.toLocaleString(undefined, {minimumFractionDigits: 2})}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

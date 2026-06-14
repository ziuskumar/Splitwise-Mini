import React, { useState, useEffect } from 'react';
import API from '../services/api';

export default function RecordSettlementModal({ isOpen, onClose, groupId, memberships, onSettlementAdded }) {
  const [paidBy, setPaidBy] = useState('');
  const [paidTo, setPaidTo] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  
  const [activeMembers, setActiveMembers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Filter members active on selected date
  useEffect(() => {
    if (date && memberships) {
      const selectedDate = new Date(date);
      const active = memberships.filter(m => {
        const joinDate = new Date(m.joined_at);
        const leftDate = m.left_at ? new Date(m.left_at) : null;
        return joinDate <= selectedDate && (!leftDate || leftDate >= selectedDate);
      }).map(m => m.user);
      
      setActiveMembers(active);

      if (active.length > 1) {
        // Set default paidBy and paidTo to different users if not set
        const activeIds = active.map(u => u.id.toString());
        if (!activeIds.includes(paidBy)) {
          setPaidBy(activeIds[0]);
        }
        if (!activeIds.includes(paidTo)) {
          setPaidTo(activeIds[1] || activeIds[0]);
        }
      }
    }
  }, [date, memberships]);

  if (!isOpen) return null;

  const parsedAmount = parseFloat(amount) || 0.0;

  const isFormValid = () => {
    return paidBy && paidTo && paidBy !== paidTo && parsedAmount > 0 && date;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid()) return;

    setSubmitting(true);
    setError(null);

    const payload = {
      paid_by: parseInt(paidBy),
      paid_to: parseInt(paidTo),
      amount: parsedAmount.toString(),
      date,
      note,
    };

    try {
      await API.post(`groups/${groupId}/payments/`, payload);
      setAmount('');
      setNote('');
      onSettlementAdded();
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.non_field_errors?.[0] || err.response?.data?.detail || "Failed to record payment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Card */}
      <div className="bg-white rounded-xl shadow-2xl relative w-full max-w-md flex flex-col z-10 animate-zoom-in">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white rounded-t-xl">
          <h3 className="text-lg font-bold">Record Settlement</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
              {error}
            </div>
          )}

          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Date
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Payer */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Payer (Sent By)
              </label>
              <select
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-sm bg-white"
              >
                {activeMembers.map(u => (
                  <option key={u.id} value={u.id}>{u.display_name || u.username}</option>
                ))}
              </select>
            </div>

            {/* Recipient */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Recipient (Received By)
              </label>
              <select
                value={paidTo}
                onChange={(e) => setPaidTo(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-sm bg-white"
              >
                {activeMembers.map(u => (
                  <option key={u.id} value={u.id}>{u.display_name || u.username}</option>
                ))}
              </select>
            </div>
          </div>

          {paidBy === paidTo && paidBy && (
            <span className="text-xs text-red-500 italic block">
              Payer and Recipient must be different members.
            </span>
          )}

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Amount (INR ?)
            </label>
            <input
              type="number"
              step="0.01"
              required
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-sm"
            />
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Note
            </label>
            <input
              type="text"
              placeholder="e.g. Cash settlement, GPay"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-sm"
            />
          </div>
        </form>

        {/* Modal Footer */}
        <div className="p-6 border-t border-slate-100 flex justify-end space-x-3 bg-slate-50 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-4 text-sm font-semibold rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !isFormValid()}
            className="py-2 px-5 text-sm font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 text-white shadow-md transition-all duration-200 flex items-center space-x-2"
          >
            {submitting ? (
              <>
                <svg className="animate-spin h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Saving...</span>
              </>
            ) : (
              <span>Save Settlement</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

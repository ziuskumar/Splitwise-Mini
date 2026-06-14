import React, { useState, useEffect } from 'react';
import API from '../services/api';

export default function AddExpenseModal({ isOpen, onClose, groupId, memberships, onExpenseAdded }) {
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paidBy, setPaidBy] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [originalAmount, setOriginalAmount] = useState('');
  const [splitType, setSplitType] = useState('equal');
  
  // Dynamic splits inputs
  const [activeMembers, setActiveMembers] = useState([]);
  const [splitAmong, setSplitAmong] = useState([]); // Array of user_ids for equal split
  const [unequalAmounts, setUnequalAmounts] = useState({}); // {user_id: amount}
  const [percentages, setPercentages] = useState({}); // {user_id: percentage}
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Filter members active on the selected date
  useEffect(() => {
    if (date && memberships) {
      const selectedDate = new Date(date);
      const active = memberships.filter(m => {
        const joinDate = new Date(m.joined_at);
        const leftDate = m.left_at ? new Date(m.left_at) : null;
        return joinDate <= selectedDate && (!leftDate || leftDate >= selectedDate);
      }).map(m => m.user);
      
      setActiveMembers(active);
      
      // Reset values matching active members
      const activeIds = active.map(u => u.id);
      setSplitAmong(activeIds);
      
      const newUnequal = {};
      const newPct = {};
      active.forEach(u => {
        newUnequal[u.id] = '';
        newPct[u.id] = '';
      });
      setUnequalAmounts(newUnequal);
      setPercentages(newPct);

      // Default paidBy to the first active user if empty or no longer active
      if (active.length > 0) {
        const isCurrentPaidByActive = active.some(u => u.id === parseInt(paidBy));
        if (!isCurrentPaidByActive) {
          setPaidBy(active[0].id.toString());
        }
      }
    }
  }, [date, memberships]);

  if (!isOpen) return null;

  // Derived Values
  const parsedAmount = parseFloat(originalAmount) || 0.0;
  const exchangeRate = 83.0; // Fixed rate preview matches settings
  const convertedAmountPreview = currency === 'USD' ? parsedAmount * exchangeRate : parsedAmount;

  // Validations
  const getUnequalSum = () => {
    return Object.values(unequalAmounts).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
  };

  const getPercentageSum = () => {
    return Object.values(percentages).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
  };

  const isFormValid = () => {
    if (!description || !date || !paidBy || parsedAmount <= 0) return false;
    
    if (splitType === 'equal') {
      return splitAmong.length > 0;
    }
    
    if (splitType === 'unequal') {
      const sum = getUnequalSum();
      return Math.abs(sum - parsedAmount) <= 0.01;
    }
    
    if (splitType === 'percentage') {
      const sum = getPercentageSum();
      return Math.abs(sum - 100.0) <= 0.01;
    }
    
    return false;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid()) return;

    setSubmitting(true);
    setError(null);

    const payload = {
      description,
      date,
      paid_by: parseInt(paidBy),
      currency,
      original_amount: parsedAmount.toString(),
      split_type: splitType,
    };

    if (splitType === 'equal') {
      payload.split_among = splitAmong;
    } else if (splitType === 'unequal') {
      payload.splits_input = Object.keys(unequalAmounts)
        .filter(uid => parseFloat(unequalAmounts[uid]) > 0)
        .map(uid => ({
          user_id: parseInt(uid),
          amount: parseFloat(unequalAmounts[uid]).toString()
        }));
    } else if (splitType === 'percentage') {
      payload.splits_input = Object.keys(percentages)
        .filter(uid => parseFloat(percentages[uid]) > 0)
        .map(uid => ({
          user_id: parseInt(uid),
          percentage: parseFloat(percentages[uid]).toString()
        }));
    }

    try {
      await API.post(`groups/${groupId}/expenses/`, payload);
      // Reset form
      setDescription('');
      setOriginalAmount('');
      onExpenseAdded();
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.non_field_errors?.[0] || err.response?.data?.detail || "Failed to create expense.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Card */}
      <div className="bg-white rounded-xl shadow-2xl relative w-full max-w-lg flex flex-col z-10 max-h-[90vh] overflow-hidden animate-zoom-in">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white">
          <h3 className="text-lg font-bold">Add New Expense</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
              {error}
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Description
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Electricity bill"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
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

            {/* Paid By */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Paid By
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
          </div>

          {/* Currency and Amount */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-sm bg-white"
              >
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Amount
              </label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={originalAmount}
                onChange={(e) => setOriginalAmount(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-sm"
              />
            </div>
          </div>

          {/* Exchange Rate Live Preview */}
          {currency === 'USD' && (
            <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 p-2.5 rounded-lg flex justify-between items-center">
              <span>Conversion (at ₹{exchange_rate_used || 83.0}/$):</span>
              <span className="font-bold text-slate-800">₹{convertedAmountPreview.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            </div>
          )}

          {/* Split Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Split Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {['equal', 'unequal', 'percentage'].map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSplitType(type)}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg border capitalize transition-all ${
                    splitType === type
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Split Options Section */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              Splits Distribution
            </h4>
            
            {activeMembers.length === 0 ? (
              <p className="text-xs text-red-500 italic">No active group members on this date.</p>
            ) : splitType === 'equal' ? (
              /* EQUAL SPLIT DESIGN */
              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {activeMembers.map(u => {
                  const isChecked = splitAmong.includes(u.id);
                  return (
                    <label key={u.id} className="flex items-center space-x-3 text-sm font-medium text-slate-700 hover:text-slate-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setSplitAmong(splitAmong.filter(id => id !== u.id));
                          } else {
                            setSplitAmong([...splitAmong, u.id]);
                          }
                        }}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                      />
                      <span className="flex-1">{u.display_name || u.username}</span>
                      {isChecked && (
                        <span className="text-xs text-slate-500 font-semibold tabular-nums">
                          ₹{(convertedAmountPreview / Math.max(1, splitAmong.length)).toFixed(2)}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            ) : splitType === 'unequal' ? (
              /* UNEQUAL SPLIT DESIGN */
              <div className="space-y-3">
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {activeMembers.map(u => (
                    <div key={u.id} className="flex items-center space-x-3 text-sm">
                      <span className="flex-1 font-medium text-slate-700">{u.display_name || u.username}</span>
                      <div className="relative">
                        <span className="absolute left-2.5 top-2 text-xs text-slate-400">{currency}</span>
                        <input
                          type="number"
                          placeholder="0.00"
                          value={unequalAmounts[u.id] || ''}
                          onChange={(e) => setUnequalAmounts({
                            ...unequalAmounts,
                            [u.id]: e.target.value
                          })}
                          className="w-24 pl-10 pr-2 py-1.5 border border-slate-200 rounded-lg text-right text-xs focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {/* Validation Info */}
                <div className="border-t border-slate-200 pt-2 flex justify-between text-xs text-slate-500 font-semibold">
                  <span>Sum: {currency} {getUnequalSum().toFixed(2)}</span>
                  <span className={Math.abs(getUnequalSum() - parsedAmount) <= 0.01 ? 'text-emerald-600' : 'text-red-500'}>
                    Target: {currency} {parsedAmount.toFixed(2)}
                  </span>
                </div>
              </div>
            ) : (
              /* PERCENTAGE SPLIT DESIGN */
              <div className="space-y-3">
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {activeMembers.map(u => {
                    const pctVal = parseFloat(percentages[u.id]) || 0;
                    const computedShare = (convertedAmountPreview * (pctVal / 100.0)).toFixed(2);
                    return (
                      <div key={u.id} className="flex items-center space-x-3 text-sm">
                        <span className="flex-1 font-medium text-slate-700">{u.display_name || u.username}</span>
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            placeholder="0"
                            min="0"
                            max="100"
                            value={percentages[u.id] || ''}
                            onChange={(e) => setPercentages({
                              ...percentages,
                              [u.id]: e.target.value
                            })}
                            className="w-16 px-2 py-1.5 border border-slate-200 rounded-lg text-right text-xs focus:outline-none focus:border-emerald-500"
                          />
                          <span className="text-xs text-slate-400">%</span>
                          <span className="text-xs font-semibold text-slate-500 w-20 text-right tabular-nums">
                            ₹{computedShare}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Validation Info */}
                <div className="border-t border-slate-200 pt-2 flex justify-between text-xs text-slate-500 font-semibold">
                  <span>Sum: {getPercentageSum().toFixed(2)}%</span>
                  <span className={Math.abs(getPercentageSum() - 100.0) <= 0.01 ? 'text-emerald-600' : 'text-red-500'}>
                    Target: 100%
                  </span>
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Modal Footer */}
        <div className="p-6 border-t border-slate-100 flex justify-end space-x-3 bg-slate-50">
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
                <span>Creating...</span>
              </>
            ) : (
              <span>Add Expense</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

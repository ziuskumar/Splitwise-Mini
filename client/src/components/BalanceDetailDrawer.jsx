import React, { useEffect, useState } from 'react';
import API from '../services/api';

export default function BalanceDetailDrawer({ groupId, userId, isOpen, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && userId && groupId) {
      fetchDetail();
    }
  }, [isOpen, userId, groupId]);

  const fetchDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await API.get(`groups/${groupId}/balances/${userId}/detail/`);
      setData(res.data);
    } catch (err) {
      console.error(err);
      setError("Failed to load itemized balance breakdown.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" aria-modal="true" role="dialog">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over Panel */}
      <div className="relative w-screen max-w-lg bg-white shadow-2xl flex flex-col h-full z-10 animate-slide-in">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
          <div>
            <h3 className="text-lg font-bold">Itemized Breakdown</h3>
            <p className="text-xs text-slate-400">
              Audit for {data?.user?.display_name || 'User'} (@{data?.user?.username || 'user'})
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {loading ? (
            <div className="space-y-4">
              <div className="h-24 bg-slate-100 animate-pulse rounded-xl" />
              <div className="h-40 bg-slate-100 animate-pulse rounded-xl" />
              <div className="h-40 bg-slate-100 animate-pulse rounded-xl" />
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-50 text-rose-700 rounded-lg text-sm border border-rose-200">
              {error}
            </div>
          ) : data ? (
            <>
              {/* Summary Hero Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                  Summary
                </h4>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Paid for Expenses</span>
                    <span className="text-base font-bold text-slate-800 tabular-nums">
                      ₹{data.summary.total_paid_for_expenses.toLocaleString(undefined, {minimumFractionDigits: 2})}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Consumed Share</span>
                    <span className="text-base font-bold text-slate-800 tabular-nums">
                      ₹{data.summary.total_my_shares.toLocaleString(undefined, {minimumFractionDigits: 2})}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Settlements Paid</span>
                    <span className="text-base font-bold text-slate-800 tabular-nums">
                      ₹{data.summary.total_payments_sent.toLocaleString(undefined, {minimumFractionDigits: 2})}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Settlements Recv</span>
                    <span className="text-base font-bold text-slate-800 tabular-nums">
                      ₹{data.summary.total_payments_received.toLocaleString(undefined, {minimumFractionDigits: 2})}
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-3 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Net Balance</span>
                  <span className={`text-base font-black tabular-nums ${
                    data.summary.computed_net_balance >= 0 ? 'text-emerald-600' : 'text-rose-500'
                  }`}>
                    {data.summary.computed_net_balance >= 0 ? '+' : ''}
                    ₹{data.summary.computed_net_balance.toLocaleString(undefined, {minimumFractionDigits: 2})}
                  </span>
                </div>
              </div>

              {/* Itemized Expenses */}
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                  Expenses & Splits
                </h4>
                {data.itemized_expenses.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No expenses recorded.</p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden bg-white">
                    {data.itemized_expenses.map((exp) => (
                      <div key={exp.id} className="p-3 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors">
                        <div className="w-2/3">
                          <span className="font-semibold text-slate-800 block truncate">{exp.description}</span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            {exp.date} · Paid by {exp.paid_by_me ? 'them' : exp.paid_by_display_name || exp.paid_by_username}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className={`font-semibold block tabular-nums ${exp.paid_by_me ? 'text-emerald-600' : 'text-slate-800'}`}>
                            {exp.paid_by_me ? '+' : ''}₹{exp.converted_amount.toLocaleString(undefined, {minimumFractionDigits: 2})}
                          </span>
                          <span className="text-[9px] text-slate-400 block mt-0.5">
                            Share: -₹{exp.my_share_amount.toLocaleString(undefined, {minimumFractionDigits: 2})}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Itemized Payments */}
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                  Settlements
                </h4>
                {data.itemized_payments.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No settlements recorded.</p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden bg-white">
                    {data.itemized_payments.map((pay) => (
                      <div key={pay.id} className="p-3 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors">
                        <div>
                          <span className="font-semibold text-slate-800 block">
                            {pay.paid_by_me ? `Sent to @${pay.paid_to_username}` : `Received from @${pay.paid_by_username}`}
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            {pay.date} {pay.note && `· "${pay.note}"`}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className={`font-bold tabular-nums ${pay.paid_by_me ? 'text-rose-500' : 'text-emerald-600'}`}>
                            {pay.paid_by_me ? '-' : '+'}₹{pay.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

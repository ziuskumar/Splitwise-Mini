import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../services/api';

export default function ImportReport() {
  const { id, batchId } = useParams();
  const navigate = useNavigate();
  
  const [report, setReport] = useState(null);
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Manual Split Modal State
  const [isManualSplitOpen, setIsManualSplitOpen] = useState(false);
  const [selectedAnomaly, setSelectedAnomaly] = useState(null);
  const [manualShares, setManualShares] = useState({}); // userId -> amount string
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (batchId) {
      fetchReportAndGroup();
    }
  }, [batchId]);

  const fetchReportAndGroup = async () => {
    setLoading(true);
    setError(null);
    try {
      const reportRes = await API.get(`import-batches/${batchId}/report/`);
      setReport(reportRes.data);

      const groupRes = await API.get(`groups/${id}/`);
      setGroup(groupRes.data);
    } catch (err) {
      console.error(err);
      setError("Failed to load import batch report.");
    } finally {
      setLoading(false);
    }
  };

  const handleResolveAction = async (anomalyId, action, extraData = {}) => {
    setResolving(true);
    try {
      await API.post(`anomalies/${anomalyId}/resolve/`, {
        action,
        ...extraData
      });
      // Refresh report
      const reportRes = await API.get(`import-batches/${batchId}/report/`);
      setReport(reportRes.data);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || "Failed to resolve anomaly.");
    } finally {
      setResolving(false);
    }
  };

  const handleOpenManualSplit = (anomaly) => {
    setSelectedAnomaly(anomaly);
    
    // Extract amount from description or raw data if possible,
    // or just let them input values.
    // Initialize shares for active group members to 0
    const initialShares = {};
    group?.memberships?.forEach(m => {
      if (!m.left_at) {
        initialShares[m.user.id] = '';
      }
    });
    setManualShares(initialShares);
    setIsManualSplitOpen(true);
  };

  const handleManualSplitSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAnomaly) return;

    // Validate splits sum to total
    // Let's parse the total amount from the anomaly raw row data or description.
    // The raw row data is typically like: date,description,amount,paid_by,split_with,split_mode
    // We can extract it or parse it, or check the database.
    // Wait! The backend resolve action does the sum check:
    // `total_sum = sum(Decimal(str(s.get('amount', 0))) for s in splits_list)`
    // `if abs(total_sum - expense.converted_amount) > Decimal('0.01'): return error...`
    // So let's calculate the sum of input shares and submit it.
    
    const splits = Object.entries(manualShares)
      .filter(([_, amt]) => parseFloat(amt) > 0)
      .map(([userId, amt]) => ({
        user_id: parseInt(userId),
        amount: parseFloat(amt)
      }));

    if (splits.length === 0) {
      alert("Please enter at least one split share.");
      return;
    }

    setResolving(true);
    try {
      await API.post(`anomalies/${selectedAnomaly.id}/resolve/`, {
        action: 'manual_split',
        manual_split: { splits }
      });
      setIsManualSplitOpen(false);
      setSelectedAnomaly(null);
      
      // Refresh report
      const reportRes = await API.get(`import-batches/${batchId}/report/`);
      setReport(reportRes.data);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || "Failed to resolve manual split. Ensure the sum of shares equals the transaction amount.");
    } finally {
      setResolving(false);
    }
  };

  const formatRawRow = (raw) => {
    if (!raw) return '';
    if (typeof raw === 'string') return raw;
    try {
      const parts = [];
      const keys = ['date', 'description', 'amount', 'currency', 'paid_by', 'split_with', 'split_type', 'split_details', 'notes'];
      keys.forEach(k => {
        if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '') {
          parts.push(`${k}: ${raw[k]}`);
        }
      });
      Object.keys(raw).forEach(k => {
        if (!keys.includes(k) && raw[k] !== undefined && raw[k] !== null && raw[k] !== '') {
          parts.push(`${k}: ${raw[k]}`);
        }
      });
      return parts.join(' | ');
    } catch (e) {
      return JSON.stringify(raw);
    }
  };

  if (loading && !report) {
    return (
      <div className="space-y-6">
        <div className="h-40 bg-white border border-slate-200 rounded-xl animate-pulse" />
        <div className="h-96 bg-white border border-slate-200 rounded-xl animate-pulse" />
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

  const { summary, anomalies } = report;

  return (
    <div className="space-y-8">
      {/* Back Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate(`/groups/${id}`)}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors flex items-center space-x-1 mb-2"
          >
            <span>← Back to Dashboard</span>
          </button>
          <h2 className="text-2xl font-black text-slate-900">CSV Ingestion Report</h2>
          <p className="text-xs text-slate-400 mt-1">File: <span className="font-semibold text-slate-600">{report.filename}</span> · Uploaded on {new Date(report.uploaded_at).toLocaleString()}</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Processed</span>
          <div className="text-2xl font-black text-slate-800 mt-1">{summary.total_rows_processed} rows</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Expenses Created</span>
          <div className="text-2xl font-black text-emerald-600 mt-1">{summary.expenses_created}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payments Created</span>
          <div className="text-2xl font-black text-indigo-600 mt-1">{summary.payments_created}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Auto Resolved</span>
          <div className="text-2xl font-black text-slate-800 mt-1">{summary.auto_resolved_count}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Needs Review</span>
          <div className="text-2xl font-black text-rose-600 mt-1">{summary.needs_review_count}</div>
        </div>
      </div>

      {/* Anomalies List */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="font-bold text-slate-800">Anomaly Audit Log</h3>
            <p className="text-xs text-slate-400 mt-0.5">List of validation exceptions and resolving statuses.</p>
          </div>
          <span className="text-xs px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 font-bold rounded-lg uppercase tracking-wide">
            {anomalies.filter(a => a.status === 'NEEDS_REVIEW').length} Unresolved
          </span>
        </div>

        {anomalies.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <svg className="w-12 h-12 mx-auto text-emerald-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-semibold text-slate-800">Clean ingestion!</p>
            <p className="text-xs text-slate-400 mt-1">No anomalies detected in this CSV import batch.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/20">
                  <th className="py-3.5 px-6">Row</th>
                  <th className="py-3.5 px-6">Anomaly Type</th>
                  <th className="py-3.5 px-6">Description</th>
                  <th className="py-3.5 px-6">Raw Data</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {anomalies.map((anomaly) => (
                  <tr key={anomaly.id} className="hover:bg-slate-50/30 transition-colors align-top">
                    <td className="py-4 px-6 font-mono text-xs text-slate-400">#{anomaly.csv_row_number}</td>
                    <td className="py-4 px-6">
                      <span className="py-0.5 px-2 bg-amber-50 border border-amber-200 text-amber-800 font-semibold rounded text-[10px] tracking-wide uppercase">
                        {anomaly.anomaly_type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-4 px-6 max-w-sm text-xs text-slate-600 font-medium leading-relaxed">
                      {anomaly.description}
                    </td>
                    <td className="py-4 px-6 font-mono text-[10px] text-slate-500 max-w-[200px] truncate" title={typeof anomaly.raw_row_data === 'object' ? JSON.stringify(anomaly.raw_row_data) : anomaly.raw_row_data}>
                      {formatRawRow(anomaly.raw_row_data)}
                    </td>
                    <td className="py-4 px-6 text-right">
                      {anomaly.status === 'NEEDS_REVIEW' ? (
                        <div className="flex justify-end space-x-1.5">
                          <button
                            onClick={() => handleResolveAction(anomaly.id, 'approve')}
                            disabled={resolving}
                            className="py-1 px-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 text-white font-bold text-xs rounded transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleResolveAction(anomaly.id, 'reject')}
                            disabled={resolving}
                            className="py-1 px-2.5 bg-rose-500 hover:bg-rose-600 disabled:bg-slate-200 text-white font-bold text-xs rounded transition-colors"
                          >
                            Reject
                          </button>
                          {anomaly.anomaly_type !== 'SETTLEMENT_MISCLASSIFIED' && (
                            <button
                              onClick={() => handleOpenManualSplit(anomaly)}
                              disabled={resolving}
                              className="py-1 px-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white font-bold text-xs rounded transition-colors"
                            >
                              Manual Split
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="text-right">
                          <span className="py-0.5 px-2 bg-slate-100 text-slate-600 font-bold rounded text-[10px] uppercase">
                            Resolved
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-1">
                            Action: {anomaly.action_taken}
                          </span>
                          {anomaly.resolved_by && (
                            <span className="text-[9px] text-slate-400 block">
                              By @{anomaly.resolved_by}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manual Split Dialog Modal */}
      {isManualSplitOpen && selectedAnomaly && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsManualSplitOpen(false)} />
          <div className="bg-white rounded-xl shadow-2xl relative w-full max-w-md p-6 z-10 animate-zoom-in">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Resolve Manual Splits</h3>
            <p className="text-xs text-slate-500 mb-4">
              Raw Row: <code className="bg-slate-100 px-1 py-0.5 rounded text-[10px]">{formatRawRow(selectedAnomaly.raw_row_data)}</code>
            </p>
            <form onSubmit={handleManualSplitSubmit} className="space-y-4">
              <div className="max-h-60 overflow-y-auto space-y-3 pr-1">
                {group?.memberships?.map((m) => {
                  if (m.left_at) return null; // Only active members
                  return (
                    <div key={m.user.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-xs">
                          {m.user.display_name?.slice(0, 2).toUpperCase() || 'U'}
                        </div>
                        <span className="font-semibold text-slate-700">
                          {m.user.display_name || m.user.username}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-400 text-xs">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={manualShares[m.user.id] || ''}
                          onChange={(e) => setManualShares({
                            ...manualShares,
                            [m.user.id]: e.target.value
                          })}
                          className="w-24 px-2.5 py-1 border border-slate-200 rounded-lg text-right text-sm focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between items-center border-t border-slate-100 pt-4 mt-6">
                <div className="text-left">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Entered</span>
                  <span className="font-black text-slate-800 text-sm">
                    ₹{Object.values(manualShares)
                      .reduce((sum, val) => sum + (parseFloat(val) || 0), 0)
                      .toFixed(2)}
                  </span>
                </div>
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsManualSplitOpen(false)}
                    className="py-2 px-4 text-xs font-semibold rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={resolving}
                    className="py-2 px-5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-lg shadow-md transition-all"
                  >
                    Apply Splits
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

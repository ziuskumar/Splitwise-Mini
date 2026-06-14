import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../services/api';

export default function GroupImport() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.csv')) {
        setFile(droppedFile);
        setError(null);
      } else {
        setError("Please upload a valid CSV file (.csv)");
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.name.endsWith('.csv')) {
        setFile(selectedFile);
        setError(null);
      } else {
        setError("Please upload a valid CSV file (.csv)");
      }
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;
    
    setUploading(true);
    setError(null);
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      // POST to /api/groups/:id/import/
      const res = await API.post(`groups/${id}/import/`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      const batchId = res.data.import_batch_id;
      // Navigate to review anomalies report page
      navigate(`/groups/${id}/import/${batchId}/report`);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || "Failed to upload and import CSV file. Ensure the headers are correct (date, description, amount, paid_by, split_with, split_mode).");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-slate-800 text-lg mb-2">Import CSV Transaction History</h3>
        <p className="text-xs text-slate-500 mb-6">
          Upload a CSV file containing transaction records to batch import expenses. The backend automatically parses and detects anomalies (such as duplicate entries, invalid splits, left members activity, and settlements).
        </p>

        {error && (
          <div className="mb-6 p-4 bg-rose-50 text-rose-700 rounded-xl text-xs border border-rose-100 flex items-start space-x-2.5">
            <svg className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleUpload} className="space-y-6">
          {/* Drag & Drop Zone */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center transition-all ${
              dragActive
                ? 'border-emerald-500 bg-emerald-50/30'
                : file
                  ? 'border-slate-300 bg-slate-50/20'
                  : 'border-slate-200 hover:border-slate-300 bg-slate-50/40'
            }`}
          >
            <input
              type="file"
              id="file-upload"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
            
            <svg className={`w-12 h-12 mb-4 transition-colors ${file ? 'text-emerald-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>

            {file ? (
              <div className="text-center">
                <p className="font-semibold text-slate-800 text-sm">{file.name}</p>
                <p className="text-xs text-slate-400 mt-1">{(file.size / 1024).toFixed(2)} KB</p>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="mt-3 text-xs text-rose-500 font-bold hover:underline"
                >
                  Remove File
                </button>
              </div>
            ) : (
              <div className="text-center">
                <label htmlFor="file-upload" className="cursor-pointer font-semibold text-emerald-600 hover:text-emerald-500 text-sm hover:underline">
                  Click to upload
                </label>
                <span className="text-slate-400 text-sm"> or drag and drop</span>
                <p className="text-xs text-slate-400 mt-2">Only CSV files are accepted</p>
              </div>
            )}
          </div>

          {/* Upload Button */}
          {file && (
            <button
              type="submit"
              disabled={uploading}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center space-x-2"
            >
              {uploading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Processing transactions...</span>
                </>
              ) : (
                <span>Upload & Analyze CSV</span>
              )}
            </button>
          )}
        </form>
      </div>

      {/* CSV template guide */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h4 className="font-bold text-slate-800 text-sm mb-3">CSV Schema Requirements</h4>
        <p className="text-xs text-slate-500 mb-4">
          To ensure clean ingestion, your CSV file columns should match the following format. Ensure that values containing commas are quoted.
        </p>
        <div className="bg-slate-950 text-slate-200 rounded-xl p-4 overflow-x-auto text-[11px] font-mono leading-relaxed">
          date,description,amount,paid_by,split_with,split_mode<br />
          2026-06-01,Dinner at Soho,"1,800.00",priya,rohan;priya,equal<br />
          2026-06-03,Airbnb rental,"12,000.00",rohan,rohan:4000;priya:8000,unequal<br />
          2026-06-05,Settlement to Priya,"3,500.00",rohan,priya,settlement
        </div>
      </div>
    </div>
  );
}

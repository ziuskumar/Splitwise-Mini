import React from 'react';
import { useParams } from 'react-router-dom';

export default function ImportReport() {
  const { id, batchId } = useParams();
  return (
    <div className="p-8 text-center">
      <h1 className="text-2xl font-bold mb-4">Import Report (Batch ID: {batchId})</h1>
      <p className="text-gray-600">Placeholder for the CSV import anomalies report for group {id}.</p>
    </div>
  );
}

import React from 'react';
import { useParams } from 'react-router-dom';

export default function GroupImport() {
  const { id } = useParams();
  return (
    <div className="p-8 text-center">
      <h1 className="text-2xl font-bold mb-4">Import Expenses CSV (Group ID: {id})</h1>
      <p className="text-gray-600">Placeholder for CSV drag-and-drop / upload screen.</p>
    </div>
  );
}

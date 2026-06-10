import React from 'react';
import { PlusCircle, AlertOctagon } from 'lucide-react';

export default function Inventory() {
  const ingredients = [
    { id: 'ING-001', name: 'Biji Kopi Gayo', stock: 1500, unit: 'gram', min: 1000, status: 'OK' },
    { id: 'ING-002', name: 'Susu UHT Diamond', stock: 2, unit: 'liter', min: 5, status: 'ALERT' },
    { id: 'ING-003', name: 'Gula Aren Cair', stock: 500, unit: 'ml', min: 1000, status: 'ALERT' },
    { id: 'ING-004', name: 'Sirup Vanilla', stock: 800, unit: 'ml', min: 500, status: 'OK' },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Inventory Management</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <PlusCircle size={18} /> Stock In
          </button>
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Current Stock</th>
                <th>Min. Level</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map(ing => (
                <tr key={ing.id}>
                  <td>{ing.id}</td>
                  <td style={{ fontWeight: '500' }}>{ing.name}</td>
                  <td>{ing.stock} {ing.unit}</td>
                  <td>{ing.min} {ing.unit}</td>
                  <td>
                    {ing.status === 'ALERT' ? (
                      <span className="text-danger" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <AlertOctagon size={16} /> Low Stock
                      </span>
                    ) : (
                      <span className="text-success">In Stock</span>
                    )}
                  </td>
                  <td>
                    <button className="btn" style={{ border: '1px solid var(--border-color)', backgroundColor: 'transparent', color: 'var(--text-main)' }}>
                      Adjust
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

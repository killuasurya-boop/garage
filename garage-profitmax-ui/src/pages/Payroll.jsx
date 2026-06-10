import React from 'react';
import { Download } from 'lucide-react';

export default function Payroll() {
  const employees = [
    { id: 'EMP-001', name: 'Budi Santoso', role: 'Kasir', baseSalary: 2500000 },
    { id: 'EMP-002', name: 'Siti Aminah', role: 'Barista', baseSalary: 3000000 },
    { id: 'EMP-003', name: 'Andi Kusuma', role: 'Kitchen', baseSalary: 2800000 },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Payroll Generator</h1>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Name</th>
                <th>Role</th>
                <th>Base Salary</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp.id}>
                  <td>{emp.id}</td>
                  <td style={{ fontWeight: '500' }}>{emp.name}</td>
                  <td>{emp.role}</td>
                  <td>Rp {emp.baseSalary.toLocaleString()}</td>
                  <td>
                    <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Download size={16} /> Generate Slip
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

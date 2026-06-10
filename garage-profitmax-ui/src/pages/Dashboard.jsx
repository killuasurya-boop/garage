import React from 'react';
import { DollarSign, TrendingUp, AlertTriangle, Activity } from 'lucide-react';

export default function Dashboard() {
  const stats = [
    { label: 'Revenue Today', value: 'Rp 3.750.000', icon: <DollarSign size={24} className="text-success" /> },
    { label: 'Gross Profit', value: 'Rp 2.062.500', icon: <TrendingUp size={24} className="text-primary" /> },
    { label: 'Menu Rugi', value: '1 Item', icon: <AlertTriangle size={24} className="text-danger" /> },
    { label: 'BEP Progress', value: '40.1%', icon: <Activity size={24} className="text-warning" /> },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard Overview</h1>
        <button className="btn btn-primary">Download Report</button>
      </div>

      <div className="grid-cols-4" style={{ marginBottom: '2rem' }}>
        {stats.map((stat, i) => (
          <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="card-title">{stat.label}</div>
              <div className="card-value">{stat.value}</div>
            </div>
            <div style={{ padding: '1rem', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '50%' }}>
              {stat.icon}
            </div>
          </div>
        ))}
      </div>

      <div className="grid-cols-2">
        <div className="card">
          <h2 className="card-title" style={{ fontSize: '1rem', marginBottom: '1.5rem', color: 'white' }}>
            Recent Transactions
          </h2>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>ID</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>10:45 AM</td>
                  <td>TRX-20260603-1023</td>
                  <td>Rp 85.000</td>
                  <td><span className="text-success">Paid</span></td>
                </tr>
                <tr>
                  <td>10:15 AM</td>
                  <td>TRX-20260603-1022</td>
                  <td>Rp 120.000</td>
                  <td><span className="text-success">Paid</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title" style={{ fontSize: '1rem', marginBottom: '1.5rem', color: 'white' }}>
            System Health
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', backgroundColor: 'var(--bg-dark)', borderRadius: '0.5rem' }}>
              <div>
                <div style={{ fontWeight: 'bold' }}>Average Margin</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Target: 50%</div>
              </div>
              <div className="text-success" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>55.2%</div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', backgroundColor: 'var(--bg-dark)', borderRadius: '0.5rem' }}>
              <div>
                <div style={{ fontWeight: 'bold' }}>HPP Ratio</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Target: 45%</div>
              </div>
              <div className="text-success" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>43.5%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

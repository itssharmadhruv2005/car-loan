import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  BarChart,
  Bar
} from 'recharts';
import { formatINR } from '../utils';

// Custom Tooltip Formatter
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        backgroundColor: 'rgba(11, 25, 44, 0.95)',
        border: '1px solid var(--accent-border)',
        padding: '10px 14px',
        borderRadius: '8px',
        color: '#fff',
        fontSize: '12px',
        boxShadow: 'var(--shadow)'
      }}>
        <p style={{ margin: '0 0 6px 0', fontWeight: 'bold', borderBottom: '1px solid #3b4b5e', paddingBottom: '4px' }}>
          Month: {label}
        </p>
        {payload.map((p, idx) => (
          <p key={idx} style={{ margin: '4px 0', color: p.color }}>
            {p.name}: <span style={{ fontWeight: 'bold' }}>{formatINR(p.value)}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function StrategyCharts({ schedule, chartType }) {
  // Chart 1: Balances Comparison
  if (chartType === 'balances') {
    const data = schedule.map(d => ({
      name: d.month,
      'Loan Balance': Math.round(d.closingLoanBal),
      'Investment Balance': Math.round(d.closingInvBal)
    }));

    return (
      <div style={{ width: '100%', height: '400px', padding: '10px 0' }}>
        <h3 className="chart-title">📈 Balance Progress Over Time</h3>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2c3c4f" opacity={0.3} />
            <XAxis dataKey="name" stroke="#a0aec0" fontSize={10} tickLine={false} />
            <YAxis 
              stroke="#a0aec0" 
              fontSize={10} 
              tickLine={false} 
              tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`} 
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend verticalAlign="top" height={36} iconType="circle" />
            <Line 
              type="monotone" 
              dataKey="Loan Balance" 
              stroke="#E53E3E" 
              strokeWidth={3} 
              dot={false}
              activeDot={{ r: 6 }} 
            />
            <Line 
              type="monotone" 
              dataKey="Investment Balance" 
              stroke="#319795" 
              strokeWidth={3} 
              dot={false}
              activeDot={{ r: 6 }} 
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Chart 2: EMI Composition
  if (chartType === 'composition') {
    const data = schedule.map(d => ({
      name: d.month,
      'Principal Repaid': Math.round(d.principalComp),
      'Interest Paid': Math.round(d.interestComp)
    }));

    return (
      <div style={{ width: '100%', height: '400px', padding: '10px 0' }}>
        <h3 className="chart-title">📊 Monthly EMI Composition (Principal vs Interest)</h3>
        <ResponsiveContainer width="100%" height="90%">
          <AreaChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2c3c4f" opacity={0.3} />
            <XAxis dataKey="name" stroke="#a0aec0" fontSize={10} tickLine={false} />
            <YAxis 
              stroke="#a0aec0" 
              fontSize={10} 
              tickLine={false}
              tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} 
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend verticalAlign="top" height={36} iconType="circle" />
            <Area 
              type="monotone" 
              dataKey="Principal Repaid" 
              stackId="1" 
              stroke="#3182ce" 
              fill="rgba(49, 130, 206, 0.4)" 
            />
            <Area 
              type="monotone" 
              dataKey="Interest Paid" 
              stackId="1" 
              stroke="#DD6B20" 
              fill="rgba(221, 107, 32, 0.4)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Chart 3: Cash Flow (SWP Inflow vs EMI Outflow)
  if (chartType === 'cashflow') {
    const data = schedule.map(d => ({
      name: d.month,
      'SWP Inflow (Income)': Math.round(d.swpWithdrawn),
      'EMI Outflow (Expense)': Math.round(d.emiPaid)
    }));

    return (
      <div style={{ width: '100%', height: '400px', padding: '10px 0' }}>
        <h3 className="chart-title">💵 Monthly Cash Flow Comparison</h3>
        <ResponsiveContainer width="100%" height="90%">
          <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2c3c4f" opacity={0.3} />
            <XAxis dataKey="name" stroke="#a0aec0" fontSize={10} tickLine={false} />
            <YAxis 
              stroke="#a0aec0" 
              fontSize={10} 
              tickLine={false}
              tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} 
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend verticalAlign="top" height={36} iconType="circle" />
            <Bar dataKey="SWP Inflow (Income)" fill="#319795" radius={[4, 4, 0, 0]} />
            <Bar dataKey="EMI Outflow (Expense)" fill="#E53E3E" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return null;
}

import React, { useState, useEffect } from 'react';
import { runCalculations, formatINR, formatNumber } from './utils';
import StrategyCharts from './components/StrategyCharts';
import './App.css';

const API_BASE = 'http://localhost:5000/api';

export default function App() {
  // Calculator inputs state (with default values matching Excel)
  const [inputs, setInputs] = useState({
    vehicle_price: 4500000,
    down_payment: 500000,
    loan_tenure: 7,
    interest_rate: 0.09,
    lump_sum: 4000000,
    expected_return: 0.12,
    swp_amount: 0, // 0 means auto-linked to EMI initially
    swp_start_month: 1,
    fund_type: 'Equity MF',
    emi_start_month: '2026-06',
    isAutoLinked: true
  });

  const [activeTab, setActiveTab] = useState('home');
  const [activeChart, setActiveChart] = useState('balances');
  
  // Database scenarios state
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // PDF download loading state
  const [exportPdfLoading, setExportPdfLoading] = useState(false);
  
  // Mock rates state
  const [marketRates, setMarketRates] = useState(null);

  // Amortisation schedule table page and search query
  const [tablePage, setTablePage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const pageSize = 12; // 1 year per page

  // Calculate live results instantly on the client
  const results = runCalculations(inputs);
  const { metrics, summaryCards, verdict, breakEvenRate, schedule, scenarios } = results;

  // Load saved scenarios and mock market rates on mount
  useEffect(() => {
    fetchScenarios();
    fetchMarketRates();
  }, []);

  const fetchScenarios = async () => {
    setIsLoadingSaved(true);
    try {
      const res = await fetch(`${API_BASE}/scenarios`);
      if (res.ok) {
        const data = await res.json();
        setSavedScenarios(data);
      }
    } catch (err) {
      console.error('Failed to load scenarios from database:', err);
    } finally {
      setIsLoadingSaved(false);
    }
  };

  const fetchMarketRates = async () => {
    try {
      const res = await fetch(`${API_BASE}/rates`);
      if (res.ok) {
        const data = await res.json();
        setMarketRates(data);
      }
    } catch (err) {
      console.error('Failed to fetch mock interest rates:', err);
    }
  };

  // Sync SWP amount if auto-linked to EMI
  useEffect(() => {
    if (inputs.isAutoLinked) {
      setInputs(prev => ({
        ...prev,
        swp_amount: metrics.monthlyEmi
      }));
    }
  }, [metrics.monthlyEmi, inputs.isAutoLinked]);

  const handleInputChange = (field, value) => {
    setInputs(prev => {
      const newInputs = { ...prev, [field]: value };
      
      // Validation: Down payment cannot exceed vehicle price
      if (field === 'vehicle_price' && prev.down_payment > value) {
        newInputs.down_payment = value;
      }
      if (field === 'down_payment' && value > prev.vehicle_price) {
        newInputs.down_payment = prev.vehicle_price;
      }

      return newInputs;
    });
    setTablePage(1); // reset table page on input change
  };

  // Save scenario
  const handleSaveScenario = async () => {
    if (!newScenarioName.trim()) return;
    setIsSaving(true);
    try {
      const payload = {
        name: newScenarioName,
        vehicle_price: inputs.vehicle_price,
        down_payment: inputs.down_payment,
        loan_tenure: inputs.loan_tenure,
        interest_rate: inputs.interest_rate,
        lump_sum: inputs.lump_sum,
        expected_return: inputs.expected_return,
        swp_amount: inputs.swp_amount,
        swp_start_month: inputs.swp_start_month,
        fund_type: inputs.fund_type,
        emi_start_month: inputs.emi_start_month
      };

      const res = await fetch(`${API_BASE}/scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setShowSaveModal(false);
        setNewScenarioName('');
        fetchScenarios();
      }
    } catch (err) {
      alert('Failed to save scenario to database.');
    } finally {
      setIsSaving(false);
    }
  };

  // Load saved scenario
  const handleLoadScenario = (sc) => {
    setInputs({
      vehicle_price: sc.vehicle_price,
      down_payment: sc.down_payment,
      loan_tenure: sc.loan_tenure,
      interest_rate: sc.interest_rate,
      lump_sum: sc.lump_sum,
      expected_return: sc.expected_return,
      swp_amount: sc.swp_amount,
      swp_start_month: sc.swp_start_month,
      fund_type: sc.fund_type,
      emi_start_month: sc.emi_start_month,
      isAutoLinked: Math.round(sc.swp_amount) === Math.round(calculateEMIFromState(sc))
    });
    setActiveTab('dashboard');
  };

  const calculateEMIFromState = (sc) => {
    const p = sc.vehicle_price - sc.down_payment;
    const r = sc.interest_rate / 12;
    const n = sc.loan_tenure * 12;
    if (p <= 0 || n <= 0 || r <= 0) return 0;
    return (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  };

  // Delete saved scenario
  const handleDeleteScenario = async (id, e) => {
    e.stopPropagation(); // prevent loading scenario
    if (!confirm('Are you sure you want to delete this scenario?')) return;
    try {
      const res = await fetch(`${API_BASE}/scenarios/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchScenarios();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // Export PDF Report
  const handleExportPDF = async () => {
    setExportPdfLoading(true);
    try {
      const res = await fetch(`${API_BASE}/export-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputs)
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Car_Loan_vs_Investment_Report_${Date.now()}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        alert('Failed to generate PDF report.');
      }
    } catch (err) {
      alert('Error communicating with backend server.');
    } finally {
      setExportPdfLoading(false);
    }
  };

  // Export CSV Client-Side
  const handleExportCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Month #,Month,Opening Loan Bal,EMI Paid,Principal Component,Interest Component,Closing Loan Bal,Investment Balance,SWP Withdrawn,Net Cash Flow,% Repaid\n';
    
    schedule.forEach(r => {
      csvContent += `${r.index},${r.month},${Math.round(r.openingLoanBal)},${Math.round(r.emiPaid)},${Math.round(r.principalComp)},${Math.round(r.interestComp)},${Math.round(r.closingLoanBal)},${Math.round(r.openingInvBal)},${Math.round(r.swpWithdrawn)},${Math.round(r.netCashFlow)},${(r.percentLoanRepaid * 100).toFixed(1)}%\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `amortisation_schedule_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Filter schedule based on search query (by month name, e.g. "Jun-26")
  const filteredSchedule = schedule.filter(d => 
    d.month.toLowerCase().includes(searchQuery.toLowerCase()) || 
    d.index.toString() === searchQuery
  );

  // Pagination bounds
  const totalPages = Math.ceil(filteredSchedule.length / pageSize);
  const displayedSchedule = filteredSchedule.slice((tablePage - 1) * pageSize, tablePage * pageSize);

  return (
    <div className="app-container">
      {/* Mobile Title Banner */}
      <div className="mobile-header">
        <h1>🚗 Strategy Portal</h1>
        <button onClick={handleExportPDF} disabled={exportPdfLoading} className="btn-export primary" style={{ padding: '6px 12px', fontSize: '11px' }}>
          {exportPdfLoading ? 'Generating...' : 'PDF Report'}
        </button>
      </div>

      {/* LEFT SIDEBAR PANEL: Controls & Inputs */}
      <aside className="sidebar">
        <div className="brand">
          <h1>🚗 Strategy Portal</h1>
          <p>Car Loan v. Investment Strategy</p>
        </div>

        {/* Inputs Group 1: Car Loan */}
        <div className="control-group">
          <h2 className="control-section-title">🚗 Car Loan Parameters</h2>
          
          <div className="input-field">
            <div className="input-header">
              <label>On-Road Car Price</label>
              <span className="input-val-badge">{formatINR(inputs.vehicle_price)}</span>
            </div>
            <input 
              type="range" 
              min={500000} 
              max={15000000} 
              step={100000} 
              value={inputs.vehicle_price} 
              onChange={(e) => handleInputChange('vehicle_price', Number(e.target.value))}
            />
          </div>

          <div className="input-field">
            <div className="input-header">
              <label>Down Payment</label>
              <span className="input-val-badge">{formatINR(inputs.down_payment)}</span>
            </div>
            <input 
              type="range" 
              min={0} 
              max={inputs.vehicle_price} 
              step={50000} 
              value={inputs.down_payment} 
              onChange={(e) => handleInputChange('down_payment', Number(e.target.value))}
            />
          </div>

          <div className="input-field">
            <div className="input-header">
              <label>Loan Tenure (Years)</label>
              <span className="input-val-badge">{inputs.loan_tenure} Years</span>
            </div>
            <select 
              value={inputs.loan_tenure} 
              onChange={(e) => handleInputChange('loan_tenure', Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(yr => (
                <option key={yr} value={yr}>{yr} {yr === 1 ? 'Year' : 'Years'} ({yr * 12} Months)</option>
              ))}
            </select>
          </div>

          <div className="input-field">
            <div className="input-header">
              <label>Annual Interest Rate (p.a.)</label>
              <span className="input-val-badge">{(inputs.interest_rate * 100).toFixed(2)}%</span>
            </div>
            <input 
              type="range" 
              min={0.05} 
              max={0.20} 
              step={0.001} 
              value={inputs.interest_rate} 
              onChange={(e) => handleInputChange('interest_rate', Number(e.target.value))}
            />
          </div>

          <div className="input-field">
            <div className="input-header">
              <label>Disbursement Month</label>
            </div>
            <input 
              type="month" 
              value={inputs.emi_start_month} 
              onChange={(e) => handleInputChange('emi_start_month', e.target.value)}
            />
          </div>
        </div>

        {/* Inputs Group 2: Investment (SWP) */}
        <div className="control-group">
          <h2 className="control-section-title">💰 Investment Parameters</h2>

          <div className="input-field">
            <div className="input-header">
              <label>Lump Sum Corpus</label>
              <span className="input-val-badge">{formatINR(inputs.lump_sum)}</span>
            </div>
            <input 
              type="range" 
              min={100000} 
              max={20000000} 
              step={100000} 
              value={inputs.lump_sum} 
              onChange={(e) => handleInputChange('lump_sum', Number(e.target.value))}
            />
          </div>

          <div className="input-field">
            <div className="input-header">
              <label>Expected Return Rate</label>
              <span className="input-val-badge">{(inputs.expected_return * 100).toFixed(2)}%</span>
            </div>
            <input 
              type="range" 
              min={0.05} 
              max={0.25} 
              step={0.005} 
              value={inputs.expected_return} 
              onChange={(e) => handleInputChange('expected_return', Number(e.target.value))}
            />
          </div>

          <div className="input-field">
            <div className="input-header">
              <label>Monthly SWP Amount</label>
              <span className="input-val-badge">{formatINR(inputs.swp_amount)}</span>
            </div>
            <input 
              type="range" 
              min={1000} 
              max={250000} 
              step={1000} 
              value={inputs.swp_amount} 
              disabled={inputs.isAutoLinked}
              onChange={(e) => handleInputChange('swp_amount', Number(e.target.value))}
            />
            <div className="checkbox-row">
              <input 
                type="checkbox" 
                id="autolink-emi" 
                checked={inputs.isAutoLinked} 
                onChange={(e) => handleInputChange('isAutoLinked', e.target.checked)}
              />
              <label htmlFor="autolink-emi">Auto-link SWP withdrawal to Monthly EMI</label>
            </div>
          </div>

          <div className="input-field">
            <div className="input-header">
              <label>SWP Start Month</label>
              <span className="input-val-badge">Month {inputs.swp_start_month}</span>
            </div>
            <input 
              type="range" 
              min={1} 
              max={12} 
              step={1} 
              value={inputs.swp_start_month} 
              onChange={(e) => handleInputChange('swp_start_month', Number(e.target.value))}
            />
          </div>

          <div className="input-field">
            <div className="input-header">
              <label>Investment Fund Type</label>
            </div>
            <select 
              value={inputs.fund_type} 
              onChange={(e) => handleInputChange('fund_type', e.target.value)}
            >
              <option value="Equity MF">Equity MF (Large/Mid Cap)</option>
              <option value="Hybrid MF">Hybrid MF (Balanced)</option>
              <option value="Debt MF">Debt MF (Stable returns)</option>
              <option value="Liquid Fund">Liquid Fund (Safe / Low Yield)</option>
            </select>
          </div>
        </div>

        {/* Database Saved Scenarios panel */}
        <div className="saved-scenarios-section">
          <button className="btn-save-scenario" onClick={() => setShowSaveModal(true)}>
            💾 Save Current Scenario
          </button>
          
          <h2 className="control-section-title" style={{ marginTop: '12px' }}>📁 Saved Calculations</h2>
          {isLoadingSaved ? (
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Loading scenarios...</span>
          ) : savedScenarios.length === 0 ? (
            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>No saved scenarios found.</span>
          ) : (
            <div className="saved-list">
              {savedScenarios.map(sc => (
                <div key={sc.id} className="scenario-item" onClick={() => handleLoadScenario(sc)}>
                  <div className="scenario-info">
                    <span className="scenario-name">{sc.name}</span>
                    <span className="scenario-meta">Price: {formatINR(sc.vehicle_price)}</span>
                  </div>
                  <button className="btn-delete" onClick={(e) => handleDeleteScenario(sc.id, e)} title="Delete Scenario">
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* RIGHT WORKSPACE: Tabs navigation & Main display viewport */}
      <main className="main-content">
        <nav className="nav-tabs">
          <button className={`tab-btn ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
            🏠 Home
          </button>
          <button className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            📊 Dashboard
          </button>
          <button className={`tab-btn ${activeTab === 'amortisation' ? 'active' : ''}`} onClick={() => setActiveTab('amortisation')}>
            📋 Amortisation Table
          </button>
          <button className={`tab-btn ${activeTab === 'charts' ? 'active' : ''}`} onClick={() => setActiveTab('charts')}>
            📈 Charts
          </button>
          <button className={`tab-btn ${activeTab === 'scenarios' ? 'active' : ''}`} onClick={() => setActiveTab('scenarios')}>
            🔄 Scenarios
          </button>
          <button className={`tab-btn ${activeTab === 'tips' ? 'active' : ''}`} onClick={() => setActiveTab('tips')}>
            💡 Smart Tips
          </button>
        </nav>

        {/* TAB CONTENTS */}
        <section className="tab-content">
          
          {/* TAB 1: HOME */}
          {activeTab === 'home' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
              <div className="welcome-banner">
                <h2>Optimize Your Net Worth With Smart SWP Strategy</h2>
                <p>
                  Instead of buying a vehicle fully in cash or taking a standalone high-EMI car loan, 
                  Indian investors leverage a <strong>Systematic Withdrawal Plan (SWP)</strong>. 
                  By investing the equivalent capital into an equity/hybrid fund and paying the EMI via SWP, 
                  your money compounds in the market while the asset gets paid off!
                </p>
                <button 
                  onClick={() => setActiveTab('dashboard')} 
                  className="btn-export primary" 
                  style={{ marginTop: '20px', padding: '10px 20px' }}
                >
                  🚀 Launch Live Dashboard
                </button>
              </div>

              {/* Benchmarks grid */}
              <div className="benchmark-section">
                <h3 className="control-section-title" style={{ fontSize: '15px', color: 'var(--color-text-primary)' }}>
                  📌 Indian Market Benchmarks Reference
                </h3>
                <div className="benchmark-grid">
                  <div className="benchmark-card">
                    <h4 className="benchmark-card-title">🏦 Car Loan Rates (SBI/HDFC)</h4>
                    <ul style={{ listStyle: 'none', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--color-text-secondary)' }}>Car Loan Interest:</span>
                        <strong>8.75% – 10.5% p.a.</strong>
                      </li>
                      <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--color-text-secondary)' }}>Average Tenure:</span>
                        <strong>3 – 7 Years</strong>
                      </li>
                      <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--color-text-secondary)' }}>GST on Insurance:</span>
                        <strong>18.00%</strong>
                      </li>
                    </ul>
                  </div>

                  <div className="benchmark-card">
                    <h4 className="benchmark-card-title">📈 Mutual Fund SWP returns</h4>
                    <ul style={{ listStyle: 'none', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--color-text-secondary)' }}>Equity MF Avg:</span>
                        <strong>12.0% – 15.0% p.a.</strong>
                      </li>
                      <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--color-text-secondary)' }}>Balanced MF Avg:</span>
                        <strong>10.0% – 12.0% p.a.</strong>
                      </li>
                      <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--color-text-secondary)' }}>Nifty 50 10Y CAGR:</span>
                        <strong>~12.8% p.a.</strong>
                      </li>
                    </ul>
                  </div>

                  <div className="benchmark-card">
                    <h4 className="benchmark-card-title">💸 Indian Tax Code & Inflation</h4>
                    <ul style={{ listStyle: 'none', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--color-text-secondary)' }}>LTCG Tax (&gt;1Yr):</span>
                        <strong>10% above ₹1L gain</strong>
                      </li>
                      <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--color-text-secondary)' }}>STCG Tax (&lt;1Yr):</span>
                        <strong>15% of total gains</strong>
                      </li>
                      <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--color-text-secondary)' }}>Inflation (CPI avg):</span>
                        <strong>~5.0% – 6.0% p.a.</strong>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LIVE DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div>
              {/* Verdict callout */}
              <div className={`verdict-box ${verdict.class}`}>
                <span className="verdict-title">Verdict</span>
                <span className="verdict-text">{verdict.text}</span>
              </div>

              {/* 4 Summary KPIs */}
              <div className="summary-grid">
                <div className="kpi-card">
                  <div className="kpi-label">Final Investment Balance</div>
                  <div className={`kpi-value ${summaryCards.finalInvBalance > 0 ? 'positive' : 'negative'}`}>
                    {formatINR(summaryCards.finalInvBalance)}
                  </div>
                  <div className="kpi-subtext">Remaining corpus value</div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-label">Total SWP Drawn</div>
                  <div className="kpi-value">{formatINR(summaryCards.totalSWPDrawn)}</div>
                  <div className="kpi-subtext">Used to fund car loan EMIs</div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-label">Net Strategy Gain</div>
                  <div className={`kpi-value ${summaryCards.netGainLoss > 0 ? 'positive' : 'negative'}`}>
                    {formatINR(summaryCards.netGainLoss)}
                  </div>
                  <div className="kpi-subtext">Balance + SWP - Lump Sum</div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-label">Strategy ROI</div>
                  <div className={`kpi-value ${summaryCards.roi > 0 ? 'positive' : 'negative'}`}>
                    {(summaryCards.roi * 100).toFixed(1)}%
                  </div>
                  <div className="kpi-subtext">Return on lump sum corpus</div>
                </div>
              </div>

              {/* Detail sheets side-by-side */}
              <div className="detail-grid">
                <div className="details-panel">
                  <h3 className="details-panel-title">⚡ Live Computed Loan Metrics</h3>
                  <div className="detail-row">
                    <span className="detail-label">Loan Principal Amount:</span>
                    <span className="detail-value">{formatINR(metrics.loanPrincipal)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Monthly EMI Output:</span>
                    <span className="detail-value">{formatINR(metrics.monthlyEmi)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Total Interest Payable:</span>
                    <span className="detail-value">{formatINR(metrics.totalInterest)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Total Payment (P + I):</span>
                    <span className="detail-value">{formatINR(metrics.totalPayable)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Loan-to-Value (LTV) Ratio:</span>
                    <span className="detail-value">{(metrics.loanToValueRatio * 100).toFixed(1)}%</span>
                  </div>
                </div>

                <div className="details-panel">
                  <h3 className="details-panel-title">📊 Investment & SWP Snapshot</h3>
                  <div className="detail-row">
                    <span className="detail-label">Expected Monthly Return:</span>
                    <span className="detail-value">{formatINR(metrics.monthlyInvReturnAmount)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Monthly Withdrawal (SWP):</span>
                    <span className="detail-value">{formatINR(metrics.firstMonthSWP)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Monthly Surplus / Deficit:</span>
                    <span className={`detail-value ${metrics.surplusDeficit >= 0 ? 'positive' : 'negative'}`}>
                      {formatINR(metrics.surplusDeficit)}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">SWP-to-EMI Coverage Ratio:</span>
                    <span className="detail-value">{(metrics.swpCoverageRatio * 100).toFixed(1)}%</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Break-Even Return Rate:</span>
                    <span className="detail-value" style={{ color: 'var(--color-accent)' }}>
                      {(breakEvenRate * 100).toFixed(2)}% p.a.
                    </span>
                  </div>
                </div>
              </div>

              {/* Action row */}
              <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end' }}>
                <button onClick={handleExportPDF} disabled={exportPdfLoading} className="btn-export primary">
                  📥 {exportPdfLoading ? 'Generating PDF...' : 'Download PDF Executive Report'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: AMORTISATION TABLE */}
          {activeTab === 'amortisation' && (
            <div className="table-container">
              <div className="table-header-controls">
                <input 
                  type="text" 
                  className="table-search-input"
                  placeholder="🔍 Search month (e.g. Jun-26)..." 
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setTablePage(1); }}
                />
                
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={handleExportCSV} className="btn-export">
                    📄 Export to CSV
                  </button>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Month #</th>
                    <th>Month Name</th>
                    <th>Opening Bal (₹)</th>
                    <th>EMI Paid (₹)</th>
                    <th>Principal (₹)</th>
                    <th>Interest (₹)</th>
                    <th>Closing Bal (₹)</th>
                    <th>Investment Bal (₹)</th>
                    <th>SWP Drawn (₹)</th>
                    <th>Cash Flow (₹)</th>
                    <th>% Repaid</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedSchedule.map(r => (
                    <tr key={r.index}>
                      <td><strong>{r.index}</strong></td>
                      <td>{r.month}</td>
                      <td>{formatNumber(r.openingLoanBal)}</td>
                      <td style={{ color: r.emiPaid > 0 ? 'var(--color-error)' : 'inherit' }}>
                        {r.emiPaid > 0 ? `-${formatNumber(r.emiPaid)}` : '0'}
                      </td>
                      <td>{formatNumber(r.principalComp)}</td>
                      <td>{formatNumber(r.interestComp)}</td>
                      <td>{formatNumber(r.closingLoanBal)}</td>
                      <td style={{ color: 'var(--color-success)', fontWeight: '500' }}>
                        {formatNumber(r.openingInvBal)}
                      </td>
                      <td style={{ color: 'var(--color-success)' }}>
                        {r.swpWithdrawn > 0 ? `+${formatNumber(r.swpWithdrawn)}` : '0'}
                      </td>
                      <td style={{ color: r.netCashFlow > 0 ? 'var(--color-success)' : r.netCashFlow < 0 ? 'var(--color-error)' : 'inherit' }}>
                        {r.netCashFlow > 0 ? `+${formatNumber(r.netCashFlow)}` : r.netCashFlow < 0 ? `-${formatNumber(Math.abs(r.netCashFlow))}` : '0'}
                      </td>
                      <td>{(r.percentLoanRepaid * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                  {displayedSchedule.length === 0 && (
                    <tr>
                      <td colSpan={11} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '24px' }}>
                        No records match the query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="pagination">
                  <span>Page {tablePage} of {totalPages} (Showing {displayedSchedule.length} rows)</span>
                  <div className="pagination-btn-group">
                    <button 
                      className="btn-page" 
                      disabled={tablePage === 1} 
                      onClick={() => setTablePage(p => p - 1)}
                    >
                      ◀ Previous
                    </button>
                    <button 
                      className="btn-page" 
                      disabled={tablePage === totalPages} 
                      onClick={() => setTablePage(p => p + 1)}
                    >
                      Next ▶
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: CHARTS */}
          {activeTab === 'charts' && (
            <div>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <button 
                  className={`btn-export ${activeChart === 'balances' ? 'primary' : ''}`}
                  onClick={() => setActiveChart('balances')}
                >
                  📉 Loan Balance vs Investment
                </button>
                <button 
                  className={`btn-export ${activeChart === 'composition' ? 'primary' : ''}`}
                  onClick={() => setActiveChart('composition')}
                >
                  📊 EMI Composition (P vs I)
                </button>
                <button 
                  className={`btn-export ${activeChart === 'cashflow' ? 'primary' : ''}`}
                  onClick={() => setActiveChart('cashflow')}
                >
                  💵 SWP vs EMI Monthly Flows
                </button>
              </div>

              <div className="chart-container-card">
                <StrategyCharts schedule={schedule} chartType={activeChart} />
              </div>
            </div>
          )}

          {/* TAB 5: SCENARIOS */}
          {activeTab === 'scenarios' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Break-even banner */}
              <div className="verdict-box excellent" style={{ borderLeftColor: 'var(--color-accent)' }}>
                <span className="verdict-title" style={{ color: 'var(--color-accent)' }}>🎯 Break-Even Analysis</span>
                <span className="verdict-text">
                  Minimum expected return required to cover all EMIs from SWP without depleting the lump sum: &nbsp;
                  <strong style={{ color: 'var(--color-accent)', fontSize: '18px' }}>
                    {(breakEvenRate * 100).toFixed(2)}% p.a.
                  </strong>
                </span>
              </div>

              {/* Scenarios Table */}
              <div className="table-container">
                <div className="table-header-controls">
                  <span style={{ fontSize: '13px', fontWeight: 'bold' }}>
                    📊 SENSITIVITY TABLE – Expected Return Rate vs Outcomes
                  </span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Expected Return</th>
                      <th>Final Inv. Balance (₹)</th>
                      <th>Total EMI Paid (₹)</th>
                      <th>Total SWP Drawn (₹)</th>
                      <th>Net Gain/Loss (₹)</th>
                      <th>EMI Covered?</th>
                      <th>Corpus Remaining?</th>
                      <th>Advisory Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map((sc, idx) => {
                      const isLoss = sc.netGainLoss < 0;
                      const isDepleted = sc.corpusRemaining.includes('Depleted');
                      return (
                        <tr key={idx} style={{ 
                          borderLeft: Math.round(inputs.expected_return * 100) === Math.round(sc.annualReturn * 100)
                            ? '3px solid var(--color-accent)' 
                            : 'none'
                        }}>
                          <td><strong>{sc.annualReturnPercentStr}</strong></td>
                          <td>{formatNumber(sc.finalInvBalance)}</td>
                          <td>{formatNumber(sc.totalEMIPaid)}</td>
                          <td>{formatNumber(sc.totalSWPDrawn)}</td>
                          <td style={{ 
                            color: isLoss ? 'var(--color-error)' : 'var(--color-success)', 
                            fontWeight: '600' 
                          }}>
                            {isLoss ? '-' : '+'}{formatNumber(Math.abs(sc.netGainLoss))}
                          </td>
                          <td>
                            <span className={`rating-pill ${sc.emiCovered.includes('YES') ? 'success' : 'error'}`}>
                              {sc.emiCovered}
                            </span>
                          </td>
                          <td>
                            <span className={`rating-pill ${isDepleted ? 'error' : 'success'}`}>
                              {sc.corpusRemaining.replace('✅ ', '').replace('❌ ', '')}
                            </span>
                          </td>
                          <td>{sc.rating.replace('⭐', '').replace('🌟', '').trim()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: SMART TIPS */}
          {activeTab === 'tips' && (
            <div className="tips-container">
              <div className="tip-card">
                <span className="tip-icon">🏦</span>
                <div className="tip-content">
                  <h4 className="tip-title">Fund Selection (SWP)</h4>
                  <p className="tip-text">
                    For active SWPs, choose stable, large-cap equity mutual funds or balanced hybrid funds 
                    offering steady 12-14% long-term historical returns. Avoid volatile small-cap/mid-cap funds for active SWP 
                    to protect against sequence-of-returns risk.
                  </p>
                </div>
              </div>

              <div className="tip-card">
                <span className="tip-icon">📊</span>
                <div className="tip-content">
                  <h4 className="tip-title">SEBI Guidelines</h4>
                  <p className="tip-text">
                    Under SEBI mandates, the minimum monthly SWP payout is typically ₹500. Most Asset Management 
                    Companies (AMCs) support monthly, quarterly, or half-yearly withdrawal schedules.
                  </p>
                </div>
              </div>

              <div className="tip-card">
                <span className="tip-icon">💸</span>
                <div className="tip-content">
                  <h4 className="tip-title">Indian Taxation Hack</h4>
                  <p className="tip-text">
                    Long Term Capital Gains (LTCG) on equity mutual fund SWPs is taxed at 10% on gains exceeding 
                    ₹1 lakh per year. Short Term Capital Gains (STCG) (within 1 year of unit purchase) is taxed at 15%.
                  </p>
                </div>
              </div>

              <div className="tip-card">
                <span className="tip-icon">🚗</span>
                <div className="tip-content">
                  <h4 className="tip-title">Dealer Price Negotiations</h4>
                  <p className="tip-text">
                    Always negotiate the final on-road price of the car BEFORE disclosing your financing method. 
                    Dealers frequently inflate prices or add high commissions to loans they broker themselves.
                  </p>
                </div>
              </div>

              <div className="tip-card">
                <span className="tip-icon">📈</span>
                <div className="tip-content">
                  <h4 className="tip-title">CAGR vs Reality</h4>
                  <p className="tip-text">
                    While the Indian Nifty 50 has returned a 12-13% CAGR over the last 15-20 years, stock markets 
                    do not move in a straight line. Prepare for down years by maintaining a debt buffer.
                  </p>
                </div>
              </div>

              <div className="tip-card">
                <span className="tip-icon">⚠️</span>
                <div className="tip-content">
                  <h4 className="tip-title">Risk Buffer Emergency Fund</h4>
                  <p className="tip-text">
                    Always keep at least 6 months of loan EMIs in a liquid savings account or liquid fund. 
                    This buffers you against potential SWP halts or market downturns.
                  </p>
                </div>
              </div>
            </div>
          )}

        </section>
      </main>

      {/* SAVE SCENARIO MODAL WINDOW */}
      {showSaveModal && (
        <div className="modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <span className="modal-title">💾 Save Scenario</span>
            <div className="input-field">
              <label>Scenario Name</label>
              <input 
                type="text" 
                placeholder="e.g. Fortuner Loan vs Nifty SWP" 
                value={newScenarioName}
                onChange={(e) => setNewScenarioName(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button className="btn-export" onClick={() => setShowSaveModal(false)}>
                Cancel
              </button>
              <button 
                className="btn-export primary" 
                onClick={handleSaveScenario}
                disabled={isSaving || !newScenarioName.trim()}
              >
                {isSaving ? 'Saving...' : 'Save Scenario'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

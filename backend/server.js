const express = require('express');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const { runAllCalculations } = require('./calculations');
const { initDb, saveScenario, getScenarios, getScenarioById, deleteScenario } = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Initialize SQLite database
initDb();

// Helper to format currency in Indian system
function formatINR(value) {
  if (value === null || value === undefined || isNaN(value)) return '₹0';
  const isNegative = value < 0;
  const absValue = Math.abs(Math.round(value));
  const str = absValue.toString();
  let lastThree = str.substring(str.length - 3);
  const otherNumbers = str.substring(0, str.length - 3);
  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  const res = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;
  return (isNegative ? '-₹' : '₹') + res;
}

// 1. Calculations Endpoint
app.post('/api/calculate', (req, res) => {
  try {
    const results = runAllCalculations(req.body);
    res.json(results);
  } catch (error) {
    console.error('Error in calculation endpoint:', error);
    res.status(500).json({ error: 'Failed to run calculations.' });
  }
});

// 2. Mock Interest Rates API
app.get('/api/rates', (req, res) => {
  res.json({
    car_loans: [
      { bank: 'SBI Car Loan', rate: '8.75% - 9.75% p.a.', type: 'Floating/Fixed' },
      { bank: 'HDFC Bank', rate: '8.80% - 10.50% p.a.', type: 'Fixed' },
      { bank: 'ICICI Bank', rate: '8.85% - 10.25% p.a.', type: 'Fixed' },
      { bank: 'Axis Bank', rate: '9.10% - 11.10% p.a.', type: 'Fixed' }
    ],
    investments: [
      { name: 'Large Cap MFs (e.g. Mirae/HDFC)', expected: '12% - 14% p.a.', risk: 'Moderate' },
      { name: 'Flexi Cap MFs (e.g. Parag Parikh)', expected: '13% - 15% p.a.', risk: 'Moderate-High' },
      { name: 'Mid Cap MFs (e.g. Kotak/Axis)', expected: '14% - 16% p.a.', risk: 'High' },
      { name: 'Small Cap MFs (e.g. Nippon/SBI)', expected: '15% - 18% p.a.', risk: 'Very High' },
      { name: 'Fixed Deposits (SBI/HDFC)', expected: '6.5% - 7.5% p.a.', risk: 'Zero' }
    ],
    market_metrics: {
      inflation: '5.2% p.a.',
      nifty_50_cagr_10y: '12.8%',
      sensex_cagr_20y: '14.1%'
    }
  });
});

// 3. Saved Scenarios APIs
app.get('/api/scenarios', async (req, res) => {
  try {
    const list = await getScenarios();
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve scenarios.' });
  }
});

app.post('/api/scenarios', async (req, res) => {
  try {
    const saved = await saveScenario(req.body);
    res.json(saved);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save scenario.' });
  }
});

app.get('/api/scenarios/:id', async (req, res) => {
  try {
    const item = await getScenarioById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Scenario not found' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch scenario.' });
  }
});

app.delete('/api/scenarios/:id', async (req, res) => {
  try {
    await deleteScenario(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete scenario.' });
  }
});

// 4. PDF Export Endpoint
app.post('/api/export-pdf', (req, res) => {
  try {
    const results = runAllCalculations(req.body);
    const { inputs, metrics, summaryCards, verdict, breakEvenRate } = results;

    const doc = new PDFDocument({ margin: 40 });
    
    // Set headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Car_Loan_vs_Investment_Report.pdf"`);
    doc.pipe(res);

    // Header Block
    doc.rect(40, 40, 532, 60).fill('#0B192C');
    doc.fillColor('#FFFFFF')
       .font('Helvetica-Bold')
       .fontSize(16)
       .text('CAR LOAN vs INVESTMENT STRATEGY REPORT', 50, 52)
       .fontSize(10)
       .font('Helvetica')
       .text('SWP Intelligence Analysis for Indian Investors', 50, 75);

    // Date
    doc.fillColor('#333333')
       .fontSize(8)
       .text(`Report Generated: ${new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}`, 420, 110, { align: 'right' });

    // Verdict Callout Box
    let verdictBg = '#E8F5E9'; // green
    let verdictTextCol = '#2E7D32';
    if (verdict.class === 'close') {
      verdictBg = '#FFF3E0'; // orange
      verdictTextCol = '#EF6C00';
    } else if (verdict.class === 'shortfall') {
      verdictBg = '#FFEBEE'; // red
      verdictTextCol = '#C62828';
    }

    doc.rect(40, 130, 532, 45).fill(verdictBg);
    doc.fillColor(verdictTextCol)
       .font('Helvetica-Bold')
       .fontSize(10)
       .text('STRATEGY VERDICT:', 50, 140)
       .font('Helvetica')
       .fontSize(11)
       .text(verdict.text, 50, 155);

    // Two Column Parameter Layout
    doc.y = 195;
    
    // Column 1: Car Loan Parameters
    doc.fillColor('#0B192C').font('Helvetica-Bold').fontSize(11).text('🚗 CAR LOAN PARAMETERS', 40, 195);
    doc.strokeColor('#CCCCCC').lineWidth(0.5).moveTo(40, 210).lineTo(280, 210).stroke();
    
    let y = 220;
    const loanFields = [
      { label: 'Vehicle Price (On-Road)', val: formatINR(inputs.vehicle_price) },
      { label: 'Down Payment', val: formatINR(inputs.down_payment) },
      { label: 'Loan Principal', val: formatINR(metrics.loanPrincipal) },
      { label: 'Loan Tenure', val: `${inputs.loan_tenure} Years (${inputs.loan_tenure * 12} Months)` },
      { label: 'Interest Rate (p.a.)', val: `${(inputs.interest_rate * 100).toFixed(2)}%` },
      { label: 'Monthly EMI', val: formatINR(metrics.monthlyEmi) }
    ];
    loanFields.forEach(f => {
      doc.fillColor('#555555').font('Helvetica').fontSize(9).text(f.label, 40, y);
      doc.fillColor('#000000').font('Helvetica-Bold').text(f.val, 180, y, { align: 'right', width: 100 });
      y += 18;
    });

    // Column 2: Investment (SWP) Parameters
    doc.fillColor('#0B192C').font('Helvetica-Bold').fontSize(11).text('💰 INVESTMENT & SWP PARAMETERS', 312, 195);
    doc.strokeColor('#CCCCCC').lineWidth(0.5).moveTo(312, 210).lineTo(572, 210).stroke();
    
    y = 220;
    const invFields = [
      { label: 'Lump Sum Investment', val: formatINR(inputs.lump_sum) },
      { label: 'Expected Return (p.a.)', val: `${(inputs.expected_return * 100).toFixed(2)}%` },
      { label: 'Expected Return Type', val: inputs.fund_type },
      { label: 'Monthly SWP Amount', val: formatINR(inputs.swp_amount) },
      { label: 'SWP Start Month', val: `Month ${inputs.swp_start_month}` },
      { label: 'Break-Even Return Rate', val: `${(breakEvenRate * 100).toFixed(2)}% p.a.` }
    ];
    invFields.forEach(f => {
      doc.fillColor('#555555').font('Helvetica').fontSize(9).text(f.label, 312, y);
      doc.fillColor('#000000').font('Helvetica-Bold').text(f.val, 452, y, { align: 'right', width: 120 });
      y += 18;
    });

    // Summary Cards (Performance Snapshot)
    doc.rect(40, 350, 532, 70).fill('#F5F7F8');
    doc.fillColor('#333333').font('Helvetica-Bold').fontSize(10).text('STRATEGY PERFORMANCE SNAPSHOT (End of Loan Tenure)', 50, 360);
    
    // KPI grid
    doc.font('Helvetica').fontSize(8).fillColor('#666666').text('Final Inv. Balance', 50, 385);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0B192C').text(formatINR(summaryCards.finalInvBalance), 50, 397);

    doc.font('Helvetica').fontSize(8).fillColor('#666666').text('Total SWP Drawn', 180, 385);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0B192C').text(formatINR(summaryCards.totalSWPDrawn), 180, 397);

    doc.font('Helvetica').fontSize(8).fillColor('#666666').text('Net Strategy Gain', 310, 385);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(verdictTextCol).text(formatINR(summaryCards.netGainLoss), 310, 397);

    doc.font('Helvetica').fontSize(8).fillColor('#666666').text('Return on Investment', 450, 385);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0B192C').text(`${(summaryCards.roi * 100).toFixed(1)}%`, 450, 397);

    // Sensitivity Table Section
    doc.fillColor('#0B192C').font('Helvetica-Bold').fontSize(11).text('🔄 EXPECTED RETURN SENSITIVITY TABLE', 40, 445);
    doc.strokeColor('#CCCCCC').lineWidth(0.5).moveTo(40, 460).lineTo(572, 460).stroke();

    // Table Header
    y = 475;
    doc.rect(40, y, 532, 20).fill('#0B192C');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
    doc.text('Annual Return', 45, y + 6);
    doc.text('Final Inv. Bal (Rs)', 150, y + 6);
    doc.text('Total SWP (Rs)', 260, y + 6);
    doc.text('Net Gain/Loss (Rs)', 350, y + 6);
    doc.text('Corpus status', 450, y + 6);
    doc.text('Rating', 525, y + 6);

    // Table Rows
    y += 20;
    doc.font('Helvetica').fontSize(8).fillColor('#000000');
    results.scenarios.forEach((sc, idx) => {
      // Alternating row background
      if (idx % 2 === 0) {
        doc.rect(40, y, 532, 18).fill('#F9F9F9');
      }
      doc.fillColor('#333333');
      doc.text(sc.annualReturnPercentStr.split(' ')[0] + ' ' + sc.annualReturnPercentStr.split(' ')[1], 45, y + 5);
      doc.text(formatINR(sc.finalInvBalance), 150, y + 5);
      doc.text(formatINR(sc.totalSWPDrawn), 260, y + 5);
      
      const isNetNegative = sc.netGainLoss < 0;
      doc.fillColor(isNetNegative ? '#C62828' : '#2E7D32');
      doc.text(formatINR(sc.netGainLoss), 350, y + 5);
      
      doc.fillColor(sc.corpusRemaining.includes('Depleted') ? '#C62828' : '#2E7D32');
      doc.text(sc.corpusRemaining.replace('✅ ', '').replace('❌ ', ''), 450, y + 5);
      
      doc.fillColor('#333333');
      doc.text(sc.rating.replace('⭐', '').replace('🌟', '').trim(), 525, y + 5);
      y += 18;
    });

    // Disclaimer
    doc.fillColor('#777777')
       .font('Helvetica-Oblique')
       .fontSize(7)
       .text('Disclaimer: This report is generated dynamically for educational purposes. Investment in mutual funds is subject to market risk. Past performance does not guarantee future outcomes.', 40, y + 30, { align: 'center', width: 532 });

    doc.end();
  } catch (error) {
    console.error('Error exporting PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF report.' });
  }
});

// Start Server
// Auth routes
const authRouter = require('./auth');
app.use('/api/auth', authRouter);

// Start Server
app.listen(PORT, () => {
  console.log(`Backend Server running on port ${PORT}`);
});

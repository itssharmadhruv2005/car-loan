// Mathematical calculations engine matching Excel formulas

// Standard PMT formula equivalent to find monthly EMI
function calculateEMI(principal, annualRate, tenureYears) {
  const p = Number(principal);
  const r = Number(annualRate) / 12;
  const n = Number(tenureYears) * 12;

  if (p <= 0 || n <= 0) return 0;
  if (r <= 0) return p / n;

  return (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// Bisection method to solve for RATE function (analogous to Excel's RATE)
function findRate(nper, pmt, pv, fv = 0, type = 0) {
  const MAX_ITERATIONS = 150;
  const TOLERANCE = 1e-9;

  let low = -0.99 / 12; 
  let high = 5.0 / 12;  
  
  const f = (r) => {
    if (Math.abs(r) < 1e-12) {
      return pv + pmt * nper + fv;
    }
    const t1 = Math.pow(1 + r, nper);
    if (type === 1) {
      return pv * t1 + pmt * (1 + r) * (t1 - 1) / r + fv;
    } else {
      return pv * t1 + pmt * (t1 - 1) / r + fv;
    }
  };

  let f_low = f(low);
  let f_high = f(high);

  if (f_low * f_high > 0) {
    if (f_low > 0) {
      low = -0.9999 / 12;
      f_low = f(low);
    } else {
      high = 10.0 / 12;
      f_high = f(high);
    }
  }

  if (f_low * f_high > 0) {
    return 0; // Root not bracketed, fallback
  }

  let mid = 0;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    mid = (low + high) / 2;
    const f_mid = f(mid);
    if (Math.abs(f_mid) < TOLERANCE) {
      return mid;
    }
    if (f_low * f_mid < 0) {
      high = mid;
      f_high = f_mid;
    } else {
      low = mid;
      f_low = f_mid;
    }
  }
  return mid;
}

// Date helper to increment month strings
function getMonthLabel(startMonthStr, monthIndex) {
  try {
    let year = parseInt(startMonthStr.substring(0, 4));
    let month = parseInt(startMonthStr.substring(5, 7)); // 1-indexed

    // Add monthIndex - 1 months
    month += (monthIndex - 1);
    
    // Adjust year/month overflow
    year += Math.floor((month - 1) / 12);
    month = ((month - 1) % 12) + 1;

    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }).replace(' ', '-');
  } catch (e) {
    return `Month-${monthIndex}`;
  }
}

function runAllCalculations(inputs) {
  const vehiclePrice = Number(inputs.vehicle_price) || 0;
  const downPayment = Number(inputs.down_payment) || 0;
  const loanTenure = Number(inputs.loan_tenure) || 0;
  const interestRate = Number(inputs.interest_rate) || 0; // decimal, e.g. 0.09 for 9%
  const emiStartMonth = inputs.emi_start_month || new Date().toISOString().substring(0, 7);

  const lumpSum = Number(inputs.lump_sum) || 0;
  const expectedReturn = Number(inputs.expected_return) || 0; // decimal, e.g. 0.12 for 12%
  const swpStartMonth = Number(inputs.swp_start_month) || 1;
  const fundType = inputs.fund_type || 'Equity MF';

  // Computed values
  const loanPrincipal = Math.max(vehiclePrice - downPayment, 0);
  const tenureMonths = loanTenure * 12;
  const monthlyEmi = calculateEMI(loanPrincipal, interestRate, loanTenure);
  
  // SWP Monthly Amount default to EMI if not custom specified or equals 0
  const isAutoLinked = !inputs.swp_amount || Number(inputs.swp_amount) <= 0;
  const swpAmount = isAutoLinked ? monthlyEmi : Number(inputs.swp_amount);

  const totalEMI = monthlyEmi * tenureMonths;
  const totalInterest = Math.max(totalEMI - loanPrincipal, 0);
  const totalPayable = totalEMI;

  const monthlyInvReturnRate = expectedReturn / 12;
  const monthlyInvReturnAmount = lumpSum * monthlyInvReturnRate;
  
  // Amortisation Schedule & Investment Tracker (up to 84 months, or dynamically up to tenureMonths)
  // We'll calculate up to Math.max(tenureMonths, 84) to match the Excel sheet's 84 months grid
  const maxDisplayMonths = Math.max(tenureMonths, 84);
  const schedule = [];
  
  let currentLoanBal = loanPrincipal;
  let currentInvBal = lumpSum;
  let totalSWPDrawn = 0;
  let finalInvBalance = 0;

  for (let m = 1; m <= maxDisplayMonths; m++) {
    const monthLabel = getMonthLabel(emiStartMonth, m);

    // Loan Schedule
    const openingLoanBal = currentLoanBal;
    let emiPaid = 0;
    let interestComp = 0;
    let principalComp = 0;
    let closingLoanBal = 0;

    if (m <= tenureMonths && openingLoanBal > 0) {
      emiPaid = monthlyEmi;
      interestComp = Math.round(openingLoanBal * (interestRate / 12));
      principalComp = emiPaid - interestComp;
      closingLoanBal = Math.max(openingLoanBal - principalComp, 0);
      currentLoanBal = closingLoanBal;
    } else {
      emiPaid = 0;
      interestComp = 0;
      principalComp = 0;
      closingLoanBal = 0;
      currentLoanBal = 0;
    }

    // Investment / SWP Tracker
    const openingInvBal = currentInvBal;
    let swpWithdrawn = 0;
    let closingInvBal = 0;

    if (openingInvBal > 0) {
      if (m >= swpStartMonth) {
        swpWithdrawn = swpAmount;
      }
      closingInvBal = Math.max((openingInvBal * (1 + monthlyInvReturnRate)) - swpWithdrawn, 0);
      currentInvBal = closingInvBal;
      totalSWPDrawn += swpWithdrawn;
    } else {
      swpWithdrawn = 0;
      closingInvBal = 0;
      currentInvBal = 0;
    }

    const netCashFlow = swpWithdrawn - emiPaid;
    const percentLoanRepaid = loanPrincipal > 0 ? (1 - closingLoanBal / loanPrincipal) : 1;

    // Record the month's metrics
    schedule.push({
      index: m,
      month: monthLabel,
      openingLoanBal,
      emiPaid,
      principalComp,
      interestComp,
      closingLoanBal,
      openingInvBal,
      swpWithdrawn,
      closingInvBal,
      netCashFlow,
      percentLoanRepaid
    });

    // Capture the balance at the end of the loan tenure
    if (m === tenureMonths) {
      finalInvBalance = closingInvBal;
    }
  }

  // If display length is longer, final balance might be from the actual end of loan tenure (as per Excel B8 INDIRECT formula)
  // Let's make sure it matches Calc!B8 which gets '📋 Amortisation'!H at Row (TenureMonths + 4)
  // Note: month index is 1-based, index `tenureMonths` represents Month `tenureMonths`.
  // Wait! Calc!B8 formula: `INDIRECT("'📋 Amortisation'!H"&(B3+4))` where B3 is tenureMonths.
  // Since Row 5 is header, Row 6 is Month 1, Row `t` is Month `t - 5`.
  // So row `B3 + 4` = `tenureMonths + 4`, which represents Month `tenureMonths - 1` (Month 83)!
  // Why does the Excel workbook use `B3 + 4` instead of `B3 + 5`? It appears to be a small typo in the original workbook that grabs Month 83 instead of 84.
  // In our code, we will support the ACCURATE final balance at Month `tenureMonths` (which is `schedule[tenureMonths - 1].closingInvBal`), but we can also match the exact cell if required. Let's provide the actual correct final balance at `tenureMonths` but note it clearly, or match it exactly. Let's return the correct one (Month tenureMonths) and fallback to Excel's off-by-one check if requested.
  const actualFinalInvBalance = schedule[tenureMonths - 1] ? schedule[tenureMonths - 1].closingInvBal : 0;
  
  // Total SWP drawn during loan tenure
  let tenureSWPDrawn = 0;
  for (let m = 0; m < tenureMonths; m++) {
    if (schedule[m]) {
      tenureSWPDrawn += schedule[m].swpWithdrawn;
    }
  }

  const netGainLoss = actualFinalInvBalance + tenureSWPDrawn - lumpSum;
  const roi = lumpSum > 0 ? (netGainLoss / lumpSum) : 0;

  // Verdict calculation
  let verdictText = '';
  let verdictClass = 'info';
  if (actualFinalInvBalance > 0) {
    if (netGainLoss > 0) {
      verdictText = `✅ EXCELLENT! Investment MORE than covers loan! Net Gain: Rs. ${Math.round(netGainLoss).toLocaleString('en-IN')}`;
      verdictClass = 'excellent';
    } else {
      verdictText = `⚠️ CLOSE! Small shortfall of Rs. ${Math.round(Math.abs(netGainLoss)).toLocaleString('en-IN')}`;
      verdictClass = 'close';
    }
  } else {
    verdictText = `❌ SHORTFALL: Investment depleted during tenure. Increase corpus.`;
    verdictClass = 'shortfall';
  }

  // Break-even return rate (annualised)
  // RATE solving: rate(nper, -emi, lumpSum, 0, 0)
  const monthlyRateSolve = findRate(tenureMonths, -monthlyEmi, lumpSum, 0, 0);
  const breakEvenAnnualRate = monthlyRateSolve * 12;

  // Sensitivity Scenarios (6%, 8%, 10%, 12%, 14%, 16%, 18%)
  const rates = [0.06, 0.08, 0.10, 0.12, 0.14, 0.16, 0.18];
  const ratings = ['⭐ Conservative', '⭐⭐ Moderate', '⭐⭐⭐ Good', '⭐⭐⭐⭐ Very Good', '🌟 Excellent', '🌟🌟 Outstanding', '🌟🌟🌟 Exceptional'];
  const scenarios = rates.map((r, idx) => {
    // Formula for final balance without capping at zero (matches Excel's scenario tab B10:B16):
    // Final = S0*(1+r)^N - W*((1+r)^N - 1)/r
    const r_m = r / 12;
    const t_factor = Math.pow(1 + r_m, tenureMonths);
    
    let theoreticalFinalBalance = 0;
    if (r_m === 0) {
      theoreticalFinalBalance = lumpSum - swpAmount * tenureMonths;
    } else {
      theoreticalFinalBalance = (lumpSum * t_factor) - (swpAmount * (t_factor - 1) / r_m);
    }

    const totalSWP = swpAmount * tenureMonths;
    const netGain = theoreticalFinalBalance - lumpSum + totalSWP;
    const emiCovered = totalSWP >= totalEMI ? '✅ YES' : '❌ NO';
    
    // Status message for corpus remaining (capping visual text)
    const corpusRemainingText = theoreticalFinalBalance > 0 
      ? `✅ ₹${Math.round(theoreticalFinalBalance).toLocaleString('en-IN')} left` 
      : '❌ Depleted';

    return {
      annualReturn: r,
      annualReturnPercentStr: `${(r * 100).toFixed(0)}% (${idx === 0 ? 'FD/RD' : idx === 1 ? 'Debt MF' : idx === 2 ? 'Balanced' : idx === 3 ? 'Equity MF' : idx === 4 ? 'Large Cap' : idx === 5 ? 'Mid Cap' : 'Small Cap'})`,
      finalInvBalance: theoreticalFinalBalance,
      totalEMIPaid: totalEMI,
      totalSWPDrawn: totalSWP,
      netGainLoss: netGain,
      emiCovered,
      corpusRemaining: corpusRemainingText,
      rating: ratings[idx]
    };
  });

  return {
    inputs: {
      vehicle_price: vehiclePrice,
      down_payment: downPayment,
      loan_tenure: loanTenure,
      interest_rate: interestRate,
      emi_start_month: emiStartMonth,
      lump_sum: lumpSum,
      expected_return: expectedReturn,
      swp_amount: swpAmount,
      swp_start_month: swpStartMonth,
      fund_type: fundType,
      isAutoLinked
    },
    metrics: {
      loanPrincipal,
      monthlyEmi,
      totalInterest,
      totalPayable,
      monthlyInvReturnAmount,
      firstMonthSWP: swpAmount,
      surplusDeficit: swpAmount - monthlyEmi,
      swpCoverageRatio: monthlyEmi > 0 ? (swpAmount / monthlyEmi) : 0,
      loanToValueRatio: vehiclePrice > 0 ? (loanPrincipal / vehiclePrice) : 0
    },
    summaryCards: {
      finalInvBalance: actualFinalInvBalance,
      totalSWPDrawn: tenureSWPDrawn,
      netGainLoss,
      roi
    },
    verdict: {
      text: verdictText,
      class: verdictClass
    },
    breakEvenRate: breakEvenAnnualRate,
    schedule: schedule.slice(0, tenureMonths), // Just return the active schedule for display matching tenure
    fullSchedule: schedule, // Contains all 84 months
    scenarios
  };
}

module.exports = {
  calculateEMI,
  findRate,
  runAllCalculations
};

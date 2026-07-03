const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let db = null;
let useFallback = false;
const fallbackFilePath = path.join(DB_DIR, 'scenarios.json');

// Initialize database
function initDb() {
  try {
    const sqlite3 = require('sqlite3').verbose();
    const dbPath = path.join(DB_DIR, 'car_loan_portal.db');
    
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Failed to connect to SQLite. Falling back to JSON file storage.', err);
        setupFallback();
      } else {
        console.log('Connected to SQLite database successfully.');
        createTableSQLite();
      }
    });
  } catch (e) {
    console.warn('SQLite3 module not available or compilation error. Falling back to JSON database.', e.message);
    setupFallback();
  }
}

function createTableSQLite() {
  const query = `
    CREATE TABLE IF NOT EXISTS scenarios (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      vehicle_price REAL,
      down_payment REAL,
      loan_tenure REAL,
      interest_rate REAL,
      lump_sum REAL,
      expected_return REAL,
      swp_amount REAL,
      swp_start_month INTEGER,
      fund_type TEXT,
      emi_start_month TEXT,
      created_at TEXT
    )
  `;
  db.run(query, (err) => {
    if (err) {
      console.error('Error creating SQLite tables. Switching to fallback.', err);
      setupFallback();
    }
  });
}

function setupFallback() {
  useFallback = true;
  if (!fs.existsSync(fallbackFilePath)) {
    fs.writeFileSync(fallbackFilePath, JSON.stringify([], null, 2), 'utf8');
  }
  console.log('Fallback JSON storage initialized at:', fallbackFilePath);
}

// Read JSON fallback
function readFallback() {
  try {
    if (!fs.existsSync(fallbackFilePath)) {
      return [];
    }
    const raw = fs.readFileSync(fallbackFilePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading JSON fallback database:', err);
    return [];
  }
}

// Write JSON fallback
function writeFallback(data) {
  try {
    fs.writeFileSync(fallbackFilePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing JSON fallback database:', err);
    return false;
  }
}

// API Methods
function saveScenario(scenario) {
  return new Promise((resolve, reject) => {
    const s = {
      id: scenario.id || Date.now().toString(),
      name: scenario.name || 'Unnamed Scenario',
      vehicle_price: Number(scenario.vehicle_price) || 0,
      down_payment: Number(scenario.down_payment) || 0,
      loan_tenure: Number(scenario.loan_tenure) || 0,
      interest_rate: Number(scenario.interest_rate) || 0,
      lump_sum: Number(scenario.lump_sum) || 0,
      expected_return: Number(scenario.expected_return) || 0,
      swp_amount: Number(scenario.swp_amount) || 0,
      swp_start_month: Number(scenario.swp_start_month) || 1,
      fund_type: scenario.fund_type || 'Equity MF',
      emi_start_month: scenario.emi_start_month || new Date().toISOString().substring(0, 7),
      created_at: new Date().toISOString()
    };

    if (useFallback) {
      const list = readFallback();
      const idx = list.findIndex(item => item.id === s.id);
      if (idx !== -1) {
        list[idx] = s;
      } else {
        list.push(s);
      }
      writeFallback(list);
      return resolve(s);
    }

    const query = `
      INSERT INTO scenarios (
        id, name, vehicle_price, down_payment, loan_tenure, interest_rate,
        lump_sum, expected_return, swp_amount, swp_start_month, fund_type, emi_start_month, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        vehicle_price=excluded.vehicle_price,
        down_payment=excluded.down_payment,
        loan_tenure=excluded.loan_tenure,
        interest_rate=excluded.interest_rate,
        lump_sum=excluded.lump_sum,
        expected_return=excluded.expected_return,
        swp_amount=excluded.swp_amount,
        swp_start_month=excluded.swp_start_month,
        fund_type=excluded.fund_type,
        emi_start_month=excluded.emi_start_month,
        created_at=excluded.created_at
    `;

    db.run(query, [
      s.id, s.name, s.vehicle_price, s.down_payment, s.loan_tenure, s.interest_rate,
      s.lump_sum, s.expected_return, s.swp_amount, s.swp_start_month, s.fund_type, s.emi_start_month, s.created_at
    ], function(err) {
      if (err) {
        console.error('SQLite Save Error:', err);
        return reject(err);
      }
      resolve(s);
    });
  });
}

function getScenarios() {
  return new Promise((resolve, reject) => {
    if (useFallback) {
      const list = readFallback();
      // Sort by created_at descending
      list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return resolve(list);
    }

    db.all(`SELECT * FROM scenarios ORDER BY created_at DESC`, [], (err, rows) => {
      if (err) {
        console.error('SQLite Fetch All Error:', err);
        return reject(err);
      }
      resolve(rows);
    });
  });
}

function getScenarioById(id) {
  return new Promise((resolve, reject) => {
    if (useFallback) {
      const list = readFallback();
      const item = list.find(item => item.id === id);
      return resolve(item || null);
    }

    db.get(`SELECT * FROM scenarios WHERE id = ?`, [id], (err, row) => {
      if (err) {
        console.error('SQLite Fetch One Error:', err);
        return reject(err);
      }
      resolve(row || null);
    });
  });
}

function deleteScenario(id) {
  return new Promise((resolve, reject) => {
    if (useFallback) {
      const list = readFallback();
      const filtered = list.filter(item => item.id !== id);
      writeFallback(filtered);
      return resolve(true);
    }

    db.run(`DELETE FROM scenarios WHERE id = ?`, [id], function(err) {
      if (err) {
        console.error('SQLite Delete Error:', err);
        return reject(err);
      }
      resolve(true);
    });
  });
}

module.exports = {
  initDb,
  saveScenario,
  getScenarios,
  getScenarioById,
  deleteScenario
};

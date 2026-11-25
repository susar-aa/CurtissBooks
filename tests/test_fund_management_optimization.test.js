const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

console.log('================================================================');
console.log('--- RUNNING FUND MANAGEMENT OPTIMIZATION TEST SUITE ---');
console.log('================================================================');

const testDbPath = path.join(process.cwd(), 'tests', 'test_fund_opt.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Load migrations 001 to 014
const { migration001 } = require('../dist/main/db/migrations/001_initial_settings');
const { migration002 } = require('../dist/main/db/migrations/002_auth_and_rbac');
const { migration003 } = require('../dist/main/db/migrations/003_school_and_students');
const { migration004 } = require('../dist/main/db/migrations/004_db_corrections_and_finalization');
const { migration005 } = require('../dist/main/db/migrations/005_financial_accounting_system');
const { migration006 } = require('../dist/main/db/migrations/006_budget_workflow_refinement');
const { migration007 } = require('../dist/main/db/migrations/007_single_active_fy_and_category_filtering');
const { migration008 } = require('../dist/main/db/migrations/008_funding_system_upgrade');
const { migration009 } = require('../dist/main/db/migrations/009_streamline_funding_inflows');
const { migration010 } = require('../dist/main/db/migrations/010_financial_system_upgrades');
const { migration011 } = require('../dist/main/db/migrations/011_fund_transfers');
const { migration012 } = require('../dist/main/db/migrations/012_fund_category_receipt_selection');
const { migration013 } = require('../dist/main/db/migrations/013_financial_year_optimization');
const { migration014 } = require('../dist/main/db/migrations/014_budget_reallocations');

db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const migrations = [
  migration001, migration002, migration003, migration004,
  migration005, migration006, migration007, migration008,
  migration009, migration010, migration011, migration012,
  migration013, migration014
];

for (const m of migrations) {
  db.pragma('foreign_keys = OFF');
  const tx = db.transaction(() => {
    m.up(db);
    db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)').run(m.id, m.name);
  });
  tx();
  db.pragma('foreign_keys = ON');
}

// Seed Admin User
const { CryptoService } = require('../dist/main/services/cryptoService');
const adminHash = CryptoService.hashPassword('Admin@123456');
db.prepare(`
  INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role_id, status)
  VALUES (1, 'admin', ?, 'Administrator', 1, 'active')
`).run(adminHash);

// Initialize FinancialService
const { FinancialService } = require('../dist/main/services/financialService');
const { initDatabase, closeDatabase } = require('../dist/main/db/index');
initDatabase(testDbPath);

console.log('\n--- 1. Testing Fund Category Joins & Code Populating ---');

// Create Fund Category
const catRes = FinancialService.createFundCategory({
  category_code: 'FC-GOV',
  name_en: 'Ministry Grants',
  name_si: 'අමාත්‍යාංශ ප්‍රතිපාදන',
  description: 'Capital development funds from Ministry'
}, 1);
assert.ok(catRes.id);

// Create Fund under this category
const fundRes = FinancialService.createFund({
  fund_name: 'Science Laboratory Upgrade Fund',
  fund_category_id: catRes.id,
  opening_balance_cents: 10000000, // Rs. 100,000
  description: 'Designated for chemistry and physics equipment'
}, 1);
assert.ok(fundRes.id);

// Retrieve Funds and verify category_code, category_name_en, and description
const allFunds = FinancialService.getFunds();
const labFund = allFunds.find(f => f.id === fundRes.id);
assert.ok(labFund, 'Lab fund must exist');
assert.strictEqual(labFund.category_code, 'FC-GOV', 'Category code must be populated');
assert.strictEqual(labFund.category_name_en, 'Ministry Grants', 'Category name must be populated');
assert.strictEqual(labFund.description, 'Designated for chemistry and physics equipment', 'Description must be populated');
console.log('✓ Fund category code, name, and description successfully verified in getFunds');

// Test Search filtering on getFunds
const searchRes = FinancialService.getFunds('Science');
assert.strictEqual(searchRes.length, 1);
assert.strictEqual(searchRes[0].id, fundRes.id);
console.log('✓ Fund search filtering verified');

console.log('\n--- 2. Testing Fund Receipts Server-Side Pagination & Search ---');

// Create Financial Year
const fy = FinancialService.saveFinancialYearDraft({
  year_name: '2026',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  allocations: []
}, 1);

// Record 5 Fund Receipts
for (let i = 1; i <= 5; i++) {
  FinancialService.createFundReceipt({
    financial_year_id: fy.id,
    fund_category_id: catRes.id,
    fund_id: fundRes.id,
    receipt_date: `2026-0${i}-15`,
    donor_or_dept: i === 3 ? 'UNESCO Grant Division' : `Department of Education Inflow ${i}`,
    amount_cents: 2000000 * i, // Rs. 20,000 * i
    payment_method: 'bank_transfer',
    destination_type: 'cash',
    reference_no: `REF-GRANT-00${i}`,
    purpose: `Installment ${i}`
  }, 1);
}

// Test Pagination: limit 2, offset 0 -> Page 1
const page1 = FinancialService.getFundReceipts(2, 0, fy.id);
assert.strictEqual(page1.receipts.length, 2, 'Page 1 should have 2 receipts');
assert.strictEqual(page1.total, 5, 'Total receipts should be 5');

// Test Pagination: limit 2, offset 2 -> Page 2
const page2 = FinancialService.getFundReceipts(2, 2, fy.id);
assert.strictEqual(page2.receipts.length, 2, 'Page 2 should have 2 receipts');

// Test Receipt Search on donor: "UNESCO"
const searchDonor = FinancialService.getFundReceipts(10, 0, fy.id, undefined, 'UNESCO');
assert.strictEqual(searchDonor.total, 1, 'Search for UNESCO should return 1');
assert.strictEqual(searchDonor.receipts[0].donor_or_dept, 'UNESCO Grant Division');

// Test Receipt Search on reference: "REF-GRANT-004"
const searchRef = FinancialService.getFundReceipts(10, 0, fy.id, undefined, 'REF-GRANT-004');
assert.strictEqual(searchRef.total, 1, 'Search for REF-GRANT-004 should return 1');
console.log('✓ Server-side pagination and receipts search verified cleanly');

console.log('\n--- 3. Testing Fund Traceability & Budget Category Joins ---');

// Create Budget Category & Expense linked to the Fund
const mainCat = FinancialService.quickCreateCategory('Laboratory Operations', 'විද්‍යාගාර මෙහෙයුම්', null, 1);
const subCat = FinancialService.quickCreateCategory('Glassware & Chemical Kits', 'රසායනික උපකරණ', mainCat.id, 1);

const expRes = db.prepare(`
  INSERT INTO expenses (
    voucher_no, expense_date, category_id, financial_year_id,
    payee, description, amount_cents, payment_method, status, created_by
  ) VALUES (
    'EXP-2026-00042', '2026-03-20', ?, ?,
    'Scientific Supplies Ltd', 'Chemical reagents for O/L practicals',
    1500000, 'cash', 'approved', 1
  )
`).run(subCat.id, fy.id);
const expId = Number(expRes.lastInsertRowid);

// Add Trace link
db.prepare(`
  INSERT INTO fund_usage_traces (
    fund_id, expense_id, amount_cents, trace_date, notes, created_by
  ) VALUES (?, ?, ?, '2026-03-20', 'Financed via Science Lab Fund', 1)
`).run(fundRes.id, expId, 1500000);

// Get Fund Traces
const traces = FinancialService.getFundTraces(fundRes.id);
assert.strictEqual(traces.length, 1);
assert.strictEqual(traces[0].voucher_no, 'EXP-2026-00042');
assert.strictEqual(traces[0].payee, 'Scientific Supplies Ltd');
assert.strictEqual(traces[0].category_code, subCat.category_code, 'Trace must join budget_categories.category_code');
assert.strictEqual(traces[0].category_name_en, 'Glassware & Chemical Kits', 'Trace must join budget_categories.name_en');
console.log('✓ Fund usage trace with budget category join verified: [', traces[0].category_code, '—', traces[0].category_name_en, ']');

// Cleanup
db.close();
closeDatabase();
try {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
} catch (e) {}

console.log('\n================================================================');
console.log('--- ALL FUND MANAGEMENT OPTIMIZATION TESTS PASSED! ---');
console.log('================================================================\n');

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

console.log('================================================================');
console.log('--- RUNNING DIRECT DONATION & FUND PROCESS TEST SUITE ---');
console.log('================================================================');

const testDbPath = path.join(process.cwd(), 'tests', 'test_direct_donations.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Load migrations 001 to 015
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
const { migration015 } = require('../dist/main/db/migrations/015_donation_categories');

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
  migration013, migration014, migration015
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

console.log('✓ All 15 migrations applied cleanly.');

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

console.log('\n--- 1. Verifying Seeded Donation Categories ---');
const cats = FinancialService.getFundCategories();
const parentCat = cats.find(c => c.category_code === 'FCAT-PRNT');
const govCat = cats.find(c => c.category_code === 'FCAT-GOV');
const alumCat = cats.find(c => c.category_code === 'FCAT-ALUM');

assert.ok(parentCat, 'Donations from Parents category must exist');
assert.strictEqual(parentCat.name_en, 'Donations from Parents');
assert.ok(govCat, 'Donations from Government category must exist');
assert.strictEqual(govCat.name_en, 'Donations from Government');
assert.ok(alumCat, 'Past Pupils & Alumni category must exist');
console.log('✓ Donation categories verified:', parentCat.name_en, ',', govCat.name_en, ',', alumCat.name_en);

console.log('\n--- 2. Setting Up Financial Year and Bank Account ---');
const fy = FinancialService.saveFinancialYearDraft({
  year_name: '2026',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  allocations: []
}, 1);

db.prepare('DELETE FROM bank_accounts').run();
const bank = FinancialService.createBankAccount({
  bank_name: 'Bank of Ceylon',
  branch_name: 'Colombo Central',
  account_number: 'BOC-772910',
  account_type: 'current',
  opening_balance_cents: 5000000 // Rs. 50,000 opening
}, 1);
assert.strictEqual(bank.current_balance_cents, 5000000);

console.log('\n--- 3. Testing Direct Cash Donation Deposit ---');
// Record Rs. 25,000 Cash Donation from Parents
const cashReceipt = FinancialService.createFundReceipt({
  financial_year_id: fy.id,
  fund_category_id: parentCat.id,
  receipt_date: '2026-02-10',
  donor_or_dept: 'Grade 10 Parents Batch',
  amount_cents: 2500000, // Rs. 25,000
  payment_method: 'cash',
  destination_type: 'cash',
  purpose: 'Smart Classroom Project'
}, 1);

assert.strictEqual(cashReceipt.amount_cents, 2500000);
assert.strictEqual(cashReceipt.destination_type, 'cash');

// Verify Cash in Hand transaction
const lastCashTx = db.prepare('SELECT * FROM cash_transactions ORDER BY id DESC LIMIT 1').get();
assert.strictEqual(lastCashTx.amount_cents, 2500000);
assert.strictEqual(lastCashTx.running_balance_cents, 2500000, 'Cash in Hand balance directly credited');
console.log('✓ Cash donation of Rs. 25,000 added directly to Cash in Hand');

console.log('\n--- 4. Testing Direct Bank Donation Deposit ---');
// Record Rs. 80,000 Ministry Grant deposited into BOC bank account
const bankReceipt = FinancialService.createFundReceipt({
  financial_year_id: fy.id,
  fund_category_id: govCat.id,
  receipt_date: '2026-02-15',
  donor_or_dept: 'Ministry of Education',
  amount_cents: 8000000, // Rs. 80,000
  payment_method: 'bank_transfer',
  destination_type: 'bank',
  bank_account_id: bank.id,
  reference_no: 'MOE-TRF-9021',
  purpose: 'Annual Science Equipment Allocation'
}, 1);

// Verify Bank Account balance directly credited
const updatedBank = db.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = ?').get(bank.id);
assert.strictEqual(updatedBank.current_balance_cents, 5000000 + 8000000, 'Bank balance must directly reflect 50,000 + 80,000 = 130,000');
console.log('✓ Bank donation of Rs. 80,000 added directly to Bank of Ceylon. New Bank Balance: Rs.', (updatedBank.current_balance_cents / 100).toFixed(2));

console.log('\n--- 5. Testing Petty Cash Donation Disallowance ---');
// Verify that depositing cash donation into Petty Cash throws an error
assert.throws(() => {
  FinancialService.createFundReceipt({
    financial_year_id: fy.id,
    fund_category_id: alumCat.id,
    receipt_date: '2026-02-20',
    donor_or_dept: 'Alumni Association (PPA)',
    amount_cents: 1000000,
    payment_method: 'cash',
    destination_type: 'petty_cash',
    purpose: 'Emergency Student Welfare Cash'
  }, 1);
}, /Petty Cash/, 'Direct cash deposit to Petty Cash must be blocked');
console.log('✓ Verified: Direct donation deposit to Petty Cash is strictly prevented.');

// Record valid cash donation into Cash in Hand
FinancialService.createFundReceipt({
  financial_year_id: fy.id,
  fund_category_id: alumCat.id,
  receipt_date: '2026-02-20',
  donor_or_dept: 'Alumni Association (PPA)',
  amount_cents: 1000000, // Rs. 10,000
  payment_method: 'cash',
  destination_type: 'cash',
  purpose: 'Emergency Student Welfare Cash'
}, 1);
console.log('✓ Valid cash donation of Rs. 10,000 added directly to Cash in Hand');

console.log('\n--- 6. Testing Receipts Summary Aggregates ---');
const summary = FinancialService.getFundReceiptsSummary(fy.id);
assert.strictEqual(summary.total_cents, 2500000 + 8000000 + 1000000, 'Total received must be Rs. 115,000 (11,500,000 cents)');
assert.strictEqual(summary.cash_cents, 2500000 + 1000000, 'Cash portion must be Rs. 35,000');
assert.strictEqual(summary.bank_cents, 8000000, 'Bank portion must be Rs. 80,000');
assert.strictEqual(summary.petty_cash_cents, 0, 'Petty cash portion must be Rs. 0');
assert.strictEqual(summary.total_count, 3, 'Total count must be 3 receipts');
console.log('✓ Fund receipts summary aggregates accurately verified:');
console.log('  Total:', (summary.total_cents / 100).toFixed(2));
console.log('  Bank:', (summary.bank_cents / 100).toFixed(2));
console.log('  Cash:', (summary.cash_cents / 100).toFixed(2));
console.log('  Petty Cash:', (summary.petty_cash_cents / 100).toFixed(2));

console.log('\n--- 7. Testing Category Receipts Total Received ---');
const refreshedCats = FinancialService.getFundCategories();
const refreshedParent = refreshedCats.find(c => c.category_code === 'FCAT-PRNT');
const refreshedGov = refreshedCats.find(c => c.category_code === 'FCAT-GOV');
assert.strictEqual(refreshedParent.total_received_cents, 2500000);
assert.strictEqual(refreshedGov.total_received_cents, 8000000);
console.log('✓ Category total received directly reflected on category pills');

// Cleanup
db.close();
closeDatabase();
try {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
} catch (e) {}

console.log('\n================================================================');
console.log('--- ALL DIRECT DONATION & FUND PROCESS TESTS PASSED 100%! ---');
console.log('================================================================\n');

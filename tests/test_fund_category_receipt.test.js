const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

console.log('===============================================================');
console.log('--- RUNNING FUND CATEGORY RECEIPT RECORDING CLI TEST SUITE ---');
console.log('===============================================================');

const testDbPath = path.join(process.cwd(), 'tests', 'test_fund_category_receipt.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Apply migrations 001 to 012
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

console.log('✓ All 12 migrations applied cleanly.');

// Verify migration 012
const cols = db.prepare('PRAGMA table_info(fund_receipts)').all();
assert.strictEqual(cols.some(c => c.name === 'fund_category_id'), true, 'fund_category_id column must exist on fund_receipts');
console.log('✓ Column fund_category_id verified on fund_receipts table.');

// Seed Admin User
db.prepare(`
  INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role_id, status)
  VALUES (1, 'admin', 'test_hash', 'Administrator', 1, 'active')
`).run();

// Initialize FinancialService
const { FinancialService } = require('../dist/main/services/financialService');
const { initDatabase } = require('../dist/main/db/index');
initDatabase(testDbPath);

// Setup Financial Year
const fy = FinancialService.createFinancialYear({
  year_name: 'FY 2026/2027',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  description: 'Test Financial Year',
}, 1);

// Create Test Bank Account
const bankAcc = FinancialService.createBankAccount({
  bank_name: 'People\'s Bank',
  branch_name: 'Colombo Central',
  account_number: '102-9988-7711',
  account_type: 'current',
  opening_balance_cents: 20000000, // Rs. 200,000
}, 1);

// -------------------------------------------------------------
// 1. TEST FUND CATEGORIES & SEEDED DATA
// -------------------------------------------------------------
console.log('\n--- 1. Testing Fund Categories & Seeded Data ---');
const categories = FinancialService.getFundCategories();
assert.strictEqual(categories.length >= 4, true, 'At least 4 seeded fund categories must exist');
const govCat = categories.find(c => c.name_en === 'Government Funds');
assert.ok(govCat, 'Government Funds category must exist');

// Create custom category: Sports & Equipment Fund
const sportsCat = FinancialService.createFundCategory({
  category_code: 'FCAT-SPT',
  name_en: 'Sports & Equipment Grants',
  name_si: 'ක්‍රීඩා සහ උපකරණ ප්‍රදාන',
  description: 'Grants and donations dedicated to school athletics',
}, 1);
assert.strictEqual(sportsCat.category_code, 'FCAT-SPT', 'Category code must match');
console.log(`✓ Custom Category created: ${sportsCat.category_code} - ${sportsCat.name_en}`);

// -------------------------------------------------------------
// 2. TEST RECORDING RECEIPT WITH EXISTING FUND UNDER CATEGORY
// -------------------------------------------------------------
console.log('\n--- 2. Testing Receipt Recording with Existing Fund ---');
// Create a fund under Government Funds
const govFund = FinancialService.createFund({
  fund_name: 'Quality Inputs Grant 2026',
  fund_category_id: govCat.id,
  opening_balance_cents: 5000000, // Rs. 50,000
  description: 'Ministry allocation for learning materials',
});

// Record receipt: Rs. 75,000 to Bank
const rcpt1 = FinancialService.createFundReceipt({
  financial_year_id: fy.id,
  fund_category_id: govCat.id,
  fund_id: govFund.id,
  receipt_date: '2026-02-10',
  donor_or_dept: 'Ministry of Education',
  amount_cents: 7500000, // Rs. 75,000
  payment_method: 'bank_transfer',
  destination_type: 'bank',
  bank_account_id: bankAcc.id,
  purpose: 'Term 1 Quality Inputs Allocation',
}, 1);

assert.strictEqual(rcpt1.fund_id, govFund.id, 'Receipt fund_id must match govFund.id');
assert.strictEqual(rcpt1.fund_category_id, govCat.id, 'Receipt fund_category_id must match govCat.id');
assert.strictEqual(rcpt1.fund_category_name_en, govCat.name_en, 'Receipt must return category name');
assert.strictEqual(rcpt1.amount_cents, 7500000, 'Receipt amount must be 75,000.00');

// Verify fund balances
const loadedGovFunds = FinancialService.getFunds(undefined, govCat.id);
const targetGovFund = loadedGovFunds.find(f => f.id === govFund.id);
assert.strictEqual(targetGovFund.total_received_cents, 7500000, 'Fund received must equal Rs. 75,000');
assert.strictEqual(targetGovFund.current_balance_cents, 12500000, 'Fund balance must equal Rs. 125,000 (50k open + 75k rcpt)');
console.log(`✓ Receipt recorded under Government Funds. Current Fund Balance: Rs. ${(targetGovFund.current_balance_cents / 100).toFixed(2)}`);

// -------------------------------------------------------------
// 3. TEST RECORDING RECEIPT WITH ON-THE-FLY FUND CREATION UNDER CATEGORY
// -------------------------------------------------------------
console.log('\n--- 3. Testing Receipt Recording with Quick-Create Fund ---');
const rcpt2 = FinancialService.createFundReceipt({
  financial_year_id: fy.id,
  fund_category_id: sportsCat.id,
  new_fund_name: 'Cricket Ground Modernization Fund',
  receipt_date: '2026-02-15',
  donor_or_dept: 'Past Pupils Cricket Association',
  amount_cents: 12000000, // Rs. 120,000
  payment_method: 'cheque',
  destination_type: 'cash',
  reference_no: 'CHQ-88901',
  purpose: 'Pitch re-turfing and nets',
}, 1);

assert.strictEqual(rcpt2.fund_category_id, sportsCat.id, 'Receipt must belong to sportsCat.id');
assert.strictEqual(rcpt2.fund_name_en, 'Cricket Ground Modernization Fund', 'New fund name must match');

// Verify the newly created fund in database
const sportsFunds = FinancialService.getFunds(undefined, sportsCat.id);
const newSportsFund = sportsFunds.find(f => f.id === rcpt2.fund_id);
assert.ok(newSportsFund, 'Newly created fund must exist under sports category');
assert.strictEqual(newSportsFund.total_received_cents, 12000000, 'New fund received must be 120,000');
assert.strictEqual(newSportsFund.current_balance_cents, 12000000, 'New fund balance must be 120,000');
console.log(`✓ Quick-created fund "${newSportsFund.fund_name}" under category "${sportsCat.name_en}" with balance Rs. ${(newSportsFund.current_balance_cents / 100).toFixed(2)}`);

// -------------------------------------------------------------
// 4. TEST CATEGORY-FILTERED FUND RECEIPTS LEDGER
// -------------------------------------------------------------
console.log('\n--- 4. Testing Category-Filtered Receipts Ledger ---');
// Query all receipts
const allRcpts = FinancialService.getFundReceipts(100, 0, fy.id);
assert.strictEqual(allRcpts.receipts.length, 2, 'Total receipts across all categories must be 2');

// Query receipts for Government Funds only
const govRcpts = FinancialService.getFundReceipts(100, 0, fy.id, govCat.id);
assert.strictEqual(govRcpts.receipts.length, 1, 'Government Funds category must have exactly 1 receipt');
assert.strictEqual(govRcpts.receipts[0].id, rcpt1.id, 'Filtered receipt must match rcpt1');
assert.strictEqual(govRcpts.receipts[0].fund_category_id, govCat.id);

// Query receipts for Sports & Equipment Grants only
const sportsRcpts = FinancialService.getFundReceipts(100, 0, fy.id, sportsCat.id);
assert.strictEqual(sportsRcpts.receipts.length, 1, 'Sports category must have exactly 1 receipt');
assert.strictEqual(sportsRcpts.receipts[0].id, rcpt2.id, 'Filtered receipt must match rcpt2');
assert.strictEqual(sportsRcpts.receipts[0].fund_category_id, sportsCat.id);

console.log('✓ Receipts Ledger correctly filters receipts by fund category.');

// -------------------------------------------------------------
// 5. TEST LEDGER BALANCES & AUDIT TRAIL
// -------------------------------------------------------------
console.log('\n--- 5. Testing Destination Ledgers & Audit Trail ---');
// Verify Bank Account Balance: initial 200k + 75k = 275k
const updatedBank = db.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = ?').get(bankAcc.id);
assert.strictEqual(updatedBank.current_balance_cents, 27500000, 'Bank balance must equal Rs. 275,000');

// Verify Cash in Hand Balance: 120k from rcpt2
const cashTx = db.prepare('SELECT running_balance_cents, reference_no FROM cash_transactions ORDER BY id DESC LIMIT 1').get();
assert.strictEqual(cashTx.running_balance_cents, 12000000, 'Cash balance must equal Rs. 120,000');

// Verify Audit Log
const audit = db.prepare("SELECT * FROM authentication_audit_logs WHERE action = 'FUND_RECEIPT_POSTED'").all();
assert.strictEqual(audit.length, 2, '2 FUND_RECEIPT_POSTED audit events must be logged');
console.log('✓ Destination balances and audit trail verified.');

console.log('\n===============================================================');
console.log('✓✓✓ ALL FUND CATEGORY RECEIPT RECORDING TESTS PASSED! ✓✓✓');
console.log('===============================================================');

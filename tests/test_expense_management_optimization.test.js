const assert = require('assert');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { CryptoService } = require('../dist/main/services/cryptoService');

console.log('================================================================');
console.log('--- RUNNING EXPENSE MANAGEMENT SYSTEM OPTIMIZATION TEST SUITE ---');
console.log('================================================================');

const testDbPath = path.join(__dirname, 'test_expense_optimization.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const db = new Database(testDbPath);
db.pragma('foreign_keys = ON');

// Load migrations 001 to 016
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
const { migration016 } = require('../dist/main/db/migrations/016_cheque_management');

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
  migration013, migration014, migration015, migration016
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
console.log('✓ All 16 migrations applied cleanly.');

// Setup Admin user
const adminHash = CryptoService.hashPassword('AdminPass123!');
db.prepare(`
  INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role_id, status)
  VALUES (1, 'admin', ?, 'Administrator', 1, 'active')
`).run(adminHash);

// Override db getter
const dbModule = require('../dist/main/db/index');
dbModule.getDatabase = () => db;

const { FinancialService } = require('../dist/main/services/financialService');

// Clear seed bank accounts and create single institutional bank account
db.prepare('DELETE FROM bank_accounts').run();
const operatingBank = FinancialService.createBankAccount({
  account_code: 'BOC-01',
  bank_name: 'Bank of Ceylon',
  branch_name: 'Colombo Central',
  account_number: '1004829104',
  account_type: 'current',
  opening_balance_cents: 100000000, // Rs. 1,000,000.00
}, 1);
assert.strictEqual(operatingBank.account_number, '1004829104');
console.log('✓ Single operating bank account initialized: Rs. 1,000,000.00');

// Setup Cash in hand
db.prepare(`
  INSERT INTO cash_transactions (financial_year_id, transaction_date, transaction_type, amount_cents, running_balance_cents, reference_no, description, created_by)
  VALUES (1, '2026-01-01', 'receipt', 20000000, 20000000, 'OPEN-CASH', 'Cash in Hand Opening Balance', 1)
`).run(); // Rs. 200,000.00
console.log('✓ Cash in hand balance set: Rs. 200,000.00');

// Setup Financial Year 2026 (id = 1)
db.prepare(`
  UPDATE financial_years SET is_current = 1, status = 'approved' WHERE id = 1
`).run();
const fy = { id: 1 };
console.log(`✓ Financial Year #${fy.id} active and approved.`);

// TEST 1: Quick-Create Budget Category directly from Expense Management
console.log('\n--- TEST 1: QUICK-CREATE BUDGET CATEGORY WITH ALLOCATION ---');
const quickCat = FinancialService.quickCreateExpenseBudgetCategory({
  financial_year_id: fy.id,
  name_en: 'Science Laboratory Chemicals',
  name_si: 'විද්‍යාගාර රසායන ද්‍රව්‍ය',
  category_code: '100.99',
  parent_id: 1, // Under Recurrent Education
  allocated_amount_cents: 5000000, // Rs. 50,000.00
  description: 'Quick-created category for chemicals',
}, 1);

assert.strictEqual(quickCat.category_code, '100.99');
assert.strictEqual(quickCat.name_en, 'Science Laboratory Chemicals');
assert.strictEqual(quickCat.name_si, 'විද්‍යාගාර රසායන ද්‍රව්‍ය');
assert.strictEqual(quickCat.approved_amount_cents, 5000000);
assert.strictEqual(quickCat.spent_amount_cents, 0);
console.log('✓ Quick-created category automatically allocated to active FY: Rs. 50,000.00 allocation verified.');

// TEST 2: Record Expense with Cash Payment & Available Budget Validation
console.log('\n--- TEST 2: RECORD CASH EXPENSE & BALANCE DEDUCTION ---');
const expCash = FinancialService.createExpense({
  financial_year_id: fy.id,
  category_id: quickCat.id,
  expense_date: '2026-02-10',
  payee: 'Analytical Reagents Ltd',
  description: 'Purchase of copper sulfate and test reagents',
  amount_cents: 1500000, // Rs. 15,000.00
  payment_method: 'cash',
  bill_no: 'INV-4091',
  reference_no: 'RCPT-102',
}, 1);

assert.strictEqual(expCash.status, 'approved');
assert.strictEqual(expCash.payment_method, 'cash');
assert.strictEqual(expCash.amount_cents, 1500000);

// Verify cash balance decreased
const cashRow = db.prepare('SELECT running_balance_cents FROM cash_transactions ORDER BY id DESC LIMIT 1').get();
assert.strictEqual(cashRow.running_balance_cents, 20000000 - 1500000); // 185,000.00
console.log('✓ Cash expense posted: Cash in hand debited exactly Rs. 15,000.00.');

// TEST 3: Record Expense with Single Institutional Bank Payment
console.log('\n--- TEST 3: RECORD BANK EXPENSE & AUTO-BIND TO SINGLE ACCOUNT ---');
const expBank = FinancialService.createExpense({
  financial_year_id: fy.id,
  category_id: quickCat.id,
  expense_date: '2026-02-12',
  payee: 'Scientific Glassware Co.',
  description: 'Borosilicate beakers and test tubes',
  amount_cents: 2000000, // Rs. 20,000.00
  payment_method: 'bank',
  bill_no: 'INV-8821',
}, 1);

assert.strictEqual(expBank.status, 'approved');
assert.strictEqual(expBank.bank_account_id, operatingBank.id);

// Verify bank balance decreased
const bankRow = db.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = ?').get(operatingBank.id);
assert.strictEqual(bankRow.current_balance_cents, 100000000 - 2000000); // 980,000.00
console.log('✓ Bank expense posted: Operating Bank account auto-bound and debited Rs. 20,000.00.');

// TEST 4: Record Cheque Expense & Auto-Track in Cheque Management
console.log('\n--- TEST 4: RECORD ISSUED CHEQUE EXPENSE ---');
const expCheque = FinancialService.createExpense({
  financial_year_id: fy.id,
  category_id: quickCat.id,
  expense_date: '2026-02-14',
  payee: 'Ceylon Microscope Services',
  description: 'Microscope lens cleaning and calibration',
  amount_cents: 1000000, // Rs. 10,000.00
  payment_method: 'cheque',
  cheque_number: 'CHQ-882901',
  cheque_date: '2026-02-14',
}, 1);

assert.strictEqual(expCheque.cheque_number, 'CHQ-882901');
const chqRow = db.prepare("SELECT * FROM cheques WHERE cheque_number = 'CHQ-882901'").get();
assert.ok(chqRow, 'Cheque must be auto-created in cheques table');
assert.strictEqual(chqRow.cheque_type, 'issued');
assert.strictEqual(chqRow.amount_cents, 1000000);
assert.strictEqual(chqRow.issuing_bank_account_id, operatingBank.id);
console.log('✓ Cheque expense posted: Cheque record created in Cheque Management and linked to expense.');

// TEST 5: Over-Budget Rejection
console.log('\n--- TEST 5: STRICT BUDGET ALLOCATION VALIDATION ---');
// QuickCat allocation = 50k, Spent = 15k + 20k + 10k = 45k. Remaining = 5k.
assert.throws(() => {
  FinancialService.createExpense({
    financial_year_id: fy.id,
    category_id: quickCat.id,
    expense_date: '2026-02-15',
    payee: 'Excess Supplies Ltd',
    description: 'This expense will exceed budget',
    amount_cents: 1000000, // Rs. 10,000 (remaining is only 5,000)
    payment_method: 'cash',
  }, 1);
}, /exceeds remaining budget/);
console.log('✓ Over-budget expense strictly blocked by backend validation.');

// TEST 6: Reverse / Cancel Expense with Atomic Rollback
console.log('\n--- TEST 6: REVERSE EXPENSE & RESTORE BALANCES ---');
const prevBankBal = db.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = ?').get(operatingBank.id).current_balance_cents;
FinancialService.cancelExpense(
  expBank.id,
  'Vendor returned duplicate payment invoice',
  1
);

const reversedExp = db.prepare('SELECT status, rejection_reason FROM expenses WHERE id = ?').get(expBank.id);
assert.strictEqual(reversedExp.status, 'reversed');
assert.strictEqual(reversedExp.rejection_reason, 'Vendor returned duplicate payment invoice');

const postReversalBankBal = db.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = ?').get(operatingBank.id).current_balance_cents;
assert.strictEqual(postReversalBankBal, prevBankBal + 2000000);
console.log('✓ Expense reversal verified: Bank balance restored and expense status updated to reversed.');

// TEST 7: Filtered getExpenses, Search, and Summary Metrics
console.log('\n--- TEST 7: PAGINATED GET_EXPENSES & SINGLE-QUERY SUMMARY METRICS ---');
const listResult = FinancialService.getExpenses(10, 0, fy.id, undefined, 'Reagents');
assert.strictEqual(listResult.expenses.length, 1);
assert.strictEqual(listResult.expenses[0].payee, 'Analytical Reagents Ltd');
console.log('✓ Full-text search verified: Found voucher by search query "Reagents".');

// Check summary metrics (expCash = 15k, expCheque = 10k, expBank was reversed)
const allExpenses = FinancialService.getExpenses(50, 0, fy.id);
assert.strictEqual(allExpenses.summary.total_cents, 2500000); // 15k + 10k (reversed 20k excluded)
assert.strictEqual(allExpenses.summary.cash_cents, 1500000);
assert.strictEqual(allExpenses.summary.cheque_cents, 1000000);
assert.strictEqual(allExpenses.summary.total_count, 3);
console.log('✓ Summary metrics accurately computed: Total Active Expenses = Rs. 25,000.00 (Excludes reversed).');

db.close();
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
console.log('\n================================================================');
console.log('>>> ALL 7 EXPENSE MANAGEMENT OPTIMIZATION TESTS PASSED! <<<');
console.log('================================================================');

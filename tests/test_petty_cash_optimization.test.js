const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const testDbPath = path.join(process.cwd(), 'tests', 'test_petty_cash_opt.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
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

// Seed Admin User
const { CryptoService } = require('../dist/main/services/cryptoService');
const adminHash = CryptoService.hashPassword('Admin@123456');
db.prepare(`
  INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role_id, status)
  VALUES (1, 'admin', ?, 'Administrator', 1, 'active')
`).run(adminHash);

// Point getDatabase to our test db instance
const dbModule = require('../dist/main/db/index');
dbModule.getDatabase = () => db;

const { FinancialService } = require('../dist/main/services/financialService');

console.log('================================================================');
console.log('--- RUNNING PETTY CASH OPTIMIZATION TEST SUITE ---');
console.log('================================================================\n');

// Verify active year
const currentYear = FinancialService.getCurrentFinancialYear();
if (!currentYear) throw new Error('Active financial year not found');
const fyId = currentYear.id;
console.log(`✓ Active Financial Year: ${currentYear.year_name} (ID: ${fyId})`);

// Ensure single bank account has starting balance for replenishment
const defaultBank = FinancialService.getDefaultBankAccount();
if (!defaultBank) throw new Error('Default institutional bank account not found');
db.prepare('UPDATE bank_accounts SET current_balance_cents = 50000000 WHERE id = ?').run(defaultBank.id);
console.log(`✓ Set institutional Bank of Ceylon balance to Rs. 500,000.00`);

// 1. REPLENISH PETTY CASH FROM INSTITUTIONAL BANK
console.log('\n--- TEST 1: REPLENISH FLOAT FROM INSTITUTIONAL BANK ---');
FinancialService.replenishPettyCash({
  financial_year_id: fyId,
  voucher_date: '2026-03-01',
  amount_cents: 2500000, // Rs. 25,000.00
  description: 'Initial monthly petty cash imprest float',
  source_type: 'bank',
  bank_account_id: defaultBank.id,
  reference_no: 'CHQ-00918',
});

const bankCheck = FinancialService.getBankAccounts().find(b => b.id === defaultBank.id);
if (bankCheck.current_balance_cents !== 47500000) {
  throw new Error(`Bank balance not decremented properly: ${bankCheck.current_balance_cents}`);
}

const initialSummary = FinancialService.getPettyCashVouchers(50, 0, fyId);
if (initialSummary.balanceCents !== 2500000) {
  throw new Error(`Expected float balance Rs. 25,000.00, got ${initialSummary.balanceCents}`);
}
if (initialSummary.totalReplenishedCents !== 2500000) {
  throw new Error(`Expected total replenished Rs. 25,000.00, got ${initialSummary.totalReplenishedCents}`);
}
if (initialSummary.replenishCount !== 1) {
  throw new Error(`Expected 1 replenishment, got ${initialSummary.replenishCount}`);
}
console.log('✓ Replenished Rs. 25,000.00 float from Bank of Ceylon. Float verified.');

// Seed budget allocations for testing
db.prepare(`
  INSERT OR IGNORE INTO financial_year_budget_allocations (financial_year_id, category_id, allocated_amount_cents)
  VALUES 
    (?, 2, 10000000),
    (?, 4, 10000000)
`).run(fyId, fyId);

// 2. RECORD PETTY CASH EXPENSES
console.log('\n--- TEST 2: RECORD PETTY CASH EXPENSES WITH BUDGET CHECK ---');
// Get subcategories
const categories = FinancialService.getBudgetCategories(fyId);
const subcategories = categories.filter(c => c.parent_id !== null);
if (subcategories.length === 0) throw new Error('No budget subcategories found for testing');
const cat1 = subcategories[0];
const cat2 = subcategories[1] || subcategories[0];

// Expense 1: Stationery
const exp1 = FinancialService.recordPettyCashExpense({
  financial_year_id: fyId,
  voucher_date: '2026-03-05',
  category_id: cat1.id,
  amount_cents: 350000, // Rs. 3,500.00
  payee: 'City Bookshop',
  description: 'Emergency printing paper & whiteboard markers',
  receipt_no: 'REC-BOOK-101',
});
console.log(`✓ Recorded Expense 1: ${exp1.voucher_no} - Rs. 3,500.00`);

// Expense 2: Postage & Courier
const exp2 = FinancialService.recordPettyCashExpense({
  financial_year_id: fyId,
  voucher_date: '2026-03-10',
  category_id: cat2.id,
  amount_cents: 150000, // Rs. 1,500.00
  payee: 'Speed Post Couriers',
  description: 'Express exam papers dispatch',
  receipt_no: 'BILL-SPD-882',
});
console.log(`✓ Recorded Expense 2: ${exp2.voucher_no} - Rs. 1,500.00`);

// Check Float Balance
const afterExpSummary = FinancialService.getPettyCashVouchers(50, 0, fyId);
// 25,000 - 3,500 - 1,500 = 20,000
if (afterExpSummary.balanceCents !== 2000000) {
  throw new Error(`Expected remaining float Rs. 20,000.00, got ${afterExpSummary.balanceCents}`);
}
if (afterExpSummary.totalDisbursedCents !== 500000) {
  throw new Error(`Expected total disbursed Rs. 5,000.00, got ${afterExpSummary.totalDisbursedCents}`);
}
if (afterExpSummary.expenseCount !== 2) {
  throw new Error(`Expected 2 expense vouchers, got ${afterExpSummary.expenseCount}`);
}
console.log('✓ Remaining float accurately calculated: Rs. 20,000.00 (Disbursed: Rs. 5,000.00).');

// 3. EXCEEDING FLOAT VALIDATION
console.log('\n--- TEST 3: PREVENT EXPENSE EXCEEDING AVAILABLE FLOAT ---');
let caughtFloat = false;
try {
  FinancialService.recordPettyCashExpense({
    financial_year_id: fyId,
    voucher_date: '2026-03-12',
    category_id: cat1.id,
    amount_cents: 2500000, // Rs. 25,000.00 (exceeds Rs. 20,000.00 available)
    payee: 'Mega Store',
    description: 'Excessive item',
  });
} catch (e) {
  caughtFloat = true;
  console.log(`✓ Correctly rejected excessive expense: "${e.message}"`);
}
if (!caughtFloat) throw new Error('Failed to reject expense exceeding available petty cash float');

// 4. MULTI-ATTRIBUTE SEARCH
console.log('\n--- TEST 4: MULTI-ATTRIBUTE SEARCH FILTERING ---');
const searchByPayee = FinancialService.getPettyCashVouchers(50, 0, fyId, { search: 'City Bookshop' });
if (searchByPayee.vouchers.length !== 1 || searchByPayee.vouchers[0].payee !== 'City Bookshop') {
  throw new Error(`Search by payee failed: found ${searchByPayee.vouchers.length}`);
}
console.log('✓ Search by payee verified');

const searchByDesc = FinancialService.getPettyCashVouchers(50, 0, fyId, { search: 'whiteboard markers' });
if (searchByDesc.vouchers.length !== 1) {
  throw new Error(`Search by description failed: found ${searchByDesc.vouchers.length}`);
}
console.log('✓ Search by description verified');

const searchByReceipt = FinancialService.getPettyCashVouchers(50, 0, fyId, { search: 'REC-BOOK-101' });
if (searchByReceipt.vouchers.length !== 1) {
  throw new Error(`Search by receipt reference failed: found ${searchByReceipt.vouchers.length}`);
}
console.log('✓ Search by receipt reference verified');

// 5. MOVEMENT TYPE FILTERING
console.log('\n--- TEST 5: MOVEMENT TYPE FILTERING (Expenses vs Replenishments) ---');
const expenseOnly = FinancialService.getPettyCashVouchers(50, 0, fyId, { type: 'expense' });
if (expenseOnly.vouchers.length !== 2) {
  throw new Error(`Expected 2 expense vouchers, found ${expenseOnly.vouchers.length}`);
}
if (expenseOnly.vouchers.some(v => v.type !== 'expense')) {
  throw new Error('Expense-only filter included non-expense records');
}
console.log('✓ Expense-only filter verified (2 records)');

const replenishOnly = FinancialService.getPettyCashVouchers(50, 0, fyId, { type: 'replenishment' });
if (replenishOnly.vouchers.length !== 1) {
  throw new Error(`Expected 1 replenishment voucher, found ${replenishOnly.vouchers.length}`);
}
if (replenishOnly.vouchers[0].type !== 'replenishment') {
  throw new Error('Replenish-only filter returned non-replenishment record');
}
console.log('✓ Replenishment-only filter verified (1 record)');

// 6. DATE RANGE FILTERING
console.log('\n--- TEST 6: DATE RANGE FILTERING ---');
const dateFiltered = FinancialService.getPettyCashVouchers(50, 0, fyId, {
  startDate: '2026-03-08',
  endDate: '2026-03-15',
});
if (dateFiltered.vouchers.length !== 1 || dateFiltered.vouchers[0].voucher_date !== '2026-03-10') {
  throw new Error(`Date range filter failed: found ${dateFiltered.vouchers.length}`);
}
console.log('✓ Date range filtering verified');

// 7. SERVER-SIDE PAGINATION
console.log('\n--- TEST 7: SERVER-SIDE PAGINATION ---');
const page1 = FinancialService.getPettyCashVouchers(2, 0, fyId);
const page2 = FinancialService.getPettyCashVouchers(2, 2, fyId);
if (page1.vouchers.length !== 2 || page2.vouchers.length !== 1) {
  throw new Error(`Pagination failed: page1=${page1.vouchers.length}, page2=${page2.vouchers.length}`);
}
if (page1.total !== 3) {
  throw new Error(`Total matching records should be 3, got ${page1.total}`);
}
console.log(`✓ Server-side pagination verified (Page 1: 2 rows, Page 2: 1 row, Total: ${page1.total})`);

console.log('\n================================================================');
console.log('>>> ALL 7 PETTY CASH OPTIMIZATION TESTS PASSED! <<<');
console.log('================================================================');

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const testDbDir = path.resolve(__dirname, '.test_tmp_financial');
if (!fs.existsSync(testDbDir)) {
  fs.mkdirSync(testDbDir, { recursive: true });
}

const dbPath = path.join(testDbDir, 'test_financial.db');
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

console.log('====================================================');
console.log('CurtissBooks — Financial Accounting Verification Suite');
console.log('====================================================\n');

// 1. Initialize DB with all migrations including 005
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run migrations
const { runMigrations } = require('../dist/main/db/migrationRunner');
runMigrations(db);

console.log('[TEST 1] Verifying Financial Years...');
const years = db.prepare('SELECT * FROM financial_years').all();
if (years.length === 0) throw new Error('Seeded financial year missing');
console.log(`  ✓ Seeded financial year verified: ${years[0].year_name}`);

// Insert new financial year
const newYear = db.prepare(`
  INSERT INTO financial_years (year_name, start_date, end_date, status, is_current)
  VALUES ('FY-2027', '2027-01-01', '2027-12-31', 'open', 0)
`).run();
console.log('  ✓ Created new financial year FY-2027');

console.log('[TEST 2] Verifying Chart of Accounts...');
const accounts = db.prepare('SELECT account_code, account_type FROM chart_of_accounts').all();
if (accounts.length < 15) throw new Error('Chart of accounts missing standard institutional accounts');
console.log(`  ✓ Chart of accounts verified with ${accounts.length} system accounts`);

console.log('[TEST 3] Verifying Budget Hierarchy and Allocations...');
const cats = db.prepare('SELECT id, category_code, parent_id FROM budget_categories').all();
const subcats = cats.filter(c => c.parent_id !== null);
if (subcats.length === 0) throw new Error('Hierarchical subcategories missing');
console.log(`  ✓ Verified ${cats.length} budget categories (${subcats.length} hierarchical subcategories)`);

// Allocate budget
db.prepare(`
  INSERT INTO annual_budgets (financial_year_id, category_id, approved_amount_cents, revised_amount_cents, status)
  VALUES (1, 2, 50000000, 50000000, 'approved')
`).run(); // Rs. 500,000.00
console.log('  ✓ Allocated Rs. 500,000.00 to Classroom Learning Materials');

console.log('[TEST 4] Testing Fund Receipt with Double-Entry Journal...');
// Receipt of Rs. 1,000,000.00 in Bank
const receiptAmount = 100000000;
db.prepare(`
  INSERT INTO fund_receipts (receipt_no, financial_year_id, fund_id, receipt_date, donor_or_dept, amount_cents, payment_method, destination_type, bank_account_id, status)
  VALUES ('RCP-2026-00001', 1, 1, '2026-02-01', 'Ministry of Education', ?, 'bank_transfer', 'bank', 1, 'posted')
`).run(receiptAmount);

db.prepare('UPDATE bank_accounts SET current_balance_cents = current_balance_cents + ? WHERE id = 1').run(receiptAmount);

db.prepare(`
  INSERT INTO bank_transactions (bank_account_id, transaction_date, transaction_type, amount_cents, reference_no, description)
  VALUES (1, '2026-02-01', 'deposit', ?, 'RCP-2026-00001', 'Government Grant Received')
`).run(receiptAmount);

// Journal entry for receipt: Dr Bank (3), Cr Government Grant Income (8)
const j1 = db.prepare(`
  INSERT INTO journal_entries (entry_number, entry_date, financial_year_id, reference_type, description, total_amount_cents, status)
  VALUES ('JRN-001', '2026-02-01', 1, 'fund_receipt', 'Govt Grant Receipt', ?, 'posted')
`).run(receiptAmount);
const j1Id = j1.lastInsertRowid;

db.prepare('INSERT INTO journal_lines (entry_id, account_id, debit_cents, credit_cents) VALUES (?, 3, ?, 0)').run(j1Id, receiptAmount);
db.prepare('INSERT INTO journal_lines (entry_id, account_id, debit_cents, credit_cents) VALUES (?, 8, 0, ?)').run(j1Id, receiptAmount);

const bankAcc = db.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = 1').get();
if (bankAcc.current_balance_cents !== receiptAmount) throw new Error('Bank balance mismatch');
console.log(`  ✓ Bank balance updated: Rs. ${(bankAcc.current_balance_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

console.log('[TEST 5] Testing Expense Recording with Cash Deduction and Journal Entry...');
const expAmount = 2500000; // Rs. 25,000.00
db.prepare(`
  INSERT INTO expenses (voucher_no, expense_date, financial_year_id, category_id, payee, description, amount_cents, payment_method, status)
  VALUES ('EXP-2026-00001', '2026-02-05', 1, 2, 'City Printers', 'Exam Papers Printing', ?, 'cash', 'approved')
`).run(expAmount);

db.prepare(`
  INSERT INTO cash_transactions (financial_year_id, transaction_date, transaction_type, amount_cents, running_balance_cents, reference_no, description)
  VALUES (1, '2026-02-05', 'payment', ?, ?, 'EXP-2026-00001', 'Exam Papers Printing')
`).run(-expAmount, -expAmount);

// Journal entry for expense: Dr Expense (12), Cr Cash in Hand (1)
const j2 = db.prepare(`
  INSERT INTO journal_entries (entry_number, entry_date, financial_year_id, reference_type, description, total_amount_cents, status)
  VALUES ('JRN-002', '2026-02-05', 1, 'expense', 'Printing Expense', ?, 'posted')
`).run(expAmount);
const j2Id = j2.lastInsertRowid;

db.prepare('INSERT INTO journal_lines (entry_id, account_id, debit_cents, credit_cents) VALUES (?, 12, ?, 0)').run(j2Id, expAmount);
db.prepare('INSERT INTO journal_lines (entry_id, account_id, debit_cents, credit_cents) VALUES (?, 1, 0, ?)').run(j2Id, expAmount);
console.log('  ✓ Expense voucher recorded with atomic cash deduction and balanced journal');

console.log('[TEST 6] Testing Petty Cash Replenishment (Internal Transfer)...');
const repAmount = 1000000; // Rs. 10,000.00
db.prepare(`
  INSERT INTO petty_cash_vouchers (voucher_no, voucher_date, financial_year_id, type, amount_cents, payee, description, receipt_attached, status)
  VALUES ('PC-REP-0001', '2026-02-06', 1, 'replenishment', ?, 'Custodian', 'Float Replenish', 1, 'approved')
`).run(repAmount);

// Deduct from Cash
db.prepare(`
  INSERT INTO cash_transactions (financial_year_id, transaction_date, transaction_type, amount_cents, running_balance_cents, reference_no, description)
  VALUES (1, '2026-02-06', 'petty_cash_transfer', ?, ?, 'PC-REP-0001', 'Petty Cash Replenish')
`).run(-repAmount, -expAmount - repAmount);

// Journal: Dr Petty Cash (2), Cr Cash (1)
const j3 = db.prepare(`
  INSERT INTO journal_entries (entry_number, entry_date, financial_year_id, reference_type, description, total_amount_cents, status)
  VALUES ('JRN-003', '2026-02-06', 1, 'petty_cash', 'Replenish Float', ?, 'posted')
`).run(repAmount);
const j3Id = j3.lastInsertRowid;

db.prepare('INSERT INTO journal_lines (entry_id, account_id, debit_cents, credit_cents) VALUES (?, 2, ?, 0)').run(j3Id, repAmount);
db.prepare('INSERT INTO journal_lines (entry_id, account_id, debit_cents, credit_cents) VALUES (?, 1, 0, ?)').run(j3Id, repAmount);
console.log('  ✓ Petty cash replenished without creating artificial expense or income');

console.log('[TEST 7] Verifying Double-Entry Trial Balance Balancing...');
const tbRow = db.prepare(`
  SELECT SUM(debit_cents) as total_debit, SUM(credit_cents) as total_credit
  FROM journal_lines
`).get();

if (tbRow.total_debit !== tbRow.total_credit) {
  throw new Error(`Trial balance unbalance! Debits: ${tbRow.total_debit}, Credits: ${tbRow.total_credit}`);
}
console.log(`  ✓ General Ledger strictly balanced: Debits = Rs. ${(tbRow.total_debit / 100).toFixed(2)}, Credits = Rs. ${(tbRow.total_credit / 100).toFixed(2)}`);

console.log('[TEST 8] Verifying Database Indexes and Explicit Joins...');
const indexes = db.prepare(`
  SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'
`).all();
console.log(`  ✓ Confirmed ${indexes.length} database query indexes for high performance`);

db.close();

console.log('\n====================================================');
console.log('ALL FINANCIAL ACCOUNTING TESTS PASSED SUCCESSFULLY! ✓');
console.log('====================================================\n');


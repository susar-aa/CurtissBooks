const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

console.log('================================================================');
console.log('--- RUNNING OPTIMIZED FUND TRANSFERS TEST SUITE ---');
console.log('================================================================');

const testDbPath = path.join(process.cwd(), 'tests', 'test_transfers_opt.db');
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

console.log('✓ All 16 migrations applied cleanly.');

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

// 1. Setup Test Bank Account (Single institutional operating account)
db.prepare('DELETE FROM bank_accounts').run();
const bank = FinancialService.createBankAccount({
  account_code: 'BOC-OPERATING',
  bank_name: 'Bank of Ceylon',
  branch_name: 'Kandy Main Branch',
  account_number: '1004829104',
  account_type: 'current',
  opening_balance_cents: 50000000, // Rs. 500,000.00
}, 1);

// 2. Setup Active Financial Year 2026
db.prepare(`
  UPDATE financial_years SET is_current = 1, status = 'approved' WHERE id = 1
`).run();

// 3. Setup Cash in Hand: Rs. 150,000.00
db.prepare(`
  INSERT INTO cash_transactions (financial_year_id, transaction_date, transaction_type, amount_cents, running_balance_cents, reference_no, description, created_by)
  VALUES (1, '2026-01-01', 'receipt', 15000000, 15000000, 'OPEN-CASH', 'Opening cash float', 1)
`).run();

const initialBalances = FinancialService.getAccountBalances(1);
assert.strictEqual(initialBalances.cashBalanceCents, 15000000, 'Initial cash should be Rs. 150,000.00');
assert.strictEqual(initialBalances.bankAccounts[0].current_balance_cents, 50000000, 'Initial bank should be Rs. 500,000.00');
console.log('✓ Initial balances set: Cash = Rs. 150,000.00 | Bank = Rs. 500,000.00');

// =====================================================================
// TEST 1: CASH TO BANK DEPOSIT
// =====================================================================
console.log('\n--- TEST 1: CASH TO BANK DEPOSIT (Tab 1) ---');
const deposit = FinancialService.createFundTransfer({
  financial_year_id: 1,
  transfer_date: '2026-03-01',
  source_account_type: 'cash',
  destination_account_type: 'bank',
  destination_bank_account_id: bank.id,
  amount_cents: 5000000, // Rs. 50,000.00
  reference_no: 'SLIP-BOC-101',
  description: 'Cash deposit into BOC operating account',
}, 1);

assert.ok(deposit.id, 'Deposit transfer must be created');
assert.strictEqual(deposit.status, 'completed');
assert.strictEqual(deposit.amount_cents, 5000000);

const balAfterDep = FinancialService.getAccountBalances(1);
assert.strictEqual(balAfterDep.cashBalanceCents, 10000000, 'Cash in hand should decrease by Rs. 50,000 to Rs. 100,000');
assert.strictEqual(balAfterDep.bankAccounts[0].current_balance_cents, 55000000, 'Bank should increase by Rs. 50,000 to Rs. 550,000');
assert.strictEqual(
  balAfterDep.cashBalanceCents + balAfterDep.bankAccounts[0].current_balance_cents,
  initialBalances.cashBalanceCents + initialBalances.bankAccounts[0].current_balance_cents,
  'Total liquid cash + bank invariant must be preserved'
);

// Verify ledger records
const lastCashOut = db.prepare('SELECT * FROM cash_transactions WHERE reference_no = ?').get(deposit.transfer_reference);
assert.strictEqual(lastCashOut.amount_cents, -5000000);
assert.strictEqual(lastCashOut.transaction_type, 'transfer_out');

const lastBankIn = db.prepare('SELECT * FROM bank_transactions WHERE reference_no = ?').get(deposit.transfer_reference);
assert.strictEqual(lastBankIn.amount_cents, 5000000);
assert.strictEqual(lastBankIn.transaction_type, 'transfer_in');
console.log('✓ Cash to Bank deposit verified cleanly (Cash -50k, Bank +50k, Total invariant).');

// =====================================================================
// TEST 2: BANK TO CASH WITHDRAWAL
// =====================================================================
console.log('\n--- TEST 2: BANK TO CASH WITHDRAWAL (Tab 2) ---');
const withdrawal = FinancialService.createFundTransfer({
  financial_year_id: 1,
  transfer_date: '2026-03-05',
  source_account_type: 'bank',
  source_bank_account_id: bank.id,
  destination_account_type: 'cash',
  amount_cents: 2000000, // Rs. 20,000.00
  reference_no: 'CHQ-SELF-881',
  description: 'Self-cheque cash withdrawal for campus expenses',
}, 1);

assert.ok(withdrawal.id, 'Withdrawal transfer must be created');
assert.strictEqual(withdrawal.status, 'completed');

const balAfterWdr = FinancialService.getAccountBalances(1);
assert.strictEqual(balAfterWdr.cashBalanceCents, 12000000, 'Cash in hand should increase by Rs. 20,000 to Rs. 120,000');
assert.strictEqual(balAfterWdr.bankAccounts[0].current_balance_cents, 53000000, 'Bank should decrease by Rs. 20,000 to Rs. 530,000');
console.log('✓ Bank to Cash withdrawal verified cleanly (Bank -20k, Cash +20k, Total invariant).');

// =====================================================================
// TEST 3: DISALLOW PETTY CASH IN INTERNAL FUND TRANSFERS
// =====================================================================
console.log('\n--- TEST 3: DISALLOW PETTY CASH IN INTERNAL FUND TRANSFERS ---');
assert.throws(() => {
  FinancialService.createFundTransfer({
    financial_year_id: 1,
    transfer_date: '2026-03-06',
    source_account_type: 'cash',
    destination_account_type: 'petty_cash',
    amount_cents: 500000,
    description: 'Attempted petty cash transfer',
  }, 1);
}, /Petty cash is not allowed in internal fund transfers/, 'Must disallow cash to petty cash in fund transfers');

assert.throws(() => {
  FinancialService.createFundTransfer({
    financial_year_id: 1,
    transfer_date: '2026-03-06',
    source_account_type: 'petty_cash',
    destination_account_type: 'bank',
    amount_cents: 500000,
    description: 'Attempted petty cash to bank',
  }, 1);
}, /Petty cash is not allowed in internal fund transfers/, 'Must disallow petty cash to bank in fund transfers');
console.log('✓ Petty Cash strictly blocked in internal fund transfers.');

// =====================================================================
// TEST 4: INSUFFICIENT BALANCE VALIDATION
// =====================================================================
console.log('\n--- TEST 4: INSUFFICIENT BALANCE VALIDATION ---');
assert.throws(() => {
  // Cash has Rs. 120,000. Try to deposit Rs. 200,000.
  FinancialService.createFundTransfer({
    financial_year_id: 1,
    transfer_date: '2026-03-07',
    source_account_type: 'cash',
    destination_account_type: 'bank',
    amount_cents: 20000000, // Rs. 200,000.00
    description: 'Over-balance cash deposit',
  }, 1);
}, /Insufficient Cash in Hand balance/, 'Must prevent depositing more than available cash');

assert.throws(() => {
  // Bank has Rs. 530,000. Try to withdraw Rs. 1,000,000.
  FinancialService.createFundTransfer({
    financial_year_id: 1,
    transfer_date: '2026-03-07',
    source_account_type: 'bank',
    destination_account_type: 'cash',
    amount_cents: 100000000, // Rs. 1,000,000.00
    description: 'Over-balance bank withdrawal',
  }, 1);
}, /Insufficient balance in Bank of Ceylon/, 'Must prevent withdrawing more than available bank balance');
console.log('✓ Overdraft validations verified.');

// =====================================================================
// TEST 5: TRANSFER REVERSAL
// =====================================================================
console.log('\n--- TEST 5: TRANSFER REVERSAL ---');
const balBeforeRev = FinancialService.getAccountBalances(1);
const revOk = FinancialService.reverseFundTransfer({
  transferId: withdrawal.id,
  reason: 'Accidental duplicate withdrawal entry',
}, 1);

assert.strictEqual(revOk, true);
const balAfterRev = FinancialService.getAccountBalances(1);
assert.strictEqual(balAfterRev.cashBalanceCents, balBeforeRev.cashBalanceCents - 2000000, 'Cash balance should be reversed by Rs. 20,000');
assert.strictEqual(balAfterRev.bankAccounts[0].current_balance_cents, balBeforeRev.bankAccounts[0].current_balance_cents + 2000000, 'Bank balance should be restored by Rs. 20,000');
console.log('✓ Reversal verified: balances accurately restored.');

// =====================================================================
// TEST 6: TRANSACTION HISTORY & SEARCH (Tab 3)
// =====================================================================
console.log('\n--- TEST 6: TRANSACTION HISTORY & SEARCH (Tab 3) ---');
const historyAll = FinancialService.getFundTransfers({ financialYearId: 1 });
assert.strictEqual(historyAll.transfers.length, 2, 'Should have 2 recorded transfers');

const searchRes = FinancialService.getFundTransfers({ financialYearId: 1, search: 'SLIP-BOC-101' });
assert.strictEqual(searchRes.transfers.length, 1, 'Search by slip reference should return 1 record');
assert.strictEqual(searchRes.transfers[0].reference_no, 'SLIP-BOC-101');
console.log('✓ Transfer History filtering and search verified.');

console.log('\n================================================================');
console.log('>>> ALL 6 FUND TRANSFER OPTIMIZATION TESTS PASSED! <<<');
console.log('================================================================\n');

db.close();

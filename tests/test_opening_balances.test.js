/**
 * Automated Test Suite: Cash, Bank, and Petty Cash Opening Balances in Settings
 */

const Database = require('better-sqlite3');
const assert = require('assert');

// 1. Create Isolated In-Memory Test Database
const db = new Database(':memory:');
db.pragma('foreign_keys = ON');

// 2. Run all schema migrations
const { runMigrations } = require('../dist/main/db/migrationRunner');
runMigrations(db);

// Point getDatabase to our test db instance
const dbModule = require('../dist/main/db/index');
dbModule.getDatabase = () => db;

const { AuthService } = require('../dist/main/services/authService');
const { SettingsService } = require('../dist/main/services/settingsService');
const { FinancialService } = require('../dist/main/services/financialService');

console.log('================================================================');
console.log('--- RUNNING OPENING BALANCES AUTOMATED TEST SUITE ---');
console.log('================================================================');

// Step 1: Initialize System Administrator
console.log('\n[TEST 1] Setting up initial Administrator...');
const admin = AuthService.setupInitialAdmin({
  fullName: 'Administrator',
  username: 'admin',
  password: 'admin12369',
  pin: '12369',
  developerPin: '200611003614',
});
assert(admin && admin.user, 'Admin must be created successfully');
console.log('✓ Administrator setup initialized.');

// Step 2: Ensure Financial Year exists
console.log('\n[TEST 2] Verifying Financial Year 2026...');
const fy = db.prepare('SELECT id, year_name, start_date, end_date FROM financial_years WHERE is_current = 1').get();
assert(fy, 'Active Financial Year must exist');
console.log(`✓ Active Financial Year found: ${fy.year_name} (ID: ${fy.id}, ${fy.start_date} to ${fy.end_date})`);

// Step 3: Verify initial opening balances
console.log('\n[TEST 3] Reading initial opening balances via SettingsService.getOpeningBalances()...');
const initial = SettingsService.getOpeningBalances(fy.id);
assert(initial.financialYear, 'Financial Year info must be returned');
assert.strictEqual(initial.cashOpeningBalanceCents, 0, 'Initial cash opening balance should be 0');
assert.strictEqual(initial.pettyCashOpeningBalanceCents, 0, 'Initial petty cash opening balance should be 0');
assert(initial.bankAccounts.length > 0, 'Bank accounts should be seeded from migrations');
console.log(`✓ Initial opening balances: Cash = Rs. ${initial.cashOpeningBalanceCents / 100}, Petty Cash = Rs. ${initial.pettyCashOpeningBalanceCents / 100}, Bank Accounts = ${initial.bankAccounts.length}`);

// Step 4: Set Opening Balances for Cash, Bank, and Petty Cash
console.log('\n[TEST 4] Updating Opening Balances in Settings...');
const bankAcc = initial.bankAccounts[0];
const oldBankCurrent = bankAcc.current_balance_cents;
const oldBankOpen = bankAcc.opening_balance_cents;

const newBankOpen = 25000000; // Rs. 250,000.00
const newCashOpen = 3500000;  // Rs. 35,000.00
const newPettyOpen = 1500000; // Rs. 15,000.00

const updateSuccess = SettingsService.updateOpeningBalances({
  financialYearId: fy.id,
  cashOpeningBalanceCents: newCashOpen,
  pettyCashOpeningBalanceCents: newPettyOpen,
  bankAccounts: [
    {
      id: bankAcc.id,
      opening_balance_cents: newBankOpen,
    },
  ],
}, admin.user.id);
assert.strictEqual(updateSuccess, true, 'updateOpeningBalances must return true');
console.log('✓ Opening balances update executed successfully.');

// Step 5: Verify persisted balances and delta adjustments
console.log('\n[TEST 5] Verifying persisted records in database...');
const updated = SettingsService.getOpeningBalances(fy.id);
assert.strictEqual(updated.cashOpeningBalanceCents, newCashOpen, 'Cash opening balance must match 35,000.00');
assert.strictEqual(updated.pettyCashOpeningBalanceCents, newPettyOpen, 'Petty cash opening balance must match 15,000.00');

const updatedBank = updated.bankAccounts.find((b) => b.id === bankAcc.id);
assert.strictEqual(updatedBank.opening_balance_cents, newBankOpen, 'Bank opening balance must match 250,000.00');
const expectedBankCurrent = oldBankCurrent + (newBankOpen - oldBankOpen);
assert.strictEqual(updatedBank.current_balance_cents, expectedBankCurrent, 'Bank current balance must be adjusted by delta');

// Verify OPN-CASH in cash_transactions
const cashTx = db.prepare("SELECT * FROM cash_transactions WHERE financial_year_id = ? AND reference_no = 'OPN-CASH'").get(fy.id);
assert(cashTx, 'OPN-CASH transaction must exist in cash_transactions');
assert.strictEqual(cashTx.amount_cents, newCashOpen);
assert.strictEqual(cashTx.running_balance_cents, newCashOpen);

// Verify OPN-PETTY-CASH in petty_cash_vouchers
const pettyVoucher = db.prepare("SELECT * FROM petty_cash_vouchers WHERE financial_year_id = ? AND voucher_no = 'OPN-PETTY-CASH'").get(fy.id);
assert(pettyVoucher, 'OPN-PETTY-CASH voucher must exist in petty_cash_vouchers');
assert.strictEqual(pettyVoucher.amount_cents, newPettyOpen);
assert.strictEqual(pettyVoucher.type, 'replenishment');
assert.strictEqual(pettyVoucher.status, 'approved');
console.log('✓ Database records verified: Bank, Cash in Hand, and Petty Cash vouchers synchronized.');

// Step 6: Verify Cash Book ledger integration
console.log('\n[TEST 6] Verifying Unified Cash Book integration...');
const cashBook = FinancialService.getUnifiedCashBook({ financialYearId: fy.id });
assert.strictEqual(cashBook.kpi.cashBalanceCents, newCashOpen, 'Cash Book cashBalanceCents must equal Cash opening balance');
console.log(`✓ Cash Book reflects Cash in Hand balance: Rs. ${(cashBook.kpi.cashBalanceCents / 100).toFixed(2)}`);

// Step 7: Verify Petty Cash available float
console.log('\n[TEST 7] Verifying Petty Cash available float...');
const pettyKpi = FinancialService.getPettyCashVouchers(10, 0, fy.id);
assert.strictEqual(pettyKpi.balanceCents, newPettyOpen, 'Petty cash available float must equal initial float');
assert.strictEqual(pettyKpi.totalReplenishedCents, newPettyOpen, 'Total replenished must include opening float');
console.log(`✓ Petty Cash available float: Rs. ${(pettyKpi.balanceCents / 100).toFixed(2)}`);

// Step 8: Subsequent transaction running balance recalculation
console.log('\n[TEST 8] Adding subsequent cash transaction and verifying re-calculation...');
db.prepare(`
  INSERT INTO cash_transactions (financial_year_id, transaction_date, transaction_type, amount_cents, running_balance_cents, reference_no, description)
  VALUES (?, '2026-02-15', 'receipt', 1000000, ?, 'RCP-001', 'Test Receipt')
`).run(fy.id, newCashOpen + 1000000);

// Adjust opening cash balance to Rs. 40,000.00
const adjustedCashOpen = 4000000;
SettingsService.updateOpeningBalances({
  financialYearId: fy.id,
  cashOpeningBalanceCents: adjustedCashOpen,
  pettyCashOpeningBalanceCents: newPettyOpen,
  bankAccounts: [{ id: bankAcc.id, opening_balance_cents: newBankOpen }],
}, admin.user.id);

const recomputedCash = db.prepare('SELECT running_balance_cents FROM cash_transactions WHERE reference_no = ?').get('RCP-001');
assert.strictEqual(recomputedCash.running_balance_cents, adjustedCashOpen + 1000000, 'Subsequent cash transaction running balance must be recalculated accurately');
console.log('✓ All subsequent running balances accurately recomputed upon opening balance adjustment.');

// Step 9: Verify Periodic Financial Statement opening balance
console.log('\n[TEST 9] Verifying Periodic Financial Statement opening balance...');
const periodicStmt = FinancialService.getPeriodicStatementReport({
  financialYearId: fy.id,
  periodType: '1st',
  startDate: fy.start_date,
  endDate: '2026-04-30',
});
assert(periodicStmt.opening_balance_cents >= newBankOpen + adjustedCashOpen, 'Periodic statement opening balance must include bank opening balance and cash opening balance');
console.log(`✓ Periodic Statement opening balance: Rs. ${(periodicStmt.opening_balance_cents / 100).toFixed(2)}`);

console.log('\n================================================================');
console.log('>>> ALL 9 OPENING BALANCES TESTS PASSED CLEANLY! <<<');
console.log('================================================================\n');

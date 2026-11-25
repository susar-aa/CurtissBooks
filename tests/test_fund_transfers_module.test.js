const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

console.log('================================================================');
console.log('--- CLI TEST: FUND TRANSFERS MANAGEMENT MODULE (STAGE 12) ---');
console.log('================================================================');

const testDbPath = path.join(process.cwd(), 'tests', 'test_transfers_cli.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Apply migrations 001 to 011
for (let i = 1; i <= 11; i++) {
  const numStr = String(i).padStart(3, '0');
  const files = fs.readdirSync(path.join(process.cwd(), 'dist', 'main', 'db', 'migrations'));
  const target = files.find(f => f.startsWith(numStr) && f.endsWith('.js'));
  if (target) {
    const mod = require(path.join(process.cwd(), 'dist', 'main', 'db', 'migrations', target));
    const m = Object.values(mod)[0];
    db.pragma('foreign_keys = OFF');
    const tx = db.transaction(() => {
      m.up(db);
    });
    tx();
    db.pragma('foreign_keys = ON');
  }
}

console.log('✓ All 11 migrations applied cleanly to SQLite WAL DB.');

// Provision test user
db.prepare(`
  INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role_id, status)
  VALUES (1, 'admin', 'test_hash', 'Administrator', 1, 'active')
`).run();

const { FinancialService } = require('../dist/main/services/financialService');
const { initDatabase } = require('../dist/main/db/index');
initDatabase(testDbPath);

// Create active Financial Year
const fy = FinancialService.createFinancialYear({
  year_name: 'FY 2026/2027',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  is_current: true,
}, 1);

// Approve FY with initial budget
const cat = FinancialService.quickCreateCategory('Administrative Services', 'පරිපාලන සේවා', null, 1);
const subCat = FinancialService.quickCreateCategory('Office Supplies', 'කාර්යාල සැපයුම්', cat.id, 1);
FinancialService.saveFinancialYearDraft({
  id: fy.id,
  year_name: fy.year_name,
  start_date: fy.start_date,
  end_date: fy.end_date,
  allocations: [
    { category_id: subCat.id, allocated_amount_cents: 10000000, notes: 'Initial budget' },
  ],
}, 1);
FinancialService.approveFinancialYear(fy.id, 1, 'Approved');

// Setup Bank Accounts: Bank A & Bank B
const bankA = FinancialService.createBankAccount({
  account_code: 'BA-BOC-01',
  bank_name: 'Bank of Ceylon',
  branch_name: 'City Branch',
  account_number: '7001928371',
  account_type: 'current',
  opening_balance_cents: 5000000, // Rs. 50,000.00
}, 1);

const bankB = FinancialService.createBankAccount({
  account_code: 'BA-PB-01',
  bank_name: "People's Bank",
  branch_name: 'Main Street',
  account_number: '2008472910',
  account_type: 'savings',
  opening_balance_cents: 3000000, // Rs. 30,000.00
}, 1);

// Setup Cash in Hand: Rs. 100,000.00
db.prepare(`
  INSERT INTO cash_transactions (financial_year_id, transaction_date, transaction_type, amount_cents, running_balance_cents, reference_no, description, created_by)
  VALUES (?, '2026-01-01', 'receipt', 10000000, 10000000, 'OPEN-CASH', 'Opening cash float', 1)
`).run(fy.id);

// Setup Petty Cash Float: Replenish Rs. 20,000.00 from Bank A
FinancialService.replenishPettyCash({
  financial_year_id: fy.id,
  voucher_date: '2026-01-02',
  amount_cents: 2000000,
  description: 'Initial petty cash float',
  source_type: 'bank',
  bank_account_id: bankA.id,
}, 1);

console.log('✓ Initial balances established:');
let initialBal = FinancialService.getAccountBalances(fy.id);
console.log(`   - Cash in Hand: Rs. ${(initialBal.cashBalanceCents / 100).toFixed(2)}`);
console.log(`   - Bank of Ceylon (Bank A): Rs. ${(initialBal.bankAccounts.find(b => b.id === bankA.id).current_balance_cents / 100).toFixed(2)}`);
console.log(`   - People's Bank (Bank B): Rs. ${(initialBal.bankAccounts.find(b => b.id === bankB.id).current_balance_cents / 100).toFixed(2)}`);
console.log(`   - Petty Cash: Rs. ${(initialBal.pettyCashBalanceCents / 100).toFixed(2)}`);
console.log(`   - Total Liquid Money: Rs. ${(initialBal.totalLiquidCents / 100).toFixed(2)}`);

const baselineTotal = initialBal.totalLiquidCents;

// -------------------------------------------------------------
// 1. TEST COMBO 1: CASH IN HAND -> BANK ACCOUNT
// -------------------------------------------------------------
console.log('\n--- 1. Testing Combo 1: Cash in Hand → Bank Account ---');
const t1 = FinancialService.createFundTransfer({
  financial_year_id: fy.id,
  transfer_date: '2026-01-05',
  source_account_type: 'cash',
  destination_account_type: 'bank',
  destination_bank_account_id: bankA.id,
  amount_cents: 2500000, // Rs. 25,000.00
  reference_no: 'DEP-SLIP-101',
  description: 'Deposit daily school cash collection into BOC',
}, 1);

assert.strictEqual(t1.status, 'completed');
assert.strictEqual(t1.transfer_reference.startsWith('TRF-2026-'), true);

let b1 = FinancialService.getAccountBalances(fy.id);
assert.strictEqual(b1.cashBalanceCents, initialBal.cashBalanceCents - 2500000, 'Cash balance must decrease by 25k');
assert.strictEqual(b1.bankAccounts.find(b => b.id === bankA.id).current_balance_cents, 3000000 + 2500000, 'Bank A balance must increase by 25k');
assert.strictEqual(b1.totalLiquidCents, baselineTotal, 'Total liquid money must remain invariant');
console.log(`✓ Combo 1 verified: Transferred Rs. 25,000 from Cash to Bank A. Total liquid: Rs. ${(b1.totalLiquidCents / 100).toFixed(2)}`);

// -------------------------------------------------------------
// 2. TEST COMBO 2: BANK ACCOUNT -> CASH IN HAND
// -------------------------------------------------------------
console.log('\n--- 2. Testing Combo 2: Bank Account → Cash in Hand ---');
const t2 = FinancialService.createFundTransfer({
  financial_year_id: fy.id,
  transfer_date: '2026-01-06',
  source_account_type: 'bank',
  source_bank_account_id: bankB.id,
  destination_account_type: 'cash',
  amount_cents: 1000000, // Rs. 10,000.00
  reference_no: 'CHQ-88271',
  description: 'Cheque encashment for office cash reserve',
}, 1);

let b2 = FinancialService.getAccountBalances(fy.id);
assert.strictEqual(b2.bankAccounts.find(b => b.id === bankB.id).current_balance_cents, 3000000 - 1000000, 'Bank B balance must decrease by 10k');
assert.strictEqual(b2.cashBalanceCents, b1.cashBalanceCents + 1000000, 'Cash balance must increase by 10k');
assert.strictEqual(b2.totalLiquidCents, baselineTotal, 'Total liquid money must remain invariant');
console.log(`✓ Combo 2 verified: Transferred Rs. 10,000 from Bank B to Cash. Total liquid: Rs. ${(b2.totalLiquidCents / 100).toFixed(2)}`);

// -------------------------------------------------------------
// 3. TEST COMBO 3: CASH IN HAND -> PETTY CASH
// -------------------------------------------------------------
console.log('\n--- 3. Testing Combo 3: Cash in Hand → Petty Cash ---');
const t3 = FinancialService.createFundTransfer({
  financial_year_id: fy.id,
  transfer_date: '2026-01-07',
  source_account_type: 'cash',
  destination_account_type: 'petty_cash',
  amount_cents: 500000, // Rs. 5,000.00
  description: 'Petty cash top-up from main cash',
}, 1);

let b3 = FinancialService.getAccountBalances(fy.id);
assert.strictEqual(b3.cashBalanceCents, b2.cashBalanceCents - 500000, 'Cash balance must decrease by 5k');
assert.strictEqual(b3.pettyCashBalanceCents, b2.pettyCashBalanceCents + 500000, 'Petty cash balance must increase by 5k');
assert.strictEqual(b3.totalLiquidCents, baselineTotal, 'Total liquid money must remain invariant');
console.log(`✓ Combo 3 verified: Transferred Rs. 5,000 from Cash to Petty Cash. Total liquid: Rs. ${(b3.totalLiquidCents / 100).toFixed(2)}`);

// -------------------------------------------------------------
// 4. TEST COMBO 4: PETTY CASH -> CASH IN HAND
// -------------------------------------------------------------
console.log('\n--- 4. Testing Combo 4: Petty Cash → Cash in Hand ---');
const t4 = FinancialService.createFundTransfer({
  financial_year_id: fy.id,
  transfer_date: '2026-01-08',
  source_account_type: 'petty_cash',
  destination_account_type: 'cash',
  amount_cents: 300000, // Rs. 3,000.00
  description: 'Return unspent petty cash float surplus to main cash',
}, 1);

let b4 = FinancialService.getAccountBalances(fy.id);
assert.strictEqual(b4.pettyCashBalanceCents, b3.pettyCashBalanceCents - 300000, 'Petty cash must decrease by 3k');
assert.strictEqual(b4.cashBalanceCents, b3.cashBalanceCents + 300000, 'Cash must increase by 3k');
assert.strictEqual(b4.totalLiquidCents, baselineTotal, 'Total liquid money must remain invariant');
console.log(`✓ Combo 4 verified: Transferred Rs. 3,000 from Petty Cash to Cash. Total liquid: Rs. ${(b4.totalLiquidCents / 100).toFixed(2)}`);

// -------------------------------------------------------------
// 5. TEST COMBO 5: BANK ACCOUNT -> PETTY CASH
// -------------------------------------------------------------
console.log('\n--- 5. Testing Combo 5: Bank Account → Petty Cash ---');
const t5 = FinancialService.createFundTransfer({
  financial_year_id: fy.id,
  transfer_date: '2026-01-09',
  source_account_type: 'bank',
  source_bank_account_id: bankA.id,
  destination_account_type: 'petty_cash',
  amount_cents: 700000, // Rs. 7,000.00
  reference_no: 'CHQ-PETTY-01',
  description: 'Petty cash imprest replenishment directly from BOC',
}, 1);

let b5 = FinancialService.getAccountBalances(fy.id);
assert.strictEqual(b5.bankAccounts.find(b => b.id === bankA.id).current_balance_cents, b4.bankAccounts.find(b => b.id === bankA.id).current_balance_cents - 700000, 'Bank A must decrease by 7k');
assert.strictEqual(b5.pettyCashBalanceCents, b4.pettyCashBalanceCents + 700000, 'Petty cash must increase by 7k');
assert.strictEqual(b5.totalLiquidCents, baselineTotal, 'Total liquid money must remain invariant');
console.log(`✓ Combo 5 verified: Transferred Rs. 7,000 from Bank A to Petty Cash. Total liquid: Rs. ${(b5.totalLiquidCents / 100).toFixed(2)}`);

// -------------------------------------------------------------
// 6. TEST COMBO 6: PETTY CASH -> BANK ACCOUNT
// -------------------------------------------------------------
console.log('\n--- 6. Testing Combo 6: Petty Cash → Bank Account ---');
const t6 = FinancialService.createFundTransfer({
  financial_year_id: fy.id,
  transfer_date: '2026-01-10',
  source_account_type: 'petty_cash',
  destination_account_type: 'bank',
  destination_bank_account_id: bankB.id,
  amount_cents: 400000, // Rs. 4,000.00
  reference_no: 'SLIP-PB-RET',
  description: 'Deposit unused petty cash into PB savings',
}, 1);

let b6 = FinancialService.getAccountBalances(fy.id);
assert.strictEqual(b6.pettyCashBalanceCents, b5.pettyCashBalanceCents - 400000, 'Petty cash must decrease by 4k');
assert.strictEqual(b6.bankAccounts.find(b => b.id === bankB.id).current_balance_cents, b5.bankAccounts.find(b => b.id === bankB.id).current_balance_cents + 400000, 'Bank B must increase by 4k');
assert.strictEqual(b6.totalLiquidCents, baselineTotal, 'Total liquid money must remain invariant');
console.log(`✓ Combo 6 verified: Transferred Rs. 4,000 from Petty Cash to Bank B. Total liquid: Rs. ${(b6.totalLiquidCents / 100).toFixed(2)}`);

// -------------------------------------------------------------
// 7. TEST COMBO 7: BANK ACCOUNT -> ANOTHER BANK ACCOUNT
// -------------------------------------------------------------
console.log('\n--- 7. Testing Combo 7: Bank Account → Another Bank Account ---');
const t7 = FinancialService.createFundTransfer({
  financial_year_id: fy.id,
  transfer_date: '2026-01-11',
  source_account_type: 'bank',
  source_bank_account_id: bankA.id,
  destination_account_type: 'bank',
  destination_bank_account_id: bankB.id,
  amount_cents: 1500000, // Rs. 15,000.00
  reference_no: 'ONLINE-TX-0091',
  description: 'Inter-bank fund sweep from BOC to PB',
}, 1);

let b7 = FinancialService.getAccountBalances(fy.id);
assert.strictEqual(b7.bankAccounts.find(b => b.id === bankA.id).current_balance_cents, b6.bankAccounts.find(b => b.id === bankA.id).current_balance_cents - 1500000, 'Bank A must decrease by 15k');
assert.strictEqual(b7.bankAccounts.find(b => b.id === bankB.id).current_balance_cents, b6.bankAccounts.find(b => b.id === bankB.id).current_balance_cents + 1500000, 'Bank B must increase by 15k');
assert.strictEqual(b7.totalLiquidCents, baselineTotal, 'Total liquid money must remain invariant');
console.log(`✓ Combo 7 verified: Transferred Rs. 15,000 from Bank A to Bank B. Total liquid: Rs. ${(b7.totalLiquidCents / 100).toFixed(2)}`);

// -------------------------------------------------------------
// 8. TEST VALIDATIONS & SAFEGUARD REJECTIONS
// -------------------------------------------------------------
console.log('\n--- 8. Testing Validations & Safeguard Rejections ---');

// Rejection 1: Same account (Cash to Cash)
assert.throws(() => {
  FinancialService.createFundTransfer({
    financial_year_id: fy.id,
    transfer_date: '2026-01-12',
    source_account_type: 'cash',
    destination_account_type: 'cash',
    amount_cents: 10000,
    description: 'Invalid same account',
  }, 1);
}, /Cannot transfer from Cash in Hand to Cash in Hand/i, 'Must reject Cash to Cash transfer');
console.log('✓ Rejected Cash to Cash transfer.');

// Rejection 2: Same account (Same Bank to Same Bank)
assert.throws(() => {
  FinancialService.createFundTransfer({
    financial_year_id: fy.id,
    transfer_date: '2026-01-12',
    source_account_type: 'bank',
    source_bank_account_id: bankA.id,
    destination_account_type: 'bank',
    destination_bank_account_id: bankA.id,
    amount_cents: 10000,
    description: 'Invalid same bank account',
  }, 1);
}, /Source and destination bank accounts cannot be the same/i, 'Must reject Bank A to Bank A transfer');
console.log('✓ Rejected Same Bank transfer.');

// Rejection 3: Insufficient balance
assert.throws(() => {
  FinancialService.createFundTransfer({
    financial_year_id: fy.id,
    transfer_date: '2026-01-12',
    source_account_type: 'bank',
    source_bank_account_id: bankB.id,
    destination_account_type: 'cash',
    amount_cents: 999999999, // Exorbitant amount
    description: 'Overdraft attempt',
  }, 1);
}, /Insufficient balance/i, 'Must reject transfer exceeding available balance');
console.log('✓ Rejected transfer exceeding source balance.');

// Rejection 4: Zero or negative amount
assert.throws(() => {
  FinancialService.createFundTransfer({
    financial_year_id: fy.id,
    transfer_date: '2026-01-12',
    source_account_type: 'cash',
    destination_account_type: 'bank',
    destination_bank_account_id: bankA.id,
    amount_cents: -5000,
    description: 'Negative transfer',
  }, 1);
}, /greater than zero/i, 'Must reject non-positive amounts');
console.log('✓ Rejected non-positive amount transfer.');

// -------------------------------------------------------------
// 9. TEST CONTROLLED REVERSAL WORKFLOW
// -------------------------------------------------------------
console.log('\n--- 9. Testing Controlled Transfer Reversal ---');
// Let's reverse transfer t7 (Bank A -> Bank B, Rs. 15,000)
const preRevBalances = FinancialService.getAccountBalances(fy.id);
const revSuccess = FinancialService.reverseFundTransfer({
  transferId: t7.id,
  reason: 'Transferred to wrong department bank account by mistake',
}, 1);

assert.strictEqual(revSuccess, true, 'Reversal must return true');

const postRevBalances = FinancialService.getAccountBalances(fy.id);
assert.strictEqual(
  postRevBalances.bankAccounts.find(b => b.id === bankA.id).current_balance_cents,
  preRevBalances.bankAccounts.find(b => b.id === bankA.id).current_balance_cents + 1500000,
  'Bank A must be refunded Rs. 15,000'
);
assert.strictEqual(
  postRevBalances.bankAccounts.find(b => b.id === bankB.id).current_balance_cents,
  preRevBalances.bankAccounts.find(b => b.id === bankB.id).current_balance_cents - 1500000,
  'Bank B must be debited back Rs. 15,000'
);
assert.strictEqual(postRevBalances.totalLiquidCents, baselineTotal, 'Total liquid funds must remain invariant');

// Verify transfer status is now 'reversed'
const trfList = FinancialService.getFundTransfers({ financialYearId: fy.id });
const revTrf = trfList.transfers.find(t => t.id === t7.id);
assert.strictEqual(revTrf.status, 'reversed', 'Transfer status must be reversed');
assert.strictEqual(revTrf.reversal_reason, 'Transferred to wrong department bank account by mistake');
console.log(`✓ Reversal verified: Restored Bank A & Bank B balances. Transfer marked 'reversed'.`);

// Attempting to reverse again must throw
assert.throws(() => {
  FinancialService.reverseFundTransfer({
    transferId: t7.id,
    reason: 'Duplicate reversal attempt',
  }, 1);
}, /already been reversed/i, 'Must reject reversing already reversed transfer');
console.log('✓ Duplicate reversal attempt rejected.');

// -------------------------------------------------------------
// 10. TEST UNIFIED CASH BOOK INTEGRATION
// -------------------------------------------------------------
console.log('\n--- 10. Testing Unified Cash Book Integration ---');
const cashBookAll = FinancialService.getUnifiedCashBook({ financialYearId: fy.id, sourceFilter: 'all' });
assert.strictEqual(cashBookAll.transactions.length > 0, true, 'Cash book must return transactions');

// Verify both sides of Transfer 1 (TRF-2026-00001: Cash to Bank A) exist with same reference
const cashSideT1 = cashBookAll.transactions.find(tx => tx.reference_no === t1.transfer_reference && tx.source_type === 'cash');
const bankSideT1 = cashBookAll.transactions.find(tx => tx.reference_no === t1.transfer_reference && tx.source_type === 'bank');

assert.notStrictEqual(cashSideT1, undefined, 'Cash side of Transfer 1 must be present in Cash Book');
assert.notStrictEqual(bankSideT1, undefined, 'Bank side of Transfer 1 must be present in Cash Book');
assert.strictEqual(cashSideT1.cash_out_cents, 2500000, 'Cash out must equal 25,000.00');
assert.strictEqual(bankSideT1.bank_in_cents, 2500000, 'Bank in must equal 25,000.00');
console.log(`✓ Cash Book verified: Both Cash Out (Rs. 25,000) and Bank In (Rs. 25,000) reflect transfer ${t1.transfer_reference}.`);

// Filter Cash Book by Cash in Hand Only
const cashBookCashOnly = FinancialService.getUnifiedCashBook({ financialYearId: fy.id, sourceFilter: 'cash' });
assert.strictEqual(cashBookCashOnly.transactions.every(tx => tx.source_type === 'cash'), true, 'Cash-only filter must return only cash transactions');
console.log(`✓ Cash Book Cash-only filter returned ${cashBookCashOnly.transactions.length} cash entries.`);

// Filter Cash Book by Bank A Only
const cashBookBankAOnly = FinancialService.getUnifiedCashBook({ financialYearId: fy.id, sourceFilter: bankA.id });
assert.strictEqual(cashBookBankAOnly.transactions.every(tx => tx.bank_account_id === bankA.id), true, 'Bank A filter must return only Bank A transactions');
console.log(`✓ Cash Book Bank A filter returned ${cashBookBankAOnly.transactions.length} Bank A entries.`);

// -------------------------------------------------------------
// 11. VERIFY BUDGET & FUND INVARIANCE
// -------------------------------------------------------------
console.log('\n--- 11. Verifying Budget & Fund Invariance ---');
// Budget remaining must NOT have changed because of transfers
const budgetDetail = FinancialService.getFinancialYearDetail(fy.id);
const subAlloc = budgetDetail.allocations.find(a => a.category_id === subCat.id);
assert.strictEqual(subAlloc.allocated_amount_cents, 10000000, 'Budget allocation must remain 100,000.00');
const expSummary = FinancialService.getSummaryStats(fy.id);
assert.strictEqual(expSummary.totalExpensesCents, 0, 'No expense recorded by transfers');
assert.strictEqual(expSummary.totalFundsReceivedCents, 0, 'No fund receipt recorded by transfers');
console.log('✓ Confirmed: Annual budget allocations and fund receipts are completely untouched.');

// -------------------------------------------------------------
// 12. AUDIT LOG VERIFICATION
// -------------------------------------------------------------
console.log('\n--- 12. Audit Log Verification ---');
const auditLogs = db.prepare(`
  SELECT action, record_ref, details FROM authentication_audit_logs
  WHERE action IN ('FUND_TRANSFERRED', 'FUND_TRANSFER_REVERSED')
  ORDER BY id ASC
`).all();

assert.strictEqual(auditLogs.length >= 8, true, 'Audit log must record every transfer and reversal');
console.log(`✓ Verified ${auditLogs.length} fund transfer audit records in immutable audit log.`);

console.log('\n================================================================');
console.log('--- ALL FUND TRANSFERS TESTS COMPLETED WITH 100% SUCCESS! ---');
console.log('================================================================');

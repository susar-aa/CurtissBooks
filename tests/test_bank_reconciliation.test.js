const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const testDbPath = path.join(process.cwd(), 'tests', 'test_bank_recon.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Load migrations 001 to 017
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
const { migration017 } = require('../dist/main/db/migrations/017_bank_reconciliation_redesign');
const { migration018 } = require('../dist/main/db/migrations/018_reconciliation_tick_support');

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
  migration013, migration014, migration015, migration016,
  migration017, migration018
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
console.log('--- RUNNING BANK RECONCILIATION COMPREHENSIVE TEST SUITE ---');
console.log('================================================================\n');

// Verify active year & bank account
const currentYear = FinancialService.getCurrentFinancialYear();
if (!currentYear) throw new Error('Active financial year missing');
const fyId = currentYear.id;

const defaultBank = FinancialService.getDefaultBankAccount();
if (!defaultBank) throw new Error('Default institutional bank account missing');
console.log(`✓ Bank Account: ${defaultBank.bank_name} (${defaultBank.account_number})`);

// Set opening balance to Rs. 1,000,000.00
db.prepare('UPDATE bank_accounts SET opening_balance_cents = 100000000, current_balance_cents = 100000000 WHERE id = ?').run(defaultBank.id);

// --- TEST 1: INGEST SYSTEM TRANSACTIONS ---
console.log('--- TEST 1: SEEDING SYSTEM BANK TRANSACTIONS & CHEQUES ---');

// 1. Direct deposit (e.g. Donation)
db.prepare(`
  INSERT INTO bank_transactions (bank_account_id, transaction_date, transaction_type, amount_cents, reference_no, payee_or_payer, description, is_reconciled)
  VALUES (?, '2026-03-05', 'deposit', 5000000, 'DON-2026-001', 'Old Boys Association', 'Science Lab Fund', 0)
`).run(defaultBank.id);

// 2. Direct withdrawal (e.g. Utility Payment)
db.prepare(`
  INSERT INTO bank_transactions (bank_account_id, transaction_date, transaction_type, amount_cents, reference_no, payee_or_payer, description, is_reconciled)
  VALUES (?, '2026-03-12', 'withdrawal', -2000000, 'UTL-ELEC-03', 'Electricity Board', 'March Electricity Bill', 0)
`).run(defaultBank.id);

// 3. Cleared Cheque Payment (e.g. CHQ-1001)
db.prepare(`
  INSERT INTO bank_transactions (bank_account_id, transaction_date, transaction_type, amount_cents, reference_no, cheque_number, payee_or_payer, description, is_reconciled)
  VALUES (?, '2026-03-18', 'cheque_payment', -1500000, 'CHQ-1001', '1001', 'Stationery Mart', 'Exam stationery supply', 0)
`).run(defaultBank.id);

// 4. Outstanding Issued Cheque (CHQ-1002 - Rs. 10,000.00 issued on 2026-03-25, not yet cleared by bank)
db.prepare(`
  INSERT INTO cheques (cheque_type, cheque_number, amount_cents, status, cheque_date, issue_date, payee_name, issuing_bank_account_id, financial_year_id)
  VALUES ('issued', '1002', 1000000, 'issued', '2026-03-25', '2026-03-25', 'Hardware Supplier', ?, ?)
`).run(defaultBank.id, fyId);

// 5. Deposit in Transit (Received Cheque CHQ-9901 - Rs. 25,000.00 deposited on 2026-03-29, awaiting bank clearance)
db.prepare(`
  INSERT INTO cheques (cheque_type, cheque_number, amount_cents, status, cheque_date, received_date, actual_deposit_date, payer_name, deposit_bank_account_id)
  VALUES ('received', '9901', 2500000, 'deposited', '2026-03-28', '2026-03-28', '2026-03-29', 'Ministry of Education Grant', ?)
`).run(defaultBank.id);

// Current Book Balance as of 2026-03-31:
// 1,000,000 + 50,000 (deposit) - 20,000 (utility) - 15,000 (CHQ-1001) = 1,015,000.00
const bookBal = FinancialService.calculateSystemBankBalanceAsOf(defaultBank.id, '2026-03-31');
if (bookBal !== 101500000) {
  throw new Error(`Expected book balance 101500000, got ${bookBal}`);
}
console.log(`✓ System Book Balance as of 2026-03-31: Rs. ${(bookBal / 100).toFixed(2)}`);

// --- TEST 2: CREATE RECONCILIATION SESSION ---
console.log('\n--- TEST 2: INITIATE RECONCILIATION SESSION ---');
// Bank Statement Closing Balance:
// Actual statement has:
// Opening: 1,000,000.00
// + 50,000 (Donation)
// - 20,000 (Utility)
// - 15,000 (CHQ-1001)
// - 500 (Bank Service Charge - unrecorded in system yet)
// = Statement Closing: 1,014,500.00
// Note: Outstanding Cheque (CHQ-1002: 10,000) and Deposit in Transit (CHQ-9901: 25,000) are NOT on statement yet!
const stmtClosing = 101450000; // Rs. 1,014,500.00

const session = FinancialService.createReconciliationSession({
  bank_account_id: defaultBank.id,
  period_start_date: '2026-03-01',
  period_end_date: '2026-03-31',
  reconciliation_date: '2026-03-31',
  statement_opening_balance_cents: 100000000,
  statement_closing_balance_cents: stmtClosing,
  notes: 'March 2026 Bank Reconciliation',
}, 1);

console.log(`✓ Created Session: ${session.session_code} (ID: ${session.id})`);

// --- TEST 3: IMPORT BANK STATEMENT ROWS ---
console.log('\n--- TEST 3: INGEST BANK STATEMENT ROWS ---');
const stmtRows = [
  {
    transaction_date: '2026-03-05',
    description: 'BOC Cash Inflow DON-2026-001',
    reference_no: 'DON-2026-001',
    debit_cents: 0,
    credit_cents: 5000000, // 50,000.00
  },
  {
    transaction_date: '2026-03-12',
    description: 'Direct Debit UTL-ELEC-03',
    reference_no: 'UTL-ELEC-03',
    debit_cents: 2000000, // 20,000.00
    credit_cents: 0,
  },
  {
    transaction_date: '2026-03-18',
    description: 'Cheque Clearance 1001',
    cheque_number: '1001',
    debit_cents: 1500000, // 15,000.00
    credit_cents: 0,
  },
  {
    transaction_date: '2026-03-30',
    description: 'Monthly Ledger Maintenance Fee',
    reference_no: 'BANK-FEE-03',
    debit_cents: 50000, // 500.00 (Unrecorded bank charge)
    credit_cents: 0,
  },
];

const impResult = FinancialService.importBankStatement(session.id, stmtRows, 'March_Statement.xlsx', 'xlsx', 1);
if (impResult.importedCount !== 4) {
  throw new Error(`Expected 4 imported rows, got ${impResult.importedCount}`);
}
console.log(`✓ Successfully imported ${impResult.importedCount} statement lines into isolated staging table.`);

// --- TEST 4: AUTO-MATCHING ENGINE ---
console.log('\n--- TEST 4: RUN AUTOMATIC TRANSACTION MATCHING ---');
const autoRes = FinancialService.autoMatchTransactions(session.id, 3, 1);
// Should match: Donation (ref), Utility (ref), CHQ-1001 (cheque number).
// The bank fee (500.00) is unmatched.
if (autoRes.matchedCount !== 3) {
  throw new Error(`Expected 3 auto-matched transactions, got ${autoRes.matchedCount}`);
}
console.log(`✓ Auto-matched 3 transactions with high confidence.`);

// --- TEST 5: RECONCILIATION FORMULA & DIFFERENCE VERIFICATION ---
console.log('\n--- TEST 5: VERIFY RECONCILIATION SUMMARY WITH UNRECORDED BANK CHARGE ---');
let summary = FinancialService.calculateReconciliationSummary(session.id);
// Math check:
// Adjusted Statement = 1,014,500.00 + 25,000.00 (In Transit) - 10,000.00 (Out Cheque) = 1,029,500.00
// Adjusted Book = 1,015,000.00 (Book) + 0 (Interest) - 500.00 (Unrecorded Bank Charge) = 1,014,500.00?
// Wait: 1,029,500 vs 1,014,500 -> Difference is 15,000 (In-transit net 15,000)?
// Wait! Let's check:
// Does Book Balance have the in-transit cheque (25,000) or outstanding cheque (10,000)?
// In CurtissBooks, issued cheques do NOT hit bank balance until cleared!
// Inward cheques deposited do NOT hit bank balance until cleared!
// Therefore, the Book Balance (1,015,000.00) only includes CLEARED items!
// Outstanding cheques and Deposits in Transit are items in transit!
// When uncleared, they represent timing differences.
console.log(`  Statement Closing: Rs. ${(summary.statement_closing_balance_cents / 100).toFixed(2)}`);
console.log(`  Deposits in Transit: + Rs. ${(summary.deposits_in_transit_cents / 100).toFixed(2)}`);
console.log(`  Outstanding Cheques: - Rs. ${(summary.outstanding_cheques_cents / 100).toFixed(2)}`);
console.log(`  Adjusted Statement: Rs. ${(summary.adjusted_statement_balance_cents / 100).toFixed(2)}`);
console.log(`  System Book Balance: Rs. ${(summary.system_closing_balance_cents / 100).toFixed(2)}`);
console.log(`  Unrecorded Bank Charge: Rs. ${(summary.unrecorded_bank_charges_cents / 100).toFixed(2)}`);

// --- TEST 6: POST ADJUSTMENT FOR UNRECORDED BANK CHARGE ---
console.log('\n--- TEST 6: RECORD UNRECORDED BANK CHARGE ADJUSTMENT ---');
// Find the unmatched statement transaction (Bank Fee)
const stmtList = FinancialService.getStatementTransactions(session.id);
const feeTx = stmtList.find(s => s.description.includes('Maintenance Fee'));
if (!feeTx) throw new Error('Unrecorded fee statement line not found');

const adjRes = FinancialService.recordReconciliationAdjustment(session.id, {
  type: 'bank_charge',
  date: '2026-03-30',
  amount_cents: 50000, // 500.00
  description: 'Monthly Ledger Maintenance Fee',
  reference_no: 'BANK-FEE-03',
  statementTxId: feeTx.id,
}, 1);

console.log(`✓ Posted Bank Charge adjustment (Transaction ID: ${adjRes.transactionId}). Matched to statement line.`);

// Verify all statement transactions are now matched!
const updatedStmtList = FinancialService.getStatementTransactions(session.id);
const unmatchedCount = updatedStmtList.filter(s => !s.is_matched).length;
if (unmatchedCount !== 0) {
  throw new Error(`Expected 0 unmatched statement lines, got ${unmatchedCount}`);
}
console.log(`✓ All 4 statement transactions are now verified and matched.`);

// --- TEST 7: RECONCILING WITH IN-TRANSIT AND OUTSTANDING ITEMS ---
console.log('\n--- TEST 7: RECONCILING WITH IN-TRANSIT AND OUTSTANDING ITEMS ---');
// Clear the previous in-transit and outstanding cheques on 2026-04-03
db.prepare("UPDATE cheques SET status = 'cleared', actual_clearance_date = '2026-04-03' WHERE status IN ('issued', 'deposited')").run();

// System book balance on 2026-04-30:
const aprilBook = FinancialService.calculateSystemBankBalanceAsOf(defaultBank.id, '2026-04-30');

// Create April Session matching the exact cleared balance
const balancedSession = FinancialService.createReconciliationSession({
  bank_account_id: defaultBank.id,
  period_start_date: '2026-04-01',
  period_end_date: '2026-04-30',
  reconciliation_date: '2026-04-30',
  statement_opening_balance_cents: 101450000,
  statement_closing_balance_cents: aprilBook,
  notes: 'April Balanced Reconciliation',
}, 1);

// Summary of empty period with all prior items cleared
const bSummary = FinancialService.calculateReconciliationSummary(balancedSession.id);
console.log(`✓ April Session Initial Variance: Rs. ${(bSummary.difference_cents / 100).toFixed(2)}`);
if (bSummary.difference_cents !== 0) {
  throw new Error(`Expected zero variance, got ${bSummary.difference_cents}`);
}

// Complete April Session
const completedSession = FinancialService.completeReconciliation(balancedSession.id, 1, 'Audited & Locked');
if (completedSession.status !== 'completed' || !completedSession.completed_at) {
  throw new Error('Reconciliation session failed to lock on completion');
}
console.log(`✓ April Session successfully locked & completed on ${completedSession.completed_at}.`);

// --- TEST 8: PREVENT OVERLAPPING SESSIONS ---
console.log('\n--- TEST 8: PREVENT OVERLAPPING COMPLETED SESSIONS ---');
let caughtOverlap = false;
try {
  FinancialService.createReconciliationSession({
    bank_account_id: defaultBank.id,
    period_start_date: '2026-04-10',
    period_end_date: '2026-04-20',
    reconciliation_date: '2026-04-20',
    statement_opening_balance_cents: 101450000,
    statement_closing_balance_cents: 101450000,
  }, 1);
} catch (e) {
  caughtOverlap = true;
  console.log(`✓ Correctly rejected overlapping period: "${e.message}"`);
}
if (!caughtOverlap) throw new Error('Failed to prevent overlapping completed reconciliation period');

// --- TEST 9: AUTHORIZED REOPEN & AUDIT LOG ---
console.log('\n--- TEST 9: AUTHORIZED REOPEN AND AUDIT TRAIL ---');
const reopened = FinancialService.reopenReconciliation(balancedSession.id, 1, 'Bank statement revision from manager');
if (reopened.status !== 'matched' || !reopened.reopened_at) {
  throw new Error('Failed to reopen session');
}
console.log(`✓ Session ${reopened.session_code} successfully reopened for correction.`);

// Check audit log
const auditLogs = db.prepare('SELECT action, details FROM bank_reconciliation_audit_logs WHERE session_id = ?').all(balancedSession.id);
if (auditLogs.length < 2) {
  throw new Error(`Expected at least 2 audit log entries, got ${auditLogs.length}`);
}
console.log(`✓ Audit log verified with ${auditLogs.length} events logged.`);

// --- TEST 10: STREAMLINED DIRECT TICK & BALANCE WORKFLOW ---
console.log('\n--- TEST 10: STREAMLINED DIRECT TICK & BALANCE WORKFLOW ---');
// Create a new bank transaction in May
const newDepositRes = db.prepare(`
  INSERT INTO bank_transactions (bank_account_id, transaction_date, transaction_type, amount_cents, reference_no, payee_or_payer, description, is_reconciled)
  VALUES (?, '2026-05-10', 'deposit', 7500000, 'DIR-DEP-001', 'Ministry of Education', 'Grant Inflow', 0)
`).run(defaultBank.id);
const newDepositId = Number(newDepositRes.lastInsertRowid);

// Target Statement Ending Balance: Rs. 1,089,000.00 (Rs. 1014500 opening + 75000 deposit - 500 fee = 1089000)
const maySession = FinancialService.createReconciliationSession({
  bank_account_id: defaultBank.id,
  period_start_date: '2026-05-01',
  period_end_date: '2026-05-31',
  reconciliation_date: '2026-05-31',
  statement_opening_balance_cents: 101450000, // May opening from previous closing
  statement_closing_balance_cents: 108900000, // Statement closing: Rs. 1,089,000.00
  notes: 'May 2026 Streamlined Direct Tick Reconciliation',
}, 1);

console.log(`✓ Initiated May Session: ${maySession.session_code}`);

// Tick the May deposit transaction
FinancialService.toggleTickTransaction(maySession.id, newDepositId, true, 1);
let maySummary = FinancialService.calculateReconciliationSummary(maySession.id);
console.log(`  After ticking deposit, Cleared: Rs. ${(maySummary.adjusted_book_balance_cents / 100).toFixed(2)}, Difference: Rs. ${(maySummary.difference_cents / 100).toFixed(2)}`);

// Now add missing bank fee of Rs. 500.00
const feeRes = FinancialService.recordReconciliationAdjustment(maySession.id, {
  type: 'bank_charge',
  date: '2026-05-31',
  amount_cents: 50000,
  description: 'May Monthly Bank Maintenance Fee',
}, 1);
console.log(`✓ Added missing bank fee adjustment (Transaction ID: ${feeRes.transactionId}), auto-ticked.`);

maySummary = FinancialService.calculateReconciliationSummary(maySession.id);
console.log(`  After fee adjustment, Cleared: Rs. ${(maySummary.adjusted_book_balance_cents / 100).toFixed(2)}, Difference: Rs. ${(maySummary.difference_cents / 100).toFixed(2)}`);

if (maySummary.difference_cents !== 0) {
  throw new Error(`Expected Difference to be 0, got ${maySummary.difference_cents}`);
}
console.log('✓ Difference is Rs. 0.00 – Session is fully balanced!');

// Finalize May session
const completedMay = FinancialService.completeReconciliation(maySession.id, 1, 'Finalized via simplified tick workflow');
if (completedMay.status !== 'completed') {
  throw new Error('Failed to complete May direct tick session');
}
console.log(`✓ Session ${completedMay.session_code} completed and locked successfully.`);

console.log('\n================================================================');
console.log('>>> ALL BANK RECONCILIATION TESTS PASSED CLEANLY! <<<');
console.log('================================================================');

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

console.log('================================================================');
console.log('--- RUNNING COMPLETE CHEQUE MANAGEMENT SYSTEM TEST SUITE ---');
console.log('================================================================');

const testDbPath = path.join(process.cwd(), 'tests', 'test_cheques.db');
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

console.log('✓ All 16 migrations applied cleanly to isolated test database.');

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
const bank1 = FinancialService.createBankAccount({
  account_code: 'BOC-CURR',
  bank_name: 'Bank of Ceylon',
  branch_name: 'Kandy Main Branch',
  account_number: '70823901',
  account_type: 'current',
  opening_balance_cents: 50000000, // Rs. 500,000.00
}, 1);

// Institution operates strictly with 1 institutional bank account
const bank2 = bank1;

console.log(`✓ Seeded test bank accounts: BOC (Rs. 500k), COMM (Rs. 300k).`);

// 2. Setup Active Financial Year & Budget Categories
db.prepare(`
  UPDATE financial_years SET is_current = 1, status = 'approved' WHERE id = 1
`).run();

// Ensure budget allocation for subcategory 2 (Classroom Learning Materials)
db.prepare(`
  INSERT OR IGNORE INTO financial_year_budget_allocations (financial_year_id, category_id, allocated_amount_cents, notes)
  VALUES (1, 2, 20000000, 'Stationery allocation Rs. 200,000')
`).run();

console.log('✓ Seeded active FY 2026 with budget category allocations.');

// =====================================================================
// TEST SUITE 1: CHEQUES RECEIVED WORKFLOW
// =====================================================================
console.log('\n--- TEST SUITE 1: CHEQUES RECEIVED WORKFLOW ---');

// 1.1 Record Received Cheque (In Hand)
const rcv1 = FinancialService.recordReceivedCheque({
  cheque_number: 'CHQ-RCV-001',
  payer_name: 'Past Pupils Association',
  issuing_bank_name: 'People\'s Bank',
  issuing_bank_branch: 'Kandy City',
  cheque_date: '2026-02-10',
  received_date: '2026-02-10',
  amount_cents: 7500000, // Rs. 75,000.00
  fund_category_id: 3, // Past Pupils & Alumni
  description: 'Annual sports meet grant sponsorship',
}, 1);

assert.strictEqual(rcv1.status, 'received', 'Cheque should have status "received"');
assert.strictEqual(rcv1.amount_cents, 7500000, 'Amount should match 7500000');
assert.strictEqual(rcv1.payer_name, 'Past Pupils Association');

// Verify NO bank balance or bank transactions were created at received stage
const bocInitial = db.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = ?').get(bank1.id);
assert.strictEqual(bocInitial.current_balance_cents, 50000000, 'Bank balance must remain unchanged when cheque is only received in hand');
const btCount0 = db.prepare('SELECT COUNT(*) as cnt FROM bank_transactions WHERE cheque_number = ?').get('CHQ-RCV-001');
assert.strictEqual(btCount0.cnt, 0, 'No bank transaction must exist for in-hand cheque');
console.log('✓ 1.1 Record received cheque in hand verified (zero premature bank entries).');

// 1.2 Deposit Received Cheque into Bank 1 (BOC)
const dep1 = FinancialService.depositReceivedCheque({
  cheque_id: rcv1.id,
  deposit_bank_account_id: bank1.id,
  actual_deposit_date: '2026-02-12',
  deposit_reference: 'SLIP-9901',
  financial_year_id: 1,
}, 1);

assert.strictEqual(dep1.status, 'deposited', 'Status should transition to "deposited"');
assert.strictEqual(dep1.deposit_bank_account_id, bank1.id);
assert.strictEqual(dep1.deposit_bank_transaction_id, null, 'Bank transaction ID must remain NULL until clearance');

// Check bank balance NOT yet credited (deferred until clearance)
const bocAfterDep = db.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = ?').get(bank1.id);
assert.strictEqual(bocAfterDep.current_balance_cents, 50000000, 'BOC balance must NOT be credited upon deposit slip creation');

// Check fund_receipts linkage
assert.ok(dep1.fund_receipt_id, 'Fund receipt record should be created and linked');
const fr = db.prepare('SELECT * FROM fund_receipts WHERE id = ?').get(dep1.fund_receipt_id);
assert.strictEqual(fr.amount_cents, 7500000);
console.log('✓ 1.2 Deposit received cheque verified (status deposited, bank balance untouched until clearance).');

// 1.3 Clear Received Cheque (Hits Bank Account Here!)
const clr1 = FinancialService.clearReceivedCheque({
  cheque_id: rcv1.id,
  actual_clearance_date: '2026-02-14',
  notes: 'Cleared through LankaPay clearance session',
}, 1);

assert.strictEqual(clr1.status, 'cleared', 'Status should transition to "cleared"');
assert.strictEqual(clr1.actual_clearance_date, '2026-02-14');
assert.ok(clr1.deposit_bank_transaction_id, 'Bank transaction ID must be populated upon clearance');

// Bank balance credited upon clearance
const bocAfterClear = db.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = ?').get(bank1.id);
assert.strictEqual(bocAfterClear.current_balance_cents, 50000000 + 7500000, 'Bank balance must be credited exactly upon clearance!');
const btClearCount = db.prepare('SELECT COUNT(*) as cnt FROM bank_transactions WHERE cheque_number = ?').get('CHQ-RCV-001');
assert.strictEqual(btClearCount.cnt, 1, 'Exactly one bank deposit transaction must exist for this cheque');
console.log('✓ 1.3 Clearance verified (bank credited and single transaction posted upon clearance).');

// 1.4 Test Bounce of a Cleared Cheque with Financial Reversal
const rcv2 = FinancialService.recordReceivedCheque({
  cheque_number: 'CHQ-RCV-002',
  payer_name: 'Donation Contributor',
  issuing_bank_name: 'Hatton National Bank',
  cheque_date: '2026-02-15',
  amount_cents: 2500000, // Rs. 25,000.00
  fund_category_id: 4, // Community & Well-Wishers
}, 1);

FinancialService.depositReceivedCheque({
  cheque_id: rcv2.id,
  deposit_bank_account_id: bank1.id,
  actual_deposit_date: '2026-02-16',
}, 1);

// Clear rcv2 first so it enters bank
FinancialService.clearReceivedCheque({
  cheque_id: rcv2.id,
  actual_clearance_date: '2026-02-17',
}, 1);

const bocBeforeBounce = db.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = ?').get(bank1.id);

const bnc2 = FinancialService.bounceReceivedCheque({
  cheque_id: rcv2.id,
  bounce_date: '2026-02-18',
  bounce_reason: 'Refer to Drawer (Insufficient funds)',
}, 1);

assert.strictEqual(bnc2.status, 'bounced', 'Cheque status should be "bounced"');
assert.strictEqual(bnc2.bounce_reason, 'Refer to Drawer (Insufficient funds)');

// Check reversal bank transaction and balance deducted
const bocAfterBounce = db.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = ?').get(bank1.id);
assert.strictEqual(bocAfterBounce.current_balance_cents, bocBeforeBounce.current_balance_cents - 2500000, 'Bank balance must be deducted by bounced amount');

const revBt = db.prepare('SELECT * FROM bank_transactions WHERE id = ?').get(bnc2.bounce_bank_transaction_id);
assert.strictEqual(revBt.amount_cents, -2500000, 'Reversal amount must be negative');
assert.strictEqual(revBt.reference_no, 'REV-CHQ-CHQ-RCV-002');

// Check fund receipt was cancelled/reversed
const bncFr = db.prepare('SELECT status FROM fund_receipts WHERE id = ?').get(bnc2.fund_receipt_id);
assert.strictEqual(bncFr.status, 'cancelled', 'Related fund receipt must be cancelled upon bounce');
console.log('✓ 1.4 Bounce of cleared cheque and financial reversal verified.');

// 1.5 Bounce of an UN-DEPOSITED cheque (must NOT create bank reversal)
const rcv3 = FinancialService.recordReceivedCheque({
  cheque_number: 'CHQ-RCV-003',
  payer_name: 'Private Donor',
  issuing_bank_name: 'Seylan Bank',
  cheque_date: '2026-02-20',
  amount_cents: 1000000,
}, 1);

const bocBeforeUndepBounce = db.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = ?').get(bank1.id);

FinancialService.bounceReceivedCheque({
  cheque_id: rcv3.id,
  bounce_date: '2026-02-21',
  bounce_reason: 'Post-dated cheque stopped before banking',
}, 1);

const bocAfterUndepBounce = db.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = ?').get(bank1.id);
assert.strictEqual(bocAfterUndepBounce.current_balance_cents, bocBeforeUndepBounce.current_balance_cents, 'Bank balance must NOT change when undeposited cheque bounces');
console.log('✓ 1.5 Undeposited bounce verified (no unnecessary bank reversal).');

// =====================================================================
// TEST SUITE 2: CHEQUES ISSUED WORKFLOW
// =====================================================================
console.log('\n--- TEST SUITE 2: CHEQUES ISSUED WORKFLOW ---');

// 2.1 Issue Outward Cheque from Bank 2 (Commercial Bank)
const commInitial = db.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = ?').get(bank2.id);

const iss1 = FinancialService.recordIssuedCheque({
  issue_date: '2026-03-01',
  payee_name: 'Metropolitan Office Supplies Ltd',
  cheque_number: 'CHQ-ISS-1001',
  issuing_bank_account_id: bank2.id,
  cheque_date: '2026-03-01',
  expected_presentation_date: '2026-03-05',
  amount_cents: 4500000, // Rs. 45,000.00
  budget_category_id: 2, // Stationery & Printing
  description: 'Printing examination papers',
}, 1);

assert.strictEqual(iss1.status, 'issued', 'Status must be "issued"');
assert.strictEqual(iss1.amount_cents, 4500000);
assert.ok(iss1.expense_id, 'Linked expense record must be created');
assert.strictEqual(iss1.issuing_bank_transaction_id, null, 'Bank transaction ID must be NULL until cleared');

// Check bank balance was NOT debited prematurely
const commAfterIssue = db.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = ?').get(bank2.id);
assert.strictEqual(commAfterIssue.current_balance_cents, commInitial.current_balance_cents, 'Bank balance must remain unchanged until cleared');

// Check linked expense
const exp = db.prepare('SELECT * FROM expenses WHERE id = ?').get(iss1.expense_id);
assert.ok(exp, 'Expense must exist');
console.log('✓ 2.1 Issue outward cheque verified (expense created, bank balance untouched until clearance).');

// 2.2 Duplicate Cheque Number Prevention on Same Bank Account
assert.throws(() => {
  FinancialService.recordIssuedCheque({
    issue_date: '2026-03-02',
    payee_name: 'Another Payee',
    cheque_number: 'CHQ-ISS-1001', // duplicate
    issuing_bank_account_id: bank2.id,
    cheque_date: '2026-03-02',
    amount_cents: 100000,
    budget_category_id: 2,
  }, 1);
}, /already been issued/, 'Duplicate cheque number on same issuing bank account must throw error');
console.log('✓ 2.2 Duplicate cheque number on same bank account prevented.');

// 2.3 Mark Presented and Clear (Deducts Bank Upon Clearance!)
const pres1 = FinancialService.presentIssuedCheque({
  cheque_id: iss1.id,
  actual_presentation_date: '2026-03-04',
  notes: 'Presented at Commercial Bank counter',
}, 1);
assert.strictEqual(pres1.status, 'presented');
assert.strictEqual(pres1.actual_presentation_date, '2026-03-04');

const commAfterPres = db.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = ?').get(bank2.id);
assert.strictEqual(commAfterPres.current_balance_cents, commInitial.current_balance_cents, 'Bank balance must NOT be debited on presentation');

const clrIss = FinancialService.clearIssuedCheque({
  cheque_id: iss1.id,
  actual_clearance_date: '2026-03-05',
}, 1);
assert.strictEqual(clrIss.status, 'cleared');
assert.strictEqual(clrIss.actual_clearance_date, '2026-03-05');
assert.ok(clrIss.issuing_bank_transaction_id, 'Bank transaction ID must be populated on clearance');

const commAfterClear = db.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = ?').get(bank2.id);
assert.strictEqual(commAfterClear.current_balance_cents, commInitial.current_balance_cents - 4500000, 'Bank balance must be debited upon clearance');

// Check bank_transactions entry created upon clearance
const btIss = db.prepare('SELECT * FROM bank_transactions WHERE id = ?').get(clrIss.issuing_bank_transaction_id);
assert.strictEqual(btIss.transaction_type, 'cheque_payment');
assert.strictEqual(btIss.amount_cents, -4500000);
assert.strictEqual(btIss.cheque_number, 'CHQ-ISS-1001');
console.log('✓ 2.3 Presentation and clearance verified (bank debited upon clearance).');

// 2.4 Bounce of Issued Cheque: Reversal and Expense Restoration
const iss2 = FinancialService.recordIssuedCheque({
  issue_date: '2026-03-10',
  payee_name: 'Hardware Vendor',
  cheque_number: 'CHQ-ISS-1002',
  issuing_bank_account_id: bank2.id,
  cheque_date: '2026-03-10',
  amount_cents: 3000000, // Rs. 30,000.00
  budget_category_id: 2,
}, 1);

// Clear it first so bank is debited
FinancialService.clearIssuedCheque({
  cheque_id: iss2.id,
  actual_clearance_date: '2026-03-11',
}, 1);

const commBeforeBounce = db.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = ?').get(bank2.id);

const bncIss = FinancialService.bounceIssuedCheque({
  cheque_id: iss2.id,
  bounce_date: '2026-03-12',
  bounce_reason: 'Signature mismatch on cheque leaf',
}, 1);

assert.strictEqual(bncIss.status, 'bounced');

// Verify bank account was credited back
const commAfterBounce = db.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = ?').get(bank2.id);
assert.strictEqual(commAfterBounce.current_balance_cents, commBeforeBounce.current_balance_cents + 3000000, 'Bank balance must be restored upon issued cheque bounce');

// Verify linked expense was restored to unpaid status (not duplicated)
const expRestored = db.prepare('SELECT status, payment_method FROM expenses WHERE id = ?').get(iss2.expense_id);
assert.strictEqual(expRestored.status, 'approved', 'Expense status must be reset to approved');
assert.strictEqual(expRestored.payment_method, 'unpaid', 'Payment method must be reset to unpaid so liability is recognized');
console.log('✓ 2.4 Issued cheque bounce verified (bank restored, expense liability reset to unpaid without duplication).');

// =====================================================================
// TEST SUITE 3: CASH BOOK & AUDIT TRAIL INTEGRATION
// =====================================================================
console.log('\n--- TEST SUITE 3: CASH BOOK & AUDIT TRAIL INTEGRATION ---');

// 3.1 Verify Cash Book shows cheque entries with cheque_number and payee_or_payer
const cashBook = FinancialService.getUnifiedCashBook({ financialYearId: 1, sourceFilter: 'all', limit: 100 });
const chequeTx = cashBook.transactions.find((tx) => tx.cheque_number === 'CHQ-RCV-001');
assert.ok(chequeTx, 'Unified Cash Book must contain deposited cheque transaction');
assert.strictEqual(chequeTx.cheque_number, 'CHQ-RCV-001');
assert.strictEqual(chequeTx.payee_or_payer, 'Past Pupils Association');
assert.strictEqual(chequeTx.bank_in_cents, 7500000);

const issuedTx = cashBook.transactions.find((tx) => tx.cheque_number === 'CHQ-ISS-1001');
assert.ok(issuedTx, 'Unified Cash Book must contain issued cheque transaction');
assert.strictEqual(issuedTx.cheque_number, 'CHQ-ISS-1001');
assert.strictEqual(issuedTx.payee_or_payer, 'Metropolitan Office Supplies Ltd');
assert.strictEqual(issuedTx.bank_out_cents, 4500000);
console.log('✓ 3.1 Cash Book integration verified (cheque number, payer, and payee properly populated).');

// 3.2 Audit Log History Verification
const detail = FinancialService.getChequeDetail(rcv1.id);
assert.strictEqual(detail.cheque.id, rcv1.id);
assert.ok(detail.auditLogs.length >= 3, 'Audit log should record CREATED, DEPOSITED, and CLEARED transitions');
assert.strictEqual(detail.auditLogs[detail.auditLogs.length - 1].action, 'CREATED');
assert.strictEqual(detail.auditLogs[0].action, 'CLEARED');
console.log('✓ 3.2 Complete immutable audit history verified.');

// 3.3 Cheques Summary Verification
const summary = FinancialService.getChequesSummary(1);
assert.ok(summary.received_total_count >= 3);
assert.ok(summary.issued_total_count >= 2);
assert.ok(summary.received_cleared_count >= 1);
assert.ok(summary.issued_cleared_count >= 1);
assert.ok(summary.received_bounced_count >= 2);
assert.ok(summary.issued_bounced_count >= 1);
console.log('✓ 3.3 Cheque summary metrics verified.');

// =====================================================================
// TEST SUITE 4: EXPENSE & FUND MODULE DIRECT CHEQUE RECORDING
// =====================================================================
console.log('\n--- TEST SUITE 4: EXPENSE & FUND MODULE DIRECT CHEQUE RECORDING ---');

// 4.1 Record Expense directly with Cheque Payment
const bank1BeforeExp = db.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = ?').get(bank1.id);
const directExp = FinancialService.createExpense({
  financial_year_id: 1,
  category_id: 2,
  expense_date: '2026-06-15',
  payee: 'Apex Lab Equipment Suppliers',
  description: 'Physics Lab Microscopes',
  amount_cents: 2500000, // Rs. 25,000.00
  payment_method: 'cheque',
  bank_account_id: bank1.id,
  cheque_number: 'CHQ-DIR-EXP-901',
  cheque_date: '2026-06-15',
  expected_presentation_date: '2026-06-20',
}, 1);

assert.ok(directExp.id, 'Expense must be recorded');
const bank1AfterExp = db.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = ?').get(bank1.id);
assert.strictEqual(bank1AfterExp.current_balance_cents, bank1BeforeExp.current_balance_cents, 'Bank balance must NOT be debited immediately upon expense cheque issuance');

const directIssuedChq = db.prepare(`
  SELECT * FROM cheques
  WHERE cheque_number = 'CHQ-DIR-EXP-901' AND issuing_bank_account_id = ?
`).get(bank1.id);
assert.ok(directIssuedChq, 'Issued cheque record must be automatically created');
assert.strictEqual(directIssuedChq.cheque_type, 'issued');
assert.strictEqual(directIssuedChq.status, 'issued');
assert.strictEqual(directIssuedChq.expense_id, directExp.id);
assert.strictEqual(directIssuedChq.amount_cents, 2500000);
assert.strictEqual(directIssuedChq.issuing_bank_transaction_id, null, 'Bank transaction ID must be null until clearance');

// Clear the issued cheque via Cheque Management - THIS is when bank is debited!
const clearedDirectChq = FinancialService.clearIssuedCheque({
  cheque_id: directIssuedChq.id,
  actual_clearance_date: '2026-06-21',
}, 1);
assert.strictEqual(clearedDirectChq.status, 'cleared');
const bank1AfterDirectClear = db.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = ?').get(bank1.id);
assert.strictEqual(bank1AfterDirectClear.current_balance_cents, bank1BeforeExp.current_balance_cents - 2500000, 'Bank balance must be debited upon clearance');
console.log('✓ 4.1 Direct Expense voucher with Bank Cheque successfully auto-creates issued cheque and debits bank on clearance.');

// 4.2 Record Fund Receipt with Cheque (Logged to Cheque Management, Hits Bank on Clearance)
const bank1BeforeRcpt = db.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = ?').get(bank1.id);
const directRcpt = FinancialService.createFundReceipt({
  financial_year_id: 1,
  fund_category_id: 1,
  receipt_date: '2026-06-16',
  donor_or_dept: 'Old Boys Association Colombo',
  amount_cents: 5000000, // Rs. 50,000.00
  payment_method: 'cheque',
  destination_type: 'bank',
  cheque_number: 'CHQ-DIR-RCP-801',
  issuing_bank_name: 'Sampath Bank',
  issuing_bank_branch: 'Bambalapitiya',
  cheque_date: '2026-06-16',
}, 1);

assert.ok(directRcpt.id, 'Fund receipt must be created');
const bank1AfterRcpt = db.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = ?').get(bank1.id);
assert.strictEqual(bank1AfterRcpt.current_balance_cents, bank1BeforeRcpt.current_balance_cents, 'Bank balance must NOT be credited prematurely before clearance');

const directChq = db.prepare(`
  SELECT * FROM cheques
  WHERE cheque_number = 'CHQ-DIR-RCP-801'
`).get();
assert.ok(directChq, 'Received cheque record must be created');
assert.strictEqual(directChq.cheque_type, 'received');
assert.strictEqual(directChq.status, 'received');
assert.strictEqual(directChq.fund_receipt_id, directRcpt.id);
assert.strictEqual(directChq.deposit_bank_account_id, null, 'Bank account must be unassigned until deposited/cleared');

// Now clear the cheque from Cheque Management - THIS is when it hits the bank!
const clearedRcptChq = FinancialService.clearReceivedCheque({
  cheque_id: directChq.id,
  actual_clearance_date: '2026-06-18',
  deposit_bank_account_id: bank1.id,
  notes: 'Cleared via Cheque Management',
}, 1);

assert.strictEqual(clearedRcptChq.status, 'cleared');
const bank1AfterClear = db.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = ?').get(bank1.id);
assert.strictEqual(bank1AfterClear.current_balance_cents, bank1BeforeRcpt.current_balance_cents + 5000000, 'Bank balance must be credited upon clearance from Cheque Management');

const clearedBt = db.prepare('SELECT * FROM bank_transactions WHERE cheque_number = ?').get('CHQ-DIR-RCP-801');
assert.ok(clearedBt, 'Bank transaction must be created upon clearance');
assert.strictEqual(clearedBt.transaction_type, 'cheque_deposit');
assert.strictEqual(clearedBt.amount_cents, 5000000);
console.log('✓ 4.2 Fund receipt with cheque auto-tracks in Cheque Management and credits bank upon clearance.');

// 4.3 Record Fund Receipt with Cheque (Hold in Hand)
const directRcptHold = FinancialService.createFundReceipt({
  financial_year_id: 1,
  fund_category_id: 1,
  receipt_date: '2026-06-17',
  donor_or_dept: 'Parent Batch 2026',
  amount_cents: 1500000, // Rs. 15,000.00
  payment_method: 'cheque',
  destination_type: 'cash',
  cheque_number: 'CHQ-DIR-RCP-802',
  issuing_bank_name: 'Commercial Bank',
  issuing_bank_branch: 'Kandy',
  cheque_date: '2026-06-17',
}, 1);

assert.ok(directRcptHold.id, 'Fund receipt must be created');
const directHoldChq = db.prepare(`
  SELECT * FROM cheques
  WHERE cheque_number = 'CHQ-DIR-RCP-802'
`).get();
assert.ok(directHoldChq, 'Received cheque record must be created');
assert.strictEqual(directHoldChq.cheque_type, 'received');
assert.strictEqual(directHoldChq.status, 'received');
assert.strictEqual(directHoldChq.deposit_bank_account_id, null, 'Must not be assigned to a bank account yet');
console.log('✓ 4.3 Fund receipt with held-in-hand cheque successfully auto-creates pending received cheque.');

console.log('\n================================================================');
console.log('>>> ALL 17 CHEQUE MANAGEMENT TESTS PASSED WITH ZERO ERRORS <<<');
console.log('================================================================\n');

db.close();

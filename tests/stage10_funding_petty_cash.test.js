const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

console.log('--- RUNNING STAGE 10 FUNDING & PETTY CASH SOURCE REPLENISH TESTS ---');

const testDbPath = path.join(process.cwd(), 'tests', 'test_stage10.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Apply migrations up to 009
const { migration001 } = require('../dist/main/db/migrations/001_initial_settings');
const { migration002 } = require('../dist/main/db/migrations/002_auth_and_rbac');
const { migration003 } = require('../dist/main/db/migrations/003_school_and_students');
const { migration004 } = require('../dist/main/db/migrations/004_db_corrections_and_finalization');
const { migration005 } = require('../dist/main/db/migrations/005_financial_accounting_system');
const { migration006 } = require('../dist/main/db/migrations/006_budget_workflow_refinement');
const { migration007 } = require('../dist/main/db/migrations/007_single_active_fy_and_category_filtering');
const { migration008 } = require('../dist/main/db/migrations/008_funding_system_upgrade');
const { migration009 } = require('../dist/main/db/migrations/009_streamline_funding_inflows');

db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const migrations = [
  migration001, migration002, migration003, migration004,
  migration005, migration006, migration007, migration008, migration009,
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

console.log('✓ All 9 migrations applied cleanly to SQLite WAL DB.');

const { FinancialService } = require('../dist/main/services/financialService');
const { initDatabase, getDatabase } = require('../dist/main/db/index');
initDatabase(testDbPath);

// Create an active FY
const fy = FinancialService.createFinancialYear({
  year_name: 'FY 2026',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
});

// Setup a Bank Account
const bankAccount = FinancialService.createBankAccount({
  account_code: 'BA-001',
  bank_name: 'Bank of Ceylon',
  branch_name: 'Colombo Main',
  account_number: 'BOC-778899',
  account_type: 'current',
  opening_balance_cents: 10000000, // Rs. 100,000.00
});
console.log(`✓ Bank Account initialized with balance: Rs. ${(bankAccount.current_balance_cents / 100).toFixed(2)}`);

// 1. Record Funding Inflow without category (streamlined)
const inflow1 = FinancialService.createFundReceipt({
  financial_year_id: fy.id,
  receipt_date: '2026-03-01',
  donor_or_dept: 'Old Boys Association (OBA)',
  amount_cents: 2500000, // Rs. 25,000.00
  payment_method: 'direct_deposit',
  destination_type: 'bank',
  bank_account_id: bankAccount.id,
  reference_no: 'DEP-88391',
  purpose: 'Smart Classroom Hardware Grant',
});

console.log(`✓ Recorded Streamlined Funding Inflow: ${inflow1.receipt_no} - Rs. ${(inflow1.amount_cents / 100).toFixed(2)} from ${inflow1.donor_or_dept}`);
if (!inflow1.receipt_no.startsWith('RCP-')) throw new Error('Receipt number format invalid');

// Verify getFundReceipts
const receiptsList = FinancialService.getFundReceipts(50, 0, fy.id);
if (receiptsList.receipts.length !== 1) throw new Error('Receipt list length mismatch');
if (receiptsList.receipts[0].donor_or_dept !== 'Old Boys Association (OBA)') throw new Error('Receipt donor mismatch');
console.log('✓ getFundReceipts retrieved entry cleanly with LEFT JOIN.');

// Check Bank balance increased
const bankAfterDeposit = FinancialService.getBankAccounts().find(b => b.id === bankAccount.id);
if (bankAfterDeposit.current_balance_cents !== 12500000) {
  throw new Error(`Bank balance mismatch after inflow deposit: ${bankAfterDeposit.current_balance_cents}`);
}
console.log(`✓ Bank Account balance properly increased to: Rs. ${(bankAfterDeposit.current_balance_cents / 100).toFixed(2)}`);

// 2. Petty Cash Replenish from Bank Account
FinancialService.replenishPettyCash({
  financial_year_id: fy.id,
  voucher_date: '2026-03-02',
  amount_cents: 3000000, // Rs. 30,000.00
  description: 'Float replenishment for term 1 supplies',
  source_type: 'bank',
  bank_account_id: bankAccount.id,
});

// Verify Bank Account balance decremented
const bankAfterPettyRep = FinancialService.getBankAccounts().find(b => b.id === bankAccount.id);
if (bankAfterPettyRep.current_balance_cents !== 9500000) {
  throw new Error(`Bank balance mismatch after petty cash replenishment: ${bankAfterPettyRep.current_balance_cents}`);
}
console.log(`✓ Bank balance properly decremented to: Rs. ${(bankAfterPettyRep.current_balance_cents / 100).toFixed(2)}`);

// Verify Bank Transaction recorded
const bankTx = FinancialService.getBankTransactions(bankAccount.id, 10, 0);
const withdrawalTx = bankTx.transactions.find(t => t.transaction_type === 'withdrawal');
if (!withdrawalTx || withdrawalTx.amount_cents !== 3000000) {
  throw new Error('Bank withdrawal transaction was not logged properly');
}
console.log(`✓ Bank withdrawal transaction logged: Rs. ${(withdrawalTx.amount_cents / 100).toFixed(2)}`);

// Verify Petty Cash ledger has voucher
const pettyVouchers = FinancialService.getPettyCashVouchers(10, 0, fy.id);
const repVoucher = pettyVouchers.vouchers.find(v => v.type === 'replenishment');
if (!repVoucher || repVoucher.amount_cents !== 3000000) {
  throw new Error('Petty cash replenishment voucher missing or amount mismatch');
}
if (!repVoucher.payee.includes('Bank: Bank of Ceylon')) {
  throw new Error(`Petty cash payee does not mention Bank source: ${repVoucher.payee}`);
}
console.log(`✓ Petty cash replenishment voucher verified: Payee = "${repVoucher.payee}"`);

// 3. Petty Cash Replenish from Cash in Hand
FinancialService.createFundReceipt({
  financial_year_id: fy.id,
  receipt_date: '2026-03-03',
  donor_or_dept: 'Anonymous Well-Wisher',
  amount_cents: 1000000, // Rs. 10,000.00
  payment_method: 'cash',
  destination_type: 'cash',
  purpose: 'Emergency cash donation',
});

FinancialService.replenishPettyCash({
  financial_year_id: fy.id,
  voucher_date: '2026-03-04',
  amount_cents: 500000, // Rs. 5,000.00
  description: 'Replenish from cash in hand',
  source_type: 'cash',
});

const cashTxList = FinancialService.getCashTransactions(10, 0, fy.id);
const cashTransfer = cashTxList.transactions.find(t => t.transaction_type === 'petty_cash_transfer');
if (!cashTransfer || Math.abs(cashTransfer.amount_cents) !== 500000) {
  throw new Error('Cash in hand transfer transaction missing or incorrect');
}
console.log(`✓ Cash in hand replenishment transfer recorded properly: Rs. ${(Math.abs(cashTransfer.amount_cents) / 100).toFixed(2)}`);

// Clean up test DB
getDatabase().close();
db.close();
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
console.log('--- ALL STAGE 10 TESTS PASSED WITH 100% SUCCESS ---');

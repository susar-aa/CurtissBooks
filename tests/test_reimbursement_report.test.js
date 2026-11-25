const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const testDbPath = path.join(process.cwd(), 'tests', 'test_reimbursement_report.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Load migrations 001 to 019
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
const { migration019 } = require('../dist/main/db/migrations/019_petty_cash_report_indexes');

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
  migration017, migration018, migration019
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

// Point getDatabase to test db
const dbModule = require('../dist/main/db/index');
dbModule.getDatabase = () => db;

const { FinancialService } = require('../dist/main/services/financialService');

console.log('================================================================');
console.log('--- RUNNING PETTY CASH REIMBURSEMENT REPORT TEST SUITE ---');
console.log('================================================================\n');

const currentYear = FinancialService.getCurrentFinancialYear();
if (!currentYear) throw new Error('Active financial year missing');
const fyId = currentYear.id;

const defaultBank = FinancialService.getDefaultBankAccount();
if (!defaultBank) throw new Error('Default institutional bank account missing');
db.prepare('UPDATE bank_accounts SET current_balance_cents = 50000000 WHERE id = ?').run(defaultBank.id);

// --- RETRIEVE OR SEED BUDGET CATEGORIES ---
let existingCats = db.prepare(`SELECT id, category_code, name FROM budget_categories LIMIT 2`).all();
let cat1Id, cat2Id;
if (existingCats.length >= 2) {
  cat1Id = existingCats[0].id;
  cat2Id = existingCats[1].id;
} else {
  const cat1 = db.prepare(`
    INSERT INTO budget_categories (category_code, name, name_en, name_si, is_active)
    VALUES ('REIMB-TEST-01', 'Office Stationery & Printing', 'Office Stationery & Printing', 'කාර්යාල ලිපිද්‍රව්‍ය', 1)
  `).run();
  cat1Id = Number(cat1.lastInsertRowid);

  const cat2 = db.prepare(`
    INSERT INTO budget_categories (category_code, name, name_en, name_si, is_active)
    VALUES ('REIMB-TEST-02', 'Staff Refreshments & Hospitality', 'Staff Refreshments & Hospitality', 'ආගන්තුක සත්කාර', 1)
  `).run();
  cat2Id = Number(cat2.lastInsertRowid);
}

// --- TEST 1: REPLENISH INITIAL FLOAT (CYCLE 1 INCEPTION) ---
console.log('--- TEST 1: INITIAL FLOAT REPLENISHMENT (CYCLE 1 INCEPTION) ---');
FinancialService.replenishPettyCash({
  amount_cents: 2500000, // Rs. 25,000.00 initial float
  voucher_date: '2026-01-05',
  bank_account_id: defaultBank.id,
  financial_year_id: fyId,
  description: 'Initial petty cash float imprest for Term 1',
}, 1);

const vouchers1 = FinancialService.getReimbursementVouchers(fyId);
if (vouchers1.length !== 1) throw new Error(`Expected 1 replenishment voucher, got ${vouchers1.length}`);
const repVoucher1 = vouchers1[0];
console.log(`✓ Cycle 1 Inception Replenishment: ${repVoucher1.voucher_no} on ${repVoucher1.voucher_date} - Rs. ${(repVoucher1.amount_cents / 100).toFixed(2)}`);

// --- TEST 2: RECORD EXPENSES DURING CYCLE 1 ---
console.log('\n--- TEST 2: RECORD DISBURSEMENTS DURING CYCLE 1 ---');
db.prepare(`
  INSERT INTO petty_cash_vouchers (voucher_no, voucher_date, financial_year_id, category_id, type, amount_cents, payee, description, receipt_attached, status)
  VALUES ('PCV-2026-0002', '2026-01-10', ?, ?, 'expense', 450000, 'Vijitha Yapa Bookshop', 'Exam photocopy paper', 1, 'approved')
`).run(fyId, cat1Id);

db.prepare(`
  INSERT INTO petty_cash_vouchers (voucher_no, voucher_date, financial_year_id, category_id, type, amount_cents, payee, description, receipt_attached, status)
  VALUES ('PCV-2026-0003', '2026-01-15', ?, ?, 'expense', 300000, 'Perera & Sons', 'Staff meeting tea & snacks', 1, 'approved')
`).run(fyId, cat2Id);

db.prepare(`
  INSERT INTO petty_cash_vouchers (voucher_no, voucher_date, financial_year_id, category_id, type, amount_cents, payee, description, receipt_attached, status)
  VALUES ('PCV-2026-0004', '2026-01-20', ?, ?, 'expense', 250000, 'Atlas Axillia', 'Whiteboard markers and dusters', 1, 'approved')
`).run(fyId, cat1Id);

console.log('✓ Recorded 3 expenses: Rs. 4,500.00 + Rs. 3,000.00 + Rs. 2,500.00 = Rs. 10,000.00 total disbursed.');

// --- TEST 3: REPLENISH / REIMBURSE FLOAT (CYCLE 1 CLOSING / CYCLE 2 INCEPTION) ---
console.log('\n--- TEST 3: REIMBURSEMENT REPLENISHMENT (CYCLE 2 INCEPTION) ---');
FinancialService.replenishPettyCash({
  amount_cents: 1000000, // Rs. 10,000.00 reimbursement to restore float back to Rs. 25,000.00
  voucher_date: '2026-01-25',
  bank_account_id: defaultBank.id,
  financial_year_id: fyId,
  description: 'Petty cash reimbursement replenishment to restore float to 25k',
}, 1);

const vouchers2 = FinancialService.getReimbursementVouchers(fyId);
if (vouchers2.length !== 2) throw new Error(`Expected 2 replenishment vouchers, got ${vouchers2.length}`);
const repVoucher2 = vouchers2[1];
console.log(`✓ Cycle 2 Inception Replenishment: ${repVoucher2.voucher_no} on ${repVoucher2.voucher_date} - Rs. ${(repVoucher2.amount_cents / 100).toFixed(2)}`);

// --- TEST 4: RECORD CYCLE 2 EXPENSES ---
console.log('\n--- TEST 4: RECORD DISBURSEMENTS DURING CYCLE 2 ---');
db.prepare(`
  INSERT INTO petty_cash_vouchers (voucher_no, voucher_date, financial_year_id, category_id, type, amount_cents, payee, description, receipt_attached, status)
  VALUES ('PCV-2026-0006', '2026-02-02', ?, ?, 'expense', 550000, 'City Hardware', 'Classroom door locks and keys', 1, 'approved')
`).run(fyId, cat1Id);

console.log('✓ Recorded 1 expense in Cycle 2: Rs. 5,500.00.');

// --- TEST 5: GENERATE REIMBURSEMENT REPORT BETWEEN TWO REIMBURSEMENTS ---
console.log('\n--- TEST 5: REPORT BETWEEN REIMBURSEMENT 1 AND REIMBURSEMENT 2 ---');
const reportCycle1 = FinancialService.getReimbursementReport({
  yearId: fyId,
  fromVoucherId: repVoucher1.id,
  toVoucherId: repVoucher2.id,
});

console.log(`  Start Date: ${reportCycle1.startDate} | End Date: ${reportCycle1.endDate}`);
console.log(`  Opening Float: Rs. ${(reportCycle1.openingFloatCents / 100).toFixed(2)}`);
console.log(`  Total Reimbursed (+): Rs. ${(reportCycle1.totalReplenishedCents / 100).toFixed(2)}`);
console.log(`  Total Disbursed (-): Rs. ${(reportCycle1.totalDisbursedCents / 100).toFixed(2)}`);
console.log(`  Closing Float Balance: Rs. ${(reportCycle1.closingFloatCents / 100).toFixed(2)}`);
console.log(`  Total Vouchers in period: ${reportCycle1.voucherCount}`);

if (reportCycle1.totalDisbursedCents !== 1000000) {
  throw new Error(`Expected total disbursed of Rs. 10,000.00, got ${(reportCycle1.totalDisbursedCents / 100)}`);
}
console.log('✓ Disbursed amount matches exact reimbursement claim of Rs. 10,000.00!');

if (reportCycle1.categoryBreakdown.length !== 2) {
  throw new Error(`Expected 2 category breakdowns, got ${reportCycle1.categoryBreakdown.length}`);
}
console.log(`✓ Category breakdown verified: ${reportCycle1.categoryBreakdown[0].category_name_en} = Rs. ${(reportCycle1.categoryBreakdown[0].total_spent_cents / 100).toFixed(2)}`);

// --- TEST 6: GENERATE REPORT BY CUSTOM DATE RANGE ---
console.log('\n--- TEST 6: REPORT BY CUSTOM DATE RANGE (2026-01-01 to 2026-02-15) ---');
const dateReport = FinancialService.getReimbursementReport({
  yearId: fyId,
  startDate: '2026-01-01',
  endDate: '2026-02-15',
});

console.log(`  Total Vouchers in custom date range: ${dateReport.voucherCount}`);
console.log(`  Total Disbursed: Rs. ${(dateReport.totalDisbursedCents / 100).toFixed(2)}`);
console.log(`  Total Replenished: Rs. ${(dateReport.totalReplenishedCents / 100).toFixed(2)}`);
console.log(`  Closing Float: Rs. ${(dateReport.closingFloatCents / 100).toFixed(2)}`);

if (dateReport.totalDisbursedCents !== 1550000) { // 10,000 in cycle 1 + 5,500 in cycle 2 = 15,500.00
  throw new Error(`Expected Rs. 15,500.00 total disbursed across dates, got ${(dateReport.totalDisbursedCents / 100)}`);
}
console.log('✓ Custom date range filtering verified cleanly across all periods!');

console.log('\n================================================================');
console.log('>>> ALL PETTY CASH REIMBURSEMENT REPORT TESTS PASSED CLEANLY! <<<');
console.log('================================================================');

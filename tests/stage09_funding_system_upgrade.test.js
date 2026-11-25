const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

console.log('--- RUNNING STAGE 09 FUNDING SYSTEM UPGRADE TESTS ---');

const testDbPath = path.join(process.cwd(), 'tests', 'test_stage09.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Apply migrations up to 008
const { migration001 } = require('../dist/main/db/migrations/001_initial_settings');
const { migration002 } = require('../dist/main/db/migrations/002_auth_and_rbac');
const { migration003 } = require('../dist/main/db/migrations/003_school_and_students');
const { migration004 } = require('../dist/main/db/migrations/004_db_corrections_and_finalization');
const { migration005 } = require('../dist/main/db/migrations/005_financial_accounting_system');
const { migration006 } = require('../dist/main/db/migrations/006_budget_workflow_refinement');
const { migration007 } = require('../dist/main/db/migrations/007_single_active_fy_and_category_filtering');
const { migration008 } = require('../dist/main/db/migrations/008_funding_system_upgrade');

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

console.log('✓ All 8 migrations applied cleanly.');

// 1. Verify Quick Create Funding Category
const { FinancialService } = require('../dist/main/services/financialService');
const { initDatabase } = require('../dist/main/db/index');
initDatabase(testDbPath);

const newCat = FinancialService.quickCreateFundingCategory('Ministry IT Grant', 'අමාත්‍යාංශ තොරතුරු තාක්ෂණ ප්‍රතිපාදන');
console.log(`✓ Quick-created funding category: "${newCat.name_en}" (${newCat.name_si}) with code: ${newCat.fund_code}`);
if (!newCat.fund_code.startsWith('FCAT-')) throw new Error('Invalid code generated for funding category');

// 2. Verify duplicate check
let dupRejected = false;
try {
  FinancialService.quickCreateFundingCategory('ministry it grant');
} catch (err) {
  dupRejected = true;
  console.log(`✓ Case-insensitive duplicate prevented: ${err.message}`);
}
if (!dupRejected) throw new Error('Duplicate funding category was not rejected!');

// 3. Verify Recording Funding to Cash in Hand
const fy = db.prepare('SELECT id FROM financial_years WHERE is_current = 1 LIMIT 1').get();

const rCash = FinancialService.createFundReceipt({
  financial_year_id: fy.id,
  fund_id: newCat.id,
  receipt_date: '2026-11-08',
  donor_or_dept: 'Hon. Minister Office',
  amount_cents: 5000000,
  payment_method: 'cash',
  destination_type: 'cash',
  purpose: 'Smart classroom displays',
});
console.log(`✓ Posted funding receipt into Cash: ${rCash.receipt_no} (Rs. 50,000.00)`);

// 4. Verify Recording Funding to Petty Cash Float
const rPetty = FinancialService.createFundReceipt({
  financial_year_id: fy.id,
  fund_id: newCat.id,
  receipt_date: '2026-11-08',
  donor_or_dept: 'Local Community Welfare',
  amount_cents: 2000000,
  payment_method: 'cash',
  destination_type: 'petty_cash',
  purpose: 'Emergency student welfare float addition',
});
console.log(`✓ Posted funding receipt into Petty Cash: ${rPetty.receipt_no} (Rs. 20,000.00)`);

// Check petty cash balance
const pettyVoucher = db.prepare('SELECT * FROM petty_cash_vouchers WHERE voucher_no = ?').get(rPetty.receipt_no);
if (!pettyVoucher) throw new Error('Petty cash voucher not created for petty_cash destination!');
console.log(`✓ Petty cash voucher verified: Type="${pettyVoucher.type}", Amount=${pettyVoucher.amount_cents} cents`);

// 5. Verify Recording Funding to Bank
const bank = db.prepare('SELECT id FROM bank_accounts LIMIT 1').get();
const rBank = FinancialService.createFundReceipt({
  financial_year_id: fy.id,
  fund_id: newCat.id,
  receipt_date: '2026-11-08',
  donor_or_dept: 'Provincial Department of Education',
  amount_cents: 10000000,
  payment_method: 'bank_transfer',
  destination_type: 'bank',
  bank_account_id: bank.id,
  reference_no: 'SLIP-990182',
  purpose: 'Building capital maintenance',
});
console.log(`✓ Posted funding receipt into Bank: ${rBank.receipt_no} (Rs. 100,000.00)`);

// Clean up
db.close();
try {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
} catch (e) {
  // Ignore Windows file lock
}

console.log('✓ Stage 09 funding upgrade verification completed with 100% success.');

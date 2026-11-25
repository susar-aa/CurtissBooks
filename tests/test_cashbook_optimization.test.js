const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

console.log('================================================================');
console.log('--- RUNNING UNIFIED CASH BOOK OPTIMIZATION TEST SUITE ---');
console.log('================================================================');

const testDbPath = path.join(process.cwd(), 'tests', 'test_cashbook_opt.db');
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

// 1. Setup Test Bank Account (BOC - 1004829104)
db.prepare('DELETE FROM bank_accounts').run();
const bank = FinancialService.createBankAccount({
  account_code: 'BOC-OPERATING',
  bank_name: 'Bank of Ceylon',
  branch_name: 'Main Branch',
  account_number: '1004829104',
  account_type: 'current',
  opening_balance_cents: 20000000, // Rs. 200,000.00
}, 1);

// 2. Setup Active Financial Year 2026
db.prepare(`
  UPDATE financial_years SET is_current = 1, status = 'approved' WHERE id = 1
`).run();

// 3. Seed Cash Transactions
db.prepare(`
  INSERT INTO cash_transactions (financial_year_id, transaction_date, transaction_type, amount_cents, running_balance_cents, reference_no, description, created_by)
  VALUES (1, '2026-01-10', 'receipt', 5000000, 5000000, 'RCP-2026-00001', 'School hall rental cash collection', 1)
`).run();

db.prepare(`
  INSERT INTO cash_transactions (financial_year_id, transaction_date, transaction_type, amount_cents, running_balance_cents, reference_no, description, created_by)
  VALUES (1, '2026-01-15', 'payment', -1500000, 3500000, 'EXP-2026-00001', 'Cleaning consumables purchase', 1)
`).run();

// 4. Seed Bank Transactions
db.prepare(`
  INSERT INTO bank_transactions (bank_account_id, transaction_date, transaction_type, amount_cents, reference_no, cheque_number, payee_or_payer, description, created_by)
  VALUES (?, '2026-01-12', 'deposit', 10000000, 'DEP-BOC-001', NULL, 'Ministry of Education', 'Annual government infrastructure grant', 1)
`).run(bank.id);

db.prepare(`
  INSERT INTO bank_transactions (bank_account_id, transaction_date, transaction_type, amount_cents, reference_no, cheque_number, payee_or_payer, description, created_by)
  VALUES (?, '2026-01-20', 'cheque_payment', -4000000, 'EXP-2026-00002', 'CHQ-88201', 'Atlas Axillia', 'School laboratory stationery', 1)
`).run(bank.id);

// Update bank account balance to reflect transactions: 200k + 100k - 40k = 260k
db.prepare(`
  UPDATE bank_accounts SET current_balance_cents = 26000000 WHERE id = ?
`).run(bank.id);

console.log('✓ Seeded test Cash Book transactions (2 Cash, 2 Bank).');

// =====================================================================
// TEST 1: CHRONOLOGICAL UNIFIED TRANSACTIONS & RUNNING BALANCES
// =====================================================================
console.log('\n--- TEST 1: CHRONOLOGICAL UNIFIED TRANSACTIONS & RUNNING BALANCES ---');
const resAll = FinancialService.getUnifiedCashBook({ financialYearId: 1, sourceFilter: 'all', limit: 50 });
assert.strictEqual(resAll.transactions.length, 4, 'Should return exactly 4 transactions');
assert.strictEqual(resAll.total, 4, 'Total count should be 4');

// Verify chronological ordering in running balance calculation (most recent first in display)
assert.strictEqual(resAll.transactions[0].date, '2026-01-20', 'Most recent transaction should be first');
assert.strictEqual(resAll.transactions[3].date, '2026-01-10', 'Oldest transaction should be last');

// Verify Running Balance calculations
// Jan 10: +50k (Cash) -> RunBal = 50k
// Jan 12: +100k (Bank) -> RunBal = 150k
// Jan 15: -15k (Cash) -> RunBal = 135k
// Jan 20: -40k (Bank) -> RunBal = 95k
const oldest = resAll.transactions[3];
assert.strictEqual(oldest.running_balance_cents, 5000000);
const secondOldest = resAll.transactions[2];
assert.strictEqual(secondOldest.running_balance_cents, 15000000);
const thirdOldest = resAll.transactions[1];
assert.strictEqual(thirdOldest.running_balance_cents, 13500000);
const newest = resAll.transactions[0];
assert.strictEqual(newest.running_balance_cents, 9500000);

console.log('✓ Unified chronological ledger & running balance verified.');

// =====================================================================
// TEST 2: SOURCE FILTERING (Cash Only vs Bank Only)
// =====================================================================
console.log('\n--- TEST 2: SOURCE FILTERING ---');
const resCash = FinancialService.getUnifiedCashBook({ financialYearId: 1, sourceFilter: 'cash' });
assert.strictEqual(resCash.transactions.length, 2);
assert.ok(resCash.transactions.every(t => t.source_type === 'cash'), 'All transactions must be cash');

const resBank = FinancialService.getUnifiedCashBook({ financialYearId: 1, sourceFilter: 'bank' });
assert.strictEqual(resBank.transactions.length, 2);
assert.ok(resBank.transactions.every(t => t.source_type === 'bank'), 'All transactions must be bank');
console.log('✓ Cash-only and Bank-only filters verified.');

// =====================================================================
// TEST 3: TYPE FILTERING (Inflow vs Disbursement)
// =====================================================================
console.log('\n--- TEST 3: TYPE FILTERING (Inflow vs Disbursement) ---');
const resInflows = FinancialService.getUnifiedCashBook({ financialYearId: 1, typeFilter: 'inflow' });
assert.strictEqual(resInflows.transactions.length, 2, 'Should return 2 inflows (1 cash receipt, 1 bank deposit)');
assert.ok(resInflows.transactions.every(t => t.amount_cents > 0), 'All inflows must have amount > 0');

const resOutflows = FinancialService.getUnifiedCashBook({ financialYearId: 1, typeFilter: 'disbursement' });
assert.strictEqual(resOutflows.transactions.length, 2, 'Should return 2 disbursements (1 cash payment, 1 bank cheque)');
assert.ok(resOutflows.transactions.every(t => t.amount_cents < 0), 'All disbursements must have amount < 0');
console.log('✓ Inflows and Disbursements filtering verified.');

// =====================================================================
// TEST 4: SEARCH FILTERING (Cheque Number, Payee, Description)
// =====================================================================
console.log('\n--- TEST 4: SEARCH FILTERING ---');
const resChqSearch = FinancialService.getUnifiedCashBook({ financialYearId: 1, search: 'CHQ-88201' });
assert.strictEqual(resChqSearch.transactions.length, 1);
assert.strictEqual(resChqSearch.transactions[0].cheque_number, 'CHQ-88201');

const resPayeeSearch = FinancialService.getUnifiedCashBook({ financialYearId: 1, search: 'Ministry' });
assert.strictEqual(resPayeeSearch.transactions.length, 1);
assert.strictEqual(resPayeeSearch.transactions[0].payee_or_payer, 'Ministry of Education');

const resDescSearch = FinancialService.getUnifiedCashBook({ financialYearId: 1, search: 'consumables' });
assert.strictEqual(resDescSearch.transactions.length, 1);
assert.strictEqual(resDescSearch.transactions[0].reference, 'EXP-2026-00001');
console.log('✓ Multi-attribute text search verified.');

// =====================================================================
// TEST 5: SERVER-SIDE PAGINATION
// =====================================================================
console.log('\n--- TEST 5: SERVER-SIDE PAGINATION ---');
const page1 = FinancialService.getUnifiedCashBook({ financialYearId: 1, limit: 2, offset: 0 });
assert.strictEqual(page1.transactions.length, 2);
assert.strictEqual(page1.total, 4);

const page2 = FinancialService.getUnifiedCashBook({ financialYearId: 1, limit: 2, offset: 2 });
assert.strictEqual(page2.transactions.length, 2);
assert.strictEqual(page2.total, 4);
assert.notStrictEqual(page1.transactions[0].id, page2.transactions[0].id, 'Page 1 and Page 2 must not overlap');
console.log('✓ Server-side pagination verified.');

// =====================================================================
// TEST 6: ACCURATE SUMMARY KPIS
// =====================================================================
console.log('\n--- TEST 6: ACCURATE SUMMARY KPIS ---');
assert.strictEqual(resAll.kpi.cashBalanceCents, 3500000, 'Cash balance: Rs. 35,000.00');
assert.strictEqual(resAll.kpi.bankBalanceCents, 26000000, 'Bank balance: Rs. 260,000.00');
assert.strictEqual(resAll.kpi.totalLiquidBalanceCents, 29500000, 'Total liquid reserves: Rs. 295,000.00');
assert.strictEqual(resAll.kpi.totalInflowCents, 15000000, 'Total period inflow: Rs. 150,000.00');
assert.strictEqual(resAll.kpi.totalOutflowCents, 5500000, 'Total period outflow: Rs. 55,000.00');
console.log('✓ KPI summary metrics verified.');

console.log('\n================================================================');
console.log('>>> ALL 6 CASH BOOK OPTIMIZATION TESTS PASSED! <<<');
console.log('================================================================\n');

db.close();

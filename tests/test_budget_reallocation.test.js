const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

console.log('================================================================');
console.log('--- RUNNING BUDGET REALLOCATION TEST SUITE ---');
console.log('================================================================');

const testDbPath = path.join(process.cwd(), 'tests', 'test_budget_realloc.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Load migrations 001 to 014
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
  migration013, migration014
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

console.log('✓ All 14 migrations applied cleanly.');

// Verify Migration 014 table and indexes
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='budget_reallocations'").all();
assert.strictEqual(tables.length, 1, 'budget_reallocations table must exist');

const indexes = db.prepare("PRAGMA index_list('budget_reallocations')").all();
assert.ok(indexes.some(i => i.name === 'idx_budget_realloc_fy'), 'idx_budget_realloc_fy index must exist');
assert.ok(indexes.some(i => i.name === 'idx_budget_realloc_src'), 'idx_budget_realloc_src index must exist');
assert.ok(indexes.some(i => i.name === 'idx_budget_realloc_dest'), 'idx_budget_realloc_dest index must exist');
assert.ok(indexes.some(i => i.name === 'idx_budget_realloc_date'), 'idx_budget_realloc_date index must exist');
console.log('✓ Migration 014 table and indexes verified.');

// Seed Admin User
const { CryptoService } = require('../dist/main/services/cryptoService');
const adminHash = CryptoService.hashPassword('Admin@123456');
db.prepare(`
  INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role_id, status)
  VALUES (1, 'admin', ?, 'Administrator', 1, 'active')
`).run(adminHash);

// Initialize FinancialService
const { FinancialService } = require('../dist/main/services/financialService');
const { initDatabase, closeDatabase } = require('../dist/main/db/index');
initDatabase(testDbPath);

// Setup Categories: 1 Main Category, 2 Subcategories
const parentCat = FinancialService.quickCreateCategory('Administration', 'පරිපාලන', null, 1);
const subA = FinancialService.quickCreateCategory('Repairs & Maintenance', 'නඩත්තු', parentCat.id, 1);
const subB = FinancialService.quickCreateCategory('Stationery', 'ලිපිද්‍රව්‍ය', parentCat.id, 1);

// Create Financial Year 2026 with allocations via saveFinancialYearDraft
const fy = FinancialService.saveFinancialYearDraft(
  {
    year_name: '2026',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    notes: 'Testing Budget Transfer',
    allocations: [
      { category_id: parentCat.id, allocated_amount_cents: 0 },
      { category_id: subA.id, allocated_amount_cents: 5000000, notes: 'Repairs' },
      { category_id: subB.id, allocated_amount_cents: 3000000, notes: 'Stationery' }
    ]
  },
  1
);

// Approve Financial Year
FinancialService.approveFinancialYear(fy.id, 1, 'Approved by Board');

// Record an expense against subA: 10,000 (1,000,000 cents)
// So subA remaining = 50,000 - 10,000 = 40,000 (4,000,000 cents)
db.prepare(`
  INSERT INTO expenses (
    voucher_no, expense_date, category_id, financial_year_id,
    payee, description, amount_cents, payment_method, status, created_by
  ) VALUES (
    'VCH-2026-00001', '2026-02-01', ?, ?,
    'Hardware Store', 'Repair materials', 1000000, 'cash', 'approved', 1
  )
`).run(subA.id, fy.id);

console.log('\n--- 1. Testing Validation Rules ---');

// Test 1: Amount <= 0
assert.throws(() => {
  FinancialService.transferBudget({
    financial_year_id: fy.id,
    source_category_id: subA.id,
    destination_category_id: subB.id,
    amount_cents: 0,
    reason: 'Zero transfer'
  }, 1);
}, /must be greater than zero/i);
console.log('✓ Zero or negative amount correctly rejected');

// Test 2: Same category
assert.throws(() => {
  FinancialService.transferBudget({
    financial_year_id: fy.id,
    source_category_id: subA.id,
    destination_category_id: subA.id,
    amount_cents: 100000,
    reason: 'Same cat transfer'
  }, 1);
}, /must be different/i);
console.log('✓ Same source and destination category correctly rejected');

// Test 3: Parent category transfer rejected
assert.throws(() => {
  FinancialService.transferBudget({
    financial_year_id: fy.id,
    source_category_id: parentCat.id,
    destination_category_id: subB.id,
    amount_cents: 100000,
    reason: 'Parent transfer'
  }, 1);
}, /parent category/i);
console.log('✓ Parent category transfer correctly rejected');

// Test 4: Exceeding remaining budget
// subA remaining is 40,000 (4,000,000 cents). Attempt 41,000 (4,100,000 cents)
assert.throws(() => {
  FinancialService.transferBudget({
    financial_year_id: fy.id,
    source_category_id: subA.id,
    destination_category_id: subB.id,
    amount_cents: 4100000,
    reason: 'Exceeding remaining'
  }, 1);
}, /exceeds available remaining budget/i);
console.log('✓ Exceeding available remaining budget correctly rejected');

console.log('\n--- 2. Executing Valid Budget Reallocation ---');

// Initial total budget across allocations
const totalBudgetBefore = db.prepare(`
  SELECT SUM(allocated_amount_cents) as total FROM financial_year_budget_allocations WHERE financial_year_id = ?
`).get(fy.id).total;
assert.strictEqual(totalBudgetBefore, 8000000, 'Initial total budget should be 8,000,000 cents');

// Transfer 15,000 (1,500,000 cents) from subA to subB
const transferResult = FinancialService.transferBudget({
  financial_year_id: fy.id,
  source_category_id: subA.id,
  destination_category_id: subB.id,
  amount_cents: 1500000,
  reason: 'Covering unexpected stationery costs for term examinations'
}, 1);

assert.strictEqual(transferResult.reallocation.reallocation_no, 'BRE-2026-00001');
assert.strictEqual(transferResult.reallocation.amount_cents, 1500000);
console.log('✓ Transfer executed successfully:', transferResult.reallocation.reallocation_no);

// Check Allocations
const allocA = db.prepare(`
  SELECT allocated_amount_cents FROM financial_year_budget_allocations
  WHERE financial_year_id = ? AND category_id = ?
`).get(fy.id, subA.id);

const allocB = db.prepare(`
  SELECT allocated_amount_cents FROM financial_year_budget_allocations
  WHERE financial_year_id = ? AND category_id = ?
`).get(fy.id, subB.id);

assert.strictEqual(allocA.allocated_amount_cents, 3500000, 'subA allocated should now be 35,000.00');
assert.strictEqual(allocB.allocated_amount_cents, 4500000, 'subB allocated should now be 45,000.00');
console.log('✓ Updated allocations verified: subA = 35,000, subB = 45,000');

// Total budget invariance check
const totalBudgetAfter = db.prepare(`
  SELECT SUM(allocated_amount_cents) as total FROM financial_year_budget_allocations WHERE financial_year_id = ?
`).get(fy.id).total;
assert.strictEqual(totalBudgetAfter, totalBudgetBefore, 'Total annual budget MUST be unchanged (Invariant preserved!)');
console.log('✓ Total Annual Budget Invariance verified: 80,000.00 == 80,000.00');

// Audit Log check
const audit = db.prepare(`
  SELECT * FROM authentication_audit_logs WHERE action = 'BUDGET_REALLOCATION' ORDER BY id DESC LIMIT 1
`).get();
assert.ok(audit, 'Audit log entry must be present');
assert.ok(audit.details.includes('BRE-2026-00001'), 'Audit log details must contain reallocation number');
console.log('✓ Audit log recorded successfully');

// Test 5: Reallocation History retrieval
console.log('\n--- 3. Testing Reallocation History ---');
const history = FinancialService.getBudgetReallocations(fy.id);
assert.strictEqual(history.length, 1);
assert.strictEqual(history[0].reallocation_no, 'BRE-2026-00001');
assert.strictEqual(history[0].source_category_name, 'Repairs & Maintenance');
assert.strictEqual(history[0].destination_category_name, 'Stationery');
assert.strictEqual(history[0].amount_cents, 1500000);
assert.strictEqual(history[0].creator_name, 'Administrator');
console.log('✓ Reallocation history retrieved with joined category & creator names');

// Test 6: Second transfer sequential numbering
const transferResult2 = FinancialService.transferBudget({
  financial_year_id: fy.id,
  source_category_id: subB.id,
  destination_category_id: subA.id,
  amount_cents: 500000,
  reason: 'Partial return'
}, 1);
assert.strictEqual(transferResult2.reallocation.reallocation_no, 'BRE-2026-00002');
console.log('✓ Second transfer generated sequential reference BRE-2026-00002');

// Cleanup
db.close();
closeDatabase();
try {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
} catch (e) {
  // If Windows file lock delays unlock, ignore
}
console.log('\n================================================================');
console.log('--- ALL BUDGET REALLOCATION TESTS PASSED CLEANLY! ---');
console.log('================================================================\n');

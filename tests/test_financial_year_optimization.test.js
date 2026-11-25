const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

console.log('================================================================');
console.log('--- RUNNING FINANCIAL YEAR OPTIMIZATION & INTEGRITY TEST SUITE ---');
console.log('================================================================');

const testDbPath = path.join(process.cwd(), 'tests', 'test_fy_optimization.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Load and apply migrations 001 to 013
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
  migration013,
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

console.log('✓ All 13 migrations applied cleanly.');

// Verify Migration 013 Indexes
const indexes = db.prepare("PRAGMA index_list('budget_categories')").all();
assert.ok(indexes.some(i => i.name === 'idx_budget_cats_parent_name_nocase'), 'Scoped parent-name unique index must exist');
assert.ok(indexes.some(i => i.name === 'idx_budget_cats_code_nocase'), 'Case-insensitive code unique index must exist');
console.log('✓ Migration 013 scoped indexes verified.');

// Seed Admin User
const { CryptoService } = require('../dist/main/services/cryptoService');
const adminHash = CryptoService.hashPassword('Admin@123456');
db.prepare(`
  INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role_id, status)
  VALUES (1, 'admin', ?, 'Administrator', 1, 'active')
`).run(adminHash);

// Initialize FinancialService
const { FinancialService } = require('../dist/main/services/financialService');
const { initDatabase } = require('../dist/main/db/index');
initDatabase(testDbPath);

// -------------------------------------------------------------
// 1. TEST HIERARCHICAL CATEGORY AUTO-SEQUENCING & SCOPING
// -------------------------------------------------------------
console.log('\n--- 1. Testing Category Auto-Sequencing & Scoping ---');

// Main 1: Administration
const main1Code = FinancialService.suggestCategoryCode(null);
assert.strictEqual(main1Code, 'Rex 01', 'First main category code should be Rex 01');
const main1 = FinancialService.quickCreateCategory('Administration', 'පරිපාලන', null, 1);
assert.strictEqual(main1.category_code, 'Rex 01');

// Subcategories under Main 1
const sub1_1_Code = FinancialService.suggestCategoryCode(main1.id);
assert.strictEqual(sub1_1_Code, '1.1');
const sub1_1 = FinancialService.quickCreateCategory('Repairs & Maintenance', 'නඩත්තු', main1.id, 1);

const sub1_2_Code = FinancialService.suggestCategoryCode(main1.id);
assert.strictEqual(sub1_2_Code, '1.2');
const sub1_2 = FinancialService.quickCreateCategory('Office Supplies', 'කාර්යාල සැපයුම්', main1.id, 1);

// Main 2: Building Maintenance
const main2Code = FinancialService.suggestCategoryCode(null);
assert.strictEqual(main2Code, 'Rex 02', 'Second main category code should be Rex 02');
const main2 = FinancialService.quickCreateCategory('Building Maintenance', 'ගොඩනැගිලි නඩත්තු', null, 1);

// Under Main 2: Create subcategory with SAME name 'Repairs & Maintenance' (Scoped uniqueness verification!)
const sub2_1_Code = FinancialService.suggestCategoryCode(main2.id);
assert.strictEqual(sub2_1_Code, '2.1');
const sub2_1 = FinancialService.quickCreateCategory('Repairs & Maintenance', 'නඩත්තු', main2.id, 1);
assert.strictEqual(sub2_1.name, 'Repairs & Maintenance');
assert.strictEqual(sub2_1.category_code, '2.1');
console.log('✓ Subcategory with same name under different parent allowed by scoped uniqueness!');

// Verify duplicate under SAME parent is rejected
assert.throws(() => {
  FinancialService.quickCreateCategory('Repairs & Maintenance', 'නඩත්තු', main2.id, 1);
}, /already exists/i, 'Duplicate subcategory under same parent must be rejected');
console.log('✓ Duplicate subcategory under same parent correctly rejected.');

// Verify duplicate code is rejected
assert.throws(() => {
  FinancialService.quickCreateCategory('Other Category', '', main2.id, 1, '2.1');
}, /already in use/i, 'Duplicate category code must be rejected');
console.log('✓ Duplicate category code correctly rejected.');

// -------------------------------------------------------------
// 2. TEST DRAFT BUDGET ALLOCATION & PARENT TOTALS
// -------------------------------------------------------------
console.log('\n--- 2. Testing Draft Budget Allocation & Parent Totals ---');

const draftYear = FinancialService.saveFinancialYearDraft({
  year_name: 'FY 2026/2027',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  allocations: [
    { category_id: main1.id, allocated_amount_cents: 0 },
    { category_id: sub1_1.id, allocated_amount_cents: 5000000, notes: 'Admin repairs' }, // Rs. 50,000
    { category_id: sub1_2.id, allocated_amount_cents: 3000000, notes: 'Paper & pens' },   // Rs. 30,000
    { category_id: main2.id, allocated_amount_cents: 0 },
    { category_id: sub2_1.id, allocated_amount_cents: 12000000, notes: 'Roof repairs' }, // Rs. 120,000
  ],
}, 1);

assert.strictEqual(draftYear.status, 'draft', 'Status must be draft');
assert.strictEqual(draftYear.allocations.length, 5, '5 allocations must be present');

// Verify parent totals: Main 1 = 50k + 30k = 80k; Main 2 = 120k; Total = 200k
const totalCents = draftYear.total_budget_cents;
assert.strictEqual(totalCents, 20000000, 'Total budget must equal Rs. 200,000 (20,000,000 cents)');
console.log(`✓ Draft budget saved successfully. Total aggregated budget: Rs. ${(totalCents / 100).toFixed(2)}`);

// Verify invalid dates rejected
assert.throws(() => {
  FinancialService.saveFinancialYearDraft({
    id: draftYear.id,
    year_name: 'FY 2026/2027',
    start_date: '2026-12-31',
    end_date: '2026-01-01',
    allocations: [],
  });
}, /start date cannot be after end date/i);
console.log('✓ Invalid date range rejected.');

// Verify negative allocation amount rejected
assert.throws(() => {
  FinancialService.saveFinancialYearDraft({
    id: draftYear.id,
    year_name: 'FY 2026/2027',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    allocations: [{ category_id: sub1_1.id, allocated_amount_cents: -500 }],
  });
}, /cannot be negative/i);
console.log('✓ Negative allocation rejected.');

// -------------------------------------------------------------
// 3. TEST APPROVAL WORKFLOW & PERMANENT LOCKING
// -------------------------------------------------------------
console.log('\n--- 3. Testing Approval Workflow & Permanent Locking ---');

// Attempting to approve an empty budget must fail
const emptyYear = FinancialService.saveFinancialYearDraft({
  year_name: 'FY-EMPTY',
  start_date: '2027-01-01',
  end_date: '2027-12-31',
  allocations: [{ category_id: sub1_1.id, allocated_amount_cents: 0 }],
});
assert.throws(() => {
  FinancialService.approveFinancialYear(emptyYear.id, 1);
}, /total budget of zero/i);
console.log('✓ Approving budget with zero total allocation correctly rejected.');

// Approve the valid draftYear
const approvedYear = FinancialService.approveFinancialYear(draftYear.id, 1, 'Approved by Board');
assert.strictEqual(approvedYear.status, 'approved', 'Year status must be approved');
assert.strictEqual(approvedYear.is_current, true, 'Approved year must be set as current');

// Verify that all other years have is_current = 0
const allYears = FinancialService.getFinancialYears();
const currentYears = allYears.filter(y => y.is_current);
assert.strictEqual(currentYears.length, 1, 'Exactly one financial year must be current');
assert.strictEqual(currentYears[0].id, approvedYear.id);
console.log('✓ Single active financial year constraint verified.');

// Attempting to modify locked year must fail
assert.throws(() => {
  FinancialService.saveFinancialYearDraft({
    id: approvedYear.id,
    year_name: 'FY 2026/2027 Modified',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    allocations: [{ category_id: sub1_1.id, allocated_amount_cents: 999999 }],
  });
}, /permanently locked/i);
console.log('✓ Modifying locked approved financial year strictly rejected.');

// -------------------------------------------------------------
// 4. TEST EXPENSE RECORDING AGAINST APPROVED SUBCATEGORY & REMAINING BUDGET
// -------------------------------------------------------------
console.log('\n--- 4. Testing Expense Deduction & Remaining Budget Calculations ---');

// Create Cash Transaction for initial cash balance
db.prepare(`
  INSERT INTO cash_transactions (financial_year_id, transaction_date, transaction_type, amount_cents, running_balance_cents, description)
  VALUES (?, '2026-01-01', 'receipt', 10000000, 10000000, 'Opening Cash')
`).run(approvedYear.id);

// Record expense against subcategory 1.1 (Rs. 20,000 out of Rs. 50,000 allocated)
const exp1 = FinancialService.createExpense({
  financial_year_id: approvedYear.id,
  category_id: sub1_1.id,
  expense_date: '2026-01-15',
  amount_cents: 2000000, // Rs. 20,000
  payment_method: 'cash',
  payee: 'Hardware Mart',
  description: 'Maintenance supplies',
}, 1);

// Record expense against parent category must fail (expenses must reference subcategory)
assert.throws(() => {
  FinancialService.createExpense({
    financial_year_id: approvedYear.id,
    category_id: main1.id,
    expense_date: '2026-01-16',
    amount_cents: 500000,
    payment_method: 'cash',
    payee: 'Store',
    description: 'Test',
  }, 1);
}, /select an approved subcategory/i);
console.log('✓ Expense against parent category correctly rejected.');

// Verify remaining budget calculations in getFinancialYearDetail
const updatedDetail = FinancialService.getFinancialYearDetail(approvedYear.id);
assert.strictEqual(updatedDetail.total_spent_cents, 2000000, 'Total spent must be Rs. 20,000');
assert.strictEqual(updatedDetail.total_remaining_cents, 18000000, 'Total remaining must be Rs. 180,000');

const alloc1_1 = updatedDetail.allocations.find(a => a.category_id === sub1_1.id);
assert.strictEqual(alloc1_1.allocated_amount_cents, 5000000, 'Allocated must be 50,000');
assert.strictEqual(alloc1_1.spent_amount_cents, 2000000, 'Spent must be 20,000');
assert.strictEqual(alloc1_1.remaining_amount_cents, 3000000, 'Remaining must be 30,000');
console.log(`✓ Category remaining budget verified: Allocated Rs. ${(alloc1_1.allocated_amount_cents / 100).toFixed(2)}, Spent Rs. ${(alloc1_1.spent_amount_cents / 100).toFixed(2)}, Remaining Rs. ${(alloc1_1.remaining_amount_cents / 100).toFixed(2)}`);

// -------------------------------------------------------------
// 5. TEST END / CLOSE FINANCIAL YEAR WITH ADMIN AUTHENTICATION
// -------------------------------------------------------------
console.log('\n--- 5. Testing Close Financial Year with Authentication ---');

// Invalid password must fail
assert.throws(() => {
  FinancialService.closeFinancialYear({
    yearId: approvedYear.id,
    adminUsername: 'admin',
    adminPassword: 'WrongPassword',
  });
}, /invalid administrator password/i);
console.log('✓ Incorrect admin password rejected.');

// Valid admin closure
FinancialService.closeFinancialYear({
  yearId: approvedYear.id,
  adminUsername: 'admin',
  adminPassword: 'Admin@123456',
});

const closedYear = FinancialService.getFinancialYearDetail(approvedYear.id);
assert.strictEqual(closedYear.status, 'closed', 'Status must be closed');
assert.strictEqual(closedYear.is_current, false, 'Closed year must not be current');
console.log('✓ Financial year closed successfully with verified admin authentication.');

console.log('\n================================================================');
console.log('✓✓✓ ALL FINANCIAL YEAR OPTIMIZATION TESTS PASSED WITH 100%! ✓✓✓');
console.log('================================================================');

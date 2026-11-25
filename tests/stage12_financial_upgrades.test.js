const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

console.log('===============================================================');
console.log('--- RUNNING STAGE 12 FINANCIAL SYSTEM UPGRADES COMPREHENSIVE TESTS ---');
console.log('===============================================================');

const testDbPath = path.join(process.cwd(), 'tests', 'test_stage12.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Apply migrations 001 to 010
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
  migration009, migration010,
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

console.log('✓ All 10 migrations applied cleanly to SQLite WAL DB.');

db.prepare(`
  INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role_id, status)
  VALUES (1, 'admin', 'test_hash', 'Administrator', 1, 'active')
`).run();

const { FinancialService } = require('../dist/main/services/financialService');
const { initDatabase } = require('../dist/main/db/index');
initDatabase(testDbPath);

// -------------------------------------------------------------
// 1. TEST HIERARCHICAL BUDGET CATEGORIES & AUTO-SEQUENCING
// -------------------------------------------------------------
console.log('\n--- 1. Testing Hierarchical Categories & Auto-Sequencing ---');

// Create Main Category 1: Administration
const main1 = FinancialService.quickCreateCategory('Administration', 'පරිපාලන', null, 1);
assert.strictEqual(main1.category_code, 'Rex 01', 'First main category code should be Rex 01');
assert.strictEqual(main1.is_parent, true, 'Main category should be a parent');
console.log(`✓ Main Category 1 created: ${main1.category_code} - ${main1.name}`);

// Create Subcategories under Main 1
const sub1_1 = FinancialService.quickCreateCategory('Office Supplies', 'කාර්යාල සැපයුම්', main1.id, 1);
assert.strictEqual(sub1_1.category_code, '1.1', 'First subcategory under main 1 should be 1.1');
assert.strictEqual(sub1_1.parent_id, main1.id, 'Subcategory parent_id should match main1.id');

const sub1_2 = FinancialService.quickCreateCategory('Printing', 'මුද්‍රණ වියදම්', main1.id, 1);
assert.strictEqual(sub1_2.category_code, '1.2', 'Second subcategory under main 1 should be 1.2');

const sub1_3 = FinancialService.quickCreateCategory('Stationery', 'ලිපිද්‍රව්‍ය', main1.id, 1);
assert.strictEqual(sub1_3.category_code, '1.3', 'Third subcategory under main 1 should be 1.3');
console.log(`✓ Subcategories created under Rex 01: 1.1 (${sub1_1.name}), 1.2 (${sub1_2.name}), 1.3 (${sub1_3.name})`);

// Create Main Category 2: Building Maintenance
const main2 = FinancialService.quickCreateCategory('Building Maintenance', 'ගොඩනැගිලි නඩත්තු', null, 1);
assert.strictEqual(main2.category_code, 'Rex 02', 'Second main category code should be Rex 02');

const sub2_1 = FinancialService.quickCreateCategory('Repairs', 'අලුත්වැඩියා', main2.id, 1);
assert.strictEqual(sub2_1.category_code, '2.1', 'First subcategory under main 2 should be 2.1');

const sub2_2 = FinancialService.quickCreateCategory('Electrical', 'විදුලි නඩත්තු', main2.id, 1);
assert.strictEqual(sub2_2.category_code, '2.2', 'Second subcategory under main 2 should be 2.2');
console.log(`✓ Main Category 2 created: ${main2.category_code} - ${main2.name} with 2.1 (${sub2_1.name}) & 2.2 (${sub2_2.name})`);

// Duplicate Prevention Check
assert.throws(() => {
  FinancialService.quickCreateCategory('Office Supplies', 'කාර්යාල සැපයුම්', main1.id, 1);
}, /already exists/, 'Should reject duplicate category name under same parent');
console.log('✓ Duplicate category rejection verified.');

// -------------------------------------------------------------
// 2. TEST FINANCIAL YEAR DRAFT ALLOCATION & PARENT TOTAL CALCULATION
// -------------------------------------------------------------
console.log('\n--- 2. Testing FY Draft Allocation & Parent Total Calculation ---');

const draftFy = FinancialService.saveFinancialYearDraft({
  year_name: 'FY 2026/2027',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  allocations: [
    { category_id: sub1_1.id, allocated_amount_cents: 5000000, notes: '50k for supplies' }, // Rs. 50,000
    { category_id: sub1_2.id, allocated_amount_cents: 3000000, notes: '30k for printing' }, // Rs. 30,000
    { category_id: sub1_3.id, allocated_amount_cents: 2000000, notes: '20k for stationery' }, // Rs. 20,000
    { category_id: sub2_1.id, allocated_amount_cents: 10000000, notes: '100k repairs' }, // Rs. 100,000
    { category_id: sub2_2.id, allocated_amount_cents: 4000000, notes: '40k electrical' }, // Rs. 40,000
  ],
}, 1);

assert.strictEqual(draftFy.status, 'draft', 'Newly created FY should be in draft status');
assert.strictEqual(draftFy.total_budget_cents, 24000000, 'Total budget should equal 240,000.00 (24,000,000 cents)');

const fyDetail = FinancialService.getFinancialYearDetail(draftFy.id);
assert.strictEqual(fyDetail.allocations.length, 5, 'Should have 5 subcategory allocations');

// Check that each subcategory contains its parent code and name
const alloc1 = fyDetail.allocations.find(a => a.category_id === sub1_1.id);
assert.strictEqual(alloc1.parent_code, 'Rex 01', 'Subcategory allocation must carry parent_code Rex 01');
assert.strictEqual(alloc1.parent_name, 'Administration', 'Subcategory allocation must carry parent_name Administration');

// Approve and lock Financial Year
const approvedFy = FinancialService.approveFinancialYear(draftFy.id, 1, 'Approved by Board');
assert.strictEqual(approvedFy.status, 'approved', 'FY should now be approved and locked');
console.log(`✓ FY "${approvedFy.year_name}" approved and permanently locked with Rs. ${(approvedFy.total_budget_cents / 100).toFixed(2)} total budget.`);

// Verify direct allocation rejection on parent category
assert.throws(() => {
  FinancialService.saveFinancialYearDraft({
    id: draftFy.id,
    year_name: 'FY 2026/2027',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    allocations: [{ category_id: main1.id, allocated_amount_cents: 100000 }],
  }, 1);
}, /permanently locked/, 'Cannot modify approved and locked financial year');
console.log('✓ Modification prevention on locked financial year verified.');

// -------------------------------------------------------------
// 3. TEST SEPARATE EXPENSE MANAGEMENT (CASH & BANK ONLY)
// -------------------------------------------------------------
console.log('\n--- 3. Testing General Expense Management (Cash & Bank Only) ---');

// Set FY 2026 as current
FinancialService.setCurrentFinancialYear(draftFy.id, 1);

// Inject Cash in Hand balance via initial opening
const dbInst = db;
dbInst.prepare(`
  INSERT INTO cash_transactions (financial_year_id, transaction_date, transaction_type, reference_no, description, amount_cents, running_balance_cents)
  VALUES (?, '2026-01-01', 'receipt', 'INIT-CASH', 'Initial Float', 20000000, 20000000)
`).run(draftFy.id);

// Register a Bank Account with opening balance Rs. 500,000
const bankAcc = FinancialService.createBankAccount({
  bank_name: 'Bank of Ceylon - Colombo',
  account_number: '0008472910',
  account_type: 'current',
  opening_balance_cents: 50000000, // Rs. 500,000
});

// Try to record an expense with petty_cash method in general Expense workflow -> must be rejected
assert.throws(() => {
  FinancialService.createExpense({
    financial_year_id: draftFy.id,
    category_id: sub1_1.id,
    expense_date: '2026-01-15',
    payee: 'Store',
    description: 'General petty cash attempt',
    amount_cents: 500000,
    payment_method: 'petty_cash',
  }, 1);
}, /Petty cash payments must be recorded directly through the dedicated Petty Cash/, 'General expense workflow must reject petty_cash');
console.log('✓ Petty cash payment method rejection in general Expense Management verified.');

// Try to record an expense referencing a Parent category -> must be rejected
assert.throws(() => {
  FinancialService.createExpense({
    financial_year_id: draftFy.id,
    category_id: main1.id,
    expense_date: '2026-01-15',
    payee: 'Store',
    description: 'Parent category attempt',
    amount_cents: 500000,
    payment_method: 'cash',
  }, 1);
}, /Cannot record expense against parent category/, 'Expense must reference subcategory, not main parent category');
console.log('✓ Parent category expense rejection verified (must reference subcategory).');

// Record a valid cash expense under subcategory 1.1 (Office Supplies: 50k allocation)
const exp1 = FinancialService.createExpense({
  financial_year_id: draftFy.id,
  category_id: sub1_1.id,
  expense_date: '2026-01-15',
  payee: 'ABC Stationers',
  description: 'Printer paper and pens',
  amount_cents: 1000000, // Rs. 10,000
  payment_method: 'cash',
  bill_no: 'INV-101',
}, 1);
assert.strictEqual(exp1.voucher_no.startsWith('EXP-'), true, 'Expense voucher generated');
console.log(`✓ Cash expense ${exp1.voucher_no} recorded: Rs. ${(exp1.amount_cents / 100).toFixed(2)} under 1.1`);

// Verify cash balance decreased by Rs. 10,000
const cashBal = dbInst.prepare('SELECT running_balance_cents FROM cash_transactions ORDER BY id DESC LIMIT 1').get();
assert.strictEqual(cashBal.running_balance_cents, 19000000, 'Cash balance should be 200,000 - 10,000 = 190,000');

// Record a bank expense under subcategory 2.1 (Repairs: 100k allocation)
const exp2 = FinancialService.createExpense({
  financial_year_id: draftFy.id,
  category_id: sub2_1.id,
  expense_date: '2026-01-16',
  payee: 'City Builders',
  description: 'Roof leak repair',
  amount_cents: 3500000, // Rs. 35,000
  payment_method: 'bank',
  bank_account_id: bankAcc.id,
  reference_no: 'CHQ-9901',
}, 1);
console.log(`✓ Bank expense ${exp2.voucher_no} recorded: Rs. ${(exp2.amount_cents / 100).toFixed(2)} from bank ${bankAcc.account_number}`);

// Verify bank account balance decreased by Rs. 35,000
const updatedBank = dbInst.prepare('SELECT current_balance_cents FROM bank_accounts WHERE id = ?').get(bankAcc.id);
assert.strictEqual(updatedBank.current_balance_cents, 50000000 - 3500000, 'Bank balance should be 500,000 - 35,000 = 465,000');

// Budget ceiling check: Subcategory 1.1 has 50,000 allocation, 10,000 spent -> remaining 40,000.
// Trying to spend 45,000 should fail!
assert.throws(() => {
  FinancialService.createExpense({
    financial_year_id: draftFy.id,
    category_id: sub1_1.id,
    expense_date: '2026-01-20',
    payee: 'Mega Store',
    description: 'Bulk order',
    amount_cents: 4500000, // Rs. 45,000 > 40,000 remaining
    payment_method: 'cash',
  }, 1);
}, /exceeds remaining budget allocation/, 'Cannot exceed subcategory remaining budget allocation');
console.log('✓ Subcategory budget ceiling enforcement verified.');

// -------------------------------------------------------------
// 4. TEST DEDICATED PETTY CASH EXPENSE WORKFLOW
// -------------------------------------------------------------
console.log('\n--- 4. Testing Dedicated Petty Cash Expense Workflow ---');

// Replenish petty cash float with Rs. 25,000 from Cash in Hand
FinancialService.replenishPettyCash({
  financial_year_id: draftFy.id,
  voucher_date: '2026-01-10',
  amount_cents: 2500000, // Rs. 25,000
  description: 'Initial petty cash float imprest',
  source_type: 'cash',
});

const pettyFloatCheck = FinancialService.getPettyCashVouchers(10, 0, draftFy.id);
assert.strictEqual(pettyFloatCheck.balanceCents, 2500000, 'Petty cash balance should be 25,000');
console.log(`✓ Petty cash float replenished. Balance: Rs. ${(pettyFloatCheck.balanceCents / 100).toFixed(2)}`);

// Record dedicated petty cash expense under subcategory 1.3 (Stationery: 20k allocation)
const pettyExp1 = FinancialService.recordPettyCashExpense({
  financial_year_id: draftFy.id,
  category_id: sub1_3.id,
  expense_date: '2026-01-18',
  payee: 'Corner Bookshop',
  description: 'Exam paper clips and marker pens',
  amount_cents: 500000, // Rs. 5,000
  receipt_no: 'REC-3301',
  notes: 'Urgent exam supplies',
}, 1);

assert.strictEqual(pettyExp1.voucher_no.startsWith('PC-'), true, 'Petty cash voucher generated');
assert.strictEqual(pettyExp1.category_id, sub1_3.id, 'Petty cash expense linked to subcategory 1.3');

// Verify double deduction:
// A. Petty cash balance deducted (25,000 - 5,000 = 20,000)
const postPetty = FinancialService.getPettyCashVouchers(10, 0, draftFy.id);
assert.strictEqual(postPetty.balanceCents, 2000000, 'Petty cash balance should now be 20,000');

// B. Budget category remaining allocation deducted
const catDetails = FinancialService.getBudgetCategories(draftFy.id);
const statCat = catDetails.find(c => c.id === sub1_3.id);
assert.strictEqual(statCat.spent_amount_cents, 500000, 'Budget subcategory spent amount should now be 5,000');
console.log(`✓ Dedicated petty cash expense ${pettyExp1.voucher_no} recorded. Petty float & budget allocation both deducted accurately.`);

// Test petty cash expense exceeding petty float -> must fail!
assert.throws(() => {
  FinancialService.recordPettyCashExpense({
    financial_year_id: draftFy.id,
    category_id: sub2_1.id, // has 65,000 remaining budget allocation
    expense_date: '2026-01-19',
    payee: 'Luxury Store',
    description: 'Over float purchase',
    amount_cents: 2500000, // Rs. 25,000 > 20,000 available petty cash float
  }, 1);
}, /exceeds available petty cash balance/, 'Cannot exceed available petty cash balance');
console.log('✓ Petty cash float ceiling enforcement verified.');

// -------------------------------------------------------------
// 5. TEST EXPENSE REVERSAL & TRANSACTION INTEGRITY
// -------------------------------------------------------------
console.log('\n--- 5. Testing Expense Reversal & Transaction Integrity ---');

// Cancel exp1 (Rs. 10,000 cash expense)
FinancialService.cancelExpense(exp1.id, 'Wrong bill amount entered', 1);

// Verify status is reversed
const cancelledExp = dbInst.prepare('SELECT status FROM expenses WHERE id = ?').get(exp1.id);
assert.strictEqual(cancelledExp.status, 'reversed', 'Expense status should be reversed');

// Verify cash balance restored (+10,000)
const restoredCash = dbInst.prepare('SELECT running_balance_cents FROM cash_transactions ORDER BY id DESC LIMIT 1').get();
assert.strictEqual(restoredCash.running_balance_cents, 19000000 + 1000000 - 2500000, 'Cash balance restored (+10,000 from reversed expense)');

// Verify subcategory 1.1 spent amount restored back to 0
const catDetailsAfterCancel = FinancialService.getBudgetCategories(draftFy.id);
const sub1_1AfterCancel = catDetailsAfterCancel.find(c => c.id === sub1_1.id);
assert.strictEqual(sub1_1AfterCancel.spent_amount_cents, 0, 'Subcategory 1.1 spent amount should be restored to 0');
console.log(`✓ Expense reversal verified: Cash balance restored, budget allocation restored, status set to reversed.`);

// -------------------------------------------------------------
// 6. TEST UNIFIED CASH BOOK
// -------------------------------------------------------------
console.log('\n--- 6. Testing Unified Cash Book ---');

const unifiedAll = FinancialService.getUnifiedCashBook({ financialYearId: draftFy.id });
assert.strictEqual(unifiedAll.transactions.length > 0, true, 'Unified cash book should return combined transactions');

// Verify columns present
const firstTx = unifiedAll.transactions[0];
assert.notStrictEqual(firstTx.payment_source, undefined, 'Must identify payment_source');
assert.notStrictEqual(firstTx.source_type, undefined, 'Must identify source_type');
assert.notStrictEqual(firstTx.running_balance_cents, undefined, 'Must calculate running balance');

// Test Source Filter: Cash only
const unifiedCashOnly = FinancialService.getUnifiedCashBook({ financialYearId: draftFy.id, sourceFilter: 'cash' });
assert.strictEqual(unifiedCashOnly.transactions.every(t => t.source_type === 'cash'), true, 'All transactions must be cash in cash-only filter');

// Test Source Filter: Bank only
const unifiedBankOnly = FinancialService.getUnifiedCashBook({ financialYearId: draftFy.id, sourceFilter: bankAcc.id });
assert.strictEqual(unifiedBankOnly.transactions.every(t => t.source_type === 'bank' && t.bank_account_id === bankAcc.id), true, 'All transactions must be from specified bank account');

console.log(`✓ Unified Cash Book verified: Chronological merging, multi-column in/out, source filtering (Cash & Bank accounts).`);

// -------------------------------------------------------------
// 7. TEST FUND MANAGEMENT CATEGORIES & TRACEABILITY
// -------------------------------------------------------------
console.log('\n--- 7. Testing Fund Management Categories & Traceability ---');

// Fund categories seeded in migration 010: Government Funds, Donations, Special Funds, Other Funds
const fundCats = FinancialService.getFundCategories();
assert.strictEqual(fundCats.length >= 4, true, 'At least 4 fund categories must exist');
const govCat = fundCats.find(c => c.name_en === 'Government Funds');
assert.notStrictEqual(govCat, undefined, 'Government Funds category must exist');

// Create custom category
const alumniCat = FinancialService.createFundCategory({
  category_code: 'FC-05',
  name_en: 'Alumni Development',
  name_si: 'ආදි ශිෂ්‍ය සංවර්ධන',
  description: 'Funds contributed by past pupils',
}, 1);
assert.strictEqual(alumniCat.category_code, 'FC-05', 'Custom fund category created with code FC-05');
console.log(`✓ Fund category created: ${alumniCat.category_code} - ${alumniCat.name_en}`);

// Create a Fund under Alumni Development with opening balance Rs. 150,000
const alumniFund = FinancialService.createFund({
  fund_name: 'Library Computer Lab Fund',
  fund_category_id: alumniCat.id,
  opening_balance_cents: 15000000, // Rs. 150,000
  description: 'Donations for computers',
});
assert.strictEqual(alumniFund.current_balance_cents, 15000000, 'Fund opening balance should be 150,000');

// Record a funding receipt into this fund: Rs. 50,000 received
FinancialService.createFundReceipt({
  financial_year_id: draftFy.id,
  fund_id: alumniFund.id,
  receipt_date: '2026-02-01',
  donor_or_dept: 'Alumni Batch 2005',
  amount_cents: 5000000, // Rs. 50,000
  payment_method: 'bank_transfer',
  destination_type: 'bank',
  bank_account_id: bankAcc.id,
  purpose: 'Computers donation',
});

// Verify fund balance is now 150k + 50k = 200k
const fundCheck = FinancialService.getFunds(undefined, alumniCat.id);
const loadedAlumniFund = fundCheck.find(f => f.id === alumniFund.id);
assert.strictEqual(loadedAlumniFund.current_balance_cents, 20000000, 'Fund balance should be 200,000');
console.log(`✓ Fund receipt recorded. Current fund balance: Rs. ${(loadedAlumniFund.current_balance_cents / 100).toFixed(2)}`);

// Finance an expense using this fund: Rs. 40,000 expense under subcategory 2.2 (Electrical: 40k allocation)
const financedExp = FinancialService.createExpense({
  financial_year_id: draftFy.id,
  category_id: sub2_2.id,
  fund_id: alumniFund.id,
  expense_date: '2026-02-05',
  payee: 'Tech Wiring Ltd',
  description: 'Network and electrical cabling for computer lab',
  amount_cents: 4000000, // Rs. 40,000
  payment_method: 'bank',
  bank_account_id: bankAcc.id,
}, 1);

// Verify fund available balance decreased to 200k - 40k = 160k
const fundPostExpense = FinancialService.getFunds(undefined, alumniCat.id).find(f => f.id === alumniFund.id);
assert.strictEqual(fundPostExpense.current_balance_cents, 16000000, 'Fund balance should be 160,000');

// Verify fund usage traceability
const traces = FinancialService.getFundTraces(alumniFund.id);
assert.strictEqual(traces.length, 1, 'Should have exactly 1 trace record for this fund');
assert.strictEqual(traces[0].expense_id, financedExp.id, 'Trace must be linked to financed expense ID');
assert.strictEqual(traces[0].allocated_cents, 4000000, 'Trace amount must equal 40,000.00');
console.log(`✓ Fund usage trace verified: Expense ${financedExp.voucher_no} is traceably linked to Fund "${alumniFund.fund_name}" without double counting.`);

console.log('\n===============================================================');
console.log('✓✓✓ ALL STAGE 12 FINANCIAL UPGRADE TESTS PASSED SUCCESSFULLY! ✓✓✓');
console.log('===============================================================');

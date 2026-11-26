/**
 * Automated Test Suite: Fund Category Hierarchy (Main Category Level & Subcategory Level with Code)
 * Tests:
 * 1. Database schema migration 022 and column/index addition.
 * 2. Suggesting category codes for main and sub categories.
 * 3. Creating main categories and subcategories.
 * 4. Hierarchy restrictions (2-level maximum, duplicate checks).
 * 5. Explicit LEFT JOIN retrieval in getFundCategories.
 * 6. Receipt recording and parent-level filtering in getFundReceipts.
 * 7. Safe deletion constraints (prevent deleting category with subcategories or receipts).
 */

const Database = require('better-sqlite3');
const assert = require('assert');

// 1. Create Isolated In-Memory Test Database
const db = new Database(':memory:');
db.pragma('foreign_keys = ON');

// 2. Run all schema migrations including 022
const { runMigrations } = require('../dist/main/db/migrationRunner');
runMigrations(db);

// Point getDatabase to our test db instance
const dbModule = require('../dist/main/db/index');
dbModule.getDatabase = () => db;

// Seed Admin User
const { CryptoService } = require('../dist/main/services/cryptoService');
const adminHash = CryptoService.hashPassword('Admin@123456');
db.prepare(`
  INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role_id, status)
  VALUES (1, 'admin', ?, 'Administrator', 1, 'active')
`).run(adminHash);

const { FinancialService } = require('../dist/main/services/financialService');

console.log('================================================================');
console.log('--- RUNNING FUND CATEGORY HIERARCHY AUTOMATED TEST SUITE ---');
console.log('================================================================');

// TEST 1: Schema verification for migration 022
console.log('\n[TEST 1] Verifying schema and indexes for fund_categories...');
const tableCols = db.prepare('PRAGMA table_info(fund_categories)').all();
const hasParentId = tableCols.some((c) => c.name === 'parent_id');
assert.strictEqual(hasParentId, true, 'fund_categories must contain parent_id column');

const indexes = db.prepare('PRAGMA index_list(fund_categories)').all();
const hasParentIdx = indexes.some((idx) => idx.name === 'idx_fund_cats_parent');
const hasParentActiveIdx = indexes.some((idx) => idx.name === 'idx_fund_cats_parent_active');
assert.strictEqual(hasParentIdx, true, 'idx_fund_cats_parent index must exist');
assert.strictEqual(hasParentActiveIdx, true, 'idx_fund_cats_parent_active index must exist');
console.log('✓ Migration 022 successfully applied with parent_id column and performance indexes.');

// TEST 2: Code suggestion
console.log('\n[TEST 2] Verifying suggestFundCategoryCode for main and subcategories...');
const suggestedMainCode = FinancialService.suggestFundCategoryCode(null);
assert.ok(suggestedMainCode.startsWith('FCAT-'), `Main code should start with FCAT-, got ${suggestedMainCode}`);

// Existing main category 1 is FCAT-001
const suggestedSubCode = FinancialService.suggestFundCategoryCode(1);
assert.ok(suggestedSubCode.includes('.'), `Subcategory code should include '.', got ${suggestedSubCode}`);
console.log(`✓ Code suggestion works: Main=${suggestedMainCode}, Sub=${suggestedSubCode}`);

// TEST 3: Create Main Category and Subcategory
console.log('\n[TEST 3] Creating Main Category and Subcategories...');
const mainCat = FinancialService.createFundCategory({
  category_code: 'FCAT-100',
  name_en: 'Alumni Development Projects',
  name_si: 'හිටපු සිසු සංවර්ධන ව්‍යාපෘති',
  parent_id: null,
  description: 'Special donations from past pupils association',
}, 1);

assert.strictEqual(mainCat.category_code, 'FCAT-100');
assert.strictEqual(mainCat.parent_id, null);
assert.strictEqual(mainCat.name_en, 'Alumni Development Projects');

const subCat1 = FinancialService.createFundCategory({
  category_code: '100.1',
  name_en: 'Auditorium Acoustic Upgrade',
  name_si: 'ශ්‍රවණාගාර ශබ්ද පද්ධති වැඩිදියුණු කිරීම',
  parent_id: mainCat.id,
  description: 'Phase 1 acoustic paneling',
}, 1);

assert.strictEqual(subCat1.category_code, '100.1');
assert.strictEqual(subCat1.parent_id, mainCat.id);
assert.strictEqual(subCat1.parent_code, 'FCAT-100');
assert.strictEqual(subCat1.parent_name_en, 'Alumni Development Projects');

const subCat2 = FinancialService.createFundCategory({
  category_code: '100.2',
  name_en: 'Indoor Sports Complex Floor',
  name_si: 'ගෘහස්ථ ක්‍රීඩා සංකීර්ණ බිම් සැකසුම',
  parent_id: mainCat.id,
  description: 'Badminton court synthetic matting',
}, 1);

assert.strictEqual(subCat2.category_code, '100.2');
assert.strictEqual(subCat2.parent_id, mainCat.id);
console.log('✓ Successfully created Main Category and 2 Subcategories with parent links.');

// TEST 4: Hierarchy constraints
console.log('\n[TEST 4] Testing 2-level hierarchy restriction & duplicate checks...');
assert.throws(() => {
  FinancialService.createFundCategory({
    category_code: '100.1.1',
    name_en: 'Sub-sub item',
    parent_id: subCat1.id, // Cannot have parent that is already a subcategory
  }, 1);
}, /2-level hierarchy maximum/);

assert.throws(() => {
  FinancialService.createFundCategory({
    category_code: '100.3',
    name_en: 'Auditorium Acoustic Upgrade', // Duplicate name under same parent
    parent_id: mainCat.id,
  }, 1);
}, /already exists in this level/);
console.log('✓ 2-level depth limit and duplicate category name prevention validated.');

// TEST 5: Explicit LEFT JOIN retrieval in getFundCategories
console.log('\n[TEST 5] Testing explicit LEFT JOIN in getFundCategories()...');
const allCats = FinancialService.getFundCategories();
const foundSub = allCats.find((c) => c.id === subCat1.id);
assert.ok(foundSub, 'Created subcategory must be in retrieved list');
assert.strictEqual(foundSub.parent_id, mainCat.id);
assert.strictEqual(foundSub.parent_code, 'FCAT-100');
assert.strictEqual(foundSub.parent_name_en, 'Alumni Development Projects');
console.log('✓ Explicit LEFT JOIN correctly populates parent_code and parent_name_en.');

// TEST 6: Record receipt under subcategory and filter by Main Category
console.log('\n[TEST 6] Recording receipt under subcategory and verifying parent filtering...');
const fy = FinancialService.createFinancialYear({
  year_name: '2026',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
}, 1);

const rcpt = FinancialService.createFundReceipt({
  financial_year_id: fy.id,
  fund_category_id: subCat1.id,
  receipt_date: '2026-03-15',
  donor_or_dept: 'Batch of 2005',
  amount_cents: 25000000, // Rs. 250,000.00
  payment_method: 'bank_transfer',
  destination_type: 'bank',
  bank_account_id: 1,
  purpose: 'Acoustic upgrade donation',
}, 1);

assert.strictEqual(rcpt.fund_category_id, subCat1.id);

// Query receipts filtering by the Main Category (mainCat.id)
const receiptsByMain = FinancialService.getFundReceipts(10, 0, fy.id, mainCat.id);
assert.strictEqual(receiptsByMain.total, 1, 'Filtering by Main Category must include receipts of child subcategories');
assert.strictEqual(receiptsByMain.receipts[0].fund_category_id, subCat1.id);
assert.strictEqual(receiptsByMain.receipts[0].parent_category_code, 'FCAT-100');

// Query receipts filtering directly by subcategory (subCat1.id)
const receiptsBySub = FinancialService.getFundReceipts(10, 0, fy.id, subCat1.id);
assert.strictEqual(receiptsBySub.total, 1);

// Query receipts filtering by other subcategory (subCat2.id)
const receiptsByOtherSub = FinancialService.getFundReceipts(10, 0, fy.id, subCat2.id);
assert.strictEqual(receiptsByOtherSub.total, 0);
console.log('✓ Parent-level category filtering seamlessly captures subcategory transactions.');

// TEST 7: Safe Deletion constraints
console.log('\n[TEST 7] Testing safe deletion constraints...');
// Cannot delete mainCat because it has subcategories
assert.throws(() => {
  FinancialService.deleteFundCategory(mainCat.id, 1);
}, /contains 2 subcategory\(s\)/);

// Cannot delete subCat1 because it has recorded receipts
assert.throws(() => {
  FinancialService.deleteFundCategory(subCat1.id, 1);
}, /linked to 1 donation\/fund receipt\(s\)/);

// Can delete subCat2 because it has no transactions
FinancialService.deleteFundCategory(subCat2.id, 1);
const catsAfterDelete = FinancialService.getFundCategories();
assert.strictEqual(catsAfterDelete.some((c) => c.id === subCat2.id), false, 'subCat2 should be deleted');
console.log('✓ Safe deletion constraints successfully prevent deleting categories with subcategories or receipts.');

console.log('\n================================================================');
console.log('>>> ALL FUND CATEGORY HIERARCHY TESTS PASSED SUCCESSFULLY! <<<');
console.log('================================================================');

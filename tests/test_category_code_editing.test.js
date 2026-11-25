const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

console.log('================================================================');
console.log('--- CLI TEST: CATEGORY CODE AUTO-SUGGESTION & EDITING ---');
console.log('================================================================');

const testDbPath = path.join(process.cwd(), 'tests', 'test_category_code_cli.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Apply migrations 001 to 010
for (let i = 1; i <= 10; i++) {
  const numStr = String(i).padStart(3, '0');
  const files = fs.readdirSync(path.join(process.cwd(), 'dist', 'main', 'db', 'migrations'));
  const target = files.find(f => f.startsWith(numStr) && f.endsWith('.js'));
  if (target) {
    const mod = require(path.join(process.cwd(), 'dist', 'main', 'db', 'migrations', target));
    const m = Object.values(mod)[0];
    db.pragma('foreign_keys = OFF');
    const tx = db.transaction(() => {
      m.up(db);
    });
    tx();
    db.pragma('foreign_keys = ON');
  }
}

console.log('✓ All 10 migrations applied cleanly.');

// Provision test user
db.prepare(`
  INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role_id, status)
  VALUES (1, 'admin', 'test_hash', 'Administrator', 1, 'active')
`).run();

const { FinancialService } = require('../dist/main/services/financialService');
const { initDatabase } = require('../dist/main/db/index');
initDatabase(testDbPath);

// -------------------------------------------------------------
// 1. AUTO-SUGGESTION FOR MAIN CATEGORIES
// -------------------------------------------------------------
console.log('\n--- 1. Testing Auto-Suggestion for Main Categories ---');
const suggestedMain1 = FinancialService.suggestCategoryCode(null);
console.log(`Suggested Main Code: "${suggestedMain1}"`);
assert.strictEqual(suggestedMain1.startsWith('Rex '), true, 'Main category code should start with Rex');

// Create with default suggested code
const main1 = FinancialService.quickCreateCategory('Administration', 'පරිපාලනය', null, 1);
assert.strictEqual(main1.category_code, suggestedMain1, 'quickCreateCategory should use suggested code by default');
console.log(`✓ Main Category 1 created with suggested code: ${main1.category_code}`);

// Check next suggested main code
const suggestedMain2 = FinancialService.suggestCategoryCode(null);
console.log(`Suggested Next Main Code: "${suggestedMain2}"`);
assert.notStrictEqual(suggestedMain2, suggestedMain1, 'Next suggested main code must be sequential and different');

// -------------------------------------------------------------
// 2. CREATING MAIN CATEGORY WITH CUSTOM EDITABLE CODE
// -------------------------------------------------------------
console.log('\n--- 2. Testing Custom Code on Creation (Main Category) ---');
const customMainCode = 'REX-SPECIAL-01';
const mainCustom = FinancialService.quickCreateCategory('Special Projects', 'විශේෂ ව්‍යාපෘති', null, 1, customMainCode);
assert.strictEqual(mainCustom.category_code, customMainCode, 'Category should be created with user-edited custom code');
console.log(`✓ Main Category created with custom code: ${mainCustom.category_code}`);

// Reject duplicate custom code
assert.throws(() => {
  FinancialService.quickCreateCategory('Duplicate Code Cat', '', null, 1, customMainCode);
}, /already in use|already exists/i, 'Should reject duplicate category code on creation');
console.log('✓ Correctly rejected duplicate custom code on creation.');

// -------------------------------------------------------------
// 3. AUTO-SUGGESTION FOR SUBCATEGORIES
// -------------------------------------------------------------
console.log('\n--- 3. Testing Auto-Suggestion for Subcategories ---');
const suggestedSub1 = FinancialService.suggestCategoryCode(main1.id);
console.log(`Suggested Subcategory Code under Main1: "${suggestedSub1}"`);
assert.strictEqual(suggestedSub1.includes('.'), true, 'Subcategory code should contain a dot notation');

const sub1 = FinancialService.quickCreateCategory('Office Supplies', 'කාර්යාල සැපයුම්', main1.id, 1);
assert.strictEqual(sub1.category_code, suggestedSub1, 'quickCreateCategory should use suggested code for subcategory');
console.log(`✓ Subcategory 1 created with suggested code: ${sub1.category_code}`);

const suggestedSub2 = FinancialService.suggestCategoryCode(main1.id);
console.log(`Suggested Next Subcategory Code under Main1: "${suggestedSub2}"`);
assert.notStrictEqual(suggestedSub2, suggestedSub1, 'Next child code must increment sequentially');

// -------------------------------------------------------------
// 4. CREATING SUBCATEGORY WITH CUSTOM CODE
// -------------------------------------------------------------
console.log('\n--- 4. Testing Custom Code on Creation (Subcategory) ---');
const customSubCode = '1.99-CUSTOM';
const subCustom = FinancialService.quickCreateCategory('Custom Printing', 'මුද්‍රණ', main1.id, 1, customSubCode);
assert.strictEqual(subCustom.category_code, customSubCode, 'Subcategory should be created with custom code');
console.log(`✓ Subcategory created with custom code: ${subCustom.category_code}`);

// -------------------------------------------------------------
// 5. EDITING EXISTING CATEGORY CODE & NAME
// -------------------------------------------------------------
console.log('\n--- 5. Testing Updating Category Code & Name ---');
const updatedMain = FinancialService.updateCategory(main1.id, {
  category_code: 'Rex 01-MOD',
  name: 'Administration & HR',
  name_si: 'පරිපාලන සහ මානව සම්පත්',
}, 1);

assert.strictEqual(updatedMain.category_code, 'Rex 01-MOD', 'Category code should be updated');
assert.strictEqual(updatedMain.name, 'Administration & HR', 'Category English name should be updated');
assert.strictEqual(updatedMain.name_si, 'පරිපාලන සහ මානව සම්පත්', 'Category Sinhala name should be updated');
console.log(`✓ Main Category updated successfully: [${updatedMain.category_code}] ${updatedMain.name}`);

// Updating subcategory code & name
const updatedSub = FinancialService.updateCategory(sub1.id, {
  category_code: '1.1-MOD',
  name: 'General Supplies',
}, 1);
assert.strictEqual(updatedSub.category_code, '1.1-MOD', 'Subcategory code should be updated');
assert.strictEqual(updatedSub.name, 'General Supplies', 'Subcategory name should be updated');
console.log(`✓ Subcategory updated successfully: [${updatedSub.category_code}] ${updatedSub.name}`);

// -------------------------------------------------------------
// 6. VALIDATION CHECKS ON EDITING
// -------------------------------------------------------------
console.log('\n--- 6. Testing Duplicate Prevention on Editing ---');
// Try to change sub1 code to subCustom's code
assert.throws(() => {
  FinancialService.updateCategory(sub1.id, {
    category_code: customSubCode,
  }, 1);
}, /already in use|already exists/i, 'Should reject duplicate code when editing');
console.log('✓ Correctly rejected duplicate code on category edit.');

// Check audit log entry
const auditRows = db.prepare(`
  SELECT action, record_ref, details FROM authentication_audit_logs WHERE action IN ('BUDGET_CATEGORY_CREATED', 'BUDGET_CATEGORY_UPDATED') ORDER BY id DESC LIMIT 5
`).all();
assert.strictEqual(auditRows.length > 0, true, 'Audit log must record category actions');
console.log(`✓ Verified audit trail recorded ${auditRows.length} category actions.`);

console.log('\n================================================================');
console.log('--- ALL CLI TESTS PASSED SUCCESSFULLY! ---');
console.log('================================================================');

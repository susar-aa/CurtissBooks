const { FinancialService } = require('../dist/main/services/financialService');
const { initDatabase, getDatabase } = require('../dist/main/db/index');
const path = require('path');
const os = require('os');
const assert = require('assert');

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'curtissbooks', 'data', 'curtissbooks.db');
initDatabase(dbPath);
const db = getDatabase();

console.log('--- TEST: Creating or Finding Main Category ---');
let mainCat = db.prepare("SELECT * FROM budget_categories WHERE category_code = 'Rex 01'").get();
if (!mainCat) {
  mainCat = FinancialService.quickCreateCategory('Administration', 'පරිපාලන', null, 1);
}
console.log('Main category:', mainCat.category_code, mainCat.name || mainCat.name_en);

console.log('--- TEST: Creating Subcategories under Rex 01 ---');
let sub1 = db.prepare("SELECT * FROM budget_categories WHERE parent_id = ? AND category_code = '1.1'").get(mainCat.id);
if (!sub1) {
  sub1 = FinancialService.quickCreateCategory('Office Supplies', 'කාර්යාල සැපයුම්', mainCat.id, 1);
}
console.log('Subcategory 1:', sub1.category_code, sub1.name || sub1.name_en);

let sub2 = db.prepare("SELECT * FROM budget_categories WHERE parent_id = ? AND category_code = '1.2'").get(mainCat.id);
if (!sub2) {
  sub2 = FinancialService.quickCreateCategory('Printing Services', 'මුද්‍රණ සේවා', mainCat.id, 1);
}
console.log('Subcategory 2:', sub2.category_code, sub2.name || sub2.name_en);

console.log('\n--- TEST: Saving Draft with Main Category and Subcategories ---');
const draftPayload = {
  year_name: 'TEST-FY-2027',
  start_date: '2027-01-01',
  end_date: '2027-12-31',
  allocations: [
    { category_id: mainCat.id, allocated_amount_cents: 0, notes: 'Main Administration' },
    { category_id: sub1.id, allocated_amount_cents: 5000000, notes: '50k supplies' },
    { category_id: sub2.id, allocated_amount_cents: 3000000, notes: '30k printing' }
  ]
};

// Check if draft already exists
const existingDraft = db.prepare("SELECT id FROM financial_years WHERE year_name = 'TEST-FY-2027'").get();
if (existingDraft) {
  draftPayload.id = existingDraft.id;
}

const savedDraft = FinancialService.saveFinancialYearDraft(draftPayload, 1);
console.log('Saved Draft ID:', savedDraft.id);
console.log('Total budget cents:', savedDraft.total_budget_cents, '-> Rs.', savedDraft.total_budget_cents / 100);
console.log('Allocations in detail:', savedDraft.allocations.map(a => ({
  id: a.category_id,
  code: a.category_code,
  name: a.category_name,
  parent_id: a.parent_id,
  allocated: a.allocated_amount_cents / 100
})));

assert.strictEqual(savedDraft.total_budget_cents, 8000000, 'Total budget should be exactly 80,000.00');
console.log('✓ CLI verification successful: Draft saved with both Main and Subcategories without double counting.');

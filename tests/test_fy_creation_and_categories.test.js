const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

console.log('================================================================');
console.log('--- RUNNING CLI TEST: FY CREATION & REUSABLE CATEGORY ADDING ---');
console.log('================================================================');

const testDbPath = path.join(process.cwd(), 'tests', 'test_fy_creation_cli.db');
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
// 1. TEST RETRIEVING ALREADY AVAILABLE CATEGORIES
// -------------------------------------------------------------
console.log('\n--- 1. Testing Reusable Categories Retrieval (Empty & Prefix Search) ---');
const allAvailable = FinancialService.getReusableCategories('', true);
assert.strictEqual(allAvailable.length >= 12, true, 'Seeded categories must be returned');
console.log(`✓ Retrieved ${allAvailable.length} available categories when search is empty.`);

const recurrentMain = allAvailable.find(c => c.category_code === '100');
assert.notStrictEqual(recurrentMain, undefined, 'Category 100 must exist');
assert.strictEqual(recurrentMain.is_parent, true, 'Category 100 must be a parent/main category');
assert.strictEqual(recurrentMain.parent_id, null, 'Category 100 parent_id must be null');

const classroomSub = allAvailable.find(c => c.category_code === '101');
assert.notStrictEqual(classroomSub, undefined, 'Category 101 must exist');
assert.strictEqual(classroomSub.parent_id, recurrentMain.id, 'Category 101 parent_id must match 100');
assert.strictEqual(classroomSub.is_parent, false, 'Category 101 must be a subcategory');
console.log(`✓ Hierarchy verified for existing categories: Main ${recurrentMain.category_code} -> Child ${classroomSub.category_code}`);

// Search by prefix
const searchClass = FinancialService.getReusableCategories('Class', true);
assert.strictEqual(searchClass.some(c => c.id === classroomSub.id), true, 'Search for "Class" must return 101');
console.log(`✓ Search for "Class" returned category: ${searchClass[0].category_code} - ${searchClass[0].name}`);

// -------------------------------------------------------------
// 2. TEST CREATING MAIN CATEGORIES
// -------------------------------------------------------------
console.log('\n--- 2. Testing Creating Main Category ---');
const main1 = FinancialService.quickCreateCategory('Administrative Services', 'පරිපාලන සේවා', null, 1);
assert.strictEqual(main1.category_code, 'Rex 01', 'First created main category must be Rex 01');
assert.strictEqual(main1.parent_id, null, 'Main category parent_id must be null');
assert.strictEqual(main1.is_parent, true, 'Main category is_parent must be true');
console.log(`✓ Main Category created: ${main1.category_code} - ${main1.name}`);

const main2 = FinancialService.quickCreateCategory('Physical Plant & Buildings', 'භෞතික සම්පත් හා ගොඩනැගිලි', null, 1);
assert.strictEqual(main2.category_code, 'Rex 02', 'Second created main category must be Rex 02');
console.log(`✓ Main Category created: ${main2.category_code} - ${main2.name}`);

// -------------------------------------------------------------
// 3. TEST CREATING SUBCATEGORIES UNDER MAIN CATEGORY
// -------------------------------------------------------------
console.log('\n--- 3. Testing Creating Subcategories Under Main Category ---');
const sub1_1 = FinancialService.quickCreateCategory('Office Supplies & Printing', 'ලිපිද්‍රව්‍ය හා මුද්‍රණ', main1.id, 1);
assert.strictEqual(sub1_1.category_code, '1.1', 'Subcategory under main 1 must be 1.1');
assert.strictEqual(sub1_1.parent_id, main1.id, 'Subcategory parent_id must match main1.id');

const sub1_2 = FinancialService.quickCreateCategory('Postal & Courier Charges', 'තැපැල් ගාස්තු', main1.id, 1);
assert.strictEqual(sub1_2.category_code, '1.2', 'Second subcategory under main 1 must be 1.2');

const sub2_1 = FinancialService.quickCreateCategory('Roof & Masonry Repairs', 'වහල හා පෙදරේරු අලුත්වැඩියා', main2.id, 1);
assert.strictEqual(sub2_1.category_code, '2.1', 'Subcategory under main 2 must be 2.1');
console.log(`✓ Subcategories created: 1.1 (${sub1_1.name}), 1.2 (${sub1_2.name}), 2.1 (${sub2_1.name})`);

// -------------------------------------------------------------
// 4. TEST ADDING MAIN AND SUB CATEGORIES TO FINANCIAL YEAR DRAFT
// -------------------------------------------------------------
console.log('\n--- 4. Testing Adding Available, Main, and Subcategories to FY Draft ---');

const draft = FinancialService.saveFinancialYearDraft({
  year_name: 'FY 2027/2028',
  start_date: '2027-01-01',
  end_date: '2027-12-31',
  allocations: [
    // 1. Existing seeded main category
    { category_id: recurrentMain.id, allocated_amount_cents: 0, notes: 'Main category container' },
    // 2. Existing seeded subcategory
    { category_id: classroomSub.id, allocated_amount_cents: 6000000, notes: '60k for materials' }, // Rs. 60,000
    // 3. Newly created main category 1
    { category_id: main1.id, allocated_amount_cents: 0, notes: 'Admin main' },
    // 4. Subcategories under main 1
    { category_id: sub1_1.id, allocated_amount_cents: 4000000, notes: '40k office supplies' }, // Rs. 40,000
    { category_id: sub1_2.id, allocated_amount_cents: 1500000, notes: '15k postal' }, // Rs. 15,000
    // 5. Newly created main category 2
    { category_id: main2.id, allocated_amount_cents: 0, notes: 'Building main' },
    // 6. Subcategory under main 2
    { category_id: sub2_1.id, allocated_amount_cents: 8500000, notes: '85k repairs' }, // Rs. 85,000
  ],
}, 1);

assert.strictEqual(draft.status, 'draft', 'FY must be in draft');
// Expected total = 60,000 + 40,000 + 15,000 + 85,000 = 200,000.00 (20,000,000 cents)
assert.strictEqual(draft.total_budget_cents, 20000000, 'Total budget must strictly equal Rs. 200,000.00 without double counting');
console.log(`✓ Draft saved. Total budget: Rs. ${(draft.total_budget_cents / 100).toFixed(2)} across ${draft.allocations.length} category items.`);

// Verify getFinancialYearDetail returns all categories with parent hierarchy
const detail = FinancialService.getFinancialYearDetail(draft.id);
assert.strictEqual(detail.allocations.length, 7, 'Must return all 7 allocated categories');

const allocatedMain1 = detail.allocations.find(a => a.category_id === main1.id);
assert.notStrictEqual(allocatedMain1, undefined, 'Main category Rex 01 must be in allocations');
assert.strictEqual(allocatedMain1.category_code, 'Rex 01', 'Must have code Rex 01');

const allocatedSub1_1 = detail.allocations.find(a => a.category_id === sub1_1.id);
assert.notStrictEqual(allocatedSub1_1, undefined, 'Subcategory 1.1 must be in allocations');
assert.strictEqual(allocatedSub1_1.parent_code, 'Rex 01', 'Parent code must be Rex 01');
assert.strictEqual(allocatedSub1_1.parent_name, 'Administrative Services', 'Parent name must match');

console.log('✓ getFinancialYearDetail correctly returns both Main and Child category records.');

// -------------------------------------------------------------
// 5. TEST STANDALONE MAIN CATEGORY WITH DIRECT BUDGET (0 SUB-CATEGORIES)
// -------------------------------------------------------------
console.log('\n--- 5. Testing Standalone Main Category With Direct Budget ---');
const standaloneMain = FinancialService.quickCreateCategory('Emergency Contingency', 'හදිසි ප්‍රතිපාදන', null, 1);
assert.strictEqual(standaloneMain.category_code, 'Rex 03', 'Third main category must be Rex 03');

const updatedDraft = FinancialService.saveFinancialYearDraft({
  id: draft.id,
  year_name: 'FY 2027/2028',
  start_date: '2027-01-01',
  end_date: '2027-12-31',
  allocations: [
    ...draft.allocations.map(a => ({
      category_id: a.category_id,
      allocated_amount_cents: a.allocated_amount_cents,
      notes: a.notes,
    })),
    // Add standalone main category with Rs. 25,000 allocation
    { category_id: standaloneMain.id, allocated_amount_cents: 2500000, notes: 'Standalone contingency' },
  ],
}, 1);

// Total should now be 200,000 + 25,000 = 225,000.00
assert.strictEqual(updatedDraft.total_budget_cents, 22500000, 'Total budget must equal Rs. 225,000.00');
console.log(`✓ Standalone Main category allocated directly with Rs. 25,000.00. New total: Rs. ${(updatedDraft.total_budget_cents / 100).toFixed(2)}`);

// -------------------------------------------------------------
// 6. TEST FINANCIAL YEAR APPROVAL & LOCKING
// -------------------------------------------------------------
console.log('\n--- 6. Testing FY Approval & Locking ---');
const approvedYear = FinancialService.approveFinancialYear(updatedDraft.id, 1, 'Approved by Principal');
assert.strictEqual(approvedYear.status, 'approved', 'Status must be approved');
assert.strictEqual(approvedYear.is_current, true, 'Approved year must be current');
assert.strictEqual(approvedYear.total_budget_cents, 22500000, 'Locked budget must be Rs. 225,000.00');
console.log(`✓ Financial year "${approvedYear.year_name}" approved and locked.`);

console.log('\n================================================================');
console.log('✓✓✓ ALL CLI TESTS PASSED WITH 100% SUCCESS! ✓✓✓');
console.log('================================================================');

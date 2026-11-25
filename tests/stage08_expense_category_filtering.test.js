const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

console.log('--- RUNNING STAGE 08 EXPENSE & CATEGORY FILTERING TESTS ---');

// 1. Setup isolated test database
const testDbPath = path.join(process.cwd(), 'tests', 'test_stage08.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 2. Run migrations up to 007
const { migration001 } = require('../dist/main/db/migrations/001_initial_settings');
const { migration002 } = require('../dist/main/db/migrations/002_auth_and_rbac');
const { migration003 } = require('../dist/main/db/migrations/003_school_and_students');
const { migration004 } = require('../dist/main/db/migrations/004_db_corrections_and_finalization');
const { migration005 } = require('../dist/main/db/migrations/005_financial_accounting_system');
const { migration006 } = require('../dist/main/db/migrations/006_budget_workflow_refinement');
const { migration007 } = require('../dist/main/db/migrations/007_single_active_fy_and_category_filtering');

db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const migrations = [migration001, migration002, migration003, migration004, migration005, migration006, migration007];
for (const m of migrations) {
  db.pragma('foreign_keys = OFF');
  const tx = db.transaction(() => {
    m.up(db);
    db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)').run(m.id, m.name);
  });
  tx();
  db.pragma('foreign_keys = ON');
}

console.log('✓ All 7 migrations applied cleanly.');

// 3. Test Single Active Financial Year Enforcement
const currentCount = db.prepare('SELECT COUNT(*) as c FROM financial_years WHERE is_current = 1').get().c;
console.log(`✓ Active running financial year count: ${currentCount} (Must be <= 1)`);
if (currentCount > 1) {
  throw new Error('Multiple current financial years found!');
}

// Test partial unique index violation
let uniqueFailed = false;
try {
  // Attempt to set a second financial year to is_current = 1 without unsetting the first
  const years = db.prepare('SELECT id FROM financial_years').all();
  if (years.length >= 2) {
    db.prepare('UPDATE financial_years SET is_current = 1 WHERE id = ?').run(years[1].id);
  } else {
    // Insert dummy second current year
    db.prepare(`
      INSERT INTO financial_years (year_name, start_date, end_date, status, is_current)
      VALUES ('FY-TEST-DUP', '2027-01-01', '2027-12-31', 'open', 1)
    `).run();
  }
} catch (err) {
  uniqueFailed = true;
  console.log('✓ Partial unique index successfully blocked multiple active financial years:', err.message);
}
if (!uniqueFailed && currentCount === 1) {
  throw new Error('Partial unique index failed to prevent multiple active financial years!');
}

// 4. Test Category Filtering for Financial Year
// Insert test category with Sinhala name
const insCat = db.prepare(`
  INSERT INTO budget_categories (category_code, name, name_en, name_si, is_active)
  VALUES ('CAT-TEST-01', 'Science Equipment', 'Science Equipment', 'විද්‍යාගාර උපකරණ', 1)
`);
const catRes = insCat.run();
const catId = Number(catRes.lastInsertRowid);

// Pick the single active financial year
const activeFy = db.prepare('SELECT id, year_name FROM financial_years WHERE is_current = 1 LIMIT 1').get();

// Allocate only this category to the active financial year
db.prepare(`
  INSERT INTO financial_year_budget_allocations (financial_year_id, category_id, allocated_amount_cents, notes)
  VALUES (?, ?, 5000000, 'Microscopes and beakers')
`).run(activeFy.id, catId);

// Query categories via the new getBudgetCategories query logic
const fyCats = db.prepare(`
  SELECT bc.id, bc.category_code, COALESCE(bc.name, bc.name_en) as name_en, bc.name_si,
         fa.allocated_amount_cents as approved_amount_cents
  FROM financial_year_budget_allocations fa
  INNER JOIN budget_categories bc ON fa.category_id = bc.id
  WHERE fa.financial_year_id = ? AND bc.is_active = 1
  ORDER BY bc.category_code ASC
`).all(activeFy.id);

console.log(`✓ Categories allocated to active FY ${activeFy.year_name}: ${fyCats.length}`);
const testCat = fyCats.find((c) => c.id === catId);
if (!testCat) throw new Error('Allocated category not found in active FY!');
if (testCat.name_si !== 'විද්‍යාගාර උපකරණ') throw new Error(`Expected Sinhala name 'විද්‍යාගාර උපකරණ', got ${testCat.name_si}`);
console.log(`✓ Sinhala name verified: "${testCat.name_en} (${testCat.name_si})"`);

// Verify unallocated categories are NOT returned
const totalMasterCats = db.prepare('SELECT COUNT(*) as count FROM budget_categories WHERE is_active = 1').get().count;
console.log(`✓ Total categories in master repository: ${totalMasterCats}, active FY categories: ${fyCats.length}`);
if (fyCats.length >= totalMasterCats && totalMasterCats > 1) {
  throw new Error('Filtering failed: all master categories returned instead of only active year categories!');
}

// 5. Test Unique Voucher Sequence Generation across financial years
const year = new Date().getFullYear();
const prefix = `EXP-${year}-`;

function getNextVoucherNo(database) {
  const lastExp = database.prepare(`
    SELECT voucher_no FROM expenses
    WHERE voucher_no LIKE ?
    ORDER BY id DESC
    LIMIT 1
  `).get(`${prefix}%`);

  let nextSeq = 1;
  if (lastExp && lastExp.voucher_no) {
    const parts = lastExp.voucher_no.split('-');
    const num = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(num)) nextSeq = num + 1;
  }
  let voucherNo = `${prefix}${String(nextSeq).padStart(5, '0')}`;
  while (database.prepare('SELECT id FROM expenses WHERE voucher_no = ?').get(voucherNo)) {
    nextSeq++;
    voucherNo = `${prefix}${String(nextSeq).padStart(5, '0')}`;
  }
  return voucherNo;
}

const v1 = getNextVoucherNo(db);
db.prepare(`
  INSERT INTO expenses (voucher_no, expense_date, financial_year_id, category_id, payee, description, amount_cents, payment_method, status)
  VALUES (?, '2026-11-08', ?, ?, 'Vendor A', 'Supplies', 10000, 'cash', 'approved')
`).run(v1, activeFy.id, catId);

const v2 = getNextVoucherNo(db);
db.prepare(`
  INSERT INTO expenses (voucher_no, expense_date, financial_year_id, category_id, payee, description, amount_cents, payment_method, status)
  VALUES (?, '2026-11-08', ?, ?, 'Vendor B', 'Lab Goods', 20000, 'cash', 'approved')
`).run(v2, activeFy.id, catId);

console.log(`✓ Generated collision-free voucher numbers: ${v1}, ${v2}`);
if (v1 === v2) throw new Error('Voucher collision detected!');

// Clean up test db
db.close();
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
console.log('✓ Stage 08 verification completed with 100% success.');

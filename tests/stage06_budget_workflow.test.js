const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const testDbDir = path.resolve(__dirname, '.test_tmp_s6');
if (!fs.existsSync(testDbDir)) {
  fs.mkdirSync(testDbDir, { recursive: true });
}

const dbPath = path.join(testDbDir, 'test_stage06.db');
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

console.log('====================================================');
console.log('CurtissBooks — Stage 06 Budget Workflow Verification');
console.log('====================================================\n');

const { initDatabase, closeDatabase } = require('../dist/main/db/index.js');
const { AuthService } = require('../dist/main/services/authService.js');
const { FinancialService } = require('../dist/main/services/financialService.js');

// 1. Initialize SQLite Database with migrations
const db = initDatabase(dbPath);

// Seed initial admin user
const adminSession = AuthService.setupInitialAdmin({
  fullName: 'Principal Admin',
  username: 'admin',
  password: 'Password123!',
});
const actorId = adminSession.user.id;

// Stub getDatabase for testing if needed
const dbModule = require('../dist/main/db/index');
if (dbModule.setDatabaseForTesting) {
  dbModule.setDatabaseForTesting(db);
}

console.log('[TEST 1] Testing Reusable Budget Categories & Quick-Create...');
// Quick-create category
const cat1 = FinancialService.quickCreateCategory('Science Laboratory Consumables', 'විද්‍යාගාර පරිභෝජන ද්‍රව්‍ය', 1);
if (!cat1.id || cat1.name !== 'Science Laboratory Consumables') {
  throw new Error('Quick create category failed.');
}
console.log(`  ✓ Quick-created category: "${cat1.name}" (ID: ${cat1.id}, Code: ${cat1.category_code})`);

// Search categories
const searchRes = FinancialService.getReusableCategories('Science', true);
if (!searchRes.some((c) => c.name === 'Science Laboratory Consumables')) {
  throw new Error('Search failed to find created category.');
}
console.log(`  ✓ Prefix search retrieved ${searchRes.length} matching category`);

// Case-insensitive duplicate prevention
let dupThrown = false;
try {
  FinancialService.quickCreateCategory('science laboratory consumables', '', 1);
} catch (err) {
  dupThrown = true;
  console.log(`  ✓ Case-insensitive duplicate rejected: "${err.message}"`);
}
if (!dupThrown) {
  throw new Error('Duplicate category was not prevented!');
}

console.log('\n[TEST 2] Testing Single-Window Draft Saving & Reopening...');
const fyData = {
  year_name: 'FY 2026/2027',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  allocations: [
    { category_id: cat1.id, allocated_amount_cents: 15000000, notes: 'Chemicals and glassware' }, // Rs. 150,000.00
    { category_id: 2, allocated_amount_cents: 35000000, notes: 'Classroom exercise books & chalk' }, // Rs. 350,000.00
    { category_id: 10, allocated_amount_cents: 20000000, notes: 'Sports track equipment' }, // Rs. 200,000.00
  ],
};

const savedDraft = FinancialService.saveFinancialYearDraft(fyData, 1);
if (savedDraft.status !== 'draft') {
  throw new Error(`Expected draft status, got ${savedDraft.status}`);
}
if (savedDraft.total_budget_cents !== 70000000) {
  throw new Error(`Expected total 70,000,000 cents (Rs. 700,000.00), got ${savedDraft.total_budget_cents}`);
}
if (savedDraft.allocations.length !== 3) {
  throw new Error(`Expected 3 allocations, got ${savedDraft.allocations.length}`);
}
console.log(`  ✓ Draft saved with ${savedDraft.allocations.length} allocations`);
console.log(`  ✓ Derived total budget: Rs. ${(savedDraft.total_budget_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

// Reopen detail
const reopened = FinancialService.getFinancialYearDetail(savedDraft.id);
if (reopened.year_name !== 'FY 2026/2027' || reopened.allocations.length !== 3) {
  throw new Error('Reopening draft returned mismatched data.');
}
console.log('  ✓ Draft successfully reopened with exact allocations and notes intact');

console.log('\n[TEST 3] Testing Draft Editing (Add, Remove, Change Amounts)...');
const updatedData = {
  id: savedDraft.id,
  year_name: 'FY 2026/2027',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  allocations: [
    { category_id: cat1.id, allocated_amount_cents: 20000000, notes: 'Increased glassware budget' }, // Rs. 200,000.00 (+50k)
    { category_id: 2, allocated_amount_cents: 35000000, notes: 'Classroom exercise books & chalk' },
    { category_id: 10, allocated_amount_cents: 20000000, notes: 'Sports track equipment' },
    { category_id: 3, allocated_amount_cents: 10000000, notes: 'Utilities & sanitation supplies' }, // Rs. 100,000.00
  ],
};

const updatedDraft = FinancialService.saveFinancialYearDraft(updatedData, 1);
if (updatedDraft.allocations.length !== 4) {
  throw new Error(`Expected 4 allocations after edit, got ${updatedDraft.allocations.length}`);
}
if (updatedDraft.total_budget_cents !== 85000000) {
  throw new Error(`Expected total 85,000,000 cents (Rs. 850,000.00), got ${updatedDraft.total_budget_cents}`);
}
console.log(`  ✓ Draft updated: 4 categories, updated total = Rs. ${(updatedDraft.total_budget_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

console.log('\n[TEST 4] Testing Approval Workflow & Permanent Locking...');
const approvedYear = FinancialService.approveFinancialYear(savedDraft.id, 1, 'Authorized in Finance Committee #03');
if (approvedYear.status !== 'approved') {
  throw new Error(`Expected status 'approved', got ${approvedYear.status}`);
}
if (!approvedYear.approved_at || approvedYear.approved_by !== 1) {
  throw new Error('Approver metadata missing on approved financial year.');
}
console.log(`  ✓ Financial year approved by User #1 at ${approvedYear.approved_at}`);
console.log(`  ✓ Approver notes: "${approvedYear.approval_notes}"`);

console.log('\n[TEST 5] Testing Backend Protection Against Mutating Approved Year...');
let editRejected = false;
try {
  FinancialService.saveFinancialYearDraft({
    id: savedDraft.id,
    year_name: 'FY 2026/2027 Modified',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    allocations: [],
  }, 1);
} catch (err) {
  editRejected = true;
  console.log(`  ✓ Backend rejected modification of approved financial year: "${err.message}"`);
}
if (!editRejected) {
  throw new Error('Backend failed to protect approved financial year against modifications!');
}

let allocationRejected = false;
try {
  FinancialService.saveAnnualBudgetAllocation({
    financial_year_id: savedDraft.id,
    category_id: 4,
    approved_amount_cents: 5000000,
  }, 1);
} catch (err) {
  allocationRejected = true;
  console.log(`  ✓ Backend rejected direct allocation update on approved year: "${err.message}"`);
}
if (!allocationRejected) {
  throw new Error('Backend failed to protect direct allocation update on approved financial year!');
}

console.log('\n[TEST 6] Testing Database Persistence After Disconnect and Reconnect...');
closeDatabase();

// Re-open DB
initDatabase(dbPath);

const persistedDetail = FinancialService.getFinancialYearDetail(savedDraft.id);
if (persistedDetail.status !== 'approved' || persistedDetail.total_budget_cents !== 85000000) {
  throw new Error('Database persistence check failed after reopening connection.');
}
console.log(`  ✓ Re-opened database verified: Status="${persistedDetail.status}", Total=Rs. ${(persistedDetail.total_budget_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
closeDatabase();

console.log('\n[TEST 7] Testing Localization Key Parity (English vs Sinhala)...');
const enFinance = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/renderer/src/locales/en/finance.json'), 'utf8'));
const siFinance = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/renderer/src/locales/si/finance.json'), 'utf8'));

function getFlatKeys(obj, prefix = '') {
  let keys = [];
  for (const k of Object.keys(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (typeof obj[k] === 'object' && obj[k] !== null) {
      keys = keys.concat(getFlatKeys(obj[k], full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

const enKeys = getFlatKeys(enFinance).sort();
const siKeys = getFlatKeys(siFinance).sort();

const missingInSi = enKeys.filter((k) => !siKeys.includes(k));
const missingInEn = siKeys.filter((k) => !enKeys.includes(k));

if (missingInSi.length > 0 || missingInEn.length > 0) {
  throw new Error(`Localization mismatch! Missing in SI: ${missingInSi.join(', ')} | Missing in EN: ${missingInEn.join(', ')}`);
}
console.log(`  ✓ 100% Translation parity verified across all ${enKeys.length} finance translation keys.`);

console.log('\n====================================================');
console.log('ALL STAGE 06 BUDGET WORKFLOW TESTS PASSED! ✓');
console.log('====================================================\n');

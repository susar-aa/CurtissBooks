const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

console.log('--- RUNNING STAGE 11 END FINANCIAL YEAR WITH ADMIN AUTH TESTS ---');

const testDbPath = path.join(process.cwd(), 'tests', 'test_stage11.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Apply migrations
const { migration001 } = require('../dist/main/db/migrations/001_initial_settings');
const { migration002 } = require('../dist/main/db/migrations/002_auth_and_rbac');
const { migration003 } = require('../dist/main/db/migrations/003_school_and_students');
const { migration004 } = require('../dist/main/db/migrations/004_db_corrections_and_finalization');
const { migration005 } = require('../dist/main/db/migrations/005_financial_accounting_system');
const { migration006 } = require('../dist/main/db/migrations/006_budget_workflow_refinement');
const { migration007 } = require('../dist/main/db/migrations/007_single_active_fy_and_category_filtering');
const { migration008 } = require('../dist/main/db/migrations/008_funding_system_upgrade');
const { migration009 } = require('../dist/main/db/migrations/009_streamline_funding_inflows');

db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const migrations = [
  migration001, migration002, migration003, migration004,
  migration005, migration006, migration007, migration008, migration009,
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

console.log('✓ All 9 migrations applied cleanly to SQLite WAL DB.');

const { FinancialService } = require('../dist/main/services/financialService');
const { AuthService } = require('../dist/main/services/authService');
const { initDatabase, getDatabase } = require('../dist/main/db/index');
initDatabase(testDbPath);

// 1. Setup Admin Account
const adminSession = AuthService.setupInitialAdmin({
  fullName: 'Principal Administrator',
  username: 'admin',
  password: 'AdminPassword123!',
});
console.log(`✓ Initial admin provisioned: ${adminSession.username} (User ID: ${adminSession.user_id})`);

// 2. Create and Approve a Financial Year
const fy = FinancialService.createFinancialYear({
  year_name: 'FY 2025',
  start_date: '2025-01-01',
  end_date: '2025-12-31',
});

// Add draft allocation & approve
FinancialService.saveFinancialYearDraft({
  id: fy.id,
  year_name: 'FY 2025',
  start_date: '2025-01-01',
  end_date: '2025-12-31',
  allocations: [
    { category_id: 1, allocated_amount_cents: 10000000, notes: 'Operating budget' },
  ],
});

FinancialService.approveFinancialYear(fy.id, 1, 'Audited & Authorized for Year End Simulation');
console.log('✓ Financial Year FY 2025 created and approved.');

// 3. Test: End year without credentials -> MUST FAIL
let failedWithoutCreds = false;
try {
  FinancialService.closeFinancialYear({
    yearId: fy.id,
    adminUsername: '',
    adminPassword: '',
  });
} catch (err) {
  failedWithoutCreds = true;
  console.log(`✓ Prevented closing year without credentials: ${err.message}`);
}
if (!failedWithoutCreds) throw new Error('Closing year without credentials did not fail!');

// 4. Test: End year with wrong password -> MUST FAIL
let failedWrongPassword = false;
try {
  FinancialService.closeFinancialYear({
    yearId: fy.id,
    adminUsername: 'admin',
    adminPassword: 'WrongPassword999',
  });
} catch (err) {
  failedWrongPassword = true;
  console.log(`✓ Prevented closing year with wrong password: ${err.message}`);
}
if (!failedWrongPassword) throw new Error('Closing year with wrong password did not fail!');

// 5. Test: End year with non-admin user -> MUST FAIL
// Insert standard clerk
const { CryptoService } = require('../dist/main/services/cryptoService');
const clerkHash = CryptoService.hashPassword('ClerkPass123!');
getDatabase().prepare(`
  INSERT INTO users (username, full_name, password_hash, role_id, status)
  VALUES ('clerk01', 'Test Clerk', ?, 5, 'active')
`).run(clerkHash);

let failedNonAdmin = false;
try {
  FinancialService.closeFinancialYear({
    yearId: fy.id,
    adminUsername: 'clerk01',
    adminPassword: 'ClerkPass123!',
  });
} catch (err) {
  failedNonAdmin = true;
  console.log(`✓ Prevented closing year with non-admin account: ${err.message}`);
}
if (!failedNonAdmin) throw new Error('Closing year with non-admin did not fail!');

// 6. Test: End year with CORRECT Admin credentials -> MUST SUCCEED
FinancialService.closeFinancialYear({
  yearId: fy.id,
  adminUsername: 'admin',
  adminPassword: 'AdminPassword123!',
});

const closedFy = FinancialService.getFinancialYearDetail(fy.id);
if (closedFy.status !== 'closed') throw new Error(`Expected status closed, got ${closedFy.status}`);
if (closedFy.is_current !== 0 && closedFy.is_current !== false) throw new Error('Expected is_current to be 0/false');
console.log(`✓ Successfully ended financial year "${closedFy.year_name}". Status is now: "${closedFy.status}", is_current: ${closedFy.is_current}`);

// 7. Test: Ending an already closed year -> MUST FAIL
let failedAlreadyClosed = false;
try {
  FinancialService.closeFinancialYear({
    yearId: fy.id,
    adminUsername: 'admin',
    adminPassword: 'AdminPassword123!',
  });
} catch (err) {
  failedAlreadyClosed = true;
  console.log(`✓ Prevented closing an already closed year: ${err.message}`);
}
if (!failedAlreadyClosed) throw new Error('Closing an already closed year did not fail!');

// 8. Test: Posting expense to closed year -> MUST FAIL
let failedExpenseInClosedYear = false;
try {
  FinancialService.createExpense({
    financial_year_id: fy.id,
    category_id: 1,
    expense_date: '2025-12-30',
    payee: 'Supplier Ltd',
    description: 'Post-closure expense attempt',
    amount_cents: 50000,
    payment_method: 'cash',
  });
} catch (err) {
  failedExpenseInClosedYear = true;
  console.log(`✓ Prevented recording expense in closed year: ${err.message}`);
}
if (!failedExpenseInClosedYear) throw new Error('Expense in closed year was not blocked!');

// Clean up test DB
getDatabase().close();
db.close();
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
console.log('--- ALL STAGE 11 TESTS PASSED WITH 100% SUCCESS ---');

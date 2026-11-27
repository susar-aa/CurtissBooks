/**
 * Automated Test Suite: Factory Reset Application & Developer License PIN Verification
 */

const Database = require('better-sqlite3');
const assert = require('assert');

// 1. Create Isolated In-Memory Test Database
const db = new Database(':memory:');
db.pragma('foreign_keys = ON');

// 2. Run all schema migrations
const { runMigrations } = require('../dist/main/db/migrationRunner');
runMigrations(db);

// Point getDatabase to our test db instance
const dbModule = require('../dist/main/db/index');
dbModule.getDatabase = () => db;

const { AuthService } = require('../dist/main/services/authService');
const { SettingsService } = require('../dist/main/services/settingsService');
const { UserService } = require('../dist/main/services/userService');

console.log('================================================================');
console.log('--- RUNNING FACTORY RESET & DEVELOPER PIN TEST SUITE ---');
console.log('================================================================');

// TEST 1: Developer PIN verification
console.log('\n[TEST 1] Testing Developer PIN verification...');
assert.strictEqual(AuthService.verifyDeveloperPin('200611003614'), true);
assert.strictEqual(AuthService.verifyDeveloperPin(' 200611003614 '), true);
assert.strictEqual(AuthService.verifyDeveloperPin('123456789012'), false);
assert.strictEqual(AuthService.verifyDeveloperPin(''), false);
console.log('✓ Developer PIN 200611003614 verified correctly.');

// TEST 2: Initial Setup without Developer PIN must fail
console.log('\n[TEST 2] Verifying setupInitialAdmin rejection without valid Developer PIN...');
assert.throws(() => {
  AuthService.setupInitialAdmin({
    fullName: 'Mr. Principal',
    username: 'admin',
    password: 'AdminPassword@123',
    pin: '12345',
    developerPin: 'wrong_key',
  });
}, /Invalid Developer License PIN/);
console.log('✓ Setup rejected when invalid Developer PIN is provided.');

// TEST 3: Initial Setup with valid Developer PIN succeeds
console.log('\n[TEST 3] Verifying setupInitialAdmin success with Developer PIN 200611003614...');
const adminSession = AuthService.setupInitialAdmin({
  fullName: 'Rev. Dr. Principal',
  username: 'admin',
  password: 'AdminPassword@123',
  pin: '12345',
  developerPin: '200611003614',
});
assert.ok(adminSession.sessionToken);
assert.strictEqual(adminSession.user.username, 'admin');
assert.strictEqual(AuthService.checkSetupRequired(), false);
console.log('✓ Administrator setup initialized with Developer License validation.');

// TEST 4: Seed test transactions and data
console.log('\n[TEST 4] Seeding sample data (bank accounts, cheques, expenses, staff)...');
db.prepare(`
  INSERT OR REPLACE INTO bank_accounts (id, account_code, bank_name, branch_name, account_number, account_type, opening_balance_cents, current_balance_cents, status)
  VALUES (999, 'BA99', 'Bank of Ceylon', 'Kurunegala', '999888777666', 'savings', 5000000, 5000000, 'active')
`).run();

db.prepare(`
  INSERT INTO financial_years (year_name, start_date, end_date, status)
  VALUES ('2026', '2026-01-01', '2026-12-31', 'open')
`).run();

db.prepare(`
  INSERT INTO budget_categories (category_code, name_en, name_si, is_active)
  VALUES ('999', 'Educational Test', 'අධ්‍යාපනික', 1)
`).run();

db.prepare(`
  INSERT INTO expenses (voucher_no, expense_date, financial_year_id, category_id, payee, description, amount_cents, payment_method, status)
  VALUES ('EXP-001', '2026-01-15', 1, 1, 'Vendor Ltd', 'Sample educational expense', 500000, 'cash', 'approved')
`).run();

const clerk = UserService.createUser({
  fullName: 'Sunil Clerk',
  username: 'clerk1',
  password: 'ClerkPassword@123',
  pin: '54321',
  roleId: 5,
}, adminSession.user.id);
assert.strictEqual(clerk.username, 'clerk1');

// Verify data exists
assert.strictEqual(db.prepare('SELECT COUNT(*) as c FROM users').get().c, 2);
assert.strictEqual(db.prepare('SELECT COUNT(*) as c FROM expenses').get().c, 1);
assert.ok(db.prepare('SELECT COUNT(*) as c FROM bank_accounts').get().c > 0);
console.log('✓ Sample records inserted successfully.');

// TEST 5: Factory Reset rejection with invalid PIN
console.log('\n[TEST 5] Testing Factory Reset with wrong PIN...');
assert.throws(() => {
  SettingsService.factoryReset('99999');
}, /Invalid Administrator PIN/);

// Factory Reset rejection with non-admin PIN
assert.throws(() => {
  SettingsService.factoryReset('54321'); // Clerk's PIN
}, /Invalid Administrator PIN/);
console.log('✓ Factory reset successfully rejected for invalid and non-admin PINs.');

// TEST 6: Factory Reset success with Admin PIN '12345'
console.log('\n[TEST 6] Testing Factory Reset with valid Admin PIN 12345...');
const resetResult = SettingsService.factoryReset('12345');
assert.strictEqual(resetResult, true);

// Verify all operational, financial, and user tables are completely cleared
assert.strictEqual(db.prepare('SELECT COUNT(*) as c FROM users').get().c, 0, 'users table must be empty');
assert.strictEqual(db.prepare('SELECT COUNT(*) as c FROM user_sessions').get().c, 0, 'user_sessions table must be empty');
assert.strictEqual(db.prepare('SELECT COUNT(*) as c FROM expenses').get().c, 0, 'expenses table must be empty');
assert.strictEqual(db.prepare('SELECT COUNT(*) as c FROM bank_accounts').get().c, 0, 'bank_accounts table must be empty');
assert.strictEqual(db.prepare('SELECT COUNT(*) as c FROM financial_years').get().c, 0, 'financial_years table must be empty');
assert.strictEqual(db.prepare('SELECT COUNT(*) as c FROM budget_categories').get().c, 0, 'budget_categories table must be empty');

// Verify checkSetupRequired() is now true
assert.strictEqual(AuthService.checkSetupRequired(), true, 'checkSetupRequired must be true after factory reset');
console.log('✓ Factory reset successfully wiped all database records and reset setup requirement.');

// TEST 7: Attempting setup after factory reset still enforces Developer PIN
console.log('\n[TEST 7] Verifying that re-provisioning after factory reset requires Developer PIN...');
assert.throws(() => {
  AuthService.setupInitialAdmin({
    fullName: 'New Admin',
    username: 'newadmin',
    password: 'NewAdmin@123',
    pin: '11111',
    developerPin: 'invalid_license',
  });
}, /Invalid Developer License PIN/);

const newAdmin = AuthService.setupInitialAdmin({
  fullName: 'New Admin',
  username: 'newadmin',
  password: 'NewAdmin@123',
  pin: '11111',
  developerPin: '200611003614',
});
assert.strictEqual(newAdmin.user.username, 'newadmin');
console.log('✓ Fresh system successfully re-provisioned with Developer License validation.');

console.log('\n================================================================');
console.log('>>> ALL FACTORY RESET & DEVELOPER PIN TESTS PASSED! <<<');
console.log('================================================================\n');

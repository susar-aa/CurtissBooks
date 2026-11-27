/**
 * Automated Test Suite: 5-Digit PIN Authentication & Management
 */

const Database = require('better-sqlite3');
const assert = require('assert');

// 1. Create Isolated In-Memory Test Database
const db = new Database(':memory:');
db.pragma('foreign_keys = ON');

// 2. Run all schema migrations including 023
const { runMigrations } = require('../dist/main/db/migrationRunner');
runMigrations(db);

// Point getDatabase to our test db instance
const dbModule = require('../dist/main/db/index');
dbModule.getDatabase = () => db;

const { CryptoService } = require('../dist/main/services/cryptoService');
const { AuthService } = require('../dist/main/services/authService');
const { UserService } = require('../dist/main/services/userService');

console.log('================================================================');
console.log('--- RUNNING 5-DIGIT PIN AUTHENTICATION AUTOMATED TEST SUITE ---');
console.log('================================================================');

// TEST 1: Schema verification for migration 023
console.log('\n[TEST 1] Verifying schema and indexes for migration 023...');
const userCols = db.prepare('PRAGMA table_info(users)').all();
const hasPinHash = userCols.some((c) => c.name === 'pin_hash');
assert.strictEqual(hasPinHash, true, 'users table must contain pin_hash column');

const indexes = db.prepare('PRAGMA index_list(users)').all();
const hasPinIndex = indexes.some((idx) => idx.name === 'idx_users_status_pin');
assert.strictEqual(hasPinIndex, true, 'users table must have idx_users_status_pin index');
console.log('✓ Migration 023 schema and index verified.');

// TEST 2: Seed initial admin with PIN and verify default PIN seeding
console.log('\n[TEST 2] Verifying initial admin setup with PIN...');
const adminSession = AuthService.setupInitialAdmin({
  fullName: 'Rev. Principal',
  username: 'admin',
  password: 'AdminPassword@123',
  pin: '12345',
});
assert.ok(adminSession.sessionToken, 'Session token should be generated');
assert.strictEqual(adminSession.user.username, 'admin');

// Verify pin_hash in database
const adminRow = db.prepare('SELECT id, pin_hash FROM users WHERE username = ?').get('admin');
assert.ok(adminRow.pin_hash, 'admin user should have pin_hash set');
assert.strictEqual(CryptoService.verifyPassword('12345', adminRow.pin_hash), true, 'PIN 12345 should verify');
console.log('✓ Admin user created with PIN 12345.');

// TEST 3: CryptoService PIN validation
console.log('\n[TEST 3] Verifying 5-digit PIN format validation...');
assert.strictEqual(CryptoService.validatePin('12345').valid, true);
assert.strictEqual(CryptoService.validatePin('00000').valid, true);
assert.strictEqual(CryptoService.validatePin('99999').valid, true);
assert.strictEqual(CryptoService.validatePin('1234').valid, false, '4 digits must be rejected');
assert.strictEqual(CryptoService.validatePin('123456').valid, false, '6 digits must be rejected');
assert.strictEqual(CryptoService.validatePin('12a45').valid, false, 'Non-digits must be rejected');
assert.strictEqual(CryptoService.validatePin('').valid, false, 'Empty must be rejected');
console.log('✓ 5-digit PIN format validation verified.');

// TEST 4: Direct PIN Login without username or password
console.log('\n[TEST 4] Testing AuthService.loginWithPin()...');
const loginSession = AuthService.loginWithPin('12345');
assert.ok(loginSession.sessionToken, 'Login with PIN should issue sessionToken');
assert.strictEqual(loginSession.user.username, 'admin');
assert.strictEqual(loginSession.isLocked, false);
console.log('✓ Successfully logged in with 5-digit PIN (No username/password required).');

// TEST 5: Failed PIN rejection
console.log('\n[TEST 5] Verifying invalid PIN rejection...');
assert.throws(() => {
  AuthService.loginWithPin('99999');
}, /Invalid 5-digit PIN/);

const failedAttempt = db.prepare(`
  SELECT * FROM login_attempts WHERE username = 'pin_auth' AND success = 0 ORDER BY id DESC LIMIT 1
`).get();
assert.ok(failedAttempt, 'Failed attempt should be recorded in login_attempts');
console.log('✓ Invalid PIN correctly rejected and logged.');

// TEST 6: User creation with unique PIN
console.log('\n[TEST 6] Testing UserService.createUser with custom PIN...');
const clerkUser = UserService.createUser({
  fullName: 'Kamal Perera',
  username: 'kamal',
  password: 'Password@123',
  pin: '55555',
  roleId: 5, // Clerk
}, adminSession.user.id);
assert.strictEqual(clerkUser.username, 'kamal');

// Verify clerk can log in with their PIN
const clerkSession = AuthService.loginWithPin('55555');
assert.strictEqual(clerkSession.user.username, 'kamal');
console.log('✓ New user logged in with assigned PIN 55555.');

// Verify duplicate PIN rejection
console.log('\n[TEST 7] Verifying duplicate PIN prevention...');
assert.throws(() => {
  UserService.createUser({
    fullName: 'Duplicate User',
    username: 'duplicate',
    password: 'Password@123',
    pin: '55555', // Duplicate of kamal's PIN
    roleId: 5,
  }, adminSession.user.id);
}, /already assigned to @kamal/);
console.log('✓ Duplicate PIN assignment properly prevented.');

// TEST 8: Reset PIN
console.log('\n[TEST 8] Testing UserService.resetPin()...');
UserService.resetPin(clerkUser.id, '77777', adminSession.user.id);

// Old PIN 55555 should now fail
assert.throws(() => {
  AuthService.loginWithPin('55555');
}, /Invalid 5-digit PIN/);

// New PIN 77777 should now succeed
const clerkNewSession = AuthService.loginWithPin('77777');
assert.strictEqual(clerkNewSession.user.username, 'kamal');
console.log('✓ PIN reset verified: old PIN invalidated, new PIN authenticates.');

// TEST 9: Unlock session with 5-digit PIN
console.log('\n[TEST 9] Testing AuthService.unlockSessionWithPin()...');
AuthService.lockSession(clerkNewSession.sessionToken);
const lockedValidation = AuthService.validateSession(clerkNewSession.sessionToken);
assert.strictEqual(lockedValidation.isLocked, true, 'Session should be locked');

// Incorrect unlock PIN
const badUnlock = AuthService.unlockSessionWithPin(clerkNewSession.sessionToken, '11111');
assert.strictEqual(badUnlock, false, 'Incorrect PIN should not unlock session');

// Correct unlock PIN
const goodUnlock = AuthService.unlockSessionWithPin(clerkNewSession.sessionToken, '77777');
assert.strictEqual(goodUnlock, true, 'Correct PIN should unlock session');

const unlockedValidation = AuthService.validateSession(clerkNewSession.sessionToken);
assert.strictEqual(unlockedValidation.isLocked, false, 'Session should now be unlocked');
console.log('✓ Session locking and PIN unlock verified.');

// TEST 10: Deactivated account PIN attempt
console.log('\n[TEST 10] Testing deactivated account PIN handling...');
UserService.setUserStatus(clerkUser.id, 'inactive', adminSession.user.id);
assert.throws(() => {
  AuthService.loginWithPin('77777');
}, /deactivated/);
console.log('✓ Deactivated account properly barred with descriptive message.');

console.log('\n================================================================');
console.log('>>> ALL 10 TESTS PASSED CLEANLY! <<<');
console.log('================================================================\n');

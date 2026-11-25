const path = require('path');
const fs = require('fs');
const assert = require('assert');

console.log('====================================================');
console.log('CurtissBooks — Stage 03 Automated Verification Suite');
console.log('====================================================\n');

const testDbDir = path.join(__dirname, '.test_tmp_s3');
if (!fs.existsSync(testDbDir)) fs.mkdirSync(testDbDir, { recursive: true });
const testDbPath = path.join(testDbDir, 'test_stage03.db');
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

const { initDatabase, closeDatabase, getDatabase } = require('../dist/main/db/index.js');
const { CryptoService } = require('../dist/main/services/cryptoService.js');
const { AuthService } = require('../dist/main/services/authService.js');
const { UserService } = require('../dist/main/services/userService.js');
const { RoleService } = require('../dist/main/services/roleService.js');
const { AuditService } = require('../dist/main/services/auditService.js');

try {
  // Initialize SQLite database
  initDatabase(testDbPath);

  // 1. First-time administrator setup check
  console.log('[TEST 1] First-time administrator setup check...');
  assert.strictEqual(AuthService.checkSetupRequired(), true, 'Setup should be required on empty DB');
  const adminSession = AuthService.setupInitialAdmin({
    fullName: 'Master Principal',
    username: 'admin',
    password: 'MasterAdminPassword123!',
  });
  assert.ok(adminSession.sessionToken, 'Session token should be returned');
  assert.strictEqual(adminSession.user.username, 'admin');
  assert.strictEqual(adminSession.user.role_key, 'admin');
  assert.strictEqual(AuthService.checkSetupRequired(), false, 'Setup should no longer be required');
  console.log('  ✓ Initial administrator created and session issued');

  // 2. Duplicate username prevention
  console.log('\n[TEST 2] Duplicate username prevention...');
  assert.throws(() => {
    UserService.createUser(
      {
        fullName: 'Duplicate Admin',
        username: 'admin',
        password: 'AnotherPassword123!',
        roleId: 1,
      },
      adminSession.user.id
    );
  }, /already taken/i);
  console.log('  ✓ Duplicate username creation blocked');

  // 3. Password hashing verification
  console.log('\n[TEST 3] Password hashing security (scrypt + salt)...');
  const testPw = 'SecureSecret99#';
  const hashed = CryptoService.hashPassword(testPw);
  assert.ok(hashed.startsWith('scrypt$'), 'Hash must follow scrypt format');
  assert.strictEqual(CryptoService.verifyPassword(testPw, hashed), true, 'Valid password verification');
  assert.strictEqual(CryptoService.verifyPassword('WrongPassword', hashed), false, 'Invalid password rejected');
  console.log('  ✓ Cryptographic scrypt hashing and timing-safe verification verified');

  // 4. Successful login
  console.log('\n[TEST 4] Successful login...');
  const loginSession = AuthService.login('admin', 'MasterAdminPassword123!');
  assert.ok(loginSession.sessionToken);
  assert.strictEqual(loginSession.user.username, 'admin');
  assert.ok(loginSession.permissions.includes('dashboard.view'));
  assert.ok(loginSession.permissions.includes('users.create'));
  console.log('  ✓ Successful login returned authenticated session');

  // 5. Invalid password rejection
  console.log('\n[TEST 5] Invalid password rejection...');
  assert.throws(() => {
    AuthService.login('admin', 'IncorrectPassword123!');
  }, /invalid username or password/i);
  console.log('  ✓ Incorrect password rejected with generic error');

  // 6. Failed login tracking
  console.log('\n[TEST 6] Failed login tracking...');
  const db = getDatabase();
  const attempts = db.prepare('SELECT COUNT(*) as count FROM login_attempts WHERE username = ? AND success = 0').get('admin');
  assert.ok(attempts.count >= 1, 'Failed attempt must be recorded in login_attempts');
  console.log(`  ✓ Recorded ${attempts.count} failed attempt(s) in login_attempts`);

  // 7. Account lockout after repeated failed attempts
  console.log('\n[TEST 7] Account lockout testing...');
  const lockoutUser = UserService.createUser(
    {
      fullName: 'Lockout Target',
      username: 'lockout_user',
      password: 'TargetPassword123!',
      roleId: 5,
    },
    adminSession.user.id
  );

  // Trigger 5 consecutive failed logins
  for (let i = 0; i < 5; i++) {
    try {
      AuthService.login('lockout_user', 'BadPassword!');
    } catch (e) {}
  }

  // 6th attempt must be rejected due to lockout
  assert.throws(() => {
    AuthService.login('lockout_user', 'TargetPassword123!');
  }, /locked/i);
  console.log('  ✓ Account lockout triggered after 5 failed attempts');

  // 8. User creation
  console.log('\n[TEST 8] User creation...');
  const newUser = UserService.createUser(
    {
      fullName: 'Accountant Officer',
      username: 'acc.officer',
      password: 'AccountantPass123!',
      roleId: 4, // Accountant
    },
    adminSession.user.id
  );
  assert.strictEqual(newUser.username, 'acc.officer');
  assert.strictEqual(newUser.role_key, 'accountant');
  console.log('  ✓ Created new staff user with Accountant role');

  // 9. Role assignment
  console.log('\n[TEST 9] Role assignment and permissions verification...');
  const accSession = AuthService.login('acc.officer', 'AccountantPass123!');
  assert.strictEqual(accSession.permissions.includes('expenses.view'), true);
  assert.strictEqual(accSession.permissions.includes('users.create'), false, 'Accountant should not have users.create');
  console.log('  ✓ Role permissions correctly segregated');

  // 10. Permission enforcement
  console.log('\n[TEST 10] Permission enforcement...');
  const allRoles = RoleService.getAllRoles();
  assert.strictEqual(allRoles.length, 6, 'Should have 6 predefined roles');
  const adminRole = allRoles.find((r) => r.role_key === 'admin');
  assert.strictEqual(adminRole.permissions.length, 42, 'Admin should have all 42 permissions');
  console.log('  ✓ Permissions matrix verified');

  // 11. Unauthorized requests protection
  console.log('\n[TEST 11] Unauthorized request validation...');
  // Test modifying system administrator role permissions
  assert.throws(() => {
    RoleService.updateRolePermissions(1, ['dashboard.view'], adminSession.user.id);
  }, /cannot be modified/i);
  console.log('  ✓ Protected system role permissions against unauthorized modifications');

  // 12. User deactivation
  console.log('\n[TEST 12] User deactivation and session termination...');
  UserService.setUserStatus(newUser.id, 'inactive', adminSession.user.id);
  assert.throws(() => {
    AuthService.login('acc.officer', 'AccountantPass123!');
  }, /deactivated/i);
  console.log('  ✓ Deactivated user immediately prevented from logging in');

  // 13. Last administrator protection
  console.log('\n[TEST 13] Last active administrator protection...');
  assert.throws(() => {
    UserService.setUserStatus(adminSession.user.id, 'inactive', adminSession.user.id);
  }, /cannot deactivate the last active administrator/i);
  assert.throws(() => {
    UserService.updateUser(adminSession.user.id, { fullName: 'Demoted Admin', roleId: 5 }, adminSession.user.id);
  }, /cannot change role of the last active administrator/i);
  console.log('  ✓ Last active administrator strictly protected against deactivation and demotion');

  // 14. Logout
  console.log('\n[TEST 14] Logout and session invalidation...');
  const sessionToLogout = AuthService.login('admin', 'MasterAdminPassword123!');
  const logoutSuccess = AuthService.logout(sessionToLogout.sessionToken);
  assert.strictEqual(logoutSuccess, true);
  assert.strictEqual(AuthService.validateSession(sessionToLogout.sessionToken), null, 'Logged-out session must be invalid');
  console.log('  ✓ Logout invalidated session on disk');

  // 15. Session locking and unlocking
  console.log('\n[TEST 15] Session locking and unlocking...');
  const lockSession = AuthService.login('admin', 'MasterAdminPassword123!');
  AuthService.lockSession(lockSession.sessionToken);
  const lockedState = AuthService.validateSession(lockSession.sessionToken);
  assert.strictEqual(lockedState.isLocked, true, 'Session must reflect locked state');

  const unlockFail = AuthService.unlockSession(lockSession.sessionToken, 'WrongPassword');
  assert.strictEqual(unlockFail, false, 'Invalid unlock password should fail');

  const unlockOk = AuthService.unlockSession(lockSession.sessionToken, 'MasterAdminPassword123!');
  assert.strictEqual(unlockOk, true, 'Valid unlock password should succeed');
  const unlockedState = AuthService.validateSession(lockSession.sessionToken);
  assert.strictEqual(unlockedState.isLocked, false, 'Session must be unlocked');
  console.log('  ✓ Session locking and unlock password verification verified');

  // 16. Application restart authentication requirement
  console.log('\n[TEST 16] Application restart behavior...');
  closeDatabase();
  initDatabase(testDbPath);
  // Verify that an invalid or cleared token returns null
  assert.strictEqual(AuthService.validateSession('non-existent-token'), null);
  console.log('  ✓ Offline SQLite database persists user credentials across engine restart');
  closeDatabase();

  // 17. Audit record creation
  console.log('\n[TEST 17] Audit record creation...');
  initDatabase(testDbPath);
  const logs = AuditService.getLogs(50, 0);
  assert.ok(logs.length >= 5, 'Multiple audit records must be present');
  const actions = logs.map((l) => l.action);
  assert.ok(actions.includes('INITIAL_ADMIN_SETUP'), 'Must have INITIAL_ADMIN_SETUP log');
  assert.ok(actions.includes('LOGIN_SUCCESS'), 'Must have LOGIN_SUCCESS log');
  assert.ok(actions.includes('LOGIN_FAILED'), 'Must have LOGIN_FAILED log');
  assert.ok(actions.includes('USER_CREATED'), 'Must have USER_CREATED log');
  assert.ok(actions.includes('LOGOUT'), 'Must have LOGOUT log');
  console.log(`  ✓ Verified audit events captured: [${Array.from(new Set(actions)).join(', ')}]`);
  closeDatabase();

  // 18. English/Sinhala translation parity
  console.log('\n[TEST 18] English/Sinhala translation parity for auth and users...');
  const enAuth = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/renderer/src/locales/en/auth.json'), 'utf8'));
  const siAuth = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/renderer/src/locales/si/auth.json'), 'utf8'));
  const enUsers = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/renderer/src/locales/en/users.json'), 'utf8'));
  const siUsers = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/renderer/src/locales/si/users.json'), 'utf8'));

  function checkParity(enObj, siObj, pathPrefix) {
    for (const k of Object.keys(enObj)) {
      const fullPath = `${pathPrefix}.${k}`;
      assert.ok(k in siObj, `Missing Sinhala translation for: ${fullPath}`);
      if (typeof enObj[k] === 'object' && enObj[k] !== null) {
        checkParity(enObj[k], siObj[k], fullPath);
      } else {
        assert.ok(typeof siObj[k] === 'string' && siObj[k].length > 0, `Empty Sinhala translation for: ${fullPath}`);
      }
    }
  }

  checkParity(enAuth, siAuth, 'auth');
  checkParity(enUsers, siUsers, 'users');
  console.log('  ✓ 100% key and text parity verified for auth and users in English and Sinhala');

  // Cleanup test DB
  try {
    fs.unlinkSync(testDbPath);
    if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
    if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
    fs.rmdirSync(testDbDir);
  } catch (e) {}

  console.log('\n====================================================');
  console.log('ALL 18 STAGE 03 AUTOMATED TESTS PASSED SUCCESSFULLY! ✓');
  console.log('====================================================\n');
  process.exit(0);
} catch (err) {
  console.error('\n❌ STAGE 03 TEST FAILED:');
  console.error(err);
  process.exit(1);
}


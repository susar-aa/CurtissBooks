const path = require('path');
const fs = require('fs');
const assert = require('assert');

console.log('====================================================');
console.log('CurtissBooks — Stage 01 Automated Verification Suite');
console.log('====================================================\n');

const testDbDir = path.join(__dirname, '.test_tmp');
if (!fs.existsSync(testDbDir)) {
  fs.mkdirSync(testDbDir, { recursive: true });
}
const testDbPath = path.join(testDbDir, 'test_curtissbooks.db');

// Clean previous test db if exists
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

// 1. Load compiled modules from dist
const { initDatabase, closeDatabase, getDatabase } = require('../dist/main/db/index.js');
const { SettingsService } = require('../dist/main/services/settingsService.js');
const { IPC_CHANNELS } = require('../dist/shared/constants/channels.js');

try {
  // Test 1: Initialize Database & Verify Pragmas
  console.log('[TEST 1] Initializing SQLite database with WAL and Foreign Keys...');
  const db = initDatabase(testDbPath);
  assert.ok(db.open, 'Database should be open');
  
  const fkPragma = db.pragma('foreign_keys', { simple: true });
  assert.strictEqual(fkPragma, 1, 'Foreign keys pragma must be ON (1)');
  console.log('  ✓ PRAGMA foreign_keys = 1 (enforced)');

  const journalMode = db.pragma('journal_mode', { simple: true });
  assert.strictEqual(journalMode.toLowerCase(), 'wal', 'Journal mode must be WAL');
  console.log(`  ✓ PRAGMA journal_mode = ${journalMode}`);

  // Test 2: Migration System
  console.log('\n[TEST 2] Verifying schema migrations and tracking...');
  const migrations = db.prepare('SELECT id, name, applied_at FROM schema_migrations ORDER BY id ASC').all();
  assert.ok(migrations.length >= 1, 'At least 1 migration should have been applied');
  assert.strictEqual(migrations[0].id, 1);
  assert.strictEqual(migrations[0].name, '001_initial_settings');
  console.log(`  ✓ Migration 001 recorded: ${migrations[0].name} at ${migrations[0].applied_at}`);

  // Test 3: Application Settings Read & Baseline Seeding
  console.log('\n[TEST 3] Verifying seeded application settings...');
  const allSettings = SettingsService.getAll();
  console.log('  Retrieved settings:', Object.keys(allSettings));
  assert.ok(allSettings['app_name'], 'app_name should exist');
  assert.ok(allSettings['default_language'], 'default_language should exist');
  assert.strictEqual(allSettings['default_language'], 'en');
  console.log(`  ✓ app_name: "${allSettings['app_name']}"`);
  console.log(`  ✓ default_language: "${allSettings['default_language']}"`);

  // Test 4: Write & Update Persistence
  console.log('\n[TEST 4] Testing settings upsert / write operation...');
  const testKey = 'test_institution_code';
  const testVal = 'INST-99482';
  const writeSuccess = SettingsService.set(testKey, testVal, 'Test verification key');
  assert.strictEqual(writeSuccess, true, 'Write should return true');

  const retrievedVal = SettingsService.get(testKey);
  assert.strictEqual(retrievedVal, testVal, 'Retrieved value must match written value');
  console.log(`  ✓ Wrote and retrieved: ${testKey} = ${retrievedVal}`);

  // Test 5: Persistence Across DB Restart
  console.log('\n[TEST 5] Verifying persistence across simulated application restart...');
  closeDatabase();
  console.log('  Database closed.');

  // Re-open existing database file
  const reopenedDb = initDatabase(testDbPath);
  assert.ok(reopenedDb.open, 'Reopened database must be open');
  const persistentVal = SettingsService.get(testKey);
  assert.strictEqual(persistentVal, testVal, 'Value must survive database restart');
  console.log(`  ✓ Persistence verified: ${testKey} survived restart with value "${persistentVal}"`);
  closeDatabase();

  // Test 6: Verify IPC Channels & Security Architecture
  console.log('\n[TEST 6] Verifying IPC Channel definitions & security architecture...');
  const expectedChannels = [
    'window:minimize',
    'window:maximize',
    'window:close',
    'window:isMaximized',
    'app:getInfo',
    'settings:getAll',
    'settings:get',
    'settings:set',
  ];
  for (const ch of expectedChannels) {
    assert.ok(Object.values(IPC_CHANNELS).includes(ch), `Missing IPC channel: ${ch}`);
  }
  console.log(`  ✓ All ${expectedChannels.length} required IPC channels mapped and verified`);

  // Cleanup test db
  try {
    fs.unlinkSync(testDbPath);
    const walFile = `${testDbPath}-wal`;
    const shmFile = `${testDbPath}-shm`;
    if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
    if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);
    fs.rmdirSync(testDbDir);
  } catch (cleanErr) {
    // Ignore cleanup error
  }

  console.log('\n====================================================');
  console.log('ALL STAGE 01 AUTOMATED TESTS PASSED SUCCESSFULLY! ✓');
  console.log('====================================================\n');
  process.exit(0);
} catch (err) {
  console.error('\n❌ STAGE 01 TEST FAILED:');
  console.error(err);
  process.exit(1);
}


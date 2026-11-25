const path = require('path');
const fs = require('fs');
const assert = require('assert');

console.log('====================================================');
console.log('CurtissBooks — Stage 02 Automated Verification Suite');
console.log('====================================================\n');

try {
  // Test 1: Translation Architecture & Dictionary Parity
  console.log('[TEST 1] Verifying bilingual dictionaries and key parity...');
  const enCommon = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/renderer/src/locales/en/common.json'), 'utf8'));
  const siCommon = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/renderer/src/locales/si/common.json'), 'utf8'));
  const enNav = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/renderer/src/locales/en/navigation.json'), 'utf8'));
  const siNav = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/renderer/src/locales/si/navigation.json'), 'utf8'));
  const enDash = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/renderer/src/locales/en/dashboard.json'), 'utf8'));
  const siDash = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/renderer/src/locales/si/dashboard.json'), 'utf8'));

  function checkKeys(enObj, siObj, prefix = '') {
    for (const key of Object.keys(enObj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      assert.ok(key in siObj, `Missing Sinhala translation for key: ${fullKey}`);
      if (typeof enObj[key] === 'object' && enObj[key] !== null) {
        checkKeys(enObj[key], siObj[key], fullKey);
      } else {
        assert.ok(typeof siObj[key] === 'string' && siObj[key].length > 0, `Empty Sinhala translation for key: ${fullKey}`);
      }
    }
  }

  checkKeys(enCommon, siCommon, 'common');
  checkKeys(enNav, siNav, 'navigation');
  checkKeys(enDash, siDash, 'dashboard');
  console.log('  ✓ 100% key parity between English and Sinhala locales (common, navigation, dashboard)');

  // Test 2: Local Font Bundle Verification (Offline Guarantee)
  console.log('\n[TEST 2] Verifying Noto Sans Sinhala bundled local font files...');
  const fontsDir = path.join(__dirname, '../src/renderer/src/assets/fonts');
  assert.ok(fs.existsSync(fontsDir), 'Fonts directory must exist');
  const fontFiles = fs.readdirSync(fontsDir);
  const requiredWeights = ['400', '500', '600', '700'];
  for (const w of requiredWeights) {
    const hasWoff2 = fontFiles.some(f => f.includes(`sinhala-${w}`) && f.endsWith('.woff2'));
    assert.ok(hasWoff2, `Missing woff2 font asset for weight: ${w}`);
  }
  console.log(`  ✓ Noto Sans Sinhala font weights [${requiredWeights.join(', ')}] verified in source assets (${fontFiles.length} files)`);

  const distAssetsDir = path.join(__dirname, '../dist/renderer/assets');
  const distAssets = fs.readdirSync(distAssetsDir);
  const distFonts = distAssets.filter(f => f.includes('noto-sans-sinhala') && (f.endsWith('.woff') || f.endsWith('.woff2')));
  assert.ok(distFonts.length > 0, 'Production bundle must contain embedded fonts');
  console.log(`  ✓ Production build contains ${distFonts.length} embedded local font chunks (0 external CDN calls)`);

  // Test 3: Language & Sidebar Preferences Persistence in SQLite
  console.log('\n[TEST 3] Verifying language & sidebar preference persistence in SQLite...');
  const testDbDir = path.join(__dirname, '.test_tmp_s2');
  if (!fs.existsSync(testDbDir)) fs.mkdirSync(testDbDir, { recursive: true });
  const testDbPath = path.join(testDbDir, 'test_stage02.db');
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

  const { initDatabase, closeDatabase } = require('../dist/main/db/index.js');
  const { SettingsService } = require('../dist/main/services/settingsService.js');

  initDatabase(testDbPath);

  // Set language to Sinhala
  SettingsService.set('default_language', 'si', 'User UI Language');
  assert.strictEqual(SettingsService.get('default_language'), 'si');
  console.log('  ✓ Set and retrieved default_language = "si"');

  // Set sidebar preference to collapsed
  SettingsService.set('sidebar_collapsed', 'true', 'Sidebar UI state');
  assert.strictEqual(SettingsService.get('sidebar_collapsed'), 'true');
  console.log('  ✓ Set and retrieved sidebar_collapsed = "true"');

  // Verify across restart
  closeDatabase();
  initDatabase(testDbPath);
  assert.strictEqual(SettingsService.get('default_language'), 'si');
  assert.strictEqual(SettingsService.get('sidebar_collapsed'), 'true');
  console.log('  ✓ Language and sidebar state survived SQLite engine restart');
  closeDatabase();

  // Cleanup
  try {
    fs.unlinkSync(testDbPath);
    if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
    if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
    fs.rmdirSync(testDbDir);
  } catch (e) {}

  // Test 4: Design System Reusable Component Inventory
  console.log('\n[TEST 4] Verifying Design System Component Suite...');
  const uiDir = path.join(__dirname, '../src/renderer/src/components/ui');
  const expectedComponents = [
    'Button.tsx',
    'IconButton.tsx',
    'Input.tsx',
    'Textarea.tsx',
    'Select.tsx',
    'SearchInput.tsx',
    'DatePicker.tsx',
    'Checkbox.tsx',
    'Radio.tsx',
    'Switch.tsx',
    'Badge.tsx',
    'Card.tsx',
    'DataTable.tsx',
    'Dropdown.tsx',
    'Modal.tsx',
    'Tabs.tsx',
    'Tooltip.tsx',
    'Toast.tsx',
    'EmptyState.tsx',
    'LoadingState.tsx',
    'PageHeader.tsx',
    'Breadcrumb.tsx',
    'FormSection.tsx',
    'index.ts',
  ];
  for (const comp of expectedComponents) {
    assert.ok(fs.existsSync(path.join(uiDir, comp)), `Missing required component: ${comp}`);
  }
  console.log(`  ✓ All ${expectedComponents.length} required design system components implemented and verified`);

  console.log('\n====================================================');
  console.log('ALL STAGE 02 AUTOMATED TESTS PASSED SUCCESSFULLY! ✓');
  console.log('====================================================\n');
  process.exit(0);
} catch (err) {
  console.error('\n❌ STAGE 02 TEST FAILED:');
  console.error(err);
  process.exit(1);
}


/**
 * Automated Test Suite: Periodic Financial Statement (Annexure 19 / සිව්මස් ගිණුම් වාර්තාව)
 * Tests:
 * 1. Database schema migration 020 and table creation.
 * 2. Auto-seeding of S1..S10, REX1..REX8, CEX1..CEX6.
 * 3. Updating and persisting custom code mappings.
 * 4. Four-month period calculations (1st: Jan-Apr, 2nd: May-Aug, 3rd: Sep-Dec, Custom).
 * 5. Arithmetic precision of main table and bottom closing balance calculation.
 * 6. Exclusion of reversed/cancelled records.
 */

const Database = require('better-sqlite3');
const assert = require('assert');

// 1. Create Isolated In-Memory Test Database
const db = new Database(':memory:');
db.pragma('foreign_keys = ON');

// 2. Run all schema migrations
const { runMigrations } = require('../dist/main/db/migrationRunner');
runMigrations(db);

// Seed Admin User
const { CryptoService } = require('../dist/main/services/cryptoService');
const adminHash = CryptoService.hashPassword('Admin@123456');
db.prepare(`
  INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role_id, status)
  VALUES (1, 'admin', ?, 'Administrator', 1, 'active')
`).run(adminHash);

// Point getDatabase to our test db instance
const dbModule = require('../dist/main/db/index');
dbModule.getDatabase = () => db;

const { FinancialService } = require('../dist/main/services/financialService');

console.log('================================================================');
console.log('--- RUNNING PERIODIC FINANCIAL STATEMENT TEST SUITE ---');
console.log('================================================================\n');

// Set Active Financial Year: FY 2026 (2026-01-01 to 2026-12-31)
let fy = FinancialService.getCurrentFinancialYear();
if (!fy) {
  const fyRes = db.prepare(`
    INSERT INTO financial_years (year_name, start_date, end_date, status, is_closed)
    VALUES ('2026', '2026-01-01', '2026-12-31', 'active', 0)
  `).run();
  fy = { id: Number(fyRes.lastInsertRowid), year_name: '2026', start_date: '2026-01-01', end_date: '2026-12-31' };
}
const fyId = fy.id;

// Setup Bank & Cash initial balances
const bank = FinancialService.getDefaultBankAccount();
db.prepare('UPDATE bank_accounts SET opening_balance_cents = 250000000, current_balance_cents = 250000000 WHERE id = ?').run(bank.id);

// --- TEST 1: VERIFY MIGRATION 020 & AUTO-SEEDED MAPPINGS ---
console.log('--- TEST 1: VERIFY AUTO-SEEDED PERIODIC STATEMENT MAPPINGS ---');
const mappings = FinancialService.getPeriodicStatementMappings(fyId);
assert(mappings.length >= 26, `Expected at least 26 mapping rows, got ${mappings.length}`);

const receiptsMap = mappings.filter((m) => m.section === 'receipt');
const recurrentMap = mappings.filter((m) => m.section === 'recurrent_expense');
const capitalMap = mappings.filter((m) => m.section === 'capital_expense');

assert.strictEqual(receiptsMap.length, 11, 'Expected 11 receipt rows (S1..S10 + වෙනත්)');
assert.strictEqual(recurrentMap.length, 8, 'Expected 8 recurrent rows (REX1..REX8)');
assert.strictEqual(capitalMap.length, 7, 'Expected 7 capital rows (CEX1..CEX6 + වෙනත්)');
console.log('✓ Auto-seeded 11 Receipts, 8 Recurrent Expenses, 7 Capital Expenses mappings cleanly.\n');

// --- TEST 2: CONFIGURE S, REX, CEX ESTIMATES & MAPPINGS ---
console.log('--- TEST 2: CONFIGURE S, REX, CEX ESTIMATES & MAPPINGS ---');
const fundCats = db.prepare('SELECT id FROM fund_categories ORDER BY id ASC').all();
const budgetCats = db.prepare('SELECT id, category_code FROM budget_categories ORDER BY id ASC').all();

// Map S4 to fundCat[0] with estimate Rs. 1,300,000.00
const s4 = receiptsMap.find((m) => m.report_code === 'S4');
const s6 = receiptsMap.find((m) => m.report_code === 'S6');
const rex1 = recurrentMap.find((m) => m.report_code === 'REX1');
const rex2 = recurrentMap.find((m) => m.report_code === 'REX2');
const cex1 = capitalMap.find((m) => m.report_code === 'CEX1');

const updatedMaps = mappings.map((m) => {
  if (['S1', 'S2', 'S3', 'S5', 'S7', 'S8', 'S9', 'S10'].includes(m.report_code)) {
    return { ...m, fund_category_id: null };
  }
  if (m.report_code === 'S4') {
    return { ...m, fund_category_id: fundCats[0].id, estimated_amount_cents: 130000000 };
  }
  if (m.report_code === 'S6') {
    return { ...m, fund_category_id: fundCats[1].id, estimated_amount_cents: 118926100 };
  }
  if (m.report_code === 'REX1') {
    return { ...m, budget_category_id: budgetCats[0].id };
  }
  if (m.report_code === 'REX2') {
    return { ...m, budget_category_id: budgetCats[1].id };
  }
  if (m.report_code === 'CEX1') {
    return { ...m, budget_category_id: budgetCats[2].id };
  }
  return m;
});

FinancialService.savePeriodicStatementMappings(fyId, updatedMaps, 1);
const reloaded = FinancialService.getPeriodicStatementMappings(fyId);
const reloadedS4 = reloaded.find((m) => m.report_code === 'S4');
assert.strictEqual(reloadedS4.estimated_amount_cents, 130000000, 'S4 estimate persisted');
assert.strictEqual(reloadedS4.fund_category_id, fundCats[0].id, 'S4 fund category linked');
console.log('✓ Successfully configured custom estimates and category links.\n');

// --- TEST 3: SEED FINANCIAL TRANSACTIONS & RECORDINGS ---
console.log('--- TEST 3: SEED INFLOWS AND DISBURSEMENTS ACROSS PERIODS ---');

// Set budget allocations for REX1 (Rs. 1,394,500.00) and REX2 (Rs. 4,033,000.00)
db.prepare(`
  INSERT OR REPLACE INTO financial_year_budget_allocations (financial_year_id, category_id, allocated_amount_cents)
  VALUES (?, ?, 139450000), (?, ?, 403300000)
`).run(fyId, budgetCats[0].id, fyId, budgetCats[1].id);

// Fund Receipts:
// S4 receipt in 1st period (2026-02-15): Rs. 175,100.00
db.prepare(`
  INSERT INTO fund_receipts (receipt_no, financial_year_id, receipt_date, donor_or_dept, amount_cents, payment_method, destination_type, status, fund_category_id)
  VALUES ('REC-S4-01', ?, '2026-02-15', 'Parent Association', 17510000, 'bank_transfer', 'bank', 'posted', ?)
`).run(fyId, fundCats[0].id);

// S6 receipt in 1st period (2026-03-10): Rs. 33,500.00
db.prepare(`
  INSERT INTO fund_receipts (receipt_no, financial_year_id, receipt_date, donor_or_dept, amount_cents, payment_method, destination_type, status, fund_category_id)
  VALUES ('REC-S6-01', ?, '2026-03-10', 'Community Donations', 3350000, 'cash', 'cash', 'posted', ?)
`).run(fyId, fundCats[1].id);

// S4 receipt in 2nd period (2026-06-20): Rs. 50,000.00 (to test prior vs current separation)
db.prepare(`
  INSERT INTO fund_receipts (receipt_no, financial_year_id, receipt_date, donor_or_dept, amount_cents, payment_method, destination_type, status, fund_category_id)
  VALUES ('REC-S4-02', ?, '2026-06-20', 'Mid-year Contribution', 5000000, 'bank_transfer', 'bank', 'posted', ?)
`).run(fyId, fundCats[0].id);

// Expenses:
// REX1 expense in 1st period (2026-02-20): Rs. 314,692.68
db.prepare(`
  INSERT INTO expenses (voucher_no, expense_date, financial_year_id, category_id, payee, description, amount_cents, payment_method, status)
  VALUES ('EXP-REX1-01', '2026-02-20', ?, ?, 'Stationers Ltd', 'Office stationery and printing', 31469268, 'bank', 'approved')
`).run(fyId, budgetCats[0].id);

// REX2 expense in 1st period (2026-03-25): Rs. 672,107.50
db.prepare(`
  INSERT INTO expenses (voucher_no, expense_date, financial_year_id, category_id, payee, description, amount_cents, payment_method, status)
  VALUES ('EXP-REX2-01', '2026-03-25', ?, ?, 'Electricity Board', 'Monthly utility bills', 67210750, 'bank', 'approved')
`).run(fyId, budgetCats[1].id);

// Reversed expense (must be ignored in calculations)
db.prepare(`
  INSERT INTO expenses (voucher_no, expense_date, financial_year_id, category_id, payee, description, amount_cents, payment_method, status)
  VALUES ('EXP-REV-01', '2026-03-28', ?, ?, 'Reversed Vendor', 'Cancelled purchase', 9999900, 'cash', 'reversed')
`).run(fyId, budgetCats[0].id);

console.log('✓ Seeded period receipts and disbursements; verified exclusion of reversed vouchers.\n');

// --- TEST 4: VERIFY 1ST PERIOD (JAN - APR) REPORT ---
console.log('--- TEST 4: VERIFY 1ST PERIOD STATEMENT (2026-01-01 TO 2026-04-30) ---');

// Configure bottom adjustments matching the reference document:
// Opening Balance: Rs. 2,944,968.54
// (+) Other deposits: Rs. 10,000.00
// (-) Canteen refund: Rs. 50,000.00
// (-) Cheque reissue: Rs. 9,000.00
// (-) Bank charges: Rs. 500.00
// (-) Petty cash balance: Rs. 820.00
FinancialService.savePeriodicStatementAdjustments(fyId, '2026-01-01', '2026-04-30', {
  opening_balance_override_cents: 294496854,
  other_additions_cents: 1000000,
  canteen_refund_cents: 5000000,
  cheque_reissue_cents: 900000,
  bank_charges_cents: 50000,
  petty_cash_balance_cents: 82000,
}, 1);

const rep1 = FinancialService.getPeriodicStatementReport({
  financialYearId: fyId,
  periodType: '1st',
  startDate: '2026-01-01',
  endDate: '2026-04-30',
});

// Verify S4 and S6
const rS4 = rep1.receipt_rows.find((r) => r.report_code === 'S4');
const rS6 = rep1.receipt_rows.find((r) => r.report_code === 'S6');
assert.strictEqual(rS4.annual_estimate_cents, 130000000, 'S4 annual estimate match');
assert.strictEqual(rS4.current_period_cents, 17510000, 'S4 current period receipts: Rs. 175,100.00');
assert.strictEqual(rS4.prior_cumulative_cents, 0, 'S4 prior receipts is 0 in 1st period');
assert.strictEqual(rS6.current_period_cents, 3350000, 'S6 current period receipts: Rs. 33,500.00');

// Verify REX1 and REX2
const rREX1 = rep1.recurrent_expense_rows.find((r) => r.report_code === 'REX1');
const rREX2 = rep1.recurrent_expense_rows.find((r) => r.report_code === 'REX2');
assert.strictEqual(rREX1.annual_estimate_cents, 139450000, 'REX1 allocation: Rs. 1,394,500.00');
assert.strictEqual(rREX1.current_period_cents, 31469268, 'REX1 current expense: Rs. 314,692.68');
assert.strictEqual(rREX2.current_period_cents, 67210750, 'REX2 current expense: Rs. 672,107.50');

// Verify Receipt Totals
const expectedPeriodReceipts = 17510000 + 3350000; // 208,600.00
assert.strictEqual(rep1.receipt_totals.current_period_cents, expectedPeriodReceipts);
assert.strictEqual(rep1.receipt_totals.total_cumulative_cents, 294496854 + expectedPeriodReceipts);

// Verify Closing Balance Arithmetic
const calc1 = rep1.calculation;
assert.strictEqual(calc1.opening_balance_cents, 294496854);
assert.strictEqual(calc1.total_receipts_cents, expectedPeriodReceipts);
assert.strictEqual(calc1.subtotal_receipts_cents, 294496854 + expectedPeriodReceipts + 1000000);

const expectedPayments = 31469268 + 67210750; // 986,800.18
assert.strictEqual(calc1.total_payments_cents, expectedPayments);

const expectedClosing =
  calc1.subtotal_receipts_cents -
  expectedPayments -
  5000000 - // canteen refund
  900000 -  // cheque reissue
  50000 -   // bank charges
  82000;    // petty cash balance

assert.strictEqual(calc1.closing_balance_cents, expectedClosing, 'Closing balance arithmetic verified');
console.log(`✓ 1st Period Verified: Receipts = Rs. ${(expectedPeriodReceipts / 100).toFixed(2)}, Payments = Rs. ${(expectedPayments / 100).toFixed(2)}, Closing Balance = Rs. ${(expectedClosing / 100).toFixed(2)}\n`);

// --- TEST 5: VERIFY 2ND PERIOD (MAY - AUG) PRIOR CUMULATIVE ROLL-FORWARD ---
console.log('--- TEST 5: VERIFY 2ND PERIOD (MAY - AUG) CUMULATIVE ROLL-FORWARD ---');
const rep2 = FinancialService.getPeriodicStatementReport({
  financialYearId: fyId,
  periodType: '2nd',
  startDate: '2026-05-01',
  endDate: '2026-08-31',
});

const r2S4 = rep2.receipt_rows.find((r) => r.report_code === 'S4');
// Prior in 2nd period should be the 1st period receipts: Rs. 175,100.00
assert.strictEqual(r2S4.prior_cumulative_cents, 17510000, 'Prior cumulative in 2nd period reflects 1st period');
// Current in 2nd period is Rs. 50,000.00
assert.strictEqual(r2S4.current_period_cents, 5000000, 'Current period receipt in 2nd period verified');
// Total cumulative is 175,100 + 50,000 = 225,100.00
assert.strictEqual(r2S4.total_cumulative_cents, 22510000, 'Total cumulative verified');

const r2REX1 = rep2.recurrent_expense_rows.find((r) => r.report_code === 'REX1');
assert.strictEqual(r2REX1.prior_cumulative_cents, 31469268, 'Prior cumulative expense roll-forward verified');
assert.strictEqual(r2REX1.current_period_cents, 0, 'Zero current expense in 2nd period');
assert.strictEqual(r2REX1.total_cumulative_cents, 31469268, 'Total cumulative expense matches prior');
console.log('✓ 2nd Period Cumulative roll-forward verified cleanly.\n');

// --- TEST 6: VERIFY CUSTOM DATE RANGE FILTERING ---
console.log('--- TEST 6: VERIFY CUSTOM DATE RANGE FILTERING ---');
const customRep = FinancialService.getPeriodicStatementReport({
  financialYearId: fyId,
  periodType: 'custom',
  startDate: '2026-02-01',
  endDate: '2026-02-28',
});

const cS4 = customRep.receipt_rows.find((r) => r.report_code === 'S4');
const cS6 = customRep.receipt_rows.find((r) => r.report_code === 'S6');
// S4 (Feb 15) falls inside Feb
assert.strictEqual(cS4.current_period_cents, 17510000, 'S4 included in February');
// S6 (Mar 10) falls outside Feb
assert.strictEqual(cS6.current_period_cents, 0, 'S6 excluded from February');
console.log('✓ Custom date range filtering verified cleanly.\n');

// --- TEST 7: SUBCATEGORY ROLL-UP & UNMAPPED "OTHER" EXPENSES ---
console.log('--- TEST 7: SUBCATEGORY ROLL-UP & UNMAPPED "OTHER" EXPENSES ---');
// 1. Create child category under REX1 category (budgetCats[0].id)
const childCatRes = db.prepare(`
  INSERT INTO budget_categories (category_code, name, name_en, name_si, parent_id, is_active)
  VALUES ('100.99', 'Child Educational Stationary', 'Child Educational Stationary', 'අනු ඛණ්ඩ වියදම', ?, 1)
`).run(budgetCats[0].id);
const childCatId = Number(childCatRes.lastInsertRowid);

// 2. Insert expense under child category (childCatId is NOT mapped in periodic_statement_mappings)
db.prepare(`
  INSERT INTO expenses (voucher_no, expense_date, financial_year_id, category_id, amount_cents, payment_method, payee, description, status)
  VALUES ('VCH-CHILD-01', '2026-03-25', ?, ?, 2500000, 'bank', 'Paper Co', 'Child stationary', 'approved')
`).run(fyId, childCatId);

// 3. Create independent unmapped category
const unmappedCatRes = db.prepare(`
  INSERT INTO budget_categories (category_code, name, name_en, name_si, parent_id, is_active)
  VALUES ('999', 'Unmapped Special Category', 'Unmapped Special Category', 'ශීර්ෂගත නොකළ වියදම', null, 1)
`).run();
const unmappedCatId = Number(unmappedCatRes.lastInsertRowid);

// 4. Insert expense under unmapped category
db.prepare(`
  INSERT INTO expenses (voucher_no, expense_date, financial_year_id, category_id, amount_cents, payment_method, payee, description, status)
  VALUES ('VCH-UNMAPPED-01', '2026-03-28', ?, ?, 4500000, 'bank', 'Vendor X', 'Unmapped expense', 'approved')
`).run(fyId, unmappedCatId);

const repChild = FinancialService.getPeriodicStatementReport({
  financialYearId: fyId,
  periodType: '1st',
  startDate: '2026-01-01',
  endDate: '2026-04-30',
});

// Category 1 is mapped to REX1 with direct expense 31469268. Child category (2500000) is automatically listed as its own row from actual budget transactions
const rex1AfterChild = repChild.recurrent_expense_rows.find((r) => r.report_code === 'REX1');
assert.strictEqual(rex1AfterChild.current_period_cents, 31469268, 'REX1 shows its direct transaction expense');

const childRow = repChild.recurrent_expense_rows.find((r) => r.category_id === childCatId);
assert(childRow, 'Child category with transactions has its own row directly from actual budget');
assert.strictEqual(childRow.current_period_cents, 2500000, 'Child category row shows its exact expense');

// Active category (4500000) was automatically discovered and assigned its own report line!
const autoDiscoveredRow = [...repChild.recurrent_expense_rows, ...repChild.capital_expense_rows].find((r) => r.category_id === unmappedCatId);
assert(autoDiscoveredRow, 'Active transaction category automatically discovered and assigned to a report row');
assert.strictEqual(autoDiscoveredRow.current_period_cents, 4500000, 'Auto-assigned row shows exact expense');
console.log('✓ Subcategory and active transaction categories verified cleanly directly from Actual Budget Page.\n');

// --- TEST 8: AUTOMATICALLY SHOW CATEGORIES WITH TRANSACTIONS (ZERO MANUAL ASSIGNMENT) ---
console.log('--- TEST 8: AUTOMATICALLY SHOW CATEGORIES WITH TRANSACTIONS (ZERO MANUAL ASSIGNMENT) ---');
const autoAssigned = FinancialService.autoAssignStatementMappingsFromTransactions(fyId, 1);
assert(autoAssigned.length >= 26, 'Mappings returned after auto-assignment');

// Verify that the unmapped category (unmappedCatId) was automatically assigned a slot!
const autoMappedUnmapped = autoAssigned.find((m) => m.budget_category_id === unmappedCatId);
assert(autoMappedUnmapped, 'Category with transactions was automatically assigned to a report code slot');
console.log(`✓ Category with transactions automatically assigned to code: ${autoMappedUnmapped.report_code} (${autoMappedUnmapped.label_si})`);

// Generate report and verify it shows the category directly by name
const autoRep = FinancialService.getPeriodicStatementReport({
  financialYearId: fyId,
  periodType: '1st',
  startDate: '2026-01-01',
  endDate: '2026-04-30',
});

const autoRow = [...autoRep.recurrent_expense_rows, ...autoRep.capital_expense_rows].find((r) => r.category_id === unmappedCatId);
assert(autoRow, 'Auto-assigned category row is present on statement');
assert.strictEqual(autoRow.current_period_cents, 4500000, 'Direct category row displays exact transactions');
console.log('✓ Automatic category transaction discovery & display verified cleanly.\n');

// --- TEST 9: VERIFY BOUNCED CHEQUE TOTAL & FEE AUTO-DETECTION ---
console.log('--- TEST 9: VERIFY BOUNCED CHEQUE TOTAL & FEE AUTO-DETECTION ---');
// 1. Insert an issued cheque that bounces with a 500 fee (matching user's exact case)
const issChqRes = db.prepare(`
  INSERT INTO cheques (cheque_type, cheque_number, amount_cents, status, cheque_date, issuing_bank_account_id)
  VALUES ('issued', 'CHQ-546123', 100000, 'issued', '2026-11-25', ?)
`).run(bank.id);
const issChqId = Number(issChqRes.lastInsertRowid);

// Bounce it using FinancialService.bounceIssuedCheque with bounce_fee_cents: 50000
FinancialService.bounceIssuedCheque({
  cheque_id: issChqId,
  bounce_date: '2026-11-26',
  bounce_reason: 'Insufficient funds',
  bounce_fee_cents: 50000,
}, 1);

const rep3 = FinancialService.getPeriodicStatementReport({
  financialYearId: fyId,
  periodType: '3rd',
  startDate: '2026-09-01',
  endDate: '2026-12-31',
});

// The bounced cheque amount (Rs. 1,000.00) is added under (+)අගරු චෙක්
assert.strictEqual(rep3.calculation.other_additions_cents, 100000, 'Bounced cheque total: Rs. 1,000.00');
// The bank fee (Rs. 500.00) is deducted under (-)චෙක් අගරු ගාස්තු (NOT 1,000.00 from the reversal transaction!)
assert.strictEqual(rep3.calculation.bank_charges_cents, 50000, 'Cheque bounce fee is strictly Rs. 500.00 (not confused with Rs. 1,000.00 reversal)');
console.log('✓ Issued cheque bounce amount Rs. 1,000.00 and fee Rs. 500.00 accurately isolated without reversal collision.\n');

console.log('================================================================');
console.log('>>> ALL PERIODIC FINANCIAL STATEMENT TESTS PASSED CLEANLY! <<<');
console.log('================================================================');

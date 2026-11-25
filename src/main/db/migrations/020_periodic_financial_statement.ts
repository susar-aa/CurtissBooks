import Database from 'better-sqlite3';

export const migration020 = {
  id: 20,
  name: '020_periodic_financial_statement',
  up: (db: Database.Database): void => {
    db.exec(`
      -- 1. Periodic Statement Custom Mappings (S1..S10, REX1..REX8, CEX1..CEX6)
      CREATE TABLE IF NOT EXISTS periodic_statement_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        financial_year_id INTEGER NOT NULL REFERENCES financial_years(id) ON DELETE CASCADE,
        section TEXT NOT NULL CHECK(section IN ('receipt', 'recurrent_expense', 'capital_expense')),
        report_code TEXT NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        label_si TEXT NOT NULL,
        label_en TEXT NOT NULL,
        fund_category_id INTEGER REFERENCES fund_categories(id) ON DELETE SET NULL,
        budget_category_id INTEGER REFERENCES budget_categories(id) ON DELETE SET NULL,
        estimated_amount_cents INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- 2. Periodic Statement Closing Balance Adjustments
      CREATE TABLE IF NOT EXISTS periodic_statement_adjustments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        financial_year_id INTEGER NOT NULL REFERENCES financial_years(id) ON DELETE CASCADE,
        period_start_date TEXT NOT NULL,
        period_end_date TEXT NOT NULL,
        opening_balance_override_cents INTEGER,
        other_additions_cents INTEGER NOT NULL DEFAULT 0,
        canteen_refund_cents INTEGER NOT NULL DEFAULT 0,
        cheque_reissue_cents INTEGER NOT NULL DEFAULT 0,
        bank_charges_cents INTEGER NOT NULL DEFAULT 0,
        petty_cash_balance_cents INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(financial_year_id, period_start_date, period_end_date)
      );

      CREATE INDEX IF NOT EXISTS idx_psm_fy_sec ON periodic_statement_mappings (financial_year_id, section, display_order);
      CREATE INDEX IF NOT EXISTS idx_psm_fcat ON periodic_statement_mappings (fund_category_id);
      CREATE INDEX IF NOT EXISTS idx_psm_bcat ON periodic_statement_mappings (budget_category_id);
      CREATE INDEX IF NOT EXISTS idx_psa_fy_dates ON periodic_statement_adjustments (financial_year_id, period_start_date, period_end_date);
    `);

    // Auto-seed default mappings for all existing financial years
    const fYears = db.prepare('SELECT id FROM financial_years').all() as { id: number }[];
    const fundCats = db.prepare('SELECT id, category_code, name_si, name_en FROM fund_categories ORDER BY id ASC').all() as any[];
    const budgetCats = db.prepare('SELECT id, category_code, name_si, name_en, parent_id FROM budget_categories ORDER BY id ASC').all() as any[];

    const recurrentCats = budgetCats.filter((b) => !b.category_code?.startsWith('20') && b.category_code !== '200');
    const capitalCats = budgetCats.filter((b) => b.category_code?.startsWith('20') || b.category_code === '200');

    const insertMap = db.prepare(`
      INSERT INTO periodic_statement_mappings (
        financial_year_id, section, report_code, display_order, label_si, label_en,
        fund_category_id, budget_category_id, estimated_amount_cents
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const fy of fYears) {
      // Seed S1 to S10 and OTHER
      for (let i = 1; i <= 10; i++) {
        const code = `S${i}`;
        const matchedFcat = fundCats[i - 1] || null;
        insertMap.run(
          fy.id,
          'receipt',
          code,
          i,
          matchedFcat ? matchedFcat.name_si : `ලැබීම් ශීර්ෂය ${i}`,
          matchedFcat ? matchedFcat.name_en : `Receipt Category ${i}`,
          matchedFcat ? matchedFcat.id : null,
          null,
          0
        );
      }
      insertMap.run(fy.id, 'receipt', 'වෙනත්', 11, 'වෙනත් ලැබීම්', 'Other Receipts', null, null, 0);

      // Seed REX1 to REX8
      for (let i = 1; i <= 8; i++) {
        const code = `REX${i}`;
        const matchedBcat = recurrentCats[i - 1] || null;
        insertMap.run(
          fy.id,
          'recurrent_expense',
          code,
          i,
          matchedBcat ? matchedBcat.name_si : `පුනරාවර්තන වියදම ${i}`,
          matchedBcat ? matchedBcat.name_en : `Recurrent Expenditure ${i}`,
          null,
          matchedBcat ? matchedBcat.id : null,
          0
        );
      }

      // Seed CEX1 to CEX6 and OTHER
      for (let i = 1; i <= 6; i++) {
        const code = `CEX${i}`;
        const matchedBcat = capitalCats[i - 1] || null;
        insertMap.run(
          fy.id,
          'capital_expense',
          code,
          i,
          matchedBcat ? matchedBcat.name_si : `ප්‍රාග්ධන වියදම ${i}`,
          matchedBcat ? matchedBcat.name_en : `Capital Expenditure ${i}`,
          null,
          matchedBcat ? matchedBcat.id : null,
          0
        );
      }
      insertMap.run(fy.id, 'capital_expense', 'වෙනත්', 7, 'වෙනත් ප්‍රාග්ධන වියදම්', 'Other Capital Expenses', null, null, 0);
    }
  },

  down: (_db: Database.Database): void => {
    // Rollback handled safely if needed
  },
};

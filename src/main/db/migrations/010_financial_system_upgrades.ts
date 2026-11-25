import type Database from 'better-sqlite3';
import { Migration } from './001_initial_settings';

export const migration010: Migration = {
  id: 10,
  name: '010_financial_system_upgrades',
  up: (db: Database.Database) => {
    // 1. Reusable Fund Categories table
    db.exec(`
      CREATE TABLE IF NOT EXISTS fund_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_code TEXT NOT NULL UNIQUE,
        name_en TEXT NOT NULL,
        name_si TEXT NOT NULL,
        description TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_fund_cats_code ON fund_categories(category_code);
      CREATE INDEX IF NOT EXISTS idx_fund_cats_active ON fund_categories(is_active);

      INSERT OR IGNORE INTO fund_categories (id, category_code, name_en, name_si, description, is_active)
      VALUES
        (1, 'FCAT-001', 'Government Funds', 'රජයේ ප්‍රතිපාදන අරමුදල්', 'Ministry of Education and Provincial Council specific allocations', 1),
        (2, 'FCAT-002', 'Donations & Contributions', 'පරිත්‍යාග සහ ආධාර', 'Alumni, private philanthropists, and community contributions', 1),
        (3, 'FCAT-003', 'Special & Project Funds', 'විශේෂ ව්‍යාපෘති අරමුදල්', 'Targeted infrastructure, sports, and laboratory grant projects', 1),
        (4, 'FCAT-004', 'Other Institutional Funds', 'වෙනත් ආයතනික අරමුදල්', 'General school development society and miscellaneous reserves', 1);
    `);

    // 2. Add fund_category_id and opening_balance_cents to funds table
    const fundsCols = db.prepare("PRAGMA table_info(funds)").all() as any[];
    if (!fundsCols.some((c) => c.name === 'fund_category_id')) {
      db.exec('ALTER TABLE funds ADD COLUMN fund_category_id INTEGER REFERENCES fund_categories(id);');
    }
    if (!fundsCols.some((c) => c.name === 'opening_balance_cents')) {
      db.exec('ALTER TABLE funds ADD COLUMN opening_balance_cents INTEGER NOT NULL DEFAULT 0;');
    }

    db.exec(`
      UPDATE funds
      SET fund_category_id = CASE
        WHEN source_type IN ('government_grant', 'provincial_grant') THEN 1
        WHEN source_type IN ('individual_donation', 'corporate_donation', 'community_contribution') THEN 2
        WHEN source_type IN ('development_fund') THEN 3
        ELSE 4
      END
      WHERE fund_category_id IS NULL;

      CREATE INDEX IF NOT EXISTS idx_funds_category ON funds(fund_category_id);
    `);

    // 3. Fund Usage Traces table for traceable expense financing
    db.exec(`
      CREATE TABLE IF NOT EXISTS fund_usage_traces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE RESTRICT,
        expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        trace_date TEXT NOT NULL,
        notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(fund_id, expense_id)
      );

      CREATE INDEX IF NOT EXISTS idx_fund_usage_fund ON fund_usage_traces(fund_id);
      CREATE INDEX IF NOT EXISTS idx_fund_usage_expense ON fund_usage_traces(expense_id);
      CREATE INDEX IF NOT EXISTS idx_fund_usage_date ON fund_usage_traces(trace_date);

      INSERT OR IGNORE INTO fund_usage_traces (fund_id, expense_id, amount_cents, trace_date, notes, created_by, created_at)
      SELECT fund_id, id, amount_cents, expense_date, 'Initial historical expense trace', created_by, created_at
      FROM expenses
      WHERE fund_id IS NOT NULL AND status IN ('approved', 'paid');
    `);

    // 4. Add petty_cash_voucher_id to expenses table
    const expensesCols = db.prepare("PRAGMA table_info(expenses)").all() as any[];
    if (!expensesCols.some((c) => c.name === 'petty_cash_voucher_id')) {
      db.exec('ALTER TABLE expenses ADD COLUMN petty_cash_voucher_id INTEGER REFERENCES petty_cash_vouchers(id) ON DELETE SET NULL;');
    }
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_expenses_petty_voucher ON expenses(petty_cash_voucher_id);
    `);

    // 5. Configurable Budget Category Prefix setting
    db.exec(`
      INSERT OR IGNORE INTO application_settings (key, value, description)
      VALUES ('budget_category_prefix', 'Rex ', 'Prefix for main hierarchical annual budget categories');
    `);

    // 6. High performance query indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_budget_cats_parent_active ON budget_categories(parent_id, is_active);
      CREATE INDEX IF NOT EXISTS idx_budget_cats_code_parent ON budget_categories(category_code, parent_id);
      CREATE INDEX IF NOT EXISTS idx_bank_tx_account_date ON bank_transactions(bank_account_id, transaction_date);
      CREATE INDEX IF NOT EXISTS idx_cash_tx_fy_date ON cash_transactions(financial_year_id, transaction_date);
      CREATE INDEX IF NOT EXISTS idx_petty_cash_fy_status ON petty_cash_vouchers(financial_year_id, status);
      CREATE INDEX IF NOT EXISTS idx_petty_cash_fy_cat ON petty_cash_vouchers(financial_year_id, category_id);
    `);
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP TABLE IF EXISTS fund_usage_traces;
      DROP TABLE IF EXISTS fund_categories;
      DROP INDEX IF EXISTS idx_budget_cats_parent_active;
      DROP INDEX IF EXISTS idx_budget_cats_code_parent;
      DROP INDEX IF EXISTS idx_bank_tx_account_date;
      DROP INDEX IF EXISTS idx_cash_tx_fy_date;
      DROP INDEX IF EXISTS idx_petty_cash_fy_status;
      DROP INDEX IF EXISTS idx_petty_cash_fy_cat;
    `);
  },
};

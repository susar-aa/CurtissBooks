import type Database from 'better-sqlite3';
import { Migration } from './001_initial_settings';

export const migration013: Migration = {
  id: 13,
  name: '013_financial_year_optimization',
  up: (db: Database.Database) => {
    // 1. Replace overly-restrictive global name index with scoped parent-aware unique index
    db.exec(`
      DROP INDEX IF EXISTS idx_budget_categories_name_nocase;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_cats_parent_name_nocase
        ON budget_categories(COALESCE(parent_id, 0), name COLLATE NOCASE);
    `);

    // 2. Ensure category_code uniqueness is strictly case-insensitive
    db.exec(`
      DROP INDEX IF EXISTS idx_budget_cats_code;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_cats_code_nocase
        ON budget_categories(category_code COLLATE NOCASE);
    `);

    // 3. High performance composite query indexes for budget and allocations (Rule 5)
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_fy_alloc_year_cat_amount
        ON financial_year_budget_allocations(financial_year_id, category_id, allocated_amount_cents);

      CREATE INDEX IF NOT EXISTS idx_expenses_fy_cat_status_amt
        ON expenses(financial_year_id, category_id, status, amount_cents);

      CREATE INDEX IF NOT EXISTS idx_financial_years_status_current
        ON financial_years(status, is_current);
    `);
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_budget_cats_parent_name_nocase;
      DROP INDEX IF EXISTS idx_budget_cats_code_nocase;
      DROP INDEX IF EXISTS idx_fy_alloc_year_cat_amount;
      DROP INDEX IF EXISTS idx_expenses_fy_cat_status_amt;
      DROP INDEX IF EXISTS idx_financial_years_status_current;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_categories_name_nocase ON budget_categories(name COLLATE NOCASE);
    `);
  },
};

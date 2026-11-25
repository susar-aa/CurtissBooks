import type Database from 'better-sqlite3';
import { Migration } from './001_initial_settings';

export const migration006: Migration = {
  id: 6,
  name: '006_budget_workflow_refinement',
  up: (db: Database.Database) => {
    // 1. Upgrade financial_years to support draft/approved workflow with approver details
    db.exec(`
      PRAGMA foreign_keys = OFF;

      CREATE TABLE IF NOT EXISTS financial_years_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year_name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'closed', 'open', 'locked')),
        is_current INTEGER NOT NULL DEFAULT 0,
        approved_by INTEGER REFERENCES users(id),
        approved_at TEXT,
        approval_notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO financial_years_v2 (id, year_name, start_date, end_date, status, is_current, approved_by, approved_at, approval_notes, created_at, updated_at)
      SELECT id, year_name, start_date, end_date,
        CASE
          WHEN status = 'locked' THEN 'approved'
          WHEN status = 'open' THEN 'draft'
          ELSE status
        END,
        is_current, NULL, NULL, NULL, created_at, updated_at
      FROM financial_years;

      DROP TABLE financial_years;

      ALTER TABLE financial_years_v2 RENAME TO financial_years;

      CREATE INDEX IF NOT EXISTS idx_financial_years_status ON financial_years(status);
      CREATE INDEX IF NOT EXISTS idx_financial_years_is_current ON financial_years(is_current);
      CREATE INDEX IF NOT EXISTS idx_financial_years_name ON financial_years(year_name COLLATE NOCASE);

      PRAGMA foreign_keys = ON;
    `);

    // 2. Add 'name' to budget_categories with case-insensitive uniqueness and indexing
    // Check if 'name' column exists
    const tableInfo = db.prepare("PRAGMA table_info(budget_categories)").all() as any[];
    const hasNameCol = tableInfo.some((c) => c.name === 'name');
    if (!hasNameCol) {
      db.exec(`
        ALTER TABLE budget_categories ADD COLUMN name TEXT;
      `);
    }

    db.exec(`
      UPDATE budget_categories SET name = name_en WHERE name IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_categories_name_nocase ON budget_categories(name COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_budget_categories_active ON budget_categories(is_active);
    `);

    // 3. Create dedicated financial_year_budget_allocations table
    db.exec(`
      CREATE TABLE IF NOT EXISTS financial_year_budget_allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        financial_year_id INTEGER NOT NULL REFERENCES financial_years(id) ON DELETE CASCADE,
        category_id INTEGER NOT NULL REFERENCES budget_categories(id) ON DELETE RESTRICT,
        allocated_amount_cents INTEGER NOT NULL CHECK (allocated_amount_cents >= 0),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(financial_year_id, category_id)
      );

      CREATE INDEX IF NOT EXISTS idx_fy_alloc_year ON financial_year_budget_allocations(financial_year_id);
      CREATE INDEX IF NOT EXISTS idx_fy_alloc_cat ON financial_year_budget_allocations(category_id);
      CREATE INDEX IF NOT EXISTS idx_fy_alloc_year_cat ON financial_year_budget_allocations(financial_year_id, category_id);

      -- Migrate any existing allocations from annual_budgets if present
      INSERT OR IGNORE INTO financial_year_budget_allocations (financial_year_id, category_id, allocated_amount_cents, notes, created_at, updated_at)
      SELECT financial_year_id, category_id, COALESCE(revised_amount_cents, approved_amount_cents, 0), notes, created_at, updated_at
      FROM annual_budgets;
    `);
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP TABLE IF EXISTS financial_year_budget_allocations;
    `);
  },
};


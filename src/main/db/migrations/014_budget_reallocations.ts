import type Database from 'better-sqlite3';
import { Migration } from './001_initial_settings';

export const migration014: Migration = {
  id: 14,
  name: '014_budget_reallocations',
  up: (db: Database.Database) => {
    // 1. Create dedicated budget_reallocations table
    db.exec(`
      CREATE TABLE IF NOT EXISTS budget_reallocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reallocation_no TEXT NOT NULL UNIQUE,
        financial_year_id INTEGER NOT NULL REFERENCES financial_years(id) ON DELETE RESTRICT,
        source_category_id INTEGER NOT NULL REFERENCES budget_categories(id) ON DELETE RESTRICT,
        destination_category_id INTEGER NOT NULL REFERENCES budget_categories(id) ON DELETE RESTRICT,
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        reason TEXT NOT NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_budget_realloc_fy ON budget_reallocations(financial_year_id);
      CREATE INDEX IF NOT EXISTS idx_budget_realloc_src ON budget_reallocations(source_category_id);
      CREATE INDEX IF NOT EXISTS idx_budget_realloc_dest ON budget_reallocations(destination_category_id);
      CREATE INDEX IF NOT EXISTS idx_budget_realloc_date ON budget_reallocations(created_at DESC);
    `);
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP TABLE IF EXISTS budget_reallocations;
    `);
  },
};

import type Database from 'better-sqlite3';
import { Migration } from './001_initial_settings';

export const migration007: Migration = {
  id: 7,
  name: '007_single_active_fy_and_category_filtering',
  up: (db: Database.Database) => {
    // 1. Clean up financial_years to guarantee strictly ONE active financial year
    // Check if any year is approved
    const approvedYear = db.prepare(`
      SELECT id FROM financial_years
      WHERE status = 'approved'
      ORDER BY start_date DESC, id DESC
      LIMIT 1
    `).get() as { id: number } | undefined;

    const targetActiveId = approvedYear?.id || (db.prepare(`
      SELECT id FROM financial_years
      ORDER BY is_current DESC, start_date DESC, id DESC
      LIMIT 1
    `).get() as { id: number } | undefined)?.id;

    if (targetActiveId) {
      db.prepare('UPDATE financial_years SET is_current = 0').run();
      db.prepare('UPDATE financial_years SET is_current = 1 WHERE id = ?').run(targetActiveId);
    }

    // 2. Add SQLite partial unique index: exactly at most one financial year can have is_current = 1
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_years_single_current
      ON financial_years(is_current) WHERE is_current = 1;
    `);

    // 3. Composite performance indexes for expense allocation queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_expenses_fy_cat ON expenses(financial_year_id, category_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_fy_date ON expenses(financial_year_id, expense_date);
    `);
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_financial_years_single_current;
      DROP INDEX IF EXISTS idx_expenses_fy_cat;
      DROP INDEX IF EXISTS idx_expenses_fy_date;
    `);
  },
};


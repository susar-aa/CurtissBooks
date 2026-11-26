import type Database from 'better-sqlite3';

export const migration022 = {
  id: 22,
  name: '022_fund_category_hierarchy',
  up: (db: Database.Database): void => {
    // 1. Add parent_id to fund_categories table to support Main Category & Subcategory levels
    const cols = db.prepare('PRAGMA table_info(fund_categories)').all() as { name: string }[];
    if (!cols.some((c) => c.name === 'parent_id')) {
      db.exec('ALTER TABLE fund_categories ADD COLUMN parent_id INTEGER REFERENCES fund_categories(id) ON DELETE RESTRICT;');
    }

    // 2. Performance indexes for parent_id and parent-active lookup
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_fund_cats_parent ON fund_categories(parent_id);
      CREATE INDEX IF NOT EXISTS idx_fund_cats_parent_active ON fund_categories(parent_id, is_active);
    `);
  },
  down: (db: Database.Database): void => {
    // SQLite does not support DROP COLUMN in older versions safely, but we can drop indexes
    db.exec(`
      DROP INDEX IF EXISTS idx_fund_cats_parent_active;
      DROP INDEX IF EXISTS idx_fund_cats_parent;
    `);
  },
};

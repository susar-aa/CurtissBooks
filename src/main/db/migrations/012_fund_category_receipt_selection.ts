import type Database from 'better-sqlite3';
import { Migration } from './001_initial_settings';

export const migration012: Migration = {
  id: 12,
  name: '012_fund_category_receipt_selection',
  up: (db: Database.Database) => {
    // 1. Add fund_category_id to fund_receipts if not present
    const receiptCols = db.prepare("PRAGMA table_info(fund_receipts)").all() as any[];
    if (!receiptCols.some((c) => c.name === 'fund_category_id')) {
      db.exec('ALTER TABLE fund_receipts ADD COLUMN fund_category_id INTEGER REFERENCES fund_categories(id);');
    }

    // 2. Populate fund_category_id from associated funds using explicit JOIN
    db.exec(`
      UPDATE fund_receipts
      SET fund_category_id = (
        SELECT f.fund_category_id
        FROM funds f
        WHERE f.id = fund_receipts.fund_id
      )
      WHERE fund_category_id IS NULL;
    `);

    // 3. Create high performance query indexes (Rule 5)
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_fund_receipts_cat ON fund_receipts(fund_category_id);
      CREATE INDEX IF NOT EXISTS idx_fund_receipts_fy_cat ON fund_receipts(financial_year_id, fund_category_id);
      CREATE INDEX IF NOT EXISTS idx_fund_receipts_fy_date ON fund_receipts(financial_year_id, receipt_date);
    `);
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_fund_receipts_cat;
      DROP INDEX IF EXISTS idx_fund_receipts_fy_cat;
      DROP INDEX IF EXISTS idx_fund_receipts_fy_date;
    `);
  },
};

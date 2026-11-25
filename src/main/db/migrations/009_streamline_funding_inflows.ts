import type Database from 'better-sqlite3';
import { Migration } from './001_initial_settings';

export const migration009: Migration = {
  id: 9,
  name: '009_streamline_funding_inflows',
  up: (db: Database.Database) => {
    // 1. Ensure default general fund exists for fallback
    db.exec(`
      INSERT OR IGNORE INTO funds (id, fund_code, name, name_en, name_si, source_type, is_restricted, status)
      VALUES (1, 'FND-GEN', 'General Funding', 'General Funding', 'සාමාන්‍ය ආයතනික අරමුදල්', 'other', 0, 'active');
    `);

    // 2. Make fund_id nullable in fund_receipts
    db.exec(`
      PRAGMA foreign_keys = OFF;

      DROP TABLE IF EXISTS fund_receipts_v3;

      CREATE TABLE fund_receipts_v3 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_no TEXT NOT NULL UNIQUE,
        financial_year_id INTEGER NOT NULL REFERENCES financial_years(id) ON DELETE RESTRICT,
        fund_id INTEGER REFERENCES funds(id) ON DELETE SET NULL,
        receipt_date TEXT NOT NULL,
        donor_or_dept TEXT NOT NULL,
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque', 'direct_deposit', 'other')),
        destination_type TEXT NOT NULL CHECK (destination_type IN ('cash', 'bank', 'petty_cash')),
        bank_account_id INTEGER REFERENCES bank_accounts(id),
        reference_no TEXT,
        purpose TEXT,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'cancelled')),
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO fund_receipts_v3 (
        id, receipt_no, financial_year_id, fund_id, receipt_date, donor_or_dept,
        amount_cents, payment_method, destination_type, bank_account_id, reference_no,
        purpose, notes, status, created_by, created_at
      )
      SELECT
        id, receipt_no, financial_year_id, fund_id, receipt_date, donor_or_dept,
        amount_cents, payment_method, destination_type, bank_account_id, reference_no,
        purpose, notes, status, created_by, created_at
      FROM fund_receipts;

      DROP TABLE fund_receipts;

      ALTER TABLE fund_receipts_v3 RENAME TO fund_receipts;

      CREATE INDEX IF NOT EXISTS idx_fund_receipts_fy ON fund_receipts(financial_year_id);
      CREATE INDEX IF NOT EXISTS idx_fund_receipts_fund ON fund_receipts(fund_id);
      CREATE INDEX IF NOT EXISTS idx_fund_receipts_fy_fund ON fund_receipts(financial_year_id, fund_id);
      CREATE INDEX IF NOT EXISTS idx_fund_receipts_dest ON fund_receipts(destination_type);
      CREATE INDEX IF NOT EXISTS idx_fund_receipts_date ON fund_receipts(receipt_date);
      CREATE INDEX IF NOT EXISTS idx_fund_receipts_donor ON fund_receipts(donor_or_dept);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_fund_receipts_no ON fund_receipts(receipt_no);

      PRAGMA foreign_keys = ON;
    `);
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_fund_receipts_donor;
    `);
  },
};


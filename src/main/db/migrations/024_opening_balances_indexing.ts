import type Database from 'better-sqlite3';
import { Migration } from './001_initial_settings';

export const migration024: Migration = {
  id: 24,
  name: '024_opening_balances_indexing',
  up: (db: Database.Database) => {
    // 1. Index on cash_transactions for opening balance and reference lookup
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_cash_tx_fy_ref ON cash_transactions (financial_year_id, reference_no);
    `);
  },
};

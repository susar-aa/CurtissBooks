import Database from 'better-sqlite3';

export const migration019 = {
  id: 19,
  name: '019_petty_cash_report_indexes',
  up: (db: Database.Database): void => {
    db.exec(`
      -- Composite index for fast reimbursement interval and date-range queries
      CREATE INDEX IF NOT EXISTS idx_pcv_type_date_fy ON petty_cash_vouchers(type, voucher_date, financial_year_id);
      CREATE INDEX IF NOT EXISTS idx_pcv_date_fy ON petty_cash_vouchers(voucher_date, financial_year_id);
    `);
  },

  down: (_db: Database.Database): void => {
    // Rollback not required
  },
};

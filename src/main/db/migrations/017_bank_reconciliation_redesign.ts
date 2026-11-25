import Database from 'better-sqlite3';

export const migration017 = {
  id: 17,
  name: '017_bank_reconciliation_redesign',
  up: (db: Database.Database): void => {
    db.exec(`
      -- 1. Bank Reconciliation Sessions
      CREATE TABLE IF NOT EXISTS bank_reconciliation_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_code TEXT NOT NULL UNIQUE,
        bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,
        financial_year_id INTEGER REFERENCES financial_years(id) ON DELETE RESTRICT,
        period_start_date TEXT NOT NULL,
        period_end_date TEXT NOT NULL,
        reconciliation_date TEXT NOT NULL,
        statement_opening_balance_cents INTEGER NOT NULL DEFAULT 0,
        statement_closing_balance_cents INTEGER NOT NULL DEFAULT 0,
        system_opening_balance_cents INTEGER NOT NULL DEFAULT 0,
        system_closing_balance_cents INTEGER NOT NULL DEFAULT 0,
        matched_statement_amount_cents INTEGER NOT NULL DEFAULT 0,
        matched_system_amount_cents INTEGER NOT NULL DEFAULT 0,
        deposits_in_transit_cents INTEGER NOT NULL DEFAULT 0,
        outstanding_cheques_cents INTEGER NOT NULL DEFAULT 0,
        unrecorded_bank_charges_cents INTEGER NOT NULL DEFAULT 0,
        unrecorded_bank_interest_cents INTEGER NOT NULL DEFAULT 0,
        adjusted_statement_balance_cents INTEGER NOT NULL DEFAULT 0,
        adjusted_book_balance_cents INTEGER NOT NULL DEFAULT 0,
        difference_cents INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'matched', 'completed', 'cancelled')),
        completed_at TEXT,
        completed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reopened_at TEXT,
        reopened_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reopen_reason TEXT,
        notes TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_recon_sessions_acc ON bank_reconciliation_sessions(bank_account_id);
      CREATE INDEX IF NOT EXISTS idx_recon_sessions_dates ON bank_reconciliation_sessions(period_start_date, period_end_date);
      CREATE INDEX IF NOT EXISTS idx_recon_sessions_status ON bank_reconciliation_sessions(status);

      -- 2. Bank Statement Imports
      CREATE TABLE IF NOT EXISTS bank_statement_imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES bank_reconciliation_sessions(id) ON DELETE CASCADE,
        bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,
        filename TEXT NOT NULL,
        file_format TEXT NOT NULL CHECK (file_format IN ('xlsx', 'csv', 'manual')),
        import_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_rows INTEGER NOT NULL DEFAULT 0,
        imported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_stmt_imports_session ON bank_statement_imports(session_id);

      -- 3. Staged Bank Statement Transactions (isolated from system ledger)
      CREATE TABLE IF NOT EXISTS bank_statement_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES bank_reconciliation_sessions(id) ON DELETE CASCADE,
        import_id INTEGER REFERENCES bank_statement_imports(id) ON DELETE CASCADE,
        transaction_date TEXT NOT NULL,
        value_date TEXT,
        description TEXT NOT NULL,
        reference_no TEXT,
        cheque_number TEXT,
        debit_cents INTEGER NOT NULL DEFAULT 0,
        credit_cents INTEGER NOT NULL DEFAULT 0,
        balance_cents INTEGER,
        is_matched INTEGER NOT NULL DEFAULT 0,
        matched_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_stmt_tx_session ON bank_statement_transactions(session_id);
      CREATE INDEX IF NOT EXISTS idx_stmt_tx_date ON bank_statement_transactions(transaction_date);
      CREATE INDEX IF NOT EXISTS idx_stmt_tx_matched ON bank_statement_transactions(is_matched);

      -- 4. Reconciliation Matches (links statement item to system transaction or cheque)
      CREATE TABLE IF NOT EXISTS bank_reconciliation_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES bank_reconciliation_sessions(id) ON DELETE CASCADE,
        statement_transaction_id INTEGER REFERENCES bank_statement_transactions(id) ON DELETE CASCADE,
        bank_transaction_id INTEGER REFERENCES bank_transactions(id) ON DELETE RESTRICT,
        cheque_id INTEGER REFERENCES cheques(id) ON DELETE RESTRICT,
        matched_amount_cents INTEGER NOT NULL,
        match_type TEXT NOT NULL DEFAULT 'auto' CHECK (match_type IN ('auto', 'manual', 'adjustment', 'tick')),
        confidence_score REAL NOT NULL DEFAULT 1.0,
        match_rule TEXT,
        matched_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, bank_transaction_id)
      );

      CREATE INDEX IF NOT EXISTS idx_recon_matches_session ON bank_reconciliation_matches(session_id);
      CREATE INDEX IF NOT EXISTS idx_recon_matches_stmt_tx ON bank_reconciliation_matches(statement_transaction_id);
      CREATE INDEX IF NOT EXISTS idx_recon_matches_bank_tx ON bank_reconciliation_matches(bank_transaction_id);

      -- 5. Reconciliation Audit Trail
      CREATE TABLE IF NOT EXISTS bank_reconciliation_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES bank_reconciliation_sessions(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        details TEXT,
        performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_recon_audit_session ON bank_reconciliation_audit_logs(session_id);
    `);
  },

  down: (db: Database.Database): void => {
    db.exec(`
      DROP TABLE IF EXISTS bank_reconciliation_audit_logs;
      DROP TABLE IF EXISTS bank_reconciliation_matches;
      DROP TABLE IF EXISTS bank_statement_transactions;
      DROP TABLE IF EXISTS bank_statement_imports;
      DROP TABLE IF EXISTS bank_reconciliation_sessions;
    `);
  },
};

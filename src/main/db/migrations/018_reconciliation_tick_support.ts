import Database from 'better-sqlite3';

export const migration018 = {
  id: 18,
  name: '018_reconciliation_tick_support',
  up: (db: Database.Database): void => {
    db.exec(`
      -- Make statement_transaction_id nullable to support direct system transaction ticking
      CREATE TABLE IF NOT EXISTS bank_reconciliation_matches_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES bank_reconciliation_sessions(id) ON DELETE CASCADE,
        statement_transaction_id INTEGER REFERENCES bank_statement_transactions(id) ON DELETE CASCADE,
        bank_transaction_id INTEGER REFERENCES bank_transactions(id) ON DELETE RESTRICT,
        cheque_id INTEGER REFERENCES cheques(id) ON DELETE RESTRICT,
        matched_amount_cents INTEGER NOT NULL,
        match_type TEXT NOT NULL DEFAULT 'auto',
        confidence_score REAL NOT NULL DEFAULT 1.0,
        match_rule TEXT,
        matched_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, bank_transaction_id)
      );

      INSERT OR IGNORE INTO bank_reconciliation_matches_new (
        id, session_id, statement_transaction_id, bank_transaction_id, cheque_id,
        matched_amount_cents, match_type, confidence_score, match_rule, matched_by, created_at
      )
      SELECT id, session_id, statement_transaction_id, bank_transaction_id, cheque_id,
             matched_amount_cents, match_type, confidence_score, match_rule, matched_by, created_at
      FROM bank_reconciliation_matches;

      DROP TABLE IF EXISTS bank_reconciliation_matches;

      ALTER TABLE bank_reconciliation_matches_new RENAME TO bank_reconciliation_matches;

      CREATE INDEX IF NOT EXISTS idx_recon_matches_session ON bank_reconciliation_matches(session_id);
      CREATE INDEX IF NOT EXISTS idx_recon_matches_stmt_tx ON bank_reconciliation_matches(statement_transaction_id);
      CREATE INDEX IF NOT EXISTS idx_recon_matches_bank_tx ON bank_reconciliation_matches(bank_transaction_id);
    `);
  },

  down: (_db: Database.Database): void => {
    // Migration rollback not required
  },
};

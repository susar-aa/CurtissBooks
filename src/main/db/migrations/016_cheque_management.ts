import Database from 'better-sqlite3';

export const migration016 = {
  id: 16,
  name: '016_cheque_management',
  up: (db: Database.Database): void => {
    // 1. Create cheques master table
    db.exec(`
      CREATE TABLE IF NOT EXISTS cheques (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cheque_type TEXT NOT NULL CHECK (cheque_type IN ('received', 'issued')),
        cheque_number TEXT NOT NULL,
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        status TEXT NOT NULL CHECK (status IN ('received', 'deposited', 'issued', 'presented', 'cleared', 'bounced', 'cancelled')),
        cheque_date TEXT NOT NULL,

        -- Received Cheque Specific Fields
        received_date TEXT,
        payer_name TEXT,
        issuing_bank_name TEXT,
        issuing_bank_branch TEXT,
        expected_deposit_date TEXT,
        actual_deposit_date TEXT,
        deposit_bank_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE RESTRICT,
        deposit_bank_transaction_id INTEGER REFERENCES bank_transactions(id) ON DELETE SET NULL,
        fund_receipt_id INTEGER REFERENCES fund_receipts(id) ON DELETE SET NULL,
        fund_category_id INTEGER REFERENCES fund_categories(id) ON DELETE SET NULL,
        specific_fund_id INTEGER REFERENCES funds(id) ON DELETE SET NULL,

        -- Issued Cheque Specific Fields
        issue_date TEXT,
        payee_name TEXT,
        issuing_bank_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE RESTRICT,
        issuing_bank_transaction_id INTEGER REFERENCES bank_transactions(id) ON DELETE SET NULL,
        expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL,
        budget_category_id INTEGER REFERENCES budget_categories(id) ON DELETE SET NULL,
        financial_year_id INTEGER REFERENCES financial_years(id) ON DELETE RESTRICT,
        expected_presentation_date TEXT,
        actual_presentation_date TEXT,

        -- Common Clearance, Bounce & Cancellation Tracking
        actual_clearance_date TEXT,
        bounce_date TEXT,
        bounce_reason TEXT,
        bounce_bank_transaction_id INTEGER REFERENCES bank_transactions(id) ON DELETE SET NULL,
        cancellation_date TEXT,
        cancellation_reason TEXT,

        description TEXT,
        reference TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Unique constraint: cheque numbers for issued cheques must be unique per issuing bank account (excluding cancelled)
      CREATE UNIQUE INDEX IF NOT EXISTS uq_cheques_issued_acc_num 
      ON cheques(issuing_bank_account_id, cheque_number) 
      WHERE cheque_type = 'issued' AND status != 'cancelled';

      -- Performance query indexes
      CREATE INDEX IF NOT EXISTS idx_cheques_type_status ON cheques(cheque_type, status);
      CREATE INDEX IF NOT EXISTS idx_cheques_cheque_date ON cheques(cheque_date);
      CREATE INDEX IF NOT EXISTS idx_cheques_deposit_bank ON cheques(deposit_bank_account_id);
      CREATE INDEX IF NOT EXISTS idx_cheques_issuing_bank ON cheques(issuing_bank_account_id);
      CREATE INDEX IF NOT EXISTS idx_cheques_expense_id ON cheques(expense_id);
      CREATE INDEX IF NOT EXISTS idx_cheques_fund_receipt_id ON cheques(fund_receipt_id);
      CREATE INDEX IF NOT EXISTS idx_cheques_created_at ON cheques(created_at);
      CREATE INDEX IF NOT EXISTS idx_cheques_fy ON cheques(financial_year_id);
    `);

    // 2. Create cheque audit logs table
    db.exec(`
      CREATE TABLE IF NOT EXISTS cheque_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cheque_id INTEGER NOT NULL REFERENCES cheques(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT,
        notes TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_cheque_audit_logs_cheque ON cheque_audit_logs(cheque_id);
    `);

    // 3. Seed granular permissions for Cheque Management
    const permissions = [
      [43, 'cheques.received_view', 'cheques', 'view', 'View Received Cheques', 'ලැබුණු චෙක්පත් බැලීම', 'View register of inward cheques received.'],
      [44, 'cheques.received_create', 'cheques', 'create', 'Create Received Cheques', 'ලැබුණු චෙක්පත් ඇතුළත් කිරීම', 'Record received inward cheques.'],
      [45, 'cheques.received_deposit', 'cheques', 'deposit', 'Deposit Received Cheques', 'චෙක්පත් බැංකුගත කිරීම', 'Deposit received cheques into bank accounts.'],
      [46, 'cheques.received_clear', 'cheques', 'clear', 'Mark Received Cheques Cleared', 'චෙක්පත් නිෂ්කාශනය සටහන් කිරීම', 'Record clearance of deposited cheques.'],
      [47, 'cheques.received_bounce', 'cheques', 'bounce', 'Record Received Cheque Bounce', 'අගරු වූ චෙක්පත් සටහන් කිරීම', 'Handle and reverse bounced inward cheques.'],
      [48, 'cheques.issued_view', 'cheques', 'view', 'View Issued Cheques', 'නිකුත් කළ චෙක්පත් බැලීම', 'View register of outward cheques issued.'],
      [49, 'cheques.issued_create', 'cheques', 'create', 'Create Issued Cheques', 'චෙක්පත් නිකුත් කිරීම', 'Issue and sign outward payment cheques.'],
      [50, 'cheques.issued_present_clear', 'cheques', 'clear', 'Mark Issued Cheques Presented/Cleared', 'නිකුත් කළ චෙක්පත් නිෂ්කාශනය', 'Record presentation and bank clearance of issued cheques.'],
      [51, 'cheques.cancel_reverse', 'cheques', 'cancel', 'Cancel or Reverse Cheques', 'චෙක්පත් අවලංගු කිරීම', 'Cancel or void issued or received cheques.'],
      [52, 'cheques.reports_view', 'cheques', 'export', 'View Cheque Reports', 'චෙක්පත් වාර්තා බැලීම', 'Generate and export cheque management reports.'],
    ];

    const insertPerm = db.prepare(`
      INSERT OR IGNORE INTO permissions (id, permission_key, module, action, name_en, name_si, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const p of permissions) {
      insertPerm.run(...p);
    }

    // 4. Assign default role permissions
    const insertRolePerm = db.prepare(`
      INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
      VALUES (?, ?)
    `);

    // Admin (Role 1), Treasurer (Role 3), Accountant (Role 4) get all cheque permissions (43..52)
    for (const rId of [1, 3, 4]) {
      for (let pId = 43; pId <= 52; pId++) {
        insertRolePerm.run(rId, pId);
      }
    }

    // Principal (Role 2) gets view, export, and cancel authority
    for (const pId of [43, 48, 51, 52]) {
      insertRolePerm.run(2, pId);
    }

    // Clerk / Data Entry Officer (Role 5) gets view, create, and deposit
    for (const pId of [43, 44, 45, 48, 49]) {
      insertRolePerm.run(5, pId);
    }

    // Auditor (Role 6) gets read-only view and reports
    for (const pId of [43, 48, 52]) {
      insertRolePerm.run(6, pId);
    }
  },
  down: (db: Database.Database): void => {
    db.exec(`
      DROP TABLE IF EXISTS cheque_audit_logs;
      DROP TABLE IF EXISTS cheques;
      DELETE FROM role_permissions WHERE permission_id BETWEEN 43 AND 52;
      DELETE FROM permissions WHERE id BETWEEN 43 AND 52;
    `);
  },
};

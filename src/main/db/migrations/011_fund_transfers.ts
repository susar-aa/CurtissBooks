import type Database from 'better-sqlite3';
import { Migration } from './001_initial_settings';

export const migration011: Migration = {
  id: 11,
  name: '011_fund_transfers',
  up: (db: Database.Database) => {
    // 1. Upgrade cash_transactions to support transfer_in & transfer_out in CHECK constraint
    db.exec(`
      CREATE TABLE IF NOT EXISTS cash_transactions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        financial_year_id INTEGER NOT NULL REFERENCES financial_years(id) ON DELETE RESTRICT,
        transaction_date TEXT NOT NULL,
        transaction_type TEXT NOT NULL CHECK (transaction_type IN ('receipt', 'payment', 'bank_deposit', 'petty_cash_transfer', 'adjustment', 'transfer_in', 'transfer_out')),
        amount_cents INTEGER NOT NULL,
        running_balance_cents INTEGER NOT NULL DEFAULT 0,
        reference_no TEXT,
        description TEXT NOT NULL,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO cash_transactions_new SELECT * FROM cash_transactions;
      DROP TABLE cash_transactions;
      ALTER TABLE cash_transactions_new RENAME TO cash_transactions;

      CREATE INDEX IF NOT EXISTS idx_cash_tx_year ON cash_transactions(financial_year_id);
      CREATE INDEX IF NOT EXISTS idx_cash_tx_date ON cash_transactions(transaction_date);
      CREATE INDEX IF NOT EXISTS idx_cash_tx_fy_date ON cash_transactions(financial_year_id, transaction_date);
    `);

    // 2. Upgrade petty_cash_vouchers to support transfer_out & transfer_in in CHECK constraint
    db.exec(`
      CREATE TABLE IF NOT EXISTS petty_cash_vouchers_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        voucher_no TEXT NOT NULL UNIQUE,
        voucher_date TEXT NOT NULL,
        financial_year_id INTEGER NOT NULL REFERENCES financial_years(id) ON DELETE RESTRICT,
        category_id INTEGER REFERENCES budget_categories(id),
        type TEXT NOT NULL CHECK (type IN ('expense', 'replenishment', 'transfer_out', 'transfer_in')),
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        payee TEXT NOT NULL,
        description TEXT NOT NULL,
        receipt_attached INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'rejected')),
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO petty_cash_vouchers_new SELECT * FROM petty_cash_vouchers;
      DROP TABLE petty_cash_vouchers;
      ALTER TABLE petty_cash_vouchers_new RENAME TO petty_cash_vouchers;

      CREATE INDEX IF NOT EXISTS idx_petty_cash_year ON petty_cash_vouchers(financial_year_id);
      CREATE INDEX IF NOT EXISTS idx_petty_cash_date ON petty_cash_vouchers(voucher_date);
      CREATE INDEX IF NOT EXISTS idx_petty_cash_fy_status ON petty_cash_vouchers(financial_year_id, status);
      CREATE INDEX IF NOT EXISTS idx_petty_cash_fy_cat ON petty_cash_vouchers(financial_year_id, category_id);
    `);

    // 3. Fund Transfers Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS fund_transfers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transfer_reference TEXT NOT NULL UNIQUE,
        financial_year_id INTEGER NOT NULL REFERENCES financial_years(id) ON DELETE RESTRICT,
        transfer_date TEXT NOT NULL,
        source_account_type TEXT NOT NULL CHECK (source_account_type IN ('cash', 'bank', 'petty_cash')),
        source_bank_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE RESTRICT,
        destination_account_type TEXT NOT NULL CHECK (destination_account_type IN ('cash', 'bank', 'petty_cash')),
        destination_bank_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE RESTRICT,
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        reference_no TEXT,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'reversed')),
        reversed_at TEXT,
        reversed_by INTEGER REFERENCES users(id),
        reversal_reason TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_fund_transfers_date ON fund_transfers(transfer_date);
      CREATE INDEX IF NOT EXISTS idx_fund_transfers_status ON fund_transfers(status);
      CREATE INDEX IF NOT EXISTS idx_fund_transfers_fy ON fund_transfers(financial_year_id);
      CREATE INDEX IF NOT EXISTS idx_fund_transfers_src_bank ON fund_transfers(source_bank_account_id);
      CREATE INDEX IF NOT EXISTS idx_fund_transfers_dst_bank ON fund_transfers(destination_bank_account_id);
    `);

    // 4. Seed Granular Permissions for Fund Transfers
    const permKeys = [
      ['fundTransfer.view', 'fundTransfer', 'view', 'View Fund Transfers', 'අරමුදල් මාරු කිරීම් බැලීම', 'View internal fund transfer history and balances.'],
      ['fundTransfer.create', 'fundTransfer', 'create', 'Create Fund Transfer', 'අරමුදල් මාරු කිරීම් සිදු කිරීම', 'Transfer money between cash, bank, and petty cash.'],
      ['fundTransfer.reverse', 'fundTransfer', 'reverse', 'Reverse Fund Transfer', 'අරමුදල් මාරු කිරීම් අවලංගු කිරීම', 'Reverse an executed fund transfer.'],
    ];

    for (const [key, mod, act, name_en, name_si, desc] of permKeys) {
      db.prepare(`
        INSERT OR IGNORE INTO permissions (permission_key, module, action, name_en, name_si, description)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(key, mod, act, name_en, name_si, desc);
    }

    const assignRolePerm = (roleId: number, permKey: string) => {
      const perm = db.prepare('SELECT id FROM permissions WHERE permission_key = ?').get(permKey) as { id: number } | undefined;
      if (perm) {
        db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)').run(roleId, perm.id);
      }
    };

    // Role 1 (Admin): view, create, reverse
    assignRolePerm(1, 'fundTransfer.view');
    assignRolePerm(1, 'fundTransfer.create');
    assignRolePerm(1, 'fundTransfer.reverse');

    // Role 2 (Principal): view
    assignRolePerm(2, 'fundTransfer.view');

    // Role 3 (Treasurer): view, create, reverse
    assignRolePerm(3, 'fundTransfer.view');
    assignRolePerm(3, 'fundTransfer.create');
    assignRolePerm(3, 'fundTransfer.reverse');

    // Role 4 (Accountant): view, create
    assignRolePerm(4, 'fundTransfer.view');
    assignRolePerm(4, 'fundTransfer.create');

    // Role 6 (Auditor): view
    assignRolePerm(6, 'fundTransfer.view');
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP TABLE IF EXISTS fund_transfers;
      DELETE FROM permissions WHERE permission_key IN ('fundTransfer.view', 'fundTransfer.create', 'fundTransfer.reverse');
    `);
  },
};

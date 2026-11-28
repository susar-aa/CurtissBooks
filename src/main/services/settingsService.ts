import Database from 'better-sqlite3';
import { getDatabase } from '../db';
import { CryptoService } from './cryptoService';
import { AuditService } from './auditService';

export interface BankAccountOpeningBalance {
  id: number;
  account_code: string;
  bank_name: string;
  branch_name: string;
  account_number: string;
  account_type: string;
  opening_balance_cents: number;
  current_balance_cents: number;
}

export interface OpeningBalancesData {
  financialYear: {
    id: number;
    year_name: string;
    start_date: string;
    end_date: string;
    is_current: boolean;
  } | null;
  cashOpeningBalanceCents: number;
  cashCurrentBalanceCents: number;
  pettyCashOpeningBalanceCents: number;
  pettyCashCurrentBalanceCents: number;
  bankAccounts: BankAccountOpeningBalance[];
}

export class SettingsService {
  public static getAll(): Record<string, string> {
    const db = getDatabase();
    const rows = db.prepare('SELECT key, value FROM application_settings').all() as { key: string; value: string }[];
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  public static get(key: string): string | null {
    const db = getDatabase();
    const row = db.prepare('SELECT value FROM application_settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? row.value : null;
  }

  public static set(key: string, value: string, description?: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO application_settings (key, value, description, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        description = COALESCE(excluded.description, application_settings.description),
        updated_at = CURRENT_TIMESTAMP
    `);
    const result = stmt.run(key, value, description || null);
    return result.changes > 0;
  }

  /**
   * Performs a complete application data reset (Factory Reset).
   * Erases all operational, financial, and user records.
   * Requires confirmation with an active Administrator 5-digit PIN.
   */
  public static factoryReset(adminPin: string): boolean {
    const db = getDatabase();
    const cleanPin = (adminPin || '').trim();

    if (!cleanPin) {
      throw new Error('Administrator PIN is required to authorize application factory reset.');
    }

    // Explicit JOIN, explicit columns
    const adminUsers = db.prepare(`
      SELECT u.id, u.username, u.full_name, u.pin_hash
      FROM users u
      INNER JOIN roles r ON u.role_id = r.id
      WHERE u.status = 'active' AND (u.role_id = 1 OR r.role_key = 'admin') AND u.pin_hash IS NOT NULL
    `).all() as { id: number; username: string; full_name: string; pin_hash: string }[];

    let matchedAdmin: any = null;
    for (const admin of adminUsers) {
      if (CryptoService.verifyPassword(cleanPin, admin.pin_hash)) {
        matchedAdmin = admin;
        break;
      }
    }

    if (!matchedAdmin) {
      throw new Error('Invalid Administrator PIN. Application reset unauthorized.');
    }

    // Execute atomic wipe of all user and institutional data
    db.pragma('foreign_keys = OFF');
    const resetTransaction = db.transaction(() => {
      // 1. Transactional & Accounting Tables
      try { db.prepare('DELETE FROM expenses').run(); } catch {}
      try { db.prepare('DELETE FROM petty_cash_vouchers').run(); } catch {}
      try { db.prepare('DELETE FROM cheque_audit_logs').run(); } catch {}
      try { db.prepare('DELETE FROM cheques').run(); } catch {}
      try { db.prepare('DELETE FROM fund_usage_traces').run(); } catch {}
      try { db.prepare('DELETE FROM fund_transfers').run(); } catch {}
      try { db.prepare('DELETE FROM fund_receipts').run(); } catch {}
      try { db.prepare('DELETE FROM funds').run(); } catch {}
      try { db.prepare('DELETE FROM fund_categories').run(); } catch {}
      try { db.prepare('DELETE FROM budget_reallocations').run(); } catch {}
      try { db.prepare('DELETE FROM budget_revisions').run(); } catch {}
      try { db.prepare('DELETE FROM financial_year_budget_allocations').run(); } catch {}
      try { db.prepare('DELETE FROM budget_categories').run(); } catch {}
      try { db.prepare('DELETE FROM annual_budgets').run(); } catch {}
      try { db.prepare('DELETE FROM financial_years').run(); } catch {}
      try { db.prepare('DELETE FROM periodic_statement_adjustments').run(); } catch {}
      try { db.prepare('DELETE FROM periodic_statement_mappings').run(); } catch {}

      // 2. Bank Accounts & Reconciliations
      try { db.prepare('DELETE FROM bank_reconciliation_audit_logs').run(); } catch {}
      try { db.prepare('DELETE FROM bank_reconciliation_matches').run(); } catch {}
      try { db.prepare('DELETE FROM bank_reconciliation_sessions').run(); } catch {}
      try { db.prepare('DELETE FROM bank_reconciliations').run(); } catch {}
      try { db.prepare('DELETE FROM bank_statement_transactions').run(); } catch {}
      try { db.prepare('DELETE FROM bank_statement_imports').run(); } catch {}
      try { db.prepare('DELETE FROM bank_transactions').run(); } catch {}
      try { db.prepare('DELETE FROM bank_accounts').run(); } catch {}

      // 3. General Ledger & Cash Book
      try { db.prepare('DELETE FROM cash_transactions').run(); } catch {}
      try { db.prepare('DELETE FROM journal_lines').run(); } catch {}
      try { db.prepare('DELETE FROM journal_entries').run(); } catch {}
      try { db.prepare('DELETE FROM chart_of_accounts').run(); } catch {}

      // 4. Academic & Students
      try { db.prepare('DELETE FROM student_activity_logs').run(); } catch {}
      try { db.prepare('DELETE FROM student_class_history').run(); } catch {}
      try { db.prepare('DELETE FROM student_guardians').run(); } catch {}
      try { db.prepare('DELETE FROM student_status_history').run(); } catch {}
      try { db.prepare('DELETE FROM students').run(); } catch {}
      try { db.prepare('DELETE FROM classes').run(); } catch {}
      try { db.prepare('DELETE FROM grades').run(); } catch {}
      try { db.prepare('DELETE FROM academic_years').run(); } catch {}

      // 5. School Profile & Non-System Settings
      try { db.prepare('DELETE FROM school_profile').run(); } catch {}
      try {
        db.prepare(`
          DELETE FROM application_settings 
          WHERE key NOT IN ('app_name', 'app_version', 'default_language')
        `).run();
      } catch {}

      // 6. Auth, Sessions & Users
      try { db.prepare('DELETE FROM authentication_audit_logs').run(); } catch {}
      try { db.prepare('DELETE FROM login_attempts').run(); } catch {}
      try { db.prepare('DELETE FROM user_sessions').run(); } catch {}
      try { db.prepare('DELETE FROM users').run(); } catch {}

      // 7. Reset autoincrement sequences
      try { db.prepare('DELETE FROM sqlite_sequence').run(); } catch {}
    });

    resetTransaction();
    db.pragma('foreign_keys = ON');

    return true;
  }

  /**
   * Resolves the target financial year for opening balances.
   * If none exists in the system (e.g. fresh install or after factory reset),
   * automatically creates a default active financial year for the current calendar year.
   */
  public static resolveOrCreateFinancialYear(db: Database.Database, financialYearId?: number): {
    id: number;
    year_name: string;
    start_date: string;
    end_date: string;
    is_current: boolean;
  } {
    let fy: any = null;
    if (financialYearId) {
      fy = db.prepare(`
        SELECT id, year_name, start_date, end_date, is_current
        FROM financial_years
        WHERE id = ?
      `).get(financialYearId);
    }

    if (!fy) {
      fy = db.prepare(`
        SELECT id, year_name, start_date, end_date, is_current
        FROM financial_years
        WHERE is_current = 1
        ORDER BY id DESC LIMIT 1
      `).get();
    }

    if (!fy) {
      fy = db.prepare(`
        SELECT id, year_name, start_date, end_date, is_current
        FROM financial_years
        ORDER BY id DESC LIMIT 1
      `).get();
    }

    if (!fy) {
      const curYear = new Date().getFullYear();
      const yearName = `FY-${curYear}`;
      const startDate = `${curYear}-01-01`;
      const endDate = `${curYear}-12-31`;

      const insertRes = db.prepare(`
        INSERT INTO financial_years (
          year_name, start_date, end_date, status, is_current, updated_at
        ) VALUES (?, ?, ?, 'open', 1, CURRENT_TIMESTAMP)
      `).run(yearName, startDate, endDate);

      fy = {
        id: Number(insertRes.lastInsertRowid),
        year_name: yearName,
        start_date: startDate,
        end_date: endDate,
        is_current: 1,
      };
    }

    return {
      id: fy.id,
      year_name: fy.year_name,
      start_date: fy.start_date,
      end_date: fy.end_date,
      is_current: Boolean(fy.is_current),
    };
  }

  /**
   * Retrieves opening balances for Cash in Hand, Bank Accounts, and Petty Cash Float.
   */
  public static getOpeningBalances(financialYearId?: number): OpeningBalancesData {
    const db = getDatabase();

    // 1. Resolve or Create Financial Year
    const fy = this.resolveOrCreateFinancialYear(db, financialYearId);
    const yearId = fy.id;

    // 2. Cash in Hand Opening & Current Balance
    const cashOpnRow = db.prepare(`
      SELECT amount_cents
      FROM cash_transactions
      WHERE financial_year_id = ? AND reference_no = 'OPN-CASH'
      LIMIT 1
    `).get(yearId) as { amount_cents: number } | undefined;

    let cashOpeningBalanceCents = cashOpnRow ? Number(cashOpnRow.amount_cents) : 0;
    if (!cashOpnRow) {
      const settingVal = this.get(`opening_balance_cash_cents_${yearId}`) || this.get('opening_balance_cash_cents');
      if (settingVal) cashOpeningBalanceCents = Number(settingVal);
    }

    const lastCashRow = db.prepare(`
      SELECT running_balance_cents
      FROM cash_transactions
      WHERE financial_year_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(yearId) as { running_balance_cents: number } | undefined;
    const cashCurrentBalanceCents = lastCashRow ? Number(lastCashRow.running_balance_cents) : cashOpeningBalanceCents;

    // 3. Petty Cash Float Opening & Current Balance
    const pettyOpnRow = db.prepare(`
      SELECT amount_cents
      FROM petty_cash_vouchers
      WHERE financial_year_id = ? AND voucher_no = 'OPN-PETTY-CASH'
      LIMIT 1
    `).get(yearId) as { amount_cents: number } | undefined;

    let pettyCashOpeningBalanceCents = pettyOpnRow ? Number(pettyOpnRow.amount_cents) : 0;
    if (!pettyOpnRow) {
      const settingVal = this.get(`opening_balance_petty_cash_cents_${yearId}`) || this.get('opening_balance_petty_cash_cents');
      if (settingVal) pettyCashOpeningBalanceCents = Number(settingVal);
    }

    const pettyBalRow = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN type IN ('replenishment', 'transfer_in') AND status = 'approved' THEN amount_cents ELSE -amount_cents END), 0) as bal
      FROM petty_cash_vouchers
      WHERE financial_year_id = ? AND status = 'approved'
    `).get(yearId) as { bal: number } | undefined;
    const pettyCashCurrentBalanceCents = pettyBalRow ? Number(pettyBalRow.bal) : pettyCashOpeningBalanceCents;

    // 4. Active Bank Accounts
    const bankAccounts = db.prepare(`
      SELECT id, account_code, bank_name, branch_name, account_number, account_type,
             opening_balance_cents, current_balance_cents
      FROM bank_accounts
      WHERE status = 'active'
      ORDER BY id ASC
    `).all() as BankAccountOpeningBalance[];

    return {
      financialYear: fy ? {
        id: fy.id,
        year_name: fy.year_name,
        start_date: fy.start_date,
        end_date: fy.end_date,
        is_current: Boolean(fy.is_current),
      } : null,
      cashOpeningBalanceCents,
      cashCurrentBalanceCents,
      pettyCashOpeningBalanceCents,
      pettyCashCurrentBalanceCents,
      bankAccounts,
    };
  }

  /**
   * Sets or adjusts opening balances for Cash in Hand, Bank Accounts, and Petty Cash Float.
   * Synchronizes opening vouchers, running balance ledgers, and database records atomically.
   */
  public static updateOpeningBalances(
    data: {
      financialYearId?: number;
      cashOpeningBalanceCents: number;
      pettyCashOpeningBalanceCents: number;
      bankAccounts: Array<{
        id: number;
        opening_balance_cents: number;
      }>;
    },
    userId?: number
  ): boolean {
    const db = getDatabase();

    // 1. Resolve or Create Financial Year
    const fy = this.resolveOrCreateFinancialYear(db, data.financialYearId);
    const yearId = fy.id;
    const txDate = fy.start_date || new Date().toISOString().split('T')[0];

    // 2. Validate User ID against users table for foreign key safety
    let validUserId: number | null = null;
    if (userId) {
      const userRow = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
      if (userRow) validUserId = userId;
    }
    if (!validUserId) {
      const adminRow = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get() as { id: number } | undefined;
      if (adminRow) validUserId = adminRow.id;
    }

    const tx = db.transaction(() => {
      // A. Update Bank Accounts Opening Balances
      if (Array.isArray(data.bankAccounts)) {
        for (const item of data.bankAccounts) {
          const bank = db.prepare(`
            SELECT id, opening_balance_cents, current_balance_cents
            FROM bank_accounts
            WHERE id = ?
          `).get(item.id) as { id: number; opening_balance_cents: number; current_balance_cents: number } | undefined;

          if (bank) {
            const oldOpen = Number(bank.opening_balance_cents || 0);
            const newOpen = Math.max(0, Math.round(Number(item.opening_balance_cents || 0)));
            const delta = newOpen - oldOpen;

            db.prepare(`
              UPDATE bank_accounts
              SET opening_balance_cents = ?,
                  current_balance_cents = current_balance_cents + ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(newOpen, delta, item.id);
          }
        }
      }

      // B. Update Cash in Hand Opening Balance
      const cashCents = Math.max(0, Math.round(Number(data.cashOpeningBalanceCents || 0)));
      this.set('opening_balance_cash_cents', String(cashCents), 'Opening Balance for Cash in Hand');
      this.set(`opening_balance_cash_cents_${yearId}`, String(cashCents), `Opening Balance for Cash in Hand FY ${yearId}`);

      const existingCashOpn = db.prepare(`
        SELECT id
        FROM cash_transactions
        WHERE financial_year_id = ? AND reference_no = 'OPN-CASH'
        LIMIT 1
      `).get(yearId) as { id: number } | undefined;

      if (existingCashOpn) {
        if (cashCents > 0) {
          db.prepare(`
            UPDATE cash_transactions
            SET amount_cents = ?,
                transaction_date = ?,
                description = 'Cash in Hand Opening Balance'
            WHERE id = ?
          `).run(cashCents, txDate, existingCashOpn.id);
        } else {
          db.prepare('DELETE FROM cash_transactions WHERE id = ?').run(existingCashOpn.id);
        }
      } else if (cashCents > 0) {
        db.prepare(`
          INSERT INTO cash_transactions (
            financial_year_id, transaction_date, transaction_type,
            amount_cents, running_balance_cents, reference_no, description, created_by
          ) VALUES (?, ?, 'adjustment', ?, ?, 'OPN-CASH', 'Cash in Hand Opening Balance', ?)
        `).run(yearId, txDate, cashCents, cashCents, validUserId);
      }

      // Recalculate running_balance_cents for all cash transactions in this financial year
      const allCashTx = db.prepare(`
        SELECT id, amount_cents
        FROM cash_transactions
        WHERE financial_year_id = ?
        ORDER BY transaction_date ASC, id ASC
      `).all(yearId) as { id: number; amount_cents: number }[];

      let cashRunning = 0;
      const updateCashRunning = db.prepare('UPDATE cash_transactions SET running_balance_cents = ? WHERE id = ?');
      for (const ctx of allCashTx) {
        cashRunning += Number(ctx.amount_cents || 0);
        updateCashRunning.run(cashRunning, ctx.id);
      }

      // C. Update Petty Cash Float Opening Balance
      const pettyCents = Math.max(0, Math.round(Number(data.pettyCashOpeningBalanceCents || 0)));
      this.set('opening_balance_petty_cash_cents', String(pettyCents), 'Opening Balance for Petty Cash Float');
      this.set(`opening_balance_petty_cash_cents_${yearId}`, String(pettyCents), `Opening Balance for Petty Cash Float FY ${yearId}`);

      const existingPettyOpn = db.prepare(`
        SELECT id
        FROM petty_cash_vouchers
        WHERE financial_year_id = ? AND voucher_no = 'OPN-PETTY-CASH'
        LIMIT 1
      `).get(yearId) as { id: number } | undefined;

      if (existingPettyOpn) {
        if (pettyCents > 0) {
          db.prepare(`
            UPDATE petty_cash_vouchers
            SET amount_cents = ?,
                voucher_date = ?,
                description = 'Opening Petty Cash Float',
                payee = 'School Impress / Float Opening',
                type = 'replenishment',
                status = 'approved'
            WHERE id = ?
          `).run(pettyCents, txDate, existingPettyOpn.id);
        } else {
          db.prepare('DELETE FROM petty_cash_vouchers WHERE id = ?').run(existingPettyOpn.id);
        }
      } else if (pettyCents > 0) {
        db.prepare(`
          INSERT INTO petty_cash_vouchers (
            voucher_no, voucher_date, financial_year_id,
            type, amount_cents, payee, description, receipt_attached, status, created_by
          ) VALUES ('OPN-PETTY-CASH', ?, ?, 'replenishment', ?, 'School Impress / Float Opening', 'Opening Petty Cash Float', 0, 'approved', ?)
        `).run(txDate, yearId, pettyCents, validUserId);
      }

      AuditService.logAuthEvent(
        validUserId,
        'system',
        'OPENING_BALANCES_UPDATED',
        `fy:${yearId}`,
        'success',
        `Cash: Rs. ${(cashCents / 100).toFixed(2)}, Petty: Rs. ${(pettyCents / 100).toFixed(2)}`
      );
    });

    tx();
    return true;
  }
}


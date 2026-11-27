import { getDatabase } from '../db';
import { CryptoService } from './cryptoService';

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
}


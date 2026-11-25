import { getDatabase } from '../db';
import { AuditLogItem } from '../../shared/types/auth';

export class AuditService {
  public static logAuthEvent(
    userId: number | null,
    username: string,
    action: string,
    recordRef: string | null,
    result: 'success' | 'failure',
    details: string | null = null
  ): void {
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        INSERT INTO authentication_audit_logs (user_id, username, action, record_ref, result, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      stmt.run(userId, username, action, recordRef, result, details);
    } catch (e) {
      console.error('[Audit Log Error] Failed to write audit event:', e);
    }
  }

  public static getLogs(limit = 50, offset = 0): AuditLogItem[] {
    const db = getDatabase();
    const safeLimit = Math.min(Math.max(1, limit), 200);
    const safeOffset = Math.max(0, offset);

    const stmt = db.prepare(`
      SELECT id, user_id, username, action, record_ref, result, details, created_at
      FROM authentication_audit_logs
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `);

    return stmt.all(safeLimit, safeOffset) as AuditLogItem[];
  }
}


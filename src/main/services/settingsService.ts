import { getDatabase } from '../db';

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
}


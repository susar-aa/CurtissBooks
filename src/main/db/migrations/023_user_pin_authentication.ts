import type Database from 'better-sqlite3';
import { Migration } from './001_initial_settings';
import { CryptoService } from '../../services/cryptoService';

export const migration023: Migration = {
  id: 23,
  name: '023_user_pin_authentication',
  up: (db: Database.Database) => {
    // 1. Add pin_hash column to users table if not exists
    const tableInfo = db.pragma('table_info(users)') as { name: string }[];
    const hasPinHash = tableInfo.some((col) => col.name === 'pin_hash');

    if (!hasPinHash) {
      db.exec(`
        ALTER TABLE users ADD COLUMN pin_hash TEXT;
      `);
    }

    // 2. Index for fast user status and authentication lookup
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_status_pin ON users (status, id);
    `);

    // 3. Initialize default PIN '12345' for existing active users who do not have a pin_hash
    const defaultPinHash = CryptoService.hashPassword('12345');
    const existingUsers = db.prepare(`
      SELECT id FROM users WHERE pin_hash IS NULL
    `).all() as { id: number }[];

    const updatePin = db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?');
    for (const u of existingUsers) {
      updatePin.run(defaultPinHash, u.id);
    }
  },
};

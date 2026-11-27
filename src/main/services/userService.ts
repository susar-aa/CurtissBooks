import { getDatabase } from '../db';
import { CryptoService } from './cryptoService';
import { AuditService } from './auditService';
import { User, UserStatus } from '../../shared/types/auth';

export class UserService {
  public static getAllUsers(): User[] {
    const db = getDatabase();
    // Explicit JOIN, no subquery, explicit column selection
    const rows = db.prepare(`
      SELECT u.id, u.username, u.full_name, u.role_id, u.status, u.created_at, u.updated_at,
             u.created_by, u.last_login_at, u.password_changed_at,
             r.role_key, r.name_en as role_name_en, r.name_si as role_name_si
      FROM users u
      INNER JOIN roles r ON u.role_id = r.id
      ORDER BY u.id ASC
    `).all() as any[];

    return rows as User[];
  }

  public static getUserById(id: number): User {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT u.id, u.username, u.full_name, u.role_id, u.status, u.created_at, u.updated_at,
             u.created_by, u.last_login_at, u.password_changed_at,
             r.role_key, r.name_en as role_name_en, r.name_si as role_name_si
      FROM users u
      INNER JOIN roles r ON u.role_id = r.id
      WHERE u.id = ?
    `).get(id) as any;

    if (!row) throw new Error(`User #${id} not found.`);
    return row as User;
  }

  public static createUser(
    data: {
      fullName: string;
      username: string;
      password?: string;
      pin?: string;
      roleId: number;
    },
    creatorUserId: number | null
  ): User {
    const db = getDatabase();
    const fullName = data.fullName.trim();
    const username = data.username.trim().toLowerCase();

    if (!fullName) throw new Error('Full name is required.');
    if (!username || username.length < 3) throw new Error('Username must be at least 3 characters.');

    // Check duplicate username
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      throw new Error(`Username "${username}" is already taken.`);
    }

    // Check role exists
    const role = db.prepare('SELECT id FROM roles WHERE id = ?').get(data.roleId);
    if (!role) {
      throw new Error(`Specified role #${data.roleId} does not exist.`);
    }

    // Validate and hash password
    const rawPassword = data.password && data.password.trim().length >= 8 ? data.password : 'User@12345';
    const hash = CryptoService.hashPassword(rawPassword);

    // Validate and hash 5-digit PIN
    const rawPin = data.pin && data.pin.trim() ? data.pin.trim() : '12345';
    const pinValidation = CryptoService.validatePin(rawPin);
    if (!pinValidation.valid) throw new Error(pinValidation.message);

    // Check PIN uniqueness among existing users
    const existingPins = db.prepare('SELECT id, username, pin_hash FROM users WHERE pin_hash IS NOT NULL').all() as { id: number; username: string; pin_hash: string }[];
    for (const u of existingPins) {
      if (CryptoService.verifyPassword(rawPin, u.pin_hash)) {
        throw new Error(`This 5-digit PIN is already assigned to @${u.username}. Please choose a unique PIN.`);
      }
    }
    const pinHash = CryptoService.hashPassword(rawPin);

    const stmt = db.prepare(`
      INSERT INTO users (username, full_name, password_hash, pin_hash, role_id, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    const result = stmt.run(username, fullName, hash, pinHash, data.roleId, creatorUserId);
    const newId = Number(result.lastInsertRowid);

    AuditService.logAuthEvent(
      creatorUserId,
      creatorUserId ? String(creatorUserId) : 'system',
      'USER_CREATED',
      `users:${newId}`,
      'success',
      `Created user ${username} with role ${data.roleId} and 5-digit PIN`
    );

    return this.getUserById(newId);
  }

  public static updateUser(
    id: number,
    data: { fullName: string; roleId: number },
    updaterUserId: number | null
  ): User {
    const db = getDatabase();
    const existing = this.getUserById(id);

    // If changing role away from admin, protect last admin
    if (existing.role_id === 1 && data.roleId !== 1) {
      const activeAdminCount = db.prepare(`
        SELECT COUNT(*) as count FROM users WHERE role_id = 1 AND status = 'active' AND id != ?
      `).get(id) as { count: number };

      if (activeAdminCount.count === 0) {
        throw new Error('Cannot change role of the last active administrator.');
      }
    }

    const stmt = db.prepare(`
      UPDATE users
      SET full_name = ?, role_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(data.fullName.trim(), data.roleId, id);

    AuditService.logAuthEvent(
      updaterUserId,
      updaterUserId ? String(updaterUserId) : 'system',
      'USER_UPDATED',
      `users:${id}`,
      'success',
      `Updated user #${id} (Name: ${data.fullName}, Role: ${data.roleId})`
    );

    return this.getUserById(id);
  }

  public static setUserStatus(id: number, status: UserStatus, updaterUserId: number | null): boolean {
    const db = getDatabase();
    const user = this.getUserById(id);

    // If deactivating, protect the last active administrator
    if ((status === 'inactive' || status === 'locked') && user.role_id === 1 && user.status === 'active') {
      const activeAdminCount = db.prepare(`
        SELECT COUNT(*) as count FROM users WHERE role_id = 1 AND status = 'active' AND id != ?
      `).get(id) as { count: number };

      if (activeAdminCount.count === 0) {
        throw new Error('Cannot deactivate the last active administrator.');
      }
    }

    const stmt = db.prepare(`
      UPDATE users
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const result = stmt.run(status, id);

    // If deactivating, invalidate any active sessions
    if (status !== 'active') {
      db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(id);
    }

    AuditService.logAuthEvent(
      updaterUserId,
      updaterUserId ? String(updaterUserId) : 'system',
      'USER_STATUS_CHANGED',
      `users:${id}`,
      'success',
      `Changed user #${id} status to ${status}`
    );

    return result.changes > 0;
  }

  public static resetPassword(id: number, newPassword: string, adminUserId: number | null): boolean {
    const db = getDatabase();
    this.getUserById(id); // Ensure user exists

    const strength = CryptoService.validatePasswordStrength(newPassword);
    if (!strength.valid) throw new Error(strength.message);

    const hash = CryptoService.hashPassword(newPassword);

    const stmt = db.prepare(`
      UPDATE users
      SET password_hash = ?, password_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const result = stmt.run(hash, id);

    // Invalidate sessions on password reset
    db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(id);

    AuditService.logAuthEvent(
      adminUserId,
      adminUserId ? String(adminUserId) : 'system',
      'PASSWORD_RESET',
      `users:${id}`,
      'success',
      `Password reset for user #${id}`
    );

    return result.changes > 0;
  }

  public static resetPin(id: number, newPin: string, adminUserId: number | null): boolean {
    const db = getDatabase();
    this.getUserById(id); // Ensure user exists

    const cleanPin = (newPin || '').trim();
    const validation = CryptoService.validatePin(cleanPin);
    if (!validation.valid) throw new Error(validation.message);

    // Ensure PIN is unique among users
    const usersWithPin = db.prepare(`
      SELECT id, username, pin_hash FROM users WHERE pin_hash IS NOT NULL AND id != ?
    `).all(id) as { id: number; username: string; pin_hash: string }[];

    for (const u of usersWithPin) {
      if (CryptoService.verifyPassword(cleanPin, u.pin_hash)) {
        throw new Error(`This 5-digit PIN is already assigned to @${u.username}. Please choose a different PIN.`);
      }
    }

    const hash = CryptoService.hashPassword(cleanPin);

    const stmt = db.prepare(`
      UPDATE users
      SET pin_hash = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const result = stmt.run(hash, id);

    AuditService.logAuthEvent(
      adminUserId,
      adminUserId ? String(adminUserId) : 'system',
      'PIN_RESET',
      `users:${id}`,
      'success',
      `5-digit PIN updated for user #${id}`
    );

    return result.changes > 0;
  }
}


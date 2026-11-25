import { getDatabase } from '../db';
import { CryptoService } from './cryptoService';
import { AuditService } from './auditService';
import { User, AuthSession } from '../../shared/types/auth';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MINUTES = 15;
const SESSION_EXPIRY_HOURS = 24;

export class AuthService {
  /**
   * Checks if initial administrator provisioning is required.
   */
  public static checkSetupRequired(): boolean {
    const db = getDatabase();
    const count = db.prepare('SELECT COUNT(*) as count FROM users WHERE role_id = 1').get() as { count: number };
    return count.count === 0;
  }

  /**
   * Creates the first administrator account (can only be called once).
   */
  public static setupInitialAdmin(data: {
    fullName: string;
    username: string;
    password: string;
  }): AuthSession {
    const db = getDatabase();

    // Enforce that setup can only be run once
    if (!this.checkSetupRequired()) {
      throw new Error('Initial setup has already been completed.');
    }

    const trimmedName = data.fullName.trim();
    const trimmedUser = data.username.trim().toLowerCase();

    if (!trimmedName) throw new Error('Full name is required.');
    if (!trimmedUser || trimmedUser.length < 3) throw new Error('Username must be at least 3 characters.');

    const strength = CryptoService.validatePasswordStrength(data.password);
    if (!strength.valid) throw new Error(strength.message);

    const passwordHash = CryptoService.hashPassword(data.password);

    const insertUser = db.prepare(`
      INSERT INTO users (username, full_name, password_hash, role_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 1, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    const result = insertUser.run(trimmedUser, trimmedName, passwordHash);
    const userId = Number(result.lastInsertRowid);

    AuditService.logAuthEvent(userId, trimmedUser, 'INITIAL_ADMIN_SETUP', `users:${userId}`, 'success', 'Initial administrator provisioned');

    return this.createSession(userId, trimmedUser);
  }

  /**
   * Performs credential verification and issues a local session.
   */
  public static login(username: string, password: string, ipOrDevice = 'localhost'): AuthSession {
    const db = getDatabase();
    const cleanUser = (username || '').trim().toLowerCase();

    if (!cleanUser || !password) {
      throw new Error('Username and password are required.');
    }

    // Check account lockout window
    const recentFailures = db.prepare(`
      SELECT COUNT(*) as count FROM login_attempts
      WHERE username = ? AND success = 0 AND attempted_at >= datetime('now', '-' || ? || ' minutes')
    `).get(cleanUser, LOCKOUT_WINDOW_MINUTES) as { count: number };

    if (recentFailures.count >= MAX_FAILED_ATTEMPTS) {
      AuditService.logAuthEvent(null, cleanUser, 'LOGIN_BLOCKED', null, 'failure', 'Temporary lockout due to repeated failures');
      throw new Error(`Account is temporarily locked due to multiple failed login attempts. Please try again in ${LOCKOUT_WINDOW_MINUTES} minutes.`);
    }

    // Query user record with role information
    const userRow = db.prepare(`
      SELECT u.id, u.username, u.full_name, u.password_hash, u.role_id, u.status,
             r.role_key, r.name_en as role_name_en, r.name_si as role_name_si
      FROM users u
      INNER JOIN roles r ON u.role_id = r.id
      WHERE u.username = ?
    `).get(cleanUser) as any;

    const recordAttempt = db.prepare(`
      INSERT INTO login_attempts (username, ip_or_device, success, failure_reason)
      VALUES (?, ?, ?, ?)
    `);

    if (!userRow) {
      recordAttempt.run(cleanUser, ipOrDevice, 0, 'User not found');
      AuditService.logAuthEvent(null, cleanUser, 'LOGIN_FAILED', null, 'failure', 'User not found');
      throw new Error('Invalid username or password.');
    }

    if (userRow.status === 'inactive') {
      recordAttempt.run(cleanUser, ipOrDevice, 0, 'Account inactive');
      AuditService.logAuthEvent(userRow.id, cleanUser, 'LOGIN_REJECTED', `users:${userRow.id}`, 'failure', 'Account is inactive');
      throw new Error('Your account has been deactivated. Please contact an administrator.');
    }

    if (userRow.status === 'locked') {
      recordAttempt.run(cleanUser, ipOrDevice, 0, 'Account locked');
      AuditService.logAuthEvent(userRow.id, cleanUser, 'LOGIN_REJECTED', `users:${userRow.id}`, 'failure', 'Account is locked');
      throw new Error('Account is locked. Please contact an administrator.');
    }

    // Verify password hash
    const isValid = CryptoService.verifyPassword(password, userRow.password_hash);
    if (!isValid) {
      recordAttempt.run(cleanUser, ipOrDevice, 0, 'Incorrect password');
      AuditService.logAuthEvent(userRow.id, cleanUser, 'LOGIN_FAILED', `users:${userRow.id}`, 'failure', 'Incorrect password');

      // Check if threshold reached
      if (recentFailures.count + 1 >= MAX_FAILED_ATTEMPTS) {
        db.prepare("UPDATE users SET status = 'locked', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(userRow.id);
        AuditService.logAuthEvent(userRow.id, cleanUser, 'ACCOUNT_LOCKED', `users:${userRow.id}`, 'failure', 'Threshold exceeded');
      }

      throw new Error('Invalid username or password.');
    }

    // Successful login
    recordAttempt.run(cleanUser, ipOrDevice, 1, null);
    db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(userRow.id);

    AuditService.logAuthEvent(userRow.id, cleanUser, 'LOGIN_SUCCESS', `users:${userRow.id}`, 'success');

    return this.createSession(userRow.id, cleanUser);
  }

  /**
   * Creates a session record and returns user with permissions.
   */
  private static createSession(userId: number, username: string): AuthSession {
    const db = getDatabase();
    const sessionToken = CryptoService.generateSessionToken();

    const insertSession = db.prepare(`
      INSERT INTO user_sessions (session_token, user_id, expires_at, is_locked, last_activity_at)
      VALUES (?, ?, datetime('now', '+' || ? || ' hours'), 0, CURRENT_TIMESTAMP)
    `);
    insertSession.run(sessionToken, userId, SESSION_EXPIRY_HOURS);

    const user = this.getUserById(userId);
    const permissions = this.getUserPermissions(user.role_id);

    return {
      sessionToken,
      user,
      permissions,
      isLocked: false,
    };
  }

  public static getUserById(userId: number): User {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT u.id, u.username, u.full_name, u.role_id, u.status, u.created_at, u.updated_at,
             u.created_by, u.last_login_at, u.password_changed_at,
             r.role_key, r.name_en as role_name_en, r.name_si as role_name_si
      FROM users u
      INNER JOIN roles r ON u.role_id = r.id
      WHERE u.id = ?
    `).get(userId) as any;

    if (!row) throw new Error(`User ${userId} not found.`);
    return row as User;
  }

  public static getUserPermissions(roleId: number): string[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT p.permission_key
      FROM permissions p
      INNER JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = ?
    `).all(roleId) as { permission_key: string }[];

    return rows.map((r) => r.permission_key);
  }

  public static validateSession(sessionToken: string): AuthSession | null {
    if (!sessionToken) return null;
    const db = getDatabase();

    const sessionRow = db.prepare(`
      SELECT s.session_token, s.user_id, s.is_locked, s.expires_at,
             u.status
      FROM user_sessions s
      INNER JOIN users u ON s.user_id = u.id
      WHERE s.session_token = ? AND s.expires_at > datetime('now')
    `).get(sessionToken) as any;

    if (!sessionRow || sessionRow.status !== 'active') {
      return null;
    }

    // Refresh last activity
    db.prepare('UPDATE user_sessions SET last_activity_at = CURRENT_TIMESTAMP WHERE session_token = ?').run(sessionToken);

    const user = this.getUserById(sessionRow.user_id);
    const permissions = this.getUserPermissions(user.role_id);

    return {
      sessionToken,
      user,
      permissions,
      isLocked: Boolean(sessionRow.is_locked),
    };
  }

  public static lockSession(sessionToken: string): boolean {
    const db = getDatabase();
    const result = db.prepare('UPDATE user_sessions SET is_locked = 1 WHERE session_token = ?').run(sessionToken);
    return result.changes > 0;
  }

  public static unlockSession(sessionToken: string, password: string): boolean {
    const db = getDatabase();
    const session = db.prepare(`
      SELECT s.user_id, u.password_hash, u.username
      FROM user_sessions s
      INNER JOIN users u ON s.user_id = u.id
      WHERE s.session_token = ?
    `).get(sessionToken) as any;

    if (!session) return false;

    const isValid = CryptoService.verifyPassword(password, session.password_hash);
    if (!isValid) {
      AuditService.logAuthEvent(session.user_id, session.username, 'UNLOCK_FAILED', null, 'failure', 'Incorrect unlock password');
      return false;
    }

    db.prepare('UPDATE user_sessions SET is_locked = 0, last_activity_at = CURRENT_TIMESTAMP WHERE session_token = ?').run(sessionToken);
    AuditService.logAuthEvent(session.user_id, session.username, 'SESSION_UNLOCKED', null, 'success');
    return true;
  }

  public static logout(sessionToken: string): boolean {
    const db = getDatabase();
    const session = db.prepare(`
      SELECT s.user_id, u.username
      FROM user_sessions s
      INNER JOIN users u ON s.user_id = u.id
      WHERE s.session_token = ?
    `).get(sessionToken) as any;

    if (session) {
      AuditService.logAuthEvent(session.user_id, session.username, 'LOGOUT', null, 'success');
    }

    const result = db.prepare('DELETE FROM user_sessions WHERE session_token = ?').run(sessionToken);
    return result.changes > 0;
  }
}


import { getDatabase } from '../db';
import { CryptoService } from './cryptoService';
import { AuditService } from './auditService';
import { User, AuthSession } from '../../shared/types/auth';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MINUTES = 15;
const SESSION_EXPIRY_HOURS = 24;
export const DEVELOPER_LICENSE_PIN = '200611003614';

export class AuthService {
  /**
   * Verifies the master developer license PIN required during initial installation.
   */
  public static verifyDeveloperPin(developerPin: string): boolean {
    return (developerPin || '').trim() === DEVELOPER_LICENSE_PIN;
  }

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
   * Strictly requires valid Developer License PIN verification.
   */
  public static setupInitialAdmin(data: {
    fullName: string;
    username: string;
    password?: string;
    pin?: string;
    developerPin?: string;
  }): AuthSession {
    const db = getDatabase();

    // Enforce that setup can only be run once
    if (!this.checkSetupRequired()) {
      throw new Error('Initial setup has already been completed.');
    }

    // Enforce Developer License PIN verification to prevent unauthorized installations
    if (!data.developerPin || data.developerPin.trim() !== DEVELOPER_LICENSE_PIN) {
      throw new Error('Invalid Developer License PIN. System installation unauthorized.');
    }

    const trimmedName = data.fullName.trim();
    const trimmedUser = data.username.trim().toLowerCase();

    if (!trimmedName) throw new Error('Full name is required.');
    if (!trimmedUser || trimmedUser.length < 3) throw new Error('Username must be at least 3 characters.');

    const rawPassword = data.password && data.password.trim().length >= 8 ? data.password : 'Admin@12345';
    const passwordHash = CryptoService.hashPassword(rawPassword);

    const rawPin = data.pin && data.pin.trim() ? data.pin.trim() : '12345';
    const pinValidation = CryptoService.validatePin(rawPin);
    if (!pinValidation.valid) throw new Error(pinValidation.message);
    const pinHash = CryptoService.hashPassword(rawPin);

    const insertUser = db.prepare(`
      INSERT INTO users (username, full_name, password_hash, pin_hash, role_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    const result = insertUser.run(trimmedUser, trimmedName, passwordHash, pinHash);
    const userId = Number(result.lastInsertRowid);

    AuditService.logAuthEvent(userId, trimmedUser, 'INITIAL_ADMIN_SETUP', `users:${userId}`, 'success', 'Initial administrator provisioned');

    return this.createSession(userId, trimmedUser);
  }

  /**
   * Authenticates using a 5-digit PIN (no username or password required).
   */
  public static loginWithPin(pin: string, ipOrDevice = 'localhost'): AuthSession {
    const db = getDatabase();
    const cleanPin = (pin || '').trim();

    const pinValidation = CryptoService.validatePin(cleanPin);
    if (!pinValidation.valid) {
      throw new Error(pinValidation.message);
    }

    // Check account lockout window for PIN attempts
    const recentFailures = db.prepare(`
      SELECT COUNT(*) as count FROM login_attempts
      WHERE (username = 'pin_auth' OR username = 'pin_user') AND success = 0 AND attempted_at >= datetime('now', '-' || ? || ' minutes')
    `).get(LOCKOUT_WINDOW_MINUTES) as { count: number };

    if (recentFailures.count >= MAX_FAILED_ATTEMPTS) {
      AuditService.logAuthEvent(null, 'pin_auth', 'LOGIN_BLOCKED', null, 'failure', 'Temporary lockout due to repeated PIN failures');
      throw new Error(`System is temporarily locked due to multiple failed login attempts. Please try again in ${LOCKOUT_WINDOW_MINUTES} minutes.`);
    }

    const recordAttempt = db.prepare(`
      INSERT INTO login_attempts (username, ip_or_device, success, failure_reason)
      VALUES (?, ?, ?, ?)
    `);

    // Fetch active users with PIN hash set (Explicit JOIN, explicit columns)
    const activeUsers = db.prepare(`
      SELECT u.id, u.username, u.full_name, u.pin_hash, u.role_id, u.status,
             r.role_key, r.name_en as role_name_en, r.name_si as role_name_si
      FROM users u
      INNER JOIN roles r ON u.role_id = r.id
      WHERE u.status = 'active' AND u.pin_hash IS NOT NULL
      ORDER BY u.id ASC
    `).all() as any[];

    let matchedUser: any = null;
    for (const u of activeUsers) {
      if (CryptoService.verifyPassword(cleanPin, u.pin_hash)) {
        matchedUser = u;
        break;
      }
    }

    if (matchedUser) {
      recordAttempt.run(matchedUser.username, ipOrDevice, 1, null);
      db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(matchedUser.id);
      AuditService.logAuthEvent(matchedUser.id, matchedUser.username, 'LOGIN_SUCCESS', `users:${matchedUser.id}`, 'success', 'Authenticated with 5-digit PIN');
      return this.createSession(matchedUser.id, matchedUser.username);
    }

    // Check if the PIN belongs to a deactivated or locked user to give clear feedback
    const inactiveUsers = db.prepare(`
      SELECT u.id, u.username, u.full_name, u.pin_hash, u.status
      FROM users u
      WHERE u.status IN ('inactive', 'locked') AND u.pin_hash IS NOT NULL
      ORDER BY u.id ASC
    `).all() as any[];

    for (const u of inactiveUsers) {
      if (CryptoService.verifyPassword(cleanPin, u.pin_hash)) {
        recordAttempt.run(u.username, ipOrDevice, 0, `Account ${u.status}`);
        AuditService.logAuthEvent(u.id, u.username, 'LOGIN_REJECTED', `users:${u.id}`, 'failure', `Account is ${u.status}`);
        if (u.status === 'locked') {
          throw new Error('This account is locked. Please contact an administrator.');
        } else {
          throw new Error('This account has been deactivated. Please contact an administrator.');
        }
      }
    }

    // Record failed attempt
    recordAttempt.run('pin_auth', ipOrDevice, 0, 'Invalid 5-digit PIN');
    AuditService.logAuthEvent(null, 'pin_auth', 'LOGIN_FAILED', null, 'failure', 'Invalid 5-digit PIN');

    throw new Error('Invalid 5-digit PIN. Please try again.');
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

  public static unlockSessionWithPin(sessionToken: string, pin: string): boolean {
    const db = getDatabase();
    const session = db.prepare(`
      SELECT s.user_id, u.pin_hash, u.username
      FROM user_sessions s
      INNER JOIN users u ON s.user_id = u.id
      WHERE s.session_token = ?
    `).get(sessionToken) as any;

    if (!session || !session.pin_hash) return false;

    const isValid = CryptoService.verifyPassword(pin.trim(), session.pin_hash);
    if (!isValid) {
      AuditService.logAuthEvent(session.user_id, session.username, 'UNLOCK_FAILED', null, 'failure', 'Incorrect unlock PIN');
      return false;
    }

    db.prepare('UPDATE user_sessions SET is_locked = 0, last_activity_at = CURRENT_TIMESTAMP WHERE session_token = ?').run(sessionToken);
    AuditService.logAuthEvent(session.user_id, session.username, 'SESSION_UNLOCKED', null, 'success', 'Unlocked workstation with 5-digit PIN');
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


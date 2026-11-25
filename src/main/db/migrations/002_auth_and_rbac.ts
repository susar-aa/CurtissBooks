import type Database from 'better-sqlite3';
import { Migration } from './001_initial_settings';

export const migration002: Migration = {
  id: 2,
  name: '002_auth_and_rbac',
  up: (db: Database.Database) => {
    // 1. Roles table
    db.exec(`
      CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role_key TEXT NOT NULL UNIQUE,
        name_en TEXT NOT NULL,
        name_si TEXT NOT NULL,
        description TEXT,
        is_system INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        permission_key TEXT NOT NULL UNIQUE,
        module TEXT NOT NULL,
        action TEXT NOT NULL,
        name_en TEXT NOT NULL,
        name_si TEXT NOT NULL,
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id INTEGER NOT NULL,
        permission_id INTEGER NOT NULL,
        PRIMARY KEY (role_id, permission_id),
        FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
        FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        full_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'locked')),
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login_at DATETIME,
        password_changed_at DATETIME,
        FOREIGN KEY (role_id) REFERENCES roles(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS user_sessions (
        session_token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        is_locked INTEGER NOT NULL DEFAULT 0,
        last_activity_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS login_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL COLLATE NOCASE,
        ip_or_device TEXT,
        attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        success INTEGER NOT NULL DEFAULT 0,
        failure_reason TEXT
      );

      CREATE TABLE IF NOT EXISTS authentication_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT NOT NULL,
        action TEXT NOT NULL,
        record_ref TEXT,
        result TEXT NOT NULL,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id, status);
      CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
      CREATE INDEX IF NOT EXISTS idx_login_attempts_recent ON login_attempts(username, attempted_at);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON authentication_audit_logs(created_at);
    `);

    // 2. Seed initial roles
    const insertRole = db.prepare(`
      INSERT OR IGNORE INTO roles (id, role_key, name_en, name_si, description, is_system)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const initialRoles = [
      [1, 'admin', 'Administrator', 'ප්‍රධාන පරිපාලක', 'Full system access, security, configuration and user administration.', 1],
      [2, 'principal', 'Principal', 'විදුහල්පති', 'Executive oversight, report access, and institutional approval authority.', 1],
      [3, 'treasurer', 'Treasurer', 'භාණ්ඩාගාරික', 'Financial budgeting, expenditure approvals, fund allocations, and bank reconciliation.', 1],
      [4, 'accountant', 'Accountant', 'ගණකාධිකාරී', 'General ledger management, voucher entry, journal posting, and financial reports.', 1],
      [5, 'clerk', 'Data Entry Officer', 'දත්ත සටහන් නිලධාරී', 'Standard entry of receipts, vouchers, petty cash, and student profiles.', 1],
      [6, 'auditor', 'Auditor', 'විගණක', 'Read-only financial audit, general ledger inspection, and audit trail verification.', 1],
    ];

    for (const r of initialRoles) {
      insertRole.run(...r);
    }

    // 3. Seed granular permissions
    const insertPerm = db.prepare(`
      INSERT OR IGNORE INTO permissions (id, permission_key, module, action, name_en, name_si, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const initialPermissions = [
      // Dashboard
      [1, 'dashboard.view', 'dashboard', 'view', 'View Dashboard', 'ප්‍රධාන පුවරුව බැලීම', 'View overview dashboard metrics.'],
      // Students
      [2, 'students.view', 'students', 'view', 'View Students', 'සිසුන් බැලීම', 'View student directory and profiles.'],
      [3, 'students.create', 'students', 'create', 'Create Students', 'සිසුන් ඇතුළත් කිරීම', 'Register new student records.'],
      [4, 'students.edit', 'students', 'edit', 'Edit Students', 'සිසුන් සංස්කරණය', 'Modify student personal details.'],
      [5, 'students.export', 'students', 'export', 'Export Students', 'සිසුන් ලේඛන ලබාගැනීම', 'Export student rosters to Excel/PDF.'],
      // Financial Year & Chart of Accounts
      [6, 'financialYear.view', 'financialYear', 'view', 'View Financial Years', 'මූල්‍ය වර්ෂ බැලීම', 'View active and closed financial years.'],
      [7, 'financialYear.manage', 'financialYear', 'manage', 'Manage Financial Years', 'මූල්‍ය වර්ෂ පාලනය', 'Create or close financial years.'],
      // Annual Budget
      [8, 'budget.view', 'budget', 'view', 'View Annual Budget', 'වාර්ෂික අයවැය බැලීම', 'View annual budget category limits.'],
      [9, 'budget.create', 'budget', 'create', 'Create Budget', 'අයවැය කෙටුම්පත් කිරීම', 'Draft new annual budget categories.'],
      [10, 'budget.edit', 'budget', 'edit', 'Edit Budget', 'අයවැය සංස්කරණය', 'Modify unapproved budget drafts.'],
      [11, 'budget.approve', 'budget', 'approve', 'Approve Budget', 'අයවැය අනුමත කිරීම', 'Authorize and lock annual budget limits.'],
      [12, 'budget.export', 'budget', 'export', 'Export Budget', 'අයවැය ලේඛන ලබාගැනීම', 'Export budget sheets to PDF/Excel.'],
      // Funds & Grants
      [13, 'funds.view', 'funds', 'view', 'View Funds', 'අරමුදල් බැලීම', 'View government grants and private donations.'],
      [14, 'funds.create', 'funds', 'create', 'Create Fund Receipts', 'අරමුදල් ලැබීම් සටහන් කිරීම', 'Record incoming fund allocations.'],
      [15, 'funds.edit', 'funds', 'edit', 'Edit Funds', 'අරමුදල් සංස්කරණය', 'Edit unposted fund records.'],
      [16, 'funds.export', 'funds', 'export', 'Export Funds', 'අරමුදල් ලේඛන ලබාගැනීම', 'Export fund statements.'],
      // Expenses
      [17, 'expenses.view', 'expenses', 'view', 'View Expenses', 'වියදම් බැලීම', 'View expense vouchers and commitments.'],
      [18, 'expenses.create', 'expenses', 'create', 'Create Expense', 'වියදම් සටහන් කිරීම', 'Record expenditure requests.'],
      [19, 'expenses.edit', 'expenses', 'edit', 'Edit Expense', 'වියදම් සංස්කරණය', 'Modify draft expense vouchers.'],
      [20, 'expenses.approve', 'expenses', 'approve', 'Approve Expense', 'වියදම් අනුමත කිරීම', 'Authorize and approve expense payments.'],
      [21, 'expenses.export', 'expenses', 'export', 'Export Expenses', 'වියදම් ලේඛන ලබාගැනීම', 'Export expense records.'],
      // Cash Book & Petty Cash
      [22, 'cashbook.view', 'cashbook', 'view', 'View Cash Book', 'මුදල් පොත බැලීම', 'Inspect daily cash receipts and payments.'],
      [23, 'cashbook.create', 'cashbook', 'create', 'Create Cash Entry', 'මුදල් සටහන් යෙදීම', 'Record cash book transactions.'],
      [24, 'cashbook.export', 'cashbook', 'export', 'Export Cash Book', 'මුදල් පොත ලබාගැනීම', 'Print or export cash book.'],
      [25, 'pettycash.view', 'pettycash', 'view', 'View Petty Cash', 'සුළු මුදල් බැලීම', 'Inspect petty cash vouchers.'],
      [26, 'pettycash.create', 'pettycash', 'create', 'Create Petty Cash Entry', 'සුළු මුදල් වවුචර් යෙදීම', 'Issue petty cash payments.'],
      [27, 'pettycash.export', 'pettycash', 'export', 'Export Petty Cash', 'සුළු මුදල් වාර්තා ලබාගැනීම', 'Export petty cash sheets.'],
      // Bank Accounts
      [28, 'bank.view', 'bank', 'view', 'View Bank Accounts', 'බැංකු ගිණුම් බැලීම', 'View bank ledgers and reconciliation.'],
      [29, 'bank.create', 'bank', 'create', 'Create Bank Transaction', 'බැංකු ගනුදෙනු යෙදීම', 'Record deposits, cheques, or transfers.'],
      [30, 'bank.edit', 'bank', 'edit', 'Edit Bank Records', 'බැංකු සටහන් සංස්කරණය', 'Edit unposted bank records.'],
      [31, 'bank.export', 'bank', 'export', 'Export Bank Records', 'බැංකු ලේඛන ලබාගැනීම', 'Export bank statements and reconciliation.'],
      // Reports
      [32, 'reports.view', 'reports', 'view', 'View Reports', 'වාර්තා බැලීම', 'Generate financial and student reports.'],
      [33, 'reports.export', 'reports', 'export', 'Export Reports', 'වාර්තා පිටපත් ලබාගැනීම', 'Export generated reports to PDF/Excel.'],
      // Audit Logs
      [34, 'audit.view', 'audit', 'view', 'View Audit Logs', 'විගණන සටහන් බැලීම', 'Inspect immutable audit trails.'],
      [35, 'audit.export', 'audit', 'export', 'Export Audit Logs', 'විගණන සටහන් ලබාගැනීම', 'Export audit logs.'],
      // User Management
      [36, 'users.view', 'users', 'view', 'View Users', 'පරිශීලකයින් බැලීම', 'View staff user directory and roles.'],
      [37, 'users.create', 'users', 'create', 'Create Users', 'පරිශීලකයින් එක් කිරීම', 'Create user accounts and assign roles.'],
      [38, 'users.edit', 'users', 'edit', 'Edit Users', 'පරිශීලකයින් සංස්කරණය', 'Update user profiles and roles.'],
      [39, 'users.deactivate', 'users', 'deactivate', 'Deactivate Users', 'පරිශීලකයින් අක්‍රිය කිරීම', 'Toggle account active/inactive status.'],
      [40, 'users.reset_password', 'users', 'reset_password', 'Reset Passwords', 'මුරපද නැවත සැකසීම', 'Reset passwords for users.'],
      // Settings
      [41, 'settings.view', 'settings', 'view', 'View Settings', 'සැකසුම් බැලීම', 'View institutional configuration.'],
      [42, 'settings.edit', 'settings', 'edit', 'Edit Settings', 'සැකසුම් වෙනස් කිරීම', 'Update system settings.'],
    ];

    for (const p of initialPermissions) {
      insertPerm.run(...p);
    }

    // 4. Assign default role permissions
    const insertRolePerm = db.prepare(`
      INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
      VALUES (?, ?)
    `);

    // Admin receives all permissions (1..42)
    for (let pId = 1; pId <= 42; pId++) {
      insertRolePerm.run(1, pId);
    }

    // Principal (executive oversight: view all, approve budget/expenses, export all)
    const principalPerms = [
      1, 2, 5, 6, 8, 11, 12, 13, 16, 17, 20, 21, 22, 24, 25, 27, 28, 31, 32, 33, 34, 35, 36, 41
    ];
    for (const pId of principalPerms) {
      insertRolePerm.run(2, pId);
    }

    // Treasurer (financial authority: view & approve financial items)
    const treasurerPerms = [
      1, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34
    ];
    for (const pId of treasurerPerms) {
      insertRolePerm.run(3, pId);
    }

    // Accountant (financial entries & reporting)
    const accountantPerms = [
      1, 6, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33
    ];
    for (const pId of accountantPerms) {
      insertRolePerm.run(4, pId);
    }

    // Clerk / Data Entry Officer
    const clerkPerms = [
      1, 2, 3, 4, 17, 18, 22, 23, 25, 26
    ];
    for (const pId of clerkPerms) {
      insertRolePerm.run(5, pId);
    }

    // Auditor (read-only views & exports across all modules and audit log)
    const auditorPerms = [
      1, 2, 5, 6, 8, 12, 13, 16, 17, 21, 22, 24, 25, 27, 28, 31, 32, 33, 34, 35, 36, 41
    ];
    for (const pId of auditorPerms) {
      insertRolePerm.run(6, pId);
    }
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP TABLE IF EXISTS authentication_audit_logs;
      DROP TABLE IF EXISTS login_attempts;
      DROP TABLE IF EXISTS user_sessions;
      DROP TABLE IF EXISTS users;
      DROP TABLE IF EXISTS role_permissions;
      DROP TABLE IF EXISTS permissions;
      DROP TABLE IF EXISTS roles;
    `);
  }
};


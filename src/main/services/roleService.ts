import { getDatabase } from '../db';
import { AuditService } from './auditService';
import { Role, Permission } from '../../shared/types/auth';

export class RoleService {
  public static getAllRoles(): Role[] {
    const db = getDatabase();

    // Explicit JOIN to get roles with user count in a single query (avoid N+1)
    const roles = db.prepare(`
      SELECT r.id, r.role_key, r.name_en, r.name_si, r.description, r.is_system,
             COUNT(u.id) as user_count
      FROM roles r
      LEFT JOIN users u ON r.id = u.role_id
      GROUP BY r.id, r.role_key, r.name_en, r.name_si, r.description, r.is_system
      ORDER BY r.id ASC
    `).all() as Role[];

    // Fetch all role permissions in one single batch query
    const rolePermRows = db.prepare(`
      SELECT rp.role_id, p.permission_key
      FROM role_permissions rp
      INNER JOIN permissions p ON rp.permission_id = p.id
    `).all() as { role_id: number; permission_key: string }[];

    const permMap = new Map<number, string[]>();
    for (const row of rolePermRows) {
      if (!permMap.has(row.role_id)) {
        permMap.set(row.role_id, []);
      }
      permMap.get(row.role_id)!.push(row.permission_key);
    }

    for (const role of roles) {
      role.permissions = permMap.get(role.id) || [];
    }

    return roles;
  }

  public static getAllPermissions(): Permission[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT id, permission_key, module, action, name_en, name_si, description
      FROM permissions
      ORDER BY module ASC, id ASC
    `).all() as Permission[];
  }

  public static updateRolePermissions(
    roleId: number,
    permissionKeys: string[],
    adminUserId: number | null
  ): boolean {
    const db = getDatabase();

    const role = db.prepare('SELECT id, role_key, is_system FROM roles WHERE id = ?').get(roleId) as any;
    if (!role) throw new Error(`Role #${roleId} not found.`);

    // Protect system Administrator role from having permissions revoked
    if (role.role_key === 'admin') {
      throw new Error('System Administrator permissions cannot be modified.');
    }

    const tx = db.transaction(() => {
      // Clear existing permissions
      db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(roleId);

      if (permissionKeys.length > 0) {
        const getPermId = db.prepare('SELECT id FROM permissions WHERE permission_key = ?');
        const insertRolePerm = db.prepare('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)');

        for (const key of permissionKeys) {
          const perm = getPermId.get(key) as { id: number } | undefined;
          if (perm) {
            insertRolePerm.run(roleId, perm.id);
          }
        }
      }

      AuditService.logAuthEvent(
        adminUserId,
        adminUserId ? String(adminUserId) : 'system',
        'ROLE_PERMISSIONS_UPDATED',
        `roles:${roleId}`,
        'success',
        `Assigned ${permissionKeys.length} permissions to role #${roleId}`
      );
    });

    tx();
    return true;
  }
}


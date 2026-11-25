import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/channels';
import { RoleService } from '../services/roleService';
import { assertAuthorized } from './authGuard';
import { IpcResult } from '../../shared/types/ipc';
import { Role, Permission } from '../../shared/types/auth';

export function registerRoleHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.ROLES_GET_ALL, async (): Promise<IpcResult<Role[]>> => {
    try {
      assertAuthorized('users.view');
      const data = RoleService.getAllRoles();
      return { success: true, data };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PERMISSIONS_GET_ALL, async (): Promise<IpcResult<Permission[]>> => {
    try {
      assertAuthorized('users.view');
      const data = RoleService.getAllPermissions();
      return { success: true, data };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ROLES_UPDATE_PERMISSIONS, async (_event, roleId: number, permissionKeys: string[]): Promise<IpcResult<boolean>> => {
    try {
      const session = assertAuthorized('users.edit');
      const ok = RoleService.updateRolePermissions(roleId, permissionKeys, session.user.id);
      return { success: true, data: ok };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });
}


import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/channels';
import { UserService } from '../services/userService';
import { assertAuthorized } from './authGuard';
import { IpcResult } from '../../shared/types/ipc';
import { User } from '../../shared/types/auth';

export function registerUserHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.USERS_GET_ALL, async (): Promise<IpcResult<User[]>> => {
    try {
      assertAuthorized('users.view');
      const data = UserService.getAllUsers();
      return { success: true, data };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.USERS_CREATE, async (_event, data): Promise<IpcResult<User>> => {
    try {
      const session = assertAuthorized('users.create');
      const newUser = UserService.createUser(data, session.user.id);
      return { success: true, data: newUser };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.USERS_UPDATE, async (_event, id: number, data): Promise<IpcResult<User>> => {
    try {
      const session = assertAuthorized('users.edit');
      const updatedUser = UserService.updateUser(id, data, session.user.id);
      return { success: true, data: updatedUser };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.USERS_SET_STATUS, async (_event, id: number, status): Promise<IpcResult<boolean>> => {
    try {
      const session = assertAuthorized('users.deactivate');
      const ok = UserService.setUserStatus(id, status, session.user.id);
      return { success: true, data: ok };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.USERS_RESET_PASSWORD, async (_event, id: number, newPassword: string): Promise<IpcResult<boolean>> => {
    try {
      const session = assertAuthorized('users.reset_password');
      const ok = UserService.resetPassword(id, newPassword, session.user.id);
      return { success: true, data: ok };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.USERS_RESET_PIN, async (_event, id: number, newPin: string): Promise<IpcResult<boolean>> => {
    try {
      const session = assertAuthorized('users.reset_password');
      const ok = UserService.resetPin(id, newPin, session.user.id);
      return { success: true, data: ok };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });
}


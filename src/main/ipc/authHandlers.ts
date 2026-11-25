import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/channels';
import { AuthService } from '../services/authService';
import { IpcResult } from '../../shared/types/ipc';
import { AuthSession } from '../../shared/types/auth';

let currentSessionToken: string | null = null;

export function getCurrentSessionToken(): string | null {
  return currentSessionToken;
}

export function setCurrentSessionToken(token: string | null): void {
  currentSessionToken = token;
}

export function registerAuthHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.AUTH_CHECK_SETUP, async (): Promise<IpcResult<{ setupRequired: boolean }>> => {
    try {
      const setupRequired = AuthService.checkSetupRequired();
      return { success: true, data: { setupRequired } };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_SETUP_INITIAL_ADMIN, async (_event, data): Promise<IpcResult<AuthSession>> => {
    try {
      const session = AuthService.setupInitialAdmin(data);
      currentSessionToken = session.sessionToken;
      return { success: true, data: session };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async (_event, credentials): Promise<IpcResult<AuthSession>> => {
    try {
      const session = AuthService.login(credentials.username, credentials.password);
      currentSessionToken = session.sessionToken;
      return { success: true, data: session };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async (): Promise<IpcResult<boolean>> => {
    try {
      if (currentSessionToken) {
        AuthService.logout(currentSessionToken);
        currentSessionToken = null;
      }
      return { success: true, data: true };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_GET_CURRENT_SESSION, async (): Promise<IpcResult<AuthSession | null>> => {
    try {
      if (!currentSessionToken) {
        return { success: true, data: null };
      }
      const session = AuthService.validateSession(currentSessionToken);
      if (!session) {
        currentSessionToken = null;
        return { success: true, data: null };
      }
      return { success: true, data: session };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_LOCK_SESSION, async (): Promise<IpcResult<boolean>> => {
    try {
      if (!currentSessionToken) throw new Error('No active session.');
      const ok = AuthService.lockSession(currentSessionToken);
      return { success: true, data: ok };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_UNLOCK_SESSION, async (_event, password: string): Promise<IpcResult<boolean>> => {
    try {
      if (!currentSessionToken) throw new Error('No active session.');
      const ok = AuthService.unlockSession(currentSessionToken, password);
      if (!ok) {
        return { success: false, error: 'Incorrect password.' };
      }
      return { success: true, data: true };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });
}


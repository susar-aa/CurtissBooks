import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/channels';
import { SettingsService } from '../services/settingsService';
import { setCurrentSessionToken } from './authHandlers';
import { IpcResult } from '../../shared/types/ipc';

export function registerSettingsHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, async (): Promise<IpcResult<Record<string, string>>> => {
    try {
      const data = SettingsService.getAll();
      return { success: true, data };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async (_event, key: string): Promise<IpcResult<string | null>> => {
    try {
      const data = SettingsService.get(key);
      return { success: true, data };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (_event, key: string, value: string): Promise<IpcResult<boolean>> => {
    try {
      const data = SettingsService.set(key, value);
      return { success: true, data };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_FACTORY_RESET, async (_event, adminPin: string): Promise<IpcResult<boolean>> => {
    try {
      const ok = SettingsService.factoryReset(adminPin);
      setCurrentSessionToken(null);
      return { success: true, data: ok };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });
}


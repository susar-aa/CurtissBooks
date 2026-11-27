import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/channels';
import { SettingsService, OpeningBalancesData } from '../services/settingsService';
import { AuthService } from '../services/authService';
import { setCurrentSessionToken, getCurrentSessionToken } from './authHandlers';
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

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_OPENING_BALANCES,
    async (_event, financialYearId?: number): Promise<IpcResult<OpeningBalancesData>> => {
      try {
        const data = SettingsService.getOpeningBalances(financialYearId);
        return { success: true, data };
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        return { success: false, error };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_UPDATE_OPENING_BALANCES,
    async (
      _event,
      payload: {
        financialYearId?: number;
        cashOpeningBalanceCents: number;
        pettyCashOpeningBalanceCents: number;
        bankAccounts: Array<{ id: number; opening_balance_cents: number }>;
      }
    ): Promise<IpcResult<boolean>> => {
      try {
        const token = getCurrentSessionToken();
        const session = token ? AuthService.validateSession(token) : null;
        const ok = SettingsService.updateOpeningBalances(payload, session?.user?.id);
        return { success: true, data: ok };
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        return { success: false, error };
      }
    }
  );
}

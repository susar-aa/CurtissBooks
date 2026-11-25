import { ipcMain, app } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/channels';
import { getDatabasePath } from '../db';
import { AppInfo } from '../../shared/types/settings';
import { IpcResult } from '../../shared/types/ipc';

export function registerAppHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.APP_GET_INFO, async (): Promise<IpcResult<AppInfo>> => {
    try {
      const info: AppInfo = {
        name: 'CurtissBooks',
        version: app.getVersion() || '1.0.0',
        userDataPath: app.getPath('userData'),
        dbPath: getDatabasePath(),
        isPackaged: app.isPackaged,
        electronVersion: process.versions.electron || 'unknown',
        nodeVersion: process.versions.node,
        platform: process.platform,
      };
      return { success: true, data: info };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });
}


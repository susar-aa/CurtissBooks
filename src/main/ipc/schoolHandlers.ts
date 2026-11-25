import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/channels';
import { SchoolService } from '../services/schoolService';
import { assertAuthorized } from './authGuard';
import { IpcResult } from '../../shared/types/ipc';
import { SchoolProfile } from '../../shared/types/school';

export function registerSchoolHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SCHOOL_GET_PROFILE, async (): Promise<IpcResult<SchoolProfile>> => {
    try {
      const data = SchoolService.getProfile();
      return { success: true, data };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SCHOOL_UPDATE_PROFILE, async (_event, profile: Partial<SchoolProfile>): Promise<IpcResult<SchoolProfile>> => {
    try {
      assertAuthorized('settings.edit');
      const data = SchoolService.updateProfile(profile);
      return { success: true, data };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SCHOOL_SAVE_LOGO, async (_event, fileData: { base64: string; mimeType: string }): Promise<IpcResult<string>> => {
    try {
      assertAuthorized('settings.edit');
      const savedPath = SchoolService.saveLogo(fileData.base64, fileData.mimeType);
      return { success: true, data: savedPath };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });
}


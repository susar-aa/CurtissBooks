import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/channels';
import { AuditService } from '../services/auditService';
import { assertAuthorized } from './authGuard';
import { IpcResult } from '../../shared/types/ipc';
import { AuditLogItem } from '../../shared/types/auth';

export function registerAuditHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.AUDIT_GET_LOGS, async (_event, limit?: number, offset?: number): Promise<IpcResult<AuditLogItem[]>> => {
    try {
      assertAuthorized('audit.view');
      const data = AuditService.getLogs(limit, offset);
      return { success: true, data };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });
}


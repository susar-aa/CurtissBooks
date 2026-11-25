import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/channels';
import { AcademicService } from '../services/academicService';
import { assertAuthorized } from './authGuard';
import { IpcResult } from '../../shared/types/ipc';
import { AcademicYear, Grade, ClassRoom } from '../../shared/types/school';

export function registerAcademicHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.ACADEMIC_GET_YEARS, async (): Promise<IpcResult<AcademicYear[]>> => {
    try {
      const data = AcademicService.getAcademicYears();
      return { success: true, data };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ACADEMIC_CREATE_YEAR, async (_event, data): Promise<IpcResult<AcademicYear>> => {
    try {
      assertAuthorized('settings.edit');
      const year = AcademicService.createAcademicYear(data);
      return { success: true, data: year };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ACADEMIC_UPDATE_YEAR, async (_event, id: number, data): Promise<IpcResult<AcademicYear>> => {
    try {
      assertAuthorized('settings.edit');
      const year = AcademicService.updateAcademicYear(id, data);
      return { success: true, data: year };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ACADEMIC_SET_CURRENT_YEAR, async (_event, id: number): Promise<IpcResult<AcademicYear>> => {
    try {
      assertAuthorized('settings.edit');
      const year = AcademicService.setCurrentAcademicYear(id);
      return { success: true, data: year };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ACADEMIC_GET_GRADES, async (): Promise<IpcResult<Grade[]>> => {
    try {
      const data = AcademicService.getGrades();
      return { success: true, data };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ACADEMIC_CREATE_GRADE, async (_event, data): Promise<IpcResult<Grade>> => {
    try {
      assertAuthorized('settings.edit');
      const grade = AcademicService.createGrade(data);
      return { success: true, data: grade };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ACADEMIC_UPDATE_GRADE, async (_event, id: number, data): Promise<IpcResult<Grade>> => {
    try {
      assertAuthorized('settings.edit');
      const grade = AcademicService.updateGrade(id, data);
      return { success: true, data: grade };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ACADEMIC_GET_CLASSES, async (_event, gradeId?: number): Promise<IpcResult<ClassRoom[]>> => {
    try {
      const data = AcademicService.getClasses(gradeId);
      return { success: true, data };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ACADEMIC_CREATE_CLASS, async (_event, data): Promise<IpcResult<ClassRoom>> => {
    try {
      assertAuthorized('settings.edit');
      const cls = AcademicService.createClass(data);
      return { success: true, data: cls };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ACADEMIC_UPDATE_CLASS, async (_event, id: number, data): Promise<IpcResult<ClassRoom>> => {
    try {
      assertAuthorized('settings.edit');
      const cls = AcademicService.updateClass(id, data);
      return { success: true, data: cls };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  });
}


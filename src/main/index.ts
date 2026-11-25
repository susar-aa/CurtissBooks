import { app, BrowserWindow } from 'electron';
import { createMainWindow, getMainWindow } from './window';
import { initDatabase, closeDatabase } from './db';
import { registerWindowHandlers } from './ipc/windowHandlers';
import { registerSettingsHandlers } from './ipc/settingsHandlers';
import { registerAppHandlers } from './ipc/appHandlers';
import { registerAuthHandlers } from './ipc/authHandlers';
import { registerUserHandlers } from './ipc/userHandlers';
import { registerRoleHandlers } from './ipc/roleHandlers';
import { registerAuditHandlers } from './ipc/auditHandlers';
import { registerSchoolHandlers } from './ipc/schoolHandlers';
import { registerAcademicHandlers } from './ipc/academicHandlers';
import { registerFinancialHandlers } from './ipc/financialHandlers';

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    console.log('[Main] App starting...');

    // 1. Initialize persistent SQLite database & apply migrations
    try {
      initDatabase();
    } catch (err) {
      console.error('[Main] Critical database initialization failure:', err);
      app.quit();
      return;
    }

    // 2. Register IPC handlers
    registerWindowHandlers(getMainWindow);
    registerSettingsHandlers();
    registerAppHandlers();
    registerAuthHandlers();
    registerUserHandlers();
    registerRoleHandlers();
    registerAuditHandlers();
    registerSchoolHandlers();
    registerAcademicHandlers();
    registerFinancialHandlers();

    // 3. Create desktop window
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('will-quit', () => {
    closeDatabase();
  });
}

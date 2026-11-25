import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { runMigrations } from './migrationRunner';

let dbInstance: Database.Database | null = null;
let currentDbPath: string = '';

export function getDatabasePath(): string {
  if (currentDbPath) return currentDbPath;
  const userDataDir = app ? app.getPath('userData') : path.join(process.cwd(), '.curtissbooks_dev');
  const dataDir = path.join(userDataDir, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  currentDbPath = path.join(dataDir, 'curtissbooks.db');
  return currentDbPath;
}

export function initDatabase(customPath?: string): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = customPath || getDatabasePath();
  currentDbPath = dbPath;

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  console.log(`[DB] Initializing SQLite database at: ${dbPath}`);

  try {
    dbInstance = new Database(dbPath, {
      verbose: process.env.NODE_ENV === 'development' ? (msg) => console.log(`[SQL] ${msg}`) : undefined,
    });

    // Enforce safety & performance pragmas
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');
    dbInstance.pragma('busy_timeout = 5000');
    dbInstance.pragma('synchronous = NORMAL');

    // Run pending migrations
    runMigrations(dbInstance);

    console.log('[DB] Database successfully initialized and migrated.');
    return dbInstance;
  } catch (err) {
    console.error('[DB Error] Failed to initialize SQLite database:', err);
    throw err;
  }
}

export function getDatabase(): Database.Database {
  if (!dbInstance) {
    return initDatabase();
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance && dbInstance.open) {
    dbInstance.close();
    dbInstance = null;
    console.log('[DB] Database connection closed.');
  }
}


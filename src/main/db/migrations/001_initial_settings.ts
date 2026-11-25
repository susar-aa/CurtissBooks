import type Database from 'better-sqlite3';

export interface Migration {
  id: number;
  name: string;
  up: (db: Database.Database) => void;
  down?: (db: Database.Database) => void;
}

export const migration001: Migration = {
  id: 1,
  name: '001_initial_settings',
  up: (db: Database.Database) => {
    // 1. Create Application Settings table
    db.exec(`
      CREATE TABLE IF NOT EXISTS application_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_application_settings_key ON application_settings(key);
    `);

    // 2. Insert initial baseline configuration
    const insert = db.prepare(`
      INSERT OR IGNORE INTO application_settings (key, value, description)
      VALUES (?, ?, ?)
    `);

    const defaults = [
      ['app_name', 'CurtissBooks - School Manager', 'Official Application Title'],
      ['app_version', '1.0.0', 'Application Schema & Client Release Version'],
      ['default_language', 'en', 'Default system UI language (en or si)'],
      ['theme_mode', 'dark', 'Visual styling mode (dark or light)'],
      ['school_name_en', 'Royal Central College', 'School institution title in English'],
      ['school_name_si', 'රාජකීය මධ්‍ය විද්‍යාලය', 'School institution title in Sinhala'],
      ['db_initialized_at', new Date().toISOString(), 'Timestamp of initial database provisioning']
    ];

    for (const [key, value, desc] of defaults) {
      insert.run(key, value, desc);
    }
  },
  down: (db: Database.Database) => {
    db.exec(`DROP TABLE IF EXISTS application_settings;`);
  }
};


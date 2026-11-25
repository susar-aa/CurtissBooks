import type Database from 'better-sqlite3';
import { Migration } from './001_initial_settings';

export const migration004: Migration = {
  id: 4,
  name: '004_db_corrections_and_finalization',
  up: (db: Database.Database) => {
    // Disable foreign keys during table reconstruction
    db.pragma('foreign_keys = OFF');

    try {
      // ========================================================
      // 1. SCHOOL PROFILE: Clear fictitious seeded information
      // ========================================================
      db.prepare(`
        UPDATE school_profile
        SET name_en = '',
            name_si = '',
            registration_number = '',
            school_type = '',
            address_en = '',
            address_si = '',
            telephone = '',
            email = '',
            principal_name = '',
            logo_path = NULL,
            established_date = NULL,
            vision = '',
            mission = ''
        WHERE id = 1 AND (
          registration_number IN ('ED/COL/2026/048', 'CEN-2026-001') OR
          name_en IN ('Royal Central College', 'Curtiss Central College')
        )
      `).run();

      db.prepare(`
        UPDATE application_settings
        SET value = ''
        WHERE key IN ('school_name_en', 'school_name_si')
          AND value IN (
            'Royal Central College', 'රාජකීය මධ්‍ය විද්‍යාලය',
            'Curtiss Central College', 'කර්ටිස් මධ්‍ය මහා විද්‍යාලය'
          )
      `).run();

      // ========================================================
      // 2. CLASSES: Support multiple sections per grade
      // ========================================================
      db.exec(`
        CREATE TABLE classes_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          grade_id INTEGER NOT NULL,
          class_name TEXT NOT NULL,
          section TEXT NOT NULL,
          class_teacher_name TEXT,
          status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
          FOREIGN KEY (grade_id) REFERENCES grades(id),
          UNIQUE(grade_id, class_name, section)
        );

        INSERT INTO classes_new (id, grade_id, class_name, section, class_teacher_name, status)
        SELECT id, grade_id, class_name, section, class_teacher_name, status
        FROM classes;

        DROP TABLE classes;
        ALTER TABLE classes_new RENAME TO classes;

        CREATE INDEX IF NOT EXISTS idx_classes_grade ON classes(grade_id);
      `);

      // ========================================================
      // 3. STUDENT CLASS HISTORY: Support multiple class changes in same year
      // ========================================================
      db.exec(`
        CREATE TABLE student_class_history_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_id INTEGER NOT NULL,
          academic_year_id INTEGER NOT NULL,
          grade_id INTEGER NOT NULL,
          class_id INTEGER NOT NULL,
          assigned_date DATE NOT NULL,
          promoted_date DATE,
          remarks TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
          FOREIGN KEY (academic_year_id) REFERENCES academic_years(id),
          FOREIGN KEY (grade_id) REFERENCES grades(id),
          FOREIGN KEY (class_id) REFERENCES classes(id)
        );

        INSERT INTO student_class_history_new (
          id, student_id, academic_year_id, grade_id, class_id,
          assigned_date, promoted_date, remarks, created_at
        )
        SELECT
          id, student_id, academic_year_id, grade_id, class_id,
          assigned_date, promoted_date, remarks, created_at
        FROM student_class_history;

        DROP TABLE student_class_history;
        ALTER TABLE student_class_history_new RENAME TO student_class_history;

        CREATE INDEX IF NOT EXISTS idx_student_class_hist_student ON student_class_history(student_id);
        CREATE INDEX IF NOT EXISTS idx_student_class_hist_year ON student_class_history(academic_year_id);
      `);

      // ========================================================
      // 4. STUDENT GUARDIANS: Support multiple guardians per student
      // ========================================================
      db.exec(`
        CREATE TABLE student_guardians_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_id INTEGER NOT NULL,
          guardian_name TEXT NOT NULL,
          primary_guardian_name TEXT,
          relationship TEXT NOT NULL,
          is_primary INTEGER NOT NULL DEFAULT 0,
          primary_telephone TEXT NOT NULL,
          secondary_telephone TEXT,
          whatsapp_number TEXT,
          email TEXT,
          address_en TEXT,
          address_si TEXT,
          occupation TEXT,
          father_name TEXT,
          mother_name TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        );

        INSERT INTO student_guardians_new (
          id, student_id, guardian_name, primary_guardian_name, relationship, is_primary,
          primary_telephone, secondary_telephone, whatsapp_number, email,
          address_en, address_si, father_name, mother_name
        )
        SELECT
          id, student_id, primary_guardian_name, primary_guardian_name, relationship, 1,
          primary_telephone, secondary_telephone, whatsapp_number, email,
          address_en, address_si, father_name, mother_name
        FROM student_guardians;

        DROP TABLE student_guardians;
        ALTER TABLE student_guardians_new RENAME TO student_guardians;

        CREATE INDEX IF NOT EXISTS idx_student_guardians_student ON student_guardians(student_id);
        CREATE INDEX IF NOT EXISTS idx_student_guardians_phone ON student_guardians(primary_telephone);
        CREATE INDEX IF NOT EXISTS idx_student_guardians_primary ON student_guardians(student_id, is_primary);
      `);

      // Verify foreign key integrity across reconstructed tables
      const fkCheck = db.prepare('PRAGMA foreign_key_check').all();
      if (fkCheck.length > 0) {
        throw new Error(`Foreign key check failed after migration 004: ${JSON.stringify(fkCheck)}`);
      }
    } finally {
      // Re-enable foreign key constraints
      db.pragma('foreign_keys = ON');
    }
  },
};

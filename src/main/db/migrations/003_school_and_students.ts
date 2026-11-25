import type Database from 'better-sqlite3';
import { Migration } from './001_initial_settings';

export const migration003: Migration = {
  id: 3,
  name: '003_school_and_students',
  up: (db: Database.Database) => {
    // 1. School Profile
    db.exec(`
      CREATE TABLE IF NOT EXISTS school_profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        name_en TEXT NOT NULL,
        name_si TEXT NOT NULL,
        registration_number TEXT NOT NULL,
        school_type TEXT NOT NULL,
        address_en TEXT NOT NULL,
        address_si TEXT NOT NULL,
        telephone TEXT NOT NULL,
        email TEXT NOT NULL,
        principal_name TEXT NOT NULL,
        logo_path TEXT,
        established_date DATE,
        vision TEXT,
        mission TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS academic_years (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name_en TEXT NOT NULL,
        name_si TEXT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        is_current INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS grades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grade_code TEXT NOT NULL UNIQUE,
        name_en TEXT NOT NULL,
        name_si TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive'))
      );

      CREATE TABLE IF NOT EXISTS classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grade_id INTEGER NOT NULL,
        class_name TEXT NOT NULL,
        section TEXT NOT NULL,
        class_teacher_name TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
        FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE CASCADE,
        UNIQUE(grade_id, class_name)
      );

      CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admission_number TEXT NOT NULL UNIQUE COLLATE NOCASE,
        admission_date DATE NOT NULL,
        full_name_en TEXT NOT NULL,
        full_name_si TEXT NOT NULL,
        date_of_birth DATE NOT NULL,
        gender TEXT NOT NULL CHECK(gender IN ('male', 'female', 'other')),
        photo_path TEXT,
        nic_or_id TEXT,
        current_grade_id INTEGER NOT NULL,
        current_class_id INTEGER NOT NULL,
        admission_grade_id INTEGER,
        previous_school TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'transferred', 'graduated', 'inactive')),
        emergency_contact TEXT,
        medical_notes TEXT,
        general_remarks TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (current_grade_id) REFERENCES grades(id),
        FOREIGN KEY (current_class_id) REFERENCES classes(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS student_guardians (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL UNIQUE,
        father_name TEXT,
        mother_name TEXT,
        primary_guardian_name TEXT NOT NULL,
        relationship TEXT NOT NULL,
        primary_telephone TEXT NOT NULL,
        secondary_telephone TEXT,
        whatsapp_number TEXT,
        email TEXT,
        address_en TEXT,
        address_si TEXT,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS student_class_history (
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
        FOREIGN KEY (class_id) REFERENCES classes(id),
        UNIQUE(student_id, academic_year_id)
      );

      CREATE TABLE IF NOT EXISTS student_status_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        previous_status TEXT,
        new_status TEXT NOT NULL,
        effective_date DATE NOT NULL,
        reason TEXT NOT NULL,
        destination_school TEXT,
        changed_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (changed_by) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS student_activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        description TEXT,
        actor_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_id) REFERENCES users(id)
      );

      -- Indexes for fast query performance & explicit JOIN lookups
      CREATE INDEX IF NOT EXISTS idx_students_admission ON students(admission_number);
      CREATE INDEX IF NOT EXISTS idx_students_grade_class ON students(current_grade_id, current_class_id, status);
      CREATE INDEX IF NOT EXISTS idx_students_name_en ON students(full_name_en);
      CREATE INDEX IF NOT EXISTS idx_students_name_si ON students(full_name_si);
      CREATE INDEX IF NOT EXISTS idx_student_class_hist ON student_class_history(student_id, academic_year_id);
      CREATE INDEX IF NOT EXISTS idx_student_guardians_student ON student_guardians(student_id);
      CREATE INDEX IF NOT EXISTS idx_classes_grade ON classes(grade_id);
    `);

    // 2. Seed Default School Profile (Single Record id = 1)
    db.prepare(`
      INSERT OR IGNORE INTO school_profile (
        id, name_en, name_si, registration_number, school_type,
        address_en, address_si, telephone, email, principal_name,
        established_date, vision, mission
      ) VALUES (
        1,
        'Royal Central College',
        'රාජකීය මධ්‍ය විද්‍යාලය',
        'ED/COL/2026/048',
        '1AB National School',
        'College Square, Colombo Road, Kurunegala',
        'විද්‍යාල මාවත, කොළඹ පාර, කුරුණෑගල',
        '+94 37 222 3456',
        'info@royalcentral.sch.lk',
        'Rev. Dr. K. Silva',
        '1948-02-04',
        'To be an exemplary national center of educational and character excellence.',
        'Empowering generations through disciplined wisdom, modern knowledge and ethical leadership.'
      )
    `).run();

    // 3. Seed Default Academic Year (2026)
    db.prepare(`
      INSERT OR IGNORE INTO academic_years (id, code, name_en, name_si, start_date, end_date, is_current)
      VALUES (1, '2026', 'Academic Year 2026', '2026 අධ්‍යයන වර්ෂය', '2026-01-01', '2026-12-31', 1)
    `).run();

    // 4. Seed Standard Grades (Grade 1 through 13)
    const insertGrade = db.prepare(`
      INSERT OR IGNORE INTO grades (id, grade_code, name_en, name_si, order_index, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `);

    for (let g = 1; g <= 13; g++) {
      const code = `Grade ${g}`;
      insertGrade.run(g, code, `Grade ${g}`, `${g} ශ්‍රේණිය`, g);
    }

    // 5. Seed Core Classes (e.g. 1-A, 1-B, 2-A, 2-B, etc.)
    const insertClass = db.prepare(`
      INSERT OR IGNORE INTO classes (grade_id, class_name, section, class_teacher_name, status)
      VALUES (?, ?, ?, ?, 'active')
    `);

    for (let g = 1; g <= 5; g++) {
      insertClass.run(g, `${g}-A`, 'A', `Teacher ${g}A`);
      insertClass.run(g, `${g}-B`, 'B', `Teacher ${g}B`);
      insertClass.run(g, `${g}-C`, 'C', `Teacher ${g}C`);
    }
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP TABLE IF EXISTS student_activity_logs;
      DROP TABLE IF EXISTS student_status_history;
      DROP TABLE IF EXISTS student_class_history;
      DROP TABLE IF EXISTS student_guardians;
      DROP TABLE IF EXISTS students;
      DROP TABLE IF EXISTS classes;
      DROP TABLE IF EXISTS grades;
      DROP TABLE IF EXISTS academic_years;
      DROP TABLE IF EXISTS school_profile;
    `);
  }
};


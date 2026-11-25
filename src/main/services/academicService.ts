import { getDatabase } from '../db';
import { AcademicYear, Grade, ClassRoom } from '../../shared/types/school';

export class AcademicService {
  public static getAcademicYears(): AcademicYear[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM academic_years ORDER BY start_date DESC').all() as AcademicYear[];
  }

  public static createAcademicYear(data: {
    code: string;
    name_en: string;
    name_si: string;
    start_date: string;
    end_date: string;
    is_current?: boolean;
  }): AcademicYear {
    const db = getDatabase();
    const code = data.code.trim();
    if (!code) throw new Error('Academic year code is required.');
    const stmt = db.prepare(`
      INSERT INTO academic_years (code, name_en, name_si, start_date, end_date, is_current)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const res = stmt.run(
      code,
      data.name_en.trim(),
      data.name_si.trim(),
      data.start_date,
      data.end_date,
      data.is_current ? 1 : 0
    );
    return db.prepare('SELECT * FROM academic_years WHERE id = ?').get(res.lastInsertRowid) as AcademicYear;
  }

  public static getCurrentAcademicYear(): AcademicYear {
    const db = getDatabase();
    let current = db.prepare('SELECT * FROM academic_years WHERE is_current = 1').get() as AcademicYear | undefined;
    if (!current) {
      current = db.prepare('SELECT * FROM academic_years ORDER BY start_date DESC LIMIT 1').get() as AcademicYear | undefined;
    }
    if (!current) throw new Error('No academic year configured.');
    return current;
  }

  public static updateAcademicYear(id: number, data: Partial<AcademicYear>): AcademicYear {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM academic_years WHERE id = ?').get(id) as AcademicYear | undefined;
    if (!existing) throw new Error(`Academic year #${id} not found.`);

    const updated = {
      code: data.code !== undefined ? data.code.trim() : existing.code,
      name_en: data.name_en !== undefined ? data.name_en.trim() : existing.name_en,
      name_si: data.name_si !== undefined ? data.name_si.trim() : existing.name_si,
      start_date: data.start_date || existing.start_date,
      end_date: data.end_date || existing.end_date,
      is_current: data.is_current !== undefined ? (data.is_current ? 1 : 0) : existing.is_current,
    };

    if (updated.is_current === 1) {
      db.prepare('UPDATE academic_years SET is_current = 0 WHERE id != ?').run(id);
    }

    db.prepare(`
      UPDATE academic_years
      SET code = ?, name_en = ?, name_si = ?, start_date = ?, end_date = ?, is_current = ?
      WHERE id = ?
    `).run(updated.code, updated.name_en, updated.name_si, updated.start_date, updated.end_date, updated.is_current, id);

    return db.prepare('SELECT * FROM academic_years WHERE id = ?').get(id) as AcademicYear;
  }

  public static setCurrentAcademicYear(id: number): AcademicYear {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM academic_years WHERE id = ?').get(id) as AcademicYear | undefined;
    if (!existing) throw new Error(`Academic year #${id} not found.`);

    db.transaction(() => {
      db.prepare('UPDATE academic_years SET is_current = 0').run();
      db.prepare('UPDATE academic_years SET is_current = 1 WHERE id = ?').run(id);
    })();

    return db.prepare('SELECT * FROM academic_years WHERE id = ?').get(id) as AcademicYear;
  }

  public static getGrades(): Grade[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM grades ORDER BY order_index ASC').all() as Grade[];
  }

  public static createGrade(data: {
    grade_code: string;
    name_en: string;
    name_si: string;
    order_index: number;
  }): Grade {
    const db = getDatabase();
    const code = data.grade_code.trim();
    if (!code) throw new Error('Grade code is required.');

    const existing = db.prepare('SELECT id FROM grades WHERE grade_code = ?').get(code);
    if (existing) throw new Error(`Grade code "${code}" already exists.`);

    const stmt = db.prepare(`
      INSERT INTO grades (grade_code, name_en, name_si, order_index, status)
      VALUES (?, ?, ?, ?, 'active')
    `);
    const res = stmt.run(code, data.name_en.trim(), data.name_si.trim(), data.order_index);
    return db.prepare('SELECT * FROM grades WHERE id = ?').get(res.lastInsertRowid) as Grade;
  }

  public static updateGrade(id: number, data: Partial<Grade>): Grade {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM grades WHERE id = ?').get(id) as Grade | undefined;
    if (!existing) throw new Error(`Grade #${id} not found.`);

    const updated = {
      grade_code: data.grade_code?.trim() || existing.grade_code,
      name_en: data.name_en?.trim() || existing.name_en,
      name_si: data.name_si?.trim() || existing.name_si,
      order_index: data.order_index ?? existing.order_index,
      status: data.status || existing.status,
    };

    const stmt = db.prepare(`
      UPDATE grades
      SET grade_code = ?, name_en = ?, name_si = ?, order_index = ?, status = ?
      WHERE id = ?
    `);
    stmt.run(updated.grade_code, updated.name_en, updated.name_si, updated.order_index, updated.status, id);

    return db.prepare('SELECT * FROM grades WHERE id = ?').get(id) as Grade;
  }

  public static getClasses(gradeId?: number): ClassRoom[] {
    const db = getDatabase();
    let query = `
      SELECT c.id, c.grade_id, c.class_name, c.section, c.class_teacher_name, c.status,
             g.grade_code, g.name_en as grade_name_en, g.name_si as grade_name_si,
             0 as student_count
      FROM classes c
      INNER JOIN grades g ON c.grade_id = g.id
    `;

    const params: any[] = [];
    if (gradeId) {
      query += ` WHERE c.grade_id = ? `;
      params.push(gradeId);
    }

    query += `
      GROUP BY c.id, c.grade_id, c.class_name, c.section, c.class_teacher_name, c.status,
               g.grade_code, g.name_en, g.name_si
      ORDER BY g.order_index ASC, c.class_name ASC
    `;

    return db.prepare(query).all(...params) as ClassRoom[];
  }

  public static createClass(data: {
    grade_id: number;
    class_name: string;
    section: string;
    class_teacher_name?: string;
  }): ClassRoom {
    const db = getDatabase();
    const name = data.class_name.trim();
    if (!name) throw new Error('Class name is required.');
    const section = (data.section || 'General').trim();

    const grade = db.prepare('SELECT id FROM grades WHERE id = ?').get(data.grade_id);
    if (!grade) throw new Error(`Grade #${data.grade_id} not found.`);

    const existing = db.prepare('SELECT id FROM classes WHERE grade_id = ? AND class_name = ? AND section = ?').get(data.grade_id, name, section);
    if (existing) throw new Error(`Class "${name}" already exists in section "${section}" for this grade.`);

    const stmt = db.prepare(`
      INSERT INTO classes (grade_id, class_name, section, class_teacher_name, status)
      VALUES (?, ?, ?, ?, 'active')
    `);
    const res = stmt.run(data.grade_id, name, section, data.class_teacher_name?.trim() || null);
    return db.prepare(`
      SELECT c.id, c.grade_id, c.class_name, c.section, c.class_teacher_name, c.status,
             g.grade_code, g.name_en as grade_name_en, g.name_si as grade_name_si
      FROM classes c
      INNER JOIN grades g ON c.grade_id = g.id
      WHERE c.id = ?
    `).get(res.lastInsertRowid) as ClassRoom;
  }

  public static updateClass(id: number, data: Partial<ClassRoom>): ClassRoom {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM classes WHERE id = ?').get(id) as ClassRoom | undefined;
    if (!existing) throw new Error(`Class #${id} not found.`);

    const updated = {
      class_name: data.class_name?.trim() || existing.class_name,
      section: data.section?.trim() || existing.section,
      class_teacher_name: data.class_teacher_name !== undefined ? data.class_teacher_name?.trim() : existing.class_teacher_name,
      status: data.status || existing.status,
    };

    if (data.class_name || data.section) {
      const dup = db.prepare('SELECT id FROM classes WHERE grade_id = ? AND class_name = ? AND section = ? AND id != ?')
        .get(existing.grade_id, updated.class_name, updated.section, id);
      if (dup) throw new Error(`Class "${updated.class_name}" in section "${updated.section}" already exists for this grade.`);
    }

    const stmt = db.prepare(`
      UPDATE classes
      SET class_name = ?, section = ?, class_teacher_name = ?, status = ?
      WHERE id = ?
    `);
    stmt.run(updated.class_name, updated.section, updated.class_teacher_name || null, updated.status, id);

    return db.prepare(`
      SELECT c.id, c.grade_id, c.class_name, c.section, c.class_teacher_name, c.status,
             g.grade_code, g.name_en as grade_name_en, g.name_si as grade_name_si
      FROM classes c
      INNER JOIN grades g ON c.grade_id = g.id
      WHERE c.id = ?
    `).get(id) as ClassRoom;
  }
}

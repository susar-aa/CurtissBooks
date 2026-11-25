import { getDatabase } from '../db';
import { SchoolProfile } from '../../shared/types/school';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export class SchoolService {
  private static getUploadsDir(): string {
    const userData = app ? app.getPath('userData') : path.join(process.cwd(), '.curtissbooks_dev');
    const uploadDir = path.join(userData, 'uploads', 'school');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    return uploadDir;
  }

  public static getProfile(): SchoolProfile {
    const db = getDatabase();
    let row = db.prepare('SELECT * FROM school_profile WHERE id = 1').get() as SchoolProfile | undefined;
    if (!row) {
      db.prepare(`
        INSERT INTO school_profile (
          id, name_en, name_si, registration_number, school_type,
          address_en, address_si, telephone, email, principal_name,
          logo_path, established_date, vision, mission
        ) VALUES (1, '', '', '', '', '', '', '', '', '', NULL, NULL, '', '')
      `).run();
      row = db.prepare('SELECT * FROM school_profile WHERE id = 1').get() as SchoolProfile;
    }
    return row;
  }

  public static updateProfile(data: Partial<SchoolProfile>): SchoolProfile {
    const db = getDatabase();
    const current = this.getProfile();

    const updated = {
      name_en: data.name_en !== undefined ? data.name_en.trim() : current.name_en,
      name_si: data.name_si !== undefined ? data.name_si.trim() : current.name_si,
      registration_number: data.registration_number !== undefined ? data.registration_number.trim() : current.registration_number,
      school_type: data.school_type !== undefined ? data.school_type.trim() : current.school_type,
      address_en: data.address_en !== undefined ? data.address_en.trim() : current.address_en,
      address_si: data.address_si !== undefined ? data.address_si.trim() : current.address_si,
      telephone: data.telephone !== undefined ? data.telephone.trim() : current.telephone,
      email: data.email !== undefined ? data.email.trim() : current.email,
      principal_name: data.principal_name !== undefined ? data.principal_name.trim() : current.principal_name,
      established_date: data.established_date !== undefined ? data.established_date : current.established_date,
      vision: data.vision !== undefined ? data.vision : current.vision,
      mission: data.mission !== undefined ? data.mission : current.mission,
    };

    const stmt = db.prepare(`
      UPDATE school_profile
      SET name_en = ?, name_si = ?, registration_number = ?, school_type = ?,
          address_en = ?, address_si = ?, telephone = ?, email = ?,
          principal_name = ?, established_date = ?, vision = ?, mission = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `);

    stmt.run(
      updated.name_en,
      updated.name_si,
      updated.registration_number,
      updated.school_type,
      updated.address_en,
      updated.address_si,
      updated.telephone,
      updated.email,
      updated.principal_name,
      updated.established_date,
      updated.vision,
      updated.mission
    );

    // Sync with application_settings table
    db.prepare("INSERT OR REPLACE INTO application_settings (key, value) VALUES ('school_name_en', ?)").run(updated.name_en);
    db.prepare("INSERT OR REPLACE INTO application_settings (key, value) VALUES ('school_name_si', ?)").run(updated.name_si);

    return this.getProfile();
  }

  public static saveLogo(base64Data: string, mimeType: string): string {
    // Validate mime type
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(mimeType)) {
      throw new Error('Only PNG, JPEG, or WEBP images are permitted.');
    }

    const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    if (buffer.length > 2 * 1024 * 1024) {
      throw new Error('School logo image must not exceed 2MB.');
    }

    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const filename = `school_logo_${Date.now()}.${ext}`;
    const filePath = path.join(this.getUploadsDir(), filename);

    fs.writeFileSync(filePath, buffer);

    const db = getDatabase();
    db.prepare('UPDATE school_profile SET logo_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(filePath);

    return filePath;
  }
}


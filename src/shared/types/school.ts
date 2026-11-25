export interface SchoolProfile {
  id: number;
  name_en: string;
  name_si: string;
  registration_number: string;
  school_type: string;
  address_en: string;
  address_si: string;
  telephone: string;
  email: string;
  principal_name: string;
  logo_path: string | null;
  established_date: string | null;
  vision: string | null;
  mission: string | null;
  updated_at: string;
}

export interface AcademicYear {
  id: number;
  code: string; // e.g. "2026"
  name_en: string;
  name_si: string;
  start_date: string;
  end_date: string;
  is_current: number;
}

export interface Grade {
  id: number;
  grade_code: string;
  name_en: string;
  name_si: string;
  order_index: number;
  status: 'active' | 'inactive';
}

export interface ClassRoom {
  id: number;
  grade_id: number;
  grade_code: string;
  grade_name_en: string;
  grade_name_si: string;
  class_name: string;
  section: string;
  class_teacher_name: string | null;
  status: 'active' | 'inactive';
  student_count?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}


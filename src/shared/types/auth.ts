export type UserStatus = 'active' | 'inactive' | 'locked';

export interface User {
  id: number;
  username: string;
  full_name: string;
  role_id: number;
  role_key: string;
  role_name_en: string;
  role_name_si: string;
  status: UserStatus;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  last_login_at: string | null;
  password_changed_at: string | null;
}

export interface Permission {
  id: number;
  permission_key: string;
  module: string;
  action: string;
  name_en: string;
  name_si: string;
  description: string | null;
}

export interface Role {
  id: number;
  role_key: string;
  name_en: string;
  name_si: string;
  description: string | null;
  is_system: number;
  permissions?: string[];
  user_count?: number;
}

export interface AuthSession {
  sessionToken: string;
  user: User;
  permissions: string[];
  isLocked: boolean;
}

export interface AuditLogItem {
  id: number;
  user_id: number | null;
  username: string;
  action: string;
  record_ref: string | null;
  result: 'success' | 'failure';
  details: string | null;
  created_at: string;
}


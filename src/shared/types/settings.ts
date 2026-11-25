export interface ApplicationSetting {
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
}

export interface AppInfo {
  name: string;
  version: string;
  userDataPath: string;
  dbPath: string;
  isPackaged: boolean;
  electronVersion: string;
  nodeVersion: string;
  platform: string;
}


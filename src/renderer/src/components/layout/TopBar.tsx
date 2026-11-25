import React from 'react';
import { useTranslation } from 'react-i18next';
import { Languages, User as UserIcon, ChevronDown, Bell, Lock, LogOut, Sun, Moon, Monitor } from 'lucide-react';
import { Breadcrumb } from '../ui/Breadcrumb';
import { Dropdown } from '../ui/Dropdown';
import { User } from '../../../shared/types/auth';
import { useTheme } from '../../context/ThemeContext';

interface TopBarProps {
  currentModuleKey: string;
  selectedLanguage: 'en' | 'si';
  onLanguageChange: (lang: 'en' | 'si') => void;
  currentUser?: User | null;
  onLockSession?: () => void;
  onLogout?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentModuleKey,
  selectedLanguage,
  onLanguageChange,
  currentUser,
  onLockSession,
  onLogout,
}) => {
  const { t: tNav } = useTranslation('navigation');
  const { t: tCommon } = useTranslation('common');
  const { themeMode, setThemeMode } = useTheme();

  const themeMenuItems = [
    {
      id: 'theme-light',
      label: tCommon('theme.light', 'Light'),
      icon: Sun,
      onClick: () => setThemeMode('light'),
    },
    {
      id: 'theme-dark',
      label: tCommon('theme.dark', 'Dark'),
      icon: Moon,
      onClick: () => setThemeMode('dark'),
    },
    {
      id: 'theme-system',
      label: tCommon('theme.system', 'System'),
      icon: Monitor,
      onClick: () => setThemeMode('system'),
    },
  ];

  const moduleLabel = tNav(`items.${currentModuleKey}`);

  const notificationItems = [
    {
      id: 'notif-1',
      label: tCommon('labels.noNotifications'),
      onClick: () => {},
    },
  ];

  const profileMenuItems = [
    {
      id: 'user-info',
      label: currentUser ? `${currentUser.full_name} (@${currentUser.username})` : tCommon('labels.role', 'Administrator'),
      onClick: () => {},
    },
    {
      id: 'lock-workstation',
      label: tCommon('auth.lockWorkstation', 'Lock Workstation'),
      icon: Lock,
      onClick: () => onLockSession && onLockSession(),
    },
    {
      id: 'logout',
      label: tCommon('auth.signOut', 'Sign Out'),
      icon: LogOut,
      destructive: true,
      onClick: () => onLogout && onLogout(),
    },
  ];

  return (
    <header className="h-14 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/70 px-6 flex items-center justify-between backdrop-blur-sm select-none z-20">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center space-x-2">
        <Breadcrumb
          items={[
            { label: tCommon('appName') },
            { label: moduleLabel },
          ]}
        />
      </div>

      {/* Right Controls */}
      <div className="flex items-center space-x-3.5">
        {/* Language Selector */}
        <div className="flex items-center space-x-1 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 rounded-lg p-0.5 text-xs">
          <div className="px-1.5 text-zinc-400">
            <Languages className="w-3.5 h-3.5" />
          </div>
          <button
            onClick={() => onLanguageChange('en')}
            className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
              selectedLanguage === 'en'
                ? 'bg-white text-zinc-950 dark:bg-zinc-100 dark:text-zinc-950 shadow-xs font-semibold'
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            English
          </button>
          <button
            onClick={() => onLanguageChange('si')}
            className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
              selectedLanguage === 'si'
                ? 'bg-white text-zinc-950 dark:bg-zinc-100 dark:text-zinc-950 shadow-xs font-semibold'
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            සිංහල
          </button>
        </div>

        {/* Theme Appearance Selector */}
        <Dropdown
          align="right"
          trigger={
            <button
              className="flex items-center space-x-1 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 transition-colors text-xs"
              title={`Appearance: ${themeMode}`}
              aria-label="Toggle Theme Appearance"
            >
              {themeMode === 'light' ? (
                <Sun className="w-3.5 h-3.5 text-amber-500" />
              ) : themeMode === 'dark' ? (
                <Moon className="w-3.5 h-3.5 text-blue-400" />
              ) : (
                <Monitor className="w-3.5 h-3.5 text-zinc-400" />
              )}
              <span className="text-[10px] font-medium capitalize hidden sm:inline">{tCommon(`theme.${themeMode}`, themeMode)}</span>
            </button>
          }
          items={themeMenuItems}
        />

        {/* Notifications Dropdown */}
        <Dropdown
          trigger={
            <button
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 transition-colors"
              title={tCommon('labels.notifications')}
              aria-label={tCommon('labels.notifications')}
            >
              <Bell className="w-3.5 h-3.5" />
            </button>
          }
          items={notificationItems}
        />

        <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800" />

        {/* User Profile Menu */}
        <Dropdown
          align="right"
          trigger={
            <div className="flex items-center space-x-2.5 pl-1 cursor-pointer group hover:opacity-90 transition-opacity">
              <div className="w-7 h-7 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 flex items-center justify-center font-bold text-xs">
                <UserIcon className="w-3.5 h-3.5" />
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 leading-none">
                  {currentUser?.full_name || tCommon('labels.role')}
                </div>
                <div className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono mt-0.5">
                  {selectedLanguage === 'si' ? currentUser?.role_name_si || 'ප්‍රධාන පරිපාලක' : currentUser?.role_name_en || 'Administrator'}
                </div>
              </div>
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            </div>
          }
          items={profileMenuItems}
        />
      </div>
    </header>
  );
};

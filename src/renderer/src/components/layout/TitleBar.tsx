import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Square, Copy, X, Database } from 'lucide-react';

interface TitleBarProps {
  isDbConnected?: boolean;
}

export const TitleBar: React.FC<TitleBarProps> = ({ isDbConnected = true }) => {
  const { t, i18n } = useTranslation('common');
  const [isMaximized, setIsMaximized] = useState(false);
  const [schoolName, setSchoolName] = useState<string>('');

  useEffect(() => {
    if (window.curtissApi?.window?.isMaximized) {
      window.curtissApi.window.isMaximized().then(setIsMaximized).catch(() => {});
    }

    let unsubscribe: (() => void) | undefined;
    if (window.curtissApi?.window?.onMaximizedChange) {
      unsubscribe = window.curtissApi.window.onMaximizedChange((max) => {
        setIsMaximized(max);
      });
    }

    if (window.curtissApi?.school?.getProfile) {
      window.curtissApi.school.getProfile().then((res) => {
        if (res.success && res.data) {
          const name = i18n.language === 'si' && res.data.name_si ? res.data.name_si : res.data.name_en;
          setSchoolName(name || '');
        }
      }).catch(() => {});
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [i18n.language]);

  const handleMinimize = () => {
    window.curtissApi?.window?.minimize();
  };

  const handleMaximize = async () => {
    if (window.curtissApi?.window?.maximize) {
      const maximized = await window.curtissApi.window.maximize();
      setIsMaximized(maximized);
    }
  };

  const handleClose = () => {
    window.curtissApi?.window?.close();
  };

  return (
    <header className="h-9 w-full bg-zinc-100 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between select-none z-50 titlebar-drag-region transition-colors">
      {/* Left: Branding & Status */}
      <div className="flex items-center space-x-3 px-3 titlebar-drag-region">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 rounded bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 flex items-center justify-center font-bold text-[10px]">
            C
          </div>
          <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 tracking-wide">
            {schoolName ? `${t('appName')} — ${schoolName}` : t('appName')}
          </span>
        </div>

        <div className="h-3 w-px bg-zinc-300 dark:bg-zinc-800" />

        <div className="flex items-center space-x-1.5 text-[11px] text-zinc-600 dark:text-zinc-400">
          <Database className={`w-3 h-3 ${isDbConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`} />
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
            {isDbConnected ? t('status.sqliteActive') : t('status.offline')}
          </span>
        </div>
      </div>

      {/* Right: Window Control Actions */}
      <div className="flex items-center h-full titlebar-no-drag">
        <button
          onClick={handleMinimize}
          className="h-full px-3.5 flex items-center justify-center text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/80 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
          title={t('window.minimize')}
          aria-label={t('window.minimize')}
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          className="h-full px-3.5 flex items-center justify-center text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/80 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
          title={isMaximized ? t('window.restore') : t('window.maximize')}
          aria-label={isMaximized ? t('window.restore') : t('window.maximize')}
        >
          {isMaximized ? (
            <Copy className="w-3 h-3 rotate-180" />
          ) : (
            <Square className="w-3 h-3" />
          )}
        </button>
        <button
          onClick={handleClose}
          className="h-full px-3.5 flex items-center justify-center text-zinc-600 hover:text-white hover:bg-red-600 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-red-600 transition-colors"
          title={t('window.close')}
          aria-label={t('window.close')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};

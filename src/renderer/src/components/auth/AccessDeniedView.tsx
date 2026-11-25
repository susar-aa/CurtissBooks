import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Button } from '../ui/Button';

interface AccessDeniedViewProps {
  requiredPermission?: string;
  onBackToDashboard: () => void;
}

export const AccessDeniedView: React.FC<AccessDeniedViewProps> = ({
  requiredPermission,
  onBackToDashboard,
}) => {
  const { t } = useTranslation('auth');

  return (
    <div className="flex-1 p-8 flex items-center justify-center select-none font-sans">
      <div className="max-w-md w-full p-8 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded-2xl text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 mx-auto flex items-center justify-center text-red-600 dark:text-red-400">
          <ShieldAlert className="w-6 h-6" />
        </div>

        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            {t('accessDenied.title')}
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
            {t('accessDenied.description')}
          </p>
        </div>

        {requiredPermission && (
          <div className="p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs font-mono text-zinc-600 dark:text-zinc-300">
            <span className="text-zinc-400 mr-2">{t('accessDenied.permissionRequired')}</span>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">{requiredPermission}</span>
          </div>
        )}

        <p className="text-[11px] text-zinc-400 leading-relaxed">
          {t('accessDenied.contactAdmin')}
        </p>

        <Button
          variant="outline"
          size="sm"
          onClick={onBackToDashboard}
          className="mx-auto"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
          <span>{t('accessDenied.backToDashboard')}</span>
        </Button>
      </div>
    </div>
  );
};


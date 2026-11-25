import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Lock, User as UserIcon, Languages, AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { AuthSession } from '../../../shared/types/auth';

interface SetupViewProps {
  onSetupComplete: (session: AuthSession) => void;
  selectedLanguage: 'en' | 'si';
  onLanguageChange: (lang: 'en' | 'si') => void;
}

export const SetupView: React.FC<SetupViewProps> = ({
  onSetupComplete,
  selectedLanguage,
  onLanguageChange,
}) => {
  const { t } = useTranslation('auth');
  const { t: tCommon } = useTranslation('common');

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || !username.trim() || !password || !confirmPassword) {
      setError(t('setup.errors.allFieldsRequired'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('setup.errors.passwordsDoNotMatch'));
      return;
    }

    setIsLoading(true);
    try {
      const res = await window.curtissApi.auth.setupInitialAdmin({
        fullName: fullName.trim(),
        username: username.trim(),
        password,
      });

      if (res.success && res.data) {
        onSetupComplete(res.data);
      } else {
        setError(res.error || 'Failed to complete initial administrator setup.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex flex-col justify-between bg-zinc-50 dark:bg-zinc-950 p-6 select-none font-sans">
      {/* Header bar with Language Toggle */}
      <div className="flex items-center justify-between max-w-xl mx-auto w-full pt-4">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-lg bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 flex items-center justify-center font-bold text-xs">
            CB
          </div>
          <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
            {tCommon('appName')} — {tCommon('schoolName')}
          </span>
        </div>

        <div className="flex items-center space-x-1 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-lg p-0.5 text-xs">
          <div className="px-1.5 text-zinc-400">
            <Languages className="w-3.5 h-3.5" />
          </div>
          <button
            type="button"
            onClick={() => onLanguageChange('en')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              selectedLanguage === 'en'
                ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 font-semibold shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400'
            }`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => onLanguageChange('si')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              selectedLanguage === 'si'
                ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 font-semibold shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400'
            }`}
          >
            සිංහල
          </button>
        </div>
      </div>

      {/* Main Setup Card */}
      <div className="max-w-md w-full mx-auto my-auto p-8 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 rounded-2xl shadow-xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 mx-auto flex items-center justify-center text-zinc-900 dark:text-zinc-100 mb-3 shadow-inner">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {t('setup.title')}
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            {t('setup.subtitle')}
          </p>
        </div>

        {error && (
          <div className="p-3 text-xs bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 rounded-lg text-red-600 dark:text-red-400 flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="setup-fullname"
            label={t('setup.fullName')}
            placeholder={t('setup.fullNamePlaceholder')}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={isLoading}
            autoFocus
          />

          <Input
            id="setup-username"
            label={t('setup.username')}
            placeholder={t('setup.usernamePlaceholder')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isLoading}
          />

          <Input
            id="setup-password"
            type="password"
            label={t('setup.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
          />

          <Input
            id="setup-confirm-password"
            type="password"
            label={t('setup.confirmPassword')}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isLoading}
          />

          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
            {t('setup.passwordRequirements')}
          </p>

          <Button
            type="submit"
            className="w-full mt-2"
            size="lg"
            isLoading={isLoading}
          >
            {t('setup.submit')}
          </Button>
        </form>
      </div>

      {/* Footer */}
      <div className="text-center text-[11px] text-zinc-400 dark:text-zinc-600 pb-2">
        {tCommon('status.offline')} • {tCommon('status.sqliteActive')}
      </div>
    </div>
  );
};


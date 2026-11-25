import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Eye, EyeOff, Languages, AlertCircle, Shield } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Checkbox } from '../ui/Checkbox';
import { AuthSession } from '../../../shared/types/auth';

interface LoginViewProps {
  onLoginSuccess: (session: AuthSession) => void;
  selectedLanguage: 'en' | 'si';
  onLanguageChange: (lang: 'en' | 'si') => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  selectedLanguage,
  onLanguageChange,
}) => {
  const { t } = useTranslation('auth');
  const { t: tCommon } = useTranslation('common');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberUsername, setRememberUsername] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Check if remembered username exists
    const remembered = localStorage.getItem('curtissbooks_remembered_username');
    if (remembered) {
      setUsername(remembered);
      setRememberUsername(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError(t('setup.errors.allFieldsRequired'));
      return;
    }

    setIsLoading(true);
    try {
      const res = await window.curtissApi.auth.login({
        username: username.trim(),
        password,
      });

      if (res.success && res.data) {
        if (rememberUsername) {
          localStorage.setItem('curtissbooks_remembered_username', username.trim());
        } else {
          localStorage.removeItem('curtissbooks_remembered_username');
        }
        onLoginSuccess(res.data);
      } else {
        setError(res.error || 'Authentication failed. Please verify credentials.');
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
      {/* Top Header */}
      <div className="flex items-center justify-between max-w-xl mx-auto w-full pt-4">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-lg bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 flex items-center justify-center font-bold text-xs shadow-xs">
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

      {/* Main Login Card */}
      <div className="max-w-sm w-full mx-auto my-auto p-8 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 rounded-2xl shadow-xl space-y-6">
        <div className="text-center space-y-1.5">
          <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 mx-auto flex items-center justify-center text-zinc-900 dark:text-zinc-100 mb-3 shadow-inner">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {t('login.title')}
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            {t('login.subtitle')}
          </p>
        </div>

        {error && (
          <div className="p-3 text-xs bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 rounded-lg text-red-600 dark:text-red-400 flex items-start space-x-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="login-username"
            label={t('login.username')}
            placeholder={t('login.usernamePlaceholder')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isLoading}
            autoFocus={!username}
          />

          <div className="space-y-1">
            <label htmlFor="login-password" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {t('login.password')}
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('login.passwordPlaceholder')}
                disabled={isLoading}
                autoFocus={Boolean(username)}
                className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 pr-10 text-xs text-zinc-900 transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus-visible:ring-zinc-300"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <Checkbox
              id="remember-me"
              checked={rememberUsername}
              onChange={(e) => setRememberUsername(e.target.checked)}
              label={t('login.rememberUsername')}
            />
          </div>

          <Button
            type="submit"
            className="w-full mt-2"
            size="lg"
            isLoading={isLoading}
          >
            {t('login.submit')}
          </Button>
        </form>
      </div>

      {/* Footer */}
      <div className="text-center text-[11px] text-zinc-400 dark:text-zinc-600 pb-2">
        {t('login.offlineNotice')}
      </div>
    </div>
  );
};


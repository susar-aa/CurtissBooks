import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Delete, RotateCcw, AlertCircle, Lock, KeyRound, ArrowRight, UserCheck, Languages } from 'lucide-react';
import { AuthSession } from '../../../shared/types/auth';
import appLogo from '../../assets/logo/Curtiss-bg-removed.png';
import textLogo from '../../assets/logo/CurtissBooks Transparent Logo.png';

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

  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isShaking, setIsShaking] = useState<boolean>(false);

  // Fallback username/password mode toggle
  const [usePasswordMode, setUsePasswordMode] = useState<boolean>(false);
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');

  const pinLength = 5;
  const isVerifyingRef = useRef(false);

  // Handle PIN verification
  const handleVerifyPin = useCallback(async (pinToVerify: string) => {
    if (isVerifyingRef.current || isLoading) return;
    isVerifyingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const res = await window.curtissApi.auth.loginWithPin(pinToVerify);
      if (res.success && res.data) {
        onLoginSuccess(res.data);
      } else {
        const errorMsg = res.error || t('login.invalidPin');
        setError(errorMsg);
        setIsShaking(true);
        setTimeout(() => {
          setIsShaking(false);
          setPin('');
        }, 600);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setIsShaking(true);
      setTimeout(() => {
        setIsShaking(false);
        setPin('');
      }, 600);
    } finally {
      setIsLoading(false);
      isVerifyingRef.current = false;
    }
  }, [isLoading, onLoginSuccess, t]);

  // Keypad input handlers
  const handleDigit = useCallback((digit: string) => {
    if (isLoading || isVerifyingRef.current) return;
    setError(null);
    setPin((prev) => {
      if (prev.length >= pinLength) return prev;
      const next = prev + digit;
      if (next.length === pinLength) {
        // Auto-verify on 5th digit
        setTimeout(() => handleVerifyPin(next), 50);
      }
      return next;
    });
  }, [isLoading, handleVerifyPin]);

  const handleBackspace = useCallback(() => {
    if (isLoading || isVerifyingRef.current) return;
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  }, [isLoading]);

  const handleClear = useCallback(() => {
    if (isLoading || isVerifyingRef.current) return;
    setError(null);
    setPin('');
  }, [isLoading]);

  // Global physical keyboard listener
  useEffect(() => {
    if (usePasswordMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if focus is in an input field (shouldn't be any in PIN mode, but safe guard)
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape' || e.key === 'Delete') {
        e.preventDefault();
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [usePasswordMode, handleDigit, handleBackspace, handleClear]);

  // Legacy username & password login handler
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError(t('setup.errors.allFieldsRequired'));
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await window.curtissApi.auth.login({
        username: username.trim(),
        password,
      });
      if (res.success && res.data) {
        onLoginSuccess(res.data);
      } else {
        setError(res.error || 'Authentication failed. Please verify credentials.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex flex-col justify-between bg-zinc-50 dark:bg-zinc-950 p-6 select-none font-sans">
      {/* Top Header */}
      <div className="flex items-center justify-between max-w-xl mx-auto w-full pt-2">
        <div className="flex items-center space-x-2.5">
          <img src={appLogo} alt="Curtiss" className="w-8 h-8 object-contain shrink-0" />
          <img src={textLogo} alt="CurtissBooks" className="h-6 w-auto object-contain" />
        </div>

        {/* Language selector toggle */}
        <div className="flex items-center space-x-1 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-lg p-0.5 text-xs shadow-xs">
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

      {/* Main Authentication Card */}
      <div className="max-w-sm w-full mx-auto my-auto p-7 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 rounded-2xl shadow-xl space-y-5">
        {!usePasswordMode ? (
          /* ==================== 5-DIGIT PIN AUTHENTICATION ==================== */
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <img src={appLogo} alt="Curtiss" className="w-14 h-14 object-contain mx-auto mb-2 drop-shadow-xs" />
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                {t('login.pinTitle')}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {t('login.pinSubtitle')}
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-2.5 text-xs bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900/60 rounded-xl text-red-600 dark:text-red-400 flex items-center space-x-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="truncate">{error}</span>
              </div>
            )}

            {/* 5-Digit Visual Indicators */}
            <div className={`flex justify-center items-center space-x-3 py-1 ${isShaking ? 'animate-bounce' : ''}`}>
              {Array.from({ length: pinLength }).map((_, idx) => {
                const isFilled = idx < pin.length;
                const isCurrent = idx === pin.length;
                return (
                  <div
                    key={idx}
                    className={`w-11 h-13 rounded-xl border flex items-center justify-center text-lg font-mono font-bold transition-all duration-150 ${
                      isFilled
                        ? 'border-zinc-900 bg-zinc-950 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950 shadow-xs scale-105'
                        : isCurrent
                        ? 'border-zinc-400 dark:border-zinc-500 bg-zinc-50 dark:bg-zinc-800/60 ring-2 ring-zinc-300 dark:ring-zinc-700'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 text-transparent'
                    } ${isShaking ? 'border-red-500 dark:border-red-500' : ''}`}
                  >
                    {isFilled ? '●' : isCurrent ? <span className="inline-block w-1.5 h-4 bg-zinc-400 animate-pulse rounded-full" /> : ''}
                  </div>
                );
              })}
            </div>

            {/* Tactile Keypad */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { label: '1', val: '1' },
                { label: '2', val: '2' },
                { label: '3', val: '3' },
                { label: '4', val: '4' },
                { label: '5', val: '5' },
                { label: '6', val: '6' },
                { label: '7', val: '7' },
                { label: '8', val: '8' },
                { label: '9', val: '9' },
                {
                  label: 'C',
                  action: handleClear,
                  icon: <RotateCcw className="w-4 h-4 text-zinc-500" />,
                  title: t('login.clear'),
                },
                { label: '0', val: '0' },
                {
                  label: '⌫',
                  action: handleBackspace,
                  icon: <Delete className="w-4 h-4 text-zinc-500" />,
                  title: t('login.backspace'),
                },
              ].map((btn, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={isLoading}
                  onClick={() => {
                    if (btn.action) {
                      btn.action();
                    } else if (btn.val) {
                      handleDigit(btn.val);
                    }
                  }}
                  className="h-12 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-95 text-zinc-900 dark:text-zinc-100 font-semibold text-base transition-all flex items-center justify-center shadow-xs cursor-pointer disabled:opacity-50"
                  title={btn.title}
                >
                  {btn.icon || btn.label}
                </button>
              ))}
            </div>

            {/* Toggle to Password Login */}
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setUsePasswordMode(true);
                }}
                className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors inline-flex items-center space-x-1"
              >
                <KeyRound className="w-3 h-3" />
                <span>Use Username & Password</span>
              </button>
            </div>
          </div>
        ) : (
          /* ==================== FALLBACK: USERNAME & PASSWORD ==================== */
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <img src={appLogo} alt="Curtiss" className="w-14 h-14 object-contain mx-auto mb-2 drop-shadow-xs" />
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                {t('login.title')}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {t('login.subtitle')}
              </p>
            </div>

            {error && (
              <div className="p-2.5 text-xs bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 rounded-xl text-red-600 dark:text-red-400 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  {t('login.username')}
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('login.usernamePlaceholder')}
                  disabled={isLoading}
                  autoFocus
                  className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  {t('login.password')}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('login.passwordPlaceholder')}
                  disabled={isLoading}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2 px-3 rounded-lg bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 font-semibold text-xs hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-xs flex items-center justify-center space-x-1.5"
              >
                <span>{isLoading ? 'Authenticating...' : t('login.submit')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setUsePasswordMode(false);
                  }}
                  className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors inline-flex items-center space-x-1"
                >
                  <Shield className="w-3 h-3" />
                  <span>Back to 5-Digit PIN Login</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Footer Branding & Developer Credits */}
      <div className="text-center space-y-1.5 pb-2">
        <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
          {t('login.offlineNotice')}
        </div>
        <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 tracking-wide">
          Developped By Curtiss &bull;{' '}
          <span className="text-zinc-700 dark:text-zinc-300 font-semibold">www.trycurtiss.com</span>
        </div>
      </div>
    </div>
  );
};

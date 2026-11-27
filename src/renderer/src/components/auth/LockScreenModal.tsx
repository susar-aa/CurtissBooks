import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, AlertCircle, LogOut, Shield, RotateCcw, Delete, KeyRound } from 'lucide-react';
import { User } from '../../../shared/types/auth';

interface LockScreenModalProps {
  user: User;
  onUnlocked: () => void;
  onLogout: () => void;
}

export const LockScreenModal: React.FC<LockScreenModalProps> = ({
  user,
  onUnlocked,
  onLogout,
}) => {
  const { t } = useTranslation('auth');
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isShaking, setIsShaking] = useState<boolean>(false);

  // Fallback to password
  const [usePasswordMode, setUsePasswordMode] = useState<boolean>(false);
  const [password, setPassword] = useState<string>('');

  const pinLength = 5;
  const isVerifyingRef = useRef(false);

  const handleVerifyPin = useCallback(async (pinToVerify: string) => {
    if (isVerifyingRef.current || isLoading) return;
    isVerifyingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const res = await window.curtissApi.auth.unlockSessionWithPin(pinToVerify);
      if (res.success) {
        onUnlocked();
      } else {
        setError(res.error || t('login.invalidPin'));
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
  }, [isLoading, onUnlocked, t]);

  const handleDigit = useCallback((digit: string) => {
    if (isLoading || isVerifyingRef.current) return;
    setError(null);
    setPin((prev) => {
      if (prev.length >= pinLength) return prev;
      const next = prev + digit;
      if (next.length === pinLength) {
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

  // Physical keyboard listener
  useEffect(() => {
    if (usePasswordMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
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

  const handlePasswordUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await window.curtissApi.auth.unlockSession(password);
      if (res.success) {
        onUnlocked();
      } else {
        setError(res.error || 'Incorrect password.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/90 backdrop-blur-md select-none font-sans animate-in fade-in">
      <div className="max-w-xs w-full p-6 border border-zinc-800 bg-zinc-900 rounded-2xl shadow-2xl text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 mx-auto flex items-center justify-center text-zinc-200 shadow-inner">
          <Lock className="w-5 h-5 text-amber-400" />
        </div>

        <div>
          <h2 className="text-base font-bold text-zinc-100">{t('lock.pinTitle')}</h2>
          <div className="mt-1 inline-flex items-center px-2.5 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-xs font-medium text-zinc-300">
            {user.full_name} (@{user.username})
          </div>
        </div>

        {error && (
          <div className="p-2 text-xs bg-red-950/60 border border-red-900/60 rounded-lg text-red-400 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">{error}</span>
          </div>
        )}

        {!usePasswordMode ? (
          <div className="space-y-4">
            {/* 5-Digit Visual Indicators */}
            <div className={`flex justify-center items-center space-x-2.5 py-1 ${isShaking ? 'animate-bounce' : ''}`}>
              {Array.from({ length: pinLength }).map((_, idx) => {
                const isFilled = idx < pin.length;
                const isCurrent = idx === pin.length;
                return (
                  <div
                    key={idx}
                    className={`w-10 h-12 rounded-lg border flex items-center justify-center text-base font-mono font-bold transition-all duration-150 ${
                      isFilled
                        ? 'border-zinc-100 bg-zinc-100 text-zinc-950 shadow-xs scale-105'
                        : isCurrent
                        ? 'border-zinc-500 bg-zinc-800/60 ring-2 ring-zinc-700'
                        : 'border-zinc-800 bg-zinc-900/40 text-transparent'
                    } ${isShaking ? 'border-red-500' : ''}`}
                  >
                    {isFilled ? '●' : isCurrent ? <span className="inline-block w-1.5 h-3.5 bg-zinc-400 animate-pulse rounded-full" /> : ''}
                  </div>
                );
              })}
            </div>

            {/* Tactile Keypad */}
            <div className="grid grid-cols-3 gap-1.5 pt-1">
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
                  icon: <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />,
                  title: t('login.clear'),
                },
                { label: '0', val: '0' },
                {
                  label: '⌫',
                  action: handleBackspace,
                  icon: <Delete className="w-3.5 h-3.5 text-zinc-400" />,
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
                  className="h-10 rounded-lg border border-zinc-800 bg-zinc-800/50 hover:bg-zinc-800 active:scale-95 text-zinc-100 font-semibold text-sm transition-all flex items-center justify-center shadow-xs cursor-pointer disabled:opacity-50"
                  title={btn.title}
                >
                  {btn.icon || btn.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80 text-xs text-zinc-400">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setUsePasswordMode(true);
                }}
                className="hover:text-zinc-200 transition-colors inline-flex items-center space-x-1"
              >
                <KeyRound className="w-3 h-3" />
                <span>Password</span>
              </button>

              <button
                type="button"
                onClick={onLogout}
                className="hover:text-zinc-200 flex items-center space-x-1"
              >
                <LogOut className="w-3 h-3" />
                <span>{t('lock.switchUser')}</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handlePasswordUnlock} className="space-y-3">
            <input
              type="password"
              placeholder={t('lock.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              autoFocus
              className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-100"
            />

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2 px-3 rounded-lg bg-zinc-100 text-zinc-950 font-semibold text-xs hover:bg-zinc-200 transition-colors shadow-xs"
            >
              {t('lock.submit')}
            </button>

            <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80 text-xs text-zinc-400">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setUsePasswordMode(false);
                }}
                className="hover:text-zinc-200 inline-flex items-center space-x-1"
              >
                <Shield className="w-3 h-3" />
                <span>Use PIN</span>
              </button>

              <button
                type="button"
                onClick={onLogout}
                className="hover:text-zinc-200 flex items-center space-x-1"
              >
                <LogOut className="w-3 h-3" />
                <span>{t('lock.switchUser')}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

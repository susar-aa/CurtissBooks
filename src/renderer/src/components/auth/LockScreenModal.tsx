import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, AlertCircle, LogOut } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
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
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
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
      <div className="max-w-sm w-full p-8 border border-zinc-800 bg-zinc-900 rounded-2xl shadow-2xl text-center space-y-6">
        <div className="w-14 h-14 rounded-full bg-zinc-800 border border-zinc-700 mx-auto flex items-center justify-center text-zinc-200 shadow-inner">
          <Lock className="w-6 h-6 text-amber-400" />
        </div>

        <div>
          <h2 className="text-base font-bold text-zinc-100">{t('lock.title')}</h2>
          <p className="text-xs text-zinc-400 mt-1">{t('lock.subtitle')}</p>
          <div className="mt-3 inline-flex items-center px-2.5 py-1 rounded-md bg-zinc-800 border border-zinc-700 text-xs font-medium text-zinc-300">
            {user.full_name} (@{user.username})
          </div>
        </div>

        {error && (
          <div className="p-2.5 text-xs bg-red-950/60 border border-red-900/60 rounded-md text-red-400 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleUnlock} className="space-y-4">
          <Input
            id="unlock-password"
            type="password"
            placeholder={t('lock.passwordPlaceholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            autoFocus
          />

          <Button type="submit" className="w-full" size="md" isLoading={isLoading}>
            {t('lock.submit')}
          </Button>

          <button
            type="button"
            onClick={onLogout}
            className="w-full text-xs text-zinc-400 hover:text-zinc-200 flex items-center justify-center space-x-1.5 pt-1"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{t('lock.switchUser')}</span>
          </button>
        </form>
      </div>
    </div>
  );
};


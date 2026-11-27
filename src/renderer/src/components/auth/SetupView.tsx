import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Lock, Languages, AlertCircle, KeyRound, CheckCircle2, Shield } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { AuthSession } from '../../../shared/types/auth';
import appLogo from '../../assets/logo/Curtiss-bg-removed.png';
import textLogo from '../../assets/logo/CurtissBooks Transparent Logo.png';

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

  // Step state: 1 = Developer Authorization, 2 = Admin Provisioning
  const [step, setStep] = useState<1 | 2>(1);
  const [developerPin, setDeveloperPin] = useState('');
  const [verifiedDevPin, setVerifiedDevPin] = useState('');

  // Admin form fields
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('admin');
  const [pin, setPin] = useState('12345');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Step 1: Verify Developer PIN
  const handleVerifyDeveloperPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanPin = developerPin.trim();
    if (!cleanPin) {
      setError(t('setup.errors.allFieldsRequired'));
      return;
    }

    setIsLoading(true);
    try {
      const res = await window.curtissApi.auth.verifyDeveloperPin(cleanPin);
      if (res.success) {
        setVerifiedDevPin(cleanPin);
        setStep(2);
      } else {
        setError(res.error || t('setup.developerLicense.unauthorizedError'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Provision Initial Admin Account
  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || !username.trim() || !password || !confirmPassword || !pin.trim()) {
      setError(t('setup.errors.allFieldsRequired'));
      return;
    }

    if (!/^\d{5}$/.test(pin.trim())) {
      setError(t('setup.errors.invalidPin'));
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
        pin: pin.trim(),
        password,
        developerPin: verifiedDevPin,
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
        <div className="flex items-center space-x-3">
          <img src={appLogo} alt="Curtiss" className="w-8 h-8 object-contain shrink-0" />
          <img src={textLogo} alt="CurtissBooks" className="h-7 w-auto object-contain dark:invert" />
        </div>

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

      {/* Main Setup Container */}
      <div className="max-w-md w-full mx-auto my-auto p-8 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 rounded-2xl shadow-xl space-y-6">
        {step === 1 ? (
          /* ==================== STEP 1: DEVELOPER PIN AUTHORIZATION ==================== */
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <img src={appLogo} alt="Curtiss" className="w-14 h-14 object-contain mx-auto mb-2 drop-shadow-xs" />
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                {t('setup.developerLicense.title')}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                {t('setup.developerLicense.subtitle')}
              </p>
            </div>

            {error && (
              <div className="p-3 text-xs bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 rounded-xl text-red-600 dark:text-red-400 flex items-start space-x-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleVerifyDeveloperPin} className="space-y-4">
              <Input
                id="developer-pin"
                type="password"
                label={t('setup.developerLicense.pinLabel')}
                placeholder={t('setup.developerLicense.pinPlaceholder')}
                value={developerPin}
                onChange={(e) => setDeveloperPin(e.target.value)}
                disabled={isLoading}
                autoFocus
                required
              />

              <Button
                type="submit"
                className="w-full mt-2"
                size="md"
                isLoading={isLoading}
              >
                <Shield className="w-4 h-4 mr-2" />
                <span>{t('setup.developerLicense.verify')}</span>
              </Button>
            </form>
          </div>
        ) : (
          /* ==================== STEP 2: INITIAL ADMIN PROVISIONING ==================== */
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <img src={appLogo} alt="Curtiss" className="w-14 h-14 object-contain mx-auto mb-2 drop-shadow-xs" />

              {/* Developer Verified Badge */}
              <div className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{t('setup.developerLicense.authorizedBadge')}</span>
              </div>

              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                {t('setup.title')}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                {t('setup.subtitle')}
              </p>
            </div>

            {error && (
              <div className="p-3 text-xs bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 rounded-xl text-red-600 dark:text-red-400 flex items-start space-x-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleAdminSubmit} className="space-y-3.5">
              <Input
                id="setup-fullname"
                label={t('setup.fullName')}
                placeholder={t('setup.fullNamePlaceholder')}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isLoading}
                autoFocus
                required
              />

              <Input
                id="setup-username"
                label={t('setup.username')}
                placeholder={t('setup.usernamePlaceholder')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                required
              />

              <Input
                id="setup-pin"
                type="text"
                maxLength={5}
                label={t('setup.pin')}
                placeholder={t('setup.pinPlaceholder')}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 5))}
                disabled={isLoading}
                required
              />

              <Input
                id="setup-password"
                type="password"
                label={t('setup.password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
              />

              <Input
                id="setup-confirm-password"
                type="password"
                label={t('setup.confirmPassword')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
                required
              />

              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
                {t('setup.passwordRequirements')}
              </p>

              <Button
                type="submit"
                className="w-full mt-2"
                size="md"
                isLoading={isLoading}
              >
                {t('setup.submit')}
              </Button>
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

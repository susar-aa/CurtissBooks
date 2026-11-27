import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  School,
  Building,
  Mail,
  Phone,
  User,
  Calendar,
  Image as ImageIcon,
  Save,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Trash2,
  ShieldAlert,
  Wallet,
  Coins,
  Building2,
  Landmark,
} from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { SchoolProfile } from '../../../shared/types/school';
import { OpeningBalancesData } from '../../../shared/types/ipc';

export const SchoolProfileView: React.FC = () => {
  const { t } = useTranslation('school');
  const { t: tCommon } = useTranslation('common');
  const { success, error: toastError } = useToast();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Opening Balances States
  const [openingData, setOpeningData] = useState<OpeningBalancesData | null>(null);
  const [cashOpeningInput, setCashOpeningInput] = useState('');
  const [pettyOpeningInput, setPettyOpeningInput] = useState('');
  const [bankOpeningInputs, setBankOpeningInputs] = useState<Record<number, string>>({});
  const [savingOpening, setSavingOpening] = useState(false);

  // Factory Reset States
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [profile, setProfile] = useState<Partial<SchoolProfile>>({
    name_en: '',
    name_si: '',
    registration_number: '',
    school_type: '1AB',
    address_en: '',
    address_si: '',
    telephone: '',
    email: '',
    principal_name: '',
    established_date: '',
    vision: '',
    mission: '',
    logo_path: null
  });

  const loadProfile = async () => {
    setLoading(true);
    try {
      const res = await window.curtissApi.school.getProfile();
      if (res.success && res.data) {
        setProfile(res.data);
      }
    } catch (err: unknown) {
      console.error('Failed to load school profile:', err);
      toastError('Failed to load school profile');
    } finally {
      setLoading(false);
    }
  };

  const loadOpeningBalances = async () => {
    try {
      if (window.curtissApi?.settings?.getOpeningBalances) {
        const res = await window.curtissApi.settings.getOpeningBalances();
        if (res.success && res.data) {
          setOpeningData(res.data);
          setCashOpeningInput(
            res.data.cashOpeningBalanceCents ? (res.data.cashOpeningBalanceCents / 100).toFixed(2) : ''
          );
          setPettyOpeningInput(
            res.data.pettyCashOpeningBalanceCents ? (res.data.pettyCashOpeningBalanceCents / 100).toFixed(2) : ''
          );
          const bankInputs: Record<number, string> = {};
          for (const b of res.data.bankAccounts) {
            bankInputs[b.id] = b.opening_balance_cents ? (b.opening_balance_cents / 100).toFixed(2) : '';
          }
          setBankOpeningInputs(bankInputs);
        }
      }
    } catch (err: unknown) {
      console.error('Failed to load opening balances:', err);
    }
  };

  useEffect(() => {
    loadProfile();
    loadOpeningBalances();
  }, []);

  const handleSaveOpeningBalances = async () => {
    setSavingOpening(true);
    try {
      const cashVal = parseFloat(cashOpeningInput || '0');
      const pettyVal = parseFloat(pettyOpeningInput || '0');

      if (isNaN(cashVal) || cashVal < 0 || isNaN(pettyVal) || pettyVal < 0) {
        toastError('Invalid Amount', 'Opening balance values must be non-negative numbers.');
        return;
      }

      const bankPayload: Array<{ id: number; opening_balance_cents: number }> = [];
      if (openingData?.bankAccounts) {
        for (const b of openingData.bankAccounts) {
          const val = parseFloat(bankOpeningInputs[b.id] || '0');
          if (isNaN(val) || val < 0) {
            toastError('Invalid Amount', `Opening balance for ${b.bank_name} must be a non-negative number.`);
            return;
          }
          bankPayload.push({
            id: b.id,
            opening_balance_cents: Math.round(val * 100),
          });
        }
      }

      const res = await window.curtissApi.settings.updateOpeningBalances({
        financialYearId: openingData?.financialYear?.id,
        cashOpeningBalanceCents: Math.round(cashVal * 100),
        pettyCashOpeningBalanceCents: Math.round(pettyVal * 100),
        bankAccounts: bankPayload,
      });

      if (res.success) {
        success(t('openingBalances.saveSuccess'));
        await loadOpeningBalances();
      } else {
        toastError(res.error || t('openingBalances.saveError'));
      }
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : t('openingBalances.saveError'));
    } finally {
      setSavingOpening(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toastError('Logo size exceeds 2MB limit');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = (reader.result as string).split(',')[1];
        const res = await window.curtissApi.school.uploadLogo({
          base64Data,
          fileName: file.name,
          mimeType: file.type
        });

        if (res.success && res.data) {
          setProfile((prev) => ({ ...prev, logo_path: res.data?.logoPath || null }));
          success('School crest updated successfully');
        } else {
          toastError(res.error || 'Failed to upload logo');
        }
      } catch (err: unknown) {
        toastError(err instanceof Error ? err.message : 'Logo upload failed');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await window.curtissApi.school.updateProfile(profile);
      if (res.success && res.data) {
        setProfile(res.data);
        success(t('saveSuccess'));
      } else {
        toastError(res.error || 'Failed to update profile');
      }
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleFactoryReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);

    const cleanPin = adminPin.trim();
    if (!cleanPin || cleanPin.length !== 5) {
      setResetError('Administrator 5-digit PIN is required.');
      return;
    }

    if (!confirmChecked) {
      setResetError('Please confirm the acknowledgment checkbox before proceeding.');
      return;
    }

    setIsResetting(true);
    try {
      const res = await window.curtissApi.settings.factoryReset(cleanPin);
      if (res.success) {
        success(t('dangerZone.successToast'));
        setResetModalOpen(false);
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        setResetError(res.error || 'Factory reset failed. Please check administrator credentials.');
      }
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        action={
          <Button
            type="submit"
            form="school-profile-form"
            variant="primary"
            isLoading={saving}
            className="gap-2"
          >
            <Save className="w-4 h-4" />
            {tCommon('actions.save')}
          </Button>
        }
      />

      <form id="school-profile-form" onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Official Identity & Crest */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-sm space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <School className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-slate-100">
              Institutional Identity & Crest
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
            {/* Logo Preview and Upload */}
            <div className="md:col-span-1 flex flex-col items-center p-4 rounded-xl border border-dashed border-slate-700 bg-slate-950/40 text-center">
              <div className="w-28 h-28 rounded-full overflow-hidden bg-slate-800 flex items-center justify-center border border-slate-700 mb-3 shadow-inner">
                {profile.logo_path ? (
                  <img
                    src={`atom://${profile.logo_path}`}
                    alt="School Logo"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '';
                    }}
                  />
                ) : (
                  <Building className="w-12 h-12 text-slate-500" />
                )}
              </div>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
                <span className="inline-block px-3 py-1.5 text-xs font-medium text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg transition-colors">
                  {t('uploadLogo')}
                </span>
              </label>
              <span className="text-[10px] text-slate-500 mt-2">PNG or WEBP up to 2MB</span>
            </div>

            {/* School Names & Registration */}
            <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {t('nameEn')} *
                </label>
                <Input
                  value={profile.name_en || ''}
                  onChange={(e) => setProfile({ ...profile, name_en: e.target.value })}
                  placeholder="e.g. Curtiss Central College"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {t('nameSi')} *
                </label>
                <Input
                  value={profile.name_si || ''}
                  onChange={(e) => setProfile({ ...profile, name_si: e.target.value })}
                  placeholder="e.g. කර්ටිස් මධ්‍ය මහා විද්‍යාලය"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {t('regNo')}
                </label>
                <Input
                  value={profile.registration_number || ''}
                  onChange={(e) => setProfile({ ...profile, registration_number: e.target.value })}
                  placeholder="e.g. CEN-2026-9874"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {t('schoolType')}
                </label>
                <Input
                  value={profile.school_type || ''}
                  onChange={(e) => setProfile({ ...profile, school_type: e.target.value })}
                  placeholder="1AB / 1C / Type 2 / Type 3"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {t('established')}
                </label>
                <Input
                  type="date"
                  value={profile.established_date || ''}
                  onChange={(e) => setProfile({ ...profile, established_date: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Contact & Location */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-sm space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Phone className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-slate-100">
              Institutional Contact & Location
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                {t('telephone')}
              </label>
              <Input
                value={profile.telephone || ''}
                onChange={(e) => setProfile({ ...profile, telephone: e.target.value })}
                placeholder="e.g. 011-2345678"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                {t('email')}
              </label>
              <Input
                type="email"
                value={profile.email || ''}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                placeholder="e.g. info@curtisscollege.lk"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                {t('addressEn')}
              </label>
              <Textarea
                value={profile.address_en || ''}
                onChange={(e) => setProfile({ ...profile, address_en: e.target.value })}
                rows={2}
                placeholder="Postal Address in English"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                {t('addressSi')}
              </label>
              <Textarea
                value={profile.address_si || ''}
                onChange={(e) => setProfile({ ...profile, address_si: e.target.value })}
                rows={2}
                placeholder="තැපැල් ලිපිනය සිංහලෙන්"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Principal & Administration */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-sm space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <User className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-slate-100">
              Principal & Institutional Leadership
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                {t('principal')}
              </label>
              <Input
                value={profile.principal_name || ''}
                onChange={(e) => setProfile({ ...profile, principal_name: e.target.value })}
                placeholder="e.g. Mr. K. A. Perera"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Vision & Mission */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-sm space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Building className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-slate-100">
              Motto, Vision & Mission
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                {t('vision')}
              </label>
              <Textarea
                value={profile.vision || ''}
                onChange={(e) => setProfile({ ...profile, vision: e.target.value })}
                rows={3}
                placeholder="To nurture balanced, enlightened citizens..."
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                {t('mission')}
              </label>
              <Textarea
                value={profile.mission || ''}
                onChange={(e) => setProfile({ ...profile, mission: e.target.value })}
                rows={3}
                placeholder="Providing holistic education through exemplary standards..."
              />
            </div>
          </div>
        </div>

        {/* Section 5: Account Opening Balances */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Landmark className="w-5 h-5 text-indigo-400" />
              <div>
                <h2 className="text-base font-semibold text-slate-100">
                  {t('openingBalances.title')}
                </h2>
                <p className="text-xs text-slate-400">
                  {t('openingBalances.subtitle')}
                </p>
              </div>
            </div>
            {openingData?.financialYear && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                {t('openingBalances.financialYear')}: {openingData.financialYear.year_name}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Cash in Hand Opening Balance Card */}
            <div className="p-5 rounded-xl bg-slate-950/50 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                    <Wallet className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">
                      {t('openingBalances.cashInHand')}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {t('openingBalances.cashInHandHelp')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-400">{t('openingBalances.currentCashBalance')}:</span>
                  <span className="font-mono font-semibold text-emerald-400">
                    Rs. {((openingData?.cashCurrentBalanceCents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-semibold text-slate-500">
                    Rs.
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={cashOpeningInput}
                    onChange={(e) => setCashOpeningInput(e.target.value)}
                    placeholder="0.00"
                    className="pl-9 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Petty Cash Float Opening Balance Card */}
            <div className="p-5 rounded-xl bg-slate-950/50 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                    <Coins className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">
                      {t('openingBalances.pettyCash')}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {t('openingBalances.pettyCashHelp')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-400">{t('openingBalances.currentPettyBalance')}:</span>
                  <span className="font-mono font-semibold text-amber-400">
                    Rs. {((openingData?.pettyCashCurrentBalanceCents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-semibold text-slate-500">
                    Rs.
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={pettyOpeningInput}
                    onChange={(e) => setPettyOpeningInput(e.target.value)}
                    placeholder="0.00"
                    className="pl-9 font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Bank Accounts Opening Balances */}
          <div className="p-5 rounded-xl bg-slate-950/50 border border-slate-800 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-200">
                  {t('openingBalances.bankAccounts')}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {t('openingBalances.bankAccountsHelp')}
                </p>
              </div>
            </div>

            {(!openingData?.bankAccounts || openingData.bankAccounts.length === 0) ? (
              <div className="p-3 text-xs text-slate-400 bg-slate-900/50 rounded-lg border border-slate-800">
                {t('openingBalances.noBankAccounts')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="pb-2">{t('openingBalances.accountCode')}</th>
                      <th className="pb-2">{t('openingBalances.bankName')}</th>
                      <th className="pb-2">{t('openingBalances.accountNumber')}</th>
                      <th className="pb-2">{t('openingBalances.accountType')}</th>
                      <th className="pb-2 text-right">{t('openingBalances.currentBalance')}</th>
                      <th className="pb-2 w-48 text-right">{t('openingBalances.openingBalance')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {openingData.bankAccounts.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-900/40">
                        <td className="py-2.5 font-mono font-semibold text-slate-300">{b.account_code}</td>
                        <td className="py-2.5 text-slate-200 font-medium">
                          {b.bank_name} <span className="text-slate-400 font-normal">({b.branch_name})</span>
                        </td>
                        <td className="py-2.5 font-mono text-slate-300">{b.account_number}</td>
                        <td className="py-2.5 text-slate-400 capitalize">{b.account_type}</td>
                        <td className="py-2.5 font-mono text-right font-semibold text-blue-400">
                          Rs. {(b.current_balance_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 pl-4">
                          <div className="relative">
                            <span className="absolute left-2.5 top-2 text-xs font-semibold text-slate-500">
                              Rs.
                            </span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={bankOpeningInputs[b.id] ?? ''}
                              onChange={(e) =>
                                setBankOpeningInputs((prev) => ({
                                  ...prev,
                                  [b.id]: e.target.value,
                                }))
                              }
                              placeholder="0.00"
                              className="pl-8 text-right font-mono h-8 text-xs"
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-1">
            <Button
              type="button"
              variant="primary"
              onClick={handleSaveOpeningBalances}
              isLoading={savingOpening}
              className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Save className="w-4 h-4" />
              <span>{t('openingBalances.saveButton')}</span>
            </Button>
          </div>
        </div>

        {/* Section 6: Danger Zone - Factory Reset */}
        <div className="p-6 rounded-2xl bg-red-950/20 border border-red-900/50 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-red-900/40 pb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-500" />
              <h2 className="text-base font-semibold text-red-400">
                {t('dangerZone.title')}
              </h2>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-950/80 border border-red-800 text-red-400 font-semibold uppercase">
              Irreversible
            </span>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            {t('dangerZone.subtitle')}
          </p>

          <div className="pt-1">
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setAdminPin('');
                setConfirmChecked(false);
                setResetError(null);
                setResetModalOpen(true);
              }}
              className="gap-2 bg-red-600 hover:bg-red-700 text-white"
            >
              <Trash2 className="w-4 h-4" />
              <span>{t('dangerZone.button')}</span>
            </Button>
          </div>
        </div>
      </form>

      {/* Factory Reset Modal */}
      <Modal
        isOpen={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        title={t('dangerZone.modalTitle')}
        maxWidth="md"
      >
        <form onSubmit={handleFactoryReset} className="space-y-4">
          <div className="p-3 text-xs bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 flex items-start space-x-2.5">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              {t('dangerZone.modalWarning')}
            </div>
          </div>

          {resetError && (
            <div className="p-2.5 text-xs bg-red-950/60 border border-red-900 rounded-lg text-red-400 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{resetError}</span>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-300">
              {t('dangerZone.adminPinLabel')}
            </label>
            <Input
              id="factory-reset-admin-pin"
              type="password"
              maxLength={5}
              placeholder={t('dangerZone.adminPinPlaceholder')}
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 5))}
              disabled={isResetting}
              autoFocus
              required
            />
          </div>

          <label className="flex items-start space-x-2.5 text-xs text-zinc-300 select-none cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={confirmChecked}
              onChange={(e) => setConfirmChecked(e.target.checked)}
              disabled={isResetting}
              className="mt-0.5 rounded border-zinc-700 bg-zinc-900 text-red-600 focus:ring-red-500"
            />
            <span>{t('dangerZone.confirmationCheckbox')}</span>
          </label>

          <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isResetting}
              onClick={() => setResetModalOpen(false)}
            >
              {t('dangerZone.cancelButton')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              isLoading={isResetting}
              disabled={!confirmChecked || adminPin.length !== 5}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              <span>{t('dangerZone.confirmButton')}</span>
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

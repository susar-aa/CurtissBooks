import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { School, Building, Mail, Phone, User, Calendar, Image as ImageIcon, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { useToast } from '../ui/Toast';
import { SchoolProfile } from '../../../shared/types/school';

export const SchoolProfileView: React.FC = () => {
  const { t } = useTranslation('school');
  const { t: tCommon } = useTranslation('common');
  const { success, error: toastError } = useToast();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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

  useEffect(() => {
    loadProfile();
  }, []);

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
      </form>
    </div>
  );
};

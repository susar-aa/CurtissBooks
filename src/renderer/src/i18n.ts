import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import commonEn from './locales/en/common.json';
import navigationEn from './locales/en/navigation.json';
import dashboardEn from './locales/en/dashboard.json';
import authEn from './locales/en/auth.json';
import usersEn from './locales/en/users.json';
import schoolEn from './locales/en/school.json';
import financeEn from './locales/en/finance.json';

import commonSi from './locales/si/common.json';
import navigationSi from './locales/si/navigation.json';
import dashboardSi from './locales/si/dashboard.json';
import authSi from './locales/si/auth.json';
import usersSi from './locales/si/users.json';
import schoolSi from './locales/si/school.json';
import financeSi from './locales/si/finance.json';

export const defaultNS = 'common';
export const resources = {
  en: {
    common: commonEn,
    navigation: navigationEn,
    dashboard: dashboardEn,
    auth: authEn,
    users: usersEn,
    school: schoolEn,
    finance: financeEn,
  },
  si: {
    common: commonSi,
    navigation: navigationSi,
    dashboard: dashboardSi,
    auth: authSi,
    users: usersSi,
    school: schoolSi,
    finance: financeSi,
  },
} as const;

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  interpolation: {
    escapeValue: false,
  },
});

export async function changeAppLanguage(lang: 'en' | 'si'): Promise<void> {
  await i18n.changeLanguage(lang);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
  if (window.curtissApi?.settings?.set) {
    try {
      await window.curtissApi.settings.set('default_language', lang);
    } catch (e) {
      console.error('Failed to persist language in SQLite:', e);
    }
  }
}

export default i18n;

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ja from './locales/ja.json';

const STORAGE_KEY = 'ideaspark_lang';
const fallbackLng = 'ja';

const getStoredLang = () => {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'ja') return stored;
  return null;
};

const initialLng = getStoredLang() || fallbackLng;

i18n
  .use(initReactI18next)
  .init({
    lng: initialLng,
    fallbackLng,
    resources: {
      en: { translation: en },
      ja: { translation: ja }
    },
    interpolation: {
      escapeValue: false
    }
  });

export const saveLanguage = (lang: string) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(STORAGE_KEY, lang);
};

export default i18n;

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import es from './locales/es.json';

export const SUPPORTED_LANGUAGES = ['en', 'es'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/** localStorage key holding the user's explicit language choice. */
export const LANGUAGE_STORAGE_KEY = 'roundtable:lang';

// Initialize the shared i18next instance. Detection order: an explicit choice
// in localStorage wins; otherwise we fall back to the browser language, then to
// English. `nonExplicitSupportedLngs` maps regional variants (es-AR, en-US) to
// our base languages.
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES,
    nonExplicitSupportedLngs: true,
    // Resources are bundled inline (no async backend), so init is synchronous
    // by default in i18next v23+ and `t` works on the next tick — important
    // for tests and to avoid a flash of translation keys on first paint.
    interpolation: {
      escapeValue: false, // React already escapes against XSS
    },
    react: {
      useSuspense: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
  });

export default i18n;

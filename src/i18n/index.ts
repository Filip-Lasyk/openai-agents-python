import i18next from 'i18next';
import en from './locales/en.json';
import pl from './locales/pl.json';

export type Language = 'en' | 'pl';

export async function initializeI18n(language: Language = 'en') {
  await i18next.init({
    lng: language,
    fallbackLng: 'en',
    resources: {
      en: { translation: en },
      pl: { translation: pl }
    },
    interpolation: {
      escapeValue: false
    }
  });

  return i18next;
}

export const t = i18next.t.bind(i18next);
export const changeLanguage = i18next.changeLanguage.bind(i18next); 
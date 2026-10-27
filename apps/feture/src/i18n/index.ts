import product from '../../config/product.json';
import { ru } from './ru';
import { en } from './en';

/* Interface languages. Offered ones are config/product.json → i18n.locales: with one locale
   there is no language switch; add "en"/"ru" there to turn it on. New copy goes into every
   dictionary (src/app.test.tsx checks the keys match). */
// Per-screen copy of the V21 screens lives next to them (src/fe/i18n/*.ts) so parallel work never edits one file.
const screens = import.meta.glob<{ ru: Record<string, string>, en: Record<string, string> }>('../fe/i18n/*.ts', { eager: true });
const merge = (base: Record<string, string>, pick: 'ru' | 'en') => Object.assign({}, base, ...Object.values(screens).map(m => m[pick]));
export const dictionaries = {ru: merge(ru, 'ru') as typeof ru, en: merge(en, 'en') as typeof en};
export const i18nConfig = product.i18n;
export const LOCALE_KEY = 'feture.locale';

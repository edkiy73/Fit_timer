import product from '../../config/product.json';
import { ru } from './ru';
import { en } from './en';

/* Interface languages. Offered ones are config/product.json → i18n.locales: with one locale
   there is no language switch; add "en"/"ru" there to turn it on. New copy goes into every
   dictionary (src/app.test.tsx checks the keys match). */
export const dictionaries = {ru, en};
export const i18nConfig = product.i18n;
export const LOCALE_KEY = '__APP_SLUG__.locale';

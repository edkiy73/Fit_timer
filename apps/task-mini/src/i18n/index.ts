import product from '../../config/product.json';
import { ru } from './ru';
import { en } from './en';

// Languages offered by this app: config/product.json → i18n. One locale = no language switch.
export const dictionaries = {ru, en};
export const i18nConfig = product.i18n;
export const LOCALE_KEY = 'task-mini.locale';

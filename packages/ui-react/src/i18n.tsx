import './i18n.css';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/* App interface language for AppBase React apps.

   Dictionaries (the product's copy) live in the app; this module only picks the language and
   looks keys up. Which languages an app offers is the app's decision, taken from its
   config/product.json → i18n: {locales: ["ru","en"], default: "ru"}. With one locale the app
   still writes all copy through t(), and LanguagePicker renders nothing — switching is optional
   per app. */

export type Dictionary = Readonly<Record<string, string>>;

export interface I18nConfig {
  locales?: readonly string[] | undefined;
  default?: string | undefined;
}

export interface I18nProviderProps {
  dictionaries: Readonly<Record<string, Dictionary>>;
  config?: I18nConfig | undefined;
  /** Device storage key for the chosen language; the choice is per device. */
  storageKey: string;
  /** Browser languages, for tests. Defaults to navigator.languages. */
  systemLanguages?: readonly string[];
  children: ReactNode;
}

export interface I18nValue {
  /** Effective language. */
  locale: string;
  /** 'system' or one of locales. */
  preference: string;
  locales: readonly string[];
  /** More than one language: the app shows a language choice. */
  canSwitch: boolean;
  setPreference(preference: string): void;
  t(key: string, vars?: Readonly<Record<string, string | number>>): string;
}

const I18nContext = createContext<I18nValue | null>(null);

function readPreference(key: string): string {
  try{ return localStorage.getItem(key) || 'system'; }catch{ return 'system'; }
}

/** Offered languages: configured ones that have a dictionary, the default first. */
export function offeredLocales(dictionaries: Readonly<Record<string, Dictionary>>, config?: I18nConfig): string[] {
  const available = Object.keys(dictionaries);
  const wanted = (config?.locales?.length ? config.locales : [config?.default || available[0] || 'en'])
    .filter(locale => available.includes(locale));
  const fallback = config?.default && wanted.includes(config.default) ? config.default : wanted[0];
  const list = [...new Set(wanted)];
  return fallback ? [fallback, ...list.filter(locale => locale !== fallback)] : list;
}

export function resolveLocale(preference: string, locales: readonly string[], systemLanguages: readonly string[]): string {
  if(preference !== 'system' && locales.includes(preference)) return preference;
  for(const language of systemLanguages){
    const base = String(language || '').toLowerCase().split('-')[0] || '';
    if(locales.includes(base)) return base;
  }
  return locales[0] || 'en';
}

/** Keys missing per locale, compared with the union of all dictionaries. Use in app tests. */
export function missingKeys(dictionaries: Readonly<Record<string, Dictionary>>): Record<string, string[]> {
  const all = new Set(Object.values(dictionaries).flatMap(dictionary => Object.keys(dictionary)));
  const out: Record<string, string[]> = {};
  for(const [locale, dictionary] of Object.entries(dictionaries)){
    const missing = [...all].filter(key => !(key in dictionary));
    if(missing.length) out[locale] = missing;
  }
  return out;
}

export function I18nProvider({dictionaries, config, storageKey, systemLanguages, children}: I18nProviderProps){
  const locales = useMemo(() => offeredLocales(dictionaries, config), [dictionaries, config]);
  const [preference, setPreferenceState] = useState(() => readPreference(storageKey));
  const system = systemLanguages ?? (typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : []);
  const locale = resolveLocale(locales.length > 1 ? preference : 'system', locales, system);

  useEffect(() => {
    if(typeof document !== 'undefined') document.documentElement.lang = locale;
  }, [locale]);

  const setPreference = useCallback((next: string) => {
    const value = next === 'system' || locales.includes(next) ? next : 'system';
    setPreferenceState(value);
    try{ localStorage.setItem(storageKey, value); }catch{}
  }, [locales, storageKey]);

  const value = useMemo<I18nValue>(() => {
    const own = dictionaries[locale] || {};
    const fallback = dictionaries[locales[0] || ''] || {};
    return {
      locale,
      preference: locales.length > 1 ? preference : 'system',
      locales,
      canSwitch: locales.length > 1,
      setPreference,
      t(key, vars){
        let text = own[key] ?? fallback[key] ?? key;
        if(vars) for(const [name, v] of Object.entries(vars)) text = text.split('{' + name + '}').join(String(v));
        return text;
      }
    };
  }, [dictionaries, locale, locales, preference, setPreference]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if(!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}

/** Shared AppBase screens (sign-in, Admin, error screen) have RU and EN copy. */
export function sharedUiLocale(locale: string): 'ru' | 'en' {
  return locale === 'ru' ? 'ru' : 'en';
}

const LANGUAGE_NAMES: Record<string, string> = {ru: 'Русский', en: 'English', uk: 'Українська', kk: 'Қазақша', de: 'Deutsch', es: 'Español'};

export interface LanguagePickerProps {
  /** Visible label, from the app's dictionary. */
  label: string;
  /** Name of the "follow the system language" option, from the app's dictionary. */
  systemLabel: string;
}

/** Language choice; renders nothing when the app offers one language. */
export function LanguagePicker({label, systemLabel}: LanguagePickerProps){
  const i18n = useI18n();
  if(!i18n.canSwitch) return null;
  return (
    <label className="ab-language">
      <span>{label}</span>
      <select value={i18n.preference} onChange={event => i18n.setPreference(event.target.value)}>
        <option value="system">{systemLabel}</option>
        {i18n.locales.map(locale => <option key={locale} value={locale}>{LANGUAGE_NAMES[locale] || locale}</option>)}
      </select>
    </label>
  );
}

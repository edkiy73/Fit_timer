import { applyCssVars, themeCssVars } from '@appbase/core/ui.js';
import type { AppBrandConfig } from '@appbase/types/core.js';
import product from '../config/product.json';

const brand: AppBrandConfig = product.brand;

export type ThemePreference = 'system' | 'light' | 'dark';
/** Per-device choice («Я» → Тема); default follows the system. */
export const THEME_KEY = 'unmute.theme';
const THEME_EVENT = 'unmute-theme-change';

export function readThemePreference(): ThemePreference {
  try{
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  }catch{
    return 'system';
  }
}

export function setThemePreference(preference: ThemePreference): void {
  try{
    if(preference === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, preference);
  }catch{}
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Applies product tokens for the resolved mode and marks it as `data-theme` on <html>;
 *  CSS keys every dark-only token off that attribute. */
export function applyProductTheme(root: HTMLElement = document.documentElement): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    const preference = readThemePreference();
    const mode = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
    applyCssVars(root, themeCssVars(brand.ui[mode]));
    root.style.colorScheme = mode;
    root.dataset.theme = mode;
  };
  apply();
  media.addEventListener('change', apply);
  window.addEventListener(THEME_EVENT, apply);
  return () => {
    media.removeEventListener('change', apply);
    window.removeEventListener(THEME_EVENT, apply);
  };
}

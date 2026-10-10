import { applyCssVars, themeCssVars } from '@appbase/core/ui.js';
import type { AppBrandConfig } from '@appbase/types/core.js';
import product from '../config/product.json';

const brand: AppBrandConfig = product.brand;
export type ThemePreference = 'system' | 'light' | 'dark';
const key = 'feture.theme';
export function getThemePreference(): ThemePreference {
  try { const value = localStorage.getItem(key); return value === 'light' || value === 'dark' ? value : 'system'; }
  catch { return 'system'; }
}
export function setThemePreference(value: ThemePreference) {
  try { localStorage.setItem(key, value); } catch { /* Apply for this session even if storage is unavailable. */ }
  window.dispatchEvent(new CustomEvent<ThemePreference>('feture:theme', { detail: value }));
}
export function applyProductTheme(root: HTMLElement = document.documentElement): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = getThemePreference();
  const apply = () => {
    const mode = preference === 'system' ? media.matches ? 'dark' : 'light' : preference;
    applyCssVars(root, themeCssVars(brand.ui[mode]));
    root.style.colorScheme = mode;
    root.dataset.theme = mode;
  };
  const change = (event: Event) => { preference = (event as CustomEvent<ThemePreference>).detail; apply(); };
  apply();
  media.addEventListener('change', apply);
  window.addEventListener('feture:theme', change);
  return () => { media.removeEventListener('change', apply); window.removeEventListener('feture:theme', change); };
}

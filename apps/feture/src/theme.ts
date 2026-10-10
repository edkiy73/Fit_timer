import { applyCssVars, themeCssVars } from '@appbase/core/ui.js';
import type { AppBrandConfig } from '@appbase/types/core.js';
import product from '../config/product.json';

const brand: AppBrandConfig = product.brand;

export function applyProductTheme(root: HTMLElement = document.documentElement): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    const mode = media.matches ? 'dark' : 'light';
    applyCssVars(root, themeCssVars(brand.ui[mode]));
    root.style.colorScheme = mode;
  };
  apply();
  media.addEventListener('change', apply);
  return () => media.removeEventListener('change', apply);
}

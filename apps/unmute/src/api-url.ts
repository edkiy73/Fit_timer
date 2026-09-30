import product from '../config/product.json';

interface CapacitorLike {
  isNativePlatform?():boolean;
}

/** Where the API lives. On the web the functions sit next to the page, so paths stay
 *  relative. The native shell serves the app from its own local origin (https://localhost),
 *  where `/api/*` does not exist, so it must call the production API directly. */
export function apiBase(): string {
  const cap=(globalThis as unknown as {Capacitor?:CapacitorLike}).Capacitor;
  return cap?.isNativePlatform?.() ? String(product.defaultApiUrl).replace(/\/$/, '') : '';
}

export function apiUrl(path: string): string {
  return apiBase() + path;
}

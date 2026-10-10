import product from '../config/product.json';
interface CapacitorLike {isNativePlatform?():boolean}
/** Web: same-origin API; Android/iOS: remote Vercel API, not local Capacitor origin. */
export function apiBase():string {
 const cap=(globalThis as unknown as {Capacitor?:CapacitorLike}).Capacitor;
 return cap?.isNativePlatform?.() ? String(product.defaultApiUrl).replace(/\/$/,'') : '';
}
export function apiUrl(path:string):string{return apiBase()+path;}

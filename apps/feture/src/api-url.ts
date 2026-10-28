import product from '../config/product.json';
interface CapacitorLike {isNativePlatform?():boolean}
function native():boolean{return !!(globalThis as unknown as {Capacitor?:CapacitorLike}).Capacitor?.isNativePlatform?.();}
/** Web: same-origin API; Android/iOS: remote Vercel API, not local Capacitor origin. */
export function apiBase():string {
 return native() ? String(product.defaultApiUrl).replace(/\/$/,'') : '';
}
export function apiUrl(path:string):string{return apiBase()+path;}
/** Origin for links people copy and send. The native shell runs on https://localhost, which means nothing to the
 * receiver, so links made inside the app point at the public website instead. */
export function publicOrigin():string{
 return native() ? String(product.defaultPublicUrl).replace(/\/$/,'') : location.origin;
}
/** Origin + page path for hash-route links: the current page on the website, the public site in the app. */
export function publicBase():string{
 return native() ? publicOrigin()+'/' : location.origin+location.pathname;
}

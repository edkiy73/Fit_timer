/** The partner link (V21 pairShareLink): `#/n/me/pair?link=<token>`. A link opened signed out lands on the welcome
 * screen, so its token is remembered for this tab before anything else reads the address; the sign-up then forms the
 * couple at once (owner, 28.10.2026: no second confirmation). Temporary request memory, not domain data. */
const LINK_KEY='feture.fe.pairLink';
export const PAIR_TOKEN=/^[A-Za-z0-9_-]{43}$/;
/** Remembers the token of a partner link route (`/n/me/pair?link=…` or `#/n/me/pair?link=…`). Also called by
 * app-links.ts: in the Android app the link arrives after start, not in the address. */
export function rememberPairLink(route:string){
 try{const v=new URLSearchParams(route.split('?')[1]??'').get('link');if(v&&PAIR_TOKEN.test(v))sessionStorage.setItem(LINK_KEY,v);}catch{/* no storage: the link still works while signed in */}
}
rememberPairLink(location.hash);
/** A partner link waiting in this tab. */
export function pendingPairLink():string|null{try{const v=sessionStorage.getItem(LINK_KEY);return v&&PAIR_TOKEN.test(v)?v:null;}catch{return null;}}
export function dropPairLink(){try{sessionStorage.removeItem(LINK_KEY);}catch{/* nothing kept */}}

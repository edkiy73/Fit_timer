/** An invitation link (`#/n/join/<code>`) opened before sign-up is remembered, so the code can be applied once the person has
 * signed up and finished getting to know the app (register.tsx). Kept in the browser for two weeks, not domain data. */
const KEY='feture.fe.refCode';
const TTL=14*864e5;
export const REF_CODE=/^[A-Za-z0-9_-]{3,24}$/;
/** Remembers the code of a join route (`/n/join/CODE` or `#/n/join/CODE`). Also called by app-links.ts: in the Android app the
 * link arrives after start, not in the address. */
export function rememberRefLink(route:string){
 try{const m=/^#?\/n\/join\/([^/?#]+)/.exec(route);if(m&&REF_CODE.test(m[1]!))localStorage.setItem(KEY,JSON.stringify({code:m[1]!.toUpperCase(),at:Date.now()}));}catch{/* no storage: the link still works while signed in */}
}
rememberRefLink(location.hash);
/** The code waiting in this browser, if it is still fresh. */
export function pendingRefCode():string|null{
 try{const v=JSON.parse(localStorage.getItem(KEY)??'null') as {code?:string,at?:number}|null;
  return v?.code&&REF_CODE.test(v.code)&&typeof v.at==='number'&&Date.now()-v.at<TTL?v.code:null;}catch{return null;}
}
export function dropRefCode(){try{localStorage.removeItem(KEY);}catch{/* nothing kept */}}

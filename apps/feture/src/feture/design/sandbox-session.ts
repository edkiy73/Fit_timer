/** A preview identity, never a Core credential. Only the mode flag is stored.
 * No account fields, authored content, media, or identity are persisted here.
 * Server endpoints MUST continue to require genuine Core auth.
 */
const KEY='feture.design.ephemeral';
export function sandboxActive():boolean{
 try{return sessionStorage.getItem(KEY)==='1';}catch{return false;}
}
export function startSandbox():void{
 try{sessionStorage.setItem(KEY,'1');}catch{/* Memory-only UI still works until reload. */}
}
export function endSandbox():void{
 try{sessionStorage.removeItem(KEY);}catch{/* No account data was stored. */}
}

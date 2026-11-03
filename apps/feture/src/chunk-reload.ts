/** A screen whose code is gone (bug 03.11.2026: a tab opened before a deploy asked for an old `assets/me-<hash>.js`).
 * The server keeps earlier builds' files for a while (server/assets-keep.mjs); when one is missing anyway, opening the
 * screen reloads the page once to get the new version. A second failure within RELOAD_WINDOW shows the error screen
 * with «Обновить» instead of reloading in a loop (the time of the reload lives in sessionStorage, per tab).
 *
 * Only a screen the person is opening reloads: the background prefetch (lazy-screens.ts) and other lazy pieces (the
 * video encoder) do not, so typing is never cut off. Vite's `vite:preloadError` needs no listener of its own: without
 * `preventDefault()` Vite rethrows the same error into the import, and `withChunkReload` handles it there.
 * The reload happens while leaving a screen, so only what normal navigation also drops is lost; chat and support
 * drafts are in localStorage (fe/drafts.ts), and editors ask to save before they are left (kit useLeaveGuard). */

export const RELOAD_KEY='fe.chunkReload';
export const RELOAD_WINDOW=60_000;

const PATTERNS=[
 /Failed to fetch dynamically imported module/i, // Chrome
 /Importing a module script failed/i, // Safari
 /error loading dynamically imported module/i, // Firefox
 /Unable to preload CSS/i, // Vite's own preload
 /Loading (?:CSS )?chunk [\w-]+ failed/i,
];

export function isChunkError(error:unknown):boolean{
 if(!error||typeof error!=='object')return typeof error==='string'&&PATTERNS.some(p=>p.test(error));
 const e=error as {name?:unknown,message?:unknown};
 if(e.name==='ChunkLoadError')return true;
 return typeof e.message==='string'&&PATTERNS.some(p=>p.test(e.message as string));
}

type Env={storage?:Pick<Storage,'getItem'|'setItem'>|null,now?:number,reload?:()=>void};

const session=():Env['storage']=>{try{return window.sessionStorage;}catch{return null;}};

/** Reloads unless this tab already did within RELOAD_WINDOW. Returns whether it reloads. Without sessionStorage
 * there is no loop guard, so it never reloads by itself (the error screen's «Обновить» still works). */
export function reloadOnce({storage=session(),now=Date.now(),reload=()=>window.location.reload()}:Env={}):boolean{
 if(!storage)return false;
 try{
  const last=Number(storage.getItem(RELOAD_KEY)||0);
  if(last&&now-last>=0&&now-last<RELOAD_WINDOW)return false;
  storage.setItem(RELOAD_KEY,String(now));
 }catch{return false;}
 reload();
 return true;
}

/** Wraps a screen's `import()`: a chunk error reloads once and keeps the current screen meanwhile (the promise never
 * settles, so React keeps waiting instead of showing the error screen for a moment); any other error, or a repeat,
 * is thrown to the route's error screen. */
export function withChunkReload<M>(load:()=>Promise<M>,env?:Env):()=>Promise<M>{
 return ()=>load().catch((error:unknown)=>{
  if(isChunkError(error)&&reloadOnce(env))return new Promise<M>(()=>{});
  throw error;
 });
}

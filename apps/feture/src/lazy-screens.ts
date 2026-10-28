import {lazy,type ComponentType} from 'react';

/** Screens loaded on demand (app.tsx). Navigations run in a React transition, so a tap keeps the current screen until
 * the next one's code is there; the `<Suspense>` fallback in the shell shows only when the app opens on such a screen. */
const loaders:(()=>Promise<unknown>)[]=[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function screen<M>(load:()=>Promise<M>,name:keyof M&string):ComponentType<any>{
 if(!loaders.includes(load))loaders.push(load);
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 return lazy(async()=>({default:(await load())[name] as ComponentType<any>}));
}

let started=false;
/** Fetches the code of every screen in the background, a few at a time, once the first screen is up: later taps
 * never wait for the network. The files are cached for good (hashed names, vercel.json), so this costs once per release. */
export function prefetchScreens(){
 if(started||typeof window==='undefined')return;started=true;
 const queue=[...loaders];
 const next=():void=>{const batch=queue.splice(0,4);if(!batch.length)return;
  void Promise.allSettled(batch.map(l=>l())).then(()=>idle(next));};
 idle(next);
}
function idle(fn:()=>void){
 const w=window as Window&{requestIdleCallback?:(cb:()=>void,o?:{timeout:number})=>number};
 if(w.requestIdleCallback)w.requestIdleCallback(fn,{timeout:2000});else setTimeout(fn,300);
}

/** A page of the earlier screens (outside /n) or the admin: loaded only when opened, never in the background. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function page<M>(load:()=>Promise<M>,name:keyof M&string):ComponentType<any>{
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 return lazy(async()=>({default:(await load())[name] as ComponentType<any>}));
}

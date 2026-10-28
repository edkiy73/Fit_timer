import {useEffect} from 'react';
import {useNavigate} from 'react-router';
import {Capacitor} from '@capacitor/core';
import {App} from '@capacitor/app';
import product from '../../config/product.json';
import {rememberPairLink} from './pair-link';

/** Android App Links: a FetUre link (https://feture-mvp.vercel.app/#/n/...) tapped in a messenger or browser opens the
 * app (intent filter with autoVerify in AndroidManifest.xml, proof in public/.well-known/assetlinks.json). The app
 * runs on its own local origin, so the link's hash route is replayed inside it. Only the public site's root counts,
 * and only /n routes (the V21 app) — anything else opens the feed. */
const HOST=new URL(String(product.defaultPublicUrl)).host;

/** The in-app route for a link, or null when the link is not ours. Pure: tested without a phone. */
export function routeFromLink(link:string):string|null{
 let url:URL;
 try{url=new URL(link);}catch{return null;}
 if(url.protocol!=='https:'||url.host!==HOST)return null;
 if(url.pathname!=='/'&&url.pathname!=='/index.html')return null;
 const route=url.hash.startsWith('#/')?url.hash.slice(1):'';
 const [path='']=route.split('?');
 // No `..`, no `//`, no other area: the hash only picks a screen of the app.
 if(!/^\/n(\/[A-Za-z0-9_-]+)*\/?$/.test(path))return '/n';
 return route;
}

/** Opens links in the running app (appUrlOpen) and the one that started it (getLaunchUrl). Rendered once in Root. */
export function AppLinks(){
 const navigate=useNavigate();
 useEffect(()=>{
  if(!Capacitor.isNativePlatform())return;
  let last='',lastAt=0;
  const open=(link:string|undefined)=>{
   // Cold start may report the same link twice (launch URL and appUrlOpen); a later tap on it opens it again.
   if(!link||(link===last&&Date.now()-lastAt<3000))return;
   const route=routeFromLink(link);if(!route)return;
   last=link;lastAt=Date.now();
   // A partner link opened signed out is remembered before the welcome screen takes over (pair-link.ts).
   rememberPairLink(route);
   navigate(route);
  };
  void App.getLaunchUrl().then(r=>open(r?.url)).catch(()=>undefined);
  let removed=false;let handle:{remove:()=>Promise<void>}|undefined;
  void App.addListener('appUrlOpen',e=>open(e.url)).then(h=>{if(removed)void h.remove();else handle=h;});
  return ()=>{removed=true;if(handle)void handle.remove();};
 },[navigate]);
 return null;
}

import {apiUrl} from '../api-url';

/** The bot check before a sign-in code is requested (security audit 06.11.2026, B1; Cloudflare Turnstile, server:
 * packages/core/server/turnstile.js). The site key is public and comes with `/api/config`; without it (not set up) nothing is
 * asked. The widget is invisible: it shows itself only when Cloudflare wants the person to do something. */
const SCRIPT='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
type Widget={render:(el:HTMLElement,o:Record<string,unknown>)=>string,remove:(id:string)=>void};
let siteKey:Promise<string|null>|null=null;
let script:Promise<Widget|null>|null=null;

const key=()=>siteKey??=fetch(apiUrl('/api/config'),{cache:'no-store'}).then(r=>r.json()).then(j=>typeof j?.captcha?.siteKey==='string'&&j.captcha.siteKey?j.captcha.siteKey as string:null).catch(()=>null);
const load=()=>script??=new Promise<Widget|null>(resolve=>{
 const w=window as unknown as {turnstile?:Widget};
 if(w.turnstile)return resolve(w.turnstile);
 const s=document.createElement('script');s.src=SCRIPT;s.async=true;
 s.onload=()=>resolve(w.turnstile??null);s.onerror=()=>{script=null;resolve(null);};
 document.head.appendChild(s);
});

/** The fields to add to a sign-in code request: `{captcha: token}`, or nothing when no check is set up or it could not run (the
 * server then decides; it refuses when a check is required). */
export async function captchaFields():Promise<Record<string,unknown>>{
 const sitekey=await key();if(!sitekey)return {};
 const ts=await load();if(!ts)return {};
 return new Promise(resolve=>{
  const box=document.createElement('div');
  box.style.cssText='position:fixed;inset:0;z-index:2000;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.45)';
  const slot=document.createElement('div');box.appendChild(slot);document.body.appendChild(box);
  let id='';let done=false;
  const finish=(token:string|null)=>{if(done)return;done=true;clearTimeout(timer);try{if(id)ts.remove(id);}catch{/* gone already */}box.remove();resolve(token?{captcha:token}:{});};
  const timer=setTimeout(()=>finish(null),45000);
  try{id=ts.render(slot,{sitekey,appearance:'interaction-only',theme:'auto',
   callback:(token:string)=>finish(token),'error-callback':()=>finish(null),'timeout-callback':()=>finish(null),
   'before-interactive-callback':()=>{box.style.display='flex';},'after-interactive-callback':()=>{box.style.display='none';}});}
  catch{finish(null);}
 });
}

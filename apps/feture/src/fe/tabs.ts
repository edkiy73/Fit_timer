/** Every dock tab has its own stack of screens, as in other apps (owner 05.11.2026). The browser keeps one history for
 * the whole app, so «Назад» alone would walk through whatever was opened last, whichever tab it belonged to. Here the
 * app keeps the stacks itself:
 *  - a screen opened inside a tab (a push) goes on top of that tab's stack;
 *  - a tap on another dock tab switches the stack and shows that tab's top screen where it was left;
 *  - «Назад» takes the top screen off the active stack; on a tab's root it goes to the feed, on the feed's root the
 *    caller asks about closing the app.
 * Switching and going back replace the current history entry (the browser's own history is not used for them) and carry
 * `restore: true`, so the screen brings back its scroll, tab and loaded list (ui.tsx `useReturning`). */

export type TabEntry={to:string,tab?:string|undefined};
type Go=(to:string,opts:{replace:true,state:Record<string,unknown>})=>void;

const stacks=new Map<string,TabEntry[]>();
let active:string|null=null;

const rootOf=(id:string)=>'/n/'+id;
const stackOf=(id:string)=>{let s=stacks.get(id);if(!s){s=[{to:rootOf(id)}];stacks.set(id,s);}return s;};
const open=(go:Go,e:TabEntry)=>go(e.to,{replace:true,state:{...(e.tab?{tab:e.tab}:{}),restore:true,tn:true}});

/** The stack owner at start: the tab the app was opened on, with its root under a deeper screen (a link, a push). */
export function tabsInit(tab:string,entry:TabEntry){
 if(active)return;
 active=tab;
 stacks.set(tab,entry.to===rootOf(tab)?[entry]:[{to:rootOf(tab)},entry]);
}
export const tabsReady=()=>active!==null;
export const tabsActive=()=>active;
export function tabsReset(){stacks.clear();active=null;}
export const tabsStack=(id:string)=>[...(stacks.get(id)??[])];

/** Every location change that was not made by `tabsGo` / `tabsBack`: a screen opened (PUSH), swapped (REPLACE) or the
 * browser's own back / forward (POP). */
export function tabsNote(nav:'PUSH'|'REPLACE'|'POP',entry:TabEntry,ours:boolean){
 if(!active||ours)return;
 const s=stackOf(active);const top=s[s.length-1];
 if(nav==='PUSH'){if(top?.to!==entry.to)s.push(entry);}
 else if(nav==='REPLACE'){if(s.length)s[s.length-1]=entry;else s.push(entry);}
 else{
  const i=s.map(x=>x.to).lastIndexOf(entry.to);
  if(i>=0)s.length=i+1;else if(top?.to!==entry.to)s.push(entry);
 }
}

/** A tap on a dock tab. On the tab you are in: back to its root as it was; on another one: its top screen. */
export function tabsGo(id:string,go:Go){
 if(active===id){const s=stackOf(id);s.length=1;open(go,s[0]!);return;}
 active=id;
 const s=stackOf(id);open(go,s[s.length-1]!);
}

/** «Назад»: false when there is nowhere inside the app to go (the feed's root) or the stacks are not started. */
export function tabsBack(go:Go,fallback?:string,here?:string):boolean{
 if(!active)return false;
 // A photo viewer or other overlay holds its own history entry: the browser's back closes it.
 if((window.history.state as {feOverlay?:unknown}|null)?.feOverlay){window.history.back();return true;}
 const s=stackOf(active);
 if(s.length>1){s.pop();open(go,s[s.length-1]!);return true;}
 const root=rootOf(active);
 if(here&&here!==root&&!(active==='feed'&&here==='/n')){
  // The only screen of the stack is not its root (a screen swapped in place): its parent.
  const to=fallback??root;stacks.set(active,[{to}]);open(go,{to});return true;
 }
 if(active!=='feed'){active='feed';const f=stackOf('feed');open(go,f[f.length-1]!);return true;}
 return false;
}

/** The clock and icons of the phone's status and navigation bars follow the page: the page knows its own theme (system
 * or the data-theme switch), so it asks the Android shell to draw dark icons on a light page and light ones on a dark
 * page. Without the shell (website, iOS) nothing happens. */
type Bars={setBars?(o:{light:boolean}):Promise<unknown>};
const bars=():Bars|null=>{
 const cap=(globalThis as unknown as {Capacitor?:{isNativePlatform?():boolean;getPlatform?():string;Plugins?:Record<string,unknown>}}).Capacitor;
 if(!cap?.isNativePlatform?.()||cap.getPlatform?.()!=='android')return null;
 return (cap.Plugins?.['FetUreUpdate'] as Bars|undefined)??null;
};

/** Perceived brightness of the page background, 0 (black) … 1 (white). */
const brightness=()=>{
 const m=getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g);
 if(!m||m.length<3)return 1;
 const [r,g,b]=m.map(Number) as [number,number,number];
 return (0.299*r+0.587*g+0.114*b)/255;
};

export function followPageTheme():()=>void{
 const native=bars();if(!native?.setBars)return ()=>{};
 let last:boolean|null=null;
 const apply=()=>{const light=brightness()>0.5;if(light===last)return;last=light;void native.setBars?.({light}).catch(()=>{last=null;});};
 apply();
 const mq=window.matchMedia('(prefers-color-scheme: dark)');
 mq.addEventListener('change',apply);
 const mo=new MutationObserver(apply);mo.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class','style']});
 const id=window.setInterval(apply,3000);
 return ()=>{mq.removeEventListener('change',apply);mo.disconnect();clearInterval(id);};
}

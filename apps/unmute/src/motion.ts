export function motionMs(token:string,fallback:number):number{
  try{
    const raw=getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    if(!raw)return fallback;
    if(raw.endsWith('ms')){
      const value=Number(raw.slice(0,-2));
      return Number.isFinite(value)?value:fallback;
    }
    if(raw.endsWith('s')){
      const value=Number(raw.slice(0,-1));
      return Number.isFinite(value)?value*1000:fallback;
    }
  }catch{}
  return fallback;
}

export function prefersReducedMotion():boolean{
  try{return window.matchMedia('(prefers-reduced-motion: reduce)').matches;}
  catch{return false;}
}

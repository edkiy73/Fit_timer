export const MOTION={
  press:110,
  fast:180,
  base:300,
  spring:360,
  sheetExit:260,
  number:520,
  progress:650,
  ring:760,
  reward:900
} as const;

export const MOTION_EASING={
  standard:'cubic-bezier(.2,.8,.2,1)',
  exit:'cubic-bezier(.4,0,1,1)'
} as const;

export function prefersReducedMotion():boolean{
  try{return window.matchMedia('(prefers-reduced-motion: reduce)').matches;}
  catch{return false;}
}

export function motionProgress(start:number,now:number,duration:number):number{
  if(duration<=0)return 1;
  return Math.max(0,Math.min(1,(now-start)/duration));
}

export function easeOutCubic(t:number):number{
  const value=Math.max(0,Math.min(1,t));
  return 1-Math.pow(1-value,3);
}


export function withViewTransition(change:()=>void):void{
  const doc=document as Document&{
    startViewTransition?:((callback:()=>void)=>unknown)|undefined;
  };
  if(!prefersReducedMotion()&&doc.startViewTransition){
    doc.startViewTransition(change);
    return;
  }
  change();
}

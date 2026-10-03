import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

function reducedMotion():boolean{
  try{return window.matchMedia('(prefers-reduced-motion: reduce)').matches;}
  catch{return false;}
}

function easeOutCubic(t:number):number{
  return 1-Math.pow(1-t,3);
}

function useAnimatedPercent(value:number,duration=650):number{
  const target=Math.max(0,Math.min(100,Number.isFinite(value)?value:0));
  const previous=useRef<number|null>(null);
  const [display,setDisplay]=useState(target);

  useEffect(()=>{
    const from=previous.current===null?0:previous.current;
    previous.current=target;
    if(reducedMotion()||duration<=0||from===target){
      setDisplay(target);
      return;
    }
    let cancelled=false;
    let frame=0;
    const start=performance.now();
    const tick=(now:number)=>{
      if(cancelled)return;
      const t=Math.min(1,(now-start)/duration);
      setDisplay(from+(target-from)*easeOutCubic(t));
      if(t<1)frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return ()=>{cancelled=true;cancelAnimationFrame(frame);};
  },[target,duration]);

  return display;
}

export function AnimatedProgressFill({
  value,
  className=''
}:{value:number;className?:string}){
  const display=useAnimatedPercent(value);
  return (
    <span
      className={'animated-progress-fill'+(className?' '+className:'')}
      style={{width:display+'%'}}
      aria-hidden="true"
    />
  );
}

export function AnimatedProgressRing({
  value,
  label,
  children,
  className=''
}:{
  value:number;
  label:string;
  children:ReactNode;
  className?:string;
}){
  const display=useAnimatedPercent(value,760);
  return (
    <div
      className={'progress-course-ring'+(className?' '+className:'')}
      style={{'--course-progress':display+'%'} as CSSProperties}
      role="img"
      aria-label={label}
    >
      {children}
    </div>
  );
}

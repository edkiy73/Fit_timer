import { useEffect, useRef, useState } from 'react';
import { MOTION, easeOutCubic, motionProgress, prefersReducedMotion } from './motion';

export function AnimatedNumber({
  value,
  suffix='',
  duration=MOTION.number,
  className=''
}:{
  value:number;
  suffix?:string;
  duration?:number;
  className?:string;
}){
  const target=Number.isFinite(value)?value:0;
  const [display,setDisplay]=useState(target);
  const [running,setRunning]=useState(false);
  const previous=useRef<number|null>(null);

  useEffect(()=>{
    const from=previous.current===null?0:previous.current;
    previous.current=target;

    if(prefersReducedMotion()||duration<=0||from===target){
      setDisplay(target);
      setRunning(false);
      return;
    }

    let frame=0;
    let cancelled=false;
    const start=performance.now();
    setRunning(true);

    const tick=(now:number)=>{
      if(cancelled)return;
      const t=motionProgress(start,now,duration);
      const next=from+(target-from)*easeOutCubic(t);
      setDisplay(Math.round(next));
      if(t<1)frame=requestAnimationFrame(tick);
      else setRunning(false);
    };
    frame=requestAnimationFrame(tick);
    return ()=>{
      cancelled=true;
      cancelAnimationFrame(frame);
    };
  },[target,duration]);

  return (
    <span
      className={'animated-number'+(running?' is-running':'')+(className?' '+className:'')}
      aria-label={String(target)+suffix}
    >
      {display}{suffix}
    </span>
  );
}

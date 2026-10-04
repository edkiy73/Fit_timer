import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { MOTION, MOTION_EASING, prefersReducedMotion } from './motion';

export function AnswerModeTransition({
  mode,
  children
}:{
  mode:'chips'|'write';
  children:ReactNode;
}){
  const ref=useRef<HTMLDivElement>(null);
  const previousHeight=useRef<number|null>(null);
  const previousMode=useRef(mode);
  const [transitioning,setTransitioning]=useState(false);

  useLayoutEffect(()=>{
    const node=ref.current;
    if(!node)return;
    const nextHeight=node.scrollHeight;

    if(previousMode.current===mode){
      previousHeight.current=nextHeight;
      return;
    }

    const from=previousHeight.current??nextHeight;
    previousMode.current=mode;
    previousHeight.current=nextHeight;

    if(prefersReducedMotion()||Math.abs(from-nextHeight)<1){
      node.style.height='';
      setTransitioning(false);
      return;
    }

    setTransitioning(true);
    node.style.height=from+'px';
    node.style.overflow='hidden';

    const frame=requestAnimationFrame(()=>{
      node.style.transition=`height ${MOTION.base}ms ${MOTION_EASING.standard}`;
      node.style.height=nextHeight+'px';
    });
    const timer=window.setTimeout(()=>{
      node.style.transition='';
      node.style.height='';
      node.style.overflow='';
      setTransitioning(false);
    },MOTION.base+20);

    return ()=>{
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      node.style.transition='';
      node.style.height='';
      node.style.overflow='';
    };
  },[mode]);

  return (
    <div ref={ref} className={'answer-mode-transition'+(transitioning?' is-transitioning':'')} data-mode={mode}>
      <div key={mode} className="answer-mode-content">
        {children}
      </div>
    </div>
  );
}

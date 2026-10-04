import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';

function reducedMotion():boolean{
  try{return window.matchMedia('(prefers-reduced-motion: reduce)').matches;}
  catch{return false;}
}

/** Bottom sheet. The system Back button closes it first: opening pushes a history entry
 *  on the same URL, Back pops it; closing any other way pops it ourselves. */
export function Sheet({
  open,
  onClose,
  labelledBy,
  closeLabel,
  children
}:{
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  closeLabel: string;
  children: ReactNode;
}){
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const panel = useRef<HTMLElement>(null);
  const [present,setPresent]=useState(open);
  const [leaving,setLeaving]=useState(false);

  useEffect(()=>{
    if(open){
      setPresent(true);
      setLeaving(false);
      return;
    }
    if(!present)return;
    if(reducedMotion()){
      setPresent(false);
      setLeaving(false);
      return;
    }
    setLeaving(true);
    const timer=window.setTimeout(()=>{
      setPresent(false);
      setLeaving(false);
    },260);
    return ()=>window.clearTimeout(timer);
  },[open,present]);

  useEffect(() => {
    if(!open) return;
    // Our own history entry, tagged so we only pop it while it is still the current one.
    // An action that navigates away from inside the sheet should navigate with `replace`.
    const tag = 'sheet-' + Math.random().toString(36).slice(2);
    let pushed = false;
    try{
      window.history.pushState({...(window.history.state ?? {}), unmuteSheet:tag}, '', window.location.href);
      pushed = true;
    }catch{}
    const onPop = () => { pushed = false; closeRef.current(); };
    const onKey = (event: KeyboardEvent) => { if(event.key === 'Escape') closeRef.current(); };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      if(pushed && window.history.state?.unmuteSheet === tag) window.history.back();
      previous?.focus?.();
    };
  }, [open]);

  if(!present) return null;
  return (
    <div className={'sheet-scrim'+(leaving?' is-leaving':'')} role="presentation" onMouseDown={event => {
      if(!leaving&&event.currentTarget === event.target) onClose();
    }}>
      <section
        ref={panel}
        className={'sheet'+(leaving?' is-leaving':'')}
        role="dialog"
        aria-modal={leaving?undefined:true}
        aria-hidden={leaving||undefined}
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        <div className="sheet-grab" aria-hidden="true" />
        <button className="sheet-close pressable" type="button" onClick={onClose} aria-label={closeLabel} disabled={leaving}>
          <Icon name="close" size={20} />
        </button>
        {children}
      </section>
    </div>
  );
}

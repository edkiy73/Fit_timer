import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import { MOTION, prefersReducedMotion } from './motion';

/** Bottom sheet. The system Back button closes it first: opening pushes a history entry
 *  on the same URL, Back pops it; closing any other way pops it ourselves. */
export function Sheet({
  open,
  onClose,
  labelledBy,
  closeLabel,
  historyEntry=true,
  className='',
  children
}:{
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  closeLabel: string;
  /** Most sheets own a same-URL history entry so Android Back closes them.
   * Focused flows can opt out and own Back explicitly. */
  historyEntry?: boolean;
  /** Optional root class for a deliberately different sheet layer/context. */
  className?: string;
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
    if(prefersReducedMotion()){
      setPresent(false);
      setLeaving(false);
      return;
    }
    setLeaving(true);
    const timer=window.setTimeout(()=>{
      setPresent(false);
      setLeaving(false);
    },MOTION.sheetExit);
    return ()=>window.clearTimeout(timer);
  },[open,present]);

  useEffect(() => {
    if(!open) return;
    const tag = 'sheet-' + Math.random().toString(36).slice(2);
    let pushed = false;
    if(historyEntry){
      try{
        window.history.pushState({...(window.history.state ?? {}), unmuteSheet:tag}, '', window.location.href);
        pushed = true;
      }catch{}
    }
    const onPop = () => { pushed = false; closeRef.current(); };
    const onKey = (event: KeyboardEvent) => { if(event.key === 'Escape') closeRef.current(); };
    if(historyEntry)window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    return () => {
      if(historyEntry)window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      if(historyEntry&&pushed&&window.history.state?.unmuteSheet === tag)window.history.back();
      previous?.focus?.();
    };
  }, [open,historyEntry]);

  if(!present) return null;
  const content=(
    <div className={'sheet-scrim'+(className?' '+className:'')+(leaving?' is-leaving':'')} role="presentation" onMouseDown={event => {
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
  return createPortal(content,document.body);
}

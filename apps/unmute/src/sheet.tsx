import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './icons';

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

  if(!open) return null;
  return (
    <div className="sheet-scrim" role="presentation" onMouseDown={event => {
      if(event.currentTarget === event.target) onClose();
    }}>
      <section ref={panel} className="sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}>
        <div className="sheet-grab" aria-hidden="true" />
        <button className="sheet-close pressable" type="button" onClick={onClose} aria-label={closeLabel}>
          <Icon name="close" size={20} />
        </button>
        {children}
      </section>
    </div>
  );
}

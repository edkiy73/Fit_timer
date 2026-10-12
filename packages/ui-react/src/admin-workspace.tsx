import {useLayoutEffect, useId, useRef, type ReactNode} from 'react';
import './admin-workspace.css';

/** Shared AppBase modal workbench. Native dialog provides focus trapping,
 * Escape handling and background inertness; the inner body scrolls separately. */
export function AdminWorkspace({title, subtitle, children, footer, onClose}:{
  title:string;
  subtitle?:string;
  children:ReactNode;
  footer?:ReactNode;
  onClose:()=>void;
}){
  const ref=useRef<HTMLDialogElement>(null);
  const titleId=useId();
  const subtitleId=useId();
  useLayoutEffect(()=>{
    const dialog=ref.current;
    if(!dialog)return;
    dialog.showModal();
    // Close while the dialog is still connected, so native focus restoration
    // can return to the list button before React removes the editor.
    return()=>{if(dialog.open)dialog.close();};
  },[]);
  return <dialog ref={ref} className="ab-admin-workspace" aria-labelledby={titleId}
    aria-describedby={subtitle?subtitleId:undefined}
    onCancel={event=>{event.preventDefault();onClose();}}
    onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div className="ab-admin-workspace-layout">
      <header className="ab-admin-workspace-header">
        <div><h2 id={titleId}>{title}</h2>{subtitle&&<p id={subtitleId}>{subtitle}</p>}</div>
        <button type="button" className="ab-admin-workspace-close" onClick={onClose} aria-label="Закрыть">×</button>
      </header>
      <div className="ab-admin-workspace-body">{children}</div>
      {footer&&<footer className="ab-admin-workspace-footer">{footer}</footer>}
    </div>
  </dialog>;
}

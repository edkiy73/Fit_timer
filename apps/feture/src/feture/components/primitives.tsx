import { useEffect, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { Button as AriaButton, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { m } from 'motion/react';
import { motionTokens } from '../motion';
import { Icon } from './Icon';
import { useQueryOverlay } from '../navigation';

export function ActionButton({children,className='',type='button',...props}:ButtonHTMLAttributes<HTMLButtonElement>){
  return <button {...props} type={type} className={`ft-primary ${className}`}>{children}</button>;
}

export function AppDialog({title,eyebrow,children,onClose,presentation='dialog',closeLabel='Закрыть'}:{title:string;eyebrow?:string;children:ReactNode;onClose:()=>void;presentation?:'dialog'|'adaptive';closeLabel?:string}){
  // The URL represents the overlay; Escape, outside click and native/browser back agree.
  useEffect(()=>{
    const dismiss=()=>onClose();
    window.addEventListener('feture:dismiss-overlay',dismiss);
    return ()=>window.removeEventListener('feture:dismiss-overlay',dismiss);
  },[onClose]);
  const heading=<>
      <AriaButton className="ft-dialog-close" aria-label={closeLabel} onPress={onClose}><Icon name="close"/></AriaButton>
      {eyebrow&&<p className="ft-eyebrow">{eyebrow}</p>}
      <Heading slot="title" level={2}>{title}</Heading>
    </>;
  const adaptive=presentation==='adaptive';
  return <ModalOverlay isOpen isDismissable onOpenChange={open=>{if(!open)onClose();}} className={`ft-overlay${adaptive?' ft-overlay-adaptive':''}`}>
    <Modal className="ft-modal"><Dialog className={`ft-dialog${adaptive?' ft-dialog-adaptive':''}`}>
      {adaptive?<><div className="ft-dialog-header">{heading}</div><div className="ft-dialog-body">{children}</div></>:<>{heading}{children}</>}
    </Dialog></Modal>
  </ModalOverlay>;
}

export function HintChip({title,description,children}:{title:string;description:string;children:ReactNode}){
  const hint=useQueryOverlay('hint');
  return <><button className="ft-hint-chip" type="button" onClick={()=>hint.open(title)} aria-label={`Что значит «${title}»?`}>{children}<Icon name="eye" size={12}/></button>
    {hint.value===title&&<AppDialog title={title} onClose={hint.close}><p className="ft-muted">{description}</p><ActionButton onClick={hint.close}>Понятно</ActionButton></AppDialog>}
  </>;
}

export function Jar({color,percent,known,total}:{color:string;percent:number;known:number;total:number}){
  return <div className="ft-jar" style={{'--jar-color':color} as CSSProperties} aria-hidden="true">
    <m.div className="ft-jar-liquid" initial={false} animate={{scaleY:Math.max(0,Math.min(100,percent))/100}} transition={motionTokens.panel} style={{height:'100%',transformOrigin:'bottom'}}/>
    <div className="ft-jar-shine"/><div className="ft-jar-count">{known}<small>/{total}</small></div>
  </div>;
}

export function StateCard({title,description,tone='empty',action}:{title:string;description?:string;tone?:'loading'|'error'|'empty';action?:ReactNode}){
  return <div className={`ft-state ft-state-${tone}`} role={tone==='error'?'alert':'status'} aria-busy={tone==='loading'}>
    {tone==='loading'&&<span className="ft-spinner" aria-hidden="true"/>}<div><strong>{title}</strong>{description&&<p>{description}</p>}</div>{action}
  </div>;
}

export function StatusToast(props: {title:string;description?:string;tone:'loading'|'error'}) {
  return <div className="ft-toast"><StateCard {...props}/></div>;
}

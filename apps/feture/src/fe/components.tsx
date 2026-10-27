import type {ButtonHTMLAttributes,ReactNode} from 'react';
import {useNavigate} from 'react-router';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Icon,type IconName} from '../feture/components/Icon';

/** Shared V21 building blocks (V21-INTEGRATION-GUIDE §6). One implementation each; screens never restyle them. */

const AV={xs:24,s:36,m:44,l:56,xl:88} as const;
/** Avatar: photo when given, otherwise initials on a quiet disc. A couple is a split disc of the same size. */
export function Avatar({name,src,size='m',couple=false}:{name:string,src?:string|null,size?:keyof typeof AV,couple?:boolean}){
 const px=AV[size];
 const initials=(name.trim()||'?').split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()??'').join('');
 return <span className={'fe-av'+(couple?' fe-av-couple':'')} style={{width:px,height:px,fontSize:Math.round(px*.38)}} aria-hidden="true">
  {src?<img src={src} alt="" width={px} height={px}/>:<span>{initials}</span>}
 </span>;
}

type ButtonProps=ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'soft'|'text'|'danger',size?:'lg'|'md'|'sm',icon?:IconName};
/** One main button per group; 48 / 44 / 36 px. */
export function ActionButton({variant='primary',size='lg',icon,children,className,type='button',...rest}:ButtonProps){
 return <button type={type} className={`fe-btn fe-btn-${variant} fe-btn-${size}${className?' '+className:''}`} {...rest}>
  {icon&&<Icon name={icon} size={size==='sm'?16:18}/>}{children}
 </button>;
}

/** Empty, error, unavailable and «скоро» states share one look: icon, title, text, one action. */
export function StateCard({icon,title,text,action,role}:{icon:IconName,title:string,text?:string,action?:ReactNode,role?:'status'|'alert'}){
 return <section className="fe-state" role={role}>
  <span className="fe-state-icon"><Icon name={icon} size={28}/></span>
  <h2>{title}</h2>
  {text&&<p>{text}</p>}
  {action}
 </section>;
}

/** Screen header: «‹» goes back within the current tab's stack. */
export function ScreenHeader({title,back,action}:{title:string,back?:string|true,action?:ReactNode}){
 const navigate=useNavigate();const {t}=useI18n();
 return <header className="fe-header">
  {back&&<button type="button" className="fe-ibtn" aria-label={t('fe.back')} onClick={()=>typeof back==='string'?navigate(back):navigate(-1)}><Icon name="back" size={22}/></button>}
  <h1>{title}</h1>
  {action&&<div className="fe-header-action">{action}</div>}
 </header>;
}

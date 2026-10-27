import {useEffect,useState} from 'react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {ChevronLeft,ChevronRight,FileText,Heart,Lock,ShieldCheck,Trash2,Users,X,type LucideIcon} from 'lucide-react';
import {apiUrl} from '../api-url';
import {documentsResponse,type PublishedDocument} from '../feture/document-model';
import {Btn,Layer,Skel} from './ui';

/** V21 `ACT.terms` + `ACT.legalDoc`: «Условия и приватность» — four short facts and the documents a new account
 * accepts, each opening its published text (server: /api/catalog?resource=documents). Used by A01 and A04. */
let cache:{locale:string,docs:Promise<PublishedDocument[]>}|null=null;
export function loadDocuments(locale:'ru'|'en'){
 if(!cache||cache.locale!==locale){
  const docs=fetch(apiUrl(`/api/catalog?resource=documents&locale=${locale}`),{cache:'no-store'}).then(r=>r.json()).then(j=>documentsResponse.parse(j).documents);
  docs.catch(()=>{cache=null;});
  cache={locale,docs};
 }
 return cache.docs;
}
const ORDER=['terms','privacy','adult-content','community'];
const rank=(k:string)=>{const i=ORDER.indexOf(k);return i<0?ORDER.length:i;};
const ICON:Record<string,LucideIcon>={terms:FileText,privacy:Lock,'adult-content':ShieldCheck,community:Users};

export function TermsSheet({onClose}:{onClose:()=>void}){
 const {t,locale}=useI18n();const loc=locale==='en'?'en':'ru';
 const [docs,setDocs]=useState<PublishedDocument[]|null>(null);const [failed,setFailed]=useState(false);
 const [open,setOpen]=useState<PublishedDocument|null>(null);
 useEffect(()=>{let live=true;setFailed(false);loadDocuments(loc).then(d=>{if(live)setDocs(d);}).catch(()=>{if(live)setFailed(true);});return ()=>{live=false;};},[loc]);
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};addEventListener('keydown',k);return ()=>removeEventListener('keydown',k);},[onClose]);
 const list=(docs??[]).filter(d=>d.requiresAccept).sort((a,b)=>rank(a.key)-rank(b.key));
 const title=open?open.title:t('fe.onb.terms.title');
 const facts:[LucideIcon,string][]=[[ShieldCheck,'adult'],[Lock,'private'],[Heart,'mutual'],[Trash2,'data']];
 return <Layer>
  <div className="scrim on" onClick={onClose}/>
  <div className="sheet on" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
   <div className="grab"/>
   <div className="sh-h"><div className="sh-ht"><h2>{title}</h2></div>
    <button type="button" className="ibtn ghost sm" aria-label={t('fe.onb.close')} onClick={onClose}><X/></button></div>
   {open?<>
    <div className="sh-b">{open.blocks.map((b,i)=>b.type==='heading'?<h3 key={i} className="t">{b.text}</h3>
     :b.type==='list'?<ul key={i} className="note" style={{margin:'0 0 14px',paddingLeft:18}}>{b.items.map((x,j)=><li key={j}>{x}</li>)}</ul>
     :<p key={i} className="note" style={{margin:'0 0 14px'}}>{b.text}</p>)}</div>
    <div className="sh-f"><Btn kind="soft" icon={ChevronLeft} onClick={()=>setOpen(null)}>{t('fe.back')}</Btn></div>
   </>:<>
    <div className="sh-b">
     {facts.map(([Icon,k])=><div key={k} className="fact"><i className="v"><Icon/></i><span><b>{t(`fe.onb.terms.${k}`)}.</b> {t(`fe.onb.terms.${k}Text`)}</span></div>)}
     {failed?<div className="alert err mt16" role="alert"><span>{t('fe.onb.terms.failed')}</span></div>
      :docs===null?<div className="mt16"><Skel kind="list" rows={2}/></div>
      :<div className="card list mt16">{list.map(d=>{const Icon=ICON[d.key]??FileText;return <button key={d.id} type="button" className="li" onClick={()=>setOpen(d)}>
        <span className="ico"><Icon/></span><span className="tx"><b>{d.title}</b></span><ChevronRight/></button>;})}</div>}
    </div>
    <div className="sh-f"><Btn onClick={onClose}>{t('fe.onb.terms.ok')}</Btn></div>
   </>}
  </div>
 </Layer>;
}

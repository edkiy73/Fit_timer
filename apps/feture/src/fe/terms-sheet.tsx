import {useEffect,useState} from 'react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {ChevronLeft,FileText,Heart,Lock,ShieldCheck,Trash2,Users,type LucideIcon} from 'lucide-react';
import {apiUrl} from '../api-url';
import {documentsResponse,type PublishedDocument} from '../feture/document-model';
import {Alert,Btn,Card,H,Note,Row,Sheet,Skel,Spacer} from './kit';

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
 const list=(docs??[]).filter(d=>d.requiresAccept).sort((a,b)=>rank(a.key)-rank(b.key));
 const title=open?open.title:t('fe.onb.terms.title');
 const facts:[LucideIcon,string][]=[[ShieldCheck,'adult'],[Lock,'private'],[Heart,'mutual'],[Trash2,'data']];
 // One sheet for both views: the facts with the document list, or one document's text with «Назад».
 return <Sheet title={title} onClose={onClose}
  foot={open?<Btn kind="soft" icon={ChevronLeft} onClick={()=>setOpen(null)}>{t('fe.back')}</Btn>:<Btn onClick={onClose}>{t('fe.onb.terms.ok')}</Btn>}>
  {open?<div className="md">{open.blocks.map((b,i)=>b.type==='heading'?<H key={i} level={4} as="h3" className="t">{b.text}</H>
    :b.type==='list'?<Note key={i} as="ul">{b.items.map((x,j)=><li key={j}>{x}</li>)}</Note>
    :<Note key={i}>{b.text}</Note>)}</div>
   :<>
    {facts.map(([Icon,k])=><div key={k} className="fact"><i className="v"><Icon/></i><span><b>{t(`fe.onb.terms.${k}`)}.</b> {t(`fe.onb.terms.${k}Text`)}</span></div>)}
    <Spacer size={3}/>
    {failed?<Alert kind="err" noIcon>{t('fe.onb.terms.failed')}</Alert>
     :docs===null?<Skel kind="list" rows={2}/>
     :<Card list>{list.map(d=><Row key={d.id} icon={ICON[d.key]??FileText} title={d.title} onClick={()=>setOpen(d)}/>)}</Card>}
   </>}
 </Sheet>;
}

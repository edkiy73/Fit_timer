import {useEffect,useState} from 'react';
import type {AuthSession} from '@appbase/core/auth.js';
import {Link} from 'react-router';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import {apiUrl} from '../api-url';
import {domainRequest,domainErrorMessage} from './domain-api';
import {sameSession} from './interest-api';
import {authClient} from '../auth';
import {documentsResponse,consentResponse,type PublishedDocument,type DocumentBlock} from './document-model';

export function DocumentContent({blocks}:{blocks:DocumentBlock[]}){
 return <div className="ft-document-content">{blocks.map((b,i)=>b.type==='heading'?<h3 key={i}>{b.text}</h3>:b.type==='list'?<ul key={i}>{b.items.map((text,j)=><li key={j}>{text}</li>)}</ul>:<p key={i}>{b.text}</p>)}</div>;
}
export function DocumentsPage(){
 const auth=useOptionalAuth(),session=auth.session;
 const [documents,setDocuments]=useState<PublishedDocument[]>([]),[accepted,setAccepted]=useState<string[]>([]),[selected,setSelected]=useState<string[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0),[notice,setNotice]=useState('');
 const [owner,setOwner]=useState<AuthSession|null>(null);
 const own=!!session&&sameSession(owner,session);
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setError('');setAccepted([]);setSelected([]);setNotice('');setBusy(false);setOwner(null);
  const load=async()=>{
   try {
    const publicLoad=fetch(apiUrl('/api/catalog?resource=documents&locale=ru'),{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])}).then(async r=>{if(!r.ok)throw Error('unavailable');return documentsResponse.parse(await r.json());});
    const privateLoad=session?domainRequest(session,{action:'documents.status',locale:'ru'},consentResponse,controller.signal):Promise.resolve(null);
    const [list,privateResult]=await Promise.allSettled([publicLoad,privateLoad]);
    if(controller.signal.aborted||session&&!sameSession(await authClient.getSession(),session))return;
    if(list.status==='rejected')throw list.reason;
    setDocuments(list.value!.documents);
    if(privateResult.status==='fulfilled'){setAccepted(privateResult.value?.consents.documents.filter(d=>d.accepted).map(d=>d.id)||[]);setOwner(session);}
    else setError(domainErrorMessage(privateResult.reason));
   }catch(e){if(!controller.signal.aborted){setDocuments([]);setError(session?domainErrorMessage(e):'Документы сейчас недоступны. Попробуй позже.');}}
   finally {if(!controller.signal.aborted)setLoading(false);}
  };void load();return ()=>controller.abort();
 },[session,reload]);
 const accept=async()=>{
  if(!session||!own||busy||!selected.length)return;setBusy(true);setError('');setNotice('');
  try {const result=await domainRequest(session,{action:'documents.accept',locale:'ru',documentIds:selected},consentResponse);
   if(!sameSession(await authClient.getSession(),session))return;
   setAccepted(result.consents.documents.filter(d=>d.accepted).map(d=>d.id));setSelected([]);setNotice('Согласие сохранено в аккаунте.');
  }catch(e){if(sameSession(await authClient.getSession(),session))setError(domainErrorMessage(e));}finally {if(sameSession(await authClient.getSession(),session))setBusy(false);}
 };
 return <section className="card ft-documents-page"><p><Link to="/account">← Аккаунт</Link></p><h2>Правила и согласия</h2><p>Можно прочитать документы до входа. Согласие сохраняется для конкретной версии в твоём аккаунте.</p>
  {loading?<p role="status">Загружаем документы…</p>:documents.length===0&&!error?<p role="status">Документы сейчас недоступны. Попробуй позже.</p>:documents.map(doc=><article className="ft-document" key={doc.id}>
   <details><summary><strong>{doc.title}</strong><span>Версия {doc.version} · действует с {new Date(doc.effectiveAt).toLocaleDateString('ru')}</span></summary><DocumentContent blocks={doc.blocks}/></details>
   {session&&(own&&accepted.includes(doc.id)?<p className="muted">Эта версия принята</p>:doc.requiresAccept?<label className="ft-consent-choice"><input type="checkbox" checked={own&&selected.includes(doc.id)} disabled={busy||!own} onChange={e=>setSelected(ids=>e.target.checked?[...ids,doc.id]:ids.filter(id=>id!==doc.id))}/><span>Прочитано. Принимаю эту версию документа.</span></label>:<p className="muted">Отдельное согласие не требуется</p>)}
  </article>)}
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <div className="ft-form-actions"><button type="button" className="link-button" onClick={()=>setReload(n=>n+1)} disabled={loading||busy}>Обновить</button>{session?<button type="button" className="link-button" disabled={!own||!selected.length||busy||loading} onClick={()=>void accept()}>{busy?'Сохраняем…':'Подтвердить выбранное'}</button>:<Link to="/account">Войти, чтобы сохранить согласие</Link>}</div>
 </section>;
}

import {useEffect,useState} from 'react';
import {Link,useParams} from 'react-router';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import type {AuthSession} from '@appbase/core/auth.js';
import {domainRequest,domainErrorMessage} from './domain-api';
import {listedSchema,readSchema,revokedSchema,shareLinkUrl,STANCE_LABELS} from './share-link-model';

export function ShareLinksPage(){
 const auth=useOptionalAuth();
 if(auth.loading)return <section className="card" role="status">Загружаем аккаунт…</section>;
 if(!auth.session)return <section className="card"><h2>Мои ссылки</h2><p>Управление ссылками доступно после входа и подтверждения совершеннолетия.</p><Link to="/account">Войти</Link></section>;
 return <OwnLinks key={auth.session.email+auth.session.deviceId+auth.session.syncToken} session={auth.session}/>;
}
function OwnLinks({session}:{session:AuthSession}){
 const [list,setList]=useState<ReturnType<typeof listedSchema.parse>['items']>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{let live=true;setLoading(true);setError('');
  void domainRequest(session,{action:'share.list'},listedSchema).then(data=>{if(live)setList(data.items);})
   .catch(e=>{if(live)setError(domainErrorMessage(e));})
   .finally(()=>{if(live)setLoading(false);});
  return ()=>{live=false;};
 },[session,refresh]);
 const revoke=async(id:string)=>{
  if(busy||!window.confirm('Отозвать ссылку? После отзыва открывать её станет нельзя. Ранее сохранённые снимки экрана или файлы у получателя удалить невозможно.'))return;
  setBusy(id);setError('');setNotice('');
  try{await domainRequest(session,{action:'share.revoke',linkId:id},revokedSchema);
   setNotice('Ссылка отозвана.');setRefresh(n=>n+1);
  }catch(e){setError(domainErrorMessage(e));}finally{setBusy(null);}
 };
 return <section className="card ft-share-links">
  <p><Link to="/">← Мой мир</Link></p>
  <h2>Мои ссылки на выбранные темы</h2>
  <p>Доступ есть только у вошедших взрослых пользователей с актуальными согласиями. Ссылка не показывает полную карту или дневник. Любую ссылку можно отозвать.</p>
  <button type="button" disabled={loading||!!busy} onClick={()=>setRefresh(n=>n+1)}>Обновить</button>
  {loading?<p role="status">Загружаем…</p>:list.length===0?<p>Активных и ранее созданных ссылок пока нет.</p>:<ul className="ft-share-history">
   {list.map(item=>{const expired=Date.parse(item.expiresAt)<=Date.now(),active=!item.revoked&&!expired,url=shareLinkUrl(item.id);
    return <li key={item.id}><strong>{item.count} тем · {active?'Действует':item.revoked?'Отозвана':'Истекла'}</strong>
      <small>До {new Date(item.expiresAt).toLocaleString('ru')}</small>
      <div className="ft-form-actions"><Link to={'/share/'+item.id}>Посмотреть</Link>
       {active&&<button type="button" disabled={!!busy} onClick={()=>void navigator.clipboard.writeText(url).then(()=>setNotice('Ссылка скопирована.')).catch(()=>setError('Не удалось скопировать ссылку.'))}>Копировать</button>}
       {!item.revoked&&<button type="button" disabled={!!busy} onClick={()=>void revoke(item.id)}>{busy===item.id?'Отзываем…':'Отозвать'}</button>}
      </div></li>;
   })}
  </ul>}
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <p>Ссылка перестаёт работать, если владелец отзывает её, меняет выбранную отметку или теряет право делиться. Снимки, сохранённые получателем отдельно, отозвать нельзя.</p>
 </section>;
}
export function SharedCardPage(){
 const auth=useOptionalAuth(),{linkId}=useParams();
 useEffect(()=>{const meta=document.createElement('meta');meta.name='robots';meta.content='noindex,nofollow,noarchive';document.head.appendChild(meta);return ()=>meta.remove();},[]);
 if(!linkId||!/^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(linkId))return <section className="card"><p>Карточка недоступна.</p></section>;
 if(auth.loading)return <section className="card" role="status">Проверяем вход…</section>;
 if(!auth.session)return <section className="card"><h2>Карточка выбранных тем</h2><p>Получатель должен войти и подтвердить совершеннолетие. Сведения не загружаются до проверки.</p><Link to="/account">Войти</Link><p>После входа вернись по этой ссылке.</p></section>;
 return <SharedCard key={auth.session.email+auth.session.deviceId+auth.session.syncToken+linkId} session={auth.session} linkId={linkId}/>;
}
function SharedCard({session,linkId}:{session:AuthSession;linkId:string}){
 const [card,setCard]=useState<ReturnType<typeof readSchema.parse>['card']|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let live=true;setLoading(true);setCard(null);setError('');
  void domainRequest(session,{action:'share.read',linkId},readSchema).then(data=>{if(live)setCard(data.card);})
   .catch(e=>{if(live)setError(e instanceof Error&&e.message==='resource_not_found'?'Ссылка недоступна, отозвана или срок её действия истёк.':domainErrorMessage(e));})
   .finally(()=>{if(live)setLoading(false);});
  return ()=>{live=false;};
 },[session,linkId]);
 return <section className="card ft-share-links">
  <p><Link to="/">← FetUre</Link></p><h2>Темы, которые человек выбрал для обсуждения</h2>
  {loading?<p role="status">Проверяем право доступа…</p>:card?<><p>Действует до {new Date(card.expiresAt).toLocaleString('ru')}. Это только выбранные человеком темы — не приглашение к действиям и не согласие.</p>
   <div className="ft-share-preview">{card.items.map((r,i)=><div key={i}><strong>{r.title}</strong><span>{STANCE_LABELS[r.stance]}</span></div>)}</div>
  </>:<p role="alert">{error||'Карточка недоступна.'}</p>}
  <p>Не пытайся делать выводы об опыте, предпочтениях или границах: они здесь не раскрываются.</p>
 </section>;
}

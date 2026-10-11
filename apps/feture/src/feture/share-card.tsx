import {useEffect,useMemo,useRef,useState} from 'react';
import {AppDialog} from './components/primitives';
import {Link} from 'react-router';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import {domainRequest,domainErrorMessage} from './domain-api';
import {createdSchema,revokedSchema,shareLinkUrl} from './share-link-model';
import type {InterestDTO} from '../../lib/feture/contracts';
import {shareCardRows} from './share-card-model';
import type {Catalog,InterestMap} from './model';

export function ShareCardDialog({categories,map,server,phase,pending,conflicts,onClose}:{categories:Catalog['categories'];map:InterestMap;server:Record<string,InterestDTO>;phase:string;pending:number;conflicts:string[];onClose:()=>void}){
 const auth=useOptionalAuth();
 const [selected,setSelected]=useState<string[]>([]);
 const [approvedPreview,setApprovedPreview]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [linkApprovalKey,setLinkApprovalKey]=useState<string|null>(null),[linkDays,setLinkDays]=useState<1|3|7>(3);
 const [createdLink,setCreatedLink]=useState<string|null>(null),[linkError,setLinkError]=useState(''),[linkNotice,setLinkNotice]=useState('');
 const [linkBusy,setLinkBusy]=useState(false);
 const pendingLink=useRef<{action:'share.create';linkId:string;days:1|3|7;reviewed:true;selected:{interestId:string;expectedRevision:number}[]}|null>(null);
 const alive=useRef(true);
 useEffect(()=>{alive.current=true;return ()=>{alive.current=false;};},[]);
 const available=useMemo(()=>categories.flatMap(c=>c.interests).filter(i=>map[i.id]&&map[i.id]!.stance!=='unknown'&&map[i.id]!.boundary==='none'),[categories,map]);
 const choices=new Set(available.map(i=>i.id));
 const valid=selected.length>=1&&selected.length<=6&&selected.every(id=>choices.has(id));
 const preview=valid?shareCardRows(selected,categories,map):[];
 const fingerprint=JSON.stringify(preview);
 const approved=approvedPreview!==null&&approvedPreview===fingerprint;
 const canLink=!!auth.session&&phase==='synced'&&pending===0&&conflicts.length===0&&valid
  &&selected.every(id=>!!server[id]&&!server[id].deleted&&server[id].revision>=1);
 const linkFingerprint=JSON.stringify({selected:selected.map(id=>({id,revision:server[id]?.revision,title:preview.find(v=>v.title===categories.flatMap(c=>c.interests).find(x=>x.id===id)?.title)?.title,stance:map[id]?.stance})),days:linkDays});
 const linkApproved=linkApprovalKey!==null&&linkApprovalKey===linkFingerprint;
 const linkUrl=createdLink?shareLinkUrl(createdLink):null;
 const createLink=async()=>{
  if(linkBusy||!auth.session||(!pendingLink.current&&(!linkApproved||!canLink)))return;
  const command=pendingLink.current??{action:'share.create' as const,linkId:crypto.randomUUID(),days:linkDays,
   reviewed:true as const,selected:selected.map(interestId=>({interestId,expectedRevision:server[interestId]!.revision}))};
  pendingLink.current=command;setLinkBusy(true);setLinkError('');setLinkNotice('');
  try{
   const r=await domainRequest(auth.session,command,createdSchema);
   if(!alive.current)return;
   if(r.link.id!==command.linkId||r.link.revoked)throw Error('invalid_response');
   setCreatedLink(r.link.id);pendingLink.current=null;
   setLinkNotice('Ссылка создана. Открыть её смогут только взрослые пользователи, прошедшие проверку и принявшие правила.');
  }catch(e){if(alive.current)setLinkError(domainErrorMessage(e));}
  finally{if(alive.current)setLinkBusy(false);}
 };
 const revokeLink=async()=>{
  if(!createdLink||!auth.session||linkBusy||!window.confirm('Отозвать ссылку? Сохранённые получателем снимки это не удалит.'))return;
  setLinkBusy(true);setLinkError('');try{
   await domainRequest(auth.session,{action:'share.revoke',linkId:createdLink},revokedSchema);
   if(alive.current){setCreatedLink(null);setLinkApprovalKey(null);setLinkNotice('Ссылка отозвана.');}
  }catch(e){if(alive.current)setLinkError(domainErrorMessage(e));}
  finally{if(alive.current)setLinkBusy(false);}
 };
 
 const toggle=(id:string,checked:boolean)=>{
  setSelected(prev=>checked?(prev.length<6?[...prev,id]:prev):prev.filter(item=>item!==id));
  setApprovedPreview(null);setLinkApprovalKey(null);setNotice('');setError('');
 };
 const exportImage=async()=>{
  if(busy||!valid||!approved)return;
  setBusy(true);setError('');setNotice('');
  try{
   // Re-validate at the instant of export, so a changed map cannot leak stale data.
   const rows=shareCardRows(selected,categories,map);
   const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=900;
   const ctx=canvas.getContext('2d');if(!ctx)throw Error('canvas_unavailable');
   const grad=ctx.createLinearGradient(0,0,1200,900);grad.addColorStop(0,'#fcf8fb');grad.addColorStop(1,'#eee7f4');ctx.fillStyle=grad;ctx.fillRect(0,0,1200,900);
   ctx.fillStyle='#483050';ctx.font='800 40px system-ui';ctx.fillText('FetUre',66,78);
   ctx.font='700 43px system-ui';ctx.fillText('Темы, которые я хочу обсудить',66,148);
   ctx.font='22px system-ui';ctx.fillStyle='#76677d';ctx.fillText('Только выбранные мной темы · без личных заметок',66,187);
   const fit=(value:string,max:number,font:string)=>{
    ctx.font=font;let out=value;
    while(out.length>1&&ctx.measureText(out).width>max)out=out.slice(0,-1);
    return out===value?out:out.trimEnd()+'…';
   };
   rows.forEach((row,index)=>{
    const y=218+index*99;
    ctx.fillStyle='#fff';ctx.beginPath();ctx.roundRect(62,y,1076,88,16);ctx.fill();
    ctx.strokeStyle='#e4d7e6';ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle='#482b51';ctx.fillText(fit(row.title,930,'700 29px system-ui'),87,y+36);
    ctx.fillStyle='#806a82';ctx.font='21px system-ui';ctx.fillText(row.stance,87,y+65);
   });
   ctx.fillStyle='#756779';ctx.font='19px system-ui';ctx.fillText('Личные ответы, условия и границы не входят в карточку.',66,855);
   const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));
   if(!blob)throw Error('png_unavailable');
   // Switching accounts or leaving the page must not export the previous account's card.
   if(!alive.current)return;
   const file=new File([blob],'feture-topics.png',{type:'image/png'});
   if(typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&navigator.canShare({files:[file]})){
    try{await navigator.share({files:[file],title:'Темы FetUre'});setNotice('Карточка передана в системное меню.');return;}
    catch(e){if(e instanceof DOMException&&e.name==='AbortError')return;}
   }
   const url=URL.createObjectURL(blob);
   const a=document.createElement('a');a.href=url;a.download='feture-topics.png';document.body.appendChild(a);a.click();a.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),3000);setNotice('Сохранение PNG запрошено у устройства.');
  }catch{setError('Не удалось создать PNG на этом устройстве. Выбор тем сохранился в открытом окне.');}
  finally{setBusy(false);}
 };
 return <AppDialog title="Карточка моих тем" eyebrow="Поделиться по выбору" onClose={()=>{if(!busy)onClose();}}>
  <div className="ft-share-composer">
   <p>Выбери от 1 до 6 тем. Отметки из карты не становятся публичными: изображение создаётся только после подтверждения на этом устройстве. Границы, условия, опыт и личные заметки не экспортируются.</p>
   {available.length===0?<p>Пока нет тем для карточки. Сначала отметь интерес в своей карте.</p>:<div className="ft-share-choices" role="group" aria-label="Темы для карточки">
    {available.map(item=><label key={item.id} className="ft-share-choice"><input type="checkbox" checked={selected.includes(item.id)} disabled={busy||linkBusy||!!pendingLink.current||!!createdLink||(!selected.includes(item.id)&&selected.length>=6)} onChange={e=>toggle(item.id,e.target.checked)}/><span>{item.title}</span></label>)}
   </div>}
   <h3>Предпросмотр ({selected.length}/6)</h3>
   <div className="ft-share-preview" aria-label="Содержимое будущей карточки">
    <strong>Темы, которые я хочу обсудить</strong>
    {preview.length?preview.map((item,i)=><div key={i}><strong>{item.title}</strong><span>{item.stance}</span></div>):<p>Выбери темы выше.</p>}
    <small>Личные ответы, условия и границы не входят в карточку.</small>
   </div>
   <p className="ft-share-warning"><strong>Важно:</strong> получатель сможет сохранить и переслать PNG. После отправки картинку нельзя отозвать, даже если изменить приватность в приложении.</p>
   <label className="ft-consent-choice"><input type="checkbox" checked={approved} disabled={!valid||busy} onChange={e=>setApprovedPreview(e.target.checked?fingerprint:null)}/>Я проверил, что именно раскрывает карточка, и понимаю, что изображение нельзя отозвать.</label>
   <div className="ft-form-actions"><button type="button" disabled={!valid||!approved||busy} onClick={()=>void exportImage()}>{busy?'Создаём…':'Создать PNG'}</button><button type="button" disabled={busy} onClick={onClose}>Закрыть</button></div>
   {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
   <section className="ft-share-link-control">
    <h3>Ссылка с возможностью отзыва</h3>
    <p>Это отдельный способ поделиться теми же выбранными темами. Приглашённому нужно войти, подтвердить возраст 18+ и принять правила. Ссылка действует ограниченный срок и может быть отозвана. Создание невозможно при несохранённых изменениях или конфликте карты.</p>
    {auth.session?<><label>Срок действия <select value={linkDays} disabled={linkBusy||!!pendingLink.current||!!createdLink} onChange={e=>{setLinkDays(Number(e.target.value) as 1|3|7);setLinkApproved(false);}}>
      <option value={1}>1 день</option><option value={3}>3 дня</option><option value={7}>7 дней</option>
     </select></label>
     <label className="ft-consent-choice"><input type="checkbox" checked={linkApproved} disabled={!canLink||linkBusy||!!pendingLink.current||!!createdLink} onChange={e=>setLinkApprovalKey(e.target.checked?linkFingerprint:null)}/>
      Я проверил выбранные темы и отдельно разрешаю показывать их обладателю ссылки до её отзыва или истечения срока.</label>
     {createdLink&&linkUrl?<div><p>Ссылка создана:</p><input type="text" readOnly value={linkUrl} aria-label="Ссылка на карточку" onFocus={e=>e.target.select()}/>
       <div className="ft-form-actions"><button type="button" disabled={linkBusy} onClick={()=>void navigator.clipboard.writeText(linkUrl).then(()=>setLinkNotice('Ссылка скопирована.')).catch(()=>setLinkError('Скопировать не удалось. Выдели ссылку вручную.'))}>Копировать</button>
       <button type="button" disabled={linkBusy} onClick={()=>void revokeLink()}>Отозвать</button></div>
      </div>:<button type="button" disabled={linkBusy||(!pendingLink.current&&(!canLink||!linkApproved))} onClick={()=>void createLink()}>{linkBusy?'Сохраняем…':pendingLink.current?'Повторить ту же операцию':'Создать ссылку'}</button>}
     {pendingLink.current&&<p>Исход прошлого запроса неизвестен. Выбор и срок зафиксированы: повтор использует тот же номер операции.</p>}
     <p><Link to="/share-links">Управлять созданными ссылками</Link></p>
    </>:<p><Link to="/account">Войди в аккаунт</Link>, чтобы создать отзывную ссылку.</p>}
    {linkError&&<p role="alert">{linkError}</p>}{linkNotice&&<p role="status">{linkNotice}</p>}
   </section>
  </div>
 </AppDialog>;
}

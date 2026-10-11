import {useMemo,useState} from 'react';
import {AppDialog} from './components/primitives';
import {shareCardRows} from './share-card-model';
import type {Catalog,InterestMap} from './model';

export function ShareCardDialog({categories,map,onClose}:{categories:Catalog['categories'];map:InterestMap;onClose:()=>void}){
 const [selected,setSelected]=useState<string[]>([]);
 const [approved,setApproved]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const available=useMemo(()=>categories.flatMap(c=>c.interests).filter(i=>map[i.id]&&map[i.id]!.stance!=='unknown'&&map[i.id]!.boundary==='none'),[categories,map]);
 const choices=new Set(available.map(i=>i.id));
 const valid=selected.length>=1&&selected.length<=6&&selected.every(id=>choices.has(id));
 const preview=valid?shareCardRows(selected,categories,map):[];
 const toggle=(id:string,checked:boolean)=>{
  setSelected(prev=>checked?(prev.length<6?[...prev,id]:prev):prev.filter(item=>item!==id));
  setApproved(false);setNotice('');setError('');
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
    {available.map(item=><label key={item.id} className="ft-share-choice"><input type="checkbox" checked={selected.includes(item.id)} disabled={busy||(!selected.includes(item.id)&&selected.length>=6)} onChange={e=>toggle(item.id,e.target.checked)}/><span>{item.title}</span></label>)}
   </div>}
   <h3>Предпросмотр ({selected.length}/6)</h3>
   <div className="ft-share-preview" aria-label="Содержимое будущей карточки">
    <strong>Темы, которые я хочу обсудить</strong>
    {preview.length?preview.map((item,i)=><div key={i}><strong>{item.title}</strong><span>{item.stance}</span></div>):<p>Выбери темы выше.</p>}
    <small>Личные ответы, условия и границы не входят в карточку.</small>
   </div>
   <p className="ft-share-warning"><strong>Важно:</strong> получатель сможет сохранить и переслать PNG. После отправки картинку нельзя отозвать, даже если изменить приватность в приложении.</p>
   <label className="ft-consent-choice"><input type="checkbox" checked={approved} disabled={!valid||busy} onChange={e=>setApproved(e.target.checked)}/>Я проверил, что именно раскрывает карточка, и понимаю, что изображение нельзя отозвать.</label>
   <div className="ft-form-actions"><button type="button" disabled={!valid||!approved||busy} onClick={()=>void exportImage()}>{busy?'Создаём…':'Создать PNG'}</button><button type="button" disabled={busy} onClick={onClose}>Закрыть</button></div>
   {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </div>
 </AppDialog>;
}

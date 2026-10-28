import {useEffect,useRef,useState} from 'react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Crop as CropIcon,Plus,RotateCcw,ShieldCheck,X} from 'lucide-react';
import {Alert,Ask,Btn,FilePick,Progress,Seg,Sheet} from './index';
import {CropSheet} from './Crop';
import {VideoBadge} from './av';
import {NO_CROP,PHOTO_MAX_BYTES,VIDEO_MAX_BYTES,VIDEO_MAX_MS,VIDEO_TYPES,cropPhoto,fmtDur,isPhoto,isVideo,kb,preparePhoto,prepareVideo,
 type Aspect,type Crop,type Prepared,type PreparedVideo} from './media';
import {useToast} from '../toast';

/** What a screen gets back for each file: the server's asset id and a local preview of what was sent (for a clip:
 * its poster frame, its kind and length). */
export type Uploaded={id:string,url:string,w:number,h:number,kind?:'image'|'video',durationMs?:number};
/** Sends one prepared photo; reports progress 0…1; resolves with the asset id. The screen owns the API calls. */
export type SendPhoto=(blob:Blob,onProgress:(p:number)=>void)=>Promise<string>;
/** Sends one picked clip with its poster frame (`useSendVideo`). */
export type SendVideo=(video:PreparedVideo,onProgress:(p:number)=>void,/** Extra intent fields for this one (a chat's view rule). */ extra?:Record<string,unknown>)=>Promise<string>;

type Item={key:string,file:File,status:'prep'|'ready'|'up'|'ok'|'error',crop:Crop,prep?:Prepared|undefined,vid?:PreparedVideo|undefined,full?:string|undefined,progress:number,err?:string|undefined,id?:string|undefined};

/** The uploader sheet: format (when a screen allows several), each photo with its preview, state and progress,
 * «Кадрировать», «Повторить», «Убрать», «Добавить ещё», a privacy note, «Готово · N». Photos are compressed and
 * stripped of metadata on the device as soon as they are picked; they are sent on «Готово». With `sendVideo` it also
 * takes clips (up to a minute and 100 MB): never cropped, sent as picked with a poster frame cut on the device. */
export function Uploader({files,aspects=['orig'],max,send,sendVideo,onDone,onClose,title}:{files:File[],aspects?:Aspect[],max:number,send:SendPhoto,
 sendVideo?:SendVideo|undefined,onDone:(items:Uploaded[])=>void,onClose:()=>void,title?:string}){
 const {t}=useI18n();const toast=useToast();
 const [aspect,setAspect]=useState<Aspect>(aspects[0]??'orig');const [items,setItems]=useState<Item[]>([]);const [cropping,setCropping]=useState<string|null>(null);
 const [asking,setAsking]=useState(false);const [sending,setSending]=useState(false);const more=useRef<HTMLInputElement>(null);const seq=useRef(0);
 const patch=(key:string,p:Partial<Item>)=>setItems(l=>l.map(i=>i.key===key?{...i,...p}:i));
 const prepare=async(it:Item,asp:Aspect)=>{
  if(it.vid)return;
  try{
   // The whole photo (upright, compressed) is kept once for the crop sheet; the frame is cut from it.
   const full=it.full??(await preparePhoto(it.file)).url;
   const prep=asp==='orig'?await preparePhoto(it.file):await cropPhoto(it.file,asp,it.crop);patch(it.key,{prep,full,status:'ready',err:undefined});}
  catch{patch(it.key,{status:'error',err:t('fe.kit.up.readFail')});}
 };
 const prepareClip=async(it:Item)=>{
  try{
   const vid=await prepareVideo(it.file);
   if(vid.durationMs>VIDEO_MAX_MS+500){toast(t('fe.kit.up.videoLong'),{type:'warn'});setItems(l=>l.filter(x=>x.key!==it.key));return;}
   patch(it.key,{vid,prep:{blob:vid.poster,url:vid.url,w:vid.w,h:vid.h,size:vid.size},status:'ready',err:undefined});
  }catch{toast(t('fe.kit.up.videoRead').replace('{name}',it.file.name),{type:'warn'});setItems(l=>l.filter(x=>x.key!==it.key));}
 };
 const add=(list:File[])=>{
  const room=max-items.length;if(room<=0)return;
  if(list.length>room)toast(t('fe.kit.up.skipped').replace('{n}',String(room)),{type:'warn'});
  const fresh:Item[]=[];const clips:Item[]=[];
  for(const f of list.slice(0,room)){
   if(sendVideo&&isVideo(f)){
    if(f.size>VIDEO_MAX_BYTES){toast(t('fe.kit.up.videoBig'),{type:'warn'});continue;}
    const it:Item={key:'u'+(++seq.current),file:f,status:'prep',crop:NO_CROP,progress:0};fresh.push(it);clips.push(it);continue;
   }
   if(!isPhoto(f)){toast(t(sendVideo?'fe.kit.up.notMedia':'fe.kit.up.notPhoto').replace('{name}',f.name),{type:'warn'});continue;}
   if(f.size>PHOTO_MAX_BYTES){toast(t('fe.kit.up.tooBig'),{type:'warn'});continue;}
   fresh.push({key:'u'+(++seq.current),file:f,status:'prep',crop:NO_CROP,progress:0});
  }
  setItems(l=>[...l,...fresh]);fresh.forEach(it=>void(clips.includes(it)?prepareClip(it):prepare(it,aspect)));
 };
 useEffect(()=>{add(files);},[]);// eslint-disable-line react-hooks/exhaustive-deps
 // Removing the last photo closes the sheet (only after it had some — not on the first render).
 const had=useRef(false);if(items.length)had.current=true;
 useEffect(()=>{if(had.current&&items.length===0&&!sending)onClose();},[items.length]);// eslint-disable-line react-hooks/exhaustive-deps
 const changeAspect=(a:Aspect)=>{setAspect(a);setItems(l=>l.map(i=>i.vid?i:({...i,crop:NO_CROP,status:i.status==='error'?'error':'prep'})));items.forEach(i=>void prepare({...i,crop:NO_CROP},a));};
 const sendOne=async(it:Item):Promise<Uploaded|null>=>{
  if(!it.prep)return null;
  const out=(id:string):Uploaded=>it.vid?{id,url:it.vid.url,w:it.vid.w,h:it.vid.h,kind:'video',durationMs:it.vid.durationMs}:{id,url:it.prep!.url,w:it.prep!.w,h:it.prep!.h};
  if(it.status==='ok'&&it.id)return out(it.id);
  patch(it.key,{status:'up',progress:0,err:undefined});
  try{const on=(p:number)=>patch(it.key,{progress:p});const id=it.vid&&sendVideo?await sendVideo(it.vid,on):await send(it.prep.blob,on);
   patch(it.key,{status:'ok',id,progress:1});return out(id);}
  catch(e){patch(it.key,{status:'error',err:e instanceof Error&&e.message&&e.message!=='upload'?e.message:t('fe.error.network')});return null;}
 };
 const done=async()=>{
  setSending(true);const out:Uploaded[]=[];
  for(const it of items){const r=await sendOne(it);if(r)out.push(r);}
  setSending(false);
  // Everything sent → back to the screen; a failure keeps the sheet open with «Повторить» on that photo.
  if(out.length===items.length){onDone(out);toast(t('fe.kit.up.ready').replace('{n}',String(out.length)),{type:'ok'});}
 };
 const busy=sending||items.some(i=>i.status==='prep');const ready=items.filter(i=>i.status!=='error'&&i.prep).length;
 const close=()=>{if(items.length&&!sending)setAsking(true);else onClose();};
 const status=(i:Item)=>i.status==='prep'?t('fe.kit.up.prep'):i.status==='error'?i.err:i.status==='up'?t('fe.kit.up.loading').replace('{n}',String(Math.round(i.progress*100)))
  :i.vid?t('fe.kit.up.video').replace('{dur}',fmtDur(i.vid.durationMs)).replace('{size}',kb(i.vid.size))
  :i.prep?(i.prep.size<i.file.size*.95?t('fe.kit.up.done').replace('{from}',kb(i.file.size)).replace('{to}',kb(i.prep.size)):t('fe.kit.up.doneSame').replace('{to}',kb(i.prep.size))):'';
 const cur=items.find(i=>i.key===cropping);
 return <>
  <Sheet title={title??t('fe.kit.up.title')} full onClose={close}
   foot={<Btn onClick={done} busy={sending} disabled={!ready||busy}>{sending?t('fe.kit.up.busy'):ready?t('fe.kit.up.ready').replace('{n}',String(ready)):t('fe.kit.up.nothing')}</Btn>}>
   {aspects.length>1&&<Seg label={t('fe.kit.up.format')} value={aspect} onChange={changeAspect} options={aspects.map(a=>({id:a,label:a==='orig'?t('fe.kit.up.orig'):a}))}/>}
   <div className="k-uplist">{items.map(i=><div key={i.key} className={'k-uprow '+i.status}>
    <div className="k-upthumb">{i.prep?<img src={i.prep.url} alt=""/>:<span className="sk"/>}{i.vid&&<VideoBadge durationMs={i.vid.durationMs}/>}</div>
    <div className="k-uptx"><b>{i.file.name}</b><small>{status(i)}</small>{(i.status==='up'||i.status==='ok')&&<Progress value={i.status==='ok'?1:i.progress}/>}
     <div className="k-upacts">
      {aspect!=='orig'&&i.prep&&!i.vid&&!sending&&<Btn kind="text" size="sm" auto icon={CropIcon} onClick={()=>setCropping(i.key)}>{t('fe.kit.up.crop')}</Btn>}
      {i.status==='error'&&i.prep&&<Btn kind="text" size="sm" auto icon={RotateCcw} onClick={()=>void sendOne(i)}>{t('fe.kit.up.retry')}</Btn>}
      {!sending&&<Btn kind="text" size="sm" auto icon={X} className="danger" onClick={()=>setItems(l=>l.filter(x=>x.key!==i.key))}>{t('fe.kit.up.remove')}</Btn>}
     </div></div>
   </div>)}</div>
   {items.length<max&&!sending&&<Btn kind="soft" icon={Plus} onClick={()=>more.current?.click()}>{t('fe.kit.up.more').replace('{n}',String(items.length)).replace('{max}',String(max))}</Btn>}
   <FilePick ref={more} accept={sendVideo?'image/*,'+VIDEO_TYPES.join(','):'image/*'} multiple onFiles={f=>add([...f])}/>
   <Alert kind="info" icon={ShieldCheck}>{t('fe.kit.up.privacy')}{items.some(i=>i.vid)?' '+t('fe.kit.up.videoNote'):''}</Alert>
  </Sheet>
  {cur&&cur.full&&aspect!=='orig'&&<CropSheet src={cur.full} aspect={aspect} initial={cur.crop} onClose={()=>setCropping(null)}
   onApply={c=>{setCropping(null);const it={...cur,crop:c,status:'prep' as const};patch(cur.key,{crop:c,status:'prep',id:undefined});void prepare(it,aspect);}}/>}
  {asking&&<Ask title={t('fe.kit.up.closeAsk')} text={t('fe.kit.up.closeText')} ok={t('fe.kit.up.close')} danger onOk={()=>{setAsking(false);onClose();}} onCancel={()=>setAsking(false)}/>}
 </>;
}

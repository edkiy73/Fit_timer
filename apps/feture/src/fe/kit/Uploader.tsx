import {useEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Crop as CropIcon,Plus,RotateCcw,Scissors,ShieldCheck,Upload,X} from 'lucide-react';
import {Alert,Ask,Btn,FilePick,IconBtn,Progress,Seg,Sheet} from './index';
import {CropSheet} from './Crop';
import {TrimSheet} from './Trim';
import {VideoBadge} from './av';
import {ASPECTS,NO_CROP,PHOTO_MAX_BYTES,VIDEO_MAX_BYTES,VIDEO_MAX_MS,VIDEO_SOURCE_MAX_BYTES,VIDEO_SOURCE_MAX_MS,VIDEO_TYPES,clipPoster,cropPhoto,cropRect,fmtDur,isPhoto,isVideo,kb,
 preparePhoto,prepareVideo,videoEditPath,type Aspect,type Crop,type Prepared,type PreparedVideo,type VideoEdit} from './media';
import {useToast} from '../toast';

/** What a screen gets back for each file: the server's asset id and a local preview of what was sent (for a clip: the
 * poster of the made clip, its kind, its length and a local link to the made file so a preview can play it). `w` / `h`
 * are the preview's: tiles follow the chosen format. */
export type Uploaded={id:string,url:string,w:number,h:number,kind?:'image'|'video',durationMs?:number,file?:string};
/** Sends one prepared photo; reports progress 0…1; resolves with the asset id. The screen owns the API calls. */
export type SendPhoto=(blob:Blob,onProgress:(p:number)=>void)=>Promise<string>;
/** Sends one made clip with its poster frame (`useSendVideo`). */
export type SendVideo=(video:PreparedVideo,onProgress:(p:number)=>void,/** Extra intent fields for this one (a chat's view rule). */ extra?:Record<string,unknown>)=>Promise<string>;

type Trim={startMs:number,endMs:number};
type Path='webcodecs'|'recorder'|null;
type Item={key:string,file:File,status:'prep'|'ready'|'make'|'up'|'ok'|'error',crop:Crop,trim?:Trim|undefined,prep?:Prepared|undefined,vid?:PreparedVideo|undefined,
 /** The clip made for the current trim / frame (kept for a retry after a failed upload). */ made?:PreparedVideo|undefined,
 full?:string|undefined,progress:number,err?:string|undefined,id?:string|undefined,/** The original may go as picked. */ asIs?:boolean|undefined};

/** The preview box of a row: the chosen format (1:1 square, 4:5, 16:9) or, «Свой», the file's shape (as picked, or as cropped freely) — at most
 * 80 px on its long side. */
const THUMB=80;
function thumbBox(aspect:Aspect,w?:number,h?:number):CSSProperties{
 const r=aspect==='orig'?(w&&h?Math.max(.5,Math.min(2,w/h)):.8):ASPECTS[aspect][0]/ASPECTS[aspect][1];
 const [tw,th]=r>=1?[THUMB,THUMB/r]:[THUMB*r,THUMB];
 return {'--tw':Math.round(tw)+'px','--th':Math.round(th)+'px'} as CSSProperties;
}
const editOf=(it:Pick<Item,'trim'|'crop'>,aspect:Aspect):VideoEdit|undefined=>{
 const crop=aspect==='orig'&&!it.crop.rect?undefined:{aspect,...it.crop};
 return it.trim||crop?{...(it.trim?{trim:it.trim}:{}),...(crop?{crop}:{})}:undefined;
};
const fits=(v:PreparedVideo)=>v.durationMs<=VIDEO_MAX_MS+500&&v.size<=VIDEO_MAX_BYTES&&VIDEO_TYPES.includes(v.mime);
const aborted=(e:unknown)=>e instanceof DOMException&&e.name==='AbortError';

/** The uploader sheet — the one way media is picked and sent anywhere (posts, profile, gallery, chats): format (when a
 * screen allows several), each file as a row — its preview in that format, name, state, progress, ✕ «Убрать» at the
 * end of the name line and the actions on one line under the text: «Обрезать» (clips), «Кадрировать» (when the format
 * is any), «Повторить» —, «Добавить ещё», what the screen adds (`children`: a chat's view rule), a privacy
 * note, and the button (`doneLabel`, «Готово · N» by default). Photos are compressed and stripped of metadata on the
 * device as soon as they are picked and cut to the frame. Clips (with `sendVideo`) are made on the device when sent
 * (kit/video-edit.ts): only the chosen part (≤ 60 s, the first minute of a longer one by default), cut to the frame,
 * ≤ 1280 px, compressed — «Готовим видео… 42%» with «Отменить»; the poster is the made clip's first frame. Sources up
 * to 10 min and 2 GB; the server's limits (1 min, 100 MB) apply to the made clip. A device that cannot make clips sends
 * them as picked (≤ 1 min, ≤ 100 MB) without trim or crop, and says so. */
export function Uploader({files,aspects=['orig'],max,send,sendVideo,onDone,onClose,title,doneLabel,children}:{files:File[],aspects?:Aspect[],max:number,send:SendPhoto,
 sendVideo?:SendVideo|undefined,onDone:(items:Uploaded[])=>void,onClose:()=>void,title?:string,
 /** The button's text instead of «Готово · N» (a chat: «Отправить»). */ doneLabel?:string|undefined,/** Under the list (a chat's view rule). */ children?:ReactNode}){
 const {t}=useI18n();const toast=useToast();
 const [aspect,setAspect]=useState<Aspect>(aspects[0]??'orig');const [items,setItems]=useState<Item[]>([]);const [cropping,setCropping]=useState<string|null>(null);
 const [trimming,setTrimming]=useState<string|null>(null);const aspRef=useRef<Aspect>(aspects[0]??'orig');
 const [asking,setAsking]=useState(false);const [sending,setSending]=useState(false);const more=useRef<HTMLInputElement>(null);const seq=useRef(0);
 // How this device makes clips (undefined while it is being asked).
 const [path,setPath]=useState<Path|undefined>(undefined);const pathP=useRef<Promise<Path>|null>(null);
 if(sendVideo&&!pathP.current)pathP.current=videoEditPath();
 useEffect(()=>{let live=true;void pathP.current?.then(p=>{if(live)setPath(p);});return ()=>{live=false;};},[]);
 const stopper=useRef<AbortController|null>(null);
 const patch=(key:string,p:Partial<Item>)=>setItems(l=>l.map(i=>i.key===key?{...i,...p}:i));
 const prepare=async(it:Item,asp:Aspect)=>{
  if(it.vid){await poster(it,asp);return;}
  try{
   // The whole photo (upright, compressed) is kept once for the crop sheet; the frame is cut from it.
   const full=it.full??(await preparePhoto(it.file)).url;
   const prep=asp==='orig'&&!it.crop.rect?await preparePhoto(it.file):await cropPhoto(it.file,asp,it.crop);patch(it.key,{prep,full,status:'ready',err:undefined});}
  catch{patch(it.key,{status:'error',err:t('fe.kit.up.readFail')});}
 };
 // A clip's preview follows its edit: the frame at the trim start, cut to the format (the made clip's first frame).
 const poster=async(it:Item,asp:Aspect)=>{
  const vid=it.vid;if(!vid)return;
  try{
   const edit=it.asIs?undefined:editOf(it,asp);
   if(!edit){patch(it.key,{prep:{blob:vid.poster,url:vid.url,w:vid.w,h:vid.h,size:vid.size},status:'ready',err:undefined,full:it.full??vid.url});return;}
   const p=await clipPoster(it.file,edit);
   patch(it.key,{prep:{blob:p.poster,url:p.url,w:p.w,h:p.h,size:vid.size},full:p.full,status:'ready',err:undefined});
  }catch{patch(it.key,{status:'error',err:t('fe.kit.up.videoRead').replace('{name}',it.file.name)});}
 };
 const drop=(key:string,msg:string)=>{toast(msg,{type:'warn'});setItems(l=>l.filter(x=>x.key!==key));};
 const prepareClip=async(it:Item,asp:Aspect)=>{
  const can=await (pathP.current??Promise.resolve(null));
  // Made on the device: a source up to 10 min / 2 GB. Sent as picked: the server's limits.
  if(it.file.size>(can?VIDEO_SOURCE_MAX_BYTES:VIDEO_MAX_BYTES)){drop(it.key,t(can?'fe.kit.up.videoBig':'fe.kit.up.videoBigAsIs'));return;}
  try{
   const vid=await prepareVideo(it.file);
   if(vid.durationMs>(can?VIDEO_SOURCE_MAX_MS:VIDEO_MAX_MS)+500){drop(it.key,t(can?'fe.kit.up.videoLong':'fe.kit.up.videoLongAsIs'));return;}
   // A longer clip starts as its first minute; «Обрезать» moves the part.
   const trim=can&&vid.durationMs>VIDEO_MAX_MS+500?{startMs:0,endMs:VIDEO_MAX_MS}:undefined;
   const next={...it,vid,trim,asIs:!can};patch(it.key,{vid,trim,asIs:!can});await poster(next,aspRef.current??asp);
  }catch{drop(it.key,t('fe.kit.up.videoRead').replace('{name}',it.file.name));}
 };
 const add=(list:File[])=>{
  const room=max-items.length;if(room<=0)return;
  if(list.length>room)toast(t('fe.kit.up.skipped').replace('{n}',String(room)),{type:'warn'});
  const fresh:Item[]=[];const clips:Item[]=[];
  for(const f of list.slice(0,room)){
   if(sendVideo&&isVideo(f)){
    const it:Item={key:'u'+(++seq.current),file:f,status:'prep',crop:NO_CROP,progress:0};fresh.push(it);clips.push(it);continue;
   }
   if(!isPhoto(f)){toast(t(sendVideo?'fe.kit.up.notMedia':'fe.kit.up.notPhoto').replace('{name}',f.name),{type:'warn'});continue;}
   if(f.size>PHOTO_MAX_BYTES){toast(t('fe.kit.up.tooBig'),{type:'warn'});continue;}
   fresh.push({key:'u'+(++seq.current),file:f,status:'prep',crop:NO_CROP,progress:0});
  }
  setItems(l=>[...l,...fresh]);fresh.forEach(it=>void(clips.includes(it)?prepareClip(it,aspect):prepare(it,aspect)));
 };
 useEffect(()=>{add(files);},[]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>()=>stopper.current?.abort(),[]);
 // Removing the last photo closes the sheet (only after it had some — not on the first render).
 const had=useRef(false);if(items.length)had.current=true;
 useEffect(()=>{if(had.current&&items.length===0&&!sending)onClose();},[items.length]);// eslint-disable-line react-hooks/exhaustive-deps
 const loading=(i:Item)=>!i.vid&&!!sendVideo&&isVideo(i.file);
 const changeAspect=(a:Aspect)=>{setAspect(a);aspRef.current=a;
  // A clip still being read gets its poster in the new format when it is ready (prepareClip reads aspRef).
  setItems(l=>l.map(i=>({...i,crop:NO_CROP,id:undefined,made:undefined,status:i.status==='error'||loading(i)?i.status:'prep'})));
  items.forEach(i=>{if(!loading(i))void prepare({...i,crop:NO_CROP},a);});};
 /** Makes the clip for its trim / frame on the device (once; kept for retries) and reads its poster and length. */
 const make=async(it:Item,signal:AbortSignal):Promise<PreparedVideo>=>{
  if(it.made)return it.made;
  if(it.asIs)return it.vid!;
  const vid=it.vid!;const edit=editOf(it,aspect);
  patch(it.key,{status:'make',progress:0,err:undefined});
  const {makeVideo}=await import('./video-edit');
  const job={file:it.file,trim:edit?.trim,crop:edit?.crop?cropRect(vid.w,vid.h,edit.crop.aspect,edit.crop):undefined};
  const r=await makeVideo(job,{signal,onProgress:p=>patch(it.key,{progress:p})});
  const made=await prepareVideo(r.file);
  // The recorder's WebM may not know its own length: the part's length is what was recorded.
  if(!made.durationMs&&edit?.trim)made.durationMs=edit.trim.endMs-edit.trim.startMs;
  patch(it.key,{made});return made;
 };
 const sendOne=async(it:Item,signal:AbortSignal):Promise<Uploaded|'stop'|null>=>{
  if(!it.prep)return null;
  const out=(id:string,v?:PreparedVideo):Uploaded=>v?{id,url:v.url,w:v.w,h:v.h,kind:'video',durationMs:v.durationMs,file:URL.createObjectURL(v.file)}
   :{id,url:it.prep!.url,w:it.prep!.w,h:it.prep!.h};
  if(it.status==='ok'&&it.id)return out(it.id,it.vid?it.made??it.vid:undefined);
  let v:PreparedVideo|undefined;
  if(it.vid&&sendVideo){
   try{v=await make(it,signal);}
   catch(e){
    if(aborted(e)){patch(it.key,{status:'ready',progress:0});return 'stop';}
    patch(it.key,{status:'error',err:t('fe.kit.up.makeFail')});return null;
   }
   if(!fits(v)){patch(it.key,{status:'error',err:t(v.size>VIDEO_MAX_BYTES?'fe.kit.up.madeBig':'fe.kit.up.videoLongAsIs')});return null;}
  }
  patch(it.key,{status:'up',progress:0,err:undefined});
  try{const on=(p:number)=>patch(it.key,{progress:p});
   const id=v&&sendVideo?await sendVideo(v,on):await send(it.prep.blob,on);
   patch(it.key,{status:'ok',id,progress:1});return out(id,v);}
  catch(e){patch(it.key,{status:'error',err:e instanceof Error&&e.message&&e.message!=='upload'?e.message:t('fe.error.network')});return null;}
 };
 const run=async(list:Item[])=>{
  setSending(true);const ctl=new AbortController();stopper.current=ctl;const out:Uploaded[]=[];
  for(const it of list){const r=await sendOne(it,ctl.signal);if(r==='stop')break;if(r)out.push(r);}
  if(stopper.current===ctl)stopper.current=null;setSending(false);return out;
 };
 const done=async()=>{
  // Sound for a clip recorded in real time may only start from this tap (Safari).
  if(sendVideo&&path==='recorder'&&items.some(i=>i.vid&&!i.made&&!i.asIs))void import('./video-edit').then(m=>m.primeAudio());
  const out=await run(items);
  // Everything sent → back to the screen; a failure keeps the sheet open with «Повторить» on that photo.
  if(out.length===items.length){onDone(out);if(!doneLabel)toast(t('fe.kit.up.ready').replace('{n}',String(out.length)),{type:'ok'});}
 };
 const busy=sending||items.some(i=>i.status==='prep');const ready=items.filter(i=>i.status!=='error'&&i.prep).length;
 const close=()=>{if(sending){stopper.current?.abort();return;}if(items.length)setAsking(true);else onClose();};
 const lenOf=(i:Item)=>i.made?.durationMs??(i.trim?i.trim.endMs-i.trim.startMs:i.vid?.durationMs??0);
 const status=(i:Item)=>i.status==='prep'?t('fe.kit.up.prep'):i.status==='error'?i.err:i.status==='make'?t('fe.kit.up.making').replace('{n}',String(Math.round(i.progress*100)))
  :i.status==='up'?t('fe.kit.up.loading').replace('{n}',String(Math.round(i.progress*100)))
  :i.vid?(i.made?t('fe.kit.up.made').replace('{from}',kb(i.file.size)).replace('{to}',kb(i.made.size))
   :i.trim?t('fe.kit.up.videoCut').replace('{full}',fmtDur(i.vid.durationMs)):t('fe.kit.up.video')).replace('{dur}',fmtDur(lenOf(i)))
  :i.prep?(i.prep.size<i.file.size*.95?t('fe.kit.up.done').replace('{from}',kb(i.file.size)).replace('{to}',kb(i.prep.size)):t('fe.kit.up.doneSame').replace('{to}',kb(i.prep.size))):'';
 const cur=items.find(i=>i.key===cropping);const trimCur=items.find(i=>i.key===trimming);
 const redo=(it:Item,p:Partial<Item>)=>{const next={...it,...p,status:'prep' as const,id:undefined,made:undefined};patch(it.key,{...p,status:'prep',id:undefined,made:undefined});void prepare(next,aspect);};
 // A clip that cannot be made here goes as picked: no trim, no frame (its own shape in the row).
 const editable=(i:Item)=>!i.vid||!i.asIs;
 const anyClip=items.some(i=>i.vid||loading(i));
 return <>
  <Sheet title={title??t('fe.kit.up.title')} full onClose={close}
   foot={<Btn onClick={done} busy={sending} disabled={!ready||busy}>{sending?t('fe.kit.up.busy'):doneLabel??(ready?t('fe.kit.up.ready').replace('{n}',String(ready)):t('fe.kit.up.nothing'))}</Btn>}>
   {aspects.length>1&&<Seg label={t('fe.kit.up.format')} value={aspect} onChange={changeAspect} options={[...aspects].sort((a,b)=>+(b==='orig')-+(a==='orig')).map(a=>({id:a,label:a==='orig'?t('fe.kit.up.orig'):a}))}/>}
   <div className="k-uplist">{items.map(i=><div key={i.key} className={'k-uprow '+i.status}>
    <div className="k-upthumb-box"><div className="k-upthumb" style={thumbBox(editable(i)?aspect:'orig',i.prep?.w,i.prep?.h)}>{i.prep?<img src={i.prep.url} alt=""/>:<span className="sk"/>}
     {i.vid&&<VideoBadge durationMs={lenOf(i)}/>}</div></div>
    <div className="k-uptx"><div className="k-uphead"><b>{i.file.name}</b>
      {!sending&&<IconBtn icon={X} kind="ghost" size="sm" label={t('fe.kit.up.remove')} onClick={()=>setItems(l=>l.filter(x=>x.key!==i.key))}/>}</div><small>{status(i)}</small>
     {(i.status==='make'||i.status==='up'||i.status==='ok')&&<Progress value={i.status==='ok'?1:i.progress}/>}
     {i.status==='make'&&<div className="k-upacts"><Btn kind="text" size="sm" auto icon={X} onClick={()=>stopper.current?.abort()}>{t('fe.kit.up.cancel')}</Btn></div>}
     {!sending&&((i.vid&&!i.asIs)||editable(i)||i.status==='error')&&<div className="k-upacts">
      {i.vid&&!i.asIs&&i.prep&&<Btn kind="text" size="sm" auto icon={Scissors} onClick={()=>setTrimming(i.key)}>{t('fe.kit.up.trim')}</Btn>}
      {editable(i)&&i.prep&&i.full&&<Btn kind="text" size="sm" auto icon={CropIcon} onClick={()=>setCropping(i.key)}>{t('fe.kit.up.crop')}</Btn>}
      {i.status==='error'&&i.prep&&<Btn kind="text" size="sm" auto icon={RotateCcw} onClick={()=>void done()}>{t('fe.kit.up.retry')}</Btn>}
      {/* This clip could not be made here, but the original fits the server as it is. */}
      {i.status==='error'&&i.vid&&!i.made&&!i.asIs&&fits(i.vid)&&<Btn kind="text" size="sm" auto icon={Upload} onClick={()=>{const next={...i,asIs:true,trim:undefined,crop:NO_CROP};
       patch(i.key,{asIs:true,trim:undefined,crop:NO_CROP,status:'prep'});void poster(next,aspect);}}>{t('fe.kit.up.asIs')}</Btn>}
     </div>}
    </div>
   </div>)}</div>
   {items.length<max&&!sending&&<Btn kind="soft" icon={Plus} onClick={()=>more.current?.click()}>{t('fe.kit.up.more').replace('{n}',String(items.length)).replace('{max}',String(max))}</Btn>}
   <FilePick ref={more} accept={sendVideo?'image/*,'+VIDEO_TYPES.join(','):'image/*'} multiple onFiles={f=>add([...f])}/>
   {children}
   <Alert kind="info" icon={ShieldCheck}>{t('fe.kit.up.privacy')}{anyClip&&path!==undefined?' '+t(path?'fe.kit.up.videoNote':'fe.kit.up.videoNoteAsIs'):''}</Alert>
  </Sheet>
  {cur&&cur.full&&<CropSheet src={cur.full} aspect={aspect} initial={cur.crop} hint={cur.vid?t('fe.kit.crop.hintVideo'):undefined} onClose={()=>setCropping(null)}
   onApply={c=>{setCropping(null);redo(cur,{crop:c});}}/>}
  {trimCur&&trimCur.vid&&<TrimSheet file={trimCur.file} durationMs={trimCur.vid.durationMs} initial={trimCur.trim} crop={aspect!=='orig'||trimCur.crop.rect?{aspect,...trimCur.crop}:undefined}
   onClose={()=>setTrimming(null)} onApply={tr=>{setTrimming(null);redo(trimCur,{trim:tr??undefined});}}/>}
  {asking&&<Ask title={t('fe.kit.up.closeAsk')} text={t('fe.kit.up.closeText')} ok={t('fe.kit.up.close')} danger onOk={()=>{setAsking(false);onClose();}} onCancel={()=>setAsking(false)}/>}
 </>;
}

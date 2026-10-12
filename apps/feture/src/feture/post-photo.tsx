import {useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import type {AuthSession} from '@appbase/core/auth.js';
import type {PostEntry} from '../../lib/feture/posts';
import type {PhotoCommand} from '../../lib/feture/post-photos';
import {domainRequest,domainErrorMessage} from './domain-api';
import {postSchema} from './post-schema';
import {AppDialog} from './components/primitives';
const photo=z.object({mime:z.literal('image/jpeg'),image:z.string().min(4).max(699052).regex(/^[A-Za-z0-9+/]+={0,2}$/),width:z.number().int().min(1).max(1024),height:z.number().int().min(1).max(1024)}).strict();
const readSchema=z.object({ok:z.literal(true),photo:photo.nullable(),requestId:z.uuid()}).strict();
const savedSchema=z.object({ok:z.literal(true),entry:postSchema,replayed:z.boolean(),requestId:z.uuid()}).strict();
type Photo=z.infer<typeof photo>;
type State='loading'|'none'|'present'|'unavailable';
export function usePrivatePostPhoto(session:AuthSession,id:string,revision:number){
 const [result,setResult]=useState<{key:string;owner:AuthSession|null;state:State;photo:Photo|null;error:string}>({key:'',owner:null,state:'loading',photo:null,error:''});
 const key=id+':'+revision;
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{const check=()=>{if(document.visibilityState==='visible')setRefresh(n=>n+1);};window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);return()=>{window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);};},[]);
 useEffect(()=>{const controller=new AbortController();setResult({key,owner:session,state:'loading',photo:null,error:''});if(revision===0){setResult({key,owner:session,state:'none',photo:null,error:''});return()=>controller.abort();}
  void domainRequest(session,{action:'photo.read',id,revision},readSchema,controller.signal).then(r=>{if(!controller.signal.aborted)setResult({key,owner:session,state:r.photo?'present':'none',photo:r.photo,error:''});}).catch(e=>{if(!controller.signal.aborted)setResult({key,owner:session,state:'unavailable',photo:null,error:domainErrorMessage(e)});});return()=>controller.abort();
 },[session,id,revision,key,refresh]);
 return result.key===key&&result.owner===session?result:{key,state:'loading' as State,photo:null,error:''};
}
/** Local canvas output is a convenience; the server independently decodes and strips metadata. */
export async function preparePhotoFile(file:File):Promise<string>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size===0||file.size>12*1024*1024)throw new Error('Выбери JPEG, PNG или WebP размером до 12 МБ.');
 const bitmap=await createImageBitmap(file).catch(()=>{throw new Error('Не удалось прочитать снимок. Выбери другой файл.');});try{
  if(bitmap.width<1||bitmap.height<1||bitmap.width*bitmap.height>16000000)throw new Error('Этот снимок слишком большой. Выбери изображение до 16 мегапикселей.');
  const factor=Math.min(1,1024/bitmap.width,1024/bitmap.height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*factor));canvas.height=Math.max(1,Math.round(bitmap.height*factor));
  const context=canvas.getContext('2d');if(!context)throw new Error('Не удалось подготовить снимок. Выбери другой файл.');context.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Не удалось подготовить снимок.')),'image/jpeg',0.78));
  if(blob.size>1024*1024)throw new Error('Уменьши снимок и выбери его снова.');
  return await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const result=reader.result;if(typeof result!=='string'||!result.startsWith('data:image/jpeg;base64,'))reject(new Error('Не удалось подготовить снимок.'));else resolve(result.slice(result.indexOf(',')+1));};reader.onerror=()=>reject(new Error('Не удалось прочитать снимок.'));reader.readAsDataURL(blob);});
 }finally{bitmap.close();}
}
export function PostPhotoDialog({session,post,onClose,onSaved,onPendingChange}:{session:AuthSession;post:PostEntry;onClose:()=>void;onSaved:(entry:PostEntry)=>void;onPendingChange:(pending:boolean)=>void}){
 const current=usePrivatePostPhoto(session,post.id,post.revision);
 const [chosen,setChosen]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState('');
 const pending=useRef<PhotoCommand|null>(null),mounted=useRef(true),selection=useRef(0);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;selection.current++;};},[]);
 const choose=async(file:File|undefined)=>{if(!file||busy||uncertain)return;const ticket=++selection.current;setChosen('');setConsent(false);setError('');setBusy(true);onPendingChange(true);
  try{const image=await preparePhotoFile(file);if(mounted.current&&ticket===selection.current)setChosen(image);}catch(e){if(mounted.current&&ticket===selection.current)setError(e instanceof Error?e.message:'Не удалось подготовить снимок.');}finally{if(mounted.current&&ticket===selection.current){setBusy(false);onPendingChange(false);}}
 };
 const mutate=async(command:PhotoCommand)=>{if(busy)return;pending.current=command;setBusy(true);setUncertain(false);setError('');onPendingChange(true);
  try{const r=await domainRequest(session,command,savedSchema);if(!mounted.current)return;if(r.entry.id!==post.id||!r.entry.mine)throw new Error('invalid_response');pending.current=null;setChosen('');setConsent(false);onPendingChange(false);onSaved(r.entry);}
  catch(e){if(mounted.current){setError(domainErrorMessage(e));const code=(e as {code?:string}).code||'';const rejected=['auth_required','session_changed','verification_required','consent_required','resource_not_found','revision_conflict','operation_conflict','invalid_request','invalid_image','request_too_large','rate_limited','forbidden'].includes(code);if(rejected){pending.current=null;onPendingChange(false);if(['auth_required','session_changed','forbidden'].includes(code)){setChosen('');setConsent(false);}}setUncertain(!rejected);}}
  finally{if(mounted.current)setBusy(false);}
 };
 const close=()=>{if(busy||uncertain||pending.current)return;if(chosen&&!window.confirm('Закрыть выбранное фото без сохранения?'))return;onClose();};
 return <AppDialog title="Фото публикации" onClose={close}>
 <p>Фотография сохраняется отдельно от снимков на устройстве. Сейчас она доступна только тебе.</p>
 {current.state==='loading'&&<p role="status">Загружаем сохранённое фото…</p>}{current.state==='unavailable'&&<p role="alert">{current.error} Закрой окно и обнови публикацию перед выбором другого фото. Сохранённую копию можно удалить без просмотра.</p>}
 {current.photo&&<figure className="ft-private-photo"><img src={'data:image/jpeg;base64,'+current.photo.image} width={current.photo.width} height={current.photo.height} alt="Сохранённая фотография публикации"/><figcaption>Сохранённое фото. Видишь только ты.</figcaption></figure>}
 {current.state==='none'&&<p>В этой публикации ещё нет фотографии.</p>}
 <fieldset className="ft-photo-form" disabled={busy||uncertain||current.state==='loading'||current.state==='unavailable'}><label>Выбрать снимок<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];e.target.value='';void choose(file);}}/></label>
 {chosen&&<><figure className="ft-private-photo"><img src={'data:image/jpeg;base64,'+chosen} alt="Предпросмотр выбранной фотографии"/><figcaption>Этот снимок будет сохранён. Имя файла и сведения о месте съёмки не переносятся.</figcaption></figure><label className="ft-consent-choice"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> Разрешаю сохранить этот снимок в отдельном личном черновике публикации.</label><p>Замена фото вернёт публикацию в личный черновик. Копию можно удалить здесь или вместе с публикацией.</p><button disabled={!consent} onClick={()=>void mutate({action:'photo.put',id:post.id,operationId:crypto.randomUUID(),expectedRevision:post.revision,image:chosen,consent:true})}>{current.photo?'Заменить фото':'Сохранить фото'}</button><button onClick={()=>{setChosen('');setConsent(false);}}>Убрать выбранный снимок</button></>}
 </fieldset>
 {(current.photo||current.state==='unavailable')&&<button disabled={busy||uncertain} onClick={()=>{if(window.confirm('Удалить сохранённое фото? Оно исчезнет из этой публикации.'))void mutate({action:'photo.remove',id:post.id,operationId:crypto.randomUUID(),expectedRevision:post.revision});}}>{current.state==='unavailable'?'Удалить фото без просмотра':'Удалить сохранённое фото'}</button>}
 {busy&&<p role="status">Подготавливаем или сохраняем фото…</p>}{error&&<p role="alert">{error}</p>}
 {uncertain&&pending.current&&<div role="status"><p>Ответ потерян. Окно остаётся открытым; повтор отправит тот же снимок и то же действие.</p><button disabled={busy} onClick={()=>void mutate(pending.current!)}>Повторить то же действие</button></div>}
 <button disabled={busy||uncertain} onClick={close}>Закрыть</button>
 </AppDialog>;
}

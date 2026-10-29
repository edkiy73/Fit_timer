import {useCallback,useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {AtSign,Camera,ChevronDown,ChevronRight,Clock,Lock,Plus,Sparkles,Star,Trash2,X} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {AddCard,Alert,Bar,Btn,Card,Counter,Empty,Field,FilePick,Group,Input,Note,PhotoAdd,PhotoSlot,PhotoSlots,Row,Sheet,Skel,TextArea,ToggleRow,VaultHead} from './kit';
import {useFe,usePartnerApproves} from './session';
import {Uploader} from './kit/Uploader';
import {PickField,PlacePicker,type Place} from './kit/Place';
import {useSendPhoto} from './media-upload';
import {useToast} from './toast';
import {useDragOrder} from './reorder';
import {Ask,AudTag,COUPLE_ROWS,DETAIL_ROWS,MAX_PHOTOS,catalogRes,ok,photoSrc,profileRes,settingsRes,type Profile} from './me';
import {NICK,nickAnswer} from './register';
import {FIELD,shakeFirstErr,textLength,useChecks} from './kit/validate';
import {PostPhotoPicker} from './gallery';
import {ChipPick} from './kit/ChipPick';
import {AboutEditor,aboutDraft,aboutPatch,type AboutDraft} from './about-facts';

/** V21 P02 «Редактировать профиль» and P04 «Приватная часть» (`SC.P02` with `only`): one editor, opened at the block
 * that was tapped on «Я» — `media` (the photo slots), `basics` (name, nickname, age, about, city), `details` (the
 * catalog answers), `about` («Обо мне» facts, about-facts.tsx) or `priv` (the private part); without `only` the whole profile. Nothing is written until
 * «Сохранить»; a couple's widening change comes back `pending` and waits for the partner (server rule). */
type Only='media'|'basics'|'details'|'priv'|'about'|null;
type Ph={id:string,src:string|null,pending:boolean};
const intent=z.object({ok:z.literal(true),assetId:z.uuid(),upload:z.object({url:z.string(),method:z.string(),headers:z.record(z.string(),z.string())})});
const privMedia=z.object({id:z.uuid(),src:z.record(z.string(),z.string()).nullable().optional(),pending:z.boolean().optional()}).passthrough();
const privRes=z.object({ok:z.literal(true),on:z.boolean().optional(),text:z.string().nullable().optional(),media:z.array(privMedia).optional(),counts:z.object({grants:z.number()}).passthrough().optional()}).passthrough();
const interestsRes=z.object({ok:z.literal(true),items:z.array(z.object({vis:z.string().nullable().optional()}).passthrough())});
const MIME=['image/jpeg','image/png','image/webp'];
const PRIV_MAX=18;
const MULTI_MAX:Record<string,number>={genders:5,orients:5,roles:5,formats:5,seeks:9};

type Draft={name:string,handle:string,bio:string,cityId:string|null,showAge:boolean,details:Record<string,string[]|string|null>,photos:Ph[],privOn:boolean,privText:string,privMedia:Ph[]};
const toPh=(m:{id:string,src?:Record<string,string>|null|undefined,pending?:boolean|undefined})=>({id:m.id,src:m.src?photoSrc({src:m.src}):null,pending:!!m.pending});

export function MeEditScreen(){
 const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const toast=useToast();
 const [params]=useSearchParams();const o=params.get('only');const only:Only=o==='media'||o==='basics'||o==='details'||o==='priv'||o==='about'?o:null;
 const [p,setP]=useState<Profile|null>(null);const [base,setBase]=useState<Draft|null>(null);const [d,setD]=useState<Draft|null>(null);
 const [cat,setCat]=useState<z.infer<typeof catalogRes>|null>(null);const [jars,setJars]=useState({all:0,granted:0});const [grants,setGrants]=useState(0);
 const [error,setError]=useState<unknown>(null);const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const [whoOpen,setWhoOpen]=useState<boolean|null>(null);const [city,setCity]=useState(false);const [phSheet,setPhSheet]=useState<{k:'photos'|'privMedia',i:number}|null>(null);
 const [askOff,setAskOff]=useState(false);const [nickErr,setNickErr]=useState('');const [askLast,setAskLast]=useState<number|null>(null);const [discoverOn,setDiscoverOn]=useState(false);const [added,setAdded]=useState<Place|null>(null);const [uploading,setUploading]=useState<'photos'|'privMedia'|null>(null);
 // «Обо мне» (person only) keeps its own draft next to the rest; «Сохранить» writes it with the profile.
 const [ab,setAb]=useState<{base:AboutDraft,d:AboutDraft}|null>(null);
 const file=useRef<HTMLInputElement>(null);const fileKind=useRef<'photos'|'privMedia'>('photos');const fid=useId();
 // Press and drag to change the order in the draft; «Сохранить» writes it.
 const drag=useDragOrder<'photos'|'privMedia'>((k,ids)=>setD(x=>{if(!x)return x;const by=new Map(x[k].map(p=>[p.id,p]));const next=ids.map(i=>by.get(i)).filter((p):p is Ph=>!!p);return next.length===x[k].length?{...x,[k]:next}:x;}));
 const cp=acting?.kind==='couple';const toPartner=usePartnerApproves();
 const load=useCallback(()=>{
  if(!acting)return;setError(null);
  Promise.all([call('profile.get',{profileId:acting.id},profileRes),call('private.get',{profileId:acting.id},privRes),call('catalog.get',{},catalogRes,{asAccount:true}),
   call('interests.list',{profileId:acting.id},interestsRes).catch(()=>({ok:true as const,items:[]}))])
   .then(r=>{call('profile.settings',{},settingsRes).then(x=>setDiscoverOn(x.settings.discoverMode==='visible')).catch(()=>{});return r;})
   .then(([a,b,c,e])=>{
    const pr=a.profile;const det:Draft['details']={};
    for(const [f] of DETAIL_ROWS){const v=pr.details[f];det[f]=f==='status'?(typeof v==='string'?v:null):Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'):[];}
    const draft:Draft={name:pr.name??'',handle:pr.handle??'',bio:pr.bio,cityId:typeof pr.cityId==='string'?pr.cityId:pr.city?.id??null, // profile.get sends the city as {id, ru, en, pending}
     showAge:pr.showAge!==false,details:det,
     photos:pr.photos.map(toPh),privOn:b.on!==false,privText:b.text??'',privMedia:(b.media??[]).map(toPh)};
    if(pr.kind==='person'){const x=aboutDraft(pr);setAb({base:x,d:structuredClone(x)});}
    setP(pr);setBase(draft);setD(structuredClone(draft));setCat(c);setGrants(b.counts?.grants??0);
    setJars({all:e.items.length,granted:e.items.filter(j=>j.vis==='granted').length});
   }).catch(setError);
 },[call,acting]);
 useEffect(()=>{load();},[load]);
 const label=(kind:string,code:string)=>{const x=cat?.options.find(y=>y.kind===kind&&y.code===code);return x?(locale==='en'?x.en:x.ru):code;};
 const aboutDirty=!!ab&&Object.keys(aboutPatch(ab.base,ab.d)).length>0;
 const dirty=!!d&&!!base&&(JSON.stringify(d)!==JSON.stringify(base)||aboutDirty);
 const set=(patch:Partial<Draft>)=>setD(v=>v?{...v,...patch}:v);
 const show=(k:Exclude<Only,null>)=>!only||only===k;
 // Kit validation layer: the fields on screen, by the server's rules (contracts/_text.mjs).
 const checks=useChecks({...(show('basics')?{name:'profileName' as const,bio:'bio' as const}:{}),...(show('priv')&&!cp&&d?.privOn?{privText:'privateText' as const}:{})},
  {name:d?.name??'',bio:d?.bio??'',privText:d?.privText??''});
 // Opened by a link (no app history behind it), back and «Сохранить» return to «Я» instead of leaving the app.
 const home='/n/me'+(only==='priv'?'?layer=priv':'');const canBack=((history.state as {idx?:number}|null)?.idx??0)>0;
 const leave=()=>canBack?navigate(-1):navigate(home,{replace:true});
 const fields=DETAIL_ROWS.filter(([f])=>!cp||COUPLE_ROWS.includes(f));
 const title=only==='media'?t('fe.me.photos'):only==='basics'?t('fe.me.basics'):only==='details'?(cp?t('fe.mx.detailsCouple'):t('fe.me.details')):only==='priv'?t('fe.priv.title'):only==='about'?t('fe.ab.title'):(cp?t('fe.me.coupleProfile'):t('fe.mx.ed.myProfile'));

 // Profile photos are 4:5 (the profile's frame); private ones may keep their shape. Kit uploader: crop, compress, no metadata.
 const [picked,setPicked]=useState<{k:'photos'|'privMedia',files:File[]}|null>(null);
 const sendAvatar=useSendPhoto('avatar');const sendPrivate=useSendPhoto('private');
 const upload=(files:File[],k:'photos'|'privMedia')=>{setFailure('');setPicked({k,files});};
 const pick=(k:'photos'|'privMedia')=>{fileKind.current=k;file.current?.click();};

 const save=async()=>{
  if(!d||!base||!p||busy)return;
  if(!checks.submit())return;
  // V21 P02: the nickname is checked in place — format first, then whether it is free (the server decides at save too).
  const h=d.handle.trim();
  if(!cp&&h!==base.handle){
   if(!NICK.test(h)||/\.\./.test(h)||!/[A-Za-z]/.test(h)){setNickErr(t('fe.reg.nick.format'));setTimeout(shakeFirstErr);return;}
   const r=await call('nick.check',{handle:h},nickAnswer,{asAccount:true}).catch(()=>null);
   if(r&&!r.available){setNickErr(t('fe.reg.nick.'+(r.reason==='reserved'?'reserved':'taken')));setTimeout(shakeFirstErr);return;}
  }
  setBusy(true);setFailure('');
  try{
   let pending=false;
   const upd:Record<string,unknown>={};
   if(d.name.trim()!==base.name)upd.name=d.name.trim();
   if(!cp&&d.handle.trim()!==base.handle)upd.handle=d.handle.trim();
   if(d.bio.trim()!==base.bio)upd.bio=d.bio.trim();
   if(d.cityId!==base.cityId)upd.cityId=d.cityId;
   if(!cp&&d.showAge!==base.showAge)upd.showAge=d.showAge;
   for(const [f] of fields)if(JSON.stringify(d.details[f])!==JSON.stringify(base.details[f]))upd[f]=d.details[f];
   if(ab&&!cp)Object.assign(upd,aboutPatch(ab.base,ab.d));
   if(Object.keys(upd).length){const r=await call('profile.update',{opId:newOpId(),rev:p.rev,...upd},ok);pending||=!!r.pending;}
   if(JSON.stringify(d.photos.map(x=>x.id))!==JSON.stringify(base.photos.map(x=>x.id))){const r=await call('profile.photosSet',{opId:newOpId(),assetIds:d.photos.map(x=>x.id)},ok);pending||=!!r.pending;}
   if(d.privOn!==base.privOn&&!d.privOn)await call('private.setOn',{opId:newOpId(),on:false,confirm:true},ok);
   if(d.privOn!==base.privOn&&d.privOn){const r=await call('private.setOn',{opId:newOpId(),on:true},ok);pending||=!!r.pending;}
   if(!cp&&d.privOn&&d.privText.trim()!==base.privText)await call('private.setText',{opId:newOpId(),text:d.privText.trim()},ok);
   if(!cp&&d.privOn&&JSON.stringify(d.privMedia.map(x=>x.id))!==JSON.stringify(base.privMedia.map(x=>x.id)))await call('private.setMedia',{opId:newOpId(),assetIds:d.privMedia.map(x=>x.id)},ok);
   toast(pending?t('fe.me.pending'):only==='media'?t('fe.mx.ed.photosSaved'):t(cp?'fe.me.savedUs':'fe.me.saved'),{type:'ok'});
   leave();
  }catch(e){if(e instanceof FeError&&e.fields?.includes('handle')){setNickErr(t('fe.reg.nick.taken'));setTimeout(shakeFirstErr);}else if(!checks.fromServer(e,{text:'privText'}))setFailure(feErrorMessage(e,t));}finally{setBusy(false);}
 };

 if(!acting)return null;
 const aud=only==='priv'?<AudTag k="granted"/>:only&&only!=='about'?<AudTag k={only==='details'?(p?.detailsVis??'all'):'all'}/>:null;
 const slots=(k:'photos'|'privMedia',base:Ph[],max:number)=>{
  const list=drag.arrange(k,base);const ids=base.map(x=>x.id);
  const cells:ReactNode[]=list.map((ph,i)=><PhotoSlot key={ph.id} id={ph.id} big={k==='photos'&&i===0} dragging={drag.preview?.drag===ph.id} src={ph.src}
   main={k==='photos'&&i===0?t('fe.me.mainPhoto'):undefined} review={ph.pending?t('fe.mx.ph.review'):undefined} onPointerDown={e=>drag.down(e,k,ids,ph.id)}
   openLabel={t('fe.mx.ph.nOf',{n:i+1,total:list.length})} onOpen={()=>setPhSheet({k,i})}/>);
  const n=k==='photos'?(list.length===1?2:Math.min(max,Math.max(list.length+1,3))):list.length+(list.length<max?1:0);
  for(let i=list.length;i<n;i++)cells.push(i===list.length
   ?<PhotoAdd key="add" big={k==='photos'&&i===0} tall={k==='photos'&&list.length===1} disabled={!!uploading} busy={uploading===k} onClick={()=>pick(k)} label={t('fe.mx.ph.addAria')}
    hint={k==='photos'&&i===0?(cp?t('fe.mx.ph.couplePhoto'):t('fe.mx.ph.mainSlot')):k==='photos'&&list.length===1?t('fe.me.morePhotos'):undefined}/>
   :<PhotoAdd key={'g'+i} ghost/>);
  return <PhotoSlots priv={k!=='photos'}>{cells}</PhotoSlots>;
 };
 const sheetList=phSheet&&d?d[phSheet.k]:[];const sheetPh=phSheet?sheetList[phSheet.i]:undefined;
 // V21 phRemove: the last profile photo of a profile shown in Discover — it would drop out of Discover; ask first.
 const remove=(k:'photos'|'privMedia',i:number)=>{if(d&&k==='photos'&&d.photos.length===1&&discoverOn){setPhSheet(null);setAskLast(i);return;}move(k,i,'remove');};
 const move=(k:'photos'|'privMedia',i:number,to:'main'|'remove')=>{if(!d)return;const list=[...d[k]];const [x]=list.splice(i,1);if(to==='main'&&x)list.unshift(x);set({[k]:list} as Partial<Draft>);setPhSheet(null);};
 // A city the person added is pending (not in the catalog yet): its name comes from the profile or the picker.
 const placeName=(id:string|null)=>{const x=id?cat?.places?.find(y=>y.id===id)??(added?.id===id?added:null):null;
  if(x)return (locale==='en'?x.en:x.ru)??null;return id&&id===base?.cityId&&p?.city?(locale==='en'?p.city.en:p.city.ru):null;};
 const addPlace=async(country:string,name:string):Promise<Place>=>{
  const r=await call('place.submit',{opId:newOpId(),country,name},z.object({placeId:z.string()}),{asAccount:true});
  const x={id:r.placeId,country,ru:name,en:name,pending:true};setAdded(x);toast(t('fe.kit.place.added',{name}),{type:'ok'});return x;};
 // The same picker as sign-up (kit ChipPick): five chips and «Все · N» for a long list, not a wall of every option.
 const chips=(f:string,kind:string)=>{if(!d)return null;const v=d.details[f];const multi=f!=='status';const sel=multi?(Array.isArray(v)?v as string[]:[]):(typeof v==='string'?[v]:[]);
  const opts=cat?.options.filter(x=>x.kind===kind)??[];
  const toggle=(code:string)=>{const on=sel.includes(code);
   if(!multi){set({details:{...d.details,[f]:on?null:code}});return;}
   if(!on&&sel.length>=(MULTI_MAX[f]??5)){toast(t('fe.mx.ed.max5'),{type:'info'});return;}
   set({details:{...d.details,[f]:on?sel.filter(c=>c!==code):[...sel,code]}});};
  return <ChipPick label={t(kind==='status'?'fe.mx.f.status':'fe.reg.kind.'+kind)} options={opts.map(x=>({code:x.code,label:locale==='en'?x.en:x.ru,search:x.ru+' '+x.en}))}
   value={sel} onToggle={toggle} onClear={()=>set({details:{...d.details,[f]:multi?[]:null}})} max={multi?(MULTI_MAX[f]??5):0}/>;};
 const anyDetails=!!d&&fields.some(([f])=>{const v=d.details[f];return Array.isArray(v)?v.length>0:!!v;});
 const who=only==='details'||(whoOpen??!anyDetails);
 return <>
  <Bar title={title} back={canBack||home}>{aud}</Bar>
  <div className="view nodock cta1"><div className="wrap">
   {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!d||!p?<Skel kind="card" rows={3}/>
    :<>
     {show('media')&&<Group className="ph20" id="peMedia" title={only?undefined:t('fe.me.photos')} action={only?undefined:<AudTag k="all"/>} foot={t('fe.mx.ed.photoHint')}>
      {slots('photos',d.photos,MAX_PHOTOS)}</Group>}
     {show('media')&&<PostPhotoPicker profileId={acting.id} chosen={d.photos.map(x=>x.id)} onToggle={m=>{
      // V21 phToggle: a photo of an own post goes on the profile or comes off it (up to six); «Сохранить» writes it.
      if(d.photos.some(x=>x.id===m.id)){set({photos:d.photos.filter(x=>x.id!==m.id)});return;}
      if(d.photos.length>=MAX_PHOTOS){toast(t('fe.gal.profileMax'),{type:'warn'});return;}
      set({photos:[...d.photos,{id:m.id,src:m.src,pending:false}]});}}/>}
     {(show('basics')||show('details'))&&<Group><Card form className="pe-form">
      {show('basics')&&<>
       <Field id={fid+'n'} name="name" label={cp?t('fe.mx.ed.coupleName'):t('fe.me.name')} error={checks.error('name')}><Input id={fid+'n'} value={d.name} {...checks.input('name')} onChange={e=>set({name:e.target.value})}/>{checks.counter('name')}</Field>
       {!cp&&<Field id={fid+'h'} name="handle" label={t('fe.mx.ed.nick')} error={nickErr||undefined}><div className="inwrap"><AtSign/><Input id={fid+'h'} value={d.handle} maxLength={20} autoCapitalize="off" spellCheck={false} invalid={!!nickErr} onChange={e=>{set({handle:e.target.value.replace(/^@/,'')});setNickErr('');}}/></div></Field>}
       {!cp&&<ToggleRow title={t('fe.mx.ed.showAge')} on={d.showAge} onClick={()=>set({showAge:!d.showAge})}/>}
       <Field id={fid+'b'} name="bio" label={t('fe.mx.ed.about')} error={checks.error('bio')}><TextArea id={fid+'b'} rows={4} {...checks.input('bio')} value={d.bio} placeholder={t('fe.mx.ed.aboutPh')} onChange={e=>set({bio:e.target.value})}/><Counter n={textLength(d.bio)} max={FIELD.bio.max}/></Field>
       <PickField label={t('fe.mx.ed.city')} value={placeName(d.cityId)} placeholder={t('fe.mx.ed.noCity')} onClick={()=>setCity(true)}/>
      </>}
      {show('details')&&<div className="pe-who" id="peWho">
       {only!=='details'&&<Row expanded={who} onClick={()=>setWhoOpen(!who)} title={cp?t('fe.mx.detailsCouple'):t('fe.mx.ed.yourDetails')}
        sub={!who&&!anyDetails?t('fe.mx.ed.nothing'):undefined}
        extra={!who&&anyDetails?<span className="pe-sums">{fields.map(([f,kind])=>{const v=d.details[f];const codes=Array.isArray(v)?v:v?[v]:[];return codes.length?<span key={f} className="pe-sum"><b>{t(kind==='status'?'fe.mx.f.status':'fe.reg.kind.'+kind)}</b> {codes.map(c=>label(kind,c)).join(', ')}</span>:null;})}</span>:undefined}/>}
       {who&&fields.map(([f,kind])=><div key={f} className="field"><span className="flabel">{t(kind==='status'?'fe.mx.f.status':'fe.reg.kind.'+kind)}</span>{chips(f,kind)}</div>)}
      </div>}
     </Card></Group>}
     {show('about')&&!cp&&ab&&<AboutEditor d={ab.d} titled={!only} onChange={x=>setAb(v=>v&&{...v,d:x})}/>}
     {!only&&<Group id="peJars" title={cp?t('fe.int.titleCouple'):t('fe.int.title')}><Card list>
      <Row icon={Sparkles} title={t('fe.int.all')} sub={t('fe.mx.ed.jarsSub')} val={jars.all} onClick={()=>navigate('/n/me/interests')}/>
     </Card></Group>}
     {show('priv')&&<section className={'vault'+(d.privOn?'':' off')} id="privEdit">
      <VaultHead title={t('fe.priv.title')} label={t('fe.priv.title')} on={d.privOn} onToggle={()=>d.privOn&&base?.privOn?setAskOff(true):set({privOn:!d.privOn})}/>
      {d.privOn&&<div className="vault-b">
       {!cp&&<Group title={t('fe.mx.ed.privText')}><Card form>
        <Field name="privText" error={checks.error('privText')}><TextArea rows={5} {...checks.input('privText')} value={d.privText} placeholder={t('fe.mx.ed.privPh')} aria-label={t('fe.mx.ed.privText')} onChange={e=>set({privText:e.target.value})}/><Counter n={textLength(d.privText)} max={FIELD.privateText.max}/></Field>
       </Card></Group>}
       <Group title={<>{t('fe.mx.ed.privJars')}{jars.granted?' · '+jars.granted:''}</>} foot={t('fe.mx.ed.privJarsFoot')}
        action={jars.granted>0&&<button type="button" onClick={()=>navigate('/n/me/interests?add=1&vis=granted')}><Plus/>{t('fe.mx.ed.add')}</button>}>
        {jars.granted===0&&<AddCard icon={Sparkles} title={t('fe.int.add')} sub={t(cp?'fe.mp.jarsAddSubUs':'fe.mp.jarsAddSub')} onClick={()=>navigate('/n/me/interests?add=1&vis=granted')}/>}</Group>
       {!cp&&<Group title={t('fe.mx.ed.privMedia')} action={<Note as="span">{d.privMedia.length}/{PRIV_MAX}</Note>}>
        {d.privMedia.length?slots('privMedia',d.privMedia,PRIV_MAX):<AddCard icon={Camera} title={t('fe.mp.mediaAdd')} sub={t('fe.mp.mediaAddSub')} disabled={!!uploading} busy={uploading==='privMedia'} onClick={()=>pick('privMedia')}/>}</Group>}
      </div>}
     </section>}
     {failure&&<Alert kind="err" noIcon>{failure}</Alert>}
    </>}
  </div></div>
  {d&&<div className="ctabar"><div className="wrap"><Btn onClick={save} disabled={!dirty||busy} busy={busy}>{toPartner?t('fe.me.saveToPartner'):t('fe.me.save')}</Btn></div></div>}
  <FilePick ref={file} accept="image/*" multiple onFiles={f=>upload([...f],fileKind.current)}/>
  {picked&&d&&<Uploader files={picked.files} aspects={picked.k==='photos'?['4:5']:['orig','4:5','1:1']} max={(picked.k==='photos'?MAX_PHOTOS:PRIV_MAX)-d[picked.k].length}
   send={picked.k==='photos'?sendAvatar:sendPrivate} onClose={()=>setPicked(null)}
   onDone={got=>{const k=picked.k;setPicked(null);setD(v=>v?{...v,[k]:[...v[k],...got.map(g=>({id:g.id,src:g.url,pending:true}))]}:v);}}/>}
  {city&&d&&<PlacePicker places={cat?.places??[]} current={d.cityId} clear={t('fe.mx.ed.noCity')} add={addPlace}
   onPick={x=>{set({cityId:x?.id??null});setCity(false);}} onClose={()=>setCity(false)}/>}
  {phSheet&&sheetPh&&<Sheet title={phSheet.k==='photos'&&phSheet.i===0?t('fe.mx.ph.main'):t('fe.mx.ph.nOf',{n:phSheet.i+1,total:sheetList.length})} onClose={()=>setPhSheet(null)}>
   <div className="ph-sheet-prev">{sheetPh.src&&<img src={sheetPh.src} alt="" draggable={false}/>}</div>
   <Card list>
    {phSheet.k==='photos'&&phSheet.i>0&&<Row icon={Star} title={t('fe.mx.ph.makeMain')} sub={t('fe.mx.ph.makeMainSub')} noChev onClick={()=>move(phSheet.k,phSheet.i,'main')}/>}
    <Row icon={Trash2} title={t('fe.mx.ph.remove')} sub={t('fe.mx.ed.onSave')} danger onClick={()=>remove(phSheet.k,phSheet.i)}/>
   </Card>
  </Sheet>}
  {askLast!==null&&<Ask icon={Trash2} danger title={t('fe.mx.ph.lastTitle')} text={t('fe.mx.ph.lastText')} ok={t('fe.mx.ph.remove')}
   onOk={()=>{move('photos',askLast,'remove');setAskLast(null);}} onCancel={()=>setAskLast(null)}/>}
  {askOff&&<Ask icon={Lock} danger title={t('fe.mx.pr.offTitle')} text={[grants?t('fe.mx.pr.offWhat',{g:grants,q:0}):t('fe.mx.pr.offAll'),t('fe.mx.pr.offRest'),t('fe.mx.ed.onSave')].join(' ')} ok={t('fe.mx.pr.offOk')}
   onCancel={()=>setAskOff(false)} onOk={()=>{set({privOn:false});setAskOff(false);}}/>}
 </>;
}

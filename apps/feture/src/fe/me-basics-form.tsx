import {Fragment,useEffect,useId,useState} from 'react';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {AtSign,Cake} from 'lucide-react';
import {FeError,dayMonth,feErrorMessage,newOpId} from '../feture/fe-api';
import {Alert,Btn,Card,Counter,Field,Group,Input,Note,RadioList,Sheet,TextArea} from './kit';
import {PickField,PlacePicker,type Place} from './kit/Place';
import {FIELD,textLength} from './kit/validate';
import {useFe} from './session';
import {useToast} from './toast';
import {NICK,nickAnswer} from './register';
import {RichText} from './post-parts';
import type {Profile} from './me';

/** «Мой профиль» → «Основное» (owner 04.11.2026): name, nick, city, age and «О себе» shown like «Данные», «Изменить» in the
 * header opens them as a form in a sheet (age shown or hidden, picked like the city). The server keeps its rules (name
 * and nick limits, a couple's change waiting for the partner). */
const done=z.object({ok:z.literal(true)}).passthrough();
type Draft={name:string,handle:string,cityId:string|null,showAge:boolean,bio:string};
const draftOf=(p:Profile):Draft=>({name:p.chosenName??'',handle:p.handle??'',cityId:typeof p.cityId==='string'?p.cityId:p.city?.id??null,showAge:p.showAge!==false,bio:p.bio});

export function BasicsForm({p,places,onSaved}:{p:Profile,places:Place[],onSaved:()=>void}){
 const {t,locale}=useI18n();const cp=p.kind==='couple';const [open,setOpen]=useState(false);
 const city=p.city?(locale==='en'?p.city.en:p.city.ru):null;
 const rows:[string,string][]=[
  [cp?t('fe.nn.nameUs'):t('fe.nn.name'),p.name||p.handle||'—'],
  [cp?t('fe.nn.nickUs'):t('fe.nn.nick'),p.handle?'@'+p.handle:'—'],
  [t('fe.mx.ed.city'),city||'—'],
  ...(!cp&&p.age?[[t('fe.mb.age'),p.showAge!==false?String(p.age):t('fe.mb.ageHidden',{n:String(p.age)})] as [string,string]]:[]),
 ];
 return <Group id="meBasics" title={t('fe.me.basics')} action={<button type="button" onClick={()=>setOpen(true)}>{t('fe.mx.edit')}</button>}>
  {/* «О себе» last, under its label at full width, with its line breaks, lists and emphasis as on the profile. */}
  <Card><dl className="kv side">{rows.map(([k,v])=><Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
   <dt className="wide">{t('fe.mx.ed.about')}</dt><dd className="wide">{p.bio?<RichText text={p.bio} className="bio"/>:<Note as="span">{t('fe.mb.noBio')}</Note>}</dd></dl></Card>
  {open&&<BasicsSheet p={p} places={places} onClose={()=>setOpen(false)} onSaved={()=>{setOpen(false);onSaved();}}/>}
 </Group>;
}

/** The «Основное» form in a sheet; `bioOnly` — just «О себе» with the cursor in it (the «Добавить описание» step on «Я»). */
export function BasicsSheet({p,places,onClose,onSaved,bioOnly}:{p:Profile,places:Place[],onClose:()=>void,onSaved:()=>void,bioOnly?:boolean}){
 const {call}=useFe();const {t,locale}=useI18n();const toast=useToast();const id=useId();const cp=p.kind==='couple';
 const [base,setBase]=useState(()=>draftOf(p));const [d,setD]=useState(base);
 useEffect(()=>{const b=draftOf(p);setBase(b);setD(b);},[p]);
 const [city,setCity]=useState(false);const [age,setAge]=useState(false);const [added,setAdded]=useState<Place|null>(null);
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const [nickErr,setNickErr]=useState('');
 const set=(x:Partial<Draft>)=>setD(v=>({...v,...x}));
 const dirty=JSON.stringify(d)!==JSON.stringify(base);
 const placeName=(cid:string|null)=>{if(!cid)return null;const x=places.find(y=>y.id===cid)??(added?.id===cid?added:null);
  if(x)return (locale==='en'?x.en:x.ru)??null;return cid===base.cityId&&p.city?(locale==='en'?p.city.en:p.city.ru):null;};
 const addPlace=async(country:string,name:string):Promise<Place>=>{
  const r=await call('place.submit',{opId:newOpId(),country,name},z.object({placeId:z.string()}),{asAccount:true});
  const x={id:r.placeId,country,ru:name,en:name,pending:true};setAdded(x);toast(t('fe.kit.place.added',{name}),{type:'ok'});return x;};
 const save=async()=>{
  if(!dirty||busy)return;setFailure('');
  const h=d.handle.trim();
  if(h!==base.handle){
   if(!NICK.test(h)||/\.\./.test(h)||!/[A-Za-z]/.test(h)){setNickErr(t('fe.reg.nick.format'));return;}
   const r=await call('nick.check',{handle:h},nickAnswer,{asAccount:true}).catch(()=>null);
   if(r&&!r.available){setNickErr(t('fe.reg.nick.'+(r.reason==='reserved'?'reserved':'taken')));return;}
  }
  const upd:Record<string,unknown>={};
  if(d.name.trim()!==base.name)upd.name=d.name.trim();
  if(h!==base.handle)upd.handle=h;
  if(d.cityId!==base.cityId)upd.cityId=d.cityId;
  if(!cp&&d.showAge!==base.showAge)upd.showAge=d.showAge;
  if(d.bio.trim()!==base.bio)upd.bio=d.bio.trim();
  setBusy(true);
  try{const r=await call('profile.update',{opId:newOpId(),rev:p.rev,...upd},done);
   toast(r.pending?t('fe.me.pending'):t(cp?'fe.me.savedUs':'fe.me.saved'),{type:'ok'});onSaved();}
  catch(e){if(e instanceof FeError&&e.fields?.includes('handle'))setNickErr(t('fe.reg.nick.taken'));else setFailure(feErrorMessage(e,t));}
  finally{setBusy(false);}
 };
 return <Sheet title={bioOnly?t('fe.mx.ed.about'):t('fe.me.basics')} onClose={onClose} dirty={dirty&&!busy}
  foot={<Btn onClick={()=>void save()} disabled={!dirty||busy} busy={busy}>{t('fe.me.save')}</Btn>}>
  <Card form className="pe-form">
   {!bioOnly&&<>
   <Field id={id+'n'} name="name" label={cp?t('fe.nn.nameUs'):t('fe.nn.name')} optional={t('fe.reg.optional')}
    hint={p.nameAt?t('fe.nn.nameAt',{date:dayMonth(p.nameAt)}):cp?t('fe.nn.nameHintUs'):t('fe.nn.nameHint')}>
    <Input id={id+'n'} value={d.name} maxLength={FIELD.profileName.max} disabled={!!p.nameAt} placeholder={cp?'':base.handle} onChange={e=>set({name:e.target.value})}/></Field>
   <Field id={id+'h'} name="handle" label={cp?t('fe.nn.nickUs'):t('fe.nn.nick')} error={nickErr||undefined}
    hint={p.nickAt?t('fe.nn.nickAt',{date:dayMonth(p.nickAt)}):p.nickFirst?t('fe.nn.nickFirst'):t('fe.nn.nickEvery')}>
    <div className="inwrap"><AtSign/><Input id={id+'h'} value={d.handle} maxLength={20} autoCapitalize="off" spellCheck={false} disabled={!!p.nickAt} invalid={!!nickErr}
     onChange={e=>{set({handle:e.target.value.replace(/^@/,'')});setNickErr('');}}/></div></Field>
   <PickField label={t('fe.mx.ed.city')} value={placeName(d.cityId)} placeholder={t('fe.mx.ed.noCity')} onClick={()=>setCity(true)}/>
   {!cp&&p.age&&<PickField label={t('fe.mb.age')} icon={Cake} value={d.showAge?t('fe.mb.ageShow',{n:String(p.age)}):t('fe.mb.ageHide')} placeholder="" onClick={()=>setAge(true)}/>}
   </>}
   <Field id={id+'b'} name="bio" label={bioOnly?undefined:t('fe.mx.ed.about')}>
    <TextArea id={id+'b'} rows={bioOnly?6:4} autoFocus={bioOnly} aria-label={bioOnly?t('fe.mx.ed.about'):undefined} value={d.bio} maxLength={FIELD.bio.max} placeholder={t('fe.mx.ed.aboutPh')} onChange={e=>set({bio:e.target.value})}/><Counter n={textLength(d.bio)} max={FIELD.bio.max}/></Field>
   {failure&&<Alert kind="err" noIcon>{failure}</Alert>}
  </Card>
  {city&&<PlacePicker places={places} current={d.cityId} clear={t('fe.mx.ed.noCity')} add={addPlace} onPick={x=>{set({cityId:x?.id??null});setCity(false);}} onClose={()=>setCity(false)}/>}
  {age&&<Sheet title={t('fe.mb.age')} onClose={()=>setAge(false)}>
   <RadioList label={t('fe.mb.age')} value={d.showAge?'show':'hide'} onChange={v=>{set({showAge:v==='show'});setAge(false);}}
    options={[['show',t('fe.mb.ageShow',{n:String(p.age)})],['hide',t('fe.mb.ageHide')]] as const}/>
  </Sheet>}
 </Sheet>;
}

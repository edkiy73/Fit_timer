import {useEffect,useMemo,useRef,useState} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {AtSign,CircleAlert,CircleCheck,Check,Search,ShieldCheck,X} from 'lucide-react';
import {Btn,Empty,Layer,Skel} from './ui';
import {useFe} from './session';
import {useToast} from './toast';
import {AuthBar,AuthFrame,AuthLogo} from './start';
import {TermsSheet,loadDocuments} from './terms-sheet';

/** V21 A04 (nickname, date of birth, consent) → A04X (under 18) → A05 «Расскажи о себе» (Discover on by default —
 * owner decision 27.10.2026; who sees the answers: «Все» by default — owner decision 27.10.2026). Each screen has the
 * prototype's frame: `header.bar` + `.view.nodock` + `div.ctabar` pinned to the bottom. Server rules decide; the
 * form only explains them early. */
const NICK=/^[A-Za-z0-9](?:[A-Za-z0-9_.]{1,18})[A-Za-z0-9]$/;
const created=z.object({ok:z.boolean(),profileId:z.uuid().optional(),rule:z.string().optional()});
const nickAnswer=z.object({ok:z.literal(true),available:z.boolean(),reason:z.string().optional()});
const option=z.object({kind:z.string(),code:z.string(),ru:z.string(),en:z.string()});
const catalog=z.object({ok:z.literal(true),options:z.array(option)});
const onboarded=z.object({ok:z.literal(true),discoverVisible:z.boolean(),photoNeeded:z.boolean()});

type Form={nick:string,dd:string,mm:string,yy:string,terms:boolean,news:boolean,u18retry:boolean};
type Step={id:'A04'}|{id:'A04X'}|{id:'A05',profileId:string};

export function Register(){
 const {state}=useFe();
 // An account made earlier but not finished (the page was closed on A05) continues at A05.
 const made=state.status==='ready'?state.boot.profiles.find(p=>p.kind==='person'&&p.state!=='deleted'):undefined;
 const [step,setStep]=useState<Step>(made?{id:'A05',profileId:made.id}:{id:'A04'});
 const [form,setForm]=useState<Form>({nick:'',dd:'',mm:'',yy:'',terms:false,news:false,u18retry:false});
 const {logout}=useOptionalAuth();
 // «На главную» and «‹» on the first form leave the sign-up: the session ends and the start screen (A01) opens.
 const leave=()=>{void logout();};
 return <AuthFrame screen={step.id}>
  {step.id==='A04X'?<Under18 onBack={()=>setStep({id:'A04'})} onFix={()=>{setForm(f=>({...f,dd:'',mm:'',yy:'',u18retry:true}));setStep({id:'A04'});}} onHome={leave}/>
   :step.id==='A05'?<AboutYou profileId={step.profileId}/>
   :<Account form={form} setForm={setForm} onBack={leave} onCreated={profileId=>setStep({id:'A05',profileId})} onUnder18={()=>setStep({id:'A04X'})}/>}
 </AuthFrame>;
}

function Steps({at}:{at:number}){
 return <div className="steps" aria-hidden="true">{[1,2,3].map(i=><i key={i} className={i<=at?'on':''}/>)}</div>;
}

function shake(el:Element|null){if(!el)return;el.classList.remove('shake');void (el as HTMLElement).offsetWidth;el.classList.add('shake');(el.querySelector('input,select,button') as HTMLElement|null)?.focus();}

function Account({form,setForm,onBack,onCreated,onUnder18}:{form:Form,setForm:React.Dispatch<React.SetStateAction<Form>>,onBack:()=>void,onCreated:(profileId:string)=>void,onUnder18:()=>void}){
 const {call}=useFe();const {t,locale}=useI18n();const toast=useToast();
 const {nick,dd,mm,yy,terms,news}=form;
 const set=(p:Partial<Form>)=>setForm(f=>({...f,...p}));
 const [nickState,setNickState]=useState<'idle'|'ok'|string>('idle');
 const [errors,setErrors]=useState<Record<string,string>>({});const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const [sheet,setSheet]=useState(false);const [confirm,setConfirm]=useState(false);
 const opId=useRef(newOpId());const wrap=useRef<HTMLDivElement>(null);
 // One verdict under the field: the hint, «available» or an error; checked 0.45 s after the last key.
 useEffect(()=>{
  setNickState('idle');
  if(nick.trim().length<3)return;
  const ctl=new AbortController();
  const timer=setTimeout(()=>{
   if(!NICK.test(nick.trim())||/\.\./.test(nick)||!/[A-Za-z]/.test(nick)){setNickState('format');return;}
   call('nick.check',{handle:nick.trim()},nickAnswer,{asAccount:true,signal:ctl.signal}).then(r=>setNickState(r.available?'ok':r.reason??'taken')).catch(()=>{});
  },450);
  return ()=>{clearTimeout(timer);ctl.abort();};
 },[nick,call]);
 const yNow=new Date().getFullYear();
 const dMax=mm?new Date(+(yy||2000),+mm,0).getDate():31;
 const months=useMemo(()=>Array.from({length:12},(_,i)=>new Date(2000,i,1).toLocaleString(locale==='en'?'en':'ru',{month:'long',day:'numeric'}).replace(/\d+/,'').trim()),[locale]);
 const age=dd&&mm&&yy?ageOn(+yy,+mm,+dd):null;
 const submit=async(confirmed=false)=>{
  const e:Record<string,string>={};
  if(!NICK.test(nick.trim())||/\.\./.test(nick)||!/[A-Za-z]/.test(nick))e.nick=t('fe.reg.nickFormat');
  else if(nickState!=='ok'&&nickState!=='idle')e.nick=t('fe.reg.nick.'+nickState);
  if(!dd||!mm||!yy)e.dob=t('fe.reg.dobMissing');
  if(!terms)e.terms=t('fe.reg.termsMissing');
  setErrors(e);setFailure('');
  if(Object.keys(e).length){
   toast(t('fe.onb.checkFields'),{type:'err'});
   shake(wrap.current?.querySelector(`[data-field="${Object.keys(e)[0]}"]`)??null);return;
  }
  if(age!==null&&age<18){onUnder18();return;}
  // V21 AUTH-023: after «под 18» a new date is confirmed explicitly.
  if(form.u18retry&&!confirmed){setConfirm(true);return;}
  setConfirm(false);setBusy(true);
  try{
   const docs=await loadDocuments(locale==='en'?'en':'ru');
   const documents=docs.filter(d=>d.requiresAccept).map(d=>({id:d.id,contentHash:d.hash}));
   const birthDate=`${yy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
   const r=await call('account.create',{opId:opId.current,handle:nick.trim(),birthDate,locale:locale==='en'?'en':'ru',documents,newsOptIn:news},created,{asAccount:true});
   if(r.rule==='under_18'){onUnder18();return;}
   if(!r.profileId)throw new FeError('unavailable');
   onCreated(r.profileId);
  }catch(error){
   if(error instanceof FeError&&error.fields?.includes('handle'))setErrors({nick:t('fe.reg.nick.taken')});
   else if(error instanceof FeError&&error.fields?.includes('birthDate'))setErrors({dob:t('fe.reg.dobInvalid')});
   else setFailure(feErrorMessage(error,t));
   opId.current=newOpId();
  }finally{setBusy(false);}
 };
 const err=(m:string)=><div className="ferr"><CircleAlert/>{m}</div>;
 const dob=(p:Partial<Form>)=>{set(p);setErrors(x=>({...x,dob:''}));};
 return <>
  <AuthBar onBack={onBack}/>
  <div className="view nodock cta1"><div ref={wrap} className="auth-wrap">
   <AuthLogo/>
   <Steps at={1}/>
   <h2 className="t">{t('fe.reg.title')}</h2>
   <label className={'field'+(errors.nick||(nickState!=='idle'&&nickState!=='ok')?' err':'')} data-field="nick">
    <span>{t('fe.reg.nick')}</span>
    <div className="inwrap"><AtSign/><input className="inp" value={nick} onChange={e=>{set({nick:e.target.value});setErrors(x=>({...x,nick:''}));}} placeholder="alex_b" autoComplete="username" autoCapitalize="off" spellCheck={false} maxLength={20} aria-invalid={!!errors.nick}/></div>
    {errors.nick?err(errors.nick):nickState==='ok'?<div className="fok"><CircleCheck/>{t('fe.reg.nickOk')}</div>:nickState!=='idle'?err(t('fe.reg.nick.'+nickState)):<div className="fhint">{t('fe.reg.nickHint')}</div>}
   </label>
   <div className={'field'+(errors.dob?' err':'')} data-field="dob"><span className="flabel" id="fe-dob">{t('fe.reg.dob')}</span>
    <div className="dob" role="group" aria-labelledby="fe-dob">
     <select className="inp" value={+dd>dMax?'':dd} onChange={e=>dob({dd:e.target.value})} aria-label={t('fe.reg.day')}><option value="">{t('fe.reg.day')}</option>{Array.from({length:dMax},(_,i)=><option key={i} value={String(i+1)}>{i+1}</option>)}</select>
     <select className="inp" value={mm} onChange={e=>dob({mm:e.target.value})} aria-label={t('fe.reg.month')}><option value="">{t('fe.reg.month')}</option>{months.map((m,i)=><option key={i} value={String(i+1)}>{m}</option>)}</select>
     <select className="inp" value={yy} onChange={e=>dob({yy:e.target.value})} aria-label={t('fe.reg.year')}><option value="">{t('fe.reg.year')}</option>{Array.from({length:88},(_,i)=>yNow-13-i).map(y=><option key={y} value={String(y)}>{y}</option>)}</select>
    </div>
    {errors.dob?err(errors.dob):<div className="fhint">{age!==null&&age>=18&&<span style={{color:'var(--mint)',fontWeight:600}}>{t('fe.reg.age').replace('{age}',String(age))} </span>}{t('fe.reg.dobHint')}</div>}
   </div>
   <div className="hr"/>
   <button type="button" role="checkbox" aria-checked={terms} className={'check'+(terms?' on':'')+(errors.terms?' err':'')} data-field="terms" onClick={()=>{set({terms:!terms});setErrors(x=>({...x,terms:''}));}}>
    <i><Check/></i><span>{t('fe.reg.terms')}{errors.terms&&<span className="ferr" style={{marginTop:4}}><CircleAlert/>{errors.terms}</span>}</span>
   </button>
   <button type="button" className="btn text auto terms-read" aria-haspopup="dialog" onClick={()=>setSheet(true)}>{t('fe.reg.readTerms')}</button>
   <button type="button" role="checkbox" aria-checked={news} className={'check'+(news?' on':'')} onClick={()=>set({news:!news})}>
    <i><Check/></i><span>{t('fe.reg.news')} <span className="note">· {t('fe.reg.optional')}</span></span>
   </button>
   {failure&&<div className="alert err mt16" role="alert"><CircleAlert/><span>{failure}</span></div>}
  </div></div>
  <div className="ctabar"><div className="wrap"><Btn onClick={()=>submit()} disabled={busy} busy={busy}>{t('fe.reg.continue')}</Btn></div></div>
  {sheet&&<TermsSheet onClose={()=>setSheet(false)}/>}
  {confirm&&<Layer>
   <div className="scrim on" onClick={()=>setConfirm(false)}/>
   <div className="dialog on" role="alertdialog" aria-modal="true" aria-label={t('fe.onb.u18c.title')} tabIndex={-1}>
    <div className="ico l a"><ShieldCheck/></div><h2>{t('fe.onb.u18c.title')}</h2>
    <p>{t('fe.onb.u18c.text').replace('{date}',`${dd}.${mm.padStart(2,'0')}.${yy}`)}</p>
    <div className="btns"><Btn onClick={()=>submit(true)}>{t('fe.onb.u18c.ok')}</Btn><Btn kind="soft" onClick={()=>setConfirm(false)}>{t('fe.onb.u18c.change')}</Btn></div>
   </div>
  </Layer>}
 </>;
}

function ageOn(y:number,m:number,d:number){const now=new Date();let a=now.getFullYear()-y;if(now.getMonth()+1<m||now.getMonth()+1===m&&now.getDate()<d)a--;return a;}

function Under18({onBack,onFix,onHome}:{onBack:()=>void,onFix:()=>void,onHome:()=>void}){
 const {t}=useI18n();
 return <>
  <AuthBar onBack={onBack}/>
  <div className="view nodock"><div className="auth-wrap"><AuthLogo/>
   <Empty icon={ShieldCheck} title={t('fe.reg.u18.title')} text={t('fe.reg.u18.text')}><Btn kind="soft" onClick={onFix}>{t('fe.reg.u18.fix')}</Btn><Btn kind="text" onClick={onHome}>{t('fe.onb.u18.home')}</Btn></Empty>
  </div></div>
 </>;
}

const KINDS=['gender','orient','role','status','format','seek'] as const;
type Kind=typeof KINDS[number];
const MULTI:Kind[]=['gender','orient','role','format','seek'];
/** Server limits (contracts/me.mjs onboarding.complete): five of each, nine «В поиске», one status. */
const LIMIT:Record<Kind,number>={gender:5,orient:5,role:5,status:1,format:5,seek:9};
/** V21 OPT_BASE: how many options count as «Популярное» in the «Все · N» picker. */
const BASE:Partial<Record<Kind,number>>={gender:8,orient:8,format:6,role:5};
/** V21 `chipGroup(…,{limit:5})`: up to seven options show all; more show five (plus the chosen) and «Все · N». */
const SHOWN=5;
type Opt=z.infer<typeof option>;

function AboutYou({profileId}:{profileId:string}){
 const {call,reload}=useFe();const {t,locale}=useI18n();const toast=useToast();const navigate=useNavigate();
 const [options,setOptions]=useState<Opt[]|null>(null);const [loadFailed,setLoadFailed]=useState(false);
 const [picked,setPicked]=useState<Record<Kind,string[]>>({gender:[],orient:[],role:[],status:[],format:[],seek:[]});
 const [vis,setVis]=useState<'only'|'granted'|'all'>('all');
 const [discover,setDiscover]=useState<'visible'|'off'>('visible');
 const [photo,setPhoto]=useState<'now'|'later'>('now');
 const [partner,setPartner]=useState<''|'yes'|'no'>('');
 const [picker,setPicker]=useState<Kind|null>(null);
 const [busy,setBusy]=useState<''|'save'|'skip'>('');const [failure,setFailure]=useState('');
 const opId=useRef(newOpId());
 const load=()=>{setLoadFailed(false);setOptions(null);call('catalog.get',{},catalog,{asAccount:true}).then(r=>setOptions(r.options)).catch(()=>setLoadFailed(true));};
 useEffect(load,[call]);
 const label=(o:Opt)=>locale==='en'?o.en:o.ru;
 // «мы пара» is a couple profile, made through the pair invitation, not a personal status (V21 optList).
 const listOf=(kind:Kind)=>(options??[]).filter(o=>o.kind===kind&&!(kind==='status'&&o.code==='couple'));
 const toggle=(kind:Kind,code:string)=>setPicked(p=>{
  const has=p[kind].includes(code);
  if(has)return {...p,[kind]:p[kind].filter(c=>c!==code)};
  if(LIMIT[kind]===1)return {...p,[kind]:[code]};
  if(p[kind].length>=LIMIT[kind]){toast(t('fe.onb.max').replace('{n}',String(LIMIT[kind])),{type:'info'});return p;}
  return {...p,[kind]:[...p[kind],code]};
 });
 // The chips once on screen stay there: choosing in «Все · N» adds a chip, never moves the others.
 const shown=useRef<Record<string,Set<string>>>({});
 const finish=async(skip:boolean)=>{
  setBusy(skip?'skip':'save');setFailure('');
  const pick=skip?{gender:[],orient:[],role:[],status:[],format:[],seek:[]}:picked;
  try{
   const r=await call('onboarding.complete',{opId:opId.current,detailsVis:vis,genders:pick.gender,orients:pick.orient,roles:pick.role,formats:pick.format,seeks:pick.seek,status:pick.status[0]??null,discover},onboarded,{profileId});
   // V21 AUTH-019: «Добавлю фото сейчас» opens the profile photos; «Да, вместе» — the pair invitation.
   navigate(partner==='yes'?'/n/me/pair':discover==='visible'&&photo==='now'&&r.photoNeeded?'/n/me':'/n/feed',{replace:true});
   reload();
  }catch(error){setFailure(feErrorMessage(error,t));opId.current=newOpId();}
  finally{setBusy('');}
 };
 const radio=<T extends string>(items:[T,string][],sel:T|'',pick:(v:T)=>void,aria:string)=><div className="chips" role="radiogroup" aria-label={aria}>
  {items.map(([id,l])=><button key={id} type="button" className={'chip'+(sel===id?' on':'')} role="radio" aria-checked={sel===id} onClick={()=>pick(id)}>{l}</button>)}</div>;
 const group=(kind:Kind)=>{
  const list=listOf(kind);if(!list.length)return null;
  const sel=picked[kind];
  let chips=list;let more=false;
  if(list.length>SHOWN+2){
   const s=shown.current[kind]=new Set([...(shown.current[kind]??[]),...list.slice(0,SHOWN).map(o=>o.code),...sel]);
   chips=list.filter(o=>s.has(o.code));more=true;
  }
  const title=t('fe.onb.kind.'+kind);
  return <section key={kind} className="fin"><div className="fin-t"><b>{title}</b>{MULTI.includes(kind)&&<span>{t('fe.reg.pickAny')}</span>}</div>
   <div className="chips" role="group" aria-label={title}>{chips.map(o=><button key={o.code} type="button" className={'chip'+(sel.includes(o.code)?' on':'')} aria-pressed={sel.includes(o.code)} onClick={()=>toggle(kind,o.code)}>{label(o)}</button>)}
    {more&&<button type="button" className="chip more" aria-haspopup="dialog" onClick={()=>setPicker(kind)}><Search size={14}/>{t('fe.onb.all').replace('{n}',String(list.length))}</button>}</div>
  </section>;
 };
 return <>
  {/* No «‹» here: the account already exists, the form before cannot be sent again. */}
  <AuthBar/>
  <div className="view nodock cta2"><div className="auth-wrap identity-onboarding">
   <AuthLogo/>
   <Steps at={2}/>
   <h2 className="t">{t('fe.reg.about.title')}</h2>
   <section className="fin"><div className="fin-t"><b>{t('fe.reg.discover.title')}</b></div>
    {radio([['visible',t('fe.onb.discover.on')],['off',t('fe.onb.discover.off')]],discover,setDiscover,t('fe.reg.discover.title'))}
    <p className="fhint mt8">{discover==='visible'?t('fe.onb.discover.noteOn'):t('fe.onb.discover.noteOff')}</p>
    {discover==='visible'&&<div className="mt12">{radio([['now',t('fe.onb.photo.now')],['later',t('fe.onb.photo.later')]],photo,setPhoto,t('fe.onb.photo.aria'))}</div>}
   </section>
   <section className="fin"><div className="fin-t"><b>{t('fe.onb.partner.title')}</b></div>
    {radio([['yes',t('fe.onb.partner.yes')],['no',t('fe.onb.partner.no')]],partner,v=>setPartner(p=>p===v?'':v),t('fe.onb.partner.title'))}
    {partner==='yes'&&<p className="fhint mt8">{t('fe.onb.partner.note')}</p>}
   </section>
   <section className="fin"><div className="fin-t"><b>{t('fe.reg.vis.title')}</b></div>
    {radio([['only',t('fe.reg.vis.only')],['granted',t('fe.reg.vis.granted')],['all',t('fe.reg.vis.all')]],vis,setVis,t('fe.reg.vis.title'))}
    <p className="fhint mt8">{t('fe.reg.vis.note.'+vis)}</p>
   </section>
   {loadFailed?<div className="alert err mt16" role="alert"><CircleAlert/><span>{t('fe.onb.optionsFailed')}</span><button type="button" className="btn text auto" onClick={load}>{t('fe.retry')}</button></div>
    :options===null?<div className="mt16"><Skel kind="card" rows={3}/></div>:KINDS.map(group)}
   {failure&&<div className="alert err mt16" role="alert"><CircleAlert/><span>{failure}</span></div>}
  </div></div>
  <div className="ctabar"><div className="wrap">
   <Btn onClick={()=>finish(false)} disabled={!!busy} busy={busy==='save'}>{t('fe.onb.saveNext')}</Btn>
   <Btn className="secondary" kind="soft" onClick={()=>finish(true)} disabled={!!busy} busy={busy==='skip'}>{t('fe.onb.later')}</Btn>
  </div></div>
  {picker&&<Picker title={t('fe.onb.kind.'+picker)} items={listOf(picker)} base={BASE[picker]??8} label={label} sel={picked[picker]} max={LIMIT[picker]>1&&LIMIT[picker]<9?LIMIT[picker]:0}
   onToggle={c=>toggle(picker,c)} onClear={()=>setPicked(p=>({...p,[picker]:[]}))} onClose={()=>setPicker(null)}/>}
 </>;
}

/** V21 `openChipPicker()`: the full list in a sheet — search (RU and EN), «Популярное» / «Ещё варианты», the
 * count of chosen (n/max), «Сбросить» and «Готово · n». */
function Picker({title,items,base,label,sel,max,onToggle,onClear,onClose}:{title:string,items:Opt[],base:number,label:(o:Opt)=>string,sel:string[],max:number,onToggle:(c:string)=>void,onClear:()=>void,onClose:()=>void}){
 const {t}=useI18n();const [q,setQ]=useState('');
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};addEventListener('keydown',k);return ()=>removeEventListener('keydown',k);},[onClose]);
 const query=q.trim().toLowerCase();
 const hit=(o:Opt)=>!query||`${o.ru} ${o.en} ${o.code}`.toLowerCase().includes(query);
 const groups:[string,Opt[]][]=[[t('fe.onb.popular'),items.slice(0,base)],[t('fe.onb.moreOptions'),items.slice(base)]];
 const total=items.filter(hit).length;
 return <Layer>
  <div className="scrim on" onClick={onClose}/>
  <div className="sheet full on" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
   <div className="grab"/>
   <div className="sh-h"><div className="sh-ht"><h2>{title}</h2></div>
    <span className={'pill'+(sel.length?' v':'')}>{max?`${sel.length}/${max}`:sel.length}</span>
    <button type="button" className="ibtn ghost sm" aria-label={t('fe.onb.close')} onClick={onClose}><X/></button></div>
   <div className="sh-search"><div className="inwrap"><Search/><input className="inp" type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder={t('fe.onb.find')} aria-label={t('fe.onb.find')} enterKeyHint="search"/></div></div>
   <div className="sh-b">
    {groups.map(([g,list])=>{const vis=list.filter(hit);if(!list.length||query&&!vis.length)return null;
     return <section key={g} className={'fsec'+(query?' searching':'')}><div className="sec">{g}</div>
      <div className="chips">{vis.map(o=><button key={o.code} type="button" className={'chip'+(sel.includes(o.code)?' on':'')} aria-pressed={sel.includes(o.code)} onClick={()=>onToggle(o.code)}>{label(o)}</button>)}</div></section>;})}
    {query&&!total&&<p className="note sh-empty">{t('fe.onb.findNone')}</p>}
   </div>
   <div className="sh-f"><div className="row g8">
    {sel.length>0&&<Btn kind="soft" style={{flex:'0 0 auto',width:'auto'}} onClick={onClear}>{t('fe.onb.clear')}</Btn>}
    <Btn onClick={onClose}>{sel.length?t('fe.onb.doneN').replace('{n}',String(sel.length)):t('fe.reg.done')}</Btn>
   </div></div>
  </div>
 </Layer>;
}

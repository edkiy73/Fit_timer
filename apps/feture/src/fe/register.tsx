import {useEffect,useMemo,useRef,useState} from 'react';
import {Link} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {apiUrl} from '../api-url';
import {documentsResponse} from '../feture/document-model';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {ActionButton,StateCard} from './components';
import {useFe} from './session';

/** V21 A04 (nickname, date of birth, consent) → A04X (under 18) → A05 «Tell us about you» (sensitive answers,
 * private by default; Discover on by default — owner decision 27.10.2026). Server rules decide; the form only
 * explains them early. */
const NICK=/^[A-Za-z0-9](?:[A-Za-z0-9_.]{1,18})[A-Za-z0-9]$/;
const created=z.object({ok:z.boolean(),profileId:z.uuid().optional(),rule:z.string().optional()});
const nickAnswer=z.object({ok:z.literal(true),available:z.boolean(),reason:z.string().optional()});
const option=z.object({kind:z.string(),code:z.string(),ru:z.string(),en:z.string()});
const catalog=z.object({ok:z.literal(true),options:z.array(option)});
const onboarded=z.object({ok:z.literal(true),discoverVisible:z.boolean(),photoNeeded:z.boolean()});

export function Register(){
 const [step,setStep]=useState<{id:'A04'}|{id:'U18'}|{id:'A05',profileId:string}>({id:'A04'});
 if(step.id==='U18')return <Under18 onFix={()=>setStep({id:'A04'})}/>;
 if(step.id==='A05')return <AboutYou profileId={step.profileId}/>;
 return <Account onCreated={profileId=>setStep({id:'A05',profileId})} onUnder18={()=>setStep({id:'U18'})}/>;
}

function Steps({at}:{at:number}){
 return <div className="fe-steps" aria-hidden="true">{[1,2,3].map(i=><i key={i} className={i<=at?'on':''}/>)}</div>;
}

function Account({onCreated,onUnder18}:{onCreated:(profileId:string)=>void,onUnder18:()=>void}){
 const {call}=useFe();const {t,locale}=useI18n();
 const [nick,setNick]=useState('');const [nickState,setNickState]=useState<'idle'|'ok'|string>('idle');
 const [dd,setDd]=useState('');const [mm,setMm]=useState('');const [yy,setYy]=useState('');
 const [terms,setTerms]=useState(false);const [news,setNews]=useState(false);
 const [errors,setErrors]=useState<Record<string,string>>({});const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const opId=useRef(newOpId());
 // One verdict under the field: the hint, «available» or an error; checked 0.45 s after the last key.
 useEffect(()=>{
  setNickState('idle');
  if(nick.trim().length<3)return;
  if(!NICK.test(nick.trim())){setNickState('format');return;}
  const ctl=new AbortController();
  const timer=setTimeout(()=>{call('nick.check',{handle:nick.trim()},nickAnswer,{asAccount:true,signal:ctl.signal})
   .then(r=>setNickState(r.available?'ok':r.reason??'taken')).catch(()=>{});},450);
  return ()=>{clearTimeout(timer);ctl.abort();};
 },[nick,call]);
 const yNow=new Date().getFullYear();
 const dMax=mm?new Date(+(yy||2000),+mm,0).getDate():31;
 const months=useMemo(()=>Array.from({length:12},(_,i)=>new Date(2000,i,1).toLocaleString(locale==='en'?'en':'ru',{month:'long'})),[locale]);
 const age=dd&&mm&&yy?ageOn(+yy,+mm,+dd):null;
 const submit=async()=>{
  const e:Record<string,string>={};
  if(!NICK.test(nick.trim()))e.nick=t('fe.reg.nickFormat');
  else if(nickState!=='ok'&&nickState!=='idle')e.nick=t('fe.reg.nick.'+nickState);
  if(!dd||!mm||!yy)e.dob=t('fe.reg.dobMissing');
  if(!terms)e.terms=t('fe.reg.termsMissing');
  setErrors(e);setFailure('');
  if(Object.keys(e).length)return;
  setBusy(true);
  try{
   const docs=documentsResponse.parse(await (await fetch(apiUrl(`/api/catalog?resource=documents&locale=${locale==='en'?'en':'ru'}`),{cache:'no-store'})).json());
   const documents=docs.documents.filter(d=>d.requiresAccept).map(d=>({id:d.id,contentHash:d.hash}));
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
 return <div className="fe-auth">
  <Steps at={1}/>
  <h1>{t('fe.reg.title')}</h1>
  <label className={'fe-field'+(errors.nick?' err':'')}>
   <span className="fe-flabel">{t('fe.reg.nick')}</span>
   <input className="fe-inp" value={nick} onChange={e=>{setNick(e.target.value);setErrors(x=>({...x,nick:''}));}} placeholder="alex_b" autoComplete="username" autoCapitalize="off" spellCheck={false} maxLength={20}/>
   {errors.nick?<span className="fe-ferr" role="alert">{errors.nick}</span>
    :nickState==='ok'?<span className="fe-fok">{t('fe.reg.nickOk')}</span>
    :nickState!=='idle'?<span className="fe-ferr">{t('fe.reg.nick.'+nickState)}</span>
    :<span className="fe-fhint">{t('fe.reg.nickHint')}</span>}
  </label>
  <div className={'fe-field'+(errors.dob?' err':'')}>
   <span className="fe-flabel" id="fe-dob">{t('fe.reg.dob')}</span>
   <div className="fe-dob" role="group" aria-labelledby="fe-dob">
    <select className="fe-inp" value={+dd>dMax?'':dd} onChange={e=>{setDd(e.target.value);setErrors(x=>({...x,dob:''}));}} aria-label={t('fe.reg.day')}><option value="">{t('fe.reg.day')}</option>{Array.from({length:dMax},(_,i)=><option key={i} value={String(i+1)}>{i+1}</option>)}</select>
    <select className="fe-inp" value={mm} onChange={e=>{setMm(e.target.value);setErrors(x=>({...x,dob:''}));}} aria-label={t('fe.reg.month')}><option value="">{t('fe.reg.month')}</option>{months.map((m,i)=><option key={i} value={String(i+1)}>{m}</option>)}</select>
    <select className="fe-inp" value={yy} onChange={e=>{setYy(e.target.value);setErrors(x=>({...x,dob:''}));}} aria-label={t('fe.reg.year')}><option value="">{t('fe.reg.year')}</option>{Array.from({length:88},(_,i)=>yNow-13-i).map(y=><option key={y} value={String(y)}>{y}</option>)}</select>
   </div>
   {errors.dob?<span className="fe-ferr" role="alert">{errors.dob}</span>
    :<span className="fe-fhint">{age!==null&&age>=18&&<b className="fe-okt">{t('fe.reg.age').replace('{age}',String(age))} </b>}{t('fe.reg.dobHint')}</span>}
  </div>
  <hr className="fe-hr"/>
  <button type="button" role="checkbox" aria-checked={terms} className={'fe-check'+(terms?' on':'')+(errors.terms?' err':'')} onClick={()=>{setTerms(v=>!v);setErrors(x=>({...x,terms:''}));}}>
   <i aria-hidden="true"/><span>{t('fe.reg.terms')}{errors.terms&&<span className="fe-ferr">{errors.terms}</span>}</span>
  </button>
  <Link className="fe-link" to="/documents">{t('fe.reg.readTerms')}</Link>
  <button type="button" role="checkbox" aria-checked={news} className={'fe-check'+(news?' on':'')} onClick={()=>setNews(v=>!v)}>
   <i aria-hidden="true"/><span>{t('fe.reg.news')} <span className="fe-mute">· {t('fe.reg.optional')}</span></span>
  </button>
  {failure&&<p className="fe-alert" role="alert">{failure}</p>}
  <div className="fe-cta"><ActionButton onClick={submit} disabled={busy}>{busy?t('fe.loading'):t('fe.reg.continue')}</ActionButton></div>
 </div>;
}

function ageOn(y:number,m:number,d:number){const now=new Date();let a=now.getFullYear()-y;if(now.getMonth()+1<m||now.getMonth()+1===m&&now.getDate()<d)a--;return a;}

function Under18({onFix}:{onFix:()=>void}){
 const {t}=useI18n();
 return <div className="fe-auth"><StateCard icon="shield" title={t('fe.reg.u18.title')} text={t('fe.reg.u18.text')}
  action={<ActionButton variant="soft" onClick={onFix}>{t('fe.reg.u18.fix')}</ActionButton>}/></div>;
}

const KINDS=['gender','orient','role','status','format','seek'] as const;
type Kind=typeof KINDS[number];
const LIMIT:Record<Kind,number>={gender:5,orient:5,role:5,status:1,format:5,seek:9};

function AboutYou({profileId}:{profileId:string}){
 const {call,reload}=useFe();const {t,locale}=useI18n();
 const [options,setOptions]=useState<z.infer<typeof option>[]|null>(null);
 const [picked,setPicked]=useState<Record<Kind,string[]>>({gender:[],orient:[],role:[],status:[],format:[],seek:[]});
 const [vis,setVis]=useState<'only'|'granted'|'all'>('only');
 const [discover,setDiscover]=useState<'visible'|'off'>('visible');
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const opId=useRef(newOpId());
 useEffect(()=>{call('catalog.get',{},catalog,{asAccount:true}).then(r=>setOptions(r.options)).catch(()=>setOptions([]));},[call]);
 const toggle=(kind:Kind,code:string)=>setPicked(p=>{const has=p[kind].includes(code);
  const next=has?p[kind].filter(c=>c!==code):LIMIT[kind]===1?[code]:p[kind].length>=LIMIT[kind]?p[kind]:[...p[kind],code];return {...p,[kind]:next};});
 const finish=async()=>{
  setBusy(true);setFailure('');
  try{
   await call('onboarding.complete',{opId:opId.current,detailsVis:vis,genders:picked.gender,orients:picked.orient,roles:picked.role,formats:picked.format,seeks:picked.seek,status:picked.status[0]??null,discover},onboarded,{profileId});
   reload();
  }catch(error){setFailure(feErrorMessage(error,t));opId.current=newOpId();}
  finally{setBusy(false);}
 };
 const label=(o:z.infer<typeof option>)=>locale==='en'?o.en:o.ru;
 return <div className="fe-auth">
  <Steps at={2}/>
  <h1>{t('fe.reg.about.title')}</h1>
  <section className="fe-section">
   <h3>{t('fe.reg.discover.title')}</h3>
   <div className="fe-chips">{(['visible','off'] as const).map(v=><button key={v} type="button" className={'fe-chip'+(discover===v?' on':'')} aria-pressed={discover===v} onClick={()=>setDiscover(v)}>{t('fe.reg.discover.'+v)}</button>)}</div>
   <p className="fe-fhint">{t('fe.reg.discover.note.'+discover)}</p>
  </section>
  <section className="fe-section">
   <h3>{t('fe.reg.vis.title')}</h3>
   <div className="fe-chips">{(['only','granted','all'] as const).map(v=><button key={v} type="button" className={'fe-chip'+(vis===v?' on':'')} aria-pressed={vis===v} onClick={()=>setVis(v)}>{t('fe.reg.vis.'+v)}</button>)}</div>
   <p className="fe-fhint">{t('fe.reg.vis.note.'+vis)}</p>
  </section>
  {options===null?<p role="status" className="fe-mute">{t('fe.loading')}</p>:KINDS.map(kind=>{
   const list=options.filter(o=>o.kind===kind);if(!list.length)return null;
   return <section key={kind} className="fe-section"><h3>{t('fe.reg.kind.'+kind)}</h3>
    <div className="fe-chips">{list.map(o=><button key={o.code} type="button" className={'fe-chip'+(picked[kind].includes(o.code)?' on':'')} aria-pressed={picked[kind].includes(o.code)} onClick={()=>toggle(kind,o.code)}>{label(o)}</button>)}</div>
   </section>;
  })}
  {failure&&<p className="fe-alert" role="alert">{failure}</p>}
  <div className="fe-cta fe-cta2">
   <ActionButton onClick={finish} disabled={busy}>{busy?t('fe.loading'):t('fe.reg.done')}</ActionButton>
   <ActionButton variant="text" onClick={reload} disabled={busy}>{t('fe.reg.skip')}</ActionButton>
  </div>
 </div>;
}

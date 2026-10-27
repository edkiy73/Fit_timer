import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate,useParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {ChevronRight,CircleAlert,Info,Link2,Pencil,Plus,Trash2,User,Users,X} from 'lucide-react';
import {useToast as useToastV21} from './toast';
import {newOpId} from '../feture/fe-api';
import {Av,Bar,Btn,Empty,View,Skel} from './ui';
import {useFe} from './session';
import {SelectRow} from './create-community';
import {NameBadges,withAge} from './faces';
import {KINDS,SIDES,Sheet,linkLabel,linksMineRes,mediaSrc,personName,personProfileRes,pxError,useToast,type Kind,type LinkView,type LinksMine,type PersonProfile} from './profile-extras';

/** Links between profiles with the V21 prototype's markup: «Мои связи» (P21 — proposals waiting for an answer,
 * confirmed links with their visibility, sent requests, who may propose) and the link editor (P22 — propose a link
 * or change a confirmed one). Every link exists only once both sides confirm; the server keeps all the rules. */

type T=(key:string)=>string;
const fill=(s:string,vars:Record<string,string|number>)=>Object.entries(vars).reduce((a,[k,v])=>a.split('{'+k+'}').join(String(v)),s);
const ok=z.object({ok:z.literal(true)}).passthrough();
const settingsRes=z.object({ok:z.literal(true),settings:z.object({linksFrom:z.enum(['all','follow','none'])}).passthrough()});
type LinksFrom=z.infer<typeof settingsRes>['settings']['linksFrom'];
type Vis=LinkView['vis'];
const VIS:Vis[]=['all','followers','us'];
const nameOf=(l:LinkView)=>personName(l.other)||'?';
const visItems=(t:T):[Vis,string][]=>VIS.map(v=>[v,t('fe.px.lk.vis.'+v)]);
/** Proposals and kind changes that wait for the acting profile's answer. */
export const waitingCount=(r:LinksMine)=>r.incoming.length+r.confirmed.filter(l=>l.change&&!l.change.mine).length;

/** `linksBlock(owner,true)` on the Me profile layer: proposals waiting for an answer on top (compact cards with
 * «Подтвердить / Отклонить»), then up to four confirmed links and «Управлять»; empty — one «Добавить связь» row. */
export function LinksBlock({onChanged}:{onChanged?:()=>void}){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const toast=useToastV21();
 const [r,setR]=useState<LinksMine|null>(null);const [busy,setBusy]=useState(false);
 const load=useCallback(()=>{call('links.mine',{},linksMineRes).then(setR).catch(()=>{});},[call]);
 useEffect(()=>{load();},[load]);
 if(!r)return null;
 const couple=acting?.kind==='couple';
 const inc=[...r.incoming,...r.confirmed.filter(l=>l.change&&!l.change.mine)];
 const list=r.confirmed;
 const manage=()=>navigate('/n/me/links');
 const answer=async(l:LinkView,accept:boolean)=>{setBusy(true);
  try{await (l.change?call('link.answerChange',{opId:newOpId(),linkId:l.id,accept},ok):call('link.answer',{opId:newOpId(),linkId:l.id,accept,vis:'all'},ok));
   toast(accept?(l.change?t('fe.ln.t.changeOk'):t('fe.ln.t.confirmed')):t('fe.ln.t.declined'),{type:'ok'});load();onChanged?.();}
  catch(e){toast(pxError(e,t),{type:'err'});}finally{setBusy(false);}};
 const title=inc.length?fill(t(inc.length===1?'fe.mx.lk.titleNew1':'fe.mx.lk.titleNew'),{n:inc.length}):t('fe.mx.lk.title');
 return <section className={'grp'+(list.length?'':' bare')}>
  <div className="grp-t"><span>{title}</span>{(list.length||inc.length)?<button type="button" onClick={manage}>{t('fe.mx.lk.manage')}</button>:null}</div>
  {inc.length>0&&<div className="lk-inc">{inc.map(l=>{const name=nameOf(l);const go=()=>navigate('/n/people/'+l.other.id);
   return <div key={l.id} className="card rqcard lk-req" style={{marginBottom:10}}>
    <div className="row"><button type="button" className="rq-av" aria-label={name} onClick={go}><Av name={name} seed={l.other.id} size="sm" src={l.other.avatar}/></button>
     <button type="button" className="grow" style={{textAlign:'left'}} onClick={go}><b style={{fontSize:15}}>{withAge(name,l.other)}<NameBadges p={l.other}/></b>
      <div className="note">{l.change?fill(t('fe.ln.proposesChange'),{from:linkLabel(t,l.kind,l.side),to:t('fe.px.lk.k.'+l.change.kind)}):fill(couple?t('fe.ln.proposesCouple'):t('fe.ln.proposes'),{label:linkLabel(t,l.kind,l.side)})}</div></button></div>
    <div className="row g8 mt12"><Btn size="md" disabled={busy} onClick={()=>answer(l,true)}>{t('fe.ln.confirm')}</Btn><Btn size="md" kind="soft" disabled={busy} onClick={()=>answer(l,false)}>{t('fe.ln.decline')}</Btn></div>
   </div>;})}</div>}
  {list.length?<div className="card list">{list.slice(0,4).map(l=>{const name=nameOf(l);const v=l.vis;
   return <button key={l.id} type="button" className="li" onClick={()=>navigate('/n/people/'+l.other.id)}><Av name={name} seed={l.other.id} size="sm" src={l.other.avatar}/>
    <span className="tx"><b>{name}<NameBadges p={l.other}/></b><small>{linkLabel(t,l.kind,l.side)+(v!=='all'?' · '+(v==='us'?t('fe.mx.lk.visUs'):t('fe.mx.lk.visFollowers')):'')}</small></span><ChevronRight/></button>;})}</div>
   :<div className="card"><button type="button" className="ph-empty" onClick={manage}><span className="pe-ic"><Link2/></span>
    <span className="tx"><b>{t('fe.mx.lk.add')}</b><small>{couple?t('fe.mx.lk.addSubCouple'):t('fe.mx.lk.addSub')}</small></span><Plus/></button></div>}
 </section>;
}

/** `/n/me/links` — SC.P21 for the own profile. */
export function LinksScreen(){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const [toastNode,toast]=useToast();
 const [r,setR]=useState<LinksMine|null>(null);const [from,setFrom]=useState<LinksFrom|null>(null);const [error,setError]=useState<unknown>(null);
 const [busy,setBusy]=useState(false);const [menu,setMenu]=useState<{l:LinkView,pend:boolean}|null>(null);const [removing,setRemoving]=useState<LinkView|null>(null);
 const load=useCallback(()=>{setError(null);Promise.all([call('links.mine',{},linksMineRes),call('profile.settings',{},settingsRes).catch(()=>null)])
  .then(([a,b])=>{setR(a);setFrom(b?.settings.linksFrom??null);}).catch(setError);},[call]);
 useEffect(()=>{setR(null);load();},[load]);
 const act=async(fn:()=>Promise<Record<string,unknown>>,msg:string)=>{setBusy(true);
  try{const res=await fn();toast(res.pending?t('fe.ln.t.pending'):msg);load();return true;}catch(e){toast(pxError(e,t),true);load();return false;}finally{setBusy(false);}};
 const closeMenu=useCallback(()=>setMenu(null),[]);const closeRemove=useCallback(()=>setRemoving(null),[]);
 const answer=(l:LinkView,accept:boolean)=>l.change
  ?act(()=>call('link.answerChange',{opId:newOpId(),linkId:l.id,accept},ok),accept?t('fe.ln.t.changeOk'):t('fe.ln.t.declined'))
  :act(()=>call('link.answer',{opId:newOpId(),linkId:l.id,accept,vis:'all'},ok),accept?t('fe.ln.t.confirmed'):t('fe.ln.t.declined'));
 const couple=acting?.kind==='couple';
 const waiting=r?[...r.incoming,...r.confirmed.filter(l=>l.change&&!l.change.mine)]:[];
 const visWord=(v:Vis)=>v==='us'?t('fe.ln.visUs'):v==='followers'?t('fe.ln.visFollowers'):'';
 const row=(l:LinkView,pend:boolean,extra:string)=>{const name=nameOf(l);
  return <button key={l.id} type="button" className="li" onClick={()=>setMenu({l,pend})}>
   <Av name={name} seed={l.other.id} size="sm" src={l.other.avatar}/>
   <span className="tx"><b>{name}<NameBadges p={l.other}/></b><small>{[linkLabel(t,l.kind,l.side),pend?'':visWord(l.vis),extra].filter(Boolean).join(' · ')}</small></span><ChevronRight/>
  </button>;};
 const m=menu?.l;
 return <>
  <Bar title={couple?t('fe.ln.titleCouple'):t('fe.ln.title')} back/>
  <View className="nodock">
   {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={pxError(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!r?<Skel kind="list"/>
    :<>
     {waiting.length>0&&<>
      <div className="sec" style={{marginTop:6}}>{t('fe.ln.waiting')}</div>
      {waiting.map(l=>{const name=nameOf(l);const go=()=>navigate('/n/people/'+l.other.id);
       return <div key={l.id} className="card rqcard" style={{marginBottom:10}}>
        <div className="row">
         <button type="button" className="rq-av" aria-label={name} onClick={go}><Av name={name} seed={l.other.id} src={l.other.avatar}/></button>
         <button type="button" className="grow" style={{textAlign:'left'}} onClick={go}><b style={{fontSize:16}}>{withAge(name,l.other)}<NameBadges p={l.other}/></b>
          <div className="note">{l.change?fill(t('fe.ln.proposesChange'),{from:linkLabel(t,l.kind,l.side),to:t('fe.px.lk.k.'+l.change.kind)})
           :fill(couple?t('fe.ln.proposesCouple'):t('fe.ln.proposes'),{label:linkLabel(t,l.kind,l.side)})}</div></button>
        </div>
        <div className="row g8 mt12">
         <Btn size="md" disabled={busy} onClick={()=>answer(l,true)}>{t('fe.ln.confirm')}</Btn>
         <Btn size="md" kind="soft" disabled={busy} onClick={()=>answer(l,false)}>{t('fe.ln.decline')}</Btn>
        </div>
       </div>;})}
     </>}
     <section className="grp"><div className="grp-t"><span>{fill(t('fe.ln.confirmed'),{n:r.confirmed.length})}</span></div>
      {r.confirmed.length?<div className="card list">{r.confirmed.map(l=>row(l,false,l.change?.mine?t('fe.ln.changePending'):''))}</div>
       :<div className="card"><div className="lk-empty"><p className="note">{t('fe.ln.emptyText')}</p><p className="note">{t('fe.ln.emptyHow')}</p></div></div>}
     </section>
     {r.sent.length>0&&<section className="grp"><div className="grp-t"><span>{fill(t('fe.ln.sent'),{n:r.sent.length})}</span></div>
      <div className="card list">{r.sent.map(l=>row(l,true,t('fe.ln.awaiting')))}</div>
     </section>}
     {from&&<section className="grp"><div className="grp-t"><span>{t('fe.ln.requests')}</span></div>
      <div className="card list"><div className="li"><SelectRow label={t('fe.ln.from')} value={from} items={(['all','follow','none'] as const).map(v=>[v,t('fe.ln.from.'+v)] as [LinksFrom,string])}
       onChange={v=>{if(busy)return;setFrom(v);void act(()=>call('profile.setVisibility',{opId:newOpId(),setting:'linksFrom',value:v},ok),t('fe.ln.t.saved'));}}/></div></div>
      <p className="grp-n">{t('fe.ln.fromFoot')}</p>
     </section>}
    </>}
  </View>
  {menu&&m&&<Sheet title={nameOf(m)} onClose={closeMenu}>
   <div className="card list">
    <button type="button" className="li" onClick={()=>{closeMenu();navigate('/n/people/'+m.other.id);}}><span className="ico"><User/></span><span className="tx"><b>{t('fe.ln.open')}</b><small>{linkLabel(t,m.kind,m.side)}</small></span></button>
    {!menu.pend&&<button type="button" className="li" onClick={()=>{closeMenu();navigate('/n/people/'+m.other.id+'/link');}}><span className="ico"><Pencil/></span><span className="tx"><b>{t('fe.ln.change')}</b><small>{t('fe.ln.changeSub')}</small></span></button>}
    {!menu.pend&&<div className="li"><SelectRow label={t('fe.px.lk.vis')} value={m.vis} items={visItems(t)}
     onChange={v=>{if(busy)return;setMenu({l:{...m,vis:v},pend:false});void act(()=>call('link.setVisibility',{opId:newOpId(),linkId:m.id,vis:v},ok),t('fe.ln.t.saved'));}}/></div>}
    <button type="button" className="li danger" disabled={busy} onClick={()=>{if(menu.pend){closeMenu();void act(()=>call('link.remove',{opId:newOpId(),linkId:m.id},ok),t('fe.ln.t.cancelled'));}else{closeMenu();setRemoving(m);}}}>
     <span className="ico">{menu.pend?<X/>:<Trash2/>}</span><span className="tx"><b>{menu.pend?t('fe.ln.cancelReq'):t('fe.ln.remove')}</b>{!menu.pend&&<small>{t('fe.ln.removeSub')}</small>}</span>
    </button>
   </div>
   {!menu.pend&&<p className="grp-n">{t('fe.ln.visNote')}</p>}
  </Sheet>}
  {removing&&<Sheet title={t('fe.ln.removeTitle')} onClose={closeRemove} foot={<>
   <Btn kind="danger" disabled={busy} onClick={async()=>{if(await act(()=>call('link.remove',{opId:newOpId(),linkId:removing.id},ok),t('fe.ln.t.removed')))closeRemove();}}>{t('fe.ln.removeOk')}</Btn>
   <Btn kind="text" onClick={closeRemove}>{t('fe.ln.cancel')}</Btn></>}>
   <p className="lead">{fill(t('fe.ln.removeText'),{name:nameOf(removing)})}</p>
  </Sheet>}
  {toastNode}
 </>;
}

/** `/n/people/:id/link` — SC.P22: propose a link (`link.propose`), or for a confirmed one change its kind
 * (`link.proposeChange`, the other side confirms) and the own visibility (`link.setVisibility`, at once). */
export function LinkEditScreen(){
 const {id=''}=useParams();const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const [p,setP]=useState<PersonProfile|null>(null);const [mine,setMine]=useState<LinksMine|null>(null);const [error,setError]=useState<unknown>(null);
 const [kind,setKind]=useState<Kind>('play');const [mySide,setSide]=useState<string|null>(null);const [vis,setVis]=useState<Vis>('all');
 const [busy,setBusy]=useState(false);const [err,setErr]=useState('');const [sideErr,setSideErr]=useState(false);const [done,setDone]=useState('');
 const op=useRef(newOpId());const init=useRef(false);
 const load=useCallback(()=>{setError(null);Promise.all([call('profile.get',{profileId:id},personProfileRes),call('links.mine',{},linksMineRes)])
  .then(([a,b])=>{setP(a.profile);setMine(b);}).catch(setError);},[call,id]);
 useEffect(()=>{init.current=false;setDone('');load();},[load]);
 const ex:{l:LinkView,st:'ok'|'sent'|'in'}|undefined=mine?([...mine.confirmed.map(l=>({l,st:'ok' as const})),...mine.sent.map(l=>({l,st:'sent' as const})),...mine.incoming.map(l=>({l,st:'in' as const}))]
  .find(x=>x.l.other.id===id)):undefined;
 useEffect(()=>{if(!p||!mine||init.current)return;init.current=true;
  const cur=ex?.st==='ok'?ex.l:null;
  setKind(cur&&(KINDS as readonly string[]).includes(cur.kind)?cur.kind as Kind:acting?.kind==='couple'||p.kind==='couple'?'friend':'play');
  setSide(cur?.side??null);setVis(cur?.vis??'all');},[p,mine,ex,acting?.kind]);
 const name=personName(p)||'?';const sides=SIDES[kind];const we=acting?.kind==='couple';
 const conf=ex?.st==='ok'?ex.l:null;
 const changed=!!conf&&(kind!==conf.kind||!!sides&&mySide!==conf.side);
 const send=async()=>{
  if(sides&&!mySide){setSideErr(true);setErr(t('fe.px.lk.pickSide'));return;}
  setBusy(true);setErr('');
  try{
   if(!conf){
    const r=await call('link.propose',{opId:op.current,profileId:id,kind,...(sides&&mySide?{mySide}:{}),vis},ok);
    setDone(r.pending?t('fe.px.lk.pending'):fill(t('fe.px.lk.sent'),{name}));
   }else{
    let pending=false;
    if(vis!==conf.vis){const r=await call('link.setVisibility',{opId:newOpId(),linkId:conf.id,vis},ok);pending||=!!r.pending;}
    if(changed){await call('link.proposeChange',{opId:op.current,linkId:conf.id,kind,...(sides&&mySide?{mySide}:{})},ok);}
    setDone(changed?fill(t('fe.ln.p22.changeSent'),{name}):pending?t('fe.ln.t.pending'):t('fe.ln.t.saved'));
   }
  }catch(e){setErr(pxError(e,t));op.current=newOpId();}finally{setBusy(false);}
 };
 const cancel=async()=>{if(!ex)return;setBusy(true);setErr('');
  try{await call('link.remove',{opId:newOpId(),linkId:ex.l.id},ok);setDone(t('fe.ln.t.cancelled'));}catch(e){setErr(pxError(e,t));}finally{setBusy(false);}};
 const city=p?.city?(locale==='en'?p.city.en:p.city.ru):null;
 const cta=done?<Btn onClick={()=>navigate(-1)}>{t('fe.ln.p22.done')}</Btn>
  :ex?.st==='in'?<Btn onClick={()=>navigate('/n/me/links')}>{t('fe.ln.p22.toLinks')}</Btn>
  :ex?.st==='sent'?<Btn kind="danger" onClick={cancel} disabled={busy}>{t('fe.ln.cancelReq')}</Btn>
  :<Btn onClick={send} disabled={busy}>{conf?changed?t('fe.ln.p22.proposeChange'):t('fe.ln.p22.save'):t('fe.ln.p22.send')}</Btn>;
 return <>
  <Bar title={conf?t('fe.ln.p22.edit'):t('fe.ln.p22.new')} back/>
  <div className="view nodock cta1"><div className="wrap">
   {error?<Empty icon={Users} role="alert" title={t('fe.feed.unavailable')} text={pxError(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!p||!mine?<Skel kind="list"/>
    :<>
     <div className="card list mt12"><button type="button" className="li" onClick={()=>navigate('/n/people/'+id)}>
      <Av name={name} seed={p.id} src={mediaSrc(p.avatar)}/><span className="tx"><b>{name}{p.age?', '+p.age:''}</b>{city&&<small>{city}</small>}</span><ChevronRight/>
     </button></div>
     {done?<div className="alert ok mt16" role="status"><span>{done}</span></div>
      :ex&&ex.st!=='ok'?<div className="alert info mt16"><Info/><span>{fill(ex.st==='in'?t('fe.ln.p22.incoming'):t('fe.ln.p22.sentAlready'),{name})}</span></div>
      :<>
       <section className="grp p22-kinds21"><div className="grp-t"><span>{t('fe.px.lk.kind')}</span></div>
        <div className="card list" role="radiogroup" aria-label={t('fe.px.lk.kind')}>
         {KINDS.map(k=><button key={k} type="button" className={'radio'+(kind===k?' on':'')} role="radio" aria-checked={kind===k} onClick={()=>{setKind(k);setSide(conf&&k===conf.kind?conf.side:null);setSideErr(false);setErr('');}}>
          <i/><span className="tx">{t('fe.px.lk.k.'+k)}{SIDES[k]&&<small className="note">{SIDES[k]!.map(s=>t('fe.px.lk.s.'+s).toLowerCase()).join(' / ')}</small>}</span></button>)}
        </div>
       </section>
       {sides&&<section className="grp"><div className="grp-t"><span>{we?t('fe.px.lk.sideWe'):t('fe.px.lk.side')}</span></div>
        <div className="card">
         <div className="chips">{sides.map(s=><button key={s} type="button" className={'chip'+(mySide===s?' on':'')} aria-pressed={mySide===s} onClick={()=>{setSide(s);setSideErr(false);setErr('');}}>
          {(we?t('fe.px.lk.we'):t('fe.px.lk.i'))+' · '+t('fe.px.lk.s.'+s).toLowerCase()}</button>)}</div>
         {sideErr&&<div className="ferr"><CircleAlert/>{t('fe.px.lk.pickSide')}</div>}
        </div>
        <p className="grp-n">{fill(t('fe.px.lk.opposite'),{name})}</p>
       </section>}
       <section className="grp"><div className="card list"><div className="li"><SelectRow label={t('fe.px.lk.vis')} value={vis} items={visItems(t)} onChange={setVis}/></div></div>
        <p className="grp-n">{t('fe.px.lk.visFoot')}</p></section>
       <div className="alert info mt16"><Info/><span>{conf?changed?fill(t('fe.ln.p22.infoChange'),{name}):t('fe.ln.p22.infoVis'):fill(t('fe.ln.p22.infoNew'),{name})}</span></div>
      </>}
     {err&&!sideErr&&<div className="alert err mt12" role="alert"><span>{err}</span></div>}
    </>}
  </div></div>
  {p&&mine&&<div className="ctabar"><div className="wrap">{cta}</div></div>}
 </>;
}

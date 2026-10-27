import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate,useParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {CircleAlert,Link2,Pencil,Plus,Trash2,User,Users,X} from 'lucide-react';
import {useToast as useToastV21} from './toast';
import {newOpId} from '../feture/fe-api';
import {Alert,Av,Bar,Btn,Card,Chip,Chips,Empty,Group,Note,RadioList,Row,SectionLabel,SelectRow,Skel,View} from './kit';
import {useFe} from './session';
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
 return <Group bare={!list.length} title={title} action={(list.length||inc.length)?<button type="button" onClick={manage}>{t('fe.mx.lk.manage')}</button>:null}>
  {inc.length>0&&<div className="lk-inc">{inc.map(l=><LinkRequest key={l.id} l={l} couple={couple} small busy={busy} onAnswer={a=>void answer(l,a)}/>)}</div>}
  {list.length?<Card list>{list.slice(0,4).map(l=>{const name=nameOf(l);const v=l.vis;
   return <Row key={l.id} av={<Av name={name} seed={l.other.id} size="sm" src={l.other.avatar}/>} title={<>{name}<NameBadges p={l.other}/></>}
    sub={linkLabel(t,l.kind,l.side)+(v!=='all'?' · '+(v==='us'?t('fe.mx.lk.visUs'):t('fe.mx.lk.visFollowers')):'')} onClick={()=>navigate('/n/people/'+l.other.id)}/>;})}</Card>
   :<Card><button type="button" className="ph-empty" onClick={manage}><span className="pe-ic"><Link2/></span>
    <span className="tx"><b>{t('fe.mx.lk.add')}</b><small>{couple?t('fe.mx.lk.addSubCouple'):t('fe.mx.lk.addSub')}</small></span><Plus/></button></Card>}
 </Group>;
}

/** A proposal (or a kind change) that waits for the acting profile's answer: who, what, «Подтвердить / Отклонить».
 * `small` is the compact card of the Me profile layer. */
function LinkRequest({l,couple,small,busy,onAnswer}:{l:LinkView,couple:boolean,small?:boolean,busy:boolean,onAnswer:(accept:boolean)=>void}){
 const {t}=useI18n();const navigate=useNavigate();const name=nameOf(l);const go=()=>navigate('/n/people/'+l.other.id);
 const who=<>{withAge(name,l.other)}<NameBadges p={l.other}/></>;
 return <Card className="rqcard lk-req">
  <div className="row"><button type="button" className="rq-av" aria-label={name} onClick={go}><Av name={name} seed={l.other.id} size={small?'sm':''} src={l.other.avatar}/></button>
   <button type="button" className="grow" onClick={go}>{small?<b>{who}</b>:<b style={{fontSize:16}}>{who}</b>}
    <Note>{l.change?fill(t('fe.ln.proposesChange'),{from:linkLabel(t,l.kind,l.side),to:t('fe.px.lk.k.'+l.change.kind)}):fill(couple?t('fe.ln.proposesCouple'):t('fe.ln.proposes'),{label:linkLabel(t,l.kind,l.side)})}</Note></button></div>
  <div className="row g8 mt12"><Btn size="md" disabled={busy} onClick={()=>onAnswer(true)}>{t('fe.ln.confirm')}</Btn><Btn size="md" kind="soft" disabled={busy} onClick={()=>onAnswer(false)}>{t('fe.ln.decline')}</Btn></div>
 </Card>;
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
  return <Row key={l.id} av={<Av name={name} seed={l.other.id} size="sm" src={l.other.avatar}/>} title={<>{name}<NameBadges p={l.other}/></>}
   sub={[linkLabel(t,l.kind,l.side),pend?'':visWord(l.vis),extra].filter(Boolean).join(' · ')} onClick={()=>setMenu({l,pend})}/>;};
 const m=menu?.l;
 return <>
  <Bar title={couple?t('fe.ln.titleCouple'):t('fe.ln.title')} back/>
  <View className="nodock">
   {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={pxError(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!r?<Skel kind="list"/>
    :<>
     {waiting.length>0&&<>
      <SectionLabel>{t('fe.ln.waiting')}</SectionLabel>
      <div className="lk-inc">{waiting.map(l=><LinkRequest key={l.id} l={l} couple={couple} busy={busy} onAnswer={a=>void answer(l,a)}/>)}</div>
     </>}
     <Group title={fill(t('fe.ln.confirmed'),{n:r.confirmed.length})}>
      {r.confirmed.length?<Card list>{r.confirmed.map(l=>row(l,false,l.change?.mine?t('fe.ln.changePending'):''))}</Card>
       :<Card><div className="lk-empty"><Note>{t('fe.ln.emptyText')}</Note><Note>{t('fe.ln.emptyHow')}</Note></div></Card>}
     </Group>
     {r.sent.length>0&&<Group title={fill(t('fe.ln.sent'),{n:r.sent.length})}>
      <Card list>{r.sent.map(l=>row(l,true,t('fe.ln.awaiting')))}</Card>
     </Group>}
     {from&&<Group title={t('fe.ln.requests')} foot={t('fe.ln.fromFoot')}>
      <Card list><div className="li"><SelectRow label={t('fe.ln.from')} value={from} options={(['all','follow','none'] as const).map(v=>[v,t('fe.ln.from.'+v)] as const)}
       onChange={v=>{if(busy)return;setFrom(v);void act(()=>call('profile.setVisibility',{opId:newOpId(),setting:'linksFrom',value:v},ok),t('fe.ln.t.saved'));}}/></div></Card>
     </Group>}
    </>}
  </View>
  {menu&&m&&<Sheet title={nameOf(m)} onClose={closeMenu}>
   <Card list>
    <Row noChev icon={User} title={t('fe.ln.open')} sub={linkLabel(t,m.kind,m.side)} onClick={()=>{closeMenu();navigate('/n/people/'+m.other.id);}}/>
    {!menu.pend&&<Row noChev icon={Pencil} title={t('fe.ln.change')} sub={t('fe.ln.changeSub')} onClick={()=>{closeMenu();navigate('/n/people/'+m.other.id+'/link');}}/>}
    {!menu.pend&&<div className="li"><SelectRow label={t('fe.px.lk.vis')} value={m.vis} options={visItems(t)}
     onChange={v=>{if(busy)return;setMenu({l:{...m,vis:v},pend:false});void act(()=>call('link.setVisibility',{opId:newOpId(),linkId:m.id,vis:v},ok),t('fe.ln.t.saved'));}}/></div>}
    <Row danger icon={menu.pend?X:Trash2} title={menu.pend?t('fe.ln.cancelReq'):t('fe.ln.remove')} sub={menu.pend?undefined:t('fe.ln.removeSub')} disabled={busy}
     onClick={()=>{if(menu.pend){closeMenu();void act(()=>call('link.remove',{opId:newOpId(),linkId:m.id},ok),t('fe.ln.t.cancelled'));}else{closeMenu();setRemoving(m);}}}/>
   </Card>
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
  <View className="nodock cta1">
   {error?<Empty icon={Users} role="alert" title={t('fe.feed.unavailable')} text={pxError(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!p||!mine?<Skel kind="list"/>
    :<>
     <Card list className="mt12"><Row av={<Av name={name} seed={p.id} src={mediaSrc(p.avatar)}/>} title={<>{name}{p.age?', '+p.age:''}</>} sub={city} onClick={()=>navigate('/n/people/'+id)}/></Card>
     {done?<Alert kind="ok" noIcon className="mt16">{done}</Alert>
      :ex&&ex.st!=='ok'?<Alert kind="info" className="mt16">{fill(ex.st==='in'?t('fe.ln.p22.incoming'):t('fe.ln.p22.sentAlready'),{name})}</Alert>
      :<>
       <Group className="p22-kinds21" title={t('fe.px.lk.kind')}>
        <RadioList label={t('fe.px.lk.kind')} value={kind} options={KINDS.map(k=>[k,t('fe.px.lk.k.'+k),SIDES[k]?.map(s=>t('fe.px.lk.s.'+s).toLowerCase()).join(' / ')] as const)}
         onChange={k=>{setKind(k);setSide(conf&&k===conf.kind?conf.side:null);setSideErr(false);setErr('');}}/>
       </Group>
       {sides&&<Group title={we?t('fe.px.lk.sideWe'):t('fe.px.lk.side')} foot={fill(t('fe.px.lk.opposite'),{name})}>
        <Card>
         <Chips>{sides.map(s=><Chip key={s} on={mySide===s} onClick={()=>{setSide(s);setSideErr(false);setErr('');}}>
          {(we?t('fe.px.lk.we'):t('fe.px.lk.i'))+' · '+t('fe.px.lk.s.'+s).toLowerCase()}</Chip>)}</Chips>
         {sideErr&&<div className="ferr"><CircleAlert/>{t('fe.px.lk.pickSide')}</div>}
        </Card>
       </Group>}
       <Group foot={t('fe.px.lk.visFoot')}><Card list><div className="li"><SelectRow label={t('fe.px.lk.vis')} value={vis} options={visItems(t)} onChange={setVis}/></div></Card></Group>
       <Alert kind="info" className="mt16">{conf?changed?fill(t('fe.ln.p22.infoChange'),{name}):t('fe.ln.p22.infoVis'):fill(t('fe.ln.p22.infoNew'),{name})}</Alert>
      </>}
     {err&&!sideErr&&<Alert kind="err" noIcon className="mt12">{err}</Alert>}
    </>}
  </View>
  {p&&mine&&<div className="ctabar"><div className="wrap">{cta}</div></div>}
 </>;
}

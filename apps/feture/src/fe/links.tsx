import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate,useParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {CircleAlert,Link2,Pencil,Plus,Trash2,User,Users,X} from 'lucide-react';
import {useToast as useToastV21} from './toast';
import {newOpId} from '../feture/fe-api';
import {AddCard,Alert,Ask,Av,Bar,Btn,Card,Chip,Chips,Empty,Group,IconBtn,Note,PersonLine,RadioList,RequestCard,Row,SearchInput,SectionLabel,Seg,SelectRow,Skel,Spacer,View} from './kit';
import {useFe,useKeyChange,useShown} from './session';
import {NameBadges,faceFields,withAge} from './faces';
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
 const {call,acting,peek}=useFe();const {t}=useI18n();const navigate=useNavigate();const toast=useToastV21();
 const [r,setR]=useShown<LinksMine|null>('links.block',()=>peek('links.mine',{},linksMineRes));const [busy,setBusy]=useState(false);
 const load=useCallback(()=>{call('links.mine',{},linksMineRes).then(setR).catch(()=>{});},[call]);
 useEffect(()=>{load();},[load]);
 if(!r)return null;
 const couple=acting?.kind==='couple';
 const inc=[...r.incoming,...r.confirmed.filter(l=>l.change&&!l.change.mine)];
 const list=r.confirmed;
 const manage=()=>navigate('/n/me/links');
 const answer=async(l:LinkView,accept:boolean)=>{setBusy(true);
  try{const res=await (l.change?call('link.answerChange',{opId:newOpId(),linkId:l.id,accept},ok):call('link.answer',{opId:newOpId(),linkId:l.id,accept,vis:'all'},ok));
   toast(res.pending?t('fe.ln.t.pending'):accept?(l.change?t('fe.ln.t.changeOk'):t('fe.ln.t.confirmed')):t('fe.ln.t.declined'),{type:'ok'});load();onChanged?.();}
  catch(e){toast(pxError(e,t),{type:'err'});}finally{setBusy(false);}};
 const title=inc.length?fill(t(inc.length===1?'fe.mx.lk.titleNew1':'fe.mx.lk.titleNew'),{n:inc.length}):t('fe.mx.lk.title');
 return <Group title={title} action={(list.length||inc.length)?<button type="button" onClick={manage}>{t('fe.mx.lk.manage')}</button>:null}>
  {inc.length>0&&<div className="lk-inc">{inc.map(l=><LinkRequest key={l.id} l={l} couple={couple} small busy={busy} onAnswer={a=>void answer(l,a)}/>)}</div>}
  {list.length?<Card list>{list.slice(0,4).map(l=>{const name=nameOf(l);const v=l.vis;
   return <Row key={l.id} av={<Av name={name} seed={l.other.id} size="sm" src={l.other.avatar}/>} title={<>{name}<NameBadges p={l.other}/></>}
    sub={linkLabel(t,l.kind,l.side)+(v!=='all'?' · '+(v==='us'?t('fe.mx.lk.visUs'):t('fe.mx.lk.visFollowers')):'')} onClick={()=>navigate('/n/people/'+l.other.id)}/>;})}</Card>
   :<AddCard icon={Link2} title={t('fe.mx.lk.add')} sub={couple?t('fe.mx.lk.addSubCouple'):t('fe.mx.lk.addSub')} onClick={manage}/>}
 </Group>;
}

/** A proposal (or a kind change) that waits for the acting profile's answer: who, what, «Подтвердить / Отклонить».
 * `small` is the compact card of the Me profile layer. */
function LinkRequest({l,couple,small,busy,onAnswer}:{l:LinkView,couple:boolean,small?:boolean,busy:boolean,onAnswer:(accept:boolean)=>void}){
 const {t}=useI18n();const navigate=useNavigate();const name=nameOf(l);const go=()=>navigate('/n/people/'+l.other.id);
 const who=<>{withAge(name,l.other)}<NameBadges p={l.other}/></>;
 return <RequestCard className="lk-req" person={<PersonLine small={small} av={<Av name={name} seed={l.other.id} size={small?'sm':''} src={l.other.avatar}/>} label={name} onOpen={go} name={who}
  sub={l.change?fill(t('fe.ln.proposesChange'),{from:linkLabel(t,l.kind,l.side),to:t('fe.px.lk.k.'+l.change.kind)}):fill(couple?t('fe.ln.proposesCouple'):t('fe.ln.proposes'),{label:linkLabel(t,l.kind,l.side)})}/>}
  actions={<><Btn size="md" disabled={busy} onClick={()=>onAnswer(true)}>{t('fe.ln.confirm')}</Btn><Btn size="md" kind="soft" disabled={busy} onClick={()=>onAnswer(false)}>{t('fe.ln.decline')}</Btn></>}/>;
}

/** «+» in «Мои связи» (V21 linkAdd / linkPick): whom to propose a link to — people the profile knows (follows or is
 * followed by) or anyone found by name / nickname. Someone already linked (or with a request either way) shows why
 * and cannot be picked; the rest open the link editor (P22). */
const knownRes=z.object({ok:z.literal(true),items:z.array(z.object({id:z.uuid(),kind:z.string(),handle:z.string().nullable(),name:z.string().nullable(),...faceFields}).passthrough())});
const searchRes=z.object({ok:z.literal(true),items:z.array(z.object({id:z.uuid(),kind:z.string(),handle:z.string().nullable(),name:z.string().nullable(),
 avatar:z.object({pending:z.boolean().optional(),src:z.record(z.string(),z.string()).nullable().optional()}).passthrough().nullable().optional()}).passthrough())});
type Pickable={id:string,kind:string,handle:string|null,name:string|null,src:string|null};
function LinkPicker({mine,onClose}:{mine:LinksMine,onClose:()=>void}){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const [tab,setTab]=useState<'known'|'all'>('known');const [q,setQ]=useState('');
 const [known,setKnown]=useState<Pickable[]|null>(null);const [found,setFound]=useState<Pickable[]|null>(null);
 useEffect(()=>{if(!acting)return;
  Promise.all([call('profile.followers',{profileId:acting.id,following:true},knownRes),call('profile.followers',{profileId:acting.id},knownRes)])
   .then(([a,b])=>{const seen=new Set<string>();setKnown([...a.items,...b.items].filter(x=>!seen.has(x.id)&&seen.add(x.id)).map(x=>({id:x.id,kind:x.kind,handle:x.handle,name:x.name,src:x.avatar??null})));})
   .catch(()=>setKnown([]));},[call,acting]);
 const term=q.trim();
 useEffect(()=>{setFound(null);if(tab!=='all'||term.length<2)return;const ctl=new AbortController();
  const timer=setTimeout(()=>call('people.search',{q:term},searchRes,{signal:ctl.signal})
   .then(r=>setFound(r.items.filter(x=>x.id!==acting?.id).map(x=>({id:x.id,kind:x.kind,handle:x.handle,name:x.name,src:mediaSrc(x.avatar?{src:x.avatar.src??null,...(x.avatar.pending!==undefined?{pending:x.avatar.pending}:{})}:null)})))).catch(()=>{if(!ctl.signal.aborted)setFound([]);}),350);
  return ()=>{clearTimeout(timer);ctl.abort();};},[tab,term,call,acting?.id]);
 const why=(id:string)=>mine.confirmed.some(l=>l.other.id===id)?t('fe.w7.lp.linked'):mine.sent.some(l=>l.other.id===id)?t('fe.w7.lp.sent')
  :mine.incoming.some(l=>l.other.id===id)?t('fe.w7.lp.incoming'):'';
 const needle=term.toLowerCase();
 const list=tab==='known'?known?.filter(p=>!needle||(p.name??'').toLowerCase().includes(needle)||(p.handle??'').toLowerCase().includes(needle))??null:found;
 return <Sheet full title={t('fe.w7.lp.title')} onClose={onClose}
  search={<SearchInput label={t(tab==='known'?'fe.w7.lp.findKnown':'fe.w7.lp.findAll')} value={q} onChange={e=>setQ(e.target.value)}/>}>
  <Seg value={tab} onChange={setTab} options={[{id:'known',label:t('fe.w7.lp.known')},{id:'all',label:t('fe.w7.lp.all')}]}/>
  <Spacer size={3}/>
  {tab==='all'&&term.length<2?<Note>{t('fe.w7.lp.typeHint')}</Note>
   :list===null?<Skel kind="list" rows={3}/>
   :!list.length?<Note>{tab==='known'&&!needle?t('fe.w7.lp.noKnown'):t('fe.w7.lp.none')}</Note>
   :<Card list>{list.map(p=>{const name=personName(p)||'?';const w=why(p.id);
    return <Row key={p.id} av={<Av name={name} seed={p.id} size="sm" src={p.src}/>} title={name} sub={w||(p.handle?'@'+p.handle:undefined)} disabled={!!w}
     onClick={()=>{onClose();navigate('/n/people/'+p.id+'/link');}}/>;})}</Card>}
 </Sheet>;
}

/** `/n/me/links` — SC.P21 for the own profile. */
export function LinksScreen(){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const [toastNode,toast]=useToast();
 const [r,setR]=useState<LinksMine|null>(null);const [from,setFrom]=useState<LinksFrom|null>(null);const [error,setError]=useState<unknown>(null);
 const [busy,setBusy]=useState(false);const [menu,setMenu]=useState<{l:LinkView,pend:boolean}|null>(null);const [removing,setRemoving]=useState<LinkView|null>(null);
 const [picking,setPicking]=useState(false);
 const load=useCallback(()=>{setError(null);Promise.all([call('links.mine',{},linksMineRes),call('profile.settings',{},settingsRes).catch(()=>null)])
  .then(([a,b])=>{setR(a);setFrom(b?.settings.linksFrom??null);}).catch(setError);},[call]);
 useKeyChange(acting?.id??'',()=>setR(null));
 useEffect(()=>{load();},[load]);
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
  <Bar title={couple?t('fe.ln.titleCouple'):t('fe.ln.title')} back>
   <IconBtn icon={Plus} kind="ghost" aria-haspopup="dialog" label={t('fe.w7.lp.add')} disabled={!r} onClick={()=>setPicking(true)}/>
  </Bar>
  {picking&&r&&<LinkPicker mine={r} onClose={()=>setPicking(false)}/>}
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
       :<Empty compact icon={Link2} title={t('fe.ln.emptyText')} text={t('fe.ln.emptyHow')}/>}
     </Group>
     {r.sent.length>0&&<Group title={fill(t('fe.ln.sent'),{n:r.sent.length})}>
      <Card list>{r.sent.map(l=>row(l,true,t('fe.ln.awaiting')))}</Card>
     </Group>}
     {from&&<Group title={t('fe.ln.requests')} foot={t('fe.ln.fromFoot')}>
      <Card list><SelectRow row label={t('fe.ln.from')} value={from} options={(['all','follow','none'] as const).map(v=>[v,t('fe.ln.from.'+v)] as const)}
       onChange={v=>{if(busy)return;setFrom(v);void act(()=>call('profile.setVisibility',{opId:newOpId(),setting:'linksFrom',value:v},ok),t('fe.ln.t.saved'));}}/></Card>
     </Group>}
    </>}
  </View>
  {menu&&m&&<Sheet title={nameOf(m)} onClose={closeMenu}>
   <Card list>
    <Row noChev icon={User} title={t('fe.ln.open')} sub={linkLabel(t,m.kind,m.side)} onClick={()=>{closeMenu();navigate('/n/people/'+m.other.id);}}/>
    {!menu.pend&&<Row noChev icon={Pencil} title={t('fe.ln.change')} sub={t('fe.ln.changeSub')} onClick={()=>{closeMenu();navigate('/n/people/'+m.other.id+'/link');}}/>}
    {!menu.pend&&<SelectRow row label={t('fe.px.lk.vis')} value={m.vis} options={visItems(t)}
     onChange={v=>{if(busy)return;setMenu({l:{...m,vis:v},pend:false});void act(()=>call('link.setVisibility',{opId:newOpId(),linkId:m.id,vis:v},ok),t('fe.ln.t.saved'));}}/>}
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
 // What the form opened with: leaving with anything else asks «Выйти без сохранения?» (the kit Sheet's `dirty` Ask).
 const start=useRef<{kind:Kind,side:string|null,vis:Vis}|null>(null);const [leaving,setLeaving]=useState(false);
 const load=useCallback(()=>{setError(null);Promise.all([call('profile.get',{profileId:id},personProfileRes),call('links.mine',{},linksMineRes)])
  .then(([a,b])=>{setP(a.profile);setMine(b);}).catch(setError);},[call,id]);
 useEffect(()=>{init.current=false;setDone('');load();},[load]);
 const ex:{l:LinkView,st:'ok'|'sent'|'in'}|undefined=mine?([...mine.confirmed.map(l=>({l,st:'ok' as const})),...mine.sent.map(l=>({l,st:'sent' as const})),...mine.incoming.map(l=>({l,st:'in' as const}))]
  .find(x=>x.l.other.id===id)):undefined;
 useEffect(()=>{if(!p||!mine||init.current)return;init.current=true;
  const cur=ex&&ex.st!=='in'?ex.l:null;
  const k0:Kind=cur&&(KINDS as readonly string[]).includes(cur.kind)?cur.kind as Kind:acting?.kind==='couple'||p.kind==='couple'?'friend':'play';
  setKind(k0);setSide(cur?.side??null);setVis(cur?.vis??'all');start.current={kind:k0,side:cur?.side??null,vis:cur?.vis??'all'};},[p,mine,ex,acting?.kind]);
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
 // «Обновить запрос» (V21 linkSend) for a request still waiting: the old one is taken back and the new one sent; if
 // sending fails, the old request is sent again so nothing is lost.
 const sentL=ex?.st==='sent'?ex.l:null;
 const sentChanged=!!sentL&&(kind!==sentL.kind||(!!sides&&mySide!==sentL.side)||vis!==sentL.vis);
 const update=async()=>{if(!sentL)return;
  if(sides&&!mySide){setSideErr(true);setErr(t('fe.px.lk.pickSide'));return;}
  setBusy(true);setErr('');
  try{await call('link.remove',{opId:newOpId(),linkId:sentL.id},ok);
   try{const r=await call('link.propose',{opId:op.current,profileId:id,kind,...(sides&&mySide?{mySide}:{}),vis},ok);setDone(r.pending?t('fe.px.lk.pending'):fill(t('fe.w7.ln.updated'),{name}));}
   catch(e){op.current=newOpId();
    await call('link.propose',{opId:newOpId(),profileId:id,kind:sentL.kind,...(sentL.side?{mySide:sentL.side}:{}),vis:sentL.vis},ok).catch(()=>{});
    throw e;}}
  catch(e){setErr(pxError(e,t));init.current=false;load();}finally{setBusy(false);}};
 const cancel=async()=>{if(!ex)return;setBusy(true);setErr('');
  try{await call('link.remove',{opId:newOpId(),linkId:ex.l.id},ok);setDone(t('fe.ln.t.cancelled'));}catch(e){setErr(pxError(e,t));}finally{setBusy(false);}};
 const city=p?.city?(locale==='en'?p.city.en:p.city.ru):null;
 const dirty=!done&&ex?.st!=='in'&&!!start.current&&(kind!==start.current.kind||mySide!==start.current.side||vis!==start.current.vis);
 const cta=done?<Btn onClick={()=>navigate(-1)}>{t('fe.ln.p22.done')}</Btn>
  :ex?.st==='in'?<Btn onClick={()=>navigate('/n/me/links')}>{t('fe.ln.p22.toLinks')}</Btn>
  :ex?.st==='sent'?<div className="row g8"><Btn kind="soft" className="danger" onClick={cancel} disabled={busy}>{t('fe.ln.cancelReq')}</Btn>
   <Btn onClick={update} busy={busy} disabled={busy||!sentChanged}>{t('fe.w7.ln.update')}</Btn></div>
  :<Btn onClick={send} disabled={busy}>{conf?changed?t(we?'fe.ln.p22.proposeChangeUs':'fe.ln.p22.proposeChange'):t('fe.ln.p22.save'):t(we?'fe.ln.p22.sendUs':'fe.ln.p22.send')}</Btn>;
 return <>
  <Bar title={conf||ex?.st==='sent'?t('fe.ln.p22.edit'):t('fe.ln.p22.new')} onBack={()=>{if(dirty)setLeaving(true);else navigate(-1);}}/>
  <View className="nodock cta1">
   {error?<Empty icon={Users} role="alert" title={t('fe.feed.unavailable')} text={pxError(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!p||!mine?<Skel kind="list"/>
    :<>
     <Card list className="mt12"><Row av={<Av name={name} seed={p.id} src={mediaSrc(p.avatar)}/>} title={<>{name}{p.age?', '+p.age:''}</>} sub={city} onClick={()=>navigate('/n/people/'+id)}/></Card>
     {done?<Alert kind="ok" noIcon className="mt16">{done}</Alert>
      :ex&&ex.st==='in'?<Alert kind="info" className="mt16">{fill(t('fe.ln.p22.incoming'),{name})}</Alert>
      :<>
       {ex?.st==='sent'&&<Alert kind="info" className="mt16">{fill(t('fe.w7.ln.sentEdit'),{name})}</Alert>}
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
       <Group foot={t('fe.px.lk.visFoot')}><Card list><SelectRow row label={t('fe.px.lk.vis')} value={vis} options={visItems(t)} onChange={setVis}/></Card></Group>
       <Alert kind="info" className="mt16">{conf?changed?fill(t('fe.ln.p22.infoChange'),{name}):t('fe.ln.p22.infoVis'):fill(t('fe.ln.p22.infoNew'),{name})}</Alert>
      </>}
     {err&&!sideErr&&<Alert kind="err" noIcon className="mt12">{err}</Alert>}
    </>}
  </View>
  {p&&mine&&<div className="ctabar"><div className="wrap">{cta}</div></div>}
  {leaving&&<Ask tone="a" title={t('fe.lo.leave.title')} text={t('fe.lo.leave.text')} ok={t('fe.lo.leave.ok')} cancel={t('fe.lo.leave.stay')} danger
   onOk={()=>{setLeaving(false);navigate(-1);}} onCancel={()=>setLeaving(false)}/>}
 </>;
}

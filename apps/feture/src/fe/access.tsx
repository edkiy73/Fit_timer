import {useCallback,useEffect,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Lock,LockOpen,Send,X} from 'lucide-react';
import {Av,Bar,Btn,Card,Chip,Empty,Group,LoadMore,Note,Pill,Row,Seg,Skel,Spacer,Stack,View} from './kit';
import {useFe} from './session';
import {NameBadges} from './faces';
import {GrantCard,grantsRes,incomingRes,nameOf,outRes,RequestCards,useAccessWords,useCancelRequest,useGrantActions,type GrantItem,type IncomingList,type OutItem} from './private';

/** V21 P07 — the one «Доступы» screen (owner, 29.10.2026: no duplicates): «Открыто» — requests to me waiting for
 * an answer, then who sees what (narrow / revoke); «Мне открыли»; «Мои запросы» (statuses, filter «Ждут ответа», cancel
 * a waiting request). «Я → Приватное» opens it on «Открыто», «Моё → Мне открыли» (`/n/me/shared` → `?tab=withme`)
 * on «Мне открыли». Lists are paged by the server. */
type Tab='byme'|'withme'|'out';
const TONE:Record<string,'ok'|'wait'|'v'|'bad'|undefined>={pending:'wait',partial:'ok',granted:'ok',revoked:'bad',replaced:'v'};

function usePaged<T,R extends {items:T[],next?:string|null|undefined}>(fetch:(cursor?:string)=>Promise<R>){
 const {t}=useI18n();const w=useAccessWords();
 const [first,setFirst]=useState<R|null>(null);const [items,setItems]=useState<T[]|null>(null);const [next,setNext]=useState<string|null>(null);
 const [error,setError]=useState<unknown>(null);const [busy,setBusy]=useState(false);
 const load=useCallback(()=>{setError(null);fetch().then(r=>{setFirst(r);setItems(r.items);setNext(r.next??null);}).catch(setError);},[fetch]);
 useEffect(()=>{load();},[load]);
 const [moreErr,setMoreErr]=useState<unknown>(null);
 const more=async()=>{if(!next||busy)return;setBusy(true);setMoreErr(null);try{const r=await fetch(next);setItems(l=>[...(l??[]),...r.items]);setNext(r.next??null);}catch(e){setMoreErr(e);}finally{setBusy(false);}};
 const moreBtn=<LoadMore more={!!next} busy={busy} error={moreErr} onMore={()=>void more()}/>;
 const failed=error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={w.err(error)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>:null;
 return {first,items,load,moreBtn,failed};
}

const TABS:Tab[]=['byme','withme','out'];

export function AccessScreen(){
 const {acting}=useFe();const {t}=useI18n();const [params,setParams]=useSearchParams();
 const cp=acting?.kind==='couple';const us=cp?'Us':'';
 const raw=params.get('tab') as Tab|null;const tab:Tab=raw&&TABS.includes(raw)?raw:'byme';
 const set=(k:string,v:string|null)=>{const n=new URLSearchParams(params);if(v)n.set(k,v);else n.delete(k);setParams(n,{replace:true});};
 const title=t('fe.ac.title'+us);
 return <>
  <Bar title={title} back small/>
  <View className="nodock">
   <Seg value={tab} onChange={v=>set('tab',v)} label={title} options={TABS.map(id=>({id,label:t('fe.ac.tab.'+id+us)}))}/>
   <Spacer size={3}/>
   {tab==='out'?<OutTab pendingOnly={params.get('f')==='pending'} onFilter={on=>set('f',on?'pending':null)}/>:tab==='withme'?<WithMeTab/>
    :<ByMeTab/>}
  </View>
 </>;
}

/** «Мои запросы»: every request with its state as I may know it; «Ждут ответа» filters; a waiting one can be cancelled. */
function OutTab({pendingOnly,onFilter}:{pendingOnly:boolean,onFilter:(on:boolean)=>void}){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();const w=useAccessWords();const cancel=useCancelRequest();
 const fetch=useCallback((cursor?:string)=>call('access.lists',{tab:'out',...(pendingOnly?{filter:'pending'}:{}),...(cursor?{cursor}:{})},outRes,{fresh:true}),[call,pendingOnly]);
 const pg=usePaged<OutItem,Awaited<ReturnType<typeof fetch>>>(fetch);
 const [busy,setBusy]=useState('');
 const q=pg.first?.quota;
 const head=<Stack row justify="between" align="center">
  <Note>{q?t('fe.ac.out.left',{left:q.left,max:q.max}):' '}</Note>
  <Chip filter on={pendingOnly} onClick={()=>onFilter(!pendingOnly)}>{t('fe.ac.out.pending')}</Chip>
 </Stack>;
 if(pg.failed)return <>{head}{pg.failed}</>;
 if(!pg.items)return <>{head}<Skel kind="list"/></>;
 if(!pg.items.length)return <>{head}<Empty icon={Send} title={t(pendingOnly?'fe.ac.out.emptyPending':'fe.ac.out.empty')} text={t('fe.ac.out.emptyText')}/></>;
 const profile=(r:OutItem)=>r.profile&&navigate('/n/people/'+r.profile.id);
 const action=(r:OutItem)=>r.state==='pending'?<Btn size="sm" kind="text" auto busy={busy===r.id} disabled={!!busy}
   onClick={async()=>{setBusy(r.id);if(await cancel(r.id))pg.load();setBusy('');}}>{t('fe.ac.pd.cancel')}</Btn>
  :r.state==='granted'||r.state==='partial'?<Btn size="sm" kind="text" auto onClick={()=>profile(r)}>{t('fe.ac.out.view')}</Btn>
  :['expired','revoked','replaced','cancelled','closed'].includes(r.state)||(r.state==='declined'&&!(r.reaskAt&&new Date(r.reaskAt)>new Date()))
   ?<Btn size="sm" kind="text" auto onClick={()=>profile(r)}>{t('fe.ac.out.again')}</Btn>:null;
 return <>{head}
  <Card list>{pg.items.map(r=><Row key={r.id} onClick={()=>profile(r)} av={<Av name={nameOf(r.profile)} seed={r.profile?.id??r.id} size="sm" src={r.profile?.avatar}/>}
   title={<>{nameOf(r.profile)}<NameBadges p={r.profile}/> <Pill tone={TONE[r.state]}>{t('fe.ac.st.'+r.state)}</Pill></>}
   sub={t('fe.ac.out.asked',{what:w.what(r.scopes),when:w.when(r.created_at)})}
   extra={<>
    {r.granted&&<small>{t('fe.ac.out.open',{what:w.what(r.granted.scopes),until:w.until(r.granted.until)})}</small>}
    {r.state==='declined'&&<small>{r.reaskAt&&new Date(r.reaskAt)>new Date()?t('fe.ac.out.reask',{n:w.days(r.reaskAt)}):t('fe.ac.out.reaskNow')}</small>}
   </>}
   end={action(r)}/>)}</Card>
  {pg.moreBtn}
 </>;
}

/** «Мне открыли»: whose private parts I see, what and until when; a row opens that profile. */
function WithMeTab(){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const w=useAccessWords();
 const fetch=useCallback((cursor?:string)=>call('access.lists',{tab:'withme',...(cursor?{cursor}:{})},grantsRes,{fresh:true}),[call]);
 const pg=usePaged<GrantItem,Awaited<ReturnType<typeof fetch>>>(fetch);
 if(pg.failed)return pg.failed;
 if(!pg.items)return <Skel kind="list"/>;
 if(!pg.items.length)return <Empty icon={LockOpen} title={t('fe.ac.wm.empty')} text={t(acting?.kind==='couple'?'fe.ac.wm.emptyTextUs':'fe.ac.wm.emptyText')}/>;
 return <><Card list>{pg.items.map((g,i)=><Row key={g.profile?.id??i} onClick={()=>g.profile&&navigate('/n/people/'+g.profile.id)}
  av={<Av name={nameOf(g.profile)} seed={g.profile?.id??String(i)} size="sm" src={g.profile?.avatar}/>}
  title={<>{nameOf(g.profile)}<NameBadges p={g.profile}/></>} sub={`${w.what(g.scopes)} · ${w.until(g.until)}`}/>)}</Card>{pg.moreBtn}</>;
}

/** «Открыто»: requests to me waiting for an answer first, then who sees which parts of my private part;
 * «Изменить» narrows, «Отозвать» after a question. */
function ByMeTab(){
 const {call}=useFe();const {t}=useI18n();const w=useAccessWords();
 // Requests to me are paged like the grants below (a long list is no longer cut at the first page); the server gives no total.
 const fetchIn=useCallback((cursor?:string)=>call('access.lists',{tab:'incoming',...(cursor?{cursor}:{})},incomingRes,{fresh:true}),[call]);
 const inPg=usePaged<IncomingList['items'][number],Awaited<ReturnType<typeof fetchIn>>>(fetchIn);
 const reloadIn=inPg.load;
 const fetch=useCallback((cursor?:string)=>call('access.lists',{tab:'byme',...(cursor?{cursor}:{})},grantsRes,{fresh:true}),[call]);
 const pg=usePaged<GrantItem,Awaited<ReturnType<typeof fetch>>>(fetch);
 const acts=useGrantActions(pg.load);
 const changed=()=>{reloadIn();pg.load();};
 if(pg.failed)return pg.failed;
 if(inPg.failed)return inPg.failed;
 if(!pg.items||!inPg.items||!inPg.first)return <Skel kind="card" rows={2}/>;
 const incoming:IncomingList={...inPg.first,items:inPg.items};
 const asks=incoming.items.length>0;
 if(!asks&&!pg.items.length)return <Empty icon={Lock} title={t('fe.ac.by.empty')} text={t('fe.ac.by.emptyText')}/>;
 return <>
  {asks&&<Group title={t('fe.ac.in.title')}><RequestCards data={incoming} onChanged={changed}/>{inPg.moreBtn}</Group>}
  {pg.items.length>0&&<Group title={asks?t('fe.ac.in.open'):undefined}><Stack gap={2}>{pg.items.map((g,i)=><GrantCard key={g.profile?.id??i} g={g} onEdit={()=>acts.edit(g)} onRevoke={()=>acts.revoke(g)}/>)}</Stack>{pg.moreBtn}</Group>}
  {acts.node}
 </>;
}

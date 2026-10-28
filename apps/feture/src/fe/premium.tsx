import {useCallback,useEffect,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {AtSign,Check,Crown,Gift,History,RotateCcw,Undo2,X} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Alert,Ask,Av,Bar,Btn,Card,Empty,Field,Group,Input,KeyValues,Note,PlanCards,PremiumFeats,PremiumHero,Row,SectionLabel,Sheet,Skel,Stack,ToggleRow,View} from './kit';
import {useToast} from './toast';
import {useFe} from './session';

/** V21 B01 Premium (wave 8): what Premium gives, plans, the purchase confirmation, auto-renewal, «Восстановить
 * покупки», gifts — all on the provider-agnostic server layer (`premium.*`). No payment provider is connected yet:
 * the server says so (`payments: false`) and the pay buttons explain that payment comes later; nothing is faked. */

const statusRes=z.object({ok:z.literal(true),premium:z.boolean(),until:z.string().nullable(),viaPartner:z.boolean(),
 source:z.enum(['purchase','gift','staff']).nullable().optional(),
 subscription:z.object({plan:z.string(),autoRenew:z.boolean(),renewsAt:z.string().nullable()}).nullable().optional(),
 payments:z.boolean().optional(),
 giftsSent:z.array(z.object({handle:z.string().nullable(),days:z.number(),anonymous:z.boolean(),at:z.string().nullable()})).optional()}).passthrough();
type Status=z.infer<typeof statusRes>;
const buyRes=z.object({ok:z.literal(true),purchaseId:z.string(),state:z.enum(['paid','pending']),url:z.string().optional(),until:z.string().nullable().optional()});
const restoreRes=z.object({ok:z.literal(true),restored:z.number(),providers:z.number(),premium:z.boolean()});
const renewRes=z.object({ok:z.literal(true),autoRenew:z.boolean()});
const giftCheckRes=z.object({ok:z.literal(true),recipient:z.object({id:z.string(),handle:z.string().nullable(),name:z.string().nullable(),avatar:z.string().nullable()}),queued:z.boolean()});
type Recipient=z.infer<typeof giftCheckRes>;

export const useDate=()=>{const {locale}=useI18n();return (v:string)=>new Date(v).toLocaleDateString(locale==='en'?'en-GB':'ru-RU',{day:'numeric',month:'long',year:'numeric'});};

/** The account's Premium state (`premium.status`); null while loading or unknown. Shared with the settings row. */
export function usePremiumStatus(){
 const {call}=useFe();const [status,setStatus]=useState<Status|null>(null);const [error,setError]=useState<unknown>(null);
 const load=useCallback((fresh=false)=>{setError(null);call('premium.status',{},statusRes,{fresh}).then(setStatus).catch(setError);},[call]);
 useEffect(()=>{load();},[load]);
 return {status,error,load};
}

type Feat='undo'|'history';
type Plan='year'|'month';
type GiftPlan='m1'|'m3'|'m12';
const FEAT_ICONS={undo:Undo2,history:History};
function useFeats(){
 const {t}=useI18n();
 return (['undo','history'] as const).map(id=>({id,icon:FEAT_ICONS[id],title:t('fe.ax.prem.f.'+id),text:t('fe.ax.prem.f.'+id+'Text')}));
}
function usePlans(){
 const {t}=useI18n();
 return (['year','month'] as const).map(id=>({id,title:t('fe.ax.prem.'+id),price:t('fe.ax.prem.'+id+'Price'),note:t('fe.ax.prem.'+id+'Note'),...(id==='year'?{badge:t('fe.ax.prem.yearBadge')}:{})}));
}

/** Starts a purchase or a gift when payments exist; follows the provider's page or reports the result. */
function usePay(onDone:()=>void){
 const {call}=useFe();const {t}=useI18n();const toast=useToast();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const pay=async(action:'premium.purchase'|'premium.gift',input:Record<string,unknown>,doneText:string)=>{
  setBusy(true);setError('');
  try{const r=await call(action,{opId:newOpId(),...input},buyRes,{asAccount:true});
   if(r.state==='pending'&&r.url){toast(t('fe.w8.gift.pending'),{type:'info'});window.location.assign(r.url);return;}
   toast(doneText,{type:'ok'});onDone();}
  catch(e){setError(e instanceof FeError&&e.code==='payments_unavailable'?t('fe.w8.buy.soonText'):e instanceof FeError?feErrorMessage(e,t):t('fe.w8.buy.failed'));}
  finally{setBusy(false);}
 };
 return {pay,busy,error};
}

/** «Оформить» → the confirmation with the price. Without payments it says so instead of a working pay button. */
function BuySheet({plan,payments,onClose,onDone}:{plan:Plan,payments:boolean,onClose:()=>void,onDone:()=>void}){
 const {t}=useI18n();const {pay,busy,error}=usePay(()=>{onClose();onDone();});
 const price=t('fe.ax.prem.'+plan+'Price');
 return <Sheet title={t('fe.w8.buy.title')} onClose={onClose}
  foot={payments?<Btn busy={busy} onClick={()=>void pay('premium.purchase',{plan},t('fe.w8.buy.done'))}>{t('fe.w8.buy.pay',{price})}</Btn>:<Btn kind="soft" onClick={onClose}>{t('fe.close')}</Btn>}>
  <KeyValues rows={[[t('fe.w8.buy.plan'),t('fe.ax.prem.'+plan)],[t('fe.w8.buy.price'),price]]}/>
  <Note className="mt12">{t('fe.w8.prem.charge',{price,period:t(plan==='year'?'fe.w8.prem.periodYear':'fe.w8.prem.periodMonth')})}</Note>
  {!payments&&<Alert kind="info" className="mt12"><b>{t('fe.w8.buy.soon')}</b>{t('fe.w8.buy.soonText')}</Alert>}
  {error&&<Alert kind="err" className="mt12">{error}</Alert>}
 </Sheet>;
}

/** V21 paywall sheet (pwPlan / pwMore): opened where a Premium feature was tried. */
export function PaywallSheet({kind,onClose}:{kind:Feat|null,onClose:()=>void}){
 const {t}=useI18n();const navigate=useNavigate();const feats=useFeats();const plans=usePlans();
 const {status,load}=usePremiumStatus();const [plan,setPlan]=useState<Plan>('year');const [buy,setBuy]=useState(false);
 if(buy)return <BuySheet plan={plan} payments={!!status?.payments} onClose={()=>setBuy(false)} onDone={()=>{load(true);onClose();}}/>;
 return <Sheet title="FetUre Premium" onClose={onClose}
  foot={<Stack gap={2}><Btn onClick={()=>setBuy(true)}>{t('fe.ax.prem.buy',{price:t('fe.ax.prem.'+plan+'Price')})}</Btn>
   <Note>{t('fe.w8.pw.note')}</Note>
   <Btn kind="text" onClick={()=>{onClose();navigate('/n/premium'+(kind?'?for='+kind:''));}}>{t('fe.w8.buy.more')}</Btn></Stack>}>
  <PremiumHero lead={t('fe.ax.prem.lead')}/>
  <PremiumFeats items={feats} current={kind} neededLabel={t('fe.ax.prem.needed')}/>
  <PlanCards<Plan> label={t('fe.ax.prem.plan')} plans={plans} value={plan} onChange={setPlan}/>
 </Sheet>;
}

/** Anywhere in the app: `openPaywall('undo')` shows the paywall sheet (the host lives in the app frame). */
const PAYWALL_EVENT='fe-paywall';
export function openPaywall(kind:Feat){window.dispatchEvent(new CustomEvent(PAYWALL_EVENT,{detail:kind}));}
export function PaywallHost(){
 const [kind,setKind]=useState<Feat|null|false>(false);
 useEffect(()=>{const on=(e:Event)=>setKind(((e as CustomEvent).detail as Feat)??null);window.addEventListener(PAYWALL_EVENT,on);return ()=>window.removeEventListener(PAYWALL_EVENT,on);},[]);
 return kind===false?null:<PaywallSheet kind={kind} onClose={()=>setKind(false)}/>;
}

/** Gift Premium (giftPremium → giftFind / giftChange / giftPlan / giftAnon → giftPay / giftBack → giftPayDo). `handle`
 * fixes the recipient (from their profile menu). */
export function GiftSheet({handle,onClose,onDone}:{handle?:string|null|undefined,onClose:()=>void,onDone?:()=>void}){
 const {call}=useFe();const {t}=useI18n();const {status}=usePremiumStatus();
 const [nick,setNick]=useState(handle??'');const [to,setTo]=useState<Recipient|null>(null);const [findErr,setFindErr]=useState('');const [finding,setFinding]=useState(false);
 const [plan,setPlan]=useState<GiftPlan>('m1');const [anon,setAnon]=useState(false);const [step,setStep]=useState<'form'|'confirm'>('form');
 const {pay,busy,error}=usePay(()=>{onClose();onDone?.();});
 const find=useCallback(async(v:string)=>{
  const h=v.trim().replace(/^@+/,'');if(h.length<3){setFindErr(t('fe.w8.gift.notFound'));return;}
  setFinding(true);setFindErr('');
  try{setTo(await call('premium.giftCheck',{handle:h},giftCheckRes,{asAccount:true,fresh:true}));}
  catch(e){setFindErr(e instanceof FeError&&e.code==='not_found'?t('fe.w8.gift.notFound'):e instanceof FeError&&e.rule==='gift_self'?t('fe.w8.gift.self'):feErrorMessage(e,t));}
  finally{setFinding(false);}
 },[call,t]);
 useEffect(()=>{if(handle)void find(handle);},[handle,find]);
 const price=t('fe.w8.gift.'+plan+'Price');
 const name=to?.recipient.name||to?.recipient.handle||'';
 const person=to&&<Card list><Row noChev av={<Av name={name} seed={to.recipient.id} src={to.recipient.avatar}/>} title={name} sub={to.recipient.handle?'@'+to.recipient.handle:undefined}
  end={handle||step==='confirm'?undefined:<Btn kind="text" size="sm" auto onClick={()=>{setTo(null);setNick('');}}>{t('fe.w8.gift.change')}</Btn>}/></Card>;
 if(step==='confirm'&&to)return <Sheet title={t('fe.w8.gift.confirmTitle')} onClose={onClose}
  foot={<Stack gap={2}>{status?.payments?<Btn busy={busy} onClick={()=>void pay('premium.gift',{handle:to.recipient.handle,plan,anonymous:anon},t('fe.w8.gift.done'))}>{t('fe.w8.buy.pay',{price})}</Btn>:null}
   <Btn kind={status?.payments?'text':'soft'} onClick={()=>setStep('form')}>{t('fe.w8.gift.back')}</Btn></Stack>}>
  {person}
  <KeyValues rows={[[t('fe.w8.gift.term'),t('fe.w8.gift.'+plan)],[t('fe.w8.buy.price'),price],[t('fe.w8.gift.anon'),anon?t('fe.w8.yes'):t('fe.w8.no')]]}/>
  {!status?.payments&&<Alert kind="info" className="mt12"><b>{t('fe.w8.buy.soon')}</b>{t('fe.w8.buy.soonText')}</Alert>}
  {error&&<Alert kind="err" className="mt12">{error}</Alert>}
 </Sheet>;
 return <Sheet title={t('fe.w8.gift.title')} onClose={onClose} dirty={!!nick&&!handle}
  foot={to?<Btn onClick={()=>setStep('confirm')}>{t('fe.w8.gift.next',{price})}</Btn>:undefined}>
  {to?person:<Stack gap={2}>
   <Field id="fe-gift-nick" label={t('fe.w8.gift.nick')} hint={t('fe.w8.gift.nickHint')} error={findErr||undefined}>
    <Input id="fe-gift-nick" value={nick} autoCapitalize="off" spellCheck={false} placeholder="mia" invalid={!!findErr}
     onChange={e=>{setNick(e.target.value);setFindErr('');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void find(nick);}}}/>
   </Field>
   <Btn kind="soft" size="md" icon={AtSign} busy={finding} onClick={()=>void find(nick)}>{t('fe.w8.gift.find')}</Btn>
  </Stack>}
  {to?.queued&&<Alert kind="info" className="mt12">{t('fe.w8.gift.queued',{name})}</Alert>}
  {to&&<>
   <SectionLabel>{t('fe.w8.gift.term')}</SectionLabel>
   <PlanCards<GiftPlan> label={t('fe.w8.gift.term')} value={plan} onChange={setPlan}
    plans={(['m1','m3','m12'] as const).map(id=>({id,title:t('fe.w8.gift.'+id),price:t('fe.w8.gift.'+id+'Price')}))}/>
   <Card list className="mt12"><ToggleRow title={t('fe.w8.gift.anon')} sub={t('fe.w8.gift.anonSub')} on={anon} onClick={()=>setAnon(v=>!v)}/></Card>
  </>}
 </Sheet>;
}

export function PremiumScreen(){
 const {t}=useI18n();const date=useDate();const [params]=useSearchParams();const toast=useToast();const {call}=useFe();
 const kind=params.get('for') as Feat|null;const feats=useFeats();const plans=usePlans();
 const {status,error,load}=usePremiumStatus();const [plan,setPlan]=useState<Plan>('year');
 const [sheet,setSheet]=useState<null|'buy'|'gift'|'cancel'>(null);const [busy,setBusy]=useState<null|'renew'|'restore'>(null);
 const premium=!!status?.premium;const sub=status?.subscription??null;
 const restore=async()=>{setBusy('restore');
  try{const r=await call('premium.restore',{opId:newOpId()},restoreRes,{asAccount:true});
   toast(r.restored?t('fe.w8.prem.restored',{n:String(r.restored)}):t('fe.w8.prem.restoreNone'),{type:r.restored?'ok':'info'});if(r.restored)load(true);}
  catch(e){toast(feErrorMessage(e,t),{type:'err'});}finally{setBusy(null);}};
 const renew=async(on:boolean)=>{setBusy('renew');
  try{await call('premium.setRenewal',{opId:newOpId(),autoRenew:on},renewRes,{asAccount:true});setSheet(null);toast(t(on?'fe.w8.prem.resumed':'fe.w8.prem.cancelled'),{type:'ok'});load(true);}
  catch(e){toast(feErrorMessage(e,t),{type:'err'});}finally{setBusy(null);}};
 const until=status?.until?date(status.until):'';
 return <>
  <Bar title="" back/>
  <View className={'nodock'+(status&&!premium?' cta1':'')}>
   <PremiumHero lead={t('fe.ax.prem.lead')}/>
   {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={()=>load(true)}>{t('fe.retry')}</Btn></Empty>
    :!status?<Skel kind="list"/>:<>
    {premium&&<Alert kind="ok" icon={Check} className="mt12">{status.viaPartner
     ?<><b>{t('fe.ax.prem.viaPartner')}</b>{t('fe.ax.prem.viaPartnerText')}</>
     :<><b>{status.source==='gift'?t('fe.w8.prem.gift'):t('fe.ax.prem.active')}</b>{until?t('fe.ax.prem.until',{date:until}):''}</>}</Alert>}
    {premium&&!status.viaPartner&&<Group title={t('fe.w8.prem.manage')}>
     <Card list>
      {sub?<ToggleRow icon={RotateCcw} title={t('fe.w8.prem.renew')} disabled={busy==='renew'}
        sub={sub.autoRenew?t('fe.w8.prem.renewsOn',{date:sub.renewsAt?date(sub.renewsAt):until}):t('fe.w8.prem.renewsOff',{date:until})}
        on={sub.autoRenew} onClick={()=>sub.autoRenew?setSheet('cancel'):void renew(true)}/>
       :<Row icon={RotateCcw} title={t('fe.w8.prem.renew')} sub={t('fe.w8.prem.noRenew',{date:until})}/>}
     </Card>
    </Group>}
    <div className="free14"><Check/><span><b>{t('fe.ax.prem.freeTitle')}</b>{t('fe.ax.prem.freeText')}</span></div>
    <SectionLabel>{t('fe.ax.prem.what')}</SectionLabel>
    <PremiumFeats items={feats} current={kind} neededLabel={premium?undefined:t('fe.ax.prem.needed')}/>
    {!premium&&<>
     <SectionLabel>{t('fe.ax.prem.plan')}</SectionLabel>
     <PlanCards<Plan> label={t('fe.ax.prem.plan')} plans={plans} value={plan} onChange={setPlan}/>
     <Note className="mt12">{t('fe.w8.prem.charge',{price:t('fe.ax.prem.'+plan+'Price'),period:t(plan==='year'?'fe.w8.prem.periodYear':'fe.w8.prem.periodMonth')})}</Note>
     {!status.payments&&<div id="fe-ax-soon"><Note className="mt12"><b>{t('fe.w8.buy.soon')}.</b> {t('fe.w8.buy.soonText')}</Note></div>}
    </>}
    <Card list className="mt12"><Row icon={RotateCcw} title={t('fe.w8.prem.restore')} sub={t('fe.w8.prem.restoreSub')} noChev disabled={busy==='restore'} onClick={()=>void restore()}/></Card>
    <Group title={t('fe.w8.prem.giftTitle')}>
     <Card list>
      <Row icon={Gift} tone="l" title={t('fe.w8.prem.giftRow')} sub={t('fe.w8.prem.giftRowSub')} onClick={()=>setSheet('gift')}/>
      {(status.giftsSent??[]).map((g,i)=><Row key={i} icon={Crown} title={g.handle?'@'+g.handle:'—'}
       sub={t('fe.w8.prem.giftSent',{term:g.days>=365?t('fe.w8.gift.m12'):g.days>=90?t('fe.w8.gift.m3'):t('fe.w8.gift.m1'),when:g.at?date(g.at):''})+(g.anonymous?' · '+t('fe.w8.prem.anon'):'')}/>)}
     </Card>
    </Group>
    <SectionLabel>{t('fe.ax.prem.honest')}</SectionLabel>
    <Card>{(['h1','h2','h3'] as const).map(k=><div key={k} className="fact"><i className="g"><Check/></i><span>{t('fe.ax.prem.'+k)}</span></div>)}</Card>
   </>}
  </View>
  {status&&!premium&&<div className="ctabar"><div className="wrap"><Btn aria-describedby={status.payments?undefined:'fe-ax-soon'} onClick={()=>setSheet('buy')}>{t('fe.ax.prem.buy',{price:t('fe.ax.prem.'+plan+'Price')})}</Btn></div></div>}
  {sheet==='buy'&&status&&<BuySheet plan={plan} payments={!!status.payments} onClose={()=>setSheet(null)} onDone={()=>load(true)}/>}
  {sheet==='gift'&&<GiftSheet onClose={()=>setSheet(null)} onDone={()=>load(true)}/>}
  {sheet==='cancel'&&<Ask title={t('fe.w8.prem.cancelTitle')} text={t('fe.w8.prem.cancelText',{date:until})} ok={t('fe.w8.prem.cancelOk')} danger busy={busy==='renew'}
   onOk={()=>void renew(false)} onCancel={()=>setSheet(null)}/>}
 </>;
}

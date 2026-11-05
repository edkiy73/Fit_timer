import {useCallback,useEffect,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {AtSign,Check,Crown,Gift,History,RotateCcw,Undo2,X} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Actions,Alert,Ask,Av,Bar,Btn,Card,Empty,Field,Group,Input,KeyValues,Note,PlanCards,PremiumFeats,PremiumHero,Row,SectionLabel,Sheet,Skel,Spacer,Stack,ToggleRow,View,Who} from './kit';
import {useToast,useFail} from './toast';
import {useFe,useShown} from './session';

/** V21 B01 Premium (wave 8): what Premium gives, plans, the purchase confirmation, auto-renewal, «Восстановить
 * покупки», gifts — all on the provider-agnostic server layer (`premium.*`). No payment provider is connected yet:
 * the server says so (`payments: false`) and the pay buttons explain that payment comes later; nothing is faked. */

const statusRes=z.object({ok:z.literal(true),premium:z.boolean(),until:z.string().nullable(),viaPartner:z.boolean(),
 source:z.enum(['purchase','gift','staff']).nullable().optional(),
 subscription:z.object({plan:z.string(),autoRenew:z.boolean(),renewsAt:z.string().nullable()}).nullable().optional(),
 payments:z.boolean().optional(),
 partner:z.object({name:z.string().nullable(),until:z.string()}).nullable().optional(),
 prices:z.object({currency:z.string(),month:z.number(),year:z.number(),m1:z.number(),m3:z.number(),m12:z.number(),pairFactor:z.number()}).optional(),
 giftsSent:z.array(z.object({handle:z.string().nullable(),days:z.number(),anonymous:z.boolean(),at:z.string().nullable()})).optional()}).passthrough();
type Status=z.infer<typeof statusRes>;
const purchaseRes=z.object({ok:z.literal(true),state:z.enum(['pending','paid','failed','canceled','refunded'])});
const buyRes=z.object({ok:z.literal(true),purchaseId:z.string(),state:z.enum(['paid','pending']),url:z.string().optional(),until:z.string().nullable().optional()});
const restoreRes=z.object({ok:z.literal(true),restored:z.number(),providers:z.number(),premium:z.boolean()});
const renewRes=z.object({ok:z.literal(true),autoRenew:z.boolean()});
const giftCheckRes=z.object({ok:z.literal(true),recipient:z.object({id:z.string(),handle:z.string().nullable(),name:z.string().nullable(),avatar:z.string().nullable()}),queued:z.boolean(),kind:z.enum(['person','couple']).optional()});
type Recipient=z.infer<typeof giftCheckRes>;

/** Prices come from the server (set in the staff area): cents → «11,99 €». `—` until the status is known. */
export function useMoney(){const {locale}=useI18n();return (cents:number|undefined,cur='EUR')=>cents===undefined?'—':new Intl.NumberFormat(locale==='en'?'en-GB':'ru-RU',{style:'currency',currency:cur}).format(cents/100);}

export const useDate=()=>{const {locale}=useI18n();return (v:string)=>new Date(v).toLocaleDateString(locale==='en'?'en-GB':'ru-RU',{day:'numeric',month:'long',year:'numeric'});};

/** The account's Premium state (`premium.status`); null while loading or unknown. Shared with the settings row. */
export function usePremiumStatus(){
 const {call,peek}=useFe();const [status,setStatus]=useShown<Status|null>('premium.status',()=>peek('premium.status',{},statusRes));const [error,setError]=useState<unknown>(null);
 const load=useCallback((fresh=false)=>{setError(null);call('premium.status',{},statusRes,{fresh}).then(setStatus).catch(setError);},[call]);
 useEffect(()=>{load();},[load]);
 return {status,error,load};
}

type Feat='undo'|'history';
type Prices=NonNullable<Status['prices']>;
type Plan='year'|'month';
type GiftPlan='m1'|'m3'|'m12';
const FEAT_ICONS={undo:Undo2,history:History,crown:Crown};
function useFeats(){
 const {t}=useI18n();
 return (['undo','history','crown'] as const).map(id=>({id,icon:FEAT_ICONS[id],title:t('fe.ax.prem.f.'+id),text:t('fe.ax.prem.f.'+id+'Text')}));
}
/** The two plans with the prices the server sends; the year's «−44%» and «per month» are worked out from them. */
function usePlans(prices:Prices|undefined){
 const {t}=useI18n();const money=useMoney();const cur=prices?.currency;
 const off=prices&&prices.month>0?Math.max(0,Math.round((1-prices.year/(12*prices.month))*100)):0;
 return (['year','month'] as const).map(id=>({id,title:t('fe.ax.prem.'+id),price:money(prices?.[id],cur),
  note:id==='year'?t('fe.ax.prem.yearNote',{price:money(prices?Math.round(prices.year/12):undefined,cur)}):t('fe.ax.prem.monthNote'),
  ...(id==='year'&&off>0?{badge:'−'+off+'%'}:{})}));
}

/** Starts a purchase or a gift when payments exist; follows the provider's page or reports the result. */
function usePay(onDone:()=>void){
 const {call}=useFe();const {t}=useI18n();const toast=useToast();const [busy,setBusy]=useState(false);const setError=useFail();
 const pay=async(action:'premium.purchase'|'premium.gift',input:Record<string,unknown>,doneText:string)=>{
  setBusy(true);setError('');
  try{const r=await call(action,{opId:newOpId(),...input},buyRes,{asAccount:true});
   if(r.state==='pending'&&r.url){toast(t('fe.w8.gift.pending'),{type:'info'});window.location.assign(r.url);return;}
   toast(doneText,{type:'ok'});onDone();}
  catch(e){setError(e instanceof FeError&&e.code==='payments_unavailable'?t('fe.w8.buy.soonText'):e instanceof FeError?feErrorMessage(e,t):t('fe.w8.buy.failed'));}
  finally{setBusy(false);}
 };
 return {pay,busy};
}

/** «Оформить» → the confirmation with the price. Without payments it says so instead of a working pay button. */
function BuySheet({plan,payments,prices,onClose,onDone}:{plan:Plan,payments:boolean,prices:Prices|undefined,onClose:()=>void,onDone:()=>void}){
 const {t}=useI18n();const money=useMoney();const {pay,busy}=usePay(()=>{onClose();onDone();});
 const price=money(prices?.[plan],prices?.currency);
 return <Sheet title={t('fe.w8.buy.title')} onClose={onClose}
  foot={payments?<Btn busy={busy} onClick={()=>void pay('premium.purchase',{plan},t('fe.w8.buy.done'))}>{t('fe.w8.buy.pay',{price})}</Btn>:<Btn kind="soft" onClick={onClose}>{t('fe.close')}</Btn>}>
  <Stack gap={3}>
   <KeyValues rows={[[t('fe.w8.buy.plan'),t('fe.ax.prem.'+plan)],[t('fe.w8.buy.price'),price]]}/>
   {payments?<Note>{t('fe.w8.prem.charge',{price,period:t(plan==='year'?'fe.w8.prem.periodYear':'fe.w8.prem.periodMonth')})}</Note>
    :<Alert kind="info"><b>{t('fe.w8.buy.soon')}</b>{t('fe.w8.buy.soonText')}</Alert>}
  </Stack>
 </Sheet>;
}

/** V21 paywall sheet (pwPlan / pwMore): opened where a Premium feature was tried. */
export function PaywallSheet({kind,onClose}:{kind:Feat|null,onClose:()=>void}){
 const {t}=useI18n();const navigate=useNavigate();const feats=useFeats();const money=useMoney();
 const {status,load}=usePremiumStatus();const plans=usePlans(status?.prices);const [plan,setPlan]=useState<Plan>('year');const [buy,setBuy]=useState(false);
 if(buy)return <BuySheet plan={plan} payments={!!status?.payments} prices={status?.prices} onClose={()=>setBuy(false)} onDone={()=>{load(true);onClose();}}/>;
 return <Sheet title={t('fe.w8.prem.brand')} onClose={onClose}
  foot={<><Btn onClick={()=>setBuy(true)}>{t('fe.ax.prem.buy',{price:money(status?.prices?.[plan],status?.prices?.currency)})}</Btn>
   <Note>{t('fe.w8.pw.note')}</Note>
   <Btn kind="text" onClick={()=>{onClose();navigate('/n/premium'+(kind?'?for='+kind:''));}}>{t('fe.w8.buy.more')}</Btn></>}>
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
 const {pay,busy}=usePay(()=>{onClose();onDone?.();});
 const find=useCallback(async(v:string)=>{
  const h=v.trim().replace(/^@+/,'');if(h.length<3){setFindErr(t('fe.w8.gift.notFound'));return;}
  setFinding(true);setFindErr('');
  try{setTo(await call('premium.giftCheck',{handle:h},giftCheckRes,{asAccount:true,fresh:true}));}
  catch(e){setFindErr(e instanceof FeError&&e.code==='not_found'?t('fe.w8.gift.notFound'):e instanceof FeError&&e.rule==='gift_self'?t('fe.w8.gift.self'):feErrorMessage(e,t));}
  finally{setFinding(false);}
 },[call,t]);
 useEffect(()=>{if(handle)void find(handle);},[handle,find]);
 const money=useMoney();const pair=to?.kind==='couple';const gp=status?.prices;const priceOf=(id:GiftPlan)=>money(gp?gp[id]*(pair?gp.pairFactor:1):undefined,gp?.currency);
 const price=priceOf(plan);
 const name=to?.recipient.name||to?.recipient.handle||'';
 const person=to&&<Card list><Row noChev av={<Av name={name} seed={to.recipient.id} src={to.recipient.avatar}/>} title={<Who name={name} nick={to.recipient.handle}/>}
  end={handle||step==='confirm'?undefined:<Btn kind="text" size="sm" auto onClick={()=>{setTo(null);setNick('');}}>{t('fe.w8.gift.change')}</Btn>}/></Card>;
 if(step==='confirm'&&to)return <Sheet title={t('fe.w8.gift.confirmTitle')} onClose={onClose}
  foot={<Actions stack>{status?.payments?<Btn busy={busy} onClick={()=>void pay('premium.gift',{handle:to.recipient.handle,plan,anonymous:anon},t('fe.w8.gift.done'))}>{t('fe.w8.buy.pay',{price})}</Btn>:null}
   <Btn kind={status?.payments?'text':'soft'} onClick={()=>setStep('form')}>{t('fe.w8.gift.back')}</Btn></Actions>}>
  <Stack gap={3}>
   {person}
   <KeyValues rows={[[t('fe.w8.gift.term'),t('fe.w8.gift.'+plan)],[t('fe.w8.buy.price'),price],[t('fe.w8.gift.anon'),anon?t('fe.w8.yes'):t('fe.w8.no')]]}/>
   {!status?.payments&&<Alert kind="info"><b>{t('fe.w8.buy.soon')}</b>{t('fe.w8.buy.soonText')}</Alert>}
  </Stack>
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
  {pair&&<Alert kind="info">{t('fe.w8.gift.pairNote',{name})}</Alert>}
  {to&&<Note>{t('fe.w8.gift.opens')}</Note>}
  {to?.queued&&<Alert kind="info">{t(pair?'fe.w8.gift.queuedPair':'fe.w8.gift.queued',{name})}</Alert>}
  {to&&<>
   <SectionLabel>{t('fe.w8.gift.term')}</SectionLabel>
   <PlanCards<GiftPlan> label={t('fe.w8.gift.term')} value={plan} onChange={setPlan}
    plans={(['m1','m3','m12'] as const).map(id=>({id,title:t('fe.w8.gift.'+id),price:priceOf(id)}))}/>
   <Spacer size={3}/><Card list><ToggleRow title={t('fe.w8.gift.anon')} sub={t('fe.w8.gift.anonSub')} on={anon} onClick={()=>setAnon(v=>!v)}/></Card>
  </>}
 </Sheet>;
}

export function PremiumScreen(){
 const {t}=useI18n();const date=useDate();const [params]=useSearchParams();const toast=useToast();const {call}=useFe();
 const kind=params.get('for') as Feat|null;const feats=useFeats();const money=useMoney();
 const {status,error,load}=usePremiumStatus();const plans=usePlans(status?.prices);const [plan,setPlan]=useState<Plan>('year');
 const planPrice=money(status?.prices?.[plan],status?.prices?.currency);
 const back=params.get('purchase');const navigate=useNavigate();
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
 // Back from the provider's page: ask what became of the purchase until it is paid (the provider's call may come a little later).
 useEffect(()=>{if(!back)return;let stop=false;let tries=0;
  const done=(msg:string,type:'ok'|'info'|'err')=>{if(stop)return;toast(msg,{type});load(true);navigate('/n/premium',{replace:true});};
  const poll=()=>{call('premium.purchaseStatus',{purchaseId:back},purchaseRes,{asAccount:true,fresh:true}).then(r=>{if(stop)return;
    if(r.state==='paid')return done(t('fe.w8.prem.paidNow'),'ok');
    if(r.state==='failed'||r.state==='canceled'||r.state==='refunded')return done(t('fe.w8.prem.notPaid'),'err');
    if(++tries>=20)return done(t('fe.w8.prem.paidLater'),'info');
    setTimeout(poll,2000);}).catch(()=>done(t('fe.w8.prem.paidLater'),'info'));};
  poll();return ()=>{stop=true;};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[back]);
 return <>
  <Bar title="" back/>
  <View className={'nodock'+(status&&!premium?' cta1':'')}>
   <PremiumHero lead={t('fe.ax.prem.lead')}/>
   {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={()=>load(true)}>{t('fe.retry')}</Btn></Empty>
    :!status?<Skel kind="list"/>:<>
    {premium&&<Alert kind="ok" icon={Check}>{status.viaPartner
     ?(status.partner?<><b>{t('fe.ax.prem.viaPartner')}</b>{t('fe.w8.prem.viaPartnerNamed',{name:status.partner.name??'',date:date(status.partner.until)})}</>:<><b>{t('fe.ax.prem.viaPartner')}</b>{t('fe.ax.prem.viaPartnerText')}</>)
     :<><b>{status.source==='gift'?t('fe.w8.prem.gift'):t('fe.ax.prem.active')}</b>{until?t(sub?'fe.ax.prem.untilOnly':'fe.ax.prem.until',{date:until}):''}</>}</Alert>}
    {premium&&!status.viaPartner&&<Group title={t('fe.w8.prem.manage')}>
     <Card list>
      {sub?<ToggleRow icon={RotateCcw} title={t('fe.w8.prem.renew')} disabled={busy==='renew'}
        sub={sub.autoRenew?t('fe.w8.prem.renewsOn',{date:sub.renewsAt?date(sub.renewsAt):until}):t('fe.w8.prem.renewsOff',{date:until})}
        on={sub.autoRenew} onClick={()=>sub.autoRenew?setSheet('cancel'):void renew(true)}/>
       :<Row icon={RotateCcw} title={t('fe.w8.prem.renew')} sub={t('fe.w8.prem.noRenew',{date:until})}/>}
     </Card>
    </Group>}
    <Alert kind="ok" icon={Check} role="none"><b>{t('fe.ax.prem.freeTitle')}</b>{t('fe.ax.prem.freeText')}</Alert>
    <SectionLabel>{t('fe.ax.prem.what')}</SectionLabel>
    <PremiumFeats items={feats} current={kind} neededLabel={premium?undefined:t('fe.ax.prem.needed')}/>
    {!premium&&<>
     <SectionLabel>{t('fe.ax.prem.plan')}</SectionLabel>
     <Stack gap={2}><PlanCards<Plan> label={t('fe.ax.prem.plan')} plans={plans} value={plan} onChange={setPlan}/>
     {status.payments?<Note>{t('fe.w8.prem.charge',{price:planPrice,period:t(plan==='year'?'fe.w8.prem.periodYear':'fe.w8.prem.periodMonth')})}</Note>
      :<div id="fe-ax-soon"><Note><b>{t('fe.w8.buy.soon')}.</b> {t('fe.w8.buy.soonText')}</Note></div>}</Stack>
    </>}
    <Card list><Row icon={RotateCcw} title={t('fe.w8.prem.restore')} sub={t('fe.w8.prem.restoreSub')} noChev disabled={busy==='restore'} onClick={()=>void restore()}/></Card>
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
  {status&&!premium&&<div className="ctabar"><div className="wrap"><Btn aria-describedby={status.payments?undefined:'fe-ax-soon'} onClick={()=>setSheet('buy')}>{t('fe.ax.prem.buy',{price:planPrice})}</Btn></div></div>}
  {sheet==='buy'&&status&&<BuySheet plan={plan} payments={!!status.payments} prices={status.prices} onClose={()=>setSheet(null)} onDone={()=>load(true)}/>}
  {sheet==='gift'&&<GiftSheet onClose={()=>setSheet(null)} onDone={()=>load(true)}/>}
  {sheet==='cancel'&&<Ask title={t('fe.w8.prem.cancelTitle')} text={t('fe.w8.prem.cancelText',{date:until})} ok={t('fe.w8.prem.cancelOk')} danger busy={busy==='renew'}
   onOk={()=>void renew(false)} onCancel={()=>setSheet(null)}/>}
 </>;
}

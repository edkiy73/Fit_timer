import {useCallback,useEffect,useState} from 'react';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import {KeyRound,LogOut,RefreshCw,ShieldCheck,ShieldOff} from 'lucide-react';
import {feErrorMessage,feRequest} from '../feture/fe-api';
import {Actions,Alert,Btn,Card,CodeInput,Empty,Field,Group,H,Input,Note,Pill,QrCode,RecoveryCodes,Row,SecretKey,Sheet,Skel,Spacer,Stack} from './kit';
import {useFe} from './session';
import {copyLink} from './share';
import {useToast} from './toast';
import {AuthBar,AuthFrame,AuthLogo} from './start';

/** The second factor, one set of pieces for everyone (owner 29.10.2026; server/second-factor.mjs, server/signin.mjs):
 * the code form, enrolment (QR + key → first code → recovery codes once), the codes shown once, the sign-in second
 * step, and the «Код из приложения» block of «Вход и безопасность». The staff area wires the same pieces to its own
 * commands (staff-factor.tsx). */

export const startRes=z.object({ok:z.literal(true),secret:z.string(),uri:z.string()});
export type Start=z.infer<typeof startRes>;
export const checkRes=z.object({ok:z.literal(true),verified:z.boolean(),reason:z.enum(['wrong','used','locked']).optional(),left:z.number().optional(),lockedUntil:z.string().nullable().optional(),
 codes:z.array(z.string()).optional(),recovery:z.boolean().optional(),recoveryLeft:z.number().optional()}).passthrough();
export type Check=z.infer<typeof checkRes>;
const factorRes=z.object({ok:z.literal(true),enabled:z.boolean(),recoveryLeft:z.number(),lockedUntil:z.string().nullable(),required:z.boolean()});

/** A refusal in plain words. */
export function useRefusal(){
 const {t,locale}=useI18n();
 return (r:Check)=>r.reason==='locked'?t('fe.sf.locked',{time:new Date(r.lockedUntil??Date.now()).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})})
  :r.reason==='used'?t('fe.sf.used'):t('fe.sf.wrong',{n:String(r.left??0)});
}

/** The code field: six boxes for the app's code, or a line for a recovery code. `check` sends it; `onVerified` gets a
 * right answer. */
export function CodeForm({check,onVerified,submitLabel,autoFocus=true}:{check:(code:string)=>Promise<Check>,onVerified:(r:Check)=>void,submitLabel?:string,autoFocus?:boolean}){
 const {t}=useI18n();const refusal=useRefusal();
 const [code,setCode]=useState('');const [recovery,setRecovery]=useState(false);const [err,setErr]=useState('');const [busy,setBusy]=useState(false);
 const send=async(c=code)=>{
  const v=c.trim();if(busy||(!recovery&&v.length<6)||(recovery&&v.length<10))return;
  setBusy(true);setErr('');
  try{const r=await check(v);if(r.verified)onVerified(r);else{setErr(refusal(r));setCode('');}}
  catch(e){setErr(feErrorMessage(e,t));}finally{setBusy(false);}
 };
 return <Stack gap={3}>
  {recovery?<Field id="fe-sf-rc" label={t('fe.sf.recovery')} error={err||undefined}>
   <Input id="fe-sf-rc" value={code} invalid={!!err} autoFocus={autoFocus} autoCapitalize="off" autoComplete="off" spellCheck={false} placeholder="xxxxx-xxxxx"
    onChange={e=>{setCode(e.target.value);setErr('');}} onKeyDown={e=>{if(e.key==='Enter')void send();}}/></Field>
   :<Field label={t('fe.sf.code')} error={err||undefined}>
    <CodeInput value={code} onChange={v=>{setCode(v);setErr('');}} label={t('fe.sf.code')} invalid={!!err} autoFocus={autoFocus} disabled={busy} onComplete={c=>void send(c)}/></Field>}
  <Actions stack>
   <Btn busy={busy} disabled={busy||(recovery?code.trim().length<10:code.length<6)} onClick={()=>void send()}>{submitLabel??t('fe.sf.confirm')}</Btn>
   <Btn kind="text" onClick={()=>{setRecovery(!recovery);setCode('');setErr('');}}>{recovery?t('fe.sf.useApp'):t('fe.sf.useRecovery')}</Btn>
  </Actions>
 </Stack>;
}

/** The recovery codes, shown once. */
export function CodesShown({codes,onDone}:{codes:string[],onDone:()=>void}){
 const {t}=useI18n();const toast=useToast();
 return <Stack gap={4}>
  <Stack gap={2}><H level={3} as="h2">{t('fe.sf.codesTitle')}</H><Note>{t('fe.sf.codesLead')}</Note></Stack>
  <RecoveryCodes codes={codes} label={t('fe.sf.codesTitle')} copyLabel={t('fe.sf.copyAll')} onCopy={()=>void copyLink(codes.join('\n')).then(ok=>{if(ok)toast(t('fe.sf.copied'),{type:'ok'});})}/>
  <Btn icon={ShieldCheck} onClick={onDone}>{t('fe.sf.done')}</Btn>
 </Stack>;
}

/** Connect an authenticator app: QR and the key, the first code, then the recovery codes once. */
export function FactorEnrol({start,confirm,title,lead,onDone}:{start:()=>Promise<Start>,confirm:(code:string)=>Promise<Check>,title?:string,lead?:string,onDone:()=>void}){
 const {t}=useI18n();const toast=useToast();const refusal=useRefusal();
 const [s,setS]=useState<Start|null>(null);const [error,setError]=useState<unknown>(null);
 const [code,setCode]=useState('');const [err,setErr]=useState('');const [busy,setBusy]=useState(false);const [codes,setCodes]=useState<string[]|null>(null);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 const begin=useCallback(()=>{setError(null);start().then(setS).catch(setError);},[]);
 useEffect(()=>{begin();},[begin]);
 const copy=async(text:string)=>{if(await copyLink(text))toast(t('fe.sf.copied'),{type:'ok'});};
 const send=async(c=code)=>{
  if(busy||c.length<6)return;setBusy(true);setErr('');
  try{const r=await confirm(c);if(r.verified&&r.codes)setCodes(r.codes);else{setErr(refusal(r));setCode('');}}
  catch(e){setErr(feErrorMessage(e,t));}finally{setBusy(false);}
 };
 if(codes)return <CodesShown codes={codes} onDone={onDone}/>;
 if(error)return <Empty icon={KeyRound} role="alert" compact title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={begin}>{t('fe.retry')}</Btn></Empty>;
 return <Stack gap={4}>
  {(title||lead)&&<Stack gap={2}>{title&&<H level={3} as="h2">{title}</H>}{lead&&<Note>{lead}</Note>}</Stack>}
  <Card><Stack gap={4}>
   <Note>{t('fe.sf.scan')}</Note>
   {s?<QrCode value={s.uri} label={t('fe.sf.qr')}/>:<Skel kind="card" rows={1}/>}
   {s&&<SecretKey value={s.secret} label={t('fe.sf.key')} copyLabel={t('fe.sf.copy')} onCopy={()=>void copy(s.secret)}/>}
  </Stack></Card>
  <Field label={t('fe.sf.code')} error={err||undefined}>
   <CodeInput value={code} onChange={v=>{setCode(v);setErr('');}} label={t('fe.sf.code')} invalid={!!err} disabled={busy||!s} onComplete={c=>void send(c)}/></Field>
  <Btn busy={busy} disabled={busy||!s||code.length<6} onClick={()=>void send()}>{t('fe.sf.confirm')}</Btn>
 </Stack>;
}

/** The sign-in second step: the account has a code from an app on, and this sign-in has not entered one yet. The server
 * refuses everything else until then (403 second_factor `signin`); «Выйти» signs this device out. */
export function SigninFactor(){
 const {state,reload}=useFe();const {t}=useI18n();const auth=useOptionalAuth();const toast=useToast();
 const [leaving,setLeaving]=useState(false);
 if(state.status!=='factor')return null;
 const session=state.session;
 return <AuthFrame screen="A03F">
  <AuthBar/>
  <div className="view nodock"><div className="auth-wrap">
   <AuthLogo/>
   <H level={2} className="t">{t('fe.uf.signinTitle')}</H>
   <p className="lead">{t('fe.uf.signinLead')}</p>
   <Spacer size={4}/>
   <CodeForm check={code=>feRequest(session,'account.factorSignIn',{code},checkRes)}
    onVerified={r=>{if(r.recovery)toast(t('fe.sf.recoveryLeft',{n:String(r.recoveryLeft??0)}),{type:'info'});reload();}}/>
   <Spacer size={4}/>
   <Actions><Btn kind="ghost" icon={LogOut} busy={leaving} onClick={()=>{setLeaving(true);void auth.logout().finally(()=>setLeaving(false));}}>{t('fe.uf.signinOut')}</Btn></Actions>
  </div></div>
 </AuthFrame>;
}

/** «Вход и безопасность» → «Код из приложения»: off — a row that connects it; on — new recovery codes and «Выключить»
 * (each asks for a current code). Staff keep it on (required for them). */
export function FactorSettings(){
 const {call}=useFe();const {t}=useI18n();const toast=useToast();
 const [f,setF]=useState<z.infer<typeof factorRes>|null>(null);const [failed,setFailed]=useState(false);
 const [sheet,setSheet]=useState<null|'on'|'off'|'codes'>(null);const [codes,setCodes]=useState<string[]|null>(null);
 const load=useCallback(()=>{setFailed(false);call('account.factor',{},factorRes,{asAccount:true,fresh:true}).then(setF).catch(()=>setFailed(true));},[call]);
 useEffect(()=>{load();},[load]);
 const close=()=>{setSheet(null);setCodes(null);load();};
 const left=t('fe.uf.left',{n:String(f?.recoveryLeft??0)});
 return <Group title={t('fe.uf.title')} foot={f&&!f.enabled?t('fe.uf.foot'):undefined}>
  {failed?<Alert kind="err" action={<Btn kind="soft" size="sm" auto onClick={load}>{t('fe.retry')}</Btn>}>{t('fe.error.generic')}</Alert>
   :!f?<Skel kind="list" rows={1}/>
   :<Card list>
    <Row icon={KeyRound} tone={f.enabled?'g':undefined} title={<>{t('fe.uf.row')} {f.enabled&&<Pill tone="ok">{t('fe.uf.on')}</Pill>}</>}
     sub={f.enabled?(f.required?t('fe.uf.required'):left):t('fe.uf.offSub')} onClick={f.enabled?undefined:()=>setSheet('on')}/>
    {f.enabled&&<Row icon={RefreshCw} title={t('fe.uf.newCodes')} sub={f.required?left:t('fe.uf.newCodesSub')} onClick={()=>setSheet('codes')}/>}
    {f.enabled&&!f.required&&<Row icon={ShieldOff} danger title={t('fe.uf.off')} onClick={()=>setSheet('off')}/>}
   </Card>}
  {sheet==='on'&&<Sheet title={t('fe.uf.row')} onClose={close}>
   <FactorEnrol lead={t('fe.uf.enrolLead')} start={()=>call('account.factorStart',{},startRes,{asAccount:true})}
    confirm={code=>call('account.factorConfirm',{code},checkRes,{asAccount:true})} onDone={()=>{toast(t('fe.uf.onDone'),{type:'ok'});close();}}/>
  </Sheet>}
  {sheet==='codes'&&<Sheet title={t('fe.uf.newCodes')} onClose={close}>
   {codes?<CodesShown codes={codes} onDone={close}/>:<Stack gap={4}><Note>{t('fe.uf.codesAsk')}</Note>
    <CodeForm check={code=>call('account.factorCodes',{code},checkRes,{asAccount:true})} onVerified={r=>setCodes(r.codes??[])} submitLabel={t('fe.uf.newCodesBtn')}/></Stack>}
  </Sheet>}
  {sheet==='off'&&<Sheet title={t('fe.uf.offTitle')} onClose={close}>
   <Stack gap={4}><Note>{t('fe.uf.offAsk')}</Note>
    <CodeForm check={code=>call('account.factorOff',{code},checkRes,{asAccount:true})} onVerified={()=>{toast(t('fe.uf.offDone'),{type:'ok'});close();}} submitLabel={t('fe.uf.offBtn')}/></Stack>
  </Sheet>}
 </Group>;
}

import {useState} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {HeartOff,Settings} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Alert,Ask as KitAsk,Card,Group,RadioList,Row,SelectRow,ToggleRow} from './kit';
import {AgeCheckLink,useAgeResume} from './age-check';
import {useFe} from './session';
import {useToast} from './toast';
import {DiscoverPhotoAsk} from './discover-photo';

/** V21 X01 «Я» with the prototype's markup (`meHead18`, `meProfileLayer`, `meVisLayer`): the header with the avatar,
 * bell, «Как видят» and settings; «Нужно решить»; the four layers with their red dots; photos, basics, details,
 * interests, gallery and links. The editors (P02/P04) live in me-edit.tsx. Everything comes from the server. */
export const media=z.object({id:z.uuid(),pending:z.boolean(),blurred:z.boolean().optional(),src:z.record(z.string(),z.string()).nullable(),
 /** A photo taken from one of the profile's own posts (wave 5): «Открыть публикацию». */ postId:z.uuid().optional()});
export const profile=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),own:z.boolean(),bio:z.string(),
 age:z.number().nullable(),chosenName:z.string().optional(),nickAt:z.string().nullable().optional(),nameAt:z.string().nullable().optional(),nickFirst:z.boolean().optional(),city:z.object({id:z.string().optional(),ru:z.string().nullable(),en:z.string().nullable(),pending:z.boolean()}).nullable(),avatar:media.nullable(),photos:z.array(media),
 details:z.record(z.string(),z.unknown()),rev:z.number().optional(),detailsVis:z.string().nullable().optional(),showAge:z.boolean().optional(),cityId:z.string().nullable().optional()}).passthrough();
export const profileRes=z.object({ok:z.literal(true),profile});
export const settingsShape=z.object({discoverMode:z.enum(['visible','hidden','off']),privateOn:z.boolean(),acceptProfileLikes:z.boolean().optional(),requestsFrom:z.enum(['all','matches','none']).optional(),
 linksFrom:z.string().optional(),mentionsFrom:z.enum(['all','follow','none']).optional(),activityVis:z.enum(['all','followers','off']).optional(),showLikes:z.boolean().optional(),
 messagesFrom:z.enum(['all','known','none']).optional()}).passthrough();
export const settingsRes=z.object({ok:z.literal(true),settings:settingsShape});
export const option=z.object({kind:z.string(),code:z.string(),ru:z.string(),en:z.string()});
export const place=z.object({id:z.string(),code:z.string().nullable().optional(),country:z.string().optional(),ru:z.string(),en:z.string()});
export const catalogRes=z.object({ok:z.literal(true),options:z.array(option),places:z.array(place).optional()});
export const ok=z.object({ok:z.literal(true)}).passthrough();
export type Profile=z.infer<typeof profile>;
export type Settings=z.infer<typeof settingsShape>;
/** Profile fields → catalog option kinds; a couple keeps only the shared ones (prototype COUPLE_FIELDS). */
export const DETAIL_ROWS:[string,string][]=[['genders','gender'],['orients','orient'],['roles','role'],['status','status'],['formats','format'],['seeks','seek']];
export const COUPLE_ROWS=['roles','formats','seeks'];
export const MAX_PHOTOS=6;
export const photoSrc=(m:{src:Record<string,string>|null},size:'card'|'thumb'|'full'='card')=>m.src?(m.src[size]??m.src.card??m.src.thumb??m.src.blur??null):null;

// AudTag and Ask live in me-parts.tsx: screens that only need them do not pull the whole «Я» tab into the first load.
import {Ask,AudTag} from './me-parts';
export {Ask,AudTag};

/** `meVisLayer()` — Discover, the profile card, likes, activity, mentions; the couple's own group comes after.
 * `part` draws one half (the «Знакомства» or the «Кто может…» section of the new settings); `who` adds the other
 * «кто может» choices kept elsewhere today (access requests, links). */
export function Visibility({p,settings,onChanged,part}:{p:Profile,settings:Settings,onChanged:()=>void,part?:'discover'|'who'|undefined}){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();const toast=useToast();
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const [ageIntent,setAgeIntent]=useState('');const [askOff,setAskOff]=useState(false);
 const cp=p.kind==='couple';
 const set=async(setting:string,value:string|boolean,done?:string)=>{
  if(busy)return;setBusy(true);setFailure('');
  try{const r=await call(setting==='detailsVis'?'profile.update':'profile.setVisibility',setting==='detailsVis'?{opId:newOpId(),rev:p.rev,detailsVis:value}:{opId:newOpId(),setting,value},ok);
   toast(r.pending?t('fe.cw.waitPartner'):done??t('fe.mx.saved'),{type:'ok'});onChanged();}
  catch(e){
   const age=e instanceof FeError&&e.rule==='age_not_verified';
   // The age check this sends to comes back here and applies the same change (`vis:<setting>:<value>`).
   setAgeIntent(age?`vis:${setting}:${String(value)}`:'');
   setFailure(age?t('fe.age.couple'):feErrorMessage(e,t));}finally{setBusy(false);}
 };
 useAgeResume(v=>/^vis:[a-zA-Z]+:[a-z]+$/.test(v),v=>{const [,k,raw]=v.split(':') as [string,string,string];void set(k,raw==='true'?true:raw==='false'?false:raw);});
 const hasPhoto=p.photos.some(x=>!x.pending);
 // Owner 28.10.2026: Discover is off for new accounts; «Показываюсь» without any photo asks for one first (DiscoverPhotoAsk).
 const [askPhoto,setAskPhoto]=useState(false);
 const mode=settings.discoverMode;
 const toggle=(k:string,title:string,sub:string,on:boolean)=><ToggleRow title={title} sub={sub} on={on} disabled={busy} onClick={()=>void set(k,!on)}/>;
 const modeSub=mode==='visible'&&!hasPhoto?(p.photos.length?t(cp?'fe.mx.v.photoReviewUs':'fe.mx.v.photoReview'):cp?t('fe.mx.v.noPhotoCouple'):t('fe.mx.v.noPhoto')):mode==='off'&&cp?t('fe.mx.v.offCouple'):cp?t('fe.mx.v.offNow'):t('fe.mx.v.modeSub');
 return <>
  {part!=='who'&&<Group title={t('fe.reg.discover.title')}><Card list>
   <SelectRow row label={t('fe.mx.v.mode')} sub={modeSub} value={mode} onChange={v=>{if(v==='off'&&mode!=='off')setAskOff(true);else if(v==='visible'&&!p.photos.length)setAskPhoto(true);else void set('discoverMode',v);}}
    options={(['visible','hidden','off'] as const).map(v=>[v,t('fe.mx.v.mode.'+v+(cp?'Us':''))] as const)}/>
   <Row title={cp?t('fe.mx.v.cardUs'):t('fe.mx.v.card')} sub={cp?t('fe.mx.v.cardSubUs'):t('fe.mx.v.cardSub')} onClick={()=>navigate('/n/me/preview')}/>
   {toggle('acceptProfileLikes',t('fe.mx.v.likes'),cp?t('fe.mx.v.likesSubUs'):t('fe.mx.v.likesSub'),settings.acceptProfileLikes!==false)}
  </Card></Group>}
  {part!=='discover'&&<><Group title={t('fe.me.layer.profile')} foot={cp?t('fe.mx.v.footUs'):undefined}><Card list>
   <SelectRow row label={t('fe.mx.v.activity')} sub={t('fe.mx.v.activitySub')} value={settings.activityVis??'all'} onChange={v=>void set('activityVis',v)}
    options={(['all','followers','off'] as const).map(v=>[v,t('fe.mx.v.act.'+v)] as const)}/>
   <SelectRow row label={cp?t('fe.mx.v.mentionUs'):t('fe.mx.v.mention')} sub={t('fe.mx.v.mentionSub')} value={settings.mentionsFrom??'all'} onChange={v=>void set('mentionsFrom',v)}
    options={(['all','follow','none'] as const).map(v=>[v,t('fe.mx.v.from.'+v+(v==='follow'&&cp?'Us':''))] as const)}/>
   {!cp&&<SelectRow row label={t('fe.mx.v.details')} sub={t('fe.mx.v.detailsSub')} value={(p.detailsVis??'all') as 'all'|'granted'|'only'} onChange={v=>void set('detailsVis',v)}
    options={(['all','granted','only'] as const).map(v=>[v,t('fe.reg.vis.'+v)] as const)}/>}
   {toggle('showLikes',cp?t('fe.mx.v.showLikesUs'):t('fe.mx.v.showLikes'),cp?t('fe.mx.v.showLikesSubUs'):t('fe.mx.v.showLikesSub'),settings.showLikes!==false)}
  </Card></Group>
  {/* «Кто может мне писать» (owner 29.10.2026, message requests); the server enforces it. */}
  <Group title={cp?t('fe.rq.set.titleUs'):t('fe.rq.set.title')}>
   <RadioList label={cp?t('fe.rq.set.titleUs'):t('fe.rq.set.title')} value={settings.messagesFrom??'known'} onChange={v=>{if(v!==(settings.messagesFrom??'known'))void set('messagesFrom',v);}}
    options={(['all','known','none'] as const).map(v=>[v,t('fe.rq.set.'+v+(v==='known'&&cp?'Us':'')),v==='none'?t('fe.rq.set.noneSub'):undefined] as const)}/>
  </Group>
  {part==='who'&&<Group title={t('fe.m2.who.more')}><Card list>
   <SelectRow row label={t('fe.mx.pr.reqFrom')} value={settings.requestsFrom??'all'} onChange={v=>void set('requestsFrom',v)}
    options={(['all','matches','none'] as const).map(v=>[v,t('fe.mx.pr.from.'+v)] as const)}/>
   <SelectRow row label={t('fe.ln.from')} value={(settings.linksFrom??'all') as 'all'|'follow'|'none'} onChange={v=>void set('linksFrom',v)}
    options={(['all','follow','none'] as const).map(v=>[v,t('fe.ln.from.'+v)] as const)}/>
  </Card></Group>}</>}
  {failure&&<Alert kind="err" noIcon>{failure}{failure===t('fe.age.couple')&&<><br/><AgeCheckLink intent={ageIntent||undefined}/></>}</Alert>}
  {/* V21 k4off: switching Discover off is asked first — matches, chats and access stay. */}
  {askOff&&<KitAsk icon={HeartOff} danger title={t(cp?'fe.w7.k4off.titleUs':'fe.w7.k4off.title')} text={t(cp?'fe.w7.k4off.textUs':'fe.w7.k4off.text')} ok={t('fe.w7.k4off.ok')} busy={busy}
   onOk={()=>{setAskOff(false);void set('discoverMode','off');}} onCancel={()=>setAskOff(false)}/>}
  {askPhoto&&<DiscoverPhotoAsk existing={p.photos.map(x=>x.id)} couple={cp} onCancel={()=>setAskPhoto(false)}
   onAdded={async()=>{setAskPhoto(false);await set('discoverMode','visible',t(cp?'fe.dph.onReviewUs':'fe.dph.onReview'));}}/>}
 </>;
}

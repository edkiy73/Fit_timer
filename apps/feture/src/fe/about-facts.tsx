import {useNavigate} from 'react-router';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Baby,Cigarette,CigaretteOff,Languages,Ruler,Sparkles,UserRound,Wine,WineOff} from 'lucide-react';
import {ABOUT,ABOUT_FACTS} from '../../contracts/_about.mjs';
import {AddCard,AudSelect,Card,FactChips,FactRow,Group,type Aud,type FactItem} from './kit';
import {ChipPick} from './kit/ChipPick';

/** «Обо мне» (owner 29.10.2026): optional short facts of a person profile — height, smoking, alcohol, kids, languages,
 * zodiac sign — each with its own audience. The server sends a viewer only the facts they may see (`profile.get`
 * `about`); the owner also gets `aboutVis`. Couples have none: facts are personal, each partner keeps theirs on the
 * personal profile. Shown as kit `FactChips` under the bio; edited as kit `FactRow`s in «Редактировать профиль». */

export type Fact=typeof ABOUT_FACTS[number];
export type About={height?:number|null,smoking?:string|null,alcohol?:string|null,kids?:string|null,langs?:string[],zodiac?:string|null};
export type AboutVis=Record<Fact,Aud>;
type T=(key:string,vars?:Record<string,string|number>)=>string;
type WithAbout={kind:string,about?:unknown,aboutVis?:unknown};

const asAbout=(v:unknown):About=>v&&typeof v==='object'?v as About:{};
export const visOf=(v:unknown):AboutVis=>Object.fromEntries(ABOUT_FACTS.map(k=>{const x=v&&typeof v==='object'?(v as Record<string,unknown>)[k]:null;return [k,x==='all'||x==='granted'?x:'only'];})) as AboutVis;
const filled=(a:About,k:Fact)=>{const v=a[k];return Array.isArray(v)?v.length>0:v!==null&&v!==undefined&&v!=='';};

/** The pills of the facts that are there, in the fixed order. */
export function factItems(a:About,t:T):FactItem[]{
 const out:FactItem[]=[];
 for(const k of ABOUT_FACTS){
  if(!filled(a,k))continue;
  if(k==='height'){const n=Number(a.height);out.push({id:k,icon:Ruler,value:t('fe.ab.cm',{n}),label:t('fe.ab.l.height',{n})});}
  else if(k==='langs'){const l=a.langs??[];out.push({id:k,icon:Languages,value:l.map(c=>c.toUpperCase()).join(' · '),label:t('fe.ab.l.langs',{list:l.map(c=>t('fe.ab.lang.'+c)).join(', ')})});}
  else if(k==='zodiac'){const v=t('fe.ab.zodiac.'+a.zodiac);out.push({id:k,icon:Sparkles,value:v,label:t('fe.ab.l.zodiac',{v})});}
  else{const v=String(a[k]);const icon=k==='smoking'?(v==='no'?CigaretteOff:Cigarette):k==='alcohol'?(v==='no'?WineOff:Wine):Baby;
   out.push({id:k,icon,value:t('fe.ab.'+k+'.'+v),label:t('fe.ab.l.'+k+'.'+v)});}
 }
 return out;
}

/** «Обо мне» on a profile page, under the bio. `preview` («Как видят») reads the own profile, so it keeps only what
 * that audience gets: «Все» — facts open to everyone, «С доступом» — plus «По доступу»; «Только ты» never. */
export function AboutGroup({p,preview,inert}:{p:WithAbout,preview?:'all'|'granted'|undefined,inert?:boolean|undefined}){
 const {t}=useI18n();
 if(p.kind!=='person')return null;
 let a=asAbout(p.about);
 if(preview){const vis=visOf(p.aboutVis);a=Object.fromEntries(Object.entries(a).filter(([k])=>vis[k as Fact]==='all'||(preview==='granted'&&vis[k as Fact]==='granted')));}
 const items=factItems(a,t);
 if(!items.length)return null;
 return <Group id="pAbout" title={t('fe.ab.title')}><FactChips items={items} label={t('fe.ab.title')} inert={inert}/></Group>;
}

/** «Обо мне» on «Я»: the own facts (every one, whatever its audience) and «Изменить»; empty — the one «add» card. */
export function MeAboutBlock({p}:{p:WithAbout}){
 const {t}=useI18n();const navigate=useNavigate();
 if(p.kind!=='person')return null;
 const items=factItems(asAbout(p.about),t);const edit=()=>navigate('/n/me/edit?only=about');
 return <Group id="meAbout" title={t('fe.ab.title')} action={items.length?<button type="button" onClick={edit}>{t('fe.mx.edit')}</button>:undefined}>
  {items.length?<FactChips items={items} label={t('fe.ab.title')}/>:<AddCard icon={UserRound} title={t('fe.ab.add')} sub={t('fe.ab.addSub')} onClick={edit}/>}
 </Group>;
}

export type AboutDraft={about:Required<About>,vis:AboutVis};
/** The editor's starting point from the own profile; a fact never given an audience starts with the one of «Данные». */
export function aboutDraft(p:WithAbout&{detailsVis?:string|null|undefined}):AboutDraft{
 const a=asAbout(p.about);const raw=p.aboutVis&&typeof p.aboutVis==='object'?p.aboutVis as Record<string,unknown>:null;
 const dv:Aud=p.detailsVis==='all'||p.detailsVis==='granted'?p.detailsVis:'only';
 const vis=visOf(raw);
 // A fact still empty takes the audience of «Данные» when it is filled (the server's default for a stored one is «Только ты»).
 for(const k of ABOUT_FACTS)if(!filled(a,k))vis[k]=dv;
 return {about:{height:a.height??null,smoking:a.smoking??null,alcohol:a.alcohol??null,kids:a.kids??null,langs:a.langs??[],zodiac:a.zodiac??null},vis};
}
/** What changed, as `profile.update` fields: the facts and the audiences of the facts that are filled. */
export function aboutPatch(base:AboutDraft,d:AboutDraft):Record<string,unknown>{
 const out:Record<string,unknown>={};const vis:Partial<AboutVis>={};
 for(const k of ABOUT_FACTS){
  if(JSON.stringify(d.about[k])!==JSON.stringify(base.about[k]))out[k]=d.about[k];
  if(filled(d.about,k)&&(d.vis[k]!==base.vis[k]||!filled(base.about,k)))vis[k]=d.vis[k];
 }
 if(Object.keys(vis).length)out.aboutVis=vis;
 return out;
}

const SELECTS=[['smoking',ABOUT.smoking],['alcohol',ABOUT.alcohol],['kids',ABOUT.kids]] as const;
const HEIGHTS=Array.from({length:ABOUT.height.max-ABOUT.height.min+1},(_,i)=>ABOUT.height.min+i);

/** The «Обо мне» section of «Редактировать профиль»: one row per fact, each with its own audience. Nothing is written
 * until «Сохранить». */
export function AboutEditor({d,onChange,titled=true}:{d:AboutDraft,onChange:(d:AboutDraft)=>void,/** Off when the screen's own header already says «Обо мне». */ titled?:boolean}){
 const {t}=useI18n();
 const set=(k:Fact,v:unknown)=>onChange({...d,about:{...d.about,[k]:v}});
 const aud=(k:Fact)=><AudSelect value={d.vis[k]} label={t('fe.ab.who',{what:t('fe.ab.f.'+k)})} onChange={v=>onChange({...d,vis:{...d.vis,[k]:v}})}/>;
 const none=t('fe.ab.none');const langs=d.about.langs;
 return <Group id="peAbout" title={titled?t('fe.ab.title'):undefined} foot={t('fe.ab.foot')}><Card list>
  <FactRow icon={Ruler} label={t('fe.ab.f.height')} aud={aud('height')} value={d.about.height?String(d.about.height):''}
   options={[['',none],...HEIGHTS.map(n=>[String(n),t('fe.ab.cm',{n})] as const)]} onChange={v=>set('height',v?Number(v):null)}/>
  {SELECTS.map(([k,codes])=><FactRow key={k} icon={k==='smoking'?Cigarette:k==='alcohol'?Wine:Baby} label={t('fe.ab.f.'+k)} aud={aud(k)} value={d.about[k]??''}
   options={[['',none],...codes.map(c=>[c,t('fe.ab.'+k+'.'+c)] as const)]} onChange={v=>set(k,v||null)}/>)}
  <FactRow icon={Languages} label={t('fe.ab.f.langs')} aud={aud('langs')}>
   <ChipPick label={t('fe.ab.f.langs')} max={ABOUT.langsMax} value={langs}
    options={ABOUT.langs.map(c=>({code:c,label:t('fe.ab.lang.'+c),search:c}))}
    onToggle={c=>set('langs',langs.includes(c)?langs.filter(x=>x!==c):langs.length>=ABOUT.langsMax?langs:[...langs,c])} onClear={()=>set('langs',[])}/>
  </FactRow>
  <FactRow icon={Sparkles} label={t('fe.ab.f.zodiac')} aud={aud('zodiac')} value={d.about.zodiac??''}
   options={[['',none],...ABOUT.zodiac.map(c=>[c,t('fe.ab.zodiac.'+c)] as const)]} onChange={v=>set('zodiac',v||null)}/>
 </Card></Group>;
}

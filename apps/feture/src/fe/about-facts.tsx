import {useNavigate} from 'react-router';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Baby,Cigarette,CigaretteOff,Languages,Ruler,Sparkles,UserRound,Wine,WineOff} from 'lucide-react';
import {ABOUT,ABOUT_FACTS} from '../../contracts/_about.mjs';
import {AddCard,Card,FactChips,FactRow,Group,type FactItem} from './kit';
import {ChipPick} from './kit/ChipPick';

/** «Обо мне» (owner 29.10.2026): optional short facts of a person profile — height, smoking, alcohol, kids, languages,
 * zodiac sign — always visible to everyone (owner 29.10.2026: no per-fact audience), `profile.get` `about`. Couples have none: facts are personal, each partner keeps theirs on the
 * personal profile. Shown as kit `FactChips` under the bio; edited as kit `FactRow`s in «Редактировать профиль». */

export type Fact=typeof ABOUT_FACTS[number];
export type About={height?:number|null,smoking?:string|null,alcohol?:string|null,kids?:string|null,langs?:string[],zodiac?:string|null};
type T=(key:string,vars?:Record<string,string|number>)=>string;
type WithAbout={kind:string,about?:unknown};

const asAbout=(v:unknown):About=>v&&typeof v==='object'?v as About:{};
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
   // «Пока не знаю» alone does not say it is about kids: the chip names it (the editor's list keeps the short value).
   out.push({id:k,icon,value:t(k==='kids'&&v==='unsure'?'fe.ab.chip.kids.unsure':'fe.ab.'+k+'.'+v),label:t('fe.ab.l.'+k+'.'+v)});}
 }
 return out;
}

/** «Обо мне» on a profile page: under the bio and the main buttons (owner 29.10.2026); everyone sees the same facts. */
export function AboutGroup({p,inert}:{p:WithAbout,inert?:boolean|undefined}){
 const {t}=useI18n();
 if(p.kind!=='person')return null;
 const items=factItems(asAbout(p.about),t);
 if(!items.length)return null;
 return <Group id="pAbout" title={t('fe.ab.title')}><FactChips items={items} label={t('fe.ab.title')} inert={inert}/></Group>;
}

/** «Обо мне» on «Я»: the own facts and «Изменить»; empty — the one «add» card. */
export function MeAboutBlock({p}:{p:WithAbout}){
 const {t}=useI18n();const navigate=useNavigate();
 if(p.kind!=='person')return null;
 const items=factItems(asAbout(p.about),t);const edit=()=>navigate('/n/me/edit?only=about');
 return <Group id="meAbout" title={t('fe.ab.title')} action={items.length?<button type="button" onClick={edit}>{t('fe.mx.edit')}</button>:undefined}>
  {items.length?<FactChips items={items} label={t('fe.ab.title')}/>:<AddCard icon={UserRound} title={t('fe.ab.add')} sub={t('fe.ab.addSub')} onClick={edit}/>}
 </Group>;
}

export type AboutDraft={about:Required<About>};
/** The editor's starting point from the own profile. */
export function aboutDraft(p:WithAbout):AboutDraft{
 const a=asAbout(p.about);
 return {about:{height:a.height??null,smoking:a.smoking??null,alcohol:a.alcohol??null,kids:a.kids??null,langs:a.langs??[],zodiac:a.zodiac??null}};
}
/** What changed, as `profile.update` fields. */
export function aboutPatch(base:AboutDraft,d:AboutDraft):Record<string,unknown>{
 const out:Record<string,unknown>={};
 for(const k of ABOUT_FACTS)if(JSON.stringify(d.about[k])!==JSON.stringify(base.about[k]))out[k]=d.about[k];
 return out;
}

const SELECTS=[['smoking',ABOUT.smoking],['alcohol',ABOUT.alcohol],['kids',ABOUT.kids]] as const;
const HEIGHTS=Array.from({length:ABOUT.height.max-ABOUT.height.min+1},(_,i)=>ABOUT.height.min+i);

/** The «Обо мне» section of «Редактировать профиль»: one row per fact, seen by everyone. Nothing is written
 * until «Сохранить». */
export function AboutEditor({d,onChange,titled=true}:{d:AboutDraft,onChange:(d:AboutDraft)=>void,/** Off when the screen's own header already says «Обо мне». */ titled?:boolean}){
 const {t}=useI18n();
 const set=(k:Fact,v:unknown)=>onChange({...d,about:{...d.about,[k]:v}});
 const none=t('fe.ab.none');const langs=d.about.langs;
 return <Group id="peAbout" title={titled?t('fe.ab.title'):undefined} foot={t('fe.ab.foot')}><Card list>
  <FactRow icon={Ruler} label={t('fe.ab.f.height')} value={d.about.height?String(d.about.height):''}
   options={[['',none],...HEIGHTS.map(n=>[String(n),t('fe.ab.cm',{n})] as const)]} onChange={v=>set('height',v?Number(v):null)}/>
  {SELECTS.map(([k,codes])=><FactRow key={k} icon={k==='smoking'?Cigarette:k==='alcohol'?Wine:Baby} label={t('fe.ab.f.'+k)} value={d.about[k]??''}
   options={[['',none],...codes.map(c=>[c,t('fe.ab.'+k+'.'+c)] as const)]} onChange={v=>set(k,v||null)}/>)}
  <FactRow icon={Languages} label={t('fe.ab.f.langs')}>
   <ChipPick label={t('fe.ab.f.langs')} max={ABOUT.langsMax} value={langs}
    options={ABOUT.langs.map(c=>({code:c,label:t('fe.ab.lang.'+c),search:c}))}
    onToggle={c=>set('langs',langs.includes(c)?langs.filter(x=>x!==c):langs.length>=ABOUT.langsMax?langs:[...langs,c])} onClear={()=>set('langs',[])}/>
  </FactRow>
  <FactRow icon={Sparkles} label={t('fe.ab.f.zodiac')} value={d.about.zodiac??''}
   options={[['',none],...ABOUT.zodiac.map(c=>[c,t('fe.ab.zodiac.'+c)] as const)]} onChange={v=>set('zodiac',v||null)}/>
 </Card></Group>;
}

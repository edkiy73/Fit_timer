import {useCallback,useEffect,useState} from 'react';
import {useNavigate,useParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Settings,X} from 'lucide-react';
import {feErrorMessage} from '../feture/fe-api';
import {AddBtn,Bar,Btn,Empty,Skel,View} from './kit';
import {useFe,useLive,useShown} from './session';
import {LinksBlock} from './links';
import {MeJars} from './interests';
import {MeGallery} from './gallery';
import {MeAboutBlock} from './about-facts';
import {PrivateLayer} from './private';
import {BasicsForm} from './me-basics-form';
import type {Place} from './kit/Place';
import {DetailsBlock,MeSkel,PhotosBlock,catalogRes,profileRes,settingsRes,type Profile,type Settings as MeSettings,type option} from './me';

/** Sections of «Я» one level down (/n/me/new/:section): the profile editor view, the gallery and the private part, built from the
 * current blocks, and `useMe` (the own profile and its settings) shared with «Я». */

/** The own profile and its settings (the same reads and first-frame memory as «Я»). */
export function useMe(){
 const {acting,call,peek}=useFe();
 const [p,setP]=useShown<Profile|null>('me.p',()=>acting?peek('profile.get',{profileId:acting.id},profileRes)?.profile??null:null);
 const [settings,setSettings]=useShown<MeSettings|null>('me.settings',()=>peek('profile.settings',{},settingsRes)?.settings??null);
 const [error,setError]=useState<unknown>(null);
 const load=useCallback(()=>{if(!acting)return;setError(null);
  Promise.all([call('profile.get',{profileId:acting.id},profileRes),call('profile.settings',{},settingsRes)]).then(([a,b])=>{setP(a.profile);setSettings(b.settings);}).catch(setError);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[call,acting]);
 useEffect(()=>{load();},[load]);
 useLive(['profile','media','check','couple'],load);
 return {p,settings,error,load};
}

/** One section of the new «Я»: «Мой профиль», «Галерея», «Приватная часть» — the current blocks, one level down. */
export function MeNewSection(){
 const {section}=useParams();const {state,acting,call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const {p,settings,error,load}=useMe();
 const [options,setOptions]=useState<z.infer<typeof option>[]>([]);const [places,setPlaces]=useState<Place[]>([]);
 useEffect(()=>{if(section==='profile')call('catalog.get',{},catalogRes,{asAccount:true}).then(r=>{setOptions(r.options);setPlaces(r.places??[]);}).catch(()=>{});},[call,section]);
 if(state.status!=='ready'||!acting)return null;
 const cp=acting.kind==='couple';
 const couple=state.boot.profiles.find(x=>x.kind==='couple'&&x.state!=='deleted');
 const title=section==='gallery'?t('fe.mx.gal'):section==='private'?t('fe.m2.private'):t('fe.m2.profile');
 const label=(kind:string,code:string)=>{const o=options.find(x=>x.kind===kind&&x.code===code);return o?(locale==='en'?o.en:o.ru):code;};
 return <>
  <Bar title={title} back="/n/me">{section==='gallery'&&<AddBtn label={t('fe.mx.gal.upload')} onClick={()=>navigate('/n/feed/new?x=media')}/>}</Bar>
  <View refresh={load}>
   {error&&!p?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!p||!settings?(section==='profile'?<MeSkel/>:<Skel kind="card" rows={2}/>)
    :section==='gallery'?<MeGallery profileId={p.id} couple={cp} title={t('fe.mx.gal')} own/>
    :section==='private'?<PrivateLayer profileId={p.id} on={settings.privateOn!==false} requestsFrom={settings.requestsFrom??'all'} onChanged={load} askHere={false} accessHere={false}/>
    :<>
     <PhotosBlock p={p} settings={settings} onChanged={load}/>
     <BasicsForm p={p} places={places} onSaved={load}/>
     <DetailsBlock p={p} label={label}/>
     <LinksBlock key={'links'+p.id}/>
     <MeAboutBlock p={p}/>
     <MeJars key={p.id}/>
     <MeGallery profileId={p.id} couple={cp} title={t('fe.mx.gal')}/>
     <PrivateLayer profileId={p.id} on={settings.privateOn!==false} requestsFrom={settings.requestsFrom??'all'} onChanged={load} askHere={false}/>
    </>}
  </View>
 </>;
}

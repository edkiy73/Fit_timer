import {useRef,useState} from 'react';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Camera} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Ask,FilePick} from './kit';
import {Uploader} from './kit/Uploader';
import {useSendPhoto} from './media-upload';
import {useFe} from './session';

const ok=z.object({ok:z.literal(true)}).passthrough();

/** Turning Discover on without a photo (owner 28.10.2026): Discover is off for new accounts, and switching it on asks
 * for a photo first. «Загрузить фото» opens the photo uploader (4:5, like the profile photos); the photo is added to
 * the profile and then `onAdded` switches Discover on. Photos are reviewed, so the text says the card shows up once
 * the photo is approved. Used by «Я → Видимость» and by sign-up step «Знакомства». */
export function DiscoverPhotoAsk({existing,profileId,couple,onAdded,onCancel}:{/** Profile photo ids already there (kept, the new one goes last). */ existing:string[],
 /** The profile acting (sign-up passes it before the app frame knows it). */ profileId?:string|undefined,couple?:boolean,
 onAdded:()=>Promise<void>|void,onCancel:()=>void}){
 const {call}=useFe();const {t}=useI18n();
 const file=useRef<HTMLInputElement>(null);const [files,setFiles]=useState<File[]|null>(null);
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const send=useSendPhoto('avatar',{},profileId);
 const done=async(ids:string[])=>{
  setFiles(null);if(!ids.length)return;
  setBusy(true);setFailure('');
  try{
   await call('profile.photosSet',{opId:newOpId(),assetIds:[...existing,...ids].slice(0,6)},ok,profileId?{profileId}:{});
   await onAdded();
  }catch(e){setFailure(feErrorMessage(e,t));}finally{setBusy(false);}
 };
 return <>
  {!files&&<Ask icon={Camera} tone="l" title={t('fe.dph.title')} text={t(couple?'fe.dph.textUs':'fe.dph.text')} ok={t('fe.dph.upload')} cancel={t('fe.dph.later')}
   busy={busy} error={failure||undefined} onOk={()=>file.current?.click()} onCancel={onCancel}/>}
  <FilePick ref={file} accept="image/*" onFiles={f=>setFiles([...f].slice(0,1))}/>
  {files&&<Uploader files={files} aspects={['4:5']} max={1} send={send} onClose={()=>setFiles(null)} onDone={got=>void done(got.map(g=>g.id))}/>}
 </>;
}

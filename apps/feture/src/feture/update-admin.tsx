import {useCallback,useEffect,useState} from 'react';
import type {AdminSectionContext} from '@appbase/ui-react/admin.js';

/* Admin → «Обновление приложения», as in UnMute (src/admin-update.tsx). The installed Android app compares its version
   with what is published here (lib/app-update.js → /api/config); see src/fe/app-update.tsx. The latest build
   comes from the GitHub release feture-latest made by .github/workflows/feture-android.yml. */

interface Channel {latestCode:number;minimumCode:number;latestName:string;url:string;messageRu:string;messageEn:string}
interface Build {versionCode:number;versionName:string;apkUrl:string;releaseUrl:string;builtAt:string}
interface Update {direct:Channel;store:Channel}

const LATEST_APK='https://github.com/edkiy73/Fit_timer/releases/download/feture-latest/FetUre-latest.apk';
const EMPTY:Channel={latestCode:0,minimumCode:0,latestName:'',url:'',messageRu:'',messageEn:''};

function when(value:string):string{
 const date=new Date(value);
 return Number.isNaN(date.getTime())?'':date.toLocaleString('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
}
function Status({text}:{text:string}){return text?<p className="ab-admin-empty" role="status">{text}</p>:null;}

export function UpdateAdmin({client,adminKey}:AdminSectionContext){
 const [update,setUpdate]=useState<Update|null>(null);
 const [build,setBuild]=useState<Build|null>(null);
 const [buildError,setBuildError]=useState('');
 const [busy,setBusy]=useState(false);
 const [directNote,setDirectNote]=useState('');
 const [storeNote,setStoreNote]=useState('');
 const [message,setMessage]=useState('');
 const [minimum,setMinimum]=useState('0');
 const [storeCode,setStoreCode]=useState('');
 const [storeUrl,setStoreUrl]=useState('https://play.google.com/store/apps/details?id=ru.feture.app');

 const direct={...EMPTY,...update?.direct};
 const store={...EMPTY,...update?.store};

 const load=useCallback(async()=>{
  const result=await client.action(adminKey,'feture.update.get');
  const next=result.update as Update;
  setUpdate(next);
  setMessage(next.direct?.messageRu||'');
  setMinimum(String(next.direct?.minimumCode||0));
  if(next.store?.latestCode)setStoreCode(String(next.store.latestCode));
  if(next.store?.url)setStoreUrl(next.store.url);
  try{
   const latest=await client.action(adminKey,'android_release_latest');
   setBuild(latest.release as Build);setBuildError('');
  }catch{
   setBuild(null);
   setBuildError('Подписанной сборки пока нет (или GitHub не ответил). Она появляется после запуска «FetUre — APK для установки» в GitHub Actions, когда заданы секреты FETURE_KEYSTORE_*.');
  }
 },[client,adminKey]);

 useEffect(()=>{void load().catch(()=>setDirectNote('Не удалось загрузить настройки.'));},[load]);

 async function publish(channel:'direct'|'store',release:Channel,note:(text:string)=>void,done:string){
  setBusy(true);note('Сохраняю…');
  try{
   const result=await client.action(adminKey,'feture.update.publish',{channel,release});
   setUpdate(result.update as Update);note(done);
  }catch(error){
   note('Не сохранилось: '+String((error as {code?:string})?.code||'ошибка'));
  }finally{setBusy(false);}
 }

 function publishDirect(){
  if(!build)return;
  const min=Math.max(0,Math.min(build.versionCode,Number(minimum)||0));
  void publish('direct',{latestCode:build.versionCode,latestName:build.versionName,url:build.apkUrl,minimumCode:min,messageRu:message.trim(),messageEn:''},
   setDirectNote,'Готово: версия '+build.versionName+' выпущена. Телефоны с установленным файлом увидят «Вышла новая версия» при следующем открытии приложения.');
 }
 function publishStore(){
  const code=Math.round(Number(storeCode)||0);
  if(!code){setStoreNote('Укажи номер версии, который уже доступен в магазине.');return;}
  void publish('store',{...store,latestCode:code,url:storeUrl.trim()},setStoreNote,'Готово: версия '+code+' отмечена для магазина.');
 }

 if(!update)return <article className="ab-admin-panel"><p className="ab-admin-empty">Загружаю…</p><Status text={directNote}/></article>;
 const newer=Boolean(build&&build.versionCode>direct.latestCode);
 return <>
  <article className="ab-admin-panel">
   <h2>Скачать приложение</h2>
   <p className="ab-admin-empty">Постоянная ссылка на последнюю подписанную версию для Android: открой её на телефоне и установи или отправь тестировщику.</p>
   <p><a href={LATEST_APK}>Скачать FetUre для Android (APK)</a></p>
  </article>
  <article className="ab-admin-panel">
   <h2>Обновление для установленных из файла</h2>
   {build?<p>Последняя сборка: <b>{build.versionName}</b> (номер {build.versionCode}){build.builtAt?', '+when(build.builtAt):''}.</p>
    :<p className="ab-admin-empty">{buildError||'Проверяю последнюю сборку…'}</p>}
   <p>У людей сейчас: <b>{direct.latestCode?direct.latestName+' (номер '+direct.latestCode+')':'ещё ничего не выпускали'}</b>.</p>
   <label><span>Что нового (необязательно, увидят в приложении)</span>
    <input value={message} maxLength={240} onChange={e=>setMessage(e.target.value)} placeholder="Например: быстрее лента и исправления"/>
   </label>
   <label><span>Обязательно обновиться всем, у кого номер версии ниже (0 — не заставлять)</span>
    <input type="number" min={0} value={minimum} onChange={e=>setMinimum(e.target.value)}/>
   </label>
   <button type="button" disabled={busy||!build} onClick={publishDirect}>{newer?'Выпустить последнюю сборку':'Сохранить'}</button>
   <Status text={directNote}/>
  </article>
  <article className="ab-admin-panel">
   <h2>Обновление из магазина</h2>
   <p className="ab-admin-empty">Нажимай, только когда версия уже появилась в Google Play: людям откроется страница магазина.</p>
   <p>Сейчас отмечено: <b>{store.latestCode?'номер '+store.latestCode:'ничего'}</b>.</p>
   <label><span>Номер версии в магазине</span>
    <input type="number" min={1} value={storeCode} onChange={e=>setStoreCode(e.target.value)}/>
   </label>
   <label><span>Ссылка на страницу в магазине</span>
    <input value={storeUrl} onChange={e=>setStoreUrl(e.target.value)}/>
   </label>
   <button type="button" disabled={busy} onClick={publishStore}>Отметить версию в магазине</button>
   <Status text={storeNote}/>
  </article>
 </>;
}

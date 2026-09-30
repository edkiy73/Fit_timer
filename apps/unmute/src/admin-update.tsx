import { useCallback, useEffect, useState } from 'react';
import type { AdminSection, AdminSectionContext } from '@appbase/ui-react/admin.js';

/* Admin → «Обновление приложения». The phone compares its version with what is published
   here (Core settings → update.android.{direct,store}); see src/app-update.tsx. */

interface Channel {
  latestCode:number;
  minimumCode:number;
  latestName:string;
  url:string;
  messageRu:string;
  messageEn:string;
}

interface Build {
  versionCode:number;
  versionName:string;
  apkUrl:string;
  releaseUrl:string;
  builtAt:string;
}

type Settings = Record<string, unknown> & {update?:{android?:{direct?:Channel; store?:Channel}}};

const LATEST_APK='https://github.com/edkiy73/Fit_timer/releases/download/unmute-latest/UnMute-latest.apk';
const EMPTY:Channel={latestCode:0,minimumCode:0,latestName:'',url:'',messageRu:'',messageEn:''};

function when(value:string):string{
  const date=new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
}

function Status({text}:{text:string}){
  return text ? <p className="ab-admin-empty" role="status">{text}</p> : null;
}

function UpdateAdmin({client,adminKey}:AdminSectionContext){
  const [settings,setSettings]=useState<Settings|null>(null);
  const [build,setBuild]=useState<Build|null>(null);
  const [buildError,setBuildError]=useState('');
  const [busy,setBusy]=useState(false);
  const [directNote,setDirectNote]=useState('');
  const [storeNote,setStoreNote]=useState('');
  const [message,setMessage]=useState('');
  const [minimum,setMinimum]=useState('0');
  const [storeCode,setStoreCode]=useState('');
  const [storeUrl,setStoreUrl]=useState('https://play.google.com/store/apps/details?id=app.unmute.english');

  const direct={...EMPTY,...settings?.update?.android?.direct};
  const store={...EMPTY,...settings?.update?.android?.store};

  const load=useCallback(async()=>{
    const result=await client.action(adminKey,'settings_get');
    const next=result.settings as Settings;
    setSettings(next);
    const d={...EMPTY,...next.update?.android?.direct};
    const s={...EMPTY,...next.update?.android?.store};
    setMessage(d.messageRu);
    setMinimum(String(d.minimumCode||0));
    if(s.latestCode) setStoreCode(String(s.latestCode));
    if(s.url) setStoreUrl(s.url);
    try{
      const latest=await client.action(adminKey,'android_release_latest');
      setBuild(latest.release as Build);
      setBuildError('');
    }catch{
      setBuild(null);
      setBuildError('Сборка ещё не готова или GitHub не ответил. Сборка появляется через 10–15 минут после изменений в приложении.');
    }
  },[client,adminKey]);

  useEffect(()=>{ void load().catch(()=>setDirectNote('Не удалось загрузить настройки.')); },[load]);

  async function saveChannel(name:'direct'|'store',channel:Channel,note:(text:string)=>void,done:string){
    if(!settings) return;
    setBusy(true);
    note('Сохраняю…');
    try{
      const android={...settings.update?.android,[name]:channel};
      const result=await client.action(adminKey,'save_settings',{settings:{...settings,update:{...settings.update,android}}});
      setSettings(result.settings as Settings);
      note(done);
    }catch(error){
      note('Не сохранилось: '+String((error as {code?:string})?.code||'ошибка'));
    }finally{
      setBusy(false);
    }
  }

  function publishDirect(){
    if(!build) return;
    const min=Math.max(0,Math.min(build.versionCode,Number(minimum)||0));
    void saveChannel('direct',{
      latestCode:build.versionCode,
      latestName:build.versionName,
      url:build.apkUrl,
      minimumCode:min,
      messageRu:message.trim(),
      messageEn:''
    },setDirectNote,'Готово: версия '+build.versionName+' выпущена. Телефоны с установленным файлом увидят «Вышла новая версия» при следующем запуске.');
  }

  function publishStore(){
    const code=Math.round(Number(storeCode)||0);
    if(!code){ setStoreNote('Укажи номер версии, который уже доступен в магазине.'); return; }
    void saveChannel('store',{...store,latestCode:code,latestName:store.latestName,url:storeUrl.trim()},setStoreNote,'Готово: версия '+code+' отмечена для магазина.');
  }

  if(!settings) return <article className="ab-admin-panel"><p className="ab-admin-empty">Загружаю…</p><Status text={directNote} /></article>;

  const newer=Boolean(build&&build.versionCode>direct.latestCode);
  return (
    <>
      <article className="ab-admin-panel">
        <h2>Скачать приложение</h2>
        <p className="ab-admin-empty">Постоянная ссылка на последнюю версию для Android. Её можно открыть на телефоне и установить или отправить ученику.</p>
        <p><a href={LATEST_APK}>Скачать UnMute для Android (APK)</a></p>
      </article>

      <article className="ab-admin-panel">
        <h2>Обновление для установленных из файла</h2>
        {build ? (
          <p>Последняя сборка: <b>{build.versionName}</b> (номер {build.versionCode}){build.builtAt?', '+when(build.builtAt):''}.</p>
        ) : <p className="ab-admin-empty">{buildError||'Проверяю последнюю сборку…'}</p>}
        <p>У учеников сейчас: <b>{direct.latestCode ? direct.latestName+' (номер '+direct.latestCode+')' : 'ещё ничего не выпускали'}</b>.</p>
        <label><span>Что нового (необязательно, увидят ученики)</span>
          <input value={message} maxLength={240} onChange={event=>setMessage(event.target.value)} placeholder="Например: новые уроки и исправления" />
        </label>
        <label><span>Обязательно обновиться всем, у кого номер версии ниже (0 — не заставлять)</span>
          <input type="number" min={0} value={minimum} onChange={event=>setMinimum(event.target.value)} />
        </label>
        <button type="button" disabled={busy||!build} onClick={publishDirect}>
          {newer ? 'Выпустить последнюю сборку' : 'Сохранить'}
        </button>
        <Status text={directNote} />
      </article>

      <article className="ab-admin-panel">
        <h2>Обновление из магазина</h2>
        <p className="ab-admin-empty">Нажимай, только когда версия уже появилась в Google Play: ученикам откроется страница магазина.</p>
        <p>Сейчас отмечено: <b>{store.latestCode ? 'номер '+store.latestCode : 'ничего'}</b>.</p>
        <label><span>Номер версии в магазине</span>
          <input type="number" min={1} value={storeCode} onChange={event=>setStoreCode(event.target.value)} />
        </label>
        <label><span>Ссылка на страницу в магазине</span>
          <input value={storeUrl} onChange={event=>setStoreUrl(event.target.value)} />
        </label>
        <button type="button" disabled={busy} onClick={publishStore}>Отметить версию в магазине</button>
        <Status text={storeNote} />
      </article>
    </>
  );
}

export const updateAdminSection:AdminSection={
  id:'app-update',
  label:'Обновление приложения',
  group:'Приложение',
  render(context){ return <UpdateAdmin {...context} />; }
};

import { useState } from 'react';
import type { AdminClient } from '@appbase/core/admin.js';

type Locale='ru'|'en';
type CopyBlock={title:string;body:string};

const COPY={
  ru:{
    title:'Рассылки', intro:'Отправка через общий AppBase Core. Сначала сделай предпросмотр — он ничего не отправляет.',
    kind:'Тип', news:'Новости', offers:'Предложение', channels:'Каналы', push:'Push', email:'Email',
    ruTitle:'Заголовок RU', ruBody:'Текст RU', enTitle:'Заголовок EN', enBody:'Текст EN',
    preview:'Проверить аудиторию', send:'Отправить', sending:'Отправляю…', previewing:'Считаю…',
    confirm:'Отправить рассылку всем подходящим пользователям?', required:'Заполни RU и EN заголовок и текст.',
    noChannel:'Выбери хотя бы один канал.', failed:'Не удалось выполнить рассылку.',
    eligible:'Подходит', sent:'Отправлено', skipped:'Пропущено', errors:'Ошибок', total:'Аккаунтов',
    note:'Push имеет приоритет. Email используется как fallback, если push недоступен и пользователь разрешил email. Для offers действует лимит частоты Core.'
  },
  en:{
    title:'Campaigns', intro:'Delivery uses shared AppBase Core. Run preview first; preview sends nothing.',
    kind:'Type', news:'News', offers:'Offer', channels:'Channels', push:'Push', email:'Email',
    ruTitle:'RU title', ruBody:'RU body', enTitle:'EN title', enBody:'EN body',
    preview:'Preview audience', send:'Send', sending:'Sending…', previewing:'Checking…',
    confirm:'Send this campaign to all eligible users?', required:'Fill RU and EN title and body.',
    noChannel:'Choose at least one channel.', failed:'Campaign request failed.',
    eligible:'Eligible', sent:'Sent', skipped:'Skipped', errors:'Errors', total:'Accounts',
    note:'Push has priority. Email is fallback when push is unavailable and the user allowed email. Offers also use the Core frequency limit.'
  }
} as const;

type Result={
  preview?:boolean; done?:boolean; cursor?:number; total?:number;
  pushSent?:number; emailSent?:number; pushEligible?:number; emailEligible?:number;
  skipped?:number; failed?:number;
};

export function AdminCampaigns({client,adminKey,locale}:{client:AdminClient;adminKey:string;locale:Locale}){
  const copy=COPY[locale];
  const [kind,setKind]=useState<'news'|'offers'>('news');
  const [push,setPush]=useState(true);
  const [email,setEmail]=useState(false);
  const [ru,setRu]=useState<CopyBlock>({title:'',body:''});
  const [en,setEn]=useState<CopyBlock>({title:'',body:''});
  const [busy,setBusy]=useState<'preview'|'send'|''>('');
  const [error,setError]=useState('');
  const [result,setResult]=useState<Result|null>(null);

  function valid(){
    if(!push&&!email){setError(copy.noChannel);return false;}
    if(!ru.title.trim()||!ru.body.trim()||!en.title.trim()||!en.body.trim()){setError(copy.required);return false;}
    return true;
  }

  async function run(preview:boolean){
    if(!valid())return;
    if(!preview&&!window.confirm(copy.confirm))return;
    setBusy(preview?'preview':'send'); setError(''); setResult(null);
    try{
      let cursor=0;
      const total:Result={preview,total:0,pushSent:0,emailSent:0,pushEligible:0,emailEligible:0,skipped:0,failed:0};
      while(true){
        const r=await client.action(adminKey,'campaign_send',{
          kind,push,email,preview,cursor,
          copy:{ru:{title:ru.title.trim(),body:ru.body.trim()},en:{title:en.title.trim(),body:en.body.trim()}}
        }) as Result;
        total.total=r.total||total.total||0;
        total.pushSent=(total.pushSent||0)+(r.pushSent||0);
        total.emailSent=(total.emailSent||0)+(r.emailSent||0);
        total.pushEligible=(total.pushEligible||0)+(r.pushEligible||0);
        total.emailEligible=(total.emailEligible||0)+(r.emailEligible||0);
        total.skipped=(total.skipped||0)+(r.skipped||0);
        total.failed=(total.failed||0)+(r.failed||0);
        if(r.done){total.done=true;break;}
        const next=Number(r.cursor||0);
        if(next<=cursor)throw new Error('campaign_cursor_stalled');
        cursor=next;
      }
      setResult(total);
    }catch(_){setError(copy.failed);}
    finally{setBusy('');}
  }

  const eligible=(result?.pushEligible||0)+(result?.emailEligible||0);
  const sent=(result?.pushSent||0)+(result?.emailSent||0);

  return <section className="ab-admin-stack">
    <article className="ab-admin-panel">
      <h2>{copy.title}</h2>
      <p className="ab-admin-note">{copy.intro}</p>

      <div className="ab-admin-row">
        <label><span>{copy.kind}</span>
          <select value={kind} onChange={e=>setKind(e.target.value==='offers'?'offers':'news')}>
            <option value="news">{copy.news}</option>
            <option value="offers">{copy.offers}</option>
          </select>
        </label>
      </div>

      <div className="ab-admin-row">
        <span>{copy.channels}</span>
        <label><input type="checkbox" checked={push} onChange={e=>setPush(e.target.checked)} /> {copy.push}</label>
        <label><input type="checkbox" checked={email} onChange={e=>setEmail(e.target.checked)} /> {copy.email}</label>
      </div>

      <div className="ab-admin-grid">
        <label><span>{copy.ruTitle}</span><input maxLength={100} value={ru.title} onChange={e=>setRu(v=>({...v,title:e.target.value}))} /></label>
        <label><span>{copy.enTitle}</span><input maxLength={100} value={en.title} onChange={e=>setEn(v=>({...v,title:e.target.value}))} /></label>
      </div>
      <div className="ab-admin-grid">
        <label><span>{copy.ruBody}</span><textarea rows={5} maxLength={1000} value={ru.body} onChange={e=>setRu(v=>({...v,body:e.target.value}))} /></label>
        <label><span>{copy.enBody}</span><textarea rows={5} maxLength={1000} value={en.body} onChange={e=>setEn(v=>({...v,body:e.target.value}))} /></label>
      </div>

      <p className="ab-admin-note">{copy.note}</p>
      {error&&<p className="ab-admin-error" role="alert">{error}</p>}
      <div className="ab-admin-row">
        <button type="button" className="ab-admin-secondary" disabled={!!busy} onClick={()=>void run(true)}>{busy==='preview'?copy.previewing:copy.preview}</button>
        <button type="button" disabled={!!busy} onClick={()=>void run(false)}>{busy==='send'?copy.sending:copy.send}</button>
      </div>
    </article>

    {result&&<article className="ab-admin-panel">
      <div className="ab-admin-grid">
        <div className="ab-admin-card"><span>{result.preview?copy.eligible:copy.sent}</span><strong>{String(result.preview?eligible:sent)}</strong></div>
        <div className="ab-admin-card"><span>Push</span><strong>{String(result.preview?result.pushEligible||0:result.pushSent||0)}</strong></div>
        <div className="ab-admin-card"><span>Email</span><strong>{String(result.preview?result.emailEligible||0:result.emailSent||0)}</strong></div>
        <div className="ab-admin-card"><span>{copy.skipped}</span><strong>{String(result.skipped||0)}</strong></div>
        <div className="ab-admin-card"><span>{copy.errors}</span><strong>{String(result.failed||0)}</strong></div>
        <div className="ab-admin-card"><span>{copy.total}</span><strong>{String(result.total||0)}</strong></div>
      </div>
    </article>}
  </section>;
}

import { useMemo, useState } from 'react';
import type { AdminClient } from '@appbase/core/admin.js';

type Locale='ru'|'en';
type Kind='news'|'offers';

type CampaignCopy={
  title:string;
  body:string;
};

type CampaignResult={
  done?:boolean;
  cursor?:number;
  total?:number;
  pushSent?:number;
  emailSent?:number;
  pushEligible?:number;
  emailEligible?:number;
  skipped?:number;
  failed?:number;
};

const COPY={
  ru:{
    title:'Рассылки',
    hint:'Сначала проверь аудиторию. Отправка идёт небольшими пачками и уважает пользовательские настройки.',
    kind:'Тип',
    news:'Новости',
    offers:'Предложения',
    channels:'Каналы',
    push:'Push на телефон',
    email:'Email',
    route:'Куда открыть по нажатию',
    routeHint:'Необязательно. Например /review или /course.',
    ru:'Русский',
    en:'English',
    subject:'Заголовок',
    body:'Текст',
    preview:'Проверить аудиторию',
    send:'Отправить',
    previewNeeded:'Сначала проверь аудиторию после последнего изменения текста или каналов.',
    sending:'Отправляю…',
    previewing:'Считаю аудиторию…',
    confirm:'Отправить эту рассылку сейчас?',
    targets:'Аудитория',
    pushTargets:'push',
    emailTargets:'email',
    scanned:'аккаунтов проверено',
    sent:'Отправлено',
    pushSent:'push',
    emailSent:'email',
    skipped:'пропущено',
    failed:'ошибок',
    done:'Готово.',
    required:'Заполни заголовок и текст на русском и английском и выбери хотя бы один канал.',
    failedRequest:'Не удалось выполнить рассылку.'
  },
  en:{
    title:'Campaigns',
    hint:'Preview the audience first. Delivery runs in small batches and respects user preferences.',
    kind:'Type',
    news:'News',
    offers:'Offers',
    channels:'Channels',
    push:'Phone push',
    email:'Email',
    route:'Open on tap',
    routeHint:'Optional. For example /review or /course.',
    ru:'Русский',
    en:'English',
    subject:'Title',
    body:'Body',
    preview:'Preview audience',
    send:'Send',
    previewNeeded:'Preview the audience after the latest text or channel change first.',
    sending:'Sending…',
    previewing:'Calculating audience…',
    confirm:'Send this campaign now?',
    targets:'Audience',
    pushTargets:'push',
    emailTargets:'email',
    scanned:'accounts scanned',
    sent:'Sent',
    pushSent:'push',
    emailSent:'email',
    skipped:'skipped',
    failed:'failed',
    done:'Done.',
    required:'Fill in Russian and English title/body and choose at least one channel.',
    failedRequest:'Could not run the campaign.'
  }
} as const;

type Form={
  kind:Kind;
  push:boolean;
  email:boolean;
  route:string;
  ru:CampaignCopy;
  en:CampaignCopy;
};

const INITIAL:Form={
  kind:'news',
  push:true,
  email:false,
  route:'',
  ru:{title:'',body:''},
  en:{title:'',body:''}
};

function fingerprint(form:Form):string{
  return JSON.stringify(form);
}

async function runCampaign(
  client:AdminClient,
  adminKey:string,
  form:Form,
  preview:boolean
):Promise<Required<Pick<CampaignResult,'total'|'pushSent'|'emailSent'|'pushEligible'|'emailEligible'|'skipped'|'failed'>>>{
  let cursor=0;
  const totals={total:0,pushSent:0,emailSent:0,pushEligible:0,emailEligible:0,skipped:0,failed:0};
  let guard=0;
  while(guard++<10000){
    const result=await client.action<CampaignResult>(adminKey,'campaign_send',{
      kind:form.kind,
      push:form.push,
      email:form.email,
      preview,
      cursor,
      route:form.route.trim(),
      copy:{
        ru:{title:form.ru.title.trim(),body:form.ru.body.trim()},
        en:{title:form.en.title.trim(),body:form.en.body.trim()}
      }
    });
    totals.total=Math.max(totals.total,Number(result.total)||0);
    totals.pushSent+=Number(result.pushSent)||0;
    totals.emailSent+=Number(result.emailSent)||0;
    totals.pushEligible+=Number(result.pushEligible)||0;
    totals.emailEligible+=Number(result.emailEligible)||0;
    totals.skipped+=Number(result.skipped)||0;
    totals.failed+=Number(result.failed)||0;
    if(result.done)break;
    const next=Number(result.cursor);
    if(!Number.isFinite(next)||next<=cursor)throw new Error('campaign_cursor_stalled');
    cursor=next;
  }
  if(guard>=10000)throw new Error('campaign_too_many_batches');
  return totals;
}

export function AdminCampaigns({
  client,
  adminKey,
  locale
}:{
  client:AdminClient;
  adminKey:string;
  locale:Locale;
}){
  const copy=COPY[locale];
  const [form,setForm]=useState<Form>(INITIAL);
  const [busy,setBusy]=useState<'preview'|'send'|''>('');
  const [preview,setPreview]=useState<Awaited<ReturnType<typeof runCampaign>>|null>(null);
  const [previewFingerprint,setPreviewFingerprint]=useState('');
  const [result,setResult]=useState<Awaited<ReturnType<typeof runCampaign>>|null>(null);
  const [error,setError]=useState('');

  const currentFingerprint=useMemo(()=>fingerprint(form),[form]);
  const ready=
    (form.push||form.email)&&
    !!form.ru.title.trim()&&!!form.ru.body.trim()&&
    !!form.en.title.trim()&&!!form.en.body.trim();
  const previewFresh=preview&&previewFingerprint===currentFingerprint;

  function update(patch:Partial<Form>){
    setForm(current=>({...current,...patch}));
    setResult(null);
    setError('');
  }
  function updateCopy(lang:'ru'|'en',patch:Partial<CampaignCopy>){
    setForm(current=>({...current,[lang]:{...current[lang],...patch}}));
    setResult(null);
    setError('');
  }

  async function previewAudience(){
    if(!ready){setError(copy.required);return;}
    setBusy('preview');setError('');setResult(null);
    try{
      const next=await runCampaign(client,adminKey,form,true);
      setPreview(next);
      setPreviewFingerprint(currentFingerprint);
    }catch(_){
      setError(copy.failedRequest);
    }finally{setBusy('');}
  }

  async function sendNow(){
    if(!ready){setError(copy.required);return;}
    if(!previewFresh){setError(copy.previewNeeded);return;}
    if(!window.confirm(copy.confirm))return;
    setBusy('send');setError('');
    try{
      const next=await runCampaign(client,adminKey,form,false);
      setResult(next);
      setPreview(null);
      setPreviewFingerprint('');
    }catch(_){
      setError(copy.failedRequest);
    }finally{setBusy('');}
  }

  return (
    <section className="ab-admin-stack">
      <article className="ab-admin-panel ab-admin-campaign">
        <h2>{copy.title}</h2>
        <p className="ab-admin-note">{copy.hint}</p>

        <div className="ab-admin-campaign-grid">
          <label><span>{copy.kind}</span>
            <select value={form.kind} onChange={event=>update({kind:event.target.value as Kind})}>
              <option value="news">{copy.news}</option>
              <option value="offers">{copy.offers}</option>
            </select>
          </label>
          <label><span>{copy.route}</span>
            <input
              value={form.route}
              maxLength={300}
              placeholder="/review"
              onChange={event=>update({route:event.target.value})}
            />
            <small>{copy.routeHint}</small>
          </label>
        </div>

        <fieldset className="ab-admin-fieldset">
          <legend>{copy.channels}</legend>
          <label className="ab-admin-check">
            <input type="checkbox" checked={form.push} onChange={event=>update({push:event.target.checked})} />
            {copy.push}
          </label>
          <label className="ab-admin-check">
            <input type="checkbox" checked={form.email} onChange={event=>update({email:event.target.checked})} />
            {copy.email}
          </label>
        </fieldset>

        {(['ru','en'] as const).map(lang=>(
          <fieldset className="ab-admin-fieldset" key={lang}>
            <legend>{copy[lang]}</legend>
            <label><span>{copy.subject}</span>
              <input
                value={form[lang].title}
                maxLength={100}
                onChange={event=>updateCopy(lang,{title:event.target.value})}
              />
            </label>
            <label><span>{copy.body}</span>
              <textarea
                value={form[lang].body}
                maxLength={1000}
                rows={5}
                onChange={event=>updateCopy(lang,{body:event.target.value})}
              />
            </label>
          </fieldset>
        ))}

        {error&&<p className="ab-admin-error" role="alert">{error}</p>}

        {previewFresh&&preview&&(
          <div className="ab-admin-campaign-summary" role="status">
            <strong>{copy.targets}</strong>
            <span>{copy.pushTargets}: {preview.pushEligible}</span>
            <span>{copy.emailTargets}: {preview.emailEligible}</span>
            <span>{copy.scanned}: {preview.total}</span>
          </div>
        )}

        {result&&(
          <div className="ab-admin-campaign-summary" role="status">
            <strong>{copy.sent}</strong>
            <span>{copy.pushSent}: {result.pushSent}</span>
            <span>{copy.emailSent}: {result.emailSent}</span>
            <span>{copy.skipped}: {result.skipped}</span>
            <span>{copy.failed}: {result.failed}</span>
            <span>{copy.done}</span>
          </div>
        )}

        <div className="ab-admin-action-row">
          <button type="button" className="ab-admin-secondary" disabled={!!busy||!ready} onClick={()=>void previewAudience()}>
            {busy==='preview'?copy.previewing:copy.preview}
          </button>
          <button type="button" disabled={!!busy||!previewFresh} onClick={()=>void sendNow()}>
            {busy==='send'?copy.sending:copy.send}
          </button>
        </div>
      </article>
    </section>
  );
}

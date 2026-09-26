'use strict';

const { productIdentity } = require('../product-core');
const { store } = require('../store');
const { send, fail, clampLine, clampText } = require('../util');
const { sendPushToAccountHash, notificationPrefs } = require('../push');
const { sendMail } = require('../mail');
const { ensureAccountIndex } = require('./accounts');

const ACTIONS = new Set(['campaign_send']);
const productName = () => productIdentity().name || 'App';

const escMail = v => String(v == null ? '' : v)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

async function handleAdminCampaigns(action, body, res){
  if(!ACTIONS.has(action)) return false;

  await ensureAccountIndex();
  const kind = body && body.kind === 'offers' ? 'offers' : 'news';
  const wantPush = !!(body && body.push);
  const wantEmail = !!(body && body.email);
  const preview = !!(body && body.preview);
  if(!wantPush && !wantEmail){
    fail(res,400,'no_channel');
    return true;
  }

  const copy = (body && body.copy) || {};
  const cleanCopy = lang => ({
    title: clampLine(copy[lang] && copy[lang].title, 100),
    body: clampText(copy[lang] && copy[lang].body, 1000)
  });
  const texts = {ru:cleanCopy('ru'), en:cleanCopy('en')};
  if(!texts.ru.title || !texts.ru.body || !texts.en.title || !texts.en.body){
    fail(res,400,'campaign_copy_required');
    return true;
  }

  const unique = [...new Set((await store.list('a:all')).filter(x=>/^[a-f0-9]{32}$/.test(String(x))))];
  const cursor = Math.max(0, Math.min(unique.length, +body.cursor || 0));
  const batch = unique.slice(cursor, cursor + 8);
  let pushSent=0,emailSent=0,skipped=0,failed=0,pushEligible=0,emailEligible=0;

  for(const mh of batch){
    let acc=null;
    try{acc=JSON.parse(await store.get(`a:${mh}`));}catch(_){}
    if(!acc || !acc.email){skipped++;continue;}

    const prefs=await notificationPrefs(mh);
    const locale=acc.locale==='en'?'en':'ru';
    const msg=texts[locale];

    if(kind==='offers'){
      const last=Date.parse(await store.get(`campaign:last:offers:${mh}`)||'')||0;
      if(Date.now()-last < 14*86400000){skipped++;continue;}
    }

    let delivered=false;
    const pushCan = wantPush && prefs.offers !== false && Object.keys(acc.pushDevices||{}).length > 0;
    const emailPref = kind==='offers' ? prefs.emailOffers === true : prefs.emailNews === true;
    const emailCan = !pushCan && wantEmail && emailPref;

    if(preview){
      if(pushCan){pushEligible++;delivered=true;}
      else if(emailCan){emailEligible++;delivered=true;}
    }else{
      if(wantPush && prefs.offers !== false){
        try{
          const r=await sendPushToAccountHash(mh,{
            category:'offers',title:msg.title,body:msg.body,
            data:{stage:'campaign',kind,category:'offers'}
          });
          if(r&&r.sent>0){pushSent+=r.sent;delivered=true;}
        }catch(_){failed++;}
      }

      if(!delivered && wantEmail && emailPref){
        try{
          const text=msg.body+'\n\n'+productName();
          const html=`<div style="font:16px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:#1B1630"><h2 style="font-size:22px">${escMail(msg.title)}</h2><p>${escMail(msg.body).replace(/\n/g,'<br>')}</p><p style="color:#6C6785;font-size:13px">Настройки рассылок можно изменить в ${escMail(productName())} → Аккаунт → Уведомления.</p></div>`;
          await sendMail({to:acc.email,subject:msg.title,text,html});
          emailSent++;
          delivered=true;
        }catch(_){failed++;}
      }

      if(delivered && kind==='offers'){
        await store.set(`campaign:last:offers:${mh}`,new Date().toISOString(),30*24*3600);
      }
    }

    if(!delivered) skipped++;
  }

  const next=cursor+batch.length;
  send(res,200,{
    ok:true,preview,cursor:next,done:next>=unique.length,total:unique.length,
    pushSent,emailSent,pushEligible,emailEligible,skipped,failed
  });
  return true;
}

module.exports={handleAdminCampaigns,ACTIONS};

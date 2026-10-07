'use strict';

const crypto=require('crypto');

const ACTIVE_DAYS_KEPT=60;
const RETENTION_DAYS=Object.freeze([1,7,30]);

function createAnalyticsEngine({
  store,
  events,
  /** Product funnel: ordered steps, each reached by any of its events (first time per device). */
  funnel=[],
  dayTtl=120*24*3600,
  deviceTtl=180*24*3600,
  uniqueTtl=45*24*3600,
  idempotencyTtl=365*24*3600
}){
  const eventList=Object.freeze([...(events||[])].map(String));
  const eventSet=new Set(eventList);
  const funnelSteps=Object.freeze((Array.isArray(funnel)?funnel:[])
    .map(step=>({id:String(step&&step.id||''),events:(Array.isArray(step&&step.events)?step.events:[]).map(String).filter(e=>eventSet.has(e))}))
    .filter(step=>step.id&&step.events.length));
  const cleanPlatform=v=>['android','ios','web'].includes(String(v||''))?String(v):'web';
  const cleanLocale=v=>String(v||'').toLowerCase()==='en'?'en':'ru';
  const deviceHash=v=>crypto.createHash('sha256').update(String(v||'')).digest('hex').slice(0,24);

  async function recordAnalytics(input){
    const event=String(input&&input.event||'');
    if(!eventSet.has(event)) throw Object.assign(new Error('bad_event'),{status:400});
    const rawDevice=String(input&&input.deviceId||'').trim().slice(0,120);
    if(rawDevice.length<4) throw Object.assign(new Error('bad_device'),{status:400});
    const now=new Date().toISOString(), day=now.slice(0,10);
    const platform=cleanPlatform(input&&input.platform);
    const locale=cleanLocale(input&&input.locale);
    const premium=!!(input&&input.premium);
    const dh=deviceHash(rawDevice);
    const eventId=String(input&&input.eventId||'').trim().slice(0,160);

    // A client may retry after the server committed but the response was lost.
    // Claim the event operation before counters so the retry is a no-op.
    if(eventId){
      const onceHash=crypto.createHash('sha256')
        .update(rawDevice+'\0'+event+'\0'+eventId)
        .digest('hex').slice(0,32);
      const [created]=await store.pipe([
        ['SET',`analytics:event-once:${onceHash}`,'1','NX','EX',String(idempotencyTtl)]
      ]);
      if(created!=='OK')return {ok:true,event,duplicate:true};
    }

    await Promise.all([
      store.incr(`analytics:event:${day}:${event}`,dayTtl),
      store.incr(`analytics:platform:${day}:${platform}`,dayTtl),
      store.incr(`analytics:locale:${day}:${locale}`,dayTtl),
      premium?store.incr(`analytics:premium:${day}:yes`,dayTtl):Promise.resolve()
    ]);

    const uniqueKey=`analytics:unique-mark:${day}:${event}:${dh}`;
    const [created]=await store.pipe([['SET',uniqueKey,'1','NX','EX',String(uniqueTtl)]]);
    if(created==='OK') await store.incr(`analytics:unique:${day}:${event}`,dayTtl);

    const deviceKey=`analytics:device:${dh}`;
    let rec=null;
    try{rec=JSON.parse(await store.get(deviceKey)||'null');}catch(_){}
    if(!rec||typeof rec!=='object')rec={firstSeen:now,lastSeen:now,platform,locale,events:{}};
    if(!rec.events||typeof rec.events!=='object')rec.events={};
    rec.firstSeen=rec.firstSeen||now;
    rec.lastSeen=now; rec.platform=platform; rec.locale=locale;
    if(!rec.events[event])rec.events[event]=now;
    // Days the device was active (UTC), for D1/D7/D30 retention; the newest are kept.
    const activeDays=Array.isArray(rec.days)?rec.days.filter(value=>typeof value==='string'):[];
    if(!activeDays.includes(day))activeDays.push(day);
    rec.days=activeDays.sort().slice(-ACTIVE_DAYS_KEPT);
    await store.set(deviceKey,JSON.stringify(rec),deviceTtl);
    return {ok:true,event};
  }

  async function removeAnalyticsDevice(rawDevice){
    const id=String(rawDevice||'').trim().slice(0,120);
    if(id.length<4)return false;
    await store.del(`analytics:device:${deviceHash(id)}`);
    return true;
  }

  async function analyticsStats(days=30){
    days=Math.max(1,Math.min(90,Math.round(+days||30)));
    const rows=[];
    for(let i=days-1;i>=0;i--){
      const d=new Date(Date.now()-i*86400000).toISOString().slice(0,10), keys=[];
      eventList.forEach(e=>keys.push(`analytics:event:${d}:${e}`,`analytics:unique:${d}:${e}`));
      keys.push(`analytics:platform:${d}:android`,`analytics:platform:${d}:ios`,`analytics:platform:${d}:web`);
      keys.push(`analytics:locale:${d}:ru`,`analytics:locale:${d}:en`,`analytics:premium:${d}:yes`);
      const vals=await store.many(keys); let p=0; const eventRows={};
      for(const e of eventList) eventRows[e]={count:+vals[p++]||0,unique:+vals[p++]||0};
      rows.push({day:d,events:eventRows,platform:{android:+vals[p++]||0,ios:+vals[p++]||0,web:+vals[p++]||0},locale:{ru:+vals[p++]||0,en:+vals[p++]||0},premium:+vals[p++]||0});
    }

    const start=new Date(); start.setUTCHours(0,0,0,0); start.setUTCDate(start.getUTCDate()-(days-1));
    const startMs=start.getTime(), keys=await store.scan('analytics:device:*',50000), raws=await store.many(keys), devices=[], all=[];
    raws.forEach(raw=>{if(!raw)return;try{const rec=JSON.parse(raw),first=Date.parse(rec&&rec.events&&rec.events.install||rec&&rec.firstSeen||'');if(!Number.isFinite(first))return;all.push({rec,first});if(first>=startMs)devices.push(rec);}catch(_){}});
    const totals={};
    eventList.forEach(e=>{totals[e]={count:rows.reduce((n,r)=>n+(r.events[e].count||0),0),unique:devices.reduce((n,d)=>n+(d.events&&d.events[e]?1:0),0)};});
    const cohort={devices:devices.length,platform:{android:0,ios:0,web:0},locale:{ru:0,en:0}};
    devices.forEach(d=>{const p=cleanPlatform(d.platform),l=cleanLocale(d.locale);cohort.platform[p]=(cohort.platform[p]||0)+1;cohort.locale[l]=(cohort.locale[l]||0)+1;});
    // Funnel over the new devices of the period: how many reached each step.
    const funnelRows=funnelSteps.map(step=>({id:step.id,devices:devices.reduce((n,d)=>n+(step.events.some(e=>d.events&&d.events[e])?1:0),0)}));
    // Classic retention over every known device: active exactly N days after its first day.
    // Only devices whose day N has already come count; older records without `days` use last activity.
    const todayMs=Date.parse(new Date().toISOString().slice(0,10));
    const retention={};
    RETENTION_DAYS.forEach(n=>{retention['d'+n]={eligible:0,returned:0};});
    all.forEach(({rec,first})=>{
      const firstDay=Date.parse(new Date(first).toISOString().slice(0,10));
      const active=new Set(Array.isArray(rec.days)?rec.days:[]);
      if(!active.size&&rec.lastSeen)active.add(String(rec.lastSeen).slice(0,10));
      RETENTION_DAYS.forEach(n=>{
        const target=firstDay+n*86400000;
        if(target>todayMs)return;
        retention['d'+n].eligible++;
        if(active.has(new Date(target).toISOString().slice(0,10)))retention['d'+n].returned++;
      });
    });
    return {days,events:eventList,rows,totals,cohort,funnel:funnelRows,retention};
  }

  return {events:eventList,recordAnalytics,removeAnalyticsDevice,analyticsStats};
}

module.exports={createAnalyticsEngine};

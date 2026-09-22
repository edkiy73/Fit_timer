const crypto=require('crypto');
const {store}=require('./store');

const EVENTS=Object.freeze([
  'install',
  'onboarding_complete',
  'program_added',
  'workout_started',
  'workout_completed',
  'premium_opened',
  'purchase_started'
]);
const EVENT_SET=new Set(EVENTS);
const DAY_TTL=120*24*3600;
const UNIQUE_TTL=45*24*3600;

const cleanPlatform=v=>['android','ios','web'].includes(String(v||''))?String(v):'web';
const cleanLocale=v=>String(v||'').toLowerCase()==='en'?'en':'ru';
const deviceHash=v=>crypto.createHash('sha256').update(String(v||'')).digest('hex').slice(0,24);

async function recordAnalytics(input){
  const event=String(input&&input.event||'');
  if(!EVENT_SET.has(event)) throw Object.assign(new Error('bad_event'),{status:400});
  const rawDevice=String(input&&input.deviceId||'').trim().slice(0,120);
  if(rawDevice.length<4) throw Object.assign(new Error('bad_device'),{status:400});
  const day=new Date().toISOString().slice(0,10);
  const platform=cleanPlatform(input&&input.platform);
  const locale=cleanLocale(input&&input.locale);
  const premium=!!(input&&input.premium);
  const dh=deviceHash(rawDevice);

  await Promise.all([
    store.incr(`analytics:event:${day}:${event}`,DAY_TTL),
    store.incr(`analytics:platform:${day}:${platform}`,DAY_TTL),
    store.incr(`analytics:locale:${day}:${locale}`,DAY_TTL),
    premium?store.incr(`analytics:premium:${day}:yes`,DAY_TTL):Promise.resolve()
  ]);

  const uniqueKey=`analytics:unique-mark:${day}:${event}:${dh}`;
  const [created]=await store.pipe([['SET',uniqueKey,'1','NX','EX',String(UNIQUE_TTL)]]);
  if(created==='OK') await store.incr(`analytics:unique:${day}:${event}`,DAY_TTL);
  return {ok:true,event};
}

async function analyticsStats(days=30){
  days=Math.max(1,Math.min(90,Math.round(+days||30)));
  const rows=[];
  for(let i=days-1;i>=0;i--){
    const d=new Date(Date.now()-i*86400000).toISOString().slice(0,10);
    const keys=[];
    EVENTS.forEach(e=>keys.push(`analytics:event:${d}:${e}`,`analytics:unique:${d}:${e}`));
    keys.push(`analytics:platform:${d}:android`,`analytics:platform:${d}:ios`,`analytics:platform:${d}:web`);
    keys.push(`analytics:locale:${d}:ru`,`analytics:locale:${d}:en`,`analytics:premium:${d}:yes`);
    const vals=await store.many(keys);
    let p=0;
    const events={};
    for(const e of EVENTS) events[e]={count:+vals[p++]||0,unique:+vals[p++]||0};
    rows.push({
      day:d,events,
      platform:{android:+vals[p++]||0,ios:+vals[p++]||0,web:+vals[p++]||0},
      locale:{ru:+vals[p++]||0,en:+vals[p++]||0},
      premium:+vals[p++]||0
    });
  }
  const totals={};
  EVENTS.forEach(e=>totals[e]={count:0,unique:0});
  rows.forEach(r=>EVENTS.forEach(e=>{
    totals[e].count+=r.events[e].count;
    totals[e].unique+=r.events[e].unique;
  }));
  return {days,events:EVENTS,rows,totals};
}

module.exports={EVENTS,recordAnalytics,analyticsStats};

const crypto=require('crypto');
const {store}=require('./store');

const EVENTS=Object.freeze([
  'install',
  'onboarding_complete',
  'account_created',
  'program_added',
  'workout_started',
  'workout_completed',
  'workout_3',
  'workout_5',
  'workout_10',
  'ai_used',
  'premium_opened',
  'purchase_started'
]);
const EVENT_SET=new Set(EVENTS);
const DAY_TTL=120*24*3600;
const DEVICE_TTL=180*24*3600;
const UNIQUE_TTL=45*24*3600;

const cleanPlatform=v=>['android','ios','web'].includes(String(v||''))?String(v):'web';
const cleanLocale=v=>String(v||'').toLowerCase()==='en'?'en':'ru';
const deviceHash=v=>crypto.createHash('sha256').update(String(v||'')).digest('hex').slice(0,24);

async function recordAnalytics(input){
  const event=String(input&&input.event||'');
  if(!EVENT_SET.has(event)) throw Object.assign(new Error('bad_event'),{status:400});
  const rawDevice=String(input&&input.deviceId||'').trim().slice(0,120);
  if(rawDevice.length<4) throw Object.assign(new Error('bad_device'),{status:400});
  const now=new Date().toISOString();
  const day=now.slice(0,10);
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

  // Дневной unique нужен для графика по дням.
  const uniqueKey=`analytics:unique-mark:${day}:${event}:${dh}`;
  const [created]=await store.pipe([['SET',uniqueKey,'1','NX','EX',String(UNIQUE_TTL)]]);
  if(created==='OK') await store.incr(`analytics:unique:${day}:${event}`,DAY_TTL);

  // Для воронки храним только псевдонимный device hash и время первого достижения
  // milestones. Ни email, ни profileId, ни тексты программ сюда не попадают.
  const deviceKey=`analytics:device:${dh}`;
  let rec=null;
  try{rec=JSON.parse(await store.get(deviceKey)||'null');}catch(_){}
  if(!rec||typeof rec!=='object')rec={firstSeen:now,lastSeen:now,platform,locale,events:{}};
  if(!rec.events||typeof rec.events!=='object')rec.events={};
  rec.firstSeen=rec.firstSeen||now;
  rec.lastSeen=now;
  rec.platform=platform;
  rec.locale=locale;
  if(!rec.events[event])rec.events[event]=now;
  await store.set(deviceKey,JSON.stringify(rec),DEVICE_TTL);
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

  // Точные unique для воронки: один hash устройства учитывается один раз за весь
  // выбранный период, а не один раз каждый день.
  const start=new Date();
  start.setUTCHours(0,0,0,0);
  start.setUTCDate(start.getUTCDate()-(days-1));
  const startMs=start.getTime();
  const keys=await store.scan('analytics:device:*',50000);
  const raws=await store.many(keys);
  const devices=[];
  raws.forEach(raw=>{
    if(!raw)return;
    try{
      const rec=JSON.parse(raw);
      const first=Date.parse(rec&&rec.events&&rec.events.install||rec&&rec.firstSeen||'');
      if(Number.isFinite(first)&&first>=startMs)devices.push(rec);
    }catch(_){}
  });

  const totals={};
  EVENTS.forEach(e=>{
    totals[e]={
      count:rows.reduce((n,r)=>n+(r.events[e].count||0),0),
      unique:devices.reduce((n,d)=>n+(d.events&&d.events[e]?1:0),0)
    };
  });
  const cohort={
    devices:devices.length,
    platform:{android:0,ios:0,web:0},
    locale:{ru:0,en:0}
  };
  devices.forEach(d=>{
    const p=cleanPlatform(d.platform),l=cleanLocale(d.locale);
    cohort.platform[p]=(cohort.platform[p]||0)+1;
    cohort.locale[l]=(cohort.locale[l]||0)+1;
  });
  return {days,events:EVENTS,rows,totals,cohort};
}

module.exports={EVENTS,recordAnalytics,removeAnalyticsDevice,analyticsStats};

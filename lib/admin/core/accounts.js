'use strict';

const crypto = require('crypto');
const { store } = require('../../store');
const { send, fail } = require('../../util');
const { getSettings } = require('../../ai');

const ACCOUNT_EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
const ACTIONS = new Set(['users_list','user_ai_reset','user_create','user_premium','user_test_code']);

const accountMail = v => String(v || '').trim().toLowerCase().slice(0,120);
const accountHash = email => crypto.createHash('sha256').update(String(email)).digest('hex').slice(0,32);
const codeHash = code => crypto.createHash('sha256').update(String(code)).digest('hex');
const adminDigits = n => {
  const b = crypto.randomBytes(n);
  let out = '';
  for(let i=0;i<n;i++) out += String(b[i] % 10);
  return out;
};

async function indexAccount(mh){
  if(!(await store.get(`a:indexed:${mh}`))){
    await store.set(`a:indexed:${mh}`, '1');
    await store.push('a:all', mh);
  }
}

async function ensureAccountIndex(){
  if(await store.get('a:index:backfill:v1')) return 0;
  const keys = await store.scan('a:????????????????????????????????');
  const ids = [...new Set(keys.map(k => {
    const m = String(k).match(/^a:([a-f0-9]{32})$/);
    return m ? m[1] : '';
  }).filter(Boolean))];
  const have = new Set((await store.list('a:all')).filter(x => /^[a-f0-9]{32}$/.test(String(x))));
  const missing = ids.filter(mh => !have.has(mh));
  const commands = [];
  ids.forEach(mh => commands.push(['SET', `a:indexed:${mh}`, '1', 'EX', String(365 * 24 * 3600)]));
  missing.forEach(mh => commands.push(['RPUSH', 'a:all', mh]));
  if(ids.length) commands.push(['EXPIRE', 'a:all', String(365 * 24 * 3600)]);
  if(commands.length) await store.pipe(commands);
  await store.set('a:index:backfill:v1', new Date().toISOString(), 10 * 365 * 24 * 3600);
  return missing.length;
}

async function adminUsers(){
  await ensureAccountIndex();
  const ids=[...new Set((await store.list('a:all')).filter(x=>/^[a-f0-9]{32}$/.test(String(x))))].slice(-1000);
  const now=new Date();
  const month=now.toISOString().slice(0,7);
  const [year,mon]=month.split('-').map(Number);
  const periodStart=`${month}-01`;
  const periodEnd=new Date(Date.UTC(year,mon,0)).toISOString().slice(0,10);
  const settings=await getSettings();
  const limits=settings.limits||{};
  const [raws, usage] = await Promise.all([
    store.many(ids.map(mh=>`a:${mh}`)),
    store.many(ids.flatMap(mh=>[
      `ai:use:${month}:${mh}:heavy`,
      `ai:use:${month}:${mh}:light`,
      `ai:use:${month}:${mh}:image`
    ]))
  ]);
  const out=[];
  raws.forEach((raw,i)=>{
    if(!raw) return;
    try{
      const a=JSON.parse(raw), sub=a.sub||null;
      out.push({
        id:ids[i], email:a.email||'', handle:a.handle||'', locale:a.locale||'ru',
        since:a.since||null, seen:a.seen||null,
        premium:!!(sub && (Date.parse(sub.until)||0)>Date.now()),
        sub:sub?{
          plan:String(sub.plan||''), until:sub.until||null, since:sub.since||null,
          provider:String(sub.provider||sub.source||''), autoRenew:!!sub.autoRenew
        }:null,
        devices:Object.keys(a.syncDevices||{}).length,
        pushDevices:Object.keys(a.pushDevices||{}).length,
        aiUsage:{
          month, periodStart, periodEnd,
          programs:+usage[i*3]||0,
          exercises:+usage[i*3+1]||0,
          images:+usage[i*3+2]||0,
          limits:{
            programs:+limits.heavy||0,
            exercises:+limits.light||0,
            images:+limits.image||0
          }
        }
      });
    }catch(_){}
  });
  return out.sort((x,y)=>String(y.seen||y.since||'').localeCompare(String(x.seen||x.since||'')));
}

async function handleAdminAccounts(action, body, res){
  if(!ACTIONS.has(action)) return false;

  if(action === 'users_list'){
    send(res,200,{ok:true,users:await adminUsers()});
    return true;
  }

  const email=accountMail(body&&body.email);
  if(!ACCOUNT_EMAIL.test(email)){
    fail(res,400,'bad_email');
    return true;
  }
  const mh=accountHash(email);

  if(action === 'user_ai_reset'){
    if(!(await store.get(`a:${mh}`))){
      fail(res,404,'account_not_found');
      return true;
    }
    const month=new Date().toISOString().slice(0,7);
    await Promise.all([
      store.del(`ai:use:${month}:${mh}:heavy`),
      store.del(`ai:use:${month}:${mh}:light`),
      store.del(`ai:use:${month}:${mh}:image`)
    ]);
    send(res,200,{ok:true,email,month});
    return true;
  }

  if(action === 'user_create'){
    let acc=null;
    try{acc=JSON.parse(await store.get(`a:${mh}`));}catch(_){}
    if(!acc){
      const now=new Date().toISOString();
      acc={email,since:now,seen:now,handle:'',sub:null,locale:(body&&body.locale)==='en'?'en':'ru'};
      await store.set(`a:${mh}`,JSON.stringify(acc));
    }
    await indexAccount(mh);
    send(res,200,{ok:true,created:true,email});
    return true;
  }

  let acc=null;
  try{acc=JSON.parse(await store.get(`a:${mh}`));}catch(_){}
  if(!acc){
    fail(res,404,'account_not_found');
    return true;
  }

  if(action === 'user_premium'){
    if(body&&body.revoke){
      acc.sub=null;
    }else{
      const days=Math.max(1,Math.min(3650,Math.round(+body.days||30)));
      const now=new Date(), until=new Date(now.getTime()+days*86400000);
      acc.sub={
        plan:days>=300?'year':'month',
        since:now.toISOString().slice(0,10),
        until:until.toISOString().slice(0,10),
        currency:'ADMIN',price:0,autoRenew:false,
        provider:'admin',source:'admin',grantedAt:now.toISOString()
      };
    }
    acc.seen=acc.seen||new Date().toISOString();
    await store.set(`a:${mh}`,JSON.stringify(acc));
    await indexAccount(mh);
    send(res,200,{ok:true,email,sub:acc.sub||null});
    return true;
  }

  const code=adminDigits(6);
  await store.set(`mail:${mh}`,JSON.stringify({
    h:codeHash(code),tries:0,at:Date.now(),source:'admin_test'
  }),15*60);
  send(res,200,{ok:true,email,code,expiresMinutes:15});
  return true;
}

module.exports={
  handleAdminAccounts,ensureAccountIndex,ACTIONS,
  accountMail,accountHash
};

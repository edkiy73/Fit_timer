const crypto=require('crypto');
const {store}=require('./store');

const TTL=90*24*3600;
const MAX_INDEX=300;

function redact(v,n){
  return String(v==null?'':v)
    .replace(/[\r\t]+/g,' ')
    .replace(/[^\s@]{1,64}@[^\s@.]+(?:\.[^\s@.]+)+/gi,'[email]')
    .replace(/https?:\/\/[^\s)\]}]+/gi,'[url]')
    .replace(/(["'“”‘’])[^\n]{1,160}\1/g,'[value]')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,n);
}
const cleanKind=v=>v==='rejection'?'rejection':'error';
const cleanPlatform=v=>['android','ios','web'].includes(String(v||''))?String(v):'web';

function signature(kind,name,message,stack){
  const first=String(stack||'').split('\n').slice(0,2).join('|');
  return crypto.createHash('sha256').update([kind,name,message,first].join('|')).digest('hex').slice(0,20);
}

async function recordClientError(input){
  const kind=cleanKind(input&&input.kind);
  const name=redact(input&&input.name,80)||'Error';
  const message=redact(input&&input.message,360)||'unknown';
  const stack=redact(input&&input.stack,1400);
  const platform=cleanPlatform(input&&input.platform);
  const locale=String(input&&input.locale||'').toLowerCase()==='en'?'en':'ru';
  const sig=signature(kind,name,message,stack);
  const key='diag:error:'+sig;
  let rec=null;
  try{rec=JSON.parse(await store.get(key)||'null');}catch(_){}
  const now=new Date().toISOString();
  if(!rec){
    rec={sig,kind,name,message,stack,first:now,last:now,count:0,platform:{android:0,ios:0,web:0},locale:{ru:0,en:0}};
    const marked=await store.get('diag:indexed:'+sig);
    if(!marked){
      await store.push('diag:errors',sig,TTL);
      await store.set('diag:indexed:'+sig,'1',TTL);
      const ids=await store.list('diag:errors');
      if(ids.length>MAX_INDEX){
        for(const old of ids.slice(0,ids.length-MAX_INDEX)) await store.removeFromList('diag:errors',old);
      }
    }
  }
  rec.last=now;
  rec.count=(+rec.count||0)+1;
  rec.platform[platform]=(+rec.platform[platform]||0)+1;
  rec.locale[locale]=(+rec.locale[locale]||0)+1;
  await store.set(key,JSON.stringify(rec),TTL);
  return {ok:true,sig};
}

async function clientErrorStats(){
  const ids=[...new Set(await store.list('diag:errors'))].slice(-MAX_INDEX);
  const raws=await store.many(ids.map(id=>'diag:error:'+id));
  const items=[];
  raws.forEach(raw=>{
    if(!raw)return;
    try{const r=JSON.parse(raw);if(r&&r.sig)items.push(r);}catch(_){}
  });
  items.sort((a,b)=>String(b.last||'').localeCompare(String(a.last||'')));
  return {items,total:items.reduce((n,x)=>n+(+x.count||0),0)};
}

module.exports={recordClientError,clientErrorStats,redact};

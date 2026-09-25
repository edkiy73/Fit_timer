/* Core Admin accounts routing regression. */
let bad=0;
const ok=(name,cond,extra)=>{
  if(!cond) bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name+(extra==null?'':' → '+extra));
};

const state=new Map();
const lists=new Map();
const storePath=require.resolve('../lib/store');
const aiPath=require.resolve('../lib/ai');

const fakeStore={
  async get(k){return state.has(k)?state.get(k):null;},
  async set(k,v){state.set(k,String(v));},
  async del(k){const had=state.has(k);state.delete(k);return had?1:0;},
  async push(k,v){const a=lists.get(k)||[];a.push(String(v));lists.set(k,a);return a.length;},
  async list(k){return (lists.get(k)||[]).slice();},
  async many(keys){return Promise.all(keys.map(k=>fakeStore.get(k));},
  async scan(){return [];},
  async pipe(cmds){
    const out=[];
    for(const cmd of cmds){
      if(cmd[0]==='SET'){await fakeStore.set(cmd[1],cmd[2]);out.push('OK');}
      else if(cmd[0]==='RPUSH'){out.push(await fakeStore.push(cmd[1],cmd[2]));}
      else if(cmd[0]==='EXPIRE'){out.push(1);}
      else out.push(null);
    }
    return out;
  }
};

require.cache[storePath]={id:storePath,filename:storePath,loaded:true,exports:{store:fakeStore}};
require.cache[aiPath]={id:aiPath,filename:aiPath,loaded:true,exports:{
  getSettings:async()=>({limits:{heavy:10,light:20,image:30}})
}};

const {handleAdminAccounts,ACTIONS,accountHash}=require('../lib/admin/core/accounts');

function response(){
  return {
    statusCode:0,body:'',headers:{},
    setHeader(k,v){this.headers[k]=v;},
    end(v){this.body=String(v==null?'':v);}
  };
}
const parsed=res=>{try{return JSON.parse(res.body||'{}');}catch(_){return {};}};

(async()=>{
  ok('Core Admin owns account action ids',
    ['users_list','user_ai_reset','user_create','user_premium','user_test_code'].every(x=>ACTIONS.has(x)));

  let res=response();
  let handled=await handleAdminAccounts('fit_catalog_magic',{},res);
  ok('Core accounts ignore product-domain action',handled===false&&res.statusCode===0);

  res=response();
  handled=await handleAdminAccounts('user_create',{email:'Test@Example.com',locale:'en'},res);
  const created=parsed(res);
  ok('user_create normalizes and creates account',handled===true&&res.statusCode===200&&created.email==='test@example.com');

  const mh=accountHash('test@example.com');
  const acc=JSON.parse(await fakeStore.get('a:'+mh));
  ok('created account keeps generic account shape',acc.email==='test@example.com'&&acc.locale==='en'&&acc.sub===null);

  res=response();
  await handleAdminAccounts('user_premium',{email:'test@example.com',days:30},res);
  ok('manual Premium stays server-authoritative',res.statusCode===200&&parsed(res).sub&&parsed(res).sub.provider==='admin');

  res=response();
  await handleAdminAccounts('user_test_code',{email:'test@example.com'},res);
  const codeOut=parsed(res);
  ok('test login code issued only for existing account',
    res.statusCode===200&&/^\d{6}$/.test(String(codeOut.code||''))&&!!(await fakeStore.get('mail:'+mh)));

  const month=new Date().toISOString().slice(0,7);
  await fakeStore.set(`ai:use:${month}:${mh}:heavy`,'3');
  res=response();
  await handleAdminAccounts('user_ai_reset',{email:'test@example.com'},res);
  ok('AI usage reset deletes current month counters',
    res.statusCode===200&&(await fakeStore.get(`ai:use:${month}:${mh}:heavy`))==null);

  res=response();
  await handleAdminAccounts('users_list',{},res);
  const users=parsed(res).users||[];
  ok('users_list reads indexed generic accounts',res.statusCode===200&&users.some(x=>x.email==='test@example.com'));

  process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1);});

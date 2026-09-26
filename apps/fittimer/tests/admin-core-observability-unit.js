/* Core Admin observability routing regression. */
let bad=0;
const ok=(name,cond,extra)=>{
  if(!cond) bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name+(extra==null?'':' → '+extra));
};

const analyticsPath=require.resolve('../lib/analytics');
const diagnosticsPath=require.resolve('../../../packages/core/server/diagnostics');
require.cache[analyticsPath]={id:analyticsPath,filename:analyticsPath,loaded:true,exports:{
  analyticsStats:async days=>({days:Number(days||0),kind:'analytics'})
}};
require.cache[diagnosticsPath]={id:diagnosticsPath,filename:diagnosticsPath,loaded:true,exports:{
  clientErrorStats:async()=>({kind:'errors'}),
  clearClientError:async sig=>({sig})
}};

const {createAdminObservability,ACTIONS}=require('../../../packages/core/server/admin/observability');
const handleAdminObservability=createAdminObservability({analyticsStats:require('../lib/analytics').analyticsStats});

function response(){
  return {
    statusCode:0,
    headers:{},
    body:'',
    setHeader(k,v){this.headers[k]=v;},
    end(v){this.body=String(v==null?'':v);}
  };
}
function parsed(res){
  try{return JSON.parse(res.body||'{}');}catch(_){return {};}
}

(async()=>{
  ok('Core Admin owns generic observability action ids',
    ['analytics_stats','client_errors','client_error_clear'].every(x=>ACTIONS.has(x)));

  let res=response();
  let handled=await handleAdminObservability('analytics_stats',{days:14},res);
  ok('analytics action handled by Core module',handled===true&&res.statusCode===200&&parsed(res).stats.days===14);

  res=response();
  handled=await handleAdminObservability('client_errors',{},res);
  ok('client error list handled by Core module',handled===true&&res.statusCode===200&&parsed(res).stats.kind==='errors');

  res=response();
  handled=await handleAdminObservability('client_error_clear',{sig:'a'.repeat(20)},res);
  ok('client error clear validates and delegates',handled===true&&res.statusCode===200&&parsed(res).cleared.sig==='a'.repeat(20));

  res=response();
  handled=await handleAdminObservability('client_error_clear',{sig:'bad'},res);
  ok('invalid signature stays rejected',handled===true&&res.statusCode===400&&parsed(res).error==='bad_signature');

  res=response();
  handled=await handleAdminObservability('fit_catalog_magic',{},res);
  ok('Core module ignores product-domain actions',handled===false&&res.statusCode===0);

  process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1);});

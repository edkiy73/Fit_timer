const BASE=process.env.FIT_API||'http://127.0.0.1:8124';
let bad=0;
const ok=(name,cond,extra)=>{if(!cond)bad++;console.log((cond?'  ok  ':' ПЛОХО')+'  '+name+(extra==null?'':' → '+extra));};
async function post(body){
  const r=await fetch(BASE+'/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));
  return {status:r.status,body:j};
}
(async()=>{
  const device='analytics-api-'+Math.random().toString(36).slice(2);
  const good=await post({action:'analytics',event:'workout_started',deviceId:device,platform:'android',locale:'ru'});
  ok('analytics endpoint принимает событие без аккаунта',good.status===200&&good.body.ok===true,JSON.stringify(good));
  const badEvent=await post({action:'analytics',event:'user_email',deviceId:device});
  ok('analytics endpoint не принимает произвольные события',badEvent.status===400&&badEvent.body.error==='bad_event',JSON.stringify(badEvent));
  const noDevice=await post({action:'analytics',event:'install',deviceId:''});
  ok('analytics endpoint требует технический device id',noDevice.status===400&&noDevice.body.error==='bad_device',JSON.stringify(noDevice));
  process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1);});

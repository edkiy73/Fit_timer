// @ts-check
'use strict';
/** Automatic labeling never resolves a case, publishes content or imposes sanctions.
 * Provider failure/invalid response remains in the manual queue. No raw vendor result/log.
 * @typedef {{review:(input:{kind:'profile';text:string},options:{signal:AbortSignal})=>Promise<unknown>}} Provider
 * @param {{provider:Provider|null;timeoutMs?:number}} options */
function createModerationEngine({provider,timeoutMs=5000}){
 if(!Number.isInteger(timeoutMs)||timeoutMs<10||timeoutMs>10000)throw Error('invalid_moderation_policy');
 /** @param {{kind:'profile';text:string}} input @returns {Promise<{label:'manual_required'|'flagged'|'clear';attempts:number}>} */
 return async function review(input){
  if(input.kind!=='profile'||typeof input.text!=='string'||input.text.length>2000)throw Error('invalid_moderation_input');
  if(!provider)return {label:'manual_required',attempts:0};
  for(let attempt=1;attempt<=2;attempt++){
   const controller=new AbortController();let timer;
   try{
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('moderation_timeout'));},timeoutMs);});
    const result=await Promise.race([provider.review({kind:'profile',text:input.text},{signal:controller.signal}),deadline]);
    if(result&&typeof result==='object'&&!Array.isArray(result)&&Object.keys(result).length===1&&'label' in result&&(result.label==='flagged'||result.label==='clear'))return {label:result.label,attempts:attempt};
   }catch{/* No raw error, private text or vendor payload is logged. */}finally{clearTimeout(timer);controller.abort();}
  }return {label:'manual_required',attempts:2};
 };
}
module.exports={createModerationEngine};

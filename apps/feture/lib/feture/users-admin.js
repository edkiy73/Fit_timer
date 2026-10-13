// FetUre users are product-scoped PostgreSQL profiles, not AppBase's global a:all index.
// This handler is called only after Core admin-handler validates ADMIN_KEY.
'use strict';
const {send,fail}=require('../../../../packages/core/server/util');
const HEX=/^[a-f0-9]{32}$/;
function createFetureUsersAdmin(transport,store){
 return async (action,body,res)=>{
  if(action!=='feture.users.list')return false;
  if(body && Object.keys(body).some(k=>k!=='action')){fail(res,422,'invalid_request');return true;}
  if(!transport.configured()||!store.configured()){fail(res,503,'users_source_unavailable');return true;}
  try{
   const search=new URLSearchParams({select:'account_hash,display_name,created_at,updated_at',order:'created_at.desc',limit:'201'});
   const response=await transport.request('/rest/v1/feture_profiles?'+search,{timeoutMs:9000});
   const profiles=await response.json();
   if(!Array.isArray(profiles)||profiles.length>201||profiles.some(p=>!p||!HEX.test(String(p.account_hash||''))))throw Error('invalid_profiles');
   const page=profiles.slice(0,200);
   const core=await store.many(page.map(p=>'a:'+p.account_hash));
   if(!Array.isArray(core)||core.length!==page.length)throw Error('invalid_accounts');
   const users=page.map((p,i)=>{
    let account=null;
    try{account=core[i]?JSON.parse(core[i]):null;}catch{}
    const email=account&&typeof account.email==='string'?account.email:null;
    return {id:p.account_hash,name:String(p.display_name||'').slice(0,80),email,
     createdAt:p.created_at,updatedAt:p.updated_at,hasLogin:!!email,
     lastSeen:account&&typeof account.seen==='string'?account.seen:null};
   });
   send(res,200,{ok:true,users,more:profiles.length>200});
  }catch{fail(res,503,'users_source_unavailable');}
  return true;
 };
}
module.exports={createFetureUsersAdmin};

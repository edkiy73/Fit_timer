// FetUre users are product-scoped PostgreSQL profiles, not AppBase's global a:all index.
// This handler is called only after Core admin-handler validates ADMIN_KEY.
'use strict';
/** @param {import('./contracts').Response} res @param {number} status @param {Record<string,unknown>} body */
function reply(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));}
const fail=(res,status,code)=>reply(res,status,{error:code});
const send=(res,status,body)=>reply(res,status,body);
const HEX=/^[a-f0-9]{32}$/;
/** @param {import('./contracts').Transport} transport
 * @param {{configured:()=>boolean,many:(keys:string[])=>Promise<unknown[]>}} store */
function createFetureUsersAdmin(transport,store){
 /** @param {string} action @param {Record<string,unknown>} body @param {import('./contracts').Response} res */
 return async (action,body,res)=>{
  if(action!=='feture.users.list')return false;
  if(body && Object.keys(body).some(k=>k!=='action')){fail(res,422,'invalid_request');return true;}
  if(!transport.configured()||!store.configured()){fail(res,503,'users_source_unavailable');return true;}
  try{
   const search=new URLSearchParams({select:'account_hash,display_name,created_at,updated_at',order:'created_at.desc',limit:'201'});
   const response=await transport.request('/rest/v1/feture_profiles?'+search,{timeoutMs:9000});
   const profiles=await response.json();
   if(!Array.isArray(profiles)||profiles.length>201||profiles.some(p=>!p||!HEX.test(String(p.account_hash||''))))throw Error('invalid_profiles');
   const page=/** @type {{account_hash:string,display_name:string,created_at:string,updated_at:string}[]} */(profiles.slice(0,200));
   const core=await store.many(page.map(p=>'a:'+p.account_hash));
   if(!Array.isArray(core)||core.length!==page.length)throw Error('invalid_accounts');
   const users=page.map((p,i)=>{
    let account=null;
    try{account=core[i]?JSON.parse(String(core[i])):null;}catch{}
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

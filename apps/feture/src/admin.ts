import { authClient } from './auth';
import { apiUrl } from './api-url';
import { createAdminClient } from '@appbase/core/admin.js';

export const adminClient = createAdminClient({
  endpoint:apiUrl('/api/admin'),
  fetch:async(input,init)=>{
    const body=typeof init?.body==='string'?JSON.parse(init.body) as {action?:string}:null;
    if(body?.action?.startsWith('feture.qa.')||body?.action?.startsWith('feture.operators.')){
      const session=await authClient.getSession();
      if(!session)throw new Error('auth_required');
      const headers=new Headers(init?.headers);
      headers.set('X-Fit-Email',session.email);headers.set('X-Fit-Device',session.deviceId);headers.set('X-Fit-Token',session.syncToken);
      const response=await globalThis.fetch(input,{...init,headers});
      const current=await authClient.getSession();
      if(!current||current.email!==session.email||current.deviceId!==session.deviceId||current.syncToken!==session.syncToken)throw new Error('session_changed');
      return response;
    }
    return globalThis.fetch(input,init);
  },
  healthEndpoint:apiUrl('/api/health')
});

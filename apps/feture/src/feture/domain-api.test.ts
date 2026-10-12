import {afterEach,expect,it,vi} from 'vitest';
import {z} from 'zod';
import type {AuthSession} from '@appbase/core/auth.js';
import {domainRequest,DomainClientError} from './domain-api';

const {getSession}=vi.hoisted(()=>({getSession:vi.fn()}));
vi.mock('../auth',()=>({authClient:{getSession}}));

const session:AuthSession={email:'owner@example.com',deviceId:'phone',syncToken:'secret',handle:'@owner',
 locale:'ru',sub:null,premium:false,owned:[],fresh:false};
const response=z.object({ok:z.literal(true),value:z.string()});

afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();getSession.mockReset();});

it('A02 rejects expired, malformed, and unreadable Core sessions before sending',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-12T12:00:00Z'));
 const send=vi.fn();vi.stubGlobal('fetch',send);
 for(const expiresAt of ['2026-10-12T11:59:59Z','not-a-date']){
  const expired={...session,expiresAt};
  getSession.mockResolvedValue(expired);
  await expect(domainRequest(expired,{action:'tests.list'},response)).rejects.toMatchObject({code:'auth_required'});
 }
 getSession.mockRejectedValue(new Error('private storage failure'));
 await expect(domainRequest(session,{action:'tests.list'},response)).rejects.toBeInstanceOf(DomainClientError);
 expect(send).not.toHaveBeenCalled();
});

it('A02 rejects a late private response if an unchanged session expires during HTTP',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-12T12:00:00Z'));
 const expiring={...session,expiresAt:'2026-10-12T12:00:01Z'};
 getSession.mockResolvedValue(expiring);
 const send=vi.fn().mockImplementation(async()=>{
  vi.setSystemTime(new Date('2026-10-12T12:00:02Z'));
  return new Response(JSON.stringify({ok:true,value:'private result'}));
 });
 vi.stubGlobal('fetch',send);
 await expect(domainRequest(expiring,{action:'tests.read'},response)).rejects.toMatchObject({code:'auth_required'});
 expect(send).toHaveBeenCalledOnce();
});

it('A02 rejects a late parsed private response when the live session expires during JSON',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-12T12:00:00Z'));
 const expiring={...session,expiresAt:'2026-10-12T12:00:01Z'};
 getSession.mockResolvedValue(expiring);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({
  ok:true,json:async()=>{vi.setSystemTime(new Date('2026-10-12T12:00:02Z'));return {ok:true,value:'sensitive'};}
 }));
 await expect(domainRequest(expiring,{action:'tests.read'},response)).rejects.toMatchObject({code:'auth_required'});
});

it('A02 rejects current Core session expiry and credential change without claiming a success',async()=>{
 const future={...session,expiresAt:new Date(Date.now()+3600000).toISOString()};
 for(const current of [{...future,expiresAt:'2000-01-01T00:00:00Z'},{...future,syncToken:'rotated'}]){
  getSession.mockResolvedValue(current);
  const send=vi.fn();vi.stubGlobal('fetch',send);
  await expect(domainRequest(future,{action:'profile.read'},response)).rejects.toMatchObject({code:'auth_required'});
  expect(send).not.toHaveBeenCalled();
 }
 getSession.mockResolvedValue(future);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true,value:'valid'}))));
 await expect(domainRequest(future,{action:'tests.list'},response)).resolves.toEqual({ok:true,value:'valid'});
});

it('A02 translates non-JSON proxy errors without falsely accepting a private result',async()=>{
 getSession.mockResolvedValue(session);
 const scenarios:[number,string][]=[
  [401,'auth_required'],[429,'rate_limited'],[413,'request_too_large'],
  [403,'domain_unavailable'],[503,'domain_unavailable'],[200,'domain_unavailable']
 ];
 for(const [status,code] of scenarios){
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('<html>upstream error</html>',{
   status,headers:{'Content-Type':'text/html'}
  })));
  await expect(domainRequest(session,{action:'tests.list'},response)).rejects.toMatchObject({code});
 }
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'consent_required'}),{status:403})));
 await expect(domainRequest(session,{action:'tests.list'},response)).rejects.toMatchObject({code:'consent_required'});
});

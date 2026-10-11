import {describe,it,expect,vi} from 'vitest';
import type {AuthSession} from '@appbase/core/auth.js';
import {createOperatorClient} from './operator-api';

const session:AuthSession={email:'staff@example.com',deviceId:'device',syncToken:'token',handle:'@staff',locale:'ru',sub:null,premium:false,owned:[],fresh:false};
describe('personal operator transport',()=>{
 it('uses the exact Core session and never sends an admin key',async()=>{
  const send=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ok:true})));
  const client=createOperatorClient('/api/admin',session,async()=>session,send);
  await client.action('unused-secret','feture.qa.list');
  const options=send.mock.calls[0]![1]!;
  const headers=new Headers(options.headers);
  expect(headers.has('x-admin-key')).toBe(false);
  expect(headers.get('x-fit-token')).toBe(session.syncToken);
  expect(options.cache).toBe('no-store');
  await expect(client.action('','users')).rejects.toThrow('forbidden');
  await expect(client.action('','feture.operators.bootstrap')).rejects.toThrow('forbidden');
  await expect(client.health('secret')).rejects.toThrow('forbidden');
  expect(send).toHaveBeenCalledTimes(1);
 });
 it('rejects changed or expired sessions before sending anything',async()=>{
  const send=vi.fn<typeof fetch>();
  const lost=vi.fn();
  const client=createOperatorClient('/api/admin',session,async()=>({...session,syncToken:'other'}),send,lost);
  await expect(client.action('','feture.qa.grant',{email:'person@example.com'})).rejects.toThrow('session_changed');
  const expired={...session,expiresAt:'2000-01-01T00:00:00Z'};
  await expect(createOperatorClient('/api/admin',expired,async()=>expired,send).action('','feture.qa.list')).rejects.toThrow('auth_required');
  expect(send).not.toHaveBeenCalled();expect(lost).toHaveBeenCalledOnce();
 });
 it('discards a response if the session changes during body decoding',async()=>{
  let current:AuthSession|null=session;
  const send=vi.fn<typeof fetch>().mockResolvedValue({ok:true,status:200,json:async()=>{current=null;return {ok:true,items:['private-audit']};}} as Response);
  const lost=vi.fn();
  const client=createOperatorClient('/api/admin',session,async()=>current,send,lost);
  await expect(client.action('','feture.qa.audit')).rejects.toThrow('session_changed');
  expect(lost).toHaveBeenCalledOnce();
 });
 it('invalidates the workspace on server role revocation or session rejection',async()=>{
  const send=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({error:'forbidden'}),{status:403})).mockResolvedValueOnce(new Response(JSON.stringify({error:'auth_required'}),{status:401}));
  const lost=vi.fn();const client=createOperatorClient('/api/admin',session,async()=>session,send,lost);
  await expect(client.action('','feture.qa.list')).rejects.toThrow('forbidden');
  await expect(client.action('','feture.qa.audit')).rejects.toThrow('auth_required');
  expect(lost).toHaveBeenCalledTimes(2);
 });
});

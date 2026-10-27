import {afterEach,expect,it,vi} from 'vitest';
import {z} from 'zod';
import type {AuthSession} from '@appbase/core/auth.js';
import {feRequest,feErrorMessage,FeError,newOpId} from './fe-api';

const {getSession}=vi.hoisted(()=>({getSession:vi.fn()}));
vi.mock('../auth',()=>({authClient:{getSession}}));

const session:AuthSession={email:'owner@example.com',deviceId:'phone',syncToken:'secret',handle:'@owner',
 locale:'ru',sub:null,premium:false,owned:[],fresh:false};
const ok=z.object({ok:z.literal(true),value:z.string()});
const reply=(status:number,body:unknown)=>vi.fn().mockResolvedValue(new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}}));

afterEach(()=>{vi.unstubAllGlobals();getSession.mockReset();});

it('sends the acting profile and Core identity, returns the parsed result',async()=>{
 getSession.mockResolvedValue(session);
 const send=reply(200,{ok:true,value:'x',requestId:'r'});vi.stubGlobal('fetch',send);
 await expect(feRequest(session,'profile.get',{profileId:'p2'},ok,{profileId:'p1'})).resolves.toMatchObject({value:'x'});
 const init=send.mock.calls[0]![1];
 expect(init.headers['x-fe-profile']).toBe('p1');
 expect(init.headers['x-fit-token']).toBe('secret');
 expect(JSON.parse(init.body)).toEqual({profileId:'p2',action:'profile.get'});
});

it('maps server failures to FeError with rule and fields, and words them',async()=>{
 getSession.mockResolvedValue(session);
 vi.stubGlobal('fetch',reply(422,{ok:false,error:'rule_violation',rule:'age_check_required'}));
 const error=await feRequest(session,'access.request',{},ok).catch(e=>e);
 expect(error).toBeInstanceOf(FeError);
 expect(error).toMatchObject({code:'rule_violation',rule:'age_check_required',status:422});
 const t=(k:string)=>({'fe.rule.age_check_required':'Сначала подтверди возраст.','fe.error.generic':'Не получилось.'} as Record<string,string>)[k]??k;
 expect(feErrorMessage(error,t)).toBe('Сначала подтверди возраст.');
 expect(feErrorMessage(new FeError('weird_code'),t)).toBe('Не получилось.');
});

it('never sends with a session that is no longer current',async()=>{
 const send=vi.fn();vi.stubGlobal('fetch',send);
 getSession.mockResolvedValue({...session,syncToken:'other'});
 await expect(feRequest(session,'catalog.get',{},ok)).rejects.toMatchObject({code:'auth_required'});
 expect(send).not.toHaveBeenCalled();
});

it('op ids are UUID v7 and time-ordered',()=>{
 const a=newOpId(),b=newOpId();
 expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 expect(a.slice(0,13)<=b.slice(0,13)).toBe(true);
});

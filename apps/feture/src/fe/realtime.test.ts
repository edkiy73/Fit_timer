import {afterEach,describe,expect,it,vi} from 'vitest';
import {connectRealtime,eventsUrl,watchWake,SSE_SILENCE_MS,type RtKind} from './realtime';

/** A stand-in EventSource: the test opens, sends and fails it by hand. */
class FakeEventSource{
 static all:FakeEventSource[]=[];
 readyState=0;onopen:(()=>void)|null=null;onmessage:((e:{data:string})=>void)|null=null;onerror:(()=>void)|null=null;
 named=new Map<string,()=>void>();
 constructor(public url:string){FakeEventSource.all.push(this);}
 addEventListener(name:string,fn:()=>void){this.named.set(name,fn);}
 removeEventListener(name:string){this.named.delete(name);}
 heartbeat(){this.named.get('hb')?.();}
 open(){this.readyState=1;this.onopen?.();}
 send(data:unknown){this.onmessage?.({data:JSON.stringify(data)});}
 fail(){this.readyState=2;this.onerror?.();}
 close(){this.readyState=2;}
}

const A='fe:'+'a'.repeat(32), B='fe:'+'b'.repeat(32);
const cfg={url:'https://app.example.com',channels:{'p-a':A,'p-b':B}};

describe('realtime over SSE (own server)',()=>{
 afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();FakeEventSource.all=[];});

 it('listens on <origin>/api/fe-events with every channel',()=>{
  expect(eventsUrl(cfg)).toBe(`https://app.example.com/api/fe-events?c=${encodeURIComponent(A+','+B)}`);
 });

 it('maps a channel to its profile, passes kind and typing tag, ignores anything else',()=>{
  vi.stubGlobal('EventSource',FakeEventSource);
  const got:[RtKind|null,string|null,string|undefined][]=[];
  const conn=connectRealtime(cfg,(k,p,t)=>got.push([k,p,t]));
  const es=FakeEventSource.all[0]!;
  es.open();
  es.send({c:A,k:'chat'});
  es.send({c:B,k:'typing',t:'tag1234567890abc'});
  es.send({c:'fe:unknown',k:'chat'});
  es.send({c:A,k:'not-a-kind'});
  expect(got).toEqual([['chat','p-a',undefined],['typing','p-b','tag1234567890abc']]);
  conn.close();
  expect(es.readyState).toBe(2);
 });

 it('after a drop, each profile gets one refresh signal (kind null)',()=>{
  vi.useFakeTimers();
  vi.stubGlobal('EventSource',FakeEventSource);
  const got:[RtKind|null,string|null][]=[];
  const conn=connectRealtime(cfg,(k,p)=>got.push([k,p]));
  FakeEventSource.all[0]!.open();
  expect(got).toEqual([]);
  FakeEventSource.all[0]!.fail();          // closed by an HTTP error: we reopen after a pause
  vi.advanceTimersByTime(5_000);
  expect(FakeEventSource.all.length).toBe(2);
  FakeEventSource.all[1]!.open();
  expect(got).toEqual([[null,'p-a'],[null,'p-b']]);
  conn.close();
 });

 it('without EventSource nothing happens (polling covers it)',()=>{
  vi.stubGlobal('EventSource',undefined);
  expect(()=>connectRealtime(cfg,()=>{}).close()).not.toThrow();
 });

 it('the watchdog reopens a stream that heard no heartbeat for a minute (a phone after sleep), with one refresh',()=>{
  vi.useFakeTimers();
  vi.stubGlobal('EventSource',FakeEventSource);
  const got:[RtKind|null,string|null][]=[];
  const conn=connectRealtime(cfg,(k,p)=>got.push([k,p]));
  FakeEventSource.all[0]!.open();
  // Heartbeats keep it: nothing reopens.
  for(let i=0;i<4;i++){vi.advanceTimersByTime(25_000);FakeEventSource.all[0]!.heartbeat();}
  expect(FakeEventSource.all.length).toBe(1);
  // Silence (the socket died but still says open): reopened once the silence passes the limit.
  vi.advanceTimersByTime(SSE_SILENCE_MS+15_000);
  expect(FakeEventSource.all.length).toBe(2);
  expect(FakeEventSource.all[0]!.readyState).toBe(2);
  FakeEventSource.all[1]!.open();
  expect(got).toEqual([[null,'p-a'],[null,'p-b']]);
  conn.close();
 });

 it('wake(): a fresh stream is trusted (the caller refreshes), a quiet one is reopened and refreshes itself',()=>{
  vi.useFakeTimers();
  vi.stubGlobal('EventSource',FakeEventSource);
  const got:[RtKind|null,string|null][]=[];
  const conn=connectRealtime(cfg,(k,p)=>got.push([k,p]));
  FakeEventSource.all[0]!.open();
  expect(conn.wake()).toBe(false);
  expect(FakeEventSource.all.length).toBe(1);
  vi.advanceTimersByTime(40_000); // quiet, not yet past the watchdog
  expect(conn.wake()).toBe(true);
  expect(FakeEventSource.all.length).toBe(2);
  FakeEventSource.all[1]!.open();
  expect(got).toEqual([[null,'p-a'],[null,'p-b']]);
  conn.close();
 });

 it('passes `changed` with its entity tag',()=>{
  vi.stubGlobal('EventSource',FakeEventSource);
  const got:[RtKind|null,string|null,string|undefined][]=[];
  const conn=connectRealtime(cfg,(k,p,t)=>got.push([k,p,t]));
  FakeEventSource.all[0]!.open();
  FakeEventSource.all[0]!.send({c:A,k:'changed',t:'couple'});
  expect(got).toEqual([['changed','p-a','couple']]);
  conn.close();
 });
});

describe('return to the app',()=>{
 afterEach(()=>{vi.useRealTimers();});
 const setVisibility=(v:'visible'|'hidden')=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>v});document.dispatchEvent(new Event('visibilitychange'));};

 it('fires once after being away long enough, never for a glance; the network back always fires',()=>{
  vi.useFakeTimers();
  const got:string[]=[];
  const off=watchWake(why=>got.push(why),{minAwayMs:10_000});
  setVisibility('hidden');vi.advanceTimersByTime(2_000);setVisibility('visible');
  expect(got).toEqual([]);
  setVisibility('hidden');window.dispatchEvent(new Event('blur'));vi.advanceTimersByTime(30_000);
  setVisibility('visible');window.dispatchEvent(new Event('focus')); // one return, two events
  expect(got).toEqual(['back']);
  window.dispatchEvent(new Event('online'));
  expect(got).toEqual(['back','online']);
  off();
  setVisibility('hidden');vi.advanceTimersByTime(30_000);setVisibility('visible');
  expect(got).toEqual(['back','online']);
 });
});

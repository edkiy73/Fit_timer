import {afterEach,describe,expect,it,vi} from 'vitest';
import {connectRealtime,eventsUrl,type RtKind} from './realtime';

/** A stand-in EventSource: the test opens, sends and fails it by hand. */
class FakeEventSource{
 static all:FakeEventSource[]=[];
 readyState=0;onopen:(()=>void)|null=null;onmessage:((e:{data:string})=>void)|null=null;onerror:(()=>void)|null=null;
 constructor(public url:string){FakeEventSource.all.push(this);}
 open(){this.readyState=1;this.onopen?.();}
 send(data:unknown){this.onmessage?.({data:JSON.stringify(data)});}
 fail(){this.readyState=2;this.onerror?.();}
 close(){this.readyState=2;}
}

const A='fe:'+'a'.repeat(32), B='fe:'+'b'.repeat(32);
const cfg={url:'https://app.example.com',key:'sse',transport:'sse' as const,channels:{'p-a':A,'p-b':B}};

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
});

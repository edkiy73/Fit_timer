import {describe,expect,it} from 'vitest';
import {groupRows,inboxScrollKey,inboxSearch,mergeRows,readInboxUrl} from './inbox-url';

const ID='018f0000-0000-7000-8000-00000000a001';
const read=(q:string)=>readInboxUrl(new URLSearchParams(q));

describe('the notification center in the address',()=>{
 it('reads the tab, the filter and the item; anything unknown is «not chosen»',()=>{
  expect(read('tab=all&f=likes')).toEqual({tab:'all',filter:'likes',item:null});
  expect(read(`tab=todo&item=${ID}`)).toEqual({tab:'todo',filter:'all',item:ID});
  expect(read('')).toEqual({tab:null,filter:'all',item:null});
  expect(read('tab=byme&f=nope&item=1')).toEqual({tab:null,filter:'all',item:null});
  expect(read('f=other').filter).toBe('other');
 });
 it('writes back only what is chosen and keeps keys it does not own',()=>{
  const p=inboxSearch(new URLSearchParams(`as=${ID}&f=likes&item=${ID}`),{tab:'all',filter:'all'});
  expect(p.toString()).toBe(`as=${ID}&tab=all`);
  expect(inboxSearch(new URLSearchParams(''),{tab:'todo',filter:'events',item:ID}).toString()).toBe(`tab=todo&f=events&item=${ID}`);
  // A round trip gives the same state.
  const s={tab:'all' as const,filter:'groups' as const,item:null};
  expect(readInboxUrl(inboxSearch(new URLSearchParams(),s))).toEqual(s);
 });
 it('keeps the scroll per tab and filter',()=>{
  expect(inboxScrollKey({tab:'all',filter:'likes'})).not.toBe(inboxScrollKey({tab:'all',filter:'all'}));
  expect(inboxScrollKey({tab:'todo',filter:'all'})).toBe('/n/inbox?tab=todo&f=all');
 });
});

describe('history pages',()=>{
 const row=(id:string,at:string,extra:Record<string,unknown>={})=>({id,at,read:false,collapse:null as string|null,...extra});
 it('a refetched first page never duplicates or reorders: each id once, newest first, ties by id',()=>{
  const a=row('a','2026-11-01T10:00:00Z'),b=row('b','2026-11-01T09:00:00Z'),c=row('c','2026-11-01T09:00:00Z'),d=row('d','2026-11-01T08:00:00Z');
  const merged=mergeRows([a,c,b,d],[row('e','2026-11-01T11:00:00Z'),{...a,read:true}]);
  expect(merged.map(x=>x.id)).toEqual(['e','a','c','b','d']);
  expect(merged.find(x=>x.id==='a')?.read).toBe(true);
 });
 it('rows side by side with one collapse key and one read state make one summary',()=>{
  const g=groupRows([row('1','x',{collapse:'like'}),row('2','x',{collapse:'like'}),row('3','x',{collapse:'like',read:true}),row('4','x'),row('5','x')]);
  expect(g.map(x=>x.map(r=>r.id))).toEqual([['1','2'],['3'],['4'],['5']]);
 });
});

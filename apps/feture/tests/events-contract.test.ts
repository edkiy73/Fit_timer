import {describe,it,expect} from 'vitest';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {eventDraft,eventCommand,publicEventDto}=require('../lib/feture/event-contract.js');
const id='11111111-1111-4111-8111-111111111111';
const op='22222222-2222-4222-8222-222222222222';
const draft={
 title:'Практический мастер-класс',summary:'Онлайн, запись не включена',
 description:'Программа встречи',conditions:'18+, уважение границ',
 format:'online',visibility:'public',startsAt:'2026-11-01T18:00:00+08:00',
 endsAt:'2026-11-01T20:00:00+08:00',timeZone:'Asia/Makassar',
 language:'ru',city:'',publicLocation:'',privateLocation:null,
 privateJoinUrl:'https://meet.google.com/abc-defg-hij',ticketUrl:'https://tickets.example.org/workshop',
 price:{amountMinor:250000,currency:'IDR'}
};
const save={action:'events.save',id,operationId:op,expectedRevision:0,draft};
const invalid=x=>expect(()=>eventDraft({...draft,...x})).toThrowError(/invalid_request/);
describe('E01 event boundary',()=>{
 it('accepts online/offline events, proper timezones and free admission',()=>{
  expect(eventCommand(save).action).toBe('events.save');
  expect(eventDraft({...draft,format:'offline',privateJoinUrl:null,city:'Denpasar',
   publicLocation:'Kerobokan',privateLocation:'Exact venue only after approval',price:null,ticketUrl:null}).format).toBe('offline');
 });
 it('does not trust actor, organizer, owner, role or undeclared nested fields',()=>{
  for(const f of ['accountHash','owner','organizerId','role','privateAttendees','publishedAt'])
   expect(()=>eventCommand({...save,[f]:'attacker'})).toThrowError(/invalid_request/);
  expect(()=>eventDraft({...draft,ownerHash:'another-account'})).toThrowError(/invalid_request/);
  expect(()=>eventDraft({...draft,price:{amountMinor:100,currency:'USD',seller:'other'}})).toThrowError(/invalid_request/);
 });
 it('rejects invalid dates and client-side timezone ambiguity',()=>{
  for(const v of ['2026-11-01T18:00:00','2026-02-30T18:00Z','2026-11-01T25:00Z','2026-11-01T18:00+14:30'])invalid({startsAt:v});
  invalid({endsAt:draft.startsAt});invalid({timeZone:'../../Server'});invalid({timeZone:'Invalid/Timezone'});
 });
 it('rejects potentially dangerous ticket and meeting links',()=>{
  for(const url of ['javascript:alert(1)','http://example.com','https://127.0.0.1/pay','https://localhost/pay',
   'https://user:pass@example.com/ticket','https://evil.example.org:444/pay','https://example.com/a\nb'])invalid({ticketUrl:url});
  invalid({privateJoinUrl:'file:///private'});
 });
 it('restricts private online/offline venue fields to the matching format',()=>{
  invalid({privateLocation:'Hidden address'});
  invalid({format:'offline',privateJoinUrl:'https://meet.google.com/x',city:'Denpasar'});
  invalid({format:'offline',privateJoinUrl:null,city:''});
  invalid({price:{amountMinor:0,currency:'USD'}});
 });
 it('rejects invalid command grammar and cursor/operation replays',()=>{
  const illegal=[
   {action:'events.read',id:'not-an-id'}, {action:'events.catalog',cursor:{at:'bad',id}},
   {action:'events.catalog',cursor:null,ownerHash:'other'},
   {action:'events.save',id,operationId:op,expectedRevision:-1,draft},
   {action:'events.submit',id,operationId:op,expectedRevision:0},
  ];for(const c of illegal)expect(()=>eventCommand(c)).toThrowError(/invalid_request/);
  expect(eventCommand({action:'events.mine',cursor:null}).action).toBe('events.mine');
 });
 it('public DTO always omits private venue, joining URL and external destination',()=>{
  const row={id,revision:2,state:'published',draft};
  const publicData=publicEventDto({...row,extraSecret:'user@secret.org'});
  expect(JSON.stringify(publicData)).not.toContain('meet.google.com');
  expect(JSON.stringify(publicData)).not.toContain('tickets.example.org');
  expect(publicData.hasExternalTickets).toBe(true);
  expect(Object.keys(publicData)).not.toContain('privateLocation');
  expect(()=>publicEventDto({...row,state:'pending'})).toThrowError(/domain_unavailable/);
  expect(()=>publicEventDto({...row,draft:{...draft,visibility:'private'}})).toThrowError(/domain_unavailable/);
 });
});

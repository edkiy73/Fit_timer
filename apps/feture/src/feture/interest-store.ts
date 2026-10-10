import { z } from 'zod';
import { interestMap, interestStateSchema } from './model';
import { dto } from './interest-api';

const mutation=z.discriminatedUnion('action',[
 z.object({action:z.literal('interests.set'),interestId:z.string(),operationId:z.string().uuid(),expectedRevision:z.number().int().min(0),state:interestStateSchema}).strict(),
 z.object({action:z.literal('interests.delete'),interestId:z.string(),operationId:z.string().uuid(),expectedRevision:z.number().int().min(0)}).strict()
]);
const cache=z.object({session:z.string(),entries:z.record(z.string(),dto),pending:z.array(mutation).max(512),
 conflicts:z.record(z.string(),z.enum(['revision_conflict','operation_conflict'])),
 lease:z.object({id:z.string(),until:z.number()}).nullable(),retryAt:z.number(),attempts:z.number().int().min(0)
});
const database=z.object({version:z.literal(1),guest:interestMap,owners:z.record(z.string(),cache),blocked:z.record(z.string(),z.boolean())});
export type InterestCache=z.infer<typeof cache>;
export type InterestDatabase=z.infer<typeof database>;
export const emptyCache=(session:string):InterestCache=>({session,entries:{},pending:[],conflicts:{},lease:null,retryAt:0,attempts:0});
export const emptyDatabase=():InterestDatabase=>({version:1,guest:{},owners:{},blocked:{}});
export interface InterestStore {change<T>(edit:(db:InterestDatabase)=>T):Promise<T>}

/** A single IndexedDB transaction serializes all tabs. No lossy KV fallback for the outbox. */
export function createInterestStore(name='feture/interests'):InterestStore {
 let opening:Promise<IDBDatabase>|null=null;
 const open=()=>opening??=new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open(name,1);
  request.onupgradeneeded=()=>request.result.createObjectStore('state');
  request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();opening=null;};resolve(request.result);};
  request.onerror=()=>{opening=null;reject(new Error('storage_error'));};
  request.onblocked=()=>{opening=null;reject(new Error('storage_error'));};
 });
 return {async change<T>(edit:(db:InterestDatabase)=>T):Promise<T>{
  const db=await open();
  return new Promise<T>((resolve,reject)=>{
   const tx=db.transaction('state','readwrite'),store=tx.objectStore('state'),read=store.get('data');let output:T;
   read.onsuccess=()=>{
    try{const value=read.result===undefined?emptyDatabase():database.parse(read.result);output=edit(value);store.put(value,'data');}
    catch{tx.abort();}
   };
   tx.oncomplete=()=>resolve(output);
   tx.onerror=tx.onabort=()=>reject(new Error('storage_error'));
  });
 }};
}

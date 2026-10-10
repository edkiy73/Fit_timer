import { z } from 'zod';
import { mergeRecordMaps, type RecordMap } from '@appbase/core/document-sync.js';

export const interestStatus = z.enum([
  'unknown','curious','fantasy','want_to_try','experienced','soft_limit','hard_limit','not_interested'
]);
export const visibility = z.enum(['private','public','granted']);
export const interestRecord = z.object({
  status:interestStatus, intensity:z.number().int().min(0).max(100).nullable(),
  visibility, at:z.string().datetime()
});
export const interestMap = z.record(z.string().regex(/^interest-\d+-\d+$/),interestRecord);
export type InterestRecord = z.infer<typeof interestRecord>;
export type InterestMap = z.infer<typeof interestMap>;
export type InterestStatus = z.infer<typeof interestStatus>;
export type Visibility = z.infer<typeof visibility>;

export const STATUSES: {id:InterestStatus,label:string,description:string}[] = [
 {id:'unknown',label:'Не исследовано',description:'Пока нет ответа'},
 {id:'curious',label:'Интересно',description:'Хочется больше узнать'},
 {id:'fantasy',label:'Фантазия',description:'Интерес в мыслях, не обязательно в жизни'},
 {id:'want_to_try',label:'Хочу попробовать',description:'Есть желание исследовать в комфортных условиях'},
 {id:'experienced',label:'Есть опыт',description:'Уже знакомо на практике'},
 {id:'soft_limit',label:'Зависит от условий',description:'Только при определённых условиях'},
 {id:'hard_limit',label:'Жёсткая граница',description:'Не хочу — без обсуждений и уговоров'},
 {id:'not_interested',label:'Не интересует',description:'Не моя тема'}
];

const SCORED: InterestStatus[] = ['curious','fantasy','want_to_try','experienced'];
export function hasIntensity(status:InterestStatus):boolean { return SCORED.includes(status); }
export function normalizeRecord(record:Omit<InterestRecord,'at'>,at=new Date().toISOString()):InterestRecord {
  return interestRecord.parse({
    ...record,
    intensity:hasIntensity(record.status)?Math.max(0,Math.min(100,Math.round(record.intensity??50))):null,
    at
  });
}
export function parseInterestMap(raw:string|null):InterestMap {
  if(!raw) return {};
  try { return interestMap.parse(JSON.parse(raw)); } catch { return {}; }
}
export function mergeInterestMaps(local:string|null,remote:string|null):string {
  return JSON.stringify(mergeRecordMaps<InterestRecord>(parseInterestMap(local),parseInterestMap(remote)));
}
export function categoryProgress(ids:string[],map:InterestMap){
  const known=ids.filter(id=>map[id]&&map[id].status!=='unknown').length;
  const interests=ids.filter(id=>hasIntensity(map[id]?.status||'unknown'));
  const boundaries=ids.filter(id=>map[id]?.status==='hard_limit').length;
  const conditional=ids.filter(id=>map[id]?.status==='soft_limit').length;
  return {known,total:ids.length,percent:ids.length?Math.round(100*known/ids.length):0,interests:interests.length,boundaries,conditional};
}
export type Catalog = z.infer<typeof catalogSchema>;
const catalogInterest=z.object({id:z.string(),title:z.string()});
const catalogCategory=z.object({
 id:z.string(),title:z.string(),short:z.string(),icon:z.string(),color:z.string(),interests:z.array(catalogInterest)
});
const catalogTest=z.object({
 id:z.string(),title:z.string(),description:z.string(),category:z.number().int(),questions:z.number().int()
});
export const catalogSchema=z.object({version:z.number(),categories:z.array(catalogCategory),tests:z.array(catalogTest)});

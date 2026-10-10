import { z } from 'zod';
import type { InterestState } from '../../lib/feture/contracts';
import editorial from '../../data/catalog-editorial.json';

export const stance=z.enum(['unknown','curious','fantasy','want_to_try','not_interested']);
export const experience=z.enum(['unspecified','none','tried','ongoing']);
export const boundary=z.enum(['none','conditional','hard']);
export const visibility=z.enum(['private','public','granted']);
export const interestStateSchema=z.object({
 stance,experience,boundary,boundaryNote:z.string().max(1000).nullable(),
 intensity:z.number().int().min(1).max(5).nullable(),visibility,useForDiscovery:z.boolean()
}).strict().refine(r=>r.intensity===null||hasIntensity(r.stance,r.boundary))
 .refine(r=>r.boundary==='conditional'||r.boundaryNote===null);
export const interestRecord=interestStateSchema.safeExtend({at:z.string().datetime({offset:true})});
export const interestMap=z.record(z.string().regex(/^interest-[1-9]\d{0,2}-[1-9]\d{0,2}$/),interestRecord);
export type InterestRecord=z.infer<typeof interestRecord>;
export type InterestMap=z.infer<typeof interestMap>;
export type InterestStance=z.infer<typeof stance>;
export type Experience=z.infer<typeof experience>;
export type Boundary=z.infer<typeof boundary>;
export type Visibility=z.infer<typeof visibility>;
export const STANCES:{id:InterestStance;label:string;description:string}[]=[
 {id:'unknown',label:'Не определилось',description:'Пока нет ответа'},
 {id:'curious',label:'Интересно',description:'Хочется больше узнать'},
 {id:'fantasy',label:'Фантазия',description:'Интерес в мыслях, не обязательно в жизни'},
 {id:'want_to_try',label:'Хочу попробовать',description:'Есть желание исследовать в комфортных условиях'},
 {id:'not_interested',label:'Не интересует',description:'Не моя тема'}
];
export const EXPERIENCES:{id:Experience;label:string}[]=[
 {id:'unspecified',label:'Не указано'},{id:'none',label:'Нет опыта'},
 {id:'tried',label:'Есть опыт'},{id:'ongoing',label:'Есть текущая практика'}
];
export const BOUNDARIES:{id:Boundary;label:string}[]=[
 {id:'none',label:'Не отмечена'},{id:'conditional',label:'Зависит от условий'},{id:'hard',label:'Жёсткая граница'}
];
export function hasIntensity(value:InterestStance,limit:Boundary='none'):boolean {
 return limit!=='hard'&&['curious','fantasy','want_to_try'].includes(value);
}
export function isExplored(record:InterestRecord|undefined):boolean {
 return !!record&&(record.stance!=='unknown'||record.experience!=='unspecified'||record.boundary!=='none');
}
export function interestSummary(record:InterestRecord|undefined):string {
 if(!record||!isExplored(record))return 'Не исследовано';
 return [record.stance!=='unknown'?STANCES.find(s=>s.id===record.stance)?.label:null,
 record.experience!=='unspecified'?EXPERIENCES.find(s=>s.id===record.experience)?.label:null,
 record.boundary!=='none'?BOUNDARIES.find(s=>s.id===record.boundary)?.label:null].filter(Boolean).join(' · ');
}
export function normalizeRecord(record:InterestState,at=new Date().toISOString()):InterestRecord {
 return interestRecord.parse({...record,intensity:hasIntensity(record.stance,record.boundary)?record.intensity:null,
 boundaryNote:record.boundary==='conditional'?record.boundaryNote:null,at});
}
export function parseInterestMap(raw:string|null):InterestMap {
 if(!raw)return {};
 try{return interestMap.parse(JSON.parse(raw));}catch{return {};}
}
export function categoryProgress(ids:string[],map:InterestMap){
 const known=ids.filter(id=>isExplored(map[id])).length;
 const interests=ids.filter(id=>map[id]&&hasIntensity(map[id]!.stance,map[id]!.boundary)).length;
 const boundaries=ids.filter(id=>map[id]?.boundary==='hard').length;
 const conditional=ids.filter(id=>map[id]?.boundary==='conditional').length;
 return {known,total:ids.length,percent:ids.length?Math.round(100*known/ids.length):0,interests,boundaries,conditional};
}
export type Catalog = z.infer<typeof catalogSchema>;
const definitions:Readonly<Record<string,{definition:string;synonyms:string[];relatedIds:string[]}>>=editorial.interests;
const catalogInterest=z.object({id:z.string(),title:z.string()}).transform(item=>({
 ...item,definition:definitions[item.id]?.definition??'',synonyms:definitions[item.id]?.synonyms??[],
 relatedIds:definitions[item.id]?.relatedIds??[],editorialVersion:editorial.version
}));
const catalogCategory=z.object({
 id:z.string(),title:z.string(),short:z.string(),icon:z.string(),color:z.string(),interests:z.array(catalogInterest)
}).transform(category=>({...category,interests:editorial.editorialStatus==='published'?category.interests.filter(i=>i.definition):[]}));
const catalogTest=z.object({
 id:z.string(),title:z.string(),description:z.string(),category:z.number().int(),questions:z.number().int()
});
export const catalogSchema=z.object({version:z.number(),categories:z.array(catalogCategory),tests:z.array(catalogTest)});

const searchKey=(text:string)=>text.normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е').trim();
export function matchesInterest(item:Catalog['categories'][number]['interests'][number],query:string):boolean {
 return searchKey([item.title,item.definition,...item.synonyms].join(' ')).includes(searchKey(query));
}
export function matchesCategory(category:Catalog['categories'][number],query:string):boolean {
 return matchesCategoryName(category,query)||category.interests.some(i=>matchesInterest(i,query));
}
export function matchesCategoryName(category:Catalog['categories'][number],query:string):boolean {
 return searchKey(`${category.title} ${category.short}`).includes(searchKey(query));
}

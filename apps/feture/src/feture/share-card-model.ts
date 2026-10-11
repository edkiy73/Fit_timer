import {STANCES,type Catalog,type InterestMap} from './model';

export type ShareRow={title:string;stance:string};

/** Explicitly whitelisted content. Never export raw map records, notes, experience,
 * boundaries, visibility flags, account identifiers or questionnaire results. */
export function shareCardRows(ids:readonly string[],categories:Catalog['categories'],map:InterestMap):ShareRow[]{
 if(ids.length<1||ids.length>6||new Set(ids).size!==ids.length)throw Error('invalid_selection');
 const titles=new Map(categories.flatMap(c=>c.interests.map(i=>[i.id,i.title] as const)));
 return ids.map(id=>{
  const title=titles.get(id),record=map[id];
  if(!title||!record||record.stance==='unknown'||record.boundary!=='none')throw Error('invalid_selection');
  const stance=STANCES.find(item=>item.id===record.stance)?.label;
  if(!stance)throw Error('invalid_selection');
  return {title,stance};
 });
}

import type { WordProgressRecord, WordsProgressDocument } from '../progress';

export const WORD_INTERVALS=[0,2,6,16,35] as const;
export const WORD_SESSION_CAP=20;

export function addWordToReview(
  doc:WordsProgressDocument,
  lexemeId:string,
  senseId:string,
  todayDay:number,
  at:string
):WordsProgressDocument{
  const key=lexemeId+'|'+senseId;
  const current=doc.items[key];
  if(current&&!current.deleted)return doc;
  const record:WordProgressRecord={
    lexemeId,
    senseId,
    box:0,
    due:todayDay+1,
    at,
  };
  return {schemaVersion:1,items:{...doc.items,[key]:record}};
}

export function removeWordFromReview(
  doc:WordsProgressDocument,
  lexemeId:string,
  senseId:string,
  at:string
):WordsProgressDocument{
  const key=lexemeId+'|'+senseId;
  const current=doc.items[key];
  if(!current)return doc;
  return {
    schemaVersion:1,
    items:{
      ...doc.items,
      [key]:{...current,deleted:true,at},
    },
  };
}

export function gradeWordReview(
  doc:WordsProgressDocument,
  lexemeId:string,
  senseId:string,
  correct:boolean,
  todayDay:number,
  at:string
):WordsProgressDocument{
  const key=lexemeId+'|'+senseId;
  const current=doc.items[key];
  if(!current||current.deleted)return doc;
  const box=correct?Math.min(4,(current.box||0)+1):0;
  return {
    schemaVersion:1,
    items:{
      ...doc.items,
      [key]:{
        ...current,
        box,
        due:todayDay+(WORD_INTERVALS[box]??0),
        at,
      },
    },
  };
}

export function dueWords(
  doc:WordsProgressDocument,
  todayDay:number
):WordProgressRecord[]{
  return Object.values(doc.items)
    .filter((item):item is WordProgressRecord=>Boolean(item&&!item.deleted&&item.due<=todayDay))
    .sort((a,b)=>a.due-b.due||a.lexemeId.localeCompare(b.lexemeId)||a.senseId.localeCompare(b.senseId));
}

export function wordReviewSession(
  doc:WordsProgressDocument,
  todayDay:number
):{items:WordProgressRecord[];totalDue:number;waiting:number}{
  const all=dueWords(doc,todayDay);
  return {
    items:all.slice(0,WORD_SESSION_CAP),
    totalDue:all.length,
    waiting:Math.max(0,all.length-WORD_SESSION_CAP),
  };
}

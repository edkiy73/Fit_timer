export const REVIEW_DAILY_TARGET=20;
export const REVIEW_EXTRA_STEP=10;

export interface ReviewDayQuota {
  day:number;
  limit:number;
  completed:number;
}

const key=(day:number)=>'unmute.review-quota:'+day;

function normalize(day:number,value:Partial<ReviewDayQuota>|null|undefined):ReviewDayQuota{
  return {
    day,
    limit:Math.max(REVIEW_DAILY_TARGET,Math.floor(Number(value?.limit)||REVIEW_DAILY_TARGET)),
    completed:Math.max(0,Math.floor(Number(value?.completed)||0))
  };
}

export function readReviewDayQuota(day:number,storage:Storage=localStorage):ReviewDayQuota{
  try{
    const raw=storage.getItem(key(day));
    return normalize(day,raw?JSON.parse(raw):null);
  }catch{
    return normalize(day,null);
  }
}

function writeReviewDayQuota(state:ReviewDayQuota,storage:Storage=localStorage):ReviewDayQuota{
  const next=normalize(state.day,state);
  try{storage.setItem(key(state.day),JSON.stringify(next));}catch{}
  return next;
}

export function remainingReviewQuota(day:number,storage:Storage=localStorage):number{
  const state=readReviewDayQuota(day,storage);
  return Math.max(0,state.limit-state.completed);
}

export function completeReviewQuotaItem(
  day:number,
  count=1,
  storage:Storage=localStorage
):ReviewDayQuota{
  const state=readReviewDayQuota(day,storage);
  return writeReviewDayQuota({
    ...state,
    completed:state.completed+Math.max(0,Math.floor(count))
  },storage);
}

export function extendReviewQuota(
  day:number,
  storage:Storage=localStorage
):ReviewDayQuota{
  const state=readReviewDayQuota(day,storage);
  return writeReviewDayQuota({...state,limit:state.limit+REVIEW_EXTRA_STEP},storage);
}

/** Fairly mix sources so one active course cannot consume the entire global daily norm. */
export function takeGlobalReviewQuota<T>(
  sources:ReadonlyArray<readonly T[]>,
  limit:number
):{items:T[];overflow:number}{
  const queues=sources.map(source=>[...source]);
  const items:T[]=[];
  while(items.length<limit&&queues.some(queue=>queue.length>0)){
    for(const queue of queues){
      if(items.length>=limit)break;
      const item=queue.shift();
      if(item!==undefined)items.push(item);
    }
  }
  const overflow=queues.reduce((sum,queue)=>sum+queue.length,0);
  return {items,overflow};
}

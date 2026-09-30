import type { StatsBucket, StatsProgressDocument } from '../progress';

export interface AnswerStatsSummary{
  attempts:number;
  correct:number;
  wrong:number;
  accuracy:number;
}

export interface WeakActivity{
  activityId:string;
  attempts:number;
  wrong:number;
  errorRate:number;
}

export function recordAnswer(
  doc:StatsProgressDocument,
  deviceId:string,
  activityId:string,
  correct:boolean,
  at:string
):StatsProgressDocument{
  const key=deviceId+'|'+activityId;
  // A reset leaves a deleted bucket: counting starts again from zero.
  const stored=doc.buckets[key];
  const current=stored&&!stored.deleted?stored:undefined;
  const attempts=(current?.attempts||0)+1;
  const correctCount=(current?.correct||0)+(correct?1:0);
  const wrong=(current?.wrong||0)+(correct?0:1);
  const next:StatsBucket={
    deviceId,
    activityId,
    attempts,
    correct:correctCount,
    wrong,
    at,
  };
  return {
    schemaVersion:1,
    buckets:{...doc.buckets,[key]:next},
  };
}

export function summarizeAnswerStats(doc:StatsProgressDocument):AnswerStatsSummary{
  let attempts=0,correct=0,wrong=0;
  for(const bucket of Object.values(doc.buckets)){
    if(!bucket||bucket.deleted)continue;
    attempts+=Math.max(0,bucket.attempts||0);
    correct+=Math.max(0,bucket.correct||0);
    wrong+=Math.max(0,bucket.wrong||0);
  }
  return {
    attempts,
    correct,
    wrong,
    accuracy:attempts?Math.round(correct/attempts*100):0,
  };
}

export function weakActivities(
  doc:StatsProgressDocument,
  limit=8
):WeakActivity[]{
  const byActivity=new Map<string,{attempts:number;wrong:number}>();
  for(const bucket of Object.values(doc.buckets)){
    if(!bucket||bucket.deleted)continue;
    const current=byActivity.get(bucket.activityId)||{attempts:0,wrong:0};
    current.attempts+=Math.max(0,bucket.attempts||0);
    current.wrong+=Math.max(0,bucket.wrong||0);
    byActivity.set(bucket.activityId,current);
  }

  return [...byActivity.entries()]
    .map(([activityId,value])=>({
      activityId,
      attempts:value.attempts,
      wrong:value.wrong,
      errorRate:value.attempts?value.wrong/value.attempts:0,
    }))
    .filter(item=>item.attempts>=2&&item.errorRate>=0.34)
    .sort((a,b)=>b.errorRate-a.errorRate||b.wrong-a.wrong||a.activityId.localeCompare(b.activityId))
    .slice(0,Math.max(0,limit));
}

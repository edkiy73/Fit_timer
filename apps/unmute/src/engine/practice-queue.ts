import type { PracticeSrsKind, PracticeSrsState } from './practice-srs';

export const PRACTICE_DAILY_CAPS:Record<PracticeSrsKind,number>={
  pattern:3,
  vocab:2,
  listening:2,
};

export interface PracticeQueueItem{
  id:string;
  state:PracticeSrsState;
}

export interface PracticeQueueSlice{
  kind:PracticeSrsKind;
  cap:number;
  due:PracticeQueueItem[];
  totalDue:number;
  waiting:number;
}

export interface PracticeReviewQueue{
  pattern:PracticeQueueSlice;
  vocab:PracticeQueueSlice;
  listening:PracticeQueueSlice;
  dueCount:number;
  waitingCount:number;
}

function stableDueItems(
  candidateIds:string[],
  states:Record<string,PracticeSrsState|undefined>,
  todayDay:number
):PracticeQueueItem[]{
  const sourceOrder=new Map(candidateIds.map((id,index)=>[id,index]));
  return candidateIds
    .map(id=>({id,state:states[id]}))
    .filter((item):item is PracticeQueueItem=>Boolean(item.state&&item.state.due<=todayDay))
    .sort((a,b)=>{
      const byDue=a.state.due-b.state.due;
      if(byDue!==0)return byDue;
      return (sourceOrder.get(a.id)??0)-(sourceOrder.get(b.id)??0);
    });
}

export function selectPracticeQueue(
  kind:PracticeSrsKind,
  candidateIds:string[],
  states:Record<string,PracticeSrsState|undefined>,
  todayDay:number
):PracticeQueueSlice{
  const cap=PRACTICE_DAILY_CAPS[kind];
  const allDue=stableDueItems(candidateIds,states,todayDay);
  return {
    kind,
    cap,
    due:allDue.slice(0,cap),
    totalDue:allDue.length,
    waiting:Math.max(0,allDue.length-cap),
  };
}

export function buildPracticeReviewQueue(
  candidateIds:string[],
  progress:{
    pattern:Record<string,PracticeSrsState|undefined>;
    vocab:Record<string,PracticeSrsState|undefined>;
    listening:Record<string,PracticeSrsState|undefined>;
  },
  todayDay:number
):PracticeReviewQueue{
  const pattern=selectPracticeQueue('pattern',candidateIds,progress.pattern,todayDay);
  const vocab=selectPracticeQueue('vocab',candidateIds,progress.vocab,todayDay);
  const listening=selectPracticeQueue('listening',candidateIds,progress.listening,todayDay);

  return {
    pattern,
    vocab,
    listening,
    dueCount:pattern.due.length+vocab.due.length+listening.due.length,
    waitingCount:pattern.waiting+vocab.waiting+listening.waiting,
  };
}

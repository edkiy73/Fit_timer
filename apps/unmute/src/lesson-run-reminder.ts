export interface LessonRunReminderSnapshot {
  version:1;
  setId:string;
  nodeId:string;
  order:number[];
  pos:number;
  result:boolean|null;
  pausedAt?:string;
}

const PREFIX='unmute.lesson-run:';
export const LESSON_RUN_CHANGED_EVENT='unmute:lesson-run-changed';

function safeStorage(storage:Storage=localStorage):Storage{return storage;}

export function notifyLessonRunChanged():void{
  try{window.dispatchEvent(new Event(LESSON_RUN_CHANGED_EVENT));}catch{}
}

export function markLessonRunPaused(
  setId:string,
  nodeId:string,
  pausedAt=new Date().toISOString(),
  storage:Storage=safeStorage()
):boolean{
  const key=PREFIX+setId+':'+nodeId;
  try{
    const raw=storage.getItem(key);
    if(!raw)return false;
    const parsed=JSON.parse(raw) as LessonRunReminderSnapshot;
    if(parsed?.version!==1||parsed.setId!==setId||parsed.nodeId!==nodeId)return false;
    storage.setItem(key,JSON.stringify({...parsed,pausedAt}));
    notifyLessonRunChanged();
    return true;
  }catch{return false;}
}

export function clearPausedLessonRun(
  setId:string,
  nodeId:string,
  storage:Storage=safeStorage()
):void{
  const key=PREFIX+setId+':'+nodeId;
  try{
    const raw=storage.getItem(key);
    if(!raw)return;
    const parsed=JSON.parse(raw) as LessonRunReminderSnapshot;
    if(!parsed?.pausedAt)return;
    const next={...parsed};
    delete next.pausedAt;
    storage.setItem(key,JSON.stringify(next));
    notifyLessonRunChanged();
  }catch{}
}

export interface UnfinishedLessonReminder {
  setId:string;
  nodeId:string;
  pausedAt:Date;
  remaining:number;
}

export function latestPausedLessonRun(
  storage:Storage=safeStorage()
):UnfinishedLessonReminder|null{
  let best:UnfinishedLessonReminder|null=null;
  try{
    for(let index=0;index<storage.length;index++){
      const key=storage.key(index);
      if(!key?.startsWith(PREFIX))continue;
      const raw=storage.getItem(key);
      if(!raw)continue;
      const parsed=JSON.parse(raw) as LessonRunReminderSnapshot;
      if(parsed?.version!==1||!parsed.setId||!parsed.nodeId||!parsed.pausedAt)continue;
      const pausedAt=new Date(parsed.pausedAt);
      if(!Number.isFinite(pausedAt.getTime()))continue;
      const remaining=Math.max(
        1,
        (Array.isArray(parsed.order)?parsed.order.length:0)
          - Math.max(0,Number(parsed.pos)||0)
          - (parsed.result!==null?1:0)
      );
      const candidate={setId:parsed.setId,nodeId:parsed.nodeId,pausedAt,remaining};
      if(!best||candidate.pausedAt.getTime()>best.pausedAt.getTime())best=candidate;
    }
  }catch{}
  return best;
}

export function unfinishedReminderTime(pausedAt:Date):Date|null{
  const at=new Date(pausedAt.getTime()+3*60*60*1000);
  const cutoff=new Date(
    pausedAt.getFullYear(),
    pausedAt.getMonth(),
    pausedAt.getDate(),
    21,0,0,0
  );
  return at.getTime()<=cutoff.getTime()?at:null;
}

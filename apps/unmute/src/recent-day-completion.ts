export interface RecentDayCompletion {
  version:1;
  setId:string;
  nodeId:string;
  dayNumber:number;
}

const key=(setId:string)=>'unmute.recent-day-completion:'+setId;

export function rememberRecentDayCompletion(setId:string,nodeId:string,dayNumber:number):void{
  if(typeof localStorage==='undefined')return;
  try{
    localStorage.setItem(key(setId),JSON.stringify({
      version:1,
      setId,
      nodeId,
      dayNumber
    } satisfies RecentDayCompletion));
  }catch{}
}

export function readRecentDayCompletion(setId:string,todayDay:number):RecentDayCompletion|null{
  if(typeof localStorage==='undefined')return null;
  try{
    const raw=localStorage.getItem(key(setId));
    if(!raw)return null;
    const value=JSON.parse(raw) as RecentDayCompletion;
    if(value?.version!==1||value.setId!==setId||typeof value.nodeId!=='string'||typeof value.dayNumber!=='number')return null;
    if(value.dayNumber!==todayDay){
      localStorage.removeItem(key(setId));
      return null;
    }
    return value;
  }catch{return null;}
}

export function clearRecentDayCompletion(setId:string):void{
  if(typeof localStorage==='undefined')return;
  try{localStorage.removeItem(key(setId));}catch{}
}


export function clearRecentDayCompletionForStartedNode(
  setId:string,
  startedNodeId:string,
  todayDay:number
):void{
  const recent=readRecentDayCompletion(setId,todayDay);
  if(recent&&recent.nodeId!==startedNodeId)clearRecentDayCompletion(setId);
}

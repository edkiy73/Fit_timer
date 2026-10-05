export function readPracticeRunState<T>(key:string|undefined):T|null{
  if(!key||typeof localStorage==='undefined')return null;
  try{
    const raw=localStorage.getItem(key);
    return raw?JSON.parse(raw) as T:null;
  }catch{return null;}
}

export function writePracticeRunState(key:string|undefined,value:unknown):void{
  if(!key||typeof localStorage==='undefined')return;
  try{ localStorage.setItem(key,JSON.stringify(value)); }catch{}
}

export function practiceRunStateKey(base:string|undefined,part:string):string|undefined{
  return base?base+':'+part:undefined;
}

export function clearPracticeRunStatePrefix(prefix:string):void{
  if(typeof localStorage==='undefined')return;
  try{
    for(let index=localStorage.length-1;index>=0;index--){
      const key=localStorage.key(index);
      if(key?.startsWith(prefix))localStorage.removeItem(key);
    }
  }catch{}
}

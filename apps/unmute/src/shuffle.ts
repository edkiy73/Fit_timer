export function randomSeed():string{
  return Math.random().toString(36).slice(2)+Date.now().toString(36);
}

export function shuffledIndices(length:number,seed:string):number[]{
  const values=Array.from({length},(_,index)=>index);
  let state=2166136261;
  for(let i=0;i<seed.length;i++){
    state^=seed.charCodeAt(i);
    state=Math.imul(state,16777619);
  }
  const next=()=>{
    state+=0x6D2B79F5;
    let t=state;
    t=Math.imul(t^(t>>>15),t|1);
    t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
  for(let i=values.length-1;i>0;i--){
    const j=Math.floor(next()*(i+1));
    [values[i],values[j]]=[values[j]!,values[i]!];
  }
  return values;
}

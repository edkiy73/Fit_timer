import {useCallback,useEffect,useRef,useState} from 'react';

/** One staff list that pages by the server's cursor: the first page on mount (and on `reload`), «Ещё» appends the next
 * one without repeats. Same shape as the review queues use (`items`, `next`), for lists that are not queues. */
export function useStaffPage<T>(fetchPage:(after?:string)=>Promise<{items:T[],next?:string|null|undefined}>,key:(x:T)=>string){
 const [items,setItems]=useState<T[]|null>(null);const [next,setNext]=useState<string|null>(null);
 const [error,setError]=useState<unknown>(null);const [busy,setBusy]=useState(false);const [moreError,setMoreError]=useState<unknown>(null);
 const seq=useRef(0);
 const reload=useCallback(()=>{
  const n=++seq.current;setItems(null);setNext(null);setError(null);setMoreError(null);
  fetchPage().then(r=>{if(n!==seq.current)return;setItems(r.items);setNext(r.next??null);}).catch(e=>{if(n===seq.current)setError(e);});
 },[fetchPage]);
 useEffect(()=>{reload();},[reload]);
 const more=()=>{
  if(!next||busy)return;const n=seq.current;setBusy(true);setMoreError(null);
  fetchPage(next).then(r=>{if(n!==seq.current)return;setItems(l=>{const have=new Set((l??[]).map(key));return [...(l??[]),...r.items.filter(x=>!have.has(key(x)))];});setNext(r.next??null);})
   .catch(e=>{if(n===seq.current)setMoreError(e);}).finally(()=>setBusy(false));
 };
 return {items,setItems,error,reload,moreProps:{more:!!next,busy,error:moreError,onMore:more}};
}

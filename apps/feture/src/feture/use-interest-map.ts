import { useCallback, useEffect, useRef, useState } from 'react';
import { appDocs } from '../sync';
import { parseInterestMap, normalizeRecord, type InterestMap, type InterestRecord } from './model';

export const INTEREST_DOC = 'interest-map';
export function useInterestMap(){
  const [map,setMap]=useState<InterestMap>({});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const [saving,setSaving]=useState(false);
  const state=useRef<InterestMap>({});
  const alive=useRef(true);
  const queue=useRef(Promise.resolve());
  useEffect(()=>{
    alive.current=true;
    const reload=async()=>{
      try{
        const parsed=parseInterestMap(await appDocs.read(INTEREST_DOC));
        if(!alive.current)return;
        state.current=parsed;
        setMap(parsed);
        setError(false);
      }catch{if(alive.current)setError(true);}
      finally{if(alive.current)setLoading(false);}
    };
    void reload();
    const stop=appDocs.subscribe(change=>{
      if(change.source==='remote' && change.keys.some(k=>k.key===INTEREST_DOC))void reload();
    });
    return ()=>{alive.current=false;stop();};
  },[]);
  const save=useCallback((id:string,input:Omit<InterestRecord,'at'>)=>{
    const next={...state.current,[id]:normalizeRecord(input)};
    state.current=next;
    setMap(next);
    setSaving(true);
    queue.current=queue.current.then(async()=>{
      await appDocs.write(INTEREST_DOC,JSON.stringify(next));
      if(alive.current){setError(false);setSaving(false);}
    }).catch(()=>{
      if(alive.current){setError(true);setSaving(false);}
    });
  },[]);
  return {map,loading,error,saving,save};
}

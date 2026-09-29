import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOptionalAuth } from '@appbase/ui-react/auth.js';
import { loadSet } from './content/client';
import { buildLearnerCourseState, type LearnerCourseState } from './course-loader';
import { courseProgressDoc } from './progress';
import { appDocs, readCourseProgress } from './sync';
import { authEntitlementFingerprint } from './entitlements';

const SET_KEY='learner-course-set';
const PROGRESS_KEY='learner-course-progress';

export type LearnerCourseRuntimeStatus='pending'|'ready'|'error';

export interface LearnerCourseRuntimeValue {
  state:LearnerCourseState|null;
  status:LearnerCourseRuntimeStatus;
  error:unknown;
  refresh:()=>Promise<void>;
}

const LearnerCourseContext=createContext<LearnerCourseRuntimeValue|null>(null);

const normalizeSetId=(value:string)=>String(value||'').trim().toLowerCase();

export const learnerCourseSetQueryKey=(setId:string,accessKey='anonymous')=>
  [SET_KEY,normalizeSetId(setId),accessKey] as const;

export const learnerCourseProgressQueryKey=(setId:string)=>
  [PROGRESS_KEY,normalizeSetId(setId)] as const;

export function LearnerCourseProvider({
  setId,
  children
}:{
  setId:string;
  children:ReactNode;
}){
  const queryClient=useQueryClient();
  const auth=useOptionalAuth();
  const requestedSetId=normalizeSetId(setId);
  const accessKey=authEntitlementFingerprint(auth.session);

  const setQuery=useQuery({
    queryKey:learnerCourseSetQueryKey(requestedSetId,accessKey),
    queryFn:()=>loadSet(requestedSetId),
    enabled:requestedSetId.length>0,
    staleTime:5*60_000
  });

  const canonicalSetId=setQuery.data?.set.id ?? '';
  const progressQuery=useQuery({
    queryKey:learnerCourseProgressQueryKey(canonicalSetId),
    queryFn:()=>readCourseProgress(canonicalSetId),
    enabled:canonicalSetId.length>0,
    staleTime:Infinity
  });

  useEffect(()=>{
    if(!canonicalSetId)return;
    const progressKey=courseProgressDoc(canonicalSetId);
    return appDocs.subscribe(change=>{
      if(!change.keys.some(ref=>ref.key===progressKey))return;
      void queryClient.invalidateQueries({
        queryKey:learnerCourseProgressQueryKey(canonicalSetId),
        exact:true
      });
    });
  },[canonicalSetId,queryClient]);

  const state=useMemo(()=>{
    if(!setQuery.data||!progressQuery.data)return null;
    return buildLearnerCourseState(setQuery.data,progressQuery.data);
  },[setQuery.data,progressQuery.data]);

  const refresh=useCallback(async()=>{
    const jobs:Promise<unknown>[]=[
      queryClient.invalidateQueries({
        queryKey:learnerCourseSetQueryKey(requestedSetId,accessKey),
        exact:true
      })
    ];
    if(canonicalSetId){
      jobs.push(queryClient.invalidateQueries({
        queryKey:learnerCourseProgressQueryKey(canonicalSetId),
        exact:true
      }));
    }
    await Promise.all(jobs);
  },[accessKey,canonicalSetId,queryClient,requestedSetId]);

  const error=setQuery.error ?? progressQuery.error ?? null;
  const status:LearnerCourseRuntimeStatus=error
    ? 'error'
    : state
      ? 'ready'
      : 'pending';

  const value=useMemo<LearnerCourseRuntimeValue>(()=>({
    state,
    status,
    error,
    refresh
  }),[error,refresh,state,status]);

  return <LearnerCourseContext.Provider value={value}>{children}</LearnerCourseContext.Provider>;
}

export function useLearnerCourseRuntime():LearnerCourseRuntimeValue{
  const value=useContext(LearnerCourseContext);
  if(!value)throw new Error('learner_course_provider_missing');
  return value;
}

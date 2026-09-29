import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { WORD_PROGRESS_DOC, type WordsProgressDocument } from './progress';
import { appDocs, readWordsProgress } from './sync';
import { useLexiconRuntime } from './lexicon-ui';
import type { LexiconSnapshot } from './lexicon/schema';

const WORDS_KEY='word-review-progress';

export interface WordReviewRuntimeValue {
  words:WordsProgressDocument|null;
  lexicon:LexiconSnapshot|null;
  status:'pending'|'ready'|'error';
  error:unknown;
  fromCache:boolean;
  refresh:()=>Promise<void>;
}

export function useWordReviewRuntime():WordReviewRuntimeValue{
  const queryClient=useQueryClient();
  const lexicon=useLexiconRuntime();
  const wordsQuery=useQuery({
    queryKey:[WORDS_KEY],
    queryFn:readWordsProgress,
    staleTime:Infinity,
  });

  useEffect(()=>{
    return appDocs.subscribe(change=>{
      if(!change.keys.some(ref=>ref.key===WORD_PROGRESS_DOC))return;
      void queryClient.invalidateQueries({queryKey:[WORDS_KEY],exact:true});
    });
  },[queryClient]);

  const refresh=useCallback(async()=>{
    await Promise.all([
      queryClient.invalidateQueries({queryKey:[WORDS_KEY],exact:true}),
      lexicon.refresh(),
    ]);
  },[queryClient,lexicon.refresh]);

  const error=wordsQuery.error ?? lexicon.error ?? null;
  const status:WordReviewRuntimeValue['status']=error
    ? 'error'
    : wordsQuery.data&&lexicon.status==='ready'&&lexicon.lexicon
      ? 'ready'
      : 'pending';

  return {
    words:wordsQuery.data??null,
    lexicon:lexicon.lexicon,
    status,
    error,
    fromCache:lexicon.fromCache,
    refresh,
  };
}
